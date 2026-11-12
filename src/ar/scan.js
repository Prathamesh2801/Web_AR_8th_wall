/**
 * scan.js — Effects style "Scan": the product is scanned like a formula being analysed.
 *
 *   Up pass    a bright scan line climbs the bottle, revealing a hologram grid behind it,
 *              with a laser sheet cutting out at its height; riding just above it, the
 *              label's nutrients type out one after another as it passes
 *   Down pass  the line sweeps back down, verifying
 *   Done       the hologram flashes; "Formula scanned · N nutrients" types out above the cap
 *   Idle       the hologram breathes; a dim sweep every `sweepEvery` s
 *   Exit       the whole entrance backwards, twice as fast
 *
 * Product-agnostic: the hologram is PRODUCT.profile lathed just outside the occluder (its
 * far side is hidden). Readouts + verdict: the brand's `scan.readouts` / `scan.verdict`,
 * else its nutrients (nutrientData.js). NORMAL blending throughout: additive light vanishes on a white table.
 */
import * as THREE from 'three'

import {PRODUCT} from '../config'
import {makeCard} from './callouts'
import {liveColor} from './liveColor'
import {NUTRIENTS} from './nutrientData'
import {RenderOrder} from './renderOrder'

const T = {up: 2600, down: 1200, done: 450, doneType: 900} // ms
const ENTER_END = T.up + T.down + T.done
const EXIT_SPEED = 2
const IDLE_SWEEP = 1800 // ms an idle sweep takes

const clamp01 = t => Math.min(Math.max(t, 0), 1)
const phase = (p, at, dur) => clamp01((p - at) / dur)
const easeInOut = t => t * t * (3 - 2 * t)

const holoMaterial = () => new THREE.ShaderMaterial({
  uniforms: {
    uColor: {value: new THREE.Color()}, uOpacity: {value: 0}, uReveal: {value: -1e9},
    uScanY: {value: 0}, uLine: {value: 0}, uSpacing: {value: 0.06}, uH: {value: 1},
  },
  vertexShader: `varying float vY; varying vec2 vUv; varying vec3 vN, vV;
void main() {
  vY = position.y; vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal); vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`,
  // Grid lines (rings by height, meridians round), brighter at the rim; shown only below
  // the reveal height; the scan line itself drawn on the surface, white-hot at its core.
  fragmentShader: `uniform vec3 uColor; uniform float uOpacity, uReveal, uScanY, uLine, uSpacing, uH;
varying float vY; varying vec2 vUv; varying vec3 vN, vV;
float gridLine(float x) { return 1.0 - smoothstep(0.0, 1.5 * fwidth(x), abs(fract(x - 0.5) - 0.5)); }
void main() {
  float g = max(gridLine(vY / uSpacing), gridLine(vUv.x * 36.0));
  float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
  float shown = 1.0 - smoothstep(uReveal - 0.01 * uH, uReveal + 0.01 * uH, vY);
  float line = exp(-pow((vY - uScanY) / (0.022 * uH), 2.0)) * uLine;
  float a = uOpacity * shown * (0.55 * g + 0.4 * rim + 0.06) + line;
  gl_FragColor = vec4(mix(uColor, vec3(1.0), clamp(line, 0.0, 1.0) * 0.7), clamp(a, 0.0, 1.0));
}`,
  transparent: true, depthWrite: false, depthTest: true,
})

const sheetMaterial = () => new THREE.ShaderMaterial({
  uniforms: {uColor: {value: new THREE.Color()}, uLevel: {value: 0}},
  vertexShader: `varying float vR;
void main() { vR = length(position.xy); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform vec3 uColor; uniform float uLevel; varying float vR;
void main() { float f = 1.0 - smoothstep(1.0, 1.9, vR); gl_FragColor = vec4(uColor, uLevel * f * f * 0.55); }`,
  transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
})

