// The rules of her mini-games, with no page and no clock of their own: play.js draws them on her
// window and feeds them clicks and elapsed time, and the tests play them with a fixed `random`.
export const GAMES = ['ppt', 'corazones', 'reflejos', 'numero']

const pickFrom = (list, random) => list[Math.min(list.length - 1, Math.floor(random() * list.length))]
const mix = (from, to, k) => from + (to - from) * Math.min(1, Math.max(0, k))

// --- Piedra, papel o tijera: the same table as the plugin's /claudia ppt (games.test.mjs compares them).
export const HANDS = ['piedra', 'papel', 'tijera']
export const BEATS = { piedra: 'tijera', papel: 'piedra', tijera: 'papel' }
export const pickHand = (random = Math.random) => pickFrom(HANDS, random)

// From the player's side: 'win', 'lose' or 'tie'.
export function rps(mine, hers) {
  if (mine === hers) return 'tie'
  return BEATS[mine] === hers ? 'win' : 'lose'
}

// --- Atrapa los corazones: for 30 s she tosses hearts (1 point) and a few stars (3). Catching without
// letting one fade builds a combo; from the fifth in a row every catch is worth one more.
export const HEARTS = { seconds: 30, goal: 20, star: 3, streak: 5, slump: 3 }

export function createHearts(random = Math.random) {
  const live = new Map()
  let next = 0.6
  let lastId = 0
  let score = 0
  let combo = 0
  let bestCombo = 0
  let missed = 0

  return {
    // What she tosses now, `t` seconds in. x and y are 0..1 of the play field, dx and dy how far each
    // one drifts (also in field units), `life` how many seconds it stays. Faster and shorter-lived
    // toward the end.
    toss(t) {
      const tossed = []
      while (next <= t && next < HEARTS.seconds) {
        const k = next / HEARTS.seconds
        const item = {
          id: ++lastId,
          kind: random() < 0.15 ? 'star' : 'heart',
          x: random(),
          y: random(),
          dx: (random() - 0.5) * 0.5,
          dy: -0.1 - random() * 0.25,
          life: mix(2.4, 1.5, k),
        }
        live.set(item.id, item)
        tossed.push(item)
        next += mix(0.85, 0.45, k) * (0.7 + random() * 0.6)
      }
      return tossed
    },
    // A click on one. Null if it was already gone. `event` is 'streak' at every fifth in a row.
    grab(id) {
      const item = live.get(id)
      if (!item) return null
      live.delete(id)
      combo += 1
      missed = 0
      bestCombo = Math.max(bestCombo, combo)
      const points = (item.kind === 'star' ? HEARTS.star : 1) + (combo >= HEARTS.streak ? 1 : 0)
      score += points
      return { points, score, combo, event: combo % HEARTS.streak === 0 ? 'streak' : null }
    },
    // One faded unclicked. `event`: 'miss' when it broke a run of three or more, 'slump' at the third
    // lost in a row; otherwise she lets it pass without a word.
    fade(id) {
      if (!live.delete(id)) return null
      const broken = combo
      combo = 0
      missed += 1
      return { score, combo, event: broken >= 3 ? 'miss' : missed === HEARTS.slump ? 'slump' : null }
    },
    isOver: t => t >= HEARTS.seconds,
    result: () => ({ score, bestCombo, won: score >= HEARTS.goal }),
  }
}

// --- Reflejos: "espera…", then "¡ya!" after a wait nobody can guess. Under 100 ms is not a reflex,
// it is a guess: that counts as clicking early.
export const REFLEX = { minWait: 1.5, maxWait: 4.5, tooSoon: 100, fast: 280, ok: 450 }
export const reflexWait = (random = Math.random) => mix(REFLEX.minWait, REFLEX.maxWait, random())

export function reflexVerdict(ms) {
  if (!Number.isFinite(ms) || ms < REFLEX.tooSoon) return 'early'
  return ms <= REFLEX.fast ? 'fast' : ms <= REFLEX.ok ? 'ok' : 'slow'
}

// --- Adivina el número: 1 to 20 with higher/lower hints. Halving the range always finds it in five,
// so five or fewer is a win; three or fewer and she pouts; more than five and she gloats.
export const NUMBER = { max: 20, quick: 3, fair: 5 }
export const guessVerdict = tries => (tries <= NUMBER.quick ? 'quick' : tries <= NUMBER.fair ? 'fair' : 'slow')

export function createGuess(random = Math.random) {
  const secret = 1 + Math.min(NUMBER.max - 1, Math.floor(random() * NUMBER.max))
  let low = 1
  let high = NUMBER.max
  let tries = 0
  let isDone = false

  return {
    // Null for a number that is already ruled out (or after the end): it does not cost a try.
    guess(n) {
      if (isDone || !Number.isInteger(n) || n < low || n > high) return null
      tries += 1
      if (n === secret) {
        isDone = true
        return { hint: 'right', tries, low: n, high: n, verdict: guessVerdict(tries), won: tries <= NUMBER.fair }
      }
      if (secret > n) low = n + 1
      else high = n - 1
      return { hint: secret > n ? 'higher' : 'lower', tries, low, high }
    },
  }
}

// --- What she says. i18n.json games.<game>.<name> is a line or a list of lines; `{n}` and friends are
// filled from `values`. Results also have a few lines flavoured by her personality
// (games.flavor.<personalidad>.won / .lost, "won" being the player's win), used now and then.
const FLAVOUR = {
  'ppt.win': 'won', 'reflex.fast': 'won', 'number.quick': 'won',
  'ppt.lose': 'lost', 'reflex.slow': 'lost', 'number.slow': 'lost',
}
const FLAVOUR_CHANCE = 0.4

export function gameLine(texts, key, { personalidad, values = {} } = {}, random = Math.random) {
  const [game, name] = key.split('.')
  const flavoured = texts?.flavor?.[personalidad]?.[FLAVOUR[key]]
  const own = texts?.[game]?.[name]
  const lines = [].concat(flavoured && random() < FLAVOUR_CHANCE ? flavoured : own ?? [])
  if (!lines.length) return ''
  return pickFrom(lines, random).replace(/\{(\w+)\}/g, (_, value) => values[value] ?? '')
}
