import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createLeadTarget} from './leadTarget.js'

test('first target leads; others are ignored while it is tracked', () => {
  const t = createLeadTarget()
  assert.equal(t.seen('center'), true)
  assert.equal(t.seen('left'), false)
  assert.equal(t.seen('center'), true)
})

test('losing the lead hands over to a still-tracked target without a loss', () => {
  const t = createLeadTarget()
  t.seen('center')
  t.seen('left')
  assert.equal(t.lost('center'), false)
  assert.equal(t.lead, 'left')
  assert.equal(t.seen('left'), true)
  assert.equal(t.lost('left'), true)
  assert.equal(t.lead, null)
})

test('losing a non-lead target changes nothing', () => {
  const t = createLeadTarget()
  t.seen('center')
  t.seen('right')
  assert.equal(t.lost('right'), false)
  assert.equal(t.lead, 'center')
})

test('a lost event for a never-tracked target is not a loss', () => {
  const t = createLeadTarget()
  assert.equal(t.lost('left'), false)
})
