import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm'
import { playSound, playSpeech, setMuted } from '/sounds.js'
import { ACTIVITIES, REST, makeProps } from '/activities.js'

// Brief expressions layered over the lasting mood.
const REACTIONS = {
  feliz: { expr: { happy: 1 } },
  triste: { expr: { sad: 1 }, nod: 0.12 },
  sorprendida: { expr: { surprised: 1 }, nod: -0.08 },
  enojada: { expr: { angry: 1 }, nod: 0.06 },
  pensando: { expr: { relaxed: 0.35 }, tilt: 0.13, nod: -0.12 },
  concentrada: { expr: { angry: 0.25 }, nod: 0.08 },
  guino: { expr: { happy: 0.7, blinkLeft: 1 }, tilt: -0.1 },
  sonrojada: { expr: { happy: 0.5, surprised: 0.25 }, tilt: 0.08, nod: 0.1, isBlushing: true },
  cansada: { expr: { relaxed: 0.5, sad: 0.5, blink: 0.55 }, nod: 0.16, tilt: -0.06 },
  preocupada: { expr: { sad: 0.6, surprised: 0.3 }, tilt: 0.06 },
  descansa: { expr: { sad: 0.45, angry: 0.3 }, tilt: 0.1, nod: 0.05, raisesArm: true, isSleepy: true },
}
const FINGERS = ['Index', 'Middle', 'Ring', 'Little']
const EXPRESSION_NAMES = ['relaxed', 'happy', 'angry', 'sad', 'surprised', 'blinkLeft', 'blink']

const MOODS = {
  normal: { expr: { relaxed: 0.3 }, light: 0xffffff, zoom: 0, blinks: true },
  enamorada: { expr: { happy: 1 }, light: 0xffd0e8, zoom: 0.05, blinks: true },
  celosa: { expr: { angry: 0.7 }, light: 0xffe6a0, zoom: 0.1, blinks: true },
  yandere: { expr: { happy: 0.6, angry: 0.4 }, light: 0xff8080, zoom: 0.35, blinks: false },
}

const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, premultipliedAlpha: true })
renderer.setClearColor(0x000000, 0)
// Rendered at twice the size: the ink outlines stay smooth in a small window.
renderer.setPixelRatio(window.claudiaPixelRatio ?? Math.max(2, window.devicePixelRatio))
renderer.setSize(window.innerWidth, window.innerHeight)
document.body.appendChild(renderer.domElement)

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(26, window.innerWidth / window.innerHeight, 0.1, 20)
const baseCamera = new THREE.Vector3(0, 1.37, 1.65)
const CAMERA_DISTANCE = { chico: 2.1, normal: 1.65, grande: 1.45 }
camera.position.copy(baseCamera)
camera.lookAt(0, 1.37, 0)

// Toon materials clip to flat white above this much light, losing all shading.
const key = new THREE.DirectionalLight(0xffffff, 2.2)
key.position.set(0.2, 1.1, 2)
scene.add(key, new THREE.AmbientLight(0xffffff, 0.45))

const gaze = new THREE.Object3D()
scene.add(gaze)

let vrm = null
let mood = 'normal'
let blink = 0
let nextBlink = 2
let bubbleTimer = 0
const weights = {}
const clock = new THREE.Clock()
const bubble = document.getElementById('bubble')

function say(line) {
  if (!line) return
  bubble.textContent = line
  bubble.classList.add('on')
  clearTimeout(bubbleTimer)
  bubbleTimer = setTimeout(() => bubble.classList.remove('on'), 6000)
}

const STYLE_MATCH = {
  piel: /_SKIN/,
  pelo: /_HAIR/,
  ojos: /EyeIris/,
  ropa: /Tops_\d+_CLOTH/,
}
const I18N = await fetch('/i18n.json').then(r => r.json())
let language = I18N.es

