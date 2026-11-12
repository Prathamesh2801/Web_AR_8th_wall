/**
 * typography.js — animation A01 "3D Typography": printed words come to life.
 *
 * Each word in config `words` (from the brand file, e.g. supradyn + ginseng) runs its own timeline:
 *   Recognise  a shimmer sweeps across the printed letters
 *   Lift       letter by letter the flat copy peels off the label, extrudes into 3D
 *              and grows, keeping its curve round the bottle; a gold glow wakes behind it
 *   Revolve    eases up to `speed` (rev/s) in `direction`, for `rounds` turns, then
 *              BRAKES to land on a whole turn, so the word stops exactly over its print
 *   Exit       the entrance in reverse: letters settle back into the print, last
 *              letter first, a closing shimmer, gone (`loop` replays after `loopPause`)
 *
 * Start on the print: each word's `print` holds its box in the brand's flat label
 * (PRODUCT.label.px; x0-x1 and cap top -> baseline, in source px), mapped onto the
 * tracked label cylinder, letters stretched (sx0) to the printed spacing and slanted
 * like the print; the stretch relaxes to the real font as they lift.
 *
 * Every knob is read live (the dashboard edits config in place); direction and the
 * landing turn are captured per play, so a mid-flight edit can never miss the print.
 * Letters are opaque matcap (no lights, no transparency sorting) with depthTest, so
 * the occlusion proxy hides them behind the bottle. `update` allocates nothing.
 */
import * as THREE from 'three'
import {FontLoader} from 'three/examples/jsm/loaders/FontLoader.js'
import {TextGeometry} from 'three/examples/jsm/geometries/TextGeometry.js'

import {PRODUCT} from '../config'
import {liveColor} from './liveColor'
import {RenderOrder} from './renderOrder'

const FONT_URL = '/fonts/montserrat-800.typeface.json' // Montserrat ExtraBold, A-Z a-z
const CAP = 0.7 // Montserrat cap height, em

// Seconds, from a word's own start.
const T = {shimmerAt: 0.15, shimmerStep: 0.06, shimmerWidth: 0.18,
  liftAt: 0.55, stagger: 0.07, lift: 1.1, spinAt: 1.6, ramp: 2.0}

const clamp01 = t => Math.min(Math.max(t, 0), 1)
const lerp = (a, b, t) => a + (b - a) * t
const phase = (e, at, dur) => clamp01((e - at) / dur)
const easeInOutCubic = t => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2)
const easeOutCubic = t => 1 - (1 - t) ** 3
const smoothstep = t => t * t * (3 - 2 * t)
const band = (t, centre) => clamp01(1 - Math.abs(t - centre) / T.shimmerWidth)
const TAU = Math.PI * 2

/** Greyscale studio-sphere matcap: key highlight top-left, dark rim. Tinted per material. */
export const makeMatcap = () => {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(96, 80, 4, 128, 128, 128)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(0.3, '#f4f4f4')
  g.addColorStop(0.7, '#c4c4c4')
  g.addColorStop(0.92, '#6a6a6a')
  g.addColorStop(1, '#3a3a3a')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 256)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** Soft round glow, tinted per sprite. */
export const makeGlow = () => {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(c)
}

