# 2026-10-27 生成流水线分层供应商通道任务台账

## 1. 目标与原话

用户原话：「确认」。

本轮执行已审核方案：`_audit/PROPOSAL_2026-10-27_PIPELINE_LAYER_PROVIDER_CHANNELS.md`。

目标契约：生成流水线 `settings / volumes / chapters / body` 四层可分别绑定供应商；并行运行时每层请求走自己的供应商通道。优先级单源为 Agent 显式绑定 > 层绑定 > 全局生成供应商；显式绑定失效必须在发请求前失败，禁止静默回退；run 开始时冻结供应商配置；不改变 V3.3 并行骨架。

## 2. 门禁读证

读证文件：`_audit/神意开发经验总结_v9.md`（当前版本 v9.6.1）。

- G0.1 目标对齐：实现、验证、收尾均对应分层供应商通道目标，不扩成供应商自动切换。
- G0.3 诚实闭环：mock、类型检查、真实 UI、live 证据分开登记；未验证不得说完成。
- G0.5 回头看：收尾前对账 Agent/layer/global 优先级、folder 与非 folder 双路径、正文辅助修复旁路、trace/DiagLogger、设置页、旧语义清理。
- G0.10 新旧并存清零：`activeProviderId()` / `activeProviderModel()` 的 step 0 旧语义不得残留。
- G0.11 真实 UI 交互：设置页层通道必须用真实 Electron 窗口操作验证，禁止注入状态冒充。
- G0.12 门禁执行台账：本台账七节齐全，执行中持续补证据。
- G2.9 流水线域：不改变 RunRegistry、目标锁、取消隔离。
- G2.11 供应商域：显式 providerId 失效必须抛错；用途路由仅用于未显式指定时的回退。

## 3. 路由判定

加入门禁：G0.1、G0.3、G0.5、G0.10、G0.11、G0.12、G1.1、G1.8、G2.9、G2.11。

排除项及理由：

- G0.2 无预算铁律：用户此前已明确不设预算，本轮不设置 token/时间预算。
- G0.8 收尾清理：进入收尾阶段后清理本任务产物；不回退无关历史改动。
- G1.12 封装：实现、验证、日志更新完成后再统一封装。

## 4. 影响圈与作者反证

改动面：

- `src/services/pipelineProviderChannels.ts`：层枚举、优先级解析、run 冻结快照。
- `src/stores/provider.ts`：层绑定持久化与删除清理。
- `src/services/providerRouter.ts`：显式 providerId 失效抛错。
- `src/services/realSkillTypes.ts` / `skillRouter.ts` / `realSkillExecutor.ts`：providerId 透传。
- `src/components/pipeline/PipelinePanel.vue`：run 冻结、folder/非 folder 双路径解析、正文辅助修复、trace、旧语义清理。
- `src/services/aiService.ts`：DiagLogger 记录 providerSource。
- `src/components/settings/ApiSettings.vue`：层通道配置 UI。
- 对应测试与验证脚本。

作者反证：

1. 假设 executor 是唯一漏传点。证伪：`rg "callAi("` 全量对账，PipelinePanel 内仍有非 folder 直连、正文辅助修复、风格分析三类入口；风格分析为 step 0 辅助路径，不属于四层通道，保持全局行为。
2. 假设层绑定不会影响并行骨架。证伪：不改 RunRegistry 与目标锁，层解析结果只进入 request providerId、trace 和 configSnapshot。
3. 假设全局供应商可以兜底失效层绑定。证伪：`providerMissing` 必须在请求前抛错；显式 providerId 在 providerRouter 同样抛错，形成双保险。

## 5. 停止条件

1. 四层 run 启动时均冻结层/全局/供应商存在性快照。
2. folder 与非 folder 路径按冻结快照解析 providerId；Agent 显式绑定优先且真实传入 callAi。
3. `providerMissing` 与空全局供应商在请求前显式失败，无静默回退。
4. 正文降AI深度修复与硬信号修复跟随 body 层通道。
5. trace 与 DiagLogger 能区分 agent/layer/global 来源。
6. 设置页可配置四层通道，删除供应商时清理绑定，缺失绑定有警告。
7. 单测、类型检查、全量测试、真实 UI、live 多供应商验证全部有新鲜证据。
8. 旧 `activeProviderId()` / `activeProviderModel()` 语义清零。
9. DEV_LOG、MASTER_INDEX、经验文件、版本号、封装、工作区收尾完成。

## 6. 执行证据

（执行中填写，禁止提前填 PASS。）

