/**
 * arcadeRules.js — Arcade's game rules, pure (no three.js, no imports): node --test runs them.
 */

// Coin states shared with arcade.js.
export const IDLE = 0 // seated in its socket, free to pop
export const UP = 1

/** The multiplier after a hit `sinceMs` after the previous one. */
export const nextCombo = (combo, sinceMs, comboMs, comboMax) =>
  (sinceMs < comboMs ? Math.min(combo + 1, comboMax) : 1)

/** A free (IDLE) hole to pop, chosen by r (0..1), or -1. Allocation-free (runs per frame). */
export const pickHole = (holes, r) => {
  let free = 0
  for (const h of holes) if (h.state === IDLE) free++
  if (!free) return -1
  let k = Math.min(Math.floor(r * free), free - 1)
  for (let i = 0; i < holes.length; i++) if (holes[i].state === IDLE && k-- === 0) return i
  return -1
}

/**
 * Board layout: which socket each badge takes, so none crosses the bottle on its way.
 * `side[i]` = sin(angle from the camera) of badge i (< 0 = screen left). The left-most half
 * go to the left column, the rest right; each column fills top -> bottom by print height `y`.
 * Returns [{col: -1 | 1, row}] per badge.
 */
export const layoutSockets = (side, y) => {
  const n = side.length
  const order = [...side.keys()].sort((a, b) => side[a] - side[b])
  const half = Math.ceil(n / 2)
  const out = new Array(n)
  for (const [col, ids] of [[-1, order.slice(0, half)], [1, order.slice(half)]]) {
    ids.sort((a, b) => y[b] - y[a] || col * (side[b] - side[a])) // top first; outer first
    ids.forEach((id, row) => { out[id] = {col, row} })
  }
  return out
}
