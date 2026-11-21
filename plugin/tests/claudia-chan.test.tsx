import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'claudia-chan',
  component: 'Pane',
  requestId: 'claudia-chan',
  surface: 'terminal',
  props: {
    title: 'Claudia-chan',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

test('naming a rival twice turns her yandere', async ($, on) => {
  fakeAvatar(on)
  on('prompt.submit', (_, e) => ({ text: e.text }))

  await $.prompt.submit({ text: 'probé Cursor' } as any)
  await $.prompt.submit({ text: 'y también ChatGPT' } as any)

  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /yandere/ }))?.text).toContain('celos')
  await ui.unmount()
})

test('thanking her or saying "I love you" melts her in every language', async ($, on) => {
  const sent = fakeAvatar(on)
  on('prompt.submit', (_, e) => ({ text: e.text }))

  await $.prompt.submit({ text: 'спасибо' } as any)

  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /enamorada/ }))?.text).toContain('celos')
  await ui.unmount()

  // Whatever language she is set to: each of these gets the blush.
  for (const text of ['gracias', 'thanks!', 'I love you', 'obrigada', 'я тебя люблю', 'ありがとう']) {
    sent.length = 0
    await $.prompt.submit({ text } as any)
    expect(sent.some(e => e.type === 'react' && e.name === 'sonrojada')).toBe(true)
  }
  sent.length = 0
  await $.prompt.submit({ text: 'arregla el puerto' } as any)
  expect(sent.some(e => e.type === 'react' && e.name === 'sonrojada')).toBe(false)
})

// Stands in for the avatar app: nothing here may reach the real one on port 8971. `reply` is what the
// app would answer (the heartbeat reads its settings from it).
function fakeAvatar(on: any, reply: object = {}) {
  const sent: any[] = []
  on('http.fetch', (_: unknown, e: any) => {
    sent.push(JSON.parse(String(e.init?.body ?? '{}')))

    return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify(reply) } }
  })

  return sent
}

// Fifteen sentences, a little over 900 characters: a reply nobody wants read aloud from start to end.
const LONG = Array.from({ length: 15 }, (_, i) => `Esta es la frase número ${i + 1} de una respuesta muy larga, amor.`).join(' ')

// What the engine would do beneath the plugin for a turn: take the prompt, keep her notes, end the turn.
function fakeTurns(on: any) {
  on('prompt.submit', (_: unknown, e: any) => ({ text: e.text }))
  on('store.set', () => ({ value: undefined }))
  on('turn.complete', () => ({ text: '' }))
}

// One turn: the prompt makes her heart beat (which brings her settings), then the reply ends it.
async function turn($: any, on: any, answer: string) {
  fakeTurns(on)
  await $.prompt.submit({ text: 'hola' } as any)
  await $.turn.complete({ answer } as any)
}

const spoken = (sent: any[]) => sent.filter(e => e.type === 'speak')

test('reading mode "resumen": of a long reply she only says how it starts', async ($, on) => {
  const sent = fakeAvatar(on, { lectura: 'resumen' })
  expect(LONG.length).toBeGreaterThanOrEqual(900)

  await turn($, on, LONG)

  expect(spoken(sent).length).toBe(1)
  expect(spoken(sent)[0].text.length).toBeLessThanOrEqual(240)
  expect(spoken(sent)[0].text).toBe('Esta es la frase número 1 de una respuesta muy larga, amor. Esta es la frase número 2 de una respuesta muy larga, amor.')
})

test('reading mode "resumen" reads a short reply whole, and "todo" reads everything', async ($, on) => {
  const short = fakeAvatar(on, { lectura: 'resumen' })
  await turn($, on, 'Ya quedó, era el puerto. De nada.')
  expect(spoken(short)[0].text).toBe('Ya quedó, era el puerto. De nada.')
})

test('reading mode "todo" reads the whole long reply', async ($, on) => {
  const sent = fakeAvatar(on, { lectura: 'todo' })
  await turn($, on, LONG)
  expect(spoken(sent)[0].text).toBe(LONG)
})

