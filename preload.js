const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('claudiaChan', {
  onEvent: callback => ipcRenderer.on('claudia-chan', (_, event) => callback(event)),
})
