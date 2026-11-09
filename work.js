// Tracks continuous work from the user's own prompts, across every session.
const GAP_MS = 15 * 60000
const DAY = { after: 90, repeat: 45 }
const NIGHT = { after: 30, repeat: 30 }
const HOURS_REPEAT_MS = 30 * 60000

// A range such as 22-6 runs across midnight.
function isWithinHours(hour, { from, to }) {
  return from < to ? hour >= from && hour < to : hour >= from || hour < to
}

function createWorkTracker(saved = {}) {
  let startedAt = saved.startedAt ?? null
  let lastActivity = saved.lastActivity ?? null
  let lastWarned = saved.lastWarned ?? null
  let lastHoursWarned = saved.lastHoursWarned ?? null

  const snapshot = () => ({ startedAt, lastActivity, lastWarned, lastHoursWarned })

  return {
    snapshot,
    activity(now) {
      if (lastActivity === null || now - lastActivity > GAP_MS) {
        startedAt = now
        lastWarned = null
      }
      lastActivity = now
    },
    // True when the user is still working outside the hours they set.
    checkHours(now, hour, hours) {
      const isActive = lastActivity !== null && now - lastActivity <= GAP_MS
      if (!hours || !isActive || isWithinHours(hour, hours)) return false
      if (lastHoursWarned !== null && now - lastHoursWarned < HOURS_REPEAT_MS) return false

      lastHoursWarned = now
      return true
    },
    // Answers { minutes, isLate } when it is time to warn, otherwise null.
    check(now, hour) {
      if (lastActivity === null || now - lastActivity > GAP_MS) return null

      const isLate = hour < 5
      const limits = isLate ? NIGHT : DAY
      const minutes = Math.round((now - startedAt) / 60000)
      if (minutes < limits.after) return null
      if (lastWarned !== null && now - lastWarned < limits.repeat * 60000) return null

      lastWarned = now
      return { minutes, isLate }
    },
  }
}

module.exports = { createWorkTracker }
