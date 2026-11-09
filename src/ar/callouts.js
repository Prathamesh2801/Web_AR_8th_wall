/**
 * callouts.js — Typography style "Callouts": feature labels beside the bottle.
 *
 * Each item in config (`items`) runs one timeline, items staggered left/right:
 *   dot    pops onto the bottle's surface
 *   line   draws outward: a short rise, then level to the card (an elbow)
 *   card   opens from the line's end
 *   text   types in letter by letter behind a blinking cursor
 * Exit (switching to another effect) is the same timeline played backwards, faster.
 *
 * Left/right are the SCREEN's, not the label's: every frame the callouts are laid out
 * in the plane through the bottle's axis that faces the camera, so they stay beside the
 * bottle from any angle. Cards are sprites (always face the camera) so they are in the
 * 3D layer and land in snapped photos, which an HTML overlay would not.
 *
 * Every timeline is a single number `p` (ms into its entrance): entering adds dt,
 * exiting subtracts it, and everything is drawn from `p`. A card's canvas is redrawn
 * only when its visible letter count or cursor changes; the typed prefixes are built
 * once, so `update` allocates nothing.
 */
import * as THREE from 'three'

import {liveColor} from './liveColor'
import {RenderOrder} from './renderOrder'

// ms from an item's own start
const T = {dot: 180, lineAt: 120, line: 420, cardAt: 480, card: 280, typeAt: 700}
const EXIT_SPEED = 2.5 // exit plays the entrance backwards this many times faster
const CARD_PX = 112 // canvas height of a card; the font is sized from it
const FONT = `700 ${CARD_PX * 0.4}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`

const clamp01 = t => Math.min(Math.max(t, 0), 1)
const easeOutCubic = t => 1 - (1 - t) ** 3
const easeOutBack = t => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2
const phase = (p, at, dur) => clamp01((p - at) / dur)

const makeDotTexture = () => {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.55, 'rgba(255,255,255,1)')
  g.addColorStop(0.68, 'rgba(255,255,255,0.35)')
  g.addColorStop(0.85, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** One card: a canvas sized to its full text, redrawn as the text types in. */
const makeCard = (text) => {
  const c = document.createElement('canvas')
  const ctx = c.getContext('2d')
  ctx.font = FONT
  const pad = CARD_PX * 0.32
  const textW = ctx.measureText(text).width // before resizing: resizing resets the font
  c.height = CARD_PX
  c.width = Math.ceil(textW + pad * 2 + CARD_PX * 0.12) // + cursor room
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  // Blur fixes: premultiplied alpha (straight alpha bleeds a dark fringe into every
  // see-through edge when filtered) and no mipmaps (trilinear picks a smaller, softer
  // level for small on-screen text; bold text minifies cleanly with plain linear).
  tex.premultiplyAlpha = true
  tex.generateMipmaps = false
  tex.minFilter = THREE.LinearFilter
  // Premultiplied texels need ONE / ONE_MINUS_SRC_ALPHA. (The material's own
  // `premultipliedAlpha` flag would multiply rgb by alpha a second time.) Fades must then
  // scale colour AND opacity together: see `fade` below.
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthWrite: false, depthTest: true,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  }))
  sprite.renderOrder = RenderOrder.CALLOUT_CARD
  const prefixes = Array.from({length: text.length + 1}, (_, i) => text.slice(0, i))
  let shown = -1
  let cursorShown = null
  let colours = ''

  const draw = (n, cursor, fill, border, accent) => {
    const key = fill + border + accent
    if (n === shown && cursor === cursorShown && key === colours) return
    shown = n
    cursorShown = cursor
    colours = key
    const {width: w, height: h} = c
    const r = h / 2
    ctx.clearRect(0, 0, w, h)
    ctx.beginPath()
    ctx.roundRect(2, 2, w - 4, h - 4, r - 2)
    ctx.fillStyle = fill
    ctx.fill()
    ctx.lineWidth = 3
    ctx.strokeStyle = border
    ctx.stroke()
    ctx.font = FONT
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#FFFFFF'
    ctx.fillText(prefixes[n], pad, h / 2 + 1)
    if (cursor) {
      ctx.fillStyle = accent
      ctx.fillRect(pad + ctx.measureText(prefixes[n]).width + 3, h * 0.3, 4, h * 0.4)
    }
    tex.needsUpdate = true
  }
  return {sprite, draw, aspect: c.width / c.height, length: text.length}
}

