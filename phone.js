// Claudia on your phone: her body and voice in the phone app (claudia-chan.vercel.app/app), connected to
// this PC through a Cloudflare quick tunnel. The brain stays here: your claude-chan session, your
// Claude subscription.
//
// Safety, because whoever talks to her through the phone talks to Claude Code on this PC:
// - The tunnel reaches a server of its own (loopback port 8973), never the app's main server, and it
//   answers only an allow-list of paths. /vr, settings and every other local endpoint are not on it.
// - Pairing: the QR carries a one-time code that expires in 2 minutes, and the person at the PC must
//   accept the phone in the pairing window. A photo of the QR is not enough.
// - Each phone then has its own long random token, kept only as a hash here and sent in a header (never
//   in a URL). Phones can be forgotten one by one.
// - The tunnel is open only while the link is on, and closes by itself after 30 idle minutes.
const { spawn, execFileSync } = require('child_process')
const crypto = require('crypto')
const fs = require('fs')
const http = require('http')
const https = require('https')
const path = require('path')

const PHONE_PORT = 8973
const APP_URL = 'https://claudia-chan.vercel.app/app/'
// Pages that may call the phone server: the phone app, and a local copy while developing it.
const ALLOWED_ORIGINS = [/^https:\/\/claudia-chan\.vercel\.app$/, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/]
const CODE_MS = 2 * 60 * 1000
const IDLE_CLOSE_MS = 30 * 60 * 1000
const CLOUDFLARED = '2026.10.7'
// Paths anyone may GET (what the phone app imports to draw her): no secrets in any of them.
const PUBLIC_GET = [/^\/(activities|style|mixamo)\.js$/, /^\/assets\/models\/[\w.-]+\.vrm$/, /^\/assets\/sample\.vrm$/, /^\/hello$/]
// Paths a paired phone may use, handed to the app's own handler.
const PAIRED = { GET: [/^\/poll$/, /^\/stream$/, /^\/config\.json$/, /^\/animations$/, /^\/assets\/animations\/[\w.%-]+$/, /^\/me$/], POST: [/^\/audio$/, /^\/say$/, /^\/forget-me$/] }

const sha = text => crypto.createHash('sha256').update(text).digest('hex')
function sameHash(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
}
const newSecret = bytes => crypto.randomBytes(bytes).toString('base64url')

// --- pairing bookkeeping, kept apart from the server so it can be tested on its own
function createPairing({ load, save, now = () => Date.now() }) {
  let code = null // { value, expires }
  const pending = new Map() // id -> { id, name, at, decide }

  const phones = () => load() ?? []
  const findByToken = token => (typeof token === 'string' && token ? phones().find(p => sameHash(p.hash, sha(token))) ?? null : null)

  return {
    phones,
    pending: () => [...pending.values()].map(({ id, name, at }) => ({ id, name, at })),
    newCode() {
      code = { value: newSecret(18), expires: now() + CODE_MS }
      return code
    },
    code: () => (code && code.expires > now() ? code : null),
    findByToken,
    // A phone asks to pair. Resolves to { token, id } once accepted, or null (refused, expired code, timeout).
    request({ code: given, name, token }, timeoutMs = CODE_MS) {
      const known = findByToken(token)
      if (known) return Promise.resolve({ id: known.id, token, known: true })
      if (!code || code.expires <= now() || typeof given !== 'string' || !sameHash(sha(given), sha(code.value))) return Promise.resolve(null)
      code = null // one use only
      const id = newSecret(9)
      const label = String(name || 'Móvil').replace(/[^\p{L}\p{N} ._'-]/gu, '').slice(0, 40) || 'Móvil'
      return new Promise(resolve => {
        const timer = setTimeout(() => decide(false), timeoutMs)
        timer.unref?.()
        const decide = ok => {
          clearTimeout(timer)
          pending.delete(id)
          if (!ok) return resolve(null)
          const fresh = newSecret(32)
          save([...phones(), { id, name: label, hash: sha(fresh), created: now(), seen: now() }])
          resolve({ id, token: fresh })
        }
        pending.set(id, { id, name: label, at: now(), decide })
      })
    },
    decide(id, ok) {
      const request = pending.get(id)
      if (!request) return false
      request.decide(Boolean(ok))
      return true
    },
    forget(id) {
      const before = phones()
      save(before.filter(p => p.id !== id))
      return before.length !== phones().length
    },
    touch(id) {
      save(phones().map(p => (p.id === id ? { ...p, seen: now() } : p)))
    },
  }
}

// --- cloudflared: downloaded once (pinned) into the vendor folder
function cloudflaredFile(vendor) {
  return path.join(vendor, 'cloudflared', process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared')
}

function download(url, file, redirects = 5) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'user-agent': 'claudia-chan' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume()
        resolve(download(new URL(res.headers.location, url).href, file, redirects - 1))
        return
      }
      if (res.statusCode !== 200) {
        res.resume()
        reject(new Error(`download ${res.statusCode}`))
        return
      }
      const out = fs.createWriteStream(`${file}.part`)
      res.pipe(out)
      out.on('finish', () => out.close(() => { fs.renameSync(`${file}.part`, file); resolve() }))
      out.on('error', reject)
    }).on('error', reject)
  })
}

