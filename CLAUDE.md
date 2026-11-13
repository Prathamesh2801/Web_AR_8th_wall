# Supradyn Bottle WebAR

Product-AR concept: the phone camera detects a real Supradyn Naturals Ginseng bottle
(60-tablet SKU) by its printed label and attaches three.js animations to it. Built on the
open-source 8th Wall engine (2026). No backend, no account, no API keys, **no `.env`**.

## Commands

```bash
npm run dev               # HTTPS dev server on the LAN (camera needs HTTPS) â€” open the Network URL on a phone
npm run tunnel -- <url>   # HTTP dev server behind a VS Code forwarded port (real HTTPS, no cert warning) + QR in the terminal; URL remembered in .tunnel-url.local
npm run build             # production build to dist/
npm run lint              # oxlint
npm test                  # node --test (src/**/*.test.js)
npm run generate-targets -- <brand>  # rebuild public/brands/<brand>/targets/* from its flat label PNG
node scripts/optimize-model.mjs <in.glb> <out.glb> [tris=0] [px] [error] [clean=3] [erode=0]  # raw Meshy GLB (~20 MB) -> web GLB (~2 MB): colour map only (WebP), FULL mesh, meshopt (simplifying made smooth models lumpy)
```

Append `?debug` to the URL to get the TUNE button: the dashboard (src/components/ar/Dashboard.jsx).
It edits `ANIMATIONS` in place, live: per-animation knobs, start delays + "Replay all in sync",
speed, stats. Edits persist in that browser only; "Copy settings" -> paste into config.js.

## Where things live

