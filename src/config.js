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
 *        getDebugInfo() -> object  merged into the dashboard's Stats
 *        exit() + isExited()       graceful exit when the user switches away: bottleScene
 *                                  keeps calling update() until isExited() is true
 *   2. Add an id to `AnimationId` and an entry in `ANIMATIONS` below.
 *   3. Register the factory in src/ar/animations/index.js.
 *   It then appears as a chip in the AR screen and a tab in the dashboard (`?debug`),
 *   which edits these objects IN PLACE: read knobs from your config every frame (use
 *   liveColor() for colours) and they tune live. `delay` (s) is handled by bottleScene:
 *   it holds the animation back that long after a (re)start, so effects play in sync.
 *   bottleScene.js needs no changes.
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
  labelWidth: 172, // printed label length (artwork KLD: 172 x 52)
  labelHeight: 52, // printed label height (artwork)
  labelBottom: 12, // table -> bottom edge of the label. ESTIMATE, measure it

  // [height above the table, radius] in mm, base -> cap top.
  // The body is ONE straight cylinder, same 176mm circumference above, on and below
  // the label (confirmed; brand-assets/reference/ref-6.jpeg). Only the last ~4mm at
  // the table curve in — the rounded bottom edge.
  profile: [
    [0.8, 26], // base contact (rounded foot)
    [0.8, 26],
    [2, 27.5],
    [4, 28], // full body width
    [64, 28], // label top (labelBottom + labelHeight); shoulder turns in from here
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
};

/**
 * The same profile in the units the engine reports: y in label heights from the
 * label's centre (label = -0.5..0.5), radius in label radii. Use this in animations.
 */
const profile = BOTTLE_MM.profile.map(([h, r]) => [
  (h - BOTTLE_MM.labelBottom) / BOTTLE_MM.labelHeight - 0.5,
  r / (BOTTLE_MM.circumference / (2 * Math.PI)),
]);

export const PRODUCT = {
  mm: BOTTLE_MM,
  profile,
  /** Bottle radius (label radii) at height y (label heights), clamped to base..cap. */
  radiusAt: (y) => {
    if (y <= profile[0][0]) return profile[0][1];
    for (let i = 1; i < profile.length; i++) {
      const [y1, r1] = profile[i];
      if (y <= y1) {
        const [y0, r0] = profile[i - 1];
        return r0 + (r1 - r0) * ((y - y0) / (y1 - y0 || 1));
      }
    }
    return profile[profile.length - 1][1];
  },
};

/**
 * The client + product this build is for: everything the 2D UI says about the product.
 * A new client's product = new targets + PRODUCT model + this block (+ its hero image).
 */
export const EXPERIENCE = {
  brand: "Supradyn",
  product: "Naturals Ginseng",
  maker: "Bayer",
  headline: "Bring your product to life.",
  intro: "Point your camera at your Supradyn Naturals Ginseng bottle and watch it come alive in 3D. Then snap a photo and share it.",
  lookFor: "your Supradyn bottle", // "Point at ___"
  heroImage: "/brand/hero.jpg", // product photo on the start screen (public/)
  photoName: "supradyn-ar.jpg", // file name of saved photos
};

/**
 * UI sound volumes, 0..1 (public/sounds/<name>.mp3). Played level = volume x the
 * sound's own level. Tunable live in the dashboard (Sync tab).
 */
export const SOUND = {
  volume: 0.8, // master; 0 = silent
  lock: 0.9, // bottle detected
  select: 0.45, // effect picked (plays often: keep it low)
  snap: 0.8, // photo taken
};

/** Image-target tracking. */
export const TRACKING = {
  /**
   * Targets to load from public/image-targets/<name>.json. They are overlapping crops
   * of ONE label (see scripts/generate-targets.mjs) so the bottle is detected from
   * any side; all report the same cylinder frame. When several are tracked at once,
   * the first one found drives the pose (src/ar/leadTarget.js). A missing file is
   * skipped with a console warning.
   */
  targets: ["supradyn-bottle", "supradyn-bottle-left", "supradyn-bottle-right"],

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
};

/** Stable ids, so debug output, UI and config keys cannot drift apart. */
export const AnimationId = {
  PRODUCT_OUTLINE: "productOutline",
  TYPOGRAPHY: "typography",
  CALLOUTS: "callouts",
  TICKER: "tickerRings",
  NUTRIENT_ORBIT: "nutrientOrbit",
  SETTLE: "settle",
};

