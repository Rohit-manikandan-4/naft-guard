import os
import json
import argparse

import numpy as np
import torch
import rasterio
from rasterio.transform import xy
from pyproj import Transformer
from scipy import ndimage

from model import load_model


# ============================================================
# SETTINGS
# ============================================================

MODEL_PATH = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    "models",
    "oil_segmentation_model.pth"
)

TILE_SIZE = 256
OVERLAP = 128
THRESHOLD = 0.50
MIN_REGION_PIXELS = 100


# ============================================================
# IMAGE NORMALIZATION
# ============================================================

def normalize_image(image):

    valid = image[np.isfinite(image)]

    if len(valid) == 0:
        raise ValueError(
            "Input image contains no valid pixels."
        )

    p1, p99 = np.percentile(
        valid,
        [1, 99]
    )

    image = np.clip(
        image,
        p1,
        p99
    )

    image = (
        image - p1
    ) / (
        p99 - p1 + 1e-6
    )

    return image.astype(
        np.float32
    )


# ============================================================
# FULL IMAGE PREDICTION
# ============================================================

def predict_full_image(
    model,
    image,
    device
):

    height, width = image.shape

    probability_sum = np.zeros(
        (height, width),
        dtype=np.float32
    )

    prediction_count = np.zeros(
        (height, width),
        dtype=np.float32
    )

    stride = TILE_SIZE - OVERLAP

    model.eval()

    with torch.no_grad():

        for y in range(
            0,
            height,
            stride
        ):

            for x in range(
                0,
                width,
                stride
            ):

                y2 = min(
                    y + TILE_SIZE,
                    height
                )

                x2 = min(
                    x + TILE_SIZE,
                    width
                )

                tile = image[
                    y:y2,
                    x:x2
                ]

                original_h, original_w = (
                    tile.shape
                )

                pad_h = (
                    TILE_SIZE -
                    original_h
                )

                pad_w = (
                    TILE_SIZE -
                    original_w
                )

                if pad_h > 0 or pad_w > 0:

                    tile = np.pad(
                        tile,
                        (
                            (0, pad_h),
                            (0, pad_w)
                        ),
                        mode="reflect"
                    )

                tensor = torch.from_numpy(
                    tile
                )

                tensor = tensor.unsqueeze(
                    0
                ).unsqueeze(
                    0
                )

                tensor = tensor.to(
                    device
                )

                output = model(
                    tensor
                )

                probability = torch.sigmoid(
                    output
                )

                probability = (
                    probability
                    .squeeze()
                    .cpu()
                    .numpy()
                )

                probability = probability[
                    :original_h,
                    :original_w
                ]

                probability_sum[
                    y:y2,
                    x:x2
                ] += probability

                prediction_count[
                    y:y2,
                    x:x2
                ] += 1

    probability_map = (
        probability_sum /
        np.maximum(
            prediction_count,
            1
        )
    )

    return probability_map


# ============================================================
# REGION EXTRACTION
# ============================================================

def extract_regions(
    mask,
    transform,
    crs
):

    labeled, number = ndimage.label(
        mask
    )

    regions = []

    pixel_width = abs(
        transform.a
    )

    pixel_height = abs(
        transform.e
    )

    # Pixel area in km²
    if (
        crs is not None
        and crs.is_projected
    ):

        pixel_area_km2 = (
            pixel_width *
            pixel_height
        ) / 1_000_000.0

    else:

        pixel_area_km2 = None

    # Convert UTM/projected coordinates
    # to WGS84 latitude/longitude
    if (
        crs is not None
        and crs.to_epsg() != 4326
    ):

        transformer = Transformer.from_crs(
            crs,
            "EPSG:4326",
            always_xy=True
        )

    else:

        transformer = None

    for component_id in range(
        1,
        number + 1
    ):

        rows, cols = np.where(
            labeled == component_id
        )

        pixel_count = len(rows)

        if pixel_count < MIN_REGION_PIXELS:
            continue

        center_row = float(
            np.mean(rows)
        )

        center_col = float(
            np.mean(cols)
        )

        x, y = xy(
            transform,
            center_row,
            center_col
        )

        # Convert projected coordinates
        if transformer is not None:

            longitude, latitude = (
                transformer.transform(
                    x,
                    y
                )
            )

        else:

            longitude = x
            latitude = y

        if pixel_area_km2 is not None:

            area_km2 = (
                pixel_count *
                pixel_area_km2
            )

        else:

            area_km2 = None

        regions.append(
            {
                "pixels": int(
                    pixel_count
                ),

                "latitude": round(
                    float(latitude),
                    6
                ),

                "longitude": round(
                    float(longitude),
                    6
                ),

                "area_km2": (
                    round(
                        area_km2,
                        4
                    )
                    if area_km2 is not None
                    else None
                )
            }
        )

    # Largest regions first
    regions.sort(
        key=lambda r: r["pixels"],
        reverse=True
    )

    # Give clean region IDs
    for i, region in enumerate(
        regions,
        start=1
    ):

        region["region_id"] = i

    return regions


# ============================================================
# MAIN AI FUNCTION
# ============================================================

