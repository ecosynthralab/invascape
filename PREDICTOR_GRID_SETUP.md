# Predictor Grid — one-time setup

The Decision Layer matches each plot's GPS point to the nearest value in a
`dist_road` / `dist_cropland` grid, automatically. Field workers, the general
public, and your co-researchers never touch this — it's a one-time (or
occasional, if you re-run your GEE stack) task for whoever manages the GEE
pipeline.

## What to do

1. Open the Earth Engine Code Editor and adapt the script below to your
   existing AOI geometry and `dist_road` / `dist_cropland` images (the same
   ones from your 6-band predictor stack).
2. Run it, then start the Export task from the **Tasks** tab (Export to Drive).
3. Download the resulting CSV from Drive, rename it to exactly
   `predictor-grid.csv`, and place it in this same folder — next to
   `index.html`, `decision.html`, etc.
4. Redeploy the folder to Netlify. The Decision Layer will pick it up
   automatically; no code changes needed.

Grid spacing matters a lot more now that the AOI is Southeast Nigeria-wide
rather than a single ~30×50km study area. At the old 100–250m spacing, a
five-state grid would run into the millions of points — too large to fetch
and search client-side, and slow to export from GEE. Use **500m–1km spacing**
for this scale instead:

- 1km spacing across ~28,000km² (Abia + Anambra + Ebonyi + Enugu + Imo)
  ≈ 28,000 points — a CSV of a few MB, fast to load and search.
- Your predictors are smooth distance surfaces, so this coarser resolution
  is a reasonable match for triaging plots at regional scale; it's the
  100–250m grid that would have been overkill here, not the other way round.
- Re-export and swap the file only if you significantly change the
  underlying GEE stack (e.g. new AOI, new road/cropland source data) — same
  one-time-task principle as before, just a bigger one-time task.

## GEE script (adapt variable names to your actual objects)

```javascript
// --- Adapt these three lines to your existing script ---
var aoi = /* your existing AOI geometry */;
var distRoad = /* your existing dist_road image, in metres */;
var distCropland = /* your existing dist_cropland image, in metres */;
// ---------------------------------------------------------

var gridSpacingMeters = 1000; // 500-1000m recommended at Southeast Nigeria scale

var grid = ee.Image.pixelLonLat()
  .reduceToVectors({
    geometry: aoi,
    scale: gridSpacingMeters,
    geometryType: 'centroid',
    labelProperty: 'zone',
    maxPixels: 1e9
  });

var sampled = distRoad.rename('dist_road_m')
  .addBands(distCropland.rename('dist_cropland_m'))
  .reduceRegions({
    collection: grid,
    reducer: ee.Reducer.first(),
    scale: gridSpacingMeters
  });

var withCoords = sampled.map(function(f){
  var coords = f.geometry().coordinates();
  return f.set({lng: coords.get(0), lat: coords.get(1)});
});

Export.table.toDrive({
  collection: withCoords,
  description: 'flora_anambra_predictor_grid',
  fileFormat: 'CSV',
  selectors: ['lat', 'lng', 'dist_road_m', 'dist_cropland_m']
});
```

## CSV format expected by the app

```
lat,lng,dist_road_m,dist_cropland_m
6.2103,6.9412,84.2,310.5
6.2115,6.9420,102.7,298.1
...
```

Column order doesn't matter — the app matches by header name (looks for
`lat`, `lng`/`lon`, `road`, `crop` as substrings, case-insensitive).

## Fallback

If `predictor-grid.csv` is missing, the Decision Layer still works — it just
shows spatial predictors as unmatched and treats proximity as "unknown" in
the priority-tier rules. The "Advanced: manual override" CSV import on the
Decision Layer page (by Plot ID) still exists if you ever need to hand-correct
a specific plot.
