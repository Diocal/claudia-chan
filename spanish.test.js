const test = require('node:test')
const assert = require('node:assert')
const { spanishToKatakana: k } = require('./spanish.js')

test('r and l merge, as in the accent', () => assert.strictEqual(k('hola'), 'オラ'))
test('digraphs', () => {
  assert.strictEqual(k('chica'), 'チカ')
  assert.strictEqual(k('quiero'), 'キエロ')
  assert.strictEqual(k('guerra'), 'ゲラ')
  assert.strictEqual(k('gente'), 'ヘンテ')
  assert.strictEqual(k('niño'), 'ニニョ')
})
test('codas and stress', () => {
  assert.strictEqual(k('amor'), 'アモル')
  assert.strictEqual(k('están'), 'エスターン')
  assert.strictEqual(k('hoy'), 'オイ')
})
test('punctuation becomes pauses and nothing foreign survives', () => {
  assert.strictEqual(k('¡Sí, claro! 123'), 'シー、 クラロ。')
})
