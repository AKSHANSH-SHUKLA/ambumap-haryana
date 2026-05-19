import React from "react";

const LEVEL_CLASS = { 1: "level-1", 2: "level-2", 3: "level-3" };

function ScoreBar({ value, max = 100 }) {
  if (value == null) return <span style={{ color: "var(--text-muted)" }}>—</span>;
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div style={{ flex: 1 }}>
      <div className="tpl-bar"><div style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

export default function HospitalDetails({ hospital, onClose }) {
  if (!hospital) return null;
  const p = hospital.properties;
  const lvlClass = LEVEL_CLASS[p.level] || "level-unknown";

  const br = p.tpl_breakdown || {};
  const fmt = (v) => v == null ? "—" : v.toFixed(1);

  // The three avg_* TPL scores (percentages 0-100) come back from the backend
  // attached to the feature properties — surface them all so the user can see
  // the full TPL picture, with the one matching this hospital's level highlighted.
  const allScores = p.all_tpl_scores || {};

  const LevelChip = ({ levelNum, label, fieldKey }) => {
    const v = allScores[fieldKey];
    const isActive = p.level === levelNum;
    return (
      <div
        style={{
          flex: 1,
          padding: "10px 8px",
          borderRadius: 8,
          border: `1px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
          background: isActive ? "#EFF6FF" : "var(--surface)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".06em",
                      color: isActive ? "var(--accent)" : "var(--text-muted)", fontWeight: 600 }}>
          {label}
        </div>
        <div style={{ fontSize: 20, fontWeight: 700,
                      color: isActive ? "var(--accent)" : "var(--text)",
                      marginTop: 4 }}>
          {v != null ? `${v.toFixed(1)}%` : "—"}
        </div>
      </div>
    );
  };

  return (
    <div className="detail-panel">
      <div className="detail-header">
        <div>
          <h4>{p.name}</h4>
          <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-muted)" }}>
            {p.district} · {p.hospital_type}
          </div>
        </div>
        <button className="close" onClick={onClose}>×</button>
      </div>

      <div className="detail-body">
        <div className="detail-row">
          <span className="key">Level</span>
          <span className="val">
            <span className={`level-badge ${lvlClass}`}>
              L{p.level || "?"} · {p.level_label}
            </span>
          </span>
        </div>

        <h3 style={{ marginTop: 18 }}>TPL preparedness (%)</h3>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <LevelChip levelNum={3} label="Primary"   fieldKey="avg_primary"   />
          <LevelChip levelNum={2} label="Secondary" fieldKey="avg_secondary" />
          <LevelChip levelNum={1} label="Tertiary"  fieldKey="avg_tertiary"  />
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>
          Highlighted card = the score used for this hospital's classification level.
        </div>

        <h3 style={{ marginTop: 18 }}>Score breakdown ({p.level_label?.toLowerCase()})</h3>

        <div className="detail-row">
          <span className="key" style={{ minWidth: 110 }}>Equipment</span>
          <ScoreBar value={br.equipment} />
          <span className="val" style={{ minWidth: 40, textAlign: "right" }}>{fmt(br.equipment)}</span>
        </div>
        <div className="detail-row">
          <span className="key" style={{ minWidth: 110 }}>Infrastructure</span>
          <ScoreBar value={br.infrastructure} />
          <span className="val" style={{ minWidth: 40, textAlign: "right" }}>{fmt(br.infrastructure)}</span>
        </div>
        <div className="detail-row">
          <span className="key" style={{ minWidth: 110 }}>Beds</span>
          <ScoreBar value={br.beds} />
          <span className="val" style={{ minWidth: 40, textAlign: "right" }}>{fmt(br.beds)}</span>
        </div>
        <div className="detail-row">
          <span className="key" style={{ minWidth: 110 }}>Services</span>
          <ScoreBar value={br.services} />
          <span className="val" style={{ minWidth: 40, textAlign: "right" }}>{fmt(br.services)}</span>
        </div>
      </div>
    </div>
  );
}

export function NearestRoutesPanel({ data, onSelectHospital, onClose }) {
  if (!data) return null;
  return (
    <div className="detail-panel">
      <div className="detail-header">
        <div>
          <h4>Ambulance #{data.ambulance.unique_id}</h4>
          <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-muted)" }}>
            {data.count} hospitals within {data.radius_km} km
          </div>
        </div>
        <button className="close" onClick={onClose}>×</button>
      </div>
      <div className="detail-body">
        {data.count === 0 && (
          <div style={{ color: "var(--text-muted)" }}>
            No hospitals found within {data.radius_km} km.
          </div>
        )}
        <div className="routes-list">
          {data.hospitals.map((h, idx) => (
            <div
              key={h.hospital_id}
              className={`route-card ${idx === 0 ? "nearest" : ""}`}
              onClick={() => onSelectHospital(h.hospital_id)}
            >
              <div className="title">
                {idx === 0 && "★ "}{h.name}
              </div>
              <div className="meta">
                <span>L{h.level || "?"} · {h.hospital_type}</span>
                <span>
                  TPL {h.tpl_score != null ? h.tpl_score.toFixed(1) + "%" : "—"}
                </span>
              </div>
              <div className="meta" style={{ marginTop: 4 }}>
                <span>🛣 {h.road_km.toFixed(2)} km</span>
                <span>⏱ {h.time_min.toFixed(1)} min</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
