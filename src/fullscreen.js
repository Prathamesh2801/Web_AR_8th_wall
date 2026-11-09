/**
 * Double-tap the camera view to toggle full screen (hides Android Chrome's address and
 * navigation bars). iPhone Safari has no Fullscreen API for pages, so there it does nothing.
 *
 * Own double-tap timing on pointerup, not `dblclick`: mobile browsers don't reliably fire
 * dblclick, and pointerup still counts as the user gesture requestFullscreen needs.
 * Listens on the document, not the canvas: React's #root and XRExtras' layers sit above
 * the canvas, so a canvas-only listener could miss taps. Works anywhere, start screen
 * included, except on controls and inside [data-no-fullscreen] (the lens menu), so quick
 * taps on the shutter or the carousel never toggle it.
 * A refusal (e.g. the in-app browser a QR scanner opens) shows a short note instead of
 * failing silently.
 */
const DOUBLE_TAP_MS = 350
const CONTROLS = 'button, a, input, select, textarea, [role="button"], [data-no-fullscreen]'

const el = document.documentElement
const request = el.requestFullscreen || el.webkitRequestFullscreen
const exit = document.exitFullscreen || document.webkitExitFullscreen
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

const toggle = () => {
  if (current()) return exit.call(document)
  if (!request) return note('Full screen isn’t supported in this browser')
  Promise.resolve(request.call(el, {navigationUI: 'hide'}))
    .catch(() => note('Full screen blocked here. Open the page in Chrome'))
}

// iPhone Safari: no API at all, so don't even listen.
if (request) {
  let last = 0
  document.addEventListener('pointerup', (e) => {
    if (!e.isPrimary || e.target.closest?.(CONTROLS)) return
    if (e.timeStamp - last > DOUBLE_TAP_MS) { last = e.timeStamp; return }
    last = 0 // a third tap starts a new pair
    toggle()
  }, {capture: true, passive: true})
}
