// Image-assisted habitat scoring (drone and phone modes) and guided questions.
// Everything runs in the browser; no image data leaves the device.
// Uses globals from habitat-scorer.html: scores, setScore, showToast, downloadBlob, csvEscape, dateStamp.
(function () {
  'use strict';

  const MODEL = { name: 'Excess-green colour test (demo, not a trained model)', version: '0.0-demo', isDemo: true };
  const TRAIN_HEIGHT_M = 18;
  const CLASS_NAMES = ['Bare soil / litter', 'Other vegetation', 'Target plant'];
  const CLASS_RGB = [[196, 164, 108], [46, 160, 67], [230, 60, 60]];
  // Provisional thresholds: calibrate against real flights before relying on them.
  const SHARPNESS_MIN = 1000;
  const BRIGHT_MIN = 70;
  const BRIGHT_MAX = 185;
  const OVEREXPOSED_MAX = 0.05;

  const $ = (id) => document.getElementById(id);
  let currentMode = 'manual';
  let imageSummary = null;

  window.getInputMode = () => currentMode;
  window.getImageSummary = () => (imageSummary && imageSummary.mode === currentMode ? imageSummary : null);

  // ---------- Guided questions ----------
  const QUESTIONS = [
    { id: '1b', text: 'Has this land been ploughed or farmed recently?', options: [
      'Never farmed; the ground looks natural',
      'Farmed long ago (over 2 years); now overgrown',
      'Left fallow; old ridges from 1–2 years ago',
      'Farmed this past season, no fertiliser',
      'Farmed this season with fertiliser or chemicals'] },
    { id: '1c', text: 'Has the flow of water been changed (drains, dams, channels)?', options: [
      'No; water flows naturally',
      'Only a small change (a footbridge or small culvert)',
      'Some water is diverted or partly channelled',
      'Clearly diverted, dammed or drained',
      'Water flow is completely changed'] },
    { id: '2a', text: 'Do animals graze or trample the plot?', options: [
      'No signs of grazing',
      'Occasional light grazing, no damage',
      'Moderate grazing; some trampled patches',
      'Heavy grazing; trampling across much of the plot',
      'Severe; ground plants mostly eaten or removed'] },
    { id: '2b', text: 'Is the vegetation cut or slashed?', options: [
      'No cutting',
      'Old cuts, fully regrown',
      'Some recent cutting, partly regrown',
      'Cut often; kept low across much of the plot',
      'Recently cleared to bare ground or stubble'] },
    { id: '2c', text: 'Are trees cut for firewood or timber?', options: [
      'No cutting',
      'A few trees cut now and then; canopy intact',
      'Some cutting; a few gaps in the canopy',
      'Frequent cutting; the canopy is much more open',
      'Heavy cutting; most big trees are gone'] },
    { id: '3b', text: 'When was the plot last cleared or burned?', options: [
      'No sign of clearing or burning; undisturbed for a long time',
      'More than 5 years ago; well recovered',
      '2–5 years ago; partly recovered',
      '1–2 years ago; young regrowth',
      'Within the last season; hardly any regrowth'] },
    { id: '3c', text: 'How tall is most of the vegetation?', options: [
      'Full height for this type of vegetation',
      'A little shorter than it should be',
      'A mix of tall plants and regrowth',
      'Mostly low regrowth or shrubs',
      'Close to the ground (under 0.5 m)'] },
    { id: '4a', text: 'How many different kinds of native plants can you see?', options: [
      'Many different kinds',
      'Quite a few',
      'Some',
      'Only a few',
      'Almost none, or none'] }
  ];

  function renderQuestions() {
    const box = $('questionsContainer');
    box.innerHTML = '';
    QUESTIONS.forEach((q) => {
      const div = document.createElement('div');
      div.className = 'question';
      const title = document.createElement('div');
      title.className = 'question-text';
      title.textContent = q.text;
      div.appendChild(title);
      q.options.forEach((label, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'q-opt';
        b.dataset.q = q.id;
        b.dataset.s = String(i + 1);
        b.textContent = label;
        b.addEventListener('click', () => setScore(q.id, i + 1, 'answer'));
        div.appendChild(b);
      });
      box.appendChild(div);
    });
    refreshQuestions();
  }

  function refreshQuestions() {
    document.querySelectorAll('.q-opt').forEach((b) => {
      b.classList.toggle('active', scores[b.dataset.q] === parseInt(b.dataset.s, 10));
    });
    const answered = QUESTIONS.filter((q) => scores[q.id] !== undefined).length;
    $('questionsCount').textContent = `${answered} / ${QUESTIONS.length}`;
  }
  document.addEventListener('scorechange', refreshQuestions);

  // ---------- Mode tabs ----------
  function setMode(mode) {
    currentMode = mode;
    document.querySelectorAll('.mode-tab').forEach((t) => {
      const on = t.dataset.mode === mode;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', String(on));
    });
    $('panel-drone').hidden = mode !== 'drone';
    $('panel-phone').hidden = mode !== 'phone';
    if (mode !== 'phone') stopCamera();
  }
  document.querySelectorAll('.mode-tab').forEach((t) => t.addEventListener('click', () => setMode(t.dataset.mode)));

  // ---------- JPEG metadata (EXIF + DJI XMP) ----------
  const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

  function readIfd(dv, tiff, offset, le) {
    const out = {};
    const n = dv.getUint16(tiff + offset, le);
    for (let i = 0; i < n; i++) {
      const e = tiff + offset + 2 + i * 12;
      const tag = dv.getUint16(e, le);
      const type = dv.getUint16(e + 2, le);
      const count = dv.getUint32(e + 4, le);
      const size = (TYPE_SIZE[type] || 1) * count;
      const at = size <= 4 ? e + 8 : tiff + dv.getUint32(e + 8, le);
      if (type === 2) {
        let s = '';
        for (let k = 0; k < count - 1; k++) s += String.fromCharCode(dv.getUint8(at + k));
        out[tag] = s;
      } else if (type === 3) {
        out[tag] = dv.getUint16(at, le);
      } else if (type === 4) {
        out[tag] = dv.getUint32(at, le);
      } else if (type === 5) {
        const vals = [];
        for (let k = 0; k < count; k++) {
          const d = dv.getUint32(at + k * 8 + 4, le);
          vals.push(d ? dv.getUint32(at + k * 8, le) / d : 0);
        }
        out[tag] = count === 1 ? vals[0] : vals;
      }
    }
    return out;
  }

  function parseExif(dv, start) {
    const tiff = start + 6;
    const le = dv.getUint16(tiff) === 0x4949;
    const ifd0 = readIfd(dv, tiff, dv.getUint32(tiff + 4, le), le);
    const meta = {};
    if (ifd0[0x8769] !== undefined) {
      const ex = readIfd(dv, tiff, ifd0[0x8769], le);
      meta.focal = ex[0x920a];
      meta.focal35 = ex[0xa405];
      meta.date = ex[0x9003];
    }
    if (ifd0[0x8825] !== undefined) {
      const gps = readIfd(dv, tiff, ifd0[0x8825], le);
      const dms = (v) => (Array.isArray(v) && v.length === 3 ? v[0] + v[1] / 60 + v[2] / 3600 : null);
      const lat = dms(gps[2]);
      const lng = dms(gps[4]);
      if (lat !== null && lng !== null) {
        meta.lat = (gps[1] === 'S' ? -1 : 1) * lat;
        meta.lng = (gps[3] === 'W' ? -1 : 1) * lng;
      }
    }
    return meta;
  }

  async function readMetadata(file) {
    const meta = {};
    try {
      const buf = await file.slice(0, 262144).arrayBuffer();
      const dv = new DataView(buf);
      if (dv.getUint16(0) !== 0xffd8) return meta;
      let off = 2;
      while (off + 4 < dv.byteLength) {
        if (dv.getUint8(off) !== 0xff) break;
        const marker = dv.getUint8(off + 1);
        if (marker === 0xda) break;
        const len = dv.getUint16(off + 2);
        if (marker === 0xe1) {
          const head = String.fromCharCode(...new Uint8Array(buf, off + 4, 6));
          if (head.startsWith('Exif')) {
            try { Object.assign(meta, parseExif(dv, off + 4)); } catch (e) { /* ignore broken EXIF */ }
          } else if (head.startsWith('http')) {
            const xmp = new TextDecoder('latin1').decode(new Uint8Array(buf, off + 4, Math.min(len - 2, buf.byteLength - off - 4)));
            const num = (key) => {
              const m = xmp.match(new RegExp('drone-dji:' + key + '(?:="|>)([-+0-9.]+)'));
              return m ? parseFloat(m[1]) : undefined;
            };
            meta.relAlt = num('RelativeAltitude');
            meta.pitch = num('GimbalPitchDegree');
          }
        }
        off += 2 + len;
      }
    } catch (e) { /* metadata is optional */ }
    return meta;
  }

  // ---------- Quality metrics ----------
  function measureQuality(bmp) {
    const s = Math.min(1, 1000 / Math.max(bmp.width, bmp.height));
    const w = Math.max(3, Math.round(bmp.width * s));
    const h = Math.max(3, Math.round(bmp.height * s));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    const g = new Float32Array(w * h);
    let sum = 0, over = 0, under = 0;
    for (let i = 0, j = 0; i < g.length; i++, j += 4) {
      const v = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
      g[i] = v; sum += v;
      if (v >= 250) over++;
      if (v <= 5) under++;
    }
    let m = 0, m2 = 0, n = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const e = 8 * g[i] - (g[i - 1] + g[i + 1] + g[i - w] + g[i + w] + g[i - w - 1] + g[i - w + 1] + g[i + w - 1] + g[i + w + 1]);
        m += e; m2 += e * e; n++;
      }
    }
    return { sharp: m2 / n - (m / n) ** 2, bright: sum / g.length, over: over / g.length, under: under / g.length };
  }

  function sharedChecks(q) {
    const out = [];
    out.push(q.sharp < SHARPNESS_MIN
      ? { level: 'warn', text: 'The image looks blurry. Retake it, keeping the camera steady.' }
      : { level: 'ok', text: 'The image looks sharp enough.' });
    if (q.bright < BRIGHT_MIN) out.push({ level: 'warn', text: 'The image is too dark. Retake it in better light, or raise the exposure.' });
    else if (q.bright > BRIGHT_MAX || q.over > OVEREXPOSED_MAX) out.push({ level: 'warn', text: 'Parts of the image are washed out by bright light. Retake it with lower exposure or when the sun is softer.' });
    else out.push({ level: 'ok', text: 'The lighting looks good.' });
    return out;
  }

  function renderChecks(listEl, checks) {
    listEl.innerHTML = '';
    checks.forEach((c) => {
      const li = document.createElement('li');
      li.className = c.level;
      li.textContent = c.text;
      listEl.appendChild(li);
    });
  }

  function qualityLevel(checks) {
    const warns = checks.filter((c) => c.level === 'warn').length;
    return warns === 0 ? 'good' : warns === 1 ? 'fair' : 'low';
  }
  const QUALITY_TEXT = { good: 'Good', fair: 'Fair', low: 'Low' };

  // ---------- Drone mode ----------
  const drone = { bmp: null, meta: {}, checks: [], rect: { x0: 0.1, y0: 0.1, x1: 0.9, y1: 0.9 }, result: null, worker: null };
  const cv = $('droneCanvas');
  const cvx = cv.getContext('2d');

  function droneChecks(meta, bmp, q) {
    const out = [];
    if (bmp.width < 3800 || bmp.height < 2800) {
      out.push({ level: 'warn', text: `This image is ${bmp.width} × ${bmp.height} px. It may be a shrunken copy. Use the original file from the drone (about 4000 × 3000 px).` });
    } else {
      out.push({ level: 'ok', text: 'The image has full original size.' });
    }
    if (meta.relAlt === undefined) {
      out.push({ level: 'info', text: 'Flight height was not found in this file, so it could not be checked.' });
    } else if (Math.abs(meta.relAlt - TRAIN_HEIGHT_M) > 5) {
      out.push({ level: 'warn', text: `Flown at ${meta.relAlt.toFixed(1)} m. The results are most reliable at about ${TRAIN_HEIGHT_M} m.` });
    } else {
      out.push({ level: 'ok', text: `Flight height ${meta.relAlt.toFixed(1)} m is close to ${TRAIN_HEIGHT_M} m.` });
    }
    if (meta.pitch === undefined) {
      out.push({ level: 'info', text: 'Camera angle was not found in this file, so it could not be checked.' });
    } else if (meta.pitch > -85) {
      out.push({ level: 'warn', text: `The camera was tilted (${meta.pitch.toFixed(0)}°). Photos should point straight down.` });
    } else {
      out.push({ level: 'ok', text: 'The camera pointed straight down.' });
    }
    return out.concat(sharedChecks(q));
  }

  function metaRow(dl, label, value) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    dl.append(dt, dd);
  }

  $('droneFile').addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    resetDroneResult();
    try {
      drone.bmp = await createImageBitmap(file);
    } catch (e) {
      showToast('Could not read this image');
      return;
    }
    drone.meta = await readMetadata(file);
    const q = measureQuality(drone.bmp);
    drone.checks = droneChecks(drone.meta, drone.bmp, q);
    renderChecks($('droneChecks'), drone.checks);

    const dl = $('droneMeta');
    dl.innerHTML = '';
    metaRow(dl, 'Size', `${drone.bmp.width} × ${drone.bmp.height} px`);
    metaRow(dl, 'Flight height', drone.meta.relAlt !== undefined ? `${drone.meta.relAlt.toFixed(1)} m` : 'not found');
    metaRow(dl, 'Camera angle', drone.meta.pitch !== undefined ? `${drone.meta.pitch.toFixed(0)}°` : 'not found');
    metaRow(dl, 'Lens (35 mm equiv.)', drone.meta.focal35 ? `${drone.meta.focal35} mm` : 'not found');
    metaRow(dl, 'Taken', drone.meta.date || 'not found');
    metaRow(dl, 'GPS', drone.meta.lat !== undefined ? 'found in photo' : 'not found');
    dl.hidden = false;

    // Fill the location only if empty, so a PhytoScout match is never overwritten.
    if (drone.meta.lat !== undefined && !$('lat').value && !$('lng').value) {
      $('lat').value = drone.meta.lat.toFixed(6);
      $('lng').value = drone.meta.lng.toFixed(6);
      $('gpsStatus').textContent = '📍 Location read from the drone photo (kept on this device)';
    }

    drone.rect = { x0: 0.1, y0: 0.1, x1: 0.9, y1: 0.9 };
    cv.width = 900;
    cv.height = Math.round(900 * drone.bmp.height / drone.bmp.width);
    drawDroneCanvas();
    $('droneCropWrap').hidden = false;
  });

  function drawDroneCanvas() {
    const W = cv.width, H = cv.height, r = drone.rect;
    cvx.drawImage(drone.bmp, 0, 0, W, H);
    const x0 = Math.min(r.x0, r.x1) * W, x1 = Math.max(r.x0, r.x1) * W;
    const y0 = Math.min(r.y0, r.y1) * H, y1 = Math.max(r.y0, r.y1) * H;
    cvx.fillStyle = 'rgba(0,0,0,0.5)';
    cvx.fillRect(0, 0, W, y0);
    cvx.fillRect(0, y1, W, H - y1);
    cvx.fillRect(0, y0, x0, y1 - y0);
    cvx.fillRect(x1, y0, W - x1, y1 - y0);
    cvx.strokeStyle = '#D4A72C';
    cvx.lineWidth = 3;
    cvx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  }

  let dragging = false;
  function canvasPoint(e) {
    const b = cv.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), y: Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)) };
  }
  cv.addEventListener('pointerdown', (e) => {
    const p = canvasPoint(e);
    dragging = true;
    drone.rect = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const p = canvasPoint(e);
    drone.rect.x1 = p.x; drone.rect.y1 = p.y;
    drawDroneCanvas();
  });
  cv.addEventListener('pointerup', () => {
    dragging = false;
    const r = drone.rect;
    if (Math.abs(r.x1 - r.x0) < 0.05 || Math.abs(r.y1 - r.y0) < 0.05) {
      drone.rect = { x0: 0.1, y0: 0.1, x1: 0.9, y1: 0.9 };
      showToast('Outline too small, reset to the centre');
    }
    drawDroneCanvas();
  });

  function resetDroneResult() {
    if (drone.worker) { drone.worker.terminate(); drone.worker = null; }
    drone.result = null;
    imageSummary = null;
    $('droneResult').hidden = true;
    $('droneProgressWrap').hidden = true;
    $('droneRun').disabled = false;
  }

  $('droneRun').addEventListener('click', () => {
    const r = drone.rect;
    const sx = Math.round(Math.min(r.x0, r.x1) * drone.bmp.width);
    const sy = Math.round(Math.min(r.y0, r.y1) * drone.bmp.height);
    const sw = Math.round(Math.abs(r.x1 - r.x0) * drone.bmp.width);
    const sh = Math.round(Math.abs(r.y1 - r.y0) * drone.bmp.height);
    const scale = Math.min(1, 2048 / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * scale)), h = Math.max(1, Math.round(sh * scale));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(drone.bmp, sx, sy, sw, sh, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    const original = new Uint8ClampedArray(img.data);

    resetDroneResult();
    $('droneRun').disabled = true;
    $('droneProgressWrap').hidden = false;
    $('droneProgress').value = 0;

    let worker;
    try {
      worker = new Worker('drone-worker.js');
    } catch (e) {
      showToast('Analysis needs the site to be opened from its web address');
      $('droneRun').disabled = false;
      return;
    }
    drone.worker = worker;
    worker.onerror = () => {
      showToast('Analysis failed to start');
      $('droneRun').disabled = false;
      $('droneProgressWrap').hidden = true;
    };
    worker.onmessage = (ev) => {
      const m = ev.data;
      if (m.type === 'progress') { $('droneProgress').value = m.value; return; }
      $('droneProgressWrap').hidden = true;
      $('droneRun').disabled = false;
      worker.terminate();
      drone.worker = null;
      showDroneResult({ w, h, classes: m.classes, counts: m.counts, pixels: original });
    };
    worker.postMessage({ buf: img.data.buffer, w, h }, [img.data.buffer]);
  });

  // Maps cover percentages to 1-5 scores using the manual's own bands.
  function suggestScores(cover) {
    const bandUp = (pct, cuts) => 1 + cuts.filter((c) => pct >= c).length;
    const out = {};
    out['1a'] = bandUp(cover.bare, [2, 10, 25, 75]);
    // Needs a trained model; "other vegetation" is assumed to be indigenous until confirmed.
    if (!MODEL.isDemo) out['3a'] = 1 + [80, 60, 40, 20].filter((c) => cover.other < c).length;
    return out;
  }

  function showDroneResult(res) {
    const total = res.w * res.h;
    const cover = { bare: res.counts[0] / total * 100, other: res.counts[1] / total * 100, target: res.counts[2] / total * 100 };
    const level = qualityLevel(drone.checks);
    const suggestions = suggestScores(cover);
    drone.result = { ...res, cover, level, suggestions };

    const ov = $('droneOverlay');
    ov.width = res.w; ov.height = res.h;
    const octx = ov.getContext('2d');
    const out = octx.createImageData(res.w, res.h);
    for (let i = 0; i < total; i++) {
      const col = CLASS_RGB[res.classes[i]];
      const j = i * 4;
      out.data[j] = res.pixels[j] * 0.45 + col[0] * 0.55;
      out.data[j + 1] = res.pixels[j + 1] * 0.45 + col[1] * 0.55;
      out.data[j + 2] = res.pixels[j + 2] * 0.45 + col[2] * 0.55;
      out.data[j + 3] = 255;
    }
    octx.putImageData(out, 0, 0);

    const row = (label, val) => `<tr><td>${label}</td><td>${val}</td></tr>`;
    const sugRows = Object.entries(suggestions).map(([id, s]) => row(`Suggested score ${id}`, s)).join('');
    $('droneResultBody').innerHTML = `
      <table class="result-table">
        ${row(CLASS_NAMES[2], MODEL.isDemo ? 'not available in demo' : cover.target.toFixed(1) + '%')}
        ${row(CLASS_NAMES[1], cover.other.toFixed(1) + '%' + (MODEL.isDemo ? ' (all green, demo)' : ''))}
        ${row(CLASS_NAMES[0], cover.bare.toFixed(1) + '%')}
        ${sugRows}
        ${row('Capture quality', `<span class="quality-pill quality-${level}">${QUALITY_TEXT[level]}</span>`)}
        ${row('Model', `${MODEL.version}${MODEL.isDemo ? ' · DEMO' : ''}`)}
      </table>
      <div class="helptext">${MODEL.isDemo
        ? 'Demo only: a simple colour test that cannot tell the target plant from other plants. Suggested scores are shown for preview and are not applied.'
        : 'Check the suggestions against what you see, then apply them or score manually.'}
        Capture quality reflects the photo conditions, not the model's certainty.</div>`;
    $('droneApply').disabled = MODEL.isDemo || Object.keys(suggestions).length === 0;
    $('droneResult').hidden = false;

    imageSummary = {
      mode: 'drone', model: MODEL.name, modelVersion: MODEL.version, isDemo: MODEL.isDemo,
      coverPct: { bare: round1(cover.bare), other: round1(cover.other), target: round1(cover.target) },
      captureQuality: level,
      relAltM: drone.meta.relAlt ?? null, gimbalPitchDeg: drone.meta.pitch ?? null,
      widthPx: drone.bmp.width, heightPx: drone.bmp.height
    };
  }

  const round1 = (v) => Math.round(v * 10) / 10;

  $('droneApply').addEventListener('click', () => {
    if (!drone.result) return;
    Object.entries(drone.result.suggestions).forEach(([id, s]) => setScore(id, s, 'image'));
    showToast('Suggested scores applied. You can still change them.');
  });

  function plotId() { return $('plotId').value.trim() || 'plot'; }

  $('droneCsv').addEventListener('click', () => {
    if (!imageSummary) return;
    const s = imageSummary;
    const header = ['plotId', 'date', 'model', 'modelVersion', 'isDemo', 'bareSoilLitterPct', 'otherVegetationPct', 'targetPlantPct', 'captureQuality', 'relAltM', 'gimbalPitchDeg', 'widthPx', 'heightPx'];
    const row = [plotId(), $('fdate').value, s.model, s.modelVersion, s.isDemo, s.coverPct.bare, s.coverPct.other, s.coverPct.target, s.captureQuality, s.relAltM ?? '', s.gimbalPitchDeg ?? '', s.widthPx, s.heightPx];
    downloadBlob(new Blob([header.join(',') + '\n' + row.map(csvEscape).join(',')], { type: 'text/csv' }), `drone_result_${plotId()}_${dateStamp()}.csv`);
  });

  $('droneGeo').addEventListener('click', () => {
    if (!imageSummary) return;
    const lat = parseFloat($('lat').value), lng = parseFloat($('lng').value);
    const feature = {
      type: 'Feature',
      geometry: Number.isFinite(lat) && Number.isFinite(lng) ? { type: 'Point', coordinates: [lng, lat] } : null,
      properties: { plotId: plotId(), date: $('fdate').value, ...imageSummary }
    };
    downloadBlob(new Blob([JSON.stringify({ type: 'FeatureCollection', features: [feature] }, null, 2)], { type: 'application/geo+json' }), `drone_result_${plotId()}_${dateStamp()}.geojson`);
  });

  $('dronePng').addEventListener('click', () => {
    $('droneOverlay').toBlob((b) => b && downloadBlob(b, `drone_overlay_${plotId()}_${dateStamp()}.png`));
  });

  // ---------- Phone mode ----------
  let stream = null;
  let tiltAtCapture = null;
  let liveTilt = null;

  function onOrientation(e) {
    if (e.beta === null || e.gamma === null) return;
    liveTilt = Math.hypot(e.beta, e.gamma);
    const el = $('phoneTilt');
    el.textContent = liveTilt <= 10 ? `Tilt ${liveTilt.toFixed(0)}°: flat, good` : `Tilt ${liveTilt.toFixed(0)}°: hold the phone flatter, pointing straight down`;
    el.style.color = liveTilt <= 10 ? '#6FCB7F' : 'var(--amber)';
  }

  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showToast('Camera not available here. Choose a photo instead.');
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    } catch (e) {
      showToast('Camera permission was not given. Choose a photo instead.');
      return;
    }
    const v = $('phoneVideo');
    v.srcObject = stream;
    await v.play();
    $('phoneVideoWrap').hidden = false;
    $('phoneCapture').hidden = false;
    $('phoneCamClose').hidden = false;
    $('phoneCamOpen').hidden = true;
    if (window.DeviceOrientationEvent) {
      try {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') await DeviceOrientationEvent.requestPermission();
        window.addEventListener('deviceorientation', onOrientation);
        $('phoneTilt').hidden = false;
      } catch (e) { /* tilt meter is optional */ }
    }
  }

  function stopCamera() {
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    window.removeEventListener('deviceorientation', onOrientation);
    $('phoneVideoWrap').hidden = true;
    $('phoneCapture').hidden = true;
    $('phoneCamClose').hidden = true;
    $('phoneCamOpen').hidden = false;
    $('phoneTilt').hidden = true;
  }

  $('phoneCamOpen').addEventListener('click', startCamera);
  $('phoneCamClose').addEventListener('click', stopCamera);

  $('phoneCapture').addEventListener('click', async () => {
    const v = $('phoneVideo');
    if (!v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    tiltAtCapture = liveTilt;
    analysePhone(await createImageBitmap(c));
    stopCamera();
  });

  $('phoneFile').addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    try {
      tiltAtCapture = null;
      analysePhone(await createImageBitmap(file));
    } catch (e) {
      showToast('Could not read this image');
    }
  });

  function analysePhone(bmp) {
    const q = measureQuality(bmp);
    const checks = [];
    if (bmp.width < 1200) checks.push({ level: 'warn', text: 'The photo is small. A full-size photo works better.' });
    if (tiltAtCapture !== null) {
      checks.push(tiltAtCapture > 15
        ? { level: 'warn', text: `The phone was tilted ${tiltAtCapture.toFixed(0)}° when the photo was taken. Hold it flat and point it straight down.` }
        : { level: 'ok', text: 'The phone was held flat.' });
    } else {
      checks.push({ level: 'info', text: 'Tilt was not measured for this photo.' });
    }
    const all = checks.concat(sharedChecks(q));
    renderChecks($('phoneChecks'), all);

    // Demo: share of green pixels only, to show how the coarse result will look.
    const s = Math.min(1, 400 / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * s)), h = Math.max(1, Math.round(bmp.height * s));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    let green = 0;
    for (let i = 0; i < d.length; i += 4) {
      const sum = d[i] + d[i + 1] + d[i + 2] || 1;
      if ((2 * d[i + 1] - d[i] - d[i + 2]) / sum > 0.05) green++;
    }
    const greenPct = green / (w * h) * 100;
    const band = greenPct < 30 ? 'Low' : greenPct < 60 ? 'Medium' : 'High';
    const level = qualityLevel(all);
    $('phoneResult').innerHTML = `
      <table class="result-table">
        <tr><td>Quick field estimate</td><td><strong>${band}</strong> (demo)</td></tr>
        <tr><td>Green cover in photo</td><td>${greenPct.toFixed(0)}%</td></tr>
        <tr><td>Capture quality</td><td><span class="quality-pill quality-${level}">${QUALITY_TEXT[level]}</span></td></tr>
        <tr><td>Model</td><td>${MODEL.version} · DEMO</td></tr>
      </table>
      <div class="helptext">Demo only: this is a plain green-colour test, not a trained model, and it does not change any scores. Answer the questions and score the rest below.</div>`;
    $('phoneResult').hidden = false;
    imageSummary = {
      mode: 'phone', model: MODEL.name, modelVersion: MODEL.version, isDemo: MODEL.isDemo,
      coarseBand: band, greenCoverPct: round1(greenPct), captureQuality: level, widthPx: bmp.width, heightPx: bmp.height
    };
  }

  document.addEventListener('formreset', () => {
    resetDroneResult();
    $('droneFile').value = '';
    $('phoneFile').value = '';
    $('droneMeta').hidden = true;
    $('droneCropWrap').hidden = true;
    $('droneChecks').innerHTML = '';
    $('phoneChecks').innerHTML = '';
    $('phoneResult').hidden = true;
    drone.bmp = null;
    imageSummary = null;
  });

  renderQuestions();
})();
