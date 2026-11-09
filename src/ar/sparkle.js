/**
 * sparkle.js — Effects style "Sparkle": a flash at the cap, then stars in the brand's
 * colours fountain up out of it, swirl down round the bottle and settle into a slow,
 * twinkling orbit. Exit runs time backwards: they swirl back up into the cap.
 *
 * Every star's path is a pure function of time and its random seed, computed in the
 * vertex shader (burst under gravity, blended into a descending orbit), so the CPU only
 * advances two numbers per frame. The orbit's angle is integrated on the CPU (`angle`)
 * so its speed can ease from the fast swirl down to the idle drift without jumping.
 * Stars behind the bottle are hidden by the occluder (depthTest on). NORMAL blending:
 * additive light vanishes on a white table. Product-agnostic (PRODUCT.profile only).
 */
import * as THREE from 'three'

import {PRODUCT} from '../config'
import {liveColor} from './liveColor'
import {RenderOrder} from './renderOrder'
import {makePoolTexture} from './spotlight'

const COUNT = 220
const SWIRL_S = 2.6 // s until the stars have settled into their orbit
const EXIT_SPEED = 2

const clamp01 = t => Math.min(Math.max(t, 0), 1)

/** Four-point star with a soft core, white (tinted per star). */
const makeStarTexture = () => {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')
  const core = ctx.createRadialGradient(32, 32, 0, 32, 32, 14)
  core.addColorStop(0, 'rgba(255,255,255,1)')
  core.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = core
  ctx.fillRect(0, 0, 64, 64)
  for (const [w, h] of [[64, 5], [5, 64]]) {
    const g = w > h
      ? ctx.createLinearGradient(0, 0, 64, 0)
      : ctx.createLinearGradient(0, 0, 0, 64)
    g.addColorStop(0, 'rgba(255,255,255,0)')
    g.addColorStop(0.5, 'rgba(255,255,255,1)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(32 - w / 2, 32 - h / 2, w, h)
  }
  return new THREE.CanvasTexture(c)
}

export const createSparkle = (cfg) => {
  const root = new THREE.Group()
  root.name = 'sparkle'
  let built = null
  let lastMs = null
  let speed = 1
  let p = 0 // ms of the story; exit runs it backwards
  let angle = 0 // integrated orbit angle, rad
  let exiting = false

  const build = ({radiusTop, radiusBottom, height: H}) => {
    if (built) return true
    const R = (radiusTop + radiusBottom) / 2
    if (!(R > 0) || !(H > 0)) return false
    const {profile} = PRODUCT
    const table = profile[0][0] * H
    const top = profile[profile.length - 1][0] * H

    const seeds = new Float32Array(COUNT * 4)
    const pick = new Float32Array(COUNT)
    for (let i = 0; i < COUNT; i++) {
      for (let k = 0; k < 4; k++) seeds[i * 4 + k] = Math.random()
      pick[i] = Math.floor(Math.random() * 3)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3))
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4))
    geo.setAttribute('aPick', new THREE.BufferAttribute(pick, 1))

    const stars = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: {
        uT: {value: 0}, uTime: {value: 0}, uAngle: {value: 0}, uTop: {value: top}, uTable: {value: table},
        uR: {value: R}, uH: {value: H}, uSpread: {value: 1.7}, uPx: {value: 1}, uOpacity: {value: 1},
        uMap: {value: makeStarTexture()},
        uC0: {value: new THREE.Color()}, uC1: {value: new THREE.Color()}, uC2: {value: new THREE.Color()},
      },
      vertexShader: `attribute vec4 aSeed; attribute float aPick;
uniform float uT, uTime, uAngle, uTop, uTable, uR, uH, uSpread, uPx;
uniform vec3 uC0, uC1, uC2;
varying vec3 vColor; varying float vA;
void main() {
  float ang = aSeed.x * 6.2832;
  // 1 burst: out of the cap, mostly upward, under gravity
  float elev = mix(0.75, 1.35, aSeed.y);
  vec3 dir = vec3(cos(elev) * sin(ang), sin(elev), cos(elev) * cos(ang));
  float tb = min(uT, 1.0);
  vec3 pb = vec3(0.0, uTop, 0.0) + dir * uH * mix(1.0, 2.2, aSeed.w) * tb;
  pb.y -= 2.0 * uH * tb * tb;
  // 2 orbit: round the bottle, coming down from above the cap to its own height
  float rr = uR * mix(1.3, uSpread, aSeed.y);
  float yf = mix(uTable + 0.15 * uH, uTop + 0.25 * uH, aSeed.z);
  float y = mix(uTop + 0.6 * uH, yf, smoothstep(0.5, ${SWIRL_S.toFixed(1)}, uT));
  y += sin(uTime * 1.1 + aSeed.x * 20.0) * 0.04 * uH;
  float th = ang + uAngle * mix(0.7, 1.3, aSeed.w);
  vec3 po = vec3(sin(th) * rr, y, cos(th) * rr);
  vec3 p = mix(pb, po, smoothstep(0.35, 1.4, uT));

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float tw = 0.5 + 0.5 * sin(uTime * mix(2.0, 6.0, aSeed.y) + aSeed.x * 50.0);
  gl_PointSize = uPx * mix(0.5, 1.3, aSeed.w) * mix(0.55, 1.15, tw) / -mv.z;
  vA = mix(0.35, 1.0, tw) * smoothstep(0.0, 0.08, uT);
  vColor = aPick < 0.5 ? uC0 : aPick < 1.5 ? uC1 : uC2;
}`,
      fragmentShader: `uniform sampler2D uMap; uniform float uOpacity; varying vec3 vColor; varying float vA;
void main() {
  float a = texture2D(uMap, gl_PointCoord).a * vA * uOpacity;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor, a);
}`,
      transparent: true, depthWrite: false, depthTest: true,
    }))
    stars.frustumCulled = false // positions are made in the shader
    stars.renderOrder = RenderOrder.SPARKLE

    const flash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makePoolTexture(), transparent: true, depthWrite: false, opacity: 0,
    }))
    flash.position.y = top + 0.05 * H
    flash.renderOrder = RenderOrder.SPARKLE_FLASH

    root.add(stars, flash)
    built = {H, R, stars, flash}
    return true
  }

  const update = (timeMs, camera) => {
    if (!built || !camera) return
    const dt = lastMs === null ? 0 : Math.min(timeMs - lastMs, 100) * speed
    lastMs = timeMs
    const step = exiting ? -dt * EXIT_SPEED : dt
    // On exit, start the rewind from the settled orbit, not from however long it idled.
    p = Math.max((exiting ? Math.min(p, SWIRL_S * 1000) : p) + step, 0)
    const {H, R, stars, flash} = built
    const t = p / 1000

    // Orbit speed: a fast swirl easing down to the idle drift (sign follows time, so the
    // exit unwinds the swirl it made).
    const swirl = clamp01(1 - t / SWIRL_S)
    angle += (step / 1000) * (cfg.spin + swirl * swirl * 3)

    const u = stars.material.uniforms
    u.uT.value = t
    u.uTime.value = timeMs / 1000
    u.uAngle.value = angle
    u.uSpread.value = cfg.spread
    u.uOpacity.value = cfg.opacity
    u.uPx.value = cfg.starSize * H * camera.projectionMatrix.elements[5] * window.innerHeight * 0.5 * (window.devicePixelRatio || 1)
    liveColor(u.uC0.value, cfg.color1)
    liveColor(u.uC1.value, cfg.color2)
    liveColor(u.uC2.value, cfg.color3)

    const f = Math.sin(Math.PI * clamp01(t / 0.45))
    liveColor(flash.material.color, cfg.color1)
    flash.material.opacity = 0.9 * f
    flash.scale.setScalar(R * (1 + 2.5 * clamp01(t / 0.45)))
    flash.visible = f > 0.01

    stars.visible = p > 0
  }

  const restartEntrance = () => {
    lastMs = null
    p = 0
    angle = 0
    exiting = false
  }

  return {
    root, build, update, restartEntrance,
    exit: () => { exiting = true },
    isExited: () => !built || p <= 0,
    setUserSpeed: v => { speed = v },
  }
}
