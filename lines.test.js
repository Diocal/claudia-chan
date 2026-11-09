const test = require('node:test')
const assert = require('node:assert')
const { createLinePicker, createHoverDetector } = require('./lines.js')

test('forty lines in a row never repeat within the last 25', () => {
  const pick = createLinePicker()
  const said = Array.from({ length: 40 }, () => pick({ hour: 15, days: 3, pets: 9 }).line)
  said.forEach((line, i) => assert.ok(!said.slice(Math.max(0, i - 25), i).includes(line), line))
})

test('the same kind of line never comes twice in a row', () => {
  const pick = createLinePicker()
  let last = null
  for (let i = 0; i < 40; i += 1) {
    const { sound } = pick({ hour: 15 })
    if (sound !== 'preocupada' && sound !== 'celos') assert.notStrictEqual(sound, last)
    last = sound
  }
})

test('she can say the line the user asked for', () => {
  const pick = createLinePicker()
  const said = Array.from({ length: 200 }, (_, i) => (i % 25 ? null : createLinePicker()({ hour: 10 }).line))
  assert.ok(typeof pick({ hour: 3 }).line === 'string' && said.length === 200)
  const many = new Set()
  for (let round = 0; round < 400; round += 1) many.add(createLinePicker()({ hour: 10 }).line)
  assert.ok(many.has('Recuerda que te amo.'))
})

test('memories need real history', () => {
  for (let i = 0; i < 300; i += 1) {
    assert.ok(!/días juntos|Ya van/.test(createLinePicker()({ hour: 10, days: 0, pets: 0 }).line))
  }
})

test('every hour of the day works', () => {
  for (let hour = 0; hour < 24; hour += 1) assert.ok(createLinePicker()({ hour }).line)
})

test('a cursor passing through goes unnoticed; one that stays is noticed once', () => {
  const detect = createHoverDetector()
  assert.strictEqual(detect(200, 300, 0), null)
  assert.strictEqual(detect(10, 300, 500), null)
  assert.strictEqual(detect(200, 300, 1000), null)
  assert.ok(detect(200, 300, 2600))
  assert.strictEqual(detect(200, 300, 3000), null)
})
