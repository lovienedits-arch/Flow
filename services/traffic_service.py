"""
FLOW Traffic Service
Generates coloured road-segment overlays on REAL geometry using FLOW ML predictions.
No straight lines - every segment is a slice of actual route geometry.
"""
import random
from services.prediction_service import predict_traffic, predict_forecast

COLOR_MAP = {"Low": "#16a34a", "Moderate": "#eab308", "High": "#f97316", "Severe": "#dc2626"}

# Road names for Bengaluru demo - used to label segments FROM → TO
BENGALURU_ROADS = [
    "Hennur Main Rd", "Outer Ring Rd", "100 Feet Rd", "MG Road", "Hosur Rd",
    "Bannerghatta Rd", "Old Airport Rd", "Sarjapur Rd", "Kanakapura Rd", "Bellary Rd",
    "Hosur-Sarjapur Connector", "Residency Rd"
]
JUNCTIONS = [
    "Kalyan Nagar", "Hennur Junction", "Hebbal Flyover", "Indiranagar 100ft", "MG Road Metro",
    "Silk Board", "KR Puram", "Trinity Circle", "Domlur", "Ejipura", "Koramangala"
]

def chunk_geometry(coordinates, n_chunks=4):
    """Split LineString coordinates into n_chunks contiguous segments following road geometry."""
    if not coordinates or len(coordinates) < 2:
        return []
    chunk_size = max(5, len(coordinates) // n_chunks)
    chunks = []
    for i in range(0, len(coordinates)-1, chunk_size):
        seg = coordinates[i:i+chunk_size+1]
        if len(seg) >= 2:
            chunks.append(seg)
    # Ensure at least n_chunks if route long enough
    if len(chunks) < n_chunks and len(coordinates) > n_chunks*2:
        # subdivide further
        chunks = []
        step = len(coordinates) // n_chunks
        for i in range(n_chunks):
            start = i*step
            end = start+step+1 if i < n_chunks-1 else len(coordinates)
            chunks.append(coordinates[start:end])
    return chunks

def _road_label_for_index(idx, total):
    if total <= 1:
        return ("Kalyan Nagar", "MG Road")
    if idx == 0:
        return (random.choice(["Kalyan Nagar", "HBBR Layout"]), random.choice(["Hennur Junction", "Banaswadi"]))
    elif idx == total-1:
        return (random.choice(["Trinity Circle", "Anil Kumble Circle"]), random.choice(["MG Road", "Brigade Road"]))
    else:
        a = random.choice(JUNCTIONS)
        b = random.choice([j for j in JUNCTIONS if j != a])
        return (a, b)

def generate_segments(geometry, scenario="normal", horizon="now", time_context=None):
    """
    Generate FeatureCollection of LineString segments coloured by AI prediction.
    geometry: GeoJSON LineString
    scenario: normal | rain | high_traffic | very_high | closure | event
    horizon: now | 15 | 30
    time_context: dict with time_of_day/day_of_week overrides (optional)
    """
    coords = geometry.get("coordinates", []) if isinstance(geometry, dict) else []
    if not coords or len(coords) < 2:
        return {"type":"FeatureCollection","features":[]}

    horizon_map = {"now":0, "15":15, "30":30}
    horizon_minutes = horizon_map.get(str(horizon), 0)

    chunks = chunk_geometry(coords, n_chunks=5)
    features = []
    import datetime
    now = datetime.datetime.now()
    base_hour = time_context.get("time_of_day", now.hour) if time_context else now.hour
    base_dow = time_context.get("day_of_week", now.weekday()) if time_context else now.weekday()

    for idx, segment_coords in enumerate(chunks):
        # Determine base AI inputs with realistic variation per segment
        # Central segments (junctions) more congested
        is_central = 1 <= idx <= len(chunks)-2
        vc_base = random.randint(150, 300) + (60 if is_central else 0)
        speed_base = random.randint(30, 50) - (8 if is_central else 0)
        road_capacity = random.choice([300, 400, 500])

        # Scenario tweaks
        if scenario == "rain":
            vc_base += random.randint(30, 70)
            speed_base -= 10
            rainfall = random.uniform(25, 45)
        elif scenario == "high_traffic":
            vc_base = random.randint(360, 480)
            speed_base = random.randint(18, 28)
            rainfall = 0
        elif scenario == "very_high":
            vc_base = random.randint(480, 600)
            speed_base = random.randint(10, 18)
            rainfall = 0
        elif scenario == "closure":
            vc_base = random.randint(420, 540)
            speed_base = random.randint(11, 20)
            rainfall = 2
        elif scenario == "event":
            vc_base = random.randint(400, 560)
            speed_base = random.randint(14, 24)
            rainfall = 0
        else:
            rainfall = random.uniform(0, 5)

        speed_base = max(8, speed_base)
        vc_base = max(50, min(650, vc_base))

        features_dict = {
            "vehicle_count": int(vc_base),
            "average_speed": int(speed_base),
            "road_capacity": int(road_capacity),
            "time_of_day": int(base_hour),
            "day_of_week": int(base_dow),
            "rainfall": float(rainfall)
        }

        if horizon_minutes > 0:
            pred = predict_forecast(features_dict, horizon_minutes)
        else:
            pred = predict_traffic(features_dict)

        # Visual cue for blocked/obstruction: closure scenario -> one segment blocked
        is_blocked = False
        if scenario == "closure" and idx == 1 and len(chunks) > 2:
            # Make second segment blocked for demo (central obstruction)
            is_blocked = True
            pred["category"] = "Blocked"
            pred["score"] = 100
            pred["risk_probability"] = 100
            color = "#111111"

        if not is_blocked:
            color = COLOR_MAP.get(pred["category"], "#16a34a")
        start_name, end_name = _road_label_for_index(idx, len(chunks))
        road_name = random.choice(BENGALURU_ROADS)
        if is_blocked:
            road_name = road_name + " (Blocked)"

        # Add future trend: if horizon is later, slightly higher risk if already moderate
        properties = {
            "color": color,
            "category": pred["category"],
            "score": pred["score"],
            "risk_probability": pred["risk_probability"],
            "road_name": road_name,
            "start_point": start_name,
            "end_point": end_name,
            "segment_index": idx,
            "vehicle_count": features_dict["vehicle_count"],
            "average_speed": features_dict["average_speed"],
            "rainfall": round(features_dict["rainfall"],1),
            "horizon": horizon,
            "scenario": scenario,
            "blocked": is_blocked,
            "obstruction": is_blocked
        }
        features.append({
            "type": "Feature",
            "geometry": {"type":"LineString","coordinates": segment_coords},
            "properties": properties
        })

    # Ensure at least one severe/high segment for demo interest when scenario is very_high or high_traffic
    # If still all Low for normal, that's okay but for demo we inject one Heavy for storytelling if Kalyan Nagar->MG Road
    # We can optionally force one segment to be High if all Low and scenario normal (to make demo vivid) - do with 40% chance
    if scenario in ("normal", "high_traffic", "very_high") and len(features) >= 3:
        # Find mid segment and potentially bump
        mid = len(features)//2
        if features[mid]["properties"]["category"] == "Low" and random.random() < 0.7:
            # Re-predict with more extreme inputs to guarantee High
            forced_feats = {"vehicle_count": 480, "average_speed": 16, "road_capacity": 350, "time_of_day": 18, "day_of_week": 2, "rainfall": 8}
            forced = predict_traffic(forced_feats)
            features[mid]["properties"].update({
                "category": forced["category"],
                "color": COLOR_MAP[forced["category"]],
                "score": forced["score"],
                "risk_probability": forced["risk_probability"],
                "road_name": "Hennur Main Rd",
                "start_point": "Kalyan Nagar",
                "end_point": "Hennur Junction"
            })

    return {"type":"FeatureCollection","features": features}

def score_route_segments(feature_collection):
    """Helper to compute average congestion for a route's traffic segments."""
    feats = feature_collection.get("features", [])
    if not feats:
        return 50
    return sum(f["properties"]["score"] for f in feats) / len(feats)
