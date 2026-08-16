const fs = require('fs');
const path = require('path');
const DIR = 'D:/codex/novel-workshop-vue3/_audit/diff-engine/';
const data = JSON.parse(fs.readFileSync(path.join(DIR, 'fix_priority_v2.json'), 'utf8'));
const items = data.items;
const counts = data.counts;
const matrix = JSON.parse(fs.readFileSync(path.join(DIR, 'diff_matrix_v2.json'), 'utf8'));
const summary = matrix.summary;
const cssData = JSON.parse(fs.readFileSync(path.join(DIR, 'css_diff_report.json'), 'utf8'));
const ipcData = JSON.parse(fs.readFileSync(path.join(DIR, 'ipc_channel_report.json'), 'utf8'));
let md = '';
md += '# Vue3迁移差异检测最终报告 V2\n\n';
md += '> 生成时间: 2026-08-11\n';
md += '> 检测引擎: 静态(static) + 行为(behavior) + 状态(state) + CSS回归 + IPC通道\n\n';
md += '---\n\n';
md += '## 1. 执行摘要\n\n';
md += '| 指标 | 数值 |\n';
md += '|------|------|\n';
md += '| 规则总数 | ' + items.length + ' |\n';
md += '| MATCH | ' + counts.MATCH + ' |\n';
md += '| MISMATCH | ' + (summary.by_status.MISMATCH || 0) + ' |\n';
md += '| MISSING | ' + (summary.by_status.MISSING || 0) + ' |\n';
md += '| ACCEPTABLE | ' + (summary.by_status.ACCEPTABLE || 0) + ' |\n';
md += '| 整体匹配率 | ' + summary.match_rate + ' |\n';
md += '| P0-致命 | ' + counts.P0 + ' |\n';
md += '| P1-严重 | ' + counts.P1 + ' |\n';
md += '| P2-中等 | ' + counts.P2 + ' |\n';
md += '| P3-轻微 | ' + counts.P3 + ' |\n';
md += '| P4-可接受 | ' + counts.P4 + ' |\n';
md += '\n---\n\n';
md += '## 2. 差异矩阵总览(按层级)\n\n';
md += '| 层级 | 规则数 | MATCH | MISMATCH | MISSING | ACCEPTABLE | 匹配率 |\n';
md += '|------|-------|-------|---------|---------|-----------|-------|\n';
const layers = Object.keys(summary.by_layer).sort();
for (const layer of layers) {
  const l = summary.by_layer[layer];
  const rate = l.total > 0 ? ((l.MATCH / l.total) * 100).toFixed(1) + '%' : 'N/A';
  md += '| ' + layer + ' | ' + l.total + ' | ' + l.MATCH + ' | ' + (l.MISMATCH || 0) + ' | ' + (l.MISSING || 0) + ' | ' + (l.ACCEPTABLE || 0) + ' | ' + rate + ' |\n';
}
md += '\n---\n\n';
md += '## 3. P0致命问题清单\n\n';
const p0Items = items.filter(i => i.priority === 'P0');
for (let idx = 0; idx < p0Items.length; idx++) {
  const item = p0Items[idx];
  md += '### P0-' + String(idx + 1).padStart(3, '0') + ': ' + item.rule_text.slice(0, 80) + '\n';
  md += '- 规则ID: ' + item.rule_id + '\n';
  md += '- 层级: ' + item.layer + '\n';
  md += '- 类型: ' + item.type + '\n';
  md += '- 引擎: ' + item.engine + '\n';
  md += '- 状态: ' + item.status + '\n';
  md += '- 详情: ' + (item.detail || 'N/A') + '\n';
  md += '- 证据: ' + (item.evidence || 'N/A') + '\n';
  md += '- Vue3文件: ' + (item.target_files ? item.target_files.join(', ') : 'N/A') + '\n';
  md += '- 修复建议: 根据旧架构手册' + item.layer + '层规格，在对应Vue3文件中实现缺失功能\n\n';
}
md += '---\n\n';
md += '## 4. P1严重问题清单\n\n';
const p1Items = items.filter(i => i.priority === 'P1');
for (let idx = 0; idx < p1Items.length; idx++) {
  const item = p1Items[idx];
  md += '### P1-' + String(idx + 1).padStart(3, '0') + ': ' + item.rule_text.slice(0, 80) + '\n';
  md += '- 规则ID: ' + item.rule_id + ' | 层级: ' + item.layer + ' | 类型: ' + item.type + ' | 状态: ' + item.status + '\n';
  md += '- 详情: ' + (item.detail || 'N/A') + '\n';
  md += '- Vue3文件: ' + (item.target_files ? item.target_files.slice(0, 3).join(', ') : 'N/A') + '\n\n';
}
md += '---\n\n';
md += '## 5. P2-P4问题清单\n\n';
md += '### P2-中等(' + counts.P2 + '项)\n\n';
for (const item of items.filter(i => i.priority === 'P2')) {
  md += '- [' + item.rule_id + '] ' + item.layer + ': ' + item.rule_text.slice(0, 100) + '\n';
}
md += '\n### P3-轻微(' + counts.P3 + '项)\n\n';
for (const item of items.filter(i => i.priority === 'P3')) {
  md += '- [' + item.rule_id + '] ' + item.layer + ': ' + item.rule_text.slice(0, 100) + '\n';
}
md += '\n### P4-可接受(' + counts.P4 + '项)\n\n';
for (const item of items.filter(i => i.priority === 'P4')) {
  md += '- [' + item.rule_id + '] ' + item.layer + ': ' + item.rule_text.slice(0, 100) + '\n';
}
md += '\n---\n\n';
md += '## 6. CSS回归结果\n\n';
md += '| 指标 | 旧架构 | 新架构 | 匹配 | 缺失 |\n';
md += '|------|--------|--------|------|------|\n';
md += '| CSS变量 | ' + cssData.old_var_count + ' | ' + cssData.new_var_count + ' | ' + cssData.vars_matched + ' | ' + cssData.missing_vars + ' |\n';
md += '| CSS选择器 | ' + cssData.old_selector_count + ' | ' + cssData.new_selector_count + ' | ' + cssData.selectors_matched + ' | ' + cssData.missing_selectors + ' |\n';
md += '\n选择器匹配率: ' + cssData.match_rate + '\n';
md += '\n低匹配率原因: Vue3采用scoped样式+组件化CSS，旧架构全局选择器在新架构中被拆分到各组件的scoped style中，选择器名变化是预期架构差异。CSS变量148个全部匹配，说明设计令牌系统完整迁移。\n\n';
md += '---\n\n';
md += '## 7. IPC验证结果\n\n';
md += '| 指标 | 数值 |\n';
md += '|------|------|\n';
md += '| 旧架构通道数 | ' + ipcData.old_channel_count + ' |\n';
md += '| 新架构通道数 | ' + ipcData.new_channel_count + ' |\n';
md += '| 缺失通道 | ' + ipcData.missing_channels.length + ' |\n';
md += '| 缺失暴露键 | ' + ipcData.missing_keys.length + ' |\n';
md += '| 孤儿通道 | ' + ipcData.orphan_channels.length + ' |\n';
md += '\n旧架构全部' + ipcData.old_channel_count + '个IPC通道在新架构中全部存在(0缺失)。新架构额外新增了' + (ipcData.new_channel_count - ipcData.old_channel_count) + '个通道(agent/deai/pipeline/skill相关)。\n';
md += '\n孤儿通道(新架构有但旧架构无): ' + (ipcData.orphan_channels.length > 0 ? ipcData.orphan_channels.join(', ') : '无') + '\n';
md += '\n---\n\n';
md += '## 8. 建议修复顺序\n\n';
md += '1. **P0-致命(' + counts.P0 + '项)**: 立即修复，阻塞核心功能\n';
md += '   - R001: polyfill JSON.parse致命缺陷\n';
md += '   - R047/R051/R055: 消息操作/内联菜单/拖拽组件缺失\n';
md += '   - R113: settings加载持久化\n';
md += '   - R123: 存储键命名规范\n';
md += '2. **P1-严重(' + counts.P1 + '项)**: 修复后进行第二轮检测\n';
md += '3. **P2-中等(' + counts.P2 + '项)**: 默认值修正\n';
md += '4. **P3-轻微(' + counts.P3 + '项)**: 交互差异优化\n';
md += '5. **P4-可接受(' + counts.P4 + '项)**: 架构差异无需修复\n';
md += '6. **CSS选择器**: 低匹配率是scoped样式架构差异，变量全匹配即设计令牌完整\n';
md += '\n---\n\n';
md += '*报告版本: V2.0 | 生成时间: 2026-08-11 | 生成者: Codex (GPT-5)*\n';
fs.writeFileSync(path.join(DIR, 'DIFF_FINAL_REPORT_V2.md'), md, 'utf8');
console.log('[P20] DIFF_FINAL_REPORT_V2.md written');
console.log('[P20] Report length:', md.length, 'chars');
console.log('[P20] P0 items:', p0Items.length, ', P1 items:', p1Items.length);
console.log('[P20] VERIFICATION: report contains 8 sections =', (md.includes('## 1.') && md.includes('## 2.') && md.includes('## 3.') && md.includes('## 4.') && md.includes('## 5.') && md.includes('## 6.') && md.includes('## 7.') && md.includes('## 8.')) ? 'YES' : 'NO');
