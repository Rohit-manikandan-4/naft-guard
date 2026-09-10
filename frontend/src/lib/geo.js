// Small geo helpers used to turn the AI module's raw numbers (a lat/lon
// point, an area in km², a bearing in degrees) into things Leaflet can draw.

const EARTH_RADIUS_KM = 6371
const KM_PER_DEG_LAT = 111.32

export function kmToDegLat(km) {
  return km / KM_PER_DEG_LAT
}

export function kmToDegLon(km, atLatDeg) {
  const factor = Math.cos((atLatDeg * Math.PI) / 180)
  return km / (KM_PER_DEG_LAT * (Math.abs(factor) < 1e-6 ? 1e-6 : factor))
}

// Approximate circle (as a lat/lon polygon) centred on a point — used to
// draw the detected slick footprint and the forecast spread radius, since
// the AI module reports an area / a point, not a boundary polygon.
export function circlePolygon(lat, lon, radiusKm, points = 40) {
  const coords = []
  for (let i = 0; i <= points; i += 1) {
    const angle = (i / points) * 2 * Math.PI
    const dLat = kmToDegLat(radiusKm * Math.cos(angle))
    const dLon = kmToDegLon(radiusKm * Math.sin(angle), lat)
    coords.push([lat + dLat, lon + dLon])
  }
  return coords
}

// A circle with the same area as the AI-reported km² figure.
export function areaKm2ToRadiusKm(areaKm2) {
  if (!areaKm2 || areaKm2 <= 0) return 0.15
  return Math.sqrt(areaKm2 / Math.PI)
}

export function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a))
}

// Distance in km from a point to the nearest vertex of a polyline (coastline).
// Coarse but fine for a "time to coast" estimate at this scale.
export function distanceToPolylineKm(lat, lon, polyline) {
  let best = Infinity
  for (const [plat, plon] of polyline) {
    const d = haversineKm(lat, lon, plat, plon)
    if (d < best) best = d
  }
  return best
}

const COMPASS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
]

export function bearingToCompass(deg) {
  const normalized = ((deg % 360) + 360) % 360
  const index = Math.round(normalized / 22.5) % 16
  return COMPASS[index]
}

export function mpsToKmh(mps) {
  return mps * 3.6
}
