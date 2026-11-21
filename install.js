// First start of the installed app (never in a git checkout, where setup.sh does all this):
// the claude-chan plugin and command, and her voice and ears, downloaded once into the user's folder.
const { execFile } = require('child_process')
const fs = require('fs')
const https = require('https')
const os = require('os')
const path = require('path')
const { APP, HOME, VENDOR, UV, venvPython, onPath } = require('./paths.js')

const MARK = 'claudia-chan app' // in the command we write: one the user wrote is never replaced
const KOKORO_FILES = ['kokoro-v1.0.int8.onnx', 'voices-v1.0.bin']
const KOKORO_URL = 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/'
// Bump when the Python side changes, so an update installs it again.
const VOICE_VERSION = '1'

// The plugin goes next to her config: its `${root}/..` is where it reads config.json and launch.json.
function syncPlugin(home = HOME) {
  // In a checkout HOME is the checkout itself: this would delete the plugin's own source.
  if (path.resolve(home) === path.resolve(APP)) throw new Error('syncPlugin: only for the installed app')
  const target = path.join(home, 'plugin')
  fs.rmSync(target, { recursive: true, force: true })
  fs.cpSync(path.join(APP, 'plugin'), target, { recursive: true, filter: source => !/[\\/]tests($|[\\/])/.test(source) })
  // How the plugin starts this app. An AppImage runs from a new mount each time: its own path is stable.
  fs.writeFileSync(path.join(home, 'launch.json'), JSON.stringify({ exe: process.env.APPIMAGE || process.execPath }, null, 2))
  return target
}

// ~/.local/bin/claude-chan (claude-chan.cmd on Windows, with that folder added to the user's PATH).
function installCommand(pluginDir) {
  const bin = path.join(os.homedir(), '.local', 'bin')
  const windows = process.platform === 'win32'
  const file = path.join(bin, windows ? 'claude-chan.cmd' : 'claude-chan')
  const body = windows
    ? `@echo off\r\nrem ${MARK}\r\nclaude --plugin-dir "${pluginDir}" %*\r\n`
    : `#!/bin/sh\n# ${MARK}\nexec claude --plugin-dir "${pluginDir}" "$@"\n`
  if (fs.existsSync(file) && !fs.readFileSync(file, 'utf8').includes(MARK)) return { file, written: false }
  fs.mkdirSync(bin, { recursive: true })
  fs.writeFileSync(file, body, { mode: 0o755 })
  if (windows) {
    const script = `$b='${bin}';$p=[Environment]::GetEnvironmentVariable('Path','User');if(\"$p\" -notlike \"*$b*\"){[Environment]::SetEnvironmentVariable('Path',\"$p;$b\",'User')}`
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true }, () => {})
  }
  return { file, written: true }
}

// Whether Claude Code is installed (a menu-launched app may have a shorter PATH: also its usual homes).
function hasClaude() {
  const home = os.homedir()
  return Boolean(onPath('claude') || [path.join(home, '.local/bin/claude'), path.join(home, '.claude/local/claude'), path.join(home, '.local/bin/claude.exe')].some(f => fs.existsSync(f)))
}

const run = (file, args) =>
  new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true, timeout: 20 * 60 * 1000, env: { ...process.env, UV_PYTHON_PREFERENCE: 'only-managed' } }, (error, _stdout, stderr) =>
      error ? reject(new Error(`${path.basename(file)} ${args[0]}: ${String(stderr).trim().split('\n').pop() || error.message}`)) : resolve())
  })

function download(url, file, onBytes, redirects = 5) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'user-agent': 'claudia-chan' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume()
        resolve(download(new URL(res.headers.location, url).href, file, onBytes, redirects - 1))
        return
      }
      if (res.statusCode !== 200) {
        res.resume()
        reject(new Error(`download ${res.statusCode}: ${url}`))
        return
      }
      const total = Number(res.headers['content-length']) || 0
      let got = 0
      const part = `${file}.part`
      const out = fs.createWriteStream(part)
      res.on('data', chunk => {
        got += chunk.length
        onBytes?.(got, total)
      })
      res.pipe(out)
      out.on('finish', () => out.close(() => {
        fs.renameSync(part, file)
        resolve()
      }))
      out.on('error', reject)
      res.on('error', reject)
    }).on('error', reject)
  })
}

const voicesReady = () => fs.existsSync(path.join(VENDOR, `.ready-${VOICE_VERSION}`))

// Kokoro (her voice) first, so she can speak as soon as possible; then Whisper (her ears).
// `progress(step, percent)` is called along the way. Safe to run again after a failure.
async function installVoices(progress = () => {}) {
  if (voicesReady()) return
  fs.mkdirSync(VENDOR, { recursive: true })
  const model = path.join(VENDOR, 'kokoro', 'model')
  if (!fs.existsSync(venvPython('kokoro'))) {
    progress('voz', 2)
    await run(UV, ['venv', '-q', path.join(VENDOR, 'kokoro'), '--python', '3.11'])
  }
  progress('voz', 8)
  await run(UV, ['pip', 'install', '-q', '--python', venvPython('kokoro'), 'kokoro-onnx', 'soundfile'])
  fs.mkdirSync(model, { recursive: true })
  for (const [i, name] of KOKORO_FILES.entries()) {
    const file = path.join(model, name)
    if (fs.existsSync(file)) continue
    await download(KOKORO_URL + name, file, (got, total) => total && progress('voz', Math.round(15 + 45 * (i + got / total) / KOKORO_FILES.length)))
  }
  progress('oido', 62)
  if (!fs.existsSync(venvPython('whisper'))) await run(UV, ['venv', '-q', path.join(VENDOR, 'whisper'), '--python', '3.11'])
  progress('oido', 70)
  await run(UV, ['pip', 'install', '-q', '--python', venvPython('whisper'), 'faster-whisper'])
  fs.writeFileSync(path.join(VENDOR, `.ready-${VOICE_VERSION}`), new Date().toISOString())
  progress('listo', 100)
}

module.exports = { syncPlugin, installCommand, hasClaude, installVoices, voicesReady }
