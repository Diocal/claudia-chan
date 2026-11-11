import { expect, test } from 'claude-code/testing'

// In an ordinary interactive session she must be in the system prompt.
test('the persona reaches the system prompt of a normal session', async ($, on) => {
  on('prompt.compose', () => ({ sections: [{ id: 'base', text: 'base', scope: 'shared' as const }] }))
  const out = await $.prompt.compose({ model: 'claude-opus-5-5', promptModel: 'claude-opus-5-5', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] } as any)
  expect(out.sections.some((s: any) => s.id === 'claudia-chan:persona')).toBe(true)
})
