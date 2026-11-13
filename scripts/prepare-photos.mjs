/**
 * Event photos -> Photo Burst prints: the WHOLE photo (never cropped), longest side
 * 2048 px, WebP q92 (1000 px / q80 read blurry on a phone; they're preloaded + cached, so
 * size costs only start-screen time).
 *
 *   node scripts/prepare-photos.mjs <out-dir> <photo> [photo ...]
 *
 * Writes <out-dir>/event-01.webp, event-02.webp, ... in the order given (= the fan order).
 * Landscape, portrait and square all welcome: each polaroid takes its photo's own shape
 * (photoBurst.js cardLayout). Very wide/tall shots (beyond 2.4:1) get paper bars.
 */
import {mkdirSync, statSync} from 'node:fs'
import {join} from 'node:path'

import sharp from 'sharp'

const [out, ...photos] = process.argv.slice(2)
if (!out || !photos.length) {
  console.error('usage: node scripts/prepare-photos.mjs <out-dir> <photo> [photo ...]')
  process.exit(1)
}
mkdirSync(out, {recursive: true})
for (const [i, src] of photos.entries()) {
  const file = join(out, `event-${String(i + 1).padStart(2, '0')}.webp`)
  const info = await sharp(src).rotate() // EXIF orientation (phone photos)
    .resize(2048, 2048, {fit: 'inside', withoutEnlargement: true})
    .webp({quality: 92})
    .toFile(file)
  console.log(`${src} -> ${file} ${info.width}x${info.height} (${(statSync(file).size / 1024).toFixed(0)} KB)`)
}
