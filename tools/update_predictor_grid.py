"""Refresh predictor-grid.csv from Google Earth Engine.

Mirrors gee_predictor_grid_export.js. Each state is exported to an Earth Engine asset (free, no Cloud
Storage billing), read back page by page, and written to predictor-grid.csv. The file is only replaced
if it passes sanity checks.
"""
import csv
import os
import statistics
import sys
import time

import ee

PROJECT = os.environ.get("EE_PROJECT", "ecosynthralab")
ROADS_ASSET = f"projects/{PROJECT}/assets/SE_Roads"
STATES = ["Anambra", "Enugu", "Imo", "Abia", "Ebonyi"]
DIST_SCALE = 500
CAP_PIXELS = 60
GRID_SPACING = 1000
EDGE_BUFFER = 35000
COLUMNS = ["lat", "lng", "dist_road_m", "dist_cropland_m"]
OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "predictor-grid.csv")


def init():
    import google.auth

    scopes = [
        "https://www.googleapis.com/auth/earthengine",
        "https://www.googleapis.com/auth/cloud-platform",
    ]
    # Credentials come from workload identity federation (set up by google-github-actions/auth).
    creds, _ = google.auth.default(scopes=scopes)
    ee.Initialize(creds, project=PROJECT)


def state_grid(name):
    gaul = ee.FeatureCollection("FAO/GAUL/2025/level1").filter(ee.Filter.eq("GAUL0_NAME", "Nigeria"))
    states = gaul.filter(ee.Filter.eq("GAUL1_NAME", name))
    if states.size().getInfo() != 1:
        sys.exit(f"Expected exactly one state named {name} in FAO GAUL 2025")
    aoi = states.geometry()
    work = aoi.buffer(EDGE_BUFFER)
    roads = ee.FeatureCollection(ROADS_ASSET).filterBounds(work)
    dist_road = (
        roads.distance(50000)
        .reproject(crs="EPSG:4326", scale=DIST_SCALE)
        .rename("dist_road_m")
    )
    worldcover = ee.ImageCollection("ESA/WorldCover/v200").first()
    # Distance is measured to the nearest zero pixel, so cropland must be the zero pixels.
    cropland = (
        worldcover.clip(work)
        .eq(40)
        .reduceResolution(reducer=ee.Reducer.max(), maxPixels=4096)
        .reproject(crs="EPSG:4326", scale=DIST_SCALE)
    )
    dist_cropland = (
        cropland.Not()
        .fastDistanceTransform(CAP_PIXELS)
        .sqrt()
        .multiply(DIST_SCALE)
        .rename("dist_cropland_m")
    )
    sample_image = dist_road.addBands(dist_cropland).addBands(
        ee.Image.pixelLonLat().rename(["lng", "lat"])
    )
    # Asset exports need a geometry on every feature, so keep the sample point geometry.
    grid = sample_image.sample(
        region=aoi, scale=GRID_SPACING, projection="EPSG:4326", geometries=True
    )
    return grid.select(COLUMNS)


def export_state(name):
    asset_id = f"projects/{PROJECT}/assets/predictor_grid_{name}"
    try:
        ee.data.deleteAsset(asset_id)
    except ee.EEException:
        pass
    task = ee.batch.Export.table.toAsset(
        collection=state_grid(name), description=f"predictor_grid_{name}", assetId=asset_id
    )
    task.start()
    return task, asset_id


def wait(tasks, timeout_s=3 * 3600):
    start = time.time()
    while True:
        statuses = [t.status() for t in tasks]
        states = {s["state"] for s in statuses}
        if states <= {"COMPLETED"}:
            return
        bad = [s for s in statuses if s["state"] in ("FAILED", "CANCELLED", "CANCEL_REQUESTED")]
        if bad:
            sys.exit(f"Export failed: {bad}")
        if time.time() - start > timeout_s:
            sys.exit("Timed out waiting for exports")
        time.sleep(30)


def read_asset(asset_id):
    rows, token = [], None
    while True:
        params = {"assetId": asset_id, "pageSize": 5000}
        if token:
            params["pageToken"] = token
        page = ee.data.listFeatures(params)
        rows += [f["properties"] for f in page.get("features", [])]
        token = page.get("nextPageToken") or page.get("next_page_token")
        if not token:
            return rows


def existing_row_count():
    try:
        with open(OUT_PATH, newline="") as f:
            return sum(1 for _ in f) - 1
    except FileNotFoundError:
        return 0


def validate(rows):
    old = existing_row_count()
    if old and not (0.9 * old <= len(rows) <= 1.1 * old):
        sys.exit(f"Row count {len(rows)} is more than 10% away from the current {old}; not replacing")
    cropland = [r["dist_cropland_m"] for r in rows]
    road = [r["dist_road_m"] for r in rows]
    zero_share = sum(1 for x in cropland if x == 0) / len(cropland)
    if zero_share > 0.8 or statistics.median(road) > 5000:
        sys.exit("Distance values look implausible; not replacing")


def main():
    init()
    jobs = [export_state(n) for n in STATES]
    wait([t for t, _ in jobs])
    seen = {}
    for name, (_, asset_id) in zip(STATES, jobs):
        state_rows = read_asset(asset_id)
        print(f"{name}: {len(state_rows)} points", flush=True)
        for r in state_rows:
            seen[(round(r["lat"], 5), round(r["lng"], 5))] = r
    rows = [seen[k] for k in sorted(seen)]
    validate(rows)
    with open(OUT_PATH, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(COLUMNS)
        for r in rows:
            w.writerow([r[c] for c in COLUMNS])
    print(f"Wrote {len(rows)} grid points")


if __name__ == "__main__":
    main()
