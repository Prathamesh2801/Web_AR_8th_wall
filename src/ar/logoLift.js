/**
 * logoLift.js — Typography style "Logo": the brand mark printed on the label comes off it
 * in 3D, glides up over the shoulder and turns on a light-ring above the cap.
 *
 *   Pop     the mark starts flat ON its print (bent to the label's curve, its green),
 *           then thickens into a solid 3D logo and unbends; a faint glow in its colour
 *           comes up. Under it, a patch of label art without the logo fades in, so the
 *           print reads as having LEFT the label (not printed + floating twice)
 *   Rise    a smooth curve out, up past the shoulder, to above the cap, growing a little
 *   Show    a turntable: 360° spin, a gentle hover, tilted toward the viewer; a shine
 *           (lime) sweeps its face each time it faces you (`spinDirection` picks the way); a light-ring pulses on the cap
 *   Tap     sends it home AT ONCE (the exit below; a generous invisible hit area, a haptic
 *           tick), then after `replayAfterTap` up again
 *   Exit    the whole entrance backwards: down, flat, onto its print, patch gone; the spin
 *           comes round to face front on the way down (not before: a tap must act now)
 *
 * Content per brand (config `logoLift`): `mark` = the logo as an SVG (traced outline),
 * `print` = where it is printed on the label (mm, trim coordinates, the SVG's frame =
 * the printed image box), `patch` = the label art under it without the logo (PNG with
 * feathered alpha) and its size. Files from brandFile().
 *
 * The patch (labelPatch.js) is coloured from the camera: the real paper in that spot.
 *
 * The mark is opaque matcap (like typography.js), so it needs no transparency order and
 * the occluder hides it behind the bottle.
 */
import * as THREE from 'three'
import {SVGLoader} from 'three/examples/jsm/loaders/SVGLoader.js'

import {PRODUCT, brandFile} from '../config'
import {createLabelPatch} from './labelPatch'
import {haptic} from '../sound'
import {liveColor} from './liveColor'
import {RenderOrder} from './renderOrder'
import {makeGlow, makeMatcap} from './typography'

const TAU = Math.PI * 2
const clamp01 = t => Math.min(Math.max(t, 0), 1)
const easeInOut = t => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2)
const easeOut = t => 1 - (1 - t) ** 3
const lerp = (a, b, t) => a + (b - a) * t

/** Soft ring for the cap's light pad: bright rim fading inward. */
const makeRing = () => {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128)
  g.addColorStop(0, 'rgba(255,255,255,0.18)')
  g.addColorStop(0.62, 'rgba(255,255,255,0.08)')
  g.addColorStop(0.82, 'rgba(255,255,255,1)')
  g.addColorStop(0.9, 'rgba(255,255,255,0.35)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 256)
  return new THREE.CanvasTexture(c)
}

