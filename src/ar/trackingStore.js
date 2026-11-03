/**
 * trackingStore.js
 *
 * The single bridge between the AR layer and React. No React, no three.js.
 *
 * - STATE flows AR -> React through a `useSyncExternalStore`-compatible store
 *   (`subscribe` + `getSnapshot`), throttled so React never renders at frame rate.
 * - COMMANDS flow React -> three.js through `getScene()`, the bottle scene registered
 *   by the pipeline module. Commands never emit, so they cannot cause a render loop.
 */

/** Tracking lifecycle states surfaced to the UI. */
export const TrackingState = {
  BOOTING: 'BOOTING',      // Engine has not started yet.
  LOADING: 'LOADING',      // Target images are being loaded / feature-extracted.
  SEARCHING: 'SEARCHING',  // Scanning the camera feed, target not yet seen.
  TRACKING: 'TRACKING',    // Target actively tracked and pose updating.
  LOST: 'LOST',            // Target was found before, but is not visible now.
  ERROR: 'ERROR',          // Engine/camera/asset failure.
}

const initialState = {
  state: TrackingState.BOOTING,
  targetName: null,   // which label crop currently drives the pose
  targetType: null,
  position: null,
  rotation: null,
  scale: null,
  geometry: null,     // Cylindrical: {height, radiusTop, radiusBottom, arcStartRadians, arcLengthRadians}
  fps: 0,
  error: null,
  detectionCount: 0,  // How many times the bottle has been (re)acquired.
  selectedNutrient: null,  // Set only when a 3D nutrient node is tapped.
}

let snapshot = initialState
const listeners = new Set()

/** Debug-panel refresh rate (~8Hz). three.js gets every pose regardless. */
const POSE_EMIT_INTERVAL_MS = 125
let lastPoseEmit = 0

/** The bottle scene (src/ar/bottleScene.js), registered once the engine starts. */
let scene = null

/** New object identity on every change, as useSyncExternalStore requires. */
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

  /** React -> three.js commands. Null until the engine has started. */
  setScene: (s) => {
    scene = s
  },
  getScene: () => scene,

  // --- Writer API, called from the AR pipeline module ---
  setState: (state) => emit({state}),
  setError: (error) => emit({state: TrackingState.ERROR, error}),
  setFps: (fps) => emit({fps}),

  /**
   * Called on imagefound / imageupdated. Throttled: `imageupdated` fires at camera
   * rate and the debug panel is only readable at a few Hz. A new detection always
   * emits immediately so the UI never lags the bottle appearing.
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
   * The single path for changing the selection (tap, close button, target loss), so
   * three.js and React can never disagree. three.js first, so 3D never lags the UI.
   */
  setSelectedNutrient: (nutrient) => {
    scene?.setSelected(nutrient?.id ?? null)
    emit({selectedNutrient: nutrient})
  },

  /** Called when no label crop is tracked any more. Clears pose and selection. */
  setLost: () => {
    scene?.setSelected(null)
    emit({
      state: TrackingState.LOST,
      position: null,
      rotation: null,
      scale: null,
      selectedNutrient: null,
    })
  },
}
