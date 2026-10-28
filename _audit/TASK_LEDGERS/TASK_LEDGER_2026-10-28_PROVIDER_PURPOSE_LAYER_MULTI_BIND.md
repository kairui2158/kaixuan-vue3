# 2026-10-28 供应商用途栏多绑定与孤儿绑定修复任务台账

## 1. 目标与原话

用户原话：「你现在回头审查你这样改完后对链路，和语义，以及组件，接线等问题有没有漏洞或者BUG」；裁决原话：「按你建议来，根据经验文件执行，最后收尾」。

最终可感知行为：同一供应商可在用途栏层按钮面板中同时绑定多个生成流水线层；再次点击只解绑对应层，不影响其他层；供应商失去 generate 资格时，导入/保存会自动解绑并提示；执行前对 Agent/层/全局三种来源统一阻断不支持 generate 的供应商。

## 2. 门禁读证

读证文件：`_audit/神意开发经验总结_v9.md`（执行时 v9.6.5，收口升级 v9.6.6）。

- G0.3：mock、live、UI、单测分层声明，不把单测冒充真实链路。
- G0.5：收尾前逐行审 diff，核对执行前门、导入入口、UI 入口三面。
- G0.8：旧 3.110.3 安装包与 blockmap 清理后复核 dist 只剩当前版本。
- G0.10：旧单选 select 语义清零，验证器改用按钮面板真实点击。
- G0.11：层绑定由真实按钮点击完成，并核对 DOM 与 store 双值。
- G0.12：本台账七节齐全。
- G1.5：验证器口径与控件形态同步迁移；live 供应商名使用当前真实配置 `新供应商`。
- G1.12：版本、latest.yml、exe 版本、SHA256 核验后提交。

## 3. 路由判定

加入门禁：G0.1、G0.3、G0.4、G0.5、G0.8、G0.9、G0.10、G0.11、G0.12、G1.1、G1.3、G1.5、G1.11、G1.12。

排除项及理由：

- G0.2：用户已明确不设预算，本轮不设 token/时间预算。
- G2.x：本轮不迁移数据根、不触碰 SKILL 层协议，路径与 SKILL 专项门禁不适用。

## 4. 影响圈与作者反证

打算改的：`ApiSettings.vue` 层选择控件、`provider.ts` 存量绑定清理与活跃供应商清单、`pipelineProviderChannels.ts` 资格解析、`PipelinePanel.vue` 执行前门、四组测试、Electron 验证器。

可能碰到的：导入旧配置、保存供应商用途、Agent 显式绑定优先级、run 快照观测字段、安装包封装。

作者反证：

1. 假设“UI 改成按钮面板就等于支持多绑定”。证伪：旧 `selectPipelineLayer` 会先清空该供应商已有层再绑定，单选控件语义会回退多绑定；本轮删除该清理循环并新增多绑定/单层解绑用例。
2. 假设“generate 资格守 UI 就够了”。证伪：导入 detect-only 供应商配置会形成孤儿绑定；本轮在导入、保存、loadProviders、执行前四处收口。
3. 假设“孤儿绑定最多触发 missing 警告”。证伪：供应商存在但不支持 generate 时不会 missing，会一路走到物理请求前；本轮新增 `providerUnsupported` 并在双断言入口阻断。

## 5. 停止条件

1. 同一供应商多层同时 `is-on`，store 中多键指向同一 id；再点单层只清该层。
2. 导入/保存失去 generate 资格的供应商时自动解绑并出现用户可读提示。
3. Agent、层、全局三种来源解析到非 generate 供应商时，请求前显式失败，不发起物理请求。
4. 定向测试、全量服务测试、类型检查、mock Electron、live Electron、构建封装全部通过。
5. 版本 3.110.4、经验 v9.6.6、DEV_LOG 与索引、干净工作区完成。

## 6. 执行证据

- 定向测试：`npm run test:services -- src/components/settings/ApiSettings.spec.ts src/stores/provider.spec.ts src/services/pipelineProviderChannels.spec.ts src/services/pipelineProviderChannelRouting.spec.ts` → `Test Files 4 passed (4)`，`Tests 25 passed (25)`。
- 全量测试：`npm run test:services` → `Test Files 220 passed (220)`，`Tests 2379 passed (2379)`。
- 类型：`npm run type-check` → exit 0。
- mock Electron：`node scripts/verify-pipeline-provider-channel-electron.mjs` → `[PASS] ... mode=mock-four-layer-providers; requests=3`。
- live Electron：`$env:SHENYI_PROVIDER_CHANNEL_LIVE='1'; $env:SHENYI_PROVIDER_CHANNEL_LIVE_PROVIDER='新供应商'; node scripts/verify-pipeline-provider-channel-electron.mjs` → `[PASS] ... mode=live-single-supplier; requests=3`；`successfulRequests=3`，model `deepseek-v4-pro`，三面同源 trace/apiCall/provider-request。
- 多绑定 UI：`src/components/settings/ApiSettings.vue:31-62` 按钮面板；`togglePipelineLayer` 见 `src/components/settings/ApiSettings.vue:296-306`。
- 执行前门：`src/components/pipeline/PipelinePanel.vue:951-967`、`src/components/pipeline/PipelinePanel.vue:1035-1050`。
- 资格解析：`src/services/pipelineProviderChannels.ts:68-98` 新增 `providerUnsupported`，missing 优先。
- 存量清理：`src/stores/provider.ts:82-92`、`src/stores/provider.ts:116-126`。
- 封装：`npm run build` exit 0；`dist/神意助手-Setup-3.110.4.exe` 231,615,334 bytes，SHA256 `DF7E5E1455EE287509321E23A810B6F693BF43EE473281C87125870F395352CA`；`dist/latest.yml` version 3.110.4；exe FileVersion/ProductVersion 3.110.4。

## 7. 缺口清单

- live 第一次复跑时正文层真实供应商流式请求 300 秒未终态，脚本按超时失败退出；现场显示卷纲/章节层成功、正文层停在 `requesting`，无应用异常。复跑通过后判定为供应商流式停摆边界，未定位为产品回归；已在本 DEV_LOG 保留失败与复跑双证据。
- live 环境仍只有单一 generate 供应商，多供应商分流由 mock 四供应商矩阵证明，不冒充 live 多供应商。
- 未执行 NSIS 人工安装路径核验；本轮只核验安装包产物、版本、latest.yml 与哈希。
