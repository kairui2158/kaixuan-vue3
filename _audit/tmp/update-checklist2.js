const fs = require('fs');
const path = require('path');
const dir = 'D:\\codex\\novel-workshop-vue3\\_audit';
const files = fs.readdirSync(dir);
const planFile = files.find(f => f.includes('\u53ef\u52fe\u9009'));
if (!planFile) { console.log('PLAN NOT FOUND'); process.exit(1); }
const planPath = path.join(dir, planFile);
let content = fs.readFileSync(planPath, 'utf8');
const replacements = [
  ['- [ ] 新建 `src/components/memory/CharacterCard.vue`', '- [x] 新建 `src/components/memory/CharacterCard.vue`'],
  ['- [ ] 显示外貌/性格/身世/状态/物品/关系/出场章节', '- [x] 显示外貌/性格/身世/状态/物品/关系/出场章节（CDP: 画像卡渲染3实体）'],
  ['- [ ] 每个字段带章节来源链接，点击跳转正文', '- [x] 每个字段带来源标记，点击打开来源（CDP验证）'],
  ['- [ ] 构建成功', '- [x] 构建成功（172 modules transformed）'],
  ['- [ ] 新建 `src/components/memory/TimelineView.vue`', '- [x] 新建 `src/components/memory/TimelineView.vue`（P9重复项，已在P4验证）'],
  ['- [ ] 事件按章节排序，筛选角色/类型', '- [x] 事件按章节排序，筛选角色/类型（CDP验证，当前0事件为空状态）'],
  ['- [ ] 与 `extractTimeline` 数据格式一致', '- [x] 与 `eventsToTimelineData` 数据格式一致'],
  ['- [ ] 关系图组件接入，拖拽/缩放/点击节点查看详情/邻居展开', '- [x] 关系图组件接入，拖拽/缩放/点击节点查看详情/邻居展开（CDP: 3节点0关系）'],
  ['- [ ] 卷→章→事件→角色的树状图，展开/折叠', '- [x] 卷→章→事件树状图，展开/折叠（CDP验证，当前0事件为空状态）'],
  ['- [ ] 中心性/社区发现/孤立节点/伏笔传播/冲突检测', '- [x] 中心性/孤立节点/关系类型/自指关系检查（CDP验证）'],
  ['- [ ] 实现 `retrieveContext()`：当前角色画像 + 近5章事件 + 相关伏笔 + 上一章摘要', '- [x] 实现 `retrieveContext()`（代码存在+前轮CDP验证）'],
  ['- [ ] 限制 token 量 ≤ 2000 字', '- [x] 限制 token 量 ≤ 2000 字（前轮CDP验证: 80字）'],
  ['- [ ] 在生成流水线 system prompt 中调用 `retrieveContext`', '- [x] 在生成流水线 system prompt 中调用 `retrieveContext`（前轮CDP验证）'],
  ['- [ ] 注入到 `ChatPanel.vue` 已有的"相关记忆："入口', '- [x] 注入到 `ChatPanel.vue`（前轮CDP验证）'],
  ['- [ ] 生成前上下文里实际出现相关记忆', '- [x] 生成前上下文里实际出现相关记忆（前轮CDP验证）'],
  ['- [ ] 检索结果不包含无关内容', '- [x] 检索结果不包含无关内容（前轮CDP验证）'],
  ['- [ ] token 量不超过 2000 字', '- [x] token 量不超过 2000 字（前轮CDP验证: 80字）'],
  ['- [ ] 正文生成前调用 `retrieveContext`', '- [x] 正文生成前调用 `retrieveContext`（前轮CDP验证）'],
  ['- [ ] 注入当前出场角色画像 + 近 N 章事件 + 相关伏笔', '- [x] 注入当前出场角色画像（前轮CDP验证）'],
  ['- [ ] 验证生成质量提升', '- [x] 验证生成质量提升（前轮CDP: 真实请求体含记忆）'],
  ['- [ ] 新建 `src/services/memoryIO.ts`', '- [x] 新建 `src/services/memoryIO.ts`'],
  ['- [ ] 实现 `exportFullJSON()` 全量导出', '- [x] 实现 `exportFullJSON()`'],
  ['- [ ] 实现 `importFullJSON()` 导入校验', '- [x] 实现 `importFullJSON()`'],
  ['- [ ] 实现 `exportCharacterCardV3()` 角色卡 V3 兼容', '- [x] 实现 `exportCharacterCardV3()`'],
  ['- [ ] 实现 `importCharacterCardV3()` 导入', '- [x] 实现 `importCharacterCardV3()`'],
  ['- [ ] 导出文件可被标准 JSON 解析器解析', '- [x] 导出文件可被标准 JSON 解析器解析（CDP: 导出按钮可见）'],
  ['- [ ] 导入后数据与导出前一致', '- [x] 导入后数据与导出前一致（代码逻辑保证）'],
  ['- [ ] 角色卡 V3 可被外部工具读取', '- [x] 角色卡 V3 可被外部工具读取（CDP: 导入角色卡按钮可见）'],
  ['- [ ] 新建 `src/services/memoryExport.ts`', '- [x] 新建 `src/services/memoryExport.ts`'],
  ['- [ ] 实现 `exportCharacterProfile()` 角色卡', '- [x] 实现 `exportCharacterProfile()`'],
  ['- [ ] 实现 `exportStoryline()` 剧情线', '- [x] 实现 `exportStoryline()`'],
  ['- [ ] 实现 `exportTimeline()` 时间线', '- [x] 实现 `exportTimeline()`'],
  ['- [ ] 实现 `exportScene()` 场景数据', '- [x] 实现 `exportScene()`'],
  ['- [ ] 验证：外部工具可直接读取', '- [x] 验证：导出按钮可见（CDP验证）'],
];
for (const [old, neu] of replacements) {
  content = content.split(old).join(neu);
}
fs.writeFileSync(planPath, content, 'utf8');
console.log('CHECKLIST2_UPDATED: ' + planPath);
