// Floating avatar window. Claude Code talks to it through a loopback HTTP port.
const { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, Notification, powerMonitor, screen, Tray } = require('electron')
const { spawn, execFile, execFileSync } = require('child_process')
const os = require('os')
const http = require('http')
const https = require('https')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { createPetDetector } = require('./pet.js')
const { createWorkTracker } = require('./work.js')
const { createLinePicker, createHoverDetector } = require('./lines.js')
const { synthesize, synthesizeNatural, naturalEngine, speechPieces } = require('./speech.js')
const { spanishToKatakana } = require('./spanish.js')
const { TOOL_COUNT, toolsRect } = require('./toolbar.js')
const { validMinutes, untilFor, isQuietAt, clockTime } = require('./quiet.js')
const { createPresence } = require('./presence.js')
const { GAMES, valid: validGames, validResult, applyResult, shouldPropose, clickRect, inRect } = require('./gamestats.js')
const { parseDue, add: addReminder, split: splitReminders, soon: reminderSoon, valid: validReminders, SOON_MS } = require('./reminders.js')
const I18N = require('./i18n.json')
const { PACKAGED, HOME, VENDOR, USER_MODELS, USER_ANIMATIONS, FFMPEG, LINUX_MIC, venvPython } = require('./paths.js')
const { createPhoneLink } = require('./phone.js')
const install = require('./install.js')

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
// The plugin starts her with --from-plugin. The installed app opened from the desktop menu stays,
// since then nobody heartbeats: she lives without a session until the user closes her.
const fromPlugin = process.argv.includes('--from-plugin')
const stayOpen = process.env.CLAUDIA_CHAN_STAY === '1' || (PACKAGED && !fromPlugin)
fs.mkdirSync(HOME, { recursive: true })
const CONFIG = path.join(HOME, 'config.json')
const REMINDERS = path.join(HOME, 'reminders.json')
const STYLE_PARTS = ['piel', 'pelo', 'ojos', 'ropa']
const detectPet = createPetDetector()
let pendingPets = 0
let tiredMinutes = 0
let isMoving = false
const MOVE_KEY = 'CommandOrControl+Alt+C'
const LISTEN_KEY = 'CommandOrControl+Alt+V'
const HIDE_KEY = 'CommandOrControl+Alt+H'
const MUTE_KEY = 'CommandOrControl+Alt+M'
let muteKeyOk = false
const MAX_LISTEN_MS = 60000
const SKIN = ['#fff4ef', '#ffe3e0', '#f9e6d6', '#f6dcc4']
const SETTINGS = {
  personalidad: ['yandere', 'tsundere', 'dulce', 'kuudere', 'onee-san', 'genki', 'dandere', 'himedere', 'gamer', 'chuunibyou'],
  voz: ['kokoro', 'elevenlabs', 'espanol', 'japones'],
  tono: ['grave', 'normal', 'agudo'],
  velocidad: ['lenta', 'normal', 'rapida'],
  tamano: ['chico', 'normal', 'grande'],
  pasear: ['on', 'off'],
  idioma: Object.keys(I18N),
  // What she reads aloud of her replies; the plugin applies it (it comes back in the heartbeat).
  lectura: ['todo', 'resumen', 'burbuja'],
  // Whether she may propose a game while Claude works (the games themselves are always there).
  juegos: ['on', 'off'],
}
const MODELS_DIR = path.join(__dirname, 'assets/models')
const CENTER_TRAVEL_MS = 1400
const CENTER_HOLD_MS = 12000
let isCentering = false
let recorder = null
let heard = []
// What the panel shows: the last thing she understood, and whether she is listening.
let lastHeard = ''
let heardAt = 0
// Which session took the last spoken words (its folder), so the panel can say where they went.
let lastTaker = null
let lastSessionBeat = 0 // only a session's heartbeat, not the panel's clicks
let panel = null

function modelNames() {
  const vrms = dir => (dir && fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.vrm')).map(f => f.slice(0, -4)) : [])
  return [...new Set(['sample', ...vrms(MODELS_DIR), ...vrms(USER_MODELS)])]
}

// The microphone is only open between two presses, and the recording is deleted after use.
// Whisper stays loaded in one process (transcribe.py --serve): the model loads once, not per phrase.
let whisper = null
const whisperQueue = []
function transcribe(file) {
  if (!whisper) {
    whisper = spawn(venvPython('whisper'), [path.join(__dirname, 'transcribe.py'), '--serve'], { stdio: ['pipe', 'pipe', 'ignore'] })
    let pending = ''
    whisper.stdout.on('data', chunk => {
      pending += chunk
      let end
      while ((end = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, end)
        pending = pending.slice(end + 1)
        let text = ''
        try { text = JSON.parse(line).text ?? '' } catch {}
        whisperQueue.shift()?.(text)
      }
    })
    whisper.on('exit', () => {
      whisper = null
      while (whisperQueue.length) whisperQueue.shift()('')
    })
  }
  return new Promise(resolve => {
    whisperQueue.push(resolve)
    whisper.stdin.write(`${file}\t${readConfig().idioma ?? 'es'}\n`)
  })
}

// Windows has no "default" input for ffmpeg: the first DirectShow microphone (or config.micWin).
let foundMic = null
function windowsMic() {
  if (readConfig().micWin) return readConfig().micWin
  if (foundMic) return foundMic
  try {
    execFileSync(FFMPEG, ['-hide_banner', '-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'], { stdio: 'pipe' })
  } catch (error) {
    // ffmpeg lists the devices on stderr and exits with an error; that is the normal way.
    const line = String(error.stderr).split('\n').find(l => /\(audio\)/.test(l))
    foundMic = line?.match(/"([^"]+)"/)?.[1] ?? null
  }
  return foundMic
}

function toggleListen() {
  if (recorder) {
    recorder.stopAsked = true
    recorder.kill('SIGINT')
    return
  }
  // You are talking to her, so she may answer aloud: quiet mode ends without a reaction.
  if (isQuiet()) setQuiet(0, false)
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'claudia-mic-'))
  const file = path.join(folder, 'mic.wav')
  const input = process.platform === 'darwin' ? ['-f', 'avfoundation', '-i', ':default']
    : process.platform === 'win32' ? ['-f', 'dshow', '-i', `audio=${windowsMic()}`]
    : LINUX_MIC
  const current = spawn(FFMPEG, ['-y', '-loglevel', 'error', ...input, '-ac', '1', '-ar', '16000', file], { stdio: 'ignore' })
  recorder = current
  const limit = setTimeout(() => current.kill('SIGINT'), MAX_LISTEN_MS)
  win?.webContents.send('claudia-chan', { type: 'listening', value: true })
  // The microphone did not open (no ffmpeg, no input device): say so instead of "listening" to nothing.
  let failed = false
  const fail = () => {
    if (failed) return
    failed = true
    clearTimeout(limit)
    if (recorder === current) recorder = null
    fs.rmSync(folder, { recursive: true, force: true })
    show({ type: 'listening', value: false })
    show({ type: 'react', name: 'preocupada', seconds: 5, line: texts().nomic })
  }
  current.on('error', fail)
  current.on('close', () => {
    // No recording, and nobody asked it to stop: ffmpeg gave up on its own (no input device).
    if (failed || (!current.stopAsked && !fs.existsSync(file))) {
      fail()
      return
    }
    clearTimeout(limit)
    recorder = null
    win?.webContents.send('claudia-chan', { type: 'listening', value: false })
    transcribe(file).then(text => {
      fs.rmSync(folder, { recursive: true, force: true })
      if (text) heard.push(text)
      lastHeard = text || '(no te entendí)'
      heardAt = Date.now()
      lastTaker = null
      win?.webContents.send('claudia-chan', { type: 'heard', text })
    })
  })
}

// The 🎤 button: with no session awake nobody would answer, so she says that instead of listening.
function talk() {
  if (!recorder && Date.now() - lastSessionBeat > 25000) {
    show({ type: 'react', name: 'preocupada', seconds: 5, line: texts().nolistener })
    return
  }
  toggleListen()
}

// One mute for everything (toolbar, tray, shortcut, panel, /claudia sonido, VR), kept across restarts.
// `acted` is false when nobody pressed anything, so she does not react to her own start-up.
function setMute(value, acted = true) {
  const muted = Boolean(value)
  saveConfig({ muted })
  // Pieces still being synthesized for the reply she was reading are dropped.
  if (muted) speechRun++
  show({ type: 'mute', value: muted, acted })
  refreshTray()
}

