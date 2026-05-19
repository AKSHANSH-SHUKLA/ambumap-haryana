import React, { useEffect, useState, useCallback } from "react";
import MapView from "./components/MapView.jsx";
import Sidebar from "./components/Sidebar.jsx";
import UploadModal from "./components/UploadModal.jsx";
import HospitalDetails, { NearestRoutesPanel } from "./components/HospitalDetails.jsx";
import { api } from "./api/client.js";

export default function App() {
  const [filterOptions, setFilterOptions] = useState({});
  const [filters, setFilters] = useState({
    state: "All", district: "All", day: "All", time_period: "All",
  });
  const [ambulances, setAmbulances] = useState(null);
  const [hospitals, setHospitals] = useState(null);
  const [districts, setDistricts] = useState(null);
  const [activeLayer, setActiveLayer] = useState("ambulances");
  const [showUpload, setShowUpload] = useState(false);
  const [selectedAmbulance, setSelectedAmbulance] = useState(null);
  const [nearestRoutes, setNearestRoutes] = useState(null);
  const [selectedHospital, setSelectedHospital] = useState(null);
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(false);

  // Load filter options + districts once on mount
  useEffect(() => {
    api.filterOptions("Haryana").then(setFilterOptions).catch(console.error);
    api.districts("Haryana").then(setDistricts).catch(console.error);
  }, []);

  // Refetch data whenever filters or layer change
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (activeLayer === "ambulances") {
        const data = await api.ambulances(filters);
        setAmbulances(data);
      } else {
        const data = await api.hospitals(filters);
        setHospitals(data);
      }
    } catch (e) {
      showToast(`Error: ${e.message}`, "error");
    } finally {
      setLoading(false);
    }
  }, [filters, activeLayer]);

  useEffect(() => { loadData(); }, [loadData]);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleFilterChange = (key, value) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setSelectedAmbulance(null);
    setNearestRoutes(null);
  };

  const handleClearFilters = () => {
    setFilters({ state: "All", district: "All", day: "All", time_period: "All" });
    setSelectedAmbulance(null);
    setNearestRoutes(null);
  };

  // Track an in-flight request so a rapid second click cancels the previous one.
  const inFlightAmbulance = React.useRef(null);
  const inFlightHospital  = React.useRef(null);

  const handleAmbulanceClick = async (feature) => {
    // Visual feedback FIRST so the user sees the click registered immediately:
    setSelectedAmbulance(feature);
    setSelectedHospital(null);
    setNearestRoutes(null);     // clear stale polylines RIGHT NOW
    setLoading(true);

    const myToken = Symbol("ambClick");
    inFlightAmbulance.current = myToken;

    try {
      const data = await api.nearestHospitals(feature.properties.unique_id, 50);
      // Only commit if this is still the most recent click
      if (inFlightAmbulance.current === myToken) {
        setNearestRoutes(data);
      }
    } catch (e) {
      if (inFlightAmbulance.current === myToken) {
        showToast(`Routing failed: ${e.message}`, "error");
      }
    } finally {
      if (inFlightAmbulance.current === myToken) {
        setLoading(false);
      }
    }
  };

  const handleHospitalClick = async (hospitalId) => {
    // Show a placeholder panel immediately
    setSelectedHospital({ properties: { name: "Loading…", level_label: "" } });
    setLoading(true);

    const myToken = Symbol("hospClick");
    inFlightHospital.current = myToken;

    try {
      const h = await api.hospital(hospitalId);
      if (inFlightHospital.current === myToken) {
        setSelectedHospital(h);
      }
    } catch (e) {
      if (inFlightHospital.current === myToken) {
        showToast(`Failed to load hospital: ${e.message}`, "error");
        setSelectedHospital(null);
      }
    } finally {
      if (inFlightHospital.current === myToken) {
        setLoading(false);
      }
    }
  };

  const handleRouteClick = (h) => {
    handleHospitalClick(h.hospital_id);
  };

  const handleUploaded = (target, count) => {
    showToast(`${count} ${target} uploaded`, "success");
    loadData();
    api.filterOptions("Haryana").then(setFilterOptions);
  };

  const visibleCount =
    activeLayer === "ambulances"
      ? ambulances?.features?.length || 0
      : hospitals?.features?.length || 0;

  return (
    <div className="app">
      <header className="topnav">
        <div className="topnav-title">
          <span className="dot" />
          AmbuMap · Haryana
        </div>
        <button className="btn" onClick={() => setShowUpload(true)}>
          Upload Excel
        </button>
      </header>

      <div className="main">
        <Sidebar
          filterOptions={filterOptions}
          filters={filters}
          onChange={handleFilterChange}
          onClear={handleClearFilters}
          count={visibleCount}
          activeLayer={activeLayer}
          onLayerChange={(l) => {
            setActiveLayer(l);
            setSelectedAmbulance(null);
            setNearestRoutes(null);
            setSelectedHospital(null);
          }}
        />

        <div className="map-container">
          <MapView
            ambulances={ambulances}
            hospitals={hospitals}
            districts={districts}
            selectedDistrict={filters.district !== "All" ? filters.district : null}
            activeLayer={activeLayer}
            selectedAmbulance={selectedAmbulance}
            nearestRoutes={nearestRoutes}
            onAmbulanceClick={handleAmbulanceClick}
            onHospitalClick={handleHospitalClick}
            onRouteClick={handleRouteClick}
          />

          {selectedHospital && (
            <HospitalDetails
              hospital={selectedHospital}
              onClose={() => setSelectedHospital(null)}
            />
          )}

          {nearestRoutes && !selectedHospital && (
            <NearestRoutesPanel
              data={nearestRoutes}
              onSelectHospital={handleHospitalClick}
              onClose={() => {
                setNearestRoutes(null);
                setSelectedAmbulance(null);
              }}
            />
          )}
        </div>
      </div>

      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onUploaded={handleUploaded}
        />
      )}

      {toast && (
        <div className={`toast ${toast.type}`}>{toast.message}</div>
      )}

      {loading && (
        <div style={{
          position: "fixed", top: 70, left: "50%", transform: "translateX(-50%)",
          padding: "6px 14px", background: "rgba(0,0,0,0.7)", color: "white",
          borderRadius: 16, fontSize: 12, zIndex: 1500,
        }}>
          <span className="spinner" style={{ marginRight: 8 }}/>Loading…
        </div>
      )}
    </div>
  );
}
