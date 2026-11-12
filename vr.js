// Claudia-chan in a headset: WebXR mixed reality (passthrough) or VR, the same model, colours, poses and
// motion capture as the desktop avatar. She gets every event the desktop avatar gets (/stream), so she
// works, dances, kisses, reacts and speaks along with the claude-chan session; you talk to her by holding
// a controller trigger (the audio goes to the PC: Whisper, then the session answers).
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { ARButton } from 'three/addons/webxr/ARButton.js'
import { VRButton } from 'three/addons/webxr/VRButton.js'
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm'
import { ACTIVITIES, REST, makeProps } from '/activities.js'
import { STYLE_MATCH, applyStyle } from '/style.js'
import { loadMixamoFile } from '/mixamo.js'

const KEY = new URLSearchParams(location.search).get('k') ?? ''
const withKey = url => `${url}${url.includes('?') ? '&' : '?'}k=${KEY}`
const api = (url, options = {}) => fetch(withKey(url), { ...options, headers: { 'x-claudia-chan': '1', 'x-claudia-key': KEY, ...(options.headers ?? {}) } })
const stateText = document.getElementById('state')

// --- scene
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
renderer.setPixelRatio(window.devicePixelRatio)
renderer.setSize(innerWidth, innerHeight)
renderer.xr.enabled = true
renderer.xr.setReferenceSpaceType('local-floor')
document.body.append(renderer.domElement)
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.05, 50)
camera.position.set(0, 1.5, 1.4)
const orbit = new OrbitControls(camera, renderer.domElement)
orbit.target.set(0, 1.1, -1.2)
orbit.update()
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
})
// The desktop avatar's light (toon materials go flat white or black with more): a key light from where
// you stand, toward her, plus a soft ambient.
const keyLight = new THREE.DirectionalLight(0xffffff, 2.2)
scene.add(keyLight, keyLight.target, new THREE.AmbientLight(0xffffff, 0.45))

// A soft room for VR and the browser preview; hidden in mixed reality, where your real room is the room.
const room = new THREE.Group()
room.add(new THREE.Mesh(new THREE.CircleGeometry(6, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xf3e3ee })))
const grid = new THREE.PolarGridHelper(6, 12, 8, 64, 0xe8c8da, 0xefd6e4)
grid.position.y = 0.002
room.add(grid)
scene.add(room)
// No scene background: her glowing straps blend like on the desktop; the page colour shows through instead.

// --- XR entry: mixed reality when the headset can, VR otherwise
const xrSupported = async mode => (navigator.xr ? navigator.xr.isSessionSupported(mode).catch(() => false) : false)
const isAR = await xrSupported('immersive-ar')
document.body.append(isAR
  ? ARButton.createButton(renderer, { requiredFeatures: ['local-floor'], optionalFeatures: ['hand-tracking'] })
  : VRButton.createButton(renderer))
renderer.xr.addEventListener('sessionstart', () => {
  const ar = renderer.xr.getSession()?.environmentBlendMode !== 'opaque' && isAR
  room.visible = !ar
  startMic()
})
renderer.xr.addEventListener('sessionend', () => {
  room.visible = true
})

// --- her
const config = await api('/config.json').then(r => r.json()).catch(() => ({}))
const modelFile = (config.modelo ?? 'vita') === 'sample' ? '/assets/sample.vrm' : `/assets/models/${config.modelo ?? 'vita'}.vrm`
const gltf = await new GLTFLoader().register(parser => new VRMLoaderPlugin(parser)).loadAsync(modelFile)
const vrm = gltf.userData.vrm
VRMUtils.removeUnnecessaryVertices(gltf.scene)
VRMUtils.combineSkeletons(gltf.scene)
VRMUtils.rotateVRM0(vrm)
const baseYaw = vrm.scene.rotation.y
const body = new THREE.Group() // where she stands in your room; she faces +z (you) at yaw 0
body.position.set(0, 0, -1.2)
body.add(vrm.scene)
scene.add(body)
for (const part of Object.keys(STYLE_MATCH)) applyStyle(vrm, part, config[part] ?? null)
const lookTarget = new THREE.Object3D()
scene.add(lookTarget)
vrm.lookAt.target = lookTarget
stateText.textContent = 'Lista. Entra con el botón de abajo.'

const flip = vrm.meta.metaVersion === '0' ? -1 : 1
const pose = (name, x, y, z) => vrm.humanoid.getNormalizedBoneNode(name)?.rotation.set(flip * x, y, flip * z)
const props = makeProps()
props.laptop.visible = false
// In the group that faces you (the model itself is turned around on older VRMs).
body.add(props.laptop)
props.laptop.position.set(0, 1.0, 0.3)

