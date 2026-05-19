"""
One-shot DB initialization and data seeding.

Run:
    python seed.py                  # full reset + seed all
    python seed.py --districts-only # only reload districts GeoJSON
"""

import argparse
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

from services.excel_parser import parse_ambulances, parse_hospitals, parse_tpl_aggregated

load_dotenv()

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+psycopg2://ambumap:ambumap@localhost:5432/ambumap"
)
DATA_DIR = Path(__file__).parent / "data"
AMBULANCES_XLSX = DATA_DIR / "ambulances_haryana.xlsx"
HOSPITALS_XLSX = DATA_DIR / "hospitals_haryana.xlsx"
DISTRICTS_GEOJSON = DATA_DIR / "haryana_districts.geojson"


SCHEMA_SQL = """
CREATE EXTENSION IF NOT EXISTS postgis;

DROP TABLE IF EXISTS ambulances CASCADE;
CREATE TABLE ambulances (
    unique_id    INTEGER PRIMARY KEY,
    day          VARCHAR(8),
    time_period  VARCHAR(32),
    country      VARCHAR(64),
    state        VARCHAR(64),
    district     VARCHAR(64),
    city         VARCHAR(128),
    postal_code  VARCHAR(16),
    latitude     DOUBLE PRECISION NOT NULL,
    longitude    DOUBLE PRECISION NOT NULL,
    address      TEXT,
    geom         GEOGRAPHY(Point, 4326),
    created_at   TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_amb_geom ON ambulances USING GIST (geom);
CREATE INDEX idx_amb_district ON ambulances (district);
CREATE INDEX idx_amb_day_time ON ambulances (day, time_period);

DROP TABLE IF EXISTS hospitals CASCADE;
CREATE TABLE hospitals (
    hospital_id    INTEGER PRIMARY KEY,
    record_id      INTEGER,
    state          VARCHAR(64),
    district       VARCHAR(64),
    hospital_name  VARCHAR(256),
    pincode        VARCHAR(16),
    hospital_type  VARCHAR(32),
    latitude       DOUBLE PRECISION NOT NULL,
    longitude      DOUBLE PRECISION NOT NULL,
    e_primary      DOUBLE PRECISION,
    e_secondary    DOUBLE PRECISION,
    e_tertiary     DOUBLE PRECISION,
    i_primary      DOUBLE PRECISION,
    i_secondary    DOUBLE PRECISION,
    i_tertiary     DOUBLE PRECISION,
    b_primary      DOUBLE PRECISION,
    b_secondary    DOUBLE PRECISION,
    b_tertiary     DOUBLE PRECISION,
    s_primary      DOUBLE PRECISION,
    s_secondary    DOUBLE PRECISION,
    s_tertiary     DOUBLE PRECISION,
    avg_primary    DOUBLE PRECISION,
    avg_secondary  DOUBLE PRECISION,
    avg_tertiary   DOUBLE PRECISION,
    geom           GEOGRAPHY(Point, 4326),
    created_at     TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_hosp_geom ON hospitals USING GIST (geom);
CREATE INDEX idx_hosp_district ON hospitals (district);
CREATE INDEX idx_hosp_type ON hospitals (hospital_type);

DROP TABLE IF EXISTS districts CASCADE;
CREATE TABLE districts (
    id     SERIAL PRIMARY KEY,
    name   VARCHAR(64) NOT NULL,
    state  VARCHAR(64) NOT NULL,
    geom   GEOMETRY(MultiPolygon, 4326) NOT NULL
);
CREATE INDEX idx_dist_geom ON districts USING GIST (geom);
"""


def init_schema(engine):
    with engine.begin() as conn:
        for stmt in SCHEMA_SQL.split(";"):
            s = stmt.strip()
            if s:
                conn.execute(text(s))
    print("✓ Schema initialised")


def seed_ambulances(engine):
    if not AMBULANCES_XLSX.exists():
        print(f"⚠ {AMBULANCES_XLSX} not found, skipping ambulances")
        return
    records = parse_ambulances(AMBULANCES_XLSX)
    # Dedup by unique_id
    by_id = {r["unique_id"]: r for r in records}
    deduped = list(by_id.values())
    with engine.begin() as conn:
        for r in deduped:
            conn.execute(text("""
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
                    geom = EXCLUDED.geom
            """), r)
    print(f"✓ Seeded {len(deduped)} ambulances")


