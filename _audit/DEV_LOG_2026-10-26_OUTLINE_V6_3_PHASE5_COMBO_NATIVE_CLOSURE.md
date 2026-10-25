# 2026-10-26 大纲编辑器 V6.3 Phase 5 组合回归与原生事件收口

## 范围

- 对齐 `_audit/PROPOSAL_2026-10-24_OUTLINE_EDITOR_V6_3_NON_BLOCKING.md` 的 Phase D 裁决边界：跨主进程重启恢复转第二期，本期闭环范围限定会话内 orphan 流恢复。
- 补齐 Phase 5 五类组合场景中的两项缺口：安全模式中复制长文、渲染冻结期间 journal 追加与恢复。
- 用 40 秒与 60 秒两档真实阻塞实测 Electron 原生 `unresponsive/responsive` 是否可触发。

## 实现与验证

- 新增 `scripts/verify-outline-v6-phase5-combos-e2e.mjs`：真实 Electron + 真实 UI 点击，不依赖供应商。10,592 字长文在安全模式中复制完整，头尾一致，复制 87.7ms、输入延迟 1.9ms；冻结期间 journal 追加 1 条，恢复后 `ok=true`、pending 0、快照 2/2 与 UI 一致、messageId 稳定。证据：`_audit/verification-outline-v6-phase5-combos-e2e/result.json`。
- `scripts/verify-outline-v6-main-ledger-e2e.mjs` 支持 `OUTLINE_BLOCK_DURATION_MS`，40 秒与 60 秒两档均 PASS；账本收到两窗口 `renderer_safe_mode`、真实 `render-process-gone`、`renderer_recovery_scheduled/reloaded`，崩溃窗口与新建窗口均可读账本。证据：`_audit/verification-outline-v6-main-ledger-e2e/result.json`。
- `electron/ipc/responsivenessLedger.js:161` 将测试隔离 block 上限从 30,000ms 放宽到 60,000ms；该 IPC 仍仅在 `SHENYI_DATA_DIR` + `SHENYI_ALLOW_TEST_ISOLATION=1` 显式隔离环境注册，生产不暴露。
- `OUTLINE_BLOCK_DURATION_MS=6500 node scripts/verify-outline-v6-phase4-e2e.mjs` 复跑 PASS，9 项断言全 true，真实 provider 流与真实取消 abort 保持可用。证据：`_audit/verification-outline-v6-phase4-e2e/result.json`。
- 验证收口：`npm run build:vue` PASS；`npm run type-check` PASS；`npm run test:services` 212 files / 2303 tests 全部 PASS。首次全量测试暴露 `electron/ipc/responsivenessLedger.spec.js:185` 仍锁 30 秒旧断言，已同步为 60,000ms 并复跑通过。

## 诚实边界

- 在 DevTools 附加 + Windows + 当前 Electron 版本组合下，40 秒与 60 秒 busy-wait 均未触发 Electron 原生 `unresponsive/responsive` 事件；报告保留 `nativeUnresponsiveCaptured=false`、`nativeResponsiveCaptured=false`，不把 `renderer_safe_mode` 冒充原生事件，也不把该现象误报为产品缺陷。
- 跨主进程重启的 checkpoint/trace/聊天持久化恢复按用户裁决迁移第二期；本期完成的是会话内 orphan 流恢复（保存草稿、丢弃本段、继续接收转新 run）。

## 经验与封装回写

- 经验文件 `_audit/神意开发经验总结_v9.md` 升级 v9.1.0 → v9.2.0：G1.4 新增“原生事件环境边界登记”；G1.5 新增“测试通道契约参数三面同步”。无旧编号新增，两个语义均并入既有条目。
- 安装包更新（2026-10-26）：`npm run build` exit 0，renderer 双构建通过，electron-builder 生成 3.108.0 NSIS 包。产物核验：`dist/神意助手-Setup-3.108.0.exe` 存在，231,599,892 字节，SHA256 `284FD8E6EA54F5CC2B5D70BF6838657DBEE1FD232E38D0B431897C791CF46B8A`；`latest.yml` version=3.108.0、size=231599892，与安装包一致；`win-unpacked`、app.asar、blockmap 均存在。
- 旧产物清理复核：`dist/神意助手-Setup-3.107.0.exe` `exists=false`、blockmap `exists=false`，`dist` 仅保留 3.108.0 一套安装产物。诚实边界：本轮未做 NSIS 安装器的人工安装路径核验，安装包完整性以 electron-builder 输出、文件尺寸、latest.yml 与哈希为准。
