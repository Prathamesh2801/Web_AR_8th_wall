/**
 * brandTextSystem.js
 *
 * Floating brand-text panels anchored to the tracked bottle.
 *
 * Implements the ANIMATION MODULE CONTRACT in src/config.js, so it is switched on and
 * off from there and needs no changes in bottleScene.js.
 *
 * DESIGN
 * Panels sit to the LEFT, RIGHT and ABOVE the bottle, positioned in multiples of the
 * tracked cylinder's own radius and height — so they scale with the real product and
 * stay clear of it however far away the phone is.
 *
 * Motion is deliberately restrained: a staggered fade-and-slide entrance, then a slow
 * vertical drift with a slight parallax offset per panel. Text that spins or bounces
 * becomes hard to read on a phone at arm's length, which defeats the point of putting
 * brand copy in the scene.
 *
 * THE BOTTLE DRIVES THE ANIMATION
 * Panels turn to face the camera about the vertical axis only (yaw-billboarding). A
 * full billboard would let text tilt with the phone; locking pitch and roll keeps every
 * line horizontal while still turning to meet the viewer, so walking around the bottle
 * swings the panels around it. Each panel's emphasis is also driven by how squarely it
 * faces the camera, so the copy you are looking at is the copy that reads brightest.
 *
 * DEPTH
 * Every material keeps `depthTest: true`, so the occlusion proxy hides a panel that
 * passes behind the bottle exactly as it does the orbital nodes.
 */
import * as THREE from 'three'

import {TEXT_PANELS} from './brandTextData'

/** Entrance timing (seconds after the target is acquired). */
const T_FADE = 0.55

/** Drift: slow enough to feel alive without pulling the eye off the words. */
const DRIFT_AMPLITUDE = 0.055   // multiples of bottle radius
const DRIFT_SPEED = 0.55        // rad/s

/** Horizontal distance from the bottle's axis, in bottle radii. */
const SIDE_DISTANCE = 2.25
const TOP_DISTANCE = 1.55       // multiples of half-height, above the cap

/**
 * Renders one text line to a canvas texture.
 *
 * Canvas rather than a 3D font: it needs no font asset to load (a failed font fetch
 * would leave the panel blank), gives crisp text at a fraction of the geometry cost,
 * and lets the stroke carry legibility over a busy camera feed.
 */
const makeTextSprite = (line, pxPerUnit) => {
  const canvas = document.createElement('canvas')
  const fontPx = 128
  const font = `${line.weight} ${fontPx}px system-ui, -apple-system, "Segoe UI", sans-serif`

  // Measure first so the canvas is only as wide as the text: a fixed-width canvas
  // would letterbox short lines and squash long ones when mapped onto the sprite.
  const measure = canvas.getContext('2d')
  measure.font = font
  const textW = Math.max(1, Math.ceil(measure.measureText(line.text).width))

  const padX = Math.ceil(fontPx * 0.35)
  const padY = Math.ceil(fontPx * 0.3)
  canvas.width = textW + padX * 2
  canvas.height = fontPx + padY * 2

  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.font = font
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  // Dark outline so white and gold stay readable against a pale background.
  ctx.lineWidth = fontPx * 0.14
  ctx.lineJoin = 'round'
  ctx.strokeStyle = 'rgba(0,0,0,0.65)'
  ctx.strokeText(line.text, canvas.width / 2, canvas.height / 2)

  ctx.fillStyle = `#${line.color.toString(16).padStart(6, '0')}`
  ctx.fillText(line.text, canvas.width / 2, canvas.height / 2)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  tex.needsUpdate = true

  const material = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    // MUST stay true so the occlusion proxy can hide panels behind the bottle.
    depthTest: true,
    side: THREE.DoubleSide,
  })

  const height = (canvas.height / fontPx) * line.size * pxPerUnit
  const width = height * (canvas.width / canvas.height)
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material)
  return {mesh, width, height}
}

