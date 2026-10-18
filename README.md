# DTF Studio — Camera-first mobile redesign

A mobile-first browser-based DTF shirt mockup studio with a full-screen live camera, minimalist controls, automatic design background removal, shirt tracking, calibration, editing, and export.

## Main mobile workflow

1. Serve the files over HTTPS; camera permissions generally require a secure context.
2. Open DTF Studio and tap **Open camera**.
3. Tap the gallery button (bottom left) to import artwork. Transparent artwork is preserved; images without transparency automatically start background removal.
4. Position the artwork on the shirt using touch gestures. Use Settings (+) for placement presets, physical dimensions, collar/center alignment, tracking, calibration, and export.
5. Tap the shutter (bottom center) to capture and save the composed shirt mockup.
6. Use Settings → Export to save the transparent artwork PNG or placement preview.

## Engineering status

See [ENGINEERING_REVIEW.md](ENGINEERING_REVIEW.md) for the current-state review, recommended hybrid tracking architecture, phased plan, benchmark protocol, and proposed acceptance tests. Manual scale calibration is only a local pixels-per-centimeter estimate; it does not correct perspective distortion. The app now invalidates calibration after preview geometry, source, or camera changes, but this is not a validated accuracy guarantee.

## Camera and tracking

- The camera-first layout fills the mobile viewport and keeps the gallery, shutter, and settings controls at the bottom.
- Camera permission and device support depend on the browser; use HTTPS and allow camera access.
- The live anchor tracker is a lightweight local patch matcher. It follows small translations around a manually marked collar/center anchor, but it is not full-garment segmentation or perspective tracking. Plain fabric, wrinkles, rotation, large camera movement, and changing shadows can cause drift. If confidence drops, re-mark the anchor or use the ghost reference.
- The captured mockup reflects the current composed preview. The preview is not a guarantee of millimeter accuracy; verify physical placement with a ruler before pressing.

## Background removal

Automatic background removal uses `@imgly/background-removal` loaded from an online module. The first run needs internet access. Images that already contain transparent pixels are preserved; images without transparency are processed automatically. If processing fails, check connectivity and use the manual erase/restore tools in Settings.

## Export

- **Export transparent PNG** exports the artwork alone with transparency.
- **Save placement preview** exports the composed preview canvas.
- Export dimensions are calculated from the chosen print width and DPI target. Browsers do not consistently write DPI metadata into PNG files, so confirm the final size in your print software.

## Deploy with GitHub Pages

1. Upload `index.html`, `style.css`, and `app.js` to the repository root.
2. Open **Settings → Pages**.
3. Select **Deploy from a branch**, choose `main` and `/ (root)`, then save.
4. Open the HTTPS URL on your phone and grant camera permission.

## Setup polish (v5.1)

- **Placement lock:** lock the design against manual move, resize, and rotation while leaving shirt tracking enabled, so the overlay continues to follow the garment.
- **Guide appearance:** switch between a translucent shirt/artwork guide and an outline guide for the shirt silhouette and design transparency edges.
- **Settings controls:** locked placement controls are disabled until the design is unlocked.

The outline guide is generated locally from the alpha edge of the shirt cutout and artwork image. For best results, use transparent artwork and capture a shirt guide with good contrast against the background.