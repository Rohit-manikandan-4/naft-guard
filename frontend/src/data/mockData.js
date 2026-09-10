// Scene dressing (sensitive areas, coastline) for the map, plus
// fallback/demo values shown before the AI pipeline has been run for the
// first time. Real detections and forecasts (from the FastAPI backend
// around the NEFT-GUARD AI module) override all of this at runtime — see
// AppState.jsx.
//
// The bundled Sentinel-1 sample scene and ocean-current dataset cover a
// patch of the Gulf of Mexico off the Louisiana coast, so the demo scene
// is centred there.

export const SCENE_CENTER = [28.95, -89.05]

export const COASTLINE = [
  [29.72, -87.65], [29.62, -88.05], [29.48, -88.35], [29.35, -88.62],
  [29.28, -88.92], [29.18, -89.22], [29.05, -89.4], [28.85, -89.55],
]

export const SENSITIVE_AREAS = [
  { id: 'SA-01', name: 'Chandeleur Islands Marine Refuge', lat: 29.75, lng: -88.85, type: 'Protected Area' },
  { id: 'SA-02', name: 'Mississippi River Delta Wetlands', lat: 29.15, lng: -89.25, type: 'Coastal Ecosystem' },
]

// Fallback slick / forecast footprints shown only until a real AI
// detection + forecast has been run.
export const SPILL_POLYGON = [
  [28.93, -89.06], [28.96, -89.0], [28.95, -88.93], [28.9, -88.92],
  [28.86, -88.97], [28.87, -89.05],
]

export const PREDICTED_POLYGON = {
  '1h': [
    [28.93, -89.05], [28.96, -88.99], [28.95, -88.92], [28.9, -88.91],
    [28.86, -88.96], [28.87, -89.04],
  ],
  '3h': [
    [28.94, -89.03], [28.97, -88.96], [28.96, -88.88], [28.9, -88.87],
    [28.85, -88.93], [28.86, -89.02],
  ],
  '6h': [
    [28.94, -89.0], [28.99, -88.9], [28.97, -88.8], [28.9, -88.79],
    [28.83, -88.87], [28.85, -88.99],
  ],
  '12h': [
    [28.95, -88.94], [29.02, -88.78], [28.98, -88.65], [28.88, -88.63],
    [28.78, -88.75], [28.82, -88.92],
  ],
}

export const RISK_ZONES = [
  {
    id: 'coastal-ecosystem', name: 'Coastal Ecosystem', level: 'HIGH',
    detail: 'Predicted drift trends toward the Mississippi River Delta wetlands, where sediment retention would slow natural dispersion of any oil that reaches shore.',
  },
  {
    id: 'marine-habitat', name: 'Marine Habitat', level: 'MEDIUM',
    detail: 'Open-water fish spawning grounds sit near the predicted drift path; exposure depends on how closely conditions track the wind/current forecast.',
  },
  {
    id: 'fishing-zone', name: 'Fishing Zone', level: 'HIGH',
    detail: 'Active shrimping and trawling grounds overlap the current spill boundary. Vessels operating in this sector should be notified before the next tidal cycle.',
  },
  {
    id: 'protected-area', name: 'Protected Area', level: 'LOW',
    detail: 'The Chandeleur Islands Marine Refuge lies at the edge of the forecast cone and is unlikely to be reached within 12 hours at the current drift velocity.',
  },
  {
    id: 'coastal-population', name: 'Coastal Population', level: 'MEDIUM',
    detail: 'Fishing communities along the Louisiana coast may experience odour and debris if the slick reaches shore ahead of forecast.',
  },
]

export const INITIAL_INCIDENTS = [
  {
    id: 'OG-1042', detectedAt: '11:42', location: 'Gulf of Mexico, ~140km SE of New Orleans',
    area: 6.8, severity: 'HIGH', confidence: 91, status: 'MONITORING', lat: 28.93, lng: -89.02,
  },
  {
    id: 'OG-1038', detectedAt: '09:15', location: 'Mississippi Canyon block approach',
    area: 1.2, severity: 'LOW', confidence: 76, status: 'RESOLVED', lat: 28.6, lng: -88.4,
  },
  {
    id: 'OG-1031', detectedAt: 'Yesterday, 22:04', location: 'Chandeleur Sound coastal shelf',
    area: 3.4, severity: 'MEDIUM', confidence: 83, status: 'CONTAINED', lat: 29.4, lng: -88.7,
  },
]

export const INITIAL_ALERTS = [
  { id: 'AL-1', time: '11:42 AM', text: 'Oil spill detected', incidentId: 'OG-1042', lat: 28.93, lng: -89.02 },
  { id: 'AL-2', time: '11:48 AM', text: 'Spill expansion detected', incidentId: 'OG-1042', lat: 28.93, lng: -89.02 },
  { id: 'AL-3', time: '12:05 PM', text: 'Coastal region entered predicted risk zone', incidentId: 'OG-1042', lat: 28.93, lng: -89.02 },
  { id: 'AL-4', time: '12:12 PM', text: 'Warning threshold reached', incidentId: 'OG-1042', lat: 28.93, lng: -89.02 },
]

export const RESPONSE_ACTIONS = [
  { id: 'RA-1', title: 'Deploy containment barriers', priority: 'HIGH', reason: 'Slows lateral spread before the next tidal shift.', status: 'PENDING' },
  { id: 'RA-2', title: 'Dispatch response vessel', priority: 'HIGH', reason: 'Nearest recovery vessel is 3.5 hours from the site.', status: 'PENDING' },
  { id: 'RA-3', title: 'Increase monitoring frequency', priority: 'MEDIUM', reason: 'Confirms drift model accuracy against satellite passes.', status: 'IN_PROGRESS' },
  { id: 'RA-4', title: 'Notify coastal authorities', priority: 'HIGH', reason: 'Coastal arrival is estimated within the forecast window.', status: 'PENDING' },
  { id: 'RA-5', title: 'Monitor fishing zones', priority: 'MEDIUM', reason: 'Active trawling grounds overlap the current boundary.', status: 'PENDING' },
  { id: 'RA-6', title: 'Protect sensitive ecological areas', priority: 'MEDIUM', reason: 'Delta wetlands are within the forecast cone.', status: 'PENDING' },
]

// Used only until the wind/current model has actually been run once.
export const DEFAULT_PREDICTION_META = {
  '1h': { direction: 'W, 270°', velocity: '1.0 km/h', arrival: '—', distanceKm: 1.0, confidence: null },
  '3h': { direction: 'W, 270°', velocity: '1.0 km/h', arrival: '—', distanceKm: 3.0, confidence: null },
  '6h': { direction: 'W, 270°', velocity: '1.0 km/h', arrival: '—', distanceKm: 5.8, confidence: null },
  '12h': { direction: 'W, 270°', velocity: '1.1 km/h', arrival: '—', distanceKm: 13.7, confidence: null },
}

export const DEFAULT_CONDITIONS = { windDirection: 'W', windSpeed: '21.6 km/h', current: 'sample dataset · Gulf of Mexico' }

export const SYSTEM_STATUS = {
  stationsOnline: 24, stationsTotal: 26, areaMonitored: '12,480 km²',
  lastSatelliteUpdate: '11:42 AM',
}
