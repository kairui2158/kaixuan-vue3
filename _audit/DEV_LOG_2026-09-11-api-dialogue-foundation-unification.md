# 开发日志：API 对话系统底座统一（2026-09-11）

## 任务背景

客户反馈大纲工作台 API 对话框读取覆盖不足、写入编辑器困难。前序工作先完成了大纲工作台长文档共创底座，本任务继续把主页编辑器、大纲工作台、生成流水线统一到同一个 API 对话底座，避免后续继续在两套能力面上分叉。

## 交付内容

1. 统一对话底座：三入口共享权限矩阵、上下文结构、工具声明与批次事件语义；`discuss/analyze` 只读，`edit/generate` 才暴露写入提案，流水线保持无交互工具。
2. 批次状态机：pending / applied / rejected / rolled_back / version_changed / expired 统一事件结构，导出 JSON 与文本均保留统一语义。
3. 写入安全：主页与大纲均走提案 + 轻量确认 + hash 校验 + 回滚；确认前不落盘编辑器。
4. 上下文注入：主页编辑器以编辑器内容为主上下文；大纲工作台保留结构化大纲读取；流水线保留上游大纲注入。

## 阶段 4 收口内容

1. 新增 `src/services/dialogueFoundationContract.spec.ts`：8 个横向契约测试，覆盖权限一致性、批次事件往返、非法工具声明拒绝、流水线交互工具拒绝。
2. 新增 `scripts/verify-dialogue-foundation.mjs`：源 Electron + CDP + 本地 SSE mock，14 项真实 UI 断言全绿。
3. 修正契约测试批次对象：补齐 `type: editor_edit_batch` 与 `type: editor_edit / version: 1`，使测试以正式协议为准。
4. 清理 E2E 测试项目残留：`wa_project_codex-dialogue-foundation-e2e.json`、`wa_project_codex-dialogue-stage2-e2e.json`。

## 验证

- `npm run type-check`：exit 0
- `npx vitest run src/services/dialogueFoundationContract.spec.ts`：8/8 passed
- `npm run test:services`：20 files / 218 tests passed
- `npm run build:vue`：exit 0
- `npx vitest run`：55 files / 425 tests passed
- `node scripts/verify-dialogue-foundation.mjs`：14 项 PASS，含主页 edit/discuss、大纲 edit/discuss、流水线设定层生成
- 测试残留：`wa_project_codex-dialogue-*.json` 剩余 none

## 用途

主页 API 对话、大纲工作台 API 对话、生成流水线不再各自维护一套对话能力。后续新增对话能力时，只要接入统一底座，三入口自动共享权限、上下文、工具与批次语义，降低分叉和回归成本。
