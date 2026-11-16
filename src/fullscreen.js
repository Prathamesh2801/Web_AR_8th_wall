/**
 * Double-tap the camera view to ENTER full screen (hides Android Chrome's address and
 * navigation bars). Never exits: quick taps while playing Arcade threw players out of full
 * screen; leaving is the system's job (Android back / swipe gesture). iPhone Safari has no
 * Fullscreen API for pages, so there it does nothing (the home-screen app is the way: pwa.js).
 *
 * Own double-tap timing on pointerup, not `dblclick`: mobile browsers don't reliably fire
 * dblclick, and pointerup still counts as the user gesture requestFullscreen needs.
 * Listens on the document, not the canvas: React's #root and XRExtras' layers sit above
 * the canvas, so a canvas-only listener could miss taps. Works anywhere, start screen
 * included, except on controls and inside [data-no-fullscreen] (the lens menu), so quick
 * taps on the shutter or the carousel never trigger it. A press that MOVED (spinning the
 * start screen's 3D bottle, scrolling) is not a tap, so drags never trigger it either.
 * A refusal (e.g. the in-app browser a QR scanner opens) shows a short note instead of
 * failing silently.
 */
import {isInstalled} from './pwa'

const DOUBLE_TAP_MS = 350
const TAP_SLOP_PX = 12 // finger travel still counted as a tap
const CONTROLS = 'button, a, input, select, textarea, [role="button"], [data-no-fullscreen]'

const el = document.documentElement
const request = el.requestFullscreen || el.webkitRequestFullscreen
const current = () => document.fullscreenElement || document.webkitFullscreenElement

const note = (text) => {
  const n = document.createElement('div')
  n.textContent = text
  n.style.cssText = 'position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:9999;'
    + 'padding:8px 14px;border-radius:999px;background:rgba(0,0,0,.75);color:#fff;'
    + 'font:13px system-ui,sans-serif;pointer-events:none;max-width:90vw;text-align:center'
  document.body.appendChild(n)
  setTimeout(() => n.remove(), 2500)
}

const enter = () => {
  if (current()) return
  if (!request) return note('Full screen isn’t supported in this browser')
  Promise.resolve(request.call(el, {navigationUI: 'hide'}))
    .catch(() => note('Full screen blocked here. Open the page in Chrome'))
}

// iPhone Safari: no API at all, so don't even listen. Installed app: already full screen.
if (request && !isInstalled()) {
  let last = 0
  let downX = 0
  let downY = 0
  document.addEventListener('pointerdown', (e) => { downX = e.clientX; downY = e.clientY },
    {capture: true, passive: true})
  document.addEventListener('pointerup', (e) => {
    if (!e.isPrimary || e.target.closest?.(CONTROLS)) return
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > TAP_SLOP_PX) { last = 0; return }
    if (e.timeStamp - last > DOUBLE_TAP_MS) { last = e.timeStamp; return }
    last = 0 // a third tap starts a new pair
    enter()
  }, {capture: true, passive: true})
}
