/**
 * planted.js — Elements style "Planted": the bottle stands in a patch of earth with the
 * label's two botanicals, anchored to the bottle in 360° (walk round it, it stays put).
 *
 *   1 Soil     swells up out of the table round the bottle's foot into a collar (the
 *              occluder hides the part inside the bottle, so the bottle looks planted)
 *   2 Ginseng  two roots surface and settle lying on the soil, crowns at the bottle's foot,
 *              a third rises behind and leans on the bottle; each fades in as it surfaces
 *   3 Grapes   berries drop onto the soil under gravity, bounce twice, roll a little, rest
 *   Captions   the label's amounts, once each group has settled
 *   Exit       the whole entrance backwards, twice as fast
 *
 * WHAT MAKES IT SIT IN THE PHOTO (each fixes something seen on the device)
 *  - Light: the effect's sky + key lights take their colour and strength from the live
 *    camera image (cameraLight.js), so the models dim and warm with the room.
 *  - Soil: its edge is torn into clumps by smooth noise (discarded, so no transparency
 *    sorting), and it darkens where it meets the bottle (contact shadow). Turned so its
 *    fuller side faces the label: the collar is ~9 mm, just under the label's 12 mm.
 *  - Shadows under the soil, each root and each berry (the berry's grows as it lands).
 *  - Grade: slightly desaturated with a little moving grain, like the camera's own.
 *  - Roots clipped at the table plane: nothing pokes out under the real table.
 *
 * Models: public/models (Meshy AI, textured PBR; simplified + meshopt + webp). Root rests
 * and berry landings are measured on the soil mesh itself (raycast at build).
 */
import * as THREE from 'three'
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js'
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js'

import {PRODUCT} from '../config'
import {makeCard} from './callouts'
import {cameraLight} from './cameraLight'
import {NUTRIENTS} from './nutrientData'
import {RenderOrder} from './renderOrder'

const MODELS = ['soil', 'ginseng-root', 'grape']
const DEG = Math.PI / 180

// Points round the bottle. az: degrees from the label's centre (+z) toward +x;
// r: past the bottle's surface, x label height; y (optional): above the table, x label
// height — without it the point rests on the soil (or the table past its edge).
const ROOTS = [
  {crown: {az: -28, r: 0.06}, tail: {az: -58, r: 0.5}, roll: 0.25}, // front-left, lying
  {crown: {az: 40, r: 0.08}, tail: {az: 80, r: 0.46}, roll: -0.35}, // front-right, lying
  {tail: {az: 215, r: 0.03, y: -0.05}, crown: {az: 240, r: 0.14, y: 0.95}, roll: 1.2}, // behind, leaning on the bottle
]
const BERRIES = [
  {az: -12, r: 0.24}, {az: -21, r: 0.33}, {az: -3, r: 0.35}, // front, under the label
  {az: 20, r: 0.27}, {az: 28, r: 0.37}, // front-right
  {az: 120, r: 0.25}, {az: -100, r: 0.22}, // the sides
]

const T = { // ms
  soil: 900,
  rootsAt: 450, root: 1300, rootStagger: 260,
  berriesAt: 1750, berryStagger: 140, fall: 520,
  rootCardAt: 2500, grapeCardAt: 3700, card: 400,
}
const ENTER_END = T.grapeCardAt + T.card
const EXIT_SPEED = 2
const BOUNCE = 0.38 // restitution
const BERRY_TIME = T.fall * (1 + 2 * BOUNCE + 2 * BOUNCE ** 2)

const clamp01 = t => Math.min(Math.max(t, 0), 1)
const phase = (p, at, dur) => clamp01((p - at) / dur)
const easeOutCubic = t => 1 - (1 - t) ** 3
const easeOutBack = t => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2
const hash = i => { const x = Math.sin(i * 127.1) * 43758.5453; return x - Math.floor(x) }

/**
 * Height above rest as a fraction of the drop (1 = released, 0 = resting): a free fall,
 * then two bounces. Units: time in falls, so gravity is 2 and the impact speed 2.
 */
const dropHeight = (t) => {
  if (t < T.fall) return 1 - (t / T.fall) ** 2
  let u = t / T.fall - 1
  let v = 2 * BOUNCE
  for (let k = 0; k < 2; k++) {
    if (u < v) return u * (v - u)
    u -= v
    v *= BOUNCE
  }
  return 0
}

