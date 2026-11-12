// Floating avatar window. Claude Code talks to it through a loopback HTTP port.
const { app, BrowserWindow, globalShortcut, Menu, nativeImage, screen, Tray } = require('electron')
const { spawn, execFile } = require('child_process')
const os = require('os')
const http = require('http')
const fs = require('fs')
const path = require('path')
const { createPetDetector } = require('./pet.js')
const { createWorkTracker } = require('./work.js')
const { createLinePicker, createHoverDetector } = require('./lines.js')
const { synthesize, synthesizeNatural, naturalEngine, speechPieces } = require('./speech.js')
const { spanishToKatakana } = require('./spanish.js')
const I18N = require('./i18n.json')

const PORT = 8971
const WIDTH = 380
const HEIGHT = 560
const IDLE_LIMIT_MS = 30000
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.vrm': 'application/octet-stream',
}

// exit, not quit: quit is asynchronous and the rest of this file would still run.
if (!app.requestSingleInstanceLock()) app.exit(0)

let win = null
// The avatar window can die (GPU reset, renderer crash); everything that touches it checks first.
const alive = () => Boolean(win && !win.isDestroyed())
let quitting = false
let lastBeat = Date.now()
const stayOpen = process.env.CLAUDIA_CHAN_STAY === '1'
const CONFIG = path.join(__dirname, 'config.json')
const STYLE_PARTS = ['piel', 'pelo', 'ojos', 'ropa']
const detectPet = createPetDetector()
let pendingPets = 0
let tiredMinutes = 0
let isMoving = false
const MOVE_KEY = 'CommandOrControl+Alt+C'
const LISTEN_KEY = 'CommandOrControl+Alt+V'
const HIDE_KEY = 'CommandOrControl+Alt+H'
const MAX_LISTEN_MS = 60000
const SKIN = ['#fff4ef', '#ffe3e0', '#f9e6d6', '#f6dcc4']
const SETTINGS = {
  personalidad: ['yandere', 'tsundere', 'dulce', 'kuudere', 'onee-san'],
  voz: ['kokoro', 'elevenlabs', 'espanol', 'japones'],
  tono: ['grave', 'normal', 'agudo'],
  velocidad: ['lenta', 'normal', 'rapida'],
  tamano: ['chico', 'normal', 'grande'],
  pasear: ['on', 'off'],
  idioma: Object.keys(I18N),
}
const MODELS_DIR = path.join(__dirname, 'assets/models')
const CENTER_TRAVEL_MS = 1400
const CENTER_HOLD_MS = 12000
let isCentering = false
let recorder = null
let heard = []
let panel = null

function modelNames() {
  const extra = fs.existsSync(MODELS_DIR) ? fs.readdirSync(MODELS_DIR).filter(f => f.endsWith('.vrm')).map(f => f.slice(0, -4)) : []
  return ['sample', ...extra]
}

// The microphone is only open between two presses, and the recording is deleted after use.
function toggleListen() {
  if (recorder) {
    recorder.kill('SIGINT')
    return
  }
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'claudia-mic-'))
  const file = path.join(folder, 'mic.wav')
  const input = process.platform === 'darwin' ? ['-f', 'avfoundation', '-i', ':default'] : ['-f', 'pulse', '-i', 'default']
  const current = spawn('ffmpeg', ['-y', '-loglevel', 'error', ...input, '-ac', '1', '-ar', '16000', file], { stdio: 'ignore' })
  recorder = current
  const limit = setTimeout(() => current.kill('SIGINT'), MAX_LISTEN_MS)
  win?.webContents.send('claudia-chan', { type: 'listening', value: true })
  current.on('error', () => undefined)
  current.on('close', () => {
    clearTimeout(limit)
    recorder = null
    win?.webContents.send('claudia-chan', { type: 'listening', value: false })
    execFile(path.join(__dirname, 'vendor/whisper/bin/python'), [path.join(__dirname, 'transcribe.py'), file], { timeout: 120000 }, (error, stdout) => {
      fs.rmSync(folder, { recursive: true, force: true })
      const text = error ? '' : stdout.trim()
      if (text) heard.push(text)
    })
  })
}

