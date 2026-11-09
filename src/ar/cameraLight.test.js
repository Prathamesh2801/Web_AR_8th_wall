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
