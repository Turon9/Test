(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const canvas = $('view'), ctx = canvas.getContext('2d');
  const video = $('video'), stage = $('stage');
  const CM_IN = 2.54;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  const PRESETS = [
    { id: 'center', label: 'Center chest', dx: 0, top: 8 },
    { id: 'left', label: 'Left chest', dx: 9, top: 10 },
    { id: 'right', label: 'Right chest', dx: -9, top: 10 },
    { id: 'back', label: 'Upper back', dx: 0, top: 6 },
    { id: 'full', label: 'Full front', dx: 0, top: 10 },
  ];
  const QUICK_SIZES = [[8, 8], [10, 10], [20, 25], [28, 35]]; // cm

  const S = {
    source: null,       // 'video' | 'photo'
    photo: null,
    frozen: null,
    facing: 'environment',
    stream: null,
    pxPerCm: 10,
    calibrated: false,
    collarY: null,
    centerX: null,
    design: { img: null, wCm: 25, hCm: 30, x: 0, y: 0, rot: 0 },
    opacity: 0.8,
    unit: 'cm',
    grid: true,
    guides: true,
    mode: 'move',
    calPts: [],
    calIdx: -1,
    dpr: 1,
  };
  let W = 0, H = 0;

  try {
    const u = localStorage.getItem('dtf-unit');
    if (u === 'in' || u === 'cm') S.unit = u;
  } catch (e) { /* storage may be unavailable */ }

  const els = {};
  ['w', 'h', 'top', 'off', 'rot', 'unit', 'lock', 'opacity', 'readout', 'hint', 'toast',
   'start', 'err', 'calbar', 'calCm', 'freeze', 'sizes', 'presets'].forEach(id => els[id] = $(id));

  // ---------- units ----------
  const toU = cm => (S.unit === 'in' ? cm / CM_IN : cm);
  const fromU = v => (S.unit === 'in' ? v * CM_IN : v);
  const r1 = v => Math.round(v * 10) / 10;

  // ---------- layout ----------
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
      S.pxPerCm = W / 50; // rough guess: ~50 cm shirt width fills the screen
      applyPreset(PRESETS[0]);
    }
  }

  // ---------- design geometry ----------
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
    d.rot = 0;
    d.x = S.centerX + p.dx * S.pxPerCm;
    d.y = S.collarY + p.top * S.pxPerCm + d.hCm * S.pxPerCm / 2;
  }

  function aspect() {
    const i = S.design.img;
    return i ? i.naturalWidth / i.naturalHeight : null;
  }

  // ---------- camera ----------
  function stopStream() {
    if (S.stream) S.stream.getTracks().forEach(t => t.stop());
    S.stream = null;
  }

  async function startCamera() {
    stopStream();
    S.frozen = null;
    els.freeze.textContent = 'Freeze frame';
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showError('This browser cannot access the camera here. Make sure the page is opened over https, or use a photo instead.');
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
      return true;
    } catch (err) {
      const name = err && err.name;
      if (name === 'NotAllowedError') showError('Camera permission was denied. Allow camera access for this site in your browser settings, or use a photo instead.');
      else if (name === 'NotFoundError') showError('No camera was found on this device. You can use a photo instead.');
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

  // ---------- drawing ----------
  function drawGrid() {
    const step = (S.unit === 'in' ? CM_IN : 5) * S.pxPerCm;
    if (step < 8) return;
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = ((S.centerX % step) + step) % step; x < W; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = ((S.collarY % step) + step) % step; y < H; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
  }

  function drawGuides() {
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 6]);
    ctx.strokeStyle = '#ffd54a';
    ctx.beginPath(); ctx.moveTo(S.centerX, 0); ctx.lineTo(S.centerX, H); ctx.stroke();
    ctx.strokeStyle = '#ff9f43';
    ctx.beginPath(); ctx.moveTo(0, S.collarY); ctx.lineTo(W, S.collarY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ff9f43';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText('COLLAR', 8, S.collarY - 6);
  }

  function drawDesign() {
    const d = S.design, w = d.wCm * S.pxPerCm, h = d.hCm * S.pxPerCm;
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(d.rot);
    if (d.img) {
      ctx.globalAlpha = S.opacity;
      ctx.drawImage(d.img, -w / 2, -h / 2, w, h);
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = 'rgba(0,229,255,' + (S.opacity * 0.35) + ')';
      ctx.fillRect(-w / 2, -h / 2, w, h);
    }
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#00e5ff';
    ctx.setLineDash([9, 6]);
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.setLineDash([]);
    // corner marks
    const t = Math.min(18, w / 4, h / 4);
    ctx.lineWidth = 4;
    ctx.beginPath();
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => {
      const cx = sx * w / 2, cy = sy * h / 2;
      ctx.moveTo(cx - sx * t, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy - sy * t);
    });
    ctx.stroke();
    // center cross
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.moveTo(0, -8); ctx.lineTo(0, 8);
    ctx.stroke();
    ctx.restore();
  }

  function drawCal() {
    const p = S.calPts;
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#7CFC00';
    ctx.fillStyle = '#7CFC00';
    if (p.length === 2) {
      ctx.beginPath(); ctx.moveTo(p[0].x, p[0].y); ctx.lineTo(p[1].x, p[1].y); ctx.stroke();
    }
    p.forEach(pt => { ctx.beginPath(); ctx.arc(pt.x, pt.y, 9, 0, Math.PI * 2); ctx.fill(); });
  }

  function updateReadout() {
    const d = S.design;
    const top = toU((topEdgePx() - S.collarY) / S.pxPerCm);
    const off = toU((d.x - S.centerX) / S.pxPerCm);
    const deg = Math.round(d.rot * 180 / Math.PI * 10) / 10;
    const u = S.unit;
    const approx = S.calibrated ? '' : ' · ≈ approx. scale (tap Calibrate)';
    const html = '<span>' + r1(toU(d.wCm)) + ' × ' + r1(toU(d.hCm)) + ' ' + u +
      ' · collar→top ' + r1(top) + ' ' + u +
      ' · offset ' + (off > 0 ? '+' : '') + r1(off) + ' ' + u +
      (deg ? ' · tilt ' + deg + '°' : '') + approx + '</span>';
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

  function frame() {
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, W, H);
    const el = bg();
    if (el) {
      const [sw, sh] = bgSize(el);
      const k = Math.max(W / sw, H / sh);
      const dw = sw * k, dh = sh * k;
      ctx.drawImage(el, (W - dw) / 2, (H - dh) / 2, dw, dh);
    }
    if (S.grid) drawGrid();
    if (S.guides) drawGuides();
    drawDesign();
    if (S.mode === 'calibrate') drawCal();
    updateReadout();
    syncInputs();
    requestAnimationFrame(frame);
  }

  // ---------- touch gestures ----------
  const ptrs = new Map();
  let gest = null;
  const pos = e => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function rebase() {
    const pts = [...ptrs.values()], d = S.design;
    if (pts.length === 1) {
      gest = { type: 'drag', dx: d.x - pts[0].x, dy: d.y - pts[0].y };
    } else if (pts.length >= 2) {
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

  // ---------- modes & tabs ----------
  const HINTS = {
    move: 'Drag to move · pinch to resize · twist to rotate',
    setup: 'Touch the shirt: the horizontal line is the collar seam, the vertical line is the shirt center',
    calibrate: 'Tap two points a known distance apart (shirt width, ruler), then enter the real distance',
  };

  function setMode(m) {
    S.mode = m;
    ptrs.clear(); gest = null;
    document.querySelectorAll('#modes button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
    els.hint.textContent = HINTS[m];
    els.calbar.hidden = m !== 'calibrate';
  }
  document.querySelectorAll('#modes button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));

  document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x === b));
    ['design', 'pos', 'view'].forEach(t => { $('tab-' + t).hidden = t !== b.dataset.tab; });
  }));

  // ---------- calibration ----------
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
    toast('Scale calibrated. Keep the phone at the same distance from the shirt.');
  });
  $('calReset').addEventListener('click', () => { S.calPts = []; });

  // ---------- design controls ----------
  $('art').addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    const img = new Image();
    img.onload = () => {
      const d = S.design, asp = img.naturalWidth / img.naturalHeight;
      d.img = img;
      d.wCm = asp >= 1 ? 25 : 25 * asp;
      d.hCm = d.wCm / asp;
      if (d.hCm > 35) { d.hCm = 35; d.wCm = 35 * asp; }
      applyPreset(PRESETS[0]);
    };
    img.onerror = () => toast('Could not open that image.');
    img.src = URL.createObjectURL(f);
    e.target.value = '';
  });

  $('plain').addEventListener('click', () => { S.design.img = null; });

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

  function renderPresets() {
    PRESETS.forEach(p => {
      const b = document.createElement('button');
      b.className = 'chip';
      b.textContent = p.label;
      b.addEventListener('click', () => applyPreset(p));
      els.presets.appendChild(b);
    });
  }

  // ---------- view controls ----------
  $('gridT').addEventListener('change', e => { S.grid = e.target.checked; });
  $('guidesT').addEventListener('change', e => { S.guides = e.target.checked; });

  els.freeze.addEventListener('click', () => {
    if (S.frozen) { S.frozen = null; els.freeze.textContent = 'Freeze frame'; return; }
    if (S.source !== 'video' || !video.videoWidth) { toast('Freeze works with the live camera.'); return; }
    const c = document.createElement('canvas');
    c.width = video.videoWidth; c.height = video.videoHeight;
    c.getContext('2d').drawImage(video, 0, 0);
    S.frozen = c;
    els.freeze.textContent = 'Unfreeze';
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

  // ---------- init ----------
  renderPresets();
  setUnit(S.unit);
  resize();
  setMode('move');
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 250));
  requestAnimationFrame(frame);
})();
