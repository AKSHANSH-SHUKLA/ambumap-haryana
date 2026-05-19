"""
Flask application — all API routes for AmbuMap Haryana.

Endpoints:
    GET  /api/health
    GET  /api/filters/options          - distinct filter values (state, district, day, time_period)
    GET  /api/districts                - GeoJSON of Haryana districts (boundary overlay)
    GET  /api/ambulances               - filtered ambulance list as GeoJSON
    GET  /api/ambulances/<id>          - single ambulance
    GET  /api/hospitals                - filtered hospital list as GeoJSON
    GET  /api/hospitals/<id>           - single hospital with TPL details
    GET  /api/nearest-hospitals?ambulance_id=X&radius_km=50
                                       - hospitals within radius + OSRM routes
    POST /api/upload/ambulances        - multipart .xlsx
    POST /api/upload/hospitals         - multipart .xlsx
"""

import json
import os
from io import BytesIO

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from services.osrm import get_route, get_routes_parallel, OSRMError
from services.excel_parser import (
    parse_ambulances, parse_hospitals, parse_tpl_aggregated, ExcelValidationError
)
from services.hospital_classifier import classify, get_displayed_tpl

load_dotenv()

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+psycopg2://ambumap:ambumap@localhost:5432/ambumap"
)
CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",")
# Render injects PORT; locally we use FLASK_PORT (default 5001)
FLASK_PORT = int(os.environ.get("PORT") or os.environ.get("FLASK_PORT", 5001))

# Render's DATABASE_URL starts with "postgres://" — SQLAlchemy needs "postgresql+psycopg2://"
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg2://", 1)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine)

app = Flask(__name__)
# In production, set CORS_ORIGINS to your Vercel URL (or "*" for any origin)
CORS(app, origins="*" if CORS_ORIGINS == ["*"] else CORS_ORIGINS)


# ───────────────────────────────────────────── helpers ──────────

def _geojson_feature_point(lon, lat, props):
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": props,
    }


def _ambulance_to_feature(row):
    props = {k: row[k] for k in row.keys() if k not in ("longitude", "latitude")}
    return _geojson_feature_point(row["longitude"], row["latitude"], props)


def _hospital_to_feature(row):
    hospital_dict = dict(row._mapping)
    tpl = get_displayed_tpl(hospital_dict)
    cls = classify(hospital_dict.get("hospital_type"))
    props = {
        "hospital_id": hospital_dict["hospital_id"],
        "name": hospital_dict["hospital_name"],
        "district": hospital_dict["district"],
        "hospital_type": hospital_dict["hospital_type"],
        "level": cls["level"],
        "level_label": cls["level_label"],
        "tpl_score": tpl["score"],
        "tpl_breakdown": tpl["breakdown"],
        # All three avg_* TPL percentages so the UI can show the full picture
        "all_tpl_scores": {
            "avg_primary":   hospital_dict.get("avg_primary"),
            "avg_secondary": hospital_dict.get("avg_secondary"),
            "avg_tertiary":  hospital_dict.get("avg_tertiary"),
        },
    }
    return _geojson_feature_point(
        hospital_dict["longitude"], hospital_dict["latitude"], props
    )


# ───────────────────────────────────────────── routes ──────────

