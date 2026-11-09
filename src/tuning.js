/**
 * tuning.js — live tuning for the dashboard (`?debug` only).
 *
 * The dashboard edits ANIMATIONS and SOUND (config.js) IN PLACE; animations read their config
 * every frame, so edits show at once. Edits are remembered in this browser only
 * (localStorage) so a reload keeps them while tuning on a phone. config.js stays the
 * source of truth: "Copy settings" puts the tuned values on the clipboard to paste
 * back into it, and "Reset" returns to it. Normal visits (no `?debug`) never load them.
 */
import {ANIMATIONS, SOUND} from './config'

const KEY = 'supradyn-ar-tuning'
/** Everything the dashboard edits; saved / copied as one object. */
const TUNED = {animations: ANIMATIONS, sound: SOUND}
const DEFAULTS = structuredClone(TUNED)
const isObj = v => v !== null && typeof v === 'object'

/** Copies matching keys of the same type only, so a stale save can't break config. */
const merge = (dst, src) => {
  for (const k of Object.keys(src)) {
    if (!(k in dst)) continue
    if (isObj(dst[k]) && isObj(src[k])) merge(dst[k], src[k])
    else if (typeof dst[k] === typeof src[k]) dst[k] = src[k]
  }
}

export const TUNING_ALLOWED = new URLSearchParams(window.location.search).has('debug')

// Runs on import — before App reads `active` and before the scene is built.
if (TUNING_ALLOWED) {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved) merge(TUNED, JSON.parse(saved))
  } catch { /* private mode / bad JSON: just use config.js */ }
}

export const saveTuning = () => {
  try { localStorage.setItem(KEY, JSON.stringify(TUNED)) } catch { /* not persisted */ }
}

export const resetTuning = () => {
  try { localStorage.removeItem(KEY) } catch { /* nothing saved */ }
  merge(TUNED, structuredClone(DEFAULTS))
}

export const tuningJSON = () => JSON.stringify(TUNED, null, 2)
