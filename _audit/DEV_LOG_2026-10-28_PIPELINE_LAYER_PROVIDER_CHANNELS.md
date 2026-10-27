# DEV LOG: 2026-10-28 生成流水线分层供应商通道收口

## 1. 目标

执行已确认方案 `_audit/PROPOSAL_2026-10-27_PIPELINE_LAYER_PROVIDER_CHANNELS.md`：生成流水线 `settings / volumes / chapters / body` 四层分别绑定供应商；优先级单源为 Agent 显式绑定 > 层绑定 > 全局生成供应商；绑定失效在请求前显式失败；run 创建时冻结供应商配置；不改变 V3.3 并行骨架。

## 2. 交付内容

- `src/services/pipelineProviderChannels.ts`：层枚举、优先级解析、快照构造与层配置归一化。
- `src/stores/provider.ts`：`pipelineLayerProviders` 持久化、供应商删除时清理层绑定。
- `src/stores/pipeline.ts`：run 级供应商通道快照冻结，排队 run 激活前保持隔离。
- `src/services/providerRouter.ts`：显式 providerId 失效从静默回退改为抛错。
- `src/services/realSkillTypes.ts` / `skillRouter.ts` / `realSkillExecutor.ts`：Agent `providerId` 真实透传到 `callAi`。
- `src/components/pipeline/PipelinePanel.vue`：run 快照解析、folder 与非 folder 双路径、正文辅助修复跟随 body 层通道；删除旧 `activeProviderId()` / `activeProviderModel()` 语义；trace 记录 `pipeline-provider-channel-resolved`。
- `src/services/aiService.ts`：DiagLogger 记录 `providerSource`。
- `src/components/settings/ApiSettings.vue`：设置页四层通道配置、缺失警告与删除清理后的恢复。
- `scripts/verify-pipeline-provider-channel-electron.mjs`：mock 四供应商矩阵与 live 单供应商矩阵双模式验证。
- 对应单测：`pipelineProviderChannels.spec.ts`、`pipelineProviderChannelRouting.spec.ts`、`providerRouter.spec.ts`、`pipeline.providerChannel.spec.ts`、`provider.spec.ts`、`realSkillExecutor.spec.ts`。
- `package.json`：新增 `verify:provider-channel-electron` 与 `verify:provider-channel-live` npm script。

## 3. 验证矩阵

| 面 | 结果 | 证据 |
|---|---|---|
| 全量回归 | PASS：218 files / 2361 tests 全部通过 | `npx vitest run` |
| 类型检查 | PASS：exit 0 | `npx vue-tsc --noEmit` |
| 真实 Electron UI + mock 四供应商 | PASS：`requests=3`，三层物理请求分别携带 `Bearer local-volumes / local-chapters / local-body` | `_audit/verification-pipeline-provider-channel/` |
| 层路由 trace | PASS：三层均有 `pipeline-provider-channel-resolved`，`source:"layer"`，providerId 与层绑定一致 | 三层 trace json |
| 绑定失效 | PASS：删除供应商后 UI warning，持久化保留 `provider-deleted`；恢复供应商后 warning 清空 | `electron-run.log` |
| live 真实供应商 | PASS：`mode=live-single-supplier`，三层 run 均 succeeded，`successfulRequests:3`，模型 `deepseek-v4-pro` | `_audit/verification-pipeline-provider-channel-live/report.json` |
| 正文契约重试 | PASS：首轮 2642 字 < 2800 字下限，按“失败指标、不传旧稿”语义重试后成功 | live trace |
| key 安全 | PASS：脚本仅记录 `keyLength:51`，无 key 明文落日志或证据 | live 证据目录 |

## 4. 验证器修正记录

- mock 断言判据从 provider-id 正则改为 `request.layer + apiKey` 双证据。
- `reloadApp` 增加 provider store hydration `waitForFunction`，消除设置页告警断言竞态。
- 失效场景允许原生 `<select>` 回落空 option；warning 才是验证目标。
- live 恢复夹具用 `live-shared-key` 占位，并为并行 run 启动增加 300ms 点击间隔。
- 层终态等待 90 秒提升到 300 秒，覆盖 live 契约重试时间。
- live 层证据改用 trace `pipeline-provider-channel-resolved source=layer`，不再依赖 key 命名。

## 5. 经验回写

经验文件升级 v9.6.1 -> v9.6.2：G1.5 新增供应商通道验证判则，覆盖物理请求双证据、reactive-over-IPC、原生 select fallback、live 单供应商诚实边界与并行 UI 点击启动窗口。