export const createCallouts = (cfg) => {
  const root = new THREE.Group()
  root.name = 'callouts'
  let built = null
  let lastMs = null
  let speed = 1
  let exiting = false
  let clockMs = 0 // drives the cursor blink
  let fit = 1 // shared card scale: every card the size of the one with the least room

  // depthTest OFF for dots and lines (the one exception besides the outline): they are
  // laid out on the camera-facing half of the bottle, so nothing real ever hides them,
  // and a dot sitting on the surface z-fights the occlusion proxy — it flickered with
  // every hand tremor.
  const lineMat = new THREE.MeshBasicMaterial({transparent: true, depthWrite: false, depthTest: false})
  const dotMat = new THREE.SpriteMaterial({transparent: true, depthWrite: false, depthTest: false})

  const build = ({radiusTop, radiusBottom, height: H}) => {
    if (built) return true
    const R = (radiusTop + radiusBottom) / 2
    if (!(R > 0) || !(H > 0)) return false
    dotMat.map = makeDotTexture()
    // A unit-length thin cylinder per segment, stretched between its two points each frame.
    const segGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).translate(0, 0.5, 0)
    const items = Object.entries(cfg.items).map(([key, it], i) => {
      const card = makeCard(it.text)
      const dot = new THREE.Sprite(dotMat)
      dot.renderOrder = RenderOrder.CALLOUT_LINE + 1
      const segs = [0, 1].map(() => {
        const m = new THREE.Mesh(segGeo, lineMat)
        m.renderOrder = RenderOrder.CALLOUT_LINE
        return m
      })
      root.add(dot, ...segs, card.sprite)
      return {key, i, card, dot, segs, p: 0}
    })
    built = {R, H, items}
    return true
  }

  // Scratch (update must not allocate).
  const cam = new THREE.Vector3()
  const toCam = new THREE.Vector3()
  const right = new THREE.Vector3()
  const D = new THREE.Vector3() // dot on the surface
  const E = new THREE.Vector3() // elbow
  const P = new THREE.Vector3() // line end = card edge
  const A = new THREE.Vector3()
  const ndcA = new THREE.Vector3()
  const ndcB = new THREE.Vector3()
  const dir = new THREE.Vector3()
  const UP = new THREE.Vector3(0, 1, 0)
  const facing = new THREE.Vector3() // smoothed toCam: steady layout under shaky hands
  let hasFacing = false

  /** Stretches a unit segment mesh from a toward b, `t` (0..1) of the way. */
  const segment = (m, a, b, t, r) => {
    dir.subVectors(b, a)
    const len = dir.length() * t
    m.visible = len > 1e-5
    if (!m.visible) return
    m.position.copy(a)
    m.quaternion.setFromUnitVectors(UP, dir.normalize())
    m.scale.set(r, len, r)
  }

  const typeEnd = it => T.typeAt + it.card.length * cfg.typeSpeed

  const update = (timeMs, camera) => {
    if (!built || !camera) return
    const dt = lastMs === null ? 0 : Math.min(timeMs - lastMs, 100) * speed
    lastMs = timeMs
    clockMs += dt
    const {R, H, items} = built

    // Screen-right round the bottle: horizontal direction to the camera, turned 90 deg.
    camera.getWorldPosition(cam)
    root.worldToLocal(cam)
    toCam.set(cam.x, 0, cam.z)
    if (toCam.lengthSq() < 1e-8) toCam.set(0, 0, 1)
    toCam.normalize()
    // Pose noise swings the camera direction a little every frame; following it raw
    // shook the whole layout. Ease toward it instead (cfg.followMs).
    if (!hasFacing) facing.copy(toCam)
    else facing.lerp(toCam, 1 - Math.exp(-dt / Math.max(cfg.followMs, 1))).normalize()
    hasFacing = true
    toCam.copy(facing)
    right.set(toCam.z, 0, -toCam.x)

    liveColor(lineMat.color, cfg.lineColor)
    liveColor(dotMat.color, cfg.lineColor)
    const cardH = cfg.cardHeight * H
    let fitNeeded = 1
    const lineR = cfg.lineThickness * R

    for (const it of items) {
      const c = cfg.items[it.key]
      const side = c.side < 0 ? -1 : 1
      const full = typeEnd(it)
      if (exiting) {
        it.p = Math.max(Math.min(it.p, full) - dt * EXIT_SPEED, 0) // un-type, close, retract
      } else {
        it.p += dt // timeline includes this item's stagger wait (`stagger` ms per item)
      }
      const p = exiting ? it.p : it.p - it.i * cfg.stagger
      if (p <= 0) { hideItem(it); continue }

      // Layout in the camera-facing plane through the bottle's axis.
      const y = c.y * H
      const rise = (c.y >= 0 ? 1 : -1) * 0.1 * H
      // Dot on the label's front (55% out from the middle), a hair off the surface.
      D.copy(right).multiplyScalar(side * R * 0.55).addScaledVector(toCam, R * 0.85).setY(y)
      E.copy(right).multiplyScalar(side * R * cfg.reach).addScaledVector(toCam, R * 0.3).setY(y + rise)
      P.copy(E).addScaledVector(right, side * R * 0.18)

      // Dot pops, line draws D -> E -> P, card opens at P, text types.
      const pd = phase(p, 0, T.dot)
      it.dot.visible = true
      it.dot.position.copy(D)
      it.dot.scale.setScalar(cfg.dotSize * R * Math.max(easeOutBack(pd), 0))
      const pl = easeOutCubic(phase(p, T.lineAt, T.line))
      const split = 0.55 // share of the draw spent on the first (rising) segment
      segment(it.segs[0], D, E, clamp01(pl / split), lineR)
      segment(it.segs[1], E, P, clamp01((pl - split) / (1 - split)), lineR)

      const pc = easeOutCubic(phase(p, T.cardAt, T.card))
      const s = it.card.sprite
      s.visible = pc > 0.001
      if (s.visible) {
        s.center.set(side > 0 ? 0 : 1, 0.5) // grows outward from the line's end
        A.copy(P).addScaledVector(right, side * R * 0.04)
        s.position.copy(A)
        // Shrink to fit between the line's end and the screen edge (eased: no jitter).
        const w = cardH * it.card.aspect
        ndcA.copy(A)
        ndcB.copy(A).addScaledVector(right, side * w)
        root.localToWorld(ndcA).project(camera)
        root.localToWorld(ndcB).project(camera)
        const room = 0.96 - Math.abs(ndcA.x)
        const need = Math.abs(ndcB.x - ndcA.x)
        if (need > 0) fitNeeded = Math.min(fitNeeded, room / need)
        const k = fit
        s.scale.set(w * k * (0.35 + 0.65 * pc), cardH * k * (0.6 + 0.4 * pc), 1)
        s.material.opacity = pc
        s.material.color.setScalar(pc) // fade: premultiplied rgb scales with alpha
        const letters = Math.min(Math.floor(Math.max(p - T.typeAt, 0) / cfg.typeSpeed), it.card.length)
        const typing = !exiting && p < full + cfg.cursorLinger
        const cursor = typing && (letters < it.card.length || Math.floor(clockMs / 400) % 2 === 0)
        it.card.draw(letters, cursor, cfg.cardColor, cfg.cardBorderColor, cfg.lineColor)
      }
    }
    fitNeeded = Math.min(Math.max(fitNeeded, cfg.minFit), 1)
    fit += (fitNeeded - fit) * Math.min(dt / 250, 1) // applied next frame, eased
  }

  const hideItem = (it) => {
    it.dot.visible = false
    it.segs[0].visible = it.segs[1].visible = false
    it.card.sprite.visible = false
  }

  const restartEntrance = () => {
    lastMs = null
    hasFacing = false
    exiting = false
    clockMs = 0
    built?.items.forEach(it => { it.p = 0 })
  }

  return {
    root, build, update, restartEntrance,
    /** Play the entrance backwards; bottleScene keeps updating until `isExited()`. */
    exit: () => {
      exiting = true
      // Everything leaves together: items still waiting for their stagger skip it.
      built?.items.forEach(it => { it.p = Math.max(it.p - it.i * cfg.stagger, 0) })
    },
    isExited: () => !built || built.items.every(it => it.p <= 0),
    setUserSpeed: v => { speed = v },
  }
}
