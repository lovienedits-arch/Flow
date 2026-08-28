"""
FLOW Routing Service - Normalizes provider data into FLOW's GeoJSON route format.
Ensures each route contains detailed LineString coordinates (real road path, not 2 endpoints).
"""
from services.routing_provider import get_provider

def normalize_routes(osrm_data):
    routes = []
    for i, route in enumerate(osrm_data.get("routes", [])):
        geometry = route.get("geometry")
        # Validate geometry is LineString with many coords
        if not geometry or geometry.get("type") != "LineString":
            continue
        coords = geometry.get("coordinates", [])
        if len(coords) < 3:
            # Skip degenerate (must not be straight 2-point fake road)
            continue
        duration_min = round(route.get("duration", 0) / 60)
        # clamp to at least 2 min
        duration_min = max(2, duration_min)
        distance_km = round(route.get("distance", 0) / 1000, 1)
        routes.append({
            "id": f"route_{i}",
            "name": "Flow Recommended" if i == 0 else f"Alternative {i}",
            "is_recommended": i == 0,  # temporary, will be re-ranked by intelligence
            "eta_minutes": duration_min,
            "distance_km": distance_km,
            "geometry": geometry,
            "raw_duration": route.get("duration", 0),
            "raw_distance": route.get("distance", 0)
        })
    return routes

def fetch_and_normalize(origin, destination):
    provider = get_provider("osrm")
    try:
        data = provider.fetch_routes(origin, destination)
        if data.get("code") and data["code"] != "Ok":
            raise Exception(f"OSRM error {data.get('code')}")
        routes = normalize_routes(data)
        if not routes:
            raise Exception("No valid routes from OSRM")
        return routes, None
    except Exception as e:
        # Fallback provider
        try:
            from services.routing_provider import FallbackProvider
            fb = FallbackProvider()
            data = fb.fetch_routes(origin, destination)
            routes = normalize_routes(data)
            return routes, f"fallback: {str(e)}"
        except Exception as e2:
            return [], str(e2)
