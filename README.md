DTF Studio — Flat-Garment Alignment
A mobile-first, browser-based tool for aligning physical DTF transfers on garments laid flat under an overhead phone camera.
Current workflow
Serve the files over HTTPS (camera permissions generally require a secure context).
Start the camera or choose a shirt photo.
For a repeatable overhead setup, tap Capture shirt guide. The app sends a captured frame to the online background-removal model and displays the result as a translucent ghost overlay. Align the live garment with that guide to repeat camera position and height. Use a contrasting table and even lighting for best results.
Tap Set collar & center anchor, tap the collar center, then tap the shirt centerline at collar height. Select a placement preset and adjust the design as needed.
Use Tracking on / Lock position to toggle lightweight live patch tracking. The tracker follows small image movements near the anchor; if the fabric is plain, lighting changes, or tracking confidence drops, re-mark the anchor or lock the position.
Upload artwork, optionally remove its background, and export a transparent PNG at a chosen physical width and target DPI.
Placement and camera reference notes
The translucent shirt cutout is a visual camera-position reference, not a metric depth sensor. It helps repeat framing and camera height by matching the live shirt to a captured silhouette.
The cutout uses an online background-removal model. Results depend on shirt/table contrast; the model may isolate more or less than the garment. Recapture or use manual collar/center alignment if it fails.
The live anchor tracker is a lightweight local grayscale patch matcher with brightness-normalized matching and a wider recovery search. It follows small translations around the manually marked collar/center anchor; it is not a robust full-garment segmentation or perspective-tracking system. Plain fabric, wrinkles, rotation, large camera movement, and changing shadows can still cause drift. If confidence drops, align the live shirt to the fixed ghost reference or re-mark the anchor.
For best repeatability, mount the phone overhead, keep it parallel to the table, use steady lighting, flatten the garment, and keep the collar visible.
The visual placement preview is not a guarantee of millimeter accuracy. Verify with a ruler before pressing.
The export creates the selected pixel dimensions based on physical width and DPI target. Browsers do not consistently write DPI metadata to PNG, so confirm size in your print software.
Files
`index.html` — responsive interface
`style.css` — minimalist iOS-inspired UI
`app.js` — camera/photo workflow, shirt guide, anchor tracking, artwork editing, and export
Deploy with GitHub Pages
Upload all project files to the root of a repository.
Open Settings → Pages.
Select Deploy from a branch, choose `main` and `/ (root)`, then save.
Open the generated HTTPS URL on the phone and grant camera permission.
The first use of automatic cutout/background removal needs an internet connection to load the model. Camera and basic manual placement can work without that model after the page is loaded.
