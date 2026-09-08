/**
 * imageTargetPipelineModule.js
 *
 * The 8th Wall camera pipeline module that owns the three.js content and listens for
 * cylindrical image-target events.
 *
 * API NOTES (verified against the 8th Wall open-source repository, not older docs):
 *
 *  - Event names are `reality.imageloading`, `reality.imagescanning`, `reality.imagefound`,
 *    `reality.imageupdated`, `reality.imagelost`. In a pipeline module these are received
 *    via the `listeners` array, each entry `{event, process}`.
 *
 *  - IMPORTANT TYPE-STRING CONFLICT: the image-target-cli writes `"type": "CYLINDER"` into
 *    the target JSON, but the RUNTIME dispatches `type: "CYLINDRICAL"` in event details
 *    (see reality/app/xr/js/src/tracking-controller.ts). Both spellings are accepted below
 *    so that a future change to either side cannot silently break detection.
 *
 *  - For CYLINDRICAL targets the detail carries curved geometry:
 *      {height, radiusTop, radiusBottom, arcStartRadians, arcLengthRadians}
 *    rather than the planar {scaledWidth, scaledHeight}.
 */
import {createBottleScene} from './bottleScene'
import {trackingStore, TrackingState} from './trackingStore'

/** Accepts either the CLI's "CYLINDER" or the runtime's "CYLINDRICAL". */
const isCylindrical = type => type === 'CYLINDRICAL' || type === 'CYLINDER'

export const createImageTargetPipelineModule = (expectedTargetName) => {
  let bottleScene = null
  let isCurrentlyFound = false

  // --- FPS tracking, sampled once per second to avoid re-rendering React every frame ---
  let frameCount = 0
  let lastFpsSample = performance.now()

  /** Pulls the curved-geometry fields out of an image event detail. */
  const readGeometry = detail => ({
    height: detail.height,
    radiusTop: detail.radiusTop,
    radiusBottom: detail.radiusBottom,
    arcStartRadians: detail.arcStartRadians,
    arcLengthRadians: detail.arcLengthRadians,
  })

  const handleFoundOrUpdated = (isFound) => ({detail}) => {
    // Guard: ignore any target that isn't the bottle (future-proofing for multi-target).
    if (expectedTargetName && detail.name !== expectedTargetName) return

    if (!isCylindrical(detail.type)) {
      // Loud, not silent: a planar target here means the JSON was generated with the
      // wrong geometry and cylindrical tracking will never work correctly.
      console.warn(
        `[AR] Target "${detail.name}" reported type "${detail.type}" but this POC ` +
        'requires a CYLINDRICAL target. Regenerate it with the CLI using "cylinder".'
      )
    }

    const isNewDetection = isFound && !isCurrentlyFound
    if (isNewDetection) {
      console.log('[AR] reality.imagefound', detail)
      isCurrentlyFound = true
    }

    // Size the content to the real bottle the first time geometry arrives.
    if (isCylindrical(detail.type)) {
      bottleScene?.fitToGeometry(readGeometry(detail))
    }

    // Apply the pose to three.js directly inside the AR loop. Deliberately NOT routed
    // through React state — UI re-renders must never gate tracking updates.
    // This runs unthrottled at full engine frequency; only the React store is throttled.
    bottleScene?.applyPose({
      position: detail.position,
      rotation: detail.rotation,
      scale: detail.scale,
    })

    trackingStore.setPose({
      name: detail.name,
      type: detail.type,
      position: detail.position,
      rotation: detail.rotation,
      scale: detail.scale,
      geometry: isCylindrical(detail.type) ? readGeometry(detail) : null,
      isNewDetection,
    })
  }

  return {
    // Pipeline modules require a unique name.
    name: 'bottle-image-target',

    onStart: ({canvas}) => {
      const {scene, camera} = XR8.Threejs.xrScene()

      // Tapping a 3D node is the one place the AR layer talks outward: it pushes the
      // selected nutrient into the store, which React reads. This fires on tap only,
      // never per frame.
      bottleScene = createBottleScene({
        onSelect: nutrient => trackingStore.setSelectedNutrient(nutrient),
      })
      bottleScene.addToScene(scene, camera, canvas)
      trackingStore.setDebugInfoProvider(() => bottleScene?.getDebugInfo() ?? null)
      trackingStore.setOutlineVisibilitySetter(v => bottleScene?.setOutlineVisible(v))
      trackingStore.setOrbitSpeedSetter(v => bottleScene?.setOrbitSpeed(v))
      trackingStore.setSelectionSetter(id => bottleScene?.setSelected(id))

      // Required so the engine drives the three.js camera.
      XR8.XrController.updateCameraProjectionMatrix({
        origin: camera.position,
        facing: camera.quaternion,
      })

      trackingStore.setState(TrackingState.SEARCHING)
    },

    // Runs every frame, after the engine has updated the camera pose.
    onUpdate: () => {
      bottleScene?.update(performance.now())

      frameCount++
      const now = performance.now()
      if (now - lastFpsSample >= 1000) {
        trackingStore.setFps(Math.round((frameCount * 1000) / (now - lastFpsSample)))
        frameCount = 0
        lastFpsSample = now
      }
    },

    onException: (error) => {
      console.error('[AR] engine exception', error)
      trackingStore.setError(error?.message ?? String(error))
    },

    listeners: [
      {
        event: 'reality.imageloading',
        process: ({detail}) => {
          console.log('[AR] reality.imageloading', detail)
          trackingStore.setState(TrackingState.LOADING)
        },
      },
      {
        event: 'reality.imagescanning',
        process: ({detail}) => {
          console.log('[AR] reality.imagescanning', detail)
          trackingStore.setState(TrackingState.SEARCHING)
        },
      },
      {event: 'reality.imagefound', process: handleFoundOrUpdated(true)},
      {event: 'reality.imageupdated', process: handleFoundOrUpdated(false)},
      {
        event: 'reality.imagelost',
        process: ({detail}) => {
          if (expectedTargetName && detail.name !== expectedTargetName) return
          console.log('[AR] reality.imagelost', detail)
          isCurrentlyFound = false
          bottleScene?.hide()
          trackingStore.setLost()
        },
      },
    ],
  }
}
