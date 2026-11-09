/**
 * energy.js — Effects style "Energy": electric arcs crawl over the bottle, a charge rises
 * up it, and every few seconds it surges: the arcs flare and a shockwave ring runs out
 * across the table. Product-agnostic: the arcs follow PRODUCT.profile's surface.
 *
 *   Entrance  the charge climbs from the table to the cap; arcs live below it; first surge
 *   Idle      arcs flicker (each re-drawn every ~70-160 ms); a surge every `surgeEvery` s
 *   Exit      the charge drains back down into the table
 *
 * Arcs favour the bottle's edges as seen from the camera (40-88° off the line of sight),
 * so they frame the label instead of covering it, and they read as a rim of energy.
 * Each arc is a ribbon that follows the surface (just outside the occluder) but turns its
 * face to the camera: lying flat, the edge-on ones near the silhouette were hairlines.
 * Rebuilt in place: one preallocated geometry, nothing created per frame.
 *
 * Arcs and rings use NORMAL blending, not additive: additive light vanishes on a white
 * table (it was invisible in a bright test photo); a coloured glow shows on any background.
 */
import * as THREE from 'three'

import {PRODUCT} from '../config'
import {liveColor} from './liveColor'
import {RenderOrder} from './renderOrder'
import {makePoolTexture} from './spotlight'

const BOLTS = 10
const PTS = 14 // points per arc
const RINGS = 2
const T = {charge: 1300, ring: 1000} // ms
const EXIT_SPEED = 2
const DEG = Math.PI / 180

const clamp01 = t => Math.min(Math.max(t, 0), 1)
const easeInOut = t => t * t * (3 - 2 * t)
const rand = (a, b) => a + Math.random() * (b - a)

