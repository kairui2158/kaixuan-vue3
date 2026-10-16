# DEV LOG: 2026-10-17 正文层四漏整改收口

## 目标

按用户确认的四漏整改方案完成收口：消除漏报、漏项、漏面、漏验证，让 targeted 修复不再整链重跑，并补齐文档、经验、验证、版本与仓库收尾。

## 缺陷与修复

- D1 终步回显误报：新增 `getChainEchoWarningLevel()`，主链、升级重试、工作台三路统一“终步 polish 高重合为 info，中间步仍 warning”语义。
- D2 运行包滞后：Vite 构建生成 `build-manifest.json` 并注入 `__SHENYI_BUILD_MANIFEST__`；run trace 新增 `runtimeFingerprint`；验证器对账 disk manifest、bundle 注入与 trace。
- D3 targeted 整链重跑：新增 `BodyArtifactExecutionPlan` 与 `planBodyArtifactExecution()`；targeted 修复从 generator 步重启，复用上游产物，只重跑 S2/S3。
- D3 追加发现：断点清理后 step outputs 只存于持久化断点，targeted attempt 拿不到 S1。修复为链成功清理断点前通过 `onStepOutputs` 回传产物，attempt 闭包优先复用；缺失时显式降级整链并写 trace。
- D4 `hook-field-ignored` 降级误判：由 D2 的新鲜度与 fingerprint 门禁阻断旧运行包继续被验证。
- D5 S1 字数契约冲突：应用侧执行包只向生成步注入一次字数契约；SKILL 层模板问题已按边界转达 SKILL 层。
- D6 四漏复发：补齐本 DEV_LOG、四漏台账、任务台账与经验文件 v8.13。

## 验证

- `npm run test:services`：170 files / 1978 tests 全部通过。
- `npm run type-check`：通过。
- `npm run build:vue`：通过。
- `node scripts/verify-owner-breakpoint-closure-electron.mjs`：PASSED。
- Electron 证据：`_audit/verification-owner-breakpoint-closure-electron/`。
- attempt 账本：attempt 1 `none / too_short / wordCount 4 / requestCount 3`；attempt 2 `targeted / complete / wordCount 2000 / requestCount 2`。
- 关键行为：首链 S1 仅 1 次物理请求；targeted 复用 S1，只重跑 S2/S3；无 `body-targeted-repair-artifact-missing`；终步无 echo warn；run `success`。

## 验证器修正

- `directWriteWiring.spec.ts` 的旧实现字符串断言升级为新单源函数 `getChainEchoWarningLevel` 与 `finalStepRole: 'polish'`，并反向断言旧 `escalationFinalStep` 形态不存在。旧断言锚定旧实现，不是产品回归。
- Electron 样稿从“S3 与 S2 完全相同”改为“保留事实、改变表达”，确保终步 polish 豁免不是因为样稿无差异而假通过。
- 验证器新增 disk manifest / bundle 注入 / trace fingerprint 三方一致断言。

## 经验回写

- 经验文件 `_audit/神意开发经验总结_v7.md` 升级 v8.13。
- G1.5 补入：验证器断言锚点必须与实现同批迁移；验证样稿必须模拟职责差异；验证器自身也要进入查账对象。
- G1.17 补入：断点清理与 attempt 生命周期产物必须同步传递；成功终态后再次进入必须验证无降级、无缺产物、无整链重跑；登记第七类执行者自盲区“验证器自盲区”。
- G2.9 补入：targeted 修复必须复用同一 attempt 生命周期内的上游产物，产物缺失只能显式降级并写 trace。

## 版本与封装

- 版本升级 `3.94.0`；`package.json` 与 `package-lock.json` 已同步。
- 既有登记 warning：renderer chunk 超限、`vite.protocols.config.mts` 使用 `__dirname`。本轮不顺手修改。

## 诚实边界

- Electron 验证使用本地 OpenAI-compatible provider，覆盖真实 UI 点击、真实 HTTP 调用、断点存储与 trace，但不覆盖外部 live 供应商矩阵。
- D5 中 SKILL 层模板内容属 SKILL 层职责，本轮只完成应用侧注入点验证与问题转达。
- 原始 021335 客户 trace 未做逐 token 回放器；本轮用同语义 Electron 复刻覆盖核心事故路径，并保留原始 trace 作为对照。
