// "No molestar": for a while she makes no remarks, no sounds and reads nothing aloud. Kept apart from
// main.js so the rules about time can be tested without Electron. config.quietUntil is when it ends
// (epoch ms); 0 or absent means she is not in quiet mode.
const MAX_MINUTES = 480 // eight hours: a forgotten "forever" would make her look broken

// 0 turns it off; anything else is a whole number of minutes up to the limit.
const validMinutes = n => Number.isInteger(n) && n >= 0 && n <= MAX_MINUTES

const untilFor = (minutes, now) => now + minutes * 60000

// A quietUntil that already passed counts as off even before anybody clears it.
const isQuietAt = (config, now) => Number(config?.quietUntil) > now

// When it ends, for the tray and the panel: "17:05".
function clockTime(at) {
  const date = new Date(at)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

module.exports = { MAX_MINUTES, validMinutes, untilFor, isQuietAt, clockTime }
