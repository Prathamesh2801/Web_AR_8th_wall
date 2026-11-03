/**
 * imageTargetPipelineModule.js
 *
 * The 8th Wall camera pipeline module that owns the three.js content and listens for
 * the bottle's image-target events.
 *
 * API NOTES (verified against the 8th Wall open-source repository, not older docs):
 *
 *  - Events: `reality.imageloading|imagescanning|imagefound|imageupdated|imagelost`,
 *    received through the module's `listeners` array as `{event, process}`.
 *
 *  - TYPE STRING: the image-target-cli writes `"type": "CYLINDER"` into the JSON but
 *    the runtime dispatches `"CYLINDRICAL"` (reality/app/xr/js/src/tracking-controller.ts).
 *    Both are accepted so a change on either side cannot silently break detection.
 *
 *  - Curved targets report {height, radiusTop, radiusBottom, arcStartRadians,
 *    arcLengthRadians} for the FULL label, even when only a crop is tracked.
 *
 *  - Several label crops are loaded (config TRACKING.targets). Only the lead target
 *    drives the pose; see leadTarget.js.
 */
import {createBottleScene} from './bottleScene'
import {createLeadTarget} from './leadTarget'
import {trackingStore, TrackingState} from './trackingStore'

/** Accepts either the CLI's "CYLINDER" or the runtime's "CYLINDRICAL". */
const isCylindrical = type => type === 'CYLINDRICAL' || type === 'CYLINDER'

/** Pulls the curved-geometry fields out of an image event detail. */
const readGeometry = detail => ({
  height: detail.height,
  radiusTop: detail.radiusTop,
  radiusBottom: detail.radiusBottom,
  arcStartRadians: detail.arcStartRadians,
  arcLengthRadians: detail.arcLengthRadians,
})

/** @param {string[]} targetNames names of the targets this module should react to */
export const createImageTargetPipelineModule = (targetNames) => {
  const ours = new Set(targetNames)
  const lead = createLeadTarget()
  let bottleScene = null

  // FPS, sampled once per second so React is not re-rendered every frame.
  let frameCount = 0
  let lastFpsSample = performance.now()

  const handleFoundOrUpdated = ({detail}) => {
    if (!ours.has(detail.name)) return

    const wasLost = lead.lead === null
    if (!lead.seen(detail.name)) return   // another crop is leading
    if (wasLost) console.log('[AR] bottle found via', detail.name, detail)

    const cylindrical = isCylindrical(detail.type)
    if (!cylindrical) {
      console.warn(
        `[AR] Target "${detail.name}" reported type "${detail.type}"; expected a ` +
        'CYLINDRICAL target. Regenerate it with `npm run generate-targets`.'
      )
    } else {
      bottleScene?.fitToGeometry(readGeometry(detail))
    }

    // Straight into three.js, unthrottled. React state never gates tracking.
    bottleScene?.applyPose(detail)

    trackingStore.setPose({
      name: detail.name,
      type: detail.type,
      position: detail.position,
      rotation: detail.rotation,
      scale: detail.scale,
      geometry: cylindrical ? readGeometry(detail) : null,
      isNewDetection: wasLost,
    })
  }

  return {
    name: 'bottle-image-target',

    onStart: ({canvas}) => {
      const {scene, camera} = XR8.Threejs.xrScene()
      bottleScene = createBottleScene({
        onSelect: nutrient => trackingStore.setSelectedNutrient(nutrient),
      })
      bottleScene.addToScene(scene, camera, canvas)
      trackingStore.setScene(bottleScene)

      // Required so the engine drives the three.js camera.
      XR8.XrController.updateCameraProjectionMatrix({
        origin: camera.position,
        facing: camera.quaternion,
      })

      trackingStore.setState(TrackingState.SEARCHING)
    },

    // Runs every frame, after the engine has updated the camera pose.
    onUpdate: () => {
      const now = performance.now()
      bottleScene?.update(now)

      frameCount++
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
        process: () => trackingStore.setState(TrackingState.LOADING),
      },
      {
        event: 'reality.imagescanning',
        process: () => trackingStore.setState(TrackingState.SEARCHING),
      },
      {event: 'reality.imagefound', process: handleFoundOrUpdated},
      {event: 'reality.imageupdated', process: handleFoundOrUpdated},
      {
        event: 'reality.imagelost',
        process: ({detail}) => {
          if (!ours.has(detail.name)) return
          if (!lead.lost(detail.name)) return   // another crop still sees the bottle
          console.log('[AR] bottle lost', detail.name)
          bottleScene?.hide()
          trackingStore.setLost()
        },
      },
    ],
  }
}