### 2026-10-28 基础切片复核

- `git status --short`：确认基础切片已存在，包含 provider store、providerRouter、realSkill 透传、三份新测试与方案文件。
- `src/services/pipelineProviderChannels.ts`：已有 `resolvePipelineProviderChannel()`、`normalizePipelineLayerProviders()`。
- `src/components/pipeline/PipelinePanel.vue`：确认 `activeProviderId()` 固定读 step 0，是当前旧语义来源；正文辅助修复仍被该旧路径覆盖。

### 2026-10-28 实现完成验证

- `npx vitest run` → `Test Files 218 passed (218)`，`Tests 2361 passed (2361)`。
- `npx vue-tsc --noEmit` → exit 0，无类型错误。
- `node scripts/verify-pipeline-provider-channel-electron.mjs` → exit 0，输出 `[PASS] layer provider UI, persistence, warnings, and routing verified; mode=mock-four-layer-providers; requests=3`。
  - 证据目录：`_audit/verification-pipeline-provider-channel/`
  - `settings-before-real-operation.json`：初始四层均为空。
  - `settings-after-real-operation.json`：四层分别绑定 `provider-settings / provider-volumes / provider-chapters / provider-body`。
  - `electron-run.log`：`save-settings-operation` 为 `saveResult:{"ok":true}`；删除 `provider-body` 后 warning 为 `["body"]`，持久化绑定保留 `provider-deleted`；恢复后 warning 清空。
  - `provider-requests.json`：三层请求分别携带 `Bearer local-volumes / local-chapters / local-body`，且 `layer` 与 key 匹配。
  - `volumes-trace.json`、`chapters-trace.json`、`body-trace.json`：均有 `pipeline-provider-channel-resolved`，事件 `source:"layer"`，且 providerId 与层绑定一致。
- `SHENYI_PROVIDER_CHANNEL_LIVE=1 node scripts/verify-pipeline-provider-channel-electron.mjs` → exit 0，输出 `[PASS] layer provider UI, persistence, warnings, and routing verified; mode=live-single-supplier; requests=3`。
  - 证据目录：`_audit/verification-pipeline-provider-channel-live/`
  - 内置供应商 key 来源于 `%APPDATA%\shenyi-assistant\data\wa_providers.json`，源状态 `encrypted`，通过 DPAPI helper 解密；脚本只记录 `keyLength:51`，未记录 key 明文。
  - `report.json`：`requestCount:3`，`successfulRequests:3`，`model:"deepseek-v4-pro"`，三层 run 均 `status:"succeeded"`。
  - trace 证据同样证明三层 `pipelineProviderChannel.source:"layer"` 且无 `providerMissing`。
  - live 为单供应商矩阵（用户当前仅有一个 generate 供应商），多供应商分流由 mock 四供应商矩阵证明；此边界如实登记，不冒充 live 多供应商。
- 脚本修正记录（验证过程发现，不影响应用实现）：
  - mock 请求判据从错误的 provider-id 正则改为 `request.layer + apiKey` 双证据。
  - `reloadApp` 增加 provider store hydration `waitForFunction`，消除设置页告警断言竞态。
  - live 代理复用真实供应商，替换 mock 层名匹配逻辑；`startLayerRun` 增加点击间隔，防止并行 UI 点击吞掉后续 run 启动。
  - 层终态等待从 90 秒提高到 300 秒；live 首轮正文 2642 字低于 2800 字契约，应用按“失败指标、不传旧稿”语义重试后成功，该重试链路获得真实覆盖。

## 7. 缺口清单

### 2026-10-28 收口更新

- DEV_LOG：`_audit/DEV_LOG_2026-10-28_PIPELINE_LAYER_PROVIDER_CHANNELS.md` 已建立，并含完整验证矩阵与封装核验。
- MASTER_INDEX：末尾已登记本轮 DEV_LOG、台账、范围、验证、诚实边界、封装与经验版本。
- 经验文件：升级 v9.6.1 -> v9.6.2，G1.5 新增供应商通道验证判则。
- 版本与封装：`package.json`、`package-lock.json` 均为 3.110.0；`dist/神意助手-Setup-3.110.0.exe` 已生成并核验（版本、latest.yml、asar、SHA256）。
- 清理：旧 3.109.0 安装包/blockmap 与两个验证 profile 均已删除并复核不存在；mock/live 证据目录保留。
- 工作区：提交前 `git status --short` 确认本轮脏区全部属于分层供应商通道任务；提交后复核干净。