export const createEnergy = (cfg) => {
  const root = new THREE.Group()
  root.name = 'energy'
  let built = null
  let lastMs = null
  let speed = 1
  let p = 0 // ms of charge; exit runs it backwards
  let idle = 0
  let exiting = false
  let lastSurge = -1e9
  let ringNext = 0

  // Arcs: BOLTS ribbons of PTS x 2 vertices in one geometry.
  const VERTS = BOLTS * PTS * 2
  const pos = new Float32Array(VERTS * 3)
  const alpha = new Float32Array(VERTS)
  const sideAttr = new Float32Array(VERTS)
  const index = []
  for (let b = 0; b < BOLTS; b++) {
    for (let i = 0; i < PTS; i++) {
      const v = (b * PTS + i) * 2
      sideAttr[v] = 0
      sideAttr[v + 1] = 1
      if (i < PTS - 1) index.push(v, v + 1, v + 2, v + 1, v + 3, v + 2)
    }
  }
  const boltGeo = new THREE.BufferGeometry()
  boltGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage))
  boltGeo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage))
  boltGeo.setAttribute('aSide', new THREE.BufferAttribute(sideAttr, 1))
  boltGeo.setIndex(index)
  const bolts = new THREE.Mesh(boltGeo, new THREE.ShaderMaterial({
    uniforms: {uColor: {value: new THREE.Color()}},
    vertexShader: `attribute float aAlpha, aSide; varying float vA, vS;
void main() { vA = aAlpha; vS = aSide; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    // White-hot core, coloured glow either side.
    fragmentShader: `uniform vec3 uColor; varying float vA, vS;
void main() {
  float x = abs(vS * 2.0 - 1.0);
  float core = smoothstep(0.3, 0.0, x);
  float glow = (1.0 - x) * (1.0 - x);
  gl_FragColor = vec4(mix(uColor, vec3(1.0), core * 0.8), min(vA * (0.7 * glow + core), 1.0));
}`,
    transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
  }))
  bolts.frustumCulled = false // rebuilt every few frames; its bounds are never current
  bolts.renderOrder = RenderOrder.ENERGY_BOLT

  // Per-arc state: its path in (angle, height) and how bright it is now.
  const arcAz = new Float32Array(BOLTS * PTS)
  const arcY = new Float32Array(BOLTS * PTS)
  const level = new Float32Array(BOLTS)
  const nextAt = new Float32Array(BOLTS)

  const ringMat = () => new THREE.ShaderMaterial({
    uniforms: {uColor: {value: new THREE.Color()}, uA: {value: 0}},
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uColor; uniform float uA; varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float band = exp(-pow((d - 0.9) / 0.05, 2.0)) + 0.25 * exp(-pow((d - 0.8) / 0.12, 2.0));
  gl_FragColor = vec4(uColor, min(uA * band, 1.0));
}`,
    transparent: true, depthWrite: false, depthTest: true,
  })

  const build = ({radiusTop, radiusBottom, height: H}) => {
    if (built) return true
    const R = (radiusTop + radiusBottom) / 2
    if (!(R > 0) || !(H > 0)) return false
    const {profile} = PRODUCT
    const table = profile[0][0] * H
    const top = profile[profile.length - 1][0] * H

    const glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
      map: makePoolTexture(), transparent: true, depthWrite: false, opacity: 0,
      blending: THREE.AdditiveBlending,
    }))
    glow.rotation.x = -Math.PI / 2
    glow.position.y = table + 0.004 * H
    glow.renderOrder = RenderOrder.ENERGY_GLOW

    const rings = Array.from({length: RINGS}, () => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), ringMat())
      m.rotation.x = -Math.PI / 2
      m.position.y = table + 0.006 * H
      m.renderOrder = RenderOrder.ENERGY_RING
      m.visible = false
      return {mesh: m, born: -1e9}
    })

    root.add(glow, bolts, ...rings.map(r => r.mesh))
    built = {H, R, table, top, glow, rings}
    return true
  }

  // Scratch (update must not allocate).
  const cam = new THREE.Vector3()
  const P = new THREE.Vector3()
  const prev = new THREE.Vector3()
  const next = new THREE.Vector3()
  const tan = new THREE.Vector3()
  const nrm = new THREE.Vector3()
  const side = new THREE.Vector3()
  const view = new THREE.Vector3()

  /** Surface point at angle `az`, height `y` (engine units), just outside the occluder. */
  const onSurface = (out, az, y) => {
    const {H, R} = built
    const r = PRODUCT.radiusAt(y / H) * R * 1.015
    return out.set(Math.sin(az) * r, y, Math.cos(az) * r)
  }

  /** A new jagged path for arc `b`, somewhere below `ceiling`, near a visible edge. */
  const newArc = (b, camAz, ceiling, surge) => {
    const {H, table} = built
    const lit = Math.random() < 0.6 + 0.4 * surge
    level[b] = lit ? rand(0.55, 1) * (1 + 0.6 * surge) : 0
    nextAt[b] = idle + rand(70, 160)
    if (!lit || ceiling - table < 0.08 * H) {
      level[b] = 0
      return
    }
    const edge = camAz + (Math.random() < 0.5 ? -1 : 1) * rand(40, 88) * DEG
    const y0 = rand(table + 0.03 * H, ceiling)
    const y1 = Math.min(Math.max(y0 + (Math.random() < 0.5 ? -1 : 1) * rand(0.2, 0.55) * H, table + 0.02 * H), ceiling)
    const a1 = edge + rand(-22, 22) * DEG
    const jag = 0.07 * H
    for (let i = 0; i < PTS; i++) {
      const t = i / (PTS - 1)
      const env = Math.sin(Math.PI * t) // ends pinned, middle wild
      arcY[b * PTS + i] = y0 + (y1 - y0) * t + (Math.random() - 0.5) * jag * env
      arcAz[b * PTS + i] = edge + (a1 - edge) * t + (Math.random() - 0.5) * 0.35 * env
    }
  }

  /** Writes arc `b`'s ribbon (width tapering to its ends) and brightness into the buffers. */
  const writeArc = (b, a) => {
    const {H} = built
    for (let i = 0; i < PTS; i++) {
      const k = b * PTS + i
      onSurface(P, arcAz[k], arcY[k])
      onSurface(prev, arcAz[Math.max(k - 1, b * PTS)], arcY[Math.max(k - 1, b * PTS)])
      onSurface(next, arcAz[Math.min(k + 1, b * PTS + PTS - 1)], arcY[Math.min(k + 1, b * PTS + PTS - 1)])
      tan.subVectors(next, prev)
      nrm.set(P.x, 0, P.z).normalize()
      side.crossVectors(tan, view.subVectors(cam, P)).normalize()
      const t = i / (PTS - 1)
      const w = cfg.boltWidth * H * (0.35 + 0.65 * Math.sin(Math.PI * t)) / 2
      P.addScaledVector(nrm, 0.006 * H)
      const v = k * 2
      pos[v * 3] = P.x - side.x * w
      pos[v * 3 + 1] = P.y - side.y * w
      pos[v * 3 + 2] = P.z - side.z * w
      pos[v * 3 + 3] = P.x + side.x * w
      pos[v * 3 + 4] = P.y + side.y * w
      pos[v * 3 + 5] = P.z + side.z * w
      alpha[v] = alpha[v + 1] = a
    }
  }

  const update = (timeMs, camera) => {
    if (!built || !camera) return
    const dt = lastMs === null ? 0 : Math.min(timeMs - lastMs, 100) * speed
    lastMs = timeMs
    idle += dt
    p = exiting ? Math.max(Math.min(p, T.charge) - dt * EXIT_SPEED, 0) : p + dt
    const {R, table, top, glow, rings} = built

    const charge = easeInOut(clamp01(p / T.charge))
    const ceiling = table + (top - table) * charge

    // A surge at full charge, then every surgeEvery seconds; never while draining.
    const surgeMs = Math.max(cfg.surgeEvery, 0.5) * 1000
    if (!exiting && charge >= 1 && idle - lastSurge >= surgeMs) {
      lastSurge = idle
      const r = rings[ringNext]
      r.born = idle
      ringNext = (ringNext + 1) % RINGS
    }
    const surge = Math.exp(-(idle - lastSurge) / 260)

    camera.getWorldPosition(cam)
    root.worldToLocal(cam)
    const camAz = Math.atan2(cam.x, cam.z)
    const fade = Math.exp(-dt / 80) // a struck arc dims fast, like a real spark
    for (let b = 0; b < BOLTS; b++) {
      if (idle >= nextAt[b]) newArc(b, camAz, ceiling, surge)
      else level[b] *= fade
      writeArc(b, cfg.intensity * level[b] * Math.min(charge * 3, 1))
    }
    boltGeo.attributes.position.needsUpdate = true
    boltGeo.attributes.aAlpha.needsUpdate = true
    liveColor(bolts.material.uniforms.uColor.value, cfg.color)

    liveColor(glow.material.color, cfg.color)
    glow.material.opacity = cfg.glow * charge * (0.55 + 0.45 * surge) * (0.9 + 0.1 * Math.sin(idle / 90))
    glow.scale.setScalar(R * 4.2)

    for (const r of rings) {
      const t = (idle - r.born) / T.ring
      r.mesh.visible = t >= 0 && t < 1
      if (!r.mesh.visible) continue
      const size = 2 * R * (1 + (cfg.ringReach - 1) * (1 - (1 - t) ** 3)) / 0.9 // band sits at 0.9 of the plane
      r.mesh.scale.set(size, size, 1)
      const u = r.mesh.material.uniforms
      liveColor(u.uColor.value, cfg.color)
      u.uA.value = cfg.intensity * (1 - t) ** 1.5
    }

    bolts.visible = glow.visible = p > 0
  }

  const restartEntrance = () => {
    lastMs = null
    p = 0
    exiting = false
    lastSurge = -1e9
    nextAt.fill(0)
    level.fill(0)
    if (built) for (const r of built.rings) r.born = -1e9
  }

  return {
    root, build, update, restartEntrance,
    exit: () => { exiting = true },
    isExited: () => !built || p <= 0,
    setUserSpeed: v => { speed = v },
  }
}
