(() => {
  const api = window.fileScope;

  // DOM elements
  const btnOpen = document.getElementById('btn-open-folder');
  const folderName = document.getElementById('current-folder-name');
  const breadcrumbs = document.getElementById('breadcrumbs');
  const fileTree = document.getElementById('file-tree');
  const viewerEmpty = document.getElementById('viewer-empty');
  const viewerContent = document.getElementById('viewer-content');
  const divider = document.getElementById('divider');
  const sidebar = document.getElementById('sidebar');

  let rootDir = null;
  let currentDir = null;
  let selectedPath = null;

  // ── Open folder ──
  btnOpen.addEventListener('click', async () => {
    const dir = await api.selectFolder();
    if (dir) {
      rootDir = dir;
      await navigateTo(dir);
    }
  });

  // ── Navigate to directory ──
  async function navigateTo(dirPath) {
    currentDir = dirPath;
    const items = await api.readDirectory(dirPath);
    renderBreadcrumbs(dirPath);
    renderTree(items);
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

    // Build full paths for each crumb
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

    // Back entry if we're deeper than root
    if (currentDir !== rootDir) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="icon">⬆</span><span class="name">..</span>`;
      li.addEventListener('click', () => {
        const parent = currentDir.split('/').slice(0, -1).join('/') || '/';
        navigateTo(parent);
      });
      fileTree.appendChild(li);
    }

    for (const item of items) {
      const li = document.createElement('li');
      if (item.path === selectedPath) li.classList.add('active');

      const icon = item.isDirectory ? '📁' : getFileIcon(item.name);
      li.innerHTML = `
        <span class="icon">${icon}</span>
        <span class="name">${escapeHtml(item.name)}</span>
        <span class="actions">
          <button class="btn-move" title="Move">↗</button>
          <button class="btn-delete" title="Delete">✕</button>
        </span>
      `;

      // Click to open
      li.addEventListener('click', (e) => {
        if (e.target.closest('.actions')) return;
        if (item.isDirectory) {
          navigateTo(item.path);
        } else {
          selectFile(item.path, li);
        }
      });

      // Right-click context menu
      li.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY, item);
      });

      // Action buttons
      li.querySelector('.btn-move').addEventListener('click', () => moveItem(item.path));
      li.querySelector('.btn-delete').addEventListener('click', () => deleteItem(item.path));

      fileTree.appendChild(li);
    }
  }

  // ── Select file for preview ──
  async function selectFile(filePath, li) {
    selectedPath = filePath;

    // Update active state
    fileTree.querySelectorAll('li').forEach((el) => el.classList.remove('active'));
    if (li) li.classList.add('active');

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
        viewerContent.innerHTML = `${header}<div class="pdf-viewer"><object data="${result.data}" type="application/pdf" width="100%" height="100%"><p>Cannot display PDF</p></object></div>`;
        break;
      case 'binary':
        viewerContent.innerHTML = `${header}<div class="binary-viewer">Binary file (${sizeStr}) — preview not available</div>`;
        break;
      case 'error':
        viewerContent.innerHTML = `${header}<div class="binary-viewer">Error: ${escapeHtml(result.data)}</div>`;
        break;
    }
  }

  // ── Delete ──
  async function deleteItem(filePath) {
    const name = filePath.split('/').pop();
    if (!confirm(`Move "${name}" to Trash?`)) return;
    const result = await api.deleteFile(filePath);
    if (result.success) {
      toast('Moved to Trash', 'success');
      if (filePath === selectedPath) {
        selectedPath = null;
        viewerContent.classList.add('hidden');
        viewerEmpty.style.display = '';
      }
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
      if (filePath === selectedPath) {
        selectedPath = null;
        viewerContent.classList.add('hidden');
        viewerEmpty.style.display = '';
      }
      await navigateTo(currentDir);
    } else if (result.error !== 'canceled') {
      toast(`Move failed: ${result.error}`, 'error');
    }
  }

  // ── Context menu ──
  function showContextMenu(x, y, item) {
    removeContextMenu();
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';

    const moveBtn = document.createElement('button');
    moveBtn.textContent = '↗ Move to…';
    moveBtn.addEventListener('click', () => { removeContextMenu(); moveItem(item.path); });

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '✕ Delete';
    deleteBtn.className = 'danger';
    deleteBtn.addEventListener('click', () => { removeContextMenu(); deleteItem(item.path); });

    menu.appendChild(moveBtn);
    menu.appendChild(deleteBtn);
    document.body.appendChild(menu);

    // Adjust if off-screen
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 8) + 'px';
    if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 8) + 'px';

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
    };
    return icons[ext] || '📄';
  }

  // ── Start with home directory ──
  (async () => {
    const home = await api.getHomeDir();
    rootDir = home;
    await navigateTo(home);
  })();
})();
