"""
FLOW Eco Service — Fuel & Pollution calculations per route
Original model: fuel ∝ distance * traffic multiplier * weather * stop-go
"""
def compute_eco_metrics(route, avg_congestion_score, weather=None):
    """
    route: dict with distance_km, eta_minutes, raw_distance
    avg_congestion_score: 0-100
    weather: dict with is_rain
    Returns fuel_l, co2_kg, pollution_index, eco_label
    """
    dist = route.get("distance_km", route.get("raw_distance",0)/1000)
    # Base consumption: 0.075 L/km for avg petrol car in city (7.5 L/100km) + variations
    # Traffic penalty: congestion 0-> +0%, 100-> +45%
    traffic_mult = 1 + (avg_congestion_score / 100) * 0.45
    # Weather penalty rain +10%
    weather_mult = 1.10 if weather and weather.get("is_rain") else 1.0
    # Stop-go penalty based on traffic segments variance approximated by congestion
    # Use eta vs distance to infer speed
    avg_speed = (dist / max(1, route.get("eta_minutes",10)/60))  # km/h
    speed_penalty = 1.0
    if avg_speed < 18:
        speed_penalty = 1.12
    elif avg_speed < 25:
        speed_penalty = 1.05

    fuel_l = dist * 0.075 * traffic_mult * weather_mult * speed_penalty
    # CO2: 2.31 kg per liter petrol
    co2_kg = fuel_l * 2.31
    # Pollution index 0-100: mix of fuel per km and congestion
    # Lower is cleaner
    fuel_per_km = fuel_l / max(0.5, dist)
    pollution_index = min(100, (fuel_per_km/0.12)*40 + (avg_congestion_score/100)*60 )
    # Label
    if pollution_index < 30:
        label = "Very Low Emission"
    elif pollution_index < 45:
        label = "Low Emission"
    elif pollution_index < 65:
        label = "Moderate Emission"
    elif pollution_index < 80:
        label = "High Emission"
    else:
        label = "Very High Emission"

    return {
        "fuel_litres": round(fuel_l, 2),
        "fuel_per_100km": round(fuel_l/dist*100,1) if dist else 0,
        "co2_kg": round(co2_kg,2),
        "pollution_index": round(pollution_index,1),
        "pollution_label": label,
        "avg_speed_kmh": round(avg_speed,1),
        "traffic_multiplier": round(traffic_mult,2)
    }

def rank_eco(routes_with_ai, weather=None):
    """
    Annotates each route with eco metrics and tags most fuel-efficient / lowest pollution
    routes_with_ai: list of enriched routes (after intelligence)
    """
    for r in routes_with_ai:
        eco = compute_eco_metrics(r, r["ai"]["avg_score"], weather)
        r["eco"] = eco
    # Find best fuel and best pollution (lowest)
    if len(routes_with_ai) >= 2:
        best_fuel = min(routes_with_ai, key=lambda x: x["eco"]["fuel_litres"])
        best_poll = min(routes_with_ai, key=lambda x: x["eco"]["pollution_index"])
        best_fuel["eco"]["is_most_fuel_efficient"] = True
        best_poll["eco"]["is_lowest_emission"] = True
        # If same route, mark both
        for r in routes_with_ai:
            r["eco"].setdefault("is_most_fuel_efficient", False)
            r["eco"].setdefault("is_lowest_emission", False)
            # Also tag clean route for UI
            if r["eco"]["is_most_fuel_efficient"] and r["eco"]["is_lowest_emission"]:
                r["eco"]["badge"] = "Most Eco-Friendly"
            elif r["eco"]["is_most_fuel_efficient"]:
                r["eco"]["badge"] = "Fuel Efficient"
            elif r["eco"]["is_lowest_emission"]:
                r["eco"]["badge"] = "Lowest Emission"
            else:
                r["eco"]["badge"] = None
    else:
        for r in routes_with_ai:
            r["eco"]["badge"] = None
            r["eco"]["is_most_fuel_efficient"]=False
            r["eco"]["is_lowest_emission"]=False
    return routes_with_ai
