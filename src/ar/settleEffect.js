/**
 * settleEffect.js
 *
 * Animation #12 — SETTLE: a warm golden glow that gathers around the tracked bottle,
 * peaks, then settles into a calm premium aura.
 *
 * Implements the ANIMATION MODULE CONTRACT in src/config.js, so it is switched on and
 * off from there and needs no changes in bottleScene.js.
 *
 * LAYERS (5 draw calls total)
 *   1. Edge aura      three nested cylinder shells that read as one soft rim of light
 *   2. Energy ribbon  ONE line sweeping around the bottle, rising as it travels
 *   3. Embers         a single Points cloud of drifting sparks
 *   4. Base glow      a soft field concentrated around the lower body
 *   (the aura's three shells share one geometry but need separate opacities, so they
 *   are three meshes — still only three calls, and they merge visually into one glow)
 *
 * DEPTH IS REAL
 * Nothing here billboards. Every layer is a child of the tracked anchor, so it rotates
 * with the bottle's pose, and every material keeps `depthTest: true` — the shared
 * occlusion proxy (occlusionProxy.js) hides whatever passes behind the physical bottle.
 * The ribbon and embers therefore travel front -> side -> back -> side -> front with
 * genuine depth rather than sliding over the label.
 *
 * SIZED FROM RUNTIME GEOMETRY
 * Every dimension derives from the engine's reported {radiusTop, radiusBottom, height}.
 * No bottle measurement is hardcoded; the effect rescales with the target.
 *
 * PERFORMANCE
 * `update` allocates nothing: particle state lives in preallocated Float32Arrays that
 * are mutated in place, and all vector maths reuses module-level scratch objects.
 */
import * as THREE from 'three'

import {HEIGHT_SCALE, Y_OFFSET_SCALE} from './occlusionProxy'

/** Parses "#RRGGBB" (or a number) into a THREE.Color-compatible hex. */
const toHex = (value, fallback) => {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && /^#?[0-9a-f]{6}$/i.test(value)) {
    return parseInt(value.replace('#', ''), 16)
  }
  return fallback
}

/** Defaults; every one can be overridden from the animation's config block. */
const DEFAULTS = {
  glowColor: '#FFD45A',        // primary gold
  highlightColor: '#FFF1A8',   // bright highlight
  deepColor: '#D99A22',        // deep warm gold
  emberColor: '#FFF8D6',       // very soft warm white

  entranceDuration: 2000,      // ms; the full cinematic entrance
  energySpeed: 1.6,            // ribbon revolutions per second at peak

  innerGlowScale: 1.01,
  middleGlowScale: 1.035,
  outerGlowScale: 1.08,

  particleCount: 160,
  particleSpread: 1.2,         // outer particle radius, in bottle radii

  finalAuraOpacity: 0.3,       // steady-state rim intensity
  finalPulseSpeed: 0.55,       // rad/s of the resting breath
}

/** easeOutCubic — fast start, gentle arrival. Used for anything that grows. */
const easeOut = t => 1 - Math.pow(1 - t, 3)

/** easeInOutSine — for the settle, where both ends should feel soft. */
const easeInOut = t => -(Math.cos(Math.PI * t) - 1) / 2

