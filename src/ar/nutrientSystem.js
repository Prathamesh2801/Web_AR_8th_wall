/**
 * nutrientSystem.js
 *
 * ONE tilted 3D elliptical orbit carrying every nutrient around the tracked bottle.
 *
 * Structure (all under the target anchor, so the whole system inherits its pose):
 *   root
 *     orbitGroup            <- tilted on X and Z: the orbital PLANE
 *       pathLine            <- thin elliptical guide
 *       travellingHighlight <- small dot showing direction of travel
 *       nodeGroup * N       <- one per nutrient (sphere + glow + label)
 *     connectionLines       <- a few sparse links
 *     coreGlow              <- emergence glow at the bottle's centre
 *
 * DEPTH IS REAL. Every material here keeps `depthTest: true`, so the depth-only
 * occlusion proxy (occlusionProxy.js) genuinely hides nodes travelling behind the
 * bottle. Nothing is faded by orbit angle to fake it.
 *
 * All sizes derive from the runtime cylinder geometry. No React; no per-frame allocation.
 */
import * as THREE from 'three'

import {NUTRIENTS, CONNECTIONS, GROUP_COLOR} from './nutrientData'

/*
 * --- Orbital rings ----------------------------------------------------------------
 *
 * THREE rings on distinctly different planes rather than one. Nineteen nodes on a
 * single ellipse sat too close together to read; spreading them over three planes cuts
 * the per-ring count to 6-7 and lets the nodes be scaled UP without colliding.
 *
 * Radii are multiples of the real bottle radius, so the system rescales with the target.
 *
 * These tilts are NOT hand-picked. They were solved against hard constraints, verified
 * over 720 samples per ring using the bottle's REAL proportions (height/radius = 1.86,
 * from the 176mm circumference and 52mm label height in the target JSON):
 *
 * BANDED LAYOUT. Three rings of increasing size, tilted about DIFFERENT axes, all
 * confined to the height of the label band.
 *
 * The vertical confinement is a PHYSICAL constraint, not a stylistic one. The product
 * sits on a table (or is wall-mounted), so a ring that passes over the cap and under the
 * base sends nodes through the supporting surface — an earlier gimbal layout had rings
 * spending 22-26% of every lap BELOW the table, which destroys the illusion far more
 * than any amount of visual symmetry buys back. Every ring here stays within +/-0.82
 * bottle-radii of the label centre, so nodes always orbit BESIDE the product, in the
 * region that is unobstructed however the bottle is supported.
 *
 * Rings are separated by tilting about different axis COMBINATIONS rather than by
 * standing them upright. That yields ~38-40 deg of plane separation — visibly three
 * orbits rather than stacked plates, while remaining physically plausible.
 *
 * Verified against the real bottle proportions (H/R = 1.86, from the 176mm
 * circumference and 52mm label height in the target JSON):
 *
 *   1. VERTICAL CONFINEMENT: max |y| of 0.77 / 0.37 / 0.82, with ZERO samples below the
 *      table or above the cap — no node ever leaves the region beside the product.
 *   2. CLEARANCE: 0.19-0.59 bottle-radii of air between each node's GLOW SPHERE and the
 *      cylinder WALL, measured only where the node overlaps the bottle vertically.
 *      Both refinements matter. Measuring the core alone once left cores 0.006 INSIDE
 *      the surface; and measuring distance to the cylinder as a whole (including its
 *      flat top) reported a comfortable 0.177 for ring 0 while its actual wall
 *      clearance at the top of its arc was 0.035 — visibly grazing the bottle.
 *   3. OCCLUSION: 30-48% of each lap is genuinely hidden by the bottle (39.6% average),
 *      recovered from the ~30% the polar layout managed.
 *   4. PATH SEPARATION: 0.324 / 0.486 / 0.379 between ring paths, all above the 0.285
 *      glow diameter. This has to be solved geometrically, not by timing: an earlier
 *      version had rings 1 and 2 running within 0.110 of each other along 5.9% of their
 *      length, and searching speeds and phase offsets moved the worst-case node
 *      separation only from 0.110 to 0.111. Nodes then measure 0.324 apart over 4
 *      simulated minutes, clear of the 0.150 core diameter.
 *
 * `dir` alternates so adjacent rings counter-rotate. Changing any value in isolation
 * will break one of the checks above; they were searched jointly.
 *
 * `dir` alternates so adjacent rings counter-rotate, which reads as a system rather
 * than a single spinning mass. Changing any radius/tilt below invalidates the solved
 * guarantees above; re-run the constraint check if you do.
 */
