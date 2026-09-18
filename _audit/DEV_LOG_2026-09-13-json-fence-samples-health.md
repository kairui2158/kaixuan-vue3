# 2026-09-13 JSON 围栏清洗与 samples.txt 健康边界

## 背景

卷纲 SKILL 层反馈两项独立后续项：模型输出 JSON 需要先剥 markdown 围栏再解析；`samples.txt` 若放置完整成品示例，会诱导模型复制示例内容。上一轮执行到统一解析服务与四处调用点迁移后中断，本次补齐剩余闭环。

## 修复内容

1. 新增 `src/services/jsonExtraction.ts`：
   - `extractJsonCandidates()` 使用平衡括号扫描，跳过 JSON 字符串内的括号，支持围栏 JSON 与多个 JSON 块。
   - 提供 `extractJsonObject()`、`extractJsonArray()`、`extractJsonValue()`、`repairJsonText()`、`dedupeJsonCandidates()`。
2. 迁移全部调用点：
   - `PipelinePanel.vue`：删除本地数组/对象提取函数，风格分析残留的 `text.match(/\{[\s\S]*\}/)` 一并改为 `extractJsonObject()`。
   - `OutlineWorkspace.vue`：设定拆解与伏笔提取改用统一数组提取。
   - `useAiTools.ts`：`repairJson()` 包装 `repairJsonText()`。
   - `memoryExtractor.ts`：`parseJson()` 改用 `extractJsonObject()`，删除候选拼接逻辑。
3. 新增 `skillHealth.inspectSkillSamples()`：
   - 样本超过 8 行、单行超过 400 字符、以 `[`/`{` 开头且无 `{{占位符}}` 的结构化行，触发 warning。
   - 只警告，不影响 `healthy`，不修改第三方 folder SKILL 文件夹。
4. 文档与帮助同步：
   - `_audit/FOLDER_SKILL_SPEC_V1.md` 增加 `samples.txt` 内容边界：只放风格参考或占位符结构，禁止完整成品。
   - `HelpGuide.vue` 用大白话说明同一规则。
5. `package.json` 的 `test:services` 纳入 `jsonExtraction.spec.ts`。

## 验证

- `npx vitest run src/services/jsonExtraction.spec.ts src/services/skillHealth.spec.ts src/services/memoryExtractor.spec.ts`：3 文件 / 17 测试通过。
- `npm run test:services`：15 文件 / 198 测试通过。
- `npm run type-check`：通过。迁移后曾出现 `unknown[]` 与旧 `any[]` 调用点类型不匹配，已在调用点显式声明类型，未放宽服务返回类型。
- `npx vitest run`：61 文件 / 495 测试通过。
- `npm run build:vue`：主构建与 protocols 构建成功。
- `rg "match\(/\\\[\\\[|match\(/\\\{" src --glob "*.ts" --glob "*.vue"`：无残留。

## 经验回写

- 经验文件 v4 `§8 AI 服务纪律` 新增第 57 条：JSON 提取统一走平衡括号解析，禁止组件内贪婪正则，公共契约改动必须追调用方并纳入测试清单。
- 同章节新增第 58 条：`samples.txt` 是风格参考不是输出范例，健康检查只警告不修改第三方文件夹。
