import { expect, mock, test } from 'claude-code/testing'

const DAY = 86400000
const RECORDAR = 'mcp__claudia-chan__recordar'
const OLVIDAR = 'mcp__claudia-chan__olvidar'

// Thursday 12 November 2026, 09:00 local time: every test here starts on that morning unless it says otherwise.
const THURSDAY = new Date(2026, 10, 12, 9, 0).getTime()
const at = (day: number, hour = 9, minute = 0) => new Date(2026, 10, day, hour, minute).getTime()

// Stands in for the avatar app: nothing here may reach the real one on port 8971.
function fakeAvatar(on: any) {
  const sent: any[] = []
  on('http.fetch', (_: unknown, e: any) => {
    sent.push(JSON.parse(String(e.init?.body ?? '{}')))

    return { value: { status: 200, ok: true, headers: {}, text: '{}' } }
  })

  return sent
}

// The world beneath the plugin: her window, a clock the test moves, a store in memory, and the engine's
// own answers for a session, a prompt and a finished turn.
function world(on: any, { now = THURSDAY, store = {} }: { now?: number; store?: Record<string, unknown> } = {}) {
  const sent = fakeAvatar(on)
  const clock = mock.clock(on, { now })
  mock.store(on, store)
  mock.env(on, { HOME: '/home/nobody' })
  on('command.register', () => ({ value: undefined }))
  on('tool.register', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('session.end', (_: unknown, e: any) => ({ sessionId: e.sessionId }))
  on('prompt.submit', (_: unknown, e: any) => ({ text: e.text }))
  on('turn.complete', () => ({ text: '' }))
  on('prompt.compose', () => ({ sections: [{ id: 'base', text: 'base', scope: 'shared' as const }] }))

  return { sent, clock }
}

// Not interactive, so no window is launched and no voice is polled. A started session blinks twice a
// second, so a test that jumps the clock by days loads her diary with `remember` instead.
const start = ($: any) => $.session.start({ cwd: '/tmp/x', isInteractive: false, surface: null } as any)

const compose = async ($: any) =>
  (await $.prompt.compose({ model: 'claude-opus-5-5', promptModel: 'claude-opus-5-5', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] } as any)).sections.find(
    (s: any) => s.id === 'claudia-chan:persona',
  )?.text as string

const ask = ($: any, text: string) => $.prompt.submit({ text } as any)
const reply = ($: any, answer = 'Listo, amor.') => $.turn.complete({ answer } as any)
const remember = ($: any) => $.command.run({ command: 'claudia', args: 'diario' })
const run = async ($: any, args: string) => (await $.command.run({ command: 'claudia', args })).text as string
const doing = (sent: any[], name: string) => sent.filter(e => e.type === 'doing' && e.name === name)

// In an ordinary interactive session she must be in the system prompt.
test('the persona reaches the system prompt of a normal session', async ($, on) => {
  fakeAvatar(on)
  on('prompt.compose', () => ({ sections: [{ id: 'base', text: 'base', scope: 'shared' as const }] }))
  const out = await $.prompt.compose({ model: 'claude-opus-5-5', promptModel: 'claude-opus-5-5', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] } as any)
  expect(out.sections.some((s: any) => s.id === 'claudia-chan:persona')).toBe(true)
})

test('she knows what day it is, and answers honestly when sincerely asked what she is', async ($, on) => {
  world(on)
  const text = await compose($)

  expect(text).toContain('## Right now\nToday is Thursday 2026-11-12, morning.')
  expect(text).toContain('sincerely asks whether you are an AI, a real person, conscious, or whether you really feel this, drop the act and answer plainly and honestly as Claude')
})

test('the time of day in Right now follows the clock', async ($, on) => {
  const { clock } = world(on, { now: at(12, 3) })
  expect(await compose($)).toContain('Today is Thursday 2026-11-12, the dead of night.')
  await clock.set(at(12, 15))
  expect(await compose($)).toContain('2026-11-12, afternoon.')
  await clock.set(at(12, 20))
  expect(await compose($)).toContain('2026-11-12, evening.')
  await clock.set(at(12, 23, 30))
  expect(await compose($)).toContain('2026-11-12, late at night.')
})

