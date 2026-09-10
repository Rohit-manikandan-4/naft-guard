# NAFT-GUARD — Oil Spill Spread Detection & Early Warning System

A marine environmental monitoring console for oil spill detection, drift
prediction, risk assessment and coastal early warning. Built by Team TechLADS.

## Stack
- React 19
- Plain CSS (no Tailwind) — see `src/styles.css`
- Leaflet + react-leaflet (interactive nautical map)
- Recharts (spread-prediction graph)
- Lucide Icons

All data is mocked (`src/data/mockData.js`) and the detection pipeline is a
simulated processing sequence, so the app runs fully client-side with no
backend. The mock analysis function in `src/components/tabs/Detection.jsx` is
isolated so it can later be swapped for a real Flask/AI backend call.

## Run locally
```
npm install
npm run dev
```

## Build for deployment
```
npm run build
```
Outputs static files to `dist/` (relative asset paths, so it can be hosted
anywhere or opened directly).
