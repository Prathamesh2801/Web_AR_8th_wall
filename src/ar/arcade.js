/**
 * arcade.js — Elements style "Arcade" (Badge Bash): the label's badges become a game board.
 *
 *   Entry   the printed badges (cfg.targets) peel off their prints one by one and fly round
 *           the bottle to sockets BESIDE it: two columns (left / right), each a dim ring,
 *           laid out in the viewer's frame (like Photo Burst's fan), so the board always
 *           faces the phone and the bottle never has to move. Badges on the left of the
 *           bottle take the left column (layoutSockets): none crosses the bottle. The board
 *           over the cap says READY?, then 3 · 2 · 1 · GO (a beep each)
 *   Round   a badge pops out of its socket toward you (brighter, bigger, glowing, wobbling)
 *           and sinks back if not tapped. Tap = a spark, it flies into the score, a synth pop
 *           pitched up by the combo (hits < comboMs apart raise the multiplier; a miss resets
 *           it), then it grows back in its socket. Pops get faster through the round. Every
 *           bonusEveryMs a gold coin (cfg.bonus.mark) rises out of the cap and hovers in front
 *           of it for a moment
 *   End     the bottle "levels up": lime charge fills it bottom -> top (PRODUCT.profile
 *           lathed), a flash at the cap, a fanfare; the board shows LEVEL UP, the score and
 *           the best on this phone (localStorage). Tap the board = play again (badges stay)
 *   Exit    coins sink, the badges fly home onto their prints, the board and charge fade
 *
 * Why a board and not the prints: on the device, turning the bottle to reach badges round
 * the back lost tracking (crop hand-over) and players didn't know they should. Losing the
 * bottle pauses the round (no updates); coming back resumes it. Coins reuse Tech Orbit's
 * badge face (unlit art, brightness follows the room). The board is a canvas redrawn only
 * when its numbers change; the timer bar is a mesh (scaled, never redrawn). update()
 * allocates nothing outside those redraws and the once-per-game socket layout.
 */
import * as THREE from 'three'

import {BRAND, PRODUCT, brandFile} from '../config'
import {haptic, tone} from '../sound'
import {cameraLight} from './cameraLight'
import {liveColor} from './liveColor'
import {RenderOrder} from './renderOrder'
import {BADGE, makeFace} from './techOrbit'
import {makeGlow} from './typography'
import {IDLE, UP, layoutSockets, nextCombo, pickHole} from './arcadeRules'

const TAU = Math.PI * 2
const clamp01 = t => Math.min(Math.max(t, 0), 1)
const lerp = (a, b, t) => a + (b - a) * t
const easeInOut = t => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2)
const easeOut = t => 1 - (1 - t) ** 3
const backOut = t => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2
const wrapPi = (a) => { a %= TAU; return a > Math.PI ? a - TAU : a < -Math.PI ? a + TAU : a }
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

// Coin states (IDLE / UP from arcadeRules.js).
const SINK = 2
const FLY = 3 // hit: to the score
const REGROW = 4 // back in its socket after a hit
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

