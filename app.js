<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<meta name="theme-color" content="#F2F2F7" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">
<meta name="color-scheme" content="light dark">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<title>DTF Placer</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="style.css">
</head>
<body>

<main id="stage">
  <video id="video" playsinline muted autoplay></video>
  <canvas id="view"></canvas>

  <div id="hud">
    <nav id="modes" class="segmented" aria-label="Mode">
      <button data-mode="move" class="on">Move</button>
      <button data-mode="setup">Collar</button>
      <button data-mode="calibrate">Calibrate</button>
    </nav>
    <div id="trackbar">
      <button id="detectBtn" class="chip-btn on" aria-pressed="true">Detect</button>
      <button id="lockBtn" class="chip-btn" aria-pressed="false">Lock</button>
    </div>
  </div>

  <div id="readout"></div>

  <div id="calbar" hidden>
    <label>Real distance
      <input id="calCm" type="number" inputmode="decimal" step="0.1" min="0.1" placeholder="e.g. 50">
      <span class="u">cm</span>
    </label>
    <button id="calApply" class="primary">Apply</button>
    <button id="calReset" class="ghost">Reset</button>
  </div>

  <div id="hint"></div>
  <div id="toast" hidden></div>
  <div id="bgProgress" hidden>
    <div class="spinner"></div>
    <span id="bgProgressText">Removing background…</span>
  </div>

  <section id="start">
    <div class="card">
      <p class="eyebrow">Design system</p>
      <h1>DTF Placer</h1>
      <p>Point the camera at a shirt. Detection outlines the garment and places your design on the selected preset. Everything stays on this device.</p>
      <button id="startBtn" class="primary">Start camera</button>
      <label class="btn">Use a photo instead
        <input type="file" id="photoStart" accept="image/*" hidden>
      </label>
      <p id="err" class="err" hidden></p>
    </div>
  </section>
</main>

<aside id="panel">
  <div class="grabber" aria-hidden="true"></div>
  <div id="tabs" class="segmented">
    <button data-tab="design" class="on">Design</button>
    <button data-tab="pos">Position</button>
    <button data-tab="view">View</button>
  </div>

  <div class="tab" id="tab-design">
    <div class="row">
      <label class="btn">Upload artwork
        <input type="file" id="art" accept="image/*" hidden>
      </label>
      <button id="plain">Plain rectangle</button>
    </div>
    <div class="row">
      <span id="bgStatus" class="status">No artwork</span>
      <button id="undoBg" class="ghost" hidden>Undo cutout</button>
    </div>
    <div class="row">
      <label>W <input id="w" type="number" inputmode="decimal" step="0.1" min="0.5"></label>
      <label>H <input id="h" type="number" inputmode="decimal" step="0.1" min="0.5"></label>
      <select id="unit" aria-label="Units">
        <option value="cm">cm</option>
        <option value="in">in</option>
      </select>
    </div>
    <div class="row">
      <label class="chk"><input type="checkbox" id="lock" checked> Lock aspect ratio</label>
    </div>
    <div class="row chips" id="sizes"></div>
    <div class="row">
      <label class="grow">Preview opacity
        <input id="opacity" type="range" min="20" max="100" value="80">
      </label>
    </div>
  </div>

  <div class="tab" id="tab-pos" hidden>
    <div class="row chips" id="presets"></div>
    <div class="row">
      <label>Top below collar <input id="top" type="number" inputmode="decimal" step="0.1"> <span class="u">cm</span></label>
    </div>
    <div class="row">
      <label>Offset from center <input id="off" type="number" inputmode="decimal" step="0.1"> <span class="u">cm</span></label>
    </div>
    <div class="row">
      <label>Tilt <input id="rot" type="number" inputmode="decimal" step="0.5"> °</label>
      <button id="rot0">Straighten</button>
      <button id="centerBtn">Center</button>
    </div>
    <p class="note">Offset: + is right, − is left on screen. With the shirt facing you, the wearer’s left chest is on the right.</p>
  </div>

  <div class="tab" id="tab-view" hidden>
    <div class="row">
      <label class="chk"><input type="checkbox" id="gridT" checked> Grid</label>
      <label class="chk"><input type="checkbox" id="guidesT" checked> Collar &amp; center</label>
      <label class="chk"><input type="checkbox" id="shirtOverlayT" checked> Shirt overlay</label>
    </div>
    <div class="row">
      <button id="freeze">Freeze frame</button>
      <button id="flip">Flip camera</button>
      <button id="live">Live camera</button>
    </div>
    <div class="row">
      <label class="btn">Use a photo
        <input type="file" id="photo" accept="image/*" hidden>
      </label>
      <button id="save" class="primary">Save screenshot</button>
    </div>
  </div>
</aside>

<script type="module" src="app.js"></script>
</body>
</html>