def detect_oil(
    image_path,
    output_dir=None,
    threshold=THRESHOLD
):

    print()
    print("=" * 50)
    print("NEFT-GUARD OIL SPILL AI")
    print("=" * 50)

    # --------------------------------------------------------
    # Load model
    # --------------------------------------------------------

    print()
    print("Loading model...")

    model, device = load_model(
        MODEL_PATH
    )

    print(
        "Device:",
        device
    )

    # --------------------------------------------------------
    # Read image
    # --------------------------------------------------------

    print()
    print(
        "Reading:",
        image_path
    )

    with rasterio.open(
        image_path
    ) as src:

        image = src.read(
            1
        ).astype(
            np.float32
        )

        transform = src.transform
        crs = src.crs
        nodata = src.nodata

        metadata = src.meta.copy()

    print(
        "Image size:",
        image.shape[1],
        "x",
        image.shape[0]
    )

    print(
        "CRS:",
        crs
    )

    # --------------------------------------------------------
    # Valid pixels
    # --------------------------------------------------------

    valid_mask = np.isfinite(
        image
    )

    if nodata is not None:

        valid_mask &= (
            image != nodata
        )

    if not np.any(valid_mask):

        raise ValueError(
            "No valid pixels found."
        )

    # --------------------------------------------------------
    # Normalize
    # --------------------------------------------------------

    print()
    print(
        "Normalizing SAR image..."
    )

    normalized = normalize_image(
        image
    )

    normalized[
        ~valid_mask
    ] = 0

    # --------------------------------------------------------
    # AI prediction
    # --------------------------------------------------------

    print(
        "Running U-Net prediction..."
    )

    probability_map = predict_full_image(
        model,
        normalized,
        device
    )

    probability_map[
        ~valid_mask
    ] = 0

    # --------------------------------------------------------
    # Binary oil mask
    # --------------------------------------------------------

    binary_mask = (
        probability_map >= threshold
    )

    binary_mask[
        ~valid_mask
    ] = False

    oil_pixels = int(
        np.sum(binary_mask)
    )

    valid_pixels = int(
        np.sum(valid_mask)
    )

    coverage = (
        oil_pixels /
        valid_pixels *
        100
    )

    print()
    print(
        "Probable oil pixels:",
        oil_pixels
    )

    print(
        "Valid pixels:",
        valid_pixels
    )

    print(
        "Predicted coverage:",
        round(
            coverage,
            2
        ),
        "%"
    )

    # --------------------------------------------------------
    # Regions
    # --------------------------------------------------------

    print()
    print(
        "Finding regions..."
    )

    regions = extract_regions(
        binary_mask,
        transform,
        crs
    )

    # --------------------------------------------------------
    # Total area
    # --------------------------------------------------------

    total_area = sum(
        region["area_km2"]
        for region in regions
        if region["area_km2"] is not None
    )

    oil_detected = (
        len(regions) > 0
    )

    # --------------------------------------------------------
    # Result
    # --------------------------------------------------------

    result = {

        "oil_detected": oil_detected,

        "probable_oil_area_km2": round(
            total_area,
            4
        ),

        "predicted_coverage_percent": round(
            coverage,
            2
        ),

        "threshold": threshold,

        "regions": regions,

        "model": "NEFT-GUARD Small U-Net",

        "warning": (
            "Detected regions are probable "
            "oil-spill candidates and require "
            "verification."
        )
    }

    # --------------------------------------------------------
    # Save outputs
    # --------------------------------------------------------

    if output_dir is not None:

        os.makedirs(
            output_dir,
            exist_ok=True
        )

        # Mask
        mask_path = os.path.join(
            output_dir,
            "oil_mask.tif"
        )

        mask_metadata = metadata.copy()

        mask_metadata.update(
            {
                "dtype": "uint8",
                "count": 1,
                "nodata": 0
            }
        )

        with rasterio.open(
            mask_path,
            "w",
            **mask_metadata
        ) as dst:

            dst.write(
                binary_mask.astype(
                    np.uint8
                ),
                1
            )

        # Probability map
        probability_path = os.path.join(
            output_dir,
            "oil_probability.tif"
        )

        probability_metadata = metadata.copy()

        probability_metadata.update(
            {
                "dtype": "float32",
                "count": 1,
                "nodata": 0
            }
        )

        with rasterio.open(
            probability_path,
            "w",
            **probability_metadata
        ) as dst:

            dst.write(
                probability_map.astype(
                    np.float32
                ),
                1
            )

        # JSON
        json_path = os.path.join(
            output_dir,
            "oil_detection_result.json"
        )

        with open(
            json_path,
            "w",
            encoding="utf-8"
        ) as f:

            json.dump(
                result,
                f,
                indent=4
            )

        print()
        print(
            "Outputs saved:"
        )

        print(
            " ",
            mask_path
        )

        print(
            " ",
            probability_path
        )

        print(
            " ",
            json_path
        )

    # --------------------------------------------------------
    # Display result
    # --------------------------------------------------------

    print()
    print("=" * 50)
    print("RESULT")
    print("=" * 50)

    if not oil_detected:

        print(
            "No probable oil region detected."
        )

    else:

        print(
            "Probable oil regions:",
            len(regions)
        )

        print(
            "Total probable area:",
            round(
                total_area,
                4
            ),
            "km²"
        )

        for region in regions:

            print()
            print(
                f"Region {region['region_id']}"
            )

            print(
                "  Latitude :",
                region["latitude"]
            )

            print(
                "  Longitude:",
                region["longitude"]
            )

            print(
                "  Area     :",
                region["area_km2"],
                "km²"
            )

    return result


# ============================================================
# COMMAND LINE
# ============================================================

if __name__ == "__main__":

    parser = argparse.ArgumentParser(
        description=(
            "NEFT-GUARD Sentinel-1 "
            "oil spill detection"
        )
    )

    parser.add_argument(
        "image",
        help=(
            "Path to georeferenced "
            "Sentinel-1 GeoTIFF"
        )
    )

    parser.add_argument(
        "--output",
        default=None,
        help="Output directory"
    )

    parser.add_argument(
        "--threshold",
        type=float,
        default=THRESHOLD,
        help="Oil probability threshold"
    )

    args = parser.parse_args()

    detect_oil(
        image_path=args.image,
        output_dir=args.output,
        threshold=args.threshold
    )