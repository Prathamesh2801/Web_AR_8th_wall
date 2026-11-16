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

import { BRANDS } from "./brands/index.js";

/**
 * WHICH BRAND / PRODUCT THIS BUILD RUNS AS — the one line to change.
 * Each brand is a folder in src/brands/ (bottle, label, copy, content); see
 * src/brands/README.md. A link can also pick one: `?brand=zeal` (any id in BRANDS).
 */
const DEFAULT_BRAND = "zeal";

const urlBrand = globalThis.location
  ? new URLSearchParams(globalThis.location.search).get("brand")
  : null;
export const BRAND = BRANDS[urlBrand] ?? BRANDS[DEFAULT_BRAND];

/** Public URL of one of the active brand's files (public/brands/<id>/<file>). */
export const brandFile = (file) => `/brands/${BRAND.id}/${file}`;

const BOTTLE_MM = BRAND.bottle;

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
  label: {
    ...BRAND.label,
    image: BRAND.label?.image && brandFile(BRAND.label.image),
  }, // flat artwork: {source, px, image (served)}
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

/** Everything the 2D UI says about the product (from the brand file). */
export const EXPERIENCE = {
  ...BRAND.experience,
  heroImage: BRAND.experience.heroImage
    ? brandFile(BRAND.experience.heroImage)
    : "",
  logo: BRAND.experience.logo ? brandFile(BRAND.experience.logo) : "",
  model: BRAND.experience.model && {
    ...BRAND.experience.model,
    label: brandFile(BRAND.experience.model.label),
    capTop:
      BRAND.experience.model.capTop && brandFile(BRAND.experience.model.capTop),
  },
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
  arcade: 0.35, // Arcade's synth pops / beeps / fanfare (sound.js tone)
};

/** Image-target tracking. */
export const TRACKING = {
  /**
   * Targets to load from public/brands/<brand>/targets/<name>.json (the brand file
   * names them). They are overlapping crops
   * of ONE label (see scripts/generate-targets.mjs) so the bottle is detected from
   * any side; all report the same cylinder frame. When several are tracked at once,
   * the first one found drives the pose (src/ar/leadTarget.js). A missing file is
   * skipped with a console warning.
   */
  targets: BRAND.targets,

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
  LOGO_LIFT: "logoLift",
  LABEL_SPIN: "labelSpin",
  PLANTED: "planted",
  NUTRIENT_ORBIT: "nutrientOrbit",
  TECH_ORBIT: "techOrbit",
  PHOTO_BURST: "photoBurst",
  ARCADE: "arcade",
  SETTLE: "settle",
  SPOTLIGHT: "spotlight",
  ENERGY: "energy",
  SCAN: "scan",
  SPARKLE: "sparkle",
};

/**
 * Effect groups of the lens menu, in carousel order. Each animation with a `group` is one
 * style (variant) of that group; the user plays ONE effect at a time. Adding a style =
 * a new ANIMATIONS entry with the same `group` — it appears in the tray automatically.
 */