// "No molestar" (quiet.js): for some minutes she makes no remarks of her own, plays no cue sounds,
// reads nothing aloud and does not come to the centre; she still animates and answers in text.
// Unlike the mute it ends by itself, and talking to her by microphone ends it.
const isQuiet = () => isQuietAt(readConfig(), Date.now())
const quietUntil = () => (isQuiet() ? readConfig().quietUntil : 0)

function setQuiet(minutes, acted = true) {
  const until = minutes ? untilFor(minutes, Date.now()) : 0
  saveConfig({ quietUntil: until })
  // Going quiet drops what she was still about to read.
  if (until) speechRun++
  show(until ? { type: 'quiet', until, acted, line: fill(texts().quietOn, { m: minutes }) } : { type: 'quiet', until: 0, acted })
  refreshTray()
}

// Time is up: she just stretches. No line and no voice, or the end of the quiet would be a noise.
function checkQuiet() {
  const { quietUntil: until } = readConfig()
  if (!until || until > Date.now()) return
  saveConfig({ quietUntil: 0 })
  show({ type: 'quiet', until: 0, expired: true })
  show({ type: 'doing', name: 'stretch', seconds: 3 })
  refreshTray()
}

// The one-press toggle (tray, her 🌙 button): an hour, or back to normal.
const QUIET_MINUTES = 60
const toggleQuiet = () => setQuiet(isQuiet() ? 0 : QUIET_MINUTES)

const shortcutLabel = key => key.replace('CommandOrControl', 'Ctrl')

// The first-run labels come back once for each round of new buttons: the flag is renamed when
// buttons are added, so someone who dismissed an earlier tour still meets the new ones.
const TOUR_FLAG = 'toolsTour2' // 🌙 👁 🎮 (toolsTour was 🔊 🎤)

// What the avatar page needs to draw its toolbar. It asks for this when it is ready ('ready'): its
// listener is registered after the model starts loading, so anything sent at did-finish-load can be lost.
function stateEvent() {
  const config = readConfig()
  return { type: 'state', still: readCachedWalk() !== 'on', muted: Boolean(config.muted), listening: Boolean(recorder), tour: config[TOUR_FLAG] !== true, carryHint: config.carryTold !== true, quietUntil: quietUntil() }
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
  // Your hand has her, or she is mid-jump (a glide cannot be called back): she stays where she is.
  if (isMoving || isCentering || dragging || life.mode === 'hop' || !alive()) return

  isCentering = true
  const [homeX, homeY] = win.getPosition()
  // Her own walk or dance stops first, or two timers would pull the window two ways.
  if (life.mode === 'walk' || life.mode === 'dance') standAt(null, 30)
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
  if (win.isVisible()) {
    // A game does not stay open (taking clicks) on a window nobody can see.
    if (gamesOpen) show({ type: 'games', close: true })
    win.hide()
  } else win.showInactive()
  refreshTray()
}

// Her 👁 button. The buttons vanish with her, so the first time she says how to get her back (in her
// bubble, and in a system notification that outlives her) and only then goes.
const HIDE_TOLD_MS = 5000
let isHiding = false
function hideByButton() {
  if (!alive() || !win.isVisible() || isHiding) return
  if (readConfig().hideTold) {
    toggleVisible()
    return
  }
  const how = fill(texts().hideHow, { key: shortcutLabel(HIDE_KEY) })
  saveConfig({ hideTold: true })
  show({ type: 'note', text: how, seconds: HIDE_TOLD_MS / 1000 })
  notify(readConfig().name ?? 'Claudia-chan', how)
  isHiding = true
  setTimeout(() => {
    isHiding = false
    if (alive() && win.isVisible()) toggleVisible()
  }, HIDE_TOLD_MS)
}

// "Cerrar" sticks: the plugin does not relaunch her until a new claude-chan session or /claudia on.
function dismiss() {
  saveConfig({ dismissed: true })
  app.quit()
}

// Start over: a fresh app with the same arguments (and --wake, so a "Cerrar" does not keep her away).
function restart() {
  app.relaunch({ args: [...process.argv.slice(1).filter(a => a !== '--wake'), '--wake'] })
  app.exit(0)
}

let tray = null
function refreshTray() {
  if (!tray) return
  const shown = alive() && win.isVisible()
  const { muted, muteKey = MUTE_KEY } = readConfig()
  const quiet = quietUntil()
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: shown ? 'Ocultar (Ctrl+Alt+H)' : 'Mostrar (Ctrl+Alt+H)', click: toggleVisible },
    { label: 'Hablarle (Ctrl+Alt+V)', click: toggleListen },
    { label: (muted ? '🔇 ' + texts().tools.unmute : '🔊 ' + texts().tools.mute) + (muteKeyOk ? ` (${shortcutLabel(muteKey)})` : ''), click: () => setMute(!readConfig().muted) },
    { label: quiet ? `🌙 ${texts().tools.quietOff} · ${clockTime(quiet)}` : `🌙 ${texts().tools.quiet} (${QUIET_MINUTES} min)`, click: toggleQuiet },
    { label: 'Moverla (Ctrl+Alt+C)', click: toggleMove },
    { label: 'Pasear 🚶‍♀️', click: stroll },
    { label: 'Bailar 💃', click: () => dance() },
    { label: 'Beso 💋', click: () => show({ type: 'doing', name: 'kiss', seconds: 1.8 }) },
    { label: 'Panel de control', click: openPanel },
    { label: phoneLink?.on() ? '📱 Móvil conectado: ver / apagar' : '📱 Conectar móvil', click: openPhoneWindow },
    { label: 'Reiniciar', click: restart },
    { type: 'separator' },
    { label: 'Cerrar Claudia-chan', click: dismiss },
  ]))
}

function setupTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'assets/tray.png')))
  tray.setToolTip('Claudia-chan · por Dio Calderon')
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
// How fast the window travels must match her steps or her feet skate. The hand-made walk
// (activities.js WALK_CADENCE/WALK_STRIDE) is 170 px/s; a motion-capture walk has its own pace,
// measured from its feet (Mixamo "Catwalk Walk": 1.19 steps/s, ~0.5 m on her scale, ~145 px/s seen
// three-quarters). config.walkPxPerS overrides both for another walk file.
const walkPxPerS = () => readConfig().walkPxPerS ?? (fs.existsSync(path.join(__dirname, 'assets/animations/walk.fbx')) ? 145 : 170)
const BUSY_MS = 8000 // a work event keeps her at her spot this long
const canSeeWindows = process.platform === 'win32' || (process.platform === 'linux' && process.env.XDG_SESSION_TYPE !== 'wayland')
let life = { mode: 'stand', until: Date.now() + 20000 }
let lastWork = 0
let activeWin = null // the focused window (X11 only): { id, x, y, width, height }

