import os
import json
import math
import argparse

import xarray as xr


# ============================================================
# CONFIGURATION
# ============================================================

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DEFAULT_CURRENT_FILE = os.path.join(
    BASE_DIR,
    "data",
    "ocean_current_2018_09_26.nc"
)

# Wind contribution factor.
# Wind does not move the oil at 100% of wind speed.
WIND_FACTOR = 0.03

# Forecast times in hours
FORECAST_HOURS = [1, 3, 6, 12]


# ============================================================
# WIND VECTOR
# ============================================================

def wind_to_vector(speed, direction_from):
    """
    Convert meteorological wind direction into
    eastward/northward movement.

    direction_from:
        Direction the wind is coming FROM.

    Example:
        90° = wind coming from east
        therefore movement is toward west.
    """

    direction_to = (direction_from + 180) % 360

    angle = math.radians(direction_to)

    east = speed * math.sin(angle)
    north = speed * math.cos(angle)

    return east, north


# ============================================================
# DISTANCE / COORDINATE CALCULATIONS
# ============================================================

def move_location(lat, lon, east_m, north_m):
    """
    Move latitude/longitude by east/north distance in metres.
    """

    meters_per_degree_lat = 111320.0

    meters_per_degree_lon = (
        111320.0 * math.cos(math.radians(lat))
    )

    new_lat = lat + north_m / meters_per_degree_lat

    new_lon = lon + east_m / meters_per_degree_lon

    return new_lat, new_lon


def vector_speed(east, north):
    return math.sqrt(east ** 2 + north ** 2)


def vector_direction(east, north):
    """
    Convert east/north vector into
    direction of movement in degrees.

    0°   = North
    90°  = East
    180° = South
    270° = West
    """

    direction = math.degrees(math.atan2(east, north))

    if direction < 0:
        direction += 360

    return direction


# ============================================================
# LOAD OCEAN CURRENT
# ============================================================

def load_current_data(current_file):
    """
    Load Copernicus Marine ocean-current data.
    """

    if not os.path.exists(current_file):
        raise FileNotFoundError(
            f"Current data not found:\n{current_file}"
        )

    dataset = xr.open_dataset(current_file)

    return dataset


# ============================================================
# FIND NEAREST CURRENT GRID POINT
# ============================================================

def get_nearest_current(dataset, latitude, longitude):
    """
    Find the nearest available ocean-current grid point.
    """

    selected = dataset.sel(
        latitude=latitude,
        longitude=longitude,
        method="nearest"
    )

    grid_lat = float(selected.latitude.values)
    grid_lon = float(selected.longitude.values)

    return selected, grid_lat, grid_lon


# ============================================================
# FORECAST
# ============================================================

def forecast_spread(
    latitude,
    longitude,
    wind_speed,
    wind_direction,
    current_file=DEFAULT_CURRENT_FILE
):
    """
    Calculate probable oil-spill movement.

    Inputs:
        latitude
        longitude
        wind_speed (m/s)
        wind_direction (degrees, FROM direction)
        current_file

    Returns:
        Dictionary containing forecast results.
    """

    dataset = load_current_data(current_file)

    current_point, grid_lat, grid_lon = get_nearest_current(
        dataset,
        latitude,
        longitude
    )

    # --------------------------------------------------------
    # WIND
    # --------------------------------------------------------

    wind_east, wind_north = wind_to_vector(
        wind_speed,
        wind_direction
    )

    wind_east *= WIND_FACTOR
    wind_north *= WIND_FACTOR

    # --------------------------------------------------------
    # FORECAST
    # --------------------------------------------------------

    results = []

    for hours in FORECAST_HOURS:

        # Find nearest hourly current.
        # We use the forecast hour as the index.
        index = min(
            hours,
            len(dataset.time) - 1
        )

        current = current_point.isel(
            time=index,
            depth=0
        )

        current_east = float(current.uo.values)
        current_north = float(current.vo.values)

        # ----------------------------------------------------
        # COMBINE WIND + CURRENT
        # ----------------------------------------------------

        effective_east = (
            wind_east + current_east
        )

        effective_north = (
            wind_north + current_north
        )

        speed = vector_speed(
            effective_east,
            effective_north
        )

        direction = vector_direction(
            effective_east,
            effective_north
        )

        # ----------------------------------------------------
        # DISTANCE
        # ----------------------------------------------------

        total_seconds = hours * 3600

        east_distance = (
            effective_east * total_seconds
        )

        north_distance = (
            effective_north * total_seconds
        )

        distance = math.sqrt(
            east_distance ** 2 +
            north_distance ** 2
        )

        # ----------------------------------------------------
        # NEW LOCATION
        # ----------------------------------------------------

        new_lat, new_lon = move_location(
            latitude,
            longitude,
            east_distance,
            north_distance
        )

        results.append({
            "hours": hours,
            "latitude": round(new_lat, 6),
            "longitude": round(new_lon, 6),
            "distance_km": round(distance / 1000, 3),
            "effective_speed_mps": round(speed, 4),
            "direction_degrees": round(direction, 2),
            "current_u_mps": round(current_east, 4),
            "current_v_mps": round(current_north, 4)
        })

    dataset.close()

    return {
        "initial_location": {
            "latitude": latitude,
            "longitude": longitude
        },

        "wind": {
            "speed_mps": wind_speed,
            "direction_from_degrees": wind_direction,
            "contribution_factor": WIND_FACTOR
        },

        "current_grid_point": {
            "latitude": grid_lat,
            "longitude": grid_lon
        },

        "forecast": results
    }


