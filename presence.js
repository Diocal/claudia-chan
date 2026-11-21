// Whether the user is at the computer, from one number only: how many seconds since the keyboard or the
// mouse were last touched. Nothing about the screen or other apps is read. Kept apart from main.js so
// the rules about time can be tested without Electron.
const BACK_BELOW = 5 // seconds: an idle counter this low means somebody just touched something

function createPresence({ drowsyAfter = 300, asleepAfter = 540 } = {}) {
  let asleepAt = null
  let wasDrowsy = false
  // When the absence began, so waking can say how long it lasted (not only the part spent asleep).
  let leftAt = null

  const sleep = now => {
    asleepAt = now
    return { event: 'sleep' }
  }

  const wake = now => {
    const awayMs = now - (leftAt ?? asleepAt)
    asleepAt = null
    leftAt = null
    wasDrowsy = false
    return { event: 'wake', awayMs }
  }

  return {
    isAsleep: () => asleepAt !== null,
    // `idle` in seconds, `now` in epoch ms. Answers null, or the one thing that just changed.
    step(idle, now) {
      if (asleepAt !== null) return idle < BACK_BELOW ? wake(now) : null
      if (idle < drowsyAfter) {
        // Back before she fell asleep: the next absence gets its own yawn.
        wasDrowsy = false
        leftAt = null
        return null
      }
      leftAt ??= now - idle * 1000
      if (idle >= asleepAfter) return sleep(now)
      if (wasDrowsy) return null
      wasDrowsy = true
      return { event: 'drowsy' }
    },
    // The computer was suspended or locked: nobody is there, whatever the counter says.
    sleepNow(now) {
      if (asleepAt !== null) return null
      leftAt ??= now
      return sleep(now)
    },
    // Resumed or unlocked: somebody is there again.
    wakeNow(now) {
      return asleepAt === null ? null : wake(now)
    },
  }
}

module.exports = { createPresence }
