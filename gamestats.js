// What main.js keeps about her games (games.mjs has the rules, play.js draws them): the results in
// config.games, when she may propose a game, and which part of her window takes clicks while one is open.
const GAMES = ['ppt', 'corazones', 'reflejos', 'numero']
// Playing with her counts toward the bond like petting does: one point a game, two for a win, and no
// more than this many a day, so the level is not something to grind by clicking.
const BOND_PER_DAY = 10
const PROPOSE_AFTER_MS = 60000 // Claude has been working this long: the wait is worth a game
const PROPOSE_GAP_MS = 30 * 60000 // and she does not ask again for this long

const count = n => (Number.isInteger(n) && n >= 0 ? n : 0)

// A clean copy of config.games, whatever a hand edit left there.
function valid(stats) {
  const s = stats && typeof stats === 'object' ? stats : {}
  return {
    played: count(s.played),
    wins: count(s.wins),
    bestReflexMs: Number.isInteger(s.bestReflexMs) && s.bestReflexMs > 0 ? s.bestReflexMs : null,
    bestHearts: count(s.bestHearts),
    bond: count(s.bond),
    bondDay: typeof s.bondDay === 'string' ? s.bondDay : '',
    bondToday: count(s.bondToday),
  }
}

// What the page reports when a game ends: { game, won, score?, ms? }. Null if it is not that.
function validResult(result) {
  if (!result || typeof result !== 'object' || !GAMES.includes(result.game) || typeof result.won !== 'boolean') return null
  const clean = { game: result.game, won: result.won }
  if (result.game === 'corazones') {
    if (!Number.isInteger(result.score) || result.score < 0 || result.score > 999) return null
    clean.score = result.score
  }
  if (result.game === 'reflejos') {
    if (!Number.isInteger(result.ms) || result.ms < 1 || result.ms > 60000) return null
    clean.ms = result.ms
  }
  return clean
}

// The stats after one finished game. `today` is a local 'YYYY-MM-DD', for the daily bond limit.
function applyResult(stats, result, today) {
  const s = valid(stats)
  const earnedToday = s.bondDay === today ? s.bondToday : 0
  const earned = Math.min(result.won ? 2 : 1, BOND_PER_DAY - earnedToday)
  return {
    played: s.played + 1,
    wins: s.wins + (result.won ? 1 : 0),
    bestReflexMs: result.game === 'reflejos' && (s.bestReflexMs === null || result.ms < s.bestReflexMs) ? result.ms : s.bestReflexMs,
    bestHearts: result.game === 'corazones' ? Math.max(s.bestHearts, result.score) : s.bestHearts,
    bond: s.bond + earned,
    bondDay: today,
    bondToday: earnedToday + earned,
  }
}

// "¿Jugamos mientras esperas?": once per task that has run over a minute, when the cursor comes near
// her, never in quiet mode or with a game already open, and at most every half hour.
function shouldPropose({ now, since, proposed, last, juegos, quiet, open }) {
  if (juegos === 'off' || quiet || open || proposed) return false
  if (!Number.isFinite(since) || now - since < PROPOSE_AFTER_MS) return false
  return !last || now - last >= PROPOSE_GAP_MS
}

// The rectangle of her window (in window pixels) the page asks to take clicks for an open game,
// trimmed to the window. Null if it is not a rectangle inside it.
function clickRect(data, width, height) {
  if (!data || typeof data !== 'object' || ![data.x, data.y, data.width, data.height].every(Number.isFinite)) return null
  const x = Math.max(0, Math.floor(data.x))
  const y = Math.max(0, Math.floor(data.y))
  const right = Math.min(width, Math.ceil(data.x + data.width))
  const bottom = Math.min(height, Math.ceil(data.y + data.height))
  if (right <= x || bottom <= y) return null
  return { x, y, width: right - x, height: bottom - y }
}

const inRect = (rect, x, y) => Boolean(rect) && x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height

module.exports = { GAMES, BOND_PER_DAY, PROPOSE_AFTER_MS, PROPOSE_GAP_MS, valid, validResult, applyResult, shouldPropose, clickRect, inRect }
