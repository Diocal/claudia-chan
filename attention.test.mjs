import test from 'node:test'
import assert from 'node:assert'
import { createAttention } from './attention.mjs'

const FRAME = 1 / 30
const idle = { cursorMoved: false, speaking: false, working: false, near: false, petting: false, reacting: false, fixed: false }

// Runs `seconds` of frames with the same inputs and returns the mode of each frame.
function run(step, from, seconds, inputs) {
  const modes = []
  for (let t = from; t < from + seconds; t += FRAME) modes.push(step({ ...idle, ...inputs, t }))
  return modes
}

test('a moving cursor keeps her eyes on it', () => {
  const modes = run(createAttention().step, 0, 60, { cursorMoved: true })
  assert.ok(modes.every(mode => mode === 'cursor'))
})

test('a still cursor earns eye contact within 9 s, and movement takes it back at once', () => {
  for (const random of [() => 0, () => 0.5, () => 0.999, Math.random]) {
    const step = createAttention(random).step
    const modes = run(step, 0, 9.2, {})
    const first = modes.indexOf('user')
    assert.ok(first > 0, 'she looks up')
    assert.ok(first * FRAME >= 4 - FRAME, 'not before 4 s')
    // Catch her mid-glance, then move.
    const again = createAttention(random).step
    let t = 0
    while (again({ ...idle, t }) !== 'user') t += FRAME
    assert.strictEqual(again({ ...idle, t: t + FRAME, cursorMoved: true }), 'cursor')
    assert.strictEqual(again({ ...idle, t: t + 2 * FRAME }), 'cursor')
  }
})

test('eye contact lasts 2 to 4 s, then the wait starts over', () => {
  const step = createAttention(() => 0.5).step
  const modes = run(step, 0, 30, {})
  const first = modes.indexOf('user')
  const back = modes.indexOf('cursor', first)
  const held = (back - first) * FRAME
  assert.ok(held >= 2 - FRAME && held <= 4 + FRAME, `held ${held}`)
  const second = modes.indexOf('user', back)
  assert.ok((second - back) * FRAME >= 4 - FRAME, 'a full wait before the next glance')
})

test('speaking, she looks at you', () => {
  const modes = run(createAttention().step, 0, 5, { speaking: true, cursorMoved: true })
  assert.ok(modes.every(mode => mode === 'user'))
})

test('working, she looks at her work, and up at the cursor for 1 s when it arrives', () => {
  const step = createAttention().step
  assert.ok(run(step, 0, 20, { working: true }).every(mode => mode === 'work'))
  const arrived = run(step, 20, 3, { working: true, near: true })
  const glance = arrived.filter(mode => mode === 'cursor').length * FRAME
  assert.strictEqual(arrived[0], 'cursor')
  assert.ok(Math.abs(glance - 1) <= 2 * FRAME, `glanced ${glance}`)
  assert.strictEqual(arrived.at(-1), 'work')
  // Still near: no second glance until the cursor leaves and comes back.
  assert.ok(run(step, 23, 5, { working: true, near: true }).every(mode => mode === 'work'))
  run(step, 28, 1, { working: true })
  assert.strictEqual(step({ ...idle, working: true, near: true, t: 29 }), 'cursor')
})

test('petting and reactions keep her on the cursor, even while she speaks', () => {
  assert.ok(run(createAttention().step, 0, 20, { petting: true, speaking: true }).every(mode => mode === 'cursor'))
  assert.ok(run(createAttention().step, 0, 20, { reacting: true, working: true }).every(mode => mode === 'cursor'))
})

test('the fixed stare never leaves the cursor', () => {
  const step = createAttention().step
  const modes = [...run(step, 0, 60, { fixed: true }), ...run(step, 60, 10, { fixed: true, speaking: true }), ...run(step, 70, 10, { fixed: true, working: true })]
  assert.ok(modes.every(mode => mode === 'cursor'))
})

test('over ten minutes of a still cursor she looks at you less than half the time', () => {
  for (const random of [() => 0, () => 0.999, Math.random]) {
    const modes = run(createAttention(random).step, 0, 600, {})
    const share = modes.filter(mode => mode === 'user').length / modes.length
    assert.ok(share > 0.1 && share < 0.5, `share ${share}`)
  }
})

test('shy, she looks away when your cursor arrives, then peeks at it', () => {
  const { step } = createAttention()
  run(step, 0, 1, { shy: true })
  const modes = run(step, 1, 3, { shy: true, near: true })
  assert.strictEqual(modes[0], 'away')
  assert.ok(modes.slice(0, 30).every(mode => mode === 'away'), 'about a second to the side')
  assert.ok(modes.slice(40).every(mode => mode === 'cursor'), 'then back to the cursor')
  // Not shy, the same arrival is just the cursor; shy but petted or speaking, the gesture wins.
  assert.ok(run(createAttention().step, 1, 2, { near: true }).every(mode => mode === 'cursor'))
  assert.ok(run(createAttention().step, 1, 1, { shy: true, near: true, petting: true }).every(mode => mode === 'cursor'))
  assert.ok(run(createAttention().step, 1, 1, { shy: true, near: true, speaking: true }).every(mode => mode === 'user'))
})
