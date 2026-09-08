/**
 * startAR.js
 *
 * Boots the 8th Wall engine. This is the only file that talks to the global XR8 object
 * for setup; everything else is plain three.js or React.
 *
 * Deliberately framework-agnostic: it can be called from anywhere and knows nothing
 * about React's lifecycle.
 */
import * as THREE from 'three'

import {createImageTargetPipelineModule} from './imageTargetPipelineModule'
import {trackingStore, TrackingState} from './trackingStore'

/**
 * The engine's ThreeJS pipeline module reads THREE off the window and throws
 * "window.THREE does not exist but is required by the ThreeJS pipeline module"
 * if it is missing. It must be assigned BEFORE XR8.Threejs.pipelineModule() is
 * called. Sharing our instance also guarantees the engine and this app use the
 * same THREE (two copies would produce subtly broken scenes).
 */
window.THREE = THREE

/** Must match the `name` the image-target-cli was given. */
export const TARGET_NAME = 'supradyn-bottle'

/**
 * Public URL of the generated cylindrical target metadata.
 *
 * Fetched at runtime rather than imported: Vite forbids importing from `public/`
 * ("Assets in public directory cannot be imported from JavaScript"). The files must
 * stay in `public/image-targets/` because the engine resolves the `imagePath` field
 * inside this JSON as a site-root URL at runtime, so the assets must be served
 * verbatim — unhashed and unbundled.
 *
 * This is the 60-TABLET SKU target (barcode 8904003452786), generated from
 * raw_files/60_curvas.ai. The archived 30-tablet assets in
 * raw_files/_old_30tablet_target/ must never be referenced here.
 */
const TARGET_JSON_URL = '/image-targets/supradyn-bottle.json'

let started = false

/**
 * Resolves once the engine is genuinely usable.
 *
 * `window.XR8` alone is NOT sufficient. In the engine binary the object is published
 * with `XrController: null` and the real controller is attached later, while loading
 * the "slam" chunk. The engine also dispatches `xrloaded` from a `setTimeout(..., 1)`
 * AFTER assigning `window.XR8`, so there is a real window in which `XR8` exists but
 * `XR8.XrController` is still null — which is exactly what a plain `if (window.XR8)`
 * check walks into.
 *
 * So we wait for the module we actually call, not merely for the namespace.
 */
const isEngineReady = () => Boolean(window.XR8?.XrController && window.XR8?.Threejs)

const waitForXR8 = ({timeoutMs = 15000} = {}) => new Promise((resolve, reject) => {
  if (isEngineReady()) {
    resolve()
    return
  }

  let settled = false
  const finish = (fn, arg) => {
    if (settled) return
    settled = true
    clearInterval(poll)
    clearTimeout(timer)
    window.removeEventListener('xrloaded', onLoaded)
    fn(arg)
  }

  const check = () => {
    if (isEngineReady()) finish(resolve)
  }

  const onLoaded = () => check()
  window.addEventListener('xrloaded', onLoaded)

  // The chunk can finish attaching slightly after `xrloaded`, so poll as well rather
  // than relying on event ordering alone.
  const poll = setInterval(check, 50)

  const timer = setTimeout(() => {
    finish(
      reject,
      new Error(
        window.XR8
          ? 'The 8th Wall engine loaded but XR8.XrController was never attached. ' +
            'Check that the engine <script> tag has data-preload-chunks="slam".'
          : 'The 8th Wall engine script did not load. Check your network connection.'
      )
    )
  }, timeoutMs)
})

