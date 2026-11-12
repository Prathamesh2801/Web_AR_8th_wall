/**
 * Generates the Zeal sticker artwork: `node brand-assets/zeal/sticker/make-sticker.mjs`
 *
 *   body-wrap.svg         editable vector, 178 x 58 mm incl. 3 mm bleed
 *   body-wrap-print.png   that at 600 dpi — send to the printer (cut to 172 x 52 mm)
 *   body-wrap.png         trim only (172 x 52 mm, 600 dpi) — input to generate-targets
 *   cap-top.svg / cap-top-print.png   Ø 36 mm cut + 2 mm bleed
 *   bottle-mock.png       quick look at the sticker between the bottle's teal plastic
 * plus public/brands/zeal/logo.png (white logo for the app), and prints the
 * `label.px` + Typography `print` box to paste into src/brands/zeal/brand.js.
 *
 * Look: light label, deep-green ink, green bands top and bottom. The logo is green on
 * white by nature; dark-on-light reads best (and gives image tracking strong corners);
 * a light band framed by the bottle's deep-teal plastic is the classic premium-pack look.
 *
 * Why generated, not drawn: every letter is the SAME Montserrat 800 outline the 3D
 * Typography effect extrudes (public/fonts), so "ZEAL" lifts off exactly its own print,
 * and its box is computed, not measured. Icons: Tabler Icons (MIT, icons/).
 */
import {readFileSync, writeFileSync} from 'node:fs'
import sharp from 'sharp'

const DIR = 'brand-assets/zeal/sticker'
const DPI = 600
const PX_PER_MM = DPI / 25.4
const font = JSON.parse(readFileSync('public/fonts/montserrat-800.typeface.json', 'utf8'))
const CAP = 700 // Montserrat cap height, font units

// Logo green leads; teal links it to the bottle plastic (#05575F); lime is the one
// bright accent, used thinly (lines, dots), never for text.
const C = {
  paper: '#F6F8F3', ink: '#123D1F', green: '#1C552A', teal: '#0B6E63', bottle: '#05575F',
  lime: '#8CCB3A', mint: '#CFE6D6', soft: '#E3EEE4', grey: '#4E6B57', white: '#FFFFFF',
}

// ---------- text as Montserrat outlines ----------
const glyphPath = (o, s, ox, oy) => {
  const t = o.trim().split(/\s+/)
  const X = v => (ox + +v * s).toFixed(3)
  const Y = v => (oy - +v * s).toFixed(3)
  let d = ''
  for (let i = 0; i < t.length;) {
    const c = t[i++]
    if (c === 'm') d += `M${X(t[i++])} ${Y(t[i++])}`
    else if (c === 'l') d += `L${X(t[i++])} ${Y(t[i++])}`
    else if (c === 'q') { const x = t[i++], y = t[i++], cx = t[i++], cy = t[i++]; d += `Q${X(cx)} ${Y(cy)} ${X(x)} ${Y(y)}` }
    else if (c === 'b') { const x = t[i++], y = t[i++], ax = t[i++], ay = t[i++], bx = t[i++], by = t[i++]; d += `C${X(ax)} ${Y(ay)} ${X(bx)} ${Y(by)} ${X(x)} ${Y(y)}` }
  }
  return d
}

const advance = (ch, s, cap, track) => (ch === '.' ? 260 : ch === '•' ? 520 : font.glyphs[ch].ha) * s + track * cap

/** Text at baseline y, cap height `cap` mm. '.' and '•' are drawn (the font has letters only). */
const text = (str, x, y, cap, {fill = C.ink, anchor = 'start', track = 0} = {}) => {
  const s = cap / CAP
  const width = [...str].reduce((w, ch) => w + advance(ch, s, cap, track), 0) - track * cap
  let pen = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x
  let d = '', dots = ''
  let inkL = Infinity, inkR = -Infinity
  for (const ch of str) {
    if (ch === '.') dots += `<rect x="${(pen + 60 * s).toFixed(3)}" y="${(y - 150 * s).toFixed(3)}" width="${(150 * s).toFixed(3)}" height="${(150 * s).toFixed(3)}"/>`
    else if (ch === '•') dots += `<circle cx="${(pen + 260 * s).toFixed(3)}" cy="${(y - cap / 2).toFixed(3)}" r="${(110 * s).toFixed(3)}"/>`
    else if (ch !== ' ') {
      const g = font.glyphs[ch]
      d += glyphPath(g.o, s, pen, y)
      inkL = Math.min(inkL, pen + g.x_min * s)
      inkR = Math.max(inkR, pen + g.x_max * s)
    }
    pen += advance(ch, s, cap, track)
  }
  return {svg: `<g fill="${fill}"><path d="${d}"/>${dots}</g>`, inkL, inkR, width}
}

