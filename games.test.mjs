import test from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import { BEATS, GAMES, HANDS, HEARTS, NUMBER, REFLEX, createGuess, createHearts, gameLine, guessVerdict, pickHand, reflexVerdict, reflexWait, rps } from './games.mjs'

const read = name => fs.readFileSync(new URL(name, import.meta.url), 'utf8')
const I18N = JSON.parse(read('./i18n.json'))

// A repeatable "random": the same game every run.
function seeded(seed = 1) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

test('piedra, papel o tijera follows the same table as /claudia ppt', () => {
  const plugin = read('./plugin/hooks/register.tsx').match(/const BEATS[^=]*= (\{[^}]*\})/)[1]
  assert.deepStrictEqual(BEATS, Function(`return ${plugin}`)())
  for (const hand of HANDS) {
    assert.strictEqual(rps(hand, hand), 'tie')
    assert.strictEqual(rps(hand, BEATS[hand]), 'win')
    assert.strictEqual(rps(BEATS[hand], hand), 'lose')
  }
})

test('she picks every hand, and the ends of the random range are still hands', () => {
  const random = seeded(7)
  const picked = new Set(Array.from({ length: 60 }, () => pickHand(random)))
  assert.deepStrictEqual([...picked].sort(), [...HANDS].sort())
  assert.strictEqual(pickHand(() => 0), 'piedra')
  assert.strictEqual(pickHand(() => 0.999999), 'tijera')
  assert.strictEqual(pickHand(() => 1), 'tijera')
})

// Thirty seconds of hearts at ten ticks a second, as play.js runs them.
function tossAll(game) {
  const items = []
  for (let t = 0; t <= HEARTS.seconds + 2; t += 0.1) items.push(...game.toss(t).map(item => ({ ...item, at: t })))
  return items
}

test('hearts: thirty seconds of tosses, all inside the field, none after the end', () => {
  for (const seed of [1, 2, 3]) {
    const items = tossAll(createHearts(seeded(seed)))
    assert.ok(items.length >= 30 && items.length <= 80, `${items.length} tosses`)
    assert.ok(items.every(item => item.x >= 0 && item.x <= 1 && item.y >= 0 && item.y <= 1))
    assert.ok(items.every(item => item.at <= HEARTS.seconds + 0.1 && item.life >= 1.5 && item.life <= 2.4))
    assert.ok(items.some(item => item.kind === 'star') && items.some(item => item.kind === 'heart'))
    assert.strictEqual(new Set(items.map(item => item.id)).size, items.length)
    // They last less toward the end.
    assert.ok(items.at(-1).life < items[0].life)
  }
})

test('hearts: catching builds a combo, every fifth in a row is a streak, and a combo pays one more', () => {
  const game = createHearts(() => 0.5) // 0.5: hearts only
  const [first, ...rest] = tossAll(game)
  assert.deepStrictEqual(game.grab(first.id), { points: 1, score: 1, combo: 1, event: null })
  assert.strictEqual(game.grab(first.id), null, 'the same one twice')
  const next = rest.slice(0, 4).map(item => game.grab(item.id))
  assert.deepStrictEqual(next.map(got => got.event), [null, null, null, 'streak'])
  assert.deepStrictEqual(next.at(-1), { points: 2, score: 6, combo: 5, event: 'streak' })
})

test('hearts: a star is worth three', () => {
  const game = createHearts(() => 0.1) // under 0.15: stars only
  const [star] = tossAll(game)
  assert.strictEqual(star.kind, 'star')
  assert.strictEqual(game.grab(star.id).points, HEARTS.star)
})

test('hearts: letting one fade breaks the combo; she speaks up only for a broken run or a slump', () => {
  const game = createHearts(() => 0.5)
  const items = tossAll(game)
  assert.deepStrictEqual(game.fade(items[0].id), { score: 0, combo: 0, event: null })
  assert.strictEqual(game.fade(items[1].id).event, null)
  assert.strictEqual(game.fade(items[2].id).event, 'slump')
  assert.strictEqual(game.fade(items[2].id), null, 'already gone')
  for (const item of items.slice(3, 6)) game.grab(item.id)
  assert.deepStrictEqual(game.fade(items[6].id), { score: 3, combo: 0, event: 'miss' })
  assert.strictEqual(game.grab(items[7].id).combo, 1)
})

test('hearts: it is over at thirty seconds, and the goal decides the win', () => {
  const game = createHearts(() => 0.5)
  assert.strictEqual(game.isOver(29.9), false)
  assert.strictEqual(game.isOver(HEARTS.seconds), true)
  const items = tossAll(game)
  assert.deepStrictEqual(game.result(), { score: 0, bestCombo: 0, won: false })
  for (const item of items) game.grab(item.id)
  const { score, bestCombo, won } = game.result()
  assert.strictEqual(bestCombo, items.length)
  assert.ok(score >= HEARTS.goal && won)
})

test('reflexes: the wait cannot be guessed but stays in range', () => {
  assert.strictEqual(reflexWait(() => 0), REFLEX.minWait)
  assert.strictEqual(reflexWait(() => 1), REFLEX.maxWait)
  const random = seeded(3)
  const waits = Array.from({ length: 20 }, () => reflexWait(random))
  assert.ok(waits.every(wait => wait >= REFLEX.minWait && wait <= REFLEX.maxWait))
  assert.ok(new Set(waits.map(wait => wait.toFixed(2))).size > 10)
})

