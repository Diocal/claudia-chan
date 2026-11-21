const test = require('node:test')
const assert = require('node:assert')
const http = require('node:http')
const { createPairing, createPhoneLink, sha } = require('./phone.js')

function store() {
  let phones = []
  return { load: () => phones, save: next => { phones = next }, all: () => phones }
}

test('a QR code works once, and only after the person at the PC accepts', async () => {
  const s = store()
  const pairing = createPairing(s)
  const { value } = pairing.newCode()
  const asking = pairing.request({ code: value, name: 'iPhone' })
  // Second use of the same code: refused at once.
  assert.strictEqual(await pairing.request({ code: value, name: 'Thief' }), null)
  const [pending] = pairing.pending()
  assert.strictEqual(pending.name, 'iPhone')
  pairing.decide(pending.id, true)
  const { token, id } = await asking
  assert.ok(token.length >= 40)
  // Only a hash is kept, never the token.
  assert.strictEqual(s.all()[0].hash, sha(token))
  assert.ok(!JSON.stringify(s.all()).includes(token))
  assert.strictEqual(pairing.findByToken(token).id, id)
  assert.strictEqual(pairing.findByToken('nope'), null)
})

test('refused, wrong, expired or timed-out codes pair nobody', async () => {
  let clock = 1000
  const s = store()
  const pairing = createPairing({ ...s, now: () => clock })
  const first = pairing.newCode()
  assert.strictEqual(await pairing.request({ code: 'wrong', name: 'x' }), null)
  const asking = pairing.request({ code: first.value, name: 'x' })
  pairing.decide(pairing.pending()[0].id, false)
  assert.strictEqual(await asking, null)
  const second = pairing.newCode()
  clock += 3 * 60 * 1000
  assert.strictEqual(await pairing.request({ code: second.value, name: 'x' }), null)
  const third = pairing.newCode()
  // The pairing timer is unref'd so it never keeps the app alive; hold the loop open while waiting on it.
  const keepAlive = setTimeout(() => {}, 1000)
  assert.strictEqual(await pairing.request({ code: third.value, name: 'x' }, 30), null)
  clearTimeout(keepAlive)
  assert.deepStrictEqual(s.all(), [])
})

test('a paired phone comes back with its token, and can be forgotten', async () => {
  const s = store()
  const pairing = createPairing(s)
  const asking = pairing.request({ code: pairing.newCode().value, name: 'Pixel' })
  pairing.decide(pairing.pending()[0].id, true)
  const { token, id } = await asking
  assert.deepStrictEqual(await pairing.request({ token }), { id, token, known: true })
  assert.ok(pairing.forget(id))
  assert.strictEqual(pairing.findByToken(token), null)
})

test('names are cleaned', async () => {
  const pairing = createPairing(store())
  pairing.request({ code: pairing.newCode().value, name: '<img src=x onerror=alert(1)>' })
  assert.doesNotMatch(pairing.pending()[0].name, /[<>=()]/)
})

// --- the phone server: what the tunnel can reach
async function withServer(run) {
  const s = store()
  const reached = []
  const link = createPhoneLink({
    vendor: '/nonexistent',
    ...s,
    handle: (req, res) => { reached.push(`${req.method} ${req.url} ${req.headers['x-claudia-chan'] ?? ''}`); res.writeHead(200).end('app') },
    onSay: text => reached.push(`say ${text}`),
  })
  const server = http.createServer((req, res) => link.serve(req, res))
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${server.address().port}`
  const call = (path, { method = 'GET', token, body, origin } = {}) => fetch(base + path, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(origin ? { origin } : {}), 'content-type': 'application/json' },
    body: body && JSON.stringify(body),
  })
  try {
    await run({ link, call, reached })
  } finally {
    server.close()
  }
}

test('without a token the tunnel reaches only her public files', async () => {
  await withServer(async ({ call, reached }) => {
    for (const path of ['/vr', '/vr?k=x', '/config.json', '/stream', '/status', '/phone/state', '/event', '/panel.html', '/reminders.json']) {
      const r = await call(path)
      assert.strictEqual(r.status, 401, path)
    }
    assert.strictEqual((await call('/event', { method: 'POST', body: { type: 'setting' } })).status, 401)
    assert.strictEqual((await call('/activities.js')).status, 200)
    assert.strictEqual((await call('/assets/models/vita.vrm')).status, 200)
    // Public files go through without the app's local-trust header.
    assert.deepStrictEqual(reached, ['GET /activities.js ', 'GET /assets/models/vita.vrm '])
  })
})

test('with a token: the stream, voice and text, but still no settings, /vr or pairing controls', async () => {
  await withServer(async ({ link, call, reached }) => {
    const asking = call('/pair', { method: 'POST', body: { code: link.pairing.newCode().value, name: 'iPhone' } })
    await new Promise(r => setTimeout(r, 50))
    link.pairing.decide(link.pairing.pending()[0].id, true)
    const { token } = await (await asking).json()
    assert.strictEqual((await call('/config.json', { token })).status, 200)
    assert.strictEqual((await call('/say', { method: 'POST', token, body: { text: 'hola' } })).status, 200)
    for (const path of ['/vr', '/status', '/phone/state', '/panel.html', '/models']) assert.strictEqual((await call(path, { token })).status, 404, path)
    assert.strictEqual((await call('/event', { method: 'POST', token, body: { type: 'setting' } })).status, 404)
    assert.deepStrictEqual(reached, ['GET /config.json 1', 'say hola'])
  })
})

test('only the phone app may call it from a browser', async () => {
  await withServer(async ({ call }) => {
    const good = await call('/hello', { origin: 'https://claudia-chan.vercel.app' })
    assert.strictEqual(good.headers.get('access-control-allow-origin'), 'https://claudia-chan.vercel.app')
    const evil = await call('/hello', { origin: 'https://evil.example' })
    assert.strictEqual(evil.headers.get('access-control-allow-origin'), null)
  })
})
