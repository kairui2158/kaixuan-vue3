# 2026-10-28 供应商用途栏生成流水线下拉任务台账

## 1. 目标与原话

用户原话：「卡片里你没改啊，应该在用途一栏啊，用途一栏里有生成，有图片，有视频，你为什么不能放在用途一栏？ 用途一栏设立一个生成流水线然后下拉不就行了么？ 你为什么要弄那么复杂？」

最终可感知行为：供应商卡片用途栏内出现 `生成流水线`；点击展开同卡片下拉，选择设定层 / 卷纲层 / 章节层 / 正文层；再次点击解绑并收起；不再存在独立“生成流水线层通道”区块。

## 2. 门禁读证

读证文件：`_audit/神意开发经验总结_v9.md`（本轮读时 v9.6.4，收口升级 v9.6.5）。

- G0.1：目标收敛为用途栏单源入口，不改变 provider store 结构与路由语义。
- G0.3：验证分为单测、类型、构建、真实 Electron UI 四层，不把单测冒充 UI 验证。
- G0.5：回头核对 UI、测试、验证器、旧入口负向断言、证据目录、版本封装。
- G0.10：旧独立区块、旧按钮组、旧验证器锚点必须清零。
- G0.11：绑定层必须由真实点击按钮和真实 selectOption 完成，不得注入业务选中态。
- G0.12：本台账七节齐全。
- G1.5：验证器每轮清理隔离 profile，避免旧绑定造成假失败。

## 3. 路由判定

加入门禁：G0.1、G0.3、G0.5、G0.10、G0.11、G0.12、G1.1、G1.5、G1.8。

排除项及理由：

- G0.2：用户已明确不设预算，本轮不设置 token/时间预算。
- G2.14：默认数据根迁移已在前一轮完成，本轮不触碰路径单源。

## 4. 影响圈与作者反证

改动面：`ApiSettings.vue` 用途栏按钮与下拉、`ApiSettings.spec.ts` 交互测试、`verify-pipeline-provider-channel-electron.mjs` UI 操作与断言、验证证据目录、版本号与审计文档。

可能碰到的：provider store 导出/导入、层绑定持久化、流水线路由。本轮不改这些语义，只改入口交互，因此存储结构保持兼容。

作者反证：

1. 假设“新增按钮即可”。证伪：初版默认绑定设定层，导致顺序配置四供应商时设定层被抢走；已改为首次点击仅展开，选择后才绑定。
2. 假设“验证器读 store 即可”。证伪：验证目标包含真实 UI，脚本必须点击卡片按钮并 selectOption；同时隔离 profile 未清理会带入旧绑定，已加启动前 `rmSync(PROFILE)`。

## 5. 停止条件

1. `生成`/`验证`/`识别` 同一用途栏内存在 `生成流水线` 按钮；非 generate 供应商不显示。
2. 首次点击只展开下拉，不改变绑定；选择层后该供应商绑定对应层并自动解除旧层占用。
3. 已绑定时点击解绑，再点收起；旧独立区块 `#pipeline-provider-channel-settings` 不存在。
4. 定向测试、类型检查、构建、真实 Electron UI 验证全部通过。
5. 安装包升级并核验版本，证据、台账、DEV_LOG、经验文件、仓库收口完成。

## 6. 执行证据

- `npx vitest run src/components/settings/ApiSettings.spec.ts src/stores/provider.spec.ts` → `Test Files 2 passed (2)`，`Tests 6 passed (6)`。
- `npx vue-tsc --noEmit` → exit 0。
- `npm run build:vue` → exit 0。
- `node scripts/verify-pipeline-provider-channel-electron.mjs` → `[PASS] layer provider UI, persistence, warnings, and routing verified; mode=mock-four-layer-providers; requests=3`。
- UI 入口：`src/components/settings/ApiSettings.vue:31-62` → 用途栏按钮 + `pipeline-layer-select` 下拉。
- 旧入口负向断言：`src/components/settings/ApiSettings.spec.ts:103` → `#pipeline-provider-channel-settings` 不存在。
- 真实 UI 操作：`scripts/verify-pipeline-provider-channel-electron.mjs:528-532` → 点击按钮、等待下拉、selectOption、核对 DOM/store 双值。
- 打包：`npm run build` → exit 0；`dist/神意助手-Setup-3.110.3.exe` 231,603,405 bytes。

## 7. 缺口清单

- 本轮未重跑 live 单供应商矩阵；provider/model 路由语义未改动，沿用 3.110.1 live PASS 作为历史证据，当前入口交互由 mock 四供应商真实 Electron UI 证明。
- 未执行 NSIS 人工安装路径核验；本轮只做安装包产物与版本核验。
- 其余无登记缺口。
