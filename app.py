"""
FLOW - Predict. Optimize. Move.
Original Flask backend for Bengaluru traffic intelligence + Auth + Track + Eco + Weather
Map-first, AI-powered, no floating roads, real OSRM geometry.
"""
import os
import time
import random
import datetime
from flask import Flask, jsonify, request, render_template, g
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

from services.prediction_service import predict_traffic, predict_forecast
from services.flow_routing_service import get_real_routes
from services.traffic_service import generate_segments
from services.recommendation_service import city_intelligence, driver_alert
from services.simulation_service import run_simulation
from services.auth_service import register_user, login_user, get_user_by_token, get_user_by_username, get_user_by_id, logout_token, search_users
from services.tracking_service import send_request, list_requests_for_user, act_on_request, update_location, get_location, get_tracked_people, can_track
from services.weather_service import get_weather, weather_for_route
from services.eco_service import compute_eco_metrics

app = Flask(__name__, static_folder="static", template_folder="templates")
CORS(app)

BENGALURU_CENTER = [77.5946, 12.9716]
BENGALURU_CENTER_LATLON = [12.9716, 77.5946]

GEOCODE_CACHE = {}
GEOCODE_TS = {}
CACHE_TTL = 600

REAL_COORDINATES = {
    "Kalyan Nagar": {"lat": 13.0280, "lon": 77.6399, "address": "Kalyan Nagar, Bengaluru", "road": "Hennur Main Rd"},
    "MG Road": {"lat": 12.9716, "lon": 77.6013, "address": "MG Road, Bengaluru", "road": "Mahatma Gandhi Rd"},
    "Hebbal": {"lat": 13.0354, "lon": 77.5988, "address": "Hebbal, Bengaluru", "road": "Outer Ring Rd"},
    "Indiranagar": {"lat": 12.9784, "lon": 77.6408, "address": "Indiranagar, Bengaluru", "road": "100 Feet Rd"},
    "KR Puram": {"lat": 13.0110, "lon": 77.6960, "address": "KR Puram, Bengaluru", "road": "Old Madras Rd"},
    "Silk Board": {"lat": 12.9170, "lon": 77.6230, "address": "Silk Board, Bengaluru", "road": "Hosur Rd"},
    "Koramangala": {"lat": 12.9352, "lon": 77.6271, "address": "Koramangala, Bengaluru", "road": "80 Feet Rd"},
    "Whitefield": {"lat": 12.9698, "lon": 77.7500, "address": "Whitefield, Bengaluru", "road": "Whitefield Main Rd"},
    "Jayanagar": {"lat": 12.9279, "lon": 77.6271, "address": "Jayanagar, Bengaluru", "road": "Jayanagar 9th Block"},
    "HSR Layout": {"lat": 12.9116, "lon": 77.6742, "address": "HSR Layout, Bengaluru", "road": "14th Main Rd"},
}

def get_auth_user():
    auth = request.headers.get("Authorization", "")
    token = None
    if auth.startswith("Bearer "):
        token = auth[7:].strip()
    else:
        token = request.headers.get("X-Auth-Token") or request.args.get("token") or (request.get_json(silent=True) or {}).get("token")
        # also check cookie fallback via header
        if not token:
            token = request.cookies.get("flow_token")
    if token:
        return get_user_by_token(token), token
    return None, None

@app.before_request
def attach_user():
    user, token = get_auth_user()
    g.current_user = user
    g.current_token = token

@app.route('/')
def index():
    return render_template('index.html')

@app.route("/api/config")
def api_config():
    maptiler_key = os.getenv("MAPTILER_API_KEY", "").strip()
    has_key = bool(maptiler_key and maptiler_key != "YOUR_MAPTILER_KEY_HERE" and len(maptiler_key) > 10)
    if has_key:
        style = f"https://api.maptiler.com/maps/streets-v2/style.json?key={maptiler_key}"
    else:
        style = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
    return jsonify({
        "hasMaptilerKey": has_key,
        "style": style,
        "center": [77.5946, 12.9716],
        "centerLatLon": [12.9716, 77.5946],
        "bengaluruBounds": [[77.4, 12.8], [77.8, 13.2]]
    })

