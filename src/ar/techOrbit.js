/**
 * techOrbit.js — Elements style "Tech Orbit": the label's service badges come to life.
 *
 *   Lift    one by one, each printed badge (cfg.items[].badge, mm on the trim label) is born
 *           as a lime hologram that springs out into its slot (one path, a damped spring
 *           follows it: soft overshoot) and materializes bottom -> top on the way, spinning
 *           fast then settling; all evenly spaced on ONE ring
 *           that turns as a whole, like a carousel; the occluder hides the far side
 *   Orbit   models spin on their own axis, bob, and are a little bigger passing the front
 *           (frontScale / backScale); a lime rim glow on their edges (patchHolo); swipe left/
 *           right turns the ring (drag 1:1, flick momentum, then the auto turn runs the way it
 *           was flicked: it never stops); no line,
 *           no text in orbit
 *   Tap     it arcs up and hovers, spinning, above the cap; the others orbit on, smaller
 *           (tap one = swap); a curved glass panel unfolds on the body over the logo with the
 *           name + one short line (big type: a small board above the cap read blurry).
 *           Tap the model or the panel = back
 *   Exit    a chosen item goes back first; then every item shrinks home into its badge
 *
 * Coins are the stand-in when an item has no `model` (a GLB in public/brands/<id>/, made
 * with scripts/optimize-model.mjs); a model never shows a coin. Models are re-shaded with
 * the typography matcap + their own colour texture: the AR scene has almost no lights, so
 * their PBR material came out dark. Coin faces are unlit art, so their brightness follows
 * the room (cameraLight.js). update() allocates nothing.
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
const backOut = t => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2 // ends with a small overshoot
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
  const S = 512 // also seen big, hovering on the cap: 256 went soft
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

/**
 * A model's matcap material, plus two looks driven by `shared` uniforms:
 * - materialize: above the uReveal height (0 = bottom .. 1 = top of the mesh) it is a lime
 *   scan-line hologram, below it the real model, with a bright band at the edge. The lines
 *   are cut with discard, so it stays opaque (no transparency sorting inside the model).
 * - rim glow: a soft lime fresnel light on its silhouette (uRim), always on.
 */
const patchHolo = (mat, shared, minY, maxY) => {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, shared, {uMinY: {value: minY}, uMaxY: {value: maxY}})
    sh.vertexShader = 'varying float vLocalY;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vLocalY = position.y;')
    sh.fragmentShader = 'uniform float uReveal, uRim, uLines, uMinY, uMaxY;\nuniform vec3 uGlow;\nvarying float vLocalY;\n' +
      sh.fragmentShader.replace('#include <opaque_fragment>', `
  float yN = (vLocalY - uMinY) / max(uMaxY - uMinY, 1e-6);
  float fres = pow(1.0 - abs(dot(normal, viewDir)), 2.5);
  outgoingLight += uGlow * fres * uRim;
  if (uReveal < 0.999) {
    if (yN > uReveal) {
      if (fract(yN * uLines) > 0.55) discard;
      outgoingLight = uGlow * (0.35 + 1.5 * fres);
    }
    outgoingLight = mix(outgoingLight, uGlow * 1.8, smoothstep(0.035, 0.0, abs(yN - uReveal)));
  }
  #include <opaque_fragment>`)
  }
}