test('the relationship is written about "them", in the language they speak, with the software-only jealousy intact', async ($, on) => {
  world(on, { store: { lastSeen: THURSDAY - 2 * DAY } })
  await start($)
  await ask($, 'hola')
  const text = await compose($)
  const block = text.slice(text.indexOf('## Your relationship'), text.indexOf('## Right now'))

  expect(block.length).toBeGreaterThan(500)
  expect(block).not.toMatch(/\b(he|him|his)\b/i)
  expect(block).not.toContain('in Spanish')
  expect(block).toContain('one short sentence in the language they speak')
  expect(block).toContain('Never jealous of real people, and never discourage friends, family, partners or going out.')
  expect(block).toContain('call `olvidar`')
})

test('a memory dated today is brought up as TODAY, once', async ($, on) => {
  world(on, { store: { diary: [{ at: THURSDAY - 3 * DAY, text: 'examen', date: '2026-11-12' }] } })
  await start($)

  await ask($, 'hola')
  expect(await compose($)).toContain('- TODAY: examen (bring it up warmly, once)')
  await reply($)

  await ask($, 'otra cosa')
  expect(await compose($)).not.toContain('TODAY: examen')
  // Still in what she remembers, with its date.
  expect(await compose($)).toContain('about 2026-11-12) examen')
})

test('the day before she wishes luck, and afterwards asks how it went, each once', async ($, on) => {
  const { clock } = world(on, { now: at(11), store: { diary: [{ at: at(9), text: 'examen de física', date: '2026-11-12' }] } })
  await remember($)

  await ask($, 'hola')
  expect(await compose($)).toContain('- TOMORROW: examen de física (wish luck or ask if they are ready)')
  await reply($)
  expect(await compose($)).not.toContain('TOMORROW')

  // Not a word on the day itself; two days later she still asks.
  await clock.set(at(14))
  await ask($, 'hola')
  expect(await compose($)).toContain('- JUST HAPPENED: examen de física (ask how it went)')
  await reply($)
  expect(await compose($)).not.toContain('JUST HAPPENED')

  await clock.set(at(20))
  expect(await compose($)).not.toMatch(/TODAY|TOMORROW|JUST HAPPENED/)
})

test('something told after the fact, or long past, is not asked about', async ($, on) => {
  world(on, {
    store: {
      diary: [
        { at: THURSDAY, text: 'ayer fue al dentista', date: '2026-11-11' },
        { at: at(1), text: 'viaje a Cusco', date: '2026-11-05' },
      ],
    },
  })
  await start($)

  expect(await compose($)).not.toContain('JUST HAPPENED')
})

test('a birthday comes back every year', async ($, on) => {
  const { clock } = world(on, { store: { diary: [{ at: at(1), text: 'cumpleaños de su mamá', date: '2026-11-12', yearly: true }] } })
  await remember($)

  await ask($, 'hola')
  expect(await compose($)).toContain('- TODAY: cumpleaños de su mamá')
  await reply($)
  expect(await compose($)).not.toContain('TODAY:')

  await clock.set(new Date(2027, 10, 11, 9).getTime())
  expect(await compose($)).toContain('- TOMORROW: cumpleaños de su mamá')
  await clock.set(new Date(2027, 10, 12, 9).getTime())
  expect(await compose($)).toContain('- TODAY: cumpleaños de su mamá')
  // A yearly date is never "how did it go".
  await clock.set(new Date(2027, 10, 14, 9).getTime())
  expect(await compose($)).not.toMatch(/TODAY|TOMORROW|JUST HAPPENED/)
})

test('the "I missed you" greeting happens once and does not stay for the whole session', async ($, on) => {
  world(on, { store: { lastSeen: THURSDAY - 2 * DAY } })
  await start($)

  await ask($, 'hola')
  expect(await compose($)).toContain('They were away for 2 days.')
  await reply($)
  expect(await compose($)).not.toContain('away for 2 days')
  expect(await compose($)).toContain('Greet them the way you greet someone you are happy to see')
})