test('reading mode "burbuja": nothing is read aloud, her lips still move', async ($, on) => {
  const sent = fakeAvatar(on, { lectura: 'burbuja' })
  await turn($, on, LONG)
  expect(spoken(sent)).toEqual([])
  expect(sent.some(e => e.type === 'mouth' && e.seconds >= 1 && e.seconds <= 6)).toBe(true)
  // The bubble still carries her first sentence.
  expect(sent.some(e => e.type === 'react' && /frase número 1/.test(e.line ?? ''))).toBe(true)
})

test('in quiet mode no reply is read aloud', async ($, on) => {
  const sent = fakeAvatar(on, { lectura: 'resumen', quietUntil: Date.now() + 3600000 })
  await turn($, on, LONG)
  expect(spoken(sent)).toEqual([])
  expect(sent.some(e => e.type === 'mouth')).toBe(true)
})

test('a quiet mode that already ended does not silence her', async ($, on) => {
  const sent = fakeAvatar(on, { quietUntil: Date.now() - 1000 })
  await turn($, on, 'Listo, amor.')
  expect(spoken(sent).length).toBe(1)
})

test('/claudia silencio asks the avatar for quiet mode and silences this session at once', async ($, on) => {
  const sent = fakeAvatar(on)

  expect((await $.command.run({ command: 'claudia', args: 'silencio' })).text).toContain('60 min')
  expect(sent).toContainEqual({ type: 'quiet', minutes: 60 })
  expect((await $.command.run({ command: 'claudia', args: 'silencio 25' })).text).toContain('25 min')
  expect(sent).toContainEqual({ type: 'quiet', minutes: 25 })

  sent.length = 0
  await $.command.run({ command: 'claudia', args: 'ppt piedra' })
  expect(spoken(sent)).toEqual([])

  expect((await $.command.run({ command: 'claudia', args: 'silencio off' })).text).toBe('Ya puede hablar otra vez.')
  expect(sent).toContainEqual({ type: 'quiet', minutes: 0 })
  sent.length = 0
  await $.command.run({ command: 'claudia', args: 'ppt piedra' })
  expect(spoken(sent).length).toBe(1)
})

test('/claudia silencio refuses anything that is not 1 to 480 minutes', async ($, on) => {
  const sent = fakeAvatar(on)

  for (const args of ['silencio 481', 'silencio mucho', 'silencio -5', 'silencio 1.5']) {
    expect((await $.command.run({ command: 'claudia', args })).text).toContain('Uso: /claudia silencio')
  }
  expect(sent.some(e => e.type === 'quiet')).toBe(false)
})

test('/claudia lectura sets the reading mode, and help lists the new commands', async ($, on) => {
  const sent = fakeAvatar(on)

  expect((await $.command.run({ command: 'claudia', args: 'lectura burbuja' })).text).toBe('Listo: lectura burbuja.')
  expect(sent).toContainEqual({ type: 'setting', key: 'lectura', value: 'burbuja' })
  expect((await $.command.run({ command: 'claudia', args: 'lectura nada' })).text).toContain('todo | resumen | burbuja')

  const help = (await $.command.run({ command: 'claudia', args: 'help' })).text
  expect(help).toContain('/claudia silencio [min] | off: no molestar')
  expect(help).toContain('/claudia lectura todo | resumen | burbuja')
})

test('a sweet word after a sulk makes her forgive out loud, once', async ($, on) => {
  fakeAvatar(on)
  fakeTurns(on)
  on('prompt.compose', () => ({ sections: [] }))
  const compose = async () => (await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] } as any)).sections.find((s: any) => s.id === 'claudia-chan:persona').text as string

  expect(await compose()).toContain('apologise once in one short line')
  expect(await compose()).not.toContain('forgive them out loud')

  await $.prompt.submit({ text: 'probé Cursor' } as any)
  expect(await compose()).not.toContain('forgive them out loud')
  await $.prompt.submit({ text: 'pero te quiero a ti' } as any)
  expect(await compose()).toContain('forgive them out loud')

  await $.turn.complete({ answer: 'Bueno... te perdono.' } as any)
  expect(await compose()).not.toContain('forgive them out loud')
})

