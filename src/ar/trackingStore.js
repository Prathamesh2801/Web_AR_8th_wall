/**
 * trackingStore.js
 *
 * The single bridge between the AR layer and React.
 *
 * This file contains NO React and NO three.js. The AR pipeline pushes state in;
 * React subscribes and reads state out. Keeping this boundary thin is what stops
 * React's render cycle from ever interfering with the camera/tracking loop.
 *
 * Implemented as a `useSyncExternalStore`-compatible store: `subscribe` + `getSnapshot`.
 */

/** Tracking lifecycle states surfaced to the UI. */
export const TrackingState = {
  BOOTING: 'BOOTING',      // Engine has not started yet.
  LOADING: 'LOADING',      // Target images are being loaded//feature-extracted.
  SEARCHING: 'SEARCHING',  // Scanning the camera feed, target not yet seen.
  FOUND: 'FOUND',          // Target just detected (transient, becomes TRACKING).
  TRACKING: 'TRACKING',    // Target actively tracked and pose updating.
  LOST: 'LOST',            // Target was found before, but is not visible now.
  ERROR: 'ERROR',          // Engine/camera/asset failure.
}

const initialState = {
  state: TrackingState.BOOTING,
  targetName: null,
  targetType: null,
  position: null,
  rotation: null,
  scale: null,
  geometry: null,     // Cylindrical: {height, radiusTop, radiusBottom, arcStartRadians, arcLengthRadians}
  fps: 0,
  error: null,
  detectionCount: 0,  // How many times the target has been (re)acquired. Useful for TEST 9.
  selectedNutrient: null,  // Set only when a 3D nutrient node is tapped.
}

let snapshot = initialState
const listeners = new Set()

/**
 * Debug-panel refresh rate. Pose data reaches Three.js every frame regardless; this
 * only limits how often React is asked to re-render. ~8Hz stays readable while keeping
 * React work off the camera-frame hot path.
 */
const POSE_EMIT_INTERVAL_MS = 125
let lastPoseEmit = 0

/** Supplied by the AR layer so debug UI can read orbital stats on demand. */
let debugInfoProvider = null

/**
 * Supplied by the AR layer to toggle the occlusion-cylinder wireframe.
 *
 * A command, not state: it reaches straight into three.js and deliberately does NOT
 * emit, so switching the outline never triggers a React render.
 */
let outlineVisibilitySetter = null

/** Supplied by the AR layer to scale orbit speed. A command; emits nothing. */
let orbitSpeedSetter = null

/**
 * Supplied by the AR layer to apply the current selection to the 3D scene.
 *
 * Selection is cleared from several places (tapping a node, closing the card, losing
 * the target). Pushing every change through here keeps three.js and React in agreement;
 * when only the tap path updated three.js, closing the card left the orbit stuck at its
 * slowed "reading" speed forever.
 */
let selectionSetter = null

/**
 * Replace the snapshot and notify subscribers.
 * A new object identity is required for useSyncExternalStore to detect the change.
 */
const emit = (patch) => {
  snapshot = {...snapshot, ...patch}
  listeners.forEach(l => l())
}

export const trackingStore = {
  subscribe: (listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  getSnapshot: () => snapshot,

  // --- Writer API, called only from the AR pipeline module ---
  setState: (state) => emit({state}),
  setError: (error) => emit({state: TrackingState.ERROR, error}),
  setFps: (fps) => emit({fps}),

  /**
   * Called on imagefound / imageupdated.
   *
   * THROTTLED: `imageupdated` fires at camera-frame rate (~30-60Hz). Emitting on every
   * frame would re-render React at that frequency for no benefit — the debug panel is
   * only human-readable at a few Hz. Three.js is updated separately and unthrottled in
   * the pipeline module, so TRACKING accuracy is never affected by this.
   *
   * A newly-acquired target always emits immediately, so FOUND is never delayed.
   */
  setPose: ({name, type, position, rotation, scale, geometry, isNewDetection}) => {
    const now = performance.now()
    if (!isNewDetection && now - lastPoseEmit < POSE_EMIT_INTERVAL_MS) return
    lastPoseEmit = now

    emit({
      state: TrackingState.TRACKING,
      targetName: name,
      targetType: type,
      position,
      rotation,
      scale,
      geometry,
      ...(isNewDetection ? {detectionCount: snapshot.detectionCount + 1} : {}),
    })
  },

  /**
   * Called when a nutrient node is tapped in 3D. Fires on interaction only,
   * never per frame.
   */
  setSelectedNutrient: (nutrient) => {
    // Drive three.js FIRST so the 3D scene can never lag behind the UI, then notify
    // React. Both sides now change together no matter which path cleared the selection.
    selectionSetter?.(nutrient?.id ?? null)
    emit({selectedNutrient: nutrient})
  },

  /** Registered by the AR layer; see `selectionSetter`. */
  setSelectionSetter: (fn) => {
    selectionSetter = fn
  },

  /** Lets the debug panel read orbital stats without the AR layer knowing about React. */
  setDebugInfoProvider: (fn) => {
    debugInfoProvider = fn
  },
  getDebugInfo: () => debugInfoProvider?.() ?? null,

  /** Registered by the AR layer; see `outlineVisibilitySetter`. */
  setOutlineVisibilitySetter: (fn) => {
    outlineVisibilitySetter = fn
  },
  /** Shows/hides the occlusion-cylinder wireframe. No re-render. */
  setOutlineVisible: (v) => outlineVisibilitySetter?.(v),

  /** Registered by the AR layer; see `orbitSpeedSetter`. */
  setOrbitSpeedSetter: (fn) => {
    orbitSpeedSetter = fn
  },
  /** Scales orbit speed (0 = frozen). No re-render. */
  setOrbitSpeed: (v) => orbitSpeedSetter?.(v),

  /**
   * Called on imagelost. Pose is cleared so the debug panel cannot show stale values,
   * and the selection is dropped so no nutrient card outlives the physical product.
   */
  setLost: () => emit({
    state: TrackingState.LOST,
    position: null,
    rotation: null,
    scale: null,
    selectedNutrient: null,
  }),

  reset: () => emit(initialState),
}
