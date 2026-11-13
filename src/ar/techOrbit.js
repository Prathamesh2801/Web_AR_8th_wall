/**
 * techOrbit.js — Elements style "Tech Orbit": the label's service badges come to life.
 *
 *   Track   a thin lime orbit ring draws itself round the bottle (gently tilted)
 *   Lift    one by one, each printed badge (cfg.items[].badge, mm on the trim label) is
 *           copied as a 3D coin exactly over its print (paper ring, lime rim, green disc,
 *           white icon), thickens and flies into its slot: all coins evenly spaced on ONE
 *           ring that turns as a whole, like a carousel; the occluder hides the far side
 *   Labels  only coins on the near side show their name, strongest at the front, so the
 *           view never fills with overlapping text
 *   Tap     the coin leaves the ring and rises above the cap onto a glass info board (the
 *           coin as its medallion; eyebrow, title, pitch, footer), facing and leaning toward
 *           the viewer; the other coins dim and keep turning round its gap. Tap the board
 *           or coin = back to its slot; tap another coin = swap
 *   Exit    a showing coin goes back first; then every coin flies home onto its badge and
 *           the ring undraws
 *
 * Coins are the stand-in until the brand has 3D models: an item with `model` (a GLB in
 * public/brands/<id>/, made with scripts/optimize-model.mjs) swaps its coin for the model
 * once the coin is in orbit. Models are re-shaded with the typography matcap + their own
 * colour texture: the AR scene has almost no lights, so their PBR material came out dark.
 * Coin faces are unlit art, so their brightness follows the room (cameraLight.js).
 * update() allocates nothing.
 */
import * as THREE from 'three'
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js'
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js'

import {fetchAsset} from '../assets'
import {PRODUCT, brandFile} from '../config'
import {haptic} from '../sound'
import {cameraLight} from './cameraLight'
import {liveColor} from './liveColor'
import {RenderOrder} from './renderOrder'
import {makeMatcap} from './typography'

const TAU = Math.PI * 2
const clamp01 = t => Math.min(Math.max(t, 0), 1)
const easeInOut = t => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2)
const easeOut = t => 1 - (1 - t) ** 3
const lerp = (a, b, t) => a + (b - a) * t
const wrapPi = (a) => { a %= TAU; return a > Math.PI ? a - TAU : a < -Math.PI ? a + TAU : a }
// The printed badge (make-sticker.mjs service()): radii in mm, icon box in mm.
const BADGE = {ring: 5.6, disc: 4.9, icon: 6.1}
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

/** Loads a Tabler (stroke) icon as a white image; `onImg` gets it when ready. */
const loadIcon = (url, onImg) => fetchAsset(url).then(r => r.text()).then((svg) => {
  const img = new Image()
  img.onload = () => onImg(img)
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace(/currentColor/g, '#ffffff'))
}).catch(err => console.warn('[AR] tech orbit icon failed', url, err))

/** The badge face as a texture; the icon is drawn in once its SVG has loaded. */
const makeFace = (iconUrl, colors) => {
  const S = 512 // also the board's medallion: 256 went soft there
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  const k = S / 2 / BADGE.ring
  const paint = (img) => {
    ctx.clearRect(0, 0, S, S)
    ctx.fillStyle = colors.paper
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2, 0, TAU); ctx.fill()
    ctx.strokeStyle = colors.rim
    ctx.lineWidth = 0.35 * k * 1.6
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - ctx.lineWidth / 2, 0, TAU); ctx.stroke()
    ctx.fillStyle = colors.disc
    ctx.beginPath(); ctx.arc(S / 2, S / 2, BADGE.disc * k, 0, TAU); ctx.fill()
    if (img) {
      const s = BADGE.icon * k
      ctx.drawImage(img, S / 2 - s / 2, S / 2 - s / 2, s, s)
    }
    tex.needsUpdate = true
  }
  paint(null)
  loadIcon(iconUrl, paint)
  return tex
}

