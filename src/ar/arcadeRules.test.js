import {test} from 'node:test'
import assert from 'node:assert/strict'

import {IDLE, nextCombo, pickHole} from './arcadeRules.js'

test('combo climbs on quick hits, caps, resets after a pause', () => {
  assert.equal(nextCombo(0, 1e9, 1200, 5), 1)
  assert.equal(nextCombo(1, 500, 1200, 5), 2)
  assert.equal(nextCombo(5, 500, 1200, 5), 5)
  assert.equal(nextCombo(4, 1500, 1200, 5), 1)
})

test('pops prefer badges facing the camera, side ones by chance, none when all are up', () => {
  const holes = [{az: 0, state: IDLE}, {az: Math.PI, state: IDLE}, {az: 0.3, state: 1}]
  assert.equal(pickHole(holes, 0, 0.9, 0.5, 0.25), 0) // facing (the up one is skipped)
  assert.equal(pickHole(holes, 0, 0.1, 0.5, 0.25), 1) // r1 < side: round the back
  assert.equal(pickHole(holes, Math.PI, 0.9, 0.5, 0.25), 1) // camera moved round
  holes[0].state = 1
  assert.equal(pickHole(holes, 0, 0.9, 0.5, 0.25), 1) // none facing: the side one
  holes[1].state = 1
  assert.equal(pickHole(holes, 0, 0.9, 0.5, 0.25), -1)
})