/** Deterministic pseudo-random, so the ember field looks identical every run. */
const rand = (seed) => {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

export const createSettleEffect = (config = {}) => {
  const cfg = {...DEFAULTS, ...config}
  const COLOR = {
    glow: toHex(cfg.glowColor, 0xffd45a),
    highlight: toHex(cfg.highlightColor, 0xfff1a8),
    deep: toHex(cfg.deepColor, 0xd99a22),
    ember: toHex(cfg.emberColor, 0xfff8d6),
  }

  const root = new THREE.Group()
  root.visible = false

  let built = false
  let state = null
  let entranceStart = null
  let userSpeed = 1
  let lastFrameT = null
  let ribbonPhase = 0
  let progress = 0
  let phaseName = 'entrance'


  /**
   * Builds every layer from the real cylinder.
   * @param {{radiusTop:number, radiusBottom:number, height:number}} geometry
   */
  const build = (geometry) => {
    if (built || !geometry) return false

    const {radiusTop, radiusBottom, height} = geometry
    const radii = [radiusTop, radiusBottom].filter(r => Number.isFinite(r) && r > 0)
    if (!radii.length || !Number.isFinite(height) || height <= 0) return false

    const r = radii.reduce((a, b) => a + b, 0) / radii.length

    /*
     * The glow must cover the PHYSICAL bottle, not just the tracked label band. The
     * occlusion proxy already models that volume, so its scale and offset are imported
     * rather than re-derived — if the proxy's idea of the bottle changes, the glow
     * follows it instead of drifting out of alignment.
     */
    const bodyHeight = height * HEIGHT_SCALE
    const bodyY = height * Y_OFFSET_SCALE

    // ---------------------------------------------------------------- LAYER 1: aura
    /*
     * Three open-ended cylinder shells at increasing radius and decreasing opacity.
     * `BackSide` means only the FAR wall of each shell is drawn: the near wall would
     * otherwise sit as a flat translucent film over the label, which reads as a plastic
     * sleeve rather than a rim of light. Drawing the far wall lets the glow appear to
     * wrap the silhouette.
     */
    /*
     * SILHOUETTE, NOT A CYLINDER.
     *
     * A straight cylinder scaled to the bottle's full height cuts a hard flat ring
     * across the domed cap and stops abruptly at the base — the glow ends mid-cap
     * instead of following the product. The image target legitimately describes only
     * the 52mm label band (that is what an image target IS), so the bottle's shoulder,
     * neck and cap have to be modelled here.
     *
     * PROFILE is the bottle's radius as a fraction of the label radius, sampled up the
     * object: straight through the label, tucking in at the shoulder, narrow at the
     * neck, flaring back out for the cap, then closing over the dome. `y` is a fraction
     * of the label height, measured from the label's centre — so the whole profile
     * still scales from the tracked geometry and nothing is expressed in millimetres.
     */
    const PROFILE = [
      // y (in label heights)   radius (x label radius)   alpha (edge fade)
      [-0.78, 0.94, 0.0],   // just under the base: fades out
      [-0.70, 0.99, 0.7],
      [-0.50, 1.00, 1.0],
      [0.50, 1.00, 1.0],    // top of the label band
      [0.62, 0.98, 1.0],    // shoulder begins
      [0.78, 0.88, 0.95],   // shoulder curve
      [0.90, 0.76, 0.9],    // neck
      [0.98, 0.74, 0.9],
      [1.04, 0.86, 0.85],   // cap flares out
      [1.20, 0.87, 0.8],    // cap wall
      [1.26, 0.80, 0.5],    // cap dome starts
      [1.30, 0.62, 0.2],
      [1.32, 0.40, 0.0],    // dome closes: fades out
    ]

    /**
     * Builds one shell of the aura by lathing PROFILE at a given radial offset.
     *
     * Per-vertex alpha carries the end fade, so the glow dissolves at the base and over
     * the cap instead of terminating on a hard rim. A uniform-opacity material cannot
     * do this, which is why these use a small shader.
     */
    const buildShell = (radiusScale) => {
      const seg = 48
      const rings = PROFILE.length
      const pos = new Float32Array(rings * (seg + 1) * 3)
      const alpha = new Float32Array(rings * (seg + 1))
      const idx = []

      for (let ri = 0; ri < rings; ri++) {
        const [py, pr, pa] = PROFILE[ri]
        const y = py * height          // profile y is in label heights
        const rad = pr * r * radiusScale
        for (let si = 0; si <= seg; si++) {
          const a = (si / seg) * Math.PI * 2
          const v = ri * (seg + 1) + si
          pos[v * 3] = Math.cos(a) * rad
          pos[v * 3 + 1] = y
          pos[v * 3 + 2] = Math.sin(a) * rad
          alpha[v] = pa
        }
      }
      for (let ri = 0; ri < rings - 1; ri++) {
        for (let si = 0; si < seg; si++) {
          const a = ri * (seg + 1) + si
          const b = a + seg + 1
          idx.push(a, b, a + 1, a + 1, b, b + 1)
        }
      }

      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1))
      geo.setIndex(idx)
      return geo
    }

    /*
     * Peaks are higher than the previous flat-fill values because the rim term
     * concentrates light into the silhouette edges and discards most of the face —
     * the same numbers would render almost invisible.
     */
    const auraSpec = [
      {scale: cfg.innerGlowScale, color: COLOR.highlight, opacity: 1.15},
      {scale: cfg.middleGlowScale, color: COLOR.glow, opacity: 0.7},
      {scale: cfg.outerGlowScale, color: COLOR.deep, opacity: 0.4},
    ]
    const auraShells = auraSpec.map((spec) => {
      const material = new THREE.ShaderMaterial({
        uniforms: {
          uColor: {value: new THREE.Color(spec.color)},
          uOpacity: {value: 0},
        },
        vertexShader: `
          attribute float aAlpha;
          varying float vAlpha;
          varying vec3 vNormalView;
          varying vec3 vPosView;
          void main() {
            vAlpha = aAlpha;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vPosView = mv.xyz;
            // Surface normal of a lathed shell points radially outward.
            vNormalView = normalize(normalMatrix * vec3(position.x, 0.0, position.z));
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: `
          uniform vec3 uColor;
          uniform float uOpacity;
          varying float vAlpha;
          varying vec3 vNormalView;
          varying vec3 vPosView;
          void main() {
            /*
             * Fresnel-style rim: brightest where the surface turns away from the
             * viewer, i.e. at the silhouette edges. This is what makes the glow read
             * as light wrapping the product rather than a translucent skin over it.
             */
            vec3 viewDir = normalize(-vPosView);
            float facing = abs(dot(normalize(vNormalView), viewDir));
            float rim = pow(1.0 - facing, 2.2);
            gl_FragColor = vec4(uColor, rim * vAlpha * uOpacity);
          }
        `,
        transparent: true,
        depthWrite: false,
        depthTest: true,            // occluded by the proxy like everything else
        side: THREE.DoubleSide,     // rim shading needs both walls
        blending: THREE.AdditiveBlending,
      })
      const mesh = new THREE.Mesh(buildShell(spec.scale), material)
      root.add(mesh)
      return {mesh, material, peak: spec.opacity}
    })

    // ------------------------------------------------------- LAYER 2: energy ribbon
    /*
     * ONE path, not a ring of geometry. A tube or torus would read as a solid yellow
     * object orbiting the bottle; a fading polyline trail reads as light travelling.
     *
     * The trail is a fixed-length buffer of points whose positions are rewritten each
     * frame — the head advances around the bottle and the tail follows, so nothing is
     * allocated per frame.
     */
    const TRAIL = 64
    const ribbonGeo = new THREE.BufferGeometry()
    const ribbonPos = new Float32Array(TRAIL * 3)
    const ribbonAlpha = new Float32Array(TRAIL)
    ribbonGeo.setAttribute('position', new THREE.BufferAttribute(ribbonPos, 3))
    ribbonGeo.setAttribute('aAlpha', new THREE.BufferAttribute(ribbonAlpha, 1))

    /*
     * A tiny ShaderMaterial rather than LineBasicMaterial: the trail needs a per-vertex
     * alpha ramp so the tail fades out, and line materials only carry one uniform
     * opacity for the whole line.
     */
    const ribbonMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: {value: new THREE.Color(COLOR.highlight)},
        uOpacity: {value: 0},
      },
      vertexShader: `
        attribute float aAlpha;
        varying float vAlpha;
        void main() {
          vAlpha = aAlpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vAlpha;
        void main() {
          gl_FragColor = vec4(uColor, vAlpha * uOpacity);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    })
    const ribbon = new THREE.Line(ribbonGeo, ribbonMat)
    root.add(ribbon)

    // ------------------------------------------------------------ LAYER 3: embers
    /*
     * One Points cloud — a single draw call for every spark.
     *
     * Per-particle state lives in plain Float32Arrays alongside the position buffer:
     * angle, radius, rise speed, spin, size and life. `update` mutates these in place.
     */
    const N = Math.max(0, Math.floor(cfg.particleCount))
    const emberGeo = new THREE.BufferGeometry()
    const emberPos = new Float32Array(N * 3)
    const emberAlpha = new Float32Array(N)
    const emberSize = new Float32Array(N)

    const pAngle = new Float32Array(N)
    const pRadius = new Float32Array(N)
    const pRise = new Float32Array(N)
    const pSpin = new Float32Array(N)
    const pLife = new Float32Array(N)
    const pSpeed = new Float32Array(N)

    // Particles live between just below the base and well above the cap.
    /*
     * Expressed against the PROFILE's own extents (label heights) so the embers rise
     * along the bottle and drift off just above the cap, rather than being sized from
     * the straight proxy cylinder, which ended mid-cap.
     */
    const yBottom = -height * 0.78
    const ySpan = height * 2.25

    const rnd = rand(20250908)
    for (let i = 0; i < N; i++) {
      pAngle[i] = rnd() * Math.PI * 2
      // Biased toward the inner edge so the field hugs the bottle rather than
      // scattering evenly across a wide band.
      pRadius[i] = r * (1.05 + Math.pow(rnd(), 1.7) * (cfg.particleSpread - 1.05))
      pRise[i] = 0.35 + rnd() * 0.8
      pSpin[i] = (rnd() - 0.5) * 0.9
      pLife[i] = rnd()                       // staggered so they do not pulse in unison
      pSpeed[i] = 0.5 + rnd() * 0.8
      emberSize[i] = r * (0.05 + rnd() * 0.11)
    }

    emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPos, 3))
    emberGeo.setAttribute('aAlpha', new THREE.BufferAttribute(emberAlpha, 1))
    emberGeo.setAttribute('aSize', new THREE.BufferAttribute(emberSize, 1))

    /*
     * Custom point shader so each ember can carry its own size and alpha, and so the
     * sprite is a soft radial falloff rather than a hard square. A PointsMaterial would
     * force one size for all of them.
     */
    const emberMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: {value: new THREE.Color(COLOR.ember)},
        uOpacity: {value: 0},
        uScale: {value: 600},
      },
      vertexShader: `
        attribute float aAlpha;
        attribute float aSize;
        varying float vAlpha;
        void main() {
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / max(0.0001, -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vAlpha;
        void main() {
          // Soft round falloff; discard outside the disc so sparks are not squares.
          vec2 d = gl_PointCoord - vec2(0.5);
          float r2 = dot(d, d);
          if (r2 > 0.25) discard;
          float falloff = 1.0 - smoothstep(0.0, 0.25, r2);
          gl_FragColor = vec4(uColor, falloff * vAlpha * uOpacity);
        }
      `,
      uniformsNeedUpdate: true,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    })
    const embers = new THREE.Points(emberGeo, emberMat)
    root.add(embers)

    // -------------------------------------------------------- LAYER 4: base glow
    /*
     * A short, wider shell around the lower body — light pooling at the base before it
     * settles. Deliberately a shell around the bottle, NOT a disc underneath it: a disc
     * would read as a platform the bottle is standing on.
     */
    const baseGeo = new THREE.CylinderGeometry(1, 1, 1, 40, 24, true)
    const baseMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: {value: new THREE.Color(COLOR.deep)},
        uOpacity: {value: 0},
      },
      vertexShader: `
        varying float vY;
        varying vec3 vNormalView;
        varying vec3 vPosView;
        void main() {
          // Local y runs -0.5..0.5 on a unit cylinder; remap to 0..1 for the fade.
          vY = position.y + 0.5;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vPosView = mv.xyz;
          vNormalView = normalize(normalMatrix * vec3(position.x, 0.0, position.z));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vY;
        varying vec3 vNormalView;
        varying vec3 vPosView;
        void main() {
          // Vertical falloff: strongest low down, gone by the top. Without this the
          // shell ends on a hard rim, which reads as a band rather than pooled light.
          float vertical = smoothstep(1.0, 0.15, vY) * smoothstep(0.0, 0.12, vY);
          vec3 viewDir = normalize(-vPosView);
          float rim = pow(1.0 - abs(dot(normalize(vNormalView), viewDir)), 2.0);
          gl_FragColor = vec4(uColor, rim * vertical * uOpacity);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    })
    const baseGlow = new THREE.Mesh(baseGeo, baseMat)
    /*
     * Spans the base up to just above the label's centre. Sized so the shell's lower
     * edge lands on the bottle's base rather than hanging below it into the table —
     * the vertical falloff in the shader has already faded it to nothing by then.
     */
    baseGlow.scale.set(r * 1.16, height * 1.3, r * 1.16)
    baseGlow.position.y = -height * 0.13
    root.add(baseGlow)

    state = {
      r, bodyHeight, bodyY, yBottom, ySpan,
      auraShells, ribbon, ribbonMat, ribbonPos, ribbonAlpha, TRAIL,
      embers, emberMat, emberPos, emberAlpha,
      pAngle, pRadius, pRise, pSpin, pLife, pSpeed, N,
      baseGlow,
    }
    built = true
    console.log('[AR] settle effect built', {
      bottleRadius: +r.toFixed(4),
      bodyHeight: +bodyHeight.toFixed(4),
      particles: N,
      drawCalls: 3 + 1 + 1 + 1,
    })
    return true
  }

  const restartEntrance = () => {
    entranceStart = null
    lastFrameT = null
    ribbonPhase = 0
    progress = 0
    phaseName = 'entrance'
  }

  const setUserSpeed = (v) => {
    userSpeed = THREE.MathUtils.clamp(v, 0, 3)
  }

  /**
   * Per-frame update. Allocates nothing.
   * @param {number} timeMs
   * @param {THREE.Camera} camera unused: nothing here billboards, by design
   */
  const update = (timeMs) => {
    if (!state) return
    const t = timeMs / 1000
    if (entranceStart === null) entranceStart = t
    const age = t - entranceStart

    /*
     * Integrated time, not absolute: multiplying elapsed time by a changing speed
     * retroactively rewrites the motion, which shows as a jump the moment the speed
     * control is touched. Clamped so a backgrounded tab cannot leap the animation.
     */
    const dt = lastFrameT === null ? 0 : THREE.MathUtils.clamp(t - lastFrameT, 0, 0.1)
    lastFrameT = t

    const D = cfg.entranceDuration / 1000
    progress = THREE.MathUtils.clamp(age / D, 0, 1)

    /*
     * Entrance envelope. The glow RISES to a peak then eases back to a calmer resting
     * level — that overshoot-and-settle is what makes it read as energy settling rather
     * than a value fading up. Peak lands at ~60% of the entrance (1.2s of 2.0s).
     */
    const PEAK_AT = 0.6
    let envelope
    if (progress < PEAK_AT) {
      envelope = easeOut(progress / PEAK_AT)
      phaseName = 'entrance'
    } else {
      const after = (progress - PEAK_AT) / (1 - PEAK_AT)
      envelope = 1 - easeInOut(after) * (1 - cfg.finalAuraOpacity / 0.55)
      phaseName = progress >= 1 ? 'settled' : 'settling'
    }

    // Resting breath, only once settled, so the entrance is not muddied by it.
    const settledness = THREE.MathUtils.clamp((progress - PEAK_AT) / (1 - PEAK_AT), 0, 1)
    const breath = 1 + Math.sin(t * cfg.finalPulseSpeed) * 0.12 * settledness

    // ------------------------------------------------------------------ aura
    // Staggered so the outer shells expand slightly after the inner edge lights up.
    for (let i = 0; i < state.auraShells.length; i++) {
      const shell = state.auraShells[i]
      const delay = 0.15 + i * 0.12
      const local = THREE.MathUtils.clamp((age - delay) / 0.7, 0, 1)
      // Shader uniform, not material.opacity: these shells carry per-vertex alpha for
      // the end fade, so brightness is driven through the shader instead.
      shell.material.uniforms.uOpacity.value =
        shell.peak * envelope * easeOut(local) * breath
    }

    // ---------------------------------------------------------------- ribbon
    /*
     * The head climbs as it circles, so one revolution also lifts it up the bottle —
     * a rising spiral rather than a flat spinning ring. Speed decays as the effect
     * settles, so the ribbon slows to a drift instead of orbiting forever.
     */
    const ribbonRate = cfg.energySpeed * userSpeed * (1 - 0.72 * settledness)
    ribbonPhase += dt * ribbonRate

    const {TRAIL, ribbonPos, ribbonAlpha, r, yBottom, ySpan} = state
    const ribbonIn = THREE.MathUtils.clamp((age - 0.55) / 0.5, 0, 1)
    for (let i = 0; i < TRAIL; i++) {
      // i = 0 is the head; higher i trails behind it.
      const back = i / (TRAIL - 1)
      const a = (ribbonPhase - back * 0.55) * Math.PI * 2
      // Rise mapped over the revolution, with a gentle wave so it is not a rigid helix.
      const climb = ((a / (Math.PI * 2)) % 1 + 1) % 1
      const wobble = Math.sin(a * 3) * 0.04
      const rad = r * (1.045 + wobble)
      ribbonPos[i * 3] = Math.cos(a) * rad
      ribbonPos[i * 3 + 1] = yBottom + ySpan * (0.12 + climb * 0.62) + wobble * r
      ribbonPos[i * 3 + 2] = Math.sin(a) * rad
      // Tail fades out; head is brightest.
      ribbonAlpha[i] = (1 - back) * (1 - back)
    }
    state.ribbon.geometry.attributes.position.needsUpdate = true
    state.ribbon.geometry.attributes.aAlpha.needsUpdate = true
    // Fades away almost entirely once settled: a permanent orbit would be distracting.
    state.ribbonMat.uniforms.uOpacity.value =
      easeOut(ribbonIn) * envelope * (1 - 0.82 * settledness)

    // ---------------------------------------------------------------- embers
    const {N, pAngle, pRadius, pRise, pSpin, pLife, pSpeed, emberPos, emberAlpha} = state
    const emberIn = THREE.MathUtils.clamp((age - 0.15) / 0.6, 0, 1)
    for (let i = 0; i < N; i++) {
      // Life advances at the particle's own rate, wrapping to respawn at the base.
      pLife[i] += dt * 0.14 * pSpeed[i] * userSpeed * (1 - 0.45 * settledness)
      if (pLife[i] > 1) pLife[i] -= 1

      const life = pLife[i]
      // Slight spiral: the angle drifts as the particle rises.
      pAngle[i] += dt * pSpin[i] * 0.35 * userSpeed
      const a = pAngle[i]

      // Gentle inward attraction as it climbs, so sparks converge toward the bottle
      // rather than fanning outward.
      const pull = 1 - 0.16 * life
      const rad = pRadius[i] * pull

      emberPos[i * 3] = Math.cos(a) * rad
      emberPos[i * 3 + 1] = yBottom + ySpan * life * pRise[i]
      emberPos[i * 3 + 2] = Math.sin(a) * rad

      // Fade in at birth, out at death, so nothing pops in or out abruptly.
      const fade = Math.sin(life * Math.PI)
      emberAlpha[i] = fade * fade
    }
    state.embers.geometry.attributes.position.needsUpdate = true
    state.embers.geometry.attributes.aAlpha.needsUpdate = true
    state.emberMat.uniforms.uOpacity.value =
      easeOut(emberIn) * envelope * (0.55 + 0.45 * (1 - settledness)) * breath

    // -------------------------------------------------------------- base glow
    const baseIn = THREE.MathUtils.clamp((age - 0.35) / 0.8, 0, 1)
    state.baseGlow.material.uniforms.uOpacity.value =
      0.85 * envelope * easeOut(baseIn) * breath

  }

  const setVisible = (v) => {
    root.visible = v
  }

  const isBuilt = () => built

  const getDebugInfo = () => (state
    ? {
      settlePhase: phaseName,
      settleProgress: +progress.toFixed(2),
      settleParticles: state.N,
      settleEnergySpeed: +(cfg.energySpeed * userSpeed).toFixed(2),
    }
    : null)

  return {
    root, build, update, setVisible, isBuilt,
    restartEntrance, setUserSpeed, getDebugInfo,
  }
}