/** Wraps a model in a holder whose origin is its bottom centre (anchorY 0) or centre (0.5). */
const fit = (model, anchorY) => {
  const box = new THREE.Box3().setFromObject(model)
  const size = box.getSize(new THREE.Vector3())
  model.position.set(-(box.min.x + size.x / 2), -(box.min.y + size.y * anchorY), -(box.min.z + size.z / 2))
  const holder = new THREE.Group()
  holder.add(model)
  return {holder, size}
}

const meshesOf = (o) => {
  const out = []
  o.traverse(m => { if (m.isMesh) out.push(m) })
  return out
}

/**
 * Shader additions shared by every model here. One cache key per kind: the default key
 * is onBeforeCompile's source, identical for all kinds, and would share the wrong program.
 *   all   desaturate + grain (the camera's look), applied to the lit colour
 *   root  discard below the table plane
 *   soil  clumpy torn edge + darkening where it meets the bottle
 */
const patch = (material, kind, uniforms) => {
  material.metalness = 0 // organic, and there is no environment to reflect: metal reads black
  if (kind === 'root') material.alphaHash = true // fade-in without transparency sorting
  material.customProgramCacheKey = () => `planted-${kind}`
  material.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms)
    s.vertexShader = 'varying vec3 vWorldP;\n' + s.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\nvWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    let head = `uniform float uTime, uSat, uGrain;
varying vec3 vWorldP;
float pHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float vNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(pHash(i), pHash(i + vec3(1, 0, 0)), f.x), mix(pHash(i + vec3(0, 1, 0)), pHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(pHash(i + vec3(0, 0, 1)), pHash(i + vec3(1, 0, 1)), f.x), mix(pHash(i + vec3(0, 1, 1)), pHash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
`
    let start = ''
    let alpha = ''
    if (kind === 'root') {
      head += 'uniform vec4 uClip;\n'
      start = 'if (dot(uClip.xyz, vWorldP) + uClip.w < 0.0) discard;'
    }
    if (kind === 'soil') {
      head += 'uniform vec3 uCentre, uAxis;\nuniform float uRadius, uBottle, uEdge, uContact;\n'
      alpha = `{
  vec3 q = vWorldP - uCentre;
  float d = length(q - uAxis * dot(q, uAxis));
  float n = 0.65 * vNoise(q * 9.0 / uRadius) + 0.35 * vNoise(q * 26.0 / uRadius);
  if (d / uRadius + 0.32 * (n - 0.5) > uEdge) discard;
  diffuseColor.rgb *= mix(1.0 - uContact, 1.0, smoothstep(uBottle, uBottle * 1.5, d));
}`
    }
    s.fragmentShader = head + s.fragmentShader
      .replace('void main() {', `void main() {\n${start}`)
      .replace('#include <alphamap_fragment>', `#include <alphamap_fragment>\n${alpha}`)
      .replace('#include <opaque_fragment>', `outgoingLight = mix(vec3(dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722))), outgoingLight, uSat);
outgoingLight *= 1.0 + (pHash(vec3(gl_FragCoord.xy, floor(uTime * 24.0))) - 0.5) * uGrain;
#include <opaque_fragment>`)
  }
}

