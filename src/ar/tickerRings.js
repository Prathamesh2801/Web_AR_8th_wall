/**
 * tickerRings.js — Typography style "Ticker": text bands wrapped round the bottle like a
 * stadium ticker, tilted, scrolling in opposite directions.
 *
 * Each ring (config `rings`) is an open cylinder with its text on a repeating canvas
 * texture; scrolling is the texture's offset, so a ring is one draw call and update
 * allocates nothing.
 *   Entrance  the band unfolds from a line, widens out to its radius and spins up fast,
 *             easing down to its cruise speed (rings staggered)
 *   Exit      the reverse: it speeds up, folds back into a line and is gone
 *
 * Depth: the front half is drawn normally; the far half (the cylinder's inside, seen
 * through) is a second mesh at `backOpacity`, and the occlusion proxy hides whatever
 * passes behind the bottle, so the band really wraps it. Fixed renderOrders keep the
 * two rings from swapping (flicker).
 *
 * The text is laid out to repeat a whole number of times round the ring (stretched a
 * little to fit) so the seam never shows.
 */
import * as THREE from 'three'

import {RenderOrder} from './renderOrder'

const PX = 128 // canvas height of a band
const FONT = `800 ${PX * 0.5}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`
const SEP = '   •   '

const clamp01 = t => Math.min(Math.max(t, 0), 1)
const easeOutCubic = t => 1 - (1 - t) ** 3
const easeInOutCubic = t => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2)

/** The band's texture: `text` repeated round a ring of the given width/height ratio. */
const makeBand = (text, aspect, cfg) => {
  const c = document.createElement('canvas')
  const ctx = c.getContext('2d')
  ctx.font = FONT
  const phrase = text + SEP
  const phraseW = ctx.measureText(phrase).width
  // Width: the ring's real proportions, capped to the safe texture size; repeats: a
  // whole number, the text stretched/squeezed (<= ~15%) to close the loop exactly.
  const w = Math.min(Math.round(aspect * PX), 4096)
  const repeats = Math.max(1, Math.round(w / phraseW))
  c.width = w
  c.height = PX
  ctx.fillStyle = cfg.bandColor
  ctx.fillRect(0, PX * 0.08, w, PX * 0.84)
  ctx.fillStyle = cfg.accentColor
  ctx.fillRect(0, PX * 0.08, w, PX * 0.035)
  ctx.fillRect(0, PX * 0.885, w, PX * 0.035)
  ctx.font = FONT
  ctx.textBaseline = 'middle'
  ctx.setTransform(w / (repeats * phraseW), 0, 0, 1, 0, 0)
  for (let i = 0; i < repeats; i++) {
    const x = i * phraseW
    ctx.fillStyle = cfg.textColor
    ctx.fillText(text, x, PX / 2 + 2)
    ctx.fillStyle = cfg.accentColor
    ctx.fillText(SEP, x + ctx.measureText(text).width, PX / 2 + 2)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.anisotropy = 8 // the band is seen edge-on at the sides
  tex.premultiplyAlpha = true // no dark fringe on the see-through band (see callouts.js)
  return tex
}

const bandMaterial = (map, side) => new THREE.MeshBasicMaterial({
  map, side, transparent: true, depthWrite: false, depthTest: true,
  // Premultiplied texels: ONE / ONE_MINUS_SRC_ALPHA; fades scale colour and opacity.
  blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
})

export const createTickerRings = (cfg) => {
  const root = new THREE.Group()
  root.name = 'tickerRings'
  let built = null
  let lastMs = null
  let speed = 1
  let t = 0 // ms since the entrance started
  let exitT = null // ms since the exit started, null while not exiting

  const build = ({radiusTop, radiusBottom, height: H}) => {
    if (built) return true
    const R = (radiusTop + radiusBottom) / 2
    if (!(R > 0) || !(H > 0)) return false
    const bandH = cfg.bandHeight * H
    const rings = Object.entries(cfg.rings).map(([key, c], i) => {
      const r = c.radius * R
      const tex = makeBand(c.text, (2 * Math.PI * r) / bandH, cfg)
      // Unit-height open cylinder; u runs from +z (front) toward +x, so the front reads
      // left to right.
      const geo = new THREE.CylinderGeometry(r, r, 1, 96, 1, true)
      const front = new THREE.Mesh(geo, bandMaterial(tex, THREE.FrontSide))
      const back = new THREE.Mesh(geo, bandMaterial(tex, THREE.BackSide))
      front.renderOrder = RenderOrder.TICKER_FRONT + i
      back.renderOrder = RenderOrder.TICKER_BACK + i
      const group = new THREE.Group() // tilt + height; the meshes inside scale for the unfold
      group.add(back, front)
      root.add(group)
      return {key, i, group, front, back, tex, bandH, scroll: 0}
    })
    built = {R, H, rings}
    return true
  }

  const update = (timeMs) => {
    if (!built) return
    const dt = lastMs === null ? 0 : Math.min(timeMs - lastMs, 100) * speed
    lastMs = timeMs
    t += dt
    if (exitT !== null) exitT += dt
    const {H, rings} = built

    for (const ring of rings) {
      const c = cfg.rings[ring.key]
      // e: 0 = folded away, 1 = fully open. Entrance eases out, exit eases in-out.
      const enter = easeOutCubic(clamp01((t - ring.i * cfg.stagger) / cfg.entranceDuration))
      const leave = exitT === null ? 0
        : easeInOutCubic(clamp01((exitT - ring.i * cfg.stagger * 0.5) / (cfg.entranceDuration * 0.6)))
      const e = enter * (1 - leave)
      const visible = e > 0.001
      ring.group.visible = visible
      if (!visible) continue

      ring.group.position.y = c.y * H
      ring.group.rotation.set(0, 0, (c.tiltDeg * Math.PI) / 180)
      const s = 0.82 + 0.18 * e // widens out to its radius
      ring.front.scale.set(s, ring.bandH * e, s)
      ring.back.scale.copy(ring.front.scale)

      // Spins in fast and settles to cruise; spins away fast on exit.
      const boost = 1 + 5 * (1 - e)
      ring.scroll += ((c.direction < 0 ? -1 : 1) * c.speed * boost * dt) / 1000 // rev
      ring.scroll -= Math.floor(ring.scroll) // keep it small: float precision
      ring.tex.offset.x = ring.scroll

      ring.front.material.opacity = e
      ring.front.material.color.setScalar(e)
      const b = e * cfg.backOpacity
      ring.back.material.opacity = b
      ring.back.material.color.setScalar(b)
    }
  }

  const restartEntrance = () => {
    lastMs = null
    t = 0
    exitT = null
  }

  return {
    root, build, update, restartEntrance,
    exit: () => { exitT = 0 },
    isExited: () => !built || (exitT !== null && built.rings.every(r => !r.group.visible)),
    setUserSpeed: v => { speed = v },
  }
}
