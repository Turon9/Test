# DTF Placer

A static, camera-based tool for lining up DTF designs on shirts. Open it on a phone, point the camera at the shirt, and a highlighted cutout shows where the design will land.

## Features

- Live camera overlay (works on iPhone Safari and Android Chrome)
- Upload artwork (PNG recommended) or use a plain rectangle
- Drag to move, pinch to resize, twist to rotate
- Preset positions: center chest, left/right chest, upper back, full front
- Distance from collar, offset from center, and tilt readouts you can also type in
- Grid, collar line and center line
- Freeze frame (steady the view while adjusting), or use a photo of the shirt
- Save or share a screenshot
- cm / inch units

## Scale calibration

Browsers on iPhone can't measure real distances, so the scale is set by you:

1. Tap **Calibrate**.
2. Tap two points a known distance apart, such as the shirt width edge to edge or a ruler laid on the shirt.
3. Enter the real distance and tap **Apply**.

Keep the phone at about the same distance and angle from the shirt afterwards. If you move closer or farther, recalibrate. Holding the phone parallel to the shirt gives the best accuracy.

## Collar and center

Tap **Collar / center** and touch the shirt: the horizontal line marks the collar seam and the vertical line marks the shirt center. All distances are measured from these.

## Deploy on GitHub Pages

1. Create a new GitHub repository and upload `index.html`, `style.css`, `app.js` and `README.md` to the root.
2. Go to **Settings > Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, select `main` and `/ (root)`, then Save.
4. After a minute, your site is live at `https://<username>.github.io/<repo>/`.

Camera access needs HTTPS, which GitHub Pages provides. Opening `index.html` directly from a file will not allow the camera, but the photo option still works.

## Notes

- iPhone Safari does not support WebXR AR, so this uses a camera overlay instead of surface-tracked AR.
- Placement presets are common starting values (for example, center chest about 8 cm below the collar). Edit them in `PRESETS` at the top of `app.js`.
