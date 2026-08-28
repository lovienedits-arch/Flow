"""
FLOW Simulation Service - Runs real ML predictions under scenario inputs.
"""
from services.prediction_service import predict_scenario, predict_traffic

def run_simulation(traffic_level="normal", weather="clear", event="none"):
    """
    Returns representative prediction for scenario, using real model.
    """
    feats = predict_scenario(traffic_level, weather, event)
    pred = predict_traffic(feats)
    # Map to frontend scenario keys
    scenario_key = "normal"
    if traffic_level == "very_high":
        scenario_key = "very_high"
    elif traffic_level == "high":
        scenario_key = "high_traffic"
    elif weather == "rain":
        scenario_key = "rain"
    if event == "road_closure":
        scenario_key = "closure"
    elif event == "major_event":
        scenario_key = "event"

    # Provide readable summary
    impact_map = {
        "normal": "Baseline urban flow",
        "rain": "Rain reduces speed & capacity",
        "high_traffic": "Peak-hour pressure",
        "very_high": "Critical overload expected",
        "closure": "Diversion load on parallel roads",
        "event": "Event surge on nearby corridors"
    }

    return {
        "features": feats,
        "prediction": pred,
        "scenario_key": scenario_key,
        "summary": impact_map.get(scenario_key, "Simulated"),
        "traffic_level": traffic_level,
        "weather": weather,
        "event": event
    }
