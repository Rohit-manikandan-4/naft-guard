// Client for the NAFT-GUARD backend (FastAPI service wrapping the
// NEFT-GUARD AI_MODULE: U-Net SAR segmentation + wind/current spread model).

export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

async function asJson(res) {
  let body = null
  try {
    body = await res.json()
  } catch {
    // no JSON body
  }
  if (!res.ok) {
    const message = body?.detail || res.statusText || 'Request failed'
    throw new Error(message)
  }
  return body
}

export async function checkHealth() {
  const res = await fetch(`${API_BASE}/api/health`)
  return asJson(res)
}

export async function getSampleScene() {
  const res = await fetch(`${API_BASE}/api/sample-scene`)
  return asJson(res)
}

// Runs the real U-Net segmentation model on either an uploaded GeoTIFF
// (`file`) or the bundled Sentinel-1 sample scene (`useSample: true`).
// This is a CPU inference pass over the full image and can take one to a
// few minutes for a full-resolution scene.
export async function detectOil({ file, useSample = false, threshold = 0.5 } = {}) {
  const form = new FormData()
  if (file) form.append('file', file)
  form.append('use_sample', useSample ? 'true' : 'false')
  form.append('threshold', String(threshold))

  const res = await fetch(`${API_BASE}/api/detect`, {
    method: 'POST',
    body: form,
  })
  return asJson(res)
}

// Runs the wind + ocean-current drift model for +1h / +3h / +6h / +12h.
// Pass incidentId to have the backend save this forecast against that
// incident (requires a database to be configured on the backend).
export async function forecastSpread({ latitude, longitude, windSpeedMps = 6, windDirectionDeg = 270, incidentId = null }) {
  const res = await fetch(`${API_BASE}/api/forecast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      latitude,
      longitude,
      wind_speed_mps: windSpeedMps,
      wind_direction_deg: windDirectionDeg,
      incident_id: incidentId,
    }),
  })
  return asJson(res)
}

// Persisted app state — incidents, alerts, response actions, warning count.
// Only available when the backend has a database configured; callers
// should fall back to local defaults if this throws.
export async function getState() {
  const res = await fetch(`${API_BASE}/api/state`)
  return asJson(res)
}

export async function updateActionStatus(actionId, status) {
  const res = await fetch(`${API_BASE}/api/actions/${actionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
  return asJson(res)
}

export async function issueWarning(incidentId) {
  const res = await fetch(`${API_BASE}/api/incidents/${incidentId}/warning`, { method: 'POST' })
  return asJson(res)
}

export function assetUrl(path) {
  if (!path) return null
  return `${API_BASE}${path}`
}
