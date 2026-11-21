import test from 'node:test'
import assert from 'node:assert'
import { TEMPER, energy, pickIdle } from './idle.mjs'

// Counts what `draws` picks give at one hour.
function tally(hour, draws, extra = {}) {
  const seen = {}
  for (let i = 0; i < draws; i++) {
    const { name } = pickIdle({ hour, ...extra })
    seen[name] = (seen[name] ?? 0) + 1
  }
  return seen
}

test('energy is defined for every hour', () => {
  for (let hour = 0; hour < 24; hour++) {
    const value = energy(hour)
    assert.ok(value > 0 && value <= 1, `hour ${hour}: ${value}`)
  }
  assert.equal(energy(3), 0.2)
  assert.equal(energy(10), 0.9)
  assert.equal(energy(23), 0.3)
})

test('500 picks in a row never repeat the one before', () => {
  for (const hour of [3, 10, 23]) {
    let last
    for (let i = 0; i < 500; i++) {
      const { name } = pickIdle({ hour, last })
      assert.notEqual(name, last)
      last = name
    }
  }
})

test('she only nods off when her energy is low', () => {
  for (let hour = 0; hour < 24; hour++) {
    const naps = tally(hour, 400).sleepy ?? 0
    if (energy(hour) < 0.25) assert.ok(naps > 0, `no nap at ${hour}`)
    else assert.equal(naps, 0, `nap at ${hour}`)
  }
})

test('quiet mode leaves only the phone and looking around, still without repeating', () => {
  assert.deepEqual(Object.keys(tally(3, 500, { quiet: true })).sort(), ['lookAround', 'phone'])
  assert.equal(pickIdle({ hour: 10, quiet: true, last: 'phone' }).name, 'lookAround')
  assert.equal(pickIdle({ hour: 10, quiet: true, last: 'lookAround' }).name, 'phone')
})

test('she yawns more at 23:00 than at 10:00', () => {
  assert.ok(tally(23, 5000).yawn > tally(10, 5000).yawn * 2)
})

test('the first idle moment of a morning is most often a stretch', () => {
  assert.ok(tally(7, 5000, { firstMorning: true }).stretch > tally(7, 5000).stretch * 1.3)
})

test('every pick has its length; a nap lasts 20 to 40 s', () => {
  const lengths = { stretch: 3, phone: 8, lookAround: 4, sway: 5, yawn: 2.8 }
  for (let i = 0; i < 2000; i++) {
    const { name, seconds } = pickIdle({ hour: i % 24 })
    if (name === 'sleepy') assert.ok(seconds >= 20 && seconds <= 40)
    else assert.equal(seconds, lengths[name])
  }
})

test('the edges of the random range still give a valid pick', () => {
  for (const edge of [0, 0.999999]) {
    const { name, seconds } = pickIdle({ hour: 2 }, () => edge)
    assert.ok(name && seconds > 0)
  }
})

test('her personality leans her idle moments without adding any', () => {
  const sways = personalidad => tally(10, 4000, { personalidad }).sway ?? 0
  assert.ok(sways('genki') > sways('yandere') * 1.5, 'the cheerleader moves more')
  assert.ok(sways('dandere') < sways('yandere') * 0.6, 'the shy one less')
  assert.ok(tally(10, 4000, { personalidad: 'gamer' }).phone > tally(10, 4000).phone * 1.5)
  // Quiet mode stays quiet whoever she is, and an unknown personality is the plain picker.
  for (const personalidad of Object.keys(TEMPER)) {
    assert.deepStrictEqual(Object.keys(tally(10, 300, { quiet: true, personalidad })).sort(), ['lookAround', 'phone'])
  }
  assert.equal(pickIdle({ hour: 10, personalidad: 'no-such-one' }, () => 0.5).name, pickIdle({ hour: 10 }, () => 0.5).name)
})
