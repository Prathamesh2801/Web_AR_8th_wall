/**
 * Regenerates every image target from the flat label artwork. Non-interactive and
 * reproducible: `npm run generate-targets`.
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
import {rm} from 'node:fs/promises'
import sharp from 'sharp'
import {applyCrop} from '@8thwall/image-target-cli/src/apply.js'
import {PRODUCT} from '../src/config.js'

const SOURCE = 'brand-assets/label/supradyn-60-label-source.png'
const OUT = 'public/image-targets'

// Physical measurements live in src/config.js (PRODUCT.mm) — one source for the
// tracker and the animations.
const {labelWidth: LABEL_WIDTH_MM, circumference: CYLINDER_CIRCUMFERENCE_MM} = PRODUCT.mm

const image = sharp(SOURCE)
const {width, height} = await image.metadata() // 4064 x 1229, landscape

// Landscape label -> the CLI stores it rotated 90 deg; crop coords are in the rotated
// image, where the label's length runs along `top`. Crop is the full label height.
const cropW = height
const cropH = Math.round((cropW * 4) / 3)
const span = width - cropH

// Names must match TRACKING.targets in src/config.js. The centre keeps the original
// name so existing links/debug output stay valid.
const CROPS = [
  {name: 'supradyn-bottle-left', top: 0},                  // supplement-facts side
  {name: 'supradyn-bottle', top: Math.round(span / 2)},    // logo / GINSENG front
  {name: 'supradyn-bottle-right', top: span},              // nutrition table + barcode
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
  console.log('wrote', dataPath, `(crop top ${top}..${top + cropH} of ${width})`)
}
