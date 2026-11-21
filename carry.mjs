// Being carried. Her window is moved by your hand (the ✋ button, "move" mode) or by herself (walks,
// glides); either way her body should feel it: she hangs from where she is held and trails behind.
// Pure (no imports, no clock of its own): the avatar calls step() every frame, the tests feed it time.
export const MAX_SWAY = { bust: 0.14, full: 0.3 } // radians; waist-up, her head must stay inside the window
const SWAY_PER_SPEED = 1 / 1400 // radians per px/s of window speed
const LIFT_PER_SPEED = 1 / 2500 // metres per px/s
const MAX_LIFT = 0.05
const SHAKE_SPEED = 400 // px/s: slower than this is not shaking
const SHAKE_FLIPS = 8 // changes of direction...
const SHAKE_WINDOW = 3 // ...in the last seconds of the hold that leave her dizzy

const clamp = (value, low, high) => Math.min(high, Math.max(low, value))
// Frame-rate independent easing, the same curve as THREE.MathUtils.damp.
const damp = (from, to, lambda, dt) => from + (to - from) * (1 - Math.exp(-lambda * dt))

export function createCarry() {
  let velX = 0
  let sway = 0
  let lift = 0
  let wasHeld = false
  let time = 0
  let side = 0
  let flips = []

  // vx, vy: window speed in px/s (screen axes: right and down are positive). held: your hand has her.
  // -> { sway, lift, event }: lean in radians (negative = feet trail to the left), rise in metres, and
  // 'grab' | 'drop' | 'dizzy' on the frame a hold starts or ends (null otherwise).
  function step({ vx = 0, vy = 0, held = false, dt = 0, full = false }) {
    time += dt
    // The window itself only moves every 50 ms, so the smoothing happens here.
    velX = damp(velX, vx, 6, dt)
    const max = full ? MAX_SWAY.full : MAX_SWAY.bust
    sway = damp(sway, clamp(-velX * SWAY_PER_SPEED, -max, max), 4, dt)
    lift = damp(lift, clamp(vy * LIFT_PER_SPEED, -MAX_LIFT, MAX_LIFT), 4, dt)

    let event = null
    if (held && !wasHeld) {
      event = 'grab'
      side = 0
      flips = []
    }
    if (held && Math.abs(velX) > SHAKE_SPEED) {
      const now = Math.sign(velX)
      if (side && now !== side) flips.push(time)
      side = now
    }
    if (!held && wasHeld) {
      const recent = flips.filter(at => time - at <= SHAKE_WINDOW).length
      event = recent >= SHAKE_FLIPS ? 'dizzy' : 'drop'
    }
    wasHeld = Boolean(held)
    return { sway, lift, event }
  }

  return { step }
}