const makeShadowTexture = () => {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(0,0,0,1)')
  g.addColorStop(0.5, 'rgba(0,0,0,0.55)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

const caption = (id) => {
  const n = NUTRIENTS.find(x => x.id === id)
  const card = makeCard(`${n.full.replace(/ Extract$/, '')} · ${n.amount}`)
  card.sprite.center.set(0.5, 0)
  // On top of everything (the bottle's edge and the berries kept clipping it); facing()
  // hides it instead whenever what it names is round the back.
  card.sprite.material.depthTest = false
  return card
}

export const createPlanted = (cfg) => {
  const root = new THREE.Group()
  root.name = 'planted'
  let models = null
  let built = null
  let lastMs = null
  let speed = 1
  let p = 0 // ms into the entrance; exit runs it backwards
  let exiting = false

  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  Promise.all(MODELS.map(n => loader.loadAsync(`/models/${n}.glb`)))
    .then((gltfs) => { models = gltfs.map(g => g.scene) })
    .catch(err => console.warn('[AR] planted models failed to load', err))

  // Lights live under root: hidden with it, so they never touch another effect.
  const sky = new THREE.HemisphereLight(0xffffff, 0x000000, 1)
  const key = new THREE.DirectionalLight(0xffffff, 1)
  root.add(sky, key, key.target)

  const shared = {uTime: {value: 0}, uSat: {value: 1}, uGrain: {value: 0}}
  const rootU = {...shared, uClip: {value: new THREE.Vector4()}}
  const soilU = {
    ...shared, uCentre: {value: new THREE.Vector3()}, uAxis: {value: new THREE.Vector3()},
    uRadius: {value: 1}, uBottle: {value: 1}, uEdge: {value: 0.9}, uContact: {value: 0.6},
  }

  const build = ({radiusTop, radiusBottom, height: H}) => {
    if (built) return true
    const R = (radiusTop + radiusBottom) / 2
    if (!models || !(R > 0) || !(H > 0)) return false
    const [soilModel, rootModel, grapeModel] = models
    const table = PRODUCT.profile[0][0] * H
    key.position.set(0.4 * H, 3 * H, 1 * H) // mostly overhead: soft, no strong direction to contradict

    // 1 Soil, measured at its final size so roots and berries rest on its real surface.
    meshesOf(soilModel).forEach(m => patch(m.material, 'soil', soilU))
    const soil = fit(soilModel, 0)
    const soilW = cfg.soilSize * H
    const soilScale = new THREE.Vector3(soilW / soil.size.x, (cfg.soilHeight * H) / soil.size.y, soilW / soil.size.x)
    soil.holder.position.set(0, table, 0)
    soil.holder.rotation.y = Math.PI // the mound's fuller side toward the label
    soil.holder.scale.copy(soilScale)
    soil.holder.updateMatrixWorld(true)
    const ray = new THREE.Raycaster()
    const down = new THREE.Vector3(0, -1, 0)
    const up = new THREE.Vector3(0, 1, 0)
    const surface = (x, z) => {
      ray.set(new THREE.Vector3(x, table + 5 * H, z), down)
      const hit = ray.intersectObject(soil.holder, true)[0]
      // Only the sure part counts: past the torn edge's innermost reach it is the table.
      const solid = hit && Math.hypot(x, z) < (soilW / 2) * (cfg.soilEdge - 0.16)
      return solid
        ? {y: hit.point.y, n: hit.face.normal.clone().transformDirection(hit.object.matrixWorld), soil: true}
        : {y: table, n: up.clone(), soil: false}
    }
    const point = ({az, r}) => new THREE.Vector3(Math.sin(az * DEG) * (R + r * H), 0, Math.cos(az * DEG) * (R + r * H))

    const shadowTex = makeShadowTexture()
    const shadowPlane = () => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
        map: shadowTex, transparent: true, depthWrite: false, opacity: 0,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      }))
      m.renderOrder = RenderOrder.PLANTED_SHADOW
      return m
    }
    const soilShadow = shadowPlane()
    soilShadow.rotation.x = -Math.PI / 2
    soilShadow.position.set(0, table + 0.003 * H, 0)

    // 2 Ginseng: each root spans tail -> crown, broad face up, half-sunk where it lies.
    const rootFit = fit(rootModel, 0)
    const thin = rootFit.size.z / rootFit.size.y // the model is flat: thickness per length
    const rootMaterial = meshesOf(rootModel)[0].material
    const roots = ROOTS.map((def, i) => {
      const a = point(def.tail)
      const b = point(def.crown)
      const len = Math.hypot(b.x - a.x, b.z - a.z) // first guess; lying roots are near-flat
      for (const [v, at] of [[a, def.tail], [b, def.crown]]) {
        const s = surface(v.x, v.z)
        v.y = at.y !== undefined ? table + at.y * H : s.y + (s.soil ? 0.05 : 0.5) * thin * len
      }
      const axis = b.clone().sub(a)
      const length = axis.length()
      axis.normalize()
      const face = up.clone().addScaledVector(axis, -axis.dot(up))
      if (face.lengthSq() < 1e-4) face.set(a.x, 0, a.z)
      face.normalize()
      const side = new THREE.Vector3().crossVectors(axis, face)
      const pivot = new THREE.Group()
      pivot.position.copy(a)
      pivot.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, axis, face))
      const holder = i === 0 ? rootFit.holder : rootFit.holder.clone()
      holder.scale.setScalar(length / rootFit.size.y)
      pivot.add(holder)
      const material = rootMaterial.clone() // own opacity: the roots fade in one by one
      patch(material, 'root', rootU)
      meshesOf(holder).forEach(m => { m.material = material })

      const mid = a.clone().add(b).multiplyScalar(0.5)
      const flat = Math.hypot(b.x - a.x, b.z - a.z)
      const shadow = shadowPlane()
      shadow.position.set(mid.x, surface(mid.x, mid.z).y + 0.01 * H, mid.z)
      shadow.rotation.set(-Math.PI / 2, Math.atan2(-(b.z - a.z), b.x - a.x), 0, 'YXZ')
      shadow.scale.set(Math.max(flat * 1.15, 0.3 * H), Math.max(length * 0.4, 0.3 * H), 1)
      // Sink far enough that the whole root starts below the soil's surface.
      const sink = Math.max(a.y, b.y) - table + 0.1 * H
      return {pivot, holder, material, shadow, mid, rest: a, sink, roll: def.roll}
    })

    // 3 Grapes: each rests on the soil surface, tilted to it, stem pointing anywhere.
    meshesOf(grapeModel).forEach(m => patch(m.material, 'grape', shared))
    const grape = fit(grapeModel, 0.5)
    const d = cfg.berrySize * H
    const berries = BERRIES.map((def, i) => {
      const {x, z} = point(def)
      const s = surface(x, z)
      const outward = new THREE.Vector3(x, 0, z).normalize()
      const holder = i === 0 ? grape.holder : grape.holder.clone()
      holder.scale.setScalar(d / grape.size.x)
      holder.rotation.set((hash(i + 3) - 0.5) * 2.2, hash(i + 7) * Math.PI * 2, (hash(i + 11) - 0.5) * 2.2)
      const pivot = new THREE.Group()
      pivot.add(holder)
      const shadow = shadowPlane()
      shadow.position.set(x, s.y, z).addScaledVector(s.n, 0.004 * H)
      shadow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), s.n)
      return {
        pivot, shadow, outward,
        rest: new THREE.Vector3(x, s.y, z).addScaledVector(s.n, d * 0.42),
        axis: new THREE.Vector3(-outward.z, 0, outward.x), // roll axis: horizontal, across the slope
        at: T.berriesAt + i * T.berryStagger,
      }
    })

    // Captions: ginseng above the front-right root's middle; grapes just in front of and
    // below the front berries, clear of the roots.
    const rootTag = roots[1].mid.clone()
    rootTag.y += 0.22 * H
    const grapeTag = new THREE.Vector3()
    for (const b of berries.slice(0, 3)) grapeTag.add(b.rest)
    grapeTag.multiplyScalar(1.25 / 3)
    grapeTag.y = table - 0.06 * H

    const rootCard = caption('ginseng')
    const grapeCard = caption('grape')
    soil.holder.scale.set(0, 0, 0)
    root.add(soilShadow, soil.holder, rootCard.sprite, grapeCard.sprite,
      ...roots.flatMap(r => [r.pivot, r.shadow]), ...berries.flatMap(b => [b.pivot, b.shadow]))
    built = {H, R, d, table, soil, soilScale, soilShadow, soilW, roots, berries, rootCard, grapeCard, rootTag, grapeTag}
    return true
  }

  // Scratch (update must not allocate).
  const cam = new THREE.Vector3()
  const scale = new THREE.Vector3()
  const tint = new THREE.Color()
  const white = new THREE.Color(1, 1, 1)
  const plane = new THREE.Plane()
  const yAxis = new THREE.Vector3(0, 1, 0)

  /** 1 when the point's side of the bottle faces the camera, fading to 0 by the silhouette. */
  const facing = (pos) => {
    const len = Math.hypot(pos.x, pos.z) * Math.hypot(cam.x, cam.z) || 1
    return clamp01(((pos.x * cam.x + pos.z * cam.z) / len - 0.15) / 0.35)
  }

  const showCard = (card, k, pos, ch) => {
    card.sprite.visible = k > 0.001
    if (!card.sprite.visible) return
    card.sprite.position.copy(pos)
    card.sprite.position.y -= (1 - k) * 0.25 * ch
    card.sprite.scale.set(ch * card.aspect, ch, 1)
    card.sprite.material.opacity = k
    card.sprite.material.color.setScalar(k) // premultiplied: fade colour with alpha
    card.draw(card.length, false, cfg.cardColor, cfg.cardBorderColor, cfg.cardBorderColor)
  }

  /** The room's light (cameraLight.js): its hue at half strength; its brightness, softened. */
  const matchCamera = () => {
    const L = cameraLight.ready ? cameraLight.luma : 0.18
    const exposure = Math.min(Math.max(Math.sqrt(L / 0.18), 0.45), 1.5)
    tint.copy(cameraLight.color).multiplyScalar(1 / Math.max(L, 0.01))
    tint.setRGB(Math.min(tint.r, 1.4), Math.min(tint.g, 1.4), Math.min(tint.b, 1.4)).lerp(white, 0.5)
    sky.color.copy(tint)
    sky.groundColor.copy(tint).multiplyScalar(0.3)
    sky.intensity = cfg.light * 1.7 * exposure
    key.color.copy(tint)
    key.intensity = cfg.light * 0.9 * exposure
  }

  const update = (timeMs, camera) => {
    if (!built || !camera) return
    const dt = lastMs === null ? 0 : Math.min(timeMs - lastMs, 100) * speed
    lastMs = timeMs
    p = exiting ? Math.max(Math.min(p, ENTER_END) - dt * EXIT_SPEED, 0) : p + dt
    const {H, R, d, table, soil, soilScale, soilShadow, soilW, roots, berries, rootCard, grapeCard, rootTag, grapeTag} = built

    matchCamera()
    shared.uTime.value = timeMs / 1000
    shared.uSat.value = cfg.saturation
    shared.uGrain.value = cfg.grain

    // World-space references for the shaders (the anchor moves with the bottle).
    root.updateWorldMatrix(true, false)
    root.getWorldScale(scale)
    plane.set(yAxis, -table).applyMatrix4(root.matrixWorld)
    rootU.uClip.value.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant)

    // 1 Soil swells up out of the table.
    const sw = Math.max(easeOutBack(phase(p, 0, T.soil)), 0)
    const spread = 0.8 + 0.2 * sw
    soil.holder.scale.set(soilScale.x * spread, soilScale.y * sw, soilScale.z * spread)
    soil.holder.visible = sw > 0.001
    soilU.uCentre.value.set(0, table, 0).applyMatrix4(root.matrixWorld)
    soilU.uAxis.value.copy(plane.normal)
    soilU.uRadius.value = (soilW / 2) * spread * scale.x
    soilU.uBottle.value = R * scale.x
    soilU.uEdge.value = cfg.soilEdge
    soilU.uContact.value = cfg.contact
    soilShadow.scale.setScalar(soilW * 1.1 * spread)
    soilShadow.material.opacity = cfg.shadow * Math.min(sw, 1)

    // 2 Roots surface: rise out of the soil, turning over, fading in.
    for (let i = 0; i < roots.length; i++) {
      const r = roots[i]
      const f = phase(p, T.rootsAt + i * T.rootStagger, T.root)
      r.pivot.visible = r.shadow.visible = f > 0
      const e = easeOutCubic(f)
      r.pivot.position.copy(r.rest)
      r.pivot.position.y -= r.sink * (1 - e)
      r.holder.rotation.y = r.roll + (1 - e) * 0.9
      r.material.opacity = clamp01(f * 2.5)
      r.shadow.material.opacity = cfg.shadow * 0.8 * e * e
    }

    // 3 Berries fall, bounce, roll down-slope to rest.
    for (let i = 0; i < berries.length; i++) {
      const b = berries[i]
      const t = p - b.at
      b.pivot.visible = b.shadow.visible = t > 0
      if (t <= 0) continue
      const hgt = dropHeight(Math.min(t, BERRY_TIME))
      const roll = 1 - easeOutCubic(clamp01((t - T.fall) / (BERRY_TIME - T.fall)))
      const back = roll * cfg.roll * H // still up-slope by this much
      b.pivot.position.copy(b.rest).addScaledVector(b.outward, -back)
      b.pivot.position.y += hgt * cfg.drop * H
      b.pivot.quaternion.setFromAxisAngle(b.axis, -back / (d / 2))
      const near = 1 - hgt
      b.shadow.scale.setScalar(d * (0.55 + 0.5 * near))
      b.shadow.material.opacity = cfg.shadow * near * near
    }

    const ch = cfg.cardHeight * H
    camera.getWorldPosition(cam)
    root.worldToLocal(cam)
    showCard(rootCard, easeOutCubic(phase(p, T.rootCardAt, T.card)) * facing(rootTag), rootTag, ch)
    showCard(grapeCard, easeOutCubic(phase(p, T.grapeCardAt, T.card)) * facing(grapeTag), grapeTag, ch)
  }

  const restartEntrance = () => {
    lastMs = null
    p = 0
    exiting = false
  }

  return {
    root, build, update, restartEntrance,
    exit: () => { exiting = true },
    isExited: () => !built || p <= 0,
    setUserSpeed: v => { speed = v },
  }
}
