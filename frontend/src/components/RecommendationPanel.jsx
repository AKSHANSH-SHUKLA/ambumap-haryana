import React from "react";

const LEVEL_COLOR = { 1: "#DC2626", 2: "#F59E0B", 3: "#2563EB" };
const LEVEL_BG    = { 1: "#FEE2E2", 2: "#FEF3C7", 3: "#DBEAFE" };
const LEVEL_TEXT  = { 1: "#B91C1C", 2: "#B45309", 3: "#1E40AF" };

const MODE_STYLE = {
  DIRECT:           { bg: "#DCFCE7", color: "#166534", label: "DIRECT ROUTE", icon: "→" },
  CHAIN:            { bg: "#FEF3C7", color: "#92400E", label: "STABILIZE THEN TRANSFER", icon: "⇒" },
  DIRECT_WARNING:   { bg: "#FEE2E2", color: "#B91C1C", label: "DIRECT — OUTSIDE SAFE WINDOW", icon: "!" },
  FALLBACK_DIRECT:  { bg: "#FEE2E2", color: "#B91C1C", label: "FALLBACK — NO REQUIRED LEVEL IN RANGE", icon: "!" },
  NONE:             { bg: "#F3F4F6", color: "#374151", label: "NO HOSPITAL IN RANGE", icon: "✕" },
};

function HospitalCard({ h, role, isHighlighted }) {
  if (!h) {
    return (
      <div className="route-card" style={{ opacity: 0.5 }}>
        <div className="title" style={{ color: "#6B7280" }}>— No Level {role} hospital within 50 km —</div>
      </div>
    );
  }
  const lvl = h.level;
  const lvlColor = LEVEL_COLOR[lvl] || "#6B7280";

  return (
    <div
      className="route-card"
      style={{
        borderColor: isHighlighted ? lvlColor : "var(--border)",
        borderWidth: isHighlighted ? 2 : 1,
        background: isHighlighted ? LEVEL_BG[lvl] : "#F9FAFB",
        boxShadow: isHighlighted ? `0 0 0 2px ${lvlColor}33` : "none",
      }}
    >
      <div className="title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span
          style={{
            display: "inline-block",
            background: lvlColor, color: "#fff", borderRadius: 4,
            padding: "1px 6px", fontSize: 10, fontWeight: 700,
          }}
        >
          L{lvl}
        </span>
        {isHighlighted && <span style={{ color: lvlColor, fontWeight: 700 }}>★</span>}
        {h.name}
      </div>
      <div className="meta">
        <span>{h.hospital_type}</span>
        <span>TPL {h.tpl_score != null ? h.tpl_score.toFixed(1) + "%" : "—"}</span>
      </div>
      <div className="meta" style={{ marginTop: 4 }}>
        <span>🛣 {h.road_km.toFixed(2)} km</span>
        <span>⏱ {h.time_min.toFixed(1)} min</span>
      </div>
    </div>
  );
}

export default function RecommendationPanel({ data, onClose, onPickInjury, injuryOptions, selectedInjury }) {
  if (!data) return null;
  const r = data.recommendation;
  const mode = r?.mode || "NONE";
  const style = MODE_STYLE[mode] || MODE_STYLE.NONE;

  // Determine which hospital cards to highlight
  const highlightIds = new Set();
  if (r?.primary) highlightIds.add(r.primary.hospital_id);
  if (r?.stabilize_at) highlightIds.add(r.stabilize_at.hospital_id);
  if (r?.transfer_to) highlightIds.add(r.transfer_to.hospital_id);

  return (
    <div className="detail-panel" style={{ width: 420 }}>
      <div className="detail-header">
        <div>
          <h4>Ambulance #{data.ambulance.unique_id}</h4>
          <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-muted)" }}>
            Smart routing within {data.radius_km} km
          </div>
        </div>
        <button className="close" onClick={onClose}>×</button>
      </div>

      <div className="detail-body">
        {/* Injury picker */}
        <h3 style={{ marginTop: 0 }}>Patient injury</h3>
        <select
          className="filter-select"
          value={selectedInjury || ""}
          onChange={(e) => onPickInjury(e.target.value)}
        >
          <option value="" disabled>— Select injury severity —</option>
          {injuryOptions.map((opt) => (
            <option key={opt.key} value={opt.key}>
              {opt.label}  →  L{opt.required_level} ({opt.safe_window_min}-min window)
            </option>
          ))}
        </select>

        {/* Recommendation banner */}
        {r && (
          <div
            style={{
              marginTop: 14, padding: 12, borderRadius: 8,
              background: style.bg, color: style.color,
              fontSize: 13, fontWeight: 600,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, marginBottom: 6 }}>
              <span style={{
                background: style.color, color: "#fff",
                width: 18, height: 18, borderRadius: 9,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 700,
              }}>{style.icon}</span>
              {style.label}
            </div>
            <div style={{ fontWeight: 500, fontSize: 12, lineHeight: 1.45, color: style.color }}>
              {r.reasoning}
            </div>
          </div>
        )}

        {/* Chain visualisation */}
        {mode === "CHAIN" && r.stabilize_at && r.transfer_to && (
          <div style={{ marginTop: 14, padding: 10, background: "#FFFBEB",
                        borderRadius: 8, border: "1px dashed #F59E0B" }}>
            <div style={{ fontSize: 11, color: "#92400E", fontWeight: 700,
                          marginBottom: 6, textTransform: "uppercase", letterSpacing: ".06em" }}>
              Two-stage transport
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
              <span style={{ fontWeight: 700 }}>1. Stabilize</span>
              <span style={{ color: "#92400E" }}>→ {r.stabilize_at.name} (L{r.stabilize_at.level}, {r.stabilize_at.time_min.toFixed(1)} min)</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginTop: 4 }}>
              <span style={{ fontWeight: 700 }}>2. Transfer</span>
              <span style={{ color: "#92400E" }}>→ {r.transfer_to.name} (L{r.transfer_to.level}, {r.transfer_to.time_min.toFixed(1)} min)</span>
            </div>
          </div>
        )}

        {/* All 3 level-best cards (always shown) */}
        <h3 style={{ marginTop: 18 }}>Top hospital per level</h3>
        <div className="routes-list">
          <HospitalCard h={data.by_level.L1} role="1" isHighlighted={data.by_level.L1 && highlightIds.has(data.by_level.L1.hospital_id)} />
          <HospitalCard h={data.by_level.L2} role="2" isHighlighted={data.by_level.L2 && highlightIds.has(data.by_level.L2.hospital_id)} />
          <HospitalCard h={data.by_level.L3} role="3" isHighlighted={data.by_level.L3 && highlightIds.has(data.by_level.L3.hospital_id)} />
        </div>
      </div>
    </div>
  );
}
