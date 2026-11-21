const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { MAX_MINUTES, MAX_ITEMS, MAX_TEXT, SOON_MS, parseDue, add, split, soon, valid } = require('./reminders.js')
const I18N = require('./i18n.json')

// A local noon, so "earlier today" and "later today" both exist whatever the machine's time zone.
const NOW = new Date(2026, 10, 13, 12, 0, 0, 0).getTime()
const MIN = 60000
const HOUR = 60 * MIN

test('minutes go from one to a week, whole numbers only', () => {
  assert.strictEqual(parseDue({ minutes: 1 }, NOW), NOW + MIN)
  assert.strictEqual(parseDue({ minutes: 20 }, NOW), NOW + 20 * MIN)
  assert.strictEqual(parseDue({ minutes: MAX_MINUTES }, NOW), NOW + MAX_MINUTES * MIN)
  assert.strictEqual(MAX_MINUTES, 10080)
  for (const bad of [0, -5, MAX_MINUTES + 1, 1.5, NaN, Infinity, '20', true]) assert.strictEqual(parseDue({ minutes: bad }, NOW), null, String(bad))
})

test('a clock time later today is today', () => {
  assert.strictEqual(parseDue({ at: '17:30' }, NOW), new Date(2026, 10, 13, 17, 30).getTime())
  assert.strictEqual(parseDue({ at: '12:01' }, NOW), NOW + MIN)
  assert.strictEqual(parseDue({ at: ' 23:59 ' }, NOW), new Date(2026, 10, 13, 23, 59).getTime())
})

test('a clock time earlier than now, or right now, rolls to tomorrow', () => {
  assert.strictEqual(parseDue({ at: '9:05' }, NOW), new Date(2026, 10, 14, 9, 5).getTime())
  assert.strictEqual(parseDue({ at: '09:05' }, NOW), new Date(2026, 10, 14, 9, 5).getTime())
  assert.strictEqual(parseDue({ at: '12:00' }, NOW), new Date(2026, 10, 14, 12, 0).getTime())
  assert.strictEqual(parseDue({ at: '00:00' }, NOW), new Date(2026, 10, 14, 0, 0).getTime())
})

test('anything that is not a time gives null', () => {
  for (const bad of [{}, undefined, { at: '24:00' }, { at: '12:60' }, { at: '5pm' }, { at: '1730' }, { at: '' }, { at: 17 }, { at: '12:00:00' }, { minutes: null }]) {
    assert.strictEqual(parseDue(bad, NOW), null, JSON.stringify(bad))
  }
  // A bad `minutes` is not rescued by a good `at`: the caller sent nonsense.
  assert.strictEqual(parseDue({ minutes: 0, at: '17:30' }, NOW), null)
})

test('add trims the text, numbers the item and keeps the list in due order', () => {
  const first = add([], { text: '  sacar la ropa  ', due: NOW + 20 * MIN })
  assert.deepStrictEqual(first.item, { id: 1, text: 'sacar la ropa', due: NOW + 20 * MIN })
  const second = add(first.list, { text: 'llamar a mamá', due: NOW + 5 * MIN })
  assert.strictEqual(second.item.id, 2)
  assert.deepStrictEqual(second.list.map(item => item.text), ['llamar a mamá', 'sacar la ropa'])
  // The list given is never changed in place.
  assert.strictEqual(first.list.length, 1)
})

test('add refuses empty text and a time that is not a number', () => {
  for (const text of ['', '   ', undefined, null, 42]) assert.strictEqual(add([], { text, due: NOW }), null, String(text))
  for (const due of [undefined, null, NaN, '12:00']) assert.strictEqual(add([], { text: 'x', due }), null, String(due))
})

test('text is cut to 200 characters', () => {
  const { item } = add([], { text: 'a'.repeat(500), due: NOW })
  assert.strictEqual(item.text.length, MAX_TEXT)
  assert.strictEqual(MAX_TEXT, 200)
})

