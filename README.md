# Supradyn Bottle AR — Cylindrical Image Target POC

WebAR proof-of-concept that detects a **real physical cylindrical bottle** by its printed
label and welds animated three.js content to it.

```
physical bottle → camera → 8th Wall CYLINDRICAL image target
                → pose (position / rotation / scale) → three.js content attached
```

Built on the **2026 open-source 8th Wall toolchain**. No account, no API key, no backend,
no cloud service, no paid SaaS.

---

## Status

| Piece | State |
|---|---|
| Vite + React + three.js + Tailwind scaffold | Working, builds clean |
| 8th Wall engine integration (CDN) | Working |
| Cylindrical target pipeline + events | Implemented against verified engine APIs |
| `supradyn-bottle` target | ⚠️ **Placeholder artwork** — must be regenerated (see below) |
| Tracking verified against a real bottle | ❌ **Not yet done — requires you + the physical bottle** |

I could not run tests 1–11: they need the physical bottle and a phone camera. The checklist
below is ready for you to fill in.

---

## Quick start

```bash
npm install
npm run dev
```

Open the printed **Network** URL (e.g. `https://192.168.1.20:5173/`) on your phone.

The dev server runs over **HTTPS** via `vite-plugin-mkcert` — the camera will not work
otherwise. On first visit you'll get a self-signed certificate warning: tap
*Advanced → Proceed*. Both phone and computer must be on the same Wi‑Fi.

---

## ⚠️ The current target is a placeholder

`public/image-targets/supradyn-bottle.*` was generated from **synthetic test artwork**, not
your product. It exists so the pipeline runs end to end. **It will not detect a real
Supradyn bottle.**

Assumed placeholder measurements: cylinder circumference **210 mm**, label width **160 mm**.

### Regenerating from real artwork

You need the **flattened label artwork** — the label as a flat rectangle, as it would look
peeled off the bottle. A photograph of the bottle is *not* usable: the curvature and
lighting are baked in, and the CLI expects flat input it will curve itself.

Best sources, in order: the print-ready artwork from the brand/printer; a flatbed scan of a
peeled label; or a de-warped composite stitched from several photos.

Requirements: **≥ 480 × 640 px**, cropped to **3:4** (the CLI enforces both).

```bash
npm run generate-target
```

Answer the prompts:

| Prompt | Value |
|---|---|
| Path to the image file | your flattened label |
| Image type | `cylinder` |
| Unit | `mm` |
| **Circumference of the cylinder** | measure around the **whole bottle** |
| **Width of the image** | width of the **label artwork only** |
| Use default crop? | `y` |
| Output folder | `public/image-targets` |
| Name | `supradyn-bottle` |

**Do not confuse the two measurements** — this is the most common cause of a target that
detects but tracks with the wrong curvature:

- **Cylinder circumference** = all the way around the bottle (π × diameter)
- **Image width** = only the arc the printed label actually covers

Measure with a strip of paper wrapped around the bottle, then flatten and read it.

Keep the name `supradyn-bottle` (referenced in `src/ar/startAR.js`) and keep all five output
files together in `public/image-targets/`.

---

## Architecture

React and the AR engine are deliberately kept apart. The tracking loop never depends on
React rendering.

```
index.html          engine <script> tags + #camerafeed canvas (React never touches it)
src/ar/             ← no React imports anywhere in this folder
  startAR.js                engine bootstrap, XrController.configure, error handling
  imageTargetPipelineModule.js   8th Wall pipeline module + image target events
  bottleScene.js            three.js content + applyPose()
  trackingStore.js          the ONLY bridge to React (subscribe/getSnapshot)
src/hooks/useTracking.js    useSyncExternalStore subscription
src/components/             2D UI only — DebugPanel, StatusOverlay, ErrorFallback
```

Pose updates are written **straight into three.js inside the AR loop**
(`bottleScene.applyPose`), never routed through React state. React only mirrors the same
data for the debug panel. A slow render can therefore never stall or jitter tracking.

### Verified API details

Everything below was read from the open-source repository source, not from older docs:

