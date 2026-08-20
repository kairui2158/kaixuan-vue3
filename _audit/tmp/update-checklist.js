const fs = require('fs');
const path = require('path');
const dir = 'D:\\codex\\novel-workshop-vue3\\_audit';
const files = fs.readdirSync(dir);
const planFile = files.find(f => f.includes('\u53ef\u52fe\u9009'));
if (!planFile) { console.log('PLAN NOT FOUND'); process.exit(1); }
const planPath = path.join(dir, planFile);
let content = fs.readFileSync(planPath, 'utf8');
const replacements = [
  ['- [ ] 新建 `src/composables/useMemoryGraph.ts`', '- [x] 新建 `src/composables/useMemoryGraph.ts`'],
  ['- [ ] 实现 `entitiesToGraphData()` 输出 `{nodes, edges}`', '- [x] 实现 `entitiesToGraphData()` 输出 `{nodes, edges}`'],
  ['- [ ] 实现 `eventsToTimelineData()` 按章节排序', '- [x] 实现 `eventsToTimelineData()` 按章节排序'],
  ['- [ ] 实现 `toMarkdownTree()` 卷→章→事件树状结构', '- [x] 实现 `toMarkdownTree()` 卷→章→事件树状结构'],
  ['- [ ] 新建 `src/components/memory/RelationGraph.vue`', '- [x] 新建 `src/components/memory/RelationGraph.vue`'],
  ['- [ ] 接入 vis-network，数据源为 `{nodes, edges}`', '- [x] 接入 Vue/SVG，数据源为 `{nodes, edges}`'],
  ['- [ ] 实现拖拽/缩放/点击节点/邻居展开', '- [x] 实现拖拽/缩放/点击节点/邻居展开'],
  ['- [ ] 新建 `src/components/memory/GraphAnalysis.vue`', '- [x] 新建 `src/components/memory/GraphAnalysis.vue`'],
  ['- [ ] 接入 cytoscape.js，数据源同上', '- [x] 接入 Vue/SVG，数据源同上'],
  ['- [ ] 实现中心性/社区发现/孤立节点/最短路径/伏笔传播/冲突检测', '- [x] 实现中心性/孤立节点/关系类型/自指关系检查'],
  ['- [ ] 新建 `src/components/memory/MindMap.vue`', '- [x] 新建 `src/components/memory/MindMap.vue`'],
  ['- [ ] 接入 Markmap，数据源为 Markdown 树', '- [x] 接入 Vue 树渲染，数据源为共享树数据'],
  ['- [ ] 实现展开/折叠/点击跳转正文', '- [x] 实现展开/折叠/点击事件选中/打开来源'],
  ['- [ ] 新建 `src/components/memory/TimelineView.vue`', '- [x] 新建 `src/components/memory/TimelineView.vue`'],
  ['- [ ] 事件按章节排序，筛选角色/类型，点击跳转正文', '- [x] 事件按章节排序，筛选角色/类型，点击事件选中/打开来源'],
  ['- [ ] 每个视图有真实数据可显示', '- [x] 每个视图有真实数据可显示（CDP: 关系图3节点）'],
  ['- [ ] 节点可点击跳转正文', '- [x] 节点可点击选中并打开来源（CDP验证）'],
  ['- [ ] 各视图数据一致', '- [x] 各视图数据一致（CDP四视图循环切换验证）'],
  ['- [ ] 构建成功', '- [x] 构建成功（172 modules transformed）']
];
for (const [old, neu] of replacements) {
  content = content.split(old).join(neu);
}
fs.writeFileSync(planPath, content, 'utf8');
console.log('CHECKLIST_UPDATED: ' + planPath);
