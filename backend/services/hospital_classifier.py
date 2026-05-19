"""
Hospital level classification and TPL score selection.

Rules per project spec:
    Level 1 (Tertiary):  MCH, SSH                      -> show avg_tertiary
    Level 2 (Secondary): DCH, SDH, CHC                 -> show avg_secondary
    Level 3 (Primary):   PHC, UPHC, UHC                -> show avg_primary
    PRIVATE: always show tertiary TPL score (special rule)
"""

LEVEL_1_TYPES = {"MCH", "SSH"}
LEVEL_2_TYPES = {"DCH", "SDH", "CHC"}
LEVEL_3_TYPES = {"PHC", "UPHC", "UHC"}


def normalize_type(raw: str) -> str:
    """Strip whitespace and uppercase; map known variants."""
    if not raw:
        return ""
    t = str(raw).strip().upper()
    # Common typo variants observed in the data
    if t == "PRIVATE ":
        t = "PRIVATE"
    return t


def classify(hospital_type: str) -> dict:
    """
    Return:
        {
            "level": 1 | 2 | 3 | None,
            "level_label": "Tertiary" | "Secondary" | "Primary" | "Unknown",
            "tpl_field": "avg_tertiary" | "avg_secondary" | "avg_primary" | None,
            "is_private": bool
        }
    """
    t = normalize_type(hospital_type)

    if t == "PRIVATE":
        return {
            "level": 1,
            "level_label": "Tertiary (Private)",
            "tpl_field": "avg_tertiary",
            "is_private": True,
        }

    if t in LEVEL_1_TYPES:
        return {
            "level": 1,
            "level_label": "Tertiary",
            "tpl_field": "avg_tertiary",
            "is_private": False,
        }

    if t in LEVEL_2_TYPES:
        return {
            "level": 2,
            "level_label": "Secondary",
            "tpl_field": "avg_secondary",
            "is_private": False,
        }

    if t in LEVEL_3_TYPES:
        return {
            "level": 3,
            "level_label": "Primary",
            "tpl_field": "avg_primary",
            "is_private": False,
        }

    return {
        "level": None,
        "level_label": "Unknown",
        "tpl_field": None,
        "is_private": False,
    }


def get_displayed_tpl(hospital_record: dict) -> dict:
    """
    Given a hospital row (dict with hospital_type and tpl fields),
    return the appropriate TPL block to display in the UI.

    Returns:
        {
            "level": int,
            "level_label": str,
            "score": float or None,
            "breakdown": {
                "equipment": float, "infrastructure": float,
                "beds": float, "services": float
            }
        }
    """
    cls = classify(hospital_record.get("hospital_type"))
    level = cls["level"]

    if level is None:
        return {
            "level": None,
            "level_label": "Unknown",
            "score": None,
            "breakdown": None,
        }

    suffix = {1: "tertiary", 2: "secondary", 3: "primary"}[level]
    if cls["is_private"]:
        suffix = "tertiary"

    score = hospital_record.get(cls["tpl_field"])

    breakdown = {
        "equipment":      hospital_record.get(f"e_{suffix}"),
        "infrastructure": hospital_record.get(f"i_{suffix}"),
        "beds":           hospital_record.get(f"b_{suffix}"),
        "services":       hospital_record.get(f"s_{suffix}"),
    }

    return {
        "level": level,
        "level_label": cls["level_label"],
        "score": float(score) if score is not None else None,
        "breakdown": breakdown,
    }
