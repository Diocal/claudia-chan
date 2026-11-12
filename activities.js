import * as THREE from 'three'

// Whole-body activities: what she is doing while Claude works (or while nothing happens).
// Each one returns target rotations [x, y, z] per bone at time t; the avatar eases toward them.
// Arms: upperArm z ±1.2 is "down", x < 0 brings the arm forward; lowerArm y bends the elbow.
const s = Math.sin

export const REST = {
  leftUpperLeg: [0, 0, 0], rightUpperLeg: [0, 0, 0], leftLowerLeg: [0, 0, 0], rightLowerLeg: [0, 0, 0],
  leftUpperArm: [0, 0, -1.2], rightUpperArm: [0, 0, 1.2],
  leftLowerArm: [0, -0.2, 0], rightLowerArm: [0, 0.2, 0],
  leftHand: [0, 0, 0], rightHand: [0, 0, 0],
  spine: [0, 0, 0], neck: [0, 0, 0], head: [0, 0, 0],
}

// Right-arm rotations; the left arm mirrors them (y and z flip). Measured on the models:
// upperArm y brings the arm forward, z lowers it (1.2 = hanging), x only twists it;
// lowerArm y bends the elbow; with the upper arm twisted (x -1.5) that bend points up.
// Legs: upperLeg x < 0 swings the leg forward, lowerLeg x > 0 bends the knee (shin back).
const arms = (upper, lower, hand = [0, 0, 0], leftHand = hand) => ({
  rightUpperArm: upper, rightLowerArm: lower, rightHand: hand,
  leftUpperArm: [upper[0], -upper[1], -upper[2]], leftLowerArm: [lower[0], -lower[1], -lower[2]], leftHand: [leftHand[0], -leftHand[1], -leftHand[2]],
})