/** Verifies the browser can actually run this before we try. */
export const checkSupport = () => {
  if (!window.isSecureContext) {
    return {ok: false, reason: 'This experience must be served over HTTPS to access the camera.'}
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return {ok: false, reason: 'This browser does not expose a camera API (getUserMedia).'}
  }

  // iOS in-app browsers (Instagram, Facebook, LinkedIn, TikTok...) expose getUserMedia
  // but the camera silently fails inside their WebView. Detecting it here means the
  // user gets an instruction instead of a black screen after tapping Start.
  const ua = navigator.userAgent || ''
  const isIOS = /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)  // iPadOS 13+
  const isInApp = /FBAN|FBAV|Instagram|LinkedInApp|Line\/|TikTok|Snapchat|Twitter/i.test(ua)
  if (isIOS && isInApp) {
    return {
      ok: false,
      reason: 'On iPhone and iPad the camera only works in Safari. ' +
        'Tap the ••• menu and choose "Open in Safari" to start the experience.',
    }
  }

  return {ok: true}
}

export const startAR = async (canvas) => {
  if (started) return
  started = true

  try {
    const support = checkSupport()
    if (!support.ok) {
      trackingStore.setError(support.reason)
      return
    }

    // Load the generated target metadata. Fail loudly if it is missing or malformed,
    // rather than starting the camera and silently never detecting anything.
    let bottleTargetData
    try {
      const res = await fetch(TARGET_JSON_URL)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      bottleTargetData = await res.json()
    } catch (err) {
      trackingStore.setError(
        `Could not load image target metadata from ${TARGET_JSON_URL} (${err.message}). ` +
        'Run: npm run generate-target'
      )
      return
    }

    if (!bottleTargetData?.imagePath || !bottleTargetData?.name) {
      trackingStore.setError(
        'Image target metadata is malformed. Run: npm run generate-target'
      )
      return
    }

    console.log('[AR] loaded target', {
      name: bottleTargetData.name,
      type: bottleTargetData.type,
      arcAngle: bottleTargetData.properties?.arcAngle,
    })

    await waitForXR8()

    // Image targets must be configured before/at run time.
    // `imageTargetData` is the CURRENT field name used by the open-source engine and the
    // image-target-cli README. (Some older hosted-platform docs refer to `imageTargets`;
    // the repository is authoritative here.)
    //
    // `disableWorldTracking: true` switches SLAM world tracking OFF at runtime. Note this
    // is separate from loading the "slam" chunk in index.html: that chunk must load because
    // it is what supplies XR8.XrController (which owns image targets), but the world
    // tracking it enables is then disabled here. This POC proves the cylindrical target on
    // its own. Per the API docs this MUST be set before XR8.run().
    XR8.XrController.configure({
      disableWorldTracking: true,
      imageTargetData: [bottleTargetData],
    })

    // XRExtras / LandingPage come from separate CDN scripts. They are helpers, not
    // requirements, so a blocked CDN degrades the experience instead of breaking it.
    const extras = window.XRExtras
    const landingPage = window.LandingPage

    XR8.addCameraPipelineModules([
      XR8.GlTextureRenderer.pipelineModule(),  // Draws the camera feed.
      XR8.Threejs.pipelineModule(),            // Creates the three.js scene.
      XR8.XrController.pipelineModule(),       // Drives tracking + image targets.
      ...(landingPage ? [landingPage.pipelineModule()] : []),  // Unsupported-browser handling.
      ...(extras
        ? [
          extras.FullWindowCanvas.pipelineModule(),  // Sizes the canvas to the window.
          extras.Loading.pipelineModule(),           // Camera-permission / loading screen.
          extras.RuntimeError.pipelineModule(),      // Shows runtime errors instead of a blank page.
        ]
        : []),
      createImageTargetPipelineModule(TARGET_NAME),
    ])

    if (!extras) {
      console.warn('[AR] XRExtras unavailable - loading screen and error UI are disabled')
    }

    XR8.run({canvas})
  } catch (err) {
    console.error('[AR] failed to start', err)
    // Surface the real cause; camera permission denial lands here as NotAllowedError.
    const message = err?.name === 'NotAllowedError'
      ? 'Camera permission was denied. Allow camera access and reload the page.'
      : (err?.message ?? 'The AR engine failed to initialise.')
    trackingStore.setError(message)
  }
}

export {TrackingState}