/** Largest cap height (<= max) at which `str` fits in `w` mm. */
const fitCap = (str, w, max, track) => Math.min(max, (max * w) / text(str, 0, 0, max, {track}).width)

// ---------- icons (Tabler, 24-unit outline) ----------
const icon = (name, cx, cy, size, color) => {
  const inner = readFileSync(`${DIR}/icons/${name}.svg`, 'utf8')
    .replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
    .replace(/<path stroke="none" d="M0 0h24v24H0z" fill="none"\/>/, '')
  const k = size / 24
  return `<g transform="translate(${cx - size / 2} ${cy - size / 2}) scale(${k})" fill="none" stroke="${color}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`
}

// ---------- logo: green (as supplied) and white, background removed ----------
const logo = async (rgb) => {
  const {data, info} = await sharp('brand-assets/zeal/Zeal_logo.png').ensureAlpha().raw().toBuffer({resolveWithObject: true})
  for (let i = 0; i < data.length; i += 4) {
    // Green ink on white: how far G is below white = coverage (keeps anti-aliased edges).
    const a = Math.min(Math.max((255 - data[i + 1]) / (255 - 85), 0), 1) * (data[i + 3] / 255)
    ;[data[i], data[i + 1], data[i + 2]] = rgb
    data[i + 3] = Math.round(a * 255)
  }
  return sharp(data, {raw: info}).png().toBuffer()
}
const uri = png => `data:image/png;base64,${png.toString('base64')}`
const logoGreen = uri(await logo([0x1C, 0x55, 0x2A]))
const logoWhitePng = await logo([255, 255, 255])
await sharp(logoWhitePng).resize(512).toFile('public/brands/zeal/logo.png') // app start screen

// ---------- body wrap: trim 172 x 52 mm, drawn in trim coordinates ----------
const W = 172, H = 52, B = 3
const TOP = 3.2, BOT = 4.2 // green bands; bleed carries them past the cut, so a slightly
// off cut never shows white against the bottle

// Seeded randomness: the background motif is the same on every run.
let seed = 20261112
const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }

let body = `<rect x="${-B}" y="${-B}" width="${W + 2 * B}" height="${H + 2 * B}" fill="${C.paper}"/>`
// Motif: the logo's tilted frame, scattered in pale green. Gives every stretch of the
// label shapes to track without fighting the text.
for (let i = 0; i < 70; i++) {
  const x = rnd() * (W + 2 * B) - B, y = TOP + rnd() * (H - TOP - BOT), s = 2 + rnd() * 6
  const filled = rnd() < 0.25
  body += `<rect x="${(x - s / 2).toFixed(2)}" y="${(y - s / 2).toFixed(2)}" width="${s.toFixed(2)}" height="${s.toFixed(2)}" transform="rotate(30 ${x.toFixed(2)} ${y.toFixed(2)})" ${filled ? `fill="${C.soft}"` : `fill="none" stroke="${C.mint}" stroke-width="0.45"`}/>`
}
// Bands: bottle-teal into logo-green, a thin lime rule on the inner edge.
body += `<defs><linearGradient id="band" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.bottle}"/><stop offset="0.5" stop-color="${C.green}"/><stop offset="1" stop-color="${C.bottle}"/></linearGradient></defs>`
body += `<rect x="${-B}" y="${-B}" width="${W + 2 * B}" height="${TOP + B}" fill="url(#band)"/>`
body += `<rect x="${-B}" y="${H - BOT}" width="${W + 2 * B}" height="${BOT + B}" fill="url(#band)"/>`
body += `<rect x="${-B}" y="${TOP}" width="${W + 2 * B}" height="0.4" fill="${C.lime}"/>`
body += `<rect x="${-B}" y="${H - BOT - 0.4}" width="${W + 2 * B}" height="0.4" fill="${C.lime}"/>`
body += text('ZEALINTERACTIVE.IN', 86, H - 1.25, 1.5, {fill: C.white, anchor: 'middle', track: 0.35}).svg

