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

  /** Glow: the soft halo that everything else sits in front of. */
  SETTLE_AURA: 11,

  /** Product silhouette outline (depthTest off; drawn over the glow, under nodes). */
  PRODUCT_OUTLINE: 15,

  /** Orbit paths — the thin rings the nodes travel along. */
  ORBIT_PATH: 20,
  /** Tethers connecting nodes to the bottle. */
  ORBIT_TETHER: 21,

  /** Glow: embers. */
  SETTLE_EMBERS: 31,

  /** Node halos, then their solid cores. */
  NODE_HALO: 40,
  NODE_CORE: 41,

  /** Typography: additive gold glow behind the (opaque) 3D letters. */
  TYPE_GLOW: 45,

  /** Text last: a label must stay readable over anything it overlaps. */
  LABEL: 50,
}
