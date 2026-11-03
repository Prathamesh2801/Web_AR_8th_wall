/**
 * config.js — the ONLY place to tune this app. There is no .env: nothing here is
 * secret and everything ships to the browser anyway, so plain constants are simpler
 * and are checked into git with the code they tune.
 *
 * Imported by the AR layer and the UI; holds no React or three.js state.
 *
 * ADDING AN ANIMATION
 *   1. Write `src/ar/<name>.js` exporting a factory `(config) => module` that returns:
 *        root                      THREE.Object3D, added under the tracked bottle
 *        build(geometry) -> bool   size to the real cylinder, once. `geometry` is
 *                                  {radiusTop, radiusBottom, height} in engine units;
 *                                  return false if unusable (it will be retried)
 *        update(timeMs, camera)    per frame; MUST NOT allocate (runs in the AR loop)
 *      Optional, used when present:
 *        restartEntrance()         replay the intro (bottle re-acquired / re-activated)
 *        setUserSpeed(v)           debug speed multiplier, 0..3
 *        getPickables() -> Mesh[]  tappable meshes; set `mesh.userData.pick = item`
 *        setSelected(id|null)      reflect the tapped item's id
 *        getDebugInfo() -> object  merged into the debug panel
 *   2. Add an id to `AnimationId` and an entry in `ANIMATIONS` below.
 *   3. Register the factory in src/ar/animations/index.js.
 *   It then appears as a chip in the AR screen. bottleScene.js needs no changes.
 *
 * Invariants every animation must keep: materials keep `depthTest: true` (so the
 * occlusion proxy can hide the far side) and transparent meshes take a fixed
 * `renderOrder` from src/ar/renderOrder.js (or they flicker against each other).
 */

/**
 * The physical bottle, in MILLIMETRES — measure the real one and type it in here.
 * The single model every animation shares: the outline draws it, the occlusion proxy
 * is built from it, and `npm run generate-targets` reads the label/circumference.
 *
 * The engine tracks only the label band; everything above and below it is drawn from
 * this profile, so its accuracy IS the outline's accuracy. Measure with a ruler stood
 * next to the bottle (heights from the table) and calipers/ruler across (diameters).
 *
 * After changing circumference / labelWidth, run `npm run generate-targets`.
 */
const BOTTLE_MM = {
  circumference: 176, // around the label — confirmed on the real bottle
  labelWidth: 172,    // printed label length (artwork KLD: 172 x 52)
  labelHeight: 52,    // printed label height (artwork)
  labelBottom: 12,    // table -> bottom edge of the label. ESTIMATE, measure it

  // [height above the table, radius] in mm, base -> cap top.
  // The body is ONE straight cylinder, same 176mm circumference above, on and below
  // the label (confirmed; brand-assets/reference/ref-6.jpeg). Only the last ~4mm at
  // the table curve in — the rounded bottom edge.
  profile: [
    [0.8, 26],      // base contact (rounded foot)
    [0.8, 26],
    [2, 27.5],
    [4, 28],      // full body width
    [64, 28],     // label top (labelBottom + labelHeight); shoulder turns in from here
    [67.6, 27.2],
    [71.3, 25.8],
    [74.9, 23.8],
    [78.4, 20.2],
    [79.6, 17.6], // neck
    [80.4, 17.6],
    [81.2, 19.6], // cap lip — cap ~39mm across
    [92.1, 19.6],
    [93.6, 18.5], // cap top, rounded edge. Total height ~94mm — measure it
  ],
}

/**
 * The same profile in the units the engine reports: y in label heights from the
 * label's centre (label = -0.5..0.5), radius in label radii. Use this in animations.
 */
export const PRODUCT = {
  mm: BOTTLE_MM,
  profile: BOTTLE_MM.profile.map(([h, r]) => [
    (h - BOTTLE_MM.labelBottom) / BOTTLE_MM.labelHeight - 0.5,
    r / (BOTTLE_MM.circumference / (2 * Math.PI)),
  ]),
}

