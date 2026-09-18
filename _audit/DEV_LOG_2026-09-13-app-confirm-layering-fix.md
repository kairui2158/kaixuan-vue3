# 开发日志：全局确认弹窗层级修复（2026-09-13）

## 问题

客户在 3.40.1 安装版反馈：大纲工作台“重置对话”按钮点击后无反应。

## 根因

09-13 全应用统一性修复将 30+ overlay 迁入 `useModalQueue`，工作台层级升到 `BASE_Z=3000`，但全局确认弹窗 `AppConfirmModal.vue` 仍保留 `modal-nested` 的 `z-index:1100`。确认框实际弹出，却被大纲工作台遮住，用户看到的是“按钮失灵”。

责任判定：应用侧回归，不是客户操作或模型问题。当天 E2E 矩阵只验证三入口生成、取消、导出，没有覆盖“全局确认层必须高于所有 Modal 队列成员”的反向层级回归，导致宣称闭环时漏掉这一类入口。

## 修复

1. `src/composables/useModalQueue.ts`：新增 `CONFIRM_BASE_Z=9000`，`getZIndex('app-confirm')` 固定返回 9000，保证高于队列内所有 Modal。
2. `src/components/common/AppConfirmModal.vue`：overlay 绑定 `:style="{ zIndex: confirmZIndex }"`；Escape 分支补 `stopPropagation()`，防止确认框关闭时触发 `useModalQueue` 的全局 Escape 关闭宿主工作台。
3. `src/composables/useModalQueue.spec.ts`：新增纯逻辑回归，断言 `app-confirm` 高于 settings、skill-import、help、outline-workspace。
4. `scripts/repro-outline-reset-confirm.mjs` 重命名为 `scripts/verify-app-confirm-layering.mjs`，升级为固定回归门：
   - 大纲工作台重置确认框可见，z-index 9000，按钮中心命中确认按钮。
   - Escape 只关闭确认框，工作台保留。
   - 点击“清空”后 UI 消息清空，出现“上下文已重置”提示。
   - `wa_ctx_${projectId}` 中 outline/generate 会话 messages 为空。
   - 主页 ChatPanel 重置入口同样验证 UI、store、上下文清空。
   - 脚本自带 `try...finally`，删除专用 profile 并复核。
5. 验证脚本自身修正：`process.exit(0)` 从 try 内移到顶层 `try...finally` 之后。首版在成功路径 try 内直接退出，跳过 finally，导致专用 profile 残留；复跑后 `profile removed=true`，并确认无 `app-confirm-layering-profile` 相关 Electron 进程残留。

## 验证

| 验证项 | 结果 |
|---|---|
| `npm run type-check` | PASSED |
| `npx vitest run` | PASSED：61 files / 508 tests |
| `npm run build:vue` | PASSED：主应用与 provider protocols 构建成功 |
| `node scripts/verify-app-confirm-layering.mjs` | PASSED：outline reset、Escape isolation、outline context、home reset、home context 五段全通过；profile removed=true |

关键 E2E 观察值：

```json
{
  "overlayZ": 9000,
  "outlineZ": 3000,
  "hitTag": "BUTTON",
  "hitClass": "btn-primary btn-danger",
  "confirmText": "清空",
  "confirmCount": 1
}
```

## 遗留与边界

- 源码修复已验证，尚未重新封装；等待用户明确指示。
- 本轮未改动 `OutlineWorkspace.vue` 与 `ChatPanel.vue` 的重置业务逻辑，二者源码保持原状。
