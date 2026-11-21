const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { GAMES, BOND_PER_DAY, PROPOSE_AFTER_MS, PROPOSE_GAP_MS, valid, validResult, applyResult, shouldPropose, clickRect, inRect } = require('./gamestats.js')
const { toolsRect, TOOL_COUNT } = require('./toolbar.js')

const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8')
const EMPTY = { played: 0, wins: 0, bestReflexMs: null, bestHearts: 0, bond: 0, bondDay: '', bondToday: 0 }

test('no games yet, or a hand-edited config, is a clean sheet', () => {
  assert.deepStrictEqual(valid(undefined), EMPTY)
  assert.deepStrictEqual(valid('x'), EMPTY)
  assert.deepStrictEqual(valid({ played: -3, wins: 'many', bestReflexMs: 0, bestHearts: 2.5, bond: null }), EMPTY)
  assert.deepStrictEqual(valid({ played: 4, wins: 2, bestReflexMs: 231, bestHearts: 18, bond: 6, bondDay: '2026-11-13', bondToday: 6 }),
    { played: 4, wins: 2, bestReflexMs: 231, bestHearts: 18, bond: 6, bondDay: '2026-11-13', bondToday: 6 })
})

test('a result must name a game and say who won; hearts carry a score and reflexes a time', () => {
  assert.deepStrictEqual(validResult({ game: 'ppt', won: true, extra: 1 }), { game: 'ppt', won: true })
  assert.deepStrictEqual(validResult({ game: 'corazones', won: false, score: 12 }), { game: 'corazones', won: false, score: 12 })
  assert.deepStrictEqual(validResult({ game: 'reflejos', won: true, ms: 240 }), { game: 'reflejos', won: true, ms: 240 })
  for (const bad of [null, 'ppt', {}, { game: 'ajedrez', won: true }, { game: 'ppt', won: 1 }, { game: 'corazones', won: true }, { game: 'corazones', won: true, score: -1 },
    { game: 'corazones', won: true, score: 1000 }, { game: 'reflejos', won: true }, { game: 'reflejos', won: true, ms: 0 }, { game: 'reflejos', won: true, ms: 12.5 }]) {
    assert.strictEqual(validResult(bad), null, JSON.stringify(bad))
  }
})

test('results add up: games played, wins, the best reflex time and the best hearts score', () => {
  let stats = applyResult(undefined, { game: 'ppt', won: true }, '2026-11-13')
  stats = applyResult(stats, { game: 'reflejos', won: false, ms: 410 }, '2026-11-13')
  stats = applyResult(stats, { game: 'reflejos', won: true, ms: 260 }, '2026-11-13')
  stats = applyResult(stats, { game: 'reflejos', won: false, ms: 500 }, '2026-11-13')
  stats = applyResult(stats, { game: 'corazones', won: true, score: 24 }, '2026-11-13')
  stats = applyResult(stats, { game: 'corazones', won: false, score: 9 }, '2026-11-13')
  stats = applyResult(stats, { game: 'numero', won: false }, '2026-11-13')
  assert.deepStrictEqual({ played: stats.played, wins: stats.wins, bestReflexMs: stats.bestReflexMs, bestHearts: stats.bestHearts }, { played: 7, wins: 3, bestReflexMs: 260, bestHearts: 24 })
})

test('playing adds a little to the bond: one a game, two a win, ten a day at most', () => {
  let stats = applyResult(undefined, { game: 'ppt', won: false }, '2026-11-13')
  assert.strictEqual(stats.bond, 1)
  stats = applyResult(stats, { game: 'ppt', won: true }, '2026-11-13')
  assert.strictEqual(stats.bond, 3)
  for (let i = 0; i < 30; i++) stats = applyResult(stats, { game: 'ppt', won: true }, '2026-11-13')
  assert.strictEqual(stats.bond, BOND_PER_DAY)
  assert.strictEqual(stats.played, 32)
  // A new day, a new allowance.
  stats = applyResult(stats, { game: 'numero', won: true }, '2026-11-14')
  assert.deepStrictEqual({ bond: stats.bond, bondDay: stats.bondDay, bondToday: stats.bondToday }, { bond: BOND_PER_DAY + 2, bondDay: '2026-11-14', bondToday: 2 })
})

