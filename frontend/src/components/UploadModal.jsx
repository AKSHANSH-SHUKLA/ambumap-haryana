import React, { useState, useRef } from "react";
import { api } from "../api/client.js";

export default function UploadModal({ onClose, onUploaded }) {
  const [target, setTarget] = useState("ambulances");
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef();

  const handleFile = async (file) => {
    if (!file) return;
    if (!file.name.match(/\.xlsx$/i)) {
      setError("Only .xlsx files are accepted");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const result = target === "ambulances"
        ? await api.uploadAmbulances(file)
        : await api.uploadHospitals(file);
      onUploaded(target, result.inserted_or_updated);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Upload Excel</h3>

        <div className="filter-group">
          <label className="filter-label">Dataset</label>
          <select
            className="filter-select"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            disabled={uploading}
          >
            <option value="ambulances">Ambulances</option>
            <option value="hospitals">Hospitals</option>
          </select>
        </div>

        <div
          className={`drop-zone ${dragOver ? "dragover" : ""}`}
          onClick={() => inputRef.current.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFile(e.dataTransfer.files[0]);
          }}
        >
          {uploading ? (
            <><span className="spinner"/> Uploading…</>
          ) : (
            <>Drag &amp; drop <strong>.xlsx</strong> here or click to browse</>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          style={{ display: "none" }}
          onChange={(e) => handleFile(e.target.files[0])}
        />

        {error && <div style={{ marginTop: 12, color: "var(--red)" }}>{error}</div>}

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
