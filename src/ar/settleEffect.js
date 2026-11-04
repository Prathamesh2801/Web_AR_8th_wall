/**
 * settleEffect.js — animation "Glow": warm light rises up the whole product (base ->
 * cap), blooms outward from its silhouette, then settles into a calm breathing aura.
 *
 * HOW THE HALO BLENDS OUTWARD
 * Nested shells give a band of light per shell (each fresnel rim peaks at its own
 * edge). Instead, ONE shell (the bottle profile inflated by `glowReach`) is drawn front
 * faces only, and each fragment asks: how close does my line of sight pass to the real
 * bottle? It finds the ray's closest approach to the bottle's axis, compares that
 * distance with PRODUCT.profile's radius at that height, and lights the fragment by
 * exp(-gap / falloff). That is a true distance-to-silhouette glow: brightest on the
 * product's edge, fading smoothly into the air, above the cap and pooling round the
 * base. Over the bottle's face only a thin inner rim lights, so the label stays clean.
 *
 * Entrance: a reveal line sweeps base -> cap while `falloff` blooms from a hairline to
 * a peak, then eases back to the resting glow. Embers drift up along the body.
 *
 * Every material keeps depthTest, so the occlusion proxy hides what is behind the
 * bottle. `update` allocates nothing.
 */
import * as THREE from 'three'

import {PRODUCT} from '../config'
import {RenderOrder} from './renderOrder'

const easeOut = t => 1 - (1 - t) ** 3
const easeInOut = t => -(Math.cos(Math.PI * t) - 1) / 2
const clamp01 = t => Math.min(Math.max(t, 0), 1)

