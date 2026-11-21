// Where things live. A git checkout keeps everything in its own folder, as always. The installed app
// is read-only, so it keeps her data, her voice, the claude-chan plugin and the user's own models in a
// per-user folder (CLAUDIA_CHAN_HOME overrides it).
const fs = require('fs')
const os = require('os')
const path = require('path')

function isPackaged() {
  try {
    return Boolean(require('electron').app?.isPackaged)
  } catch {
    return false // plain node (tests)
  }
}

function userHome() {
  if (process.env.CLAUDIA_CHAN_HOME) return process.env.CLAUDIA_CHAN_HOME
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData/Roaming'), 'claudia-chan')
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library/Application Support/claudia-chan')
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'claudia-chan')
}

const PACKAGED = isPackaged()
const APP = __dirname
const HOME = PACKAGED ? userHome() : APP
const VENDOR = path.join(HOME, 'vendor')
// Models and Mixamo animations the user adds; a checkout keeps them in assets/ as before.
const USER_MODELS = PACKAGED ? path.join(HOME, 'models') : null
const USER_ANIMATIONS = PACKAGED ? path.join(HOME, 'animations') : null

// A venv's Python: Scripts\python.exe on Windows, bin/python elsewhere.
const venvPython = name => path.join(VENDOR, name, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')

function onPath(command) {
  const names = process.platform === 'win32' ? [`${command}.exe`, `${command}.cmd`] : [command]
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    for (const name of names) {
      const file = path.join(dir, name)
      try {
        if (fs.statSync(file).isFile()) return file
      } catch {}
    }
  }
  return null
}

function bundledFfmpeg() {
  try {
    const file = require('ffmpeg-static')
    return file && fs.existsSync(file) ? file : null
  } catch {
    return null
  }
}

// The system's ffmpeg first: on Linux it records from PulseAudio/PipeWire, and the bundled static
// build only knows ALSA. Apps opened from a desktop menu often lack Homebrew on PATH: then the bundled one.
const SYSTEM_FFMPEG = onPath('ffmpeg')
const FFMPEG = SYSTEM_FFMPEG || bundledFfmpeg() || 'ffmpeg'
const LINUX_MIC = SYSTEM_FFMPEG ? ['-f', 'pulse', '-i', 'default'] : ['-f', 'alsa', '-i', 'default']

// uv makes the Python environments of her voice and ears; the installer carries its own copy.
const UV = PACKAGED ? path.join(process.resourcesPath, 'uv', process.platform === 'win32' ? 'uv.exe' : 'uv') : onPath('uv') || 'uv'

module.exports = { PACKAGED, APP, HOME, VENDOR, USER_MODELS, USER_ANIMATIONS, FFMPEG, LINUX_MIC, UV, venvPython, onPath }
