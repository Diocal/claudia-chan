const test = require('node:test')
const assert = require('node:assert')
const { createWorkTracker } = require('./work.js')

const MIN = 60000

// A prompt every 10 minutes keeps the streak alive.
function workFor(tracker, minutes) {
  for (let m = 0; m <= minutes; m += 10) tracker.activity(m * MIN)
}

test('no warning before 90 minutes by day', () => {
  const tracker = createWorkTracker()
  workFor(tracker, 80)
  assert.strictEqual(tracker.check(80 * MIN, 14), null)
})

test('warns at 90 minutes, then waits 45 more', () => {
  const tracker = createWorkTracker()
  workFor(tracker, 90)
  assert.deepStrictEqual(tracker.check(90 * MIN, 14), { minutes: 90, isLate: false })
  assert.strictEqual(tracker.check(100 * MIN, 14), null)
  for (let m = 100; m <= 135; m += 5) tracker.activity(m * MIN)
  assert.strictEqual(tracker.check(135 * MIN, 14).minutes, 135)
})

test('warns sooner late at night', () => {
  const tracker = createWorkTracker()
  workFor(tracker, 30)
  assert.strictEqual(tracker.check(30 * MIN, 2).isLate, true)
})

test('a break of over 15 minutes restarts the streak', () => {
  const tracker = createWorkTracker()
  workFor(tracker, 80)
  tracker.activity(100 * MIN)
  assert.strictEqual(tracker.check(100 * MIN, 14), null)
})

test('no warning once the user has left', () => {
  const tracker = createWorkTracker()
  workFor(tracker, 90)
  assert.strictEqual(tracker.check(120 * MIN, 14), null)
})

test('working outside the set hours warns, then waits 30 minutes', () => {
  const tracker = createWorkTracker()
  const hours = { from: 9, to: 18 }
  tracker.activity(0)
  assert.strictEqual(tracker.checkHours(0, 14, hours), false)
  assert.strictEqual(tracker.checkHours(MIN, 19, hours), true)
  tracker.activity(10 * MIN)
  assert.strictEqual(tracker.checkHours(10 * MIN, 19, hours), false)
  tracker.activity(31 * MIN)
  assert.strictEqual(tracker.checkHours(31 * MIN, 19, hours), true)
})

test('a range can cross midnight', () => {
  const tracker = createWorkTracker()
  tracker.activity(0)
  assert.strictEqual(tracker.checkHours(0, 23, { from: 22, to: 6 }), false)
  assert.strictEqual(tracker.checkHours(0, 3, { from: 22, to: 6 }), false)
  assert.strictEqual(tracker.checkHours(0, 12, { from: 22, to: 6 }), true)
})

test('no hours set or nobody working: no warning', () => {
  const tracker = createWorkTracker()
  assert.strictEqual(tracker.checkHours(0, 23, { from: 9, to: 18 }), false)
  tracker.activity(0)
  assert.strictEqual(tracker.checkHours(0, 23, undefined), false)
})