```
index.html            8th Wall engine/xrextras/landing-page <script>s (CDN, pinned 1.0.0) + #camerafeed canvas
src/config.js         THE tuning file: active brand (DEFAULT_BRAND / ?brand=), smoothing, animations, occlusion, debug. Start here.
src/brands/           one folder per product/brand: brand.js (bottle mm, label, targets, copy, effect content) + data. README = how to add one
  index.js              registry {id: brand}
src/ar/               engine + three.js. NO React imports in this folder.
  startAR.js            loads targets, configures XR8, registers pipeline modules
  imageTargetPipelineModule.js   image events -> lead target -> bottleScene + store
  leadTarget.js         picks which of the overlapping label crops drives the pose (+ test)
  bottleScene.js        anchor, pose smoothing, occlusion, runs animations, tap picking
  occlusionProxy.js     invisible depth model of the bottle (lathed PRODUCT.profile)
  renderOrder.js        fixed draw order for every transparent layer
  animations/index.js   id -> factory registry
  productOutline.js     animation: traces the bottle's silhouette on detection (default on)
  typography.js         animation A01: Supradyn + GINSENG lift off their print in 3D, revolve N rounds, land back (off until chosen)
  tickerRings.js        Typography style "Ticker": tilted text bands round the bottle, scrolling opposite ways; unfold in / fold out
  logoLift.js           Typography style "Logo": the printed brand mark (traced SVG) lifts off its print in 3D (bent->flat morph), a label patch hides the print, glides over the shoulder, turntable above the cap on a light-ring; tap = flies home to its print, rises again
  labelPatch.js         hides a print while its 3D copy is off the label (the Logo): label art without it, colour matched live to the real paper in the camera image (cameraLight.paperAt)
  labelSpin.js          Typography style "Spin": the whole label (brand's label.image, wrapped 360°) fades in over its print, spins round seamlessly, brakes onto a whole turn and lands back on the print
  callouts.js           Typography style "Callouts": dot -> leader line -> card, text typed in; screen-left/right of the bottle, shrink to fit; exits in reverse
  liveColor.js          applies a config colour only when it changed (live tuning without per-frame parsing)
  planted.js            Elements style "Planted": bottle planted in a soil collar (360°), ginseng roots surface + lie on it, grape berries drop/bounce/roll; light matched from the camera (cameraLight.js), crumbling soil edge, contact shadows, grain
  spotlight.js          Effects style "Spotlight": room dims except the bottle (far-plane dark layer the occluder punches through), lamp strikes, beam + dust + table pool
  energy.js             Effects style "Energy": arcs on the bottle's visible edges (ribbons on PRODUCT.profile, rebuilt in place), charge climbs, surges send shockwave rings
  scan.js               Effects style "Scan": scan line climbs/descends revealing a hologram grid (lathed profile), laser sheet, nutrient readouts type out, "Formula scanned" verdict
  sparkle.js            Effects style "Sparkle": cap flash, brand-colour stars burst + swirl + settle into orbit (all motion in the shader); exit rewinds time
  cameraLight.js        mean colour/brightness of the camera image (XR8.CameraPixelArray, 64 px, upright), for lit effects; paperAt() = the real paper colour under a screen box
  techOrbit.js          Elements style "Tech Orbit": the label's printed service badges lift off as 3D coins (icon art), one evenly spaced ring (models spin, bob, grow at the front / shrink at the back; no text in orbit), tap = it rises onto an in-scene info board above the cap; an item's `model` GLB grows out of its badge in place of a coin
  nutrientSystem.js     animation: nutrients emerge from the surface, orbit along the bottle's curve (tap for card; off until chosen)
  settleEffect.js       animation: halo measured from the real silhouette, rises + blooms outward, settles (off until chosen)
  nutrientData.js       the active brand's nutrients (src/brands/<id>/nutrients.js), or empty
  trackingStore.js      the only AR<->React bridge (useSyncExternalStore + getScene())
src/assets.js         preloads every enabled effect's files while the start screen is up (Start button = progress); fills THREE.Cache (`file:`/`image:` keys) + fetchAsset() for plain fetches, so no effect downloads mid-AR. New effect files: add them to assetList()
src/tuning.js         dashboard persistence (localStorage, ?debug only) + copy/reset
src/fullscreen.js     double-tap the camera view = toggle full screen (Android; iPhone Safari has no API)
src/sound.js          UI sounds (Web Audio, unlocked on the Start tap) + haptics
src/components/ar/    2D UI: StartScreen (+ BottleModel: 3D hero lathed from `bottle` + label art, when the brand sets experience.model), AROverlay, LensMenu, PhotoPreview, NutrientCard, Dashboard, ErrorFallback
public/brands/<id>/   per brand: hero.jpg, targets/ (generated: JSON + luminance PNG only), models/ (GLB from scripts/optimize-model.mjs, preloaded by assets.js; sources in brand-assets/<id>/models/*-source.glb, git-ignored)
public/sounds/        lock.mp3, select.mp3, snap.mp3 (Envato Elements, trimmed + peak-normalised mono MP3); volumes in SOUND (config.js)
scripts/generate-targets.mjs   non-interactive target generation (uses the CLI's applyCrop)
public/fonts/         A01 font (Montserrat 800, A-Z, OFL licence alongside)
brand-assets/<id>/    brand reference: README (product facts + shape), label/ or sticker/ art, reference/ (committed), photos/ (local)
```

## Lens menu (Penpot page "02 · Lens Menu")

Snapchat-style: after the first lock (lock sound) the menu appears with nothing selected.
Groups (Type / Elements / Glow) sit in a carousel; the selected one is inside the shutter
ring and is the ONE effect playing. Tapping the ring = photo (`XR8.CanvasScreenshot`,
camera + 3D) -> flash + snap sound -> PhotoPreview (Save / Share). Losing the bottle dims
the menu and keeps the choice. The outline (no `group`, `active: true`) is the lock cue.
The carousel is a native CSS scroll-snap scroller (platform momentum); the pick commits
when scrolling settles. Slot 0 = no effect.