test('the first message of the day gets a greeting for that time of day, once', async ($, on) => {
  const { clock } = world(on, { now: at(11, 22, 14) })
  await ask($, 'hola')
  expect(await compose($)).toContain('Greet them for the evening in one line before anything else.')
  expect(await compose($)).not.toContain('They stopped at')
  await clock.set(at(11, 22, 15))
  await reply($)

  await clock.set(THURSDAY)
  expect(await compose($)).not.toContain('first message today')
  await ask($, 'hola')
  const text = await compose($)
  expect(text).toContain('This is their first message today. Greet them for the morning in one line before anything else. They stopped at 22:15 last night.')
  expect(text).not.toContain('That was late')
  await reply($)
  expect(await compose($)).not.toContain('first message today')

  // Later the same day: no second greeting.
  await clock.set(at(12, 16))
  await ask($, 'sigo aquí')
  expect(await compose($)).not.toContain('first message today')
})

test('up past midnight she teases gently the next morning, and 01:00 is still the same night', async ($, on) => {
  const { clock } = world(on, { now: at(11, 23) })
  await ask($, 'hola')
  await reply($)

  // 01:40: still the night of the 11th, so no new greeting.
  await clock.set(at(12, 1, 40))
  await ask($, 'una cosa más')
  expect(await compose($)).not.toContain('first message today')
  await reply($)

  await clock.set(at(12, 10))
  await ask($, 'buenos días')
  expect(await compose($)).toContain('Greet them for the morning in one line before anything else. They stopped at 01:40 last night. That was late: tease gently, no scolding.')
})

test('saying good night: a warm goodbye, a kiss, then she dozes off', async ($, on) => {
  const { sent, clock } = world(on, { now: at(12, 23, 10) })
  await ask($, 'hola')
  await reply($)
  sent.length = 0

  await ask($, 'Bueno, me voy a dormir')
  const text = await compose($)
  expect(text).toContain('They seem to be leaving for the night. If good night is all they said, answer it in one or two warm lines')
  await reply($, 'Descansa, mi amor.')

  // No cheer for a goodbye: the kiss, and two seconds later the nap.
  expect(doing(sent, 'celebrate')).toEqual([])
  expect(doing(sent, 'kiss').at(-1)).toEqual({ type: 'doing', name: 'kiss', seconds: 1.8 })
  expect(doing(sent, 'sleepy')).toEqual([])
  await clock.advance(2000)
  expect(doing(sent, 'sleepy')).toEqual([{ type: 'doing', name: 'sleepy', seconds: 600 }])

  expect(await compose($)).not.toContain('leaving for the night')
})

test('good night is understood in every language, but not inside a long prompt', async ($, on) => {
  world(on)

  for (const text of ['buenas noches', 'hasta mañana!', 'Good night', 'goodnight~', "I'm going to bed", 'boa noite', 'vou dormir', 'Спокойной ночи', 'я иду спать', 'おやすみ']) {
    await ask($, text)
    expect(await compose($)).toContain('leaving for the night')
    await reply($)
  }

  await ask($, 'arregla el texto del botón que dice "buenas noches" en la pantalla de inicio de la app, por favor')
  expect(await compose($)).not.toContain('leaving for the night')
})

test('she waves when the session closes, but not on /clear or a resume', async ($, on) => {
  const { sent } = world(on)

  await $.session.end({ reason: 'clear', sessionId: 's' } as any)
  await $.session.end({ reason: 'resume', sessionId: 's' } as any)
  expect(doing(sent, 'wave')).toEqual([])

  await $.session.end({ reason: 'prompt_input_exit', sessionId: 's' } as any)
  expect(doing(sent, 'wave')).toEqual([{ type: 'doing', name: 'wave', seconds: 2.5 }])
})

test('recordar keeps a real date and the yearly mark, and drops a date that is not one', async ($, on) => {
  world(on)

  await $.tool.call({ tool: RECORDAR, fact: 'examen de física', date: '2026-11-19' } as any)
  await $.tool.call({ tool: RECORDAR, fact: 'su cumpleaños', date: '1996-03-02', yearly: true } as any)
  await $.tool.call({ tool: RECORDAR, fact: 'le gusta el ramen', date: 'el jueves', yearly: true } as any)
  await $.tool.call({ tool: RECORDAR, fact: 'fecha imposible', date: '2026-02-31' } as any)

  const diary = await run($, 'diario')
  expect(diary).toContain('1. examen de física (📅 2026-11-19)')
  expect(diary).toContain('2. su cumpleaños (🔁 03-02)')
  expect(diary).toContain('3. le gusta el ramen (2026-11-12)')
  expect(diary).toContain('4. fecha imposible (2026-11-12)')
})