// Windows: one PowerShell kept open that answers each "?" with the focused window's id and rectangle.
let winShell = null
let winShellReply = null
function windowsActiveWindow() {
  if (!winShell) {
    const script = `Add-Type @"
using System; using System.Runtime.InteropServices;
public class W { [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
public struct R { public int L, T, Rt, B; } }
"@
while ($null -ne ($line = [Console]::In.ReadLine())) { $h = [W]::GetForegroundWindow(); $r = New-Object W+R; [void][W]::GetWindowRect($h, [ref]$r); [Console]::Out.WriteLine("$h $($r.L) $($r.T) $($r.Rt - $r.L) $($r.B - $r.T)"); [Console]::Out.Flush() }`
    // The script goes in -EncodedCommand (UTF-16LE base64); stdin stays free for the "?" questions.
    winShell = spawn('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true })
    let buffer = ''
    winShell.stdout.on('data', chunk => {
      buffer += chunk
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop()
      for (const line of lines) {
        const [id, x, y, width, height] = line.trim().split(/\s+/).map(Number)
        if (Number.isFinite(height)) winShellReply = { id, x, y, width, height }
      }
    })
    winShell.on('exit', () => { winShell = null })
  }
  winShell.stdin.write('?\n')
  activeWin = winShellReply
}

function pollActiveWindow() {
  if (!canSeeWindows) return
  if (process.platform === 'win32') {
    windowsActiveWindow()
    return
  }
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
  if (!alive() || life.mode !== 'walk' || isMoving || isCentering) return
  const { from, to, at } = life
  const total = Math.hypot(to.x - from.x, to.y - from.y)
  const done = Math.min(total, ((Date.now() - at) / 1000) * (life.speed ??= walkPxPerS()))
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

// --- Hover toolbar (index.html #tools): appears when the cursor is near her. The window ignores the
// mouse except over the buttons, so she never blocks your clicks.
const TOOLS = toolsRect(TOOL_COUNT, WIDTH) // window pixels, matches #tools
let isNear = false
let overTools = false
let dragging = null // { dx, dy } from the window corner to the cursor while dragged
// How fast her window is travelling, so her body can trail behind it (carry.mjs).
let lastSpot = null
let lastSpotAt = 0
const TELEPORT_SPEED = 10000 // px/s: faster than any hand, so it was a jump (another screen, a saved spot)

// Window speed in px/s since the last call, from the real elapsed time (the tick is not exactly 50 ms).
function windowSpeed(x, y, now = Date.now()) {
  const seconds = (now - lastSpotAt) / 1000
  const speed = { vx: 0, vy: 0 }
  if (lastSpot && seconds > 0 && seconds < 0.5) {
    const vx = (x - lastSpot.x) / seconds
    const vy = (y - lastSpot.y) / seconds
    if (Math.hypot(vx, vy) < TELEPORT_SPEED) Object.assign(speed, { vx, vy })
  }
  lastSpot = { x, y }
  lastSpotAt = now
  return speed
}

function hover(cursor) {
  const [x, y] = win.getPosition()
  const inside = cursor.x >= x && cursor.x < x + WIDTH && cursor.y >= y && cursor.y < y + HEIGHT
  const onTools = cursor.x >= x + TOOLS.x && cursor.x < x + TOOLS.x + TOOLS.width && cursor.y >= y + TOOLS.y && cursor.y < y + TOOLS.y + TOOLS.height
  const near = inside || onTools || Boolean(dragging)
  if (near !== isNear) {
    isNear = near
    win.webContents.send('claudia-chan', { type: 'near', value: near })
    if (near) proposeGame()
  }
  // An open game takes clicks too, over its own part of the window only.
  const onGame = win.isVisible() && inRect(gameArea, cursor.x - x, cursor.y - y)
  const takesClicks = (near && onTools) || onGame || Boolean(dragging)
  if (takesClicks !== overTools) {
    overTools = takesClicks
    win.setIgnoreMouseEvents(!takesClicks)
    if (process.env.CLAUDIA_DEBUG) console.log('clicks', takesClicks, Date.now())
  }
  if (dragging) win.setPosition(Math.round(cursor.x - dragging.dx), Math.round(cursor.y - dragging.dy))
}

// --- Games (games.mjs, play.js): played on her own window while Claude works. The page draws them and
// tells us which rectangle of the window must take clicks; we keep the results, say her lines with
// the local voice and decide when she may propose one.
let gamesOpen = false
let gameArea = null // window pixels that take clicks while a game is open
let task = null // { since, proposed }: the prompt Claude is working on now
let lastProposal = 0

const gameStats = () => validGames(readConfig().games)
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// A game closes with ✕ or 🎮 only. Her window never has the keyboard, and taking Esc system-wide
// would steal it from the app you are typing in (Claude Code's own interrupt, vim, a dialog).

// The picker, or one game straight away (/claudia juega reflejos). Asked for while hidden, she shows up.
function openGames(game) {
  if (!alive()) return
  if (!win.isVisible()) {
    win.showInactive()
    refreshTray()
  }
  gamesOpen = true
  // She stays where she is while you play: nobody clicks on a moving target.
  if (['walk', 'dance', 'stand'].includes(life.mode) && !isMoving && !dragging) {
    const [x, y] = win.getPosition()
    standAt(screen.getDisplayNearestPoint({ x: x + WIDTH / 2, y: y + HEIGHT / 2 }).workArea, 9999)
  }
  const config = readConfig()
  show({ type: 'games', open: true, game, stats: gameStats(), seen: config.gamesSeen ?? {}, personalidad: config.personalidad ?? 'yandere', done: false })
}

// The page closed it (✕, 🎮 again) or was reloaded: clicks fall through her window again.
function closeGames() {
  gamesOpen = false
  gameArea = null
  if (life.mode === 'stand') life.until = Date.now() + 15000
}

// A game ended: the result goes to config.games, and a little of it to the bond (bond()).
function recordGame(data) {
  const result = validResult(data)
  if (!result) return
  const games = applyResult(gameStats(), result, localDay())
  saveConfig({ games })
  show({ type: 'games', stats: games })
}

// "¿Jugamos mientras esperas?", in her bubble only: when the cursor comes near her during a long
// task. Once per task, and only while that task's session is still alive.
function proposeGame() {
  if (!task || isMoving || dragging || Date.now() - lastSessionBeat > 25000) return
  const now = Date.now()
  if (!shouldPropose({ now, since: task.since, proposed: task.proposed, last: lastProposal, juegos: readConfig().juegos, quiet: isQuiet(), open: gamesOpen })) return
  task.proposed = true
  lastProposal = now
  show({ type: 'react', name: 'guino', seconds: 5, line: texts().games.propose })
}

ipcMain.on('claudia-ui', (_, action, data) => {
  if (process.env.CLAUDIA_DEBUG) console.log('ui', action, Date.now())
  if (!alive()) return
  // 🎮: the picker, or closing whatever game is open.
  if (action === 'games') {
    if (gamesOpen) show({ type: 'games', close: true })
    else openGames()
  }
  if (action === 'games-area') {
    const rect = clickRect(data, WIDTH, HEIGHT)
    if (data === null) closeGames()
    else if (rect && gamesOpen) gameArea = rect
  }
  if (action === 'games-result' && gamesOpen) recordGame(data)
  // Her short lines while playing, in her local voice; the mute and quiet mode silence them as usual.
  if (action === 'games-say' && gamesOpen && typeof data === 'string' && data.length <= 120) speakLocal(data)
  // The one-line how-to of a game was shown: once is enough.
  if (action === 'games-seen' && GAMES.includes(data)) saveConfig({ gamesSeen: { ...readConfig().gamesSeen, [data]: true } })
  if (action === 'menu') openPanel()
  if (action === 'mute') setMute(!readConfig().muted)
  if (action === 'talk') talk()
  if (action === 'quiet') toggleQuiet()
  if (action === 'hide') hideByButton()
  if (action === 'ready') {
    pageReady = true
    // A page that just (re)loaded has no game open, whatever was there before.
    closeGames()
    show(stateEvent())
  }
  // The first-run labels were seen (a new button was used): never again.
  if (action === 'tour-done') saveConfig({ [TOUR_FLAG]: true })
  // She was picked up for the first time and said what shaking her does: once is enough.
  if (action === 'carry-told') saveConfig({ carryTold: true })
  if (action === 'stay') {
    // Quieta: no strolling, dancing or perching until pressed again.
    const still = readCachedWalk() === 'on'
    cachedWalk = still ? 'off' : 'on'
    saveConfig({ pasear: cachedWalk })
    win.webContents.send('claudia-chan', { type: 'still', value: still })
    if (still && life.mode !== 'work') {
      const [x, y] = win.getPosition()
      standAt(screen.getDisplayNearestPoint({ x, y }).workArea, 9999)
    }
  }
  // (Not while she crosses to the centre: the hand and the glide would fight over the window.)
  if (action === 'drag-start' && !isCentering) {
    const cursor = screen.getCursorScreenPoint()
    const [x, y] = win.getPosition()
    dragging = { dx: cursor.x - x, dy: cursor.y - y }
    life = { mode: 'stand', until: Date.now() + 60000 }
  }
  if (action === 'drag-end' && dragging) {
    dragging = null
    const [x, y] = win.getPosition()
    saveConfig({ x, y })
  }
})

// Work started: she goes back to her spot, waist-up, to type along.
async function goToWork(area) {
  const home = savedPosition(area)
  life = { mode: 'work' }
  show({ type: 'body', mode: 'bust' })
  const [x, y] = win.getPosition()
  if (Math.abs(x - home.x) + Math.abs(y - home.y) > 4) await glide(home.x, home.y, 600)
}

function live(area) {
  // While a game is open she stays put.
  if (isMoving || isCentering || life.mode === 'hop' || dragging || gamesOpen) return
  const now = Date.now()
  // A dance ends even with strolling off.
  if (life.mode === 'dance' && now >= life.until) {
    standAt(area, randomBetween(15, 30))
    return
  }
  // Dozing: she finishes a walk or stays on her window, but starts nothing new until you are back.
  if (presence.isAsleep() && life.mode !== 'walk' && life.mode !== 'perch') return
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
  // Quiet mode: she may wander, but no dancing for attention.
  if (!isQuiet() && Math.random() < danceChance()) {
    dance(randomBetween(6, 12))
    return
  }
  if (Math.random() < 0.75) walkTo(Math.round(randomBetween(area.x, area.x + area.width - WIDTH)), bottomOf(area))
  else standAt(area, randomBetween(20, 40))
}

// How often a pause between walks turns into a dance: the cheerleader cannot help it, the shy one rarely dares.
const DANCE_CHANCE = { genki: 0.35, dandere: 0.05 }
const danceChance = () => DANCE_CHANCE[readConfig().personalidad] ?? 0.15

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
  const { firstSeen = Date.now(), petCount = 0, wins = 0, games } = readConfig()
  const days = Math.floor((Date.now() - firstSeen) / 86400000)
  // Playing on her window adds a little too (gamestats.js limits it per day).
  const affection = petCount + days * 2 + wins * 3 + validGames(games).bond

  return { days, pets: petCount, affection, level: 1 + Math.floor(affection / 25) }
}

function sayLine() {
  // Quiet mode: no remarks of her own.
  if (isQuiet() || (readConfig().idioma ?? 'es') !== 'es') return
  const said = pickLine({ hour: new Date().getHours(), ...bond() })
  // Her own little comments are spoken too, in her generated voice (then no extra voiced clip on top).
  const speaks = Boolean(said?.line && hasLocalVoice())
  win?.webContents.send('claudia-chan', speaks ? { ...said, sound: undefined } : said)
  if (speaks) speakLocal(said.line)
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
  // Nobody at the keyboard: keep the warning for when they are back (work.check would use it up).
  if (idleSeconds() >= AWAY_SECONDS) return
  const now = new Date()
  const warning = work.check(now.getTime(), now.getHours())
  if (!warning) return

  saveConfig({ work: work.snapshot() })
  tiredMinutes = warning.minutes
  // Quiet mode: her written reply still mentions it once (tiredMinutes), but she does not scold aloud.
  if (isQuiet()) return
  const lines = warning.isLate ? LATE_LINES : TIRED_LINES
  const isSpanish = (readConfig().idioma ?? 'es') === 'es'
  scoldToRest(isSpanish ? lines[Math.floor(Math.random() * lines.length)](warning.minutes) : fill(texts()[warning.isLate ? 'late' : 'tired'], { m: warning.minutes }))
}

function scoldToRest(line, seconds = 8, silent = false) {
  win?.webContents.send('claudia-chan', { type: 'react', name: 'descansa', seconds, line })
  if (silent) return
  if (hasLocalVoice()) {
    speakLocal(line)
    return
  }
  const hasAccent = (readConfig().voz ?? 'espanol') === 'espanol'
  speak(hasAccent ? texts().kana : REST_VOICE[Math.floor(Math.random() * REST_VOICE.length)], 'bashful')
}

function warnOutOfHours() {
  if (idleSeconds() >= AWAY_SECONDS) return
  const { hours } = readConfig()
  const now = new Date()
  if (!work.checkHours(now.getTime(), now.getHours(), hours)) return

  saveConfig({ work: work.snapshot() })
  // Quiet mode: the bubble only, from where she is (no voice, no crossing the screen).
  const quiet = isQuiet()
  scoldToRest(fill(texts().hours, hours), 14, quiet)
  if (!quiet) comeToCenter()
}

// Speaks the whole text piece by piece: each piece is queued behind the one playing, and a new
// reply replaces whatever was still waiting from the previous one.
// Muted, nothing is synthesized (no Kokoro CPU, no ElevenLabs credits for audio nobody hears): her
// lips just move for about as long as the text would take. Quiet mode does the same, except for speech
// marked `force` (something the user asked to hear); the mute has no exception.
const mouthSeconds = text => Math.min(8, Math.max(1, text.length / 15))
const isSilent = force => Boolean(readConfig().muted) || (!force && isQuiet())
let speechRun = 0
async function speakNatural(text, { config = readConfig(), force = false } = {}) {
  if (isSilent(force)) {
    show({ type: 'mouth', seconds: mouthSeconds(text) })
    return
  }
  const run = ++speechRun
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

// Her own voice on this computer only (Kokoro). With voz 'kokoro' naturalEngine never answers
// 'elevenlabs', and where Kokoro has no voice (Russian) or is not installed she stays silent: what she
// says by herself (her remarks, welcome back, a finished task, reminders) never spends ElevenLabs credits.
const localVoice = () => ({ ...readConfig(), voz: 'kokoro' })
const speakLocal = (text, force = false) => speakNatural(text, { config: localVoice(), force })
// Whether she can say her own remarks at all: a natural voice was chosen and Kokoro can speak it.
// (With the old Japanese voices she keeps her recorded clips instead.)
const hasLocalVoice = () => Boolean(naturalEngine(readConfig()) && naturalEngine(localVoice()))

function speak(text, voice, { force = false } = {}) {
  if (isSilent(force)) {
    show({ type: 'mouth', seconds: mouthSeconds(text) })
    return Promise.resolve()
  }
  return synthesize(text, voice, readConfig())
    .then(audio => win?.webContents.send('claudia-chan', { type: 'speak', audio: audio.toString('base64') }))
    .catch(error => console.error('speech failed', error.message))
}

// --- Presence (presence.js): she dozes when you leave and lights up when you return. All she knows is
// how long the keyboard and mouse have been untouched; she never looks at the screen or at other apps.
const AWAY_SECONDS = 120 // untouched this long, a warning would be spoken to an empty chair
const DONE_AWAY_SECONDS = 60 // untouched this long, "I finished" waits for you instead
const GREET_AFTER_MS = 30 * 60000 // shorter absences get no "welcome back": that would be nagging
const LONG_TASK_SECONDS = 300 // from here on she also says how long the task took
// A turn this long (seconds) counts as a task worth announcing; config.longTask overrides it. The
// plugin measures the turn and learns this number from the heartbeat.
const longTask = () => (Number.isFinite(readConfig().longTask) && readConfig().longTask >= 0 ? readConfig().longTask : 90)
const presence = createPresence()
let lastDoze = 0
let pendingDone = null // { at, line }: a task that finished while you were away
let isWaking = false // the three seconds between her stretch and what she says on your return

// Seconds since the last key or mouse movement. Wayland does not report it reliably: there the
// feature stays inert (always 0) and she behaves as if you never left.
function idleSeconds() {
  if (process.env.XDG_SESSION_TYPE === 'wayland') return 0
  try {
    return powerMonitor.getSystemIdleTime()
  } catch {
    return 0
  }
}

// A system notification, for when she is hidden or you are not looking. Silent: she is the sound.
function notify(title, body) {
  if (!Notification.isSupported()) return
  new Notification({ title, body, silent: true }).show()
}

const pickOne = list => list[Math.floor(Math.random() * list.length)]

// Asleep: the pose and the closed eyes are re-sent, because a timed pose ends by itself. Not while
// Claude works (her work poses show through) and not while your hand has her.
function doze() {
  lastDoze = Date.now()
  if (Date.now() - lastWork <= BUSY_MS || dragging || isMoving) return
  show({ type: 'doing', name: 'sleepy', seconds: 120 })
  show({ type: 'react', name: 'dormida', seconds: 65 })
}

function tellDone() {
  const { at, line } = pendingDone
  pendingDone = null
  const said = fill(texts().doneBack, { m: Math.max(1, Math.round((Date.now() - at) / 60000)), line })
  show({ type: 'doing', name: 'wave', seconds: 2.5 })
  show({ type: 'react', name: 'feliz', seconds: 8, line: said })
  speakLocal(said)
}

// Joy only: she never reproaches you for having left. In quiet mode she just stretches.
function greetBack() {
  if (isQuiet()) return
  const line = pickOne(texts().back)
  show({ type: 'doing', name: 'wave', seconds: 2.5 })
  show({ type: 'react', name: 'feliz', seconds: 6, sound: 'saludo', line })
  speakLocal(line)
}

function onPresence(change) {
  if (!change) return
  if (change.event === 'drowsy') show({ type: 'react', name: 'cansada', seconds: 4 })
  if (change.event === 'sleep') doze()
  if (change.event === 'wake') {
    // The stretch replaces the nap, and the short start replaces the closed eyes.
    show({ type: 'doing', name: 'stretch', seconds: 3 })
    show({ type: 'react', name: 'sorprendida', seconds: 0.6 })
    // One thing is said on your return, never both: the news if there is any, else the welcome.
    // presenceTick leaves the news to this timer meanwhile, or the welcome would cut it off.
    isWaking = true
    setTimeout(() => {
      isWaking = false
      if (pendingDone) tellDone()
      else if (change.awayMs >= GREET_AFTER_MS) greetBack()
    }, 3000)
  }
}

function presenceTick() {
  const idle = idleSeconds()
  onPresence(presence.step(idle, Date.now()))
  if (presence.isAsleep()) {
    if (Date.now() - lastDoze >= 60000) doze()
    return
  }
  // You came back before she fell asleep: what finished meanwhile is told now.
  if (pendingDone && idle < 3 && !isWaking) tellDone()
}

// A turn of 90 s or more ended (the plugin tells us). With you there she says it; with you away she
// keeps it for your return, leaves a ✔ in her bubble and a notification, and the plugin does not read
// the reply aloud to nobody. Answers whether it was held.
function taskDone(seconds, line) {
  // In the middle of a game she does not interrupt: the "✔ Claude terminó" chip is already up.
  if (gamesOpen) return false
  const hidden = !alive() || !win.isVisible()
  // Asleep counts as away even with a fresh counter: locking the screen is a key press too.
  if (!presence.isAsleep() && idleSeconds() < DONE_AWAY_SECONDS) {
    const said = seconds >= LONG_TASK_SECONDS ? `${fill(texts().done, { m: Math.round(seconds / 60) })} ${line}`.trim() : line
    show({ type: 'react', name: 'feliz', seconds: 6, sound: said ? undefined : 'listo', line: said || undefined })
    if (hidden) notify(readConfig().name ?? 'Claudia-chan', said || texts().doneNote)
    return false
  }
  pendingDone = { at: Date.now(), line }
  notify(readConfig().name ?? 'Claudia-chan', line ? `${texts().doneNote}: ${line}` : texts().doneNote)
  show({ type: 'note', text: '✔', seconds: 600 })
  return true
}

// --- Reminders (reminders.js): "recuérdame en 20 minutos…". The list lives in memory and in
// reminders.json. You asked for them, so they pass do-not-disturb; the mute still silences her voice.
let reminders = readReminders()
// The last session went away with a reminder close: she waits hidden instead of quitting.
let keptForReminder = false
let hidForReminder = false
let lingerUntil = 0 // after saying one to nobody's session she stays in sight this long
const LINGER_MS = 60000
const REMINDER_SECONDS = 12
const AWAY_NOTE_SECONDS = 600
// Two that fall due together are said one after the other, each with its own bubble and trip.
const REMINDER_GAP_MS = 16000
let lastReminder = 0

// Their own file, not config.json: the VR port serves config.json to the network without the key
// (the headset page needs it), and what you asked to be reminded of is nobody else's business.
function readReminders() {
  try {
    return validReminders(JSON.parse(fs.readFileSync(REMINDERS, 'utf8')))
  } catch {
    // Before reminders.json they lived in config.json: moved over once.
    const { reminders: old, ...rest } = readConfig()
    if (old === undefined) return []
    fs.writeFileSync(CONFIG, JSON.stringify(rest, null, 2))
    const list = validReminders(old)
    fs.writeFileSync(REMINDERS, JSON.stringify(list, null, 2))
    return list
  }
}

function saveReminders(list) {
  reminders = list
  fs.writeFileSync(REMINDERS, JSON.stringify(list, null, 2))
}

// Answers { id, due, keepsAlive } or null. keepsAlive: close enough that she stays alive, hidden, if
// Claude is closed before then; a later one would arrive late at the next start.
function setReminder({ text, minutes, at, date }) {
  const due = parseDue({ minutes, at, date }, Date.now())
  const added = due === null ? null : addReminder(reminders, { text, due })
  if (!added) return null
  saveReminders(added.list)
  return { id: added.item.id, due, keepsAlive: due - Date.now() <= SOON_MS }
}

// By position in the list (what "/claudia recordatorio borrar 2" counts) or by id (the panel: its
// list may be a second old).
function dropReminder({ index, id }) {
  const at = Number.isInteger(id) ? reminders.findIndex(item => item.id === id) : Number.isInteger(index) ? index : -1
  if (at < 0 || at >= reminders.length) return false
  saveReminders(reminders.filter((_, i) => i !== at))
  return true
}

// The moment itself: she comes to the middle, waves, shows the text with a chime and says it in her
// local voice. `late`: the hour passed while she was off or the computer slept, so she apologises.
// The text goes to the bubble as plain text (textContent), never as HTML.
function deliver(item, late) {
  if (!alive()) return
  const hidden = !win.isVisible()
  if (hidden) {
    win.showInactive()
    refreshTray()
  }
  const line = fill(texts()[late ? 'reminderLate' : 'reminder'], { text: item.text })
  // force: the chime sounds in do-not-disturb too.
  const away = presence.isAsleep() || idleSeconds() > 60
  // force: the chime sounds in do-not-disturb too.
  show({ type: 'react', name: 'sorprendida', sound: 'listo', force: true, seconds: 3 })
  // A note, not a line: a short text would leave the bubble in four seconds. With nobody at the
  // computer it stays up for when you return.
  show({ type: 'note', text: '⏰ ' + (late ? line : item.text), seconds: away ? AWAY_NOTE_SECONDS : REMINDER_SECONDS })
  show({ type: 'doing', name: 'wave', seconds: 3 })
  comeToCenter()
  speakLocal(line, true)
  if (hidden || away) notify(readConfig().name ?? 'Claudia-chan', '⏰ ' + item.text)
  lastReminder = Date.now()
  // Shown for this: she is hers again to hide or quit once the moment has passed.
  keptForReminder = false
  hidForReminder = false
  lingerUntil = Date.now() + LINGER_MS
}

// Every 5 s, comparing timestamps: unlike one timer per item this survives a suspend, and the first
// run after a start is how the ones missed while she was closed arrive late. Not before the avatar
// page listens, or the bubble would be lost.
// A reload (new model, crashed page, GPU reset) makes it deaf again for a moment; a page that never
// answers does not hold the reminders for ever.
const PAGE_WAIT_MS = 30000
let pageReady = false
let pageLoadAt = Date.now()
function checkReminders() {
  if (!reminders.length || !alive() || (!pageReady && Date.now() - pageLoadAt < PAGE_WAIT_MS)) return
  const { due, late, expired } = splitReminders(reminders, Date.now())
  // Older than a day: no longer news, dropped without a word.
  if (expired.length) saveReminders(reminders.filter(item => !expired.includes(item)))
  const next = due[0] ?? late[0]
  if (!next || Date.now() - lastReminder < REMINDER_GAP_MS) return
  // Removed only when said, so one still waiting its turn survives a quit.
  saveReminders(reminders.filter(item => item !== next))
  deliver(next, !due.length)
}

// No session has spoken for a while. Normally she quits; with a reminder within three hours she
// hides and waits for it, and after saying it stays a minute before going.
function whenAlone(now = Date.now()) {
  // (Nor does she walk out in the middle of a game.)
  if (stayOpen || now - lastBeat <= IDLE_LIMIT_MS || now < lingerUntil || gamesOpen) return
  if (!reminderSoon(reminders, now)) {
    app.quit()
    return
  }
  if (keptForReminder) return
  keptForReminder = true
  hidForReminder = alive() && win.isVisible()
  if (hidForReminder) {
    win.hide()
    refreshTray()
  }
}

// A session is back while she was waiting hidden: here she is again.
function backFromWaiting() {
  if (!keptForReminder) return
  keptForReminder = false
  if (hidForReminder && alive() && !win.isVisible()) {
    win.showInactive()
    refreshTray()
  }
  hidForReminder = false
}

// What may leave this PC (the VR page and the phone read it): how she looks and sounds, never keys,
// paired phones or anything else in config.json.
const PUBLIC_CONFIG = ['modelo', 'muted', 'idioma', 'name', 'personalidad', 'tamano', ...STYLE_PARTS]
const publicConfig = () => Object.fromEntries(Object.entries(readConfig()).filter(([key]) => PUBLIC_CONFIG.includes(key)))
// Files next to the app that are never served, whoever asks.
const PRIVATE_FILES = /^(config|reminders)\.json$|\.pem$|\.key$/i

// Comparing secrets in constant time.
function sameSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false
  const x = crypto.createHash('sha256').update(a).digest(), y = crypto.createHash('sha256').update(b).digest()
  return crypto.timingSafeEqual(x, y)
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
  // The VR page cannot put headers on its event stream: the key in the link authorizes it instead.
  const vrKey = readConfig().vrKey
  if (vrKey && sameSecret(new URL(req.url, 'http://x').searchParams.get('k'), vrKey)) req.headers['x-claudia-chan'] = '1'
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
        lastSessionBeat = Date.now()
        backFromWaiting()
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ pets: pendingPets, tiredMinutes, name: readConfig().name, personalidad: readConfig().personalidad, voz: readConfig().voz, idioma: readConfig().idioma, muted: Boolean(readConfig().muted), quietUntil: quietUntil(), lectura: readConfig().lectura ?? 'todo', longTask: longTask(), bond: bond() }))
        pendingPets = 0
        tiredMinutes = 0
        return
      }
      // Claude is working: she goes back to her spot to work along.
      if (event.type === 'doing' && ['typing', 'reading', 'nervous', 'facepalm'].includes(event.name)) lastWork = Date.now()
      // A new prompt arrived first: the user already knows the last task ended.
      if (event.type === 'asked' || event.type === 'activity') pendingDone = null
      // A task starts with the prompt and ends with the reply: that is how long Claude has been working,
      // for proposing a game, and what the "✔ Claude terminó" chip of an open game shows.
      if (event.type === 'asked') {
        task = { since: Date.now(), proposed: false }
        if (gamesOpen) show({ type: 'games', done: false })
      }
      if (event.type === 'said') {
        task = null
        if (gamesOpen) show({ type: 'games', done: true })
      }
      if (event.type === 'games') {
        if (event.game !== undefined && !GAMES.includes(event.game)) {
          res.writeHead(400).end()
          return
        }
        openGames(event.game)
        res.writeHead(204).end()
        return
      }
      if (event.type === 'done') {
        if (!Number.isFinite(event.seconds) || event.seconds < 0 || typeof event.line !== 'string' || event.line.length > 200) {
          res.writeHead(400).end()
          return
        }
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ held: taskDone(event.seconds, event.line) }))
        return
      }
      if (event.type === 'reminder') {
        const set = setReminder(event)
        if (!set) {
          res.writeHead(400).end()
          return
        }
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(set))
        return
      }
      if (event.type === 'reminders') {
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ list: reminders }))
        return
      }
      if (event.type === 'reminder-del') {
        res.writeHead(dropReminder(event) ? 204 : 400).end()
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
        // A natural voice reads the real text; Open JTalk needs it spelled in kana.
        // The voice chosen now decides, not what an older session remembers: Spanish text from any
        // plugin version is read by the natural voice when there is one.
        // `force`: the user asked to hear this (the panel's "Probar voz"), so quiet mode lets it through.
        // `local`: her own remark, never worth ElevenLabs credits.
        const force = event.force === true
        // Mid-game the reply is not read aloud over it (the chip says Claude finished).
        if (gamesOpen && !force) {
          res.writeHead(204).end()
          return
        }
        if (event.local) speakLocal(event.text, force)
        else if ((event.natural || event.isSpanish) && naturalEngine(readConfig())) speakNatural(event.text, { force })
        else speak(event.isSpanish ? spanishToKatakana(event.text) : event.text, event.voice, { force })
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
        const text = heard.shift() ?? ''
        if (text) lastTaker = { place: typeof event.place === 'string' ? event.place : 'una sesión de claude-chan de antes', at: Date.now() }
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ text }))
        return
      }
      if (event.type === 'visible') {
        toggleVisible()
        res.writeHead(204).end()
        return
      }
      if (event.type === 'close') {
        res.writeHead(204).end()
        dismiss()
        return
      }
      if (event.type === 'restart') {
        res.writeHead(204).end()
        restart()
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
      if (event.type === 'phone') {
        openPhoneWindow()
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
      if (event.type === 'setting' && event.key === 'vr') {
        saveConfig({ vr: event.value === 'on' ? 'on' : 'off' })
        if (event.value === 'on') startVr()
        else stopVr()
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
      if (event.type === 'mute') {
        setMute(event.value)
        res.writeHead(204).end()
        return
      }
      if (event.type === 'quiet') {
        if (!validMinutes(event.minutes)) {
          res.writeHead(400).end()
          return
        }
        setQuiet(event.minutes)
        res.writeHead(204).end()
        return
      }
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
  // Motion-capture files the user downloaded (assets/animations/*.fbx or .glb).
  if (urlPath.startsWith('/phone/')) {
    await handlePhone(req, res, urlPath)
    return
  }
  if (urlPath === '/stream' && req.headers['x-claudia-chan'] === '1') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
    res.write(`data: ${JSON.stringify({ type: 'hello' })}\n\n`)
    streams.add(res)
    const ping = setInterval(() => res.write(': ping\n\n'), 20000)
    req.on('close', () => {
      clearInterval(ping)
      streams.delete(res)
    })
    return
  }
  if (urlPath === '/audio' && req.method === 'POST' && req.headers['x-claudia-chan'] === '1') {
    const text = await hearUpload(req).catch(() => '')
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ text }))
    return
  }
  if (urlPath === '/vr') {
    // Opened on this PC (loopback) without the key: hand it the key, so the page can talk to the app.
    const isLocal = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)
    if (isLocal && !new URL(req.url, 'http://x').searchParams.get('k')) {
      let key = readConfig().vrKey
      if (!key) saveConfig({ vrKey: (key = crypto.randomBytes(12).toString('hex')) })
      res.writeHead(302, { location: `/vr?k=${key}` }).end()
      return
    }
    res.writeHead(200, { 'content-type': 'text/html' }).end(fs.readFileSync(path.join(__dirname, 'vr.html')))
    return
  }
  if (urlPath === '/status') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
      listening: Boolean(recorder), muted: Boolean(readConfig().muted), quietUntil: quietUntil(), lastHeard, waiting: heard.length, heardAt, taker: lastTaker?.place ?? null,
      // A session that is awake heartbeats every 10 s; none for a while means nobody will answer.
      listener: Date.now() - lastSessionBeat < 25000, vr: vrUrl(), visible: alive() && win.isVisible(), doing: life.mode, voice: naturalEngine(readConfig()) ?? 'open-jtalk',
      reminders: reminders.map(({ id, text, due }) => ({ id, text, due })),
    }))
    return
  }
  if (urlPath === '/animations') {
    const list = dir => (dir && fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /\.(fbx|glb)$/i.test(f)) : [])
    const names = [...new Set([...list(path.join(__dirname, 'assets/animations')), ...list(USER_ANIMATIONS)])]
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(names))
    return
  }
  if (urlPath === '/config.json') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(publicConfig()))
    return
  }
  let decoded = urlPath
  try { decoded = decodeURIComponent(urlPath) } catch {}
  if (PRIVATE_FILES.test(path.basename(decoded.replace(/\\/g, '/')))) {
    res.writeHead(404).end()
    return
  }
  if (urlPath === '/models') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(modelNames()))
    return
  }
  let file = path.normalize(path.join(__dirname, urlPath === '/' ? 'index.html' : urlPath))
  // The installed app also serves the models and animations the user put in their own folder.
  const own = urlPath.match(/^\/assets\/(models|animations)\/([^/\\]+)$/)
  if (own && !fs.existsSync(file) && (own[1] === 'models' ? USER_MODELS : USER_ANIMATIONS)) {
    const dir = own[1] === 'models' ? USER_MODELS : USER_ANIMATIONS
    const candidate = path.join(dir, decodeURIComponent(own[2]))
    if (path.dirname(candidate) === dir) file = candidate
  }
  if (!(file.startsWith(__dirname + path.sep) || (own && file.startsWith(HOME + path.sep))) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404).end()
    return
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
}