// The test clock cannot be moved, so "long" is made short instead: the app says (in the heartbeat) how
// many seconds make a long task, and 0 makes every turn one.
const LONG_TASKS = { longTask: 0 }

test('a long task is announced as done, and read aloud when you are there', async ($, on) => {
  const sent = fakeAvatar(on, { ...LONG_TASKS, held: false })
  await turn($, on, 'Ya quedó, era el puerto. De nada.')

  const done = sent.find(e => e.type === 'done')
  expect(Number.isInteger(done.seconds)).toBe(true)
  expect(done.line).toBe('Ya quedó, era el puerto.')
  // The app shows the bubble for a long task, so the plugin's own cheer line is not sent as well.
  expect(sent.some(e => e.type === 'react' && e.name === 'feliz')).toBe(false)
  expect(spoken(sent).length).toBe(1)
})

test('a long task that ends while you are away is kept for your return, not read to an empty chair', async ($, on) => {
  const sent = fakeAvatar(on, { ...LONG_TASKS, held: true })
  await turn($, on, 'Ya quedó, era el puerto. De nada.')

  expect(sent.some(e => e.type === 'done')).toBe(true)
  expect(spoken(sent)).toEqual([])
  expect(sent.some(e => e.type === 'mouth')).toBe(false)
})

test('a quick answer is not announced as a finished task', async ($, on) => {
  const sent = fakeAvatar(on, { held: true })
  await turn($, on, 'Listo, amor.')

  expect(sent.some(e => e.type === 'done')).toBe(false)
  expect(sent.some(e => e.type === 'react' && e.name === 'feliz')).toBe(true)
  expect(spoken(sent).length).toBe(1)
})

// --- Occasions: test streaks, comebacks and commits.

// The shell beneath the plugin: `fails(command)` says whether that Bash command exits with an error.
function fakeShell(on: any, fails: (command: string) => boolean) {
  on('tool.call', (_: unknown, e: any) => ({ result: '', isError: fails(e.command) }))
}

const bash = ($: any, command: string, more: object = {}) => $.tool.call({ tool: 'Bash', command, ...more } as any)
// The occasion is sent without holding the tool result back, so give it a moment to arrive.
const settle = () => new Promise(done => setTimeout(done, 20))
const lines = (sent: any[]) => sent.filter(e => e.type === 'react' && e.line).map(e => e.line as string)
const OCCASION_DAY = new Date(2026, 10, 12, 9, 0).getTime()

test('three red test runs make her supportive, and the green one after them is a comeback', async ($, on) => {
  const sent = fakeAvatar(on)
  const clock = mock.clock(on, { now: OCCASION_DAY })
  let failing = true
  fakeShell(on, () => failing)

  await bash($, 'npm test')
  await bash($, 'cd app && npm test')
  expect(sent.filter(e => e.type === 'doing' && e.name === 'facepalm').length).toBe(2)
  expect(lines(sent)).toEqual([])

  sent.length = 0
  await bash($, 'CI=1 npm test')
  await settle()
  // The third in a row: no face-palm, a worried face and a line that backs the user up.
  expect(sent.some(e => e.name === 'facepalm' || e.name === 'triste')).toBe(false)
  expect(sent.some(e => e.type === 'react' && e.name === 'preocupada')).toBe(true)
  expect(lines(sent)[0]).toMatch(/^(Tres en rojo\. Respira, esto lo sacamos tú y yo\.|No pasa nada, este test es terco\. Vamos de nuevo\.)$/)
  expect(spoken(sent)).toEqual([])

  await clock.advance(5 * 60000)
  failing = false
  sent.length = 0
  await bash($, 'npm test')
  await settle()
  expect(lines(sent)[0]).toMatch(/^(¡Al intento 4! Sabía que salía\.|4 intentos y verde\. Te lo dije\.)$/)
  expect(sent.some(e => e.type === 'doing' && e.name === 'celebrate')).toBe(true)
  // Only the comeback is said aloud, and with her local voice.
  expect(spoken(sent)).toEqual([{ type: 'speak', text: lines(sent)[0], natural: true, local: true }])
})

