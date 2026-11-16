import {test} from 'node:test'
import assert from 'node:assert/strict'

import {IDLE, UP, layoutSockets, nextCombo, pickHole} from './arcadeRules.js'

test('combo climbs on quick hits, caps, resets after a pause', () => {
  assert.equal(nextCombo(0, 1e9, 1200, 5), 1)
  assert.equal(nextCombo(1, 500, 1200, 5), 2)
  assert.equal(nextCombo(5, 500, 1200, 5), 5)
  assert.equal(nextCombo(4, 1500, 1200, 5), 1)
})

test('pops pick only free holes', () => {
  const holes = [{state: UP}, {state: IDLE}, {state: UP}, {state: IDLE}]
  assert.equal(pickHole(holes, 0), 1)
  assert.equal(pickHole(holes, 0.99), 3)
  holes[1].state = holes[3].state = UP
  assert.equal(pickHole(holes, 0.5), -1)
})

test('sockets: screen-left half to the left column, top print row first', () => {
  // 4 badges: two on the left (one high, one low), two on the right.
  const s = layoutSockets([-0.9, -0.5, 0.5, 0.9], [0.3, -0.2, 0.3, -0.2])
  assert.deepEqual(s, [{col: -1, row: 0}, {col: -1, row: 1}, {col: 1, row: 0}, {col: 1, row: 1}])
  // Uneven (all on one side of the camera): still split in half.
  const t = layoutSockets([0.1, 0.2, 0.3, 0.4], [0, 0, 0, 0])
  assert.deepEqual(t.map(x => x.col), [-1, -1, 1, 1])
})
