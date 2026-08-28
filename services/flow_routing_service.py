"""
FLOW Routing Service - kept for backward compatibility, delegates to new modular services.
Original file preserved; now wraps routing_service + intelligence.
"""
from services.routing_service import fetch_and_normalize
from services.flow_route_intelligence import enrich_routes_with_ai

def get_real_routes(start_coords, end_coords, scenario="normal", horizon="now"):
    """
    Returns {"routes": [...]} where each route has real road-following geometry
    and AI-enriched metadata. Never returns straight 2-point roads.
    """
    routes, warning = fetch_and_normalize(start_coords, end_coords)
    if not routes:
        return {"routes": [], "error": warning or "No routes found", "warning": warning}
    enriched = enrich_routes_with_ai(routes, scenario=scenario, horizon=horizon)
    result = {"routes": enriched}
    if warning:
        result["warning"] = warning
    return result
