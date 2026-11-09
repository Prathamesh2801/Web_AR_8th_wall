/**
 * productOutline.js — the lock cue: traces the whole product's silhouette (base, body,
 * shoulder, neck, cap) the moment the bottle is detected, then gets out of the way.
 *
 * Timeline: trace (drawDuration) -> hold -> fade while a glint runs up the edge -> rest.
 * At rest it is invisible while a lens-menu effect plays (`setSolo(false)`), and a faint
 * breathing line (`idleOpacity`) when it is alone, so the user still sees the lock.
 * The label-band rings (`showLabelBand`) mark the 52mm region the engine tracks — a
 * calibration aid, off by default.
 *
 * HOW
 * The bottle is a surface of revolution, so its silhouette from any side is its
 * profile curve at the two azimuths 90 deg from the camera. `facing` is turned about
 * the bottle's axis every frame so its +z points at the camera; the profile tubes sit
 * at x = +/-r inside it and therefore always lie on the visible edges. Label rings are
 * front half-arcs for the same reason; the cap top is a full ring, since from above
 * both halves are visible. The base is a front half-arc (`showBase`).
 *
 * `depthTest: false` on purpose: the outline IS the product's own edge, and the
 * occlusion proxy is a plain cylinder that would otherwise hide the narrower neck and
 * cap. Nothing in the scene should hide the edge of the thing being tracked.
 *
 * The shape is PRODUCT.profile in config — the same model the occlusion proxy uses.
 */
import * as THREE from 'three'

import {PRODUCT} from '../config'
import {liveColor} from './liveColor'
import {RenderOrder} from './renderOrder'

const GLINT_COLOR = '#FFF8E0'
const GLINT_LENGTH = 0.18 // of the edge
const easeOut = t => 1 - Math.pow(1 - t, 3)
const clamp01 = t => Math.min(Math.max(t, 0), 1)

export const createProductOutline = (cfg) => {
  const root = new THREE.Group()
  const facing = new THREE.Group()
  root.add(facing)

  const material = color => new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0, depthTest: false, depthWrite: false,
  })
  const edgeMat = material(cfg.color)
  const ringMat = material(cfg.color)
  const bandMat = material(cfg.labelBandColor)
  const glintMat = material(GLINT_COLOR)

  let state = null
  let start = null
  let last = null
  let solo = true // no other effect playing
  let rest = 0    // current resting level, eased toward its target
  const _cam = new THREE.Vector3()

  const build = ({radiusTop, radiusBottom, height}) => {
    const R = (radiusTop + radiusBottom) / 2
    if (state || !(R > 0) || !(height > 0)) return false
    const tube = R * cfg.thickness

    const add = (geo, mat, parent) => {
      const mesh = new THREE.Mesh(geo, mat)
      mesh.renderOrder = RenderOrder.PRODUCT_OUTLINE
      parent.add(mesh)
      return mesh
    }

    // Silhouette edges: one tube along the profile, drawn base -> cap, used twice.
    const profile = cfg.showBase ? PRODUCT.profile : PRODUCT.profile.filter(([y]) => y >= -0.5)
    const path = new THREE.CatmullRomCurve3(
      profile.map(([y, r]) => new THREE.Vector3(r * R, y * height, 0)),
      false,
      'centripetal' // no overshoot at the neck / cap-lip corners
    )
    const edgeGeo = new THREE.TubeGeometry(path, 160, tube, 6, false)
    add(edgeGeo, edgeMat, facing)
    add(edgeGeo, edgeMat, facing).rotation.y = Math.PI
    // Own copy: the glint needs its own moving draw range.
    const glintGeo = edgeGeo.clone()
    add(glintGeo, glintMat, facing)
    add(glintGeo, glintMat, facing).rotation.y = Math.PI

    /** Horizontal ring; `arc` = PI gives the camera-facing half (z >= 0). */
    const ring = (radius, y, arc, mat, parent, thickness = tube) => {
      const mesh = add(new THREE.TorusGeometry(radius, thickness, 6, 64, arc), mat, parent)
      mesh.rotation.x = Math.PI / 2
      mesh.position.y = y
    }
    const [yTop, rTop] = profile[profile.length - 1]
    if (cfg.showBase) ring(profile[0][1] * R, profile[0][0] * height, Math.PI, ringMat, facing)
    ring(rTop * R, yTop * height, Math.PI * 2, ringMat, root)
    if (cfg.showLabelBand) {
      for (const y of [0.5, -0.5]) ring(R, y * height, Math.PI, bandMat, facing, tube * 0.6)
    }

    state = {edgeGeo, glintGeo, edgeIndices: edgeGeo.index.count}
    return true
  }

  const restartEntrance = () => {
    start = null
  }

  /** bottleScene: true when no other effect is playing. */
  const setSolo = (v) => {
    solo = v
  }

  const update = (timeMs, camera) => {
    if (!state) return
    const t = timeMs / 1000
    if (start === null) start = t
    const dt = last === null ? 0 : Math.min(t - last, 0.1)
    last = t
    const age = t - start
    const D = cfg.drawDuration / 1000
    const fadeAt = D + cfg.holdDuration / 1000
    const F = Math.max(cfg.fadeDuration / 1000, 0.001)

    // Turn the silhouette plane toward the camera (camera position in bottle space).
    if (camera) {
      root.worldToLocal(_cam.setFromMatrixPosition(camera.matrixWorld))
      facing.rotation.y = Math.atan2(_cam.x, _cam.z)
    }

    // Trace: edges grow from the base up to the cap, then the rings fade in.
    const n = state.edgeIndices
    const p = easeOut(clamp01(age / D))
    state.edgeGeo.setDrawRange(0, Math.floor((p * n) / 3) * 3)
    const rings = clamp01((age - D * 0.6) / (D * 0.5))

    // Rest level: faint when alone, gone while an effect plays; eased so a menu
    // switch never pops it.
    const target = solo ? cfg.idleOpacity : 0
    rest += (target - rest) * (1 - Math.exp(-dt / 0.4))
    const f = easeOut(clamp01((age - fadeAt) / F)) // 0 = full, 1 = resting
    const breath = f >= 1 ? 1 - (1 - Math.cos((age - fadeAt - F) * cfg.pulseSpeed)) * 0.3 : 1
    const level = (cfg.opacity + (rest - cfg.opacity) * f) * breath

    liveColor(edgeMat.color, cfg.color)
    liveColor(ringMat.color, cfg.color)
    liveColor(bandMat.color, cfg.labelBandColor)
    edgeMat.opacity = level
    ringMat.opacity = level * rings
    bandMat.opacity = level * 0.6 * rings

    // Glint: one bright segment runs base -> cap as the line fades.
    const g = (age - fadeAt) / (F * 1.3)
    if (g > 0 && g < 1) {
      const head = easeOut(g) * (1 + GLINT_LENGTH)
      const a = Math.max(0, head - GLINT_LENGTH), b = Math.min(1, head)
      const i0 = Math.floor((a * n) / 3) * 3
      state.glintGeo.setDrawRange(i0, Math.max(0, Math.floor((b * n) / 3) * 3 - i0))
      glintMat.opacity = cfg.opacity * Math.sin(Math.PI * g)
    } else {
      glintMat.opacity = 0
    }
  }

  const getDebugInfo = () => ({
    outlineDrawn: state ? +clamp01(state.edgeGeo.drawRange.count / state.edgeIndices).toFixed(2) : 0,
  })

  return {root, build, update, restartEntrance, setSolo, getDebugInfo}
}