/** The info panel's art: name + one short line on dark glass, lime edge. */
const makePanel = (item, cfg, w, h) => {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  const P = h * 0.06
  const r = h * 0.16
  ctx.beginPath()
  ctx.roundRect(P, P, w - 2 * P, h - 2 * P, r)
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, cfg.cardTop)
  g.addColorStop(1, cfg.cardBottom)
  ctx.shadowColor = cfg.cardGlow
  ctx.shadowBlur = P * 0.8
  ctx.fillStyle = g
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.lineWidth = h * 0.012
  ctx.strokeStyle = cfg.cardEdge
  ctx.stroke()
  // Text stays inside the middle ~76%: the panel curves away toward its sides.
  const maxW = w * 0.76
  const fit = (text, weight, px) => {
    for (; px > 8; px -= 2) {
      ctx.font = `${weight} ${px}px ${FONT}`
      if (ctx.measureText(text).width <= maxW) break
    }
  }
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = 'rgba(2, 18, 8, 0.7)'
  fit(item.label, 800, Math.round(h * 0.32))
  ctx.lineWidth = h * 0.03
  ctx.strokeText(item.label, w / 2, h * 0.4)
  ctx.fillStyle = '#ffffff'
  ctx.fillText(item.label, w / 2, h * 0.4)
  ctx.fillStyle = cfg.cardAccent
  ctx.fillRect(w / 2 - h * 0.18, h * 0.585, h * 0.36, h * 0.014)
  fit(item.pitch ?? '', 600, Math.round(h * 0.17))
  ctx.lineWidth = h * 0.02
  ctx.strokeText(item.pitch ?? '', w / 2, h * 0.73)
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.fillText(item.pitch ?? '', w / 2, h * 0.73)
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
  // Swipe: the finger turns the ring 1:1; a flick keeps it going, easing back to the
  // normal turn, which then runs the way it was last flicked. Never stops.
  let dir = 1 // +1 / -1: the auto-turn's direction
  let spin = null // current ring speed, rad/ms (null = not set yet: the auto speed)
  let dragging = false
  let dragVel = 0 // finger speed, rad/ms (smoothed)
  let dragAt = 0 // ms of the last drag move
  let selected = null // item hovering on the cap (or heading there)
  const cam = new THREE.Vector3()
  const faceColor = new THREE.Color()
  const slot = new THREE.Vector3()
  const target = new THREE.Vector3()
  const acc = new THREE.Vector3()
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
    const yTop = profile.at(-1)[0] * H

    // The info panel: an arc of a cylinder just off the label, centred on the logo, turned
    // to face the viewer every frame. Canvas sized to the panel's real proportions.
    const arc = (cfg.panelArcDeg * Math.PI) / 180
    const pr = R * 1.025
    const ph = cfg.panelMm * u
    const panelGeo = new THREE.CylinderGeometry(pr, pr, ph, 64, 1, true, -arc / 2, arc)
    const PW = 1536
    const PH = Math.round(PW * (ph / (pr * arc)))
    const panels = new THREE.Group()
    root.add(panels)

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
        hasModel: !!it.model, // no coin at all; cleared if the GLB fails
        yaw: (i / cfg.items.length) * TAU, // the model's own spin
        az0: (it.badge.cx / mm.labelWidth - 0.5) * span, // its print
        y0: (0.5 - it.badge.cy / mm.labelHeight) * H,
        slotAz: (i / cfg.items.length) * TAU, // even spacing round the ring
        delay: cfg.trackMs + i * cfg.staggerMs,
        p: 0, // 0 on its badge .. 1 in its slot (entrance clock)
        h: 0, // 0 in orbit .. 1 back in its badge while another is chosen
        pe: 0, // the flight progress actually shown: p, less h
        s: 0, // 0 in orbit .. 1 hovering on the cap
        vel: new THREE.Vector3(), // the holder springs after its target (see update)
        fresh: true, // snap onto the target when it (re)appears
        // The model's shader (patchHolo), shared by all its meshes.
        holo: {uReveal: {value: 0}, uRim: {value: 0}, uLines: {value: 60}, uGlow: {value: new THREE.Color()}},
      }
      const hit = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.6, 10, 8), new THREE.MeshBasicMaterial({visible: false}))
      hit.userData.pick = () => select(entry)
      holder.add(hit)
      entry.hit = hit

      const panel = new THREE.Mesh(panelGeo, new THREE.MeshBasicMaterial({
        map: makePanel(it, cfg, PW, PH), transparent: true, opacity: 0, depthWrite: false,
      }))
      panel.renderOrder = RenderOrder.CALLOUT_CARD
      panel.visible = false
      panel.userData.pick = () => select(entry)
      panels.add(panel)
      entry.panel = panel
      root.add(holder)

      if (it.model) {
        loader.loadAsync(brandFile(it.model)).then((g) => {
          const m = g.scene
          m.traverse((o) => {
            if (!o.isMesh) return
            const old = o.material
            if (old.map) {
              // No mipmaps: AI texture atlases pack hundreds of tiny islands edge to edge, so
              // the smaller mip levels average white into the black visor (and back): the
              // model looked speckled/"broken" at orbit size. Plain linear is clean here.
              old.map.generateMipmaps = false
              old.map.minFilter = THREE.LinearFilter
              old.map.needsUpdate = true
            }
            o.material = new THREE.MeshMatcapMaterial({matcap: modelMatcap(), map: old.map ?? null, color: old.map ? 0xffffff : old.color})
            o.geometry.computeBoundingBox()
            patchHolo(o.material, entry.holo, o.geometry.boundingBox.min.y, o.geometry.boundingBox.max.y)
            old.dispose()
          })
          const box = new THREE.Box3().setFromObject(m)
          const dims = box.getSize(new THREE.Vector3())
          // Sized by its MIDDLE dimension: by the largest, the wide headset looked big and
          // the tall, thin wall small. `size` per item fine-tunes by eye.
          const mid = [dims.x, dims.y, dims.z].sort((a, b) => a - b)[1] || 1
          const k = ((radius * 2) / mid) * (it.size ?? 1)
          m.position.sub(box.getCenter(new THREE.Vector3()))
          const grow = new THREE.Group() // animated 0..1; the model keeps its own transform
          grow.add(m)
          const wrap = new THREE.Group()
          wrap.add(grow)
          wrap.scale.setScalar(k)
          wrap.visible = false
          holder.add(wrap)
          entry.model = wrap
          entry.grow = grow
          entry.modelHalf = (dims.y / 2) * k // half its height, at grow 1
        }).catch((err) => { entry.hasModel = false; console.warn('[AR] tech orbit model failed', it.model, err) })
      }
      return entry
    })

    built = {R, H, u, radius, ringR: R * cfg.radius, yTop, panels, items, rimMat}
    return true
  }

  const update = (timeMs, camera) => {
    if (!built) return
    const dt = lastMs === null ? 0 : Math.min(timeMs - lastMs, 100) * speed
    lastMs = timeMs
    const {R, H, u, ringR, yTop, items, panels} = built
    const tEnd = cfg.trackMs + (items.length - 1) * cfg.staggerMs + cfg.emergeMs
    // Leaving: the chosen one comes back first, then the clock runs back.
    if (leaving) selected = null
    let busy = false
    for (const it of items) if (it.s > 0.001) busy = true
    t = leaving ? (busy ? t : Math.max(t - dt * cfg.exitSpeed, 0)) : Math.min(t + dt, tEnd)
    const auto = (dir * cfg.speed * TAU) / 1000
    spin ??= auto
    if (!dragging) {
      spin += (auto - spin) * (1 - Math.exp(-dt / cfg.flickEaseMs)) // a flick fades to the auto turn
      turn += spin * dt
    }
    if (Math.abs(turn) > 1e4) turn %= TAU

    let camAz = 0
    if (camera) {
      root.worldToLocal(cam.copy(camera.position))
      camAz = Math.atan2(cam.x, cam.z)
    }
    const tilt = (cfg.tiltDeg * Math.PI) / 180
    const ringY = cfg.height * H
    const azOff = (cfg.printAzimuthDeg * Math.PI) / 180
    const hoverY = yTop + cfg.hoverMm * u
    panels.rotation.y = camAz
    panels.position.y = cfg.panelY * H

    // Room brightness on the unlit coin faces.
    const L = cameraLight.ready ? cameraLight.luma : 0.18
    faceColor.setScalar(Math.min(1, Math.max(0.45, Math.sqrt(L / 0.18) * cfg.brightness)))
    liveColor(built.rimMat.color, cfg.sideColor)

    for (const it of items) {
      it.p = clamp01((t - it.delay) / cfg.emergeMs) // linear; each phase below eases itself
      it.s = clamp01(it.s + ((it === selected ? 1 : -1) * dt) / cfg.selectMs)
      // While another is chosen the rest keep orbiting, smaller (and still tappable: tap one
      // to swap it onto the cap).
      it.h = clamp01(it.h + ((selected && selected !== it ? 1 : -1) * dt) / cfg.selectMs)
      const p = (it.pe = it.p)
      const s = easeInOut(it.s)
      // ONE path badge -> slot (out a little ahead of round, so it clears the label); the
      // holder springs after it (below), which gives the soft overshoot and settle.
      const out = easeOut(p)
      const glide = easeInOut(p)
      const visible = p > 0 || s > 0
      it.holder.visible = visible
      it.panel.visible = s > 0.001
      if (!visible) { it.fresh = true; continue }

      // Its slot on the (tilted) ring.
      const a = it.slotAz + turn
      slot.set(ringR * Math.sin(a), ringY - ringR * Math.cos(a) * Math.sin(tilt), ringR * Math.cos(a) * Math.cos(tilt))
      const bob = Math.sin((timeMs / 1000) * TAU * cfg.bobHz + it.slotAz * 3) * cfg.bobMm * u * Math.max(p, s)
      // Carousel depth: a little bigger passing the front, smaller round the back.
      const near = (Math.cos(wrapPi(a - camAz)) + 1) / 2
      const depthK = lerp(1, lerp(cfg.backScale, cfg.frontScale, near), glide) * lerp(1, cfg.othersScale, easeInOut(it.h))

      // Badge -> slot, round the bottle the short way.
      const azPrint = it.az0 + azOff
      const az = azPrint + wrapPi(a - azPrint) * glide
      const r = lerp(R * 1.004, Math.hypot(slot.x, slot.z), out)
      target.set(r * Math.sin(az), lerp(it.y0, slot.y, glide), r * Math.cos(az))
      // Slot -> above the cap: an arc up and in.
      if (s > 0) {
        target.x *= 1 - s
        target.z *= 1 - s
        target.y = lerp(target.y, hoverY, s) + Math.sin(s * Math.PI) * 0.15 * H
      }
      target.y += bob
      // Damped spring toward the target (semi-implicit Euler, <= 16 ms steps: stable).
      const pos = it.holder.position
      if (it.fresh) { pos.copy(target); it.vel.set(0, 0, 0); it.fresh = false }
      const w = cfg.springHz * TAU
      for (let left = dt / 1000; left > 1e-6; left -= 0.016) {
        const h = Math.min(left, 0.016)
        acc.subVectors(target, pos).multiplyScalar(w * w).addScaledVector(it.vel, -2 * cfg.springDamping * w)
        it.vel.addScaledVector(acc, h)
        pos.addScaledVector(it.vel, h)
      }

      // Facing: outward on the label, then the viewer.
      const toCam = Math.atan2(cam.x - it.holder.position.x, cam.z - it.holder.position.z)
      it.holder.rotation.y = az + wrapPi(toCam - az) * Math.max(p, s)

      const scale = lerp(lerp(1, cfg.topScale, p) * depthK, cfg.hoverScale, s)
      const depth = lerp(0.02, cfg.depthMm, Math.max(p, s)) * u
      it.rim.scale.set(1, 1, Math.max(depth, 1e-4))
      it.front.position.z = depth / 2
      it.back.position.z = -depth / 2
      it.coin.visible = !it.hasModel
      it.coin.scale.setScalar(scale)
      it.coin.position.y = s * built.radius * scale // a coin also sits ON the hover point
      it.hit.scale.setScalar(scale)
      it.faceMat.color.copy(faceColor)
      if (it.model) {
        it.model.visible = true
        // Grows out of its print over the first 60% of the flight (and shrinks back in).
        const grow = backOut(clamp01(Math.max(p, s) / 0.6)) * scale * cfg.modelScale
        it.grow.scale.setScalar(grow + 1e-4)
        it.model.position.y = s * it.modelHalf * grow // hovering: its base on the hover point
        // Born spinning fast, slowing to its orbit spin as it settles.
        it.yaw = wrapPi(it.yaw + ((cfg.modelSpin * TAU) / 1000) * dt * (1 + 3 * (1 - p) ** 2))
        it.model.rotation.y = it.yaw
        // Materializes bottom -> top during the flight (hologram -> solid); exit reverses it.
        it.holo.uReveal.value = Math.max(clamp01((p - 0.25) / 0.7), s)
        it.holo.uRim.value = cfg.rimGlow
        it.holo.uLines.value = cfg.holoLines
        liveColor(it.holo.uGlow.value, cfg.glowColor)
      }

      // Panel: unfolds from its centre line once the model is on its way up.
      if (it.panel.visible) {
        const b = easeOut(clamp01((it.s - 0.35) / 0.65))
        it.panel.material.opacity = b * cfg.panelOpacity
        it.panel.scale.set(1, lerp(0.05, 1, b), 1)
      }
    }
  }

  return {
    root, build, update,
    restartEntrance: () => { lastMs = null; t = 0; leaving = false; selected = null },
    exit: () => { leaving = true },
    isExited: () => !built || (leaving && t <= 0 && built.items.every(it => it.p <= 0 && it.s <= 0)),
    getPickables: () => (built
      ? [...built.items.filter(it => it.pe > 0.5 || it.s > 0.5).map(it => it.hit), ...built.items.filter(it => it.s > 0.5).map(it => it.panel)]
      : []),
    setUserSpeed: v => { speed = v },
    // Horizontal swipe on the camera view (bottleScene): `dx` = finger move, x screen width.
    // Finger right = the front items move right.
    drag: (dx) => {
      const now = performance.now()
      const da = dx * cfg.dragTurns * TAU
      turn += da
      if (dragging) dragVel = lerp(dragVel, da / Math.max(now - dragAt, 1), 0.5)
      else dragVel = 0
      dragging = true
      dragAt = now
    },
    release: () => {
      if (!dragging) return
      dragging = false
      // Held still before lifting = no flick.
      const v = performance.now() - dragAt > 120 ? 0 : dragVel
      const max = (cfg.flickMaxTurns * TAU) / 1000
      spin = Math.min(Math.max(v, -max), max)
      if (Math.abs(v) > (cfg.speed * TAU) / 1000) dir = Math.sign(v)
    },
  }
}