export const createBrandTextSystem = () => {
  const root = new THREE.Group()
  root.visible = false

  let built = false
  let state = null
  let entranceStart = null
  let userSpeed = 1
  let lastFrameT = null
  let driftPhase = 0

  // Scratch vectors, reused every frame so `update` allocates nothing.
  const _camPos = new THREE.Vector3()
  const _panelPos = new THREE.Vector3()
  const _toCam = new THREE.Vector3()
  const _rootPos = new THREE.Vector3()
  const _outward = new THREE.Vector3()

  /**
   * Builds the panels around the real cylinder.
   * @param {{radiusTop:number, radiusBottom:number, height:number}} geometry
   */
  const build = (geometry) => {
    if (built || !geometry) return false

    const {radiusTop, radiusBottom, height} = geometry
    const radii = [radiusTop, radiusBottom].filter(r => Number.isFinite(r) && r > 0)
    if (!radii.length || !Number.isFinite(height) || height <= 0) return false

    const bottleRadius = radii.reduce((a, b) => a + b, 0) / radii.length
    // Line height is expressed in bottle radii so text scales with the product.
    const pxPerUnit = bottleRadius * 0.42

    const panels = TEXT_PANELS.map((cfg, index) => {
      const group = new THREE.Group()

      // Stack the lines, each centred on the panel's own axis.
      const meshes = []
      let y = 0
      for (const line of cfg.lines) {
        const {mesh, height: h} = makeTextSprite(line, pxPerUnit)
        mesh.position.y = -y
        y += h * 0.78     // slight overlap keeps the block tight rather than airy
        group.add(mesh)
        meshes.push(mesh)
      }
      // Re-centre vertically so the block hangs about its anchor point.
      for (const m of meshes) m.position.y += y / 2

      /*
       * Anchor position. Sides sit out at SIDE_DISTANCE radii; the top panel clears the
       * cap. All values derive from the tracked geometry, so the layout holds for any
       * target size.
       */
      const half = height / 2
      const base = new THREE.Vector3()
      if (cfg.side === 'left') base.set(-bottleRadius * SIDE_DISTANCE, 0, 0)
      else if (cfg.side === 'right') base.set(bottleRadius * SIDE_DISTANCE, 0, 0)
      else base.set(0, half * TOP_DISTANCE + bottleRadius * 0.5, 0)

      base.y += (cfg.offsetY ?? 0) * bottleRadius
      group.position.copy(base)

      root.add(group)
      return {
        cfg,
        group,
        meshes,
        base: base.clone(),
        // Parallax: each panel drifts on its own phase so they never move in lockstep.
        phase: index * 1.7,
        baseOpacity: cfg.dim ? 0.55 : 1,
      }
    })

    state = {panels, bottleRadius, height}
    built = true
    console.log('[AR] brand text built', {
      panels: panels.length,
      bottleRadius: +bottleRadius.toFixed(4),
    })
    return true
  }

  const restartEntrance = () => {
    entranceStart = null
    lastFrameT = null
  }

  const setUserSpeed = (v) => {
    userSpeed = THREE.MathUtils.clamp(v, 0, 3)
  }

  /**
   * Per-frame update. Allocates nothing.
   * @param {number} timeMs
   * @param {THREE.Camera} camera
   */
  const update = (timeMs, camera) => {
    if (!state) return
    const t = timeMs / 1000
    if (entranceStart === null) entranceStart = t
    const age = t - entranceStart

    /*
     * Drift is INTEGRATED rather than read from absolute time, for the same reason the
     * orbit is: multiplying elapsed time by a changing speed retroactively rewrites the
     * motion, which shows up as a jump the moment the speed control is touched.
     */
    const dt = lastFrameT === null ? 0 : THREE.MathUtils.clamp(t - lastFrameT, 0, 0.1)
    lastFrameT = t
    driftPhase += dt * userSpeed

    if (camera) camera.getWorldPosition(_camPos)
    // The bottle's own world position: panel emphasis is measured relative to it.
    root.getWorldPosition(_rootPos)

    for (const p of state.panels) {
      // --- Staggered entrance: fade in while rising into place ---
      const local = THREE.MathUtils.clamp((age - p.cfg.delay) / T_FADE, 0, 1)
      const eased = 1 - Math.pow(1 - local, 3)   // easeOutCubic

      // --- Slow vertical drift, per-panel phase ---
      const drift = Math.sin(driftPhase * DRIFT_SPEED + p.phase) *
        DRIFT_AMPLITUDE * state.bottleRadius

      p.group.position.set(
        p.base.x,
        // Rises the last few percent into position as it fades in.
        p.base.y + drift - (1 - eased) * state.bottleRadius * 0.35,
        p.base.z
      )

      let facing = 1
      if (camera) {
        /*
         * YAW-ONLY billboarding. A full `quaternion.copy(camera.quaternion)` would let
         * the text pitch and roll with the phone; flattening the look vector to the
         * horizontal plane keeps every line level while still turning to meet the
         * viewer. Walking around the bottle therefore swings the panels around it.
         */
        p.group.getWorldPosition(_panelPos)
        _toCam.subVectors(_camPos, _panelPos)
        _toCam.y = 0
        if (_toCam.lengthSq() > 1e-8) {
          _toCam.normalize()
          p.group.rotation.set(0, Math.atan2(_toCam.x, _toCam.z), 0)

          /*
           * Emphasis from viewing angle: a panel square-on to the camera reads at full
           * strength, one seen edge-on fades back. This is what ties the text to the
           * bottle's position — the copy you are facing is the copy that stands out.
           *
           * `_outward` is the direction from the bottle's axis out to the panel, so its
           * dot with the panel-to-camera vector says whether the viewer is in front of
           * that panel or behind it. Reuses module-level scratch vectors: this runs for
           * every panel every frame and must not allocate.
           */
          _outward.subVectors(_panelPos, _rootPos)
          _outward.y = 0
          if (_outward.lengthSq() > 1e-8) {
            _outward.normalize()
            facing = THREE.MathUtils.clamp(0.45 + 0.55 * _outward.dot(_toCam), 0.28, 1)
          }
        }
      }

      const opacity = eased * p.baseOpacity * facing
      for (const m of p.meshes) m.material.opacity = opacity
    }
  }

  const setVisible = (v) => {
    root.visible = v
  }

  const isBuilt = () => built

  const getDebugInfo = () => (state
    ? {
      textPanels: state.panels.length,
      textUserSpeed: +userSpeed.toFixed(2),
    }
    : null)

  return {
    root, build, update, setVisible, isBuilt,
    restartEntrance, setUserSpeed, getDebugInfo,
  }
}
