# DEV_LOG 2026-10-28 供应商用途栏多绑定与孤儿绑定修复

## 1. 目标

修复上一轮 `cc41c9ed` 用途栏改造引入的两个回归面：单选 `select` 把 store 原本支持的“一供应商多层”降级为单层独占；generate 资格此前只守 UI 入口，导入/存量配置可留下孤儿绑定并一路进入执行路径。

## 2. 实现

- `src/components/settings/ApiSettings.vue`：层选择改为同卡片按钮面板，支持多层同时 `is-on`，单层再点解绑；导入不支持 generate 的层绑定时自动解绑并提示；保存供应商时清理其不再具备 generate 资格的层绑定；缺失供应商警告逐层展示。
- `src/stores/provider.ts`：新旧两种存储格式加载时都会清掉不支持 generate 的层绑定；新增 `clearPipelineLayersForProvider`；活跃供应商清单纳入层绑定供应商，避免“绑定有效但模型清单/实例不加载”的隐性缺供。
- `src/services/pipelineProviderChannels.ts`：`providerUnsupported` 进入通道解析、请求 profile 与快照；missing 优先，unsupported 只在供应商存在且不支持 generate 时触发。
- `src/components/pipeline/PipelinePanel.vue`：请求 profile 与 provider channel 双断言入口都会在请求前阻断 unsupported 供应商，trace 提示“恢复生成用途或重新绑定”。
- `scripts/verify-pipeline-provider-channel-electron.mjs`：验证器与按钮面板语义同步，改为真实点击 `[data-layer]` 按钮并核对 DOM/store 双值。
- 测试：`ApiSettings.spec.ts` 覆盖多绑定、单层解绑、导入自动解绑；`provider.spec.ts` 覆盖存量孤儿绑定清理与活跃清单；`pipelineProviderChannels.spec.ts` 覆盖三种来源的 unsupported 与 profile 透传。

## 3. 验证

- 定向：4 files / 25 tests passed。
- 全量：220 files / 2379 tests passed。
- 类型：`npm run type-check` exit 0。
- mock Electron：PASS，`mode=mock-four-layer-providers`，`requests=3`。
- live Electron：PASS，`mode=live-single-supplier`，`requests=3`，`successfulRequests=3`，三层 model `deepseek-v4-pro`，三面同源断言通过。
- 失败复跑记录：live 第一次复跑正文层停在 `requesting` 300 秒，脚本按超时失败退出；现场显示卷纲/章节物理请求成功、正文层无应用异常。复跑通过后判定为供应商流式停摆边界，不冒充产品缺陷，也不隐藏。
- 证据目录：`_audit/verification-pipeline-provider-channel/`、`_audit/verification-pipeline-provider-channel-live/`。

## 4. 教训回写

经验文件 v9.6.5 → v9.6.6，G1.5 追加两条判则：

- UI 控件形态变化必须对账数据模型语义：store 支持多绑定而控件单选，就是功能回退；必须有同供应商多层正向用例与单层解绑守卫。
- 用途资格必须同时守 UI 入口、导入入口、执行前门；漏任何一面就产生孤儿绑定或执行前才失败的组合缺陷。

这轮事故的根因是上一轮只完成了“入口并入用途栏”的形态迁移，没有把控件语义和资格门禁横向清零，属于 G0.10 的执行缺口。

## 5. 封装

- 版本：3.110.3 → 3.110.4（`package.json`、`package-lock.json`）。
- 构建：`npm run build` exit 0。
- 安装包：`dist/神意助手-Setup-3.110.4.exe`，231,615,334 bytes，SHA256 `DF7E5E1455EE287509321E23A810B6F693BF43EE473281C87125870F395352CA`。
- `dist/latest.yml` version 3.110.4；exe FileVersion/ProductVersion 3.110.4。
- 旧 3.110.3 安装包与 blockmap 已清理，dist 只保留 3.110.4 一套。

## 6. 诚实边界

- live 单供应商流式停摆一次，复跑通过；未定位为产品回归，现场证据已保留。
- live 仍是 single-supplier，多供应商分流由 mock 矩阵证明。
- 未执行 NSIS 人工安装路径核验。

## 7. 台账

`_audit/TASK_LEDGERS/TASK_LEDGER_2026-10-28_PROVIDER_PURPOSE_LAYER_MULTI_BIND.md`
