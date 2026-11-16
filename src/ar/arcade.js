/**
 * arcade.js — Elements style "Arcade" (Badge Bash): the label is the game board.
 *
 *   Count   a board appears over the cap: 3 · 2 · 1 · GO (a beep each)
 *   Round   the printed badges (cfg.targets) pop out as coins, whack-a-mole style: each comes
 *           off its print, glows, wobbles, sinks back if not tapped. Tap = a spark, it flies
 *           into the board, a synth pop pitched up by the combo (hits < comboMs apart raise
 *           the multiplier; a miss resets it). Pops get faster through the round.
 *           Most pops are on badges facing the camera, some round the side (sideChance), and
 *           every bonusEveryMs a gold coin pops off the logo (cfg.bonus): on this sticker the
 *           badges sit at the sides/back and the logo at the front, so playing means turning
 *           the real bottle. A lime arrow at the bottle's edge points to a target out of view
 *   End     the bottle "levels up": lime charge fills it bottom -> top (PRODUCT.profile
 *           lathed), a flash at the cap, a fanfare; the board shows LEVEL UP, the score and
 *           the best on this phone (localStorage). Tap the board = play again
 *   Exit    coins sink home, the board and charge fade
 *
 * Losing the bottle pauses the round (no updates); coming back resumes it: turning the
 * bottle is the game, a dropout must not cost the round. Coins reuse Tech Orbit's badge face
 * (unlit art, brightness follows the room). The board is a canvas redrawn only when its
 * numbers change; the timer bar is a mesh (scaled, never redrawn). update() allocates
 * nothing outside those redraws.
 */
import * as THREE from 'three'

import {BRAND, PRODUCT, brandFile} from '../config'
import {haptic, tone} from '../sound'
import {cameraLight} from './cameraLight'
import {liveColor} from './liveColor'
import {RenderOrder} from './renderOrder'
import {BADGE, makeFace} from './techOrbit'
import {makeGlow} from './typography'
import {FACING, IDLE, UP, nextCombo, pickHole} from './arcadeRules'

const TAU = Math.PI * 2
const clamp01 = t => Math.min(Math.max(t, 0), 1)
const lerp = (a, b, t) => a + (b - a) * t
const easeInOut = t => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2)
const backOut = t => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2
const wrapPi = (a) => { a %= TAU; return a > Math.PI ? a - TAU : a < -Math.PI ? a + TAU : a }
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

// Coin states (IDLE / UP from arcadeRules.js).
const SINK = 2
const FLY = 3
// Game phases.
const OFF = 0
const COUNT = 1
const PLAY = 2
const END = 3

/** The charge: lime filling the bottle up to uFill (0..1 of its height), bright at the line. */
const chargeMaterial = () => new THREE.ShaderMaterial({
  uniforms: {
    uFill: {value: 0}, uAlpha: {value: 0}, uY0: {value: 0}, uY1: {value: 1}, uTime: {value: 0},
    uColor: {value: new THREE.Color()},
  },
  vertexShader: `
    varying float vY;
    varying vec3 vN;
    varying vec3 vV;
    void main() {
      vY = position.y;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vN = normalize(normalMatrix * normal);
      vV = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    uniform float uFill, uAlpha, uY0, uY1, uTime;
    uniform vec3 uColor;
    varying float vY;
    varying vec3 vN;
    varying vec3 vV;
    void main() {
      float y = (vY - uY0) / (uY1 - uY0);
      if (y > uFill) discard;
      float edge = smoothstep(0.05, 0.0, uFill - y);
      float fres = pow(1.0 - abs(dot(vN, vV)), 2.0);
      float lines = 0.6 + 0.4 * step(0.5, fract(y * 36.0 - uTime));
      gl_FragColor = vec4(uColor, uAlpha * (0.2 * lines + 0.55 * fres + 0.9 * edge));
    }`,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
})

/** The hint arrow's art: a lime chevron pointing right (flipped by rotation for left). */
const makeChevron = () => {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const ctx = c.getContext('2d')
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 18
  ctx.lineCap = ctx.lineJoin = 'round'
  for (const x of [34, 70]) {
    ctx.beginPath()
    ctx.moveTo(x, 30)
    ctx.lineTo(x + 30, 64)
    ctx.lineTo(x, 98)
    ctx.stroke()
  }
  return new THREE.CanvasTexture(c)
}

