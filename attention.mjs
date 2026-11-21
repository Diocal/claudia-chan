// Where her eyes go. A person does not track one point all day: she follows your cursor, looks up at
// you when it stops or when she speaks, and keeps her eyes on her work while she works.
// Pure (no imports, no clock of its own): the avatar calls step() every frame, the tests feed it time.
const STILL_WAIT = [4, 9] // seconds of a still cursor before she looks up at you
const EYE_CONTACT = [2, 4] // seconds she holds your eyes, short enough never to become a stare
const NEAR_GLANCE = 1 // seconds she looks up from her work when your cursor arrives
const SHY_AWAY = 1.2 // seconds a shy girl looks away when your cursor arrives, before she peeks back

export function createAttention(random = Math.random) {
  const between = ([low, high]) => low + random() * (high - low)
  let stillSince = null
  let wait = between(STILL_WAIT)
  let contactUntil = 0
  let wasNear = false
  let nearAt = -Infinity

  // The wait for eye contact starts over: after a movement, a glance, or anything else that took her eyes.
  function restart(t) {
    stillSince = t
    wait = between(STILL_WAIT)
    contactUntil = 0
  }

  // -> 'cursor' | 'user' | 'work' | 'away' (`shy` only: the dandere's first look is to the side)
  function step({ t, cursorMoved, speaking, working, near, petting, reacting, fixed, shy }) {
    if (stillSince === null) stillSince = t
    if (near && !wasNear) nearAt = t
    wasNear = Boolean(near)
    if (cursorMoved) restart(t)

    // The yandere stare is deliberate: it never leaves the cursor.
    if (fixed) return 'cursor'
    // Petted or mid-reaction, the gesture is aimed at your hand.
    if (petting || reacting) { restart(t); return 'cursor' }
    if (speaking) { restart(t); return 'user' }
    if (working) {
      restart(t)
      return t - nearAt < NEAR_GLANCE ? 'cursor' : 'work'
    }
    // Shy: your cursor arriving makes her look away first; after that she peeks at it like anyone else.
    if (shy && t - nearAt < SHY_AWAY) { restart(t); return 'away' }

    if (contactUntil) {
      if (t < contactUntil) return 'user'
      restart(t)
      return 'cursor'
    }
    if (t - stillSince < wait) return 'cursor'
    contactUntil = t + between(EYE_CONTACT)
    return 'user'
  }

  return { step }
}