// Motion capture, as on the desktop (assets/animations/<activity>[-n].fbx).
const mocap = {}
const mixer = new THREE.AnimationMixer(vrm.scene)
for (const file of await api('/animations').then(r => r.json()).catch(() => [])) {
  const clips = (await loadMixamoFile(withKey(`/assets/animations/${file}`), vrm).catch(() => [])).filter(c => c.clip.tracks.length)
  const isFbx = /\.fbx$/i.test(file)
  const picked = isFbx ? [clips.sort((a, b) => b.clip.tracks.length - a.clip.tracks.length)[0]].filter(Boolean) : clips
  for (const { name, clip } of picked) (mocap[(isFbx ? file.replace(/\.fbx$/i, '') : name).replace(/[-_ ]?\d+$/, '').toLowerCase()] ??= []).push(clip)
}

// --- what she is doing
const EXPRESSIONS = { feliz: { happy: 1 }, triste: { sad: 1 }, sorprendida: { surprised: 1 }, enojada: { angry: 1 }, pensando: { relaxed: 0.4 }, concentrada: { angry: 0.25 }, guino: { happy: 0.7, blinkLeft: 1 }, sonrojada: { happy: 0.6 }, preocupada: { sad: 0.6, surprised: 0.3 } }
const MOODS = { normal: { relaxed: 0.3 }, enamorada: { happy: 1 }, celosa: { angry: 0.7 }, yandere: { happy: 0.6, angry: 0.4 } }
let mood = 'normal', face = null, faceUntil = 0
let activity = 'idle', activityArg, activityStart = 0, activityUntil = 0
let speakUntil = 0, blink = 0, nextBlink = 2
const bodyPose = Object.fromEntries(Object.entries(REST).map(([b, r]) => [b, [...r]]))
let playing = null, action = null
// Wandering around your room between things to do.
let walkTo = null, nextWander = 8
const clock = new THREE.Clock()

function doThing(name, seconds, arg) {
  if (!ACTIVITIES[name]) return
  activity = name
  activityArg = arg
  activityStart = clock.elapsedTime
  activityUntil = seconds ? clock.elapsedTime + seconds : name === 'idle' ? 0 : clock.elapsedTime + 90
  if (name !== 'walk') walkTo = null
  if (name === 'kiss') hearts('💋')
}

// --- speech bubble and the "your space" panel: what you said, what she answered
function textPanel(width, height) {
  const canvas = Object.assign(document.createElement('canvas'), { width: width * 4, height: height * 4 })
  const texture = new THREE.CanvasTexture(canvas)
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width / 400, height / 400), new THREE.MeshBasicMaterial({ map: texture, transparent: true }))
  const draw = (lines, { bg = '#fffffff0', title = '' } = {}) => {
    const c = canvas.getContext('2d')
    c.clearRect(0, 0, canvas.width, canvas.height)
    if (!lines.length && !title) { texture.needsUpdate = true; mesh.visible = false; return }
    mesh.visible = true
    c.fillStyle = bg
    c.beginPath(); c.roundRect(0, 0, canvas.width, canvas.height, 60); c.fill()
    c.fillStyle = '#ff5fa2'; c.font = '700 96px system-ui'
    let y = 130
    if (title) { c.fillText(title, 60, y); y += 130 }
    c.fillStyle = '#33263a'; c.font = '500 86px system-ui'
    for (const line of lines) {
      for (const row of wrap(c, line, canvas.width - 120)) {
        if (y > canvas.height - 30) break
        c.fillText(row, 60, y)
        y += 108
      }
      y += 30
    }
    texture.needsUpdate = true
  }
  return { mesh, draw }
}
function wrap(c, text, max) {
  const rows = []
  let row = ''
  for (const word of text.split(/\s+/)) {
    const next = row ? `${row} ${word}` : word
    if (c.measureText(next).width > max && row) { rows.push(row); row = word } else row = next
  }
  if (row) rows.push(row)
  return rows
}
const bubble = textPanel(300, 90)
bubble.mesh.position.set(0, 1.85, -1.1)
scene.add(bubble.mesh)
let bubbleUntil = 0
const say = line => { if (!line) return; bubble.draw([line]); bubbleUntil = clock.elapsedTime + 6 }
const space = textPanel(420, 300)
space.mesh.position.set(0.95, 1.35, -1.0)
space.mesh.rotation.y = -0.45
scene.add(space.mesh)
let youSaid = '', sheSaid = ''
const drawSpace = () => space.draw([youSaid && `Tú: ${youSaid}`, sheSaid && `Ella: ${sheSaid}`].filter(Boolean), { title: 'Claudia-chan · Claude Code' })
drawSpace()