test('she proposes a game once per task that has run over a minute', () => {
  const now = 10_000_000
  const waiting = { now, since: now - PROPOSE_AFTER_MS, proposed: false, last: 0, juegos: 'on', quiet: false, open: false }
  assert.strictEqual(shouldPropose(waiting), true)
  assert.strictEqual(shouldPropose({ ...waiting, juegos: undefined }), true, 'on unless switched off')
  assert.strictEqual(shouldPropose({ ...waiting, since: now - PROPOSE_AFTER_MS + 1 }), false, 'not a long task yet')
  assert.strictEqual(shouldPropose({ ...waiting, since: undefined }), false, 'no task')
  assert.strictEqual(shouldPropose({ ...waiting, proposed: true }), false, 'already asked during this task')
  assert.strictEqual(shouldPropose({ ...waiting, juegos: 'off' }), false)
  assert.strictEqual(shouldPropose({ ...waiting, quiet: true }), false)
  assert.strictEqual(shouldPropose({ ...waiting, open: true }), false, 'already playing')
})

test('and not again within half an hour, even for another task', () => {
  const now = 10_000_000
  const waiting = { now, since: now - 90000, proposed: false, juegos: 'on', quiet: false, open: false }
  assert.strictEqual(shouldPropose({ ...waiting, last: now - PROPOSE_GAP_MS + 1 }), false)
  assert.strictEqual(shouldPropose({ ...waiting, last: now - PROPOSE_GAP_MS }), true)
})

test('the click area of a game is trimmed to her window, and nonsense is refused', () => {
  assert.deepStrictEqual(clickRect({ x: 14.5, y: 330.2, width: 304, height: 215.3 }, 380, 560), { x: 14, y: 330, width: 305, height: 216 })
  assert.deepStrictEqual(clickRect({ x: -20, y: 500, width: 900, height: 900 }, 380, 560), { x: 0, y: 500, width: 380, height: 60 })
  for (const bad of [null, undefined, 'all', {}, { x: 0, y: 0, width: 'wide', height: 10 }, { x: 0, y: 0, width: 0, height: 10 }, { x: 400, y: 0, width: 50, height: 50 }, { x: 0, y: 0, width: NaN, height: 10 }]) {
    assert.strictEqual(clickRect(bad, 380, 560), null, JSON.stringify(bad))
  }
})

test('only the cursor inside the game takes clicks; with no game open nothing does', () => {
  const rect = { x: 14, y: 330, width: 304, height: 216 }
  assert.strictEqual(inRect(rect, 14, 330), true)
  assert.strictEqual(inRect(rect, 317, 545), true)
  assert.strictEqual(inRect(rect, 318, 400), false)
  assert.strictEqual(inRect(rect, 100, 329), false)
  assert.strictEqual(inRect(null, 100, 400), false)
})

// The card and the hearts' field as index.html places them, in window pixels.
function cssBox(html, id) {
  const rule = html.match(new RegExp(`#${id} \\{([^}]*)\\}`))[1]
  const px = side => Number(rule.match(new RegExp(`${side}: (\\d+)px`))?.[1])
  return { left: px('left'), right: px('right'), top: px('top'), bottom: px('bottom') }
}

test('the games sit beside the toolbar, never under it, and inside the window', () => {
  const html = read('index.html')
  const main = read('main.js')
  const width = Number(main.match(/const WIDTH = (\d+)/)[1])
  const tools = toolsRect(TOOL_COUNT, width)
  for (const id of ['gamecard', 'field']) {
    const box = cssBox(html, id)
    assert.ok(box.left >= 0 && width - box.right <= tools.x, `#${id} ends at ${width - box.right}, the toolbar starts at ${tools.x}`)
  }
  for (const id of ['gamecard', 'gametitle', 'gamemenu', 'gameclose', 'gamehow', 'gamebody', 'gamechip', 'field']) assert.match(html, new RegExp(`id="${id}"`), id)
})

test('the app, the page, the plugin and the tests agree on which games exist', async () => {
  const { GAMES: rules } = await import('./games.mjs')
  assert.deepStrictEqual(rules, GAMES)
  const plugin = read('plugin/hooks/register.tsx')
  const alias = Function(`return ${plugin.match(/const PLAY_ALIAS[^=]*= (\{[^}]*\})/)[1]}`)()
  assert.deepStrictEqual([...new Set(Object.values(alias))].sort(), [...GAMES].sort())
  for (const game of GAMES) assert.strictEqual(alias[game], game)
  // /claudia juegos on|off: the same switch in the app and in the plugin.
  for (const source of [read('main.js'), plugin]) assert.match(source, /juegos: \['on', 'off'\]/)
})
