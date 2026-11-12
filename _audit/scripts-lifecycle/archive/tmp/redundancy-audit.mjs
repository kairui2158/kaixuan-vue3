import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const srcDir = path.join(root, 'src');
const exts = new Set(['.vue', '.ts', '.js', '.mts', '.cts']);
const files = [];

function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) walk(full);
    else if (exts.has(path.extname(item.name))) files.push(full);
  }
}

walk(srcDir);

const importGraph = new Map();
const importPattern = /(?:import|export)\s+(?:[\s\S]*?\sfrom\s*)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g;

function resolveTarget(fromFile, specifier) {
  if (!specifier.startsWith('.') && !specifier.startsWith('@/')) return null;
  const base = specifier.startsWith('@/')
    ? path.join(srcDir, specifier.slice(2))
    : path.resolve(path.dirname(fromFile), specifier);
  const candidates = [base];
  for (const ext of exts) candidates.push(base + ext);
  candidates.push(path.join(base, 'index.ts'), path.join(base, 'index.js'), path.join(base, 'index.vue'));
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || null;
}

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const targets = new Set();
  for (const match of text.matchAll(importPattern)) {
    const specifier = match[1] || match[2] || match[3];
    const resolved = specifier ? resolveTarget(file, specifier) : null;
    if (resolved) targets.add(resolved);
  }
  importGraph.set(file, targets);
}

const imported = new Set();
const productionImported = new Set();
const testImported = new Set();

for (const [file, targets] of importGraph) {
  const isTest = /(^|[\\/])[^\\/]+\.(spec|test)\.(ts|js)$/.test(file);
  for (const target of targets) {
    imported.add(target);
    if (isTest) testImported.add(target);
    else productionImported.add(target);
  }
}

function rel(file) {
  return path.relative(root, file).replaceAll('\\', '/');
}

function size(file) {
  return fs.statSync(path.join(root, file)).size;
}

function summarize(list, prefix) {
  return list.filter((file) => file.startsWith(prefix)).sort().map((file) => `${file} (${size(file)} bytes)`);
}

const unused = files.filter((file) => !imported.has(file) && !/(spec|test)\.(ts|js)$/.test(file)).map(rel);
const testOnly = files.filter((file) => imported.has(file) && !productionImported.has(file) && testImported.has(file) && !/(spec|test)\.(ts|js)$/.test(file)).map(rel);

console.log(JSON.stringify({
  totalFiles: files.length,
  unusedComponents: summarize(unused, 'src/components/'),
  unusedServices: summarize(unused, 'src/services/'),
  unusedStores: summarize(unused, 'src/stores/'),
  testOnlyComponents: summarize(testOnly, 'src/components/'),
  testOnlyServices: summarize(testOnly, 'src/services/'),
  testOnlyStores: summarize(testOnly, 'src/stores/'),
}, null, 2));
