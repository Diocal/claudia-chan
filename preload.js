const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('claudiaChan', {
  onEvent: callback => ipcRenderer.on('claudia-chan', (_, event) => callback(event)),
  // The little hover toolbar (stay/stroll, menu, drag…) and her games, which also send a little data
  // (the area that takes clicks, a result).
  act: (action, data) => ipcRenderer.send('claudia-ui', action, data),
})