@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/filters/options")
def filter_options():
    """
    Returns distinct values for every filter, split by data source so the FE
    can show only districts that actually have data for the active layer.
    """
    with engine.connect() as conn:
        states = [r[0] for r in conn.execute(
            text("SELECT DISTINCT state FROM ambulances WHERE state IS NOT NULL ORDER BY state")
        )]
        amb_districts = [r[0] for r in conn.execute(
            text("SELECT DISTINCT district FROM ambulances WHERE district IS NOT NULL ORDER BY district")
        )]
        # Filter out junk district codes (e.g., "022", "010") that crept in
        hosp_districts = [r[0] for r in conn.execute(
            text("""SELECT DISTINCT district FROM hospitals
                    WHERE district IS NOT NULL AND district !~ '^[0-9]+$'
                    ORDER BY district""")
        )]
        days = [r[0] for r in conn.execute(
            text("SELECT DISTINCT day FROM ambulances WHERE day IS NOT NULL ORDER BY day")
        )]
        time_periods = [r[0] for r in conn.execute(
            text("SELECT DISTINCT time_period FROM ambulances WHERE time_period IS NOT NULL ORDER BY time_period")
        )]

    return jsonify({
        "states": states,
        "districts": sorted(set(amb_districts) | set(hosp_districts)),  # backwards-compat
        "ambulance_districts": amb_districts,
        "hospital_districts": hosp_districts,
        "days": days,
        "time_periods": time_periods,
    })


@app.get("/api/districts")
def districts():
    state = request.args.get("state", "Haryana")
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT name, state, ST_AsGeoJSON(geom) AS geom FROM districts WHERE state = :state"),
            {"state": state}
        ).fetchall()

    features = [{
        "type": "Feature",
        "geometry": json.loads(r.geom),
        "properties": {"name": r.name, "state": r.state}
    } for r in rows]
    return jsonify({"type": "FeatureCollection", "features": features})


@app.get("/api/ambulances")
def list_ambulances():
    state = request.args.get("state")
    district = request.args.get("district")
    day = request.args.get("day")
    time_period = request.args.get("time_period")

    clauses, params = [], {}
    if state and state.lower() != "all":
        clauses.append("state ILIKE :state"); params["state"] = state
    if district and district.lower() != "all":
        clauses.append("district ILIKE :district"); params["district"] = district
    if day and day.lower() != "all":
        clauses.append("day = :day"); params["day"] = day
    if time_period and time_period.lower() != "all":
        clauses.append("time_period = :time_period"); params["time_period"] = time_period

    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    sql = f"""
        SELECT unique_id, day, time_period, country, state, district, city,
               postal_code, latitude, longitude, address
        FROM ambulances
        {where}
        ORDER BY unique_id
    """
    with engine.connect() as conn:
        rows = conn.execute(text(sql), params).fetchall()

    features = [_ambulance_to_feature(r._mapping) for r in rows]
    return jsonify({"type": "FeatureCollection", "features": features})


@app.get("/api/ambulances/<int:uid>")
def get_ambulance(uid):
    with engine.connect() as conn:
        row = conn.execute(
            text("""SELECT unique_id, day, time_period, country, state, district, city,
                           postal_code, latitude, longitude, address
                    FROM ambulances WHERE unique_id = :uid"""),
            {"uid": uid}
        ).fetchone()
    if not row:
        return {"error": "not found"}, 404
    return jsonify(_ambulance_to_feature(row._mapping))


@app.get("/api/hospitals")
def list_hospitals():
    state = request.args.get("state")
    district = request.args.get("district")

    clauses, params = [], {}
    if state and state.lower() != "all":
        clauses.append("state ILIKE :state"); params["state"] = state
    if district and district.lower() != "all":
        clauses.append("district ILIKE :district"); params["district"] = district

    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    sql = f"""
        SELECT hospital_id, record_id, state, district, hospital_name, pincode,
               hospital_type, latitude, longitude,
               e_primary, e_secondary, e_tertiary,
               i_primary, i_secondary, i_tertiary,
               b_primary, b_secondary, b_tertiary,
               s_primary, s_secondary, s_tertiary,
               avg_primary, avg_secondary, avg_tertiary
        FROM hospitals
        {where}
        ORDER BY hospital_id
    """
    with engine.connect() as conn:
        rows = conn.execute(text(sql), params).fetchall()

    features = [_hospital_to_feature(r) for r in rows]
    return jsonify({"type": "FeatureCollection", "features": features})


