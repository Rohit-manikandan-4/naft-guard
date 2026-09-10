# NAFT-GUARD — Oil Spill Detection & Spread Prediction

A full-stack website that finds probable oil spills in Sentinel-1 SAR satellite
imagery and predicts how far they'll drift over the next few hours, using wind
and ocean-current data.

- **AI model**: the NEFT-GUARD `AI_MODULE` you provided (`E:\AI_MODULE`) —
  unmodified. A custom U-Net (PyTorch) segments probable oil regions in a SAR
  GeoTIFF, then a wind + Copernicus ocean-current model forecasts drift at
  **+1h / +3h / +6h / +12h**.
- **Backend**: [`backend/`](backend/app.py) — a small FastAPI service that
  imports the AI module directly from its original folder (no code copied)
  and exposes it over HTTP.
- **Frontend**: [`frontend/`](frontend) — the NAFT-GUARD React UI from
  `NAFT-GUARD-updated.zip`, wired up to call the real backend instead of its
  original mock data.

## How it fits together

```
Sentinel-1 GeoTIFF (upload, or the bundled sample)
        │
        ▼
POST /api/detect  ──▶  AI_MODULE U-Net segmentation ──▶ regions, area, mask overlay PNG
        │
        ▼
POST /api/forecast ──▶ AI_MODULE wind/current model ──▶ drift path for +1h/+3h/+6h/+12h
        │
        ▼
React UI: Detection tab (segmentation result) + Prediction tab (drift chart + map)
```

The bundled sample scene (`AI_MODULE/sample/2018_09_26.tif`) and the ocean-current
dataset both cover the same small patch of the **Gulf of Mexico**, so the demo
map is centred there rather than the original mock's Arabian Sea location.

## Running it

### 1. Backend

```powershell
cd backend
.\start.ps1
```

The first run creates a virtual environment and installs dependencies
(including a CPU build of PyTorch, ~200MB download). Subsequent runs just
start the API at `http://localhost:8000`.

If `AI_MODULE` lives somewhere other than `E:\AI_MODULE`, set `AI_MODULE_DIR`
before starting, e.g. `$env:AI_MODULE_DIR = "D:\path\to\AI_MODULE"`.

Check it's up: `http://localhost:8000/api/health` — the response includes
`"database_connected"`.

#### Database (optional but recommended)

Incidents, alerts, response-action status and forecasts persist to a
Postgres database (built against [Neon](https://neon.tech)'s free tier).
Without it, the app still works — it just resets to demo data on every
refresh.

1. Create a free Neon project and copy its connection string.
2. Put it in `backend/.env` (create the file):
   ```
   DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
   ```
3. Restart the backend. Tables are created and seeded automatically on
   first run. The header shows **Database Connected** once it's working.

`backend/.env` is git-ignored — never commit it.

### 2. Frontend

```powershell
cd frontend
npm install
npm run dev
```

Open the URL Vite prints (typically `http://localhost:5173`). To point the
UI at a backend running somewhere other than `http://localhost:8000`, set
`VITE_API_BASE` (e.g. in a `frontend/.env.local` file).

## Using it

1. **Spill Detection** tab → click **Analyze Image** to run the real U-Net
   model on the bundled Sentinel-1 sample (or upload your own georeferenced
   GeoTIFF). Full-resolution inference on CPU takes roughly 1–3 minutes —
   the stage list is cosmetic, the result only ever comes from the model.
2. On completion, the largest detected region is recorded as a new incident
   and a spread forecast is run automatically for it.
3. **Spread Prediction** tab → shows the real +1h/+3h/+6h/+12h drift
   (distance, direction, velocity) from the wind + ocean-current model.
   Adjust wind speed/direction and click **Recalculate Forecast** to see it
   respond immediately.
4. The map, incidents log, risk assessment, alerts and report export all
   flow from that same detection + forecast result.

## What's real vs. illustrative

- **Real, from the AI module**: the segmentation mask, region areas/locations,
  detection confidence, and the +1h/+3h/+6h/+12h drift positions (wind +
  Copernicus ocean-current physics).
- **Illustrative / UI scene-dressing**: monitoring station and vessel
  positions, the "area growth" radius drawn on the map (the AI module
  predicts *movement*, not footprint growth, so a simple diffusion heuristic
  is layered on top for the map circle size), and the risk-zone/response
  content, which is scripted context around whichever incident is active.
- The ocean-current dataset bundled with `AI_MODULE` only covers one day and
  a 2×2 grid over the Gulf of Mexico sample area, so forecasts for
  coordinates far outside that box will fall back to the nearest edge of
  that grid.

## Project layout

```
Arul1/
├── backend/           FastAPI service wrapping AI_MODULE
│   ├── app.py
│   ├── db.py           Postgres/Neon models + persistence helpers
│   ├── .env             DATABASE_URL (git-ignored, not committed)
│   ├── requirements.txt
│   └── start.ps1
└── frontend/           React (Vite) UI — NAFT-GUARD by Team TechLADS
    └── src/
        ├── api.js              backend client
        ├── lib/geo.js          map/geometry helpers
        ├── context/AppState.jsx  app state + AI pipeline actions
        └── components/…
```
