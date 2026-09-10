import { useEffect, useRef, useState } from 'react'
import { UploadCloud, ScanLine, ImagePlus, TriangleAlert } from 'lucide-react'
import { useApp } from '../../context/AppState'
import DetectionMap from '../DetectionMap'

const STAGES = [
  'Loading imagery',
  'Normalising SAR backscatter',
  'Running U-Net segmentation (tiled, CPU)',
  'Tracing probable oil regions',
  'Estimating area & confidence',
]

export default function Detection() {
  const { detection, detecting, detectError, runDetection } = useApp()
  const [source, setSource] = useState('sample') // 'sample' | 'upload'
  const [file, setFile] = useState(null)
  const [stageIndex, setStageIndex] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const fileRef = useRef(null)

  // Purely cosmetic stage/elapsed-time animation while the real inference
  // request (which can take one to a few minutes at full resolution) is in
  // flight — the actual result only ever comes from the backend.
  useEffect(() => {
    if (!detecting) return undefined
    const stageTimer = setInterval(() => {
      setStageIndex((i) => Math.min(i + 1, STAGES.length - 1))
    }, 4000)
    const clock = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => {
      clearInterval(stageTimer)
      clearInterval(clock)
    }
  }, [detecting])

  const handleFile = (e) => {
    const f = e.target.files?.[0]
    if (f) {
      setFile(f)
      setSource('upload')
    }
  }

  const runAnalysis = () => {
    setStageIndex(0)
    setElapsed(0)
    if (source === 'upload' && file) {
      runDetection({ file })
    } else {
      runDetection({ useSample: true })
    }
  }

  const canRun = !detecting && (source === 'sample' || (source === 'upload' && file))
  const topRegions = detection?.regions?.slice(0, 5) ?? []

  return (
    <div className="detection-layout">
      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Input Imagery</span>
            <h2>Select a Scene to Analyse</h2>
          </div>
        </div>

        <div className="upload-row">
          <button className="upload-tile" onClick={() => fileRef.current?.click()}>
            <UploadCloud size={20} />
            <span>{file ? file.name : 'Upload a georeferenced Sentinel-1 SAR GeoTIFF'}</span>
          </button>
          <input ref={fileRef} type="file" accept=".tif,.tiff,image/tiff" hidden onChange={handleFile} />
        </div>

        <div className="demo-grid">
          <button
            className={source === 'sample' ? 'demo-tile active' : 'demo-tile'}
            style={{ background: 'linear-gradient(135deg,#0d2624,#123230 55%,#1c433d)' }}
            onClick={() => setSource('sample')}
          >
            <ImagePlus size={16} />
            <span>Bundled Sentinel-1 sample — Gulf of Mexico, 2018-09-26</span>
          </button>
        </div>

        <p className="note">
          Runs the real NEFT-GUARD U-Net segmentation model (PyTorch, CPU) tile-by-tile over the
          full image. A full-resolution scene takes roughly 1–3 minutes.
        </p>

        <button className="btn-primary run-btn" onClick={runAnalysis} disabled={!canRun}>
          <ScanLine size={16} /> {detecting ? `Analysing… (${elapsed}s)` : 'Analyze Image'}
        </button>

        {detectError && (
          <p className="note" style={{ color: '#e2534d' }}>
            <TriangleAlert size={13} style={{ verticalAlign: '-2px' }} /> {detectError}
          </p>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">AI Detection Result</span>
            <h2>Segmentation Output</h2>
          </div>
        </div>

        {!detecting && !detection && (
          <div className="empty-state">Run an analysis to view the segmentation overlay and case metrics.</div>
        )}

        {detecting && (
          <div className="processing-block">
            <div className="scan-frame">
              <div className="scan-sweep" />
            </div>
            <ul className="stage-list">
              {STAGES.map((s, idx) => (
                <li key={s} className={idx < stageIndex ? 'done' : idx === stageIndex ? 'active' : ''}>
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {detection && !detecting && (
          <div className="result-block">
            {detection.image_bounds && detection.regions?.length > 0 ? (
              <DetectionMap
                bounds={detection.image_bounds}
                regions={detection.regions}
              />
            ) : (
              <div className="scan-frame result">
                <div className="overlay-mask" />
              </div>
            )}
            {detection.image_bounds && detection.regions?.length > 0 && (
              <p className="note">Pan and zoom the scene — circles show each detected region's location and size.</p>
            )}

            <div className="kv-grid">
              <div><label>Total probable area</label><strong>{detection.probable_oil_area_km2} km²</strong></div>
              <div><label>Coverage of scene</label><strong>{detection.predicted_coverage_percent}%</strong></div>
              <div><label>Confidence</label><strong>{detection.confidence_percent != null ? `${Math.round(detection.confidence_percent)}%` : '—'}</strong></div>
              <div><label>Regions detected</label><strong>{detection.regions?.length ?? 0}</strong></div>
            </div>

            {topRegions.length > 0 && (
              <div className="table-wrap" style={{ marginTop: 12 }}>
                <table className="data-table">
                  <thead>
                    <tr><th>Region</th><th>Latitude</th><th>Longitude</th><th>Area (km²)</th></tr>
                  </thead>
                  <tbody>
                    {topRegions.map((r) => (
                      <tr key={r.region_id}>
                        <td className="mono">#{r.region_id}</td>
                        <td>{r.latitude.toFixed(4)}</td>
                        <td>{r.longitude.toFixed(4)}</td>
                        <td>{r.area_km2}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="note">{detection.warning} Model: {detection.model}. Threshold: {detection.threshold}.</p>
          </div>
        )}

        {detection && !detection.oil_detected && !detecting && (
          <p className="note">No probable oil region met the detection threshold in this scene.</p>
        )}
      </section>
    </div>
  )
}
