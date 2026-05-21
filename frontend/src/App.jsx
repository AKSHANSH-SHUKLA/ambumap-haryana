import React, { useEffect, useState, useCallback } from "react";
import MapView from "./components/MapView.jsx";
import Sidebar from "./components/Sidebar.jsx";
import UploadModal from "./components/UploadModal.jsx";
import HospitalDetails from "./components/HospitalDetails.jsx";
import RecommendationPanel from "./components/RecommendationPanel.jsx";
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
  const [recommendation, setRecommendation] = useState(null);
  const [selectedHospital, setSelectedHospital] = useState(null);
  const [injuryOptions, setInjuryOptions] = useState([]);
  const [selectedInjury, setSelectedInjury] = useState("tbi");      // default to TBI
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(false);

  // One-time loads
  useEffect(() => {
    api.filterOptions("Haryana").then(setFilterOptions).catch(console.error);
    api.districts("Haryana").then(setDistricts).catch(console.error);
    api.injuryOptions().then(setInjuryOptions).catch(console.error);
  }, []);

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
    setRecommendation(null);
  };

  const handleClearFilters = () => {
    setFilters({ state: "All", district: "All", day: "All", time_period: "All" });
    setSelectedAmbulance(null);
    setRecommendation(null);
  };

  // Token-based request cancellation: only the most recent click "wins"
  const inFlightAmbulance = React.useRef(null);
  const inFlightHospital  = React.useRef(null);

  // Smart recommendation fetch — uses current selectedInjury
  const fetchRecommendation = useCallback(
    async (ambulanceId, injury) => {
      const myToken = Symbol("rec");
      inFlightAmbulance.current = myToken;
      setLoading(true);
      try {
        const data = await api.recommendHospitals(ambulanceId, injury, 50);
        if (inFlightAmbulance.current === myToken) {
          setRecommendation(data);
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
    },
    []
  );

  const handleAmbulanceClick = async (feature) => {
    setSelectedAmbulance(feature);
    setSelectedHospital(null);
    setRecommendation(null);
    if (selectedInjury) {
      await fetchRecommendation(feature.properties.unique_id, selectedInjury);
    }
  };

  // When the user changes injury type in the panel, re-run the recommendation
  const handleInjuryChange = (injury) => {
    setSelectedInjury(injury);
    if (selectedAmbulance && injury) {
      fetchRecommendation(selectedAmbulance.properties.unique_id, injury);
    }
  };

  const handleHospitalClick = async (hospitalId) => {
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

  const handleRouteClick = (h) => handleHospitalClick(h.hospital_id);

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
            setRecommendation(null);
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
            recommendation={recommendation}
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

          {recommendation && !selectedHospital && (
            <RecommendationPanel
              data={recommendation}
              injuryOptions={injuryOptions}
              selectedInjury={selectedInjury}
              onPickInjury={handleInjuryChange}
              onClose={() => {
                setRecommendation(null);
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

      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}

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