async function ensureCloudflared(vendor) {
  const file = cloudflaredFile(vendor)
  if (fs.existsSync(file)) return file
  const arch = process.arch === 'arm64' ? 'arm64' : 'amd64'
  const base = `https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED}/`
  fs.mkdirSync(path.dirname(file), { recursive: true })
  if (process.platform === 'darwin') {
    const tgz = path.join(path.dirname(file), 'cloudflared.tgz')
    await download(`${base}cloudflared-darwin-${arch}.tgz`, tgz)
    execFileSync('tar', ['-xzf', tgz, '-C', path.dirname(file)])
    fs.rmSync(tgz, { force: true })
  } else {
    await download(`${base}cloudflared-${process.platform === 'win32' ? 'windows' : 'linux'}-${arch}${process.platform === 'win32' ? '.exe' : ''}`, file)
  }
  fs.chmodSync(file, 0o755)
  return file
}

// --- the link: phone server + tunnel
function createPhoneLink({ vendor, load, save, handle, onSay, onChange = () => {}, onPairRequest = () => {} }) {
  const pairing = createPairing({ load, save })
  const connected = new Map() // phone id -> open streams
  let server = null
  let tunnel = null
  let url = null
  let starting = null
  let lastUse = Date.now()
  let lastTouch = 0
  // Events for the phones. Quick tunnels hold back server-sent events, so phones long-poll instead:
  // each /poll returns what happened after the last one, or waits up to 25 s for something.
  const POLL_WAIT_MS = 25000
  const events = []
  let seq = 0
  const waiters = new Set()
  const lastPoll = new Map() // phone id -> time
  const polling = id => Date.now() - (lastPoll.get(id) ?? 0) < POLL_WAIT_MS + 15000
  function push(event) {
    if (!event || event.type === 'cursor' || !url) return
    events.push({ seq: ++seq, event })
    while (events.length > 200) events.shift()
    for (const wake of waiters) wake()
  }
  function poll(after) {
    const since = Number.isInteger(after) && after <= seq ? after : seq
    const ready = () => events.filter(e => e.seq > since)
    if (ready().length) return Promise.resolve({ seq, events: ready().map(e => e.event) })
    return new Promise(resolve => {
      const done = () => { waiters.delete(done); clearTimeout(timer); resolve({ seq, events: ready().map(e => e.event) }) }
      const timer = setTimeout(done, POLL_WAIT_MS)
      waiters.add(done)
    })
  }

  const allowOrigin = (req, res) => {
    const origin = req.headers.origin
    if (origin && ALLOWED_ORIGINS.some(re => re.test(origin))) {
      res.setHeader('access-control-allow-origin', origin)
      res.setHeader('vary', 'origin')
      res.setHeader('access-control-allow-headers', 'authorization, content-type')
      res.setHeader('access-control-allow-methods', 'GET, POST')
      res.setHeader('access-control-max-age', '600')
    }
  }

  const readJson = req => new Promise(resolve => {
    let body = ''
    req.on('data', chunk => { body += chunk; if (body.length > 20000) req.destroy() })
    req.on('end', () => { try { resolve(JSON.parse(body)) } catch { resolve({}) } })
  })
  const json = (res, status, data) => res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(data))

  async function serve(req, res) {
    allowOrigin(req, res)
    if (req.method === 'OPTIONS') return res.writeHead(204).end()
    const urlPath = req.url.split('?')[0]
    lastUse = Date.now()
    if (req.method === 'GET' && PUBLIC_GET.some(re => re.test(urlPath))) {
      if (urlPath === '/hello') return json(res, 200, { app: 'claudia-chan', pairing: Boolean(pairing.code()) })
      req.url = urlPath // no query strings go through
      return handle(req, res)
    }
    if (req.method === 'POST' && urlPath === '/pair') {
      const body = await readJson(req)
      const result = await pairing.request(body)
      if (!result) return json(res, 403, { error: 'refused' })
      onChange()
      return json(res, 200, result)
    }
    const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
    const phone = pairing.findByToken(token)
    if (!phone || !(PAIRED[req.method] ?? []).some(re => re.test(urlPath))) return json(res, phone ? 404 : 401, { error: phone ? 'not found' : 'pair first' })
    if (Date.now() - lastTouch > 60000) { lastTouch = Date.now(); pairing.touch(phone.id) }
    if (urlPath === '/me') return json(res, 200, { id: phone.id, name: phone.name })
    if (urlPath === '/poll') {
      const fresh = !polling(phone.id)
      lastPoll.set(phone.id, Date.now())
      if (fresh) onChange({ connected: phone })
      const asked = new URL(req.url, 'http://x').searchParams.get('after')
      // The first call only learns where the queue is: nothing old is replayed.
      if (asked === null) return json(res, 200, { seq, events: [] })
      const after = Number(asked)
      const answer = await poll(Number.isInteger(after) && after >= 0 ? after : NaN)
      lastPoll.set(phone.id, Date.now())
      return json(res, 200, answer)
    }
    if (urlPath === '/forget-me') { pairing.forget(phone.id); onChange(); return json(res, 200, { ok: true }) }
    if (urlPath === '/say') {
      const { text } = await readJson(req)
      if (typeof text !== 'string' || !text.trim()) return json(res, 400, { error: 'empty' })
      onSay(text.trim().slice(0, 2000))
      return json(res, 200, { ok: true })
    }
    // Handed to the app as a local request from a paired phone.
    req.headers['x-claudia-chan'] = '1'
    req.url = urlPath
    req.viaPhone = phone
    if (urlPath === '/stream') {
      connected.set(phone.id, (connected.get(phone.id) ?? 0) + 1)
      onChange({ connected: phone })
      req.on('close', () => {
        connected.set(phone.id, Math.max(0, (connected.get(phone.id) ?? 1) - 1))
        lastUse = Date.now()
        onChange()
      })
    }
    return handle(req, res)
  }

  function startServer() {
    if (server) return Promise.resolve()
    return new Promise((resolve, reject) => {
      server = http.createServer((req, res) => serve(req, res).catch(() => { try { res.writeHead(500).end() } catch {} }))
      server.on('error', error => { server = null; reject(error) })
      server.listen(PHONE_PORT, '127.0.0.1', resolve)
    })
  }

  async function start() {
    if (url) return url
    if (starting) return starting
    starting = (async () => {
      await startServer()
      const binary = await ensureCloudflared(vendor)
      return new Promise((resolve, reject) => {
        const child = spawn(binary, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${PHONE_PORT}`], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
        tunnel = child
        let log = ''
        const timer = setTimeout(() => { child.kill(); reject(new Error('tunnel did not start')) }, 45000)
        const read = chunk => {
          log += chunk
          const found = log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)
          if (found && !url) {
            clearTimeout(timer)
            url = found[0]
            lastUse = Date.now()
            onChange()
            resolve(url)
          }
          if (log.length > 20000) log = log.slice(-5000)
        }
        child.stdout.on('data', read)
        child.stderr.on('data', read)
        child.on('exit', () => {
          clearTimeout(timer)
          if (tunnel === child) { tunnel = null; url = null; onChange() }
          reject(new Error('tunnel exited'))
        })
      })
    })().finally(() => { starting = null })
    return starting
  }

  function stop() {
    tunnel?.kill()
    tunnel = null
    url = null
    server?.close()
    server = null
    onChange()
  }

  // Closes by itself when no phone has used it for a while (and nobody is pairing).
  setInterval(() => {
    const anyone = [...connected.values()].some(n => n > 0) || [...lastPoll.keys()].some(polling)
    if (url && !anyone && !pairing.code() && Date.now() - lastUse > IDLE_CLOSE_MS) stop()
  }, 60000).unref()

  return {
    start,
    stop,
    url: () => url,
    on: () => Boolean(url),
    newQrLink() {
      if (!url) return null
      const { value, expires } = pairing.newCode()
      onPairRequest()
      return { link: `${APP_URL}#u=${encodeURIComponent(url)}&p=${value}`, expires }
    },
    pairing,
    serve, // for tests: the phone server's handler without the tunnel
    connectedCount: () => pairing.phones().filter(p => (connected.get(p.id) ?? 0) > 0 || polling(p.id)).length,
    push,
    isConnected: id => (connected.get(id) ?? 0) > 0 || polling(id),
  }
}

module.exports = { createPairing, createPhoneLink, ensureCloudflared, PHONE_PORT, APP_URL, ALLOWED_ORIGINS, PUBLIC_GET, PAIRED, sha }