export const ACTIVITIES = {
  idle: () => ({}),
  // Dev only: dev/poses.html?act=custom&pose={...} tries bone rotations by hand.
  custom: () => globalThis.customPose ?? {},
  // At the laptop, typing: forearms forward over the keys, wrists tapping, eyes on the screen.
  typing: t => ({
    ...arms([0, 0.55, 1.12], [0, 1.55, 0], [0, 0, s(t * 17) * 0.18], [0, 0, s(t * 19 + 1) * 0.18]),
    head: [0.22, s(t * 0.9) * 0.08, 0], spine: [0.06, 0, 0],
    laptop: true,
  }),
  // Reading the screen, chin on her right hand, left hand on the trackpad.
  reading: t => {
    const both = arms([0, 0.55, 1.12], [0, 1.55, 0])
    return {
      ...both, rightUpperArm: [0, 0.95, 0.85], rightLowerArm: [0, 2.45, 0], rightHand: [0, 0, -0.3],
      head: [0.16, s(t * 0.6) * 0.1, -0.1], spine: [0.05, 0, 0],
      laptop: true,
    }
  },
  // Waiting on a command or tests: hands clasped at her chest, bouncing on her toes.
  nervous: t => ({
    ...arms([0, 0.75, 1.05], [0, 2.15, 0]),
    head: [0.05, s(t * 3) * 0.12, s(t * 2.3) * 0.05], spine: [0, 0, s(t * 6) * 0.02],
    bounce: Math.abs(s(t * 6)) * 0.015,
  }),
  // It worked: both arms up, jumping.
  celebrate: t => ({
    ...arms([0, 0, -1.15 - s(t * 10) * 0.12], [0, 0.3, 0]),
    head: [-0.12, 0, s(t * 5) * 0.08], bounce: Math.abs(s(t * 7)) * 0.06,
  }),
  // It broke: hands on her head.
  facepalm: t => ({
    ...arms([-1.5, 0.3, 0.2], [0, 2.4, 0]),
    head: [0.2, s(t * 2.5) * 0.15, 0], spine: [0.08, 0, 0],
  }),
  // Jealous: arms crossed, chin up, looking away.
  pout: t => ({
    ...arms([0, 0.75, 1.18], [0, 2.4, 0]),
    head: [-0.1, 0.42, 0.06 + s(t * 1.2) * 0.03], spine: [0, 0.12, 0],
  }),
  // Hello: right hand waving, the left one at rest.
  wave: t => ({
    rightUpperArm: [-1.5 + s(t * 9) * 0.35, 0, 0.2], rightLowerArm: [0, 1.6, 0],
    head: [0, -0.1, 0.1],
  }),
  // A stretch: arms up, leaning back.
  stretch: t => ({
    ...arms([0, 0, -1.35], [0, 0.9, 0]),
    head: [-0.25, 0, 0], spine: [-0.12, 0, s(t * 1.5) * 0.06],
  }),
  // Bored: scrolling her phone at chest height.
  phone: t => ({
    rightUpperArm: [0, 0.7, 1.0], rightLowerArm: [0, 2.15, 0], rightHand: [0, 0, s(t * 4) * 0.05],
    head: [0.3, -0.12, 0], phone: true,
  }),
  // Listening to the user: leaning in, nodding now and then.
  listening: t => ({
    head: [0.06 + Math.max(0, s(t * 2.2)) * 0.08, 0, 0.1], spine: [0.08, 0, 0],
  }),
  // Walking across the screen: legs and arms in step, turned three-quarters toward where she goes.
  walk: (t, dir = 1) => {
    const p = t * 7.5
    const swing = s(p)
    return {
      rightUpperLeg: [-0.45 * swing, 0, 0], leftUpperLeg: [0.45 * swing, 0, 0],
      rightLowerLeg: [0.15 + 0.7 * Math.max(0, s(p - 1.6)), 0, 0], leftLowerLeg: [0.15 + 0.7 * Math.max(0, -s(p - 1.6)), 0, 0],
      ...arms([0, -0.35 * swing, 1.22], [0, 0.35, 0]),
      leftUpperArm: [0, -0.35 * swing, -1.22],
      head: [0, -dir * 0.5, 0], spine: [0.04, 0, 0],
      bounce: Math.abs(swing) * 0.025,
      turn: dir * 1.1,
    }
  },
  // Sitting on the top edge of a window, legs dangling and kicking a little.
  sit: t => ({
    rightUpperLeg: [-1.5, 0, -0.06], leftUpperLeg: [-1.5, 0, 0.06],
    rightLowerLeg: [1.35 + s(t * 2.1) * 0.22, 0, 0], leftLowerLeg: [1.35 + s(t * 2.1 + 2) * 0.22, 0, 0],
    ...arms([0, 0.35, 1.3], [0, 0.4, 0]),
    head: [0.04, 0, s(t * 0.8) * 0.06],
    bounce: -0.42,
  }),
  // Blowing him a kiss, once: fingers to her lips, then the hand opens toward him (send it for ~1.8 s).
  // `since` is the time since the activity started.
  kiss: (t, _arg, since = 0) => {
    const toLips = since < 0.9
    return {
      rightUpperArm: toLips ? [-1.5, 0.8, 0.8] : [-1.5, 0.6, 0.55], rightLowerArm: toLips ? [0, 2.4, 0] : [0, 0.55, 0],
      rightHand: toLips ? [0, 0, -0.2] : [0, 0, 0.3],
      head: [toLips ? 0.05 : -0.08, 0, toLips ? 0.08 : -0.06], spine: [toLips ? 0.03 : -0.04, 0, 0],
      kiss: !toLips,
    }
  },
  // Dancing, three styles (arg 0, 1, 2), in the full-body view.
  dance: (t, style = 0) => {
    const b = t * 4.2 // beat
    if (style === 1) {
      // Wiggle: hands on her hips, hips and shoulders swaying, little knee bounces.
      return {
        ...arms([0, -0.35, 0.85], [0, 1.9, 0]),
        spine: [0, s(b) * 0.12, s(b) * 0.1], head: [0, -s(b) * 0.15, -s(b) * 0.12],
        rightUpperLeg: [-0.15 - 0.15 * Math.max(0, s(b)), 0, 0], leftUpperLeg: [-0.15 - 0.15 * Math.max(0, -s(b)), 0, 0],
        rightLowerLeg: [0.3 * Math.max(0, s(b)), 0, 0], leftLowerLeg: [0.3 * Math.max(0, -s(b)), 0, 0],
        bounce: Math.abs(s(b)) * 0.03, turn: s(b * 0.5) * 0.35, snappy: true,
      }
    }
    if (style === 2) {
      // A spin with her arms open, then a pose.
      const spin = (t * 0.8) % 2
      return {
        ...arms([0, 0.2, 0.35 + s(b) * 0.1], [0, 0.3, 0]),
        head: [-0.08, 0, s(b) * 0.1], spine: [0, 0, s(b) * 0.05],
        bounce: Math.abs(s(b)) * 0.025,
        turn: spin < 1 ? spin * Math.PI * 2 : 0, snappy: true,
      }
    }
    // Idol: arms pumping up in turns, side steps, head bobbing to the beat.
    const up = s(b)
    return {
      rightUpperArm: [0, 0.25, 0.2 - 1.15 * up], rightLowerArm: [0, 0.9 + 0.6 * up, 0],
      leftUpperArm: [0, -0.25, -(0.2 + 1.15 * up)], leftLowerArm: [0, -(0.9 - 0.6 * up), 0],
      rightUpperLeg: [-0.3 * Math.max(0, up), 0, -0.1 * up], leftUpperLeg: [-0.3 * Math.max(0, -up), 0, -0.1 * up],
      rightLowerLeg: [0.5 * Math.max(0, up), 0, 0], leftLowerLeg: [0.5 * Math.max(0, -up), 0, 0],
      head: [s(b * 2) * 0.08, 0, up * 0.12], spine: [0, up * 0.1, up * 0.06],
      bounce: Math.abs(s(b * 2)) * 0.035, snappy: true,
    }
  },
  // Late at night: head drooping.
  sleepy: t => ({
    head: [0.35 + s(t * 0.8) * 0.06, 0, 0.18], spine: [0.1, 0, 0],
  }),
}