# ============================================================
# SAVE JSON
# ============================================================

def save_forecast(result, output_file):

    os.makedirs(
        os.path.dirname(output_file),
        exist_ok=True
    )

    with open(
        output_file,
        "w",
        encoding="utf-8"
    ) as f:

        json.dump(
            result,
            f,
            indent=2
        )


# ============================================================
# COMMAND LINE
# ============================================================

def main():

    parser = argparse.ArgumentParser(
        description="NEFT-GUARD Oil Spill Spread Forecast"
    )

    parser.add_argument(
        "--lat",
        type=float,
        required=True
    )

    parser.add_argument(
        "--lon",
        type=float,
        required=True
    )

    parser.add_argument(
        "--wind-speed",
        type=float,
        required=True
    )

    parser.add_argument(
        "--wind-direction",
        type=float,
        required=True
    )

    parser.add_argument(
        "--current-file",
        default=DEFAULT_CURRENT_FILE
    )

    parser.add_argument(
        "--output",
        default=os.path.join(
            BASE_DIR,
            "sample",
            "output",
            "spread_forecast.json"
        )
    )

    args = parser.parse_args()

    print()
    print("=" * 60)
    print("NEFT-GUARD OIL SPILL SPREAD FORECAST")
    print("=" * 60)

    print()
    print("Loading Copernicus Marine current data...")

    result = forecast_spread(
        latitude=args.lat,
        longitude=args.lon,
        wind_speed=args.wind_speed,
        wind_direction=args.wind_direction,
        current_file=args.current_file
    )

    print()
    print("Initial spill location:")
    print(
        f"Latitude : {result['initial_location']['latitude']}"
    )
    print(
        f"Longitude: {result['initial_location']['longitude']}"
    )

    print()
    print("Wind:")
    print(
        f"Speed    : {args.wind_speed} m/s"
    )
    print(
        f"Direction: {args.wind_direction}° FROM"
    )

    print()
    print("Current grid point:")
    print(
        f"Latitude : "
        f"{result['current_grid_point']['latitude']}"
    )
    print(
        f"Longitude: "
        f"{result['current_grid_point']['longitude']}"
    )

    print()
    print("FORECAST")
    print("-" * 60)

    for item in result["forecast"]:

        print()
        print(
            f"+{item['hours']} hour"
        )

        print(
            f"  Current U/V : "
            f"{item['current_u_mps']} / "
            f"{item['current_v_mps']} m/s"
        )

        print(
            f"  Speed       : "
            f"{item['effective_speed_mps']} m/s"
        )

        print(
            f"  Direction   : "
            f"{item['direction_degrees']}°"
        )

        print(
            f"  Distance    : "
            f"{item['distance_km']} km"
        )

        print(
            f"  Latitude    : "
            f"{item['latitude']}"
        )

        print(
            f"  Longitude   : "
            f"{item['longitude']}"
        )

    save_forecast(
        result,
        args.output
    )

    print()
    print("=" * 60)
    print("Forecast saved:")
    print(args.output)
    print("=" * 60)
    print()


if __name__ == "__main__":
    main()