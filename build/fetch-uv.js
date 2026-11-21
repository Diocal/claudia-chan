// Puts the uv binary for this machine in build/uv, for the installer to carry (her voice and ears
// are installed with it on the app's first start). Pinned version; run before electron-builder.
const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const VERSION = '0.13.6'
const TARGETS = {
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'linux-arm64': 'aarch64-unknown-linux-gnu',
  'darwin-x64': 'x86_64-apple-darwin',
  'darwin-arm64': 'aarch64-apple-darwin',
  'win32-x64': 'x86_64-pc-windows-msvc',
  'win32-arm64': 'aarch64-pc-windows-msvc',
}
const target = TARGETS[`${process.platform}-${process.env.UV_ARCH || process.arch}`]
if (!target) throw new Error(`no uv build for ${process.platform}-${process.arch}`)
const windows = process.platform === 'win32'
const out = path.join(__dirname, 'uv')
const binary = path.join(out, windows ? 'uv.exe' : 'uv')
const stamp = path.join(out, 'VERSION')
if (fs.existsSync(binary) && fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') === `${VERSION} ${target}`) process.exit(0)

const archive = `uv-${target}.${windows ? 'zip' : 'tar.gz'}`
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'uv-'))
const file = path.join(work, archive)
execFileSync('curl', ['-fsSL', '-o', file, `https://github.com/astral-sh/uv/releases/download/${VERSION}/${archive}`], { stdio: 'inherit' })
// Windows' own bsdtar reads zips; Expand-Archive breaks when PowerShell 7 shadows the 5.1 module.
if (windows) execFileSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', file, '-C', work], { stdio: 'inherit' })
else execFileSync('tar', ['-xzf', file, '-C', work], { stdio: 'inherit' })
const found = [path.join(work, windows ? 'uv.exe' : 'uv'), path.join(work, `uv-${target}`, 'uv')].find(f => fs.existsSync(f))
if (!found) throw new Error('uv binary not found in the archive')
fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out, { recursive: true })
fs.copyFileSync(found, binary)
fs.chmodSync(binary, 0o755)
fs.writeFileSync(stamp, `${VERSION} ${target}`)
fs.rmSync(work, { recursive: true, force: true })
console.log(`uv ${VERSION} (${target}) → ${binary}`)
