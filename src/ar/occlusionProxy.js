/**
 * occlusionProxy.js
 *
 * A depth-only stand-in for the physical bottle.
 *
 * The bottle is camera footage, not geometry, so nothing in the scene naturally hides
 * content passing behind it. This mesh writes DEPTH but no COLOUR: invisible, yet it
 * hides anything drawn behind it, which is what makes an orbit read as going AROUND
 * the bottle rather than over it.
 *
 *   colorWrite: false  -> contributes nothing to the image
 *   depthWrite: true   -> still fills the depth buffer
 *   renderOrder: -1    -> drawn before everything else, so their depth test can fail
 *
 * `visible = false` would NOT work: invisible objects are skipped and write no depth.
 * The engine clears the depth buffer every frame, so nothing leaks between frames.
 *
 * Shape: PRODUCT.profile lathed around the axis — the same model the outline draws,
 * so what you see outlined is exactly what occludes. Closed top and bottom so it also
 * hides things from above and below. Inset 2% so it never clips content grazing the
 * real edge.
 *
 * Any material that should be hidden behind the bottle MUST keep `depthTest: true`.
 */
import * as THREE from 'three'

import {PRODUCT} from '../config'
import {RenderOrder} from './renderOrder'

const INSET = 0.98

export const createOcclusionProxy = () => {
  const group = new THREE.Group()
  let built = false

  /** @param {{radiusTop:number, radiusBottom:number, height:number}} geometry */
  const build = ({radiusTop, radiusBottom, height}) => {
    const R = (radiusTop + radiusBottom) / 2
    if (built || !(R > 0) || !(height > 0)) return false

    const {profile} = PRODUCT
    const yBase = profile[0][0] * height
    const yTop = profile[profile.length - 1][0] * height
    const points = [
      new THREE.Vector2(0, yBase),
      ...profile.map(([y, r]) => new THREE.Vector2(r * R * INSET, y * height)),
      new THREE.Vector2(0, yTop),
    ]

    const mesh = new THREE.Mesh(
      new THREE.LatheGeometry(points, 32),
      new THREE.MeshBasicMaterial({
        colorWrite: false,
        depthWrite: true,
        depthTest: true,
        side: THREE.DoubleSide, // lathe winding varies; depth must be written regardless
      })
    )
    mesh.renderOrder = RenderOrder.OCCLUDER
    group.add(mesh)
    built = true
    return true
  }

  return {group, build, isBuilt: () => built}
}
