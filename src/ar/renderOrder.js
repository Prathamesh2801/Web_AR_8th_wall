/**
 * renderOrder.js
 *
 * One place defining the draw order of every transparent object in the AR scene.
 *
 * WHY THIS EXISTS
 * Transparent materials cannot depth-sort against each other: they are drawn with
 * `depthWrite: false` (so they do not punch holes in one another), which means the
 * LAST one drawn wins wherever two overlap. three.js decides that order by sorting on
 * distance to the camera — and orbiting nodes change their distance every frame.
 *
 * With every object left at the default `renderOrder = 0`, that produced ~90 transparent
 * surfaces whose relative order was recomputed each frame. Any two that overlapped in
 * screen space swapped which one was on top, which reads as flickering — most visibly
 * as label sprites' quads popping over the glow.
 *
 * Assigning explicit render orders makes the sequence FIXED and independent of camera
 * distance, so the same surface is on top every frame regardless of where the nodes are
 * in their orbit.
 *
 * The order runs back-to-front: low numbers draw first and are overwritten by higher
 * ones. Occlusion must come first of all so its depth is present before anything tests
 * against it; labels come last so text is never obscured by the glow it sits in front of.
 */
export const RenderOrder = {
  /** Depth-only proxy. Must precede everything so its depth is available. */
  OCCLUDER: -1,

  /** A patch hiding a print whose 3D copy is off the label (labelPatch.js): on the surface. */
  LABEL_PATCH: 3,
  /** Spin: the label copy, on the bottle's surface: every other layer draws over it. */
  LABEL_SPIN: 4,

  /** Planted: soft contact shadows on the table/soil, under everything else. */
  PLANTED_SHADOW: 5,

  /** Spotlight: the room-dimming layer, then light on top of it: pool, beam, dust. */
  SPOT_DIM: 6,
  SPOT_POOL: 7,
  SPOT_BEAM: 8,
  SPOT_DUST: 9,

  /** Energy: charge glow and shockwaves on the table. */
  ENERGY_GLOW: 10,
  ENERGY_RING: 13,
  /** Scan: the laser sheet cutting out from the line. */
  SCAN_SHEET: 14,

  /** Glow: the soft halo that everything else sits in front of. */
  SETTLE_AURA: 11,

  /** Logo: light-ring on the cap top, under the logo's glow. */
  LOGO_RING: 16,

  /** Product silhouette outline (depthTest off; drawn over the glow, under nodes). */
  PRODUCT_OUTLINE: 15,

  /** Orbit paths — the thin rings the nodes travel along. */
  ORBIT_PATH: 20,
  /** Tethers connecting nodes to the bottle. */
  ORBIT_TETHER: 21,
  /** Ticker rings: far halves (+ ring index), seen past the bottle's sides. */
  TICKER_BACK: 12,
  /** Callouts: leader lines (+1: their dots). */
  CALLOUT_LINE: 22,

  /** Glow: embers. */
  SETTLE_EMBERS: 31,

  /** Node halos, then their solid cores. */
  NODE_HALO: 40,
  NODE_CORE: 41,

  /** Ticker rings: front halves (+ ring index). */
  TICKER_FRONT: 43,
  /** Typography: additive gold glow behind the (opaque) 3D letters. */
  TYPE_GLOW: 45,
  /** Energy arcs: over everything on the bottle except text. */
  ENERGY_BOLT: 46,
  /** Scan hologram shell; Sparkle stars + the cap flash. */
  SCAN_HOLO: 47,
  SPARKLE: 48,
  SPARKLE_FLASH: 49,

  /** Text last: a label must stay readable over anything it overlaps. */
  LABEL: 50,
  /** Photo Burst: soft shadows behind the (opaque) prints; the lime cap flash. */
  PHOTO_SHADOW: 23,
  PHOTO_FLASH: 44,

  /** Arcade: the level-up charge in the bottle, socket rings, hit sparks, the score board. */
  ARCADE_CHARGE: 24,
  ARCADE_RING: 39,
  ARCADE_SPARK: 42,
  ARCADE_BOARD: 52,

  /** Callout cards (typed feature text). */
  CALLOUT_CARD: 51,
}
