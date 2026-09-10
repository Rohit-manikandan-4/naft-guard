"""
ONNX Runtime inference path — a memory-lighter alternative to AI_MODULE's own
torch-based predict.py, for memory-constrained deployments (torch alone adds
~150MB of resident memory just from being imported; onnxruntime adds ~30MB).

AI_MODULE itself is NOT modified. This file duplicates the non-torch-specific
parts of predict.py's detect_oil() (image I/O, normalization, thresholding,
region extraction, output saving) verbatim, and only replaces the model
loading + forward pass with an ONNX Runtime session running the exact same
trained weights (exported once via export_onnx.py, verified to match the
torch model's output within floating-point noise, see that script's docstring
for how to reproduce that check).

Selected via the INFERENCE_ENGINE=onnx environment variable in app.py; the
default (unset) still uses AI_MODULE's own predict.detect_oil() untouched.
"""

import os
import json

import numpy as np
import onnxruntime as ort
import rasterio
from rasterio.transform import xy
from pyproj import Transformer
from scipy import ndimage

TILE_SIZE = 256
OVERLAP = 128
THRESHOLD = 0.50
MIN_REGION_PIXELS = 100

_session = None
_session_path = None


def _get_session(onnx_model_path: str) -> ort.InferenceSession:
    global _session, _session_path
    if _session is None or _session_path != onnx_model_path:
        _session = ort.InferenceSession(onnx_model_path, providers=["CPUExecutionProvider"])
        _session_path = onnx_model_path
    return _session


def normalize_image(image):
    valid = image[np.isfinite(image)]
    if len(valid) == 0:
        raise ValueError("Input image contains no valid pixels.")
    p1, p99 = np.percentile(valid, [1, 99])
    image = np.clip(image, p1, p99)
    image = (image - p1) / (p99 - p1 + 1e-6)
    return image.astype(np.float32)


def _predict_full_image_onnx(session, image):
    height, width = image.shape
    probability_sum = np.zeros((height, width), dtype=np.float32)
    prediction_count = np.zeros((height, width), dtype=np.float32)
    stride = TILE_SIZE - OVERLAP
    input_name = session.get_inputs()[0].name

    for y in range(0, height, stride):
        for x in range(0, width, stride):
            y2 = min(y + TILE_SIZE, height)
            x2 = min(x + TILE_SIZE, width)
            tile = image[y:y2, x:x2]
            original_h, original_w = tile.shape
            pad_h = TILE_SIZE - original_h
            pad_w = TILE_SIZE - original_w
            if pad_h > 0 or pad_w > 0:
                tile = np.pad(tile, ((0, pad_h), (0, pad_w)), mode="reflect")

            tensor = tile[np.newaxis, np.newaxis, :, :].astype(np.float32)
            output = session.run(None, {input_name: tensor})[0]
            probability = 1.0 / (1.0 + np.exp(-output))  # sigmoid
            probability = probability[0, 0, :original_h, :original_w]

            probability_sum[y:y2, x:x2] += probability
            prediction_count[y:y2, x:x2] += 1

    return probability_sum / np.maximum(prediction_count, 1)


def extract_regions(mask, transform, crs):
    labeled, number = ndimage.label(mask)
    regions = []

    pixel_width = abs(transform.a)
    pixel_height = abs(transform.e)

    if crs is not None and crs.is_projected:
        pixel_area_km2 = (pixel_width * pixel_height) / 1_000_000.0
    else:
        pixel_area_km2 = None

    if crs is not None and crs.to_epsg() != 4326:
        transformer = Transformer.from_crs(crs, "EPSG:4326", always_xy=True)
    else:
        transformer = None

    for component_id in range(1, number + 1):
        rows, cols = np.where(labeled == component_id)
        pixel_count = len(rows)
        if pixel_count < MIN_REGION_PIXELS:
            continue

        center_row = float(np.mean(rows))
        center_col = float(np.mean(cols))
        x, y = xy(transform, center_row, center_col)

        if transformer is not None:
            longitude, latitude = transformer.transform(x, y)
        else:
            longitude, latitude = x, y

        area_km2 = (pixel_count * pixel_area_km2) if pixel_area_km2 is not None else None

        regions.append({
            "pixels": int(pixel_count),
            "latitude": round(float(latitude), 6),
            "longitude": round(float(longitude), 6),
            "area_km2": round(area_km2, 4) if area_km2 is not None else None,
        })

    regions.sort(key=lambda r: r["pixels"], reverse=True)
    for i, region in enumerate(regions, start=1):
        region["region_id"] = i
    return regions


def detect_oil_onnx(image_path, onnx_model_path, output_dir=None, threshold=THRESHOLD):
    session = _get_session(onnx_model_path)

    with rasterio.open(image_path) as src:
        image = src.read(1).astype(np.float32)
        transform = src.transform
        crs = src.crs
        nodata = src.nodata
        metadata = src.meta.copy()

    valid_mask = np.isfinite(image)
    if nodata is not None:
        valid_mask &= (image != nodata)
    if not np.any(valid_mask):
        raise ValueError("No valid pixels found.")

    normalized = normalize_image(image)
    normalized[~valid_mask] = 0

    probability_map = _predict_full_image_onnx(session, normalized)
    probability_map[~valid_mask] = 0

    binary_mask = probability_map >= threshold
    binary_mask[~valid_mask] = False

    oil_pixels = int(np.sum(binary_mask))
    valid_pixels = int(np.sum(valid_mask))
    coverage = (oil_pixels / valid_pixels * 100) if valid_pixels else 0.0

    regions = extract_regions(binary_mask, transform, crs)
    total_area = sum(r["area_km2"] for r in regions if r["area_km2"] is not None)
    oil_detected = len(regions) > 0

    result = {
        "oil_detected": oil_detected,
        "probable_oil_area_km2": round(total_area, 4),
        "predicted_coverage_percent": round(coverage, 2),
        "threshold": threshold,
        "regions": regions,
        "model": "NEFT-GUARD Small U-Net (ONNX Runtime)",
        "warning": "Detected regions are probable oil-spill candidates and require verification.",
    }

    if output_dir is not None:
        os.makedirs(output_dir, exist_ok=True)

        mask_path = os.path.join(output_dir, "oil_mask.tif")
        mask_metadata = metadata.copy()
        mask_metadata.update({"dtype": "uint8", "count": 1, "nodata": 0})
        with rasterio.open(mask_path, "w", **mask_metadata) as dst:
            dst.write(binary_mask.astype(np.uint8), 1)

        probability_path = os.path.join(output_dir, "oil_probability.tif")
        probability_metadata = metadata.copy()
        probability_metadata.update({"dtype": "float32", "count": 1, "nodata": 0})
        with rasterio.open(probability_path, "w", **probability_metadata) as dst:
            dst.write(probability_map.astype(np.float32), 1)

        with open(os.path.join(output_dir, "oil_detection_result.json"), "w", encoding="utf-8") as f:
            json.dump(result, f, indent=4)

    return result
