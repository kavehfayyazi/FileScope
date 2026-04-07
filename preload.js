const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fileScope', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  readDirectory: (dirPath) => ipcRenderer.invoke('read-directory', dirPath),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  deleteFile: (filePath) => ipcRenderer.invoke('delete-file', filePath),
  moveFile: (srcPath) => ipcRenderer.invoke('move-file', srcPath),
  getHomeDir: () => ipcRenderer.invoke('get-home-dir'),
});
