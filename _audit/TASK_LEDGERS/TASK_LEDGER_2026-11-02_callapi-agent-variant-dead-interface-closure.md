# TASK LEDGER — callApiWithAgentVariant 死接口闭环

日期：2026-11-02  
方案：[_audit/PROPOSAL_2026-11-02_CALLAPI_AGENT_VARIANT_DEAD_INTERFACE_CLOSURE_V1.md](_audit/PROPOSAL_2026-11-02_CALLAPI_AGENT_VARIANT_DEAD_INTERFACE_CLOSURE_V1.md)  
目标版本：3.110.15 → 3.110.16

## 1. 目标与原话

- 用户确认：三个决策点均按建议执行——只删死包装、升版 3.110.16 并封装、其他死代码扫描独立立项。
- 目标：生产执行层只保留 `callApiWithAgentVariantOwned` 一个 agent 调用入口；旧包装名不得回潮；行为、trace、UI 全部不变。

## 2. 门禁读证

- G0.10 新旧并存清零：执行层旧入口名必须清零，测试负向断言保留为守护。
- G1.2 删除与引用闭包：删除前后全仓检索 `src scripts electron`。
- G1.5 验证先行：先加负向用例并取得 RED，再删实现。
- G0.12 台账七节：本文件与 DEV_LOG、主索引、手册同步登记。

## 3. 路由判定

加入：G0.1、G0.3、G0.5、G0.8、G0.10、G0.12、G1.1、G1.2、G1.5、G1.8、G1.21、G2.13。  
排除：全仓死代码扫描、`callApiWithAgentTimeout`（历史已确认不存在）、`Owned` 改名、手动降AI改造、B6 效果宣称。

## 4. 影响圈与作者反证

改动：

- `src/components/pipeline/PipelinePanel.vue`：仅删除三行包装函数。
- `src/components/pipeline/__tests__/deai-injection-policy.spec.ts`：新增负向守护用例。
- `_audit/FOLDER_SKILL_DEAI_MENTOR_GUIDE_2026-11-01.md`：登记唯一生产入口。
- `package.json` / `package-lock.json`：3.110.16。
- DEV_LOG、本台账、主索引。

作者反证：

- 假设包装无调用方：`rg` 前后对账，删除前仅定义/转发，删除后生产裸名 0 命中。
- 假设动态调用漏检：检索裸函数名、字符串模板、动态 import、eval；当前无命中，type-check 与全量回归兜底。
- 假设测试不依赖旧名：先取得 RED，再删除转 GREEN。
- 假设 UI/trace 被破坏：真实 Electron 五态验证 A-E 全 PASS，事件 source 仍为 `PipelinePanel.callApiWithAgentVariantOwned`。

## 5. 停止条件

完成条件：定向 4 files GREEN、type-check exit 0、`build:vue` exit 0、五态 Electron 全 PASS、全量 239 files / 2553 tests GREEN、引用闭包生产裸名 0、版本 3.110.16、安装包存在且 asar 版本命中、git 提交后工作区干净。  
失败条件：任一验证失败即停止升版封装，恢复三行包装并登记未完成。

## 6. 执行证据

- RED：`npx vitest run src/components/pipeline/__tests__/deai-injection-policy.spec.ts` → `1 failed | 12 passed`，失败断言为 `expected ... not to contain 'async function callApiWithAgentVariant('`。
- 删除：`git diff -- src/components/pipeline/PipelinePanel.vue` 仅删除包装函数 3 行。
- 引用闭包：`rg -n "callApiWithAgentVariant" src scripts electron` → 生产源码仅剩 `await callApiWithAgentVariantOwned(`、函数定义、trace source `PipelinePanel.callApiWithAgentVariantOwned`；其余为测试负向断言字符串。
- GREEN：同一测试 → `Test Files 1 passed (1)`，`Tests 13 passed (13)`。
- 定向：4 files → `Test Files 4 passed (4)`，`Tests 38 passed (38)`。
- 类型：`npm run type-check` → exit 0。
- 构建：`npm run build:vue` → exit 0。
- 真实 UI：`node scripts/verify-deai-guidance-ui.mjs` → run A/B/C/D/E 全部 `[PASS]`。
- 全量：`npm run test:services` → `Test Files 239 passed (239)`，`Tests 2553 passed (2553)`。
- 版本：`npm version 3.110.16 --no-git-tag-version` → `v3.110.16`；`package.json:3` 与 `package-lock.json:3` 均为 3.110.16。

## 7. 缺口清单

- 构建：`npm run build` → exit 0，生成 `dist/神意助手-Setup-3.110.16.exe`，大小 231,644,711 bytes。
- asar 核验：`npx asar extract-file dist/win-unpacked/resources/app.asar package.json` → `version: 3.110.16`；`dist-renderer/assets/index-Ci_Rzbbh.js` 仅命中 `PipelinePanel.callApiWithAgentVariantOwned`，旧包装名无生产命中。
- 版本恢复复核：asar 抽取命令会覆盖工作区 `package.json`，误删后已恢复并重新执行 `npm version 3.110.16 --no-git-tag-version`；恢复后定向测试 13 tests、type-check、五态真实 Electron A-E 再次全 PASS。
- Git：功能提交 `dbaaf03a`（`refactor(pipeline): remove dead agent variant wrapper`，9 files changed，328 insertions，7 deletions）；提交后 `git status --short` 无输出，工作区干净。
- 边界：全仓其他死代码扫描未执行，属独立后续审计；B6 教学有效性保持 provisional。
