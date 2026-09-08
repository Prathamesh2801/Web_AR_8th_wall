/**
 * bottleScene.js
 *
 * Owns the three.js content attached to the tracked cylindrical target, and the
 * tap-picking that turns a screen touch into a selected nutrient.
 *
 * No React. The only outward crossing is `onSelect`, invoked on a successful tap.
 */
import * as THREE from 'three'

import {createNutrientSystem} from './nutrientSystem'
import {createOcclusionProxy} from './occlusionProxy'
import {NUTRIENTS} from './nutrientData'

const NUTRIENT_BY_ID = new Map(NUTRIENTS.map(n => [n.id, n]))

export const createBottleScene = ({onSelect} = {}) => {
  // Driven directly by the tracker. Hidden until the target is found.
  const anchor = new THREE.Group()
  anchor.visible = false

  // Depth-only stand-in for the physical bottle. Added FIRST so its depth is written
  // before the orbital content, letting back-side nodes fail the depth test naturally.
  const occluder = createOcclusionProxy()
  anchor.add(occluder.group)

  const nutrients = createNutrientSystem()
  anchor.add(nutrients.root)

  let camera = null
  let canvas = null
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()

  /**
   * Converts a pointer event to normalised device coordinates and picks a node.
   *
   * Uses the canvas bounding rect rather than window size, so it stays correct
   * regardless of canvas placement or device pixel ratio.
   */
  const handleTap = (clientX, clientY) => {
    if (!camera || !canvas || !anchor.visible) return
    const rect = canvas.getBoundingClientRect()
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1

    raycaster.setFromCamera(pointer, camera)
    const hits = raycaster.intersectObjects(nutrients.getPickables(), false)
    if (!hits.length) return

    const id = hits[0].object.userData.nutrientId
    if (!id) return

    nutrients.setSelected(id)
    onSelect?.(NUTRIENT_BY_ID.get(id) ?? null)
  }

  /** Adds lights + the anchor to the XR scene, and wires tap picking. */
  const addToScene = (scene, xrCamera, xrCanvas) => {
    camera = xrCamera
    canvas = xrCanvas

    // Materials are unlit; ambient is a gentle fill in case lit materials are added.
    scene.add(new THREE.AmbientLight(0xffffff, 1.0))
    scene.add(anchor)

    // pointerup (not pointerdown) so a drag/scroll gesture does not select.
    canvas.addEventListener('pointerup', (e) => {
      handleTap(e.clientX, e.clientY)
    })
  }

  /**
   * Builds the occluder and orbit from the engine's reported cylinder geometry.
   * Runs once; both are sized from the same real measurements.
   */
  const fitToGeometry = (geometry) => {
    if (nutrients.isBuilt()) return
    occluder.build(geometry)
    if (nutrients.build(geometry)) nutrients.setVisible(true)
  }

  /**
   * Welds the content to the tracked cylinder.
   *
   * For CYLINDRICAL/CONICAL targets the engine's reported position/rotation are used
   * DIRECTLY (the planar re-centering correction applies only to FLAT targets). Because
   * the nutrient system is a CHILD of this anchor, the whole orbital system inherits the
   * bottle's pose automatically — no transform is duplicated onto individual nodes.
   */
  const applyPose = ({position, rotation, scale}) => {
    anchor.position.set(position.x, position.y, position.z)
    anchor.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w)
    anchor.scale.setScalar(scale)
    anchor.visible = true
  }

  const hide = () => {
    anchor.visible = false
    // Replay the staged entrance next time the bottle is reacquired.
    nutrients.restartEntrance()
    nutrients.setSelected(null)
  }

  /** Per-frame animation, driven by the AR loop. */
  const update = (timeMs) => {
    nutrients.update(timeMs, camera)
  }

  const getDebugInfo = () => {
    const info = nutrients.getDebugInfo()
    return info ? {...info, occlusionEnabled: occluder.isEnabled()} : null
  }

  /**
   * Reveals the wireframe of the invisible occlusion cylinder.
   *
   * This is the surface that actually does the hiding, so showing it makes the orbit
   * verifiable by eye: nodes should pass cleanly outside the wireframe on the near
   * side and disappear behind it on the far side, never crossing through it.
   */
  const setOutlineVisible = (v) => {
    occluder.setOutlineVisible(v)
  }

  /** Scales orbit speed from the debug controls. 0 freezes the orbit. */
  const setOrbitSpeed = (v) => {
    nutrients.setUserSpeed(v)
  }

  return {
    anchor, addToScene, applyPose, fitToGeometry, hide, update, getDebugInfo,
    setOutlineVisible, setOrbitSpeed,
  }
}
