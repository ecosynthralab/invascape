// INVASCAPE predictor grid export (corrected). Paste into the GEE Code Editor and press Run.
// Then open the Tasks tab and start the five exports (one per state), and join the CSVs (same columns).
// Output columns: lat, lng, dist_road_m, dist_cropland_m.
// Do not add print() calls on the grid: they run in interactive memory and fail. Check the CSVs instead.

var STATES = ['Anambra', 'Enugu', 'Imo', 'Abia', 'Ebonyi'];
var DIST_SCALE = 500;     // distances are computed at 500 m, then read at each 1 km grid point
var CAP_PIXELS = 60;      // cropland distance is capped at CAP_PIXELS * DIST_SCALE = 30 km
var GRID_SPACING = 1000;
var EDGE_BUFFER = 35000;  // metres of data around each state so distances near borders are right

var gaul = ee.FeatureCollection('FAO/GAUL/2025/level1')
  .filter(ee.Filter.eq('GAUL0_NAME', 'Nigeria'));
var roads = ee.FeatureCollection('projects/ecosynthralab/assets/SE_Roads');
var worldcover = ee.ImageCollection('ESA/WorldCover/v200').first();

STATES.forEach(function(name) {
  var aoi = gaul.filter(ee.Filter.eq('GAUL1_NAME', name)).geometry();
  var work = aoi.buffer(EDGE_BUFFER);

  // Roads: distance in metres, capped at 50 km.
  var distRoad = roads.filterBounds(work).distance(50000)
    .reproject({crs: 'EPSG:4326', scale: DIST_SCALE})
    .rename('dist_road_m');

  // Cropland: fastDistanceTransform measures distance to the nearest ZERO pixel, so cropland must be
  // the zero pixels (input = "not cropland"). reduceResolution(max) keeps small cropland patches.
  var cropland = worldcover.clip(work).eq(40)
    .reduceResolution({reducer: ee.Reducer.max(), maxPixels: 4096})
    .reproject({crs: 'EPSG:4326', scale: DIST_SCALE});
  var distCropland = cropland.not()
    .fastDistanceTransform(CAP_PIXELS).sqrt()
    .multiply(DIST_SCALE)
    .rename('dist_cropland_m');

  var sampleImage = distRoad
    .addBands(distCropland)
    .addBands(ee.Image.pixelLonLat().rename(['lng', 'lat']));

  var grid = sampleImage.sample({
    region: aoi,
    scale: GRID_SPACING,
    projection: 'EPSG:4326',
    geometries: false
  });

  Export.table.toDrive({
    collection: grid,
    description: 'predictor_grid_' + name,
    fileFormat: 'CSV',
    selectors: ['lat', 'lng', 'dist_road_m', 'dist_cropland_m']
  });
});