function glide(toX, toY, ms) {
  if (!alive()) return Promise.resolve()
  const [fromX, fromY] = win.getPosition()
  const startedAt = Date.now()
  return new Promise(resolve => {
    const timer = setInterval(() => {
      const raw = Math.min(1, (Date.now() - startedAt) / ms)
      const eased = raw * raw * (3 - 2 * raw)
      if (!alive()) { clearInterval(timer); resolve(); return }
      win.setPosition(Math.round(fromX + (toX - fromX) * eased), Math.round(fromY + (toY - fromY) * eased))
      if (raw === 1) {
        clearInterval(timer)
        resolve()
      }
    }, 16)
  })
}

// When the clock runs out she crosses to the middle of the screen the user is on, then goes home.
async function comeToCenter() {
  if (isMoving || isCentering || !alive()) return

  isCentering = true
  const [homeX, homeY] = win.getPosition()
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  await glide(workArea.x + Math.round((workArea.width - WIDTH) / 2), workArea.y + Math.round((workArea.height - HEIGHT) / 2), CENTER_TRAVEL_MS)
  await new Promise(resolve => setTimeout(resolve, CENTER_HOLD_MS))
  await glide(homeX, homeY, CENTER_TRAVEL_MS)
  isCentering = false
}

const texts = () => I18N[readConfig().idioma] ?? I18N.es
const fill = (template, values) => template.replace(/\{(\w+)\}/g, (_, key) => values[key])

// Named spots on the screen she is on; the choice is remembered like a manual move.
function placeAt(where) {
  if (!alive()) return false
  const [x, y] = win.getPosition()
  const { workArea: a } = screen.getDisplayNearestPoint({ x, y })
  const left = a.x + 20
  const right = a.x + a.width - WIDTH - 20
  const top = a.y
  const bottom = a.y + a.height - HEIGHT
  const spots = {
    'top-left': [left, top], 'top-right': [right, top], 'bottom-left': [left, bottom], 'bottom-right': [right, bottom],
    center: [a.x + Math.round((a.width - WIDTH) / 2), a.y + Math.round((a.height - HEIGHT) / 2)],
  }
  if (!spots[where] || isMoving || isCentering) return false

  glide(...spots[where], 900).then(() => saveConfig({ x: spots[where][0], y: spots[where][1] }))
  return true
}

// Hide or show her without closing the app (the mic and the plugin keep working).
function toggleVisible() {
  if (!alive()) return
  if (win.isVisible()) win.hide()
  else win.showInactive()
  refreshTray()
}

// "Cerrar" sticks: the plugin does not relaunch her until a new claude-chan session or /claudia on.
function dismiss() {
  saveConfig({ dismissed: true })
  app.quit()
}

let tray = null
function refreshTray() {
  if (!tray) return
  const shown = alive() && win.isVisible()
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: shown ? 'Ocultar (Ctrl+Alt+H)' : 'Mostrar (Ctrl+Alt+H)', click: toggleVisible },
    { label: 'Hablarle (Ctrl+Alt+V)', click: toggleListen },
    { label: 'Moverla (Ctrl+Alt+C)', click: toggleMove },
    { label: 'Pasear 🚶‍♀️', click: stroll },
    { label: 'Bailar 💃', click: () => dance() },
    { label: 'Beso 💋', click: () => show({ type: 'doing', name: 'kiss', seconds: 1.8 }) },
    { label: 'Panel de ajustes', click: openPanel },
    { type: 'separator' },
    { label: 'Cerrar Claudia-chan', click: dismiss },
  ]))
}

function setupTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'assets/tray.png')))
  tray.setToolTip('Claudia-chan')
  refreshTray()
}

function openPanel() {
  if (panel && !panel.isDestroyed()) {
    panel.focus()
    return
  }
  panel = new BrowserWindow({ width: 520, height: 780, title: 'Claudia-chan', autoHideMenuBar: true })
  panel.loadURL(`http://127.0.0.1:${PORT}/panel.html`)
}

