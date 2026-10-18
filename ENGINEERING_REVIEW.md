# DTF Studio engineering review and implementation plan

## Executive assessment

DTF Studio is currently a browser-only mockup and placement-assistance tool. Its strongest foundation is the direct canvas workflow, manual two-point scale calibration, local image processing, and lightweight patch tracking. It is **not yet a validated physical placement measurement system**.

The current tracker uses one manually selected image patch and estimates 2D translation. It does not estimate garment rotation, perspective, camera motion, or independent shirt geometry. A handheld camera introduces camera motion and changing distance, which can look like garment motion. A single patch cannot reliably distinguish these effects. Manual scale calibration also provides only a local pixels-per-centimeter estimate; it does not correct perspective distortion or camera tilt.

No accuracy or tracking performance is claimed in this review. Baseline measurement and repeatability testing must precede any tolerance commitment.

## Current-state findings

### High priority
1. **Calibration can become stale.** The old implementation retained the calibrated flag after the preview dimensions/orientation or source changed. This could leave the readout looking calibrated even though the pixel geometry changed.
2. **The scale model is a single scalar.** One px/cm value assumes a locally uniform scale. A handheld, oblique view violates this assumption across the garment.
3. **Tracking is translation-only.** A single patch estimates movement around the anchor; it cannot robustly infer the garment's rotation or scale, nor separate camera motion from shirt motion.
4. **Confidence is heuristic.** Patch score/uniqueness is not a statistically calibrated probability. A displayed percentage should be treated as a relative tracker score, not a guarantee.
5. **The preview is not a measurement instrument by itself.** Display-size changes, browser zoom, camera autofocus/zoom, lens distortion, cloth wrinkles, and perspective can all affect measurements.

### Strengths to preserve
- Browser-only deployment; no backend is required for the first engineering iteration.
- Manual calibration workflow and explicit print dimensions.
- Existing upload, background removal, design editing, lock controls, camera preview, and export.
- Existing low-confidence/recovery messaging and manual anchor selection.

## Recommended target architecture

Use a **geometry-first, hybrid tracker**, with AI as an optional garment/landmark detector rather than the source of physical scale.

1. **Camera normalization and measurement plane**
   - Use the original video frame as the coordinate reference for tracking and measurement, not just the resizable display canvas.
   - Record source dimensions, crop/cover transform, orientation, and camera settings when available.
   - Ask the operator to keep the shirt flat and the camera near perpendicular. Treat camera movement as a measurement-session change until the geometry can be re-estimated.

2. **Manual metric calibration**
   - Have the operator mark two endpoints of a ruler or known garment measurement on the same plane as the print.
   - Store calibration with the source-frame geometry and a session identifier.
   - Invalidate it when the source, orientation, crop/preview geometry, or a detected scale change makes it unsafe to reuse.
   - For physical placement, prefer a printed fiducial/known-size reference near the garment or multiple known points to estimate a planar homography. Two-point scalar calibration is an interim method, not perspective correction.

3. **Multi-feature tracking**
   - Track three T-shirt-specific landmarks: neckline center, left shoulder seam, and right shoulder seam. Track spatially separated patches around these landmarks using pyramidal optical flow or a feature matcher.
   - Reject outliers with RANSAC; estimate translation, rotation, and scale from inliers. If the garment is planar and enough reliable points are available, estimate a homography.
   - Use AI landmark detection to propose the neckline center and both shoulder seams; geometry validates temporal consistency and estimates shirt translation, shoulder-line rotation, and apparent width change.
   - Keep the current manual anchor flow as fallback and provide a clear “tracking lost—re-align” state.

4. **Measurement model**
   - Separate display coordinates, source-frame coordinates, and garment-plane coordinates.
   - Convert design width/height and placement offsets through the calibrated transform. Show calibration age/state and uncertainty, not just a binary “calibrated” label.
   - Do not present a millimeter error bound until the benchmark supports it.

5. **Failure-safe behavior**
   - When confidence, inlier count, or geometry consistency falls below a measured threshold, stop automatic movement rather than extrapolating indefinitely.
   - Preserve the last stable transform and let the user manually reacquire.
   - Keep all image processing local where practical; lazy-load model assets and disclose external module/model downloads.

## Phased implementation plan

### Phase 0 — establish baseline (now)
- Fix stale-calibration signaling and reject invalid/degenerate manual calibration input.
- Build a repeatable benchmark using a flat shirt, ruler/reference marks, fixed lighting, and recorded camera/device/browser.
- Record absolute placement error, width/height error, repeatability, tracking loss rate, recovery time, and frame latency.
- Do not set a pass tolerance until the baseline data is collected.

