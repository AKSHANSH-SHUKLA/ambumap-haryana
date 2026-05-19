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
      <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.8 }}>
        <div><span style={{ display: "inline-block", width: 10, height: 10, background: "#DC2626", borderRadius: "50%", marginRight: 8 }}/>Ambulance</div>
        <div><span style={{ display: "inline-block", width: 10, height: 10, background: "#2563EB", borderRadius: "50%", marginRight: 8 }}/>Hospital</div>
        <div><span style={{ display: "inline-block", width: 18, height: 5, background: "#14532D", marginRight: 6, verticalAlign: "middle" }}/>Nearest route</div>
        <div><span style={{ display: "inline-block", width: 16, height: 2, background: "#2563EB", marginRight: 6, verticalAlign: "middle" }}/>Other routes within 50 km</div>
      </div>
    </aside>
  );
}
