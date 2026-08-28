# FLOW — Predict. Optimize. Move.
**AI-powered Bengaluru traffic intelligence and smart navigation**

> REAL BENGALURU MAP + REAL ROAD-FOLLOWING ROUTES + CURRENT TRAFFIC VISUALIZATION + AI CONGESTION FORECASTING + SMARTER ROUTE RECOMMENDATIONS
>
> **THE MAP IS THE PRODUCT. THE AI MAKES THE MAP SMARTER.**

SDG 11 — Sustainable Cities and Communities

---

## Architecture (Original for FLOW hackathon)
- **Frontend:** MapLibre GL JS (real map, not dashboard), modular Vanilla JS (api, map, search, ui, app) — map-first 85-95% focus, premium clean design
- **Backend:** Flask, CORS — modular services:
  - `prediction_service` — RandomForest Regressor/Classifier with proper `feature_names_in_` handling (no warning suppression)
  - `routing_provider` — OSRM abstraction (`overview=full`, `geometries=geojson`, real road geometry)
  - `routing_service` — normalizes GeoJSON LineString (never 2-point straight lines)
  - `flow_route_intelligence` — combines routes with AI (vehicle_count, speed, capacity, time, day, rainfall, duration, distance) to pick FLOW Recommended
  - `traffic_service` — slices real geometry into coloured segments (Green/Yellow/Orange/Red) via AI
  - `recommendation_service` — Driver vs City insights
  - `simulation_service` — scenario simulation via real model
- **ML:** Python, pandas, scikit-learn — synthetic 6000-sample generation with realistic relationships (peak hours, rainfall, capacity), RandomForestRegressor + Classifier
- **Routing:** OpenStreetMap via OSRM demo server with fallback
- **Optional:** MapTiler key (fallback Carto Positron), Firebase Auth/Firestore (fallback Guest + localStorage)

## No Floating Roads
Every route and traffic overlay follows actual OSM road geometry (`LineString` with dozens-hundreds of coordinates). No `[origin, dest]` straight-line graph.

## Features
- Full-screen Bengaluru map (pan/zoom), debounced search (Nominatim + local cache), origin/dest, swap
- Real routes: FLOW Recommended / Fastest / Alternative (road-following GeoJSON)
- Traffic on real segments: Low/Moderate/High/Severe with FROM→TO, clickable, coloured overlays
- Layers: Current Traffic, AI Forecast, High-Risk; Forecast NOW / +15 / +30 (re-runs ML)
- Driver | City toggle (City shows junctions, predictions, signal recommendations on same map)
- Scenario Simulator: Traffic Normal/High/Very High, Weather Clear/Rain, Event None/Closure/Major Event → real ML → map update
- AI Alerts with Find better route, route sheet, fitBounds, dim alternatives
- Profile (top-right), Guest Mode, optional Google Sign-In, Saved Places (Firestore/localStorage), Themes System/Light/Dark (persisted, map style switches)
- Responsible AI section (model, inputs, outputs, limitations, privacy)
- Demo: Kalyan Nagar → MG Road (Launch Demo Scenario, Reset Demo)

## Setup
1. `python -m venv venv` then activate
2. `pip install -r requirements.txt`
3. `python models/train_model.py` (generates `models/traffic_*.pkl` with strict feature names)
4. `python app.py`
5. Open `http://127.0.0.1:5000`

Optional env: copy `.env.example` to `.env` and set `MAPTILER_API_KEY` and Firebase keys. Without them, app works with Carto tiles + Guest Mode.

## Demo Flow (Hackathon)
1. Open FLOW → real Bengaluru map loads
2. Click Launch Demo Scenario (or search MG Road)
3. Real road-following routes appear; one segment shows congested colour
4. Click segment → FROM→TO + current + forecast
5. FLOW predicts worsening in 20 min
6. FLOW recommends better route (time saved shown)
7. Switch to City Mode → traffic-management recommendation
8. Run Rain/High-traffic scenario → map + predictions update
9. Reset Demo

## API
- `GET /api/config` — map style/center
- `GET /api/geocode?q=` — search
- `POST /api/route` — `{origin:[lon,lat], destination:[lon,lat], scenario,horizon}` → `{routes:[{geometry:LineString, eta_minutes, distance_km, ...}]}`
- `POST /api/traffic/segments` — `{geometry:LineString, scenario,horizon}` → FeatureCollection coloured segments
- `POST /api/traffic/forecast` — bulk NOW/15/30
- `POST /api/predict` — raw ML prediction
- `POST /api/simulate` — `{traffic,weather,event}`
- `GET/POST /api/insights` — city intelligence

All new code, architecture, UI, ML pipeline, data generation, API logic and integration created specifically for FLOW. Uses only legitimate libraries (MapLibre, OSM, scikit-learn, pandas, Flask, Firebase) — no cloned hackathon project.
