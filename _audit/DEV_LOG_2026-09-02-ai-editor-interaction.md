# DEV LOG 2026-09-02 - AI 与编辑器交互升级

## 交付内容

- 新增受限编辑协议底座：`src/services/editorEditProtocol.ts`、`src/services/editorTarget.ts`、`src/services/editorEditService.ts`、`src/services/editorEditDiagnostics.ts`。
- 主页 AI 对话接入结构化编辑：协议在请求前注入，响应解析 `editor_edit`，经 DiffModal 预览、用户确认后写入，应用前做目标版本校验。
- 拆除主页旧的 DOM 直写插入路径，统一走编辑计划 + 预览确认。
- 大纲工作台兼容迁移：旧 `outline_edit` 协议委托统一解析器，`replace_section` 映射为 `replace_match`；plain / compose / chain 三条路径都注入编辑协议。
- DiffModal 增加编辑语义展示：目标、操作、失败原因和危险操作标识。
- 新增诊断日志：记录 parsed / no_edit / rejected / applied，以及 requestId、workspace、tabId、operation、failureReason、durationMs。

## 已验证

- `npm run type-check`：通过。
- `npx vitest run src/services/editorEditService.spec.ts`：7/7 通过。
- `npm run build:vue`：通过。
- `node scripts/verify-ai-editor-interaction.mjs`：17/17 PASS，`restored=true`，`residual=0`，结果见 `_audit/tmp/ai-editor-interaction-result.json`。
- 真实源 Electron 验证覆盖：主页一次编辑请求 1 次 API 调用、协议注入、预览前不写入、确认后写入、普通回答不改编辑器、无效指令不写入且可关闭预览、大纲旧协议识别与预览、主页/大纲诊断日志、API 请求计数。

## 未验证

- 安装包路径未验证，本轮只验证源 Electron。
- 真实第三方供应商的模型自主输出质量未验证，探针使用本地 mock SSE 供应商验证协议与调用链。

## 客户实操入口

- 主页编辑器：打开章节正文页签，在 API 对话框明确要求修改编辑区内容，AI 返回结构化编辑后先出现对比预览，点击“应用结果到编辑器”才写入。
- 大纲工作台：打开 AI 共创大纲后明确要求追加/替换大纲内容，AI 回复下方出现“已识别编辑指令”，点击“预览修改”确认后写入。
