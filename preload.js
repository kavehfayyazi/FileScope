const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fileScope', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  readDirectory: (dirPath) => ipcRenderer.invoke('read-directory', dirPath),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  deleteFile: (filePath) => ipcRenderer.invoke('delete-file', filePath),
  moveFile: (srcPath) => ipcRenderer.invoke('move-file', srcPath),
  renameFile: (filePath, newName) => ipcRenderer.invoke('rename-file', filePath, newName),
  copyPath: (text) => ipcRenderer.invoke('copy-to-clipboard', text),
  openInDefaultApp: (filePath) => ipcRenderer.invoke('open-in-default-app', filePath),
  showInFinder: (filePath) => ipcRenderer.invoke('show-in-finder', filePath),
  getHomeDir: () => ipcRenderer.invoke('get-home-dir'),
});
