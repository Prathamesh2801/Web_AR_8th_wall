/**
 * nutrientSystem.js — animation "Nutrients": every nutrient on the label emerges from
 * the bottle's surface and settles into an orbit that follows the bottle's curve.
 * Tap a node to open its card.
 *
 * ORBITS FOLLOW THE PRODUCT
 * A ring is a closed path round the axis whose height swings once per lap (a tilted
 * ring, y = y0 + amp * sin(angle + tilt)) and whose radius is the REAL bottle radius at
 * that height (PRODUCT.radiusAt) plus a constant clearance. So a node passing the
 * shoulder tucks in with it instead of floating off a cylinder, and every ring keeps
 * the same air gap to the product all the way round.
 *
 * EMERGENCE
 * Each node is born ON the surface at its own orbit angle and height, then eases out
 * along the normal to its clearance with a short swirl, a brief bright halo and its
 * tether (a spoke back to the surface) stretching with it. While it is still inside
 * the occlusion proxy it is hidden, so it reads as coming out of the bottle.
 *
 * All sizes derive from the runtime geometry; every material keeps depthTest so the
 * occlusion proxy hides the far side. `update` allocates nothing.
 */
import * as THREE from 'three'

import {PRODUCT} from '../config'
import {RenderOrder} from './renderOrder'
import {NUTRIENTS, CONNECTIONS, GROUP_COLOR} from './nutrientData'

/*
 * y0 / amp in label heights (label = -0.5..0.5, base -0.73, shoulder 0.5..0.8);
 * clearance in bottle radii, far enough apart that halos on different rings never touch.
 * `dir` alternates so adjacent rings counter-rotate.
 */
const RINGS = [
  {y0: 0.02, amp: 0.26, tilt: 0.0, clearance: 0.4, dir: 1, speed: 0.55},
  {y0: 0.3, amp: 0.3, tilt: 2.1, clearance: 0.72, dir: -1, speed: 0.4},
  {y0: -0.28, amp: 0.22, tilt: 4.2, clearance: 1.05, dir: 1, speed: 0.3},
]

const T = {firstNode: 0.25, allOut: 1.6, emerge: 1.0, pathsAt: 1.2}

const clamp01 = t => Math.min(Math.max(t, 0), 1)
const easeOutCubic = t => 1 - (1 - t) ** 3

/** Label sprite: large, high-contrast, readable on a phone. */
const makeLabel = (text, worldWidth, color) => {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  ctx.font = 'bold 132px system-ui, -apple-system, "Segoe UI", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = 14
  ctx.strokeStyle = 'rgba(0,0,0,0.72)'
  ctx.strokeText(text, 256, 128)
  ctx.fillStyle = '#ffffff'
  ctx.fillText(text, 256, 128)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthWrite: false, depthTest: true, color,
  }))
  sprite.renderOrder = RenderOrder.LABEL
  sprite.scale.set(worldWidth, worldWidth * 0.5, 1)
  return sprite
}

/** Each nutrient its own hue, fanned around its group colour (families stay readable). */
const paletteFor = (n, idx) => {
  const base = GROUP_COLOR[n.group] ?? {core: 0xffffff, glow: 0xffffff}
  const spread = (idx % 7) / 7 - 0.5
  const hsl = {h: 0, s: 0, l: 0}
  const tone = (hex, ds, lMin, lMax, dl) => {
    const c = new THREE.Color(hex)
    c.getHSL(hsl)
    return c.setHSL((hsl.h + spread * 0.1 + 1) % 1, clamp01(hsl.s + ds),
      THREE.MathUtils.clamp(hsl.l + dl, lMin, lMax)).getHex()
  }
  return {core: tone(base.core, 0.18, 0.35, 0.8, spread * 0.1), glow: tone(base.glow, 0.22, 0.3, 0.75, 0)}
}

