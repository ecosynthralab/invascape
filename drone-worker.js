// DEMO classifier. Replace classifyTile with the trained ONNX model; keep the message contract.
// Classes: 0 = bare soil / litter, 1 = other vegetation, 2 = target plant (not produced by the demo).
const TILE = 256;

self.onmessage = (e) => {
  const { buf, w, h } = e.data;
  const px = new Uint8ClampedArray(buf);
  const classes = new Uint8Array(w * h);
  const counts = [0, 0, 0];
  const tilesX = Math.ceil(w / TILE);
  const tilesY = Math.ceil(h / TILE);
  const total = tilesX * tilesY;
  let done = 0;

  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      classifyTile(px, w, tx * TILE, ty * TILE, Math.min((tx + 1) * TILE, w), Math.min((ty + 1) * TILE, h), classes, counts);
      done++;
      self.postMessage({ type: 'progress', value: done / total });
    }
  }
  self.postMessage({ type: 'done', classes, counts }, [classes.buffer]);
};

function classifyTile(px, w, x0, y0, x1, y1, classes, counts) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      const r = px[i], g = px[i + 1], b = px[i + 2];
      const sum = r + g + b || 1;
      const exg = (2 * g - r - b) / sum; // excess-green index
      const c = exg > 0.05 ? 1 : 0;
      classes[y * w + x] = c;
      counts[c]++;
    }
  }
}
