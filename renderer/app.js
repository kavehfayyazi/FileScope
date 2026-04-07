// PDF.js loaded as ES module
const pdfjsLib = await import('./lib/pdf.min.mjs');
pdfjsLib.GlobalWorkerOptions.workerSrc = './lib/pdf.worker.min.mjs';

const api = window.fileScope;

// DOM elements
const btnOpen = document.getElementById('btn-open-folder');
const folderName = document.getElementById('current-folder-name');
const breadcrumbs = document.getElementById('breadcrumbs');
const fileTree = document.getElementById('file-tree');
const viewerEmpty = document.getElementById('viewer-empty');
const viewerContent = document.getElementById('viewer-content');
const viewerActions = document.getElementById('viewer-actions');
const divider = document.getElementById('divider');
const sidebar = document.getElementById('sidebar');
const sortSelect = document.getElementById('sort-select');
const sortDirBtn = document.getElementById('sort-direction');
const foldersFirstCheckbox = document.getElementById('folders-first');

let rootDir = null;
let currentDir = null;
let selectedPath = null;       // single file shown in viewer
let selectedPaths = new Set();  // multi-select set
let lastClickedIndex = -1;     // for shift-click range selection
let cachedItems = [];           // cached directory listing for re-sorting
let sortedItems = [];           // current sorted view (for shift-click indexing)
let fontCounter = 0;

// PDF state
let pdfDoc = null;
let currentPage = 1;
let totalPages = 0;

// ── Open folder ──
btnOpen.addEventListener('click', async () => {
  const dir = await api.selectFolder();
  if (dir) {
    rootDir = dir;
    await navigateTo(dir);
  }
});

// ── Sorting ──
let sortAscending = true;

sortSelect.addEventListener('change', () => renderSorted());
foldersFirstCheckbox.addEventListener('change', () => renderSorted());
sortDirBtn.addEventListener('click', () => {
  sortAscending = !sortAscending;
  sortDirBtn.textContent = sortAscending ? '↑' : '↓';
  renderSorted();
});

function sortItems(items) {
  const category = sortSelect.value;
  const ff = foldersFirstCheckbox.checked;
  const dir = sortAscending ? 1 : -1;

  const sorted = [...items];
  sorted.sort((a, b) => {
    if (ff) {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
    }
    let cmp = 0;
    switch (category) {
      case 'name':
        cmp = a.name.localeCompare(b.name);
        break;
      case 'type': {
        const extA = a.name.includes('.') ? a.name.split('.').pop().toLowerCase() : '';
        const extB = b.name.includes('.') ? b.name.split('.').pop().toLowerCase() : '';
        cmp = extA.localeCompare(extB) || a.name.localeCompare(b.name);
        break;
      }
      case 'size':
        cmp = a.size - b.size;
        break;
      case 'date':
        cmp = a.mtime - b.mtime;
        break;
    }
    return cmp * dir;
  });
  return sorted;
}

function renderSorted() {
  sortedItems = sortItems(cachedItems);
  renderTree(sortedItems);
}

// ── Navigate to directory ──
async function navigateTo(dirPath) {
  currentDir = dirPath;
  const items = await api.readDirectory(dirPath);
  cachedItems = items;
  sortedItems = sortItems(items);
  renderBreadcrumbs(dirPath);
  renderTree(sortedItems);
  folderName.textContent = dirPath.split('/').pop() || dirPath;
}

// ── Breadcrumbs ──
function renderBreadcrumbs(dirPath) {
  breadcrumbs.innerHTML = '';
  if (!rootDir) return;

  const rel = dirPath.startsWith(rootDir) ? dirPath.slice(rootDir.length) : dirPath;
  const rootName = rootDir.split('/').pop() || rootDir;
  const parts = [rootName, ...rel.split('/').filter(Boolean)];
  const paths = [];

  let acc = rootDir;
  paths.push(rootDir);
  const relParts = rel.split('/').filter(Boolean);
  for (const p of relParts) {
    acc = acc + '/' + p;
    paths.push(acc);
  }

  parts.forEach((part, i) => {
    if (i > 0) {
      const sep = document.createElement('span');
      sep.className = 'sep';
      sep.textContent = ' / ';
      breadcrumbs.appendChild(sep);
    }
    const crumb = document.createElement('span');
    crumb.className = 'crumb';
    crumb.textContent = part;
    const target = paths[i];
    crumb.addEventListener('click', () => navigateTo(target));
    breadcrumbs.appendChild(crumb);
  });
}

