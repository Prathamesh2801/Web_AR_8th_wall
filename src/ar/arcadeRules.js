/**
 * arcadeRules.js — Arcade's game rules, pure (no three.js, no imports): node --test runs them.
 */

// Coin states shared with arcade.js.
export const IDLE = 0
export const UP = 1
// cos(angle to the camera) above this = the badge faces the player (tappable, in view).
export const FACING = 0.2

/** The multiplier after a hit `sinceMs` after the previous one. */
export const nextCombo = (combo, sinceMs, comboMs, comboMax) =>
  (sinceMs < comboMs ? Math.min(combo + 1, comboMax) : 1)

/**
 * A free hole to pop (index), or -1. Facing the camera, or round the side with chance
 * `side` (always, when none faces). r1, r2 = random 0..1. Allocation-free (runs per frame).
 */
export const pickHole = (holes, camAz, r1, r2, side) => {
  let front = 0
  let back = 0
  for (const h of holes) {
    if (h.state !== IDLE) continue
    if (Math.cos(h.az - camAz) > FACING) front++
    else back++
  }
  if (!front && !back) return -1
  const useBack = back > 0 && (!front || r1 < side)
  let k = Math.floor(r2 * (useBack ? back : front))
  for (let i = 0; i < holes.length; i++) {
    const h = holes[i]
    if (h.state !== IDLE || (Math.cos(h.az - camAz) > FACING) === useBack) continue
    if (k-- === 0) return i
  }
  return -1
}
