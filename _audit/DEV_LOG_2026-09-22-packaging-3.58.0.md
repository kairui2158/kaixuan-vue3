# 2026-09-22 3.58.0 意图对抗工厂收敛封装

## 目标

按 `_audit/PROPOSAL_2026-09-22_INTENT_ADVERSARIAL_FACTORY_CONVERGENCE_V2.md` 完成收敛交付版 3.58.0，并执行 M55-M57、M29/M42/M43/M44/M54 门禁：停止审计先 PASS、真实打包产物启动核验、旧产物清零。

## 收敛证据

- 最终轮：round-20，seed 131，Silver 465，五项失败指标全零，手稿一致性 100%。
- 账本末尾连续有效轮：round-18、round-19、round-20。
- 停止审计：S1-S6 全部 PASS，剩余 Silver 失败 0，证据 `_audit/intent-factory-stop-audit.json`。
- 工厂扩库种子只进入 `INTENT_FACTORY_ACCRETION_SAMPLES`，未进入 `CHAIN_INTENT_EVAL_SPLITS`。

## 验证

- `npx vitest run src/services/chainIntentRouter.spec.ts src/services/intentFactoryStopAudit.spec.ts`：44/44 通过。
- `npm run test:services`：79 个文件、769 个用例通过。
- `npm run type-check`：通过。
- `npm run build:vue`：通过。
- `node scripts/calibrate-intent-routing-thresholds.mjs`：dev 9/9，writeFalseTriggers=0，discussBlocked=0。
- `node scripts/verify-intent-corpus-electron.mjs`：八场景通过。
- `node scripts/audit-intent-factory-stop.mjs`：S1-S6 PASS。
- `node --check scripts/verify-packaging-3-58-0.mjs`、`node --check electron/preload.js`：通过。

## 版本与产物

- 版本：`package.json` 与 `package-lock.json` 均为 3.58.0。
- 安装包：`dist/神意助手-Setup-3.58.0.exe`。
- SHA256：`4D9BE955E73C5A6DC619BB620FB462BCAB239CA4147F2AAD925B806A149A14CD`。
- NSIS 有效配置保持 `oneClick: false`、`allowToChangeInstallationDirectory: true`，客户可自选安装路径。

## 封装核验

- 新增 `scripts/verify-packaging-3-58-0.mjs`，同步版本、`schemaVersion=packaging-3-58-0-v1`、输出目录与横幅。
- 删除旧 `scripts/verify-packaging-3-57-0.mjs`，避免新旧验证入口并存；历史 DEV_LOG 中的旧文件名属于当时事实，保留不改。
- `node scripts/verify-packaging-3-58-0.mjs`：
  - asar 版本 3.58.0。
  - renderer 74 条目。
  - `window.electronAPI` 77 个方法可用。
  - 打包应用真实启动并渲染可见文本。
  - 本地意图 embedding 模型从 `resources/models/bge-small-zh-v1.5` 正常加载。
  - 证据：`_audit/verification-packaging-3-58-0/packaging-evidence.json`。

## 产物清理

- 删除旧安装产物：`dist/神意助手-Setup-3.57.0.exe`、`dist/神意助手-Setup-3.57.0.exe.blockmap`。
- 删除旧封装证据目录：`_audit/verification-packaging-3-57-0`。
- 删除临时探针：根目录 `.tmp-route-probe.mjs`。
- 复核后 `dist` 仅保留 3.58.0 一套安装产物；`_audit/verification-packaging-*` 仅保留 3.58.0 证据目录。

## 交付边界

3.58.0 的“收敛交付”指意图对抗工厂按 V2 方案达到机器可判定停止条件，不等于所有真实用户泛化问题永久解决。真实 confirmed 语料仍按 Roadmap G1-G4 路线积累。