def seed_hospitals(engine):
    if not HOSPITALS_XLSX.exists():
        print(f"⚠ {HOSPITALS_XLSX} not found, skipping hospitals")
        return
    hospitals = parse_hospitals(HOSPITALS_XLSX)
    tpl_agg = parse_tpl_aggregated(HOSPITALS_XLSX)

    # Merge TPL averages into each hospital record
    for h in hospitals:
        agg = tpl_agg.get(h["hospital_id"], {})
        for col, val in agg.items():
            if h.get(col) in (None, "") and val is not None:
                h[col] = val
        # Ensure the avg_ keys exist even if absent in either source
        for k in ("avg_primary", "avg_secondary", "avg_tertiary"):
            h.setdefault(k, None)

    # Deduplicate by hospital_id — Hospitals sheet sometimes has multiple
    # rows for the same facility (different audit submissions). Keep the last.
    by_id = {}
    for h in hospitals:
        by_id[h["hospital_id"]] = h
    deduped = list(by_id.values())
    dropped = len(hospitals) - len(deduped)

    with engine.begin() as conn:
        for h in deduped:
            conn.execute(text("""
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
            """), h)
    msg = f"✓ Seeded {len(deduped)} hospitals"
    if dropped:
        msg += f" ({dropped} duplicate rows merged)"
    print(msg)


def _load_geojson_features(path: Path):
    """
    Robust loader: accepts standard FeatureCollection JSON,
    NDJSON (one Feature per line), or a single Feature object.
    Strips UTF-8 BOM if present.
    """
    with open(path, "rb") as f:
        raw = f.read()
    # Strip BOM
    if raw[:3] == b"\xef\xbb\xbf":
        raw = raw[3:]
    text_data = raw.decode("utf-8").strip()

    # Try standard JSON first
    try:
        obj = json.loads(text_data)
        if obj.get("type") == "FeatureCollection":
            return obj["features"]
        if obj.get("type") == "Feature":
            return [obj]
    except json.JSONDecodeError:
        pass

    # Fall back to NDJSON (one Feature per line)
    features = []
    for line_num, line in enumerate(text_data.splitlines(), 1):
        line = line.strip().rstrip(",")  # trailing commas tolerated
        if not line:
            continue
        try:
            feat = json.loads(line)
        except json.JSONDecodeError as e:
            raise ValueError(f"Could not parse GeoJSON at line {line_num}: {e}")
        if feat.get("type") == "Feature":
            features.append(feat)
        elif feat.get("type") == "FeatureCollection":
            features.extend(feat["features"])
    if not features:
        raise ValueError("No Features found in GeoJSON file")
    return features


def seed_districts(engine):
    if not DISTRICTS_GEOJSON.exists():
        print(f"⚠ {DISTRICTS_GEOJSON} not found.")
        print("   Download with:")
        print("   curl -L -o backend/data/haryana_districts.geojson \\")
        print("     https://raw.githubusercontent.com/datameet/maps/master/States/Haryana/Haryana_District.geojson")
        print("   (or supply your own Survey of India shapefile, converted to GeoJSON)")
        return

    try:
        features = _load_geojson_features(DISTRICTS_GEOJSON)
    except (ValueError, json.JSONDecodeError) as e:
        print(f"⚠ Could not parse {DISTRICTS_GEOJSON}: {e}")
        print("   Skipping district outlines — app will still work without them.")
        print("   See README for alternative download sources.")
        return

    with engine.begin() as conn:
        conn.execute(text("DELETE FROM districts WHERE state = 'Haryana'"))
        inserted = 0
        for feat in features:
            geom = feat.get("geometry")
            if not geom:
                continue
            props = feat.get("properties", {})
            name = (props.get("DISTRICT") or props.get("district") or
                    props.get("NAME_2") or props.get("name") or
                    props.get("DIST_NAME") or props.get("dtname") or "Unknown")
            geom_json = json.dumps(geom)
            try:
                conn.execute(text("""
                    INSERT INTO districts (name, state, geom)
                    VALUES (:name, 'Haryana',
                            ST_Multi(ST_GeomFromGeoJSON(:geom)))
                """), {"name": name, "geom": geom_json})
                inserted += 1
            except Exception as e:
                print(f"  ⚠ skipped feature '{name}': {e}")
    print(f"✓ Seeded {inserted} district polygons")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--districts-only", action="store_true")
    args = parser.parse_args()

    engine = create_engine(DATABASE_URL, pool_pre_ping=True)

    if args.districts_only:
        seed_districts(engine)
        return

    init_schema(engine)
    seed_districts(engine)
    seed_ambulances(engine)
    seed_hospitals(engine)
    print("\nAll done.")


if __name__ == "__main__":
    main()
