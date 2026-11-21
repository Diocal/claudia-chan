const test = require('node:test')
const assert = require('node:assert')
const I18N = require('./i18n.json')

// Every key path of a language: "panel.heading", "pet[]" for a list.
function shape(value, at = '') {
  if (Array.isArray(value)) return [`${at}[]`]
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([key, inner]) => shape(inner, at ? `${at}.${key}` : key))
  return [at]
}

function empties(value, at = '') {
  if (Array.isArray(value)) return value.length ? value.flatMap((inner, i) => empties(inner, `${at}[${i}]`)) : [at]
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([key, inner]) => empties(inner, at ? `${at}.${key}` : key))
  return typeof value === 'string' && value.trim() ? [] : [at]
}

test('she speaks five languages', () => {
  assert.deepStrictEqual(Object.keys(I18N).sort(), ['en', 'es', 'ja', 'pt', 'ru'])
})

test('every language has exactly the same keys', () => {
  const wanted = shape(I18N.es).sort()
  for (const [code, language] of Object.entries(I18N)) assert.deepStrictEqual(shape(language).sort(), wanted, code)
})

test('no language has an empty text or an empty list', () => {
  for (const [code, language] of Object.entries(I18N)) assert.deepStrictEqual(empties(language), [], code)
})

// The plugin's own replies (/claudia ...) live in its source as a JSON literal: same rule there.
function pluginTexts() {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, 'plugin/hooks/register.tsx'), 'utf8')
  const from = source.indexOf('const UI = {') + 'const UI = '.length

  return JSON.parse(source.slice(from, source.indexOf('\n} as const', from) + 2))
}

test('the plugin answers /claudia in the same five languages, with the same keys', () => {
  const ui = pluginTexts()
  assert.deepStrictEqual(Object.keys(ui).sort(), ['en', 'es', 'ja', 'pt', 'ru'])
  const wanted = shape(ui.es).sort()
  for (const [code, language] of Object.entries(ui)) {
    assert.deepStrictEqual(shape(language).sort(), wanted, code)
    assert.deepStrictEqual(empties(language), [], code)
    // /claudia help reads its entries by position.
    assert.strictEqual(language.h.length, ui.es.h.length, code)
  }
})

test('/claudia help has a text for every entry it reads', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, 'plugin/hooks/register.tsx'), 'utf8')
  const used = [...source.matchAll(/say\.h\[(\d+)\]/g)].map(match => Number(match[1]))
  const { length } = pluginTexts().es.h
  assert.deepStrictEqual([...new Set(used)].sort((a, b) => a - b), Array.from({ length }, (_, i) => i))
})