/**
 * Effect groups of the lens menu, in carousel order. Each animation with a `group` is one
 * style (variant) of that group; the user plays ONE effect at a time. Adding a style =
 * a new ANIMATIONS entry with the same `group` — it appears in the tray automatically.
 */
export const GROUPS = [
  {id: "type", label: "Typography"},
  {id: "elements", label: "Elements"},
  {id: "glow", label: "Effects"},
];

/**
 * Every animation the app knows about.
 *   enabled  false = removed entirely (not built, not in the menu)
 *   active   true  = plays the moment the bottle is detected. Only the outline (no
 *                    `group`: it is the lock confirmation, not a menu choice).
 *   group    which lens-menu group it is a style of; `label` is the style's name
 */
export const ANIMATIONS = {
  /**
   * The lock cue: traces the product's silhouette on detection, then fades to a faint
   * line (or away, while an effect plays). Also the tracking check: the trace should
   * hug the real bottle's edges.
   */
  [AnimationId.PRODUCT_OUTLINE]: {
    enabled: true,
    active: true,
    label: "Outline",
    delay: 0, // s after sync start

    color: "#FFD45A", // silhouette lines (shape = PRODUCT.profile)
    labelBandColor: "#7FE3D3", // rings at the tracked label's top/bottom edges
    showLabelBand: false, // calibration aid: the engine's 52mm tracked band
    thickness: 0.022, // line thickness, x bottle radius (~0.6mm)
    opacity: 0.95,
    drawDuration: 900, // ms to trace base -> cap
    holdDuration: 400, // ms fully lit after the trace
    fadeDuration: 700, // ms to fade to rest (a glint runs up the edge meanwhile)
    idleOpacity: 0.15, // resting level when no effect plays (0 = gone); hidden while one does
    pulseSpeed: 1.6, // rad/s of the resting breath

    showBase: true, // false = stop at the label's bottom edge
  },

  /**
   * A01 3D Typography (Penpot): printed words come to life — a shimmer, then they lift
   * off the label letter by letter into 3D, revolve, land back on their print and
   * settle into it. Each word has its own controls below.
   */
  [AnimationId.TYPOGRAPHY]: {
    enabled: true,
    active: false,
    group: "type",
    label: "Lift & Spin",
    delay: 0, // s after sync start (dashboard: Replay all)

    shimmerColor: "#FFF1A8", // the recognise / farewell sweep

    // Calibration: each flat word must start exactly on its print. If they sit beside
    // it on the phone, rotate them round the bottle here (+ = to the right).
    printAzimuthDeg: 0,

    words: {
      supradyn: {
        show: true,
        faceColor: "#1F3A8A", // logo navy (lifted a touch: the matcap darkens it, deeper reads black)
        sideColor: "#3355AA", // same navy, lighter so the depth reads
        glowColor: "#FFC84A",
        glow: 0.18, // gold glow behind the letters, 0..1
        slantDeg: 12, // the logo's italic
        letterHeight: 0.22, // lifted letters, x label height
        radius: 1.45, // orbit radius, x bottle radius
        height: 0.45, // orbit height, x label height from its centre (print +0.26)
        direction: -1, // 1 = front moves right, -1 = left
        speed: 0.3, // rev/s
        rounds: 1, // whole turns before it lands back on its print
        delay: 0.3, // s after the animation starts
        loop: true, // replay after exiting
        loopPause: 1.5, // s between loops
      },
      ginseng: {
        show: true,
        faceColor: "#E2483B", // label red
        sideColor: "#D9A23A",
        glowColor: "#FFC84A",
        glow: 0.2,
        slantDeg: 0,
        letterHeight: 0.2,
        radius: 1.3,
        height: 0, // print is at -0.25
        direction: 1,
        speed: 0.3,
        rounds: 1,
        delay: 0,
        loop: true,
        loopPause: 1.5,
      },
    },
  },

  /**
   * Feature callouts: a dot on the bottle, a line drawn out to the side, a card whose
   * text types in. Alternate items left/right; switching away plays it backwards.
   * Copy is the front label's own claims ("helps boost energy, stamina & mental focus",
   * "multivitamin for men") — keep new text to what the pack says.
   */
  [AnimationId.CALLOUTS]: {
    enabled: true,
    active: false,
    group: "type",
    label: "Callouts",
    delay: 0,

    // side: -1 left / 1 right of the bottle on screen; y: where the dot sits on the
    // label, x label height from its centre (label = -0.5..0.5; keep within ±0.4).
    // Order = entrance order.
    items: {
      energy: {text: "Energy boost", side: -1, y: 0.3},
      focus: {text: "Mental focus", side: 1, y: 0.15},
      stamina: {text: "Stamina", side: -1, y: -0.15},
      men: {text: "Multivitamin", side: 1, y: -0.3},
    },
    stagger: 650, // ms between items entering
    typeSpeed: 45, // ms per letter
    cursorLinger: 900, // ms the cursor blinks after the text is complete

    lineColor: "#FFD45A",
    cardColor: "rgba(6, 52, 50, 0.82)", // deep label teal, see-through
    cardBorderColor: "rgba(255, 212, 90, 0.55)",
    cardHeight: 0.3, // x label height
    minFit: 0.55, // cards shrink to stay on screen, down to this x their size
    followMs: 350, // how gently the layout turns to face you (higher = steadier, laggier)
    reach: 1.2, // elbow distance from the axis, x bottle radius (card starts ~0.2 further)
    lineThickness: 0.012, // x bottle radius
    dotSize: 0.12, // x bottle radius
  },

  /**
   * Ticker: text bands wrapped round the bottle, tilted, scrolling opposite ways. The
   * far side passes behind the bottle. Copy = the front label's own words.
   * Text, colours, radius and band height are read when built (reload to see edits);
   * height, tilt, speed and direction are live.
   */
  [AnimationId.TICKER]: {
    enabled: true,
    active: false,
    group: "type",
    label: "Ticker",
    delay: 0,

    rings: {
      top: {text: "ENERGY  •  STAMINA  •  MENTAL FOCUS", y: 0.3, radius: 1.3, tiltDeg: 7, speed: 0.05, direction: -1},
      bottom: {text: "GINSENG  •  MULTIVITAMIN FOR MEN", y: -0.28, radius: 1.42, tiltDeg: -5, speed: 0.04, direction: 1},
    },
    bandHeight: 0.19, // x label height
    entranceDuration: 1100, // ms per ring to unfold (exit takes 60% of it)
    stagger: 300, // ms between rings
    backOpacity: 0.3, // the far half, seen past the bottle's sides

    textColor: "#FFFFFF",
    accentColor: "#FFD45A", // separators + edge rules
    bandColor: "rgba(6, 52, 50, 0.6)", // see-through label teal behind the text
  },

  /** Nutrients orbiting the bottle on three tilted rings; tap a node for its card. */
  [AnimationId.NUTRIENT_ORBIT]: {
    enabled: true,
    active: false,
    group: "elements",
    label: "Orbit",
    delay: 0,
    orbitSpeed: 1, // x each ring's base speed
  },

  /** Warm golden energy gathers, peaks, then settles into a calm aura. */
  [AnimationId.SETTLE]: {
    enabled: true,
    active: false,
    group: "glow",
    label: "Golden",
    delay: 0,

    // Palette
    highlightColor: "#FFF1A8", // hot light right at the bottle's edge
    deepColor: "#D99A22", // warm gold it fades to further out
    emberColor: "#FFF8D6", // very soft warm white sparks

    // Timing
    entranceDuration: 2400, // ms: light rises base -> cap, blooms (peak ~60%), settles

    // Halo, measured from the bottle's real silhouette (PRODUCT.profile)
    glowReach: 0.9, // how far the light can extend, x bottle radius
    glowFalloff: 0.12, // resting softness: light halves every ~0.7x this, x bottle radius

    // Embers
    particleCount: 30,
    particleSpread: 1.2, // outermost ember distance off the surface, in bottle radii (+1)

    // Resting state
    finalAuraOpacity: 0.75, // resting brightness, x the entrance peak
    finalPulseSpeed: 0.55, // rad/s of the resting breath
  },
};

/**
 * The invisible depth cylinder that hides content passing behind the bottle. Not an
 * animation: it is the shared depth model of the product that all of them rely on.
 */
export const OCCLUSION = {
  enabled: true,
};

/**
 * Dashboard (TUNE button). Hidden from normal users; open the app with `?debug`
 * in the URL to show it.
 */
export const DEBUG = {
  panelOpenOnLoad: false,
  /** Starting animation-speed multiplier; the debug panel changes it live. */
  speed: 1,
};

/** Ids of every enabled animation, in declaration order. */
export const enabledAnimationIds = () =>
  Object.keys(ANIMATIONS).filter((id) => ANIMATIONS[id].enabled);

/** Config for one animation, or an empty object so callers can destructure safely. */
export const animationConfig = (id) => ANIMATIONS[id] ?? {};