// --- VR: the same Claudia in a headset (vr.html, WebXR). Every event the desktop avatar gets also goes
// to open VR pages through a server-sent stream (/stream). Headsets reach the PC through an opt-in HTTPS
// port on the LAN (WebXR and the mic need a secure page), guarded by a key and limited to VR files.
const VR_PORT = 8972
const streams = new Set()
function broadcast(event) {
  phoneLink?.push(event)
  if (!streams.size || event?.type === 'cursor') return
  const data = `data: ${JSON.stringify(event)}\n\n`
  for (const res of streams) res.write(data)
}

const lanAddress = () =>
  Object.values(os.networkInterfaces()).flat().find(i => i && i.family === 'IPv4' && !i.internal)?.address ?? '127.0.0.1'

// Static files a headset may load without the key; everything else needs ?k= (or the header).
const VR_PUBLIC = [/^\/vr(\.html|\.js)?$/, /^\/(mixamo|activities|style)\.js$/, /^\/node_modules\/(three|@pixiv)\//, /^\/assets\//, /^\/(config|i18n)\.json$/, /^\/(models|animations)$/]
let vrServer = null
function vrUrl() {
  const { vrKey } = readConfig()
  return vrServer && vrKey ? `https://${lanAddress()}:${VR_PORT}/vr?k=${vrKey}` : null
}

async function vrCertificate(key, cert) {
  if (fs.existsSync(cert)) return
  fs.mkdirSync(path.dirname(cert), { recursive: true })
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '3650', '-subj', '/CN=claudia-chan', '-addext', `subjectAltName=IP:${lanAddress()},DNS:localhost`], { stdio: 'ignore' })
  } catch {
    // No openssl (Windows, most often): the same certificate made in JS.
    const notAfterDate = new Date()
    notAfterDate.setFullYear(notAfterDate.getFullYear() + 10)
    const pems = await require('selfsigned').generate([{ name: 'commonName', value: 'claudia-chan' }], {
      keySize: 2048,
      notAfterDate,
      extensions: [{ name: 'subjectAltName', altNames: [{ type: 7, ip: lanAddress() }, { type: 2, value: 'localhost' }] }],
    })
    fs.writeFileSync(key, pems.private)
    fs.writeFileSync(cert, pems.cert)
  }
}