/** Image-target tracking. */
export const TRACKING = {
  /**
   * Targets to load from public/image-targets/<name>.json. They are overlapping crops
   * of ONE label (see scripts/generate-targets.mjs) so the bottle is detected from
   * any side; all report the same cylinder frame. When several are tracked at once,
   * the first one found drives the pose (src/ar/leadTarget.js). A missing file is
   * skipped with a console warning.
   */
  targets: ['supradyn-bottle', 'supradyn-bottle-left', 'supradyn-bottle-right'],

  /**
   * Pose smoothing time constant, ms. Higher = steadier but the content lags behind
   * a fast-moving bottle. 0 = raw engine pose. Tune on a real device: ~30-80.
   */
  smoothingMs: 45,

  /**
   * A loss shorter than this keeps the animation where it was when the bottle comes
   * back; a longer one replays the entrance. Stops a one-frame dropout at the label's
   * edge from restarting the whole show.
   */
  replayAfterMs: 1500,
}

/** Stable ids, so debug output, UI and config keys cannot drift apart. */
export const AnimationId = {
  PRODUCT_OUTLINE: 'productOutline',
  NUTRIENT_ORBIT: 'nutrientOrbit',
  SETTLE: 'settle',
}

/**
 * Every animation the app knows about, in chip order.
 *   enabled  false = removed entirely (not built, no chip)
 *   active   true  = plays the moment the bottle is detected; false = off until its
 *                    chip is tapped
 */
export const ANIMATIONS = {
  /**
   * Traces the whole product's silhouette on detection — the check that detection
   * and tracking are right: the lines should hug the real bottle's edges.
   */
  [AnimationId.PRODUCT_OUTLINE]: {
    enabled: true,
    active: true,
    label: 'Outline',

    color: '#FFD45A',          // silhouette lines (shape = PRODUCT.profile)
    labelBandColor: '#7FE3D3', // rings at the tracked label's top/bottom edges
    showLabelBand: true,       // show where the engine's 52mm tracked band is
    thickness: 0.022,          // line thickness, x bottle radius (~0.6mm)
    opacity: 0.95,
    drawDuration: 900,         // ms to trace base -> cap
    pulseSpeed: 1.6,           // rad/s of the resting breath

    showBase: true,            // false = stop at the label's bottom edge
  },

  /** Nutrients orbiting the bottle on three tilted rings; tap a node for its card. */
  [AnimationId.NUTRIENT_ORBIT]: {
    enabled: true,
    active: false,
    label: 'Nutrients',
  },

  /** Warm golden energy gathers, peaks, then settles into a calm aura. */
  [AnimationId.SETTLE]: {
    enabled: true,
    active: false,
    label: 'Glow',

    // Palette
    glowColor: '#FFD45A', // primary gold
    highlightColor: '#FFF1A8', // bright edge highlight
    deepColor: '#D99A22', // deep warm gold, outer aura and base
    emberColor: '#FFF8D6', // very soft warm white sparks

    // Timing
    entranceDuration: 2000, // ms for the full entrance, peak at ~60%
    energySpeed: 1.6, // ribbon revolutions per second at peak

    // Aura shell radii, as multiples of the tracked bottle radius. Kept tight: widely
    // spaced shells sum into a thick sheath rather than a thin rim of light.
    innerGlowScale: 1.005,
    middleGlowScale: 1.018,
    outerGlowScale: 1.04,

    // Embers
    particleCount: 120,
    particleSpread: 1.14, // outermost particle radius, in bottle radii

    // Resting state
    finalAuraOpacity: 0.22, // steady rim intensity after settling
    finalPulseSpeed: 0.55, // rad/s of the resting breath
  },
}

/**
 * The invisible depth cylinder that hides content passing behind the bottle. Not an
 * animation: it is the shared depth model of the product that all of them rely on.
 */
export const OCCLUSION = {
  enabled: true,
}

/**
 * Debug UI. The DEBUG button is hidden from normal users; open the app with `?debug`
 * in the URL to show it.
 */
export const DEBUG = {
  panelOpenOnLoad: false,
  /** Starting animation-speed multiplier; the debug panel changes it live. */
  speed: 1,
}

/** Ids of every enabled animation, in declaration order. */
export const enabledAnimationIds = () =>
  Object.keys(ANIMATIONS).filter((id) => ANIMATIONS[id].enabled)

/** Config for one animation, or an empty object so callers can destructure safely. */
export const animationConfig = (id) => ANIMATIONS[id] ?? {}
