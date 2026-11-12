import assert from 'node:assert/strict'
import {test} from 'node:test'

import {cameraLight, sampleCamera} from './cameraLight.js'

const frame = (rgb, rows = 3, cols = 4) => {
  const pixels = new Uint8Array(rows * cols * 4)
  for (let i = 0; i < rows * cols; i++) pixels.set([...rgb, 255], i * 4)
  return {rows, cols, rowBytes: cols * 4, pixels}
}

test('mean camera colour -> linear light, eased and rate-limited', () => {
  sampleCamera(frame([255, 255, 255]), 0)
  assert.ok(cameraLight.ready)
  assert.ok(Math.abs(cameraLight.luma - 1) < 1e-6, 'white frame = full luminance')

  sampleCamera(frame([0, 0, 0]), 100) // too soon: ignored
  assert.ok(Math.abs(cameraLight.luma - 1) < 1e-6)

  sampleCamera(frame([0, 0, 0]), 400) // eases toward black, does not jump
  assert.ok(cameraLight.luma > 0.5 && cameraLight.luma < 0.8)

  sampleCamera(null, 1000) // no pixel array (module missing): no-op
  assert.ok(cameraLight.luma > 0.5)
})

test('paperAt: the paper colour under a screen box, ignoring the ink', async () => {
  const {paperAt} = await import('./cameraLight.js')
  const THREE = await import('three')
  // 8 x 8 frame: dark table, a label patch top-right (rows 0-3, cols 4-7) that is paper
  // (200,210,190) with one ink pixel (20,60,30).
  const rows = 8, cols = 8
  const pixels = new Uint8Array(rows * cols * 4)
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const label = y < 4 && x >= 4
    const ink = y === 1 && x === 5
    pixels.set(label ? (ink ? [20, 60, 30, 255] : [200, 210, 190, 255]) : [90, 60, 40, 255], (y * cols + x) * 4)
  }
  sampleCamera({rows, cols, rowBytes: cols * 4, pixels}, 10000)
  const out = new THREE.Color()
  // Square canvas (no crop): the top-right quarter is NDC x 0..1, y 0..1.
  assert.ok(paperAt(0.5, 0.5, 0.45, 0.45, 1, out))
  const srgb = out.clone().convertLinearToSRGB()
  assert.deepEqual([srgb.r, srgb.g, srgb.b].map(v => Math.round(v * 255)), [200, 210, 190])
  // Off the image: nothing.
  assert.equal(paperAt(3, 3, 0.1, 0.1, 1, out), 0)
})

test('paperAt: typical paper, not its brightest noise/highlights', async () => {
  const {paperAt} = await import('./cameraLight.js')
  const THREE = await import('three')
  // 10 x 10, all label: 30 ink px (dark), 60 paper px at 200, 10 highlight px at 250.
  const rows = 10, cols = 10
  const pixels = new Uint8Array(rows * cols * 4)
  for (let i = 0; i < rows * cols; i++) {
    const v = i < 30 ? 40 : i < 90 ? 200 : 250
    pixels.set([v, v, v, 255], i * 4)
  }
  sampleCamera({rows, cols, rowBytes: cols * 4, pixels}, 20000)
  const out = new THREE.Color()
  assert.ok(paperAt(0, 0, 1, 1, 1, out))
  const v = Math.round(out.clone().convertLinearToSRGB().r * 255)
  assert.ok(v >= 195 && v <= 215, `typical paper ~200, got ${v}`)
})
