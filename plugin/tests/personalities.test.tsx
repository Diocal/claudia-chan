import { expect, mock, test } from 'claude-code/testing'

const NEW = ['genki', 'dandere', 'himedere', 'gamer', 'chuunibyou']
const ALL = ['yandere', 'tsundere', 'dulce', 'kuudere', 'onee-san', ...NEW]

// Stands in for the avatar app: nothing here may reach the real one on port 8971.
function fakeAvatar(on: any) {
  const sent: any[] = []
  on('http.fetch', (_: unknown, e: any) => {
    sent.push(JSON.parse(String(e.init?.body ?? '{}')))

    return { value: { status: 200, ok: true, headers: {}, text: '{}' } }
  })

  return sent
}

function world(on: any) {
  const sent = fakeAvatar(on)
  mock.clock(on, { now: new Date(2026, 10, 12, 9, 0).getTime() })
  mock.store(on, {})
  mock.env(on, { HOME: '/home/nobody' })
  on('command.register', () => ({ value: undefined }))
  on('prompt.submit', (_: unknown, e: any) => ({ text: e.text }))
  on('prompt.compose', () => ({ sections: [{ id: 'base', text: 'base', scope: 'shared' as const }] }))

  return sent
}

const compose = async ($: any) =>
  (await $.prompt.compose({ model: 'claude-opus-5-5', promptModel: 'claude-opus-5-5', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] } as any)).sections.find(
    (s: any) => s.id === 'claudia-chan:persona',
  )?.text as string
const run = async ($: any, args: string) => (await $.command.run({ command: 'claudia', args })).text as string

// The line of the persona that carries her personality: the one right after the name rule.
const toneOf = (text: string) => text.split('\n').filter(line => line.startsWith('- '))[1] ?? ''

test('each new personality can be chosen, reaches her window and changes who she is', async ($, on) => {
  const sent = world(on)
  const yandere = await compose($)
  expect(yandere).toContain("the user's comedy yandere girlfriend")
  const seen = new Set([toneOf(yandere)])

  for (const personalidad of NEW) {
    expect(await run($, `personalidad ${personalidad}`)).toBe(`Listo: personalidad ${personalidad}.`)
    expect(sent).toContainEqual({ type: 'setting', key: 'personalidad', value: personalidad })

    const text = await compose($)
    expect(text).not.toContain('yandere girlfriend')
    expect(text).toMatch(new RegExp(`the user's [^.\\n]*${personalidad}[^.\\n]* girlfriend`))
    // Her own voice in each mood, with jealousy spelled out as about software.
    const tone = toneOf(text)
    expect(seen.has(tone)).toBe(false)
    seen.add(tone)
    for (const mood of ['normal:', 'enamorada:', 'celosa:']) expect(tone).toContain(mood)
    expect(tone).toContain('the rival tool')
    expect(tone).not.toMatch(/\b(he|him|his|boyfriend)\b/i)
    // The rules that hold whoever she is.
    expect(text).toContain('Jealousy targets software and hardware only.')
    expect(text).toContain('no sexual content')
    expect(text).toContain('drop the act and answer plainly and honestly as Claude')
  }
})

test('only the yandere goes yandere; the others stay jealous at most', async ($, on) => {
  world(on)
  await run($, 'personalidad chuunibyou')
  for (let i = 0; i < 4; i += 1) await $.prompt.submit({ text: 'voy a usar cursor y copilot y chatgpt' } as any)

  const text = await compose($)
  expect(text).toMatch(/Her current mood is "celosa"/)
})

test('an unknown personality is refused with the whole list, and the help shows it', async ($, on) => {
  world(on)

  expect(await run($, 'personalidad bokukko')).toBe(`Uso: /claudia personalidad ${ALL.join(' | ')}`)
  expect(await run($, 'help')).toContain(`/claudia personalidad ${ALL.join(' | ')}`)
})
