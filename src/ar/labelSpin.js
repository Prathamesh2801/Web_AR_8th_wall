/**
 * labelSpin.js — Typography style "Spin": the whole label comes loose and spins round
 * the bottle, then lands back on its print.
 *
 *   Enter   a copy of the flat label art fades in exactly over the printed one (so the
 *           switch is invisible), then speeds up while lifting a little off the surface
 *   Cruise  turns at `speed` rev/s, seamless: the art is wrapped round the full 360°
 *   Land    after `rounds` turns, brakes smoothly onto the last whole turn (back on the
 *           print) and fades out, handing back to the real label; `loop` starts it again
 *           after `loopPause`. rounds 0 = turn until the user leaves
 *   Exit    leaving lands the same way, on the next whole turn (mid spin-up works too)
 *
 * The art is the brand's `label.image`: the label as it physically is on the bottle (a
 * sticker's uncut bleed included: `imageBleedMm`, so the copy covers all of it, no real
 * edge peeking out above or below). Wrapped 360° instead of its real 172/176 mm arc: ~2% wider, so the ends meet with no
 * gap to show the real print through while it turns. Front at angle 0 (+z), reading
 * toward +x, the same frame typography.js maps print positions in. The occlusion proxy
 * hides the far half.
 *
 * Unlit art would glow on a dim table, so its BRIGHTNESS follows the room (cameraLight.js).
 * Not its hue: the camera's mean colour is mostly the product itself (a teal bottle), so
 * tinting by it turned the copy green.
 */
import * as THREE from 'three'

import {PRODUCT} from '../config'
import {cameraLight} from './cameraLight'
import {RenderOrder} from './renderOrder'

const TAU = Math.PI * 2
const clamp01 = t => Math.min(Math.max(t, 0), 1)
const easeInOut = t => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

export const createLabelSpin = (cfg) => {
  const root = new THREE.Group()
  root.name = 'labelSpin'
  let built = null
  let lastMs = null
  let speed = 1
  let t = 0 // ms since this run started
  let phase = 0 // rad turned so far (0 = on the print)
  let vel = 0 // rad/ms, now
  let landing = null // {from, to, v, T, s}: Hermite ease from (phase, vel) to rest on `to`
  let fadeOut = 0 // 0..1 after landing
  let restMs = 0 // since the fade-out finished (loop pause)
  let leaving = false // the user switched away: land, fade, done

  const land = (to) => {
    // ~1.5x the time a constant brake would take, so the curve never overshoots.
    const T = Math.min(Math.max(vel > 0 ? (3 * (to - phase)) / vel : 0, 600), 4000)
    landing = {from: phase, to, v: vel, T, s: 0}
  }

  const build = ({radiusTop, radiusBottom, height: H}) => {
    if (built) return true
    const R = (radiusTop + radiusBottom) / 2
    if (!(R > 0) || !(H > 0) || !PRODUCT.label.image) return false
    const map = new THREE.TextureLoader().load(PRODUCT.label.image)
    map.colorSpace = THREE.SRGBColorSpace
    map.anisotropy = 8 // seen edge-on at the sides
    // Unit radius (scaled per frame); label height + any bleed, centred on the art.
    const {mm, label} = PRODUCT
    const h = H * (1 + (2 * (label.imageBleedMm ?? 0)) / mm.labelHeight)
    const geo = new THREE.CylinderGeometry(1, 1, h, 128, 1, true, -Math.PI, TAU)
    const mat = new THREE.MeshBasicMaterial({map, transparent: true, depthWrite: false, depthTest: true})
    const band = new THREE.Mesh(geo, mat)
    band.renderOrder = RenderOrder.LABEL_SPIN
    band.visible = false
    root.add(band)
    built = {R, band, mat}
    return true
  }

  const restart = () => {
    t = 0
    phase = 0
    vel = 0
    landing = null
    fadeOut = 0
    restMs = 0
  }

  const update = (timeMs) => {
    if (!built) return
    const dt = lastMs === null ? 0 : Math.min(timeMs - lastMs, 100) * speed
    lastMs = timeMs
    t += dt
    const {R, band, mat} = built

    // k: 0 = resting on the print, 1 = full speed.
    let k
    if (!landing) {
      k = easeInOut(clamp01((t - cfg.holdMs) / cfg.spinUpMs))
      vel = (cfg.speed * TAU / 1000) * k
      phase += vel * dt
      // Last round: start braking once the stop at `rounds` turns is a brake's length away.
      const last = cfg.rounds * TAU
      if (cfg.rounds > 0 && vel > 0 && last - phase <= (vel * cfg.brakeMs) / 3) {
        land(Math.max(last, Math.ceil(phase / TAU) * TAU))
      }
    } else {
      landing.s = Math.min(landing.s + dt, landing.T)
      const u = landing.s / landing.T
      // Cubic Hermite: starts at the current speed, ends at rest exactly on the turn.
      const h10 = u ** 3 - 2 * u ** 2 + u
      const h01 = -2 * u ** 3 + 3 * u ** 2
      phase = landing.from + (landing.to - landing.from) * h01 + landing.v * landing.T * h10
      vel = landing.v * (1 - u)
      k = 1 - easeInOut(u)
      if (u >= 1) {
        if (fadeOut < 1) fadeOut = clamp01(fadeOut + dt / cfg.fadeMs)
        else if (!leaving && cfg.loop && (restMs += dt) >= cfg.loopPause) restart()
      }
    }

    const fade = clamp01(t / cfg.fadeMs) * (1 - fadeOut)
    band.visible = fade > 0.001
    if (!band.visible) return
    const r = R * (1 + cfg.restLift + cfg.lift * k)
    band.scale.set(r, 1, r)
    band.rotation.y = phase + (cfg.printAzimuthDeg * Math.PI) / 180

    const L = cameraLight.ready ? cameraLight.luma : 0.18
    mat.color.setScalar(Math.min(1, Math.max(0.45, Math.sqrt(L / 0.18) * cfg.brightness)))
    mat.opacity = fade
  }

  const exit = () => {
    if (!built || leaving) return
    leaving = true
    if (landing) return // already landing (or resting between loops): finish that
    // The next whole turn far enough ahead to brake into gently; barely turning: nearest.
    land(vel > 0.2 * (cfg.speed * TAU / 1000)
      ? Math.ceil((phase + vel * 500) / TAU) * TAU
      : Math.round(phase / TAU) * TAU)
  }

  const restartEntrance = () => {
    lastMs = null
    leaving = false
    restart()
  }

  return {
    root, build, update, restartEntrance, exit,
    isExited: () => !built || (leaving && fadeOut >= 1),
    setUserSpeed: v => { speed = v },
  }
}
