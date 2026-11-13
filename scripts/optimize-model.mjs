/**
 * Turns a raw AI-generated GLB (Meshy etc.: ~500k triangles, three 2048 px PBR maps,
 * ~20 MB) into a phone-sized one (< ~300 KB) for an AR effect.
 *
 *   node scripts/optimize-model.mjs <in.glb> <out.glb> [triangles=10000] [texture=1024]
 *
 * 1. Here (glTF-Transform core + the project's sharp): keep only the base-colour texture
 *    (the app shades these models with a matcap, no scene lights, so normal / metallic-
 *    roughness maps are dead weight) and re-encode it as WebP at `texture` px
 *    (three's GLTFLoader reads EXT_texture_webp).
 * 2. The glTF-Transform CLI (npx, its own process): weld, simplify to ~`triangles`,
 *    meshopt-compress (the app's loaders set the meshopt decoder).
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

const [input, output, tris = '10000', tex = '1024'] = process.argv.slice(2)
if (!input || !output) {
  console.error('usage: node scripts/optimize-model.mjs <in.glb> <out.glb> [triangles] [texture px]')
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
  t.setImage(await sharp(Buffer.from(t.getImage())).resize(+tex, +tex, {fit: 'inside'}).webp({quality: 82}).toBuffer())
  t.setMimeType('image/webp')
}
const tmp = mkdtempSync(join(tmpdir(), 'model-'))
const a = join(tmp, 'a.glb'), b = join(tmp, 'b.glb'), c = join(tmp, 'c.glb')
await io.write(a, doc)

// 2. Geometry, with the CLI.
const cli = (...args) => execFileSync('npx', ['-y', '@gltf-transform/cli@4', ...args.map(x => `"${x}"`)], {stdio: 'inherit', shell: true})
cli('weld', a, b)
cli('simplify', b, c, '--ratio', String(Math.min(1, +tris / before)), '--error', '0.01')
cli('meshopt', c, output)
rmSync(tmp, {recursive: true, force: true})
console.log(`${input}: ${Math.round(before)} triangles -> ~${tris}, ${(statSync(output).size / 1024).toFixed(0)} KB -> ${output}`)