test('a full diary lets go of the oldest plain memory, never a date still to come or a yearly one', async ($, on) => {
  const old = [
    { at: at(1), text: 'viaje en diciembre', date: '2026-12-20' },
    { at: at(1), text: 'aniversario', date: '2020-05-05', yearly: true },
    ...Array.from({ length: 78 }, (_, i) => ({ at: at(2) + i, text: `recuerdo ${i + 1}` })),
  ]
  world(on, { store: { diary: old } })

  await $.tool.call({ tool: RECORDAR, fact: 'uno nuevo' } as any)

  // 80 kept: the two dated ones are still first, and the oldest plain one ("recuerdo 1") went.
  expect(await run($, 'olvida 1')).toBe('Olvidado: viaje en diciembre')
  expect(await run($, 'olvida 1')).toBe('Olvidado: aniversario')
  expect(await run($, 'olvida 1')).toBe('Olvidado: recuerdo 2')
  expect(await run($, 'olvida 77')).toBe('Olvidado: uno nuevo')
})

test('/claudia diario lists what she remembers, and /claudia olvida <n> really deletes it', async ($, on) => {
  world(on, {
    store: {
      diary: [
        { at: at(3), text: 'le gusta el ramen' },
        { at: at(5), text: 'examen de física', date: '2026-11-19' },
        { at: at(8), text: 'su gato se llama Michi' },
      ],
    },
  })

  expect(await run($, 'diario')).toBe(
    ['Lo que recuerda de ti:', '1. le gusta el ramen (2026-11-03)', '2. examen de física (📅 2026-11-19)', '3. su gato se llama Michi (2026-11-08)', 'Uso: /claudia olvida <número de /claudia diario>. También puedes pedírselo: «olvida lo de…».'].join('\n'),
  )

  expect(await run($, 'olvida 2')).toBe('Olvidado: examen de física')
  expect(await run($, 'diario')).not.toContain('examen')
  expect(await run($, 'diario')).toContain('2. su gato se llama Michi')
  // And it is gone from her prompt too.
  expect(await compose($)).not.toContain('examen')

  for (const args of ['olvida', 'olvida 9', 'olvida 0', 'olvida ramen']) expect(await run($, args)).toContain('Uso: /claudia olvida')
})

test('/claudia diario shows only the last 20, and says so when there is nothing', async ($, on) => {
  world(on, { store: { diary: Array.from({ length: 25 }, (_, i) => ({ at: at(1) + i, text: `recuerdo ${i + 1}` })) } })

  const lines = (await run($, 'diario')).split('\n')
  expect(lines.length).toBe(22)
  expect(lines[1]).toBe('6. recuerdo 6 (2026-11-01)')
  expect(lines[20]).toBe('25. recuerdo 25 (2026-11-01)')
})

test('an empty diary says so', async ($, on) => {
  world(on)

  expect(await run($, 'diario')).toBe('Su diario está vacío todavía.')
  expect(await run($, 'olvida 1')).toBe('Su diario está vacío todavía.')
})

