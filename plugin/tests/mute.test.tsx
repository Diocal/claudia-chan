import { expect, test } from 'claude-code/testing'

// Stands in for the avatar app: nothing here may reach the real one on port 8971.
function fakeAvatar(on: any, reply: object = {}) {
  const sent: any[] = []
  on('http.fetch', (_: unknown, e: any) => {
    sent.push(JSON.parse(String(e.init?.body ?? '{}')))

    return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify(reply) } }
  })

  return sent
}

test('/claudia sonido off mutes her, and muted she only moves her lips', async ($, on) => {
  const sent = fakeAvatar(on)

  expect((await $.command.run({ command: 'claudia', args: 'sonido off' })).text).toBe('Silenciada.')
  expect(sent).toContainEqual({ type: 'mute', value: true })

  sent.length = 0
  await $.command.run({ command: 'claudia', args: 'ppt piedra' })
  expect(sent.some(e => e.type === 'mouth' && e.seconds >= 1 && e.seconds <= 8)).toBe(true)
  expect(sent.some(e => e.type === 'speak')).toBe(false)
})

test('/claudia sonido on gives her voice back', async ($, on) => {
  const sent = fakeAvatar(on)

  await $.command.run({ command: 'claudia', args: 'sonido off' })
  expect((await $.command.run({ command: 'claudia', args: 'sonido on' })).text).toBe('Sonido activado.')

  sent.length = 0
  await $.command.run({ command: 'claudia', args: 'ppt piedra' })
  expect(sent.some(e => e.type === 'speak')).toBe(true)
  expect(sent.some(e => e.type === 'mouth')).toBe(false)
})
