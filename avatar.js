import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm'
import { hush, playSound, playSpeech, setMuted, setVoice, voiceLevel } from '/sounds.js'
import { ACTIVITIES, REST, makeProps } from '/activities.js'
import { loadMixamoFile } from '/mixamo.js'
import { STYLE_MATCH, applyStyle as applyVrmStyle } from '/style.js'
import { createAttention } from '/attention.mjs'
import { pickIdle } from '/idle.mjs'
import { createCarry } from '/carry.mjs'
import { createGames } from '/play.js'

// Brief expressions layered over the lasting mood.
const REACTIONS = {
  feliz: { expr: { happy: 1 } },
  triste: { expr: { sad: 1 }, nod: 0.12 },
  sorprendida: { expr: { surprised: 1 }, nod: -0.08 },
  enojada: { expr: { angry: 1 }, nod: 0.06 },
  pensando: { expr: { relaxed: 0.35 }, tilt: 0.13, nod: -0.12 },
  concentrada: { expr: { angry: 0.25 }, nod: 0.08 },
  guino: { expr: { happy: 0.7, blinkLeft: 1 }, tilt: -0.1 },
  shh: { expr: { happy: 0.4, blinkLeft: 1 }, tilt: 0.08 },
  sonrojada: { expr: { happy: 0.5, surprised: 0.25 }, tilt: 0.08, nod: 0.1, isBlushing: true },
  cansada: { expr: { relaxed: 0.5, sad: 0.5, blink: 0.55 }, nod: 0.16, tilt: -0.06 },
  preocupada: { expr: { sad: 0.6, surprised: 0.3 }, tilt: 0.06 },
  descansa: { expr: { sad: 0.45, angry: 0.3 }, tilt: 0.1, nod: 0.05, raisesArm: true, isSleepy: true },
  // Dozing because you are away: the z's of 'descansa' without its scolding arm.
  dormida: { expr: { relaxed: 0.5, blink: 1 }, nod: 0.16, isSleepy: true },
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
// The GPU can drop the 3D context (hybrid laptop GPUs, driver resets): reload instead of freezing.
renderer.domElement.addEventListener('webglcontextlost', event => {
  event.preventDefault()
  setTimeout(() => location.reload(), 500)
})

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

// Her eyes follow `gaze`, which eases toward whatever has her attention (attention.mjs): your cursor,
// you (the camera) or her work. Following the raw cursor every frame read as a tracking camera.
const gaze = new THREE.Object3D()
const cursorTarget = new THREE.Vector3(0, 1.3, 1.5)
const gazeGoal = new THREE.Vector3().copy(cursorTarget)
const lastGazeGoal = new THREE.Vector3().copy(cursorTarget)
const scratch = new THREE.Vector3()
gaze.position.copy(cursorTarget)
scene.add(gaze)
const attention = createAttention()
const WORK = ['typing', 'reading', 'phone']
let cursorMoved = false
let cursorNear = false
let lastGazeBlink = -10
let headYaw = 0
let headPitch = 0
// Breathing has its own phase so its rate can change (faster when nervous or after dancing) without a jump.
let breathPhase = 0
let breathRate = 1.6
let lastExertion = -100
// Standing idle she shifts her weight to one side now and then (-1, 0, 1).
let weightGoal = 0
let weight = 0
let nextWeight = 0
const damp = THREE.MathUtils.damp
// Her mouth follows how loud her voice is; an activity can also open it or close her eyes (a yawn).
let mouth = 0
let activityMouth = 0
let activityEyes = 0
const lightGoal = new THREE.Color()
// Idle moments (idle.mjs): how long she waits for the next one, and what the last one was.
const idleWaitNext = () => 18 + Math.random() * 52
let idleWait = idleWaitNext()
let lastIdle
let personalidad
// Being carried (carry.mjs): how her window is moving and whether your hand has her. She hangs inside
// `carrier`, a parent of the model, so tilting her does not disturb her own turning, bounce or mocap,
// and her hair and clothes (spring bones) swing by themselves because she really moves.
const carry = createCarry()
const carrier = new THREE.Group()
scene.add(carrier)
const HOLD_HEIGHT = 1.35 // metres: she hangs from her head, which therefore stays where it is in the window
let windowSpeed = { vx: 0, vy: 0 }
let held = false
let armsOut = 0
// Late at night her blinks are slower and closer together.
function isNight() {
  const hour = new Date().getHours()
  return hour >= 23 || hour < 6
}

let vrm = null
let mood = 'normal'
let blink = 0
let nextBlink = 2
let bubbleTimer = 0
const weights = {}
const clock = new THREE.Clock()
const bubble = document.getElementById('bubble')

// The bubble stays as long as the text needs to be read (muted, it is the only way she talks).
function say(line, ms) {
  if (!line) return
  bubble.textContent = line
  bubble.classList.add('on')
  clearTimeout(bubbleTimer)
  bubbleTimer = setTimeout(() => bubble.classList.remove('on'), ms ?? Math.min(12000, Math.max(4000, 2500 + 60 * line.length)))
}

const I18N = await fetch('/i18n.json').then(r => r.json())
let language = I18N.es

function applyLanguage(code) {
  language = I18N[code] ?? I18N.es
  for (const id of ['hint', 'move', 'mic']) document.getElementById(id).textContent = language[id]
  labelTools()
}

// Every toolbar button is named from i18n tools.<its id>, so a new button only needs its key there.
// (dev/poses.html has no toolbar.)
// Two buttons change their name with their state: the speaker and the moon.
const TOOL_ALTERNATE = { mute: () => isMutedNow && 'unmute', quiet: () => quietNow() && 'quietOff' }
let isMutedNow = false
function labelTools() {
  for (const button of document.querySelectorAll('#tools button')) {
    const key = TOOL_ALTERNATE[button.id]?.() || button.id
    const label = language.tools?.[key] ?? language.tools?.[button.id] ?? ''
    button.title = label
    button.dataset.label = label
  }
}

// The mute as she shows it: the audio itself, the crossed speaker on the button and the badge beside her.
function showMuted(value) {
  isMutedNow = Boolean(value)
  setMuted(isMutedNow)
  const button = document.getElementById('mute')
  button?.classList.toggle('on', isMutedNow)
  if (button) button.textContent = isMutedNow ? '🔇' : '🔊'
  if (isMutedNow) speakTime = 0
  showBadge()
}

// Quiet mode ("no molestar"): until when she keeps to herself. The app owns the clock and tells us
// when it starts and ends; between those, this is what silences her cue sounds.
let quietUntil = 0
let quietTimer = 0
// Whether she still owes the one-time hint about being carried (the app remembers; see hang()).
let carryHint = false
const quietNow = () => quietUntil > Date.now()
function showQuiet(until) {
  quietUntil = Number(until) || 0
  showBadge()
  // The moon goes out on the minute, not when the app next looks (every 30 s): a press on a moon
  // still lit after the end would start another hour instead of ending this one.
  clearTimeout(quietTimer)
  if (quietNow()) quietTimer = setTimeout(showBadge, quietUntil - Date.now() + 50)
}

// Beside her while she is silent, so it is never a mystery why: 🔇 muted, 🌙 quiet mode, or both.
function showBadge() {
  const badge = document.getElementById('badge')
  if (badge) badge.textContent = (isMutedNow ? '🔇' : '') + (quietNow() ? '🌙' : '')
  document.getElementById('quiet')?.classList.toggle('on', quietNow())
  labelTools()
}
let petTime = 0
let voiceSettings = {}
// Being petted: how long the current petting has lasted, and how much she leans into your hand (0..1).
let petStreak = 0
let lastPetAt = -10
let petLean = 0
let nextPetHeart = 0
let blushLevel = 0
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
// The laptop sits in front of her, so it leans with her.
carrier.add(props.laptop)
let bounce = 0
// Cheek patches (head-bone space), tuned on the bundled models.
const BLUSH = { x: 0.042, y: 0.045, z: 0.085 }
const blush = []
let kissSent = false
// Motion capture: assets/animations/<activity>[-n].fbx (Mixamo) replaces the hand-made pose for that activity.
const mocap = {}
let mixer = null
let playing = null
let playingAction = null
async function loadMocap() {
  const names = await fetch('/animations').then(r => r.json()).catch(() => [])
  mixer = new THREE.AnimationMixer(vrm.scene)
  // walk.fbx -> walk, dance-2.fbx -> dance (an FBX holds one motion; its fullest clip is it).
  // A GLB with several named clips files each one under its own name.
  for (const file of names) {
    try {
      const clips = (await loadMixamoFile(`/assets/animations/${file}`, vrm)).filter(c => c.clip.tracks.length > 0)
      const isFbx = /\.fbx$/i.test(file)
      const picked = isFbx ? [clips.sort((a, b) => b.clip.tracks.length - a.clip.tracks.length)[0]].filter(Boolean) : clips
      for (const { name, clip } of picked) {
        const activity = (isFbx ? file.replace(/\.fbx$/i, '') : name).replace(/[-_ ]?\d+$/, '').toLowerCase()
        ;(mocap[activity] ??= []).push(clip)
      }
    } catch (error) {
      console.error('mocap', file, error)
    }
  }
}
// For dev/poses.html and debugging: what loaded.
window.claudiaMocap = mocap
const mocapFor = (name, arg) => (mocap[name]?.length ? mocap[name][(Number(arg) || 0) % mocap[name].length] : null)
// 'bust' frames her from the waist up; 'full' pulls back to show all of her (walking, sitting on a window).
let bodyMode = 'bust'
let lookY = 1.37
let facing = 0
// rotateVRM0 already turned older models around; turning adds to that.
let baseYaw = 0

// Skin keeps its texture; the others start from a neutral copy so that a dark
// texture can still become blonde or pink.
const applyStyle = (part, color) => applyVrmStyle(vrm, part, color)

async function applySavedStyle() {
  const response = await fetch('/config.json').catch(() => null)
  const config = response?.ok ? await response.json() : {}
  for (const part of Object.keys(STYLE_MATCH)) applyStyle(part, config[part] ?? null)
  document.getElementById('hint').classList.toggle('on', !config.petDone)
  showMuted(Boolean(config.muted))
  voiceSettings = { voz: config.voz, idioma: config.idioma }
  setVoice(voiceSettings)
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
// Her personality flavours her idle moments (idle.mjs) and, for the shy one, where she looks (attention.mjs).
personalidad = loadedConfig.personalidad
const modelFile = (loadedConfig.modelo ?? 'vita') === 'sample' ? '/assets/sample.vrm' : `/assets/models/${loadedConfig.modelo ?? 'vita'}.vrm`

new GLTFLoader()
  .register(parser => new VRMLoaderPlugin(parser))
  .load(modelFile, gltf => {
    vrm = gltf.userData.vrm
    VRMUtils.removeUnnecessaryVertices(gltf.scene)
    VRMUtils.combineSkeletons(gltf.scene)
    VRMUtils.rotateVRM0(vrm)
    baseYaw = vrm.scene.rotation.y
    carrier.add(vrm.scene)
    vrm.lookAt.target = gaze
    pose('leftUpperArm', 0, 0, -1.2)
    pose('rightUpperArm', 0, 0, 1.2)
    pose('leftLowerArm', 0, -0.2, 0)
    pose('rightLowerArm', 0, 0.2, 0)
    relaxHands()
    // Two soft pink patches on her cheeks, faded in when she blushes.
    const head = vrm.humanoid.getRawBoneNode('head')
    if (head) {
      const back = vrm.meta.metaVersion === '0' ? -1 : 1
      for (const side of [-1, 1]) {
        const patch = new THREE.Mesh(new THREE.CircleGeometry(0.016, 24), new THREE.MeshBasicMaterial({ color: 0xff5f8f, transparent: true, opacity: 0, depthWrite: false }))
        patch.scale.set(1.5, 0.75, 1)
        patch.position.set(side * BLUSH.x, BLUSH.y, back * BLUSH.z)
        if (back < 0) patch.rotation.y = Math.PI
        head.add(patch)
        blush.push(patch)
      }
    }
    const hand = vrm.humanoid.getRawBoneNode('rightHand')
    if (hand) {
      hand.add(props.phone)
      props.phone.position.set(0, -0.06, 0.04)
    }
    loadMocap()
    applySavedStyle().then(() => { window.claudiaReady = true })
  }, undefined, error => console.error(error))

// Hover toolbar: the app tells us when the cursor is near; the buttons talk back to the app.
const tools = document.getElementById('tools')
// First run: the buttons wear labels, and she explains the new ones once, until one of them is used.
let tourOn = false
let tourSaid = false
function endTour() {
  if (!tourOn) return
  tourOn = false
  tools.classList.remove('tour')
  window.claudiaChan.act('tour-done')
}
if (tools && window.claudiaChan.act) {
  document.getElementById('stay').onclick = () => window.claudiaChan.act('stay')
  document.getElementById('menu').onclick = () => window.claudiaChan.act('menu')
  // 🌙 an hour of quiet mode or back to normal, 👁 hides her (the app says how to bring her back the
  // first time), 🎮 her games. Using any of the newer buttons ends the first-run labels.
  for (const id of ['mute', 'talk', 'quiet', 'hide', 'games']) {
    document.getElementById(id).onclick = () => {
      window.claudiaChan.act(id)
      endTour()
    }
  }
  const drag = document.getElementById('drag')
  drag.onpointerdown = e => { drag.setPointerCapture(e.pointerId); window.claudiaChan.act('drag-start') }
  drag.onpointerup = drag.onpointercancel = () => window.claudiaChan.act('drag-end')
}

// Her mini-games (play.js) borrow her face, her bubble and her sounds.
const games = createGames({
  act: window.claudiaChan.act,
  texts: () => language.games,
  say,
  // A face for a moment; with `hand`, her arm comes up showing piedra, papel or tijera.
  face(name, seconds, hand) {
    reaction = hand ? { ...REACTIONS[name], raisesArm: true, hand } : REACTIONS[name]
    reactionTime = seconds
  },
  // You started the game, so it may be played in quiet mode, but without a sound.
  cue: name => { if (!quietNow()) playSound(name) },
  hearts: spawnHearts,
  pose(name, seconds) {
    activity = name
    activityArg = undefined
    activityStart = clock.elapsedTime
    activityUntil = clock.elapsedTime + seconds
  },
  // She puts her work down to play.
  rest() {
    activity = 'idle'
    activityUntil = 0
  },
})

window.claudiaChan.onEvent(event => {
  if (event.type === 'games') {
    games.handle(event)
    return
  }
  // In the middle of a game, what Claude is doing does not pull her away from it (a reminder you
  // asked for, marked `force`, still does).
  const isPlaying = games.isOpen() && !event.force
  if (event.type === 'cursor') {
    // The app sends this many times a second even when the mouse is still: only a real move counts.
    scratch.set(event.x * 3, 1.3 - event.y * 2, 1.5)
    cursorMoved ||= scratch.distanceTo(cursorTarget) > 0.02
    cursorTarget.copy(scratch)
    windowSpeed = { vx: event.vx ?? 0, vy: event.vy ?? 0 }
    held = Boolean(event.held)
    return
  }
  if (event.type === 'style') {
    applyStyle(event.part, event.color)
    return
  }
  if (event.type === 'pet') {
    // Rubbing keeps arriving every ~1.5 s while you keep petting her: one long caress, not a series.
    const now = clock.elapsedTime
    petStreak = now - lastPetAt < 4 ? petStreak + 1 : 1
    lastPetAt = now
    petTime = 2.6
    if (petStreak === 1) {
      playSound('caricia')
      say(language.pet[Math.floor(Math.random() * language.pet.length)])
    }
    // A long caress melts her: a happy sigh, a burst of hearts, a kiss.
    if (petStreak === 5) {
      playSound('enamorada')
      spawnHearts()
      say(language.pet[Math.floor(Math.random() * language.pet.length)])
      setTimeout(() => { activity = 'kiss'; activityStart = clock.elapsedTime; activityUntil = clock.elapsedTime + 1.8 }, 2600)
    }
    document.getElementById('hint').classList.remove('on')
    return
  }
  if (event.type === 'near') {
    tools?.classList.toggle('on', event.value)
    cursorNear = Boolean(event.value)
    if (event.value && tourOn && !tourSaid) {
      tourSaid = true
      say(language.tools.tour)
    }
    return
  }
  if (event.type === 'state') {
    document.getElementById('stay')?.classList.toggle('on', event.still)
    showMuted(event.muted)
    showQuiet(event.quietUntil)
    document.getElementById('talk')?.classList.toggle('on', event.listening)
    carryHint = Boolean(event.carryHint)
    tourOn = Boolean(event.tour && tools)
    tools?.classList.toggle('tour', tourOn)
    return
  }
  if (event.type === 'still') {
    document.getElementById('stay')?.classList.toggle('on', event.value)
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
    playSpeech(event.audio, event.queue).then(seconds => { speakTime = seconds }).catch(console.error)
    return
  }
  if (event.type === 'listening') {
    document.getElementById('mic').classList.toggle('on', event.value)
    document.getElementById('talk')?.classList.toggle('on', event.value)
    if (event.value) {
      activity = 'listening'
      activityStart = clock.elapsedTime
      activityUntil = clock.elapsedTime + 60
    } else if (activity === 'listening') {
      activity = 'idle'
      activityUntil = 0
    }
    return
  }
  if (event.type === 'walk') {
    walking = event.dir
    return
  }
  if (event.type === 'setting') {
    if (event.key === 'idioma') applyLanguage(event.value)
    if (event.key === 'idioma' || event.key === 'voz') {
      voiceSettings = { ...voiceSettings, [event.key]: event.value }
      setVoice(voiceSettings)
    }
    if (event.key === 'personalidad') personalidad = event.value
    if (event.key === 'tamano') baseCamera.z = CAMERA_DISTANCE[event.value]
    if (event.key === 'pasear' && event.value === 'off') walking = 0
    return
  }
  if (event.type === 'mute') {
    showMuted(event.value)
    if (!event.acted) return
    // Muted: a wink and a small "shh". Unmuted: a happy chirp, so you hear that she is back.
    reaction = event.value ? REACTIONS.shh : REACTIONS.feliz
    reactionTime = event.value ? 1.4 : 1.2
    if (!event.value) playSound('listo')
    return
  }
  if (event.type === 'quiet') {
    showQuiet(event.until)
    // Time ran out by itself: the app sends a stretch, and that is all.
    if (!event.acted || event.expired) return
    if (quietNow()) {
      // A wink, one line in the bubble, and from here on not a sound.
      hush()
      speakTime = 0
      reaction = REACTIONS.guino
      reactionTime = 1.5
      say(event.line)
    } else {
      reaction = REACTIONS.feliz
      reactionTime = 1.2
    }
    return
  }
  if (event.type === 'body') {
    bodyMode = event.mode === 'full' ? 'full' : 'bust'
    document.body.classList.toggle('full', bodyMode === 'full')
    return
  }
  if (isPlaying && (event.type === 'doing' || event.type === 'react')) return
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
  // A mark left in her bubble for a long while (a task finished while you were away); her next line replaces it.
  if (event.type === 'note') {
    say(event.text, event.seconds * 1000)
    return
  }
  if (event.type === 'react') {
    if (REACTIONS[event.name]) {
      reaction = event.hand ? { ...REACTIONS[event.name], raisesArm: true, hand: event.hand } : REACTIONS[event.name]
      reactionTime = event.seconds ?? 3
    }
    // Quiet mode: her face still reacts to the work, without the cue sound. (Petting keeps its sounds:
    // that is you touching her; `force` is a reminder you asked for.)
    if (event.sound && (event.force || !quietNow())) playSound(event.sound)
    say(event.line)
    return
  }
  if (MOODS[event.mood]) {
    if (event.mood !== mood && event.mood !== 'normal' && !quietNow() && !isPlaying) playSound(event.mood === 'celosa' ? 'celos' : event.mood)
    mood = event.mood
  }
  if (!isPlaying) say(event.line)
})
// Now that the listener exists: ask the app how the toolbar should look (dev/poses.html has no `act`).
window.claudiaChan.act?.('ready')

function setExpressions(dt) {
  petTime = Math.max(0, petTime - dt)
  reactionTime = Math.max(0, reactionTime - dt)
  if (reactionTime === 0) reaction = null
  // Petted: eyes closed, content; just after, a shy little blush.
  const target = petTime > 0 ? { happy: 1, relaxed: 0.3 } : (reaction?.expr ?? MOODS[mood].expr)
  const manager = vrm.expressionManager
  for (const name of EXPRESSION_NAMES) {
    if (name === 'blink' && target.blink === undefined) continue
    const goal = target[name] ?? 0
    weights[name] = THREE.MathUtils.damp(weights[name] ?? 0, goal, 6, dt)
    manager.setValue(name, weights[name])
  }

  speakTime = Math.max(0, speakTime - dt)
  // The real loudness of her voice opens her mouth, so it closes in her pauses. With no audio to listen
  // to (muted or quiet: only a 'mouth' event arrives) the old sine keeps her lips moving.
  // Thresholds measured on Kokoro speech: pauses sit under 0.01 RMS, syllables between 0.04 and 0.17.
  const level = voiceLevel()
  const open = level !== null ? THREE.MathUtils.smoothstep(level, 0.015, 0.14) * 0.85
    : speakTime > 0 ? 0.2 + 0.5 * Math.abs(Math.sin(clock.elapsedTime * 11)) : 0
  // Opens fast, closes a little slower, like a jaw.
  mouth = damp(mouth, open, open > mouth ? 30 : 14, dt)
  manager.setValue('aa', Math.max(mouth, activityMouth))

  if (target.blink !== undefined) return

  const night = isNight()
  nextBlink -= dt
  if (MOODS[mood].blinks && nextBlink <= 0) {
    blink = 1
    // Now and then a double blink, as people do.
    nextBlink = Math.random() < 0.15 ? 0.18 : (2 + Math.random() * 4) * (night ? 0.8 : 1)
  }
  blink = Math.max(0, blink - dt * (night ? 4.5 : 7))
  manager.setValue('blink', Math.max(MOODS[mood].blinks ? Math.min(1, blink * 1.4) : 0, activityEyes))
}

// Moves `gaze` toward what has her attention this frame.
function lookWhereItMatters(shown, t, dt) {
  const mode = attention.step({
    t,
    cursorMoved,
    speaking: speakTime > 0,
    working: WORK.includes(shown),
    near: cursorNear,
    petting: petTime > 0,
    reacting: Boolean(reaction),
    fixed: !MOODS[mood].blinks,
    shy: personalidad === 'dandere',
  })
  cursorMoved = false
  // "You" is the camera itself: its distance changes with her size and the full-body view.
  if (mode === 'user') gazeGoal.copy(camera.position)
  // Shy: off to the side opposite your cursor, and a little down.
  else if (mode === 'away') gazeGoal.set(cursorTarget.x >= 0 ? -1.1 : 1.1, 1.05, 1.5)
  else if (mode === 'work' && workPoint()) gazeGoal.copy(scratch)
  else gazeGoal.copy(cursorTarget)
  // Looking around, her eyes sweep ahead of her head (unless she is talking, petted or reacting).
  if (shown === 'lookAround' && speakTime === 0 && petTime === 0 && !reaction) {
    gazeGoal.set(Math.sin((t - activityStart) * Math.PI / 2) * 1.2, 1.35, 1.5)
  }
  // The yandere stare is locked on, without the easing.
  if (!MOODS[mood].blinks) gaze.position.copy(cursorTarget)
  else gaze.position.lerp(gazeGoal, 1 - Math.exp(-12 * dt))
  // People blink when their eyes jump far; at most once a second, so a wild cursor does not make her flutter.
  if (gazeGoal.distanceTo(lastGazeGoal) > 0.6 && t - lastGazeBlink > 1) {
    blink = 1
    lastGazeBlink = t
  }
  lastGazeGoal.copy(gazeGoal)
}

// Where her work is, left in `scratch`: the laptop or the phone in her hand. False if neither is out.
function workPoint() {
  const prop = props.laptop.visible ? props.laptop : props.phone.visible ? props.phone : null
  if (!prop) return false
  prop.getWorldPosition(scratch)
  // Never lower than her chest, or her eyes would roll down out of sight.
  scratch.y = Math.max(0.95, scratch.y)
  return true
}

// Tilts her around the point she is held by, and reacts to being picked up and put down. Wordless,
// except the first time ever, when her bubble says that shaking her makes her dizzy (carryHint).
function hang(dt, t) {
  const { sway, lift, event } = carry.step({ ...windowSpeed, held, dt, full: bodyMode === 'full' })
  // Turning by `sway` around her feet would swing her head out of the window: the offset puts the head back.
  carrier.rotation.z = sway
  carrier.position.x = HOLD_HEIGHT * Math.sin(sway)
  carrier.position.y = HOLD_HEIGHT * (1 - Math.cos(sway)) + lift
  armsOut = damp(armsOut, held ? 1 : 0, 8, dt)
  // In your hand she starts no yawn or nap of her own.
  if (held) lastBusy = Math.max(lastBusy, t)
  if (event === 'grab') {
    reaction = REACTIONS.sorprendida
    reactionTime = 0.8
    // Do-not-disturb promises no cue sounds, and moving her out of the way of a call is when it matters.
    if (!quietNow()) playSound('sorpresa')
    if (carryHint) {
      carryHint = false
      say(language.carryHint)
      window.claudiaChan.act?.('carry-told')
    }
  }
  // Put down: a small dip as she lands, and she is glad of it. Shaken first: she needs a moment.
  if (event === 'drop') {
    bounce = -0.03
    reaction = REACTIONS.feliz
    reactionTime = 1.2
  }
  if (event === 'dizzy') {
    reaction = REACTIONS.cansada
    reactionTime = 2
  }
}

renderer.setAnimationLoop(() => {
  const dt = clock.getDelta()
  const t = clock.elapsedTime
  const setting = MOODS[mood]

  key.color.lerp(lightGoal.set(setting.light), 1 - Math.exp(-5 * dt))
  const isFull = bodyMode === 'full'
  camera.position.z = THREE.MathUtils.damp(camera.position.z, isFull ? 4.3 : baseCamera.z - setting.zoom * 1.1, 3, dt)
  camera.position.y = THREE.MathUtils.damp(camera.position.y, isFull ? 0.84 : baseCamera.y + setting.zoom * 0.22, 3, dt)
  lookY = THREE.MathUtils.damp(lookY, isFull ? 0.82 : 1.37, 3, dt)
  camera.lookAt(0, lookY, 0)
  // Only the promo renderer sets this, to frame shots from other angles.
  window.claudiaCameraHook?.(camera, vrm)

  if (vrm) {
    setExpressions(dt)
    // Timed activities end. A nap ends with a start: she nodded off and caught herself.
    if (activityUntil && t > activityUntil) {
      if (activity === 'sleepy') {
        reaction = REACTIONS.sorprendida
        reactionTime = 0.6
      }
      activity = 'idle'
      activityUntil = 0
    }
    // A long idle turns into a small moment of her own, never the same one twice in a row and after a
    // different wait each time. Not while she talks, is petted, is reacting to something or is playing.
    if (activity === 'idle' && t - lastBusy > idleWait && speakTime === 0 && petTime === 0 && !reaction && !games.isOpen()) {
      const hour = new Date().getHours()
      // Quiet mode: only the phone or a look around, nothing that asks for attention.
      const pick = pickIdle({ hour, last: lastIdle, quiet: quietNow(), firstMorning: lastIdle === undefined && hour >= 6 && hour < 10, personalidad })
      activity = pick.name
      activityArg = undefined
      activityStart = t
      activityUntil = t + pick.seconds
      lastIdle = pick.name
      // The next wait starts when this one ends.
      lastBusy = activityUntil
      idleWait = idleWaitNext()
    }
    // Jealous and with nothing to do, she stands there with her arms crossed.
    const shown = activity === 'idle' && (mood === 'celosa' || mood === 'yandere') ? 'pout' : activity
    const goal = ACTIVITIES[shown](t, activityArg, t - activityStart)
    // Used by her face on the next frame.
    activityMouth = goal.mouth ?? 0
    activityEyes = goal.eyes ?? 0
    // Breath: quick when nervous, out of breath for a while after dancing or celebrating, slow when sleepy.
    if (shown === 'dance' || shown === 'celebrate') lastExertion = t
    const winded = t - lastExertion < 10
    breathRate = damp(breathRate, shown === 'nervous' ? 2.6 : winded ? 3.0 : shown === 'sleepy' ? 1.1 : 1.6, 0.5, dt)
    breathPhase += breathRate * dt
    const breath = Math.sin(breathPhase)
    if (shown === 'idle' && petTime === 0 && !held) {
      if (t > nextWeight) {
        weightGoal = Math.floor(Math.random() * 3) - 1
        nextWeight = t + 8 + Math.random() * 12
      }
    } else weightGoal = 0
    weight = damp(weight, weightGoal, 1.5, dt)
    for (const bone of Object.keys(REST)) {
      const target = goal[bone] ?? REST[bone]
      // Dances follow the beat closely; everything else eases in.
      for (let i = 0; i < 3; i++) bodyPose[bone][i] = THREE.MathUtils.damp(bodyPose[bone][i], target[i], goal.snappy ? 16 : 7, dt)
    }
    bounce = THREE.MathUtils.damp(bounce, goal.bounce ?? 0, 12, dt)
    hang(dt, t)
    vrm.scene.position.y = bounce
    // She turns toward where she is walking, and back to face you when she stops.
    facing = THREE.MathUtils.damp(facing, goal.turn ?? 0, goal.snappy ? 14 : 6, dt)
    vrm.scene.rotation.y = baseYaw + facing
    // Nobody types while dangling from a hand.
    props.laptop.visible = Boolean(goal.laptop) && !held
    props.phone.visible = Boolean(goal.phone)
    if (goal.laptop) props.drawScreen(t)
    lookWhereItMatters(shown, t, dt)
    // The moment her hand opens, the hearts fly and she makes the kiss face.
    if (goal.kiss && !kissSent) {
      spawnHearts()
      setTimeout(() => spawnHearts('💋'.repeat(1)), 120)
      reaction = { expr: { happy: 0.6, blinkLeft: 1 }, tilt: -0.08 }
      reactionTime = 0.9
    }
    kissSent = Boolean(goal.kiss)
    // A real recorded motion for this activity wins over the hand-made pose.
    const clip = mocapFor(shown, activityArg)
    if (clip !== playing) {
      playingAction?.fadeOut(0.3)
      playingAction = clip ? mixer.clipAction(clip).reset().fadeIn(0.3).play() : null
      if (!clip) relaxHands()
      playing = clip
    }
    if (clip) {
      mixer.update(dt)
      vrm.scene.position.y = 0
    } else {
    for (const bone of ['leftUpperArm', 'leftLowerArm', 'leftHand', 'rightHand', 'neck', 'leftUpperLeg', 'rightUpperLeg', 'leftLowerLeg', 'rightLowerLeg', 'leftFoot', 'rightFoot', 'leftShoulder', 'rightShoulder']) pose(bone, ...bodyPose[bone])
    // Held, her arms come a little away from her body, as when you lift someone.
    const carried = 0.25 * armsOut
    const [ax, ay, az] = bodyPose.leftUpperArm
    pose('leftUpperArm', ax, ay, THREE.MathUtils.lerp(az, -0.9, carried))
    const [cx, cy, cz] = bodyPose.chest
    pose('chest', cx + breath * (winded ? 0.03 : 0.02), cy, cz)
    const [sx, sy, sz] = bodyPose.spine
    pose('spine', sx, sy + Math.sin(t * 0.5) * 0.02, sz + Math.sin(t * 0.7) * 0.012 + weight * 0.02)
    // Petting: she leans her head into your hand (toward the cursor), slowly nuzzles it, shoulders up.
    petLean = THREE.MathUtils.damp(petLean, petTime > 0 ? 1 : 0, petTime > 0 ? 5 : 2.5, dt)
    blushLevel = THREE.MathUtils.damp(blushLevel, petTime > 0 || t - lastPetAt < 5 || reaction?.isBlushing ? 1 : 0, 3, dt)
    blush.forEach(b => { b.material.opacity = blushLevel * 0.55 })
    if (petTime > 0 && t > nextPetHeart) {
      nextPetHeart = t + 0.9
      spawnHearts()
    }
    // The nuzzle follows your hand, not wherever her eyes wandered.
    const handSide = THREE.MathUtils.clamp(cursorTarget.x, -1, 1)
    const nuzzle = petLean * (Math.sin(t * 2.4) * 0.05 - handSide * 0.18)
    for (const [side, sign] of [['leftShoulder', 1], ['rightShoulder', -1]]) {
      const [ox, oy, oz] = bodyPose[side]
      pose(side, ox, oy, oz + sign * (0.12 * petLean + breath * 0.012))
    }
    headTilt = THREE.MathUtils.damp(headTilt, reaction?.tilt ?? 0, 6, dt)
    headNod = THREE.MathUtils.damp(headNod, reaction?.nod ?? 0, 6, dt)
    const [hx, hy, hz] = bodyPose.head
    // While busy she looks at her work, not at the cursor.
    const look = (shown === 'idle' || shown === 'listening' ? 1 : 0.25) * (1 - petLean)
    // The head trails the eyes: they dart, it follows slowly.
    headYaw = damp(headYaw, gaze.position.x * 0.12, 3.5, dt)
    headPitch = damp(headPitch, THREE.MathUtils.clamp((1.3 - gaze.position.y) * 0.1, -0.08, 0.1), 3.5, dt)
    pose('head', (headPitch + headNod) * look + hx + petLean * 0.1, headYaw * look + hy, nuzzle + headTilt + hz - weight * 0.012)
    // Raised forearm, wagging: scolding, or showing her hand in a game.
    scold = THREE.MathUtils.damp(scold, reaction?.raisesArm ? 1 : 0, 7, dt)
    // The scolding arm (a reaction) wins over the activity's right arm.
    const [ux, uy, uz] = bodyPose.rightUpperArm
    const [lx, ly, lz] = bodyPose.rightLowerArm
    pose('rightUpperArm', THREE.MathUtils.lerp(ux, -1.25, scold), uy * (1 - scold), THREE.MathUtils.lerp(THREE.MathUtils.lerp(uz, 0.9, carried), 1.0, scold))
    pose('rightLowerArm', lx * (1 - scold), THREE.MathUtils.lerp(ly, 1.7, scold) + (reaction?.hand ? 0 : scold * Math.sin(t * 10) * 0.2), lz * (1 - scold))
    const shape = HAND_SHAPES[reaction?.hand]
    if (shape !== shownShape) {
      shownShape = shape
      if (shape) for (const finger of FINGERS) curlFinger('right', finger, shape[finger])
      else relaxHands()
    }
    pose('hips', ...bodyPose.hips)
    }
    if (reaction?.isSleepy && t > nextZ) {
      nextZ = t + 2.5
      spawnHearts('z')
    }
    vrm.update(dt)
  }
  renderer.render(scene, camera)
})
