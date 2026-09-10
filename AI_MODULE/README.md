# NEFT-GUARD AI Module

AI module for detecting probable oil spills from Sentinel-1 SAR satellite imagery
and estimating short-term probable spill movement using wind and ocean-current data.

---

## 1. AI Pipeline

Sentinel-1 SAR GeoTIFF
        ↓
U-Net Segmentation Model
        ↓
Probable Oil-Spill Mask
        ↓
Connected Region Detection
        ↓
Latitude / Longitude / Area
        ↓
Wind + Ocean Current
        ↓
Probable Spread Forecast
        ↓
+1h / +3h / +6h / +12h


---

## 2. Folder Structure

AI_MODULE/
│
├── data/
│   └── ocean_current_2018_09_26.nc
│
├── inference/
│   ├── model.py
│   ├── predict.py
│   └── spread_forecast.py
│
├── models/
│   └── oil_segmentation_model.pth
│
├── sample/
│   └── 2018_09_26.tif
│
├── requirements.txt
└── README.md


---

## 3. Oil Spill Detection

### Input

A georeferenced Sentinel-1 SAR GeoTIFF.

Example:

sample/2018_09_26.tif

The image should contain:

- SAR backscatter data
- A valid CRS
- Geospatial transform information

The current model was trained using Sentinel-1 VV SAR data.


### Model

The model is a custom lightweight U-Net segmentation network.

The model predicts a probability for every pixel:

- Low probability → background
- High probability → probable oil

The default detection threshold is:

0.50


### Run Detection

From the AI_MODULE directory:

```bash
python inference/predict.py "sample/2018_09_26.tif" --output "sample/output"