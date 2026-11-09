/**
 * spotlight.js — Effects style "Spotlight": the room dims, a stage lamp strikes above the
 * bottle, dust drifts in its beam and a pool of light warms the table round its foot.
 * Product-agnostic: sized from the engine geometry and PRODUCT.profile only.
 *
 * HOW THE ROOM DIMS BUT THE BOTTLE DOESN'T
 * The bottle is camera pixels; it can't be lit, so everything else is darkened instead:
 * a full-screen dark layer drawn at the far end of the depth range, depthTest on. The
 * occlusion proxy (the bottle's depth stand-in, drawn first) is nearer, so the layer
 * fails the depth test exactly over the bottle, which keeps its full brightness. A soft
 * vignette centred on the bottle keeps its surroundings lighter, so a tracking wobble at
 * the silhouette never shows as a hard edge. (Needs OCCLUSION.enabled.)
 *
 *   Entrance  lights go down, the lamp strikes with a stage-light flicker, dust fades in
 *   Idle      dust drifts and twinkles in the beam; the beam breathes very slightly
 *   Exit      the entrance backwards, twice as fast
 */
import * as THREE from 'three'

import {PRODUCT} from '../config'
import {liveColor} from './liveColor'
import {RenderOrder} from './renderOrder'

const T = {dim: 700, strikeAt: 550, strike: 600, dustAt: 900, dust: 1200} // ms
const ENTER_END = T.dustAt + T.dust
const EXIT_SPEED = 2
const DUST = 160
const BEAM_TAPER = 0.08 // beam radius at the lamp, share of its radius at the table

const clamp01 = t => Math.min(Math.max(t, 0), 1)
const phase = (p, at, dur) => clamp01((p - at) / dur)
const easeInOut = t => t * t * (3 - 2 * t)

/** A lamp striking: on, off, on, a dip, then up to full. t 0..1 -> level 0..1. */
const strikeLevel = (t) => {
  if (t <= 0) return 0
  if (t < 0.12) return 1
  if (t < 0.24) return 0.12
  if (t < 0.38) return 0.95
  if (t < 0.46) return 0.5
  return 0.5 + 0.5 * easeInOut((t - 0.46) / 0.54)
}

/** Soft round light, white (tinted per material). Shared with energy.js. */
export const makePoolTexture = () => {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.45, 'rgba(255,255,255,0.55)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(c)
}