// Front: logo, wordmark with the logo's speed lines, two lines of copy.
const ZEAL_BASE = 33.2, ZEAL_CAP = 10.5
const zeal = text('ZEAL', 86, ZEAL_BASE, ZEAL_CAP, {fill: C.ink, anchor: 'middle', track: 0.03})
body += `<image href="${logoGreen}" x="77.5" y="${TOP + 1.2}" width="17" height="17"/>`
for (const [i, len, col] of [[0, 8, C.green], [1, 5.5, C.teal], [2, 3.5, C.lime]]) {
  const yy = ZEAL_BASE - ZEAL_CAP + 1.2 + i * 3.2, xe = zeal.inkL - 1.5
  body += `<path d="M${xe - len} ${yy} h${len} l-1 1.9 h-${len - 2}z" fill="${col}"/>`
}
for (const [i, len, col] of [[0, 3.5, C.lime], [1, 5.5, C.teal], [2, 8, C.green]]) {
  const yy = ZEAL_BASE - ZEAL_CAP + 1.2 + i * 3.2, xs = zeal.inkR + 1.5
  body += `<path d="M${xs + 1} ${yy} h${len} l-1 1.9 h-${len}z" fill="${col}"/>`
}
body += zeal.svg
body += text('INTERACTIVE SERVICES', 86, 39.3, 2.75, {fill: C.teal, anchor: 'middle', track: 0.24}).svg
body += `<rect x="70" y="41.1" width="32" height="0.3" fill="${C.lime}"/>`
body += text('EVENT TECHNOLOGY • GAMING • AR • VR', 86, 44.9, 1.55, {fill: C.grey, anchor: 'middle', track: 0.2}).svg

// Sides: what we do. Solid green badge + white icon + dark label: readable at a glance.
const service = (cx, cy, name, l1, l2) => {
  let s = `<circle cx="${cx}" cy="${cy}" r="5.6" fill="${C.paper}" stroke="${C.lime}" stroke-width="0.35"/>`
  s += `<circle cx="${cx}" cy="${cy}" r="4.9" fill="${C.green}"/>`
  s += icon(name, cx, cy, 6.1, C.white)
  const cap = Math.min(fitCap(l1, 21, 1.75, 0.1), l2 ? fitCap(l2, 21, 1.75, 0.1) : 1.75)
  s += text(l1, cx, cy + 8.7, cap, {fill: C.ink, anchor: 'middle', track: 0.1}).svg
  if (l2) s += text(l2, cx, cy + 8.7 + cap + 0.9, cap, {fill: C.teal, anchor: 'middle', track: 0.1}).svg
  return s
}
const ROW1 = 10.4, ROW2 = 32.2 // badge tops clear the band; row-1 labels clear row-2 badges
body += service(14.5, ROW1, 'cardboards', 'VIRTUAL', 'REALITY')
body += service(38, ROW1, 'device-gamepad-2', 'VR', 'GAMES')
body += service(14.5, ROW2, 'augmented-reality', 'AR', 'EXPERIENCES')
body += service(38, ROW2, 'hand-click', 'INTERACTIVE', 'WALLS')
body += service(134, ROW1, 'camera-ai', 'AI', 'PHOTOBOOTH')
body += service(157.5, ROW1, 'hand-move', 'GESTURE', 'TECH')
body += service(134, ROW2, 'radar-2', 'SENSOR', 'GAMES')
body += service(157.5, ROW2, 'robot', 'ROBOTICS', 'HARDWARE')
// Panel dividers.
for (const x of [52, 120]) body += `<line x1="${x}" y1="${TOP + 4}" x2="${x}" y2="${H - BOT - 4}" stroke="${C.mint}" stroke-width="0.4" stroke-dasharray="0.6 1"/>`