/** Deterministic pseudo-random, so the ember field looks identical every run. */
const rand = (seed) => {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

const N = PRODUCT.profile.length

const haloShader = {
  vertexShader: `
    varying vec3 vPos;
    void main() {
      vPos = position; // the mesh sits at the bottle origin, unscaled
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    #define N ${N}
    uniform vec3 uCam;          // camera, in bottle space
    uniform vec2 uProfile[N];   // (y, radius) in bottle units, base -> cap
    uniform float uFalloff, uOpacity, uReveal, uRevealSoft, uReach;
    uniform vec3 uInner, uOuter;
    varying vec3 vPos;

    float radiusAt(float y) {
      for (int i = 1; i < N; i++) {
        if (y <= uProfile[i].x) {
          vec2 a = uProfile[i - 1], b = uProfile[i];
          return mix(a.y, b.y, clamp((y - a.x) / max(b.x - a.x, 1e-5), 0.0, 1.0));
        }
      }
      return uProfile[N - 1].y;
    }

    void main() {
      vec3 D = normalize(vPos - uCam);
      // Closest approach of the view ray to the bottle's (vertical) axis.
      float t = max(-dot(uCam.xz, D.xz) / max(dot(D.xz, D.xz), 1e-6), 0.0);
      vec3 Q = uCam + D * t;
      float d = length(Q.xz);
      float yBase = uProfile[0].x, yTop = uProfile[N - 1].x;
      float r = radiusAt(clamp(Q.y, yBase, yTop));

      // Gap between the ray and the product: sideways off the body, or up over the cap.
      float gap = length(vec2(max(d - r, 0.0), max(Q.y - yTop, 0.0)));
      // Fade to exactly 0 before the shell's edge, or the edge shows as a faint box.
      float glow = exp(-gap / uFalloff) * smoothstep(uReach, uReach * 0.5, gap);
      // Ray crosses the bottle: only a thin inner rim, continuous with the edge (=1).
      if (d < r && Q.y <= yTop) glow = pow(d / r, 24.0);
      // Below the base the light pools briefly on the table, then dies.
      glow *= exp(-max(yBase - Q.y, 0.0) / (uFalloff * 0.6));

      float revealed = smoothstep(uReveal, uReveal - uRevealSoft, Q.y);
      vec3 color = mix(uOuter, uInner, exp(-gap / (uFalloff * 0.35)));
      gl_FragColor = vec4(color, glow * revealed * uOpacity);
    }
  `,
}

export const createSettleEffect = (cfg) => {
  const root = new THREE.Group()
  const _cam = new THREE.Vector3()

  let s = null
  let age = 0
  let lastMs = null
  let userSpeed = 1

  const build = ({radiusTop, radiusBottom, height: H}) => {
    const R = (radiusTop + radiusBottom) / 2
    if (s) return true
    if (!(R > 0) || !(H > 0)) return false

    const prof = PRODUCT.profile.map(([y, r]) => new THREE.Vector2(y * H, r * R))
    const yBase = prof[0].x
    const yTop = prof[N - 1].x
    const reach = cfg.glowReach * R

    // Halo shell: the profile inflated by `reach`, domed over the cap, closed under
    // the base. Only its front faces draw, so each pixel is shaded exactly once.
    const shellPts = [
      new THREE.Vector2(0.001, yBase - reach * 0.4),
      ...prof.map(p => new THREE.Vector2(p.y + reach, p.x)),
      new THREE.Vector2(prof[N - 1].y + reach * 0.7, yTop + reach * 0.7),
      new THREE.Vector2(0.001, yTop + reach),
    ]
    const halo = new THREE.Mesh(
      new THREE.LatheGeometry(shellPts, 64),
      new THREE.ShaderMaterial({
        ...haloShader,
        uniforms: {
          uCam: {value: new THREE.Vector3()},
          uProfile: {value: prof},
          uFalloff: {value: 0.01},
          uOpacity: {value: 0},
          uReveal: {value: yBase},
          uRevealSoft: {value: H * 0.35},
          uReach: {value: reach},
          uInner: {value: new THREE.Color(cfg.highlightColor)},
          uOuter: {value: new THREE.Color(cfg.deepColor)},
        },
        transparent: true,
        depthWrite: false,
        depthTest: true,
        side: THREE.BackSide, // LatheGeometry winds its outward faces as back faces
        blending: THREE.AdditiveBlending,
      })
    )
    halo.renderOrder = RenderOrder.SETTLE_AURA
    root.add(halo)

    // Embers: one Points cloud rising along the body, base -> cap.
    const count = Math.max(0, Math.floor(cfg.particleCount))
    const pos = new Float32Array(count * 3)
    const alpha = new Float32Array(count)
    const size = new Float32Array(count)
    const p = {angle: new Float32Array(count), gap: new Float32Array(count),
      spin: new Float32Array(count), life: new Float32Array(count), rate: new Float32Array(count)}
    const rnd = rand(20250908)
    for (let i = 0; i < count; i++) {
      p.angle[i] = rnd() * Math.PI * 2
      // Distance off the surface, biased to hug it.
      p.gap[i] = R * (0.05 + rnd() ** 1.7 * (cfg.particleSpread - 1.05))
      p.spin[i] = (rnd() - 0.5) * 0.9
      p.life[i] = rnd()
      p.rate[i] = 0.5 + rnd() * 0.8
      size[i] = R * (0.05 + rnd() * 0.11)
    }
    const emberGeo = new THREE.BufferGeometry()
    emberGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    emberGeo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1))
    emberGeo.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
    const emberMat = new THREE.ShaderMaterial({
      uniforms: {uColor: {value: new THREE.Color(cfg.emberColor)}, uOpacity: {value: 0}},
      vertexShader: `
        attribute float aAlpha;
        attribute float aSize;
        varying float vAlpha;
        void main() {
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * 600.0 / max(0.0001, -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vAlpha;
        void main() {
          vec2 d = gl_PointCoord - vec2(0.5);
          float r2 = dot(d, d);
          if (r2 > 0.25) discard;
          gl_FragColor = vec4(uColor, (1.0 - smoothstep(0.0, 0.25, r2)) * vAlpha * uOpacity);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    })
    const embers = new THREE.Points(emberGeo, emberMat)
    embers.renderOrder = RenderOrder.SETTLE_EMBERS
    root.add(embers)

    s = {R, H, yBase, yTop, halo, u: halo.material.uniforms, embers, emberMat, pos, alpha, p, count}
    return true
  }

  const update = (timeMs, camera) => {
    if (!s) return
    const dt = lastMs === null ? 0 : Math.min(timeMs - lastMs, 100) / 1000 * userSpeed
    lastMs = timeMs
    age += dt
    const {R, H, yBase, yTop, u} = s
    const D = cfg.entranceDuration / 1000

    if (camera) root.worldToLocal(u.uCam.value.setFromMatrixPosition(camera.matrixWorld))

    // Reveal sweeps base -> just past the cap in the first half of the entrance.
    const rise = easeInOut(clamp01(age / (D * 0.5)))
    u.uReveal.value = yBase + (yTop + cfg.glowReach * R + H * 0.35 - yBase) * rise

    // Bloom: hairline -> peak at 60% -> settle to the resting falloff, with a breath.
    const k = clamp01(age / D)
    const settled = clamp01((k - 0.6) / 0.4)
    const bloom = k < 0.6 ? easeOut(k / 0.6) : 1
    const breath = 1 + Math.sin(age * cfg.finalPulseSpeed) * 0.1 * settled
    const rest = cfg.glowFalloff * R
    u.uFalloff.value = Math.max(0.01 * R, (rest * 1.6 * bloom + (rest - rest * 1.6) * easeInOut(settled)) * breath)
    u.uOpacity.value = (bloom - (1 - cfg.finalAuraOpacity) * easeInOut(settled)) * breath

    // Embers: rise base -> cap, hugging the profile, fade at birth and death.
    const {count, pos, alpha, p} = s
    const span = yTop - yBase
    for (let i = 0; i < count; i++) {
      p.life[i] = (p.life[i] + dt * 0.14 * p.rate[i]) % 1
      p.angle[i] += dt * p.spin[i] * 0.35
      const y = yBase + span * p.life[i]
      const r = PRODUCT.radiusAt(y / H) * R + p.gap[i] * (1 - 0.3 * p.life[i])
      pos[i * 3] = Math.cos(p.angle[i]) * r
      pos[i * 3 + 1] = y
      pos[i * 3 + 2] = Math.sin(p.angle[i]) * r
      const fade = Math.sin(p.life[i] * Math.PI)
      alpha[i] = fade * fade
    }
    s.embers.geometry.attributes.position.needsUpdate = true
    s.embers.geometry.attributes.aAlpha.needsUpdate = true
    s.emberMat.uniforms.uOpacity.value = easeOut(clamp01((age - 0.3) / 0.8)) * (0.9 - 0.4 * settled) * breath
  }

  const restartEntrance = () => {
    age = 0
    lastMs = null
  }

  return {
    root, build, update, restartEntrance,
    setUserSpeed: (v) => { userSpeed = THREE.MathUtils.clamp(v, 0, 3) },
    getDebugInfo: () => ({glowAge: +age.toFixed(1)}),
  }
}
