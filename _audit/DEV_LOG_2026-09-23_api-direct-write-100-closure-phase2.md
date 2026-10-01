# DEV LOG 2026-09-23 - API 直写 100% 闭环 Phase 2（文档地图与分段读取）

## 目标

执行 `PROPOSAL_2026-09-23_API_DIRECT_WRITE_100_CLOSURE_FINAL.md` Phase 2：补齐编辑器长文档的结构化地图、cursor 分段读取、搜索分页与所在节定位，让 API 直写具备“先地图、后分段”的 1M 级读取底座。

本阶段不设 token 预算；验收前不升版本、不封装。

## 范围与实现

1. 新增 `src/services/editorDocumentMap.ts`：
   - `buildEditorDocumentMap()`：总字符、估算 token、节列表、节范围、节摘要头、降级标记；无结构文档降级为段落节点。
   - `editor.document_map`：节分页（limit 1-500），返回 `nextOffset / hasMore / next_steps`。
   - `editor.read_range`：`sectionId` 或 `cursor:section:{sectionId}:{offset}` 二选一；默认/最大 12000 字符；`maxReadChars` 可按模型窗口下调；硬上限小于 1000 时返回结构化 `range_too_large`。
   - `enhanceEditorSearchWithDocumentMap()`：搜索返回命中位置、局部上下文、所在节、总数、`offset/limit` 分页。
2. `src/services/editorTools.ts`：`createEditorTools` 接入新工具与 `maxReadChars`；`editor.search` 增加分页参数，单页上限 50。
3. `src/services/dialogueToolSurface.ts`：`DialogueToolSurfaceEntry` 新增 `maxReadChars`，单源传入编辑器工具。
4. `src/components/chat/ChatPanel.vue`、`src/components/common/OutlineWorkspace.vue`：按供应商窗口 / 模型窗口计算单页读取上限（约 2%，最低 12000 字符），主页与大纲两侧统一接线。
5. `src/services/aiService.spec.ts`：修复一条对“可用同类工具提示”的精确字符串断言；该提示现在会列出新增的 `editor.document_map / editor.read_range`，断言改为按包含校验，不改变行为。
6. `_audit/SKILL_HANDOFF_API_DIRECT_WRITE_TOOLS.md`：同步 `editor.document_map`、`editor.read_range`、搜索分页字段与长文档读取规则。

## 关键语义

- `cursor` 的 offset 相对节起点，节内容包含标题行本身；测试断言必须按 `section.start + offset` 对齐。
- 分段读取不是成本削减开关，而是 1M 长文档的可用性底座：应用仍按模型窗口给出较大的单页上限，超窗请求会得到结构化错误，不会被静默截断。

## 验证证据

- `npm run test:services -- src/services/editorDocumentMap.spec.ts src/services/editorTools.spec.ts` → 2 files / 35 tests passed。
- `npm run test:services -- src/services/aiService.spec.ts src/services/editorDocumentMap.spec.ts src/services/editorTools.spec.ts` → 3 files / 144 tests passed。
- `npm run type-check` → exit 0。
- `npm run test:services` → 88 files / 882 tests passed。

覆盖用例：空文档、无结构降级、嵌套标题、重复标题、超大节、分页边界、cursor 连续翻页、非法 cursor、缺失 sectionId、cursor 与 sectionId 同时传、超限 maxChars、预算下调、一次性全文拒绝、搜索分页与所在节定位。

## 回头看

- 生产接线：服务定义、editorTools 聚合、dialogueToolSurface 单源入口、主页/大纲两个调用点均接通；工具面自动透传，无需在每个组件复制工具清单。
- 新旧并存：`outline.get_structure/read_range` 保留为大纲专用结构工具；新增 `editor.document_map/read_range` 为通用编辑器读取工具，无互相替代残留。旧全文注入路径扫描未发现新增矛盾；既有摘要注入不冲突。
- trace 覆盖：新工具经由既有 ToolGateway 与 tool-call trace 记录，`actualToolSurface` 会自动包含新读工具；run trace 存储无需新增字段。
- 验证器口径：`scripts/verify-api-direct-write-electron.mjs` 的断言只按工具名检查写面，读工具新增不破坏现有白名单；Phase 7 三档实测时再补 100K / 1M 场景断言。
- 影响圈：未修改意图路由阈值、EditTask 状态机、供应商协议、写入协议与版本号。

## 遗留

- 1M 合成文档的地图生成时间与内存基准属 Phase 7 三档 Electron 实测。
- SKILL 协议文档版本口径已更新为 3.60.x；版本号仍按方案在 Phase 8 统一升级。
- 下一步进入 Phase 3：EditTask 自动升级与分批执行。