## 6. 诚实边界

- live 环境当前只配置了一个 generate 供应商，因此 live 证明的是“层绑定 + 真实供应商 + trace 来源”闭环；四层不同供应商分流由 mock 四供应商矩阵证明，不冒充 live 多供应商。
- 风格分析是 step 0 辅助路径，不属于四层通道目标，保持全局行为。
- 本轮未改变 V3.3 RunRegistry、目标锁、取消隔离与 provider 调度语义。

## 7. 封装与仓库收口

- 版本：`3.109.0` -> `3.110.0`。
- 台账：`_audit/TASK_LEDGERS/2026-10-27_PIPELINE_LAYER_PROVIDER_CHANNELS.md`。
- 安装包与哈希：见第 8 节封装核验。

## 8. 封装核验

- 版本一致性：`package.json` = 3.110.0；`package-lock.json` 顶层与根包均为 3.110.0；`dist/win-unpacked/神意助手.exe` FileVersion/ProductVersion 均为 3.110.0。
- 安装包：`dist/神意助手-Setup-3.110.0.exe`，231,611,929 bytes，SHA256 `E1111D8F9B53E54DEA817C9FDF7540889BD677FD02E0C76E641B394B1D5660E1`。
- `dist/latest.yml`：version 3.110.0，path `shenyi-assistant-setup-3.110.0.exe`，size 231,611,929。
- `dist/win-unpacked/resources/app.asar` SHA256：`826E534DC9B043D3DDA2773FF30E67842C2046F8E05CA8EE4C6E5248A8B53C7A`。
- 构建命令：`npm run build`（`vite build`、`vite build --config vite.protocols.config.mts`、`electron-builder --win`）exit 0。
- 回归：构建前 `npx vue-tsc --noEmit` exit 0；`npx vitest run` 218 files / 2361 tests 全部通过；`package.json` / `package-lock.json` JSON 解析通过。
- 收尾清理复核：旧 `3.109.0.exe`、旧 blockmap、`_data/pipeline-provider-channel-profile`、`_data/pipeline-provider-channel-live-profile` 均不存在；`dist` 仅保留 3.110.0 一套安装包。mock/live 证据目录为不可再生的本轮验收证据，按验证门保留。

## 9. 3.110.1 模型轴收口

- 交付：`resolvePipelineRequestProfile` 统一解析层供应商模型与 Agent 模型，输出 `model / modelSource / modelMissing / modelSupported / modelFallback`。Agent 显式 provider+model 优先；Agent 只填 model 时回退层供应商，并记录 `agent-model-fallback` trace；Agent model 不在层供应商清单时显式 request-blocking 失败；供应商无模型清单时标记 `modelMissing`。
- 执行合同：`realSkillExecutor` 新增 `providerModel / providerModelSource / providerModelFallback / providerModelMissing`，只有流水线显式传入且解析为空时才在请求前失败；非流水线旧调用不误伤。
- 消费线：PipelinePanel folder、非 folder agent 变体、正文最小修复、硬信号修复四条路径全部迁移 profile；`pipeline-provider-channel-resolved` 与 `agent-model-fallback` trace 补 `layer + step`。
- UI/配置：层绑定只允许选择 generate 用途供应商；导出/导入包含 `providers / generateProvider / pipelineLayerProviders`；缺失绑定导入后显示页面警告，兼容旧纯数组格式。
- 验证器：`verify-pipeline-provider-channel-electron.mjs` 升级为三面同源断言，trace 事件、apiCall 与物理请求体必须同 layer 同 model；profile 事件补 `layer` 字段并修复 `providers` 作用域缺陷。
- 回归：`npx vitest run src/services/pipelineProviderChannels.spec.ts src/services/realSkillExecutor.spec.ts` 70/70；`ApiSettings.spec.ts` 3/3；`npm run type-check` exit 0；`npm run test:services` 219 files / 2370 tests 全部通过；`npm run build:vue` 成功；`npm run verify:provider-channel-electron` PASS，`requests=3`，三层模型断言在 report 中。
- 诚实边界：本轮 live 单供应商矩阵未重跑；上版 3.110.0 live PASS 证明 providerId 路由，本轮新增 model 轴由 mock 四供应商矩阵与三面同源断言证明。风格分析 step 0 辅助路径仍走全局供应商，属设计内。
