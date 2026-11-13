import {test} from 'node:test'
import assert from 'node:assert/strict'

// config.js reads ?brand= at import, so each case loads a fresh copy of the module.
const load = async (search) => {
  globalThis.location = {search}
  return import(`./config.js?case=${encodeURIComponent(search)}`)
}

test('supradyn keeps every effect with its content', async () => {
  const c = await load('?brand=supradyn')
  assert.equal(c.BRAND.id, 'supradyn')
  assert.equal(c.EXPERIENCE.heroImage, '/brands/supradyn/hero.jpg')
  for (const id of ['typography', 'callouts', 'tickerRings', 'labelSpin', 'nutrientOrbit', 'planted', 'scan']) {
    assert.ok(c.enabledAnimationIds().includes(id), id)
  }
})

test('effects needing content the brand lacks are switched off', async () => {
  const c = await load('?brand=zeal') // has words, callouts, ticker, scan readouts; no nutrients
  assert.equal(c.BRAND.id, 'zeal')
  assert.deepEqual(c.enabledAnimationIds(),
    ['productOutline', 'typography', 'logoLift', 'labelSpin', 'callouts', 'tickerRings', 'techOrbit', 'settle', 'spotlight', 'energy', 'scan', 'sparkle'])
  assert.equal(c.ANIMATIONS.sparkle.color1, '#9BE23B') // brand override merged
})

test('an unknown brand falls back to the default', async () => {
  assert.equal((await load('?brand=nope')).BRAND.id, (await load('')).BRAND.id)
})