let vrStarting = false
async function startVr() {
  if (vrServer || vrStarting) return
  let { vrKey } = readConfig()
  if (!vrKey) saveConfig({ vrKey: (vrKey = crypto.randomBytes(12).toString('hex')) })
  // A self-signed certificate made once (the headset asks to trust it the first time).
  const dir = PACKAGED ? HOME : path.join(os.homedir(), '.config/claudia-chan')
  const key = path.join(dir, 'vr-key.pem'), cert = path.join(dir, 'vr-cert.pem')
  vrStarting = true
  try {
    await vrCertificate(key, cert)
  } catch (error) {
    console.error('vr: no certificate', error.message)
    return
  } finally {
    vrStarting = false
  }
  if (vrServer) return
  vrServer = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, (req, res) => {
    const url = new URL(req.url, 'https://x')
    const ok = sameSecret(url.searchParams.get('k'), vrKey) || sameSecret(req.headers['x-claudia-key'], vrKey)
    if (!ok && !(req.method === 'GET' && VR_PUBLIC.some(re => re.test(url.pathname)))) {
      res.writeHead(403).end()
      return
    }
    // The VR page sends the key with its own calls; past the check it is handled like a local request.
    if (ok) req.headers['x-claudia-chan'] = '1'
    req.viaVr = true
    handle(req, res)
  })
  vrServer.on('error', error => {
    console.error('vr server', error.message)
    vrServer = null
  })
  vrServer.listen(VR_PORT, '0.0.0.0')
}