function hearts(symbol = '♥') {
  for (let i = 0; i < 6; i++) {
    const c = Object.assign(document.createElement('canvas'), { width: 64, height: 64 })
    const g = c.getContext('2d'); g.font = '52px system-ui'; g.fillStyle = '#ff4d94'; g.fillText(symbol, 4, 52)
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true }))
    sprite.scale.setScalar(0.12)
    sprite.position.copy(body.position).add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 1.5, 0.2))
    sprite.userData.v = 0.35 + Math.random() * 0.3
    sprite.userData.born = clock.elapsedTime + i * 0.1
    scene.add(sprite)
    floaters.push(sprite)
  }
}
const floaters = []

// --- voice out: the PC sends her speech as audio
const audio = new AudioContext()
let speechEnds = Promise.resolve()
async function play(base64, queue) {
  if (audio.state === 'suspended') await audio.resume()
  const buffer = await audio.decodeAudioData(Uint8Array.from(atob(base64), c => c.charCodeAt(0)).buffer)
  if (queue) await speechEnds
  const source = audio.createBufferSource()
  source.buffer = buffer
  source.connect(audio.destination)
  speechEnds = new Promise(resolve => { source.onended = resolve })
  source.start()
  speakUntil = clock.elapsedTime + buffer.duration
}

// --- events from the PC (same stream the desktop avatar gets)
function connect() {
  const source = new EventSource(withKey('/stream'))
  source.onopen = () => { stateText.textContent = 'Conectada a tu PC' }
  source.onerror = () => { stateText.textContent = 'Sin conexión con tu PC… reintentando' }
  source.onmessage = message => {
    const e = JSON.parse(message.data)
    if (e.type === 'doing') doThing(e.name, e.seconds, e.dir)
    else if (e.type === 'react') { face = EXPRESSIONS[e.name] ?? face; faceUntil = clock.elapsedTime + (e.seconds ?? 3); say(e.line) }
    else if (e.type === 'speak' && e.audio) play(e.audio, e.queue).catch(console.error)
    else if (e.type === 'heard') { youSaid = e.text || youSaid; drawSpace() }
    else if (e.type === 'said') { sheSaid = e.text; drawSpace() }
    else if (e.type === 'asked') { youSaid = e.text; drawSpace() }
    else if (e.type === 'pet') hearts()
    else if (MOODS[e.mood]) { mood = e.mood; say(e.line) }
    else if (e.line) say(e.line)
  }
}
connect()

// --- voice in: hold the trigger (or the button) to talk
let recorder = null, chunks = []
async function startMic() {
  if (recorder) return
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    recorder = new MediaRecorder(stream)
    recorder.ondataavailable = e => chunks.push(e.data)
    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: recorder.mimeType })
      chunks = []
      stateText.textContent = 'Te escuché, entendiendo…'
      const { text } = await api('/audio', { method: 'POST', body: blob }).then(r => r.json()).catch(() => ({ text: '' }))
      youSaid = text || '(no te entendí)'
      drawSpace()
      stateText.textContent = text ? `Te entendí: “${text}”` : 'No te entendí, intenta otra vez'
    }
  } catch {
    stateText.textContent = 'Sin micrófono: dale permiso al navegador'
  }
}
const listen = on => {
  if (!recorder) return startMic().then(() => on && listen(true))
  if (on && recorder.state === 'inactive') { chunks = []; recorder.start(); doThing('listening', 30); stateText.textContent = 'Te escucho…' }
  if (!on && recorder.state === 'recording') { recorder.stop(); doThing('idle') }
}
const talk = document.getElementById('talk')
talk.onpointerdown = () => { listen(true); talk.classList.add('on') }
talk.onpointerup = talk.onpointerleave = () => { listen(false); talk.classList.remove('on') }
for (const i of [0, 1]) {
  const controller = renderer.xr.getController(i)
  controller.addEventListener('selectstart', () => listen(true))
  controller.addEventListener('selectend', () => listen(false))
  scene.add(controller)
}

