# VaseFX

VaseFX is a generative art vase sculpting tool by Frank Force.

Sculpt, glaze, and render procedural pottery directly in your browser.

Originally released on [fxhash in 2024](https://www.fxhash.xyz/project/fxvase), it has since been reworked for this open source release.

# [Live Demo](https://killedbyapixel.github.io/VaseFX/)

![Screenshot](screenshot.jpg)

## How To Use

- Open the app in your browser.
- Sculpt with mouse or touch.
- Export your image when you are happy with the result.

## Controls

- Mouse or touch: control view
- 1: save image
- 2: toggle free cam
- 3: toggle frame
- 4: toggle edit mode
- 5: toggle animate

Sculpting controls (edit mode):

- Mouse click: sculpt
- Drag bottom: rotate
- Mouse wheel: tilt camera
- Z / X: undo / redo
- Alt or middle click: detail sculpt
- Shift: soft sculpt
- WASD: control view
- Space: stop spin
- R: reset
- G: generate random

![Examples](examples.gif)

## How It Works

Everything you see is drawn by a single WebGL fragment shader that raymarches a signed distance field — there is no polygon mesh. The vase itself is just a profile curve: 256 radius and smoothness values that are packed into a small data texture and revolved around the vertical axis by the shader. Sculpting edits that profile, which is also why undo history, saved vases, and share URLs stay so compact.

The glazes and scenes are procedural too. Layers of seeded noise drive the glaze patterns (marble, spirals, iridescence, and more), blending between two colors. The surface is lit by an ambient term and two randomized directional lights with soft raymarched shadows. Every random choice flows from a seeded random number generator, so the same seed and parameters always reproduce the same vase, which is what makes the share links work.

## License

VaseFX is released under the [GPL-3.0 License](LICENSE).
