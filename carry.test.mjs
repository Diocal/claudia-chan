import test from 'node:test'
import assert from 'node:assert'
import { MAX_SWAY, createCarry } from './carry.mjs'

const DT = 1 / 60

// Runs `seconds` of frames; `input(t)` gives the frame's { vx, vy, held, full }. Returns every result.
function run(carry, seconds, input) {
  const frames = []
  for (let t = 0; t < seconds; t += DT) frames.push(carry.step({ dt: DT, ...input(t) }))
  return frames
}
const events = frames => frames.map(f => f.event).filter(Boolean)
// The window thrown from side to side: `speed` px/s, changing direction every `every` seconds.
const shake = (speed, every) => t => ({ vx: Math.floor(t / every) % 2 ? -speed : speed, held: true })

test('sway stays inside the limit for any speed, waist-up and full body', () => {
  for (const full of [false, true]) {
    const max = full ? MAX_SWAY.full : MAX_SWAY.bust
    for (const vx of [-1e6, -5000, -300, 300, 5000, 1e6]) {
      const frames = run(createCarry(), 4, () => ({ vx, vy: vx, held: true, full }))
      for (const { sway, lift } of frames) {
        assert.ok(Math.abs(sway) <= max + 1e-9, `vx ${vx} full ${full}: sway ${sway}`)
        assert.ok(Math.abs(lift) <= 0.05 + 1e-9, `vy ${vx}: lift ${lift}`)
      }
      // A fast move really reaches the limit: she hangs as far as the view allows.
      if (Math.abs(vx) >= 5000) assert.ok(Math.abs(frames.at(-1).sway) > max * 0.99)
    }
  }
  assert.equal(MAX_SWAY.bust, 0.14)
  assert.equal(MAX_SWAY.full, 0.3)
})

test('she trails behind the movement', () => {
  // Carried to the right, her feet stay behind on the left (negative lean); carried down, she rises.
  const right = run(createCarry(), 1, () => ({ vx: 800, vy: 800, held: true })).at(-1)
  assert.ok(right.sway < -0.05)
  assert.ok(right.lift > 0.02)
  const left = run(createCarry(), 1, () => ({ vx: -800, vy: -800, held: true })).at(-1)
  assert.ok(left.sway > 0.05)
  assert.ok(left.lift < -0.02)
})

test('she hangs straight again once the movement stops', () => {
  const carry = createCarry()
  run(carry, 2, () => ({ vx: 3000, vy: 2000, held: true, full: true }))
  const { sway, lift } = run(carry, 4, () => ({ vx: 0, vy: 0, held: true, full: true })).at(-1)
  assert.ok(Math.abs(sway) < 0.001, `sway ${sway}`)
  assert.ok(Math.abs(lift) < 0.001, `lift ${lift}`)
})

test('grab and drop fire exactly once per hold', () => {
  const carry = createCarry()
  const seen = []
  for (let hold = 0; hold < 3; hold++) {
    seen.push(...events(run(carry, 1.5, () => ({ vx: 600, held: true }))))
    seen.push(...events(run(carry, 1, () => ({ vx: 0, held: false }))))
  }
  assert.deepEqual(seen, ['grab', 'drop', 'grab', 'drop', 'grab', 'drop'])
})

test('shaking her fast leaves her dizzy', () => {
  const carry = createCarry()
  const held = run(carry, 3, shake(3000, 0.15))
  assert.deepEqual(events(held), ['grab'])
  assert.deepEqual(events(run(carry, 0.5, () => ({ held: false }))), ['dizzy'])
})

test('gentle or long-past shaking is only a drop', () => {
  // Slow rocking never counts as shaking.
  const gentle = createCarry()
  run(gentle, 4, shake(300, 0.15))
  assert.deepEqual(events(run(gentle, 0.5, () => ({ held: false }))), ['drop'])
  // Shaken, then held still for longer than the window: she has recovered.
  const calm = createCarry()
  run(calm, 3, shake(3000, 0.15))
  run(calm, 3.5, () => ({ vx: 0, held: true }))
  assert.deepEqual(events(run(calm, 0.5, () => ({ held: false }))), ['drop'])
  // A dizzy hold does not leak into the next one.
  const again = createCarry()
  run(again, 3, shake(3000, 0.15))
  run(again, 0.5, () => ({ held: false }))
  run(again, 1, () => ({ vx: 500, held: true }))
  assert.deepEqual(events(run(again, 0.5, () => ({ held: false }))), ['drop'])
})

test('her own walks sway her but never count as being carried', () => {
  const walking = run(createCarry(), 3, t => ({ ...shake(3000, 0.15)(t), held: false }))
  assert.ok(walking.some(f => Math.abs(f.sway) > 0.05))
  assert.deepEqual(events(walking), [])
})