# ---------- Auth ----------
@app.route("/api/auth/register", methods=["POST"])
def api_register():
    data = request.get_json(force=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    display_name = (data.get("display_name") or username).strip()
    res, err = register_user(username, password, display_name)
    if err:
        return jsonify({"error": err}), 400
    return jsonify(res)

@app.route("/api/auth/login", methods=["POST"])
def api_login():
    data = request.get_json(force=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    res, err = login_user(username, password)
    if err:
        return jsonify({"error": err}), 401
    return jsonify(res)

@app.route("/api/auth/me", methods=["GET"])
def api_me():
    if not g.current_user:
        return jsonify({"user": None}), 200
    u = g.current_user
    return jsonify({"user": {"id": u["id"], "username": u["username"], "display_name": u["display_name"]}})

@app.route("/api/auth/logout", methods=["POST"])
def api_logout():
    if g.current_token:
        logout_token(g.current_token)
    return jsonify({"ok": True})

@app.route("/api/users/search", methods=["GET"])
def api_user_search():
    q = request.args.get("q", "").strip()
    if not q or len(q) < 2:
        return jsonify({"results": []})
    exclude = g.current_user["id"] if g.current_user else None
    results = search_users(q, exclude_id=exclude, limit=8)
    return jsonify({"results": results})

# ---------- Track ----------
@app.route("/api/track/request", methods=["POST"])
def api_track_request():
    if not g.current_user:
        return jsonify({"error": "Login required"}), 401
    data = request.get_json(force=True) or {}
    target = (data.get("username") or "").strip()
    if not target:
        return jsonify({"error": "Username required"}), 400
    res, err = send_request(g.current_user["id"], target)
    if err:
        return jsonify({"error": err}), 400
    return jsonify(res)

@app.route("/api/track/requests", methods=["GET"])
def api_track_requests():
    if not g.current_user:
        return jsonify({"error": "Login required"}), 401
    data = list_requests_for_user(g.current_user["id"])
    return jsonify(data)

@app.route("/api/track/request/<int:req_id>/action", methods=["POST"])
def api_track_action(req_id):
    if not g.current_user:
        return jsonify({"error": "Login required"}), 401
    data = request.get_json(force=True) or {}
    action = data.get("action", "")
    res, err = act_on_request(g.current_user["id"], req_id, action)
    if err:
        return jsonify({"error": err}), 400
    return jsonify(res)

@app.route("/api/track/location/update", methods=["POST"])
def api_track_update():
    if not g.current_user:
        return jsonify({"error": "Login required"}), 401
    data = request.get_json(force=True) or {}
    try:
        lat = float(data.get("lat"))
        lon = float(data.get("lon"))
    except:
        return jsonify({"error": "Invalid lat/lon"}), 400
    acc = data.get("accuracy")
    update_location(g.current_user["id"], lat, lon, acc)
    return jsonify({"ok": True})

@app.route("/api/track/location/<username>", methods=["GET"])
def api_track_location(username):
    if not g.current_user:
        return jsonify({"error": "Login required"}), 401
    target = get_user_by_username(username)
    if not target:
        return jsonify({"error": "User not found"}), 404
    if not can_track(g.current_user["id"], target["id"]):
        return jsonify({"error": "Not connected. Request must be accepted."}), 403
    loc = get_location(target["id"])
    if not loc:
        return jsonify({"error": "No live location available yet"}), 404
    return jsonify({"username": target["username"], "display_name": target["display_name"], "location": loc})

@app.route("/api/track/connections", methods=["GET"])
def api_track_connections():
    if not g.current_user:
        return jsonify({"error": "Login required"}), 401
    people = get_tracked_people(g.current_user["id"])
    return jsonify({"connections": people})

@app.route("/api/track/live", methods=["GET"])
def api_track_live():
    if not g.current_user:
        return jsonify({"error": "Login required"}), 401
    # Returns all accepted connections with locations for polling
    people = get_tracked_people(g.current_user["id"])
    return jsonify({"people": people})

# ---------- Weather ----------
@app.route("/api/weather", methods=["GET"])
def api_weather():
    try:
        lat = float(request.args.get("lat", "12.9716"))
        lon = float(request.args.get("lon", "77.5946"))
    except:
        lat, lon = 12.9716, 77.5946
    w = get_weather(lat, lon)
    return jsonify(w)

# ---------- Geocode ----------
@app.route("/api/geocode")
def api_geocode():
    q = request.args.get("q", "").strip()
    if not q or len(q) < 2:
        return jsonify({"results": []})
    cache_key = q.lower()
    now = time.time()
    if cache_key in GEOCODE_CACHE and now - GEOCODE_TS.get(cache_key, 0) < CACHE_TTL:
        return jsonify(GEOCODE_CACHE[cache_key])

    local_matches = []
    for name, coord in REAL_COORDINATES.items():
        if cache_key in name.lower() or cache_key in coord["address"].lower() or cache_key in coord["road"].lower():
            local_matches.append({
                "name": name,
                "display_name": f"{name}, Bengaluru, Karnataka",
                "road": coord["road"],
                "coordinates": [coord["lon"], coord["lat"]]
            })
    nomin_results = []
    import requests, math
    try:
        resp = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={
                "format": "json",
                "limit": 8,
                "q": q,
                "viewbox": "77.35,13.25,77.85,12.75",
                "bounded": 0,
                "addressdetails": 1,
                "countrycodes": "in"
            },
            headers={"User-Agent": "Flow/1.0 (flow.city)"},
            timeout=5
        )
        if resp.status_code == 200:
            data = resp.json()
            for r in data:
                try:
                    lon = float(r.get("lon")); lat = float(r.get("lat"))
                    nomin_results.append({
                        "name": r.get("name") or (r.get("display_name","").split(",")[0] or q),
                        "display_name": r.get("display_name"),
                        "coordinates": [lon, lat]
                    })
                except:
                    continue
    except Exception as e:
        print(f"[GEOCODE] nominatim error {e}")

    # Merge local + nomin, dedup by coords (rounded) and sort by distance to Bengaluru center
    def dist_to_center(lon, lat):
        # haversine approx
        import math
        clat, clon = 12.9716, 77.5946
        dlat = math.radians(lat - clat); dlon = math.radians(lon - clon)
        a = math.sin(dlat/2)**2 + math.cos(math.radians(clat))*math.cos(math.radians(lat))*math.sin(dlon/2)**2
        return 2*6371*math.asin(math.sqrt(a))
    seen=set()
    merged=[]
    for src in (local_matches + nomin_results):
        lon, lat = src["coordinates"]
        key=(round(lon,4), round(lat,4))
        if key in seen: continue
        seen.add(key)
        merged.append(src)
    # Sort: local first then nearest
    for r in merged:
        lon, lat = r["coordinates"]
        r["_d"] = dist_to_center(lon, lat)
    # Keep local at top but also sorted by distance within each group
    local_set=set((r["name"], tuple(r["coordinates"])) for r in local_matches)
    # Actually simpler: sort all by distance but boost local matches
    def sort_key(r):
        is_local = 0 if r in local_matches else 1
        return (is_local, r["_d"])
    merged.sort(key=sort_key)
    for r in merged: r.pop("_d", None)

    # Photon fallback if still few results (<2) and not already tried
    if len(merged) < 2:
        try:
            pr = requests.get("https://photon.komoot.io/api/", params={"q": q, "limit": 5, "lat": 12.9716, "lon": 77.5946}, headers={"User-Agent": "Flow/1.0"}, timeout=3)
            if pr.status_code==200:
                pj=pr.json()
                for feat in pj.get("features",[])[:4]:
                    try:
                        lon, lat = feat["geometry"]["coordinates"]
                        # only if within ~150km of Bengaluru
                        if dist_to_center(lon, lat) > 150: continue
                        name = feat["properties"].get("name") or q
                        disp = feat["properties"].get("street") or feat["properties"].get("city") or name
                        full = feat["properties"].get("name") or disp
                        # build display
                        props=feat["properties"]
                        parts=[props.get("name"), props.get("street"), props.get("district"), props.get("city") or "Bengaluru"]
                        disp_name=", ".join([p for p in parts if p])
                        key=(round(lon,4), round(lat,4))
                        if key not in seen:
                            seen.add(key)
                            merged.append({"name": name, "display_name": disp_name or name, "coordinates": [lon, lat]})
                    except: continue
        except Exception as e:
            print(f"[GEOCODE] photon error {e}")

    # lat,lon direct parse fallback
    if not merged:
        try:
            if "," in q:
                parts = q.split(",")
                lat = float(parts[0].strip()); lon = float(parts[1].strip())
                if -90 <= lat <= 90 and -180 <= lon <= 180:
                    merged = [{"name": f"{lat},{lon}", "display_name": f"{lat},{lon} (coordinates)", "coordinates": [lon, lat]}]
        except:
            pass

    payload = {"results": merged[:8]}
    GEOCODE_CACHE[cache_key] = payload
    GEOCODE_TS[cache_key] = now
    return jsonify(payload)

@app.route("/api/reverse")
def api_reverse():
    lat = request.args.get("lat"); lon = request.args.get("lon")
    if not lat or not lon:
        return jsonify({"display_name": "Selected location"})
    import requests
    try:
        resp = requests.get("https://nominatim.openstreetmap.org/reverse",
            params={"format":"json","lat":lat,"lon":lon},
            headers={"User-Agent":"FLOW/1.0"}, timeout=3)
        if resp.status_code==200:
            j=resp.json()
            return jsonify({"display_name": j.get("display_name","Selected location")})
    except:
        pass
    return jsonify({"display_name": f"{lat},{lon}"})

# ---------- Routing with Weather & Eco & 10min buffer ----------
@app.route('/api/route', methods=['POST'])
def get_routes():
    data = request.get_json(force=True) or {}
    origin = data.get('origin')
    destination = data.get('destination')
    scenario = data.get('scenario', 'normal')
    horizon = data.get('horizon', 'now')
    if not origin or not destination:
        return jsonify({"error": "origin and destination required"}), 400
    # Fetch real weather for origin/destination
    try:
        weather = weather_for_route(origin, destination)
    except:
        weather = {"rainfall_for_model": 0, "is_rain": False, "description": "Clear"}
    # Allow client to force scenario via weather: if weather is rainy, auto-adjust scenario to rain bias unless high
    # But respect explicit scenario
    result = None
    try:
        # get_real_routes now supports weather param via flow_route_intelligence
        from services.routing_service import fetch_and_normalize
        from services.flow_route_intelligence import enrich_routes_with_ai
        routes, warning = fetch_and_normalize(origin, destination)
        if not routes:
            return jsonify({"routes": [], "error": warning or "No routes found", "warning": warning})
        enriched = enrich_routes_with_ai(routes, scenario=scenario, horizon=horizon, weather=weather)
        result = {"routes": enriched, "weather": weather}
        if warning:
            result["warning"] = warning
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    return jsonify(result)

@app.route('/api/traffic/segments', methods=['POST'])
def get_traffic_segments():
    data = request.get_json(force=True) or {}
    geometry = data.get('geometry', {})
    if not geometry:
        geometry = data.get('route_geometry', {})
    if geometry.get("type") == "Feature":
        geometry = geometry.get("geometry", {})
    scenario = data.get('scenario', 'normal')
    scenario_map_front = {
        "normal": "normal", "rain": "rain", "high": "high_traffic", "very_high": "very_high",
        "closure": "closure", "event": "event", "high_traffic": "high_traffic"
    }
    scenario = scenario_map_front.get(scenario, scenario)
    horizon = data.get('horizon', 'now')
    if "forecast" in data:
        horizon = data["forecast"]
    if isinstance(horizon, int):
        horizon = "30" if horizon==30 else "15" if horizon==15 else "now"
    coords = geometry.get('coordinates', []) if isinstance(geometry, dict) else []
    if not coords:
        coords = data.get('coordinates', [])
        geometry = {"type":"LineString","coordinates": coords}
    # If request includes origin/destination weather, we could fetch weather for that location
    # Use rainfall from weather if provided via scenario?
    # For now, also consider weather from query params if present
    weather = None
    if data.get("origin") and data.get("destination"):
        try:
            weather = weather_for_route(data["origin"], data["destination"])
        except:
            weather = None
    segments = generate_segments(geometry, scenario=scenario, horizon=horizon)
    # If weather rainy, slightly bump rainfall effect already via scenario, but also inject weather info
    return jsonify(segments)

@app.route('/api/traffic/forecast', methods=['POST'])
def traffic_forecast():
    data = request.get_json(force=True) or {}
    geometry = data.get('geometry', {})
    if geometry.get("type") == "Feature":
        geometry = geometry.get("geometry", {})
    scenario = data.get('scenario', 'normal')
    scenario = {"normal":"normal","rain":"rain","high":"high_traffic","very_high":"very_high"}.get(scenario, scenario)
    result = {}
    for h in ["now","15","30"]:
        result[h] = generate_segments(geometry, scenario=scenario, horizon=h)
    return jsonify(result)

@app.route('/api/predict', methods=['POST'])
def api_predict():
    data = request.get_json(force=True) or {}
    feats = data.get("features", data)
    defaults = {"vehicle_count":200,"average_speed":35,"road_capacity":400,"time_of_day":14,"day_of_week":2,"rainfall":0}
    for k,v in defaults.items():
        if k not in feats:
            feats[k]=v
    horizon = data.get("horizon") or request.args.get("horizon")
    if horizon in (15, "15", 30, "30"):
        pred = predict_forecast(feats, int(horizon))
    else:
        pred = predict_traffic(feats)
    return jsonify(pred)

@app.route('/api/simulate', methods=['POST'])
def api_simulate():
    data = request.get_json(force=True) or {}
    traffic_level = data.get("traffic", "normal")
    weather = data.get("weather", "clear")
    event = data.get("event", "none")
    traffic_level = traffic_level.lower().replace(" ", "_")
    if traffic_level not in ("normal","high","very_high"):
        traffic_level = "normal"
    weather = weather.lower()
    event = event.lower().replace(" ", "_")
    if event not in ("none","road_closure","major_event"):
        event = "none"
    result = run_simulation(traffic_level, weather, event)
    return jsonify(result)

@app.route("/api/insights", methods=['GET','POST'])
def api_insights():
    if request.method == "POST":
        data = request.get_json(force=True) or {}
        geometry = data.get("geometry", {})
        if geometry.get("type") == "Feature":
            geometry = geometry.get("geometry", {})
        scenario = data.get("scenario","normal")
        horizon = data.get("horizon","now")
        if geometry and geometry.get("coordinates"):
            segs = generate_segments(geometry, scenario=scenario, horizon=horizon)
        else:
            import requests
            try:
                from services.routing_service import fetch_and_normalize
                routes,_ = fetch_and_normalize([77.6399,13.0280],[77.6013,12.9716])
                if routes:
                    segs = generate_segments(routes[0]["geometry"], scenario=scenario, horizon=horizon)
                else:
                    segs = generate_segments({"type":"LineString","coordinates":[[77.6399,13.0280],[77.62,13.0],[77.6013,12.9716]]}, scenario=scenario, horizon=horizon)
            except:
                segs = {"type":"FeatureCollection","features":[]}
        insights = city_intelligence(segs)
        alert = driver_alert(segs)
        return jsonify({"insights": insights, "alert": alert, "segments": segs})
    else:
        segs = generate_segments({"type":"LineString","coordinates":[[77.6399,13.0280],[77.62,13.0],[77.6013,12.9716]]}, scenario="normal", horizon="now")
        insights = city_intelligence(segs)
        return jsonify({"insights": insights})

@app.route("/api/health")
def health():
    return jsonify({"status":"ok","flow":"Predict. Optimize. Move.","center":[12.9716,77.5946]})

if __name__ == '__main__':
    if not os.path.exists("models/traffic_regressor.pkl"):
        try:
            from models.train_model import train_and_save
            train_and_save()
        except Exception as e:
            print(f"Model train failed {e}")
    port = int(os.getenv("PORT", "5000"))
    use_https = os.getenv("FLOW_HTTPS") == "1"
    ssl_ctx = None
    if use_https:
        try:
            # adhoc will generate self-signed cert (needs cryptography)
            ssl_ctx = 'adhoc'
            print("[Flow] HTTPS enabled — use https://127.0.0.1:5000 (allow self-signed)")
        except Exception as e:
            print(f"[Flow] HTTPS requested but failed: {e}")
            ssl_ctx = None
    if ssl_ctx:
        app.run(host="0.0.0.0", port=port, debug=True, ssl_context=ssl_ctx)
    else:
        # Tip for secure origin: 127.0.0.1 is secure even over http, but LAN IPs are not.
        # If you see "Only secure origins", open via https or localhost.
        app.run(host="0.0.0.0", port=port, debug=True)
