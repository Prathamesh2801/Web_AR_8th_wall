/**
 * Turns a raw AI-generated GLB (Meshy etc.: ~400k triangles, three 2048 px PBR maps,
 * ~20 MB) into a web one (~2 MB) WITHOUT visible loss, for an AR effect.
 *
 *   node scripts/optimize-model.mjs <in.glb> <out.glb> [triangles=0] [texture=1536] [error=0.0005] [clean=3] [erode=0]
 *
 * triangles 0 (default) = keep the full mesh. Simplifying is opt-in: on the white VR headset
 * EVERY simplification showed (16k: lumpy + torn seams; 116k / 193k: lumps on the smooth
 * shell), while the full 385k mesh compresses to ~2 MB and looks exactly like the source.
 * The app preloads models before the AR starts, so 2 MB costs no lag.
 *
 * 1. Here (glTF-Transform core + the project's sharp): keep only the base-colour texture
 *    (the app shades these models with a matcap, no scene lights, so normal / metallic-
 *    roughness maps are dead weight) and re-encode it as WebP at `texture` px
 *    (three's GLTFLoader reads EXT_texture_webp).
 * 2. The glTF-Transform CLI (npx, its own process): weld, (optionally) simplify with UV
 *    seams locked and a tight error cap, meshopt-compress (the app's loaders set the
 *    meshopt decoder).
 * Two steps on purpose: @gltf-transform/functions brings a second sharp/libvips, and two
 * in one process break each other ("colourspace: parameter space not set").
 */
import {execFileSync} from 'node:child_process'
import {mkdtempSync, rmSync, statSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import sharp from 'sharp'
import {NodeIO} from '@gltf-transform/core'
import {ALL_EXTENSIONS, EXTTextureWebP} from '@gltf-transform/extensions'

const [input, output, tris = '0', tex = '1536', err = '0.0005', clean = '3', erode = '0'] = process.argv.slice(2)
if (!input || !output) {
  console.error('usage: node scripts/optimize-model.mjs <in.glb> <out.glb> [triangles, 0 = keep all] [texture px] [error]')
  process.exit(1)
}

const countTriangles = doc => doc.getRoot().listMeshes().flatMap(m => m.listPrimitives())
  .reduce((n, p) => n + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0)

// 1. Textures.
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const doc = await io.read(input)
const root = doc.getRoot()
const before = countTriangles(doc)
for (const m of root.listMaterials()) m.setNormalTexture(null).setMetallicRoughnessTexture(null).setOcclusionTexture(null)
for (const t of root.listTextures()) if (!t.listParents().some(p => p !== root)) t.dispose() // now unused
doc.createExtension(EXTTextureWebP).setRequired(true)
for (const t of root.listTextures()) {
  // Buffer.from: getImage() is a view into the GLB's buffer.
  let img = sharp(Buffer.from(t.getImage())).resize(+tex, +tex, {fit: 'inside'})
  // clean > 0: median filter of that size (odd px) removes the fine scratches / specks AI
  // textures bake in, which turn into flickering noise when the model is small on screen.
  if (+clean > 0) img = img.median(+clean)
  // erode > 0: spreads dark texels by that many px (sharp names that dilate). Meshy's atlas gaps are light grey, and
  // on a dark face (the interactive wall's black screen) they show as white seam lines.
  if (+erode > 0) img = img.dilate(+erode)
  t.setImage(await img.webp({quality: 82}).toBuffer())
  t.setMimeType('image/webp')
}
const tmp = mkdtempSync(join(tmpdir(), 'model-'))
const a = join(tmp, 'a.glb'), b = join(tmp, 'b.glb'), c = join(tmp, 'c.glb')
await io.write(a, doc)

// 2. Geometry, with the CLI.
const cli = (...args) => execFileSync('npx', ['-y', '@gltf-transform/cli@4', ...args.map(x => `"${x}"`)], {stdio: 'inherit', shell: true})
cli('weld', a, b)
if (+tris > 0) cli('simplify', b, c, '--ratio', String(Math.min(1, +tris / before)), '--error', err, '--lock-border', 'true')
cli('meshopt', +tris > 0 ? c : b, output)
rmSync(tmp, {recursive: true, force: true})
console.log(`${input}: ${Math.round(before)} triangles -> ${+tris > 0 ? '~' + tris : 'all kept'}, ${(statSync(output).size / 1024).toFixed(0)} KB -> ${output}`)