// --- Her own life on the desktop: strolling along the bottom of the screen, sitting on top of the
// window you are using, and going back to her spot to work alongside Claude.
const SEAT_Y = 410 // where her seat is, in window pixels, in the full-body view (measured on the models)
// Matches her steps (activities.js WALK_CADENCE/WALK_STRIDE) so her feet do not skate.
const WALK_PX_PER_S = 170
const BUSY_MS = 8000 // a work event keeps her at her spot this long
const canSeeWindows = process.platform === 'linux' && process.env.XDG_SESSION_TYPE !== 'wayland'
let life = { mode: 'stand', until: Date.now() + 20000 }
let lastWork = 0
let activeWin = null // the focused window (X11 only): { id, x, y, width, height }

function pollActiveWindow() {
  if (!canSeeWindows) return
  execFile('xdotool', ['getactivewindow', 'getwindowgeometry', '--shell'], { timeout: 1000 }, (error, stdout) => {
    if (error) {
      activeWin = null
      return
    }
    const v = Object.fromEntries(stdout.trim().split('\n').map(line => line.split('=')).map(([k, n]) => [k, Number(n)]))
    activeWin = { id: v.WINDOW, x: v.X, y: v.Y, width: v.WIDTH, height: v.HEIGHT }
  })
}

const show = event => { if (alive()) win.webContents.send('claudia-chan', event) }
const bottomOf = area => area.y + area.height - HEIGHT
const randomBetween = (a, b) => a + Math.random() * (b - a)

// Where she would sit on the active window, or null when there is no good spot (fullscreen, too high).
function perchSpot() {
  if (!activeWin) return null
  const area = screen.getDisplayNearestPoint({ x: activeWin.x + activeWin.width / 2, y: activeWin.y }).workArea
  const top = activeWin.y - SEAT_Y
  if (activeWin.width < 420 || activeWin.height > area.height - 40 || top < area.y - 60) return null
  const x = Math.round(activeWin.x + activeWin.width * randomBetween(0.55, 0.85) - WIDTH / 2)
  return { x: Math.max(area.x, Math.min(x, area.x + area.width - WIDTH)), y: top, id: activeWin.id, dx: x - activeWin.x }
}

function walkTo(x, y, then) {
  const [fromX, fromY] = win.getPosition()
  life = { mode: 'walk', to: { x, y }, then, from: { x: fromX, y: fromY }, at: Date.now() }
  show({ type: 'body', mode: 'full' })
  show({ type: 'doing', name: 'walk', dir: x >= fromX ? 1 : -1 })
}

// Walking moves the window smoothly (every frame, by elapsed time) at the speed of her steps.
function walkStep() {
  if (!alive() || life.mode !== 'walk' || isMoving) return
  const { from, to, at } = life
  const total = Math.hypot(to.x - from.x, to.y - from.y)
  const done = Math.min(total, ((Date.now() - at) / 1000) * WALK_PX_PER_S)
  if (done >= total) {
    win.setPosition(to.x, to.y)
    void arrive(screen.getDisplayNearestPoint({ x: to.x + WIDTH / 2, y: to.y + HEIGHT / 2 }).workArea)
    return
  }
  const k = total ? done / total : 1
  win.setPosition(Math.round(from.x + (to.x - from.x) * k), Math.round(from.y + (to.y - from.y) * k))
}

async function hop(x, y) {
  life = { mode: 'hop' }
  show({ type: 'body', mode: 'full' })
  show({ type: 'doing', name: 'celebrate', seconds: 0.8 })
  await glide(x, y, 700)
}

function standAt(area, seconds) {
  life = { mode: 'stand', until: Date.now() + seconds * 1000 }
  show({ type: 'body', mode: 'bust' })
  show({ type: 'doing', name: 'idle' })
}

async function arrive(area) {
  const { then } = life
  if (then?.perch) {
    await hop(then.perch.x, then.perch.y)
    life = { mode: 'perch', id: then.perch.id, dx: then.perch.dx, until: Date.now() + randomBetween(40, 120) * 1000 }
    show({ type: 'doing', name: 'sit' })
    return
  }
  standAt(area, randomBetween(20, 45))
}