test('the list holds at most 20', () => {
  let list = []
  for (let i = 0; i < MAX_ITEMS; i++) list = add(list, { text: `cosa ${i}`, due: NOW + i * MIN }).list
  assert.strictEqual(list.length, 20)
  assert.strictEqual(add(list, { text: 'una más', due: NOW }), null)
  // Ids stay unique after one is removed and another added.
  const again = add(list.slice(1), { text: 'otra', due: NOW })
  assert.strictEqual(new Set(again.list.map(item => item.id)).size, 20)
})

test('split tells on time from late from expired from not yet', () => {
  const at = (id, over) => ({ id, text: String(id), due: NOW - over })
  const list = [at(1, 0), at(2, 2 * MIN - 1), at(3, 2 * MIN), at(4, 24 * HOUR), at(5, 24 * HOUR + 1), at(6, -1), at(7, -HOUR)]
  const parts = split(list, NOW)
  assert.deepStrictEqual(parts.due.map(item => item.id), [1, 2])
  assert.deepStrictEqual(parts.late.map(item => item.id), [3, 4])
  assert.deepStrictEqual(parts.expired.map(item => item.id), [5])
  assert.deepStrictEqual(parts.rest.map(item => item.id), [6, 7])
  assert.deepStrictEqual(split([], NOW), { due: [], late: [], expired: [], rest: [] })
})

test('soon: something within three hours keeps her alive', () => {
  const item = due => [{ id: 1, text: 'x', due }]
  assert.strictEqual(SOON_MS, 3 * HOUR)
  assert.ok(soon(item(NOW + HOUR), NOW))
  assert.ok(soon(item(NOW + 3 * HOUR), NOW))
  assert.ok(!soon(item(NOW + 3 * HOUR + 1), NOW))
  assert.ok(soon(item(NOW - MIN), NOW), 'overdue is about to be said')
  assert.ok(!soon([], NOW))
  assert.ok(soon(item(NOW + 5 * HOUR), NOW, 6 * HOUR))
})

test('a broken list from config.json is cleaned, not trusted', () => {
  const good = { id: 1, text: 'x', due: NOW }
  assert.deepStrictEqual(valid([good, null, 'x', { id: 'a', text: 'x', due: NOW }, { id: 2, text: 5, due: NOW }, { id: 3, text: 'x' }]), [good])
  for (const broken of [undefined, null, 'x', {}, 7]) assert.deepStrictEqual(valid(broken), [])
})

test('her reminder lines carry the text in every language', () => {
  for (const [language, table] of Object.entries(I18N)) {
    for (const key of ['reminder', 'reminderLate']) assert.ok(table[key]?.includes('{text}'), `${language}.${key}`)
  }
})

test('main.js and the plugin agree with these limits', () => {
  const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8')
  const plugin = fs.readFileSync(path.join(__dirname, 'plugin/hooks/register.tsx'), 'utf8')
  assert.ok(main.includes("require('./reminders.js')"))
  assert.ok(plugin.includes(`REMINDER_MAX_MINUTES = ${MAX_MINUTES}`))
  assert.ok(plugin.includes("'mcp__claudia-chan__recordatorio'"))
})

test('a clock time with a date falls on that day, not on the next time the clock reads it', () => {
  assert.strictEqual(parseDue({ at: '13:00', date: '2026-11-14' }, NOW), new Date(2026, 10, 14, 13, 0).getTime())
  assert.strictEqual(parseDue({ at: '10:00', date: '2026-11-20' }, NOW), new Date(2026, 10, 20, 10, 0).getTime())
  assert.strictEqual(parseDue({ at: '17:30', date: '2026-11-13' }, NOW), new Date(2026, 10, 13, 17, 30).getTime())
  // Past, more than a week away, not a day at all: refused instead of guessed.
  for (const bad of ['2026-11-12', '2026-11-13', '2026-11-21', '2026-02-31', '14/11/2026', 'mañana', 20261114]) {
    assert.strictEqual(parseDue({ at: '09:00', date: bad }, NOW), null, String(bad))
  }
})
