const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
  });

  mainWindow.loadFile('renderer/index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ── IPC Handlers ──

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle('read-directory', async (_event, dirPath) => {
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    const items = entries
      .filter((e) => !e.name.startsWith('.'))
      .map((e) => ({
        name: e.name,
        path: path.join(dirPath, e.name),
        isDirectory: e.isDirectory(),
      }));
    items.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
    return items;
  } catch {
    return [];
  }
});

ipcMain.handle('read-file', async (_event, filePath) => {
  try {
    const stat = await fs.promises.stat(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.webp', '.ico'];
    const videoExts = ['.mp4', '.webm', '.ogg', '.mov'];
    const audioExts = ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a'];
    const pdfExts = ['.pdf'];

    if (imageExts.includes(ext)) {
      const data = await fs.promises.readFile(filePath);
      const mime = ext === '.svg' ? 'image/svg+xml' : `image/${ext.slice(1).replace('jpg', 'jpeg')}`;
      return { type: 'image', data: `data:${mime};base64,${data.toString('base64')}`, size: stat.size };
    }

    if (videoExts.includes(ext)) {
      return { type: 'video', data: filePath, size: stat.size };
    }

    if (audioExts.includes(ext)) {
      return { type: 'audio', data: filePath, size: stat.size };
    }

    if (pdfExts.includes(ext)) {
      const data = await fs.promises.readFile(filePath);
      return { type: 'pdf', data: `data:application/pdf;base64,${data.toString('base64')}`, size: stat.size };
    }

    // Try reading as text — bail if binary
    if (stat.size > 5 * 1024 * 1024) {
      return { type: 'binary', data: null, size: stat.size };
    }

    const buf = await fs.promises.readFile(filePath);
    const nullBytes = buf.slice(0, 8192).filter((b) => b === 0).length;
    if (nullBytes > 0) {
      return { type: 'binary', data: null, size: stat.size };
    }

    return { type: 'text', data: buf.toString('utf-8'), size: stat.size };
  } catch (err) {
    return { type: 'error', data: err.message, size: 0 };
  }
});

ipcMain.handle('delete-file', async (_event, filePath) => {
  try {
    await shell.trashItem(filePath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('move-file', async (_event, srcPath) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Move to…',
  });
  if (result.canceled) return { success: false, error: 'canceled' };
  const dest = path.join(result.filePaths[0], path.basename(srcPath));
  try {
    await fs.promises.rename(srcPath, dest);
    return { success: true, newPath: dest };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-home-dir', () => app.getPath('home'));