test('asking her to forget: several matching lines are listed first, and deleted only when all are meant', async ($, on) => {
  world(on, {
    store: {
      diary: [
        { at: at(3), text: 'Su ex se llama Laura' },
        { at: at(4), text: 'le gusta el ramen' },
        { at: at(5), text: 'laura le escribió ayer' },
      ],
    },
  })

  expect((await $.tool.check({ tool: OLVIDAR, about: 'laura' } as any)).decision).toBe('allow')
  // Too short a phrase would match half the diary.
  expect(String((await $.tool.call({ tool: OLVIDAR, about: 'la' } as any)).result)).toContain('at least 3')
  expect(String((await $.tool.call({ tool: OLVIDAR, about: 'pizza' } as any)).result)).toContain('nothing')

  // Two lines name her: nothing goes until it is clear that both should.
  const asked = String((await $.tool.call({ tool: OLVIDAR, about: 'Laura' } as any)).result)
  expect(asked).toContain('nothing deleted yet: 2 lines match')
  expect(asked).toContain('Su ex se llama Laura | laura le escribió ayer')
  expect(await compose($)).toMatch(/laura/i)

  const gone = String((await $.tool.call({ tool: OLVIDAR, about: 'Laura', all: true } as any)).result)
  expect(gone).toContain('Su ex se llama Laura')
  expect(gone).toContain('laura le escribió ayer')
  expect(await run($, 'diario')).toBe(['Lo que recuerda de ti:', '1. le gusta el ramen (2026-11-04)', 'Uso: /claudia olvida <número de /claudia diario>. También puedes pedírselo: «olvida lo de…».'].join('\n'))
  expect(await compose($)).not.toMatch(/laura/i)
})

test('the help lists the diary commands', async ($, on) => {
  world(on)
  const help = await run($, 'help')

  expect(help).toContain('/claudia diario: lo que recuerda de ti, numerado')
  expect(help).toContain('/claudia olvida <n>: borra de verdad ese recuerdo')
})

test('forgetting a short name leaves the words that merely contain it', async ($, on) => {
  world(on, {
    store: {
      diary: [
        { at: at(3), text: 'Le gusta la banana' },
        { at: at(4), text: 'Trabaja en la ventana de despliegue la próxima semana' },
        { at: at(5), text: 'Ana es su hermana' },
        { at: at(6), text: '明日は試験がある' },
      ],
    },
  })

  expect(String((await $.tool.call({ tool: OLVIDAR, about: 'ana' } as any)).result)).toBe('forgotten for good: Ana es su hermana')
  const left = await run($, 'diario')
  expect(left).toContain('Le gusta la banana')
  expect(left).toContain('la próxima semana')
  // Japanese has no spaces between words: there the phrase is found inside the line.
  expect(String((await $.tool.call({ tool: OLVIDAR, about: '試験が' } as any)).result)).toBe('forgotten for good: 明日は試験がある')
})

test('a good night with a task in the same message is a task, not a goodbye', async ($, on) => {
  const { sent, clock } = world(on, { now: at(12, 20) })

  for (const text of ['Buenas noches, arregla el test de login', 'me voy a dormir, deja corriendo los tests', 'boa noite, corrige o teste de login']) {
    sent.length = 0
    await ask($, text)
    expect(await compose($)).not.toContain('leaving for the night')
    await reply($)
    await clock.advance(2000)
    expect(doing(sent, 'sleepy')).toEqual([])
    expect(doing(sent, 'celebrate').length).toBe(1)
  }

  await ask($, 'buenas noches, amor')
  expect(await compose($)).toContain('leaving for the night')
})

test('working straight through 05:00 is not greeted as a new day', async ($, on) => {
  const { clock } = world(on, { now: at(12, 4, 50) })
  await ask($, 'hola')
  await reply($)

  await clock.set(at(12, 4, 58))
  await ask($, 'sigue')
  await reply($)

  // 05:06: her day turned over, but they never left.
  await clock.set(at(12, 5, 6))
  await ask($, 'y ahora el otro test')
  const text = await compose($)
  expect(text).not.toContain('first message today')
  expect(text).not.toContain('They stopped at')
})

test('someone she already knows hears what is new once; a first meeting covers it', async ($, on) => {
  world(on, { store: { welcomed: true } })
  await $.session.start({ cwd: '/tmp/x', isInteractive: true, surface: null } as any)

  await ask($, 'hola')
  const text = await compose($)
  expect(text).toContain('## What is new')
  expect(text).toContain('recuérdame en 20 minutos')
  expect(text).not.toContain('## First meeting')
  await reply($)

  await ask($, 'otra cosa')
  expect(await compose($)).not.toContain('## What is new')
})

test('a first meeting does not also announce what is new', async ($, on) => {
  world(on)
  await $.session.start({ cwd: '/tmp/x', isInteractive: true, surface: null } as any)

  await ask($, 'hola')
  const text = await compose($)
  expect(text).toContain('## First meeting')
  expect(text).not.toContain('## What is new')
})