/** The service name under a coin: an 8:1 sprite whose caps fill ~60% of its height. */
const LABEL_ASPECT = 8
const makeLabel = (text) => {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 128
  const ctx = c.getContext('2d')
  ctx.font = `700 84px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = 16
  ctx.strokeStyle = 'rgba(6, 30, 14, 0.85)'
  ctx.strokeText(text, 512, 66)
  ctx.fillStyle = '#ffffff'
  ctx.fillText(text, 512, 66)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({map: tex, transparent: true, depthWrite: false, opacity: 0}))
  sprite.renderOrder = RenderOrder.LABEL
  return sprite
}

/** Wraps `text` to lines no wider than `w` at the context's current font. */
const wrapLines = (ctx, text, w) => {
  const lines = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width > w && line) { lines.push(line); line = word } else line = next
  }
  if (line) lines.push(line)
  return lines
}

/** The info board: dark glass card, lime edge, room at the top for the coin medallion. */
const CARD = {w: 1024, h: 600, r: 56} // layout units; drawn at CARD_RES x for sharp text
const CARD_RES = 2 // a phone's 3x screen shows the board wider than 1024 px
const makeCard = (item, cfg) => {
  // Card px the medallion covers below the top edge = its radius on this board (stageScale
  // and cardMm are read when the card is drawn), capped so the text still fits.
  const MEDALLION_PX = Math.min(200, Math.round(((BADGE.ring * cfg.stageScale) / cfg.cardMm) * CARD.w) + 6)
  const c = document.createElement('canvas')
  c.width = CARD.w * CARD_RES
  c.height = CARD.h * CARD_RES
  const ctx = c.getContext('2d')
  ctx.scale(CARD_RES, CARD_RES)
  const round = (x, y, w, h, r) => {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  }
  const P = 10 // inset for the glow
  const g = ctx.createLinearGradient(0, 0, 0, CARD.h)
  g.addColorStop(0, cfg.cardTop)
  g.addColorStop(1, cfg.cardBottom)
  ctx.shadowColor = cfg.cardGlow
  ctx.shadowBlur = 18
  round(P, P, CARD.w - 2 * P, CARD.h - 2 * P, CARD.r)
  ctx.fillStyle = g
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.lineWidth = 5
  ctx.strokeStyle = cfg.cardEdge
  ctx.stroke()
  // Soft sheen across the top.
  const sheen = ctx.createLinearGradient(0, 0, 0, CARD.h * 0.45)
  sheen.addColorStop(0, 'rgba(255,255,255,0.10)')
  sheen.addColorStop(1, 'rgba(255,255,255,0)')
  round(P + 3, P + 3, CARD.w - 2 * P - 6, CARD.h * 0.45, CARD.r - 3)
  ctx.fillStyle = sheen
  ctx.fill()

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  // The top MEDALLION_PX stay clear: the coin sits there, centred on the top edge.
  ctx.fillStyle = cfg.cardAccent
  ctx.font = `700 32px ${FONT}`
  ctx.letterSpacing = '6px'
  ctx.fillText(cfg.cardEyebrow.toUpperCase(), CARD.w / 2, MEDALLION_PX + 52)
  ctx.letterSpacing = '0px'
  ctx.fillStyle = '#ffffff'
  ctx.font = `800 72px ${FONT}`
  ctx.fillText(item.label, CARD.w / 2, MEDALLION_PX + 130)
  ctx.fillStyle = 'rgba(255,255,255,0.82)'
  ctx.font = `500 38px ${FONT}`
  wrapLines(ctx, item.pitch ?? '', CARD.w - 180).slice(0, 2)
    .forEach((l, i) => ctx.fillText(l, CARD.w / 2, MEDALLION_PX + 196 + i * 50))
  // Footer rule + site.
  ctx.fillStyle = cfg.cardAccent
  ctx.fillRect(CARD.w / 2 - 60, CARD.h - 92, 120, 4)
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.font = `700 28px ${FONT}`
  ctx.letterSpacing = '4px'
  ctx.fillText(cfg.cardFooter.toUpperCase(), CARD.w / 2, CARD.h - 44)
  ctx.letterSpacing = '0px'
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

export const createTechOrbit = (cfg) => {
  const root = new THREE.Group()
  root.name = 'techOrbit'
  let built = null
  let lastMs = null
  let speed = 1
  let t = 0 // entrance clock, ms; runs back on exit
  let leaving = false
  let turn = 0 // the ring's rotation, rad
  let selected = null // item on the stage (or heading there)
  const cam = new THREE.Vector3()
  const faceColor = new THREE.Color()
  const dimColor = new THREE.Color()
  const slot = new THREE.Vector3()
  const stagePos = new THREE.Vector3()
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  let matcapTex = null
  const modelMatcap = () => (matcapTex ??= makeMatcap())

  const select = (it) => {
    if (leaving) return
    haptic(12)
    selected = selected === it ? null : it
  }

  const build = ({radiusTop, radiusBottom, height: H}) => {
    if (built) return true
    const R = (radiusTop + radiusBottom) / 2
    if (!(R > 0) || !(H > 0) || !cfg.items?.length) return false
    const {mm, profile} = PRODUCT
    const u = H / mm.labelHeight // engine units per mm
    const span = (mm.labelWidth / mm.circumference) * TAU
    const colors = {paper: cfg.paperColor, rim: cfg.rimColor, disc: cfg.discColor}

    const radius = BADGE.ring * u
    const rimGeo = new THREE.CylinderGeometry(radius, radius, 1, 48, 1, true)
    rimGeo.rotateX(Math.PI / 2) // axis along z: the faces look out along +z / -z
    const faceGeo = new THREE.CircleGeometry(radius, 48)
    const rimMat = new THREE.MeshBasicMaterial({color: cfg.sideColor})

    // The orbit track: a thin ring, tilted like the slots.
    const ringR = R * cfg.radius
    const track = new THREE.Mesh(
      // Just inside the coins' path, so the line passes behind them, not across their faces.
      new THREE.TorusGeometry(ringR - radius * 0.9, 0.35 * u, 6, 160),
      new THREE.MeshBasicMaterial({transparent: true, opacity: 0, depthWrite: false}),
    )
    // Torus lies in XY: +90° makes it flat, + tilt matches the slots' tilt (about x).
    track.rotation.x = Math.PI / 2 + (cfg.tiltDeg * Math.PI) / 180
    track.position.y = cfg.height * H
    track.renderOrder = RenderOrder.ORBIT_PATH
    root.add(track)

    // The stage: info board above the cap, the chosen coin as its medallion.
    const yTop = profile.at(-1)[0] * H
    const cardW = cfg.cardMm * u
    const cardH = cardW * (CARD.h / CARD.w)
    const stage = new THREE.Group()
    stage.rotation.order = 'YXZ'
    stage.position.y = yTop + cfg.stageGapMm * u + cardH / 2
    root.add(stage)

    const items = cfg.items.map((it, i) => {
      const faceMat = new THREE.MeshBasicMaterial({map: makeFace(brandFile(`icons/${it.icon}.svg`), colors)})
      const front = new THREE.Mesh(faceGeo, faceMat)
      const back = new THREE.Mesh(faceGeo, faceMat)
      back.rotation.y = Math.PI
      const rim = new THREE.Mesh(rimGeo, rimMat)
      const coin = new THREE.Group()
      coin.add(rim, front, back)
      const holder = new THREE.Group() // position + yaw
      holder.add(coin)
      const entry = {
        holder, coin, front, back, rim, faceMat, model: null, grow: null,
        label: makeLabel(it.label),
        az0: (it.badge.cx / mm.labelWidth - 0.5) * span, // its print
        y0: (0.5 - it.badge.cy / mm.labelHeight) * H,
        slotAz: (i / cfg.items.length) * TAU, // even spacing round the ring
        delay: cfg.trackMs * 0.6 + i * cfg.staggerMs,
        p: 0, // 0 on its badge .. 1 in its slot
        s: 0, // 0 in orbit .. 1 on the stage
      }
      const hit = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.6, 10, 8), new THREE.MeshBasicMaterial({visible: false}))
      hit.userData.pick = () => select(entry)
      holder.add(hit)
      entry.hit = hit

      const board = new THREE.Mesh(
        new THREE.PlaneGeometry(cardW, cardH),
        new THREE.MeshBasicMaterial({map: makeCard(it, cfg), transparent: true, opacity: 0, depthWrite: false}),
      )
      board.renderOrder = RenderOrder.CALLOUT_CARD
      board.visible = false
      board.userData.pick = () => select(entry)
      stage.add(board)
      entry.board = board
      root.add(holder, entry.label)

      if (it.model) {
        loader.loadAsync(brandFile(it.model)).then((g) => {
          const m = g.scene
          m.traverse((o) => {
            if (!o.isMesh) return
            const old = o.material
            if (old.map) old.map.anisotropy = 8 // seen at angles as it turns
            o.material = new THREE.MeshMatcapMaterial({matcap: modelMatcap(), map: old.map ?? null, color: old.map ? 0xffffff : old.color})
            old.dispose()
          })
          const box = new THREE.Box3().setFromObject(m)
          const dims = box.getSize(new THREE.Vector3())
          const size = Math.max(dims.x, dims.y, dims.z) || 1
          m.position.sub(box.getCenter(new THREE.Vector3()))
          const grow = new THREE.Group() // animated 0..1; the model keeps its own transform
          grow.add(m)
          const wrap = new THREE.Group()
          wrap.add(grow)
          wrap.scale.setScalar((radius * 2) / size) // its largest side = the coin's diameter
          wrap.visible = false
          holder.add(wrap)
          entry.model = wrap
          entry.grow = grow
        }).catch(err => console.warn('[AR] tech orbit model failed', it.model, err))
      }
      return entry
    })

    built = {R, H, u, radius, ringR, track, stage, cardH, items, rimMat}
    return true
  }

  const update = (timeMs, camera) => {
    if (!built) return
    const dt = lastMs === null ? 0 : Math.min(timeMs - lastMs, 100) * speed
    lastMs = timeMs
    const {R, H, u, ringR, items, track, stage} = built
    const tEnd = cfg.trackMs * 0.6 + (items.length - 1) * cfg.staggerMs + cfg.emergeMs
    // Leaving: the stage clears first, then the clock runs back.
    if (leaving) selected = null
    let staged = false
    for (const it of items) if (it.s > 0.001) staged = true
    t = leaving ? (staged ? t : Math.max(t - dt * cfg.exitSpeed, 0)) : Math.min(t + dt, tEnd)
    turn += ((cfg.speed * TAU) / 1000) * dt
    if (turn > 1e4) turn %= TAU

    let camAz = 0
    if (camera) {
      root.worldToLocal(cam.copy(camera.position))
      camAz = Math.atan2(cam.x, cam.z)
    }
    const tilt = (cfg.tiltDeg * Math.PI) / 180
    const ringY = cfg.height * H
    const azOff = (cfg.printAzimuthDeg * Math.PI) / 180

    // Track: draws in first, undraws last.
    const tr = easeOut(clamp01(t / cfg.trackMs))
    track.scale.setScalar(lerp(0.85, 1, tr))
    track.material.opacity = cfg.trackOpacity * tr
    track.visible = tr > 0.001
    liveColor(track.material.color, cfg.trackColor)

    // Stage: faces the viewer, leaning back toward them.
    stage.rotation.y = camAz
    stage.rotation.x = -Math.atan2(cam.y - stage.position.y, Math.hypot(cam.x, cam.z))
    stage.updateMatrix()
    // Where the medallion sits: the board's top edge, a little in front of it.
    stagePos.set(0, built.cardH / 2, built.radius * 0.6).applyMatrix4(stage.matrix)

    // Room brightness on the unlit faces; the others dim while one is on stage.
    const L = cameraLight.ready ? cameraLight.luma : 0.18
    faceColor.setScalar(Math.min(1, Math.max(0.45, Math.sqrt(L / 0.18) * cfg.brightness)))
    liveColor(built.rimMat.color, cfg.sideColor)
    let focus = 0
    for (const it of items) focus = Math.max(focus, it.s)
    dimColor.copy(faceColor).multiplyScalar(lerp(1, cfg.dimOthers, focus))

    for (const it of items) {
      it.p = easeInOut(clamp01((t - it.delay) / cfg.emergeMs))
      it.s = clamp01(it.s + ((it === selected ? 1 : -1) * dt) / cfg.selectMs)
      const p = it.p
      const s = easeInOut(it.s)
      const visible = p > 0 || (!leaving && t > it.delay)
      it.holder.visible = visible
      it.label.visible = visible
      it.board.visible = s > 0.001
      if (!visible) continue

      // Its slot on the (tilted) ring.
      const a = it.slotAz + turn
      slot.set(ringR * Math.sin(a), ringY - ringR * Math.cos(a) * Math.sin(tilt), ringR * Math.cos(a) * Math.cos(tilt))
      const bob = Math.sin((timeMs / 1000) * TAU * 0.35 + it.slotAz * 3) * cfg.bobMm * u * p * (1 - s)

      // Badge -> slot, round the bottle the short way.
      const azPrint = it.az0 + azOff
      const az = azPrint + wrapPi(a - azPrint) * p
      const r = lerp(R * 1.004, Math.hypot(slot.x, slot.z), p)
      it.holder.position.set(r * Math.sin(az), lerp(it.y0, slot.y, p) + bob, r * Math.cos(az))
      // Slot -> stage: an arc up and over.
      if (s > 0) {
        it.holder.position.lerp(stagePos, s)
        it.holder.position.y += Math.sin(s * Math.PI) * 0.25 * H
      }

      // Facing: outward on the label, then the viewer; on stage, leaning like the board.
      const toCam = Math.atan2(cam.x - it.holder.position.x, cam.z - it.holder.position.z)
      it.holder.rotation.y = az + wrapPi(toCam - az) * p
      it.holder.rotation.x = stage.rotation.x * s

      const scale = lerp(lerp(1, cfg.topScale, p), cfg.stageScale, s)
      const depth = lerp(0.02, cfg.depthMm, p) * u
      it.rim.scale.set(1, 1, Math.max(depth, 1e-4))
      it.front.position.z = depth / 2
      it.back.position.z = -depth / 2
      const swap = it.model ? clamp01((p - 0.7) / 0.3) : 0 // a model takes over in orbit
      it.coin.scale.setScalar(scale * (1 - swap) + 1e-4)
      it.hit.scale.setScalar(scale)
      if (it.model) {
        it.model.visible = swap > 0
        it.grow.scale.setScalar(swap * scale * cfg.modelScale + 1e-4)
        it.model.rotation.y = (timeMs / 1000) * 1.2
      }
      it.faceMat.color.copy(it.s > 0 ? faceColor : dimColor)

      // Name: near side only, strongest at the front; gone while on stage.
      const near = Math.max(0, Math.cos(wrapPi(a - camAz)))
      const lh = (cfg.labelMm / 0.6) * u
      it.label.scale.set(lh * LABEL_ASPECT, lh, 1)
      it.label.position.set(it.holder.position.x, it.holder.position.y - built.radius * scale - lh * 0.45, it.holder.position.z)
      it.label.material.opacity = clamp01((p - 0.6) / 0.4) * clamp01((near - 0.35) / 0.4) * (1 - s) * lerp(1, 0.35, focus)

      // Board: grows out from the medallion.
      if (it.board.visible) {
        const b = easeOut(clamp01((it.s - 0.35) / 0.65))
        it.board.material.opacity = b
        it.board.scale.setScalar(lerp(0.6, 1, b))
        it.board.position.y = lerp(built.cardH * 0.25, 0, b)
      }
    }
  }

  return {
    root, build, update,
    restartEntrance: () => { lastMs = null; t = 0; leaving = false; selected = null },
    exit: () => { leaving = true },
    isExited: () => !built || (leaving && t <= 0 && built.items.every(it => it.p <= 0 && it.s <= 0)),
    getPickables: () => (built
      ? [...built.items.filter(it => it.p > 0.5).map(it => it.hit), ...built.items.filter(it => it.s > 0.5).map(it => it.board)]
      : []),
    setUserSpeed: v => { speed = v },
  }
}