export const createLogoLift = (cfg) => {
  const root = new THREE.Group()
  root.name = 'logoLift'
  let shapes = null
  const viewBox = {w: 1000, h: 1000}
  fetch(brandFile(cfg.mark)).then(r => r.text())
    .then((svg) => {
      const vb = svg.match(/viewBox="[\d.\s-]*?([\d.]+)\s+([\d.]+)"/)
      if (vb) { viewBox.w = +vb[1]; viewBox.h = +vb[2] }
      // y flipped in the SVG (y down -> up) BEFORE extruding: flipping the geometry
      // afterwards would turn every face inside out.
      shapes = new SVGLoader().parse(svg.replace(/<path /g, '<path transform="scale(1,-1)" '))
        .paths.flatMap(p => p.toShapes(true))
    })
    .catch(err => console.warn('[AR] logo mark failed to load', err))

  let built = null
  let lastMs = null
  let speed = 1
  let t = 0 // entrance clock, ms; runs backwards on exit
  let spin = 0 // turntable angle, rad
  let spinVel = 0 // rad/ms
  let align = null // exit: {from, to, v, T, s} spin brought round to face front
  let leaving = false // the user switched away: home, then done
  let homing = false // tapped: home, rest, rise again
  let restMs = 0 // on the print after a tap
  let ring = 0 // light-ring phase
  const cam = new THREE.Vector3()
  const p = new THREE.Vector3()
  const shine = new THREE.Color()
  const face = new THREE.Color()
  const side = new THREE.Color()

  const build = ({radiusTop, radiusBottom, height: H}) => {
    if (built) return true
    const R = (radiusTop + radiusBottom) / 2
    if (!(R > 0) || !(H > 0) || !shapes) return false
    const {mm, profile} = PRODUCT
    const u = H / mm.labelHeight // engine units per mm
    const {print} = cfg
    const size = print.size * u

    // Where it is printed: angle round the bottle (front = 0, toward +x) and height.
    const span = (mm.labelWidth / mm.circumference) * TAU
    const az = (print.cx / mm.labelWidth - 0.5) * span + (cfg.printAzimuthDeg * Math.PI) / 180
    const y0 = (0.5 - print.cy / mm.labelHeight) * H

    // Geometry in the SVG frame -> unit square (x right, y up), front face at z = depth.
    const depth = cfg.depthMm / print.size // in sizes
    const bevel = depth * 0.12
    const geo = new THREE.ExtrudeGeometry(shapes, {
      depth: depth * 1000, bevelEnabled: true, bevelThickness: bevel * 1000,
      bevelSize: bevel * 600, bevelSegments: 2, curveSegments: 4,
    })
    geo.translate(-viewBox.w / 2, viewBox.h / 2, bevel * 1000)
    geo.scale(1 / viewBox.w, 1 / viewBox.h, 1 / 1000)
    // Morph 0 = the print: paper-thin and bent onto the label's curve (radius R, in
    // sizes). Influence 1 -> 0 = it thickens and unbends in one move.
    const pos = geo.attributes.position
    const bent = new Float32Array(pos.count * 3)
    const Rg = R / size
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i) * 0.03
      const th = x / Rg
      bent[i * 3] = (Rg + z) * Math.sin(th)
      bent[i * 3 + 1] = pos.getY(i)
      bent[i * 3 + 2] = (Rg + z) * Math.cos(th) - Rg
    }
    geo.morphAttributes.position = [new THREE.BufferAttribute(bent, 3)]

    const matcap = makeMatcap()
    const faceMat = new THREE.MeshMatcapMaterial({matcap})
    const sideMat = new THREE.MeshMatcapMaterial({matcap})
    const mark = new THREE.Mesh(geo, [faceMat, sideMat])
    mark.morphTargetInfluences = [1]

    // holder (position) > tilt (yaw to the camera, lean back) > spinner (turntable) > mark
    const holder = new THREE.Group()
    const tilt = new THREE.Group()
    tilt.rotation.order = 'YXZ'
    const spinner = new THREE.Group()
    spinner.add(mark)
    tilt.add(spinner)
    holder.add(tilt)

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlow(), transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }))
    glow.renderOrder = RenderOrder.TYPE_GLOW
    holder.add(glow)

    // The label under the logo, without it.
    const half = cfg.patchMm / 2
    const patch = createLabelPatch({
      R, H, image: brandFile(cfg.patch), azOffset: (cfg.printAzimuthDeg * Math.PI) / 180,
      box: {
        x0: (print.cx - half) / mm.labelWidth, x1: (print.cx + half) / mm.labelWidth,
        top: (print.cy - half) / mm.labelHeight, base: (print.cy + half) / mm.labelHeight,
      },
    })

    // Light-ring on the cap top.
    const yTop = profile.at(-1)[0] * H
    const capR = profile.at(-1)[1] * R
    const pad = new THREE.Mesh(
      new THREE.PlaneGeometry(capR * 2.3, capR * 2.3),
      new THREE.MeshBasicMaterial({
        map: makeRing(), transparent: true, opacity: 0,
        depthWrite: false, blending: THREE.AdditiveBlending,
      }),
    )
    pad.rotation.x = -Math.PI / 2
    pad.position.y = yTop + 0.004 * H
    pad.renderOrder = RenderOrder.LOGO_RING

    // Tap target: an invisible sphere round the logo (the mark is a thin open frame; taps
    // through its gaps missed, and people kept tapping).
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.75, 12, 8), new THREE.MeshBasicMaterial({visible: false}))
    hit.userData.pick = () => goHome()
    spinner.add(hit)
    root.add(patch.mesh, pad, holder)

    // Rise path: a cubic Bezier from the print, out and up over the shoulder, to the axis.
    const out = (r, y) => new THREE.Vector3(r * Math.sin(az), y, r * Math.cos(az))
    const hoverY = yTop + (cfg.hoverMm * u) + (size * cfg.topScale) / 2
    const path = [
      out(R * 1.004, y0),
      out(R * 1.55, y0 + 0.35 * H),
      out(R * 0.75, hoverY + 0.15 * H),
      new THREE.Vector3(0, hoverY, 0),
    ]
    built = {R, H, u, size, az, y0, path, hit, holder, tilt, spinner, mark, faceMat, sideMat, glow, patch, pad}
    return true
  }

  const bezier = (P, s, out) => {
    const a = (1 - s) ** 3, b = 3 * (1 - s) ** 2 * s, c = 3 * (1 - s) * s * s, d = s ** 3
    return out.set(
      a * P[0].x + b * P[1].x + c * P[2].x + d * P[3].x,
      a * P[0].y + b * P[1].y + c * P[2].y + d * P[3].y,
      a * P[0].z + b * P[1].z + c * P[2].z + d * P[3].z,
    )
  }

  const update = (timeMs, camera) => {
    if (!built) return
    const dt = lastMs === null ? 0 : Math.min(timeMs - lastMs, 100) * speed
    lastMs = timeMs
    const b = built
    const tPop = cfg.holdMs + cfg.popMs
    const tEnd = tPop + cfg.riseMs

    // Clock: forward on entry; back at once on exit, the spin turning to face front meanwhile.
    const returning = leaving || homing
    if (!returning) t = Math.min(t + dt, tEnd)
    else {
      t = Math.max(t - dt * cfg.exitSpeed, 0)
      if (align) {
        align.s = Math.min(align.s + dt, align.T)
        const s = align.s / align.T
        spin = align.from + (align.to - align.from) * (-2 * s ** 3 + 3 * s * s) + align.v * align.T * (s ** 3 - 2 * s * s + s)
        if (s >= 1) align = null
      }
    }

    const pop = easeOut(clamp01((t - cfg.holdMs) / cfg.popMs)) // 0 flat on print .. 1 solid
    const rise = easeInOut(clamp01((t - tPop) / cfg.riseMs)) // 0 at the print .. 1 above cap
    const arrived = clamp01((t - tEnd + 400) / 400) // the show part fades in as it lands

    // Turntable: only once up there (and not while lining up to leave). `spin` only grows;
    // spinDirection applies where it becomes a rotation.
    const dir = cfg.spinDirection < 0 ? -1 : 1
    if (!returning && t >= tEnd) {
      spinVel = (cfg.spinSpeed * TAU) / 1000
      spin += spinVel * dt
      if (spin > 1e4) spin %= TAU // float precision; same angle
    }
    ring += dt / 1000

    // Camera azimuth round the bottle, in this frame.
    let camAz = b.az
    if (camera) {
      root.worldToLocal(cam.copy(camera.position))
      camAz = Math.atan2(cam.x, cam.z)
    }

    // Placement.
    bezier(b.path, rise, p)
    p.y += cfg.bobMm * b.u * Math.sin(ring * TAU * cfg.bobHz) * arrived
    b.holder.position.copy(p)
    const scale = b.size * lerp(1, cfg.topScale, rise)
    b.mark.scale.setScalar(scale)
    b.hit.scale.setScalar(scale)
    b.mark.morphTargetInfluences[0] = 1 - pop
    b.tilt.rotation.y = camAz
    b.tilt.rotation.x = (-cfg.tiltDeg * Math.PI / 180) * rise
    b.spinner.rotation.y = b.az + dir * spin - camAz

    // Shine: brightest as its face points at the camera.
    const facing = Math.max(0, Math.cos(b.az + dir * spin - camAz))
    // Shine toward the side colour (lime), not white: half-way to white reads as grey.
    // Sides: the print's green while flat (a lime rim would give the swap away), lime once out.
    liveColor(face, cfg.faceColor)
    liveColor(side, cfg.sideColor)
    b.sideMat.color.copy(face).lerp(side, pop)
    b.faceMat.color.copy(shine.copy(face).lerp(side, cfg.shine * facing ** 14 * arrived))
    liveColor(b.glow.material.color, cfg.glowColor)
    liveColor(b.pad.material.color, cfg.ringColor)

    b.glow.material.opacity = cfg.glow * pop
    b.glow.scale.setScalar(scale * 1.9)

    // Patch: in as the logo leaves the surface, so the swap never shows.
    b.patch.update(camera, root, clamp01(pop * 2), dt, cfg.patchBrightness)

    b.pad.material.opacity = cfg.ring * arrived * (0.75 + 0.25 * Math.sin(ring * TAU * 0.8))
    b.pad.visible = b.pad.material.opacity > 0.001

    const home = returning && !align && t <= 0
    root.visible = !home
    // Tapped and back on the print: rest, then rise again (0 = stay until re-picked).
    if (home && homing && !leaving && cfg.replayAfterTap > 0 && (restMs += dt) >= cfg.replayAfterTap) reset()
  }

  /** Back to the print: spin on round to face front, then the entrance backwards. */
  const land = () => {
    const v = spinVel
    // Face front again (the angle it left the label at), on the next turn.
    const to = Math.ceil((spin + v * 300) / TAU) * TAU
    // Done before it is down: within the descent (<= 3d/v keeps the curve from overshooting).
    const T = Math.min(Math.max(v > 0 ? (3 * (to - spin)) / v : 0, 300), (0.8 * cfg.riseMs) / cfg.exitSpeed)
    align = t >= cfg.holdMs + cfg.popMs + cfg.riseMs && v > 0 ? {from: spin, to, v, T, s: 0} : null
  }

  const goHome = () => {
    if (!built || leaving || homing) return
    haptic(12)
    homing = true
    land()
  }

  const exit = () => {
    if (!built || leaving) return
    leaving = true
    if (!homing) land() // already on its way home (or resting there): just finish
  }

  const reset = () => {
    built?.patch.reset()
    t = 0
    spin = 0
    spinVel = 0
    align = null
    leaving = false
    homing = false
    restMs = 0
  }

  const restartEntrance = () => {
    lastMs = null
    reset()
  }

  return {
    root, build, update, restartEntrance, exit,
    isExited: () => !built || (leaving && !align && t <= 0),
    getPickables: () => (built ? [built.hit] : []),
    getDebugInfo: () => (built ? {'logo.patch': built.patch.info()} : null),
    setUserSpeed: v => { speed = v },
  }
}
