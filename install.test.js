const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const install = require('./install.js')

function withHome(run) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'claudia-install-'))
  const before = process.env.HOME
  process.env.HOME = home
  process.env.USERPROFILE = home
  try {
    return run(home)
  } finally {
    process.env.HOME = before
    fs.rmSync(home, { recursive: true, force: true })
  }
}

test('the plugin is copied next to her data, without its tests, with launch.json', () => {
  withHome(home => {
    const data = path.join(home, 'data')
    const plugin = install.syncPlugin(data)
    assert.ok(fs.existsSync(path.join(plugin, 'hooks/register.tsx')))
    assert.ok(fs.existsSync(path.join(plugin, '.claude-plugin/plugin.json')))
    assert.ok(!fs.existsSync(path.join(plugin, 'tests')))
    assert.ok(JSON.parse(fs.readFileSync(path.join(data, 'launch.json'), 'utf8')).exe)
  })
})

test('in a checkout it refuses to sync onto its own plugin folder', () => {
  assert.throws(() => install.syncPlugin(__dirname), /installed app/)
  assert.ok(fs.existsSync(path.join(__dirname, 'plugin/hooks/register.tsx')))
})

test('the claude-chan command is written once, and a user-made one is never replaced', () => {
  if (process.platform === 'win32') return
  withHome(home => {
    const first = install.installCommand('/data/plugin')
    assert.ok(first.written)
    assert.match(fs.readFileSync(first.file, 'utf8'), /claude --plugin-dir "\/data\/plugin"/)
    // Ours: refreshed when the app moves.
    assert.ok(install.installCommand('/moved/plugin').written)
    assert.match(fs.readFileSync(first.file, 'utf8'), /\/moved\/plugin/)
    // The user's own (setup.sh from a checkout): left alone.
    fs.writeFileSync(first.file, '#!/bin/sh\nexec claude --plugin-dir "/home/me/claudia-chan/plugin" "$@"\n')
    assert.ok(!install.installCommand('/data/plugin').written)
    assert.match(fs.readFileSync(first.file, 'utf8'), /home\/me\/claudia-chan/)
  })
})
