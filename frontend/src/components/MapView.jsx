import React, { useEffect, useMemo } from "react";
import {
  MapContainer, TileLayer, GeoJSON, CircleMarker, Marker, Circle,
  Popup, Polyline, useMap,
} from "react-leaflet";
import L from "leaflet";

const HARYANA_CENTER = [29.0588, 76.0856];
const HARYANA_ZOOM = 7;

// ───────────────────── Hospital icons by level ─────────────────────────────
// L1 (Tertiary) — Red shield with white cross. Most prominent visual.
// L2 (Secondary) — Amber square with white cross. Mid-tier.
// L3 (Primary)  — Blue circle with white cross. Calm, community-level.
//
// All built as inline-SVG divIcons so no asset bundling is needed.

const CROSS_SVG = `<path d="M14 10v8H10v-8H2v-4h8V-2h4v8h8v4z" fill="#fff" transform="translate(2,2)"/>`;

function hospitalIcon(level, isHighlighted = false) {
  const size = isHighlighted ? 36 : 28;
  const half = size / 2;
  const haloAttrs = isHighlighted
    ? `stroke="#fff" stroke-width="3" filter="drop-shadow(0 0 4px rgba(0,0,0,.35))"`
    : `stroke="#fff" stroke-width="2" filter="drop-shadow(0 1px 2px rgba(0,0,0,.25))"`;

  let svg;
  if (level === 1) {
    // Red shield
    svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}">
      <path d="M16 1 L29 5 V16 C29 24 22 30 16 31 C10 30 3 24 3 16 V5 Z"
            fill="#DC2626" ${haloAttrs}/>
      ${CROSS_SVG}
    </svg>`;
  } else if (level === 2) {
    // Amber square (rotated diamond would also work — square is clearer at small sizes)
    svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}">
      <rect x="3" y="3" width="26" height="26" rx="3"
            fill="#F59E0B" ${haloAttrs}/>
      ${CROSS_SVG}
    </svg>`;
  } else if (level === 3) {
    // Blue circle
    svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}">
      <circle cx="16" cy="16" r="13"
              fill="#2563EB" ${haloAttrs}/>
      ${CROSS_SVG}
    </svg>`;
  } else {
    // Unknown level — gray hex
    svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}">
      <circle cx="16" cy="16" r="13" fill="#9CA3AF" ${haloAttrs}/>
      ${CROSS_SVG}
    </svg>`;
  }

  return L.divIcon({
    html: svg,
    className: "hospital-icon",
    iconSize: [size, size],
    iconAnchor: [half, half],
    popupAnchor: [0, -half + 2],
  });
}

// Precompute the 4 icon variants (3 levels + unknown), normal + highlighted
const ICONS = {
  1: hospitalIcon(1, false), 1_hi: hospitalIcon(1, true),
  2: hospitalIcon(2, false), 2_hi: hospitalIcon(2, true),
  3: hospitalIcon(3, false), 3_hi: hospitalIcon(3, true),
  unknown: hospitalIcon(null, false),
};

const LEVEL_COLOR = { 1: "#DC2626", 2: "#F59E0B", 3: "#2563EB" };

// ───────────────────────── Map helpers ─────────────────────────────────────
function FitBounds({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [40, 40] });
    } else {
      map.setView(HARYANA_CENTER, HARYANA_ZOOM);
    }
  }, [bounds, map]);
  return null;
}

