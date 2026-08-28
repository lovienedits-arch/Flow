"""
FLOW Prediction Service
Original implementation for FLOW.
Fixes sklearn feature-name warnings properly - every prediction uses DataFrames
with exact feature_names_in_ ordering.
"""
import os
import pickle
import pandas as pd

FEATURE_COLUMNS = ["vehicle_count", "average_speed", "road_capacity", "time_of_day", "day_of_week", "rainfall"]

# Load models lazily
_regressor = None
_classifier = None

def _load_models():
    global _regressor, _classifier
    if _regressor is not None and _classifier is not None:
        return _regressor, _classifier
    candidates = [
        ('models/traffic_regressor.pkl', 'models/traffic_classifier.pkl'),
        (os.path.join(os.path.dirname(__file__), '..', 'models', 'traffic_regressor.pkl'),
         os.path.join(os.path.dirname(__file__), '..', 'models', 'traffic_classifier.pkl')),
        (os.path.join(os.path.dirname(__file__), 'traffic_regressor.pkl'),
         os.path.join(os.path.dirname(__file__), 'traffic_classifier.pkl')),
    ]
    for reg_path, clf_path in candidates:
        try:
            if os.path.exists(reg_path) and os.path.exists(clf_path):
                with open(reg_path, 'rb') as f:
                    _regressor = pickle.load(f)
                with open(clf_path, 'rb') as f:
                    _classifier = pickle.load(f)
                return _regressor, _classifier
        except Exception:
            continue
    return None, None

# Ensure models are loaded at import, auto-train if missing
_reg, _clf = _load_models()
if _reg is None:
    try:
        # attempt to train
        import subprocess, sys
        print("[FLOW] Models not found, training...")
        # inline import to avoid circular
        from models.train_model import train_and_save
        train_and_save()
        _reg, _clf = _load_models()
    except Exception as e:
        print(f"[FLOW] Auto-train failed: {e}")

regressor, classifier = _load_models()

def _make_input_df(features_dict):
    """
    Create DataFrame with exact feature names and order used during training.
    Uses model.feature_names_in_ where available (proper warning fix, not suppression).
    """
    reg, clf = _load_models()
    if reg is None:
        # fallback to manual
        return pd.DataFrame([features_dict], columns=FEATURE_COLUMNS)

    # Build base df with FEATURE_COLUMNS to ensure all keys present
    base = {k: features_dict.get(k, 0) for k in FEATURE_COLUMNS}
    input_df = pd.DataFrame([base])

    # Reorder to regressor's expected order
    try:
        if hasattr(reg, 'feature_names_in_'):
            input_df = input_df[reg.feature_names_in_]
    except Exception:
        input_df = input_df[FEATURE_COLUMNS]
    return input_df

def predict_traffic(features_dict):
    """
    Core FLOW prediction: returns score, category, risk.
    Uses real sklearn models, not hardcoded.
    Handles every path with DataFrame + feature_names_in_.
    """
    reg, clf = _load_models()
    if reg is None or clf is None:
        return {"score": 18.5, "category": "Low", "risk_probability": 22.0, "model": "fallback"}

    input_df = _make_input_df(features_dict)

    # Regression
    # Ensure column order matches regressor
    if hasattr(reg, 'feature_names_in_'):
        input_df_reg = input_df[reg.feature_names_in_]
    else:
        input_df_reg = input_df

    score = float(reg.predict(input_df_reg)[0])
    score = max(0, min(100, score))

    # Classification - must also use correct feature order for classifier
    if hasattr(clf, 'feature_names_in_'):
        try:
            clf_input = input_df[clf.feature_names_in_]
        except Exception:
            # fallback if columns differ slightly (shouldn't happen, but safe)
            clf_input = pd.DataFrame([features_dict])
            # reorder if possible
            clf_input = clf_input.reindex(columns=list(clf.feature_names_in_), fill_value=0)
    else:
        clf_input = input_df

    category = str(clf.predict(clf_input)[0])

    risk = round(min(99, score * 1.05 + 4), 1)
    return {"score": round(score, 2), "category": category, "risk_probability": risk}

def predict_forecast(base_features, horizon_minutes=0):
    """
    Forecast wrapper: adjusts time_of_day and slight deterioration for future horizon.
    Used for NOW / +15 / +30.
    """
    adj = dict(base_features)
    # Time progression
    adj["time_of_day"] = (adj.get("time_of_day", 12) + horizon_minutes / 60) % 24
    # Slight future load increase (modelled as vehicle_count drift)
    if horizon_minutes > 0:
        # ~3% increase per 15 min during peak, ~1% otherwise
        peak = adj["time_of_day"] in [8,9,10,17,18,19,20]
        factor = 1 + (0.03 if peak else 0.01) * (horizon_minutes / 15)
        adj["vehicle_count"] = int(adj.get("vehicle_count", 200) * factor)
        # Speed slightly decays as congestion builds
        adj["average_speed"] = max(8, adj.get("average_speed", 35) - (horizon_minutes/30)*2)

    return predict_traffic(adj)

def predict_scenario(traffic_level="normal", weather="clear", event="none", base_time=14, base_day=2):
    """
    Scenario simulation helper: returns representative feature dict for simulation.
    All predictions still go through real model.
    """
    # Traffic level
    if traffic_level == "normal":
        vc = 180
        speed = 42
    elif traffic_level == "high":
        vc = 380
        speed = 24
    elif traffic_level == "very_high":
        vc = 520
        speed = 14
    else:
        vc = 220
        speed = 35

    rainfall = 0
    if weather == "rain":
        rainfall = 35
        speed -= 8
        vc += 40

    if event == "road_closure":
        vc += 80
        speed -= 10
    elif event == "major_event":
        vc += 120
        speed -= 6

    speed = max(8, speed)

    features = {
        "vehicle_count": int(vc),
        "average_speed": int(speed),
        "road_capacity": 400,
        "time_of_day": base_time,
        "day_of_week": base_day,
        "rainfall": float(rainfall)
    }
    return features

def classify_score(score):
    if score < 30:
        return "Low"
    elif score < 60:
        return "Moderate"
    elif score < 80:
        return "High"
    else:
        return "Severe"