export const createScan = (cfg) => {
  const root = new THREE.Group()
  root.name = 'scan'
  let built = null
  let lastMs = null
  let speed = 1
  let p = 0 // ms into the entrance (and on into idle); exit runs it backwards
  let exiting = false

  const build = ({radiusTop, radiusBottom, height: H}) => {
    if (built) return true
    const R = (radiusTop + radiusBottom) / 2
    if (!(R > 0) || !(H > 0)) return false
    const {profile} = PRODUCT
    const table = profile[0][0] * H
    const top = profile[profile.length - 1][0] * H

    const holo = new THREE.Mesh(
      new THREE.LatheGeometry(profile.map(([y, r]) => new THREE.Vector2(r * R * 1.012, y * H)), 72),
      holoMaterial(),
    )
    holo.material.uniforms.uH.value = H
    holo.renderOrder = RenderOrder.SCAN_HOLO

    const sheet = new THREE.Mesh(new THREE.RingGeometry(1, 1.9, 96), sheetMaterial())
    sheet.rotation.x = -Math.PI / 2
    sheet.renderOrder = RenderOrder.SCAN_SHEET

    // Readouts ride the line, centred on the bottle's front (beside it they ran off the
    // screen at close range); the verdict sits above the cap. On top, like a HUD.
    const lines = cfg.readouts?.length ? cfg.readouts : NUTRIENTS.map(n => `${n.full} · ${n.amount}`)
    const readouts = lines.map((text) => {
      const card = makeCard(text)
      card.sprite.center.set(0.5, 0)
      card.sprite.material.depthTest = false
      card.sprite.visible = false
      return card
    })
    const done = makeCard(cfg.verdict || `✓ Formula scanned · ${NUTRIENTS.length} nutrients`)
    done.sprite.center.set(0.5, 0)
    done.sprite.material.depthTest = false
    done.sprite.visible = false

    root.add(holo, sheet, done.sprite, ...readouts.map(c => c.sprite))
    built = {H, R, table, top, holo, sheet, readouts, done}
    return true
  }

  // Scratch (update must not allocate).
  const cam = new THREE.Vector3()
  const facing = new THREE.Vector3()

  const showCard = (card, k, chars, ch) => {
    card.sprite.visible = k > 0.001
    if (!card.sprite.visible) return
    card.sprite.scale.set(ch * card.aspect, ch, 1)
    card.sprite.material.opacity = k
    card.sprite.material.color.setScalar(k) // premultiplied: fade colour with alpha
    card.draw(chars, chars < card.length, cfg.cardColor, cfg.cardBorderColor, cfg.color)
  }

  const update = (timeMs, camera) => {
    if (!built || !camera) return
    const dt = lastMs === null ? 0 : Math.min(timeMs - lastMs, 100) * speed
    lastMs = timeMs
    p = exiting ? Math.max(Math.min(p, ENTER_END) - dt * EXIT_SPEED, 0) : p + dt
    const {H, R, table, top, holo, sheet, readouts, done} = built
    const span = top - table

    // Where the line is, how bright, and how much hologram is revealed.
    let scanY = table
    let line = 0
    let reveal = table - H
    if (p < T.up) {
      scanY = table + span * easeInOut(p / T.up)
      line = Math.min(p / 150, 1)
      reveal = scanY
    } else if (p < T.up + T.down) {
      scanY = top - span * easeInOut((p - T.up) / T.down)
      line = 1
      reveal = top + H
    } else {
      reveal = top + H
      if (p > ENTER_END) { // idle sweeps
        const s = ((p - ENTER_END) % (Math.max(cfg.sweepEvery, 1) * 1000)) / IDLE_SWEEP
        if (s < 1) {
          scanY = table + span * easeInOut(s)
          line = 0.45 * Math.sin(Math.PI * s)
        }
      }
    }
    const flash = Math.sin(Math.PI * phase(p, T.up + T.down, T.done))
    const settled = phase(p, T.up + T.down, T.done)
    const breath = 0.85 + 0.15 * Math.sin(timeMs / 600)

    const hu = holo.material.uniforms
    liveColor(hu.uColor.value, cfg.color)
    hu.uOpacity.value = cfg.hologram * (p < T.up + T.down ? 1 : (1 - settled) + settled * 0.4 * breath) * (1 + 1.2 * flash)
    hu.uReveal.value = reveal
    hu.uScanY.value = scanY
    hu.uLine.value = cfg.line * line
    hu.uSpacing.value = cfg.gridSpacing * H

    const su = sheet.material.uniforms
    liveColor(su.uColor.value, cfg.color)
    su.uLevel.value = cfg.sheet * line
    sheet.position.y = scanY
    sheet.scale.setScalar(PRODUCT.radiusAt(scanY / H) * R * 1.02)
    sheet.visible = line > 0.01

    // Toward the camera: the readouts and verdict face you from the bottle's front.
    camera.getWorldPosition(cam)
    root.worldToLocal(cam)
    facing.set(cam.x, 0, cam.z)
    if (facing.lengthSq() < 1e-8) facing.set(0, 0, 1)
    facing.normalize()

    const ch = cfg.cardHeight * H
    const slot = T.up / readouts.length
    const current = p < T.up ? Math.floor(p / slot) : -1
    for (let i = 0; i < readouts.length; i++) {
      const card = readouts[i]
      if (i !== current) { card.sprite.visible = false; continue }
      const into = (p - i * slot) / slot
      card.sprite.position.copy(facing).multiplyScalar(R * 1.1)
      card.sprite.position.y = scanY + 0.05 * H
      showCard(card, Math.min(into * 4, 1), Math.min(card.length, Math.ceil(into * 2.5 * card.length)), ch)
    }

    const dk = phase(p, T.up + T.down, T.done)
    done.sprite.position.copy(facing).multiplyScalar(R)
    done.sprite.position.y = top + 0.12 * H
    const typed = Math.ceil(phase(p, T.up + T.down, T.doneType) * done.length)
    showCard(done, dk, typed, ch * 1.25)

    holo.visible = p > 0
  }

  const restartEntrance = () => {
    lastMs = null
    p = 0
    exiting = false
  }

  return {
    root, build, update, restartEntrance,
    exit: () => { exiting = true },
    isExited: () => !built || p <= 0,
    setUserSpeed: v => { speed = v },
  }
}
