const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('claudiaChan', {
  onEvent: callback => ipcRenderer.on('claudia-chan', (_, event) => callback(event)),
  // The little hover toolbar: stay/stroll, menu, drag.
  act: action => ipcRenderer.send('claudia-ui', action),
})
