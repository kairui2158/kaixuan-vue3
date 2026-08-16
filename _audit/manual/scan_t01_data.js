const fs = require('fs');

const files = [
  'C:/Users/凯瑞/Documents/New project 2/renderer_v2.js',
  'C:/Users/凯瑞/Documents/New project 2/panels.js',
  'C:/Users/凯瑞/Documents/New project 2/js/storage.js',
  'C:/Users/凯瑞/Documents/New project 2/js/project-manager.js',
  'C:/Users/凯瑞/Documents/New project 2/js/chapter-manager.js',
  'C:/Users/凯瑞/Documents/New project 2/js/skill-manager.js',
  'C:/Users/凯瑞/Documents/New project 2/js/agent-manager.js',
  'C:/Users/凯瑞/Documents/New project 2/js/provider-manager.js',
  'C:/Users/凯瑞/Documents/New project 2/js/skill-engine.js',
  'C:/Users/凯瑞/Documents/New project 2/js/de-ai.js',
  'C:/Users/凯瑞/Documents/New project 2/js/diag.js',
  'C:/Users/凯瑞/Documents/New project 2/js/utils.js',
  'C:/Users/凯瑞/Documents/New project 2/js/pipeline-manager.js'
];

const storageKeys = {};
const globals = {};

files.forEach(file => {
  if (!fs.existsSync(file)) return;
  const code = fs.readFileSync(file, 'utf8');
  const lines = code.split(/\r?\n/);
  const fname = file.split(/[\\/]/).pop();
  lines.forEach((ln, i) => {
    let m = ln.match(/StorageManager\.get\(['"]([^'"]+)['"]\)/);
    if (m) {
      if (!storageKeys[m[1]]) storageKeys[m[1]] = { reads: [], writes: [] };
      storageKeys[m[1]].reads.push(fname + ':' + (i + 1));
    }
    m = ln.match(/StorageManager\.set\(['"]([^'"]+)['"]\s*,/);
    if (m) {
      if (!storageKeys[m[1]]) storageKeys[m[1]] = { reads: [], writes: [] };
      storageKeys[m[1]].writes.push(fname + ':' + (i + 1));
    }
    m = ln.match(/StorageManager\.remove\(['"]([^'"]+)['"]\)/);
    if (m) {
      if (!storageKeys[m[1]]) storageKeys[m[1]] = { reads: [], writes: [] };
      storageKeys[m[1]].writes.push(fname + ':' + (i + 1) + ' (remove)');
    }
  });
});

['renderer_v2.js', 'panels.js'].forEach(fname => {
  const file = 'C:/Users/凯瑞/Documents/New project 2/' + fname;
  if (!fs.existsSync(file)) return;
  const code = fs.readFileSync(file, 'utf8');
  const lines = code.split(/\r?\n/);
  lines.forEach((ln, i) => {
    let m = ln.match(/this\.([a-zA-Z_][a-zA-Z0-9_]*)\s*=/);
    if (m && !['style','className','innerHTML','value','textContent','disabled','checked','scrollTop','scrollLeft','selectionStart','selectionEnd','files','dataset','classList','width','height'].includes(m[1])) {
      if (!globals[m[1]]) globals[m[1]] = [];
      globals[m[1]].push(fname + ':' + (i + 1));
    }
    m = ln.match(/window\.([a-zA-Z_][a-zA-Z0-9_]*)\s*=/);
    if (m && !['electronAPI','app','DiagLogger','StorageManager','marked','Notyf','hotkeys'].includes(m[1])) {
      const name = 'window.' + m[1];
      if (!globals[name]) globals[name] = [];
      globals[name].push(fname + ':' + (i + 1));
    }
  });
});

const SRC = 'C:/Users/凯瑞/Documents/New project 2/renderer_v2.js';
const code2 = fs.readFileSync(SRC, 'utf8');
const lines2 = code2.split(/\r?\n/);
const dataStructures = [];
lines2.forEach((ln, i) => {
  let m = ln.match(/(?:proj|project|vol|volume|ch|chapter|skill|agent|provider|cfg|settings|_pd|_plData|_deAiConfig)\.([a-zA-Z_][a-zA-Z0-9_]*)\s*=/);
  if (m) {
    dataStructures.push({ line: i + 1, field: m[1], context: ln.trim().substring(0, 100) });
  }
});

let md = '# T01 - 数据层\n\n';
md += '> 扫描源: renderer_v2.js + panels.js + js/*.js\n\n';

md += '## StorageManager 封装机制\n\n';
md += '- 封装层 (js/storage.js), 所有key加前缀 wa_\n';
md += '- Electron环境: window.electronAPI.storageRead/Write (IPC同步)\n';
md += '- 浏览器环境: localStorage.getItem/setItem\n';
md += '- 自动迁移: localStorage -> IPC (首次启动)\n';
md += '- get: 返回JSON.parse结果, 失败返回原始字符串\n';
md += '- set: JSON.stringify后存储\n\n';

md += '## 1. 持久化数据键值表\n\n';
md += '| Key | 读取位置 | 写入位置 |\n';
md += '|-----|---------|---------|\n';
Object.keys(storageKeys).sort().forEach(k => {
  md += '| `' + k + '` | ' + (storageKeys[k].reads.join(', ') || '-') + ' | ' + (storageKeys[k].writes.join(', ') || '-') + ' |\n';
});
md += '\n**共 ' + Object.keys(storageKeys).length + ' 个持久化键**\n\n';

md += '## 2. 全局变量 (this.xxx / window.xxx)\n\n';
md += '| 变量名 | 赋值位置 |\n';
md += '|--------|---------|\n';
Object.keys(globals).sort().forEach(g => {
  md += '| `' + g + '` | ' + globals[g].join(', ') + ' |\n';
});
md += '\n**共 ' + Object.keys(globals).length + ' 个全局变量**\n\n';

md += '## 3. 数据对象字段赋值\n\n';
md += '| 行号 | 字段 | 上下文 |\n';
md += '|------|------|--------|\n';
dataStructures.forEach(d => {
  md += '| ' + d.line + ' | ' + d.field + ' | `' + d.context.replace(/\|/g, '\\|') + '` |\n';
});
md += '\n**共 ' + dataStructures.length + ' 个字段赋值点**\n\n';

md += '## 4. 数据实体推断\n\n';
md += '| 实体 | 持久化键 | 说明 |\n';
md += '|------|---------|------|\n';
md += '| 应用设置 | `app-settings` | API配置(key加密), 模型, baseUrl |\n';
md += '| 去AI配置 | `app-deai-config` | 模式, 技能, Agent, 硬规则 |\n';
md += '| 主题 | `app-theme` | dark/light |\n';
md += '| 上次会话 | `lastSession` | pid, vid, cid, ts |\n';
md += '| 项目数据 | `project-{id}` | 每项目独立存储 |\n';
md += '| GitHub Token | `githubToken` | 插件市场认证 |\n\n';

md += '## 5. 数据生命周期\n\n';
md += '| 数据 | 创建时机 | 更新时机 | 删除时机 |\n';
md += '|------|---------|---------|---------|\n';
md += '| app-settings | 首次配置API | 保存设置 | 不删除 |\n';
md += '| app-deai-config | 首次配置去AI | 保存去AI设置 | 不删除 |\n';
md += '| project-{id} | 新建项目 | 编辑/生成时自动保存 | 删除项目 |\n';
md += '| lastSession | 启动后首次操作 | 关闭前(onFinalSave) | 不删除 |\n';
md += '| app-theme | 首次切换主题 | 用户切换 | 不删除 |\n';
md += '| githubToken | 用户输入 | 用户更新 | 不删除 |\n';

fs.writeFileSync('D:/codex/novel-workshop-vue3/_audit/manual/T01_数据层.md', md, 'utf8');
console.log('T01: ' + Object.keys(storageKeys).length + ' storage keys, ' + Object.keys(globals).length + ' globals, ' + dataStructures.length + ' fields');