export const createArcade = (cfg) => {
  const root = new THREE.Group()
  root.name = 'arcade'
  let built = null
  let lastMs = null
  let speed = 1
  let leaving = false
  let fade = 0 // board + charge, 0..1
  let phase = OFF
  let g = 0 // ms into the current phase
  let beat = -1 // countdown number last beeped
  let score = 0
  let combo = 0
  let lastHit = -1e9 // play-clock ms
  let nextSpawn = 0
  let nextBonus = 0
  let best = 0
  let newBest = false
  let bump = 0 // board pulse on a score / beat, 1 -> 0
  let fanfare = false // the level-up has played (END)
  const drawn = {phase: -1, score: -1, combo: -1, n: -1, go: false, fanfare: false} // on the board now
  const BEST_KEY = `arcade-best-${BRAND.id}`
  try { best = Number(localStorage.getItem(BEST_KEY)) || 0 } catch { /* private mode: no best */ }

  const cam = new THREE.Vector3()
  const faceColor = new THREE.Color()

  const start = () => {
    phase = COUNT
    g = 0
    beat = -1
    score = 0
    combo = 0
    newBest = false
    if (built) for (const h of built.all) if (h.state === UP) h.state = SINK
  }

  const hit = (h) => {
    if (phase !== PLAY || leaving || h.state !== UP) return
    combo = nextCombo(combo, g - lastHit, cfg.comboMs, cfg.comboMax)
    lastHit = g
    score += (h.bonus ? cfg.bonusPoints : cfg.points) * combo
    h.state = FLY
    h.f = 0
    h.burst = 1
    h.from.copy(h.holder.position)
    h.flyScale = h.holder.scale.x
    const f = 520 * 2 ** (((combo - 1) * 2) / 12) // a whole tone up per combo step
    tone(f, 110, {type: 'triangle', to: f * 1.5})
    if (h.bonus) tone(f * 2, 160, {type: 'triangle', at: 0.08, level: 0.8})
    haptic(h.bonus ? 30 : 15)
  }

  const build = ({radiusTop, radiusBottom, height: H}) => {
    if (built) return true
    const R = (radiusTop + radiusBottom) / 2
    if (!(R > 0) || !(H > 0) || !cfg.targets?.length) return false
    const {mm, profile} = PRODUCT
    const u = H / mm.labelHeight // engine units per mm
    const span = (mm.labelWidth / mm.circumference) * TAU
    const yTop = profile.at(-1)[0] * H
    const radius = BADGE.ring * u

    const rimGeo = new THREE.CylinderGeometry(radius, radius, 1, 48, 1, true)
    rimGeo.rotateX(Math.PI / 2) // axis along z: faces look out along +z / -z
    const faceGeo = new THREE.CircleGeometry(radius, 48)
    const hitGeo = new THREE.SphereGeometry(radius, 10, 8)
    const hitMat = new THREE.MeshBasicMaterial({visible: false})
    const rimMat = new THREE.MeshBasicMaterial({color: cfg.sideColor})
    const goldRimMat = new THREE.MeshBasicMaterial({color: cfg.goldColor})
    const glowTex = makeGlow()
    const colors = {paper: cfg.paperColor, rim: cfg.rimColor, disc: cfg.discColor}

    const makeHole = (faceUrl, faceColors, spot, bonus) => {
      const faceMat = new THREE.MeshBasicMaterial({map: makeFace(faceUrl, faceColors)})
      const front = new THREE.Mesh(faceGeo, faceMat)
      const back = new THREE.Mesh(faceGeo, faceMat)
      back.rotation.y = Math.PI
      const rim = new THREE.Mesh(rimGeo, bonus ? goldRimMat : rimMat)
      const coin = new THREE.Group()
      coin.add(rim, front, back)
      const holder = new THREE.Group()
      holder.rotation.order = 'YXZ'
      holder.add(coin)
      holder.visible = false
      const hitMesh = new THREE.Mesh(hitGeo, hitMat)
      holder.add(hitMesh)
      root.add(holder)
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
      }))
      glow.renderOrder = RenderOrder.ARCADE_SPARK
      glow.visible = false
      root.add(glow)
      const h = {
        holder, coin, front, back, rim, faceMat, hit: hitMesh, glow, bonus,
        az: (spot.cx / mm.labelWidth - 0.5) * span,
        y0: (0.5 - spot.cy / mm.labelHeight) * H,
        state: IDLE,
        k: 0, // 0 on its print .. 1 popped out
        age: 0, // ms in its state
        upMs: 0,
        f: 0, // flight to the board, 0..1
        burst: 0, // hit spark, 1 -> 0
        from: new THREE.Vector3(),
        flyScale: 1,
        seed: Math.random() * TAU,
      }
      hitMesh.userData.pick = () => hit(h)
      return h
    }

    const holes = cfg.targets.map(t => makeHole(brandFile(`icons/${t.icon}.svg`), colors, t.badge, false))
    const b = cfg.bonus
    const bonus = b?.mark
      ? makeHole(brandFile(b.mark), {paper: '#FFF4CC', rim: '#D99A1E', disc: cfg.goldColor, ink: cfg.discColor}, b, true)
      : null
    const all = bonus ? [...holes, bonus] : holes

    // Board over the cap: canvas art + a lime timer bar (a mesh: scaled, never redrawn).
    const bh = cfg.boardMm * u
    const bw = bh * 2
    const canvas = document.createElement('canvas')
    canvas.width = 768
    canvas.height = 384
    const boardTex = new THREE.CanvasTexture(canvas)
    boardTex.colorSpace = THREE.SRGBColorSpace
    boardTex.anisotropy = 8
    const boardMat = new THREE.MeshBasicMaterial({map: boardTex, transparent: true, opacity: 0, depthWrite: false})
    const boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), boardMat)
    boardMesh.renderOrder = RenderOrder.ARCADE_BOARD
    boardMesh.userData.pick = () => {
      if (phase === END && g > cfg.chargeMs + 500 && !leaving) start()
    }
    const barGeo = new THREE.PlaneGeometry(bw * 0.78, bh * 0.045)
    barGeo.translate(bw * 0.39, 0, 0) // grows from its left end
    const barMat = new THREE.MeshBasicMaterial({color: cfg.color, transparent: true, opacity: 0, depthWrite: false})
    const bar = new THREE.Mesh(barGeo, barMat)
    bar.renderOrder = RenderOrder.ARCADE_BOARD + 0.5
    bar.position.set(-bw * 0.39, -bh * 0.33, bh * 0.01)
    const board = new THREE.Group()
    board.add(boardMesh, bar)
    board.position.y = yTop + cfg.boardGapMm * u + bh / 2
    root.add(board)

    // Level-up charge: the bottle's own shape, just outside the occluder.
    const charge = new THREE.Mesh(
      new THREE.LatheGeometry(profile.map(([y, r]) => new THREE.Vector2(r * R * 1.015, y * H)), 72),
      chargeMaterial(),
    )
    charge.material.uniforms.uY0.value = profile[0][0] * H
    charge.material.uniforms.uY1.value = yTop
    charge.renderOrder = RenderOrder.ARCADE_CHARGE
    charge.visible = false
    root.add(charge)

    const flash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
    }))
    flash.renderOrder = RenderOrder.ARCADE_SPARK
    flash.position.y = yTop
    root.add(flash)

    const hint = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeChevron(), transparent: true, opacity: 0, depthWrite: false,
    }))
    hint.renderOrder = RenderOrder.ARCADE_HINT
    hint.visible = false
    root.add(hint)

    built = {R, H, u, yTop, radius, holes, all, bonus, board, boardMesh, boardMat, boardTex, canvas, bar, barMat, charge, flash, hint, rimMat, goldRimMat}
    return true
  }

  /** Board art for the current numbers. Only called when one of them changed. */
  const drawBoard = (n) => {
    const {canvas, boardTex} = built
    const ctx = canvas.getContext('2d')
    const W = canvas.width
    const Hc = canvas.height
    const P = Hc * 0.05
    ctx.clearRect(0, 0, W, Hc)
    ctx.beginPath()
    ctx.roundRect(P, P, W - 2 * P, Hc - 2 * P, Hc * 0.16)
    const grad = ctx.createLinearGradient(0, 0, 0, Hc)
    grad.addColorStop(0, cfg.cardTop)
    grad.addColorStop(1, cfg.cardBottom)
    ctx.fillStyle = grad
    ctx.fill()
    ctx.lineWidth = Hc * 0.018
    ctx.strokeStyle = cfg.cardEdge
    ctx.stroke()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const big = (text, color, y, px) => {
      ctx.font = `800 ${px}px ${FONT}`
      ctx.fillStyle = color
      ctx.fillText(text, W / 2, y)
    }
    if (phase === COUNT) {
      big(String(n), '#ffffff', Hc * 0.5, Hc * 0.62)
    } else if (phase === PLAY) {
      if (g < 600) big('GO!', cfg.color, Hc * 0.46, Hc * 0.5)
      else big(String(score), '#ffffff', Hc * 0.44, Hc * 0.46)
      if (combo > 1) {
        ctx.font = `800 ${Hc * 0.16}px ${FONT}`
        ctx.textAlign = 'right'
        ctx.fillStyle = cfg.color
        ctx.fillText(`x${combo}`, W - P * 3, P * 4.2)
      }
    } else if (phase === END) {
      big(fanfare ? 'LEVEL UP!' : 'TIME!', cfg.color, Hc * 0.22, Hc * 0.15)
      big(String(score), '#ffffff', Hc * 0.5, Hc * 0.36)
      if (fanfare) {
        ctx.font = `700 ${Hc * 0.11}px ${FONT}`
        ctx.fillStyle = newBest ? cfg.goldColor : 'rgba(255,255,255,0.75)'
        ctx.fillText(newBest ? 'NEW BEST!' : `BEST ${best}`, W / 2, Hc * 0.73)
        ctx.font = `600 ${Hc * 0.075}px ${FONT}`
        ctx.fillStyle = 'rgba(255,255,255,0.55)'
        ctx.fillText('tap to play again', W / 2, Hc * 0.86)
      }
    }
    boardTex.needsUpdate = true
  }

  const update = (timeMs, camera) => {
    if (!built) return
    const dt = lastMs === null ? 0 : Math.min(timeMs - lastMs, 100) * speed
    lastMs = timeMs
    const {R, H, u, yTop, holes, all, bonus, board, boardMat, bar, barMat, charge, flash, hint} = built

    let camAz = 0
    if (camera) {
      root.worldToLocal(cam.copy(camera.position))
      camAz = Math.atan2(cam.x, cam.z)
    }
    const azOff = (cfg.printAzimuthDeg * Math.PI) / 180
    fade = clamp01(fade + ((leaving ? -1 : 1) * dt) / 400)
    if (!leaving) g += dt
    bump = Math.max(bump - dt / 250, 0)

    // --- Game clock -------------------------------------------------------------------
    let n = 0
    if (phase === COUNT) {
      const step = cfg.countdownMs / 3
      n = 3 - Math.min(Math.floor(g / step), 2)
      if (n !== beat) { beat = n; bump = 1; tone(660, 120, {type: 'square', level: 0.5}) }
      if (g >= cfg.countdownMs) {
        phase = PLAY
        g = 0
        lastHit = -1e9
        nextSpawn = 250
        nextBonus = cfg.bonusEveryMs * 0.6
        bump = 1
        tone(1320, 260, {type: 'square', level: 0.5})
        haptic(20)
      }
    } else if (phase === PLAY) {
      const prog = clamp01(g / cfg.roundMs)
      if (g >= nextSpawn) {
        const i = pickHole(holes, camAz - azOff, Math.random(), Math.random(), cfg.sideChance)
        if (i >= 0) {
          const h = holes[i]
          h.state = UP
          h.age = 0
          h.upMs = lerp(cfg.upMsStart, cfg.upMsEnd, prog)
        }
        nextSpawn = g + lerp(cfg.spawnMsStart, cfg.spawnMsEnd, prog) * (0.75 + 0.5 * Math.random())
      }
      if (bonus && g >= nextBonus) {
        if (bonus.state === IDLE) {
          bonus.state = UP
          bonus.age = 0
          bonus.upMs = cfg.bonusUpMs
          tone(990, 90, {type: 'sine', level: 0.6})
          tone(1480, 120, {type: 'sine', level: 0.6, at: 0.09})
        }
        nextBonus = g + cfg.bonusEveryMs
      }
      if (g >= cfg.roundMs) {
        phase = END
        g = 0
        fanfare = false
        for (const h of all) if (h.state === UP) h.state = SINK
        newBest = score > best
        if (newBest) {
          best = score
          try { localStorage.setItem(BEST_KEY, String(best)) } catch { /* not kept */ }
        }
        tone(440, 300, {type: 'square', level: 0.4, to: 880})
      }
    } else if (phase === END && !fanfare && g >= cfg.chargeMs) {
      fanfare = true
      bump = 1
      const notes = newBest ? [523, 659, 784, 1047, 1319] : [523, 659, 784, 1047]
      for (let i = 0; i < notes.length; i++) tone(notes[i], 220, {type: 'triangle', at: i * 0.09})
      haptic(40)
    }

    // --- Coins ----------------------------------------------------------------------
    const L = cameraLight.ready ? cameraLight.luma : 0.18
    faceColor.setScalar(Math.min(1, Math.max(0.45, Math.sqrt(L / 0.18) * cfg.brightness)))
    liveColor(built.rimMat.color, cfg.sideColor)
    liveColor(built.goldRimMat.color, cfg.goldColor)
    let hintHole = null
    let anyFacing = false
    for (const h of all) {
      h.age += dt
      if (h.state === UP) {
        h.k = Math.min(h.k + dt / cfg.popMs, 1)
        if (h.age > h.upMs || leaving) {
          h.state = SINK
          if (phase === PLAY && !leaving) combo = 0 // missed
        }
      } else if (h.state === SINK) {
        h.k = Math.max(h.k - dt / cfg.sinkMs, 0)
        if (h.k <= 0) h.state = IDLE
      } else if (h.state === FLY) {
        h.f = Math.min(h.f + dt / cfg.flyMs, 1)
        if (h.f >= 1) { h.state = IDLE; h.k = 0; bump = 1 }
      }
      h.burst = Math.max(h.burst - dt / 260, 0)

      const az = h.az + azOff
      const facing = Math.cos(az - camAz) > FACING
      if (h.state === UP) {
        if (facing) anyFacing = true
        else if (!hintHole || h.bonus) hintHole = h
      }

      h.holder.visible = h.state !== IDLE
      const pos = h.holder.position
      if (h.state === FLY) {
        // To the board, in an arc, shrinking and spinning.
        const f = easeInOut(h.f)
        pos.lerpVectors(h.from, board.position, f)
        pos.y += Math.sin(h.f * Math.PI) * 0.25 * H
        h.holder.scale.setScalar(Math.max(lerp(h.flyScale, h.flyScale * 0.35, f), 1e-4))
        h.holder.rotation.y += dt * 0.025
        h.holder.rotation.z = 0
      } else if (h.state !== IDLE) {
        const out = h.state === UP ? backOut(h.k) : easeInOut(h.k)
        const r = R * 1.004 + out * cfg.popMm * u
        const wob = Math.sin((timeMs / 1000) * TAU * 1.6 + h.seed)
        pos.set(r * Math.sin(az), h.y0 + wob * 0.6 * u * out, r * Math.cos(az))
        const toCam = Math.atan2(cam.x - pos.x, cam.z - pos.z)
        h.holder.rotation.y = az + wrapPi(toCam - az) * 0.5 * out
        h.holder.rotation.z = wob * 0.18 * out
        // A badge comes off its print at print size; the bonus grows out of the logo.
        const s = h.bonus ? backOut(h.k) * cfg.bonusScale : lerp(1, cfg.popScale, out)
        h.holder.scale.setScalar(Math.max(s, 1e-4))
        const depth = lerp(0.02, cfg.depthMm, out) * u
        h.rim.scale.set(1, 1, Math.max(depth / h.holder.scale.x, 1e-4))
        h.front.position.z = depth / 2 / h.holder.scale.x
        h.back.position.z = -h.front.position.z
      }
      h.hit.scale.setScalar(cfg.hitScale)
      h.faceMat.color.copy(faceColor)

      // Glow behind a coin that is up; a burst where it was hit.
      const up = h.state === UP || h.state === SINK ? (h.state === UP ? h.k : h.k * 0.5) : 0
      const glowK = Math.max(up * 0.55, h.burst)
      h.glow.visible = glowK > 0.01
      if (h.glow.visible) {
        if (h.burst > 0) h.glow.position.copy(h.from)
        else h.glow.position.copy(pos)
        h.glow.material.opacity = glowK
        h.glow.scale.setScalar(built.radius * (h.burst > 0 ? lerp(9, 3, h.burst) : 4))
        liveColor(h.glow.material.color, h.bonus ? cfg.goldColor : cfg.color)
      }
    }

    // --- Hint: a target is up only out of view (or the bonus is) -> arrow at the edge ---
    const showHint = phase === PLAY && hintHole && (hintHole.bonus || !anyFacing)
    hint.visible = !!showHint
    if (showHint) {
      const side = wrapPi(hintHole.az + azOff - camAz) > 0 ? 1 : -1
      const a = camAz + side * Math.PI * 0.5
      const pulse = (Math.sin((timeMs / 1000) * TAU * 1.5) + 1) / 2
      const r = R * (1.7 + 0.25 * pulse)
      hint.position.set(r * Math.sin(a), hintHole.y0, r * Math.cos(a))
      hint.scale.setScalar(built.radius * 2.6)
      hint.material.rotation = side > 0 ? 0 : Math.PI // drawn pointing right (+1 = screen right)
      hint.material.opacity = 0.55 + 0.45 * pulse
      liveColor(hint.material.color, hintHole.bonus ? cfg.goldColor : cfg.color)
    }

    // --- Board ------------------------------------------------------------------------
    const go = phase === PLAY && g < 600
    const c = phase === PLAY ? combo : 0
    // Exiting (OFF): keep the last art while it fades.
    if (phase !== OFF && (drawn.phase !== phase || drawn.score !== score || drawn.combo !== c ||
      drawn.n !== n || drawn.go !== go || drawn.fanfare !== fanfare)) {
      Object.assign(drawn, {phase, score, combo: c, n, go, fanfare})
      drawBoard(n)
    }
    board.visible = fade > 0.001 && drawn.phase !== -1
    if (board.visible) {
      board.rotation.y = camAz
      board.scale.setScalar(1 + 0.1 * bump)
      boardMat.opacity = fade
      bar.visible = phase === PLAY
      bar.scale.x = Math.max(1 - g / cfg.roundMs, 1e-4)
      barMat.opacity = fade
      liveColor(barMat.color, cfg.color)
    }

    // --- Level-up: charge + flash -------------------------------------------------------
    const fill = phase === END ? easeInOut(clamp01(g / cfg.chargeMs)) : 0
    const un = charge.material.uniforms
    un.uFill.value = Math.max(fill, un.uFill.value * (phase === END ? 1 : 0.9))
    un.uAlpha.value = fade * (phase === END ? lerp(0.6, 0.35, clamp01((g - cfg.chargeMs) / 1500)) : un.uAlpha.value * 0.9)
    un.uTime.value = timeMs / 1000
    liveColor(un.uColor.value, cfg.color)
    charge.visible = un.uAlpha.value > 0.005 && un.uFill.value > 0.001
    const fk = phase === END && g >= cfg.chargeMs ? Math.exp(-(g - cfg.chargeMs) / 300) : 0
    flash.visible = fk > 0.01
    if (flash.visible) {
      flash.material.opacity = fk * fade * 0.8
      flash.scale.setScalar(lerp(1.3, 0.6, fk) * R * 2.4) // bigger washed the whole frame
      liveColor(flash.material.color, cfg.color)
    }
    flash.position.y = yTop
  }

  return {
    root, build, update,
    // A first start, or back after an exit: a new game. A tracking replay mid-round keeps it.
    restartEntrance: () => {
      lastMs = null
      if (leaving || phase === OFF) { leaving = false; start() }
    },
    exit: () => { leaving = true; phase = OFF },
    isExited: () => !built || (leaving && fade <= 0 && built.all.every(h => h.state === IDLE)),
    getPickables: () => {
      if (!built) return []
      const out = []
      const camAz = Math.atan2(cam.x, cam.z)
      for (const h of built.all) {
        // Behind the bottle = not tappable (the ray would pass through it).
        if (h.state === UP && h.k > 0.3 && Math.cos(h.az + (cfg.printAzimuthDeg * Math.PI) / 180 - camAz) > -0.3) out.push(h.hit)
      }
      if (phase === END) out.push(built.boardMesh)
      return out
    },
    setUserSpeed: v => { speed = v },
    getDebugInfo: () => ({arcade: `${['off', 'count', 'play', 'end'][phase]} · ${score} pts · x${combo} · best ${best}`}),
  }
}
