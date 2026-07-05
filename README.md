# VaseFX

VaseFX is a WebGL vase sculpting tool by Frank Force.

Sculpt, glaze, and render procedural pottery directly in the browser.

## License

This project is licensed under the GNU General Public License v3.0 or later.

- Full text: see LICENSE
- SPDX identifier: GPL-3.0-or-later

## Features

- Interactive sculpting with mouse/touch input
- Undo/redo workflow for shape iteration
- Multiple material and background effects
- Frame/export controls for still image and animation workflows
- Standalone browser build with no backend dependency

## Project Layout

- `index.html` - dev entry page
- `header.html` - html/script header used by build process
- `game.js` - application logic and controls
- `scene.js`, `shader.js`, `webgl.js` - render stack
- `input.js` - interaction and controls
- `utils.js` - shared helpers
- `build.bat` - minified release build pipeline

## Quick Start (Development)

1. Serve the repository with a local static server.
2. Open `index.html` through that server.

Example using Node.js:

```powershell
npm install
npm run dev
```

Then open http://localhost:8080

## Build (Release)

```powershell
npm run build
```

This runs `build.bat`, minifies the source, and writes output to `build/index.html`.

## Controls

Standalone controls from the source:

- Mouse or touch: control view
- 1: save image
- 2: toggle free cam
- 3: toggle frame
- 4: toggle edit mode
- 5: toggle animate

Minting/sculpting controls from the source:

- Mouse click: sculpt
- Drag bottom: rotate
- Mouse wheel: tilt camera
- X / Z: undo / redo
- Ctrl: tight sculpt
- Shift: soft sculpt
- WASD: control view
- Space: stop spin
- R: reset
- G: generate random

## Open Source Publishing Notes

- Keep all third-party notices in `THIRD_PARTY_NOTICES.md`.
- Keep source files in the repository for GPL compliance.
- Include GPL license text in redistributions.

## Contributing

Contributions are welcome. Please read:

- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`
- `SECURITY.md`