@app.get("/api/hospitals/<int:hid>")
def get_hospital(hid):
    with engine.connect() as conn:
        row = conn.execute(
            text("""SELECT hospital_id, record_id, state, district, hospital_name, pincode,
                           hospital_type, latitude, longitude,
                           e_primary, e_secondary, e_tertiary,
                           i_primary, i_secondary, i_tertiary,
                           b_primary, b_secondary, b_tertiary,
                           s_primary, s_secondary, s_tertiary,
                           avg_primary, avg_secondary, avg_tertiary
                    FROM hospitals WHERE hospital_id = :hid"""),
            {"hid": hid}
        ).fetchone()
    if not row:
        return {"error": "not found"}, 404
    return jsonify(_hospital_to_feature(row))


@app.get("/api/nearest-hospitals")
def nearest_hospitals():
    """
    For a given ambulance:
      1. Find all hospitals within `radius_km` (default 50) via PostGIS great-circle.
      2. For each, compute OSRM road route + distance + time @ 60 km/h.
      3. Return ranked list (nearest first by road distance).
    """
    amb_id = request.args.get("ambulance_id", type=int)
    radius_km = request.args.get("radius_km", default=50, type=float)

    if not amb_id:
        return {"error": "ambulance_id is required"}, 400

    with engine.connect() as conn:
        amb = conn.execute(
            text("SELECT unique_id, latitude, longitude FROM ambulances WHERE unique_id = :u"),
            {"u": amb_id}
        ).fetchone()
        if not amb:
            return {"error": f"ambulance {amb_id} not found"}, 404

        # PostGIS radius query — Haversine via geography type
        rows = conn.execute(
            text("""
                SELECT hospital_id, hospital_name, district, hospital_type,
                       latitude, longitude,
                       avg_primary, avg_secondary, avg_tertiary,
                       e_primary, e_secondary, e_tertiary,
                       i_primary, i_secondary, i_tertiary,
                       b_primary, b_secondary, b_tertiary,
                       s_primary, s_secondary, s_tertiary,
                       ST_Distance(
                           geom,
                           ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography
                       ) / 1000.0 AS straight_km
                FROM hospitals
                WHERE ST_DWithin(
                    geom,
                    ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
                    :radius_m
                )
                ORDER BY straight_km
            """),
            {"lat": amb.latitude, "lon": amb.longitude, "radius_m": radius_km * 1000}
        ).fetchall()

    origin = (amb.latitude, amb.longitude)

    # Fetch all OSRM routes in parallel — this is the speed fix.
    # Without it, 20-30 hospitals = 20-30 sequential HTTP calls = 10-30s.
    # With it: ~2-4s total.
    destinations = [(h.latitude, h.longitude) for h in rows]
    routes = get_routes_parallel(origin, destinations, max_workers=8)

    results = []
    for h, route in zip(rows, routes):
        h_dict = dict(h._mapping)
        tpl = get_displayed_tpl(h_dict)
        cls = classify(h_dict["hospital_type"])

        results.append({
            "hospital_id": h.hospital_id,
            "name": h.hospital_name,
            "district": h.district,
            "hospital_type": h.hospital_type,
            "level": cls["level"],
            "level_label": cls["level_label"],
            "tpl_score": tpl["score"],            # the % score for this hospital's level
            "tpl_breakdown": tpl["breakdown"],
            "all_tpl_scores": {
                "avg_primary":   h_dict.get("avg_primary"),
                "avg_secondary": h_dict.get("avg_secondary"),
                "avg_tertiary":  h_dict.get("avg_tertiary"),
            },
            "latitude": float(h.latitude),
            "longitude": float(h.longitude),
            "straight_km": round(float(h.straight_km), 3),
            "road_km": route["distance_km"],
            "time_min": route["time_min"],
            "geometry": route["geometry"],
        })

    # Re-rank by road distance (OSRM order may differ from haversine)
    results.sort(key=lambda r: r["road_km"])

    return jsonify({
        "ambulance": {
            "unique_id": amb.unique_id,
            "latitude": float(amb.latitude),
            "longitude": float(amb.longitude),
        },
        "radius_km": radius_km,
        "count": len(results),
        "hospitals": results,
    })


