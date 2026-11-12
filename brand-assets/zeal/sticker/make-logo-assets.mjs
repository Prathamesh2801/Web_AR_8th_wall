// Zeal logo -> public/brands/zeal/logo-mark.svg (vector mark for the 3D "Logo" style) and
// logo-patch.png (the label under the printed logo, without it, feathered edges).
// Run from the repo root after make-sticker.mjs:
//   npm i --no-save potrace@2.1.8 && node brand-assets/zeal/sticker/make-logo-assets.mjs
import {createRequire} from 'node:module'
import {readFileSync, writeFileSync} from 'node:fs'
const require = createRequire(import.meta.url)
const potrace = require('potrace')
const repo = process.cwd()
const sharp = require(repo + '/node_modules/sharp')

// 1. Trace: ink = green well below white. Polygon corners (alphaMax 0): the mark is all straight cuts.
const {data, info} = await sharp(repo + '/brand-assets/zeal/Zeal_logo.png').flatten({background: '#fff'}).raw().toBuffer({resolveWithObject: true})
const bw = Buffer.alloc(info.width * info.height)
for (let i = 0; i < bw.length; i++) bw[i] = data[i * 3 + 1] < 170 ? 0 : 255
const png = await sharp(bw, {raw: {width: info.width, height: info.height, channels: 1}}).png().toBuffer()
const svg = await new Promise((ok, no) => potrace.trace(png, {turdSize: 20, alphaMax: 0, optCurve: false, threshold: 128}, (e, s) => e ? no(e) : ok(s)))
const d = svg.match(/ d="([^"]+)"/)[1]
writeFileSync(repo + '/public/brands/zeal/logo-mark.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${info.width} ${info.height}"><path d="${d}" fill="#1C552A" fill-rule="evenodd"/></svg>\n`)
console.log('mark: path', d.length, 'chars;', (d.match(/M/g) || []).length, 'subpaths')

// 2. Patches: the label art under a printed element, WITHOUT it, feathered edges, so a
// 3D copy can leave the label and the print reads as gone. Box in mm (trim coords).
const body = readFileSync(repo + '/brand-assets/zeal/sticker/body-wrap.svg', 'utf8')
const vb = body.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number)
const K = 30 // px per mm
const PX_PER_MM = 4063 / 172 // body-wrap.png (label.px) — the typography print boxes
const patch = async (svg, box, pad, out) => {
  const W = Math.round(vb[2] * K), Hh = Math.round(vb[3] * K)
  const full = await sharp(Buffer.from(svg.replace(/width="[^"]+mm" height="[^"]+mm"/, `width="${W}" height="${Hh}"`))).png().toBuffer()
  const b = {x0: box.x0 - pad, x1: box.x1 + pad, top: box.top - pad, base: box.base + pad}
  const left = Math.round((b.x0 - vb[0]) * K), top = Math.round((b.top - vb[1]) * K)
  const w = Math.round((b.x1 - b.x0) * K), h = Math.round((b.base - b.top) * K)
  const crop = await sharp(full).extract({left, top, width: w, height: h}).removeAlpha().raw().toBuffer()
  const f = pad * K // feather = the pad: the print itself is always fully covered
  const rgba = Buffer.alloc(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x
    rgba.set(crop.subarray(i * 3, i * 3 + 3), i * 4)
    rgba[i * 4 + 3] = Math.round(Math.min(1, Math.min(x, y, w - 1 - x, h - 1 - y) / f) ** 1.5 * 255)
  }
  const scale = Math.min(1, 1024 / Math.max(w, h))
  await sharp(rgba, {raw: {width: w, height: h, channels: 4}}).resize(Math.round(w * scale), Math.round(h * scale))
    .png({compressionLevel: 9}).toFile(repo + '/public/brands/zeal/' + out)
  const px = v => Math.round(v * PX_PER_MM)
  console.log(out, 'box mm', JSON.stringify(b), '-> label px', JSON.stringify({x0: px(b.x0), x1: px(b.x1), top: px(b.top), base: px(b.base)}))
}

// The logo: its <image> (17 mm box at x 77.5, y 4.4).
const noLogo = body.replace(/<image href="data:[^"]+" x="77\.5"[^>]*\/>/, '')
if (noLogo === body) throw new Error('logo <image> not found in body-wrap.svg')
await patch(noLogo, {x0: 77.5, x1: 94.5, top: 4.4, base: 21.4}, 1.2, 'logo-patch.png')

