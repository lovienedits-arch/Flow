"""
FLOW Weather Service — Fetches real weather for Bengalore / any coords
Uses Open-Meteo (no API key) with fallback
"""
import requests, time

CACHE = {}
TTL = 600

def get_weather(lat, lon):
    key = f"{round(lat,2)},{round(lon,2)}"
    now = time.time()
    if key in CACHE and now - CACHE[key]["ts"] < TTL:
        return CACHE[key]["data"]
    try:
        # Open-Meteo current weather
        resp = requests.get("https://api.open-meteo.com/v1/forecast", params={
            "latitude": lat,
            "longitude": lon,
            "current": "temperature_2m,precipitation,rain,weather_code,wind_speed_10m",
            "timezone": "auto"
        }, timeout=4)
        if resp.status_code == 200:
            j = resp.json()
            cur = j.get("current", {})
            # precipitation in mm, rain in mm
            rain = cur.get("rain", 0) or cur.get("precipitation", 0) or 0
            # weather_code: 51-67 drizzle/rain, 71-77 snow, 80-82 showers, 95 thunderstorm
            code = cur.get("weather_code", 0)
            is_rain = code in [51,53,55,56,57,61,63,65,66,67,80,81,82,85,86,95,96,99] or rain > 0.2
            data = {
                "temperature": cur.get("temperature_2m"),
                "rain_mm": float(rain or 0),
                "rainfall_for_model": min(50, float(rain or 0)*8 + (12 if is_rain else 0)),  # scale to 0-50 for ML
                "is_rain": is_rain,
                "weather_code": code,
                "wind": cur.get("wind_speed_10m"),
                "description": code_to_desc(code),
                "raw": cur
            }
            CACHE[key] = {"ts": now, "data": data}
            return data
    except Exception as e:
        print(f"[weather] fetch failed {e}")
    # Fallback: no rain
    fallback = {"temperature": 29, "rain_mm": 0, "rainfall_for_model": 0, "is_rain": False, "weather_code": 0, "wind": 8, "description": "Clear (fallback)"}
    CACHE[key] = {"ts": now, "data": fallback}
    return fallback

def code_to_desc(code):
    mapping = {
        0: "Clear sky", 1:"Mainly clear", 2:"Partly cloudy", 3:"Overcast",
        45:"Fog", 48:"Rime fog", 51:"Light drizzle", 53:"Moderate drizzle",55:"Dense drizzle",
        61:"Slight rain",63:"Moderate rain",65:"Heavy rain",
        80:"Slight showers",81:"Moderate showers",82:"Violent showers",
        95:"Thunderstorm"
    }
    return mapping.get(code, f"Weather {code}")

def weather_for_route(origin, destination):
    # Average of both points
    try:
        lat1, lon1 = origin[1], origin[0]
        lat2, lon2 = destination[1], destination[0]
        w1 = get_weather(lat1, lon1)
        w2 = get_weather(lat2, lon2)
        avg_rain = (w1["rainfall_for_model"] + w2["rainfall_for_model"])/2
        is_rain = w1["is_rain"] or w2["is_rain"]
        return {
            "rainfall_for_model": avg_rain,
            "is_rain": is_rain,
            "description": w1["description"] if w1["is_rain"] else w2["description"],
            "details": {"origin": w1, "destination": w2}
        }
    except:
        return {"rainfall_for_model": 0, "is_rain": False, "description": "Clear"}
