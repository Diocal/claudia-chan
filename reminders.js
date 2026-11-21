// "Recuérdame en 20 minutos…": the list of things she promised to say, and when. Kept apart from
// main.js so the rules about time can be tested without Electron. An item is { id, text, due }, with
// `due` in epoch ms; the list lives in reminders.json (main.js) so it survives a restart.
const MAX_MINUTES = 10080 // a week: further away than that belongs in a calendar
const MAX_ITEMS = 20
const MAX_TEXT = 200
const ON_TIME_MS = 2 * 60000 // later than this she apologises for being late
const EXPIRED_MS = 24 * 3600000 // older than a day it is no longer news: dropped without a word
const SOON_MS = 3 * 3600000 // she stays alive, hidden, for a reminder this close
const CLOCK = /^([01]?\d|2[0-3]):([0-5]\d)$/
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/

// `at` on a given local day ("2026-11-14"): null when that is not a real day, already past or
// more than a week away. Without it "tomorrow at 9" asked at 8 would ring today.
function onDay(day, clock, now) {
  const [, year, month, dayOfMonth] = typeof day === 'string' ? day.trim().match(DAY) ?? [] : []
  if (!year) return null
  const date = new Date(Number(year), Number(month) - 1, Number(dayOfMonth), Number(clock[1]), Number(clock[2]), 0, 0)
  // 31 February rolls into March: not what was asked.
  if (date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(dayOfMonth)) return null
  return date.getTime() > now && date.getTime() <= now + MAX_MINUTES * 60000 ? date.getTime() : null
}

// When to speak: `minutes` from now, or the next time the local clock reads `at` ("17:30"), or `at`
// on the day `date` names. null when none is usable. `minutes` wins if both are given.
function parseDue({ minutes, at, date: day } = {}, now) {
  if (minutes !== undefined && minutes !== null) {
    return Number.isInteger(minutes) && minutes >= 1 && minutes <= MAX_MINUTES ? now + minutes * 60000 : null
  }
  const clock = typeof at === 'string' ? at.trim().match(CLOCK) : null
  if (!clock) return null
  if (day !== undefined && day !== null) return onDay(day, clock, now)

  const date = new Date(now)
  date.setHours(Number(clock[1]), Number(clock[2]), 0, 0)
  // Already past today: tomorrow (setDate, not +24 h, so a daylight-saving night keeps the clock time).
  if (date.getTime() <= now) date.setDate(date.getDate() + 1)
  return date.getTime()
}

// A new list with the item added, kept in the order they fall due; null when the text is empty, the
// time is not a time or the list is full.
function add(list, { text, due } = {}) {
  const clean = typeof text === 'string' ? text.trim().slice(0, MAX_TEXT).trim() : ''
  if (!clean || !Number.isFinite(due) || list.length >= MAX_ITEMS) return null

  const item = { id: list.reduce((top, each) => Math.max(top, each.id), 0) + 1, text: clean, due }
  return { list: [...list, item].sort((a, b) => a.due - b.due), item }
}

// What to do with each item now: say it, say it with an apology, forget it, or keep waiting.
function split(list, now) {
  const parts = { due: [], late: [], expired: [], rest: [] }
  for (const item of list) {
    const over = now - item.due
    parts[over < 0 ? 'rest' : over < ON_TIME_MS ? 'due' : over <= EXPIRED_MS ? 'late' : 'expired'].push(item)
  }
  return parts
}

// Whether something falls due within `ms` (overdue counts: it is about to be said).
const soon = (list, now, ms = SOON_MS) => list.some(item => item.due - now <= ms)

// What survives a trip through the file: a hand-edited or broken file must not crash the clock.
const valid = list => (Array.isArray(list) ? list : []).filter(item => item && Number.isInteger(item.id) && typeof item.text === 'string' && Number.isFinite(item.due))

module.exports = { MAX_MINUTES, MAX_ITEMS, MAX_TEXT, SOON_MS, parseDue, add, split, soon, valid }
