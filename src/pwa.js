/**
 * Home-screen app (PWA): links the active brand's manifest + icons, and works out how this
 * device can install it. Files: `npm run generate-pwa -- <brand>` (public/brands/<id>/app/).
 *
 *   Android (Chrome, Samsung, Edge)  the browser fires `beforeinstallprompt`; we keep it and
 *                                    the start screen offers "Install app" (one tap, the
 *                                    system dialog). Installed = no browser bars at all.
 *   iPhone / iPad                    no install API exists: the start screen explains
 *                                    Share -> Add to Home Screen. That is also the ONLY way
 *                                    to full screen on iOS (Safari has no Fullscreen API).
 *   Desktop                          nothing offered: the experience needs a phone's rear
 *                                    camera (desktop gets the engine's QR landing page).
 *   Already installed                nothing offered (display-mode standalone/fullscreen,
 *                                    or iOS navigator.standalone).
 *
 * Links are added here, not in index.html, because the brand is picked at runtime
 * (?brand=), and each brand is its own app (its own manifest id / start_url / icon).
 * No service worker: neither platform needs one to install, and a cache would serve stale
 * files during tunnel testing. Add one only for an offline booth mode.
 */
import {BRAND, EXPERIENCE} from './config'

const ua = navigator.userAgent || ''
// iPadOS 13+ reports itself as a Mac; touch points give it away.
export const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)

export const isInstalled = () =>
  matchMedia('(display-mode: fullscreen)').matches ||
  matchMedia('(display-mode: standalone)').matches ||
  navigator.standalone === true

const link = (rel, href, extra = {}) => {
  const el = document.createElement('link')
  Object.assign(el, {rel, href}, extra)
  document.head.appendChild(el)
}
const meta = (name, content) => {
  const el = document.createElement('meta')
  Object.assign(el, {name, content})
  document.head.appendChild(el)
}

const app = `/brands/${BRAND.id}/app`
if (BRAND.app?.icon) {
  link('manifest', `${app}/manifest.webmanifest`)
  link('apple-touch-icon', `${app}/apple-touch-icon.png`)
  link('icon', `${app}/icon-192.png`, {sizes: '192x192', type: 'image/png'})
  meta('apple-mobile-web-app-title', BRAND.app.shortName ?? EXPERIENCE.brand)
}

// --- Install offer ---------------------------------------------------------------------
let deferred = null // Android's saved install prompt
const listeners = new Set()
const emit = () => listeners.forEach(fn => fn())

// Fires early (often before React mounts): keep it, show our own button instead.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferred = e
  emit()
})
window.addEventListener('appinstalled', () => { deferred = null; emit() })

/** 'android' (one-tap install) | 'ios' (show the Add to Home Screen steps) | null. */
export const installMode = () => {
  if (!BRAND.app?.icon || isInstalled()) return null
  if (deferred) return 'android'
  if (isIOS) return 'ios'
  return null
}

/** Subscribe to installMode() changes (the Android prompt arrives late). */
export const onInstallChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn) }

/** Android: the system install dialog. */
export const install = async () => {
  if (!deferred) return
  const e = deferred
  deferred = null
  await e.prompt()
  emit()
}
