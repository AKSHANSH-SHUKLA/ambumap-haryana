import React from "react";

export default function Sidebar({
  filterOptions, filters, onChange, onClear, count, activeLayer, onLayerChange,
}) {
  const {
    states = [],
    districts = [],
    ambulance_districts = [],
    hospital_districts = [],
    days = [],
    time_periods = [],
  } = filterOptions || {};

  // Show only districts that have data for the currently-active layer.
  // Falls back to the union list if the layer-specific lists aren't available.
  const districtsForLayer =
    activeLayer === "hospitals"
      ? (hospital_districts.length ? hospital_districts : districts)
      : (ambulance_districts.length ? ambulance_districts : districts);

  const layerNoun = activeLayer === "hospitals" ? "hospitals" : "ambulances";

  return (
    <aside className="sidebar">
      <h3>Filters</h3>

      <div className="filter-group">
        <label className="filter-label">State</label>
        <select
          className="filter-select"
          value={filters.state || "All"}
          onChange={(e) => onChange("state", e.target.value)}
        >
          <option value="All">All States</option>
          {states.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="filter-group">
        <label className="filter-label">
          District{" "}
          <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: 11 }}>
            ({districtsForLayer.length} with {layerNoun} data)
          </span>
        </label>
        <select
          className="filter-select"
          value={filters.district || "All"}
          onChange={(e) => onChange("district", e.target.value)}
        >
          <option value="All">All Districts</option>
          {districtsForLayer.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      <div className="filter-group">
        <label className="filter-label">Day</label>
        <select
          className="filter-select"
          value={filters.day || "All"}
          onChange={(e) => onChange("day", e.target.value)}
        >
          <option value="All">All Days</option>
          {days.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      <div className="filter-group">
        <label className="filter-label">Time Period</label>
        <select
          className="filter-select"
          value={filters.time_period || "All"}
          onChange={(e) => onChange("time_period", e.target.value)}
        >
          <option value="All">All Times</option>
          {time_periods.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <button className="btn btn-secondary" onClick={onClear}>Clear filters</button>

      <div className="count-badge">
        <span className="count-num">{count}</span> {layerNoun} visible
      </div>

      <h3>Layers</h3>
      <div className="layer-tabs">
        <button
          className={`layer-tab ${activeLayer === "ambulances" ? "active" : ""}`}
          onClick={() => onLayerChange("ambulances")}
        >
          Ambulances
        </button>
        <button
          className={`layer-tab ${activeLayer === "hospitals" ? "active" : ""}`}
          onClick={() => onLayerChange("hospitals")}
        >
          Hospitals
        </button>
      </div>

      <h3>Legend</h3>
      <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.9 }}>
        <div>
          <span style={{ display: "inline-block", width: 12, height: 12, background: "#DC2626",
                         borderRadius: "50%", marginRight: 8, verticalAlign: "middle" }}/>
          Ambulance
        </div>
        <div style={{ marginTop: 4, fontWeight: 600, color: "var(--text)" }}>Hospital icons</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="20" height="20" viewBox="0 0 32 32">
            <path d="M16 1 L29 5 V16 C29 24 22 30 16 31 C10 30 3 24 3 16 V5 Z"
                  fill="#DC2626" stroke="#fff" strokeWidth="2"/>
            <path d="M16 12v8H12v-8H4v-4h8V0h4v8h8v4z" fill="#fff"
                  transform="translate(2,2) scale(0.8)"/>
          </svg>
          <span><strong>L1</strong> Tertiary (MCH, SSH, Private)</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="20" height="20" viewBox="0 0 32 32">
            <rect x="3" y="3" width="26" height="26" rx="3"
                  fill="#F59E0B" stroke="#fff" strokeWidth="2"/>
            <path d="M16 12v8H12v-8H4v-4h8V0h4v8h8v4z" fill="#fff"
                  transform="translate(2,2) scale(0.8)"/>
          </svg>
          <span><strong>L2</strong> Secondary (DCH, SDH, CHC)</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="20" height="20" viewBox="0 0 32 32">
            <circle cx="16" cy="16" r="13" fill="#2563EB" stroke="#fff" strokeWidth="2"/>
            <path d="M16 12v8H12v-8H4v-4h8V0h4v8h8v4z" fill="#fff"
                  transform="translate(2,2) scale(0.8)"/>
          </svg>
          <span><strong>L3</strong> Primary (PHC, UPHC, UHC)</span>
        </div>
        <div style={{ marginTop: 6, fontWeight: 600, color: "var(--text)" }}>Routing</div>
        <div>
          <svg width="22" height="6" style={{ marginRight: 6, verticalAlign: "middle" }}>
            <line x1="0" y1="3" x2="22" y2="3" stroke="#DC2626" strokeWidth="2" strokeDasharray="3,2"/>
          </svg>
          50 km radius
        </div>
        <div>
          <svg width="22" height="6" style={{ marginRight: 6, verticalAlign: "middle" }}>
            <line x1="0" y1="3" x2="22" y2="3" stroke="#DC2626" strokeWidth="4"/>
          </svg>
          Route to L1 hospital
        </div>
        <div>
          <svg width="22" height="6" style={{ marginRight: 6, verticalAlign: "middle" }}>
            <line x1="0" y1="3" x2="22" y2="3" stroke="#F59E0B" strokeWidth="4"/>
          </svg>
          Route to L2 hospital
        </div>
        <div>
          <svg width="22" height="6" style={{ marginRight: 6, verticalAlign: "middle" }}>
            <line x1="0" y1="3" x2="22" y2="3" stroke="#2563EB" strokeWidth="4"/>
          </svg>
          Route to L3 hospital
        </div>
        <div style={{ marginTop: 4, fontSize: 11, fontStyle: "italic" }}>
          Recommended route is shown with a thicker line and white dashed halo.
        </div>
      </div>
    </aside>
  );
}
