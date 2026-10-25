# DEV_LOG：大纲编辑器 V6.3 Phase D 会话内断流恢复

## 目标

按已裁决口径补齐孤儿流恢复的最后一环：用户可见、可裁决、可放弃，且 partial checkpoint 永不冒充 assistant 成品输出。

## Before

- 主进程已能识别孤儿流并生成 `recovering/partial` checkpoint，`providerNetRegistry()` 也已暴露。
- 渲染层没有任何 UI 消费该状态；用户只能看到生成失败或异常中断，无法处理已接收的部分输出。

## After

- `OutlineWorkspace.vue` 挂载与 5 秒轮询读取 registry，仅接受当前项目、`orphaned`、`recoveryStatus=recovering`、`disposition=partial` 且 checkpoint 非空的流。
- 聊天输入区新增 `#ow-stream-recovery-banner`，提供“保存为草稿”“丢弃本段”两个真实按钮。
- 保存草稿将 checkpoint 尾部追加为带 stream id 的草稿文本；不自动续跑、不写入大纲、不生成 assistant 消息。
- 丢弃本段只清除提示；已处理 streamId 进入会话内 dismissed 集合，轮询不会复活。
- 两个动作均写入 `stream-recovery-offered/draft-saved/discarded` trace 事件；继续输入由 InputGate 的 `new_run` 语义处理，无第三条执行线。

## 验证

- `npm run type-check`：exit 0。
- `npm run build:vue`：exit 0。
- `node scripts/verify-outline-v6-phase-d-recovery-e2e.mjs`：PASS；真实 Electron + Playwright + 真实 DOM 点击。断言恢复条可见、草稿包含真实供应商尾部与 stream id、丢弃后输入框保持为空、6 秒轮询不复活。证据：`_audit/verification-outline-v6-phase-d-recovery-e2e/result.json`。
- `npx vitest run src/services/outlineInputGate.spec.ts src/components/common/OutlineChatMessage.spec.ts src/services/providerResponseContract.spec.ts src/services/aiService.spec.ts`：199/199 PASS。
- `node scripts/verify-outline-v6-phase3-e2e.mjs`：PASS，Phase 3 长流、ring buffer、窗口隔离、孤儿 checkpoint 语义无回归。
- 全量回归：`npm run test:services` → `212 files / 2303 tests` 全绿。期间发现 `directWriteWiring.spec.ts` 的结构断言仍盯旧字符串 `if (!text || !inputGate.canSend) return`，而 Phase A 已把入口裁决升级为 `resolveOutlineEntryDecision('send', inputGate)` 单源；断言已同步为 `if (!text || !entryDecision.allowed) return`，行为测试与 `outlineInputGate.spec.ts` 33/33 通过后全量复跑。
- 版本封装：`3.106.0 -> 3.107.0`。
- 打包核验：`dist\神意助手-Setup-3.107.0.exe`，大小 231,600,652 bytes，SHA256 `9BCB7F0A74876C9711A8B9F3D0A1495CEE574D38233CCEC62E96DDDE1EDE84B4`；EXE `FileVersion/ProductVersion=3.107.0`；asar 内包含 `3.107.0` 与 `ow-stream-recovery-banner`。旧 `3.104.0` 安装包与 blockmap 已清理。

## 诚实边界

- 跨主进程重启的 checkpoint 持久化恢复未实现，按裁决暂缓第二期。
- 会话内 dismissed 集合不跨窗口共享；第二窗口本来就无法读取非本窗口 stream，与现有窗口隔离语义一致。
- 本轮没有为恢复条引入自动续跑或隐藏执行状态机；“继续接收”仍由 InputGate 的 `new_run` 单一语义承担。
