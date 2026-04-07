const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fileScope', {
  onShortcut: (callback) => ipcRenderer.on('shortcut', (_event, action) => callback(action)),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  readDirectory: (dirPath) => ipcRenderer.invoke('read-directory', dirPath),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  deleteFile: (filePath) => ipcRenderer.invoke('delete-file', filePath),
  deleteFiles: (filePaths) => ipcRenderer.invoke('delete-files', filePaths),
  moveFile: (srcPath) => ipcRenderer.invoke('move-file', srcPath),
  moveFiles: (srcPaths) => ipcRenderer.invoke('move-files', srcPaths),
  renameFile: (filePath, newName) => ipcRenderer.invoke('rename-file', filePath, newName),
  copyPath: (text) => ipcRenderer.invoke('copy-to-clipboard', text),
  openInDefaultApp: (filePath) => ipcRenderer.invoke('open-in-default-app', filePath),
  showInFinder: (filePath) => ipcRenderer.invoke('show-in-finder', filePath),
  getHomeDir: () => ipcRenderer.invoke('get-home-dir'),
});