// ── Render file tree ──
function renderTree(items) {
  fileTree.innerHTML = '';

  // Back entry
  if (currentDir !== rootDir) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="icon">⬆</span><span class="name">..</span>`;
    li.addEventListener('click', () => {
      const parent = currentDir.split('/').slice(0, -1).join('/') || '/';
      navigateTo(parent);
    });
    fileTree.appendChild(li);
  }

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const li = document.createElement('li');
    if (selectedPaths.has(item.path)) li.classList.add('selected');
    if (item.path === selectedPath) li.classList.add('active');

    const icon = item.isDirectory ? '📁' : getFileIcon(item.name);
    const sizeStr = item.isDirectory ? '' : formatSize(item.size);

    li.innerHTML = `
      <span class="icon">${icon}</span>
      <span class="name">${escapeHtml(item.name)}</span>
      <span class="meta">${sizeStr}</span>
      <button class="btn-overflow" title="Actions">⋯</button>
    `;

    // Click handling with multi-select
    li.addEventListener('click', (e) => {
      if (e.target.closest('.btn-overflow')) return;

      const isMeta = e.metaKey || e.ctrlKey;
      const isShift = e.shiftKey;

      if (item.isDirectory && !isMeta && !isShift) {
        selectedPaths.clear();
        updateSelectionUI();
        navigateTo(item.path);
        return;
      }

      if (isShift && lastClickedIndex >= 0) {
        // Range select
        const start = Math.min(lastClickedIndex, idx);
        const end = Math.max(lastClickedIndex, idx);
        if (!isMeta) selectedPaths.clear();
        for (let i = start; i <= end; i++) {
          selectedPaths.add(items[i].path);
        }
      } else if (isMeta) {
        // Toggle single item
        if (selectedPaths.has(item.path)) {
          selectedPaths.delete(item.path);
        } else {
          selectedPaths.add(item.path);
        }
      } else {
        // Normal click — single select
        selectedPaths.clear();
        selectedPaths.add(item.path);
      }

      lastClickedIndex = idx;
      updateSelectionUI();

      // Preview the last clicked file (if not a directory)
      if (!item.isDirectory) {
        selectFile(item.path, li);
      }
    });

    // Right-click context menu
    li.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      // If right-clicking an unselected item, select just that one
      if (!selectedPaths.has(item.path)) {
        selectedPaths.clear();
        selectedPaths.add(item.path);
        lastClickedIndex = idx;
        updateSelectionUI();
      }
      if (selectedPaths.size > 1) {
        showMultiContextMenu(e.clientX, e.clientY);
      } else {
        showContextMenu(e.clientX, e.clientY, item);
      }
    });

    // Overflow button
    li.querySelector('.btn-overflow').addEventListener('click', (e) => {
      e.stopPropagation();
      const rect = e.target.getBoundingClientRect();
      if (selectedPaths.size > 1 && selectedPaths.has(item.path)) {
        showMultiContextMenu(rect.right, rect.bottom);
      } else {
        showContextMenu(rect.right, rect.bottom, item);
      }
    });

    fileTree.appendChild(li);
  }
}

// ── Selection UI update ──
function updateSelectionUI() {
  // Update .selected class on tree items
  const lis = fileTree.querySelectorAll('li');
  lis.forEach((li) => {
    const name = li.querySelector('.name')?.textContent;
    if (!name) return;
    // Find the item by matching — we need the path
    const item = sortedItems.find((it) => it.name === name);
    if (item && selectedPaths.has(item.path)) {
      li.classList.add('selected');
    } else {
      li.classList.remove('selected');
    }
  });

  const count = selectedPaths.size;
  const countEl = document.getElementById('selection-count');
  const deselectBtn = document.getElementById('action-deselect');

  if (count > 1) {
    countEl.textContent = `${count} selected`;
    countEl.classList.remove('hidden');
    deselectBtn.classList.remove('hidden');
    viewerActions.classList.remove('hidden');
  } else {
    countEl.classList.add('hidden');
    deselectBtn.classList.add('hidden');
  }
}

// ── Select file for preview ──
async function selectFile(filePath, li) {
  selectedPath = filePath;

  // Update active state
  fileTree.querySelectorAll('li').forEach((el) => el.classList.remove('active'));
  if (li) li.classList.add('active');

  // Show action bar
  viewerActions.classList.remove('hidden');

  const result = await api.readFile(filePath);
  const fileName = filePath.split('/').pop();
  const sizeStr = formatSize(result.size);

  viewerEmpty.style.display = 'none';
  viewerContent.classList.remove('hidden');

  const header = `<div class="viewer-header">
    <span class="file-name">${escapeHtml(fileName)}</span>
    <span class="file-size">${sizeStr}</span>
  </div>`;

  switch (result.type) {
    case 'text':
      viewerContent.innerHTML = `${header}<div class="text-viewer"><pre>${escapeHtml(result.data)}</pre></div>`;
      break;

    case 'image':
      viewerContent.innerHTML = `${header}<div class="image-viewer"><img src="${result.data}" alt="${escapeHtml(fileName)}" /></div>`;
      break;

    case 'video':
      viewerContent.innerHTML = `${header}<div class="media-viewer"><video controls src="file://${result.data}"></video></div>`;
      break;

    case 'audio':
      viewerContent.innerHTML = `${header}<div class="media-viewer"><audio controls src="file://${result.data}"></audio></div>`;
      break;

    case 'pdf':
      viewerContent.innerHTML = `${header}
        <div class="pdf-viewer">
          <div class="pdf-controls">
            <button id="pdf-prev">← Previous</button>
            <span id="pdf-page-info">Loading…</span>
            <button id="pdf-next">Next →</button>
          </div>
          <div id="pdf-canvas-container"></div>
        </div>`;
      await renderPdf(result.data);
      break;

    case 'markdown':
      viewerContent.innerHTML = `${header}<div class="markdown-viewer">${renderMarkdown(result.data)}</div>`;
      break;

    case 'code':
      viewerContent.innerHTML = `${header}<div class="code-viewer"><pre><code>${highlightCode(result.data, result.ext)}</code></pre></div>`;
      break;

    case 'json':
      viewerContent.innerHTML = `${header}<div class="code-viewer"><pre><code>${highlightJson(result.data)}</code></pre></div>`;
      break;

    case 'csv':
      viewerContent.innerHTML = `${header}<div class="csv-viewer">${renderCsv(result.data, result.delimiter)}</div>`;
      break;

    case 'svg':
      viewerContent.innerHTML = `${header}
        <div class="svg-viewer">${sanitizeSvg(result.data)}</div>
        <details class="svg-source">
          <summary>View source</summary>
          <div class="code-viewer"><pre><code>${highlightCode(result.data, '.xml')}</code></pre></div>
        </details>`;
      break;

    case 'font':
      viewerContent.innerHTML = `${header}${renderFont(result.data, fileName)}`;
      break;

    case 'office':
      viewerContent.innerHTML = `${header}
        <div class="office-viewer">
          <div class="office-icon">${getFileIcon(fileName)}</div>
          <p>This file type cannot be previewed inline.</p>
          <button class="btn-open-external" onclick="window.fileScope.openInDefaultApp('${escapeHtml(filePath).replace(/'/g, "\\'")}')">
            Open in Default App
          </button>
        </div>`;
      break;

    case 'binary':
      viewerContent.innerHTML = `${header}<div class="binary-viewer">Binary file (${sizeStr}) — preview not available</div>`;
      break;

    case 'error':
      viewerContent.innerHTML = `${header}<div class="binary-viewer">Error: ${escapeHtml(result.data)}</div>`;
      break;
  }
}

// ── PDF Rendering ──
async function renderPdf(base64Data) {
  try {
    const raw = atob(base64Data);
    const uint8 = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) uint8[i] = raw.charCodeAt(i);

    pdfDoc = await pdfjsLib.getDocument({ data: uint8 }).promise;
    totalPages = pdfDoc.numPages;
    currentPage = 1;

    document.getElementById('pdf-prev').addEventListener('click', () => {
      if (currentPage > 1) { currentPage--; renderPdfPage(currentPage); }
    });
    document.getElementById('pdf-next').addEventListener('click', () => {
      if (currentPage < totalPages) { currentPage++; renderPdfPage(currentPage); }
    });

    await renderPdfPage(1);
  } catch (err) {
    document.getElementById('pdf-canvas-container').innerHTML =
      `<p style="color: var(--danger);">Failed to load PDF: ${escapeHtml(err.message)}</p>`;
  }
}

async function renderPdfPage(num) {
  const page = await pdfDoc.getPage(num);
  const scale = 1.5;
  const viewport = page.getViewport({ scale });

  const container = document.getElementById('pdf-canvas-container');
  container.innerHTML = '';

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  container.appendChild(canvas);

  await page.render({ canvasContext: ctx, viewport }).promise;
  document.getElementById('pdf-page-info').textContent = `Page ${num} of ${totalPages}`;
}

// ── Markdown Rendering ──
function renderMarkdown(text) {
  if (typeof marked !== 'undefined') {
    return marked.parse(text);
  }
  return `<pre>${escapeHtml(text)}</pre>`;
}

// ── Code Highlighting ──
const extToLang = {
  '.js': 'javascript', '.jsx': 'javascript', '.ts': 'typescript', '.tsx': 'typescript',
  '.py': 'python', '.rb': 'ruby', '.go': 'go', '.rs': 'rust',
  '.c': 'c', '.h': 'c', '.cpp': 'cpp', '.hpp': 'cpp',
  '.java': 'java', '.swift': 'swift', '.sh': 'bash', '.bash': 'bash', '.zsh': 'bash',
  '.sql': 'sql', '.css': 'css', '.scss': 'css', '.less': 'css',
  '.html': 'xml', '.htm': 'xml', '.xml': 'xml', '.svg': 'xml',
  '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'yaml',
  '.json': 'json', '.jsonc': 'json',
  '.php': 'php', '.kt': 'kotlin', '.kts': 'kotlin', '.cs': 'csharp',
  '.md': 'markdown', '.mdx': 'markdown',
};

function highlightCode(text, ext) {
  if (typeof hljs !== 'undefined') {
    const lang = extToLang[ext];
    if (lang) {
      try { return hljs.highlight(text, { language: lang }).value; } catch {}
    }
    try { return hljs.highlightAuto(text).value; } catch {}
  }
  return escapeHtml(text);
}

function highlightJson(text) {
  try {
    const formatted = JSON.stringify(JSON.parse(text), null, 2);
    return highlightCode(formatted, '.json');
  } catch {
    return highlightCode(text, '.json');
  }
}

// ── CSV Rendering ──
function renderCsv(text, delimiter = ',') {
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length === 0) return '<p>Empty file</p>';

  const parseRow = (line) => {
    const cells = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
        else if (ch === '"') { inQuotes = false; }
        else { current += ch; }
      } else {
        if (ch === '"') { inQuotes = true; }
        else if (ch === delimiter) { cells.push(current); current = ''; }
        else { current += ch; }
      }
    }
    cells.push(current);
    return cells;
  };

  const header = parseRow(lines[0]);
  let html = '<table><thead><tr>';
  for (const h of header) html += `<th>${escapeHtml(h)}</th>`;
  html += '</tr></thead><tbody>';

  for (let i = 1; i < Math.min(lines.length, 1000); i++) {
    const row = parseRow(lines[i]);
    html += '<tr>';
    for (const cell of row) html += `<td>${escapeHtml(cell)}</td>`;
    html += '</tr>';
  }
  html += '</tbody></table>';
  if (lines.length > 1000) html += `<p class="csv-truncated">Showing first 1000 rows of ${lines.length}</p>`;
  return html;
}

// ── SVG Rendering ──
function sanitizeSvg(svgText) {
  return svgText
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/on\w+\s*=/gi, 'data-removed=');
}

// ── Font Rendering ──
function renderFont(dataUrl, fileName) {
  const fontName = `preview-font-${++fontCounter}`;
  const style = `@font-face { font-family: '${fontName}'; src: url('${dataUrl}'); }`;
  const sizes = [16, 24, 36, 48, 72];
  const sampleText = 'The quick brown fox jumps over the lazy dog';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';

  let html = `<style>${style}</style><div class="font-viewer">`;
  html += `<div class="font-charset"><p style="font-family:'${fontName}';font-size:18px;">${escapeHtml(chars)}</p></div>`;
  for (const s of sizes) {
    html += `<div class="font-sample">
      <span class="font-size-label">${s}px</span>
      <p style="font-family:'${fontName}';font-size:${s}px;">${escapeHtml(sampleText)}</p>
    </div>`;
  }
  html += '</div>';
  return html;
}

// ── Viewer Action Bar ──
document.getElementById('action-open').addEventListener('click', () => {
  if (selectedPaths.size > 1) {
    for (const p of selectedPaths) api.openInDefaultApp(p);
  } else if (selectedPath) {
    api.openInDefaultApp(selectedPath);
  }
});
document.getElementById('action-finder').addEventListener('click', () => {
  if (selectedPath) api.showInFinder(selectedPath);
});
document.getElementById('action-copy-path').addEventListener('click', async () => {
  if (selectedPaths.size > 1) {
    await api.copyPath([...selectedPaths].join('\n'));
    toast(`${selectedPaths.size} paths copied`, 'success');
  } else if (selectedPath) {
    await api.copyPath(selectedPath);
    toast('Path copied', 'success');
  }
});
document.getElementById('action-rename').addEventListener('click', () => {
  if (selectedPaths.size > 1) {
    toast('Rename works on single files only', 'error');
  } else if (selectedPath) {
    renameItem(selectedPath);
  }
});
document.getElementById('action-move').addEventListener('click', () => {
  if (selectedPaths.size > 1) {
    moveItems([...selectedPaths]);
  } else if (selectedPath) {
    moveItem(selectedPath);
  }
});
document.getElementById('action-delete').addEventListener('click', () => {
  if (selectedPaths.size > 1) {
    deleteItems([...selectedPaths]);
  } else if (selectedPath) {
    deleteItem(selectedPath);
  }
});
document.getElementById('action-select-all').addEventListener('click', () => {
  for (const item of sortedItems) {
    if (!item.isDirectory) selectedPaths.add(item.path);
  }
  updateSelectionUI();
});
document.getElementById('action-deselect').addEventListener('click', () => {
  selectedPaths.clear();
  updateSelectionUI();
  clearViewer();
});

// ── Delete ──
async function deleteItem(filePath) {
  const name = filePath.split('/').pop();
  const isDir = sortedItems.find((it) => it.path === filePath)?.isDirectory;
  if (isDir) {
    if (!confirm(`"${name}" is a folder. Move it and all its contents to Trash?`)) return;
    if (!confirm(`Are you sure? This will delete the entire "${name}" folder.`)) return;
  } else {
    if (!confirm(`Move "${name}" to Trash?`)) return;
  }
  const result = await api.deleteFile(filePath);
  if (result.success) {
    toast('Moved to Trash', 'success');
    if (filePath === selectedPath) clearViewer();
    await navigateTo(currentDir);
  } else {
    toast(`Delete failed: ${result.error}`, 'error');
  }
}

// ── Move ──
async function moveItem(filePath) {
  const result = await api.moveFile(filePath);
  if (result.success) {
    toast('File moved', 'success');
    if (filePath === selectedPath) clearViewer();
    await navigateTo(currentDir);
  } else if (result.error !== 'canceled') {
    toast(`Move failed: ${result.error}`, 'error');
  }
}

// ── Bulk Delete ──
async function deleteItems(paths) {
  const folders = paths.filter((p) => sortedItems.find((it) => it.path === p)?.isDirectory);
  if (folders.length > 0) {
    const folderNames = folders.map((p) => p.split('/').pop()).join(', ');
    if (!confirm(`${paths.length} items selected (includes ${folders.length} folder${folders.length > 1 ? 's' : ''}: ${folderNames}). Move all to Trash?`)) return;
    if (!confirm(`Are you sure? Folders and all their contents will be deleted.`)) return;
  } else {
    if (!confirm(`Move ${paths.length} items to Trash?`)) return;
  }
  const results = await api.deleteFiles(paths);
  const ok = results.filter((r) => r.success).length;
  const fail = results.filter((r) => !r.success).length;
  if (ok > 0) toast(`${ok} item${ok > 1 ? 's' : ''} moved to Trash`, 'success');
  if (fail > 0) toast(`${fail} item${fail > 1 ? 's' : ''} failed to delete`, 'error');
  selectedPaths.clear();
  clearViewer();
  await navigateTo(currentDir);
}

// ── Bulk Move ──
async function moveItems(paths) {
  const result = await api.moveFiles(paths);
  if (result.success) {
    const ok = result.results.filter((r) => r.success).length;
    const fail = result.results.filter((r) => !r.success).length;
    if (ok > 0) toast(`${ok} item${ok > 1 ? 's' : ''} moved`, 'success');
    if (fail > 0) toast(`${fail} item${fail > 1 ? 's' : ''} failed to move`, 'error');
    selectedPaths.clear();
    clearViewer();
    await navigateTo(currentDir);
  } else if (result.error !== 'canceled') {
    toast(`Move failed: ${result.error}`, 'error');
  }
}

// ── Rename ──
async function renameItem(filePath) {
  const oldName = filePath.split('/').pop();
  const newName = prompt('Rename to:', oldName);
  if (!newName || newName === oldName) return;
  const result = await api.renameFile(filePath, newName);
  if (result.success) {
    toast('Renamed', 'success');
    selectedPath = result.newPath;
    await navigateTo(currentDir);
    // Re-select the renamed file
    const li = [...fileTree.querySelectorAll('li')].find((el) =>
      el.querySelector('.name')?.textContent === newName
    );
    if (li) selectFile(result.newPath, li);
  } else {
    toast(`Rename failed: ${result.error}`, 'error');
  }
}

function clearViewer() {
  selectedPath = null;
  viewerContent.classList.add('hidden');
  viewerActions.classList.add('hidden');
  viewerEmpty.style.display = '';
  document.getElementById('selection-count').classList.add('hidden');
  document.getElementById('action-deselect').classList.add('hidden');
}

// ── Context menu ──
function showContextMenu(x, y, item) {
  removeContextMenu();
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  const mod = navigator.platform.includes('Mac') ? '⌘' : 'Ctrl+';
  const actions = [
    { label: 'Open in Default App', shortcut: `${mod}⇧O`, action: () => api.openInDefaultApp(item.path) },
    { label: 'Show in Finder', shortcut: `${mod}⇧F`, action: () => api.showInFinder(item.path) },
    { separator: true },
    { label: 'Rename', shortcut: `${mod}⇧R`, action: () => renameItem(item.path) },
    { label: 'Copy Path', shortcut: `${mod}⇧C`, action: async () => { await api.copyPath(item.path); toast('Path copied', 'success'); } },
    { label: 'Move to…', shortcut: `${mod}M`, action: () => moveItem(item.path) },
    { separator: true },
    { label: 'Delete', shortcut: `${mod}⌫`, action: () => deleteItem(item.path), danger: true },
  ];

  buildContextMenuItems(menu, actions);

  document.body.appendChild(menu);
  adjustMenuPosition(menu);
  setTimeout(() => {
    document.addEventListener('click', removeContextMenu, { once: true });
  }, 0);
}

function buildContextMenuItems(menu, actions) {
  for (const a of actions) {
    if (a.separator) {
      const sep = document.createElement('div');
      sep.className = 'context-separator';
      menu.appendChild(sep);
      continue;
    }
    const btn = document.createElement('button');
    if (a.danger) btn.className = 'danger';

    const labelSpan = document.createElement('span');
    labelSpan.className = 'ctx-label';
    labelSpan.textContent = a.label;
    btn.appendChild(labelSpan);

    if (a.shortcut) {
      const shortcutSpan = document.createElement('span');
      shortcutSpan.className = 'ctx-shortcut';
      shortcutSpan.textContent = a.shortcut;
      btn.appendChild(shortcutSpan);
    }

    btn.addEventListener('click', () => { removeContextMenu(); a.action(); });
    menu.appendChild(btn);
  }
}

function adjustMenuPosition(menu) {
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 8) + 'px';
  if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 8) + 'px';
}

// ── Multi-select context menu ──
function showMultiContextMenu(x, y) {
  removeContextMenu();
  const paths = [...selectedPaths];
  const count = paths.length;
  const mod = navigator.platform.includes('Mac') ? '⌘' : 'Ctrl+';
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  const actions = [
    { label: `Move ${count} items to…`, shortcut: `${mod}M`, action: () => moveItems(paths) },
    { label: `Copy ${count} paths`, shortcut: `${mod}⇧C`, action: async () => {
      await api.copyPath(paths.join('\n'));
      toast(`${count} paths copied`, 'success');
    }},
    { separator: true },
    { label: `Delete ${count} items`, shortcut: `${mod}⌫`, action: () => deleteItems(paths), danger: true },
  ];

  buildContextMenuItems(menu, actions);
  document.body.appendChild(menu);
  adjustMenuPosition(menu);
  setTimeout(() => {
    document.addEventListener('click', removeContextMenu, { once: true });
  }, 0);
}

function removeContextMenu() {
  document.querySelectorAll('.context-menu').forEach((el) => el.remove());
}

// ── Resizable sidebar ──
let isDragging = false;
divider.addEventListener('mousedown', (e) => {
  isDragging = true;
  divider.classList.add('dragging');
  document.body.style.cursor = 'col-resize';
  e.preventDefault();
});
document.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  const newWidth = Math.min(Math.max(e.clientX, 180), window.innerWidth * 0.5);
  sidebar.style.width = newWidth + 'px';
});
document.addEventListener('mouseup', () => {
  if (isDragging) {
    isDragging = false;
    divider.classList.remove('dragging');
    document.body.style.cursor = '';
  }
});

// ── Toast notifications ──
function toast(msg, type) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

// ── Helpers ──
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getFileIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  const icons = {
    js: '📜', ts: '📜', jsx: '📜', tsx: '📜',
    py: '🐍', rb: '💎', go: '🔷', rs: '🦀',
    html: '🌐', css: '🎨', scss: '🎨',
    json: '📋', yaml: '📋', yml: '📋', toml: '📋', xml: '📋',
    md: '📝', txt: '📄', log: '📄',
    png: '🖼', jpg: '🖼', jpeg: '🖼', gif: '🖼', svg: '🖼', webp: '🖼',
    mp4: '🎬', mov: '🎬', webm: '🎬',
    mp3: '🎵', wav: '🎵', flac: '🎵',
    pdf: '📕',
    zip: '📦', tar: '📦', gz: '📦',
    sh: '⚙️', zsh: '⚙️', bash: '⚙️',
    c: '⚡', h: '⚡', cpp: '⚡',
    java: '☕', swift: '🍎',
    csv: '📊', tsv: '📊',
    ttf: '🔤', otf: '🔤', woff: '🔤', woff2: '🔤',
    docx: '📘', xlsx: '📗', pptx: '📙', doc: '📘', xls: '📗',
  };
  return icons[ext] || '📄';
}

// ── Keyboard shortcuts (via Electron menu accelerators) ──
function getActivePaths() {
  if (selectedPaths.size > 0) return [...selectedPaths];
  if (selectedPath) return [selectedPath];
  return [];
}

api.onShortcut((action) => {
  const paths = getActivePaths();

  switch (action) {
    case 'delete':
      if (paths.length > 1) deleteItems(paths);
      else if (paths.length === 1) deleteItem(paths[0]);
      break;
    case 'move':
      if (paths.length > 1) moveItems(paths);
      else if (paths.length === 1) moveItem(paths[0]);
      break;
    case 'rename':
      if (paths.length === 1) renameItem(paths[0]);
      else if (paths.length > 1) toast('Rename works on single files only', 'error');
      break;
    case 'copy-path':
      if (paths.length > 0) {
        api.copyPath(paths.join('\n'));
        toast(paths.length > 1 ? `${paths.length} paths copied` : 'Path copied', 'success');
      }
      break;
    case 'open-external':
      for (const p of paths) api.openInDefaultApp(p);
      break;
    case 'show-in-finder':
      if (paths.length > 0) api.showInFinder(paths[0]);
      break;
    case 'open-folder':
      btnOpen.click();
      break;
    case 'select-all':
      for (const item of sortedItems) selectedPaths.add(item.path);
      updateSelectionUI();
      break;
    case 'deselect':
      selectedPaths.clear();
      updateSelectionUI();
      clearViewer();
      break;
  }
});

// ── Start with home directory ──
const home = await api.getHomeDir();
rootDir = home;
await navigateTo(home);