function stopVr() {
  vrServer?.close()
  vrServer = null
  for (const res of streams) res.end()
  streams.clear()
}

// Speech recorded by the headset (webm/ogg/wav): to 16 kHz wav, then the same path as the desktop mic.
async function hearUpload(req) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'claudia-vrmic-'))
  const input = path.join(folder, 'in'), file = path.join(folder, 'mic.wav')
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  fs.writeFileSync(input, Buffer.concat(chunks))
  try {
    execFileSync(FFMPEG, ['-v', 'error', '-y', '-i', input, '-ac', '1', '-ar', '16000', file])
    const text = await transcribe(file)
    if (text) heard.push(req.viaPhone ? PHONE_MARK + text : text)
    lastHeard = text || '(no te entendí)'
    heardAt = Date.now()
    lastTaker = null
    show({ type: 'heard', text })
    return text
  } finally {
    fs.rmSync(folder, { recursive: true, force: true })
  }
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
  // Whatever the desktop avatar is told, open VR pages are told too.
  const sendToAvatar = win.webContents.send.bind(win.webContents)
  win.webContents.send = (channel, event) => {
    sendToAvatar(channel, event)
    broadcast(event)
  }
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true)
  win.setIgnoreMouseEvents(true)
  win.loadURL(`http://127.0.0.1:${PORT}/`)
  // If the page crashes reload it; if the window itself goes away, bring her back instead of leaving a headless app.
  win.webContents.on('render-process-gone', () => { if (alive()) win.reload() })
  // Loading again: nothing listens until the page says 'ready' (checkReminders waits for it).
  const loading = () => {
    pageReady = false
    pageLoadAt = Date.now()
  }
  loading()
  win.webContents.on('did-start-loading', loading)
  // The 📌 button starts showing whether she is staying still.
  win.webContents.on('did-finish-load', () => win.webContents.send('claudia-chan', { type: 'still', value: readCachedWalk() !== 'on' }))
  win.on('closed', () => {
    win = null
    pageReady = false
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
  setInterval(checkQuiet, 30000)
  setInterval(presenceTick, 5000)
  setInterval(checkReminders, 5000)
  // Suspended or locked is "away" whatever the idle counter says. (Lock events exist on macOS and
  // Windows only; Linux relies on the counter.)
  for (const name of ['suspend', 'lock-screen']) powerMonitor.on(name, () => onPresence(presence.sleepNow(Date.now())))
  for (const name of ['resume', 'unlock-screen']) powerMonitor.on(name, () => onPresence(presence.wakeNow(Date.now())))
  // A new install reads only the gist of long replies aloud; an existing one keeps reading everything.
  if (!readConfig().firstSeen) saveConfig({ firstSeen: Date.now(), lectura: readConfig().lectura ?? 'resumen' })

  setInterval(() => {
    if (!alive()) return
    const cursor = screen.getCursorScreenPoint()
    hover(cursor)
    if (isMoving) win.setPosition(cursor.x - Math.round(WIDTH / 2), cursor.y - 120)
    const [hereX, hereY] = win.getPosition()
    live(screen.getDisplayNearestPoint({ x: hereX + WIDTH / 2, y: hereY + HEIGHT / 2 }).workArea)
    const bounds = win.getBounds()
    win.webContents.send('claudia-chan', {
      type: 'cursor',
      x: (cursor.x - (bounds.x + bounds.width / 2)) / area.width,
      y: (cursor.y - (bounds.y + bounds.height * 0.2)) / area.height,
      // How her window is moving, and whether your hand is what moves it: she dangles from it.
      ...windowSpeed(bounds.x, bounds.y),
      held: Boolean(dragging) || isMoving,
    })
    // (With a game open the cursor darts over her head: that is not petting, nor staring.)
    if (!isMoving && !gamesOpen && detectPet(cursor.x - bounds.x, cursor.y - bounds.y, Date.now())) {
      pendingPets += 1
      saveConfig({ petDone: true, petCount: (readConfig().petCount ?? 0) + 1 })
      win.webContents.send('claudia-chan', { type: 'pet' })
    }
    const noticed = isMoving || gamesOpen ? null : detectHover(cursor.x - bounds.x, cursor.y - bounds.y, Date.now())
    // Quiet mode: no "¿me estás mirando?" when the cursor rests on her (asked only then: it reads the config).
    if (noticed && !isQuiet()) {
      const isSpanish = (readConfig().idioma ?? 'es') === 'es'
      // "¿Me estás mirando?": said aloud, in her generated voice (instead of the voiced clip).
      const speaks = Boolean(isSpanish && noticed.line && hasLocalVoice())
      win.webContents.send('claudia-chan', !isSpanish ? { ...noticed, line: undefined } : speaks ? { ...noticed, sound: undefined } : noticed)
      if (speaks) speakLocal(noticed.line)
    }
    whenAlone()
  }, 50)
}

// --- The installed app: on every start it refreshes the claude-chan plugin and command (an update
// may have moved the app), and the first time it downloads her voice and ears, telling the user how
// it goes in her bubble. A git checkout never does any of this: setup.sh did.
const FIRST_START = {
  es: {
    voz: p => `Estoy aprendiendo a hablar… ${p}% (solo esta vez)`,
    oido: p => `Ahora mis oídos… ${p}%`,
    listo: '¡Ya puedo hablarte y escucharte! Abre una terminal y escribe claude-chan para trabajar juntos ♡',
    noClaude: 'Me falta Claude Code: instálalo desde claude.com/claude-code y luego escribe claude-chan en una terminal.',
    error: 'No pude instalar mi voz (¿sin internet?). Lo intento otra vez la próxima vez que me abras.',
    comando: 'Ya hay un claude-chan tuyo; no lo toqué. El plugin está en',
  },
  en: {
    voz: p => `Learning to talk… ${p}% (only this once)`,
    oido: p => `Now my ears… ${p}%`,
    listo: 'I can talk and listen now! Open a terminal and type claude-chan to work together ♡',
    noClaude: 'Claude Code is missing: install it from claude.com/claude-code, then type claude-chan in a terminal.',
    error: "I couldn't install my voice (no internet?). I'll try again next time you open me.",
    comando: 'You already have your own claude-chan; I left it alone. The plugin is in',
  },
}

async function firstStart() {
  const say = FIRST_START[(readConfig().idioma ?? 'es') === 'es' ? 'es' : 'en']
  const note = (text, seconds = 8) => {
    show({ type: 'note', text, seconds })
    tray?.setToolTip(`Claudia-chan · ${text}`)
  }
  try {
    const pluginDir = install.syncPlugin()
    const command = install.installCommand(pluginDir)
    if (!command.written) console.log(say.comando, pluginDir)
  } catch (error) {
    console.error('plugin install failed', error.message)
  }
  if (install.voicesReady()) {
    if (!install.hasClaude()) note(say.noClaude, 15)
    return
  }
  let last = -1
  try {
    await install.installVoices((step, percent) => {
      if (step === 'listo' || percent - last < 5) return
      last = percent
      note(say[step](percent), 30)
    })
    note(install.hasClaude() ? say.listo : say.noClaude, 15)
    if (Notification.isSupported()) new Notification({ title: 'Claudia-chan', body: install.hasClaude() ? say.listo : say.noClaude }).show()
  } catch (error) {
    console.error('voice install failed', error.message)
    note(say.error, 15)
  } finally {
    tray?.setToolTip('Claudia-chan · por Dio Calderon')
  }
}

// --- The phone: her body and voice in the phone app, through a tunnel to this PC (phone.js has the
// safety notes). What is said from the phone reaches the session marked, so Claude can be careful.
const PHONE_MARK = '📱 '
const PHONE_TEXTS = {
  es: { hello: name => `📱 ¡Hola desde ${name}! Ahora también estoy en tu bolsillo ♡`, offer: '¿Me llevas también en el móvil? Mi botón ☰ → 📱 Llévame en el móvil, y escanéame ♡', ask: name => `📱 ${name} quiere conectarse. Acéptalo en la ventana si eres tú.` },
  en: { hello: name => `📱 Hi from ${name}! Now I'm in your pocket too ♡`, offer: 'Take me on your phone too? My ☰ button → 📱 Take me on your phone, and scan me ♡', ask: name => `📱 ${name} wants to connect. Accept it in the window if it's you.` },
}
const phoneTexts = () => PHONE_TEXTS[(readConfig().idioma ?? 'es') === 'es' ? 'es' : 'en']
let phoneWin = null
let phoneError = ''
let phoneQr = null // { link, expires, image }
const phoneLink = createPhoneLink({
  vendor: VENDOR,
  load: () => readConfig().phones,
  save: phones => saveConfig({ phones }),
  handle,
  onSay: text => {
    heard.push(PHONE_MARK + text)
    lastHeard = text
    heardAt = Date.now()
    lastTaker = null
    show({ type: 'heard', text })
  },
  onChange: change => {
    refreshTray()
    if (change?.connected && phoneLink.isConnected(change.connected.id) === true && !isQuiet()) show({ type: 'note', text: phoneTexts().hello(change.connected.name), seconds: 6 })
  },
  onPairRequest: () => {},
})

function openPhoneWindow() {
  if (phoneWin && !phoneWin.isDestroyed()) {
    phoneWin.show()
    phoneWin.focus()
    return
  }
  phoneWin = new BrowserWindow({ width: 460, height: 720, title: 'Claudia-chan · móvil', autoHideMenuBar: true })
  phoneWin.loadURL(`http://127.0.0.1:${PORT}/pair.html`)
}

const isLoopback = req => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)
async function handlePhone(req, res, urlPath) {
  // Only this PC's own windows: never the VR port, never the phone tunnel, never a web page.
  if (req.viaPhone || req.viaVr || !isLoopback(req) || req.headers['x-claudia-chan'] !== '1') {
    res.writeHead(403).end()
    return
  }
  const reply = data => res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(data))
  const body = req.method === 'POST' ? await readBody(req).then(b => { try { return JSON.parse(b || '{}') } catch { return {} } }) : {}
  if (urlPath === '/phone/start' && req.method === 'POST') {
    phoneError = ''
    phoneLink.start().then(makeQr).catch(error => { phoneError = error.message; refreshTray() })
    return reply({ ok: true })
  }
  if (urlPath === '/phone/stop' && req.method === 'POST') {
    phoneLink.stop()
    phoneQr = null
    return reply({ ok: true })
  }
  if (urlPath === '/phone/qr' && req.method === 'POST') {
    await makeQr().catch(error => { phoneError = error.message })
    return reply({ ok: Boolean(phoneQr) })
  }
  if (urlPath === '/phone/decide' && req.method === 'POST') {
    const done = phoneLink.pairing.decide(String(body.id), body.ok === true)
    if (done && body.ok === true) phoneQr = null // used: a new one only if asked
    return reply({ ok: done })
  }
  if (urlPath === '/phone/forget' && req.method === 'POST') return reply({ ok: phoneLink.pairing.forget(String(body.id)) })
  if (urlPath === '/phone/state') {
    const qrLive = phoneQr && phoneQr.expires > Date.now() ? phoneQr : null
    return reply({
      on: phoneLink.on(),
      error: phoneError,
      qr: qrLive ? { image: qrLive.image, link: qrLive.link, expires: qrLive.expires } : null,
      pending: phoneLink.pairing.pending(),
      phones: phoneLink.pairing.phones().map(({ id, name, created, seen }) => ({ id, name, created, seen, connected: phoneLink.isConnected(id) })),
      idioma: readConfig().idioma ?? 'es',
    })
  }
  res.writeHead(404).end()
}

