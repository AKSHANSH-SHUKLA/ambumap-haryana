import React, { useEffect, useMemo, useRef } from "react";
import {
  MapContainer, TileLayer, GeoJSON, CircleMarker, Popup, Polyline, useMap,
} from "react-leaflet";
import L from "leaflet";

const HARYANA_CENTER = [29.0588, 76.0856];
const HARYANA_ZOOM = 7;

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

export default function MapView({
  ambulances, hospitals, districts, selectedDistrict,
  activeLayer, selectedAmbulance, nearestRoutes,
  onAmbulanceClick, onHospitalClick, onRouteClick,
}) {
  const ambLayerRef = useRef();

  // Compute bounds for FitBounds: selected district > all visible ambulances > default
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

      {activeLayer === "hospitals" && hospitals?.features?.map((f) => (
        <CircleMarker
          key={`hosp-${f.properties.hospital_id}`}
          center={[f.geometry.coordinates[1], f.geometry.coordinates[0]]}
          radius={6}
          pathOptions={{
            color: "#1E3A8A",
            fillColor: "#2563EB",
            fillOpacity: 0.8,
            weight: 1.5,
          }}
          eventHandlers={{ click: () => onHospitalClick(f.properties.hospital_id) }}
        >
          <Popup>
            <div className="marker-popup">
              <strong>{f.properties.name}</strong>
              <div className="meta">
                {f.properties.hospital_type} · Level {f.properties.level || "—"} ({f.properties.level_label})
              </div>
              {f.properties.tpl_score != null && (
                <div className="meta">TPL score: {f.properties.tpl_score.toFixed(1)}%</div>
              )}
            </div>
          </Popup>
        </CircleMarker>
      ))}

      {/* Nearest-hospital routes overlay (shown when an ambulance is selected) */}
      {nearestRoutes?.hospitals?.map((h, idx) => {
        if (!h.geometry) return null;
        const isNearest = idx === 0;
        const positions = h.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
        return (
          <Polyline
            key={`route-${h.hospital_id}`}
            positions={positions}
            pathOptions={{
              // Nearest route = very dark, bold green so it pops against blue
              color: isNearest ? "#14532D" : "#2563EB",   // green-900 vs blue-600
              weight: isNearest ? 7 : 3,                   // much thicker
              opacity: isNearest ? 1.0 : 0.55,             // fully opaque
              dashArray: isNearest ? null : "6,6",
            }}
            eventHandlers={{ click: () => onRouteClick(h) }}
          >
            <Popup>
              <div className="marker-popup">
                <strong>{h.name}</strong>
                <div className="meta">
                  {h.hospital_type} · Level {h.level || "—"} ({h.level_label})
                </div>
                {h.tpl_score != null && (
                  <div className="meta">TPL prep score: <strong>{h.tpl_score.toFixed(1)}%</strong></div>
                )}
                <div className="meta" style={{ marginTop: 6 }}>
                  Road distance: <strong>{h.road_km.toFixed(2)} km</strong>
                </div>
                <div className="meta">
                  Est. time @ 60 km/h: <strong>{h.time_min.toFixed(1)} min</strong>
                </div>
                {isNearest && (
                  <div style={{ marginTop: 6, color: "#16A34A", fontWeight: 600 }}>
                    ★ Nearest hospital
                  </div>
                )}
              </div>
            </Popup>
          </Polyline>
        );
      })}

      {/* Highlight selected ambulance with a 50km radius indicator ring (visual cue) */}
      {selectedAmbulance && nearestRoutes && (
        <CircleMarker
          center={[
            selectedAmbulance.geometry.coordinates[1],
            selectedAmbulance.geometry.coordinates[0],
          ]}
          radius={12}
          pathOptions={{
            color: "#DC2626", weight: 3, fillColor: "#DC2626", fillOpacity: 0.4,
          }}
        />
      )}
    </MapContainer>
  );
}