// A little dance in the full-body view: asked for (/claudia baila, the tray) or on her own when bored.
function dance(seconds = 10) {
  life = { mode: 'dance', until: Date.now() + seconds * 1000 }
  show({ type: 'body', mode: 'full' })
  show({ type: 'doing', name: 'dance', dir: Math.floor(Math.random() * 3), seconds })
}

// A walk right now (tray, /event "stroll"): to the far side of the screen she is on.
function stroll() {
  if (!alive()) return
  const [x, y] = win.getPosition()
  const area = screen.getDisplayNearestPoint({ x: x + WIDTH / 2, y: y + HEIGHT / 2 }).workArea
  const middle = area.x + (area.width - WIDTH) / 2
  walkTo(Math.round(x > middle ? area.x + 40 : area.x + area.width - WIDTH - 40), bottomOf(area))
}

// Work started: she goes back to her spot, waist-up, to type along.
async function goToWork(area) {
  const home = savedPosition(area)
  life = { mode: 'work' }
  show({ type: 'body', mode: 'bust' })
  const [x, y] = win.getPosition()
  if (Math.abs(x - home.x) + Math.abs(y - home.y) > 4) await glide(home.x, home.y, 600)
}

function live(area) {
  if (isMoving || isCentering || life.mode === 'hop') return
  const now = Date.now()
  // A dance ends even with strolling off.
  if (life.mode === 'dance' && now >= life.until) {
    standAt(area, randomBetween(15, 30))
    return
  }
  if (readCachedWalk() !== 'on') return
  const [x, y] = win.getPosition()
  if (now - lastWork < BUSY_MS) {
    if (life.mode !== 'work') void goToWork(area)
    return
  }
  if (life.mode === 'work') {
    standAt(area, randomBetween(15, 30))
    return
  }
  if (life.mode === 'dance') {
    if (now >= life.until) standAt(area, randomBetween(15, 30))
    return
  }
  if (life.mode === 'walk') return // walkStep moves her, at 60 fps
  if (life.mode === 'perch') {
    // Stay with the window if you move it; hop down when it goes away or she gets bored.
    if (activeWin?.id === life.id) {
      const want = { x: activeWin.x + life.dx, y: activeWin.y - SEAT_Y }
      if (Math.abs(want.x - x) + Math.abs(want.y - y) > 2) win.setPosition(Math.round(want.x), Math.round(want.y))
    }
    if (now < life.until) return
    const ground = screen.getDisplayNearestPoint({ x, y }).workArea
    void hop(x, bottomOf(ground)).then(() => standAt(ground, randomBetween(15, 30)))
    return
  }
  if (now < life.until) return
  const spot = Math.random() < 0.5 ? perchSpot() : null
  if (spot) {
    const ground = screen.getDisplayNearestPoint({ x: spot.x, y: spot.y + SEAT_Y }).workArea
    walkTo(spot.x, bottomOf(ground), { perch: spot })
    return
  }
  if (Math.random() < 0.15) {
    dance(randomBetween(6, 12))
    return
  }
  if (Math.random() < 0.75) walkTo(Math.round(randomBetween(area.x, area.x + area.width - WIDTH)), bottomOf(area))
  else standAt(area, randomBetween(20, 40))
}

let cachedWalk = null
function readCachedWalk() {
  cachedWalk ??= readConfig().pasear ?? 'on'
  return cachedWalk
}

// While moving she rides the cursor, so the window never has to take a click.
function toggleMove() {
  if (!alive()) return
  isMoving = !isMoving
  if (!isMoving) {
    const [x, y] = win.getPosition()
    saveConfig({ x, y })
  }
  win.webContents.send('claudia-chan', { type: 'moving', value: isMoving })
}

