/**
 * UI sounds: public/sounds/<name>.mp3 (lock, select, snap). A missing file is skipped.
 *
 * Web Audio, not <audio>: browsers only allow sound after a user gesture, and iOS also
 * blocks <audio>.play() that is not itself inside one — so the lock sound (fired by
 * tracking, not a tap) would never play. One AudioContext resumed on the Start tap stays
 * unlocked for the session. iOS Silent mode is overridden (see audioSession below).
 * Levels: SOUND in config.js (read on every play, so dashboard edits apply at once).
 */
import {fetchAsset} from './assets'
import {SOUND} from './config'

export const SOUND_NAMES = ['lock', 'select', 'snap']
const NAMES = SOUND_NAMES
let ctx = null
const buffers = {}

/** Call from the Start tap (a user gesture). */
export const unlockSound = () => {
  if (ctx) return
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return
  // iOS 16.4+: Web Audio defaults to the "ambient" session, which Silent mode mutes —
  // and on iPhone 15+ Silent mode is a hidden Action-button/Control-Centre state, so most
  // testers never knew the page was muted. "playback" plays like a video does.
  // Set before the context exists. ponytail: pauses the user's music while AR is open.
  if (navigator.audioSession) navigator.audioSession.type = 'playback'
  ctx = new AC()
  ctx.resume()
  // Older iOS only unlocks after a sound actually starts inside the gesture.
  const s = ctx.createBufferSource()
  s.buffer = ctx.createBuffer(1, 1, 22050)
  s.connect(ctx.destination)
  s.start()
  // iOS moves the context to "interrupted" when the camera starts (and on calls, Siri,
  // app switches); only a gesture brings it back. touchend/click count as gestures,
  // touchstart/pointerdown do not.
  const wake = () => ctx.state !== 'running' && ctx.resume()
  for (const e of ['touchend', 'click']) document.addEventListener(e, wake, {capture: true, passive: true})
  for (const name of NAMES) {
    fetchAsset(`/sounds/${name}.mp3`)
      .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(b => ctx.decodeAudioData(b))
      .then(buf => { buffers[name] = buf })
      .catch(err => console.warn(`[sound] ${name}.mp3 unavailable (${err.message})`))
  }
}

export const playSound = (name) => {
  const buf = buffers[name]
  if (!ctx || !buf) return
  if (ctx.state !== 'running') ctx.resume() // works when called from a tap (shutter)
  const level = SOUND.volume * (SOUND[name] ?? 1)
  if (!(level > 0)) return
  const src = ctx.createBufferSource()
  const gain = ctx.createGain()
  gain.gain.value = level
  src.buffer = buf
  src.connect(gain).connect(ctx.destination)
  src.start()
}

/** Short tap feel where supported (Android; iOS Safari has no vibrate). */
export const haptic = (ms = 12) => navigator.vibrate?.(ms)
