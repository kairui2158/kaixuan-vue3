# 2026-09-19 安装版真实用户 UI 模拟与同轮多写修复

## 背景

用户要求使用 Electron 安装版进行真实用户 UI 模拟。安装版 `3.53.6` 的场景 1-7 通过，场景 8 失败：第二次不同参数的 `editor.write` 被误报 `version_changed`。

## 根因

- `ChatPanel.buildChatEditorTools(requestTarget)` 的 `getSnapshot()` 固定返回本轮开头的 `requestTarget`。
- 第一次 `editor.write` 成功后，编辑器内容已经更新，但第二次工具调用仍拿旧快照参与 `applyDirectWrite` 的 `currentContent !== input.original` 校验。
- 该校验本来用于保护用户手动修改，不应阻止同轮内连续不同的 API 写入。
- 大纲工作台的 `getSnapshot: () => createOutlineRequestTarget()` 已经是活快照，不存在同类问题。

## 修复

- `src/components/chat/ChatPanel.vue`: `buildChatEditorTools` 中新增 `getCurrentTarget()`：
  - 活动页签仍是请求目标时，现场从活动页签创建快照；
  - 请求目标已不是活动页签时，从原目标页签创建快照；
  - 目标页签已关闭时返回 `null`，维持 `target_missing` 行为。
- `getSnapshot` 从固定返回 `requestTarget` 改为 `getCurrentTarget`。
- 不移除 `applyDirectWrite` 的内容校验：如果用户手动改动内容，写入仍会被 `version_changed` 阻止。
- `src/services/editorTools.ts` 的重复写入守卫保持不变：只拦连续 3 次完全相同的写入参数。

## 测试修正

- `scripts/verify-api-direct-write-v2-e2e.mjs` 场景 8 更新为：
  - 第 1、2 次不同参数写入都必须成功；
  - 第 3 次连续完全相同写入返回 `duplicate_write_blocked`；
  - 编辑器内容包含第 1、2 次写入，且重复内容只出现两次；
  - 删除过期的“只允许 1 次编辑器写入”断言。

## 验证

- `npm run type-check`: 通过。
- `npx vitest run`: 70 个测试文件、667 个测试全部通过。
- `npm run build:vue`: 通过；仅存在既有 Vite chunk / native config warning。
- `node scripts/verify-api-direct-write-v2-e2e.mjs`: 源码 Electron 全场景通过，输出 `===== API DIRECT WRITE V2 E2E PASSED =====`。
- `npm run build`: 通过，生成 `dist/神意助手-Setup-3.53.6.exe` 与 `dist/win-unpacked/神意助手.exe`。
- 安装版验证：`SHENYI_DIRECT_WRITE_INSTALLED=1` + `SHENYI_DIRECT_WRITE_ELECTRON=dist/win-unpacked/神意助手.exe` 运行同一脚本，输出 `===== API DIRECT WRITE V2 E2E PASSED =====`。

## 注意

- 首次重新封装时 `dist/win-unpacked/神意助手.exe` 被旧测试进程锁定，导致 `EBUSY`。结束该目录下的残留进程后重新封装成功。
- 安装版测试控制台仍有既有 `electron-log/renderer` 加载错误提示；该问题与本轮多写修复无关，未纳入本轮回改。