export const createTypography = (cfg) => {
  const root = new THREE.Group()
  let font = null
  fetch(FONT_URL).then(r => r.json()).then(j => { font = new FontLoader().parse(j) })
    .catch(err => console.warn('[AR] typography font failed to load', err))

  let built = null
  let speed = 1
  let lastMs = null
  const shine = new THREE.Color()

  /** One word: geometry, its print mapping, and its own timeline state. */
  const buildWord = (key, R, H, matcap, glowTex) => {
    const art = cfg.words[key].print
    const LABEL_PX = PRODUCT.label.px
    const {resolution: res, glyphs} = font.data
    const {mm} = PRODUCT
    const chars = [...art.text]

    let pen = 0
    const centres = chars.map((ch) => {
      const c = pen + (glyphs[ch].x_min + glyphs[ch].x_max) / 2 / res
      pen += glyphs[ch].ha / res
      return c
    })
    const last = glyphs[chars.at(-1)]
    const inkL = glyphs[chars[0]].x_min / res
    const inkR = pen - last.ha / res + last.x_max / res

    const shear = Math.tan(((cfg.words[key].slantDeg ?? 0) * Math.PI) / 180)
    const sideMat = new THREE.MeshMatcapMaterial({matcap})
    const geos = {}
    const letters = chars.map((ch, i) => {
      if (!geos[ch]) {
        const g = new TextGeometry(ch, {
          font, size: 1, depth: 0.3, curveSegments: 6,
          bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.03, bevelSegments: 3,
        })
        g.computeBoundingBox()
        const b = g.boundingBox
        // Baseline-relative (descenders hang below), centred on the cap band.
        g.translate(-(b.min.x + b.max.x) / 2, -CAP / 2, -(b.min.z + b.max.z) / 2)
        if (shear) g.applyMatrix4(new THREE.Matrix4().makeShear(0, 0, shear, 0, 0, 0))
        geos[ch] = g
      }
      // TextGeometry groups: 0 = front/back faces (own material: the shimmer sweeps
      // letter by letter), 1 = sides + bevel.
      const faceMat = new THREE.MeshMatcapMaterial({matcap})
      const mesh = new THREE.Mesh(geos[ch], [faceMat, sideMat])
      mesh.visible = false
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, transparent: true, opacity: 0, depthWrite: false,
        blending: THREE.AdditiveBlending,
      }))
      glow.renderOrder = RenderOrder.TYPE_GLOW
      root.add(glow, mesh)
      return {mesh, faceMat, glow, offset: centres[i] - (inkL + inkR) / 2}
    })

    const labelArc = mm.labelWidth * (H / mm.labelHeight)
    const s0 = ((art.base - art.top) / LABEL_PX.h) * H / CAP
    const span = (mm.labelWidth / mm.circumference) * TAU
    return {
      key, letters, sideMat, s0, face: new THREE.Color(),
      sx0: (((art.x1 - art.x0) / LABEL_PX.w) * labelArc) / ((inkR - inkL) * s0),
      u: ((art.x0 + art.x1) / 2 / LABEL_PX.w - 0.5) * span,
      y0: (0.5 - (art.top + art.base) / 2 / LABEL_PX.h) * H,
      // timeline
      t: 0, state: 'in', travel: 0, v: 0, dir: 1, target: 0, brake: null, te: 0, pause: 0,
    }
  }

  const restartWord = (w) => {
    const c = cfg.words[w.key]
    w.t = 0
    w.state = 'in'
    w.travel = 0
    w.v = 0
    w.te = 0
    w.pause = 0
    w.brake = null
    w.dir = c.direction < 0 ? -1 : 1
  }

  const build = ({radiusTop, radiusBottom, height: H}) => {
    const R = (radiusTop + radiusBottom) / 2
    if (built) return true
    if (!font || !(R > 0) || !(H > 0)) return false
    const matcap = makeMatcap()
    const glowTex = makeGlow()
    const words = Object.keys(cfg.words).filter(k => cfg.words[k].print).map(k => buildWord(k, R, H, matcap, glowTex))
    words.forEach(restartWord)
    built = {R, H, words}
    return true
  }

  /** Advances one word's timeline and poses its letters. */
  const stepWord = (w, dt) => {
    const c = cfg.words[w.key]
    const {R, H} = built
    const n = w.letters.length
    const outEnd = (n - 1) * T.stagger + T.lift                        // last letter landed
    const gone = outEnd + (n - 1) * T.shimmerStep + T.shimmerWidth     // closing shimmer done

    w.t += dt
    const t = w.t - (c.delay ?? 0)
    let visible = c.show && t >= 0

    // --- revolve: ease up, cruise at the live speed, brake onto a whole turn ---------
    if (w.state === 'in' && t >= T.spinAt) w.state = 'spin'
    if (w.state === 'spin') {
      w.v = c.speed * TAU * smoothstep(phase(t, T.spinAt, T.ramp))
      const target = Math.max(Math.round(c.rounds), Math.ceil(w.travel / TAU)) * TAU
      const remaining = target - w.travel
      if (t > T.spinAt + 0.2 && remaining <= (w.v * T.ramp) / 2) {
        // Velocity v0 * (1 - smoothstep(u)) over tb covers v0 * tb / 2: pick tb so it
        // covers exactly `remaining`, landing on the print with zero velocity.
        const v0 = Math.max(w.v, 1e-3)
        w.brake = {from: w.travel, v0, tb: Math.max((2 * remaining) / v0, 0.3), tau: 0}
        w.target = target
        w.state = 'brake'
      } else {
        w.travel += w.v * dt
      }
    }
    if (w.state === 'brake') {
      const b = w.brake
      b.tau += dt
      const u = clamp01(b.tau / b.tb)
      w.travel = Math.min(b.from + b.v0 * b.tb * (u - u ** 3 + u ** 4 / 2), w.target)
      if (u >= 1) {
        w.travel = w.target
        w.state = 'out'
      }
    }
    if (w.state === 'out') {
      w.te += dt
      if (w.te > gone) w.state = 'done'
    }
    if (w.state === 'done') {
      visible = false
      w.pause += dt
      if (c.loop && w.pause >= c.loopPause) {
        restartWord(w)
        w.t = c.delay ?? 0 // replay at once, not after the delay again
      }
    }

    const orbit = w.dir * w.travel
    const big = c.letterHeight * H / CAP
    const az = w.u + ((cfg.printAzimuthDeg ?? 0) * Math.PI) / 180
    liveColor(w.sideMat.color, c.sideColor)
    liveColor(w.face, c.faceColor)
    liveColor(shine, cfg.shimmerColor)

    for (let i = 0; i < n; i++) {
      const {mesh, faceMat, glow, offset} = w.letters[i]
      mesh.visible = visible
      glow.visible = visible
      if (!visible) continue

      const j = n - 1 - i // exit runs right to left: the film played backwards
      const pIn = easeInOutCubic(phase(t, T.liftAt + i * T.stagger, T.lift))
      const pOut = w.state === 'out' ? easeInOutCubic(phase(w.te, j * T.stagger, T.lift)) : 0
      const p = pIn * (1 - pOut)

      // Recognise / farewell: a band of light passes over each letter in turn.
      const sh = Math.max(band(t, T.shimmerAt + i * T.shimmerStep),
        w.state === 'out' ? band(w.te, outEnd + j * T.shimmerStep) : 0)
      faceMat.color.copy(w.face).lerp(shine, sh)

      const scale = lerp(w.s0, big, p)
      const sx = lerp(w.sx0, 1, p)
      const r = lerp(R * 1.004, R * c.radius, p)
      const wave = phase(t, T.spinAt, 1.5) * (1 - pOut)
      const y = lerp(w.y0, c.height * H, p) + Math.sin(t * 1.4 - i * 0.6) * 0.012 * H * wave
      // Arc length -> angle at this radius, so the word keeps its spacing as it grows.
      const angle = az + orbit + (offset * scale * sx) / r

      mesh.position.set(r * Math.sin(angle), y, r * Math.cos(angle))
      mesh.rotation.y = angle // +z faces outward, the word reads along the orbit
      mesh.scale.set(scale * sx, scale, scale * lerp(0.02, 1, easeOutCubic(p)))

      glow.position.copy(mesh.position)
      glow.scale.setScalar(scale * CAP * 2.6)
      liveColor(glow.material.color, c.glowColor)
      glow.material.opacity = c.glow * p * (0.85 + 0.15 * Math.sin(t * 2 + i))
    }
  }

  const update = (timeMs) => {
    if (!built) return
    const dt = lastMs === null ? 0 : Math.min(timeMs - lastMs, 100) / 1000 * speed
    lastMs = timeMs
    for (const w of built.words) stepWord(w, dt)
  }

  const restartEntrance = () => {
    lastMs = null
    built?.words.forEach(restartWord)
  }

  return {
    root, build, update, restartEntrance,
    setUserSpeed: v => { speed = v },
    getDebugInfo: () => (built
      ? Object.fromEntries(built.words.map(w => [`type.${w.key}`, `${w.state} ${(w.travel / TAU).toFixed(2)} rev`]))
      : null),
  }
}
