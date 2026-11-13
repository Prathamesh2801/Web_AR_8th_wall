/**
 * photoBurst.js — Elements style "Photo Burst": the brand's real event photos, as polaroids.
 *
 *   Entry   one by one each print shoots up out of the cap (lime cap flash, a soft shutter
 *           click + haptic) and springs into its place in a fan BEHIND the bottle, like a
 *           peacock tail / a hand of cards; the picture "develops" in flight, blank cream
 *           -> warm -> full colour, like an instant photo
 *   Fan     turned to face the viewer from any side (so it stays behind the bottle); cards
 *           tilt along the arc, float and sway a little. Swipe left/right slides the photos
 *           along the arc (wraps round, so more photos than slots works), a flick coasts and
 *           settles onto a slot; no auto-slide: the fan is calm
 *   Tap     the print flies to the front of the bottle, faces the camera, grows, caption
 *           readable on its white strip; the others dim. Tap it again = back; another = swap
 *   Exit    reverse: prints un-develop and drop back into the cap, last one first
 *
 * Photos + captions are brand content (cfg.photos: [{file, caption}], files preloaded by
 * assets.js). Cards are unlit art, brightness follows the room (cameraLight.js); they are
 * opaque, so only the shadows and the flash need a renderOrder. update() allocates nothing.
 */
import * as THREE from 'three'

import {PRODUCT, brandFile} from '../config'
import {haptic, playSound} from '../sound'
import {cameraLight} from './cameraLight'
import {liveColor} from './liveColor'
import {RenderOrder} from './renderOrder'
import {makeGlow} from './typography'

const TAU = Math.PI * 2
const DEG = Math.PI / 180
const clamp01 = t => Math.min(Math.max(t, 0), 1)
const easeInOut = t => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2)
const backOut = t => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2
const lerp = (a, b, t) => a + (b - a) * t
const wrapN = (k, n) => ((((k + n / 2) % n) + n) % n) - n / 2 // into [-n/2, n/2)

// A polaroid, mm: a SQUARE photo (event shots are landscape: 4:5 cut off two thirds),
// a thin border, the thick caption strip at the bottom.
const P = {photoW: 32, photoH: 32, side: 3, top: 3, strip: 10}
const CARD_W = P.photoW + 2 * P.side
const CARD_H = P.photoH + P.top + P.strip
// The photo's rectangle in UV (0,0 = bottom left), for the develop shader.
const PHOTO_UV = [P.side / CARD_W, P.strip / CARD_H, (P.side + P.photoW) / CARD_W, (P.strip + P.photoH) / CARD_H]
const HAND = '"Segoe Print", "Bradley Hand", "Marker Felt", "Comic Sans MS", cursive'

/** The card's art: paper, the photo (cover-fit, drawn in once loaded), the caption. */
const makeCard = (url, caption, paper) => {
  const W = 512
  const H = Math.round((W * CARD_H) / CARD_W)
  const k = W / CARD_W
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  const px = P.side * k, py = P.top * k, pw = P.photoW * k, ph = P.photoH * k
  const paint = (img) => {
    ctx.fillStyle = paper
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#d9d3c3'
    ctx.fillRect(px, py, pw, ph)
    if (img) {
      const s = Math.max(pw / img.width, ph / img.height) // cover
      const sw = pw / s, sh = ph / s
      ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, px, py, pw, ph)
    }
    if (caption) {
      let size = Math.round(P.strip * k * 0.5)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      for (; size > 10; size -= 2) {
        ctx.font = `600 ${size}px ${HAND}`
        if (ctx.measureText(caption).width <= W - 2 * px) break
      }
      ctx.fillStyle = '#23302a'
      ctx.fillText(caption, W / 2, py + ph + (H - py - ph) / 2)
    }
    tex.needsUpdate = true
  }
  paint(null)
  new THREE.ImageLoader().load(url, paint, undefined, err => console.warn('[AR] photo failed', url, err))
  return tex
}