export const createNutrientSystem = (cfg) => {
  const root = new THREE.Group()

  let s = null
  let age = 0
  let lastMs = null
  let orbitPhase = 0
  let speedScale = 1   // eased toward speedTarget (slows while a card is open)
  let speedTarget = 1
  let userSpeed = 1
  let selectedId = null
  const _a = new THREE.Vector3()
  const _b = new THREE.Vector3()

  /** Point on a ring at `angle`, `out` = 0 (surface) .. 1 (full clearance). */
  const ringPoint = (ring, angle, out, R, H, v) => {
    const y = (ring.y0 + ring.amp * Math.sin(angle + ring.tilt)) * H
    const r = PRODUCT.radiusAt(y / H) * R + ring.clearance * R * out
    return v.set(Math.sin(angle) * r, y, Math.cos(angle) * r)
  }

  const build = ({radiusTop, radiusBottom, height: H}) => {
    const R = (radiusTop + radiusBottom) / 2
    if (s) return true
    if (!(R > 0) || !(H > 0)) return false

    const nodeRadius = R * 0.075
    const sphereGeo = new THREE.SphereGeometry(nodeRadius, 16, 16)
    const haloGeo = new THREE.SphereGeometry(nodeRadius * 1.9, 12, 12)
    const hitGeo = new THREE.SphereGeometry(nodeRadius * 3, 8, 8)
    const hitMat = new THREE.MeshBasicMaterial({visible: false})
    const line = (color) => {
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3))
      const l = new THREE.Line(geo, new THREE.LineBasicMaterial({
        color, transparent: true, opacity: 0, depthWrite: false, depthTest: true,
      }))
      l.renderOrder = RenderOrder.ORBIT_TETHER
      root.add(l)
      return l
    }

    // Guide paths, sampled from the same function the nodes ride.
    const paths = RINGS.map((ring) => {
      const pts = []
      for (let i = 0; i <= 160; i++) pts.push(ringPoint(ring, (i / 160) * Math.PI * 2, 1, R, H, new THREE.Vector3()))
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({
        color: 0xbfe9ff, transparent: true, opacity: 0, depthWrite: false, depthTest: true,
      }))
      l.renderOrder = RenderOrder.ORBIT_PATH
      root.add(l)
      return l
    })

    // Round-robin across rings so every ring mixes the colour families.
    const nodes = NUTRIENTS.map((n, idx) => {
      const ring = RINGS[idx % RINGS.length]
      const pal = paletteFor(n, idx)
      const group = new THREE.Group()
      const sphere = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({
        color: pal.core, transparent: true, opacity: 0, depthTest: true,
      }))
      sphere.renderOrder = RenderOrder.NODE_CORE
      sphere.userData.pick = n
      const halo = new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({
        color: pal.glow, transparent: true, opacity: 0, depthWrite: false, depthTest: true,
      }))
      halo.renderOrder = RenderOrder.NODE_HALO
      const hit = new THREE.Mesh(hitGeo, hitMat)
      hit.userData.pick = n
      const label = makeLabel(n.label, R * 0.78, pal.core)
      label.position.y = nodeRadius * 4.2
      group.add(sphere, halo, hit, label)
      root.add(group)
      return {n, ring, group, sphere, halo, hit, label, tether: line(pal.glow), phase: 0}
    })
    for (const ring of RINGS) {
      const members = nodes.filter(x => x.ring === ring)
      members.forEach((x, i) => { x.phase = (i / members.length) * Math.PI * 2 })
    }
    // Emerge in angle order round the bottle, so they stream out as a wave.
    const order = [...nodes].sort((a, b) => a.phase - b.phase)
    order.forEach((x, i) => { x.born = T.firstNode + (i / order.length) * (T.allOut - T.firstNode) })

    const byId = new Map(nodes.map(x => [x.n.id, x]))
    const connections = CONNECTIONS
      .filter(([a, b]) => byId.has(a) && byId.has(b))
      .map(([a, b], i) => ({a: byId.get(a), b: byId.get(b), line: line(0xa8e4ff), phase: i * 1.1}))

    s = {R, H, nodes, paths, connections}
    return true
  }

  const update = (timeMs) => {
    if (!s) return
    const dt = lastMs === null ? 0 : Math.min(timeMs - lastMs, 100) / 1000
    lastMs = timeMs
    age += dt * userSpeed
    const {R, H} = s
    const t = age

    // Integrated, never `t * speed`: a speed change must not rewrite past motion.
    speedScale += (speedTarget - speedScale) * 0.08
    orbitPhase += dt * speedScale * userSpeed * (cfg.orbitSpeed ?? 1)

    const pathIn = clamp01((age - T.pathsAt) / 0.8)
    for (const p of s.paths) p.material.opacity = pathIn * 0.12

    for (const x of s.nodes) {
      const e = easeOutCubic(clamp01((age - x.born) / T.emerge))
      // Swirl: the angle lags while emerging, so the node unwinds out of the bottle.
      const angle = x.phase + orbitPhase * x.ring.speed * x.ring.dir - (1 - e) * 0.7 * x.ring.dir
      ringPoint(x.ring, angle, e, R, H, x.group.position)

      const sel = selectedId === x.n.id
      const pulse = 1 + Math.sin(t * 2 + x.phase) * 0.06
      x.group.scale.setScalar((0.35 + 0.65 * e) * pulse * (sel ? 1.55 : 1))
      const shown = clamp01((age - x.born) / 0.15)
      x.sphere.material.opacity = 0.95 * shown
      // A brief flare as it breaks the surface, settling to the resting halo.
      x.halo.material.opacity = shown * ((sel ? 0.42 : 0.22) + 0.5 * Math.sin(Math.PI * e) * (1 - e))
      x.label.material.opacity = easeOutCubic(clamp01((age - x.born - 0.4) / 0.5))

      // Tether: from the surface point beneath the node out to it.
      ringPoint(x.ring, angle, 0, R, H, _a)
      const pos = x.tether.geometry.attributes.position
      pos.setXYZ(0, _a.x, _a.y, _a.z)
      pos.setXYZ(1, x.group.position.x, x.group.position.y, x.group.position.z)
      pos.needsUpdate = true
      x.tether.material.opacity = 0.3 * shown
    }

    const conIn = clamp01((age - T.allOut - T.emerge) / 0.8)
    for (const c of s.connections) {
      _a.copy(c.a.group.position)
      _b.copy(c.b.group.position)
      const pos = c.line.geometry.attributes.position
      pos.setXYZ(0, _a.x, _a.y, _a.z)
      pos.setXYZ(1, _b.x, _b.y, _b.z)
      pos.needsUpdate = true
      c.line.material.opacity = (0.04 + (Math.sin(t * 0.8 + c.phase) + 1) * 0.055) * conIn
    }

  }

  return {
    root, build, update,
    restartEntrance: () => { age = 0; lastMs = null },
    setUserSpeed: (v) => { userSpeed = THREE.MathUtils.clamp(v, 0, 3) },
    getPickables: () => s?.nodes.flatMap(x => [x.hit, x.sphere]) ?? [],
    /** Highlights a node and slows the orbit so the selection is readable. */
    setSelected: (id) => { selectedId = id; speedTarget = id ? 0.25 : 1 },
    getDebugInfo: () => (s ? {nutrientCount: s.nodes.length, speedScale: +speedScale.toFixed(2)} : null),
  }
}
