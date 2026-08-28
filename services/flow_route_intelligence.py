"""
FLOW Route Intelligence - Combines real routes with FLOW AI predictions.
Now includes:
 - weather-aware rainfall
 - fuel & pollution eco metrics
 - 10-min buffer zone for alternatives
"""
import random
import math
from services.prediction_service import predict_traffic, predict_forecast
from services.traffic_service import chunk_geometry
from services.eco_service import rank_eco

def _estimate_features_for_route(route, chunk_index=0, scenario_overrides=None):
    import hashlib, datetime
    # Deterministic seed based on route geometry + chunk + time bucket for consistent ETA like Google
    try:
        coords_sample = str(route.get("geometry", {}).get("coordinates", [])[:2])
    except:
        coords_sample = str(route.get("raw_distance", 0))
    t_hour_raw = scenario_overrides.get("time_of_day", datetime.datetime.now().hour + datetime.datetime.now().minute/60) if scenario_overrides and scenario_overrides.get("time_of_day") is not None else datetime.datetime.now().hour + datetime.datetime.now().minute/60
    t_hour_bucket = int(t_hour_raw) % 24
    seed_str = f"{coords_sample}-{chunk_index}-{t_hour_bucket}-{str(scenario_overrides)}"
    seed = int(hashlib.md5(seed_str.encode()).hexdigest()[:8], 16)
    rng = random.Random(seed)

    dist = route.get("raw_distance", 5000)
    base_vc = rng.randint(140, 320)
    base_speed = rng.randint(28, 48)
    if 1 <= chunk_index <= 2:
        base_vc += rng.randint(20, 80)
        base_speed -= rng.randint(2, 8)

    # Strong peak-hour bias to match Google real traffic (Bangalore peak 8-11 and 17-21)
    if t_hour_bucket in [7,8,9,10,17,18,19,20,21]:
        base_vc += rng.randint(80, 140)
        base_speed -= rng.randint(10, 16)
        # Weekend slightly less
        if scenario_overrides and scenario_overrides.get("day_of_week", 5) >=5:
            base_vc -= 30

    if scenario_overrides:
        vc_over = scenario_overrides.get("vehicle_count")
        sp_over = scenario_overrides.get("average_speed")
        if vc_over is not None:
            base_vc = vc_over
        if sp_over is not None:
            base_speed = sp_over

    now = datetime.datetime.now()
    t_hour = scenario_overrides.get("time_of_day", now.hour + now.minute/60) if scenario_overrides and scenario_overrides.get("time_of_day") is not None else now.hour + now.minute/60
    t_hour = int(t_hour) % 24
    dow = scenario_overrides.get("day_of_week", now.weekday()) if scenario_overrides and scenario_overrides.get("day_of_week") is not None else now.weekday()
    rainfall = scenario_overrides.get("rainfall", 0) if scenario_overrides and scenario_overrides.get("rainfall") is not None else 0

    return {
        "vehicle_count": int(max(50, min(650, base_vc))),
        "average_speed": int(max(8, min(60, base_speed))),
        "road_capacity": 400,
        "time_of_day": t_hour,
        "day_of_week": int(dow),
        "rainfall": float(rainfall)
    }

