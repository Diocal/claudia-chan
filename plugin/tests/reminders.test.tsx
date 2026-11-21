import { expect, test } from 'claude-code/testing'

const TOOL = 'mcp__claudia-chan__recordatorio'

// Stands in for the avatar app: nothing here may reach the real one on port 8971. `answer` decides
// what the app would say to each event; by default it accepts everything with an empty reply.
function fakeAvatar(on: any, answer: (event: any) => { status?: number; body?: object } = () => ({})) {
  const sent: any[] = []
  on('http.fetch', (_: unknown, e: any) => {
    const event = JSON.parse(String(e.init?.body ?? '{}'))
    sent.push(event)
    const { status = 200, body = {} } = answer(event)

    return { value: { status, ok: status < 300, headers: {}, text: JSON.stringify(body) } }
  })

  return sent
}

const run = async ($: any, args: string) => (await $.command.run({ command: 'claudia', args })).text as string
const reminders = (sent: any[]) => sent.filter(e => e.type === 'reminder')

test('/claudia recuerdame 20 <texto> asks the app for a reminder in minutes, text untouched', async ($, on) => {
  const sent = fakeAvatar(on, e => (e.type === 'reminder' ? { body: { id: 1, due: Date.now() + 20 * 60000, keepsAlive: true } } : {}))

  const text = await run($, 'recuerdame 20 Sacar la ROPA de la lavadora')

  expect(reminders(sent)).toEqual([{ type: 'reminder', text: 'Sacar la ROPA de la lavadora', minutes: 20 }])
  expect(text).toMatch(/^⏰ Te aviso a las \d\d:\d\d\.$/)
})

test('/claudia recuerdame takes +30m and a clock time too', async ($, on) => {
  const sent = fakeAvatar(on, e => (e.type === 'reminder' ? { body: { id: 1, due: Date.now() + 60000, keepsAlive: true } } : {}))

  await run($, 'recuerdame +30m estirarme')
  await run($, 'recuérdame 17:30 llamar a mamá')

  expect(reminders(sent)).toEqual([
    { type: 'reminder', text: 'estirarme', minutes: 30 },
    { type: 'reminder', text: 'llamar a mamá', at: '17:30' },
  ])
})

test('a reminder too far away to keep her alive says it may arrive late', async ($, on) => {
  fakeAvatar(on, e => (e.type === 'reminder' ? { body: { id: 1, due: Date.now() + 5 * 3600000, keepsAlive: false } } : {}))

  expect(await run($, 'recuerdame 300 la reunión')).toContain('Si cierras Claude antes')
})

test('/claudia recuerdame without a time or a text shows how to use it, and sends nothing', async ($, on) => {
  const sent = fakeAvatar(on)

  for (const args of ['recuerdame', 'recuerdame 20', 'recuerdame mañana algo', 'recuerdame 17:30', 'recuerdame 0 nada', 'recuerdame 99999 lejos']) {
    expect(await run($, args)).toContain('Uso: /claudia recuerdame')
  }
  expect(reminders(sent)).toEqual([])
})

test('a time the app refuses shows how to use it', async ($, on) => {
  fakeAvatar(on, e => (e.type === 'reminder' ? { status: 400 } : {}))

  expect(await run($, 'recuerdame 25:99 algo')).toContain('Uso: /claudia recuerdame')
})

test('/claudia recordatorios lists them numbered, and says so when there is none', async ($, on) => {
  let list = [
    { id: 4, text: 'sacar la ropa', due: Date.now() + 60000 },
    { id: 7, text: 'llamar a mamá', due: Date.now() + 120000 },
  ]
  fakeAvatar(on, e => (e.type === 'reminders' ? { body: { list } } : {}))

  const lines = (await run($, 'recordatorios')).split('\n')
  expect(lines.length).toBe(2)
  expect(lines[0]).toMatch(/^1\. \d\d:\d\d sacar la ropa$/)
  expect(lines[1]).toMatch(/^2\. \d\d:\d\d llamar a mamá$/)

  list = []
  expect(await run($, 'recordatorios')).toBe('No hay recordatorios.')
})

test('/claudia recordatorio borrar 2 removes the second one', async ($, on) => {
  const sent = fakeAvatar(on, e => (e.type === 'reminder-del' ? { status: e.index === 1 ? 204 : 400 } : {}))

  expect(await run($, 'recordatorio borrar 2')).toBe('Recordatorio borrado.')
  expect(sent).toContainEqual({ type: 'reminder-del', index: 1 })
  expect(await run($, 'recordatorio borrar 9')).toBe('No hay recordatorios.')
  expect(await run($, 'recordatorio borrar')).toContain('Uso: /claudia recuerdame')
  expect(await run($, 'recordatorio quitar 1')).toContain('Uso: /claudia recuerdame')
})

test('the help lists the reminder commands', async ($, on) => {
  fakeAvatar(on)

  const help = await run($, 'help')
  expect(help).toContain('/claudia recuerdame')
  expect(help).toContain('/claudia recordatorios')
})

test('the recordatorio tool sets a reminder and tells the model the time', async ($, on) => {
  const sent = fakeAvatar(on, e => (e.type === 'reminder' ? { body: { id: 1, due: Date.now() + 20 * 60000, keepsAlive: true } } : {}))

  const answer = await $.tool.call({ tool: TOOL, text: 'sacar la ropa', minutes: 20 } as any)

  expect(reminders(sent)).toEqual([{ type: 'reminder', text: 'sacar la ropa', minutes: 20 }])
  // The day is always spelled out, with the current time beside it, so a wrong day can be caught.
  expect((answer as any).result).toMatch(/^set for \w+day \d{4}-\d\d-\d\d \d\d:\d\d( \(today\))?; it is now \w+day \d{4}-\d\d-\d\d \d\d:\d\d$/)
  // Her own tool: no "typing" pose or thinking face as for a real tool call.
  expect(sent.some(e => e.type === 'doing' || e.type === 'react')).toBe(false)
})

test('the recordatorio tool reports a bad time, and a far one as possibly late', async ($, on) => {
  let reply: { status?: number; body?: object } = { status: 400 }
  fakeAvatar(on, e => (e.type === 'reminder' ? reply : {}))

  expect(((await $.tool.call({ tool: TOOL, text: 'x', at: '25:00' } as any)) as any).result).toContain('invalid time')

  reply = { body: { id: 1, due: Date.now() + 5 * 3600000, keepsAlive: false } }
  expect(((await $.tool.call({ tool: TOOL, text: 'x', minutes: 300 } as any)) as any).result).toContain('delivers it late at the next start')
})

test('the recordatorio tool needs no permission prompt', async ($, on) => {
  fakeAvatar(on)

  expect(((await $.tool.check({ tool: TOOL, text: 'x', minutes: 5 } as any)) as any).decision).toBe('allow')
})

test('the recordatorio tool passes a date for "tomorrow at 9", and the answer names that day', async ($, on) => {
  const due = new Date(2026, 10, 14, 9, 0).getTime()
  const sent = fakeAvatar(on, e => (e.type === 'reminder' ? { body: { id: 1, due, keepsAlive: true } } : {}))

  const answer = await $.tool.call({ tool: TOOL, text: 'llamar al dentista', at: '09:00', date: '2026-11-14' } as any)

  expect(reminders(sent)).toEqual([{ type: 'reminder', text: 'llamar al dentista', at: '09:00', date: '2026-11-14' }])
  expect((answer as any).result).toContain('set for Saturday 2026-11-14 09:00; it is now ')
})
