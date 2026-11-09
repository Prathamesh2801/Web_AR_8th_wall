/**
 * UI sounds: public/sounds/<name>.mp3 (lock, select, snap). A missing file is skipped.
 *
 * Web Audio, not <audio>: browsers only allow sound after a user gesture, and iOS also
 * blocks <audio>.play() that is not itself inside one — so the lock sound (fired by
 * tracking, not a tap) would never play. One AudioContext resumed on the Start tap stays
 * unlocked for the session. iOS's silent switch still mutes it, as it should.
 * Levels: SOUND in config.js (read on every play, so dashboard edits apply at once).
 */
import {SOUND} from './config'

const NAMES = ['lock', 'select', 'snap']
let ctx = null
const buffers = {}

/** Call from the Start tap (a user gesture). */
export const unlockSound = () => {
  if (ctx) return
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return
  ctx = new AC()
  ctx.resume()
  for (const name of NAMES) {
    fetch(`/sounds/${name}.mp3`)
      .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(b => ctx.decodeAudioData(b))
      .then(buf => { buffers[name] = buf })
      .catch(err => console.warn(`[sound] ${name}.mp3 unavailable (${err.message})`))
  }
}

export const playSound = (name) => {
  const buf = buffers[name]
  if (!ctx || !buf) return
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