// --- every frame
const eye = new THREE.Vector3(), toYou = new THREE.Vector3()
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1)
  const t = clock.elapsedTime
  const viewer = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera
  viewer.getWorldPosition(eye)
  lookTarget.position.copy(eye)
  keyLight.position.copy(eye).add(new THREE.Vector3(0.2, 0.6, 0))
  keyLight.target.position.copy(body.position).setY(1.2)

  // Timed things end; now and then she wanders to another spot near you.
  if (activityUntil && t > activityUntil) doThing('idle')
  if (activity === 'idle' && t > nextWander) {
    const angle = Math.random() * Math.PI * 2, radius = 0.9 + Math.random() * 0.8
    walkTo = new THREE.Vector3(eye.x + Math.cos(angle) * radius, 0, eye.z + Math.sin(angle) * radius - 0.6)
    doThing('walk', 0)
    activityUntil = 0
    nextWander = t + 25 + Math.random() * 30
  }
  let yawGoal
  if (walkTo) {
    const d = walkTo.clone().sub(body.position).setY(0)
    if (d.length() < 0.05) { walkTo = null; doThing('idle') }
    else {
      body.position.addScaledVector(d.normalize(), Math.min(d.length(), 0.5 * dt))
      yawGoal = Math.atan2(d.x, d.z)
    }
  }
  // Otherwise she turns to face you.
  if (yawGoal === undefined) { toYou.copy(eye).sub(body.position); yawGoal = Math.atan2(toYou.x, toYou.z) }
  let diff = yawGoal - body.rotation.y
  diff = Math.atan2(Math.sin(diff), Math.cos(diff))
  body.rotation.y += diff * Math.min(1, dt * 4)

  // The pose: recorded motion if there is one for this, else the hand-made one (no 'turn' here: she walks for real).
  const shown = activity === 'idle' && (mood === 'celosa' || mood === 'yandere') ? 'pout' : activity
  const goal = ACTIVITIES[shown](t, activityArg, t - activityStart)
  const clip = mocap[shown]?.[(Number(activityArg) || 0) % (mocap[shown]?.length || 1)] ?? null
  if (clip !== playing) {
    action?.fadeOut(0.3)
    action = clip ? mixer.clipAction(clip).reset().fadeIn(0.3).play() : null
    playing = clip
  }
  vrm.scene.rotation.y = baseYaw
  if (clip) mixer.update(dt)
  else {
    for (const bone of Object.keys(REST)) {
      const target = goal[bone] ?? REST[bone]
      for (let i = 0; i < 3; i++) bodyPose[bone][i] = THREE.MathUtils.damp(bodyPose[bone][i], target[i], goal.snappy ? 16 : 7, dt)
      pose(bone, ...bodyPose[bone])
    }
    vrm.scene.position.y = THREE.MathUtils.damp(vrm.scene.position.y, Math.max(0, goal.bounce ?? 0), 12, dt)
  }
  props.laptop.visible = Boolean(goal.laptop)
  if (goal.laptop) props.drawScreen(t)

  // Face: a reaction over the mood, blinking, the mouth while she speaks.
  if (t > faceUntil) face = null
  const target = face ?? MOODS[mood]
  for (const name of ['relaxed', 'happy', 'angry', 'sad', 'surprised', 'blinkLeft']) {
    const m = vrm.expressionManager
    m.setValue(name, THREE.MathUtils.damp(m.getValue(name) ?? 0, target[name] ?? 0, 6, dt))
  }
  nextBlink -= dt
  if (nextBlink <= 0) { blink = 1; nextBlink = 2 + Math.random() * 4 }
  blink = Math.max(0, blink - dt * 7)
  vrm.expressionManager.setValue('blink', Math.min(1, blink * 1.4))
  vrm.expressionManager.setValue('aa', t < speakUntil ? 0.2 + 0.5 * Math.abs(Math.sin(t * 11)) : 0)

  // The bubble floats over her head; the panel stays beside her, both facing you.
  bubble.mesh.position.set(body.position.x, 1.85, body.position.z + 0.05)
  bubble.mesh.lookAt(eye)
  if (t > bubbleUntil) bubble.draw([])
  space.mesh.lookAt(eye)
  for (const f of [...floaters]) {
    if (t < f.userData.born) continue
    f.position.y += f.userData.v * dt
    f.material.opacity = Math.max(0, 1 - (t - f.userData.born) / 1.6)
    if (f.material.opacity === 0) { scene.remove(f); floaters.splice(floaters.indexOf(f), 1) }
  }
  vrm.update(dt)
  if (!renderer.xr.isPresenting) orbit.update()
  renderer.render(scene, camera)
})
