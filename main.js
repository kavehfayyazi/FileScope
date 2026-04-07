const { app, BrowserWindow, ipcMain, dialog, shell, clipboard } = require('electron');
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
    const items = await Promise.all(
      entries
        .filter((e) => !e.name.startsWith('.'))
        .map(async (e) => {
          const fullPath = path.join(dirPath, e.name);
          const isDir = e.isDirectory();
          let size = 0;
          let mtime = 0;
          try {
            const st = await fs.promises.stat(fullPath);
            size = st.size;
            mtime = st.mtimeMs;
          } catch {}
          return {
            name: e.name,
            path: fullPath,
            isDirectory: isDir,
            size,
            mtime,
          };
        })
    );
    return items;
  } catch {
    return [];
  }
});

ipcMain.handle('read-file', async (_event, filePath) => {
  try {
    const stat = await fs.promises.stat(filePath);
    const ext = path.extname(filePath).toLowerCase();

    const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.ico', '.tiff', '.avif'];
    const videoExts = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'];
    const audioExts = ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.wma'];
    const pdfExts = ['.pdf'];
    const markdownExts = ['.md', '.mdx', '.markdown'];
    const csvExts = ['.csv', '.tsv'];
    const jsonExts = ['.json', '.jsonc', '.geojson'];
    const svgExts = ['.svg'];
    const fontExts = ['.ttf', '.otf', '.woff', '.woff2'];
    const officeExts = ['.docx', '.xlsx', '.pptx', '.doc', '.xls', '.ppt', '.odt', '.ods'];
    const codeExts = [
      '.js', '.ts', '.jsx', '.tsx', '.py', '.rb', '.go', '.rs', '.c', '.cpp', '.h', '.hpp',
      '.java', '.swift', '.sh', '.bash', '.zsh', '.sql', '.css', '.scss', '.less',
      '.html', '.htm', '.xml', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf',
      '.php', '.kt', '.kts', '.cs', '.lua', '.r', '.m', '.mm', '.pl', '.pm',
      '.ex', '.exs', '.erl', '.hs', '.ml', '.scala', '.groovy', '.dart',
      '.vue', '.svelte', '.astro', '.tf', '.dockerfile', '.makefile',
    ];

    if (svgExts.includes(ext)) {
      const data = await fs.promises.readFile(filePath, 'utf-8');
      return { type: 'svg', data, size: stat.size };
    }

    if (imageExts.includes(ext)) {
      const data = await fs.promises.readFile(filePath);
      const mime = `image/${ext.slice(1).replace('jpg', 'jpeg')}`;
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
      return { type: 'pdf', data: data.toString('base64'), size: stat.size };
    }

    if (fontExts.includes(ext)) {
      const data = await fs.promises.readFile(filePath);
      const mimeMap = { '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2' };
      return { type: 'font', data: `data:${mimeMap[ext]};base64,${data.toString('base64')}`, size: stat.size };
    }

    if (officeExts.includes(ext)) {
      return { type: 'office', data: null, size: stat.size, ext };
    }

    // Text-based types (need to read content)
    if (stat.size > 10 * 1024 * 1024) {
      return { type: 'binary', data: null, size: stat.size };
    }

    const buf = await fs.promises.readFile(filePath);
    const nullBytes = buf.slice(0, 8192).filter((b) => b === 0).length;
    if (nullBytes > 0) {
      return { type: 'binary', data: null, size: stat.size };
    }

    const text = buf.toString('utf-8');

    if (markdownExts.includes(ext)) {
      return { type: 'markdown', data: text, size: stat.size };
    }

    if (jsonExts.includes(ext)) {
      return { type: 'json', data: text, size: stat.size };
    }

    if (csvExts.includes(ext)) {
      return { type: 'csv', data: text, size: stat.size, delimiter: ext === '.tsv' ? '\t' : ',' };
    }

    if (codeExts.includes(ext)) {
      return { type: 'code', data: text, size: stat.size, ext };
    }

    // Check if basename matches known code files without extension
    const basename = path.basename(filePath).toLowerCase();
    const codeNames = ['makefile', 'dockerfile', 'vagrantfile', 'gemfile', 'rakefile', '.gitignore', '.env'];
    if (codeNames.includes(basename)) {
      return { type: 'code', data: text, size: stat.size, ext: '' };
    }

    return { type: 'text', data: text, size: stat.size };
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

ipcMain.handle('delete-files', async (_event, filePaths) => {
  const results = [];
  for (const fp of filePaths) {
    try {
      await shell.trashItem(fp);
      results.push({ path: fp, success: true });
    } catch (err) {
      results.push({ path: fp, success: false, error: err.message });
    }
  }
  return results;
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

ipcMain.handle('move-files', async (_event, srcPaths) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: `Move ${srcPaths.length} items to…`,
  });
  if (result.canceled) return { success: false, error: 'canceled' };
  const destDir = result.filePaths[0];
  const results = [];
  for (const src of srcPaths) {
    const dest = path.join(destDir, path.basename(src));
    try {
      await fs.promises.rename(src, dest);
      results.push({ path: src, success: true, newPath: dest });
    } catch (err) {
      results.push({ path: src, success: false, error: err.message });
    }
  }
  return { success: true, results };
});

ipcMain.handle('rename-file', async (_event, filePath, newName) => {
  try {
    const dir = path.dirname(filePath);
    const newPath = path.join(dir, newName);
    await fs.promises.rename(filePath, newPath);
    return { success: true, newPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('copy-to-clipboard', async (_event, text) => {
  clipboard.writeText(text);
  return { success: true };
});

ipcMain.handle('open-in-default-app', async (_event, filePath) => {
  try {
    await shell.openPath(filePath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('show-in-finder', async (_event, filePath) => {
  shell.showItemInFolder(filePath);
  return { success: true };
});

ipcMain.handle('get-home-dir', () => app.getPath('home'));