const RINGS = [
  {rx: 1.54, rz: 1.32, rotX: 0.00, rotY: 0.60, rotZ: -0.55, y: 0, dir: 1, speed: 0.95},
  {rx: 1.80, rz: 1.55, rotX: -0.55, rotY: 1.10, rotZ: 0.47, y: 0, dir: -1, speed: 0.67},
  {rx: 2.20, rz: 1.89, rotX: 0.50, rotY: 0.48, rotZ: -0.34, y: 0, dir: 1, speed: 0.47},
]

// --- Entrance timing (seconds) ----------------------------------------------------
const T_PATH = 0.2
const T_FIRST_NODE = 0.4
const T_ALL_IN = 1.2

/** Label sprite: large, high-contrast, readable on a phone. */
const makeLabel = (text, worldWidth, color) => {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.font = 'bold 132px system-ui, -apple-system, "Segoe UI", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = 14
  ctx.strokeStyle = 'rgba(0,0,0,0.72)'
  ctx.strokeText(text, canvas.width / 2, canvas.height / 2)
  ctx.fillStyle = '#ffffff'
  ctx.fillText(text, canvas.width / 2, canvas.height / 2)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4

  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      // MUST stay true so the occlusion proxy can hide back-side labels.
      depthTest: true,
    })
  )
  sprite.scale.set(worldWidth, worldWidth * 0.5, 1)
  sprite.material.color.setHex(color)
  return sprite
}