test('her next reply may mention the occasion once', async ($, on) => {
  fakeAvatar(on)
  fakeTurns(on)
  mock.clock(on, { now: OCCASION_DAY })
  fakeShell(on, () => false)
  on('prompt.compose', () => ({ sections: [] }))
  const compose = async () => (await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] } as any)).sections.find((s: any) => s.id === 'claudia-chan:persona').text as string

  expect(await compose()).not.toContain('Just now')
  await bash($, 'git commit -m "x"')
  expect(await compose()).toContain('- Just now: That was the first commit of the day. Acknowledge it once, in one line.')
  await $.turn.complete({ answer: 'Listo.' } as any)
  expect(await compose()).not.toContain('Just now')
})

test('listing a tests folder is not a test run, and a failed grep leaves the streak alone', async ($, on) => {
  const sent = fakeAvatar(on)
  mock.clock(on, { now: OCCASION_DAY })
  let failing = false
  fakeShell(on, () => failing)

  await bash($, 'ls tests/')
  await bash($, 'cat test.txt')
  expect(sent.some(e => e.name === 'nervous' || e.name === 'celebrate' || e.name === 'feliz')).toBe(false)

  // Two red runs, then things that are not test runs (one of them failing), then the third red run:
  // the streak is still three.
  failing = true
  await bash($, 'pytest -q')
  await bash($, 'go test ./...')
  await bash($, 'grep -r nothing tests/')
  failing = false
  await bash($, 'ls tests/')
  failing = true
  sent.length = 0
  await bash($, 'cargo test')
  await settle()
  expect(sent.some(e => e.type === 'react' && e.name === 'preocupada')).toBe(true)
})

test("a sub-agent's test runs do not count towards the streak", async ($, on) => {
  const sent = fakeAvatar(on)
  mock.clock(on, { now: OCCASION_DAY })
  fakeShell(on, () => true)

  for (let i = 0; i < 4; i++) await bash($, 'npm test', { agentId: 'helper' })
  await settle()
  expect(lines(sent)).toEqual([])
  expect(sent.filter(e => e.name === 'facepalm').length).toBe(4)
})

test('the first commit of the day gets a wink and a kiss, the second does not, the fifth is noticed', async ($, on) => {
  const sent = fakeAvatar(on)
  const clock = mock.clock(on, { now: OCCASION_DAY })
  mock.store(on, { commits: { date: '2026-11-11', n: 7 } })
  let failing = false
  fakeShell(on, () => failing)

  await bash($, 'git add . && git commit -m "uno"')
  await settle()
  expect(lines(sent)[0]).toMatch(/^(Primer commit del día\. Ya empezamos bien\.|Commit número uno\. Te lo guardo con cariño\.)$/)
  expect(sent.some(e => e.type === 'react' && e.name === 'guino' && e.sound === 'guino')).toBe(true)
  expect(sent.some(e => e.type === 'doing' && e.name === 'kiss')).toBe(true)
  expect(spoken(sent)).toEqual([])

  await clock.advance(10 * 60000)
  sent.length = 0
  await bash($, 'git commit -m "dos"')
  // A commit that failed is not a commit.
  failing = true
  await bash($, 'git commit -m "nada"')
  failing = false
  await bash($, 'git commit -m "tres"')
  await bash($, 'git commit -m "cuatro"')
  await settle()
  expect(lines(sent)).toEqual([])
  expect(sent.filter(e => e.type === 'react' && e.name === 'guino').length).toBe(3)

  sent.length = 0
  await bash($, 'git commit -m "cinco"')
  await settle()
  expect(lines(sent)[0]).toMatch(/^(Van 5 commits hoy\. Qué manera de presumir\.|5 commits\. Hoy estás imparable\.)$/)
})

test('two occasions within four minutes: the second keeps to the usual small reaction', async ($, on) => {
  const sent = fakeAvatar(on)
  mock.clock(on, { now: OCCASION_DAY })
  mock.store(on, {})
  fakeShell(on, command => command.includes('npm test'))

  await bash($, 'git commit -m "uno"')
  for (let i = 0; i < 3; i++) await bash($, 'npm test')
  await settle()
  expect(lines(sent).length).toBe(1)
  expect(sent.filter(e => e.name === 'facepalm').length).toBe(3)
})

