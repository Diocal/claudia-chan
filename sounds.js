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

export function setMuted(value) {
  isMuted = Boolean(value)
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
    oscillator.connect(gain).connect(audio.destination)
    oscillator.start(at)
    oscillator.stop(at + length)
    at += length * 0.9
  }
}

let speech = null

// Answers how many seconds she will be talking, for the mouth.
// A queued piece starts when the one playing ends; anything else cuts in. Resolves (with its length)
// when it starts playing, so the mouth moves with it.
let speechEnds = Promise.resolve()
export async function playSpeech(base64, queue = false) {
  if (isMuted) return 0

  if (audio.state === 'suspended') await audio.resume()
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
  const buffer = await audio.decodeAudioData(bytes.buffer)
  if (queue) await speechEnds
  else speech?.stop()
  const source = audio.createBufferSource()
  speech = source
  source.buffer = buffer
  source.connect(audio.destination)
  speechEnds = new Promise(resolve => { source.onended = resolve })
  source.start()
  return buffer.duration
}

export async function playSound(name) {
  const cue = TABLE[name]
  if (isMuted || !cue) return

  if (audio.state === 'suspended') await audio.resume()
  const recorded = await fetch(`/assets/sounds/${clipFolder}${name}.mp3`).catch(() => null)
  if (recorded?.ok) {
    const buffer = await audio.decodeAudioData(await recorded.arrayBuffer())
    const source = audio.createBufferSource()
    source.buffer = buffer
    source.connect(audio.destination)
    source.start()
    return
  }
  synth(cue)
}
