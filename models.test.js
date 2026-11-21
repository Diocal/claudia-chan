const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const DIR = path.join(__dirname, 'assets/models')
// GitHub warns from 50 MB per file; a character much smaller than 1 MB is a broken download.
const MAX_BYTES = 50 * 1024 * 1024
const MIN_BYTES = 1024 * 1024

// Models named in .gitignore stay on the owner's machine, so they need no credit line.
const ignored = fs
  .readFileSync(path.join(__dirname, '.gitignore'), 'utf8')
  .split('\n')
  .filter(line => line.startsWith('assets/models/'))
  .map(line => path.basename(line.trim()))
const published = fs.readdirSync(DIR).filter(file => file.endsWith('.vrm') && !ignored.includes(file))

// The licence travels inside the file: the VRM 0.x meta in the glb's JSON chunk.
function meta(file) {
  const handle = fs.openSync(path.join(DIR, file), 'r')
  const head = Buffer.alloc(20)
  fs.readSync(handle, head, 0, 20, 0)
  const json = Buffer.alloc(head.readUInt32LE(12))
  fs.readSync(handle, json, 0, json.length, 20)
  fs.closeSync(handle)
  assert.strictEqual(head.toString('latin1', 0, 4), 'glTF', file)

  return JSON.parse(json.toString('utf8')).extensions?.VRM?.meta ?? {}
}

test('the new characters are in the folder the picker lists', () => {
  for (const name of ['sendagaya-shino', 'victoria-rubin']) assert.ok(published.includes(`${name}.vrm`), name)
})

test('no .vrm pattern in .gitignore hides a whole folder of characters', () => {
  const lines = fs.readFileSync(path.join(__dirname, '.gitignore'), 'utf8').split('\n')
  assert.deepStrictEqual(lines.filter(line => /^\*\.vrm|^assets\/?$|^assets\/models\/?$|^assets\/models\/\*/.test(line.trim())), [])
})

test('every published character is a sane size', () => {
  for (const file of published) {
    const { size } = fs.statSync(path.join(DIR, file))
    assert.ok(size > MIN_BYTES && size < MAX_BYTES, `${file}: ${size} bytes`)
  }
})

test('every published character says CC0 in its own file, usable by everyone', () => {
  for (const file of published) {
    const { licenseName, allowedUserName, otherLicenseUrl } = meta(file)
    assert.strictEqual(licenseName, 'CC0', file)
    assert.strictEqual(allowedUserName, 'Everyone', file)
    assert.ok(!otherLicenseUrl, file)
  }
})

test('every published character is credited in README and NOTICE', () => {
  const readme = fs.readFileSync(path.join(__dirname, 'README.md'), 'utf8')
  const credits = readme.slice(readme.indexOf('## Credits'))
  const notice = fs.readFileSync(path.join(__dirname, 'NOTICE'), 'utf8')
  for (const file of published) {
    const name = file.slice(0, -4)
    assert.ok(credits.includes(name), `README Credits: ${name}`)
    assert.ok(notice.includes(name), `NOTICE: ${name}`)
  }
})

test('main.js lists whatever is in the folder, so a new character needs no code', () => {
  const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8').replace(/\r\n/g, '\n')
  const body = main.match(/function modelNames\(\) \{\n([\s\S]*?)\n\}/)[1]
  assert.match(body, /readdirSync\(dir\)\.filter\(f => f\.endsWith\('\.vrm'\)\)/)
  // The app's own characters and, in the installed app, the ones the user put in their folder.
  assert.match(body, /vrms\(MODELS_DIR\)/)
  assert.match(body, /vrms\(USER_MODELS\)/)
  const panel = fs.readFileSync(path.join(__dirname, 'panel.html'), 'utf8')
  assert.match(panel, /fetch\('\/models'\)/)
  assert.match(panel, /pick\(look, 'Modelo', [^\n]*, models, get\('modelo'\)/)
})
