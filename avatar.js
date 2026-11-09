import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm'
import { playSound, playSpeech, setMuted } from '/sounds.js'

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
renderer.setPixelRatio(Math.max(2, window.devicePixelRatio))
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
const PET_LINES = ['Nnn~ otra vez...', 'S-solo tú puedes hacer eso (⁄ ⁄>⁄ω⁄<⁄ ⁄)', 'Kyaa~ tu cursor es tibio', 'Ya no estoy enojada. Casi.']
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
  if (bone) bone.rotation.set(x, y, z)
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
const modelFile = loadedConfig.modelo && loadedConfig.modelo !== 'sample' ? `/assets/models/${loadedConfig.modelo}.vrm` : '/assets/sample.vrm'

new GLTFLoader()
  .register(parser => new VRMLoaderPlugin(parser))
  .load(modelFile, gltf => {
    vrm = gltf.userData.vrm
    VRMUtils.removeUnnecessaryVertices(gltf.scene)
    VRMUtils.combineSkeletons(gltf.scene)
    VRMUtils.rotateVRM0(vrm)
    scene.add(vrm.scene)
    vrm.lookAt.target = gaze
    pose('leftUpperArm', 0, 0, -1.2)
    pose('rightUpperArm', 0, 0, 1.2)
    pose('leftLowerArm', 0, -0.2, 0)
    pose('rightLowerArm', 0, 0.2, 0)
    relaxHands()
    applySavedStyle()
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
    say(PET_LINES[Math.floor(Math.random() * PET_LINES.length)])
    document.getElementById('hint').classList.remove('on')
    return
  }
  if (event.type === 'moving') {
    document.getElementById('move').classList.toggle('on', event.value)
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
    if (event.key === 'tamano') baseCamera.z = CAMERA_DISTANCE[event.value]
    if (event.key === 'pasear' && event.value === 'off') walking = 0
    return
  }
  if (event.type === 'mute') {
    setMuted(event.value)
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
  camera.position.z = THREE.MathUtils.damp(camera.position.z, baseCamera.z - setting.zoom * 1.1, 3, dt)
  camera.position.y = THREE.MathUtils.damp(camera.position.y, baseCamera.y + setting.zoom * 0.22, 3, dt)

  if (vrm) {
    setExpressions(dt)
    const breath = Math.sin(t * 1.6)
    pose('chest', breath * 0.015, 0, 0)
    pose('spine', 0, Math.sin(t * 0.5) * 0.02, Math.sin(t * 0.7) * 0.012)
    const nuzzle = petTime > 0 ? Math.sin(t * 7) * 0.09 : 0
    headTilt = THREE.MathUtils.damp(headTilt, reaction?.tilt ?? 0, 6, dt)
    headNod = THREE.MathUtils.damp(headNod, reaction?.nod ?? 0, 6, dt)
    pose('head', (gaze.position.y < 1.3 ? 0.05 : -0.03) + headNod, gaze.position.x * 0.12, nuzzle + headTilt)
    // Raised forearm, wagging: scolding, or showing her hand in a game.
    scold = THREE.MathUtils.damp(scold, reaction?.raisesArm ? 1 : 0, 7, dt)
    pose('rightUpperArm', scold * -1.25, 0, THREE.MathUtils.lerp(1.2, 1.0, scold))
    pose('rightLowerArm', 0, THREE.MathUtils.lerp(0.2, 1.7, scold) + (reaction?.hand ? 0 : scold * Math.sin(t * 10) * 0.2), 0)
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