function savedPosition(area) {
  const { x, y } = readConfig()
  const isOnScreen =
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    screen.getAllDisplays().some(({ bounds }) =>
      x >= bounds.x && x < bounds.x + bounds.width && y >= bounds.y && y < bounds.y + bounds.height)

  return isOnScreen ? { x, y } : { x: area.x + area.width - WIDTH - 20, y: area.y + area.height - HEIGHT }
}
const work = createWorkTracker(readConfig().work)
const TIRED_LINES = [
  minutes => `Llevas ${minutes} minutos seguidos. Toma agua, yo te espero.`,
  minutes => `${minutes} minutos sin parar... ¿te estiras un poquito? Por mí.`,
]
const REST_VOICE = ['お兄ちゃん、もう十分だよ。ちゃんと休んでね。', 'お兄ちゃん、がんばりすぎだよ。少し休もう？', 'お兄ちゃん、もうおしまい。休まなきゃだめだよ。']
const LATE_LINES = [
  () => 'Ya es de madrugada. El código sigue aquí mañana, ve a dormir.',
  () => '¿Sigues sin dormir? Cierra todo, descansa.',
]
const AMBIENT_MIN_MS = 6 * 60000
const AMBIENT_MAX_MS = 15 * 60000
const ACTIVE_MS = 15 * 60000
const pickLine = createLinePicker()
const detectHover = createHoverDetector()
let nextAmbient = Date.now() + AMBIENT_MIN_MS

function bond() {
  const { firstSeen = Date.now(), petCount = 0, wins = 0 } = readConfig()
  const days = Math.floor((Date.now() - firstSeen) / 86400000)
  const affection = petCount + days * 2 + wins * 3

  return { days, pets: petCount, affection, level: 1 + Math.floor(affection / 25) }
}

function sayLine() {
  if ((readConfig().idioma ?? 'es') !== 'es') return
  win?.webContents.send('claudia-chan', pickLine({ hour: new Date().getHours(), ...bond() }))
}

// Only while the user is around: nobody talks to an empty chair.
function speakWhenDue() {
  const { lastActivity } = work.snapshot()
  const isAround = lastActivity !== null && Date.now() - lastActivity < ACTIVE_MS
  if (isMoving || !isAround || Date.now() < nextAmbient) return

  nextAmbient = Date.now() + AMBIENT_MIN_MS + Math.random() * (AMBIENT_MAX_MS - AMBIENT_MIN_MS)
  sayLine()
}

function warnIfTired() {
  const now = new Date()
  const warning = work.check(now.getTime(), now.getHours())
  if (!warning) return

  saveConfig({ work: work.snapshot() })
  tiredMinutes = warning.minutes
  const lines = warning.isLate ? LATE_LINES : TIRED_LINES
  const isSpanish = (readConfig().idioma ?? 'es') === 'es'
  scoldToRest(isSpanish ? lines[Math.floor(Math.random() * lines.length)](warning.minutes) : fill(texts()[warning.isLate ? 'late' : 'tired'], { m: warning.minutes }))
}

function scoldToRest(line, seconds = 8) {
  win?.webContents.send('claudia-chan', { type: 'react', name: 'descansa', seconds, line })
  if (naturalEngine(readConfig())) {
    speakNatural(line)
    return
  }
  const hasAccent = (readConfig().voz ?? 'espanol') === 'espanol'
  speak(hasAccent ? texts().kana : REST_VOICE[Math.floor(Math.random() * REST_VOICE.length)], 'bashful')
}

function warnOutOfHours() {
  const { hours } = readConfig()
  const now = new Date()
  if (!work.checkHours(now.getTime(), now.getHours(), hours)) return

  saveConfig({ work: work.snapshot() })
  scoldToRest(fill(texts().hours, hours), 14)
  comeToCenter()
}

// Speaks the whole text piece by piece: each piece is queued behind the one playing, and a new
// reply replaces whatever was still waiting from the previous one.
let speechRun = 0
async function speakNatural(text) {
  const run = ++speechRun
  const config = readConfig()
  const pieces = speechPieces(text)
  for (const [i, piece] of pieces.entries()) {
    if (run !== speechRun) return
    try {
      const audio = await synthesizeNatural(piece, config)
      if (audio && run === speechRun) win?.webContents.send('claudia-chan', { type: 'speak', audio: audio.toString('base64'), queue: i > 0 })
    } catch (error) {
      console.error('speech failed', error.message)
      return
    }
  }
}

