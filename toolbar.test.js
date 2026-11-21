const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { TOOL_COUNT, toolsRect, buttonSpan } = require('./toolbar.js')
const I18N = require('./i18n.json')

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8')
const tools = html.match(/<div id="tools">([\s\S]*?)<\/div>/)[1]
const ids = [...tools.matchAll(/<button id="([\w-]+)"/g)].map(m => m[1])

test('three buttons take the room the toolbar always had', () => {
  assert.strictEqual(toolsRect(3, 380).height, 148)
  assert.deepStrictEqual(toolsRect(3, 380), { x: 326, y: 106, width: 50, height: 148 })
})

test('the click area covers every button, top to bottom', () => {
  for (const count of [3, TOOL_COUNT, TOOL_COUNT + 3]) {
    const rect = toolsRect(count, 380)
    const { top, bottom } = buttonSpan(count)
    assert.ok(rect.y <= top && rect.y + rect.height >= bottom, `${count} buttons`)
  }
  assert.deepStrictEqual(buttonSpan(5), { top: 112, bottom: 334 })
})

test('index.html has as many toolbar buttons as main.js makes room for', () => {
  assert.strictEqual(ids.length, TOOL_COUNT)
  assert.strictEqual(new Set(ids).size, ids.length)
})

test('the toolbar starts where toolbar.js says it does', () => {
  assert.match(html, new RegExp(`#tools \\{[^}]*top: ${buttonSpan(1).top}px`))
})

test('every toolbar button has a name in every language', () => {
  for (const [code, language] of Object.entries(I18N)) {
    for (const id of ids) assert.ok(language.tools?.[id], `${code}: tools.${id}`)
    for (const extra of ['unmute', 'quietOff', 'tour']) assert.ok(language.tools?.[extra], `${code}: tools.${extra}`)
  }
})

test('the toolbar is the eight buttons the user asked for, in order', () => {
  assert.deepStrictEqual(ids, ['stay', 'menu', 'drag', 'mute', 'talk', 'quiet', 'hide', 'games'])
})

// The click-taking column must not sit over her head (pet.js) or run off the window (main.js).
test('the click area fits the window and stays off the petting zone', () => {
  const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8')
  const width = Number(main.match(/const WIDTH = (\d+)/)[1])
  const height = Number(main.match(/const HEIGHT = (\d+)/)[1])
  const head = fs.readFileSync(path.join(__dirname, 'pet.js'), 'utf8').match(/HEAD = \{ left: (\d+), right: (\d+)/)
  const rect = toolsRect(TOOL_COUNT, width)
  assert.ok(rect.x > Number(head[2]), 'right of the petting zone')
  assert.ok(rect.x + rect.width <= width)
  // The hint strips (#hint, #move, #mic) live in the last 60 px.
  assert.ok(rect.y + rect.height <= height - 60, 'above the hint strips')
})

test('hiding her from the toolbar says how to bring her back, with the shortcut, in every language', () => {
  for (const [code, language] of Object.entries(I18N)) assert.match(language.hideHow, /\{key\}/, code)
})
