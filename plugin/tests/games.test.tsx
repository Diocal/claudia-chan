import { expect, test } from 'claude-code/testing'

// Stands in for the avatar app: nothing here may reach the real one on port 8971.
function fakeAvatar(on: any, status = 200) {
  const sent: any[] = []
  on('http.fetch', (_: unknown, e: any) => {
    sent.push(JSON.parse(String(e.init?.body ?? '{}')))

    return { value: { status, ok: status < 300, headers: {}, text: '{}' } }
  })

  return sent
}

test('/claudia juega opens her games on her window', async ($, on) => {
  const sent = fakeAvatar(on)

  expect((await $.command.run({ command: 'claudia', args: 'juega' })).text).toBe('🎮 Mira su ventana: ahí se juega.')
  expect(sent).toContainEqual({ type: 'games' })
})

test('/claudia juega <game> opens that game, by its name or an easy guess', async ($, on) => {
  const sent = fakeAvatar(on)

  for (const [asked, game] of [['ppt', 'ppt'], ['corazones', 'corazones'], ['reflejos', 'reflejos'], ['numero', 'numero'], ['número', 'numero'], ['hearts', 'corazones']]) {
    sent.length = 0
    await $.command.run({ command: 'claudia', args: `juega ${asked}` })
    expect(sent).toContainEqual({ type: 'games', game })
  }
})

test('/claudia juega with a game she does not have explains itself and opens nothing', async ($, on) => {
  const sent = fakeAvatar(on)

  expect((await $.command.run({ command: 'claudia', args: 'juega ajedrez' })).text).toBe('Uso: /claudia juega [ppt | corazones | reflejos | numero]')
  expect(sent.some(e => e.type === 'games')).toBe(false)
})

test('/claudia juega says so when her window is closed', async ($, on) => {
  fakeAvatar(on, 500)

  expect((await $.command.run({ command: 'claudia', args: 'juega reflejos' })).text).toBe('Su ventana no está abierta.')
})

test('/claudia juegos off stops her proposing games, and on lets her again', async ($, on) => {
  const sent = fakeAvatar(on)

  expect((await $.command.run({ command: 'claudia', args: 'juegos off' })).text).toBe('Listo: juegos off.')
  expect(sent).toContainEqual({ type: 'setting', key: 'juegos', value: 'off' })
  await $.command.run({ command: 'claudia', args: 'juegos on' })
  expect(sent).toContainEqual({ type: 'setting', key: 'juegos', value: 'on' })
  expect((await $.command.run({ command: 'claudia', args: 'juegos quizas' })).text).toBe('Uso: /claudia juegos on | off')
})

test('/claudia help lists the games', async ($, on) => {
  fakeAvatar(on)

  const { text } = await $.command.run({ command: 'claudia', args: 'help' })
  expect(text).toContain('/claudia juega [ppt | corazones | reflejos | numero]: abre sus juegos en su ventana')
  expect(text).toContain('/claudia juegos on | off')
})