const svgDoc = (w, h, vb, inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="${vb}">${inner}</svg>`
/** Rasterise at DPI. Size given in px: librsvg's mm handling + `density` overshoots. */
const render = (svg, file) => sharp(Buffer.from(svg.replace(/width="([\d.]+)mm" height="([\d.]+)mm"/,
  (_, w, h) => `width="${Math.round(w * PX_PER_MM)}" height="${Math.round(h * PX_PER_MM)}"`))).png().toFile(file)
const printSvg = svgDoc(W + 2 * B, H + 2 * B, `${-B} ${-B} ${W + 2 * B} ${H + 2 * B}`, body)
const trimSvg = svgDoc(W, H, `0 0 ${W} ${H}`, body)
writeFileSync(`${DIR}/body-wrap.svg`, printSvg)
await render(printSvg, `${DIR}/body-wrap-print.png`)
const trimMeta = await render(trimSvg, `${DIR}/body-wrap.png`)

// ---------- cap top: Ø 36 mm cut, 2 mm bleed. White seal, green ring, green logo ----------
const R = 20, CUT = 18
let cap = `<circle cx="0" cy="0" r="${R}" fill="${C.green}"/>`
cap += `<circle cx="0" cy="0" r="11.6" fill="${C.paper}"/>`
cap += `<circle cx="0" cy="0" r="11.6" fill="none" stroke="${C.lime}" stroke-width="0.45"/>`
cap += `<circle cx="0" cy="0" r="${CUT - 1.1}" fill="none" stroke="${C.lime}" stroke-width="0.3"/>`
cap += `<image href="${logoGreen}" x="-8.6" y="-9" width="17.2" height="17.2"/>`
// Ring text: letter size solved so the text closes the circle exactly (no overlap).
const ring = (str, r, startDeg, fill) => {
  const units = [...str].reduce((u, ch) => u + (ch === '•' ? 520 : ch === '.' ? 260 : font.glyphs[ch]?.ha ?? 291) / CAP + 0.18, 0)
  const cap0 = (2 * Math.PI * r) / units
  const s = cap0 / CAP
  let out = '', a = (startDeg * Math.PI) / 180
  for (const ch of str) {
    const w = (ch === '•' ? 520 : ch === '.' ? 260 : font.glyphs[ch]?.ha ?? 291) * s + 0.18 * cap0
    const deg = ((a + w / 2 / r) * 180) / Math.PI
    out += `<g transform="rotate(${deg.toFixed(2)}) translate(0 ${-r})">${text(ch, 0, 0, cap0, {anchor: 'middle', fill}).svg}</g>`
    a += w / r
  }
  return out
}
cap += ring('ZEAL INTERACTIVE SERVICES • ZEALINTERACTIVE.IN • ', 13.4, -150, C.white)
const capSvg = svgDoc(2 * R, 2 * R, `${-R} ${-R} ${2 * R} ${2 * R}`, cap)
writeFileSync(`${DIR}/cap-top.svg`, capSvg)
await render(capSvg, `${DIR}/cap-top-print.png`)

// ---------- mock: the wrap on the real bottle shape (src/brands/supradyn bottle), front
// view, each column taken from the arc a camera sees (x = R sin θ). Not for print. ----------
const {bottle} = await import('../../../src/brands/supradyn/brand.js')
const K = 12 // px per mm
const Rmm = bottle.circumference / (2 * Math.PI)
const top = bottle.profile.at(-1)[0]
const mw = Math.round(2 * 30 * K), mh = Math.round((top + 8) * K)
const Y = h => Math.round((top + 4 - h) * K)
const half = bottle.profile.map(([h, r]) => [mw / 2 + r * K, Y(h)])
const outline = [...half, ...half.slice().reverse().map(([x, y]) => [mw - x, y])]
const plastic = `<svg xmlns="http://www.w3.org/2000/svg" width="${mw}" height="${mh}"><rect width="100%" height="100%" fill="#ECE9E2"/>
<defs><linearGradient id="p"><stop offset="0.05" stop-color="#012A2E"/><stop offset="0.4" stop-color="#0E7A84"/><stop offset="0.55" stop-color="#0A6670"/><stop offset="0.95" stop-color="#012A2E"/></linearGradient></defs>
<polygon points="${outline.map(p => p.join(',')).join(' ')}" fill="url(#p)"/></svg>`
const lw = Math.round(2 * Rmm * K), lh = Math.round(bottle.labelHeight * K)
const src = await sharp(`${DIR}/body-wrap.png`).resize({height: lh}).raw().toBuffer({resolveWithObject: true})
const out = Buffer.alloc(lw * lh * 4)
for (let i = 0; i < lw; i++) {
  const x = ((i + 0.5) / lw) * 2 - 1
  const th = Math.asin(x)
  const sx = Math.round((((bottle.labelWidth / 2 + th * Rmm) / bottle.labelWidth) * src.info.width + src.info.width) % src.info.width)
  // Cylinder light: soft key a little left of centre, dark at the turning edges.
  const light = 0.35 + 0.75 * Math.max(Math.cos(th + 0.35), 0) ** 0.8
  for (let j = 0; j < lh; j++) {
    const si = (j * src.info.width + sx) * src.info.channels, oi = (j * lw + i) * 4
    for (let c = 0; c < 3; c++) out[oi + c] = Math.min(255, src.data[si + c] * light)
    out[oi + 3] = 255
  }
}
const labelImg = await sharp(out, {raw: {width: lw, height: lh, channels: 4}}).png().toBuffer()
await sharp(Buffer.from(plastic)).composite([{input: labelImg, left: Math.round((mw - lw) / 2), top: Y(bottle.labelBottom + bottle.labelHeight)}])
  .png().toFile(`${DIR}/bottle-mock.png`)

// ---------- numbers for src/brands/zeal/brand.js ----------
const px = v => Math.round(v * PX_PER_MM)
console.log('label.px =', JSON.stringify({w: trimMeta.width, h: trimMeta.height}))
console.log('typography print (ZEAL) =', JSON.stringify({text: 'ZEAL', x0: px(zeal.inkL), x1: px(zeal.inkR), top: px(ZEAL_BASE - ZEAL_CAP), base: px(ZEAL_BASE)}))
