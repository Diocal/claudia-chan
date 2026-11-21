// Synthesized cues. A file at assets/sounds/<name>.mp3 replaces its cue, which
// is how recorded voices slot in later.
const TABLE = {
  saludo: { wave: 'triangle', notes: [[659, 0.1], [880, 0.1], [1319, 0.2]] },
  listo: { wave: 'sine', notes: [[784, 0.08], [1047, 0.16]] },
  exito: { wave: 'triangle', notes: [[523, 0.08], [659, 0.08], [784, 0.08], [1047, 0.26]] },
  error: { wave: 'triangle', notes: [[392, 0.14], [311, 0.26]] },
  sorpresa: { wave: 'sine', notes: [[500, 0.06], [1200, 0.18]] },
  enojo: { wave: 'square', notes: [[196, 0.09], [185, 0.09], [175, 0.18]] },
  guino: { wave: 'sine', notes: [[1319, 0.05], [1760, 0.1]] },
  sonrojo: { wave: 'sine', notes: [[880, 0.08], [988, 0.08], [880, 0.08], [1175, 0.2]] },
  descanso: { wave: 'sine', notes: [[659, 0.2], [523, 0.2], [440, 0.4]] },
  preocupada: { wave: 'triangle', notes: [[523, 0.12], [494, 0.12], [523, 0.24]] },
  celos: { wave: 'triangle', notes: [[330, 0.12], [311, 0.12], [294, 0.24]] },
  yandere: { wave: 'sawtooth', notes: [[1047, 0.14], [1109, 0.14], [147, 0.5]] },
  enamorada: { wave: 'sine', notes: [[698, 0.1], [880, 0.1], [1047, 0.1], [1397, 0.28]] },
  caricia: { wave: 'triangle', notes: [[110, 0.1], [130, 0.1], [110, 0.1], [130, 0.1], [110, 0.2]] },
}

const VOLUME = 0.12
const audio = new AudioContext()
let isMuted = false
// Her voice passes through here on its way out, so the mouth can follow how loud she really is.
const analyser = audio.createAnalyser()
analyser.fftSize = 512
analyser.smoothingTimeConstant = 0.3
analyser.connect(audio.destination)
const samples = new Uint8Array(analyser.fftSize)
// The synthesized cues leave through here, so hush() can cut the ones already scheduled.
let cues = audio.createGain()
cues.connect(audio.destination)
// How many times she was hushed: a cue that was still loading when it happened is never played.
let hushes = 0

// Muting cuts her off mid-sentence and forgets what was still queued.
export function setMuted(value) {
  isMuted = Boolean(value)
  if (isMuted) hush()
}

// Stops what is sounding right now without muting her (quiet mode starts with this).
export function hush() {
  generation++
  hushes++
  // Notes already scheduled keep playing into a wire that goes nowhere.
  cues.disconnect()
  cues = audio.createGain()
  cues.connect(audio.destination)
  try { speech?.stop() } catch {}
  speech = null
  try { clip?.stop() } catch {}
  clip = null
  chain = Promise.resolve()
}

// Her short voiced reactions: assets/sounds/<lang>/<name>.mp3 in her own (Kokoro) voice for that language;
// the Japanese clips in assets/sounds/ when she speaks with the old Japanese voice or has no clips for it.
let clipFolder = ''
export function setVoice({ voz, idioma } = {}) {
  const natural = voz === undefined || voz === 'kokoro' || voz === 'elevenlabs'
  clipFolder = natural && ['es', 'en'].includes(idioma ?? 'es') ? `${idioma ?? 'es'}/` : ''
}

function synth(cue) {
  let at = audio.currentTime + 0.01
  for (const [frequency, length] of cue.notes) {
    const oscillator = audio.createOscillator()
    const gain = audio.createGain()
    oscillator.type = cue.wave
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(VOLUME, at + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length)
    oscillator.connect(gain).connect(cues)
    oscillator.start(at)
    oscillator.stop(at + length)
    at += length * 0.9
  }
}

// Her speech plays strictly one piece at a time. A queued piece waits for every piece queued before
// it (not just the one playing when it arrived); anything else cuts in and drops whatever was still
// waiting from the previous reply. Resolves with the piece's length when it starts, for the mouth.
let speech = null
let generation = 0
let chain = Promise.resolve()

const decode = base64 => audio.decodeAudioData(Uint8Array.from(atob(base64), c => c.charCodeAt(0)).buffer)

export function playSpeech(base64, queue = false) {
  if (isMuted) return Promise.resolve(0)

  if (!queue) {
    generation++
    speech?.stop()
    speech = null
    chain = Promise.resolve()
  }
  const turn = generation
  const decoded = decode(base64)
  const started = chain.then(async () => {
    const buffer = await decoded
    if (turn !== generation) return null
    if (audio.state === 'suspended') await audio.resume()
    clip?.stop()
    const source = audio.createBufferSource()
    source.buffer = buffer
    source.connect(analyser)
    const ended = new Promise(resolve => {
      source.onended = () => {
        if (speech === source) speech = null
        resolve()
      }
    })
    speech = source
    source.start()
    return { seconds: buffer.duration, ended }
  })
  chain = started.then(piece => piece?.ended).catch(() => {})
  return started.then(piece => piece?.seconds ?? 0)
}

// How loud her voice is right now (RMS, 0..1), or null when neither speech nor a voiced clip is sounding.
export function voiceLevel() {
  if (!speech && !clip) return null
  analyser.getByteTimeDomainData(samples)
  let sum = 0
  for (const value of samples) sum += ((value - 128) / 128) ** 2
  return Math.sqrt(sum / samples.length)
}

// One voiced clip at a time, and never on top of her speech.
let clip = null
export async function playSound(name) {
  const cue = TABLE[name]
  if (isMuted || !cue) return

  // Muted or hushed (quiet mode) while the file was on its way: it stays unplayed.
  const turn = hushes
  const silenced = () => isMuted || turn !== hushes
  if (audio.state === 'suspended') await audio.resume()
  const recorded = await fetch(`/assets/sounds/${clipFolder}${name}.mp3`).catch(() => null)
  if (recorded?.ok) {
    const buffer = await audio.decodeAudioData(await recorded.arrayBuffer())
    if (speech || silenced()) return
    clip?.stop()
    const source = audio.createBufferSource()
    clip = source
    source.buffer = buffer
    source.connect(analyser)
    source.onended = () => { if (clip === source) clip = null }
    source.start()
    return
  }
  if (!silenced()) synth(cue)
}
