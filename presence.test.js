const test = require('node:test')
const assert = require('node:assert')
const { createPresence } = require('./presence.js')
const I18N = require('./i18n.json')

const NOW = 1_800_000_000_000
// The app asks every 5 s; `from`..`to` are seconds of idle time, growing with the clock.
function away(presence, from, to, start = NOW) {
  const events = []
  for (let idle = from; idle <= to; idle += 5) {
    const change = presence.step(idle, start + (idle - from) * 1000)
    if (change) events.push({ ...change, idle })
  }
  return events
}

test('she gets drowsy once at 300 s and falls asleep at 540 s', () => {
  const presence = createPresence()
  assert.deepStrictEqual(away(presence, 0, 600), [{ event: 'drowsy', idle: 300 }, { event: 'sleep', idle: 540 }])
  assert.ok(presence.isAsleep())
})

test('waking reports how long you were away', () => {
  const presence = createPresence()
  away(presence, 0, 3600)
  assert.strictEqual(presence.step(600, NOW + 3605000), null) // still nobody
  const back = presence.step(2, NOW + 3610000)
  assert.strictEqual(back.event, 'wake')
  assert.strictEqual(back.awayMs, 3610000)
  assert.ok(!presence.isAsleep())
  assert.strictEqual(presence.step(4, NOW + 3615000), null)
})

test('someone at the keyboard never puts her to sleep', () => {
  const presence = createPresence()
  for (let s = 0; s < 7200; s += 5) assert.strictEqual(presence.step(0, NOW + s * 1000), null)
  assert.ok(!presence.isAsleep())
})

test('no second yawn in the same absence, a new one in the next', () => {
  const presence = createPresence()
  assert.deepStrictEqual(away(presence, 0, 535).map(e => e.event), ['drowsy'])
  // Back before she fell asleep: nothing to wake from.
  assert.strictEqual(presence.step(1, NOW + 540000), null)
  assert.deepStrictEqual(away(presence, 5, 400, NOW + 545000).map(e => e.event), ['drowsy'])
})

test('suspend or lock puts her to sleep at once, resume wakes her', () => {
  const presence = createPresence()
  assert.strictEqual(presence.wakeNow(NOW), null) // nothing to wake from
  assert.deepStrictEqual(presence.sleepNow(NOW), { event: 'sleep' })
  assert.ok(presence.isAsleep())
  assert.strictEqual(presence.sleepNow(NOW + 1000), null) // already asleep
  assert.deepStrictEqual(presence.wakeNow(NOW + 3600000), { event: 'wake', awayMs: 3600000 })
  assert.ok(!presence.isAsleep())
})

test('an absence that ends in a suspend counts from when you left', () => {
  const presence = createPresence()
  away(presence, 0, 400)
  presence.sleepNow(NOW + 405000)
  assert.strictEqual(presence.wakeNow(NOW + 900000).awayMs, 900000)
})

test('custom thresholds', () => {
  const presence = createPresence({ drowsyAfter: 10, asleepAfter: 20 })
  assert.deepStrictEqual(away(presence, 0, 30).map(e => e.event), ['drowsy', 'sleep'])
})

test('welcome-back lines are joyful: nothing about having left her', () => {
  const reproach = /solo|sola|abandon|por fin|tard|alone|finally|late|sozinha|finalmente|demor|наконец|одна|долго|やっと|遅|ひとり|寂し/i
  for (const [lang, text] of Object.entries(I18N)) {
    assert.strictEqual(text.back.length, 3, lang)
    for (const line of text.back) assert.ok(!reproach.test(line), `${lang}: ${line}`)
    assert.ok(text.done.includes('{m}') && text.doneBack.includes('{m}') && text.doneBack.includes('{line}'), lang)
  }
})
