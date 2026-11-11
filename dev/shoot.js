// Dev only: electron dev/shoot.js <outdir> <act>[:mood] ...   (needs the app running on 8971)
// Captures the avatar in each activity, to tune poses by eye.
const { app, BrowserWindow } = require('electron')
const fs = require('fs'), path = require('path')
const [outDir, ...shots] = process.argv.slice(process.argv.findIndex(a => a.endsWith('shoot.js')) + 1)
// Its own profile: the live app holds the shared one.
app.setPath('userData', fs.mkdtempSync(path.join(require('os').tmpdir(), 'claudia-shoot-')))
app.commandLine.appendSwitch('enable-transparent-visuals')
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 380, height: 560, show: false, webPreferences: { offscreen: true } })
  win.webContents.on('console-message', e => { if (e.level === 'error') console.log('page:', e.message) })
  win.webContents.setFrameRate(30)
  for (const shot of shots) {
    const [act, mood = '', settleText = '', name = act, poseJson = '', body = ''] = shot.split('|')
    const settle = settleText || '2200'
    await win.loadURL(`http://127.0.0.1:8971/dev/poses.html?act=${act}&dir=${mood || 0}&mood=${mood}&settle=${settle}${poseJson ? '&pose=' + encodeURIComponent(poseJson) : ''}${body ? '&body=' + body : ''}`)
    for (let i = 0; i < 80 && (await win.webContents.executeJavaScript('document.title')) !== 'ready'; i++) await new Promise(r => setTimeout(r, 100))
    const image = await win.webContents.capturePage()
    fs.writeFileSync(path.join(outDir, `${name}.png`), image.toPNG())
    console.log('shot', act)
  }
  app.quit()
})
