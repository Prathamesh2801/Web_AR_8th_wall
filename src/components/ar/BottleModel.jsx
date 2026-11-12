import {useEffect, useRef} from 'react'
import * as THREE from 'three'
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js'

import {EXPERIENCE, PRODUCT} from '../../config'

/**
 * Start-screen hero: the product as 3D, turning slowly; drag sideways to spin it.
 * Built from the brand's own data instead of a scanned/AI mesh, so the print stays
 * pixel-sharp and the download is just two textures: the lathed `bottle` profile (mm,
 * the same model the AR effects use) + the flat label art wrapped on at its real size.
 *
 * Its own small WebGL context, freed on unmount: the AR engine needs the GPU next.
 */
const SPIN = 0.45 // rad/s while idle

export const BottleModel = ({className = ''}) => {
  const host = useRef(null)

  useEffect(() => {
    const el = host.current
    const {model} = EXPERIENCE
    const mm = PRODUCT.mm
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches

    const renderer = new THREE.WebGLRenderer({antialias: true, alpha: true})
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    // Absolute + setSize(..., false): the canvas must never size its box (it did: feedback loop).
    renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%'
    el.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const pmrem = new THREE.PMREMGenerator(renderer)
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environmentIntensity = 0.55 // full strength washes the teal out to pastel
    const key = new THREE.DirectionalLight(0xffffff, 1.2)
    key.position.set(-60, 120, 140)
    scene.add(key)

    const loader = new THREE.TextureLoader()
    const tex = (url) => {
      const t = loader.load(url)
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = renderer.capabilities.getMaxAnisotropy()
      return t
    }
    const plastic = (color) => new THREE.MeshStandardMaterial({color, roughness: 0.38})

    // Profile = [height, radius] mm. Body up to the neck, cap from the neck; both closed.
    const V = ([h, r]) => new THREE.Vector2(r, h)
    const p = mm.profile
    const neck = p.findLastIndex(([, r], i) => i > 0 && r > p[i - 1][1]) // cap lip: last widening
    const body = [[p[0][0], 0], ...p.slice(0, neck)].map(V)
    const top = p[p.length - 1][0]
    const cap = [...p.slice(neck - 1), [top, 0]].map(V)

    const bottle = new THREE.Group()
    bottle.add(new THREE.Mesh(new THREE.LatheGeometry(body, 96), plastic(model.bodyColor)))
    bottle.add(new THREE.Mesh(new THREE.LatheGeometry(cap, 96), plastic(model.capColor)))

    // Label: a cylinder band at its real height and wrap length; u = 0.5 faces the camera.
    const R = mm.circumference / (2 * Math.PI) + 0.15 // a hair proud of the plastic
    const arc = (2 * Math.PI * mm.labelWidth) / mm.circumference
    const label = new THREE.Mesh(
      new THREE.CylinderGeometry(R, R, mm.labelHeight, 128, 1, true, -arc / 2, arc),
      new THREE.MeshStandardMaterial({map: tex(model.label), roughness: 0.7}),
    )
    label.position.y = mm.labelBottom + mm.labelHeight / 2
    bottle.add(label)

    if (model.capTop) {
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(model.capTopMm / 2, 96),
        new THREE.MeshStandardMaterial({map: tex(model.capTop), roughness: 0.7}),
      )
      disc.rotation.x = -Math.PI / 2
      disc.position.y = top + 0.05
      bottle.add(disc)
    }

    bottle.position.y = -top / 2
    const spin = new THREE.Group()
    spin.add(bottle)
    scene.add(spin)

    // Framed from above (shows the cap sticker), the bottle filling ~78% of the height.
    const camera = new THREE.PerspectiveCamera(28, 1, 1, 2000)
    const dist = (top / 0.78 / 2) / Math.tan(THREE.MathUtils.degToRad(14))
    const elev = THREE.MathUtils.degToRad(22)
    camera.position.set(0, dist * Math.sin(elev), dist * Math.cos(elev))
    camera.lookAt(0, 0, 0)

    const fit = () => {
      const {clientWidth: w, clientHeight: h} = el
      if (!w || !h) return
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    fit()

    // Drag: follow the finger, then coast back to the idle spin.
    let vel = still ? 0 : SPIN
    let drag = null
    const down = (e) => { drag = {x: e.clientX, t: performance.now()}; el.setPointerCapture(e.pointerId) }
    const move = (e) => {
      if (!drag) return
      const now = performance.now()
      const d = (e.clientX - drag.x) * 0.012
      spin.rotation.y += d
      vel = d / Math.max(0.016, (now - drag.t) / 1000)
      drag = {x: e.clientX, t: now}
    }
    const up = () => { drag = null }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)

    let raf
    let last = performance.now()
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (!drag) {
        vel += ((still ? 0 : SPIN) - vel) * Math.min(1, dt * 2.5)
        spin.rotation.y += vel * dt
      }
      renderer.render(scene, camera)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      scene.traverse((o) => {
        o.geometry?.dispose()
        o.material?.map?.dispose()
        o.material?.dispose()
      })
      scene.environment.dispose()
      pmrem.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    }
  }, [])

  return (
    <div
      ref={host}
      role="img"
      aria-label={`${EXPERIENCE.brand} ${EXPERIENCE.product}, 3D`}
      className={`relative cursor-grab touch-pan-y active:cursor-grabbing ${className}`}
    />
  )
}
