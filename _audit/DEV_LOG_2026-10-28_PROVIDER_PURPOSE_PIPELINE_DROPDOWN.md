# DEV_LOG 2026-10-28 供应商用途栏生成流水线下拉

## 1. 目标

按用户裁决，把生成流水线供应商通道并入供应商卡片“用途”栏：用途栏内新增 `生成流水线` 按钮，点击后在同一卡片内展开层下拉；删除独立层通道区块，存储结构保持兼容。

## 2. 实现

- `src/components/settings/ApiSettings.vue`：用途栏新增 `生成流水线` 按钮，仅 generate 供应商显示；首次点击展开下拉，选择层后绑定，已绑定时点击解绑，再点收起；绑定状态计入启用徽标；缺失供应商警告保留在页面级。
- `src/components/settings/ApiSettings.spec.ts`：覆盖非 generate 隐藏、展开、绑定、解绑、收起、旧独立区块负向断言、导出/导入兼容。
- `scripts/verify-pipeline-provider-channel-electron.mjs`：改为真实点击卡片按钮与下拉；失败时落盘 run 诊断快照；启动前清理隔离 profile，消除残留旧绑定的假失败。
- 删除旧 `#pipeline-provider-channel-settings` 与旧四个层按钮组，`pipelineLayerProviders` 存储结构不变。

## 3. 验证

- `npx vitest run src/components/settings/ApiSettings.spec.ts src/stores/provider.spec.ts` → 2 files / 6 tests passed。
- `npx vue-tsc --noEmit` → exit 0。
- `npm run build:vue` → exit 0。
- `node scripts/verify-pipeline-provider-channel-electron.mjs` → PASS，`mode=mock-four-layer-providers`，`requests=3`；真实 UI 点击、持久化、缺失警告、恢复、三层 trace/apiCall/物理请求路由全部通过。
- 证据目录：`_audit/verification-pipeline-provider-channel/`。

## 4. 教训回写

- 经验文件升级 v9.6.4 → v9.6.5，G1.5 新增两条判则：
  - 用途类能力必须并入既有用途栏单源入口，禁止另立区块或第二入口；实现与验证器必须负向断言旧入口不存在。
  - 验证器隔离 profile 每轮启动前必须清理，残留绑定态会把验证器缺陷伪装成产品回归。
- 过程中修复两个真实缺陷：初版“默认绑定设定层”会抢走其他供应商的设定层绑定，改为首次点击只展开；隔离 profile 未清理导致 settings 层假失败。

## 5. 封装

- 版本：3.110.2 → 3.110.3（`package.json`、`package-lock.json`）。
- 构建：`npm run build` exit 0。
- 安装包：`dist/神意助手-Setup-3.110.3.exe`，231,603,405 bytes。
- 旧 3.110.2 安装包与 blockmap 已按 G0.8 清理，dist 仅保留当前版本一套。

## 6. 诚实边界

- 本轮未重跑 live 单供应商矩阵；provider/model 路由语义未改动，3.110.1 的 live PASS 保留为历史证据。
- 未执行 NSIS 人工安装路径核验；本轮只核验安装包产物与版本。

## 7. 台账

`_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-28_PROVIDER_PURPOSE_PIPELINE_DROPDOWN.md`