function speak(text, voice) {
  return synthesize(text, voice, readConfig())
    .then(audio => win?.webContents.send('claudia-chan', { type: 'speak', audio: audio.toString('base64') }))
    .catch(error => console.error('speech failed', error.message))
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG, 'utf8'))
  } catch {
    return {}
  }
}

function saveConfig(change) {
  fs.writeFileSync(CONFIG, JSON.stringify({ ...readConfig(), ...change }, null, 2))
}

function readBody(req) {
  return new Promise(resolve => {
    let body = ''
    req.on('data', chunk => {
      body += chunk
      if (body.length > 10000) req.destroy()
    })
    req.on('end', () => resolve(body))
  })
}

async function handle(req, res) {
  if (req.method === 'POST' && req.url === '/event') {
    // The custom header makes a browser preflight, so web pages cannot post here.
    if (req.headers['x-claudia-chan'] !== '1') {
      res.writeHead(403).end()
      return
    }
    lastBeat = Date.now()
    try {
      const event = JSON.parse(await readBody(req))
      if (event.type === 'beat') {
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ pets: pendingPets, tiredMinutes, name: readConfig().name, personalidad: readConfig().personalidad, voz: readConfig().voz, idioma: readConfig().idioma, bond: bond() }))
        pendingPets = 0
        tiredMinutes = 0
        return
      }
      // Claude is working: she goes back to her spot to work along.
      if (event.type === 'doing' && ['typing', 'reading', 'nervous', 'facepalm'].includes(event.name)) lastWork = Date.now()
      if (event.type === 'activity') {
        work.activity(Date.now())
        saveConfig({ work: work.snapshot() })
        res.writeHead(204).end()
        return
      }
      if (event.type === 'ambient') {
        sayLine()
        res.writeHead(204).end()
        return
      }
      if (event.type === 'speak' && typeof event.text === 'string') {
        // A natural voice reads the real text; Open JTalk needs it spelled in kana.
        if (event.natural && naturalEngine(readConfig())) speakNatural(event.text)
        else speak(event.isSpanish ? spanishToKatakana(event.text) : event.text, event.voice)
        res.writeHead(204).end()
        return
      }
      if (event.type === 'hours') {
        const hours = event.value
        const isHour = n => Number.isInteger(n) && n >= 0 && n <= 23
        if (hours !== null && !(isHour(hours?.from) && isHour(hours?.to) && hours.from !== hours.to)) {
          res.writeHead(400).end()
          return
        }
        saveConfig({ hours })
        res.writeHead(204).end()
        return
      }
      if (event.type === 'place') {
        res.writeHead(placeAt(event.where) ? 204 : 400).end()
        return
      }
      if (event.type === 'heard') {
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ text: heard.shift() ?? '' }))
        return
      }
      if (event.type === 'stroll') {
        stroll()
        res.writeHead(204).end()
        return
      }
      if (event.type === 'dance') {
        dance()
        res.writeHead(204).end()
        return
      }
      if (event.type === 'listen') {
        toggleListen()
        res.writeHead(204).end()
        return
      }
      if (event.type === 'panel') {
        openPanel()
        res.writeHead(204).end()
        return
      }
      if (event.type === 'game') {
        if (event.won === true) saveConfig({ wins: (readConfig().wins ?? 0) + 1 })
        res.writeHead(204).end()
        return
      }
      if (event.type === 'setting') {
        const isValid = event.key === 'modelo' ? modelNames().includes(event.value) : SETTINGS[event.key]?.includes(event.value)
        if (!isValid) {
          res.writeHead(400).end()
          return
        }
        saveConfig({ [event.key]: event.value })
        if (event.key === 'pasear') cachedWalk = event.value
        if (event.key === 'modelo') win?.reload()
        else win?.webContents.send('claudia-chan', event)
        res.writeHead(204).end()
        return
      }
      if (event.type === 'move') {
        toggleMove()
        res.writeHead(204).end()
        return
      }
      if (event.type === 'name' && typeof event.value === 'string') saveConfig({ name: event.value.slice(0, 24) })
      if (event.type === 'mute') saveConfig({ muted: Boolean(event.value) })
      if (event.type === 'style') {
        const isValid = STYLE_PARTS.includes(event.part) && (event.color === null || /^#[0-9a-f]{6}$/i.test(event.color)) && (event.part !== 'piel' || event.color === null || SKIN.includes(event.color.toLowerCase()))
        if (!isValid) {
          res.writeHead(400).end()
          return
        }
        saveConfig({ [event.part]: event.color })
      }
      if (alive()) win.webContents.send('claudia-chan', event)
      res.writeHead(204).end()
    } catch {
      res.writeHead(400).end()
    }
    return
  }

  const urlPath = req.url.split('?')[0]
  if (urlPath === '/models') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(modelNames()))
    return
  }
  const file = path.normalize(path.join(__dirname, urlPath === '/' ? 'index.html' : urlPath))
  if (!file.startsWith(__dirname + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404).end()
    return
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
}