export const GROUPS = [
  { id: "type", label: "Typography" },
  { id: "glow", label: "Effects" },
  { id: "elements", label: "Elements" },
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

    // Which printed words lift off, with their print box + knobs: per brand.
    words: {},
  },

  /**
   * The brand mark printed on the label lifts off in 3D, glides up over the shoulder and
   * turns on a light-ring above the cap; tap it to send it home. See logoLift.js.
   */
  [AnimationId.LOGO_LIFT]: {
    enabled: true,
    active: false,
    group: "type",
    label: "Logo",
    delay: 0,

    // Per brand: mark (SVG), print {cx, cy, size} mm on the trim label, patch (PNG) + patchMm.
    mark: "",
    print: null,
    patch: "",
    patchMm: 0,

    holdMs: 300, // flat on its print before it pops
    popMs: 800, // thickens into 3D and unbends off the curve
    riseMs: 2400, // glide up over the shoulder to above the cap
    exitSpeed: 1.6, // x faster back down
    depthMm: 3, // thickness of the 3D logo
    topScale: 1.6, // its size above the cap, x the print
    hoverMm: 9, // gap between cap top and the logo's lower edge
    spinSpeed: 0.3, // rev/s on the turntable
    spinDirection: -1, // -1 / 1: which way it turns (seen from above: -1 = clockwise)
    tiltDeg: 12, // leans back toward the viewer
    bobMm: 1.5, // hover up/down
    bobHz: 0.45,
    replayAfterTap: 3000, // tap = it flies home to its print; rises again after this (ms; 0 = stays)
    shine: 0.55, // flash as its face turns to you, 0..1
    glow: 0.35, // faint glow in its colour
    ring: 0.7, // light-ring on the cap
    patchBrightness: 1, // the label patch under it, x the real paper it is matched to (camera)
    printAzimuthDeg: 0, // calibration: rotate onto the print if it sits beside it
    faceColor: "#1C552A",
    sideColor: "#9BE23B",
    glowColor: "#9BE23B",
    ringColor: "#9BE23B",
  },

  /**
   * The whole label comes loose and spins round the bottle, seamless, then lands back
   * on its print. Any brand with a flat label image (`label.image`). See labelSpin.js.
   */
  [AnimationId.LABEL_SPIN]: {
    enabled: true,
    active: false,
    group: "type",
    label: "Spin",
    delay: 0,

    speed: 0.22, // rev/s while cruising
    rounds: 1, // turns, then it lands back on the print; 0 = until the user leaves
    loop: true, // after landing: pause, then spin again
    loopPause: 1500, // ms resting on the real label between runs
    holdMs: 350, // resting on the print before it starts to turn
    spinUpMs: 1400, // to full speed
    brakeMs: 2500, // the landing's length at cruise speed
    fadeMs: 300, // in over the print / out after landing
    lift: 0, // off the surface at full speed, x radius (0 = the label turns in place)
    restLift: 0.006, // just proud of the print so it covers it, x radius
    brightness: 0.05, // x the room light (cameraLight.js)
    printAzimuthDeg: 0, // calibration, like Typography's: rotate the copy onto the print
  },

  /**
   * Feature callouts: a dot on the bottle, a line drawn out to the side, a card whose
   * text types in. Alternate items left/right; switching away plays it backwards.
   * Items (the copy) come from the brand file.
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
    items: {}, // per brand
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
   * far side passes behind the bottle. The rings' text comes from the brand file.
   * Text, colours, radius and band height are read when built (reload to see edits);
   * height, tilt, speed and direction are live.
   */
  [AnimationId.TICKER]: {
    enabled: true,
    active: false,
    group: "type",
    label: "Ticker",
    delay: 0,

    rings: {}, // per brand
    bandHeight: 0.19, // x label height
    entranceDuration: 1100, // ms per ring to unfold (exit takes 60% of it)
    stagger: 300, // ms between rings
    backOpacity: 0.3, // the far half, seen past the bottle's sides

    textColor: "#FFFFFF",
    accentColor: "#FFD45A", // separators + edge rules
    bandColor: "rgba(6, 52, 50, 0.6)", // see-through label teal behind the text
  },

  /**
   * The label's printed service badges lift off (as 3D coins, or the item's GLB `model`) into
   * one orbit ring round the bottle; tap one: it hovers above the cap, the others step aside
   * and a glass panel on the body shows its name + pitch. See techOrbit.js.
   */
  [AnimationId.TECH_ORBIT]: {
    enabled: true,
    active: false,
    group: "elements",
    label: "Tech Orbit",
    delay: 0,

    // Per brand: [{key, label, icon (public/brands/<id>/icons/<icon>.svg), badge: {cx, cy}
    // (mm, trim label), pitch (ONE short line on the panel), model? (GLB), size? (x, by eye)}]
    items: [],

    // Orbit: ONE ring, items evenly spaced, turning as a whole (no drawn line: one through
    // the real table looked fake).
    trackMs: 500, // lead-in before the first item leaves its badge
    emergeMs: 4000, // one item: badge -> its slot (materializing on the way)
    springHz: 2.2, // the items spring after their path: lower = lazier, more overshoot
    springDamping: 0.7, // 1 = no overshoot
    staggerMs: 260, // between items leaving their badges
    exitSpeed: 1.3, // x faster home
    speed: 0.05, // rev/s (auto turn; a swipe can reverse its direction)
    dragTurns: 0.5, // swipe: one screen width turns the ring this much
    flickEaseMs: 900, // a flick's extra speed fades back to the auto turn over ~this
    flickMaxTurns: 1.2, // fastest flick, rev/s
    radius: 1.85, // x bottle radius
    height: 0.1, // x label height above the label centre
    tiltDeg: 12, // ring tilt (front dips, back rises)
    topScale: 1.45, // size in orbit, x the printed badge
    depthMm: 1.6, // coin thickness
    modelScale: 1.25, // a 3D model (item.model) in place of its coin, x the coin's size
    modelSpin: 0.12, // a model's own turn, rev/s
    frontScale: 1.2, // carousel depth: size passing the front ...
    backScale: 0.9, // ... and round the back (the camera's perspective adds its own)
    bobMm: 1.6, // up/down
    bobHz: 0.3,
    rimGlow: 0.45, // lime light on the models' edges (0 = off)
    glowColor: "#9BE23B", // rim glow + hologram
    holoLines: 60, // hologram scan lines over a model's height
    // Tap: it hovers above the cap, the panel shows; the others orbit on, smaller (tap one = swap).
    selectMs: 750,
    hoverMm: 8, // cap top -> its base
    hoverScale: 1.7, // x the printed badge (orbit is topScale)
    othersScale: 0.7, // the rest while one is chosen, x their orbit size
    panelMm: 30, // panel height
    panelArcDeg: 140, // panel width, round the bottle (text keeps to its middle)
    panelY: 0.2, // panel centre, x label height above the label centre (Zeal: logo + ZEAL)
    panelOpacity: 1, // the glass colours (cardTop/cardBottom) carry their own see-through
    cardTop: "rgba(18, 64, 34, 0.92)",
    cardBottom: "rgba(6, 30, 14, 0.94)",
    cardEdge: "rgba(155, 226, 59, 0.85)",
    cardGlow: "rgba(155, 226, 59, 0.6)",
    cardAccent: "#9BE23B",
    brightness: 0.95, // coin faces, x the room light
    printAzimuthDeg: 0, // calibration: rotate onto the prints if they sit beside them
    paperColor: "#F6F8F3", // the badge, as printed
    rimColor: "#8CCB3A",
    discColor: "#1C552A",
    sideColor: "#9BE23B", // the coin's edge
  },

  /**
   * The brand's event photos as polaroids: they shoot out of the cap (click + flash),
   * develop in flight and fan out behind the bottle; swipe slides them, tap = to the
   * front with its caption. See photoBurst.js.
   */
  [AnimationId.PHOTO_BURST]: {
    enabled: true,
    active: false,
    group: "elements",
    label: "Photo Burst",
    delay: 0,

    // Per brand: [{file (public/brands/<id>/...), caption?}]; any shape (never cropped)
    photos: [],
    photoMm: 32, // a print's picture area = this square's (wide / tall shots keep their shape)

    // Entry: one print per staggerMs flies out of the cap and develops.
    leadMs: 400, // before the first print
    staggerMs: 380,
    flyMs: 1100, // cap -> its place in the fan
    developMs: 1600, // blank -> full colour
    launch: 2.5, // upward kick out of the cap, label heights / s
    springHz: 1.8, // lower = lazier, more overshoot
    springDamping: 0.65,
    exitSpeed: 2.2, // x faster back into the cap
    clickVolume: 0.35, // the shutter click, x the "snap" sound's level
    clickGapMs: 200, // closer births share one click
    flash: 0.9, // lime cap flash per print
    glowColor: "#9BE23B",

    // Fan behind the bottle, facing the viewer.
    fanSlots: 7, // photos shown at once (more wrap round as you swipe)
    fanDeg: 150, // the arc's spread
    fanRadius: 1.35, // x label height, from the fan's centre
    fanY: 0, // fan centre, x label height above the label centre
    fanBack: 1.6, // behind the bottle axis, x bottle radius
    fanTilt: 0.55, // cards lean along the arc, x their angle on it
    floatMm: 1.2,
    floatHz: 0.25,
    swayDeg: 2.5,
    dragSlots: 3, // swipe: one screen width slides this many photos
    flickEaseMs: 500,
    flickMax: 12, // slots / s

    // Tap: to the front.
    selectMs: 700,
    focusScale: 1.5, // x the print's size
    focusGap: 2.2, // in front of the bottle axis, x bottle radius
    focusY: 0.3, // x label height above the label centre
    dimOthers: 0.55,
    brightness: 1, // prints, x the room light
    paperColor: "#F7F5EE",
  },

  /**
   * Badge Bash: the label's printed badges fly to a board of sockets beside the bottle
   * (always facing the phone) and pop out of them; tap them in a timed round (combo, gold
   * coin out of the cap), then the bottle levels up and the board over the cap shows the
   * score + best. Tap the board = again. See arcade.js.
   */
  [AnimationId.ARCADE]: {
    enabled: true,
    active: false,
    group: "elements",
    label: "Arcade",
    delay: 0,

    // Per brand: targets [{icon (public/brands/<id>/icons/<icon>.svg), badge: {cx, cy} (mm,
    // trim label)}]; bonus {mark (SVG)} = the gold coin's face, optional.
    targets: [],
    bonus: null,

    // Entry: badges fly from their prints to the board's sockets (then 3 · 2 · 1).
    entryStaggerMs: 110,
    entryFlyMs: 900,
    exitSpeed: 1.6, // x faster home

    // Board: two columns of sockets beside the bottle, facing the viewer.
    columnX: 1.55, // socket centre from the bottle axis, x bottle radius (1.9 sat too far out on device)
    rowTop: 0.85, // top / bottom socket rows, x label height above the label centre
    rowBottom: -0.35,
    forward: 0.3, // toward the viewer, x bottle radius
    seatScale: 1.4, // a seated badge, x the printed badge
    seatDim: 0.6, // waiting badges' brightness (a popped one is full)

    // Round
    countdownMs: 3000, // 3 · 2 · 1
    roundMs: 30000,
    spawnMsStart: 1100, // between pops: start of the round -> end
    spawnMsEnd: 450,
    upMsStart: 1400, // a coin stays up: start -> end
    upMsEnd: 800,
    bonusEveryMs: 8000,
    bonusUpMs: 2200,
    points: 10,
    bonusPoints: 50,
    comboMs: 1200, // hits closer than this raise the multiplier
    comboMax: 5,

    // Coins
    popMs: 160, // out of the socket
    sinkMs: 220, // back in, missed
    flyMs: 450, // hit: to the score board
    regrowMs: 350, // back in its socket after a hit
    popMm: 7, // toward the viewer
    popScale: 1.8, // popped, x the printed badge
    bonusScale: 1.8,
    bonusFront: 1.6, // gold coin hovers this far in front of the cap, x bottle radius
    bonusY: -0.08, // ... and this high above the cap top, x label height
    depthMm: 1.6,
    hitScale: 1.6, // tap target, x the coin (generous: nothing else nearby)
    brightness: 0.95, // coin faces, x the room light
    printAzimuthDeg: 0, // calibration, as techOrbit's

    // Board over the cap + the level-up
    boardMm: 20, // board height (width = 2x)
    boardGapMm: 8, // cap top -> board bottom
    chargeMs: 1400, // level-up: the bottle fills bottom -> top
    color: "#9BE23B",
    goldColor: "#F5C542",
    paperColor: "#F6F8F3", // coin = the badge, as printed
    rimColor: "#8CCB3A",
    discColor: "#1C552A",
    sideColor: "#9BE23B",
    cardTop: "rgba(18, 64, 34, 0.92)",
    cardBottom: "rgba(6, 30, 14, 0.94)",
    cardEdge: "rgba(155, 226, 59, 0.85)",
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

  /**
   * The bottle planted in a patch of earth with the label's botanicals, in 360°: soil
   * swells round its foot, ginseng roots surface and lie on it, grape berries drop
   * and bounce onto it. Real textured models, lit + shadowed. See planted.js.
   */
  [AnimationId.PLANTED]: {
    active: false,
    group: "elements",
    label: "Planted",
    // Off unless the brand opts in: it uses that brand's own models
    // (public/brands/<brand>/models: soil, ginseng-root, grape) and nutrient captions.
    enabled: false,
    delay: 0,

    soilSize: 1.75, // mound width, x label height (bottle is ~1.1 wide)
    soilHeight: 0.25, // mound height, x label height: the collar at the bottle is ~0.17 (label at 0.23)
    soilEdge: 0.9, // where the torn edge runs, share of the mound's radius
    contact: 0.6, // how dark the soil gets where it meets the bottle, 0..1
    berrySize: 0.16, // one grape, x label height
    drop: 1.4, // berries fall from this high, x label height
    roll: 0.07, // and roll this far down-slope after landing, x label height
    light: 1, // strength of the light matched from the camera
    saturation: 0.85, // 1 = the models' own colours; lower sits better in a camera image
    grain: 0.035, // moving noise like the camera's, 0..0.15
    shadow: 0.5, // contact shadows, 0..1
    cardHeight: 0.11, // captions, x label height
    cardColor: "rgba(6, 52, 50, 0.82)",
    cardBorderColor: "rgba(255, 212, 90, 0.55)",
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

  /**
   * The room dims except the bottle; a stage lamp strikes above it, dust drifts in the
   * beam, light pools on the table. Product-agnostic. See spotlight.js.
   */
  [AnimationId.SPOTLIGHT]: {
    enabled: true,
    active: false,
    group: "glow",
    label: "Spotlight",
    delay: 0,

    dim: 0.72, // how dark the room goes, 0..1 (the bottle itself never dims)
    dimColor: "#05070B",
    color: "#FFF0D2", // the lamp's light
    beam: 0.32, // beam brightness
    beamWidth: 1.7, // beam radius at the table, x bottle radius
    beamHeight: 3.2, // lamp height above the table, x label height (above the frame)
    pool: 0.42, // light pool on the table
    dust: 0.85, // dust in the beam, 0..1
    dustSize: 0.03, // one mote, x label height
  },

  /**
   * Electric arcs crawl the bottle's edges as a charge climbs it; every few seconds a
   * surge flares them and sends a shockwave across the table. Product-agnostic. See energy.js.
   */
  [AnimationId.ENERGY]: {
    enabled: true,
    active: false,
    group: "glow",
    label: "Energy",
    delay: 0,

    color: "#2FA8FF", // arcs + shockwaves; the arcs' cores burn white
    intensity: 1, // arcs + rings, 0..2
    boltWidth: 0.085, // arc glow width, x label height
    glow: 0.35, // charge glow on the table
    surgeEvery: 2.6, // seconds between surges
    ringReach: 4, // shockwave reach, x bottle radius
  },

  /**
   * The formula being analysed: a scan line climbs the bottle revealing a hologram grid,
   * the label's nutrients type out beside it, it sweeps back down, then
   * "Formula scanned · N nutrients". Product-agnostic (readouts from nutrientData.js). See scan.js.
   */
  [AnimationId.SCAN]: {
    enabled: true,
    active: false,
    group: "glow",
    label: "Scan",
    delay: 0,

    color: "#38E8FF",
    hologram: 0.55, // grid + rim strength, 0..1
    gridSpacing: 0.07, // between grid rings, x label height
    line: 1, // scan line brightness
    sheet: 0.8, // the laser sheet cutting out at the line
    sweepEvery: 5, // s between idle sweeps
    cardHeight: 0.085, // readouts, x label height (the verdict is 1.25x)
    cardColor: "rgba(4, 30, 40, 0.85)",
    cardBorderColor: "rgba(56, 232, 255, 0.6)",
    // Brand content (optional): typed out as the line climbs, then the verdict above the
    // cap. Without them: the brand's nutrients and "Formula scanned · N nutrients".
    readouts: [],
    verdict: "",
  },

  /**
   * A flash at the cap, then stars in the brand's colours fountain out, swirl down round
   * the bottle and settle into a twinkling orbit. Product-agnostic. See sparkle.js.
   */
  [AnimationId.SPARKLE]: {
    enabled: true,
    active: false,
    group: "glow",
    label: "Sparkle",
    delay: 0,

    color1: "#FFD45A", // brand gold (also the flash)
    color2: "#FFFFFF",
    color3: "#3FD9C4", // brand teal
    starSize: 0.07, // x label height
    spread: 1.9, // outermost orbit, x bottle radius
    spin: 0.35, // idle orbit speed, rad/s
    opacity: 1,
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

/**
 * The brand's overrides, deep-merged onto the defaults above. Then any effect whose
 * content the brand doesn't have is switched off, so a new brand needs no list of
 * what to disable — add the content and the effect appears.
 */
const isObject = (v) => v && typeof v === "object" && !Array.isArray(v);
const merge = (into, from) => {
  for (const [k, v] of Object.entries(from)) {
    if (isObject(v) && isObject(into[k])) merge(into[k], v);
    else into[k] = v;
  }
};
merge(ANIMATIONS, BRAND.animations ?? {});
const hasNutrients = (BRAND.nutrients?.NUTRIENTS?.length ?? 0) > 0;
const hasAny = (o) => Object.keys(o ?? {}).length > 0;
const needs = {
  [AnimationId.TYPOGRAPHY]:
    hasAny(ANIMATIONS[AnimationId.TYPOGRAPHY].words) && !!BRAND.label?.px,
  [AnimationId.CALLOUTS]: hasAny(ANIMATIONS[AnimationId.CALLOUTS].items),
  [AnimationId.TICKER]: hasAny(ANIMATIONS[AnimationId.TICKER].rings),
  [AnimationId.LABEL_SPIN]: !!BRAND.label?.image,
  [AnimationId.TECH_ORBIT]:
    (ANIMATIONS[AnimationId.TECH_ORBIT].items?.length ?? 0) > 0,
  [AnimationId.PHOTO_BURST]:
    (ANIMATIONS[AnimationId.PHOTO_BURST].photos?.length ?? 0) > 0,
  [AnimationId.ARCADE]: (ANIMATIONS[AnimationId.ARCADE].targets?.length ?? 0) > 0,
  [AnimationId.LOGO_LIFT]: !!(
    ANIMATIONS[AnimationId.LOGO_LIFT].mark &&
    ANIMATIONS[AnimationId.LOGO_LIFT].print
  ),
  [AnimationId.NUTRIENT_ORBIT]: hasNutrients,
  [AnimationId.SCAN]:
    hasNutrients || ANIMATIONS[AnimationId.SCAN].readouts.length > 0,
  [AnimationId.PLANTED]: hasNutrients,
};
for (const [id, ok] of Object.entries(needs))
  if (!ok) ANIMATIONS[id].enabled = false;

/** Ids of every enabled animation, in declaration order. */
export const enabledAnimationIds = () =>
  Object.keys(ANIMATIONS).filter((id) => ANIMATIONS[id].enabled);

/** Config for one animation, or an empty object so callers can destructure safely. */
export const animationConfig = (id) => ANIMATIONS[id] ?? {};
