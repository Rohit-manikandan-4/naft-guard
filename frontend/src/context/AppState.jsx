import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  INITIAL_INCIDENTS, INITIAL_ALERTS, RESPONSE_ACTIONS,
  DEFAULT_PREDICTION_META, DEFAULT_CONDITIONS, COASTLINE,
} from '../data/mockData'
import {
  detectOil, forecastSpread, getState,
  updateActionStatus as apiUpdateActionStatus, issueWarning as apiIssueWarning,
} from '../api'
import { areaKm2ToRadiusKm, bearingToCompass, mpsToKmh, distanceToPolylineKm } from '../lib/geo'

const AppContext = createContext(null)

const HORIZONS = ['1h', '3h', '6h', '12h']

export function AppProvider({ children }) {
  const [incidents, setIncidents] = useState(INITIAL_INCIDENTS)
  const [alerts, setAlerts] = useState(INITIAL_ALERTS)
  const [actions, setActions] = useState(RESPONSE_ACTIONS)
  const [activeIncidentId, setActiveIncidentId] = useState('OG-1042')
  const [warningsIssued, setWarningsIssued] = useState(8)
  const [warningStatus, setWarningStatus] = useState('READY') // READY | ISSUED
  const [mapFocus, setMapFocus] = useState(null)
  const [horizon, setHorizon] = useState('6h')
  const [toast, setToast] = useState(null)
  const [theme, setTheme] = useState('dark') // 'dark' | 'light'

  // Whether incidents/alerts/actions are backed by the Neon database
  // (true) or just this browser tab's in-memory state (false, e.g. no
  // DATABASE_URL configured on the backend yet).
  const [persisted, setPersisted] = useState(false)

  // ---- Real AI pipeline state --------------------------------------------
  const [detection, setDetection] = useState(null) // last /api/detect payload
  const [detecting, setDetecting] = useState(false)
  const [detectError, setDetectError] = useState(null)

  const [forecast, setForecast] = useState(null) // last /api/forecast payload
  const [forecasting, setForecasting] = useState(false)
  const [forecastError, setForecastError] = useState(null)

  const [windSpeed, setWindSpeed] = useState(6) // m/s
  const [windDirection, setWindDirection] = useState(270) // degrees, FROM

  // Load persisted state from the database on first mount. If there's no
  // database configured (or the backend is unreachable), keep the local
  // mock defaults declared above so the app still works standalone.
  useEffect(() => {
    let cancelled = false
    getState()
      .then((state) => {
        if (cancelled) return
        setIncidents(state.incidents)
        setAlerts(state.alerts)
        setActions(state.actions)
        setWarningsIssued(state.warningsIssued)
        setPersisted(true)
        if (state.incidents.some((i) => i.status === 'WARNING ISSUED')) setWarningStatus('ISSUED')
      })
      .catch(() => setPersisted(false))
    return () => { cancelled = true }
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }, [])

  const activeIncident = useMemo(
    () => incidents.find((i) => i.id === activeIncidentId) || incidents[0],
    [incidents, activeIncidentId],
  )

  const focusIncident = useCallback((id) => {
    setActiveIncidentId(id)
    const inc = incidents.find((i) => i.id === id)
    if (inc) setMapFocus({ lat: inc.lat, lng: inc.lng, ts: Date.now() })
  }, [incidents])

  const focusAlert = useCallback((alert) => {
    setMapFocus({ lat: alert.lat, lng: alert.lng, ts: Date.now() })
    if (alert.incidentId) setActiveIncidentId(alert.incidentId)
  }, [])

  const pushAlert = useCallback((text, coords) => {
    setAlerts((prev) => [
      {
        id: `AL-${prev.length + 1}`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text,
        incidentId: activeIncidentId,
        lat: coords?.lat ?? activeIncident?.lat,
        lng: coords?.lng ?? activeIncident?.lng,
      },
      ...prev,
    ])
  }, [activeIncidentId, activeIncident])

  const issueWarning = useCallback(async () => {
    try {
      const result = await apiIssueWarning(activeIncidentId)
      setIncidents((prev) => prev.map((i) => (i.id === result.incident.id ? result.incident : i)))
      setAlerts((prev) => [result.alert, ...prev])
      setWarningsIssued(result.warningsIssued)
    } catch {
      // No database configured — fall back to a local-only update.
      setIncidents((prev) => prev.map((i) => (i.id === activeIncidentId ? { ...i, status: 'WARNING ISSUED' } : i)))
      setWarningsIssued((n) => n + 1)
      pushAlert('Coastal warning issued to authorities')
    }
    setWarningStatus('ISSUED')
    setToast('Warning issued — coastal authorities and response teams notified.')
    window.setTimeout(() => setToast(null), 4200)
  }, [activeIncidentId, pushAlert])

  const updateActionStatus = useCallback(async (id, status) => {
    // Update immediately for a snappy UI, then reconcile with the server.
    setActions((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)))
    try {
      await apiUpdateActionStatus(id, status)
    } catch {
      // No database configured — the optimistic local update above stands.
    }
  }, [])

  const recordAnalysis = useCallback((result) => {
    setIncidents((prev) => {
      const exists = prev.some((i) => i.id === result.id)
      if (exists) return prev.map((i) => (i.id === result.id ? { ...i, ...result } : i))
      return [result, ...prev]
    })
    setActiveIncidentId(result.id)
    if (result.lat != null && result.lng != null) {
      setMapFocus({ lat: result.lat, lng: result.lng, ts: Date.now() })
    }
    pushAlert(`New detection confirmed — ${result.area} km² estimated`, { lat: result.lat, lng: result.lng })
  }, [pushAlert])

  // ---- Real AI pipeline actions ------------------------------------------

  const runForecast = useCallback(async (lat, lon, speed, direction, incidentId) => {
    setForecasting(true)
    setForecastError(null)
    try {
      const result = await forecastSpread({
        latitude: lat,
        longitude: lon,
        windSpeedMps: speed ?? windSpeed,
        windDirectionDeg: direction ?? windDirection,
        incidentId: incidentId ?? null,
      })
      setForecast(result)
      return result
    } catch (err) {
      setForecastError(err.message || 'Forecast failed')
      return null
    } finally {
      setForecasting(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windSpeed, windDirection])

  const runDetection = useCallback(async ({ file, useSample } = {}) => {
    setDetecting(true)
    setDetectError(null)
    try {
      const result = await detectOil({ file, useSample })
      setDetection(result)

      if (result.oil_detected && result.incident) {
        const top = result.regions[0]
        const outcome = {
          id: result.incident.id,
          area: result.incident.area,
          confidence: result.incident.confidence,
          severity: result.incident.severity,
          classification: result.incident.classification,
          detectedAt: result.incident.detectedAt,
          location: result.incident.location,
          status: result.incident.status,
          lat: result.incident.lat,
          lng: result.incident.lng,
        }
        recordAnalysis(outcome)
        // Immediately forecast where the largest detected slick will drift,
        // saved against this incident when a database is configured.
        runForecast(top.latitude, top.longitude, windSpeed, windDirection, result.incident.id)
      }

      return result
    } catch (err) {
      setDetectError(err.message || 'Detection failed')
      return null
    } finally {
      setDetecting(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordAnalysis, runForecast, windSpeed, windDirection])

  // ---- Derived, human-readable summaries of the raw model output ---------

  const predictionMeta = useMemo(() => {
    if (!forecast) return DEFAULT_PREDICTION_META
    const meta = {}
    for (const item of forecast.forecast) {
      const key = `${item.hours}h`
      const speedKmh = mpsToKmh(item.effective_speed_mps)
      const distanceToCoastKm = distanceToPolylineKm(item.latitude, item.longitude, COASTLINE)
      const arrivalHours = speedKmh > 0.05 ? distanceToCoastKm / speedKmh : Infinity
      meta[key] = {
        direction: `${bearingToCompass(item.direction_degrees)}, ${Math.round(item.direction_degrees)}°`,
        velocity: `${speedKmh.toFixed(2)} km/h`,
        distanceKm: item.distance_km,
        distanceToCoastKm: Math.round(distanceToCoastKm * 10) / 10,
        arrival: Number.isFinite(arrivalHours) ? `~${Math.max(1, Math.round(arrivalHours))} hours` : '—',
        confidence: null,
      }
    }
    return { ...DEFAULT_PREDICTION_META, ...meta }
  }, [forecast])

  const conditions = useMemo(() => {
    if (!forecast) return DEFAULT_CONDITIONS
    const oneHour = forecast.forecast.find((f) => f.hours === 1) || forecast.forecast[0]
    const currentSpeedKmh = oneHour ? mpsToKmh(Math.hypot(oneHour.current_u_mps, oneHour.current_v_mps)) : null
    return {
      windDirection: bearingToCompass((forecast.wind.direction_from_degrees + 180) % 360),
      windSpeed: `${mpsToKmh(forecast.wind.speed_mps).toFixed(1)} km/h`,
      current: currentSpeedKmh != null
        ? `${(currentSpeedKmh / 1.852).toFixed(1)} kn near ${forecast.current_grid_point.latitude.toFixed(2)}°N, ${forecast.current_grid_point.longitude.toFixed(2)}°E`
        : DEFAULT_CONDITIONS.current,
    }
  }, [forecast])

  // Map geometry derived straight from the AI output (falls back to the
  // static demo geometry in MapView when there's no real result yet).
  const spillRegions = useMemo(() => {
    if (!detection?.regions?.length) return null
    return detection.regions.map((r) => ({
      id: r.region_id,
      lat: r.latitude,
      lng: r.longitude,
      areaKm2: r.area_km2,
      radiusKm: areaKm2ToRadiusKm(r.area_km2),
    }))
  }, [detection])

  const driftForecastPoints = useMemo(() => {
    if (!forecast) return null
    const baseRadiusKm = spillRegions?.[0]?.radiusKm ?? 0.3
    const initial = forecast.initial_location
    const points = [{ hours: 0, lat: initial.latitude, lng: initial.longitude, radiusKm: baseRadiusKm }]
    for (const item of forecast.forecast) {
      // Illustrative diffusion growth on top of the AI-predicted drift
      // position — the AI module predicts movement, not footprint growth.
      const radiusKm = baseRadiusKm + item.distance_km * 0.12
      points.push({ hours: item.hours, lat: item.latitude, lng: item.longitude, radiusKm })
    }
    return points
  }, [forecast, spillRegions])

  const value = {
    incidents, alerts, actions, activeIncident, activeIncidentId, persisted,
    warningsIssued, warningStatus, mapFocus, horizon, toast,
    theme, toggleTheme,
    setHorizon, focusIncident, focusAlert, issueWarning, updateActionStatus,
    recordAnalysis, setToast, horizons: HORIZONS,

    // AI pipeline
    detection, detecting, detectError, runDetection,
    forecast, forecasting, forecastError, runForecast,
    windSpeed, setWindSpeed, windDirection, setWindDirection,
    predictionMeta, conditions, spillRegions, driftForecastPoints,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
