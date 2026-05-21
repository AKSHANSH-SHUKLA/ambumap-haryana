const BASE = import.meta.env.VITE_API_BASE || "";

async function request(path, options = {}) {
  const res = await fetch(BASE + path, options);
  if (!res.ok) {
    let body;
    try { body = await res.json(); } catch { body = { error: res.statusText }; }
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  health:        () => request("/api/health"),
  filterOptions: (state) => request(`/api/filters/options${state ? `?state=${encodeURIComponent(state)}` : ""}`),
  districts:     (state = "Haryana") => request(`/api/districts?state=${encodeURIComponent(state)}`),
  ambulances:    (filters = {}) => {
    const qs = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v && v.toLowerCase() !== "all") qs.set(k, v);
    });
    return request(`/api/ambulances?${qs.toString()}`);
  },
  hospitals:     (filters = {}) => {
    const qs = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v && v.toLowerCase() !== "all") qs.set(k, v);
    });
    return request(`/api/hospitals?${qs.toString()}`);
  },
  hospital:      (id) => request(`/api/hospitals/${id}`),
  nearestHospitals: (ambulanceId, radiusKm = 50) =>
    request(`/api/nearest-hospitals?ambulance_id=${ambulanceId}&radius_km=${radiusKm}`),
  recommendHospitals: (ambulanceId, injuryType, radiusKm = 50) =>
    request(`/api/recommend-hospitals?ambulance_id=${ambulanceId}&injury_type=${encodeURIComponent(injuryType)}&radius_km=${radiusKm}`),
  injuryOptions: () => request("/api/injury-options"),
  uploadAmbulances: (file) => {
    const fd = new FormData();
    fd.append("file", file);
    return request("/api/upload/ambulances", { method: "POST", body: fd });
  },
  uploadHospitals: (file) => {
    const fd = new FormData();
    fd.append("file", file);
    return request("/api/upload/hospitals", { method: "POST", body: fd });
  },
};
