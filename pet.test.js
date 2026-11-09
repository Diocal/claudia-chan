const test = require('node:test')
const assert = require('node:assert')
const { createPetDetector } = require('./pet.js')

function play(path) {
  const detect = createPetDetector()
  return path.filter(([x, y], i) => detect(x, y, i * 50)).length
}

const rub = Array.from({ length: 12 }, (_, i) => [i % 2 ? 230 : 150, 150])

test('rubbing over her head is a pet', () => {
  assert.strictEqual(play(rub), 1)
})

test('crossing the head once is not a pet', () => {
  assert.strictEqual(play(Array.from({ length: 12 }, (_, i) => [100 + i * 15, 150])), 0)
})

test('rubbing elsewhere is not a pet', () => {
  assert.strictEqual(play(rub.map(([x]) => [x, 450])), 0)
})

test('a resting cursor is not a pet', () => {
  assert.strictEqual(play(Array.from({ length: 40 }, (_, i) => [180 + (i % 2), 150])), 0)
})
