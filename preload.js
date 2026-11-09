'use strict'
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('ena', {
  call: (method, args) => ipcRenderer.invoke('ena', method, args),
  onChanged: (cb) => ipcRenderer.on('ena:changed', (_e, d) => cb(d)),
})
