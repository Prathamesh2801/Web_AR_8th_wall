/**
 * bottleScene.js
 *
 * Owns the three.js content attached to the tracked cylindrical target, and the
 * tap-picking that turns a screen touch into a selected item.
 *
 * This file knows nothing about any SPECIFIC animation. It builds whichever animations
 * are switched on in src/config.js, drives them through the shared module contract
 * documented there, and forwards optional calls only to the modules that implement
 * them. Adding an animation therefore does not require editing this file.
 *
 * No React. The only outward crossing is `onSelect`, invoked on a successful tap.
 */
import * as THREE from 'three'

import {ANIMATION_FACTORIES} from './animations'
import {createOcclusionProxy} from './occlusionProxy'
import {NUTRIENTS} from './nutrientData'
import {OCCLUSION, enabledAnimationIds, animationConfig} from '../config'

const NUTRIENT_BY_ID = new Map(NUTRIENTS.map(n => [n.id, n]))

export const createBottleScene = ({onSelect} = {}) => {
  // Driven directly by the tracker. Hidden until the target is found.
  const anchor = new THREE.Group()
  anchor.visible = false

  // Depth-only stand-in for the physical bottle. Added FIRST so its depth is written
  // before the animated content, letting back-side objects fail the depth test naturally.
  const occluder = createOcclusionProxy()
  if (OCCLUSION.enabled) anchor.add(occluder.group)

  /**
   * The enabled animations, instantiated once at construction.
   *
   * An id with no registered factory is reported and skipped rather than throwing: a
   * typo in config should not take down the whole AR experience.
   */
  const animations = enabledAnimationIds().flatMap((id) => {
    const factory = ANIMATION_FACTORIES[id]
    if (!factory) {
      console.warn(`[AR] no factory registered for animation "${id}" - skipping`)
      return []
    }
    const instance = factory(animationConfig(id))
    anchor.add(instance.root)
    return [{id, instance}]
  })

  console.log('[AR] animations enabled:', animations.map(a => a.id))

  let camera = null
  let canvas = null
  // Set once by fitToGeometry; see the comment there for why this must not be derived
  // from the animations' own built state.
  let hasFitted = false
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()

  /** Calls `method` on every animation that implements it. */
  const forEachAnimation = (method, ...args) => {
    for (const {instance} of animations) instance[method]?.(...args)
  }

  /**
   * Converts a pointer event to normalised device coordinates and picks an object.
   *
   * Uses the canvas bounding rect rather than window size, so it stays correct
   * regardless of canvas placement or device pixel ratio.
   */
  const handleTap = (clientX, clientY) => {
    if (!camera || !canvas || !anchor.visible) return
    const rect = canvas.getBoundingClientRect()
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1

    // Pickables from every animation that offers any, so more than one can be tappable.
    const pickables = animations.flatMap(({instance}) => instance.getPickables?.() ?? [])
    if (!pickables.length) return

    raycaster.setFromCamera(pointer, camera)
    const hits = raycaster.intersectObjects(pickables, false)
    if (!hits.length) return

    const id = hits[0].object.userData.nutrientId
    if (!id) return

    // Only notify outward. The three.js side is updated by `setSelected` below, which
    // the store drives — see the comment there for why this must not be set directly.
    onSelect?.(NUTRIENT_BY_ID.get(id) ?? null)
  }

  /**
   * Applies the selection to the 3D scene. Driven by the tracking store, which is the
   * single source of truth for what is selected.
   *
   * This exists because the selection can be cleared from THREE places: tapping another
   * node, closing the card in React, and losing the target. Previously only the tap path
   * called into three.js, so closing the card updated React but left the 3D system still
   * believing a node was selected — its orbit stayed at the 0.25x "reading" speed
   * permanently, and the debug speed multiplier then scaled that reduced value (3x
   * reached only 0.70x of normal). Routing every path through the store prevents the two
   * from drifting apart.
   */
  const setSelected = (nutrientId) => {
    forEachAnimation('setSelected', nutrientId)
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
   * Builds the occluder and every enabled animation from the engine's reported cylinder
   * geometry. Runs once; all are sized from the same real measurements.
   */
  const fitToGeometry = (geometry) => {
    /*
     * `reality.imageupdated` fires every tracked frame, so this runs continuously —
     * it must be idempotent. The guard is a plain "have we already fitted?" flag rather
     * than a check over the animations: when no animation is enabled the old
     * `animations.length && ...` condition was falsy, so the body re-ran every frame and
     * `setOutlineVisible(OCCLUSION.showOutline)` kept resetting the user's toggle back
     * to its config default ~30 times a second. The outline switched on and was wiped
     * before the next frame drew.
     */
    if (hasFitted) return
    hasFitted = true

    if (OCCLUSION.enabled) {
      occluder.build(geometry)
      // Applied ONCE, here, so this is a starting value and not a per-frame override.
      occluder.setOutlineVisible(OCCLUSION.showOutline)
    }

    for (const {instance} of animations) {
      if (instance.isBuilt?.()) continue
      if (instance.build(geometry)) instance.setVisible?.(true)
    }
  }

  /**
   * Welds the content to the tracked cylinder.
   *
   * For CYLINDRICAL/CONICAL targets the engine's reported position/rotation are used
   * DIRECTLY (the planar re-centering correction applies only to FLAT targets). Because
   * the animations are CHILDREN of this anchor, they inherit the bottle's pose
   * automatically — no transform is duplicated onto individual objects.
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
    forEachAnimation('restartEntrance')
    forEachAnimation('setSelected', null)
  }

  /** Per-frame animation, driven by the AR loop. */
  const update = (timeMs) => {
    for (const {instance} of animations) instance.update(timeMs, camera)
  }

  /**
   * Debug info from every animation, merged with the occluder's own status.
   *
   * Deliberately NOT null when no animation is enabled. Occlusion is independent of the
   * animations, so its status must still be reported with them all switched off —
   * otherwise the panel's whole debug section disappears and the outline looks broken
   * even though it is working.
   */
  const getDebugInfo = () => ({
    ...animations.reduce(
      (acc, {instance}) => ({...acc, ...(instance.getDebugInfo?.() ?? {})}),
      {}
    ),
    animations: animations.map(a => a.id).join(', ') || 'none',
    occlusionEnabled: OCCLUSION.enabled && occluder.isEnabled(),
  })

  /**
   * Reveals the wireframe of the invisible occlusion cylinder.
   *
   * This is the surface that actually does the hiding, so showing it makes the motion
   * verifiable by eye: objects should pass cleanly outside the wireframe on the near
   * side and disappear behind it on the far side, never crossing through it.
   */
  const setOutlineVisible = (v) => {
    occluder.setOutlineVisible(v)
  }

  /** Scales animation speed from the debug controls. 0 freezes motion. */
  const setOrbitSpeed = (v) => {
    forEachAnimation('setUserSpeed', v)
  }

  return {
    anchor, addToScene, applyPose, fitToGeometry, hide, update, getDebugInfo,
    setOutlineVisible, setOrbitSpeed, setSelected,
  }
}