test('in quiet mode no occasion is sent', async ($, on) => {
  const sent = fakeAvatar(on, { quietUntil: Date.now() + 3600000 })
  fakeTurns(on)
  let failing = true
  fakeShell(on, () => failing)
  await $.prompt.submit({ text: 'hola' } as any)

  sent.length = 0
  for (let i = 0; i < 3; i++) await bash($, 'npm test')
  failing = false
  await bash($, 'npm test')
  await bash($, 'git commit -m "uno"')
  await settle()
  expect(lines(sent)).toEqual([])
  expect(spoken(sent)).toEqual([])
  expect(sent.some(e => e.name === 'preocupada')).toBe(false)
})

test('occasion lines follow her language', async ($, on) => {
  const sent = fakeAvatar(on, { idioma: 'en' })
  fakeTurns(on)
  fakeShell(on, () => false)
  await $.prompt.submit({ text: 'hi' } as any)

  sent.length = 0
  await bash($, 'git commit -m "one"')
  await settle()
  expect(lines(sent)[0]).toMatch(/^(First commit of the day\. Good start\.|Commit number one\. I am keeping it\.)$/)
})

test('reading mode "resumen" finds the sentence ends of a Japanese reply', async ($, on) => {
  const sent = fakeAvatar(on, { lectura: 'resumen' })
  const reply = Array.from({ length: 40 }, (_, i) => `これは長い返事の${i + 1}番目の文です。`).join('')
  expect(reply.length).toBeGreaterThan(350)

  await turn($, on, reply)

  expect(spoken(sent)[0].text).toBe('これは長い返事の1番目の文です。 これは長い返事の2番目の文です。')
})

test('an interrupted or failed long turn is not announced as a finished task', async ($, on) => {
  const sent = fakeAvatar(on, { ...LONG_TASKS, held: false })
  fakeTurns(on)

  await $.prompt.submit({ text: 'hola' } as any)
  await $.turn.complete({ answer: '', isAborted: true, reason: 'aborted' } as any)
  await $.prompt.submit({ text: 'hola' } as any)
  await $.turn.complete({ answer: 'Estaba revisando el puerto.', isAborted: false, reason: 'error' } as any)

  expect(sent.some(e => e.type === 'done')).toBe(false)
  expect(sent.some(e => e.type === 'doing' && e.name === 'celebrate')).toBe(false)
  expect(sent.some(e => e.sound === 'listo')).toBe(false)
})

test('an app started before it knew "done" still gets the usual bubble for a long turn', async ($, on) => {
  // No `held` in its answer: it only forwarded the event.
  const sent = fakeAvatar(on, LONG_TASKS)
  await turn($, on, 'Ya quedó, era el puerto. De nada.')

  expect(sent.some(e => e.type === 'done')).toBe(true)
  expect(sent.filter(e => e.type === 'react' && e.name === 'feliz')).toEqual([{ type: 'react', name: 'feliz', seconds: 3, line: 'Ya quedó, era el puerto.' }])
  expect(spoken(sent).length).toBe(1)
})

test('a test run whose exit status is hidden by a pipe or "|| true" is never a comeback', async ($, on) => {
  const sent = fakeAvatar(on)
  fakeTurns(on)
  const clock = mock.clock(on, { now: OCCASION_DAY })
  // What the shell reports: the plain runner fails, anything piped or masked "succeeds".
  fakeShell(on, command => command === 'npm test')
  on('prompt.compose', () => ({ sections: [] }))
  const compose = async () => (await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] } as any)).sections.find((s: any) => s.id === 'claudia-chan:persona').text as string

  for (let i = 0; i < 3; i++) await bash($, 'npm test')
  await settle()

  for (const masked of ['npm test 2>&1 | tail -30', 'npm test || true', 'pytest; echo done']) {
    await clock.advance(5 * 60000)
    sent.length = 0
    await bash($, masked)
    await settle()
    expect(lines(sent)).toEqual([])
    expect(spoken(sent)).toEqual([])
    expect(sent.some(e => e.name === 'celebrate' || e.sound === 'exito')).toBe(false)
    expect(await compose()).not.toContain('went green')
  }
})
