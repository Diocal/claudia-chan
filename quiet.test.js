const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { MAX_MINUTES, validMinutes, untilFor, isQuietAt, clockTime } = require('./quiet.js')
const I18N = require('./i18n.json')

const NOW = 1_800_000_000_000

test('minutes are whole numbers from 0 (off) to eight hours', () => {
  for (const ok of [0, 1, 30, 60, 120, MAX_MINUTES]) assert.ok(validMinutes(ok), String(ok))
  for (const bad of [-1, MAX_MINUTES + 1, 1.5, NaN, Infinity, '60', null, undefined, true]) assert.ok(!validMinutes(bad), String(bad))
  assert.strictEqual(MAX_MINUTES, 480)
})

test('quiet lasts exactly the minutes asked for', () => {
  const until = untilFor(60, NOW)
  assert.strictEqual(until, NOW + 3600000)
  assert.ok(isQuietAt({ quietUntil: until }, NOW))
  assert.ok(isQuietAt({ quietUntil: until }, until - 1))
  assert.ok(!isQuietAt({ quietUntil: until }, until))
  assert.ok(!isQuietAt({ quietUntil: until }, until + 1))
})

test('off, absent or broken means she may talk', () => {
  for (const config of [{}, { quietUntil: 0 }, { quietUntil: null }, { quietUntil: 'pronto' }, undefined, null]) assert.ok(!isQuietAt(config, NOW))
  assert.ok(!isQuietAt({ quietUntil: untilFor(0, NOW) }, NOW))
})

test('the end time reads as a clock', () => {
  assert.strictEqual(clockTime(new Date(2026, 0, 5, 7, 5).getTime()), '07:05')
  assert.strictEqual(clockTime(new Date(2026, 0, 5, 23, 40).getTime()), '23:40')
})

test('her line when going quiet says how long, in every language', () => {
  for (const [code, language] of Object.entries(I18N)) {
    assert.match(language.quietOn, /\{m\}/, code)
    for (const key of ['quiet', 'quietOff']) assert.ok(language.tools[key], `${code}: tools.${key}`)
  }
})

// The plugin keeps its own copy of the reading modes and of the limit (it cannot require this folder).
test('the plugin and the app agree on reading modes and on the limit', () => {
  const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8')
  const plugin = fs.readFileSync(path.join(__dirname, 'plugin/hooks/register.tsx'), 'utf8')
  const modes = source => source.match(/lectura: \[([^\]]+)\]/)?.[1].replace(/\s/g, '')
  assert.strictEqual(modes(main), "'todo','resumen','burbuja'")
  assert.strictEqual(modes(plugin), modes(main))
  assert.match(plugin, new RegExp(`QUIET_MAX = ${MAX_MINUTES}\\b`))
})
