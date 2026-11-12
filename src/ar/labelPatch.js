/**
 * labelPatch.js — hides a printed element while its 3D copy is off the label.
 *
 * A piece of the label art WITHOUT that element (a PNG with feathered edges, made from the
 * brand's sticker source), laid on the label cylinder exactly over the print. Its colour
 * comes from the CAMERA: the real paper in that spot, now (cameraLight.paperAt), so it
 * takes the scene's exposure, tint and the bottle's shading instead of showing as a
 * bright pasted rectangle. Matched in vertical strips, blended across its width, because the
 * real label is shaded across the bottle's curve. Without camera data: room brightness.
 *
 * Used by logoLift.js (the lifted logo); reusable for any element lifted off the label.
 */
import * as THREE from 'three'

import {PRODUCT} from '../config'
import {cameraLight, paperAt} from './cameraLight'
import {RenderOrder} from './renderOrder'

const TAU = Math.PI * 2
const PAPER = new THREE.Color('#F6F8F3') // the label paper in the patch art (linear)

/**
 * @param R, H     label cylinder radius / height (engine units)
 * @param box      {x0, x1, top, base} on the flat label, 0..1 (left->right, top->bottom)
 * @param image    URL of the patch PNG (covers exactly `box`)
 * @param azOffset calibration rotation (rad), the same one the effect's copy uses
 */
export const createLabelPatch = ({R, H, box, image, azOffset = 0}) => {
  const {mm} = PRODUCT
  const span = (mm.labelWidth / mm.circumference) * TAU
  const a0 = (box.x0 - 0.5) * span + azOffset
  const a1 = (box.x1 - 0.5) * span + azOffset
  const h = (box.base - box.top) * H
  const yc = (0.5 - (box.top + box.base) / 2) * H
  const pr = R * 1.003 // over the print, under the 3D copy's flat start (1.004)

  const tex = new THREE.TextureLoader().load(image)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  const SEG = 32
  const geo = new THREE.CylinderGeometry(pr, pr, h, SEG, 1, true, a0, a1 - a0)
  const colors = new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3).fill(1), 3)
  geo.setAttribute('color', colors)
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    map: tex, vertexColors: true, transparent: true, opacity: 0, depthWrite: false,
  }))
  mesh.position.y = yc
  mesh.renderOrder = RenderOrder.LABEL_PATCH
  mesh.visible = false

  // The real label is shaded across the bottle's curve: match it in COLS vertical strips,
  // blended across the width (vertex colours), not one flat colour.
  const COLS = 4
  const strips = Array.from({length: COLS}, (_, k) => {
    const ac = a0 + ((k + 0.5) / COLS) * (a1 - a0)
    const ae = ac + (0.5 / COLS) * (a1 - a0)
    return {
      centre: new THREE.Vector3(pr * Math.sin(ac), yc, pr * Math.cos(ac)),
      top: new THREE.Vector3(pr * Math.sin(ac), yc + h / 2, pr * Math.cos(ac)),
      side: new THREE.Vector3(pr * Math.sin(ae), yc, pr * Math.cos(ae)),
      target: new THREE.Color(1, 1, 1),
      now: new THREE.Color(1, 1, 1),
      seen: [0, 0, 0], // sRGB 0..255, for the dashboard
    }
  })
  const c = new THREE.Vector3()
  const e = new THREE.Vector3()
  const seen = new THREE.Color()
  const tmp = new THREE.Color()
  let version = 0
  let source = 'none'

  /** Per frame: `opacity` 0..1 (0 = print showing), `dt` ms, `brightness` x the match. */
  const update = (camera, root, opacity, dt, brightness = 1) => {
    mesh.visible = opacity > 0.001
    mesh.material.opacity = opacity
    if (!mesh.visible || !camera) return
    let v = 0
    for (const st of strips) {
      root.localToWorld(c.copy(st.centre)).project(camera)
      root.localToWorld(e.copy(st.top)).project(camera)
      const halfY = Math.abs(e.y - c.y)
      root.localToWorld(e.copy(st.side)).project(camera)
      const halfX = Math.abs(e.x - c.x)
      // Inside the strip, away from the patch's feathered rim.
      const sv = c.z < 1 ? paperAt(c.x, c.y, halfX * 0.9, halfY * 0.7, camera.aspect, seen) : 0
      if (sv && sv !== version) {
        st.target.setRGB(seen.r / PAPER.r, seen.g / PAPER.g, seen.b / PAPER.b).multiplyScalar(brightness)
        tmp.copy(seen).convertLinearToSRGB()
        st.seen[0] = Math.round(tmp.r * 255); st.seen[1] = Math.round(tmp.g * 255); st.seen[2] = Math.round(tmp.b * 255)
      }
      v = v || sv
    }
    if (v) { version = v; source = 'camera' }
    else if (!version) {
      source = 'fallback'
      const L = cameraLight.ready ? cameraLight.luma : 0.18
      for (const st of strips) st.target.setScalar(Math.min(1, Math.max(0.45, Math.sqrt(L / 0.18) * brightness)))
    }
    // Ease, then spread across the width: each vertex column between its two strips.
    const k = Math.min(1, dt / 150)
    for (const st of strips) st.now.lerp(st.target, k)
    for (let i = 0; i < colors.count; i++) {
      const f = Math.min(Math.max(((i % (SEG + 1)) / SEG) * COLS - 0.5, 0), COLS - 1)
      const j = Math.min(Math.floor(f), COLS - 2)
      tmp.copy(strips[j].now).lerp(strips[j + 1].now, f - j)
      colors.setXYZ(i, tmp.r, tmp.g, tmp.b)
    }
    colors.needsUpdate = true
  }

  /** For the dashboard: where the colour comes from, and the paper seen per strip. */
  const info = () => `${source}${source === 'camera' ? ' ' + strips.map(st => st.seen.join(',')).join(' | ') : ''}`

  return {mesh, update, info, reset: () => { version = 0; source = 'none' }}
}
