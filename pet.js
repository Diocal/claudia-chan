// A pet is the cursor rubbing side to side over her head: no click, so the
// window can stay click-through.
const HEAD = { left: 90, right: 290, top: 60, bottom: 300 }
const WINDOW_MS = 1500
const MIN_STEP = 6
const TURNS_NEEDED = 4
const COOLDOWN_MS = 1200

function createPetDetector() {
  let lastX = null
  let direction = 0
  let turns = []
  let lastPet = -Infinity

  return (x, y, now) => {
    const isOver = x >= HEAD.left && x <= HEAD.right && y >= HEAD.top && y <= HEAD.bottom
    if (!isOver) {
      lastX = null
      direction = 0
      turns = []
      return false
    }
    if (lastX === null) {
      lastX = x
      return false
    }
    const step = x - lastX
    if (Math.abs(step) < MIN_STEP) return false
    lastX = x

    const next = Math.sign(step)
    if (direction !== 0 && next !== direction) turns.push(now)
    direction = next
    turns = turns.filter(at => now - at <= WINDOW_MS)

    if (turns.length >= TURNS_NEEDED && now - lastPet > COOLDOWN_MS) {
      lastPet = now
      turns = []
      return true
    }
    return false
  }
}

module.exports = { createPetDetector }
