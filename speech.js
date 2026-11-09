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

module.exports = { synthesize, cleanText }
