import {
  PoseLandmarker,
  ImageSegmenter,
  FilesetResolver,
} from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/+esm';

(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const canvas = $('view'), ctx = canvas.getContext('2d');
  const video = $('video'), stage = $('stage');
  const CM_IN = 2.54;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const MP_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm';
  const POSE_MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
  const SEG_MODEL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.task';
  const CLOTHES = 4;
  const SHOULDER_CM = 40;
  const IMGLY_VER = '1.5.8';

  const PRESETS = [
    { id: 'center', label: 'Center chest', dx: 0, top: 8 },
    { id: 'left', label: 'Left chest', dx: 9, top: 10 },
    { id: 'right', label: 'Right chest', dx: -9, top: 10 },
    { id: 'back', label: 'Upper back', dx: 0, top: 6 },
    { id: 'full', label: 'Full front', dx: 0, top: 10 },
  ];
  const QUICK_SIZES = [[8, 8], [10, 10], [20, 25], [28, 35]];

  const S = {
    source: null,
    photo: null,
    frozen: null,
    facing: 'environment',
    stream: null,
    pxPerCm: 10,
    calibrated: false,
    collarY: null,
    centerX: null,
    design: { img: null, orig: null, wCm: 25, hCm: 30, x: 0, y: 0, rot: 0 },
    opacity: 0.8,
    unit: 'cm',
    grid: true,
    guides: true,
    shirtOverlay: true,
    mode: 'move',
    calPts: [],
    calIdx: -1,
    dpr: 1,
    presetId: 'center',
    detectOn: true,
    locked: false,
    shirt: null,
  };
  let W = 0, H = 0;

  try {
    const u = localStorage.getItem('dtf-unit');
    if (u === 'in' || u === 'cm') S.unit = u;
  } catch (e) { /* ignore */ }

  const els = {};
  ['w', 'h', 'top', 'off', 'rot', 'unit', 'lock', 'opacity', 'readout', 'hint', 'toast',
    'start', 'err', 'calbar', 'calCm', 'freeze', 'sizes', 'presets', 'bgStatus', 'undoBg',
    'bgProgress', 'bgProgressText', 'detectBtn', 'lockBtn'].forEach(id => els[id] = $(id));

  const toU = cm => (S.unit === 'in' ? cm / CM_IN : cm);
  const fromU = v => (S.unit === 'in' ? v * CM_IN : v);
  const r1 = v => Math.round(v * 10) / 10;

  function activePreset() {
    return PRESETS.find(p => p.id === S.presetId) || PRESETS[0];
  }

  function resize() {
    const r = stage.getBoundingClientRect();
    S.dpr = window.devicePixelRatio || 1;
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    canvas.width = W * S.dpr;
    canvas.height = H * S.dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    if (S.collarY == null) {
      S.collarY = H * 0.24;
      S.centerX = W / 2;
      S.pxPerCm = W / 50;
      applyPreset(activePreset());
    }
  }

  function topEdgePx() {
    const d = S.design, w = d.wCm * S.pxPerCm / 2, h = d.hCm * S.pxPerCm / 2;
    const c = Math.cos(d.rot), s = Math.sin(d.rot);
    let m = Infinity;
    for (const [x, y] of [[-w, -h], [w, -h], [w, h], [-w, h]]) m = Math.min(m, d.y + x * s + y * c);
    return m;
  }

  function setTop(cmBelowCollar) {
    S.design.y += S.collarY + cmBelowCollar * S.pxPerCm - topEdgePx();
  }

  function applyPreset(p) {
    const d = S.design;
    S.presetId = p.id;
    d.rot = 0;
    d.x = S.centerX + p.dx * S.pxPerCm;
    d.y = S.collarY + p.top * S.pxPerCm + d.hCm * S.pxPerCm / 2;
    highlightPresets();
  }

  function aspect() {
    const i = S.design.img;
    return i ? i.naturalWidth / i.naturalHeight : null;
  }

  function stopStream() {
    if (S.stream) S.stream.getTracks().forEach(t => t.stop());
    S.stream = null;
  }

  async function startCamera() {
    stopStream();
    S.frozen = null;
    els.freeze.textContent = 'Freeze frame';
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showError('This browser cannot access the camera here. Open the page over https, or use a photo instead.');
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: S.facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      S.stream = stream;
      video.srcObject = stream;
      await video.play();
      S.source = 'video';
      els.start.hidden = true;
      ensureDetectors();
      return true;
    } catch (err) {
      const name = err && err.name;
      if (name === 'NotAllowedError') showError('Camera permission was denied. Allow camera access, or use a photo instead.');
      else if (name === 'NotFoundError') showError('No camera was found. You can use a photo instead.');
      else showError('Could not start the camera. You can use a photo instead.');
      return false;
    }
  }

  function showError(msg) {
    els.start.hidden = false;
    els.err.hidden = false;
    els.err.textContent = msg;
  }

  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { els.toast.hidden = true; }, 2600);
  }

  function loadPhoto(file) {
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      stopStream();
      S.photo = img;
      S.source = 'photo';
      S.frozen = null;
      els.start.hidden = true;
      S.shirt = null;
      ensureDetectors().then(() => runStillDetect());
    };
    img.onerror = () => toast('Could not open that image.');
    img.src = URL.createObjectURL(file);
  }

  function bg() {
    if (S.frozen) return S.frozen;
    if (S.source === 'photo') return S.photo;
    if (S.source === 'video' && video.readyState >= 2 && video.videoWidth) return video;
    return null;
  }
  function bgSize(el) {
    if (el === video) return [video.videoWidth, video.videoHeight];
    if (el instanceof HTMLImageElement) return [el.naturalWidth, el.naturalHeight];
    return [el.width, el.height];
  }
  function coverRect(sw, sh) {
    const k = Math.max(W / sw, H / sh);
    const dw = sw * k, dh = sh * k;
    return { x: (W - dw) / 2, y: (H - dh) / 2, dw, dh, k };
  }

  function cssColor(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function drawGrid() {
    const step = (S.unit === 'in' ? CM_IN : 5) * S.pxPerCm;
    if (step < 8) return;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = ((S.centerX % step) + step) % step; x < W; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = ((S.collarY % step) + step) % step; y < H; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
  }

  function drawGuides() {
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = cssColor('--blue', '#0a84ff');
    ctx.beginPath(); ctx.moveTo(S.centerX, 0); ctx.lineTo(S.centerX, H); ctx.stroke();
    ctx.strokeStyle = cssColor('--orange', '#ff9f0a');
    ctx.beginPath(); ctx.moveTo(0, S.collarY); ctx.lineTo(W, S.collarY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = cssColor('--orange', '#ff9f0a');
    ctx.font = '600 11px Inter, system-ui, sans-serif';
    ctx.fillText('COLLAR', 10, S.collarY - 8);
  }

  const maskCanvas = document.createElement('canvas');
  const maskCtx = maskCanvas.getContext('2d');
  const edgeCanvas = document.createElement('canvas');
  const edgeCtx = edgeCanvas.getContext('2d');

  function drawShirtOverlay() {
    const shirt = S.shirt;
    if (!shirt || !S.shirtOverlay) return;
    const blue = cssColor('--blue', '#0a84ff');
    if (shirt.mask && shirt.mw && shirt.mh && shirt.rect) {
      const { mw, mh, mask, rect } = shirt;
      if (maskCanvas.width !== mw || maskCanvas.height !== mh) {
        maskCanvas.width = mw; maskCanvas.height = mh;
        edgeCanvas.width = mw; edgeCanvas.height = mh;
      }
      const fill = maskCtx.createImageData(mw, mh);
      const edge = edgeCtx.createImageData(mw, mh);
      const rgb = hexToRgb(blue);
      for (let y = 0; y < mh; y++) {
        for (let x = 0; x < mw; x++) {
          const i = y * mw + x;
          const on = mask[i] === CLOTHES;
          const p = i * 4;
          if (on) {
            fill.data[p] = rgb[0]; fill.data[p + 1] = rgb[1]; fill.data[p + 2] = rgb[2]; fill.data[p + 3] = 72;
            const border = x === 0 || y === 0 || x === mw - 1 || y === mh - 1
              || mask[i - 1] !== CLOTHES || mask[i + 1] !== CLOTHES
              || mask[i - mw] !== CLOTHES || mask[i + mw] !== CLOTHES;
            if (border) {
              edge.data[p] = rgb[0]; edge.data[p + 1] = rgb[1]; edge.data[p + 2] = rgb[2]; edge.data[p + 3] = 230;
            }
          }
        }
      }
      maskCtx.putImageData(fill, 0, 0);
      edgeCtx.putImageData(edge, 0, 0);
      ctx.drawImage(maskCanvas, rect.x, rect.y, rect.dw, rect.dh);
      ctx.drawImage(edgeCanvas, rect.x, rect.y, rect.dw, rect.dh);
    } else if (shirt.poly && shirt.poly.length >= 3) {
      ctx.beginPath();
      shirt.poly.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      ctx.closePath();
      ctx.fillStyle = blue + '2e';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = blue;
      ctx.stroke();
    }
  }

  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function drawDesign() {
    const d = S.design, w = d.wCm * S.pxPerCm, h = d.hCm * S.pxPerCm;
    const blue = cssColor('--blue', '#0a84ff');
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(d.rot);
    if (d.img) {
      ctx.globalAlpha = S.opacity;
      ctx.drawImage(d.img, -w / 2, -h / 2, w, h);
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = blue + '59';
      ctx.fillRect(-w / 2, -h / 2, w, h);
    }
    ctx.lineWidth = 2;
    ctx.strokeStyle = blue;
    ctx.setLineDash([8, 5]);
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.setLineDash([]);
    const t = Math.min(16, w / 4, h / 4);
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => {
      const cx = sx * w / 2, cy = sy * h / 2;
      ctx.moveTo(cx - sx * t, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy - sy * t);
    });
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.moveTo(0, -8); ctx.lineTo(0, 8);
    ctx.stroke();
    ctx.restore();
  }

  function drawCal() {
    const p = S.calPts;
    const green = cssColor('--green', '#30d158');
    ctx.lineWidth = 2;
    ctx.strokeStyle = green;
    ctx.fillStyle = green;
    if (p.length === 2) {
      ctx.beginPath(); ctx.moveTo(p[0].x, p[0].y); ctx.lineTo(p[1].x, p[1].y); ctx.stroke();
    }
    p.forEach(pt => { ctx.beginPath(); ctx.arc(pt.x, pt.y, 8, 0, Math.PI * 2); ctx.fill(); });
  }

  function updateReadout() {
    const d = S.design;
    const top = toU((topEdgePx() - S.collarY) / S.pxPerCm);
    const off = toU((d.x - S.centerX) / S.pxPerCm);
    const deg = Math.round(d.rot * 180 / Math.PI * 10) / 10;
    const u = S.unit;
    const track = S.detectOn
      ? (S.shirt ? (S.locked ? ' · locked' : ' · following') : ' · looking for a shirt')
      : '';
    const approx = S.calibrated ? '' : ' · auto scale';
    const html = '<span>' + r1(toU(d.wCm)) + ' × ' + r1(toU(d.hCm)) + ' ' + u +
      ' · collar→top ' + r1(top) + ' ' + u +
      ' · offset ' + (off > 0 ? '+' : '') + r1(off) + ' ' + u +
      (deg ? ' · tilt ' + deg + '°' : '') + approx + track + '</span>';
    if (updateReadout.last !== html) { els.readout.innerHTML = html; updateReadout.last = html; }
  }

  function syncInputs() {
    const d = S.design;
    const set = (el, v) => { if (document.activeElement !== el && el.value !== String(v)) el.value = v; };
    set(els.w, r1(toU(d.wCm)));
    set(els.h, r1(toU(d.hCm)));
    set(els.top, r1(toU((topEdgePx() - S.collarY) / S.pxPerCm)));
    set(els.off, r1(toU((d.x - S.centerX) / S.pxPerCm)));
    set(els.rot, Math.round(d.rot * 180 / Math.PI * 10) / 10);
  }

  function following() {
    return S.detectOn && !S.locked && !!S.shirt;
  }

  function frame() {
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, W, H);
    const el = bg();
    if (el) {
      const [sw, sh] = bgSize(el);
      const r = coverRect(sw, sh);
      ctx.drawImage(el, r.x, r.y, r.dw, r.dh);
    }
    drawShirtOverlay();
    if (S.grid) drawGrid();
    if (S.guides) drawGuides();
    drawDesign();
    if (S.mode === 'calibrate') drawCal();
    updateReadout();
    syncInputs();
    els.hint.textContent = hintText();
    scheduleDetect();
    requestAnimationFrame(frame);
  }

  const ptrs = new Map();
  let gest = null;
  const pos = e => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function rebase() {
    const pts = [...ptrs.values()], d = S.design;
    if (pts.length === 1) gest = { type: 'drag', dx: d.x - pts[0].x, dy: d.y - pts[0].y };
    else if (pts.length >= 2) {
      const [a, b] = pts;
      gest = {
        type: 'pinch',
        dist: Math.hypot(b.x - a.x, b.y - a.y) || 1,
        ang: Math.atan2(b.y - a.y, b.x - a.x),
        w: d.wCm, h: d.hCm, rot: d.rot,
        mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, x: d.x, y: d.y,
      };
    } else gest = null;
  }

  function moveGesture() {
    if (following()) return;
    const pts = [...ptrs.values()], d = S.design;
    if (!gest) return;
    if (gest.type === 'drag' && pts.length === 1) {
      d.x = pts[0].x + gest.dx;
      d.y = pts[0].y + gest.dy;
    } else if (gest.type === 'pinch' && pts.length >= 2) {
      const [a, b] = pts;
      const k = (Math.hypot(b.x - a.x, b.y - a.y) || 1) / gest.dist;
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const kk = clamp(k, 0.05, 20);
      d.wCm = clamp(gest.w * kk, 0.5, 150);
      d.hCm = clamp(gest.h * kk, 0.5, 150);
      d.rot = gest.rot + (ang - gest.ang);
      d.x = gest.x + ((a.x + b.x) / 2 - gest.mx);
      d.y = gest.y + ((a.y + b.y) / 2 - gest.my);
    }
  }

  function calTap(p) {
    const pts = S.calPts;
    if (pts.length < 2) { pts.push({ x: p.x, y: p.y }); S.calIdx = pts.length - 1; return; }
    let best = 0, bd = Infinity;
    pts.forEach((q, i) => { const dd = Math.hypot(q.x - p.x, q.y - p.y); if (dd < bd) { bd = dd; best = i; } });
    pts[best] = { x: p.x, y: p.y };
    S.calIdx = best;
  }

  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const p = pos(e);
    ptrs.set(e.pointerId, p);
    if (S.mode === 'move') rebase();
    else if (S.mode === 'setup') { S.collarY = p.y; S.centerX = p.x; }
    else if (S.mode === 'calibrate') calTap(p);
  });
  canvas.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) return;
    const p = pos(e);
    ptrs.set(e.pointerId, p);
    if (S.mode === 'move') moveGesture();
    else if (S.mode === 'setup' && ptrs.size === 1) { S.collarY = p.y; S.centerX = p.x; }
    else if (S.mode === 'calibrate' && ptrs.size === 1 && S.calIdx >= 0) S.calPts[S.calIdx] = { x: p.x, y: p.y };
  });
  const endPtr = e => {
    ptrs.delete(e.pointerId);
    if (S.mode === 'move') rebase();
    S.calIdx = -1;
  };
  canvas.addEventListener('pointerup', endPtr);
  canvas.addEventListener('pointercancel', endPtr);

  const HINTS = {
    move: 'Drag to move · pinch to resize · twist to rotate',
    setup: 'Touch the collar seam (horizontal) and shirt center (vertical)',
    calibrate: 'Tap two points a known distance apart, then enter the real distance',
  };

  function hintText() {
    if (S.mode !== 'move') return HINTS[S.mode];
    if (!S.detectOn) return HINTS.move;
    if (!S.shirt) return 'Point at a shirt — outline appears when it is found';
    if (S.locked) return 'Locked on this frame · drag to fine-tune · Unlock to follow again';
    return 'Following the shirt · Lock to freeze placement';
  }

  function setMode(m) {
    S.mode = m;
    ptrs.clear(); gest = null;
    document.querySelectorAll('#modes button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
    els.hint.textContent = hintText();
    els.calbar.hidden = m !== 'calibrate';
  }
  document.querySelectorAll('#modes button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));

  document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x === b));
    ['design', 'pos', 'view'].forEach(t => { $('tab-' + t).hidden = t !== b.dataset.tab; });
  }));

  $('calApply').addEventListener('click', () => {
    const real = fromU(parseFloat(els.calCm.value));
    if (S.calPts.length < 2) { toast('Tap two points on the screen first.'); return; }
    if (!(real > 0)) { toast('Enter the real distance between the two points.'); return; }
    const [a, b] = S.calPts;
    S.pxPerCm = Math.hypot(b.x - a.x, b.y - a.y) / real;
    S.calibrated = true;
    S.calPts = [];
    els.calCm.value = '';
    setMode('move');
    toast('Scale calibrated. Keep the phone at the same distance.');
  });
  $('calReset').addEventListener('click', () => { S.calPts = []; });

  function setArtwork(img, orig) {
    const d = S.design, asp = img.naturalWidth / img.naturalHeight;
    d.img = img;
    d.orig = orig || img;
    d.wCm = asp >= 1 ? 25 : 25 * asp;
    d.hCm = d.wCm / asp;
    if (d.hCm > 35) { d.hCm = 35; d.wCm = 35 * asp; }
    applyPreset(activePreset());
  }

  function setBgStatus(text, canUndo) {
    els.bgStatus.textContent = text;
    els.undoBg.hidden = !canUndo;
  }

  $('art').addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    const img = new Image();
    img.onload = () => {
      setArtwork(img, img);
      setBgStatus('Original · removing background…', false);
      removeArtworkBackground(f, img);
    };
    img.onerror = () => toast('Could not open that image.');
    img.src = URL.createObjectURL(f);
    e.target.value = '';
  });

  $('plain').addEventListener('click', () => {
    S.design.img = null;
    S.design.orig = null;
    setBgStatus('No artwork', false);
  });

  els.undoBg.addEventListener('click', () => {
    if (!S.design.orig) return;
    S.design.img = S.design.orig;
    const asp = aspect();
    if (asp) {
      S.design.hCm = S.design.wCm / asp;
    }
    setBgStatus('Original restored', false);
  });

  async function removeArtworkBackground(file, originalImg) {
    els.bgProgress.hidden = false;
    els.bgProgressText.textContent = 'Loading cutout model…';
    try {
      const { removeBackground } = await import(`https://cdn.jsdelivr.net/npm/@imgly/background-removal@${IMGLY_VER}/+esm`);
      const blob = await removeBackground(file, {
        publicPath: `https://cdn.jsdelivr.net/npm/@imgly/background-removal@${IMGLY_VER}/dist/`,
        progress: (key, current, total) => {
          const pct = total ? Math.round((current / total) * 100) : 0;
          els.bgProgressText.textContent = (key === 'fetch' ? 'Downloading model ' : 'Removing background ') + pct + '%';
        },
      });
      const cut = new Image();
      cut.onload = () => {
        if (S.design.orig !== originalImg && S.design.img !== originalImg) return;
        S.design.img = cut;
        S.design.orig = originalImg;
        setBgStatus('Transparent PNG', true);
        toast('Background removed.');
      };
      cut.src = URL.createObjectURL(blob);
    } catch (err) {
      console.warn(err);
      setBgStatus('Original · cutout failed', false);
      toast('Could not remove the background. The original image is still in place.');
    } finally {
      els.bgProgress.hidden = true;
    }
  }

  function numVal(el) { const v = parseFloat(el.value); return Number.isFinite(v) ? v : null; }

  els.w.addEventListener('input', () => {
    const v = numVal(els.w); if (v === null || v <= 0) return;
    const d = S.design; d.wCm = clamp(fromU(v), 0.5, 150);
    if (els.lock.checked && aspect()) d.hCm = d.wCm / aspect();
  });
  els.h.addEventListener('input', () => {
    const v = numVal(els.h); if (v === null || v <= 0) return;
    const d = S.design; d.hCm = clamp(fromU(v), 0.5, 150);
    if (els.lock.checked && aspect()) d.wCm = d.hCm * aspect();
  });
  els.top.addEventListener('input', () => { const v = numVal(els.top); if (v !== null) setTop(fromU(v)); });
  els.off.addEventListener('input', () => { const v = numVal(els.off); if (v !== null) S.design.x = S.centerX + fromU(v) * S.pxPerCm; });
  els.rot.addEventListener('input', () => { const v = numVal(els.rot); if (v !== null) S.design.rot = v * Math.PI / 180; });
  els.opacity.addEventListener('input', () => { S.opacity = els.opacity.value / 100; });
  $('rot0').addEventListener('click', () => { S.design.rot = 0; });
  $('centerBtn').addEventListener('click', () => { S.design.x = S.centerX; });

  function setUnit(u) {
    S.unit = u;
    els.unit.value = u;
    document.querySelectorAll('.u').forEach(s => { s.textContent = u; });
    try { localStorage.setItem('dtf-unit', u); } catch (e) { /* ignore */ }
    renderChips();
  }
  els.unit.addEventListener('change', () => setUnit(els.unit.value));

  function renderChips() {
    els.sizes.innerHTML = '';
    QUICK_SIZES.forEach(([w, h]) => {
      const b = document.createElement('button');
      b.className = 'chip';
      b.textContent = r1(toU(w)) + '×' + r1(toU(h));
      b.addEventListener('click', () => {
        const d = S.design;
        d.wCm = w;
        d.hCm = aspect() && els.lock.checked ? w / aspect() : h;
      });
      els.sizes.appendChild(b);
    });
  }

  function highlightPresets() {
    els.presets.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.id === S.presetId));
  }

  function renderPresets() {
    PRESETS.forEach(p => {
      const b = document.createElement('button');
      b.className = 'chip';
      b.dataset.id = p.id;
      b.textContent = p.label;
      b.addEventListener('click', () => applyPreset(p));
      els.presets.appendChild(b);
    });
    highlightPresets();
  }

  $('gridT').addEventListener('change', e => { S.grid = e.target.checked; });
  $('guidesT').addEventListener('change', e => { S.guides = e.target.checked; });
  $('shirtOverlayT').addEventListener('change', e => { S.shirtOverlay = e.target.checked; });

  els.freeze.addEventListener('click', () => {
    if (S.frozen) { S.frozen = null; els.freeze.textContent = 'Freeze frame'; return; }
    if (S.source !== 'video' || !video.videoWidth) { toast('Freeze works with the live camera.'); return; }
    const c = document.createElement('canvas');
    c.width = video.videoWidth; c.height = video.videoHeight;
    c.getContext('2d').drawImage(video, 0, 0);
    S.frozen = c;
    els.freeze.textContent = 'Unfreeze';
    runStillDetect();
  });

  $('flip').addEventListener('click', async () => {
    S.facing = S.facing === 'environment' ? 'user' : 'environment';
    await startCamera();
  });
  $('live').addEventListener('click', () => { startCamera(); });
  $('photo').addEventListener('change', e => { loadPhoto(e.target.files[0]); e.target.value = ''; });
  $('photoStart').addEventListener('change', e => { loadPhoto(e.target.files[0]); e.target.value = ''; });
  $('startBtn').addEventListener('click', () => { startCamera(); });

  $('save').addEventListener('click', () => {
    canvas.toBlob(async blob => {
      if (!blob) return;
      const file = new File([blob], 'dtf-placement.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'DTF placement' }); return; }
        catch (err) { if (err && err.name === 'AbortError') return; }
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'dtf-placement.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, 'image/png');
  });

  function setDetect(on) {
    S.detectOn = on;
    els.detectBtn.classList.toggle('on', on);
    els.detectBtn.setAttribute('aria-pressed', String(on));
    if (!on) S.shirt = null;
    els.hint.textContent = hintText();
  }
  function setLocked(on) {
    S.locked = on;
    els.lockBtn.classList.toggle('on', on);
    els.lockBtn.classList.toggle('warn', on);
    els.lockBtn.textContent = on ? 'Unlock' : 'Lock';
    els.lockBtn.setAttribute('aria-pressed', String(on));
    els.hint.textContent = hintText();
  }
  els.detectBtn.addEventListener('click', () => setDetect(!S.detectOn));
  els.lockBtn.addEventListener('click', () => setLocked(!S.locked));

  let pose = null, segmenter = null, detecting = false, lastDetect = 0, lastVideoTs = -1;
  let detPromise = null;

  async function ensureDetectors() {
    if (pose && segmenter) return;
    if (detPromise) return detPromise;
    detPromise = (async () => {
      toast('Loading shirt detection…');
      const files = await FilesetResolver.forVisionTasks(MP_WASM);
      pose = await PoseLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: POSE_MODEL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.4,
        minPosePresenceConfidence: 0.4,
        minTrackingConfidence: 0.4,
      });
      segmenter = await ImageSegmenter.createFromOptions(files, {
        baseOptions: { modelAssetPath: SEG_MODEL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      });
    })().catch(async err => {
      console.warn('GPU detectors failed, retrying CPU', err);
      const files = await FilesetResolver.forVisionTasks(MP_WASM);
      pose = await PoseLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: POSE_MODEL, delegate: 'CPU' },
        runningMode: 'VIDEO',
        numPoses: 1,
      });
      segmenter = await ImageSegmenter.createFromOptions(files, {
        baseOptions: { modelAssetPath: SEG_MODEL, delegate: 'CPU' },
        runningMode: 'VIDEO',
        outputCategoryMask: true,
      });
    }).finally(() => { detPromise = null; });
    return detPromise;
  }

  function scheduleDetect() {
    if (!S.detectOn || detecting) return;
    const now = performance.now();
    if (now - lastDetect < 140) return;
    const el = bg();
    if (!el) return;
    lastDetect = now;
    detecting = true;
    runDetect(el).finally(() => { detecting = false; });
  }

  async function runStillDetect() {
    if (!S.detectOn) return;
    await ensureDetectors();
    try {
      if (pose) await pose.setOptions({ runningMode: 'IMAGE' });
      if (segmenter) await segmenter.setOptions({ runningMode: 'IMAGE' });
    } catch (e) { /* already IMAGE */ }
    const el = bg();
    if (el) await runDetect(el, true);
    try {
      if (pose) await pose.setOptions({ runningMode: 'VIDEO' });
      if (segmenter) await segmenter.setOptions({ runningMode: 'VIDEO' });
    } catch (e) { /* ignore */ }
    lastVideoTs = -1;
  }

  async function runDetect(el, still) {
    if (!pose || !segmenter) {
      await ensureDetectors();
      if (!pose || !segmenter) return;
    }
    const [sw, sh] = bgSize(el);
    if (!sw) return;
    const ts = still ? 0 : performance.now();
    if (!still) {
      if (ts <= lastVideoTs) return;
      lastVideoTs = ts;
    }
    let poseRes, segRes;
    try {
      poseRes = still ? pose.detect(el) : pose.detectForVideo(el, ts);
      segRes = still ? segmenter.segment(el) : segmenter.segmentForVideo(el, ts);
    } catch (err) {
      return;
    }
    const rect = coverRect(sw, sh);
    const shirt = parseShirt(poseRes, segRes, rect, sw, sh);
    if (segRes && segRes.categoryMask && segRes.categoryMask.close) {
      try { segRes.categoryMask.close(); } catch (e) { /* ignore */ }
    }
    if (!S.locked) {
      S.shirt = shirt;
      if (shirt) attachToShirt(shirt);
    }
    els.hint.textContent = hintText();
  }

  function vis(lm) { return !lm || lm.visibility == null ? 1 : lm.visibility; }

  function parseShirt(poseRes, segRes, rect, sw, sh) {
    const map = (nx, ny) => ({ x: rect.x + nx * sw * (rect.k), y: rect.y + ny * sh * rect.k });
    let mask = null, mw = 0, mh = 0, clothesBox = null;
    if (segRes && segRes.categoryMask) {
      const cm = segRes.categoryMask;
      mw = cm.width; mh = cm.height;
      const raw = cm.getAsUint8Array ? cm.getAsUint8Array() : new Uint8Array(cm.getAsFloat32Array());
      mask = new Uint8Array(raw);
      let minX = mw, minY = mh, maxX = 0, maxY = 0, n = 0;
      for (let y = 0; y < mh; y++) {
        for (let x = 0; x < mw; x++) {
          if (mask[y * mw + x] !== CLOTHES) continue;
          n++;
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
      if (n > mw * mh * 0.01) {
        clothesBox = {
          x: rect.x + (minX / mw) * rect.dw,
          y: rect.y + (minY / mh) * rect.dh,
          w: ((maxX - minX) / mw) * rect.dw,
          h: ((maxY - minY) / mh) * rect.dh,
        };
      }
    }
    const lms = poseRes && poseRes.landmarks && poseRes.landmarks[0];
    let ls, rs, lh, rh, nose;
    if (lms) {
      ls = lms[11]; rs = lms[12]; lh = lms[23]; rh = lms[24]; nose = lms[0];
    }
    const shouldersOk = ls && rs && vis(ls) > 0.35 && vis(rs) > 0.35;
    if (!shouldersOk && !clothesBox) return null;

    let collarY, centerX, pxPerCm, poly = null;
    if (shouldersOk) {
      const a = map(ls.x, ls.y), b = map(rs.x, rs.y);
      centerX = (a.x + b.x) / 2;
      collarY = (a.y + b.y) / 2;
      if (nose && vis(nose) > 0.3) {
        const n = map(nose.x, nose.y);
        collarY = n.y * 0.25 + collarY * 0.75;
      }
      const shoulderPx = Math.hypot(b.x - a.x, b.y - a.y);
      pxPerCm = shoulderPx / SHOULDER_CM;
      if (lh && rh) {
        const c = map(lh.x, lh.y), d = map(rh.x, rh.y);
        const widen = 0.18;
        poly = [
          { x: a.x + (a.x - b.x) * widen, y: a.y },
          { x: b.x + (b.x - a.x) * widen, y: b.y },
          { x: d.x + (d.x - c.x) * widen, y: d.y },
          { x: c.x + (c.x - d.x) * widen, y: c.y },
        ];
      }
    }
    if (clothesBox) {
      centerX = clothesBox.x + clothesBox.w / 2;
      if (collarY == null) collarY = clothesBox.y + clothesBox.h * 0.08;
      if (!S.calibrated && (!pxPerCm || !shouldersOk)) pxPerCm = clothesBox.w / 50;
    }
    if (collarY == null || centerX == null) return null;
    return { collarY, centerX, pxPerCm, mask, mw, mh, rect, poly };
  }

  function attachToShirt(shirt) {
    S.collarY = shirt.collarY;
    S.centerX = shirt.centerX;
    if (!S.calibrated && shirt.pxPerCm && shirt.pxPerCm > 0.5 && shirt.pxPerCm < 80) {
      S.pxPerCm = shirt.pxPerCm;
    }
    applyPreset(activePreset());
  }

  renderPresets();
  setUnit(S.unit);
  resize();
  setMode('move');
  setDetect(true);
  setLocked(false);
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 250));
  requestAnimationFrame(frame);
})();
