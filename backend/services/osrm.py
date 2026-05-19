"""OSRM helper. Uses the public OSRM by default; configurable via OSRM_HOST env."""

import os
import math
import concurrent.futures
import requests
from functools import lru_cache

OSRM_HOST = os.environ.get("OSRM_HOST", "http://router.project-osrm.org")
AVG_SPEED_KMH = 60.0  # per project spec — not OSRM's own duration

# Reuse one HTTP session across calls to keep TCP connections alive
_session = requests.Session()
_session.headers.update({"User-Agent": "AmbuMap-Haryana/0.1"})


class OSRMError(Exception):
    pass


def _route_url(origin, destination):
    # OSRM expects lon,lat order
    o_lon, o_lat = origin[1], origin[0]
    d_lon, d_lat = destination[1], destination[0]
    return (
        f"{OSRM_HOST}/route/v1/driving/"
        f"{o_lon},{o_lat};{d_lon},{d_lat}"
        f"?overview=full&geometries=geojson"
    )


@lru_cache(maxsize=4096)
def _cached_route(origin_t, destination_t):
    """Internal cache keyed by rounded coords (4 decimals ~= 11m)."""
    url = _route_url(origin_t, destination_t)
    try:
        r = _session.get(url, timeout=8)
        r.raise_for_status()
        data = r.json()
    except requests.RequestException as e:
        raise OSRMError(f"OSRM request failed: {e}")

    if data.get("code") != "Ok" or not data.get("routes"):
        raise OSRMError(f"OSRM returned no route: {data.get('code')}")

    route = data["routes"][0]
    distance_km = route["distance"] / 1000.0
    time_min = (distance_km / AVG_SPEED_KMH) * 60.0

    return {
        "distance_km": round(distance_km, 3),
        "time_min": round(time_min, 2),
        "geometry": route["geometry"],
    }


def get_route(origin, destination):
    """
    origin, destination: (lat, lon) tuples or lists.
    Returns dict with distance_km, time_min (computed @60 km/h), geometry (GeoJSON LineString).
    """
    o = (round(float(origin[0]), 4), round(float(origin[1]), 4))
    d = (round(float(destination[0]), 4), round(float(destination[1]), 4))
    return _cached_route(o, d)


def _haversine_km(a, b):
    lat1, lon1 = a
    lat2, lon2 = b
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    h = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(h))


def _fallback_route(origin, destination):
    """Used when OSRM fails: straight-line distance, no geometry."""
    d_km = _haversine_km(origin, destination)
    return {
        "distance_km": round(d_km, 3),
        "time_min": round((d_km / AVG_SPEED_KMH) * 60.0, 2),
        "geometry": None,
        "osrm_fallback": True,
    }


def get_routes_parallel(origin, destinations, max_workers=8):
    """
    Fetch OSRM routes for many destinations concurrently.
    `destinations` is a list of (lat, lon) tuples.
    Returns a list of route dicts in the same order as `destinations`.
    Falls back to straight-line distance for any OSRM failure.
    """
    def _one(dest):
        try:
            return get_route(origin, dest)
        except OSRMError:
            return _fallback_route(origin, dest)

    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as ex:
        return list(ex.map(_one, destinations))
