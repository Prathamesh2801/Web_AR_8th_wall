/**
 * typography.js — animation A01 "3D Typography": the printed GINSENG comes to life.
 *
 *   Recognise  0.15-0.7s  a gold shimmer sweeps across the printed letters, left to right
 *   Lift       0.55-2.0s  letter by letter (staggered) the flat copy peels off the label,
 *                         extrudes into 3D and grows, keeping the word's curve round the
 *                         bottle; it rises to the label's centre line
 *   Revolve    1.6s ->    the word eases into a slow orbit round the bottle, forever,
 *                         with a gentle wave running through the letters
 *
 * The flat start sits exactly on the print: PRINT is GINSENG's bounding box in the label
 * source (brand-assets/label, 4064 x 1229 px), mapped onto the tracked label cylinder,
 * with the letters stretched (sx0) to the printed letter-spacing; that stretch relaxes
 * to the real font as they lift.
 *
 * Shading is a procedural matcap: view-dependent highlights with no scene lights, so
 * nothing else in the scene changes. Letters are opaque (no transparency sorting) and
 * keep depthTest, so the occlusion proxy hides them behind the bottle.
 */
import * as THREE from 'three'
import {FontLoader} from 'three/examples/jsm/loaders/FontLoader.js'
import {TextGeometry} from 'three/examples/jsm/geometries/TextGeometry.js'

import {PRODUCT} from '../config'

const FONT_URL = '/fonts/montserrat-800.typeface.json' // Montserrat ExtraBold, A-Z only
const WORD = 'GINSENG'
const PRINT = {x0: 1668, x1: 2223, y0: 877, y1: 979, w: 4064, h: 1229}
const CAP = 0.7 // Montserrat cap height, em

const T = {shimmerAt: 0.15, shimmerStep: 0.06, shimmerWidth: 0.18,
  liftAt: 0.55, stagger: 0.07, lift: 1.1, spinAt: 1.6, spinRamp: 2.5}

const clamp01 = t => Math.min(Math.max(t, 0), 1)
const lerp = (a, b, t) => a + (b - a) * t
const phase = (e, at, dur) => clamp01((e - at) / dur)
const easeInOutCubic = t => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2)
const easeOutCubic = t => 1 - (1 - t) ** 3
const smoothstep = t => t * t * (3 - 2 * t)
const TAU = Math.PI * 2

/** Greyscale studio-sphere matcap: key highlight top-left, dark rim. Tinted per material. */
const makeMatcap = () => {
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

export const createTypography = (cfg) => {
  const root = new THREE.Group()
  let font = null
  fetch(FONT_URL).then(r => r.json()).then(j => { font = new FontLoader().parse(j) })
    .catch(err => console.warn('[AR] typography font failed to load', err))

  const face = new THREE.Color(cfg.faceColor)
  const shine = new THREE.Color(cfg.shimmerColor)

  let s = null      // built state
  let e = 0         // timeline, seconds (speed-scaled)
  let lastMs = null
  let speed = 1
  let orbit = 0

  const build = ({radiusTop, radiusBottom, height: H}) => {
    const R = (radiusTop + radiusBottom) / 2
    if (s) return true
    if (!font || !(R > 0) || !(H > 0)) return false

    const {mm} = PRODUCT
    const {resolution: res, glyphs} = font.data
    const matcap = makeMatcap()
    const sideMat = new THREE.MeshMatcapMaterial({matcap, color: cfg.sideColor})

    // Letter centres along the word, in em, relative to the ink's midpoint.
    let pen = 0
    const centres = [...WORD].map((ch) => {
      const c = pen + (glyphs[ch].x_min + glyphs[ch].x_max) / 2 / res
      pen += glyphs[ch].ha / res
      return c
    })
    const last = glyphs[WORD.at(-1)]
    const inkL = glyphs[WORD[0]].x_min / res
    const inkR = pen - last.ha / res + last.x_max / res

    const geos = {}
    const letters = [...WORD].map((ch, i) => {
      if (!geos[ch]) {
        const g = new TextGeometry(ch, {
          font, size: 1, depth: 0.3, curveSegments: 6,
          bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.03, bevelSegments: 3,
        })
        g.computeBoundingBox()
        const b = g.boundingBox
        g.translate(-(b.min.x + b.max.x) / 2, -CAP / 2, -(b.min.z + b.max.z) / 2)
        geos[ch] = g
      }
      // Own face material per letter, so the shimmer can sweep across them.
      // TextGeometry groups: 0 = front/back faces, 1 = sides + bevel.
      const faceMat = new THREE.MeshMatcapMaterial({matcap, color: face})
      const mesh = new THREE.Mesh(geos[ch], [faceMat, sideMat])
      root.add(mesh)
      return {mesh, faceMat, offset: centres[i] - (inkL + inkR) / 2}
    })

    // The printed headline, on the label cylinder.
    const labelArc = mm.labelWidth * (H / mm.labelHeight)
    const s0 = ((PRINT.y1 - PRINT.y0) / PRINT.h) * H / CAP
    const span = (mm.labelWidth / mm.circumference) * TAU
    s = {
      R, H, letters, s0,
      sx0: (((PRINT.x1 - PRINT.x0) / PRINT.w) * labelArc) / ((inkR - inkL) * s0),
      az0: ((PRINT.x0 + PRINT.x1) / 2 / PRINT.w - 0.5) * span + cfg.printAzimuthDeg * Math.PI / 180,
      y0: (0.5 - (PRINT.y0 + PRINT.y1) / 2 / PRINT.h) * H,
    }
    return true
  }

  const update = (timeMs) => {
    if (!s) return
    const dt = lastMs === null ? 0 : Math.min(timeMs - lastMs, 100) / 1000 * speed
    lastMs = timeMs
    e += dt
    const {R, H} = s

    orbit += cfg.revolveSpeed * TAU * smoothstep(phase(e, T.spinAt, T.spinRamp)) * dt
    const wave = phase(e, T.spinAt, 1.5)
    const big = cfg.letterHeight * H / CAP

    s.letters.forEach(({mesh, faceMat, offset}, i) => {
      // Recognise: a narrow band of gold passes over each letter in turn.
      const sh = 1 - Math.abs(e - (T.shimmerAt + i * T.shimmerStep)) / T.shimmerWidth
      faceMat.color.lerpColors(face, shine, clamp01(sh))

      // Lift: per-letter progress, staggered left to right.
      const p = easeInOutCubic(phase(e, T.liftAt + i * T.stagger, T.lift))
      const scale = lerp(s.s0, big, p)
      const sx = lerp(s.sx0, 1, p)
      const r = lerp(R * 1.004, R * cfg.radius, p)
      const y = lerp(s.y0, cfg.height * H, p) + Math.sin(e * 1.4 - i * 0.6) * 0.012 * H * wave
      // Arc length -> angle at this radius, so the word keeps its spacing as it grows.
      const angle = s.az0 + orbit + (offset * scale * sx) / r

      mesh.position.set(r * Math.sin(angle), y, r * Math.cos(angle))
      mesh.rotation.y = angle // +z faces outward, the word reads along the orbit
      mesh.scale.set(scale * sx, scale, scale * lerp(0.02, 1, easeOutCubic(p)))
    })
  }

  const restartEntrance = () => {
    e = 0
    orbit = 0
    lastMs = null
  }

  return {
    root, build, update, restartEntrance,
    setUserSpeed: v => { speed = v },
    getDebugInfo: () => ({typeTime: +e.toFixed(1)}),
  }
}
