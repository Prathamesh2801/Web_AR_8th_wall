/**
 * config.js
 *
 * Single place to switch AR experiences on and off, and to tune the shared knobs
 * without hunting through the scene code.
 *
 * WHY THIS EXISTS
 * The nutrient orbit is one animation among several planned. Rather than commenting out
 * scene code to try a different one, each experience is registered here with an
 * `enabled` flag. `bottleScene` builds and updates only the enabled ones, so switching
 * is a one-word edit and nothing has to be deleted or stashed.
 *
 * HOW TO USE
 *   - Toggle an experience:  set its `enabled` to true / false.
 *   - Run several at once:   enable more than one; they share the tracked anchor.
 *   - Run none:              the camera still tracks and the debug panel still works,
 *                            which is useful when checking tracking on its own.
 *
 * HOW TO ADD A NEW ANIMATION (the intended path)
 *   1. Write a module exposing the ANIMATION MODULE CONTRACT below.
 *   2. Add an entry to `ANIMATIONS` with `enabled` and any options it needs.
 *   3. Register its factory in the registry at the bottom of this file.
 *   Nothing in bottleScene.js needs to change.
 *
 * ANIMATION MODULE CONTRACT
 * A factory returning an object with:
 *   root                       THREE.Object3D added under the tracked anchor
 *   build(geometry) -> bool    size to the real cylinder; return false if unusable.
 *                              `geometry` is {radiusTop, radiusBottom, height} in
 *                              metres, as reported by the engine.
 *   isBuilt() -> bool          whether build() has already run
 *   update(timeMs, camera)     per frame; MUST NOT allocate (it runs in the AR loop)
 *   setVisible(v)              show/hide
 * Optional, used when present:
 *   getPickables() -> []       meshes eligible for tap picking
 *   setSelected(id)            apply a selection
 *   restartEntrance()          replay the entrance on target reacquisition
 *   setUserSpeed(v)            debug speed multiplier
 *   getDebugInfo() -> object   merged into the debug panel
 *
 * This file is imported by the AR layer only and holds no React or three.js state.
 */

/** Stable ids, so debug output and config keys cannot drift apart. */
export const AnimationId = {
  NUTRIENT_ORBIT: 'nutrientOrbit',
  BRAND_TEXT: 'brandText',
}

export const ANIMATIONS = {
  /**
   * Nutrients orbiting the bottle on three tilted rings, with depth occlusion and
   * tappable nodes. See nutrientSystem.js for the solved ring geometry.
   */
  [AnimationId.NUTRIENT_ORBIT]: {
    enabled: false,
    label: 'Nutrient orbit',
  },

  /**
   * Brand copy floating to the left, right and above the bottle, with a staggered
   * fade-in, slow drift, and yaw-billboarding so the panels swing around the product
   * as you walk about it. All copy is transcribed verbatim from the pack artwork —
   * see brandTextData.js.
   */
  [AnimationId.BRAND_TEXT]: {
    enabled: true,
    label: 'Brand text',
  },
}

/**
 * The invisible depth cylinder that hides content passing behind the bottle.
 *
 * Kept OUTSIDE `ANIMATIONS` because it is not an animation: it is the shared depth
 * model of the physical product, and any future animation that needs to pass behind
 * the bottle depends on it. Disabling it makes everything draw on top of the camera
 * feed, which is occasionally useful when diagnosing whether a node is hidden or
 * simply absent.
 */
export const OCCLUSION = {
  enabled: true,
  /** Wireframe visible on load. The debug controls toggle it at runtime. */
  showOutline: false,
}

/** Debug UI defaults. The DEBUG button and controls still override these at runtime. */
export const DEBUG = {
  panelOpenOnLoad: false,
  /** Starting orbit-speed multiplier; the controls panel changes it live. */
  orbitSpeed: 1,
}

/** True when the named animation is switched on. */
export const isAnimationEnabled = id => Boolean(ANIMATIONS[id]?.enabled)

/** Config for one animation, or an empty object so callers can destructure safely. */
export const animationConfig = id => ANIMATIONS[id] ?? {}

/** Ids of every enabled animation, in declaration order. */
export const enabledAnimationIds = () =>
  Object.keys(ANIMATIONS).filter(id => ANIMATIONS[id].enabled)
