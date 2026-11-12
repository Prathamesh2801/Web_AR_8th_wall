/**
 * Regenerates a brand's image targets from its flat label artwork. Non-interactive and
 * reproducible: `npm run generate-targets -- <brand>` (default: supradyn). The brand
 * file (src/brands/<brand>/brand.js) gives the artwork, bottle size and target names;
 * output goes to public/brands/<brand>/targets/.
 *
 * WHY SEVERAL TARGETS FROM ONE LABEL
 * The engine needs a 3:4 crop. Our label is 172 x 52 mm, so one crop covers only
 * ~40% of it (~142 deg of the bottle): turn the bottle and detection stops. Three
 * overlapping crops (left / centre / right of the flat label) cover the full wrap.
 *
 * The engine tracks the cropped region but reports pose and geometry for the FULL
 * label cylinder (reality/engine/imagedetection/detection-image.cc,
 * `toCurvyGeometry` -> `activationRegion`), so all three share one coordinate frame
 * and the content does not jump when tracking hands over between them.
 *
 * Uses the CLI's own `applyCrop`, so the output is byte-for-byte what the
 * interactive `npx @8thwall/image-target-cli` would write.
 */
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises'
import sharp from 'sharp'
import {applyCrop} from '@8thwall/image-target-cli/src/apply.js'
import {BRANDS} from '../src/brands/index.js'

const id = process.argv[2] ?? 'supradyn'
const brand = BRANDS[id]
if (!brand) throw new Error(`Unknown brand "${id}". Known: ${Object.keys(BRANDS).join(', ')}`)
const SOURCE = brand.label.source
const OUT = `public/brands/${id}/targets`
await mkdir(OUT, {recursive: true})

// Physical measurements live in the brand file — one source for the tracker and the
// animations.
const {labelWidth: LABEL_WIDTH_MM, circumference: CYLINDER_CIRCUMFERENCE_MM} = brand.bottle

const image = sharp(SOURCE)
const {width, height} = await image.metadata() // 4064 x 1229, landscape

// Landscape label -> the CLI stores it rotated 90 deg; crop coords are in the rotated
// image, where the label's length runs along `top`. Crop is the full label height.
const cropW = height
const cropH = Math.round((cropW * 4) / 3)
const span = width - cropH

// brand.targets = [left, front, right] names.
const [left, front, right] = brand.targets
const CROPS = [
  {name: left, top: 0},
  {name: front, top: Math.round(span / 2)},
  {name: right, top: span},
]

for (const {name, top} of CROPS) {
  const {dataPath} = await applyCrop(sharp(SOURCE), {
    type: 'CYLINDER',
    geometry: {
      left: 0,
      top,
      width: cropW,
      height: cropH,
      isRotated: true,
      originalWidth: height,
      originalHeight: width,
      targetCircumferenceTop: LABEL_WIDTH_MM,
      cylinderCircumferenceTop: CYLINDER_CIRCUMFERENCE_MM,
      cylinderCircumferenceBottom: CYLINDER_CIRCUMFERENCE_MM,
      cylinderSideLength: (height / width) * LABEL_WIDTH_MM,
      arcAngle: (LABEL_WIDTH_MM / CYLINDER_CIRCUMFERENCE_MM) * 360,
      coniness: 0,
      inputMode: 'ADVANCED',
      unit: 'mm',
    },
  }, OUT, name, true)
  // The engine fetches only `imagePath` (the luminance image); the CLI's other outputs
  // would just ship ~2MB per target to every visitor.
  for (const extra of ['original', 'cropped', 'thumbnail']) {
    await rm(`${OUT}/${name}_${extra}.png`)
  }
  // The CLI hard-codes imagePath as "image-targets/<file>"; the engine fetches it as a
  // site-root URL, so point it at where this brand's targets are served.
  const meta = JSON.parse(await readFile(dataPath, 'utf8'))
  meta.imagePath = meta.imagePath.replace(/^image-targets\//, `brands/${id}/targets/`)
  await writeFile(dataPath, JSON.stringify(meta, null, 2))
  console.log('wrote', dataPath, `(crop top ${top}..${top + cropH} of ${width})`)
}