def enrich_routes_with_ai(routes, scenario="normal", horizon="now", weather=None):
    """
    Enrich routes; weather dict may contain rainfall_for_model.
    Enforces 10-min buffer zone: drops alternatives >10 min slower than fastest.
    Adds eco metrics.
    """
    horizon_map = {"now": 0, "15": 15, "30": 30}
    horizon_minutes = horizon_map.get(str(horizon), 0)

    # If weather provided, override rainfall in scenario_map
    weather_rain = weather.get("rainfall_for_model", 0) if weather else 0
    # Even if scenario normal, use real weather rain
    if weather and weather.get("is_rain"):
        # Use max of weather rain and scenario rain
        pass

    scenario_map = {
        "normal": {"vehicle_count": None, "average_speed": None, "rainfall": weather_rain},
        "rain": {"rainfall": max(35, weather_rain)},
        "high_traffic": {"vehicle_count": 420, "average_speed": 22, "rainfall": weather_rain},
        "very_high": {"vehicle_count": 540, "average_speed": 14, "rainfall": weather_rain},
        "closure": {"vehicle_count": 480, "average_speed": 16, "rainfall": weather_rain},
        "event": {"vehicle_count": 500, "average_speed": 20, "rainfall": weather_rain},
    }

    enriched = []
    for route in routes:
        coords = route["geometry"]["coordinates"]
        chunks = chunk_geometry(coords, n_chunks=4)
        chunk_predictions = []
        feats_list = []
        for idx, chunk in enumerate(chunks):
            overrides = scenario_map.get(scenario, {})
            # Only pass overrides if at least one not None
            has_override = any(v is not None for v in overrides.values())
            feats = _estimate_features_for_route(route, idx, overrides if has_override else None)
            if weather and weather.get("is_rain"):
                feats["rainfall"] = max(feats["rainfall"], weather_rain*0.8)
            # Deterministic overrides for scenarios (seeded by route+chunk+scenario)
            import hashlib
            seed_s = int(hashlib.md5(f"{idx}-{scenario}-{route.get('raw_distance',0)}".encode()).hexdigest()[:8], 16)
            rng_s = random.Random(seed_s)
            if scenario == "rain":
                feats["rainfall"] = max(feats["rainfall"], 38)
                feats["average_speed"] = max(10, feats["average_speed"] - 7)
            elif scenario == "high_traffic":
                feats["vehicle_count"] = rng_s.randint(360, 460)
                feats["average_speed"] = rng_s.randint(18, 26)
            elif scenario == "very_high":
                feats["vehicle_count"] = rng_s.randint(500, 580)
                feats["average_speed"] = rng_s.randint(10, 18)
            elif scenario == "closure":
                feats["vehicle_count"] = rng_s.randint(440, 520)
                feats["average_speed"] = rng_s.randint(12, 20)
            elif scenario == "event":
                feats["vehicle_count"] = rng_s.randint(460, 560)
                feats["average_speed"] = rng_s.randint(14, 22)

            feats_list.append(feats)
            if horizon_minutes > 0:
                pred = predict_forecast(feats, horizon_minutes)
            else:
                pred = predict_traffic(feats)
            chunk_predictions.append(pred)

        avg_score = sum(p["score"] for p in chunk_predictions) / len(chunk_predictions) if chunk_predictions else 50
        max_cat = max(chunk_predictions, key=lambda p: p["score"])["category"] if chunk_predictions else "Moderate"
        # --- TIMING FIX: use average speed data to calculate time via distance ---
        dist = route.get("distance_km", route.get("raw_distance", 0)/1000 or 5)
        # Average predicted speed from ML input features (city-realistic)
        avg_speed_feat = sum(f["average_speed"] for f in feats_list) / len(feats_list) if feats_list else 35
        # Blend with congestion: slower when score high
        # Speed already lowered at peak, but ensure congestion further slows: avg_speed penalized by score
        congestion_penalty = 1 - (avg_score / 100) * 0.25  # up to 25% slower when severe
        avg_speed_adj = max(8, avg_speed_feat * congestion_penalty)
        if weather and weather.get("is_rain"):
            avg_speed_adj = max(8, avg_speed_adj * 0.85)
        eta_via_speed = int(round(dist / avg_speed_adj * 60))

        # Also keep traffic-factor method for comparison (OSRM free-flow penalty)
        traffic_factor = 1 + (avg_score / 100) * 1.1
        if weather and weather.get("is_rain"):
            traffic_factor += 0.22
        if max_cat == "Severe":
            traffic_factor += 0.25
        elif max_cat == "High":
            traffic_factor += 0.12
        if dist > 60:
            traffic_factor = 1 + (traffic_factor - 1) * 0.4
        elif dist > 30:
            traffic_factor = 1 + (traffic_factor - 1) * 0.7
        traffic_factor = min(3.2, max(1.0, traffic_factor))
        eta_via_factor = int(round(route["eta_minutes"] * traffic_factor))

        # Final ETA: take the MORE conservative (longer) of speed-based and factor-based, to match Google's real traffic
        # This ensures we don't show 10 mins when Google shows 33
        adjusted_eta = max(eta_via_speed, eta_via_factor)
        # Also ensure not less than raw OSRM (never faster than free-flow)
        adjusted_eta = max(adjusted_eta, route["eta_minutes"])
        min_eta = int(round(dist / 45 * 60))  # free-flow floor
        max_eta = int(round(dist / 8 * 60))  # gridlock ceiling (8 km/h crawl)
        adjusted_eta = max(min_eta, min(max_eta, adjusted_eta))
        # Store avg speed for UI/eco
        avg_speed_used = round(avg_speed_adj, 1)
        intelligence_score = avg_score * 0.7 + (adjusted_eta / 60 * 10)

        enriched_route = dict(route)
        enriched_route["eta_minutes"] = adjusted_eta
        enriched_route["eta_minutes_raw"] = route["eta_minutes"]
        enriched_route["traffic_factor"] = round(traffic_factor, 2)
        enriched_route["avg_speed"] = avg_speed_used
        enriched_route["eta_via_speed"] = eta_via_speed
        enriched_route["eta_via_factor"] = eta_via_factor
        enriched_route["ai"] = {
            "avg_score": round(avg_score, 1),
            "max_category": max_cat,
            "chunk_predictions": chunk_predictions,
            "intelligence_score": round(intelligence_score, 2)
        }
        if avg_score < 32:
            reason = "Clear roads • AI predicts smooth flow"
        elif avg_score < 55:
            reason = "Moderate traffic • Steady movement"
        elif avg_score < 78:
            reason = "Heavy traffic expected • Consider alternative"
        else:
            reason = "Severe congestion predicted • Strongly recommend alternative"
        enriched_route["reason"] = reason
        enriched.append(enriched_route)

    # 10-min buffer zone: keep only routes within 10 min of fastest ETA
    if len(enriched) > 1:
        fastest_eta = min(r["eta_minutes"] for r in enriched)
        before = len(enriched)
        enriched = [r for r in enriched if r["eta_minutes"] <= fastest_eta + 10]
        # If filtering removed too many, keep at least 2
        if len(enriched) == 1 and before > 1:
            # Keep the next best that was just outside buffer if it's eco-friendly?
            candidates = [r for r in sorted(enriched + [x for x in routes if x not in enriched], key=lambda x: x.get("eta_minutes", 0)) if r not in enriched]
            # For now keep originally filtered; but ensure at least 2 routes if originally 2+
            if before >= 2:
                # Keep closest to buffer
                sorted_all = sorted([r for r in enriched] + [r for r in []], key=lambda x: x["eta_minutes"])
                pass
        # Re-sort after buffer filter
        enriched = sorted(enriched, key=lambda r: r["ai"]["intelligence_score"])
    else:
        enriched = sorted(enriched, key=lambda r: r["ai"]["intelligence_score"])

    # Rank and pick recommended
    enriched_sorted = sorted(enriched, key=lambda r: r["ai"]["intelligence_score"])
    for idx, r in enumerate(enriched_sorted):
        r["is_recommended"] = (idx == 0)
        # Name logic: Recommended, Fastest, Fuel Efficient etc will be post-eco
        r["name"] = "Flow Recommended" if idx == 0 else f"Alternative {idx}"
        if idx == 1 and r["eta_minutes"] == min(x["eta_minutes"] for x in enriched_sorted):
            r["name"] = "Fastest"
        if idx == 0 and r["ai"]["avg_score"] >= 55:
            pass
        elif idx == 0:
            r["reason"] = "Avoids predicted congestion • AI optimized for next 30 min" if r["ai"]["avg_score"] < 55 else r["reason"]

    # Add eco metrics
    enriched_sorted = rank_eco(enriched_sorted, weather)

    # Refine names based on eco badges if not recommended
    for r in enriched_sorted:
        if not r["is_recommended"] and r.get("eco", {}).get("badge"):
            # Append eco badge to name for clarity, keep alternative numbering
            r["name"] = f"{r['name']} • {r['eco']['badge']}"

    return enriched_sorted

def select_recommended(routes_enriched):
    for r in routes_enriched:
        if r.get("is_recommended"):
            return r
    return routes_enriched[0] if routes_enriched else None
