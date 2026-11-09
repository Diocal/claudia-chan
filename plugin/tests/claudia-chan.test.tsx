import { expect, test } from 'claude-code/testing'

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
  on('prompt.submit', (_, e) => ({ text: e.text }))

  await $.prompt.submit({ text: 'probé Cursor' })
  await $.prompt.submit({ text: 'y también ChatGPT' })

  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /yandere/ }))?.text).toContain('celos')
  await ui.unmount()
})