- **`imageTargetData`** (not `imageTargets`) is the current `XrController.configure` field —
  per the `image-target-cli` README and the official A-Frame example. Some older hosted-platform
  docs say `imageTargets`; the repository wins.
- **Type-string mismatch (important):** the CLI writes `"type": "CYLINDER"` into the JSON, but
  the runtime dispatches `type: "CYLINDRICAL"` in event details. The code accepts **both**, so
  neither spelling can silently break detection.
- **Cylindrical pose is used raw.** The engine's own three.js renderer applies a re-centering
  correction only to `PLANAR` targets; for `CYLINDRICAL`/`CONICAL` the reported
  position/rotation are used directly, with the origin at the cylinder's centre.
- **`imagePath` is a URL, not a bundled asset.** The CLI hardcodes the `image-targets/` prefix,
  so the files must be served from the site root — which is why they live in
  `public/image-targets/` and must not be renamed or hashed.
- **Curved targets report** `{height, radiusTop, radiusBottom, arcStartRadians, arcLengthRadians}`
  instead of the planar `{scaledWidth, scaledHeight}`.

### No SLAM

`XrController.configure({disableWorldTracking: true})` — set before `XR8.run()`, as the API
requires. The SLAM chunk preload is also omitted from `index.html`.

Image-target tracking does not need world tracking, so this POC proves the cylindrical
target in isolation. The AR content is anchored to the bottle itself; it is *supposed* to
disappear when the bottle leaves frame.

You would only need SLAM if you later want content to **persist in the room after the
bottle is out of view**. That is a deliberate architecture change — not something to enable
by accident.

---

## What you should see

1. Camera fills the screen, spinner + "Scan the bottle".
2. Point at the bottle label → green **BOTTLE DETECTED** banner.
3. A cyan torus and glowing sphere float above the cap, a halo ring sits at the base, and a
   **"BOTTLE AR"** label floats above.
4. Rotate or move the bottle → content stays welded to it.
5. Hide the bottle → red **TARGET LOST**, content disappears.

The debug panel (top-left) always shows: tracking state, target name, type, detection count,
position, rotation quaternion, scale, live cylinder geometry, and FPS. All target events are
logged to the browser console.

---

## Test checklist

Run on a real device with the real bottle **after regenerating the target**. Record
detection success, tracking stability, pose stability, recovery, jitter, and failure
conditions.

| # | Test | Detected? | Tracking stability | Pose stability | Recovery | Jitter | Notes |
|---|---|---|---|---|---|---|---|
| 1 | Bottle facing camera | | | | | | |
| 2 | Rotated ~30° | | | | | | |
| 3 | Rotated ~60° | | | | | | |
| 4 | Rotated ~90° | | | | | | |
| 5 | Camera closer | | | | | | |
| 6 | Camera farther | | | | | | |
| 7 | Move the bottle | | | | | | |
| 8 | Occlude part of label | | | | | | |
| 9 | Lose target, bring back | | | | | | |
| 10 | Android Chrome | | | | | | |
| 11 | iPhone Safari | | | | | | |

Expectations worth knowing in advance:

- **Test 4 (90°)** is the honest limit. At 90° the visible label arc is near-tangent and
  detection usually drops. This is a property of cylindrical tracking, not a bug — record
  where *your* label actually fails.
- **Test 9** should bump the debug panel's *Detections* counter each time it re-acquires.
- **Test 11**: iOS works only in **Safari**, not in-app browsers (Instagram, Facebook, etc.).

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| Never detects | Placeholder target still installed — regenerate from real artwork |
| Detects, wrong curvature | Circumference vs label-width swapped |
| Content offset from bottle | Label width wrong, or crop doesn't match the printed label |
| Camera never opens | Not HTTPS, or permission denied — check the fallback screen |
| Blank/black screen | Check console; engine CDN scripts may be blocked |
| Console warns about target type | JSON generated as `flat` — regenerate as `cylinder` |

---

## Licence

The 8th Wall XR Engine binary is free for commercial use but is **not** open source, and the
copyright notice in it must remain unmodified. The framework, `xrextras`, and
`image-target-cli` are MIT.