export const createSpotlight = (cfg) => {
  const root = new THREE.Group()
  root.name = 'spotlight'
  let built = null
  let lastMs = null
  let speed = 1
  let p = 0 // ms into the entrance; exit runs it backwards
  let idle = 0
  let exiting = false

  // Full-screen dark layer at the far plane (see header). Plane(2,2) is already -1..1.
  const dim = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: {
      uColor: {value: new THREE.Color()}, uDim: {value: 0},
      uCentre: {value: new THREE.Vector2()}, uSize: {value: new THREE.Vector2(1, 1)},
    },
    vertexShader: `varying vec2 vNdc;
void main() { vNdc = position.xy; gl_Position = vec4(position.xy, 0.99999, 1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uDim; uniform vec2 uCentre, uSize; varying vec2 vNdc;
void main() {
  float d = length((vNdc - uCentre) / uSize);
  gl_FragColor = vec4(uColor, uDim * mix(0.45, 1.0, smoothstep(0.55, 1.7, d)));
}`,
    transparent: true, depthWrite: false, depthTest: true,
  }))
  dim.frustumCulled = false // its geometry is in clip space, not where three thinks
  dim.renderOrder = RenderOrder.SPOT_DIM

  const build = ({radiusTop, radiusBottom, height: H}) => {
    if (built) return true
    const R = (radiusTop + radiusBottom) / 2
    if (!(R > 0) || !(H > 0)) return false
    const {profile} = PRODUCT
    const table = profile[0][0] * H
    const top = profile[profile.length - 1][0] * H

    const pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
      map: makePoolTexture(), transparent: true, depthWrite: false, opacity: 0,
      blending: THREE.AdditiveBlending,
    }))
    pool.rotation.x = -Math.PI / 2
    pool.position.y = table + 0.004 * H
    pool.renderOrder = RenderOrder.SPOT_POOL

    // The beam: an open cone from above the frame to the table, brightest where you look
    // through most of it (its middle) and fading to the sides, so it reads as a volume.
    const beamTop = table + cfg.beamHeight * H
    const half = (beamTop - table) / 2
    const beam = new THREE.Mesh(
      // Unit bottom radius, scaled live by beamWidth; the top keeps the same 8% taper.
      new THREE.CylinderGeometry(BEAM_TAPER, 1, beamTop - table, 48, 1, true),
      new THREE.ShaderMaterial({
        uniforms: {uColor: {value: new THREE.Color()}, uLevel: {value: 0}, uHalf: {value: half}},
        vertexShader: `uniform float uHalf; varying vec3 vN, vV; varying float vH;
void main() {
  vH = (position.y + uHalf) / (2.0 * uHalf);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal); vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`,
        fragmentShader: `uniform vec3 uColor; uniform float uLevel; varying vec3 vN, vV; varying float vH;
void main() {
  float through = pow(abs(dot(normalize(vN), normalize(vV))), 2.2);
  float a = uLevel * through * mix(0.3, 1.0, vH) * (1.0 - smoothstep(0.85, 1.0, vH));
  gl_FragColor = vec4(uColor, a);
}`,
        transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    )
    beam.position.y = table + half
    beam.renderOrder = RenderOrder.SPOT_BEAM

    // Dust: positions live in the shader (drift + twinkle from a per-mote seed), so the
    // CPU does nothing per frame.
    const seeds = new Float32Array(DUST * 4)
    for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random()
    const dustGeo = new THREE.BufferGeometry()
    dustGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DUST * 3), 3))
    dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4))
    const dust = new THREE.Points(dustGeo, new THREE.ShaderMaterial({
      uniforms: {
        uTime: {value: 0}, uTable: {value: table}, uTop: {value: beamTop}, uRTop: {value: R * BEAM_TAPER},
        uRBot: {value: R}, uPx: {value: 1}, uOpacity: {value: 0}, uColor: {value: new THREE.Color()},
      },
      vertexShader: `attribute vec4 aSeed;
uniform float uTime, uTable, uTop, uRTop, uRBot, uPx; varying float vA;
void main() {
  float h = uTop - uTable;
  float y = fract(aSeed.z - uTime * 0.012 * (0.4 + aSeed.w)); // settling slowly
  float r = mix(uRBot, uRTop, y) * sqrt(aSeed.y) * 0.9;
  float ang = aSeed.x * 6.2832 + uTime * 0.06 * (aSeed.w - 0.5);
  vec3 p = vec3(sin(ang) * r, uTable + y * h, cos(ang) * r);
  p.x += sin(uTime * 0.5 + aSeed.w * 30.0) * 0.012 * h;
  p.z += cos(uTime * 0.4 + aSeed.x * 30.0) * 0.012 * h;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uPx * (0.5 + aSeed.w) / -mv.z;
  float tw = 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * (0.8 + 2.4 * aSeed.w) + aSeed.x * 40.0));
  vA = tw * smoothstep(0.02, 0.12, y) * (1.0 - smoothstep(0.7, 0.95, y));
}`,
      fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  gl_FragColor = vec4(uColor, smoothstep(0.5, 0.0, d) * vA * uOpacity);
}`,
      transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
    }))
    dust.frustumCulled = false // positions are made in the shader
    dust.renderOrder = RenderOrder.SPOT_DUST

    root.add(dim, pool, beam, dust)
    built = {H, R, table, top, pool, beam, dust}
    return true
  }

  // Scratch (update must not allocate).
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()

  const update = (timeMs, camera) => {
    if (!built || !camera) return
    const dt = lastMs === null ? 0 : Math.min(timeMs - lastMs, 100) * speed
    lastMs = timeMs
    idle += dt
    p = exiting ? Math.max(Math.min(p, ENTER_END) - dt * EXIT_SPEED, 0) : p + dt
    const {H, R, table, top, pool, beam, dust} = built
    const s = idle / 1000

    // Lights down.
    const down = easeInOut(phase(p, 0, T.dim))
    const du = dim.material.uniforms
    liveColor(du.uColor.value, cfg.dimColor)
    du.uDim.value = cfg.dim * down
    // Vignette centred on the bottle, sized to its height on screen.
    a.set(0, (table + top) / 2, 0)
    root.localToWorld(a).project(camera)
    b.set(0, top, 0)
    root.localToWorld(b).project(camera)
    const halfH = Math.max(Math.abs(b.y - a.y), 0.05)
    du.uCentre.value.set(a.x, a.y)
    du.uSize.value.set((halfH * 0.75) / Math.max(camera.aspect, 0.1), halfH)

    // The lamp strikes, then breathes.
    const lamp = strikeLevel(phase(p, T.strikeAt, T.strike)) * (1 + 0.03 * Math.sin(s * 2.3))
    const bu = beam.material.uniforms
    liveColor(bu.uColor.value, cfg.color)
    bu.uLevel.value = cfg.beam * lamp
    const spread = cfg.beamWidth * R
    beam.scale.set(spread, 1, spread)

    liveColor(pool.material.color, cfg.color)
    pool.material.opacity = cfg.pool * lamp
    pool.scale.setScalar(cfg.beamWidth * R * 2.6)

    const du2 = dust.material.uniforms
    du2.uTime.value = s
    liveColor(du2.uColor.value, cfg.color)
    du2.uOpacity.value = cfg.dust * easeInOut(phase(p, T.dustAt, T.dust)) * Math.min(lamp, 1)
    du2.uRBot.value = spread
    du2.uRTop.value = spread * BEAM_TAPER
    // Mote size: world size -> pixels at unit distance (the canvas fills the window).
    du2.uPx.value = cfg.dustSize * H * camera.projectionMatrix.elements[5] * window.innerHeight * 0.5 * (window.devicePixelRatio || 1)

    const on = p > 0
    dim.visible = pool.visible = beam.visible = dust.visible = on
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