// ───────────────────────── Main component ──────────────────────────────────
export default function MapView({
  ambulances, hospitals, districts, selectedDistrict,
  activeLayer, selectedAmbulance,
  // legacy nearest-routes payload (still supported for backward compat)
  nearestRoutes,
  // new recommendation payload from /api/recommend-hospitals
  recommendation,
  onAmbulanceClick, onHospitalClick, onRouteClick,
}) {
  const fitBounds = useMemo(() => {
    if (selectedDistrict && districts) {
      const feat = districts.features.find(
        (f) => f.properties.name?.toLowerCase() === selectedDistrict.toLowerCase()
      );
      if (feat) {
        const layer = L.geoJSON(feat);
        return layer.getBounds();
      }
    }
    return null;
  }, [selectedDistrict, districts]);

  const districtStyle = (feature) => {
    const isSelected = selectedDistrict &&
      feature.properties.name?.toLowerCase() === selectedDistrict.toLowerCase();
    return {
      color: isSelected ? "#F97316" : "#94A3B8",
      weight: isSelected ? 3 : 1.5,
      fillOpacity: 0,
      opacity: isSelected ? 0.8 : 0.4,
    };
  };

  // ─── Pull out which hospitals are the recommended "winners" so we can
  // highlight their routes/icons distinctly.
  const recHighlightIds = new Set();
  if (recommendation?.recommendation) {
    const r = recommendation.recommendation;
    if (r.primary) recHighlightIds.add(r.primary.hospital_id);
    if (r.stabilize_at) recHighlightIds.add(r.stabilize_at.hospital_id);
    if (r.transfer_to) recHighlightIds.add(r.transfer_to.hospital_id);
  }

  // Per-level winners shown on the map (always 3 routes max in the new mode)
  const levelRoutes = useMemo(() => {
    if (!recommendation?.by_level) return [];
    const out = [];
    for (const key of ["L1", "L2", "L3"]) {
      const h = recommendation.by_level[key];
      if (h && h.geometry) out.push(h);
    }
    return out;
  }, [recommendation]);

  return (
    <MapContainer center={HARYANA_CENTER} zoom={HARYANA_ZOOM} scrollWheelZoom>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />

      <FitBounds bounds={fitBounds} />

      {districts && (
        <GeoJSON
          key={selectedDistrict || "all"}
          data={districts}
          style={districtStyle}
        />
      )}

      {/* AMBULANCES */}
      {activeLayer === "ambulances" && ambulances?.features?.map((f) => (
        <CircleMarker
          key={`amb-${f.properties.unique_id}`}
          center={[f.geometry.coordinates[1], f.geometry.coordinates[0]]}
          radius={
            selectedAmbulance?.properties.unique_id === f.properties.unique_id ? 10 : 7
          }
          pathOptions={{
            color: "#991B1B",
            fillColor: "#DC2626",
            fillOpacity: 0.85,
            weight: 2,
          }}
          eventHandlers={{ click: () => onAmbulanceClick(f) }}
        >
          <Popup>
            <div className="marker-popup">
              <strong>Ambulance #{f.properties.unique_id}</strong>
              <div className="meta">
                {f.properties.district} · {f.properties.day} · {f.properties.time_period}
              </div>
              <div className="meta">{f.properties.address}</div>
              <div style={{ marginTop: 6, fontSize: 11, color: "#2563EB" }}>
                Click marker to find nearest hospitals →
              </div>
            </div>
          </Popup>
        </CircleMarker>
      ))}

      {/* HOSPITALS — level-coded SVG icons */}
      {activeLayer === "hospitals" && hospitals?.features?.map((f) => {
        const lvl = f.properties.level;
        const icon = ICONS[lvl] || ICONS.unknown;
        return (
          <Marker
            key={`hosp-${f.properties.hospital_id}`}
            position={[f.geometry.coordinates[1], f.geometry.coordinates[0]]}
            icon={icon}
            eventHandlers={{ click: () => onHospitalClick(f.properties.hospital_id) }}
          >
            <Popup>
              <div className="marker-popup">
                <strong>{f.properties.name}</strong>
                <div className="meta">
                  {f.properties.hospital_type} · Level {lvl || "—"} ({f.properties.level_label})
                </div>
                {f.properties.tpl_score != null && (
                  <div className="meta">TPL score: {f.properties.tpl_score.toFixed(1)}%</div>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}

      {/* 50 km radius circle around selected ambulance */}
      {selectedAmbulance && (
        <Circle
          center={[
            selectedAmbulance.geometry.coordinates[1],
            selectedAmbulance.geometry.coordinates[0],
          ]}
          radius={50000}
          pathOptions={{
            color: "#DC2626",
            weight: 2,
            opacity: 0.65,
            fillColor: "#DC2626",
            fillOpacity: 0.05,
            dashArray: "8,6",
          }}
        />
      )}

      {/* Highlighted ambulance marker (the selected one) */}
      {selectedAmbulance && (
        <CircleMarker
          center={[
            selectedAmbulance.geometry.coordinates[1],
            selectedAmbulance.geometry.coordinates[0],
          ]}
          radius={14}
          pathOptions={{
            color: "#7F1D1D",
            weight: 3,
            fillColor: "#DC2626",
            fillOpacity: 0.95,
          }}
        />
      )}

      {/* ROUTES — new recommendation mode: 3 level-coded routes (L1/L2/L3) */}
      {levelRoutes.map((h) => {
        const isHighlighted = recHighlightIds.has(h.hospital_id);
        const positions = h.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
        const lvlColor = LEVEL_COLOR[h.level] || "#6B7280";

        return (
          <React.Fragment key={`recroute-${h.hospital_id}`}>
            {/* The base colored route */}
            <Polyline
              positions={positions}
              pathOptions={{
                color: lvlColor,
                weight: isHighlighted ? 7 : 4,
                opacity: isHighlighted ? 1.0 : 0.55,
                dashArray: isHighlighted ? null : "8,6",
              }}
              eventHandlers={{ click: () => onRouteClick(h) }}
            >
              <Popup>
                <div className="marker-popup">
                  <strong>{h.name}</strong>
                  <div className="meta">
                    {h.hospital_type} · Level {h.level} ({h.level_label})
                  </div>
                  {h.tpl_score != null && (
                    <div className="meta">TPL: <strong>{h.tpl_score.toFixed(1)}%</strong></div>
                  )}
                  <div className="meta" style={{ marginTop: 6 }}>
                    Road distance: <strong>{h.road_km.toFixed(2)} km</strong>
                  </div>
                  <div className="meta">
                    Est. time @ 60 km/h: <strong>{h.time_min.toFixed(1)} min</strong>
                  </div>
                  {isHighlighted && (
                    <div style={{ marginTop: 6, color: "#16A34A", fontWeight: 700 }}>
                      ★ Part of recommended route
                    </div>
                  )}
                </div>
              </Popup>
            </Polyline>

            {/* For the highlighted route, draw a thinner white overlay
                to create a "halo" effect that makes the green stand out */}
            {isHighlighted && (
              <Polyline
                positions={positions}
                pathOptions={{
                  color: "#fff",
                  weight: 2,
                  opacity: 0.9,
                  dashArray: "4,8",
                  className: "route-pulse",
                }}
                interactive={false}
              />
            )}
          </React.Fragment>
        );
      })}

      {/* LEGACY: old "all hospitals in radius" routes — kept for backward compat */}
      {!recommendation && nearestRoutes?.hospitals?.map((h, idx) => {
        if (!h.geometry) return null;
        const isNearest = idx === 0;
        const positions = h.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
        return (
          <Polyline
            key={`route-${h.hospital_id}`}
            positions={positions}
            pathOptions={{
              color: isNearest ? "#14532D" : "#2563EB",
              weight: isNearest ? 7 : 3,
              opacity: isNearest ? 1.0 : 0.55,
              dashArray: isNearest ? null : "6,6",
            }}
            eventHandlers={{ click: () => onRouteClick(h) }}
          >
            <Popup>
              <div className="marker-popup">
                <strong>{h.name}</strong>
                <div className="meta">
                  {h.hospital_type} · Level {h.level} ({h.level_label})
                </div>
                {h.tpl_score != null && (
                  <div className="meta">TPL: <strong>{h.tpl_score.toFixed(1)}%</strong></div>
                )}
                <div className="meta" style={{ marginTop: 6 }}>
                  <strong>{h.road_km.toFixed(2)} km</strong> · <strong>{h.time_min.toFixed(1)} min</strong>
                </div>
              </div>
            </Popup>
          </Polyline>
        );
      })}
    </MapContainer>
  );
}
