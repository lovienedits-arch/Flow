"""
FLOW Recommendation Service - City vs Driver insights
"""
import random

def city_intelligence(segments_fc):
    """
    Generate city-mode insights from traffic segments.
    Returns list of insights with location, prediction, recommendation.
    """
    insights = []
    for feat in segments_fc.get("features", [])[:4]:
        props = feat["properties"]
        cat = props["category"]
        road = props["road_name"]
        start = props["start_point"]
        end = props["end_point"]
        score = props["score"]
        if cat in ("High", "Severe"):
            insights.append({
                "level": "HIGH",
                "title": f"Heavy congestion on {road}",
                "detail": f"FLOW AI predicts {props['risk_probability']}% congestion risk within 30 min between {start} → {end}.",
                "road": road,
                "location": f"{start} → {end}",
                "prediction": f"Heavy congestion in {random.choice([15,20,30])} minutes",
                "recommendation": random.choice([
                    "Increase green signal duration by 15 seconds at next junction.",
                    "Deploy traffic personnel at Hennur Junction for 20 minutes.",
                    "Divert traffic via Outer Ring Road - expect 12% relief.",
                    "Activate adaptive signal control for 30 minutes."
                ]),
                "reason": "Vehicle density increasing while average speed is falling.",
                "impact": f"{random.randint(12,22)}% congestion reduction",
                "score": score,
                "category": cat
            })
        elif cat == "Moderate":
            insights.append({
                "level": "MEDIUM",
                "title": f"Moderate load at {road}",
                "detail": f"Speed dropped to {props['average_speed']} km/h between {start} → {end}.",
                "road": road,
                "location": f"{start} → {end}",
                "prediction": "Stable with mild increase expected",
                "recommendation": "Monitor flow - no immediate action required.",
                "reason": "Traffic within capacity but trending upward.",
                "impact": "2-5% variation",
                "score": score,
                "category": cat
            })
    if not insights:
        insights.append({
            "level": "LOW",
            "title": "Network flowing smoothly",
            "detail": "No high-risk segments detected. FLOW AI shows low congestion across monitored corridors.",
            "road": "Bengaluru Corridor",
            "location": "City-wide",
            "prediction": "Stable for next 30 minutes",
            "recommendation": "Maintain current signal plans.",
            "reason": "Vehicle counts within thresholds.",
            "impact": "Optimal flow",
            "score": 18,
            "category": "Low"
        })
    # sort HIGH first
    insights.sort(key=lambda x: x["score"], reverse=True)
    return insights

def driver_alert(segments_fc):
    """
    Returns driver-facing alert if severe/high risk detected.
    """
    if not segments_fc.get("features"):
        return None
    worst = max(segments_fc["features"], key=lambda f: f["properties"]["score"])
    props = worst["properties"]
    if props["category"] in ("High", "Severe"):
        return {
            "title": "Traffic may build up ahead",
            "detail": f"{props['risk_probability']}% probability of {props['category'].lower()} congestion on {props['road_name']} within 30 minutes.",
            "road": props["road_name"],
            "segment": f"{props['start_point']} → {props['end_point']}",
            "category": props["category"],
            "action": "Find better route"
        }
    return None