export const createArcade = (cfg) => {
  const root = new THREE.Group()
  root.name = 'arcade'
  let built = null
  let lastMs = null
  let speed = 1
  let leaving = false
  let fade = 0 // board + charge, 0..1
  let te = 0 // entry clock, ms: badges print -> socket; runs back on exit
  let needLayout = true // pick sockets for this view before the badges fly
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
  const seat = new THREE.Vector3()
  const capPt = new THREE.Vector3()
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
    const ringGeo = new THREE.RingGeometry(radius * 1.12, radius * 1.3, 48)
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
      // The socket: a dim ring the badge sits in (not for the bonus: it has no seat).
      let ring = null
      if (!bonus) {
        ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
          color: cfg.color, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
        }))
        ring.renderOrder = RenderOrder.ARCADE_RING
        ring.visible = false
        root.add(ring)
      }
      const h = {
        holder, coin, front, back, rim, faceMat, hit: hitMesh, glow, ring, bonus,
        az: spot ? (spot.cx / mm.labelWidth - 0.5) * span : 0, // its print
        y0: spot ? (0.5 - spot.cy / mm.labelHeight) * H : 0,
        col: 0, row: 0, // its socket (layoutSockets)
        p: 0, // 0 on its print .. 1 in its socket
        state: IDLE,
        k: 0, // 0 seated .. 1 popped out
        re: 1, // regrow in the socket after a hit, 0 -> 1
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
    const bonus = cfg.bonus?.mark
      ? makeHole(brandFile(cfg.bonus.mark), {paper: '#FFF4CC', rim: '#D99A1E', disc: cfg.goldColor, ink: cfg.discColor}, null, true)
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

    built = {R, H, u, yTop, radius, rows: 1, holes, all, bonus, board, boardMesh, boardMat, boardTex, canvas, bar, barMat, charge, flash, rimMat, goldRimMat}
    return true
  }

  /** Sockets for this view: badges left of the bottle take the left column. Once per game. */
  const layout = (camAz, azOff) => {
    const {holes} = built
    const s = layoutSockets(holes.map(h => Math.sin(h.az + azOff - camAz)), holes.map(h => h.y0))
    holes.forEach((h, i) => { h.col = s[i].col; h.row = s[i].row })
    built.rows = Math.max(...s.map(x => x.row)) + 1
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
      if (n) big(String(n), '#ffffff', Hc * 0.5, Hc * 0.62)
      else big('READY?', cfg.color, Hc * 0.5, Hc * 0.3)
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
    const {R, H, u, yTop, holes, all, bonus, board, boardMat, bar, barMat, charge, flash} = built

    let camAz = 0
    if (camera) {
      root.worldToLocal(cam.copy(camera.position))
      camAz = Math.atan2(cam.x, cam.z)
    }
    const sinA = Math.sin(camAz)
    const cosA = Math.cos(camAz)
    const azOff = (cfg.printAzimuthDeg * Math.PI) / 180
    if (needLayout && te <= 0 && camera) { layout(camAz, azOff); needLayout = false }

    // Entry clock: forward while on; on exit it runs back once every coin is seated.
    const teEnd = (holes.length - 1) * cfg.entryStaggerMs + cfg.entryFlyMs
    let busy = false
    for (const h of all) if (h.state !== IDLE) busy = true
    te = leaving ? (busy ? te : Math.max(te - dt * cfg.exitSpeed, 0)) : Math.min(te + dt, teEnd)
    if (leaving && te <= 0) needLayout = true // next time: sockets for that view
    const seated = te >= teEnd

    fade = clamp01(fade + ((leaving ? -1 : 1) * dt) / 400)
    if (!leaving && (phase !== COUNT || seated)) g += dt
    bump = Math.max(bump - dt / 250, 0)

    // --- Game clock -------------------------------------------------------------------
    let n = 0
    if (phase === COUNT && seated) {
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
        const i = pickHole(holes, Math.random())
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
    const rows = built.rows
    const yLo = cfg.rowBottom * H
    const yHi = cfg.rowTop * H
    const colX = cfg.columnX * R
    const fwd = cfg.forward * R
    for (let i = 0; i < all.length; i++) {
      const h = all[i]
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
        if (h.f >= 1) {
          bump = 1
          h.k = 0
          if (h.bonus) h.state = IDLE
          else { h.state = REGROW; h.re = 0 }
        }
      } else if (h.state === REGROW) {
        h.re = Math.min(h.re + dt / cfg.regrowMs, 1)
        if (h.re >= 1) h.state = IDLE
      }
      h.burst = Math.max(h.burst - dt / 260, 0)

      const pos = h.holder.position
      const out = h.state === UP ? backOut(h.k) : easeInOut(h.k)
      const wob = Math.sin((timeMs / 1000) * TAU * 1.6 + h.seed) * out
      let scale = 1
      let dim = 1
      if (h.bonus) {
        // Out of the cap, hovering in front of it (toward the viewer).
        h.holder.visible = h.state !== IDLE
        if (h.state === UP || h.state === SINK) {
          capPt.set(sinA * cfg.bonusFront * R, yTop + cfg.bonusY * H, cosA * cfg.bonusFront * R)
          pos.set(0, yTop, 0).lerp(capPt, easeOut(h.k))
          pos.y += Math.sin(h.k * Math.PI) * 0.12 * H + wob * 0.6 * u
          scale = backOut(h.k) * cfg.bonusScale
        }
      } else {
        // Its socket, in the viewer's frame (x right, z toward the viewer), turned by camAz.
        const sx = h.col * colX
        const sy = rows > 1 ? lerp(yHi, yLo, h.row / (rows - 1)) : (yHi + yLo) / 2
        seat.set(sx * cosA + fwd * sinA, sy, -sx * sinA + fwd * cosA)
        h.p = clamp01((te - i * cfg.entryStaggerMs) / cfg.entryFlyMs)
        h.holder.visible = h.p > 0
        if (h.state !== FLY && h.p > 0) {
          if (h.p < 1) {
            // Print -> socket, round the bottle on the badge's own side.
            const az = h.az + azOff
            const sAz = Math.atan2(seat.x, seat.z)
            const a = az + wrapPi(sAz - az) * easeInOut(h.p)
            const r = lerp(R * 1.004, Math.hypot(seat.x, seat.z), easeOut(h.p))
            pos.set(r * Math.sin(a), lerp(h.y0, seat.y, easeInOut(h.p)), r * Math.cos(a))
          } else {
            pos.copy(seat)
            pos.x += sinA * cfg.popMm * u * out
            pos.z += cosA * cfg.popMm * u * out
            pos.y += wob * 0.6 * u
          }
          scale = lerp(1, cfg.seatScale, easeInOut(h.p)) * lerp(1, cfg.popScale / cfg.seatScale, out) * backOut(h.re)
          // Waiting badges are dimmer, so a popped one reads at a glance.
          dim = phase === PLAY || phase === COUNT ? lerp(1, lerp(cfg.seatDim, 1, h.k), h.p) : 1
        }
        const ringK = h.p >= 1 ? fade * (h.state === UP ? lerp(0.35, 0.9, h.k) : 0.35) : 0
        h.ring.visible = ringK > 0.01
        if (h.ring.visible) {
          h.ring.position.copy(seat)
          h.ring.rotation.y = camAz
          h.ring.scale.setScalar(cfg.seatScale)
          h.ring.material.opacity = ringK
          liveColor(h.ring.material.color, cfg.color)
        }
      }

      if (h.state === FLY) {
        // To the board, in an arc, shrinking and spinning.
        const f = easeInOut(h.f)
        pos.lerpVectors(h.from, board.position, f)
        pos.y += Math.sin(h.f * Math.PI) * 0.25 * H
        h.holder.scale.setScalar(Math.max(lerp(h.flyScale, h.flyScale * 0.35, f), 1e-4))
        h.holder.rotation.y += dt * 0.025
        h.holder.rotation.z = 0
      } else if (h.holder.visible) {
        // Facing: outward while on the print, then the viewer.
        const toCam = Math.atan2(cam.x - pos.x, cam.z - pos.z)
        const az = h.az + azOff
        h.holder.rotation.y = h.bonus ? toCam : az + wrapPi(toCam - az) * easeInOut(h.p)
        h.holder.rotation.z = wob * 0.18
        h.holder.scale.setScalar(Math.max(scale, 1e-4))
        const depth = lerp(0.02, cfg.depthMm, h.bonus ? 1 : h.p) * u
        h.rim.scale.set(1, 1, Math.max(depth / h.holder.scale.x, 1e-4))
        h.front.position.z = depth / 2 / h.holder.scale.x
        h.back.position.z = -h.front.position.z
      }
      h.hit.scale.setScalar(cfg.hitScale)
      h.faceMat.color.copy(faceColor).multiplyScalar(dim)

      // Glow behind a coin that is up; a burst where it was hit.
      const glowK = Math.max((h.state === UP ? h.k : h.state === SINK ? h.k * 0.5 : 0) * 0.55, h.burst)
      h.glow.visible = glowK > 0.01
      if (h.glow.visible) {
        h.glow.position.copy(h.burst > 0 ? h.from : pos)
        h.glow.material.opacity = glowK
        h.glow.scale.setScalar(built.radius * cfg.seatScale * (h.burst > 0 ? lerp(8, 3, h.burst) : 3.5))
        liveColor(h.glow.material.color, h.bonus ? cfg.goldColor : cfg.color)
      }
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
  }

  return {
    root, build, update,
    // A first start, or back after an exit: a new game. A tracking replay mid-round keeps it.
    restartEntrance: () => {
      lastMs = null
      if (leaving || phase === OFF) { leaving = false; start() }
    },
    exit: () => { leaving = true; phase = OFF },
    isExited: () => !built || (leaving && te <= 0 && fade <= 0 && built.all.every(h => h.state === IDLE)),
    getPickables: () => {
      if (!built) return []
      const out = []
      for (const h of built.all) if (h.state === UP && h.k > 0.3) out.push(h.hit)
      if (phase === END) out.push(built.boardMesh)
      return out
    },
    setUserSpeed: v => { speed = v },
    getDebugInfo: () => ({arcade: `${['off', 'count', 'play', 'end'][phase]} · ${score} pts · x${combo} · best ${best}`}),
  }
}