All product copy (start screen, hints, photo file name) comes from the brand file's
`experience`: a new client's product = a new `src/brands/<id>/` (see its README).
Effects needing product content (Typography, Callouts, Ticker, Orbit, Scan, Planted) are
switched off automatically for a brand that doesn't provide it.

## Data flow

- Engine events -> `imageTargetPipelineModule` -> `bottleScene.applyPose()` (every frame,
  unthrottled) and `trackingStore.setPose()` (throttled ~8Hz for React).
- React -> three.js: `trackingStore.getScene()?.setX(...)`. Commands never emit.
- Tap on canvas -> raycast -> `mesh.userData.pick` -> `trackingStore.setSelectedNutrient`.

## Adding an animation

1. `src/ar/<name>.js`: factory `(config) => ({root, build(geometry), update(timeMs, camera), ...optional})`.
   Full contract is at the top of `src/config.js`.
2. Add an `AnimationId` + `ANIMATIONS` entry (`enabled`, `active`, `group`, `label`, `delay`,
   your knobs). `group` (one of `GROUPS`) makes it a style in the lens menu; `label` is its name.
   Read knobs from config every frame and they become live dashboard controls for free.
3. Register in `src/ar/animations/index.js`. It shows up in the lens menu; `bottleScene` is untouched.

Rules every animation must follow (each one was a real bug here):
- Size everything from `geometry` (radius/height in engine units). Never hardcode bottle size.
- `update` must not allocate; integrate time with a clamped `dt` (never `t * speed`).
- Keep `depthTest: true` so the occlusion proxy hides the far side (sole exception:
  productOutline, which draws the product's own edge, and callouts' dots/lines, always on the camera side â€” see its header).
- Give every transparent mesh a `renderOrder` from `renderOrder.js` (else it flickers).
- Use `PRODUCT.profile` (config.js) for anything shaped to the bottle â€” it is the one
  bottle model; the outline and the occluder are both built from it. Edit the shape in
  the brand file's `bottle` (millimetres, heights from the table), never the converted profile.
- Never hard-code product content (words, claims, model files) in an effect: read it
  from config (brand-merged) or `brandFile()`, so every brand can use the effect.

## Tracking facts (verified in the engine source, don't "fix" these)

- `XrController.configure({imageTargetData})` â€” not `imageTargets`.
- `data-preload-chunks="slam"` is required (it attaches `XR8.XrController`), while
  `disableWorldTracking: true` keeps SLAM off.
- CLI writes `CYLINDER`, runtime reports `CYLINDRICAL`; both accepted.
- A crop must be 3:4, so one crop sees ~40% of this 172x52 mm label. Three overlapping
  crops (`supradyn-bottle`, `-left`, `-right`) cover the full wrap. The engine reports pose
  for the FULL label cylinder regardless of crop (`detection-image.cc`, `activationRegion`),
  so crops share one frame.
- Label 172 mm on a 176 mm circumference bottle (see brand-assets/supradyn/README.md).

## Can't be verified without the physical bottle

Detection range, jitter, smoothing feel and crop hand-over need a phone + the real bottle.
Tune `TRACKING.smoothingMs` / `replayAfterMs` in `src/config.js` on device, and record
results in the README test checklist. Do not claim tracking works from a desktop run.

## Conventions

- Plain JS + JSX, no TypeScript. Tailwind v4 utilities; tokens `gold`/`teal` and the `glass`
  utility live in `src/index.css`. 2-space indent, no semicolons.
- XRExtras injects an unlayered `* {font-family: inherit; box-sizing: inherit}` that beats
  every Tailwind layer. `html` in index.css restores border-box + the font; never rely on
  `font-*` family utilities (use `tabular-nums` for figures).
- Check UI at phone sizes (360x640, 375x667) with the XRExtras script loaded â€” a desktop
  preview without it hides the box-sizing problem above.
- Comments explain *why* (the bug or engine fact behind a line), not what.
- XR Engine binary licence: its copyright notice must stay intact â€” load it unmodified.