/** Photo area: blank cream -> warm -> full colour as uDev goes 0 -> 1. */
const patchDevelop = (mat, shared) => {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, shared)
    sh.vertexShader = 'varying vec2 vCardUv;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n  vCardUv = uv;')
    sh.fragmentShader = 'uniform float uDev;\nuniform vec4 uRect;\nvarying vec2 vCardUv;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
  if (vCardUv.x > uRect.x && vCardUv.y > uRect.y && vCardUv.x < uRect.z && vCardUv.y < uRect.w) {
    vec3 blank = diffuse * vec3(0.85, 0.83, 0.77);
    vec3 warm = diffuseColor.rgb * mix(vec3(1.15, 0.95, 0.7), vec3(1.0), smoothstep(0.5, 1.0, uDev));
    diffuseColor.rgb = mix(blank, warm, smoothstep(0.0, 0.75, uDev));
  }`)
  }
}

/** Soft dark rectangle behind a card: the shadow that sells its depth off the bottle. */
const makeShadowTex = () => {
  const S = 128
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')
  ctx.filter = 'blur(14px)'
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(30, 30, S - 60, S - 60)
  return new THREE.CanvasTexture(c)
}

export const createPhotoBurst = (cfg) => {
  const root = new THREE.Group()
  root.name = 'photoBurst'
  let built = null
  let lastMs = null
  let speed = 1
  let t = 0 // entrance clock, ms; runs back on exit
  let leaving = false
  let selected = null
  // Swipe: `slide` = how many slots the photos moved along the arc.
  let slide = 0
  let slideVel = 0 // slots/ms
  let dragging = false
  let dragAt = 0
  let lastClickMs = -1e9
  const cam = new THREE.Vector3()
  const cap = new THREE.Vector3()
  const target = new THREE.Vector3()
  const acc = new THREE.Vector3()
  const focusPt = new THREE.Vector3()
  const lightColor = new THREE.Color()
  const dimColor = new THREE.Color()
  const paper = new THREE.Color(cfg.paperColor)

  const select = (it) => {
    if (leaving) return
    haptic(12)
    selected = selected === it ? null : it
  }

  const build = ({radiusTop, radiusBottom, height: H}) => {
    if (built) return true
    const R = (radiusTop + radiusBottom) / 2
    if (!(R > 0) || !(H > 0) || !cfg.photos?.length) return false
    const u = H / PRODUCT.mm.labelHeight
    const yTop = PRODUCT.profile.at(-1)[0] * H
    const w = CARD_W * u
    const h = CARD_H * u

    // A slightly bent print (paper never lies dead flat): z dips toward the sides.
    const geo = new THREE.PlaneGeometry(w, h, 12, 1)
    const pos = geo.attributes.position
    for (let i = 0; i < pos.count; i++) pos.setZ(i, -0.06 * w * (pos.getX(i) / (w / 2)) ** 2)
    pos.needsUpdate = true
    const shadowGeo = new THREE.PlaneGeometry(w * 1.25, h * 1.2)
    const shadowTex = makeShadowTex()

    const flash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlow(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
    }))
    flash.renderOrder = RenderOrder.PHOTO_FLASH
    flash.position.y = yTop
    root.add(flash)

    const items = cfg.photos.map((ph, i) => {
      const dev = {uDev: {value: 0}, uRect: {value: new THREE.Vector4(...PHOTO_UV)}}
      const mat = new THREE.MeshBasicMaterial({map: makeCard(brandFile(ph.file), ph.caption ?? '', cfg.paperColor)})
      patchDevelop(mat, dev)
      const front = new THREE.Mesh(geo, mat)
      const backMat = new THREE.MeshBasicMaterial({color: cfg.paperColor})
      const back = new THREE.Mesh(geo, backMat)
      back.rotation.y = Math.PI
      const shadow = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({
        map: shadowTex, transparent: true, opacity: 0, depthWrite: false,
      }))
      shadow.renderOrder = RenderOrder.PHOTO_SHADOW
      shadow.position.set(w * 0.06, -h * 0.05, -0.08 * w)
      const card = new THREE.Group()
      card.rotation.order = 'YXZ'
      card.add(front, back, shadow)
      root.add(card)
      const entry = {
        card, front, mat, backMat, shadow, dev,
        delay: cfg.leadMs + i * cfg.staggerMs,
        p: 0, // 0 in the cap .. 1 in the fan (entrance clock)
        s: 0, // 0 in the fan .. 1 in front of the bottle
        vis: 1, // 0 at the fan's wrap seam
        vel: new THREE.Vector3(),
        fresh: true,
        born: false, // its click has played
        lastK: 0, // its fan position last frame (wrap-seam jump)
      }
      front.userData.pick = () => select(entry)
      return entry
    })
    built = {R, H, u, yTop, items, flash}
    return true
  }

  const update = (timeMs, camera) => {
    if (!built) return
    const dt = lastMs === null ? 0 : Math.min(timeMs - lastMs, 100) * speed
    lastMs = timeMs
    const {R, H, u, yTop, items, flash} = built
    const n = items.length
    const tEnd = cfg.leadMs + (n - 1) * cfg.staggerMs + cfg.flyMs + cfg.developMs
    if (leaving) selected = null
    let busy = false
    for (const it of items) if (it.s > 0.001) busy = true
    t = leaving ? (busy ? t : Math.max(t - dt * cfg.exitSpeed, 0)) : Math.min(t + dt, tEnd)

    let camAz = 0
    if (camera) {
      root.worldToLocal(cam.copy(camera.position))
      camAz = Math.atan2(cam.x, cam.z)
    }
    const sinA = Math.sin(camAz)
    const cosA = Math.cos(camAz)
    cap.set(0, yTop, 0)

    // Swipe coast, then settle onto a whole slot.
    if (!dragging) {
      slide += slideVel * dt
      slideVel *= Math.exp(-dt / cfg.flickEaseMs)
      if (Math.abs(slideVel) < 0.0005) slide += (Math.round(slide) - slide) * (1 - Math.exp(-dt / 220))
    }
    if (Math.abs(slide) > 1e4) slide %= n

    // Fan geometry, in the viewer-facing frame (x right, z toward the viewer).
    const m = Math.min(n, cfg.fanSlots)
    const step = m > 1 ? (cfg.fanDeg * DEG) / (m - 1) : 0
    const fanR = cfg.fanRadius * H
    const fanY = cfg.fanY * H
    const fanZ = -cfg.fanBack * R

    // Room light on the unlit cards; the others dim while one is in front.
    const L = cameraLight.ready ? cameraLight.luma : 0.18
    lightColor.setScalar(Math.min(1, Math.max(0.5, Math.sqrt(L / 0.18) * cfg.brightness)))
    let focus = 0
    for (const it of items) focus = Math.max(focus, easeInOut(it.s))
    dimColor.copy(lightColor).multiplyScalar(lerp(1, cfg.dimOthers, focus))

    let flashK = 0
    for (let i = 0; i < n; i++) {
      const it = items[i]
      const age = t - it.delay
      it.p = clamp01(age / cfg.flyMs)
      it.s = clamp01(it.s + ((it === selected ? 1 : -1) * dt) / cfg.selectMs)
      const p = it.p
      const s = easeInOut(it.s)
      const visible = p > 0 || s > 0
      it.card.visible = visible
      if (!visible) { it.fresh = true; it.born = false; continue }

      // Birth: shutter click + haptic (spaced out: a quick burst is one click), cap flash.
      if (!it.born && !leaving) {
        it.born = true
        if (timeMs - lastClickMs > cfg.clickGapMs) {
          playSound('snap', cfg.clickVolume)
          haptic(8)
          lastClickMs = timeMs
        }
      }
      flashK = Math.max(flashK, Math.exp(-Math.max(age, 0) / 180) * (leaving ? 0 : 1))

      // Its place in the fan: k slots from the middle, wrapping round the seam.
      // Rest on whole slots: centred when all fit, else on integer slots (m of them show).
      const k = wrapN(i - (n <= m ? (n - 1) / 2 : Math.floor(n / 2)) - slide, n)
      it.vis = clamp01((m / 2 - Math.abs(k)) / 0.5)
      const th = k * step
      const bob = Math.sin((timeMs / 1000) * TAU * cfg.floatHz + i * 1.7) * cfg.floatMm * u
      const fx = Math.sin(th) * fanR
      const fy = fanY + Math.cos(th) * fanR + bob
      // Viewer frame -> bottle frame (turn by camAz about the axis).
      // Middle cards a hair nearer the viewer: overlapping prints never z-fight.
      const fz = fanZ + (m / 2 - Math.abs(k)) * 0.04 * R
      target.set(fx * cosA + fz * sinA, fy, -fx * sinA + fz * cosA)
      target.lerp(cap, 1 - easeInOut(p)) // in the cap until it flies (and back on exit)

      // Tap: in front of the bottle at the logo, toward the camera.
      if (s > 0) {
        const d = R * cfg.focusGap
        target.lerp(focusPt.set(sinA * d, cfg.focusY * H, cosA * d), s)
      }

      // Spring after the target: shot up out of the cap, a soft overshoot into place.
      const pos = it.card.position
      if (it.fresh) {
        pos.copy(cap)
        it.vel.set(0, cfg.launch * H, 0) // per s: straight up out of the cap
        it.fresh = false
      }
      // Crossed the fan's wrap seam (invisible there): jump, don't fly across the fan.
      if (Math.abs(k - it.lastK) > n / 2) { pos.copy(target); it.vel.set(0, 0, 0) }
      it.lastK = k
      const wv = cfg.springHz * TAU
      for (let left = dt / 1000; left > 1e-6; left -= 0.016) {
        const hs = Math.min(left, 0.016)
        acc.subVectors(target, pos).multiplyScalar(wv * wv).addScaledVector(it.vel, -2 * cfg.springDamping * wv)
        it.vel.addScaledVector(acc, hs)
        pos.addScaledVector(it.vel, hs)
      }

      // Facing: the viewer; tilted along the arc like a hand of cards (flat in front).
      it.card.rotation.y = Math.atan2(cam.x - pos.x, cam.z - pos.z)
      it.card.rotation.x = -Math.atan2(cam.y - pos.y, Math.hypot(cam.x - pos.x, cam.z - pos.z)) * s
      const sway = Math.sin((timeMs / 1000) * TAU * cfg.floatHz * 0.7 + i) * cfg.swayDeg * DEG
      it.card.rotation.z = (-th * cfg.fanTilt + sway) * (1 - s) + (1 - easeInOut(p)) * 0.6 * (i % 2 ? 1 : -1)

      const grow = backOut(clamp01(p / 0.7)) * lerp(it.vis, 1, s)
      it.card.scale.setScalar(Math.max(lerp(1, cfg.focusScale, s) * grow, 1e-4))
      it.dev.uDev.value = clamp01((age - cfg.flyMs * 0.3) / cfg.developMs)
      it.mat.color.copy(it === selected || it.s > 0 ? lightColor : dimColor)
      it.backMat.color.copy(paper).multiply(it.mat.color)
      it.shadow.material.opacity = 0.5 * grow * (1 - s * 0.5)
    }

    flash.material.opacity = flashK * cfg.flash
    flash.scale.setScalar(lerp(0.6, 1.2, flashK) * R * 3)
    liveColor(flash.material.color, cfg.glowColor)
  }

  return {
    root, build, update,
    restartEntrance: () => { lastMs = null; t = 0; leaving = false; selected = null; slideVel = 0 },
    exit: () => { leaving = true },
    isExited: () => !built || (leaving && t <= 0 && built.items.every(it => it.p <= 0 && it.s <= 0)),
    getPickables: () => (built ? built.items.filter(it => (it.p > 0.5 && it.vis > 0.5) || it.s > 0.5).map(it => it.front) : []),
    setUserSpeed: v => { speed = v },
    // Horizontal swipe (bottleScene): dx = finger move, x screen width. Finger right = right.
    drag: (dx) => {
      const now = performance.now()
      const ds = -dx * cfg.dragSlots
      slide += ds
      slideVel = dragging ? lerp(slideVel, ds / Math.max(now - dragAt, 1), 0.5) : 0
      dragging = true
      dragAt = now
    },
    release: () => {
      if (!dragging) return
      dragging = false
      if (performance.now() - dragAt > 120) slideVel = 0 // held still = no flick
      slideVel = Math.min(Math.max(slideVel, -cfg.flickMax / 1000), cfg.flickMax / 1000)
    },
  }
}