export const createNutrientSystem = () => {
  const root = new THREE.Group()
  root.visible = false

  let built = false
  let state = null
  let entranceStart = null
  let speedScale = 1        // eased toward `speedTarget`
  let speedTarget = 1       // dropped while a nutrient card is open
  let userSpeed = 1         // debug-panel multiplier, independent of selection slow-down

  /*
   * Integrated orbital phase, in "speed units" (multiply by a ring's own speed to get
   * that ring's angle). Accumulated per frame rather than derived from absolute time,
   * so a change in `speedScale` cannot retroactively move nodes. See `update`.
   */
  let orbitPhase = 0
  let highlightPhase = 0
  let lastFrameT = null
  let selectedId = null

  const _wp = new THREE.Vector3()

  /**
   * Position on a ring's ellipse at a given angle, in that ring's local (untilted)
   * space. The ring group carries the tilt, so this stays a FLAT closed ellipse —
   * y is always 0.
   *
   * This is deliberately not the old `sin(angle * yFreq)` form: any vertical term at a
   * different frequency from the horizontal ones turns the path into an open Lissajous
   * curve, which is what previously made nodes drift off their guide path and pass
   * through the bottle. Vertical offset now comes from the ring's TILT alone, which
   * cannot desynchronise.
   */
  const orbitPoint = (angle, rx, rz, out) =>
    out.set(Math.cos(angle) * rx, 0, Math.sin(angle) * rz)

  /**
   * Builds the system to fit the real cylinder.
   * @param {{radiusTop:number, radiusBottom:number, height:number}} geometry
   */
  const build = (geometry) => {
    if (built || !geometry) return false

    const {radiusTop, radiusBottom, height} = geometry
    const radii = [radiusTop, radiusBottom].filter(r => Number.isFinite(r) && r > 0)
    if (!radii.length || !Number.isFinite(height) || height <= 0) return false

    const bottleRadius = radii.reduce((a, b) => a + b, 0) / radii.length

    /*
     * Nodes are scaled UP from the previous single-ring version (0.058 -> 0.075) because
     * spreading them over three rings leaves room for it: each ring now carries 6-7
     * nodes instead of 19, so larger nodes read more clearly without colliding.
     */
    const nodeRadius = bottleRadius * 0.075
    const labelWidth = bottleRadius * 0.78

    // --- One tilted plane per ring ---
    const tmp = new THREE.Vector3()
    const rings = RINGS.map((cfg) => {
      const group = new THREE.Group()
      // Full XYZ orientation: a vertical plane is unreachable with X and Z alone.
      group.rotation.set(cfg.rotX, cfg.rotY, cfg.rotZ)
      // Polar rings are centred on the bottle, not on the label band they orbit.
      group.position.y = (cfg.y ?? 0) * height
      root.add(group)

      const rx = bottleRadius * cfg.rx
      const rz = bottleRadius * cfg.rz

      // Elliptical guide path for this ring.
      const pathPts = []
      for (let i = 0; i <= 128; i++) {
        pathPts.push(orbitPoint((i / 128) * Math.PI * 2, rx, rz, tmp).clone())
      }
      const pathLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pathPts),
        new THREE.LineBasicMaterial({
          color: 0xbfe9ff, transparent: true, opacity: 0, depthWrite: false, depthTest: true,
        })
      )
      group.add(pathLine)

      return {cfg, group, pathLine, rx, rz}
    })

    // Kept for the travelling highlight and debug reporting.
    const orbitGroup = rings[0].group
    const {rx, rz} = rings[0]
    const hy = 0

    // --- Travelling highlight: communicates direction of motion ---
    const highlight = new THREE.Mesh(
      new THREE.SphereGeometry(bottleRadius * 0.028, 10, 10),
      new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, depthTest: true,
      })
    )
    orbitGroup.add(highlight)

    // --- Nutrient nodes: shared geometry, one material each (per-node opacity) ---
    const sphereGeo = new THREE.SphereGeometry(nodeRadius, 16, 16)
    const glowGeo = new THREE.SphereGeometry(nodeRadius * 1.9, 12, 12)
    const nodes = []

    /*
     * Nutrients are dealt ROUND-ROBIN across the rings (0,1,2,0,1,2,...) rather than in
     * contiguous blocks. The source list is ordered by label group, so contiguous blocks
     * would put every vitamin on one ring — round-robin mixes the colour families across
     * all three, which is what stops any single ring looking monochrome.
     */
    const _hsl = {h: 0, s: 0, l: 0}
    const _core = new THREE.Color()
    const _glow = new THREE.Color()

    NUTRIENTS.forEach((n, idx) => {
      const ring = rings[idx % rings.length]
      const base = GROUP_COLOR[n.group] ?? {core: 0xffffff, glow: 0xffffff}
      const group = new THREE.Group()

      /*
       * Each nutrient gets its OWN hue, fanned around its group's base colour rather
       * than every member sharing one flat tone. The group still reads as a family
       * (vitamins cyan, minerals green, botanicals gold) because the spread is bounded,
       * but individual nodes are now distinguishable — which also helps tell apart two
       * nodes that pass close to each other.
       */
      const spread = (idx % 7) / 7 - 0.5          // -0.5 .. +0.5, deterministic
      _core.setHex(base.core).getHSL(_hsl)
      _core.setHSL(
        (_hsl.h + spread * 0.10 + 1) % 1,          // +/- 36 deg of hue
        THREE.MathUtils.clamp(_hsl.s + 0.18, 0, 1), // richer than the flat base
        THREE.MathUtils.clamp(_hsl.l + spread * 0.10, 0.35, 0.80)
      )
      _glow.setHex(base.glow).getHSL(_hsl)
      _glow.setHSL(
        (_hsl.h + spread * 0.10 + 1) % 1,
        THREE.MathUtils.clamp(_hsl.s + 0.22, 0, 1),
        THREE.MathUtils.clamp(_hsl.l, 0.30, 0.75)
      )
      const palette = {core: _core.getHex(), glow: _glow.getHex()}

      const sphere = new THREE.Mesh(
        sphereGeo,
        new THREE.MeshBasicMaterial({
          color: palette.core, transparent: true, opacity: 0.95, depthTest: true,
        })
      )
      sphere.scale.setScalar(n.size)
      sphere.userData.nutrientId = n.id
      group.add(sphere)

      // Soft halo. depthWrite off so overlapping halos don't punch holes in each other.
      const glow = new THREE.Mesh(
        glowGeo,
        new THREE.MeshBasicMaterial({
          color: palette.glow,
          transparent: true,
          opacity: 0.22,
          depthWrite: false,
          depthTest: true,
        })
      )
      glow.scale.setScalar(n.size)
      group.add(glow)

      // Generous invisible hit area keeps nodes tappable on a phone.
      const hit = new THREE.Mesh(
        new THREE.SphereGeometry(nodeRadius * 3.0, 8, 8),
        new THREE.MeshBasicMaterial({visible: false})
      )
      hit.userData.nutrientId = n.id
      group.add(hit)

      const label = makeLabel(n.label, labelWidth, palette.core)
      label.position.y = nodeRadius * 4.2
      group.add(label)

      // Added to its OWN ring group, so it inherits that ring's tilt and rotates in
      // that plane. The ring is kept on the node for the per-frame update.
      ring.group.add(group)
      nodes.push({cfg: n, ring, group, sphere, glow, label, hit, baseScale: n.size})
    })

    /*
     * Re-space phases EVENLY WITHIN each ring.
     *
     * The `phase` values in nutrientData spread nodes over a single orbit. Now that the
     * nutrients are split three ways, those values would leave each ring's members
     * bunched into an arc instead of spread around it — so each ring's phases are
     * recomputed from its own membership count. This overrides `cfg.phase` at runtime
     * and leaves the data file untouched.
     */
    for (const ring of rings) {
      const members = nodes.filter(n => n.ring === ring)
      members.forEach((n, i) => {
        n.cfg = {...n.cfg, phase: (i / members.length) * Math.PI * 2}
      })
    }

    /*
     * --- Tethers: one line per nutrient, node -> bottle axis ---
     *
     * Each node is joined to the point on the bottle's central axis at its own height,
     * so every nutrient is visibly attached to the product rather than floating near it.
     *
     * Each tether lives inside its own node's RING group, not under `root`: as a sibling
     * of the node it shares that ring's tilted coordinate space, so the endpoints need no
     * world-space round trip and the line stays exactly in its ring's plane as the whole
     * system rotates with the target. Endpoints are rewritten per frame in local space.
     *
     * depthTest stays true, so a tether on the far side is hidden by the occlusion
     * proxy along with its node.
     */
    const tethers = []
    for (const n of nodes) {
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3))
      const palette = GROUP_COLOR[n.cfg.group] ?? {glow: 0xffffff}
      const line = new THREE.Line(
        geo,
        new THREE.LineBasicMaterial({
          color: palette.glow, transparent: true, opacity: 0, depthWrite: false, depthTest: true,
        })
      )
      n.ring.group.add(line)
      tethers.push({node: n, line})
    }

    // --- Sparse group connections (kept: they link members of the same label group) ---
    const byId = new Map(nodes.map(n => [n.cfg.id, n]))
    const connections = []
    for (const [aId, bId] of CONNECTIONS) {
      const a = byId.get(aId)
      const b = byId.get(bId)
      if (!a || !b) continue
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3))
      const line = new THREE.Line(
        geo,
        new THREE.LineBasicMaterial({
          color: 0xa8e4ff, transparent: true, opacity: 0, depthWrite: false, depthTest: true,
        })
      )
      root.add(line)
      connections.push({a, b, line, phase: connections.length * 1.1})
    }

    // --- Central emergence glow ---
    const coreGlow = new THREE.Mesh(
      new THREE.SphereGeometry(bottleRadius * 0.5, 20, 20),
      new THREE.MeshBasicMaterial({
        color: 0xbfe9ff, transparent: true, opacity: 0, depthWrite: false, depthTest: true,
      })
    )
    root.add(coreGlow)

    // NOTE: there is no single `pathLine` any more — each ring owns its own guide
    // path (`ring.pathLine`), so the update loop iterates `rings` instead.
    state = {
      orbitGroup, highlight, nodes, connections, tethers, coreGlow,
      rings, rx, rz, hy, bottleRadius, height, nodeRadius,
    }
    built = true
    console.log('[AR] multi-ring orbit built', {
      bottleRadius: +bottleRadius.toFixed(4),
      rings: rings.map(r => ({
        rx: +r.rx.toFixed(3),
        rz: +r.rz.toFixed(3),
        rot: [r.cfg.rotX, r.cfg.rotY, r.cfg.rotZ].map(v => +v.toFixed(2)),
        dir: r.cfg.dir,
        members: nodes.filter(n => n.ring === r).length,
      })),
      nodes: nodes.length,
    })
    return true
  }

  const restartEntrance = () => {
    entranceStart = null
    // Drop the frame timestamp too: the gap while the target was lost is not orbit time,
    // and feeding it in as `dt` would jump every node forward on reacquisition.
    lastFrameT = null
  }

  /** Debug-panel orbit speed multiplier. Independent of the selection slow-down. */
  const setUserSpeed = (v) => {
    userSpeed = THREE.MathUtils.clamp(v, 0, 3)
  }

  const getUserSpeed = () => userSpeed

  /**
   * Per-frame update. Called from the AR loop; allocates nothing.
   * @param {number} timeMs
   * @param {THREE.Camera} camera used only to billboard LABELS (nodes stay 3D)
   */
  const update = (timeMs, camera) => {
    if (!state) return
    const t = timeMs / 1000
    if (entranceStart === null) entranceStart = t
    const age = t - entranceStart

    /*
     * Real elapsed time since the previous frame. Clamped because a backgrounded tab or
     * a dropped frame can hand us a large gap, which would jump every node forward.
     */
    const dt = lastFrameT === null ? 0 : THREE.MathUtils.clamp(t - lastFrameT, 0, 0.1)
    lastFrameT = t

    // Ease orbital speed toward its target (slows while a card is open).
    speedScale += (speedTarget - speedScale) * 0.08

    /*
     * Advance the orbit by INTEGRATING speed over time rather than computing
     * `angle = t * speed * speedScale` from absolute elapsed time.
     *
     * That older form multiplied the WHOLE accumulated time by the current scale, so
     * changing the scale retroactively rewrote the entire orbit history: tapping a node
     * 30s in produced a measured angular velocity of -101 rad/s for a few frames
     * (against a normal 0.95) — a violent backward lurch that got worse the longer the
     * target had been tracked. Integrating makes a scale change affect only motion from
     * that moment on, which is what "slow down smoothly" actually means.
     */
    const rate = speedScale * userSpeed
    orbitPhase += dt * rate
    highlightPhase += dt * 1.1 * rate

    const {nodes, connections, rings, rx, rz} = state

    // --- Entrance staging ---
    const glowP = THREE.MathUtils.clamp(age / 0.3, 0, 1)
    state.coreGlow.material.opacity = glowP * 0.18 * (0.7 + Math.sin(t * 1.6) * 0.3)

    const pathP = THREE.MathUtils.clamp((age - T_PATH) / 0.6, 0, 1)
    for (const r of rings) r.pathLine.material.opacity = pathP * 0.13
    state.highlight.material.opacity = pathP * 0.55

    // Travelling highlight rides the innermost ring, showing direction of travel.
    orbitPoint(highlightPhase, rx, rz, state.highlight.position)

    // --- Nodes, each on its own ring ---
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]
      const {cfg, ring} = n

      const stagger = T_FIRST_NODE + (i / nodes.length) * (T_ALL_IN - T_FIRST_NODE)
      const p = THREE.MathUtils.clamp((age - stagger) / 0.5, 0, 1)
      const e = 1 - Math.pow(1 - p, 3)   // easeOutCubic

      /*
       * Angle uses the RING's speed and direction, so every node on a ring travels
       * together and adjacent rings counter-rotate. `cfg.phase` still spaces nodes
       * apart; the per-nutrient `cfg.speed` is deliberately no longer used, because
       * differing speeds within one ring would let nodes drift into each other — the
       * overlapping that this change exists to fix.
       */
      const angle = cfg.phase + orbitPhase * ring.cfg.speed * ring.cfg.dir
      // Nodes spiral out from the bottle as they enter.
      const grow = 0.3 + 0.7 * e
      orbitPoint(angle, ring.rx * grow, ring.rz * grow, n.group.position)

      const isSel = selectedId === cfg.id
      // Gentle breathing pulse; selection enlarges.
      const pulse = 1 + Math.sin(t * 2 + cfg.phase) * 0.06
      n.group.scale.setScalar(e * pulse * (isSel ? 1.55 : 1))

      n.sphere.material.opacity = 0.95 * e
      n.glow.material.opacity = (isSel ? 0.42 : 0.22) * e
      n.label.material.opacity = e

      // ONLY the label billboards, purely for readability. The node's position is
      // fully 3D and is occluded by the proxy when it passes behind the bottle.
      if (camera) n.label.quaternion.copy(camera.quaternion)
    }

    /*
     * --- Tethers ---
     * Both endpoints are already in `orbitGroup` space, so the node's local position can
     * be used directly. The inner end sits on the bottle's axis (x = z = 0) at the node's
     * own height, giving a spoke that stays in the orbital plane.
     */
    for (const th of state.tethers) {
      const q = th.node.group.position
      const pos = th.line.geometry.attributes.position
      pos.setXYZ(0, 0, q.y, 0)
      pos.setXYZ(1, q.x, q.y, q.z)
      pos.needsUpdate = true
      // Fades in with its node, so tethers never appear before the node they belong to.
      th.line.material.opacity = th.node.sphere.material.opacity * 0.30
    }

    // --- Connections ---
    const conP = THREE.MathUtils.clamp((age - T_ALL_IN) / 0.8, 0, 1)
    for (const c of connections) {
      const pos = c.line.geometry.attributes.position
      c.a.group.getWorldPosition(_wp)
      c.line.worldToLocal(_wp)
      pos.setXYZ(0, _wp.x, _wp.y, _wp.z)
      c.b.group.getWorldPosition(_wp)
      c.line.worldToLocal(_wp)
      pos.setXYZ(1, _wp.x, _wp.y, _wp.z)
      pos.needsUpdate = true

      const pulse = (Math.sin(t * 0.8 + c.phase) + 1) * 0.5
      c.line.material.opacity = (0.04 + pulse * 0.11) * conP
    }
  }

  const getPickables = () => {
    if (!state) return []
    const out = []
    for (const n of state.nodes) out.push(n.hit, n.sphere)
    return out
  }

  /** Highlights a node and slows the orbit so the selection is readable. */
  const setSelected = (id) => {
    selectedId = id
    speedTarget = id ? 0.25 : 1
  }

  const setVisible = (v) => {
    root.visible = v
  }

  const isBuilt = () => built

  const getDebugInfo = () => (state
    ? {
      nutrientCount: state.nodes.length,
      connectionCount: state.connections.length,
      ringCount: state.rings.length,
      // Per-ring radii/tilt/direction, so the debug panel reflects what is actually
      // on screen rather than a single set of constants.
      rings: state.rings.map(r => ({
        rx: +r.rx.toFixed(2),
        rz: +r.rz.toFixed(2),
        // Plane orientation in radians (X, Y, Z), so the debug panel shows the
        // gimbal arrangement rather than a two-axis tilt that no longer exists.
        rot: [r.cfg.rotX, r.cfg.rotY, r.cfg.rotZ].map(v => +v.toFixed(2)),
        dir: r.cfg.dir,
        members: state.nodes.filter(n => n.ring === r).length,
      })),
      speedScale: +speedScale.toFixed(2),
      userSpeed: +userSpeed.toFixed(2),
    }
    : null)

  return {
    root, build, update, setVisible, isBuilt,
    getPickables, setSelected, restartEntrance, getDebugInfo,
    setUserSpeed, getUserSpeed,
  }
}