function applyLanguage(code) {
  language = I18N[code] ?? I18N.es
  for (const id of ['hint', 'move', 'mic']) document.getElementById(id).textContent = language[id]
}
let petTime = 0
let reaction = null
let reactionTime = 0
let headTilt = 0
let headNod = 0
let speakTime = 0
let scold = 0
let nextZ = 0
let walking = 0
let shownShape
// What she is doing (activities.js); `activityUntil` sends a timed one back to idle.
let activity = 'idle'
let activityUntil = 0
let activityArg
let activityStart = 0
let lastBusy = 0
const bodyPose = Object.fromEntries(Object.entries(REST).map(([bone, r]) => [bone, [...r]]))
const props = makeProps()
props.laptop.visible = false
props.phone.visible = false
scene.add(props.laptop)
let bounce = 0
let kissSent = false
// 'bust' frames her from the waist up; 'full' pulls back to show all of her (walking, sitting on a window).
let bodyMode = 'bust'
let lookY = 1.37
let facing = 0
// rotateVRM0 already turned older models around; turning adds to that.
let baseYaw = 0

// Skin keeps its texture; the others start from a neutral copy so that a dark
// texture can still become blonde or pink.
function neutralMap(map) {
  if (map.userData.neutral) return map.userData.neutral
  const { width, height } = map.image
  const canvas = Object.assign(document.createElement('canvas'), { width, height })
  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.drawImage(map.image, 0, 0)
  const image = context.getImageData(0, 0, width, height)
  const data = image.data
  let top = 1
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 0) top = Math.max(top, 0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2])
  }
  for (let i = 0; i < data.length; i += 4) {
    const value = Math.min(255, ((0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2]) * 255) / top)
    data[i] = data[i + 1] = data[i + 2] = value
  }
  context.putImageData(image, 0, 0)
  const neutral = new THREE.CanvasTexture(canvas)
  neutral.flipY = map.flipY
  neutral.colorSpace = map.colorSpace
  neutral.wrapS = map.wrapS
  neutral.wrapT = map.wrapT
  map.userData.neutral = neutral
  return neutral
}

function applyStyle(part, color) {
  const match = STYLE_MATCH[part]
  if (!vrm || !match) return
  vrm.scene.traverse(node => {
    if (!node.isMesh) return
    for (const material of [node.material].flat()) {
      if (!match.test(material.name)) continue
      if (!material.userData.original) {
        material.userData.original = {
          map: material.map,
          color: material.color.clone(),
          shade: material.shadeColorFactor?.clone(),
        }
      }
      const original = material.userData.original
      if (color === null || color === undefined) {
        material.map = original.map
        material.color.copy(original.color)
        material.shadeColorFactor?.copy(original.shade)
      } else {
        if (part !== 'piel' && original.map) material.map = neutralMap(original.map)
        material.color.set(color)
        material.shadeColorFactor?.set(color).multiplyScalar(part === 'piel' ? 0.72 : 0.62)
      }
      material.needsUpdate = true
    }
  })
}

async function applySavedStyle() {
  const response = await fetch('/config.json').catch(() => null)
  const config = response?.ok ? await response.json() : {}
  for (const part of Object.keys(STYLE_MATCH)) applyStyle(part, config[part] ?? null)
  document.getElementById('hint').classList.toggle('on', !config.petDone)
  setMuted(config.muted)
  applyLanguage(config.idioma)
  baseCamera.z = CAMERA_DISTANCE[config.tamano] ?? CAMERA_DISTANCE.normal
}

function spawnHearts(symbol = '♥') {
  for (let i = 0; i < 5; i += 1) {
    const heart = Object.assign(document.createElement('span'), { className: 'heart', textContent: symbol })
    heart.style.left = `${110 + Math.random() * 140}px`
    heart.style.animationDelay = `${i * 0.12}s`
    heart.addEventListener('animationend', () => heart.remove())
    document.body.appendChild(heart)
  }
}

function pose(name, x, y, z) {
  const bone = vrm.humanoid.getNormalizedBoneNode(name)
  // VRM 0 models face the other way, which mirrors the x and z rotations.
  const flip = vrm.meta.metaVersion === '0' ? -1 : 1
  if (bone) bone.rotation.set(flip * x, y, flip * z)
}