### Phase 1 — trustworthy manual metric mode
- Keep source-frame coordinates stable and explicitly map them to the visible canvas.
- Add calibration session metadata and invalidation on geometry/source changes.
- Show a persistent warning when calibration is invalid or the camera may have moved.
- Add exportable test records containing ground truth, estimate, absolute error, device/browser, and calibration method.

### Phase 2 — T-shirt neckline-and-shoulder geometry tracking
- Add three-landmark tracking for the neckline center and both shoulder seams, with outlier rejection and a confidence gate.
- Estimate planar translation/rotation/scale first; then add homography only when enough stable points exist.
- Compare against the current single-patch tracker using the same benchmark clips and ground truth.
- On failure, freeze tracking and request reacquisition rather than silently drifting.

### Phase 3 — hybrid AI T-shirt landmark detection
- Add an optional browser-compatible model for T-shirt neckline-center and left/right shoulder-seam proposals. Keep the landmark schema focused on crew-neck T-shirts initially; treat V-necks, hoodies, raglan seams, and obscured seams as separate validation cases.
- Fuse semantic detections with geometric tracks; reject impossible jumps and maintain temporal continuity.
- Benchmark model load time, memory, frame latency, and accuracy on representative shirts, colors, wrinkles, lighting, and devices.

### Phase 4 — production validation
- Run repeated measurements across devices, distances, camera angles, and garment sizes.
- Define acceptance thresholds from observed distributions and intended operational risk.
- Document supported conditions and known exclusions; do not advertise millimeter-level accuracy without evidence.

## Benchmark protocol

For each trial, place a flat shirt on a table. Put a ruler or known-size reference in the same plane as the intended print. Define ground-truth coordinates for at least the print center and top edge from the reference. Record the source image/video and device/browser details. Repeat the same setup at least 30 times before drawing conclusions; use more trials and multiple garment/device combinations before a production claim.

Calculate:
- Center error: Euclidean distance between estimated and ground-truth print center, in mm.
- Top-edge offset error: absolute difference in collar/reference-to-print-top distance, in mm.
- Width and height error: absolute difference from measured ground truth, in mm.
- Repeatability: standard deviation and 95th percentile of repeated center/offset errors.
- Tracking robustness: successful-frame fraction, false-lock count, loss events per minute, and median reacquisition time.
- Runtime: median and 95th percentile frame processing time, model initialization time, and peak memory where measurable.

Keep training/tuning clips separate from evaluation clips. Report sample count, median, 95th percentile, maximum, and failure cases—not only an average.

## Acceptance tests

These are proposed test definitions, **not achieved results**.

| Test | Procedure | Report / initial gate |
|---|---|---|
| Calibration input validation | Try missing, zero, negative, nonnumeric, and two nearly coincident points | All invalid cases rejected; valid calibration only after a positive known distance and usable point separation |
| Calibration invalidation | Calibrate, then resize/orient the preview and switch source/camera | UI must no longer represent the scale as valid; operator must recalibrate |
| Static repeatability | 30+ repeated placements with the camera and shirt fixed | Report median, P95, maximum center and top-edge error; use results to set gate |
| Handheld perturbation | Move camera laterally and change distance/angle while shirt remains fixed | Tracker must detect unreliable geometry or invalidate metric mode; no silent accuracy claim |
| Shirt translation | Move the flat shirt in small controlled steps while keeping camera fixed | Measure tracking error, false locks, lost frames, and recovery time |
| Rotation / scale | Rotate or change apparent size of the shirt in controlled increments | Current version is expected to fail full pose estimation; target architecture must quantify improvement |
| Low texture / occlusion | Test plain fabric, wrinkles, hand occlusion, and shadow changes | No unbounded drift; fail safe and provide reacquisition instructions |
| Regression | Upload art, background removal, drag/pinch, anchor/design lock, guide, calibration, PNG export | Existing workflows continue to work |
| Browser/runtime | Test current Chrome/Firefox/Safari mobile and desktop where supported | Record camera permissions, errors, processing latency, and memory |

### Initial operational gates to consider after baseline
- No silent use of an invalid calibration.
- No false “tracking success” after a rejected frame.
- All critical workflow regression tests pass.
- Numeric error tolerance is selected only after baseline and stakeholder review.

## Implemented in this branch

- Manual calibration now rejects nonnumeric/nonpositive distances and point pairs that are too close to provide a usable measurement.
- Calibration is invalidated when the preview dimensions/orientation change, when a new photo source is loaded, or when the camera is restarted/flipped.
- The UI prompts the operator to recalibrate and warns that a single scale does not correct perspective distortion.
- Manual reset clears calibration state and points.

These changes improve failure signaling only. They do **not** improve the underlying tracker to full-garment pose estimation, remove perspective distortion, or establish physical accuracy. Those require the benchmark and subsequent architecture phases above.