test('reflexes: faster than a human is a guess, not a reflex', () => {
  assert.strictEqual(reflexVerdict(40), 'early')
  assert.strictEqual(reflexVerdict(NaN), 'early')
  assert.strictEqual(reflexVerdict(REFLEX.tooSoon), 'fast')
  assert.strictEqual(reflexVerdict(REFLEX.fast), 'fast')
  assert.strictEqual(reflexVerdict(REFLEX.fast + 1), 'ok')
  assert.strictEqual(reflexVerdict(REFLEX.ok + 1), 'slow')
})

test('number: every secret from 1 to 20 is found in five tries by halving the range', () => {
  const seen = new Set()
  for (let k = 0; k < NUMBER.max; k++) {
    const game = createGuess(() => (k + 0.5) / NUMBER.max)
    let low = 1
    let high = NUMBER.max
    let got
    do {
      got = game.guess(Math.floor((low + high) / 2))
      ;({ low, high } = got)
    } while (got.hint !== 'right')
    seen.add(low)
    assert.ok(got.tries <= NUMBER.fair && got.won, `secret ${low} took ${got.tries}`)
  }
  assert.strictEqual(seen.size, NUMBER.max)
  assert.strictEqual(createGuess(() => 1).guess(NUMBER.max).hint, 'right')
})

test('number: hints narrow the range, and a ruled-out number costs no try', () => {
  const game = createGuess(() => 0.5) // 11
  assert.deepStrictEqual(game.guess(5), { hint: 'higher', tries: 1, low: 6, high: 20 })
  assert.strictEqual(game.guess(3), null)
  assert.strictEqual(game.guess(21), null)
  assert.strictEqual(game.guess(7.5), null)
  assert.deepStrictEqual(game.guess(15), { hint: 'lower', tries: 2, low: 6, high: 14 })
  assert.deepStrictEqual(game.guess(11), { hint: 'right', tries: 3, low: 11, high: 11, verdict: 'quick', won: true })
  assert.strictEqual(game.guess(11), null, 'the game is over')
})

test('number: she pouts at three tries, is fair up to five and gloats after', () => {
  assert.deepStrictEqual([1, 3, 4, 5, 6, 12].map(guessVerdict), ['quick', 'quick', 'fair', 'fair', 'slow', 'slow'])
})

// Every line play.js asks for, with the values it fills in.
const LINES = {
  'ppt.win': {}, 'ppt.lose': {}, 'ppt.tie': {},
  'hearts.start': {}, 'hearts.streak': { n: 5 }, 'hearts.miss': {}, 'hearts.end': { n: 12 }, 'hearts.record': { n: 31 },
  'reflex.early': {}, 'reflex.fast': {}, 'reflex.ok': {}, 'reflex.slow': {}, 'reflex.record': {},
  'number.quick': { n: 2 }, 'number.fair': { n: 4 }, 'number.slow': { n: 7 },
}

test('she has a line for every moment of every game, in every language and personality', () => {
  const personalities = [undefined, 'yandere', 'tsundere', 'dulce', 'kuudere', 'onee-san', 'genki', 'dandere', 'himedere', 'gamer', 'chuunibyou', 'no-such-one']
  for (const [code, { games }] of Object.entries(I18N)) {
    for (const personalidad of personalities) {
      for (const [key, values] of Object.entries(LINES)) {
        // Both ends of the range: the first plain line, and the last (flavoured where there is one).
        for (const random of [() => 0, () => 0.39, () => 0.99]) {
          const line = gameLine(games, key, { personalidad, values }, random)
          assert.ok(line.length > 1 && line.length <= 120, `${code} ${key}: "${line}"`)
          assert.doesNotMatch(line, /[{}]|undefined/, `${code} ${key}`)
        }
      }
    }
  }
})

test('a result is sometimes said in her personality, and never when she has none', () => {
  const { games } = I18N.es
  assert.strictEqual(gameLine(games, 'ppt.win', { personalidad: 'tsundere' }, () => 0), games.flavor.tsundere.won[0])
  assert.ok(games.ppt.win.includes(gameLine(games, 'ppt.win', { personalidad: 'tsundere' }, () => 0.5)))
  assert.ok(games.ppt.win.includes(gameLine(games, 'ppt.win', {}, () => 0)))
  // A tie is nobody's win: no flavour.
  assert.ok(games.ppt.tie.includes(gameLine(games, 'ppt.tie', { personalidad: 'tsundere' }, () => 0)))
  assert.strictEqual(gameLine(games, 'number.fair', { values: { n: 4 } }, () => 0), games.number.fair[0].replace('{n}', '4'))
  assert.strictEqual(gameLine(undefined, 'ppt.win'), '')
})

test('every game has a name and a first-run how-to in every language, and the texts the card needs', () => {
  for (const [code, { games }] of Object.entries(I18N)) {
    for (const game of GAMES) {
      assert.ok(games.names[game], `${code}: names.${game}`)
      assert.ok(games.how[game], `${code}: how.${game}`)
    }
    assert.strictEqual(games.ppt.count.length, 3, code)
    assert.match(games.score, /\{me\}.*\{her\}/, code)
    for (const key of ['points', 'combo', 'best', 'ms', 'tries']) assert.match(games[key], /\{n\}/, `${code}: ${key}`)
    assert.match(games.propose, /🎮/, code)
    assert.match(games.doneChip, /✔.*Claude/, code)
  }
})

test('her game lines stay playful: nothing about real people, bodies or rivals', () => {
  for (const [code, { games }] of Object.entries(I18N)) {
    assert.doesNotMatch(JSON.stringify(games), /sexy|novi[oa]|girlfriend|boyfriend|бывш|元カ/i, code)
  }
})
