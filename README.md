# Haryana Ambulance Mapping & Routing App

Full-stack visualization of ambulance locations across Haryana with nearest-hospital routing within a 50 km radius. Built per the DDP project spec.

## Stack

- **Frontend:** React 18 + Vite + react-leaflet + Leaflet + OSM tiles
- **Backend:** Flask + SQLAlchemy + GeoAlchemy2
- **Database:** PostgreSQL 15 + PostGIS
- **Routing:** OSRM (public instance by default, self-hosted recommended for prod)

## Quick start

### 1. Prerequisites

- Docker & Docker Compose
- Python 3.11+
- Node.js 18+

### 2. Start Postgres

```bash
docker-compose up -d postgres
```

### 3. Backend setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate    # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Fetch the Haryana district boundary GeoJSON (one-time)
python -c "import urllib.request; urllib.request.urlretrieve('https://raw.githubusercontent.com/datameet/maps/master/States/Haryana/Haryana_District.geojson', 'data/haryana_districts.geojson')" || echo "Download failed — see README for manual alternatives"

# Seed the database (creates tables, loads districts, ambulances, hospitals)
python seed.py

# Run the Flask dev server
python app.py
```

Flask runs on http://localhost:5001

### 4. Frontend setup

```bash
cd frontend
npm install
npm run dev
```

App opens at http://localhost:5173

### 5. (Optional) Self-hosted OSRM

The default config uses the public OSRM (`http://router.project-osrm.org`), which is rate-limited and unreliable. For real use, run OSRM locally:

```bash
mkdir -p osrm-data && cd osrm-data
wget https://download.geofabrik.de/asia/india/northern-zone-latest.osm.pbf
docker run -t -v "${PWD}:/data" osrm/osrm-backend osrm-extract -p /opt/car.lua /data/northern-zone-latest.osm.pbf
docker run -t -v "${PWD}:/data" osrm/osrm-backend osrm-partition /data/northern-zone-latest.osrm
docker run -t -v "${PWD}:/data" osrm/osrm-backend osrm-customize /data/northern-zone-latest.osrm
docker-compose up -d osrm
```

Then set `OSRM_HOST=http://localhost:5000` in `backend/.env`.

## District boundary file

`backend/data/haryana_districts.geojson` is fetched from the [datameet/maps](https://github.com/datameet/maps) public repository, which is derived from OSM and Census of India sources. For an official deployment, replace this with the licensed Survey of India shapefile — convert the `.shp` to GeoJSON with:

```bash
ogr2ogr -f GeoJSON haryana_districts.geojson haryana.shp -t_srs EPSG:4326
```

The loader is source-agnostic — drop the new file in place and re-run `python seed.py --districts-only`.

## Features

### Phase 1 — Ambulance Visualization
- Upload ambulance Excel (drag and drop)
- Filter by State, District, Day, Time Period
- Map auto-zooms to selected district and highlights its boundary
- 142 ambulance locations rendered as red dots
- Click any ambulance for details

### Phase 2 — Hospital + Routing
- Upload hospital Excel (separate flow)
- Toggle hospital layer (blue dots)
- Click an ambulance → finds all hospitals within 50 km
- Polylines drawn to each: road distance via OSRM, time at 60 km/h
- Nearest hospital highlighted in green
- Click a route polyline → popup with hospital name, level, distance, time
- Click a hospital → side panel with full TPL preparedness score

### Hospital level classification
| Type | Level | TPL shown |
|---|---|---|
| MCH, SSH | Level 1 (Tertiary) | avg_tertiary |
| DCH, SDH, CHC | Level 2 (Secondary) | avg_secondary |
| PHC, UPHC, UHC | Level 3 (Primary) | avg_primary |
| PRIVATE | Tertiary (special rule) | avg_tertiary |

## Project structure

```
ambulance-mapping/
├── backend/
│   ├── app.py                  # Flask app + all API routes
│   ├── seed.py                 # DB setup + initial data load
│   ├── requirements.txt
│   ├── services/
│   │   ├── osrm.py             # OSRM route helper
│   │   ├── excel_parser.py     # Ambulance + hospital Excel parsers
│   │   └── hospital_classifier.py
│   └── data/
│       ├── ambulances_haryana.xlsx
│       ├── hospitals_haryana.xlsx
│       └── haryana_districts.geojson
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   ├── styles.css
│   │   ├── api/client.js
│   │   └── components/
│   │       ├── MapView.jsx
│   │       ├── Sidebar.jsx
│   │       ├── UploadModal.jsx
│   │       └── HospitalDetails.jsx
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── docker-compose.yml
├── .env.example
└── README.md
```
