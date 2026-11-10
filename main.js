// Floating avatar window. Claude Code talks to it through a loopback HTTP port.
const { app, BrowserWindow, globalShortcut, screen } = require('electron')
const { spawn, execFile } = require('child_process')
const os = require('os')
const http = require('http')
const fs = require('fs')
const path = require('path')
const { createPetDetector } = require('./pet.js')
const { createWorkTracker } = require('./work.js')
const { createLinePicker, createHoverDetector } = require('./lines.js')
const { synthesize } = require('./speech.js')
const { spanishToKatakana } = require('./spanish.js')

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
const MAX_LISTEN_MS = 60000
const SKIN = ['#fff4ef', '#ffe3e0', '#f9e6d6', '#f6dcc4']
const SETTINGS = {
  personalidad: ['yandere', 'tsundere', 'dulce', 'kuudere', 'onee-san'],
  voz: ['espanol', 'japones'],
  tono: ['grave', 'normal', 'agudo'],
  velocidad: ['lenta', 'normal', 'rapida'],
  tamano: ['chico', 'normal', 'grande'],
  pasear: ['on', 'off'],
}
const MODELS_DIR = path.join(__dirname, 'assets/models')
const WALK_STEP = 1.5
let recorder = null
let heard = []
let walkDir = 1
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

function openPanel() {
  if (panel && !panel.isDestroyed()) {
    panel.focus()
    return
  }
  panel = new BrowserWindow({ width: 520, height: 780, title: 'Claudia-chan', autoHideMenuBar: true })
  panel.loadURL(`http://127.0.0.1:${PORT}/panel.html`)
}

function walk(area) {
  if (isMoving || readCachedWalk() !== 'on') return
  const [x] = win.getPosition()
  const next = x + walkDir * WALK_STEP
  if (next < area.x || next + WIDTH > area.x + area.width) walkDir = -walkDir
  win.setPosition(Math.round(Math.max(area.x, Math.min(next, area.x + area.width - WIDTH))), area.y + area.height - HEIGHT)
  win.webContents.send('claudia-chan', { type: 'walk', dir: walkDir })
}

let cachedWalk = null
function readCachedWalk() {
  cachedWalk ??= readConfig().pasear ?? 'off'
  return cachedWalk
}

// While moving she rides the cursor, so the window never has to take a click.
function toggleMove() {
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
  scoldToRest(lines[Math.floor(Math.random() * lines.length)](warning.minutes))
}

function scoldToRest(line) {
  win?.webContents.send('claudia-chan', { type: 'react', name: 'descansa', seconds: 8, line })
  const inSpanish = (readConfig().voz ?? 'espanol') === 'espanol'
  speak(inSpanish ? spanishToKatakana(line) : REST_VOICE[Math.floor(Math.random() * REST_VOICE.length)], 'bashful')
}

function warnOutOfHours() {
  const { hours } = readConfig()
  const now = new Date()
  if (!work.checkHours(now.getTime(), now.getHours(), hours)) return

  saveConfig({ work: work.snapshot() })
  scoldToRest(`Onii-chan, tu horario era de ${hours.from} a ${hours.to}. Ya fue suficiente, descansa.`)
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
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ pets: pendingPets, tiredMinutes, name: readConfig().name, personalidad: readConfig().personalidad, voz: readConfig().voz, bond: bond() }))
        pendingPets = 0
        tiredMinutes = 0
        return
      }
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
        speak(event.isSpanish ? spanishToKatakana(event.text) : event.text, event.voice)
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
      if (event.type === 'heard') {
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ text: heard.shift() ?? '' }))
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
      if (win) win.webContents.send('claudia-chan', event)
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

function createWindow() {
  const area = screen.getPrimaryDisplay().workArea
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
  setInterval(warnIfTired, 30000)
  setInterval(warnOutOfHours, 30000)
  if (!readConfig().firstSeen) saveConfig({ firstSeen: Date.now() })

  setInterval(() => {
    const cursor = screen.getCursorScreenPoint()
    if (isMoving) win.setPosition(cursor.x - Math.round(WIDTH / 2), cursor.y - 120)
    walk(area)
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
    if (noticed) win.webContents.send('claudia-chan', noticed)
    if (!stayOpen && Date.now() - lastBeat > IDLE_LIMIT_MS) app.quit()
  }, 50)
}

app.commandLine.appendSwitch('enable-transparent-visuals')
app.whenReady().then(() => {
  app.dock?.hide()
  http.createServer(handle).on('error', () => app.exit(1)).listen(PORT, '127.0.0.1', createWindow)
  console.log('move shortcut registered:', globalShortcut.register(MOVE_KEY, toggleMove))
  console.log('listen shortcut registered:', globalShortcut.register(LISTEN_KEY, toggleListen))
})
app.on('will-quit', () => globalShortcut.unregisterAll())
