# 2026-09-11 开发日志：大纲工作台长文档共创阶段 2（写入可靠性地基）

## 项目功能

大纲工作台长文档共创底座阶段 2：把 API 写入从“indexOf 首次命中”升级为“统一定位 + 失败诊断 + 意图授权”的提案式写入地基。

## 用途

- 客户要求 AI 修改大纲时，插入点先经唯一性校验：找得到、找得准；多处命中直接拒绝，不再改错位置。
- 写入失败时模型获得失败索引、原因、候选位置与建议动作，可以只重提失败条，成功条目保持原提案。
- SKILL chain 与普通对话共享同一工具面：discuss 只读，edit/generate 才开放 `propose_edits`，且始终是提案 + 用户确认，不能直写。

## 实现内容

- `src/services/editorEditLocator.ts`：统一定位引擎，提供精确匹配、出现次数统计、多匹配拒绝（`ambiguous_target`）、模糊候选 Top-3、候选上下文、结构锚点解析。
- `src/services/editorEditService.ts`、`src/services/editorTools.ts`：`editor.locate`、`propose_edits`、批次规划全部委托同一引擎；同一文本两条路径判定一致，任何路径禁止退回首次命中。
- `src/services/editorEditDiagnostics.ts`：失败诊断返回失败条目索引、目标片段、失败原因、候选位置、建议动作；支持“只重提失败条目”，修正版仍走唯一性与版本校验。
- `src/services/editorEditProtocol.ts`：prompt 从全文硬塞改为结构地图 + 当前焦点局部全文 + 目标节点上下文 + 选区；新增 `volumeTitle/chapterTitle/sectionTitle` 结构锚点；兼容 JSON 协议保留并明示可靠性差异。
- `src/services/workspaceSkillEngine.ts`：chain 按意图/阶段授权工具；chain 第 2 步起接收前序输出 + 结构地图 + 必要局部读取，不再因加载 SKILL 失去工具能力。

## 验证证据

- `npx vitest run src/services/editorEditLocator.spec.ts src/services/editorEditService.spec.ts src/services/editorTools.spec.ts src/services/editorEditBatch.spec.ts`：4 files / 28 tests passed。
- `npm run type-check` exit 0；`npm run test:services` 20 files / 216 tests；`npm run build:vue` 通过。
- `node scripts/verify-outline-cocreation-stage2-skills.mjs` 全 PASS：discuss 请求 11 个工具、无 `editor.propose_edits`；edit 请求 12 个工具、提案结果 `pending_user_confirmation`、确认前编辑器未变。
- `node scripts/verify-outline-cocreation-stage2.mjs` 全 PASS：定位失败 -> 诊断 -> 只修失败条 -> 提案成功。
- 源 Electron 启动：`node_modules\electron\dist\electron.exe . --remote-debugging-port=9227`，未使用安装版/网页模式/开发者模式。

## 补账说明

本日志于 2026-09-11 对账补写；当时执行证据已写入方案 checklist 与源 Electron 探针，但未生成独立开发日志。补账后归档为主索引第 181b 条。