function curlFinger(side, finger, amount) {
  const sign = side === 'left' ? -1 : 1
  pose(`${side}${finger}Proximal`, 0, 0, sign * 0.35 * amount)
  pose(`${side}${finger}Intermediate`, 0, 0, sign * 0.5 * amount)
  pose(`${side}${finger}Distal`, 0, 0, sign * 0.3 * amount)
}

// Slightly curled fingers; straight ones read as a mannequin.
function relaxHands() {
  for (const side of ['left', 'right']) {
    for (const finger of FINGERS) curlFinger(side, finger, 1)
  }
}

const HAND_SHAPES = {
  piedra: { Index: 4, Middle: 4, Ring: 4, Little: 4 },
  papel: { Index: 0, Middle: 0, Ring: 0, Little: 0 },
  tijera: { Index: 0, Middle: 0, Ring: 4, Little: 4 },
}

const loadedConfig = await fetch('/config.json').then(r => r.json()).catch(() => ({}))
const modelFile = (loadedConfig.modelo ?? 'vita') === 'sample' ? '/assets/sample.vrm' : `/assets/models/${loadedConfig.modelo ?? 'vita'}.vrm`

new GLTFLoader()
  .register(parser => new VRMLoaderPlugin(parser))
  .load(modelFile, gltf => {
    vrm = gltf.userData.vrm
    VRMUtils.removeUnnecessaryVertices(gltf.scene)
    VRMUtils.combineSkeletons(gltf.scene)
    VRMUtils.rotateVRM0(vrm)
    baseYaw = vrm.scene.rotation.y
    scene.add(vrm.scene)
    vrm.lookAt.target = gaze
    pose('leftUpperArm', 0, 0, -1.2)
    pose('rightUpperArm', 0, 0, 1.2)
    pose('leftLowerArm', 0, -0.2, 0)
    pose('rightLowerArm', 0, 0.2, 0)
    relaxHands()
    const hand = vrm.humanoid.getRawBoneNode('rightHand')
    if (hand) {
      hand.add(props.phone)
      props.phone.position.set(0, -0.06, 0.04)
    }
    applySavedStyle().then(() => { window.claudiaReady = true })
  }, undefined, error => console.error(error))

window.claudiaChan.onEvent(event => {
  if (event.type === 'cursor') {
    gaze.position.set(event.x * 3, 1.3 - event.y * 2, 1.5)
    return
  }
  if (event.type === 'style') {
    applyStyle(event.part, event.color)
    return
  }
  if (event.type === 'pet') {
    petTime = 2.2
    playSound('caricia')
    spawnHearts()
    say(language.pet[Math.floor(Math.random() * language.pet.length)])
    document.getElementById('hint').classList.remove('on')
    return
  }
  if (event.type === 'moving') {
    document.getElementById('move').classList.toggle('on', event.value)
    return
  }
  if (event.type === 'mouth') {
    speakTime = event.seconds
    return
  }
  if (event.type === 'speak') {
    playSpeech(event.audio).then(seconds => { speakTime = seconds }).catch(console.error)
    return
  }
  if (event.type === 'listening') {
    document.getElementById('mic').classList.toggle('on', event.value)
    return
  }
  if (event.type === 'walk') {
    walking = event.dir
    return
  }
  if (event.type === 'setting') {
    if (event.key === 'idioma') applyLanguage(event.value)
    if (event.key === 'tamano') baseCamera.z = CAMERA_DISTANCE[event.value]
    if (event.key === 'pasear' && event.value === 'off') walking = 0
    return
  }
  if (event.type === 'mute') {
    setMuted(event.value)
    return
  }
  if (event.type === 'body') {
    bodyMode = event.mode === 'full' ? 'full' : 'bust'
    document.body.classList.toggle('full', bodyMode === 'full')
    return
  }
  if (event.type === 'doing') {
    if (ACTIVITIES[event.name]) {
      activity = event.name
      activityArg = event.dir
      activityStart = clock.elapsedTime
      // Untimed work still ends: if nothing new arrives in 90 s the session probably went away.
      activityUntil = clock.elapsedTime + (event.seconds ?? (event.name === 'idle' ? 0 : 90))
      if (event.name === 'idle') activityUntil = 0
      if (event.name !== 'idle') lastBusy = clock.elapsedTime
    }
    return
  }
  if (event.type === 'react') {
    if (REACTIONS[event.name]) {
      reaction = event.hand ? { ...REACTIONS[event.name], raisesArm: true, hand: event.hand } : REACTIONS[event.name]
      reactionTime = event.seconds ?? 3
    }
    if (event.sound) playSound(event.sound)
    say(event.line)
    return
  }
  if (MOODS[event.mood]) {
    if (event.mood !== mood && event.mood !== 'normal') playSound(event.mood === 'celosa' ? 'celos' : event.mood)
    mood = event.mood
  }
  say(event.line)
})

