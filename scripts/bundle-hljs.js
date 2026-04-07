// Builds a single highlight.js bundle with selected languages for browser use
const fs = require('fs');
const path = require('path');

const hljs = require(path.join(__dirname, '..', 'node_modules', 'highlight.js', 'lib', 'core'));

const languages = [
  'javascript', 'typescript', 'python', 'java', 'go', 'rust', 'c', 'cpp',
  'swift', 'css', 'xml', 'bash', 'sql', 'yaml', 'json', 'markdown',
  'ruby', 'php', 'kotlin', 'csharp',
];

for (const lang of languages) {
  const mod = require(path.join(__dirname, '..', 'node_modules', 'highlight.js', 'lib', 'languages', lang));
  hljs.registerLanguage(lang, mod);
}

// Read the core source and all language sources, wrap into an IIFE
const coreSource = fs.readFileSync(
  path.join(__dirname, '..', 'node_modules', 'highlight.js', 'lib', 'core.js'), 'utf-8'
);

let bundle = `(function(){\n`;
// Inline a minimal module system
bundle += `var module = { exports: {} };\nvar exports = module.exports;\n`;
bundle += coreSource.replace('module.exports = highlight;', '') + '\n';
bundle += `window.hljs = highlight;\n`;

for (const lang of languages) {
  const langSource = fs.readFileSync(
    path.join(__dirname, '..', 'node_modules', 'highlight.js', 'lib', 'languages', `${lang}.js`), 'utf-8'
  );
  bundle += `// --- ${lang} ---\n`;
  bundle += `(function(){\n`;
  bundle += `var module = { exports: {} };\nvar exports = module.exports;\n`;
  bundle += langSource + '\n';
  bundle += `window.hljs.registerLanguage('${lang}', module.exports);\n`;
  bundle += `})();\n`;
}

bundle += `})();\n`;

const outPath = path.join(__dirname, '..', 'renderer', 'lib', 'hljs-bundle.js');
fs.writeFileSync(outPath, bundle);
console.log(`  ✓ hljs-bundle.js (${(Buffer.byteLength(bundle) / 1024).toFixed(0)} KB)`);