function openAvatar(area) {
  win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    ...savedPosition(area),
    transparent: true,
    frame: false,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true,
    focusable: false,
    backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), autoplayPolicy: 'no-user-gesture-required' },
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true)
  win.setIgnoreMouseEvents(true)
  win.loadURL(`http://127.0.0.1:${PORT}/`)
  // If the page crashes reload it; if the window itself goes away, bring her back instead of leaving a headless app.
  win.webContents.on('render-process-gone', () => { if (alive()) win.reload() })
  win.on('closed', () => {
    win = null
    if (!quitting) setTimeout(() => openAvatar(screen.getPrimaryDisplay().workArea), 1000)
  })
}

function createWindow() {
  const area = screen.getPrimaryDisplay().workArea
  openAvatar(area)
  setInterval(warnIfTired, 30000)
  setInterval(warnOutOfHours, 30000)
  setInterval(pollActiveWindow, 1000)
  setInterval(walkStep, 16)
  if (!readConfig().firstSeen) saveConfig({ firstSeen: Date.now() })

  setInterval(() => {
    if (!alive()) return
    const cursor = screen.getCursorScreenPoint()
    if (isMoving) win.setPosition(cursor.x - Math.round(WIDTH / 2), cursor.y - 120)
    const [hereX, hereY] = win.getPosition()
    live(screen.getDisplayNearestPoint({ x: hereX + WIDTH / 2, y: hereY + HEIGHT / 2 }).workArea)
    const bounds = win.getBounds()
    win.webContents.send('claudia-chan', {
      type: 'cursor',
      x: (cursor.x - (bounds.x + bounds.width / 2)) / area.width,
      y: (cursor.y - (bounds.y + bounds.height * 0.2)) / area.height,
    })
    if (!isMoving && detectPet(cursor.x - bounds.x, cursor.y - bounds.y, Date.now())) {
      pendingPets += 1
      saveConfig({ petDone: true, petCount: (readConfig().petCount ?? 0) + 1 })
      win.webContents.send('claudia-chan', { type: 'pet' })
    }
    const noticed = isMoving ? null : detectHover(cursor.x - bounds.x, cursor.y - bounds.y, Date.now())
    if (noticed) win.webContents.send('claudia-chan', (readConfig().idioma ?? 'es') === 'es' ? noticed : { ...noticed, line: undefined })
    if (!stayOpen && Date.now() - lastBeat > IDLE_LIMIT_MS) app.quit()
  }, 50)
}

app.commandLine.appendSwitch('enable-transparent-visuals')
app.whenReady().then(() => {
  app.dock?.hide()
  // Whoever started her wants her: a previous "Cerrar" no longer applies.
  saveConfig({ dismissed: false })
  http.createServer(handle).on('error', () => app.exit(1)).listen(PORT, '127.0.0.1', () => {
    createWindow()
    setupTray()
  })
  console.log('move shortcut registered:', globalShortcut.register(MOVE_KEY, toggleMove))
  console.log('listen shortcut registered:', globalShortcut.register(LISTEN_KEY, toggleListen))
  console.log('hide shortcut registered:', globalShortcut.register(HIDE_KEY, toggleVisible))
})
app.on('before-quit', () => { quitting = true })
app.on('will-quit', () => globalShortcut.unregisterAll())