function setExpressions(dt) {
  petTime = Math.max(0, petTime - dt)
  reactionTime = Math.max(0, reactionTime - dt)
  if (reactionTime === 0) reaction = null
  const target = petTime > 0 ? { happy: 1 } : (reaction?.expr ?? MOODS[mood].expr)
  const manager = vrm.expressionManager
  for (const name of EXPRESSION_NAMES) {
    if (name === 'blink' && target.blink === undefined) continue
    const goal = target[name] ?? 0
    weights[name] = THREE.MathUtils.damp(weights[name] ?? 0, goal, 6, dt)
    manager.setValue(name, weights[name])
  }

  speakTime = Math.max(0, speakTime - dt)
  manager.setValue('aa', speakTime > 0 ? 0.2 + 0.5 * Math.abs(Math.sin(clock.elapsedTime * 11)) : 0)

  if (target.blink !== undefined) return

  nextBlink -= dt
  if (MOODS[mood].blinks && nextBlink <= 0) {
    blink = 1
    nextBlink = 2 + Math.random() * 4
  }
  blink = Math.max(0, blink - dt * 7)
  manager.setValue('blink', MOODS[mood].blinks ? Math.min(1, blink * 1.4) : 0)
}

renderer.setAnimationLoop(() => {
  const dt = clock.getDelta()
  const t = clock.elapsedTime
  const setting = MOODS[mood]

  key.color.lerp(new THREE.Color(setting.light), 0.08)
  const isFull = bodyMode === 'full'
  camera.position.z = THREE.MathUtils.damp(camera.position.z, isFull ? 4.3 : baseCamera.z - setting.zoom * 1.1, 3, dt)
  camera.position.y = THREE.MathUtils.damp(camera.position.y, isFull ? 0.84 : baseCamera.y + setting.zoom * 0.22, 3, dt)
  lookY = THREE.MathUtils.damp(lookY, isFull ? 0.82 : 1.37, 3, dt)
  camera.lookAt(0, lookY, 0)
  // Only the promo renderer sets this, to frame shots from other angles.
  window.claudiaCameraHook?.(camera, vrm)

  if (vrm) {
    setExpressions(dt)
    const breath = Math.sin(t * 1.6)
    pose('chest', breath * 0.015, 0, 0)
    // Timed activities end; a long idle turns into a stretch, the phone, or sleep at night.
    if (activityUntil && t > activityUntil) { activity = 'idle'; activityUntil = 0 }
    if (activity === 'idle' && t - lastBusy > 45) {
      const late = new Date().getHours() < 6
      activity = late ? 'sleepy' : Math.random() < 0.5 ? 'stretch' : 'phone'
      activityUntil = late ? 0 : t + (activity === 'stretch' ? 3 : 8)
      lastBusy = t
    }
    // Jealous and with nothing to do, she stands there with her arms crossed.
    const shown = activity === 'idle' && (mood === 'celosa' || mood === 'yandere') ? 'pout' : activity
    const goal = ACTIVITIES[shown](t, activityArg, t - activityStart)
    for (const bone of Object.keys(REST)) {
      const target = goal[bone] ?? REST[bone]
      // Dances follow the beat closely; everything else eases in.
      for (let i = 0; i < 3; i++) bodyPose[bone][i] = THREE.MathUtils.damp(bodyPose[bone][i], target[i], goal.snappy ? 16 : 7, dt)
    }
    bounce = THREE.MathUtils.damp(bounce, goal.bounce ?? 0, 12, dt)
    vrm.scene.position.y = bounce
    // She turns toward where she is walking, and back to face you when she stops.
    facing = THREE.MathUtils.damp(facing, goal.turn ?? 0, goal.snappy ? 14 : 6, dt)
    vrm.scene.rotation.y = baseYaw + facing
    props.laptop.visible = Boolean(goal.laptop)
    props.phone.visible = Boolean(goal.phone)
    if (goal.laptop) props.drawScreen(t)
    // The moment her hand opens, the hearts fly and she makes the kiss face.
    if (goal.kiss && !kissSent) {
      spawnHearts()
      setTimeout(() => spawnHearts('💋'.repeat(1)), 120)
      reaction = { expr: { happy: 0.6, blinkLeft: 1 }, tilt: -0.08 }
      reactionTime = 0.9
    }
    kissSent = Boolean(goal.kiss)
    for (const bone of ['leftUpperArm', 'leftLowerArm', 'leftHand', 'rightHand', 'neck', 'leftUpperLeg', 'rightUpperLeg', 'leftLowerLeg', 'rightLowerLeg']) pose(bone, ...bodyPose[bone])
    const [sx, sy, sz] = bodyPose.spine
    pose('spine', sx, sy + Math.sin(t * 0.5) * 0.02, sz + Math.sin(t * 0.7) * 0.012)
    const nuzzle = petTime > 0 ? Math.sin(t * 7) * 0.09 : 0
    headTilt = THREE.MathUtils.damp(headTilt, reaction?.tilt ?? 0, 6, dt)
    headNod = THREE.MathUtils.damp(headNod, reaction?.nod ?? 0, 6, dt)
    const [hx, hy, hz] = bodyPose.head
    // While busy she looks at her work, not at the cursor.
    const look = shown === 'idle' || shown === 'listening' ? 1 : 0.25
    pose('head', ((gaze.position.y < 1.3 ? 0.05 : -0.03) + headNod) * look + hx, gaze.position.x * 0.12 * look + hy, nuzzle + headTilt + hz)
    // Raised forearm, wagging: scolding, or showing her hand in a game.
    scold = THREE.MathUtils.damp(scold, reaction?.raisesArm ? 1 : 0, 7, dt)
    // The scolding arm (a reaction) wins over the activity's right arm.
    const [ux, uy, uz] = bodyPose.rightUpperArm
    const [lx, ly, lz] = bodyPose.rightLowerArm
    pose('rightUpperArm', THREE.MathUtils.lerp(ux, -1.25, scold), uy * (1 - scold), THREE.MathUtils.lerp(uz, 1.0, scold))
    pose('rightLowerArm', lx * (1 - scold), THREE.MathUtils.lerp(ly, 1.7, scold) + (reaction?.hand ? 0 : scold * Math.sin(t * 10) * 0.2), lz * (1 - scold))
    const shape = HAND_SHAPES[reaction?.hand]
    if (shape !== shownShape) {
      shownShape = shape
      if (shape) for (const finger of FINGERS) curlFinger('right', finger, shape[finger])
      else relaxHands()
    }
    pose('hips', 0, walking * 0.35, walking ? Math.sin(t * 8) * 0.025 : 0)
    if (reaction?.isSleepy && t > nextZ) {
      nextZ = t + 2.5
      spawnHearts('z')
    }
    vrm.update(dt)
  }
  renderer.render(scene, camera)
})
