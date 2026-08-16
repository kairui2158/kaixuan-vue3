const fs = require('fs');
const path = require('path');
const OUT = 'D:/codex/novel-workshop-vue3/_audit/diff-engine';
const OLD_PRELOAD = 'C:/Users/凯瑞/Documents/New project 2/preload.js';
const NEW_PRELOAD = 'D:/codex/novel-workshop-vue3/electron/preload.js';
const NEW_MAIN = 'D:/codex/novel-workshop-vue3/electron/main.js';

const oldPreload = fs.existsSync(OLD_PRELOAD) ? fs.readFileSync(OLD_PRELOAD, 'utf8') : '';
const newPreload = fs.readFileSync(NEW_PRELOAD, 'utf8');
const newMain = fs.readFileSync(NEW_MAIN, 'utf8');

function extractIpcChannels(preloadSrc) {
  const channels = new Set();
  const patterns = [
    /ipcRenderer\.sendSync\(['"]([^'"]+)['"]/g,
    /ipcRenderer\.send\(['"]([^'"]+)['"]/g,
    /ipcRenderer\.invoke\(['"]([^'"]+)['"]/g,
    /ipcRenderer\.on\(['"]([^'"]+)['"]/g
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(preloadSrc)) !== null) channels.add(m[1]);
  }
  return channels;
}

function extractExposedKeys(preloadSrc) {
  const keys = new Set();
  const re = /(\w+)\s*:\s*function/g;
  let m;
  while ((m = re.exec(preloadSrc)) !== null) keys.add(m[1]);
  return keys;
}

const oldChannels = extractIpcChannels(oldPreload);
const newChannels = extractIpcChannels(newPreload);
const oldKeys = extractExposedKeys(oldPreload);
const newKeys = extractExposedKeys(newPreload);

const missingChannels = [...oldChannels].filter(c => !newChannels.has(c));
const missingKeys = [...oldKeys].filter(k => !newKeys.has(k));

const ipcDir = 'D:/codex/novel-workshop-vue3/electron/ipc';
const ipcFiles = fs.existsSync(ipcDir) ? fs.readdirSync(ipcDir).filter(f => f.endsWith('.js')) : [];
let ipcHandlerChannels = new Set();
for (const f of ipcFiles) {
  const src = fs.readFileSync(path.join(ipcDir, f), 'utf8');
  const patterns = [
    /ipcMain\.handle\(['"]([^'"]+)['"]/g,
    /ipcMain\.on\(['"]([^'"]+)['"]/g
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(src)) !== null) ipcHandlerChannels.add(m[1]);
  }
}

const newMainChannels = new Set();
const mainPatterns = [
  /ipcMain\.handle\(['"]([^'"]+)['"]/g,
  /ipcMain\.on\(['"]([^'"]+)['"]/g
];
for (const re of mainPatterns) {
  let m;
  while ((m = re.exec(newMain)) !== null) newMainChannels.add(m[1]);
}

const allNewHandlers = new Set([...ipcHandlerChannels, ...newMainChannels]);
const orphanChannels = [...newChannels].filter(c => !allNewHandlers.has(c));

const report = {
  old_channel_count: oldChannels.size,
  new_channel_count: newChannels.size,
  old_exposed_keys: [...oldKeys].sort(),
  new_exposed_keys: [...newKeys].sort(),
  missing_channels: missingChannels,
  missing_keys: missingKeys.filter(k => !k.match(/^(platform|version)$/)),
  ipc_files: ipcFiles,
  ipc_handler_channels: [...allNewHandlers].sort(),
  orphan_channels: orphanChannels,
  old_preload_exists: oldPreload.length > 0
};

fs.writeFileSync(path.join(OUT, 'ipc_channel_report.json'), JSON.stringify(report, null, 2));

let md = '# IPC Channel Verification Report (P17)\n\n';
md += '## Summary\n\n';
md += '| Metric | Old | New |\n';
md += '|--------|-----|-----|\n';
md += '| IPC Channels | ' + oldChannels.size + ' | ' + newChannels.size + ' |\n';
md += '| Exposed Keys | ' + oldKeys.size + ' | ' + newKeys.size + ' |\n';
md += '| IPC Handler Files | - | ' + ipcFiles.length + ' |\n';
md += '| Handler Channels | - | ' + allNewHandlers.size + ' |\n\n';

if (missingChannels.length > 0) {
  md += '## Missing Channels (' + missingChannels.length + ')\n\n';
  for (const c of missingChannels) md += '- ' + c + '\n';
  md += '\n';
}

if (orphanChannels.length > 0) {
  md += '## Orphan Channels (in preload but no handler) (' + orphanChannels.length + ')\n\n';
  for (const c of orphanChannels) md += '- ' + c + '\n';
  md += '\n';
}

md += '## Old Architecture Exposed Keys\n\n';
for (const k of [...oldKeys].sort()) md += '- ' + k + '\n';
md += '\n## New Architecture Exposed Keys\n\n';
for (const k of [...newKeys].sort()) md += '- ' + k + '\n';
md += '\n## IPC Handler Channels\n\n';
for (const c of [...allNewHandlers].sort()) md += '- ' + c + '\n';

fs.writeFileSync(path.join(OUT, 'ipc_channel_report.md'), md);
console.log('IPC verification done:', JSON.stringify({ old_ch: oldChannels.size, new_ch: newChannels.size, missing: missingChannels.length, orphans: orphanChannels.length }));
