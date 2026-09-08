# Folder SKILL 正文链路修复日志（2026-09-07）

## 任务目标

修复真 SKILL 双方案融合后，folder SKILL 在生成流水线正文层的执行缺口：DEAI 注入、compose 模板保全、preProcess 模板优先级、chain 前序输出传递、上一章摘要注入，并用源 Electron 真实运行完成闭环验证。

## 修复内容

### P0 DEAI 注入

- folder SKILL 路径接入正文层 `DEAI_METHODOLOGY_PROMPT` 17 条生成阶段约束。
- 注入顺序：Agent systemPrompt → folder template.md → DEAI 约束。
- 其他四层不受影响。

### P1 compose 保全与 preProcess 优先级

- `realSkillExecutor.ts` 模板优先级修正为：compose `baseTemplateOverride` > folder `pkg.template` > `preResult.templateOverride`（`api.setTemplate`）。
- preProcess 只改写 input，不再用返回的 template 覆盖 compose 合并模板。
- `PipelinePanel.vue` 新增 `hydrateFolderTemplates()`：对 `format === "folder"` 且 store template 为空的技能，读取文件夹 `template.md` 填充。
- 修复水合结果被丢弃的问题：`runStepSkills()` 水合后的数组传入 `_runStepSkillsInner()`，内层不再重建未水合数组。

### P2 上一章摘要与 chain 交接

- 第一章请求不得包含 `[上一章概要]`。
- 第二章请求包含 `[上一章概要]` 和上一章摘要。
- chain 模式第二步 user prompt 包含第一步的 `body + metadata` 输出，前序结果完整传递。

### P3 chain folder 模板变量解析

- `RealSkillExecuteOptions` / `SkillRouteOptions` 新增 `resolvedTemplate`，PipelinePanel 在 chain 循环内把已解析模板传入 realSkillExecutor。
- executor 基础模板优先级更新为：compose `baseTemplateOverride` > chain `resolvedTemplate` > folder `pkg.template`；`api.setTemplate` 仍为最低优先级动态覆盖。
- 诊断码从 `compose-template-applied` 统一为 `base-template-applied`。
- folder `template.md` 中的 `{{chapterTitle}}`、`{{chapterSummary}}`、`{{chapterPlot}}`、`{{prevChapterSummary}}`、`{{characters}}`、`{{wordsPerChapter}}`、`{{styleTags}}`、`{{pacingParams}}` 在 chain 模式原生解析。

### P4 探针断言修正

- 旧断言假设第二章模板中 `剧情` 与 `上一章概要` 字段连续出现，实际模板中间还有 `人物`、`字数` 字段，造成假失败。
- 修正为分别断言 `章节=变量第二章；概要=变量剧情第二章。；剧情=变量剧情第二章。` 与 `上一章概要=变量剧情第一章。`。

### 探针根因两则

- `pipelineGenerated` 标记缺失导致章节静默早退：探针项目夹具补齐章节 `pipelineGenerated: true`。
- mock 输出协议与 schema 不一致：schema required 改为 `body + metadata`，mock 输出同为 `{ body, metadata }`，postProcess 只在 body 内追加标记并重新序列化。

## 验证证据

### 单元测试与构建

- `npm run test:services`：10 个测试文件，124 个用例全部通过。
- `npm run type-check`：通过。
- `npm run build:vue`：通过，仅既有 Vite chunk 警告。

### 源 Electron 真实验证

- 探针：`_audit/tmp/verify_folder_body_pipeline.cjs`
- 证据：`_audit/tmp/real-skill-folder-pipeline-evidence.json`
- 环境：源 Electron + CDP `127.0.0.1:9227`，User-Agent `shenyi-assistant/3.28.0`
- 结果：`all: true`，脚本 exit code 0

### chain folder 变量真实验证

- 探针：`_audit/tmp/verify_folder_chain_template_variables.cjs`
- 证据：`_audit/tmp/folder-chain-template-variables-evidence.json`
- 环境：源 Electron + CDP `127.0.0.1:9227`，mock OpenAI 兼容供应商
- 结果：14 项 checks 全部为 true，脚本 exit code 0
- 单测重跑：`npm run test:services` 10 个测试文件，125 个用例全部通过。

关键证据：

- 第一章 system prompt：`章节=变量第一章；概要=变量剧情第一章。；剧情=变量剧情第一章。；人物=变量主角（特征: 冷静）；字数=3600；上一章概要=`
- 第二章 system prompt：`章节=变量第二章；概要=变量剧情第二章。；剧情=变量剧情第二章。；人物=变量主角（特征: 冷静）；字数=3600；上一章概要=变量剧情第一章。`
- chain 第二步 user prompt 保留第一步 `body + metadata` 输出。
- DEAI 17 条约束仍注入每个 chain 子步骤。

覆盖断言：

- `agentPromptFirst: true`
- `templatePresent: true`
- `deaiSuffixPresent: true`
- `prevChapterAbsentForFirstChapter: true`
- `chainContinuationPresent: true`
- `chapterTwoSelected: true`
- `prevChapterPresentForSecondChapter: true`
- `composeFolderTemplatePresent: true`
- `composeTextTemplateMerged: true`
- `composeDeaiSuffixPresent: true`
- `model: true`
- `requestCaptured: true`

## 第三方 SKILL 制作方交接

- DEAI 17 条由应用层在正文层自动注入 folder 路径，S3 模板不要再手写这些约束，避免双重约束。
- chain 模式下一步收到的 user prompt 是完整上一步输出（`body + metadata`），解析时优先读 body。
- `prevChapterSummary` 可从 `[上一章概要]` 标记稳定解析；第一章没有该标记是正常行为。
- compose 混合 folder 与 text SKILL 时，folder 的 `template.md` 会进入合并 system prompt，folder 的 script/schema 只有一个 folder 技能时生效。
- chain 模式下 folder `template.md` 的章节变量由应用层原生解析，`preProcess` 不再需要承担变量替换职责。
- `preProcess(input)` 的 `input` 仍是纯字符串；`api.setTemplate` 仍只能整体覆盖模板且优先级最低，这两点未变化。
- DEAI 17 条会注入 step 4 的每个 chain 子步骤，第三方模板不要重复手写。

## 诚实边界

- 本轮已用 mock 供应商在源 Electron 真实运行验证 chain/compose、双章节、上一章摘要和 DEAI 注入。
- 未使用真实付费供应商做长文本正文实测；建议客户实操确认真实供应商下正文生成与滚动体验。
- 第二章 user prompt 中 `[相关记忆]` 出现两次重复，为本轮探针附带发现的既有问题，未纳入本次最小改动，建议单独开任务排查。