async function makeQr() {
  const made = phoneLink.newQrLink()
  if (!made) return
  const image = await require('qrcode').toDataURL(made.link, { margin: 1, width: 380, errorCorrectionLevel: 'M', color: { dark: '#1c2550', light: '#ffffff' } })
  phoneQr = { ...made, image }
}

// A phone asking to pair brings the window forward, and she says so.
setInterval(() => {
  const asking = phoneLink.pairing.pending()
  if (!asking.length) return
  if (!phoneWin || phoneWin.isDestroyed() || !phoneWin.isFocused()) {
    openPhoneWindow()
    show({ type: 'note', text: phoneTexts().ask(asking[0].name), seconds: 8 })
  }
}, 1500).unref()

// She offers it once, a few minutes into a day with her, if no phone was ever paired.
setTimeout(() => {
  const { phoneOffered, phones } = readConfig()
  if (phoneOffered || phones?.length || isQuiet()) return
  saveConfig({ phoneOffered: true })
  show({ type: 'note', text: phoneTexts().offer, seconds: 12 })
}, 4 * 60 * 1000).unref()

app.commandLine.appendSwitch('enable-transparent-visuals')
app.whenReady().then(() => {
  app.dock?.hide()
  // Windows shows notifications from an unpackaged Electron only with an app id.
  if (process.platform === 'win32') app.setAppUserModelId('claudia-chan')
  // Closed with "Cerrar" or /claudia off: only a deliberate start (--wake: a new session, /claudia on,
  // run.sh) brings her back, never a heartbeat relaunch from some other session.
  // The installed app opened from the desktop menu is a deliberate start too.
  if (readConfig().dismissed === true && !process.argv.includes('--wake') && !(PACKAGED && !fromPlugin)) {
    app.exit(0)
    return
  }
  saveConfig({ dismissed: false })
  http.createServer(handle).on('error', () => app.exit(1)).listen(PORT, '127.0.0.1', () => {
    createWindow()
    setupTray()
    if (readConfig().vr === 'on') startVr()
    if (PACKAGED) firstStart()
  })
  console.log('move shortcut registered:', globalShortcut.register(MOVE_KEY, toggleMove))
  console.log('listen shortcut registered:', globalShortcut.register(LISTEN_KEY, toggleListen))
  console.log('hide shortcut registered:', globalShortcut.register(HIDE_KEY, toggleVisible))
  try {
    muteKeyOk = globalShortcut.register(readConfig().muteKey ?? MUTE_KEY, () => setMute(!readConfig().muted))
  } catch {
    muteKeyOk = false // config.muteKey is not a key Electron knows
  }
  console.log('mute shortcut registered:', muteKeyOk)
})
app.on('before-quit', () => { quitting = true })
// If the GPU process dies, the avatar page reloads (avatar.js also reloads on a lost WebGL context).
app.on('child-process-gone', (_, details) => {
  if (details.type === 'GPU' && alive()) setTimeout(() => alive() && win.reload(), 1500)
})
app.on('will-quit', () => {
  phoneLink?.stop()
  globalShortcut.unregisterAll()
  whisper?.kill()
  winShell?.kill()
})
