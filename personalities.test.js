const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const I18N = require('./i18n.json')

const ALL = ['yandere', 'tsundere', 'dulce', 'kuudere', 'onee-san', 'genki', 'dandere', 'himedere', 'gamer', 'chuunibyou']
const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8')
const listIn = source => source.match(/personalidad: \[([^\]]+)\]/)[1].split(',').map(name => name.trim().replace(/'/g, ''))

// The plugin keeps its own copy of the list (it cannot require this folder), and so does the panel page.
test('the app, the plugin and the panel offer the same ten personalities', () => {
  const plugin = read('plugin/hooks/register.tsx')
  assert.deepStrictEqual(listIn(read('main.js')), ALL)
  assert.deepStrictEqual(listIn(plugin), ALL)
  const cards = read('panel.html').match(/const PERSONALITIES = \[([\s\S]*?)\n\]/)[1]
  assert.deepStrictEqual([...cards.matchAll(/^\s*\['([^']+)'/gm)].map(match => match[1]), ALL)
})

test('the plugin gives every personality a title and a tone for each mood, about software only', () => {
  const plugin = read('plugin/hooks/register.tsx')
  const table = plugin.slice(plugin.indexOf('const PERSONALITIES'), plugin.indexOf('const PPT'))
  for (const name of ALL) {
    const entry = table.split('\n').find(line => new RegExp(`^  '?${name}'?: \\{ title: '`).test(line))
    assert.ok(entry, name)
    assert.match(entry, /celosa/, `${name}: how jealousy shows`)
    assert.match(entry, /rival tool/, `${name}: jealousy is about software`)
    assert.doesNotMatch(entry, /\b(he|him|his|boyfriend|sexy|kill|blood)\b/i, name)
  }
  assert.strictEqual(table.split('\n').filter(line => /^  \S+: \{ title: /.test(line)).length, ALL.length)
})

test('the first meeting and the README name them all', () => {
  const sentence = `${ALL.slice(0, -1).join(', ')} or ${ALL.at(-1)} (/claudia personalidad <name>)`
  assert.ok(read('plugin/hooks/register.tsx').includes(`Ask which personality they prefer: ${sentence}.`))
  const readme = read('README.md')
  assert.ok(readme.includes(`/claudia personalidad ${ALL.join('\\|')}`))
  for (const name of ALL) assert.match(readme, new RegExp(`^\\| \`${name}\``, 'm'), name)
})

test('every language describes each one in the panel and has her lines for a game won and lost', () => {
  for (const [code, language] of Object.entries(I18N)) {
    assert.deepStrictEqual(Object.keys(language.personalities).sort(), ['about', 'title', ...ALL].sort(), code)
    assert.deepStrictEqual(Object.keys(language.games.flavor).sort(), [...ALL].sort(), code)
    for (const name of ALL) {
      assert.ok(language.personalities[name].length <= 70, `${code} ${name}: fits its card`)
      for (const side of ['won', 'lost']) assert.ok(language.games.flavor[name][side].length >= 1, `${code} ${name} ${side}`)
    }
  }
})

test('the idle flavours belong to real personalities and scale only what she already does', async () => {
  const { TEMPER, pickIdle } = await import('./idle.mjs')
  const known = ['stretch', 'phone', 'lookAround', 'sway', 'yawn', 'sleepy']
  for (const [name, lean] of Object.entries(TEMPER)) {
    assert.ok(ALL.includes(name), name)
    for (const [activity, factor] of Object.entries(lean)) {
      assert.ok(known.includes(activity) && factor > 0, `${name}.${activity}`)
    }
    for (let hour = 0; hour < 24; hour += 1) assert.ok(known.includes(pickIdle({ hour, personalidad: name }).name))
  }
  // main.js: the dance odds name real personalities too.
  const odds = read('main.js').match(/const DANCE_CHANCE = \{([^}]+)\}/)[1]
  for (const [, name, chance] of odds.matchAll(/(\w+): ([\d.]+)/g)) {
    assert.ok(ALL.includes(name) && Number(chance) > 0 && Number(chance) < 0.5, name)
  }
})
