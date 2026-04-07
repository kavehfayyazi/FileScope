const fs = require('fs');
const path = require('path');

const libDir = path.join(__dirname, '..', 'renderer', 'lib');
fs.mkdirSync(libDir, { recursive: true });

const copies = [
  // PDF.js (legacy build for broader compat)
  ['node_modules/pdfjs-dist/legacy/build/pdf.min.mjs', 'renderer/lib/pdf.min.mjs'],
  ['node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs', 'renderer/lib/pdf.worker.min.mjs'],
  // Marked
  ['node_modules/marked/lib/marked.umd.js', 'renderer/lib/marked.umd.js'],
  // Highlight.js
  ['node_modules/highlight.js/lib/core.js', 'renderer/lib/highlight.core.js'],
  ['node_modules/highlight.js/styles/github-dark.min.css', 'renderer/lib/github-dark.min.css'],
];

// Highlight.js languages to include
const languages = [
  'javascript', 'typescript', 'python', 'java', 'go', 'rust', 'c', 'cpp',
  'swift', 'css', 'xml', 'bash', 'sql', 'yaml', 'json', 'markdown',
  'ruby', 'php', 'kotlin', 'csharp',
];

const root = path.join(__dirname, '..');

for (const [src, dest] of copies) {
  const srcPath = path.join(root, src);
  const destPath = path.join(root, dest);
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`  ✓ ${dest}`);
  } else {
    console.warn(`  ✗ Missing: ${src}`);
  }
}

// Copy highlight.js language files
const langDir = path.join(libDir, 'languages');
fs.mkdirSync(langDir, { recursive: true });

for (const lang of languages) {
  const src = path.join(root, 'node_modules', 'highlight.js', 'lib', 'languages', `${lang}.js`);
  const dest = path.join(langDir, `${lang}.js`);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`  ✓ languages/${lang}.js`);
  } else {
    console.warn(`  ✗ Missing language: ${lang}`);
  }
}

console.log('Vendor files copied.');