@app.post("/api/upload/ambulances")
def upload_ambulances():
    if "file" not in request.files:
        return {"error": "no file uploaded"}, 400
    file = request.files["file"]
    try:
        records = parse_ambulances(BytesIO(file.read()))
    except ExcelValidationError as e:
        return {"error": str(e)}, 400

    with engine.begin() as conn:
        for r in records:
            conn.execute(
                text("""
                    INSERT INTO ambulances (
                        unique_id, day, time_period, country, state, district, city,
                        postal_code, latitude, longitude, address, geom
                    ) VALUES (
                        :unique_id, :day, :time_period, :country, :state, :district, :city,
                        :postal_code, :latitude, :longitude, :address,
                        ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)::geography
                    )
                    ON CONFLICT (unique_id) DO UPDATE SET
                        day = EXCLUDED.day,
                        time_period = EXCLUDED.time_period,
                        latitude = EXCLUDED.latitude,
                        longitude = EXCLUDED.longitude,
                        address = EXCLUDED.address,
                        geom = EXCLUDED.geom
                """),
                r
            )

    return jsonify({"inserted_or_updated": len(records)})


@app.post("/api/upload/hospitals")
def upload_hospitals():
    if "file" not in request.files:
        return {"error": "no file uploaded"}, 400
    file = request.files["file"]
    raw = file.read()
    try:
        hospitals = parse_hospitals(BytesIO(raw))
        tpl_agg = parse_tpl_aggregated(BytesIO(raw))
    except ExcelValidationError as e:
        return {"error": str(e)}, 400

    # Merge TPL averages into hospital records (by hospital_id)
    for h in hospitals:
        agg = tpl_agg.get(h["hospital_id"], {})
        for col, val in agg.items():
            # Only fill missing — preserve explicit values from Hospitals sheet
            if h.get(col) in (None, "") and val is not None:
                h[col] = val

    with engine.begin() as conn:
        for h in hospitals:
            conn.execute(
                text("""
                    INSERT INTO hospitals (
                        hospital_id, record_id, state, district, hospital_name, pincode,
                        hospital_type, latitude, longitude,
                        e_primary, e_secondary, e_tertiary,
                        i_primary, i_secondary, i_tertiary,
                        b_primary, b_secondary, b_tertiary,
                        s_primary, s_secondary, s_tertiary,
                        avg_primary, avg_secondary, avg_tertiary,
                        geom
                    ) VALUES (
                        :hospital_id, :record_id, :state, :district, :hospital_name, :pincode,
                        :hospital_type, :latitude, :longitude,
                        :e_primary, :e_secondary, :e_tertiary,
                        :i_primary, :i_secondary, :i_tertiary,
                        :b_primary, :b_secondary, :b_tertiary,
                        :s_primary, :s_secondary, :s_tertiary,
                        :avg_primary, :avg_secondary, :avg_tertiary,
                        ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)::geography
                    )
                    ON CONFLICT (hospital_id) DO UPDATE SET
                        hospital_name = EXCLUDED.hospital_name,
                        hospital_type = EXCLUDED.hospital_type,
                        latitude = EXCLUDED.latitude,
                        longitude = EXCLUDED.longitude,
                        avg_primary = EXCLUDED.avg_primary,
                        avg_secondary = EXCLUDED.avg_secondary,
                        avg_tertiary = EXCLUDED.avg_tertiary,
                        geom = EXCLUDED.geom
                """),
                {
                    **h,
                    "avg_primary": h.get("avg_primary"),
                    "avg_secondary": h.get("avg_secondary"),
                    "avg_tertiary": h.get("avg_tertiary"),
                }
            )

    return jsonify({"inserted_or_updated": len(hospitals)})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=FLASK_PORT, debug=True)