// A laptop floating at her chest, the screen glowing; and a phone in her right hand.
export function makeProps() {
  const laptop = new THREE.Group()
  const shell = new THREE.MeshToonMaterial({ color: 0xb8a6e6 })
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.012, 0.2), shell)
  // The lid stands on the far side, toward the viewer: the screen faces her, the viewer sees its back.
  const lid = new THREE.Group()
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.17, 0.01), shell)
  const canvas = Object.assign(document.createElement('canvas'), { width: 256, height: 160 })
  const texture = new THREE.CanvasTexture(canvas)
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.27, 0.15), new THREE.MeshBasicMaterial({ map: texture }))
  const sticker = new THREE.Mesh(new THREE.CircleGeometry(0.025, 24), new THREE.MeshBasicMaterial({ color: 0xff5fa2 }))
  back.position.y = 0.085
  screen.position.set(0, 0.085, -0.0055)
  screen.rotation.y = Math.PI
  sticker.position.set(0, 0.09, 0.0056)
  lid.add(back, screen, sticker)
  lid.position.z = 0.095
  lid.rotation.x = 0.35
  laptop.add(base, lid)
  laptop.position.set(0, 1.0, 0.3)
  // The screen's glow on her face.
  const glow = new THREE.PointLight(0x9fd8ff, 0.12, 0.5)
  glow.position.set(0, 0.16, 0.05)
  laptop.add(glow)

  const ctx = canvas.getContext('2d')
  let line = 0
  const drawScreen = t => {
    ctx.fillStyle = '#1b1530'
    ctx.fillRect(0, 0, 256, 160)
    const colors = ['#ff7eb6', '#7ee0ff', '#c3a6ff', '#9dffb0']
    for (let i = 0; i < 9; i++) {
      const n = (line + i) % 23
      ctx.fillStyle = colors[n % colors.length]
      ctx.fillRect(14 + (n % 4) * 12, 12 + i * 16, 40 + ((n * 37) % 150), 7)
    }
    if (Math.floor(t * 6) % 2 === 0) line = (line + 1) % 23
    texture.needsUpdate = true
  }

  const phone = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.008), new THREE.MeshToonMaterial({ color: 0xff8fc0 }))
  return { laptop, phone, drawScreen }
}
