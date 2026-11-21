// What she does when nothing has happened for a while. A fixed timer and a coin flip made her loop
// (stretch, phone, stretch...); here the hour sets her energy and she never does the same thing twice in a row.
// Pure (no imports, no clock): the avatar passes the hour, the tests pass their own.
const SECONDS = { stretch: 3, phone: 8, lookAround: 4, sway: 5, yawn: 2.8 }
const SLEEPY = [20, 40] // a nap is the only one whose length varies
const DROWSY = 0.25 // below this energy she may nod off

// How awake she is at each hour, 0..1: asleep on her feet before dawn, at her best mid-morning.
export function energy(hour) {
  if (hour < 6) return 0.2
  if (hour < 9) return 0.8
  if (hour < 12) return 0.9
  if (hour < 19) return 0.7
  if (hour < 21) return 0.55
  if (hour < 23) return 0.45
  return 0.3
}

// Each personality leans its own way; the ones not listed keep the plain weights. A missing entry is 1.
export const TEMPER = {
  genki: { stretch: 1.6, sway: 3, phone: 0.5, yawn: 0.4 }, // cannot stand still
  dandere: { lookAround: 2, phone: 1.5, sway: 0.3 }, // keeps to herself
  himedere: { phone: 0.5, sway: 1.5, yawn: 1.5 }, // bored royalty, and it shows
  gamer: { phone: 3, stretch: 0.7 }, // one more round on the phone
  chuunibyou: { lookAround: 2.5, stretch: 1.3 }, // senses presences everywhere
}

// `firstMorning`: her first idle moment of this run falls between 06 and 10, so she most likely stretches awake.
// `quiet` (quiet mode): only what does not ask for attention.
function plainWeights({ hour, quiet, firstMorning }) {
  if (quiet) return { phone: 1, lookAround: 1.5 }
  const awake = energy(hour)
  return {
    stretch: 2 * awake * (firstMorning ? 3 : 1),
    phone: 1,
    lookAround: 1.5,
    sway: 1,
    yawn: 3 * (1 - awake),
    ...(awake < DROWSY ? { sleepy: 2 } : {}),
  }
}

// Her personality scales what is already possible at this hour; it never adds an option (quiet mode stays quiet).
function weights({ personalidad, ...moment }) {
  const lean = TEMPER[personalidad] ?? {}
  return Object.fromEntries(Object.entries(plainWeights(moment)).map(([name, weight]) => [name, weight * (lean[name] ?? 1)]))
}

// -> { name, seconds }, never `last` again.
export function pickIdle({ hour = 12, last, quiet = false, firstMorning = false, personalidad } = {}, random = Math.random) {
  const options = Object.entries(weights({ hour, quiet, firstMorning, personalidad })).filter(([name]) => name !== last)
  const total = options.reduce((sum, [, weight]) => sum + weight, 0)
  let roll = random() * total
  let name = options[options.length - 1][0]
  for (const [option, weight] of options) {
    roll -= weight
    if (roll < 0) { name = option; break }
  }
  const seconds = name === 'sleepy' ? SLEEPY[0] + random() * (SLEEPY[1] - SLEEPY[0]) : SECONDS[name]
  return { name, seconds }
}
