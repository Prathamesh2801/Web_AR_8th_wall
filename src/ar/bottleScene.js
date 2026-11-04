/**
 * bottleScene.js
 *
 * Owns the three.js content attached to the tracked bottle: the anchor, the shared
 * occlusion proxy, the enabled animations, pose smoothing and tap picking.
 *
 * Knows nothing about any SPECIFIC animation: it drives them through the module
 * contract documented in src/config.js, so adding one never touches this file.
 *
 * No React. The only outward crossing is `onSelect`, invoked on a successful tap.
 */
import * as THREE from 'three'

import {ANIMATION_FACTORIES} from './animations'
import {createOcclusionProxy} from './occlusionProxy'
import {ANIMATIONS, OCCLUSION, TRACKING, enabledAnimationIds, animationConfig} from '../config'

export const createBottleScene = ({onSelect} = {}) => {
  // Driven by the tracker. Hidden until the bottle is found.
  const anchor = new THREE.Group()
  anchor.visible = false

  // Depth-only stand-in for the physical bottle. Added FIRST so its depth is written
  // before the animated content, letting back-side objects fail the depth test.
  const occluder = createOcclusionProxy()
  if (OCCLUSION.enabled) anchor.add(occluder.group)

  /**
   * Every enabled animation, instantiated once. `on` ones are updated; the rest stay
   * built but cost nothing per frame. An id with no factory is reported and skipped:
   * a config typo should not take down the experience.
   *
   * `wait` (ms) holds a just-(re)started animation back by its config `delay`, hidden,
   * so several effects started together play in sync; when it runs out the animation's
   * entrance restarts.
   */
  const animations = enabledAnimationIds().flatMap((id) => {
    const factory = ANIMATION_FACTORIES[id]
    if (!factory) {
      console.warn(`[AR] no factory registered for animation "${id}" - skipping`)
      return []
    }
    const cfg = animationConfig(id)
    const instance = factory(cfg)
    instance.root.visible = false
    anchor.add(instance.root)
    return [{id, instance, cfg, on: false, wait: 0, starting: false}]
  })
  const active = () => animations.filter(a => a.on)

  const start = (a) => {
    a.on = true
    a.wait = (a.cfg.delay ?? 0) * 1000
    a.starting = true
    a.instance.root.visible = false
  }
  animations.filter(a => ANIMATIONS[a.id].active).forEach(start)

  console.log('[AR] animations enabled:', animations.map(a => a.id))

  let camera = null
  let canvas = null
  let geometry = null   // from the engine; build() is retried until every module accepts it
  const pending = new Set(animations)

  // --- Pose smoothing --------------------------------------------------------------
  // The engine pose is written to `target`; the anchor eases toward it each frame.
  const target = {position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), scale: 1}
  let snapNext = true   // first pose after (re)acquisition is applied raw
  let lostAt = null
  let lastFrameMs = null

  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()

  /** Calls `method` on every ACTIVE animation that implements it. */
  const forEachActive = (method, ...args) => {
    for (const {instance} of active()) instance[method]?.(...args)
  }

  /** Screen tap -> the `userData.pick` of the nearest pickable mesh, if any. */
  const handleTap = (clientX, clientY) => {
    if (!camera || !canvas || !anchor.visible) return
    const pickables = active().filter(a => a.instance.root.visible)
      .flatMap(({instance}) => instance.getPickables?.() ?? [])
    if (!pickables.length) return

    const rect = canvas.getBoundingClientRect()
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1
    raycaster.setFromCamera(pointer, camera)
    const pick = raycaster.intersectObjects(pickables, false)[0]?.object.userData.pick
    // Only notify outward; the store drives setSelected back in, so every path that
    // changes the selection goes through one place.
    if (pick) onSelect?.(pick)
  }

  const addToScene = (scene, xrCamera, xrCanvas) => {
    camera = xrCamera
    canvas = xrCanvas
    // Materials are unlit; ambient is a gentle fill in case lit materials are added.
    scene.add(new THREE.AmbientLight(0xffffff, 1.0))
    scene.add(anchor)
    // pointerup (not pointerdown) so a drag gesture does not select.
    canvas.addEventListener('pointerup', e => handleTap(e.clientX, e.clientY))
  }

  /**
   * Sizes the occluder and animations from the engine's cylinder geometry. Runs on
   * every tracked frame, so it must be cheap once everything is built.
   */
  const fitToGeometry = (g) => {
    if (!geometry) {
      geometry = g
      if (OCCLUSION.enabled) occluder.build(g)
    }
    for (const a of pending) if (a.instance.build(geometry)) pending.delete(a)
  }

  /**
   * New engine pose for the lead target. For CYLINDRICAL targets the engine pose is
   * used directly (its planar re-centering applies only to FLAT targets). Animations
   * are children of the anchor, so they inherit it.
   */
  const applyPose = ({position, rotation, scale}) => {
    target.position.set(position.x, position.y, position.z)
    target.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w)
    target.scale = scale

    if (!anchor.visible) {
      // Re-acquired. A long absence replays the entrance; a dropout does not.
      if (lostAt !== null && performance.now() - lostAt > TRACKING.replayAfterMs) {
        active().forEach(start)
      }
      lostAt = null
      snapNext = true
      anchor.visible = true
    }
  }

  const hide = () => {
    anchor.visible = false
    lostAt = performance.now()
  }

  /** Per frame, from the AR loop. Allocates nothing. */
  const update = (timeMs) => {
    const dt = lastFrameMs === null ? 0 : Math.min(timeMs - lastFrameMs, 100)
    lastFrameMs = timeMs

    // Nothing on screen: skip the work. Animations clamp their own dt, so a short
    // dropout resumes in place.
    if (!anchor.visible) return

    // Frame-rate independent exponential smoothing; 0ms = raw pose.
    const k = snapNext || TRACKING.smoothingMs <= 0
      ? 1
      : 1 - Math.exp(-dt / TRACKING.smoothingMs)
    snapNext = false
    anchor.position.lerp(target.position, k)
    anchor.quaternion.slerp(target.quaternion, k)
    anchor.scale.setScalar(anchor.scale.x + (target.scale - anchor.scale.x) * k)

    for (const a of active()) {
      if (a.starting) {
        a.wait -= dt
        if (a.wait > 0) continue
        a.starting = false
        a.instance.restartEntrance?.()
        a.instance.root.visible = true
      }
      a.instance.update(timeMs, camera)
    }
  }

  /** Switches animations on/off at runtime. Newly switched-on ones start (after delay). */
  const setActiveAnimations = (ids) => {
    for (const a of animations) {
      const on = ids.includes(a.id)
      if (on && !a.on) start(a)
      if (!on) {
        a.on = false
        a.instance.setSelected?.(null)
        a.instance.root.visible = false
      }
    }
  }

  /** Restarts the given (default: every active) animations together, each after its delay. */
  const replay = (ids) => active().filter(a => !ids || ids.includes(a.id)).forEach(start)

  const getDebugInfo = () => ({
    ...active().reduce((acc, {instance}) => ({...acc, ...(instance.getDebugInfo?.() ?? {})}), {}),
    animations: active().map(a => a.id).join(', ') || 'none',
    occlusionEnabled: OCCLUSION.enabled && occluder.isBuilt(),
  })

  return {
    addToScene, applyPose, fitToGeometry, hide, update, getDebugInfo, setActiveAnimations, replay,
    setSelected: id => forEachActive('setSelected', id),
    setSpeed: v => animations.forEach(({instance}) => instance.setUserSpeed?.(v)),
  }
}
