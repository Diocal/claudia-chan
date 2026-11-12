// Open JTalk with the Mei voice, vendored in this folder: Japanese speech on the CPU.
const { execFile } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const ROOT = path.join(__dirname, 'vendor')
const BINARY = path.join(ROOT, 'root/usr/bin/open_jtalk')
const LIBS = path.join(ROOT, 'root/usr/lib/x86_64-linux-gnu')
const DICTIONARY = path.join(ROOT, 'root/var/lib/mecab/dic/open-jtalk/naist-jdic')
const VOICES = ['normal', 'happy', 'angry', 'sad', 'bashful']
const MAX_CHARS = 160

const cleanText = text => text.replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS)

const PITCH = { grave: '-1', normal: '2', agudo: '5' }
const SPEED = { lenta: '0.9', normal: '1.05', rapida: '1.25' }

async function synthesize(text, voice, { tono, velocidad } = {}) {
  const folder = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'claudia-speech-'))
  try {
    const input = path.join(folder, 'in.txt')
    const output = path.join(folder, 'out.wav')
    await fs.promises.writeFile(input, cleanText(text))
    const model = path.join(ROOT, 'mei', `mei_${VOICES.includes(voice) ? voice : 'normal'}.htsvoice`)
    await new Promise((resolve, reject) => {
      execFile(BINARY, ['-x', DICTIONARY, '-m', model, '-fm', PITCH[tono] ?? PITCH.normal, '-r', SPEED[velocidad] ?? SPEED.normal, '-ow', output, input],
        { env: { ...process.env, LD_LIBRARY_PATH: LIBS }, timeout: 15000 },
        error => (error ? reject(error) : resolve()))
    })
    return await fs.promises.readFile(output)
  } finally {
    await fs.promises.rm(folder, { recursive: true, force: true })
  }
}


// --- Natural voices: Kokoro (local, free, the default) and ElevenLabs (optional, needs a key).
// Kokoro runs vendor/kokoro (setup.sh); ElevenLabs reads ELEVENLABS_API_KEY or ~/.config/claudia-chan/elevenlabs.key.
const KOKORO_PYTHON = path.join(ROOT, 'kokoro/bin/python')
// Spanish is read with the Latin American accent (seseo), not Castilian.
const KOKORO_LANG = { es: 'es-419', en: 'en-us', pt: 'pt-br', ja: 'ja' }
const KOKORO_SPEED = { lenta: 0.88, normal: 1.0, rapida: 1.15 }
// `tono` nudges the pitch (tempo kept).
const KOKORO_PITCH = { grave: 0.94, normal: 1.0, agudo: 1.12 }
// Default voice per language (config vozKokoro overrides it): a young girl's voice; jf_tebukuro reads
// Spanish clearly with a light Asian lilt.
const KOKORO_VOICE = { es: 'jf_tebukuro', en: 'af_sky', pt: 'jf_tebukuro', ja: 'jf_tebukuro' }
const UNYA = 'OPMFuXBnkGNrWUx7xtZY' // ElevenLabs "Unya": sweet, high Japanese voice; speaks Spanish with an accent
const NATURAL_CHARS = 2400 // a whole chat reply; code, links and emoji are dropped first

// What reads well aloud: no code, links, markdown, emoji or kaomoji.
const speakable = text =>
  text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`\n]{1,24})`/g, '$1')
    .replace(/`[^`]*`/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[*_#>|~]/g, ' ')
    .replace(/\p{Extended_Pictographic}/gu, ' ')
    .replace(/\([^\p{L}\p{N}\s]{1,}[^)]{0,12}\)/gu, ' ')
    .replace(/[♡♥☆★♪]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NATURAL_CHARS)

const hasKokoro = () => fs.existsSync(KOKORO_PYTHON) && fs.existsSync(path.join(ROOT, 'kokoro/model/voices-v1.0.bin'))

function elevenLabsKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY.trim()
  try {
    return fs.readFileSync(path.join(os.homedir(), '.config/claudia-chan/elevenlabs.key'), 'utf8').trim()
  } catch {
    return ''
  }
}

async function kokoro(text, { idioma = 'es', velocidad, vozKokoro, tono } = {}) {
  const folder = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'claudia-kokoro-'))
  try {
    const output = path.join(folder, 'out.wav')
    await new Promise((resolve, reject) => {
      const child = execFile(KOKORO_PYTHON, [path.join(__dirname, 'tts_kokoro.py'), vozKokoro || KOKORO_VOICE[idioma] || 'ef_dora', KOKORO_LANG[idioma], String(KOKORO_SPEED[velocidad] ?? 1), output],
        { timeout: 60000 }, error => (error ? reject(error) : resolve()))
      child.stdin.end(text)
    })
    const pitch = KOKORO_PITCH[tono] ?? KOKORO_PITCH.normal
    if (pitch === 1) return await fs.promises.readFile(output)
    const younger = path.join(folder, 'young.wav')
    await new Promise((resolve, reject) => {
      execFile('ffmpeg', ['-v', 'error', '-y', '-i', output, '-af', `asetrate=24000*${pitch},aresample=24000,atempo=1/${pitch}`, younger],
        { timeout: 15000 }, error => (error ? reject(error) : resolve()))
    })
    return await fs.promises.readFile(younger)
  } finally {
    await fs.promises.rm(folder, { recursive: true, force: true })
  }
}

async function elevenLabs(text, { idioma = 'es', vozEleven } = {}) {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${vozEleven || UNYA}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': elevenLabsKey(), 'content-type': 'application/json' },
    body: JSON.stringify({ text, model_id: 'eleven_flash_v2_5', language_code: idioma }),
    signal: AbortSignal.timeout(20000),
  })
  if (!response.ok) throw new Error(`ElevenLabs ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

// Which voice will speak: the one chosen if it can (key present, language supported), else the next one.
function naturalEngine(config) {
  const lang = config.idioma ?? 'es'
  const voz = config.voz ?? 'kokoro'
  if (voz === 'elevenlabs' && elevenLabsKey()) return 'elevenlabs'
  if ((voz === 'kokoro' || voz === 'elevenlabs') && KOKORO_LANG[lang] && hasKokoro()) return 'kokoro'
  return null
}

async function synthesizeNatural(text, config) {
  const line = speakable(text)
  const engine = naturalEngine(config)
  if (!line || !engine) return null
  if (engine === 'elevenlabs') {
    try {
      return await elevenLabs(line, config)
    } catch (error) {
      console.error('elevenlabs failed, using kokoro', error.message)
      if (!KOKORO_LANG[config.idioma ?? 'es'] || !hasKokoro()) return null
    }
  }
  return kokoro(line, config)
}

// Sentences grouped into short pieces, so the first one plays while the next is being made.
function speechPieces(text, size = 220) {
  // A sentence ends at . ! ? … followed by a space, so main.js or 3.5 stay whole.
  const sentences = speakable(text).split(/(?<=[.!?…])\s+/)
  const pieces = []
  for (const sentence of sentences.map(x => x.trim()).filter(Boolean)) {
    const last = pieces.length - 1
    if (last >= 0 && pieces[last].length + sentence.length < size) pieces[last] += ` ${sentence}`
    else pieces.push(sentence)
  }
  return pieces
}

module.exports = { synthesize, cleanText, synthesizeNatural, naturalEngine, speakable, speechPieces }
