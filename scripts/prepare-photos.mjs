/**
 * Event photos -> Photo Burst prints: square (the polaroid's picture), 900 px, WebP.
 *
 *   node scripts/prepare-photos.mjs <out-dir> <photo> [photo ...]
 *
 * Writes <out-dir>/event-01.webp, event-02.webp, ... in the order given (= the fan order).
 * Square, not 4:5: nearly every event shot is landscape (16:9 or wider), and a tall crop
 * kept only a third of it. The crop is sharp's "attention" strategy (people, faces,
 * saturated detail), not the centre, so the subject survives a wide frame.
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
  await sharp(src).rotate() // EXIF orientation (phone photos)
    .resize(900, 900, {fit: 'cover', position: sharp.strategy.attention})
    .webp({quality: 80})
    .toFile(file)
  console.log(`${src} -> ${file} (${(statSync(file).size / 1024).toFixed(0)} KB)`)
}
