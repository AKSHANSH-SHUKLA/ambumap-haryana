"""Excel parsers for the Haryana ambulance and hospital uploads."""

import pandas as pd


AMBULANCE_REQUIRED_COLS = {
    "Uniqueid", "Day", "Timeperiod", "Country", "State", "District",
    "City", "Postal Code", "Latitude", "Longitude", "Address"
}

HOSPITAL_REQUIRED_COLS = {
    "Hospital ID", "State", "District", "Hospital Name",
    "Hospital Type", "GPS Location"
}

HOSPITAL_TPL_COLS = [
    "e_primary", "e_secondary", "e_tertiary",
    "i_primary", "i_secondary", "i_tertiary",
    "b_primary", "b_secondary", "b_tertiary",
    "s_primary", "s_secondary", "s_tertiary"
]


class ExcelValidationError(Exception):
    pass


def parse_ambulances(file_path_or_stream) -> list[dict]:
    df = pd.read_excel(file_path_or_stream)
    missing = AMBULANCE_REQUIRED_COLS - set(df.columns)
    if missing:
        raise ExcelValidationError(f"Missing required columns: {missing}")

    records = []
    for _, row in df.iterrows():
        try:
            lat = float(row["Latitude"])
            lon = float(row["Longitude"])
        except (TypeError, ValueError):
            continue  # skip rows with bad coordinates

        records.append({
            "unique_id": int(row["Uniqueid"]),
            "day": str(row["Day"]).strip() if pd.notna(row["Day"]) else None,
            "time_period": str(row["Timeperiod"]).strip() if pd.notna(row["Timeperiod"]) else None,
            "country": str(row["Country"]).strip() if pd.notna(row["Country"]) else None,
            "state": str(row["State"]).strip() if pd.notna(row["State"]) else None,
            "district": str(row["District"]).strip() if pd.notna(row["District"]) else None,
            "city": str(row["City"]).strip() if pd.notna(row["City"]) else None,
            "postal_code": str(row["Postal Code"]).strip() if pd.notna(row["Postal Code"]) else None,
            "latitude": lat,
            "longitude": lon,
            "address": str(row["Address"]).strip() if pd.notna(row["Address"]) else None,
        })
    return records


def _parse_gps(gps_str):
    """Hospital sheet stores GPS as 'lat , lon' strings. Parse → (lat, lon) or (None, None)."""
    if not gps_str or not isinstance(gps_str, str):
        return None, None
    parts = [p.strip() for p in gps_str.split(",")]
    if len(parts) != 2:
        return None, None
    try:
        return float(parts[0]), float(parts[1])
    except (TypeError, ValueError):
        return None, None


def parse_hospitals(file_path_or_stream) -> list[dict]:
    """Reads the 'Hospitals' sheet of the uploaded hospital workbook."""
    df = pd.read_excel(file_path_or_stream, sheet_name="Hospitals")
    missing = HOSPITAL_REQUIRED_COLS - set(df.columns)
    if missing:
        raise ExcelValidationError(f"Missing required columns in Hospitals sheet: {missing}")

    records = []
    for _, row in df.iterrows():
        lat, lon = _parse_gps(row.get("GPS Location"))
        if lat is None or lon is None:
            continue

        rec = {
            "hospital_id": int(row["Hospital ID"]),
            "record_id": int(row["Record ID"]) if pd.notna(row.get("Record ID")) else None,
            "state": str(row["State"]).strip() if pd.notna(row["State"]) else None,
            "district": str(row["District"]).strip() if pd.notna(row["District"]) else None,
            "hospital_name": str(row["Hospital Name"]).strip() if pd.notna(row["Hospital Name"]) else None,
            "pincode": str(row["Pincode"]).strip() if pd.notna(row.get("Pincode")) else None,
            "hospital_type": str(row["Hospital Type"]).strip() if pd.notna(row["Hospital Type"]) else None,
            "latitude": lat,
            "longitude": lon,
        }

        # Average the TPL fields for this hospital from the TPL sheet
        # (here we just carry through what's in Hospitals sheet; seed.py joins TPL averages)
        for col in HOSPITAL_TPL_COLS:
            val = row.get(col)
            try:
                rec[col] = float(val) if pd.notna(val) else None
            except (TypeError, ValueError):
                rec[col] = None

        records.append(rec)
    return records


def parse_tpl_aggregated(file_path_or_stream) -> dict[int, dict]:
    """
    Reads the 'TPL' sheet and aggregates by hospId (averaging if multiple submissions).
    Returns: { hospId: { avg_primary, avg_secondary, avg_tertiary, ...sub-scores } }
    """
    df = pd.read_excel(file_path_or_stream, sheet_name="TPL")
    df = df.dropna(subset=["hospId"])

    score_cols = [c for c in df.columns if c.startswith(("avg_", "e_", "i_", "b_", "s_"))]
    grouped = df.groupby("hospId")[score_cols].mean(numeric_only=True).round(3)
    return grouped.to_dict(orient="index")
