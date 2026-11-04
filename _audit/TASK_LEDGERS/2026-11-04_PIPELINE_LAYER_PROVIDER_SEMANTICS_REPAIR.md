# 2026-11-04 生成流水线分层供应商语义修复任务台账

## 1. 目标与原话

用户原话：「所以问题很严重因为一开始的目的就是和全局有相同的能力，现在你告诉我能力只做了一半？ 你深入诊断给我出具一个成熟的修复方案」。

最终可感知行为：生成流水线 `settings / volumes / chapters / body` 四层绑定供应商后，层绑定必须真实支配该层所有生成请求；Agent 只能在未配置层绑定时作为次级来源；最后才是全局生成供应商。层供应商凭证或模型失效时明确失败，不静默回退。

本轮交付物：全链路诊断、成熟修复方案、验证矩阵与执行边界。用户确认前不改生产代码。

## 2. 门禁读证

读证文件：`_audit/神意开发经验总结_v9.md`，当前正文版本 v10。

- G0.1 目标对齐：方案必须对应“四层供应商与全局同等可用”的原始目标，禁止只修 UI 或单一执行入口。
- G0.3 诚实闭环：mock、源码断言、真实 Electron、真实供应商分层声明，不得互相冒充。
- G0.5 回头看：收尾前对账配置、执行、调度、trace、导出、测试、验证器七面。
- G0.6 方案成熟度：执行器/工具层、应用交互、接线、验证标准四层分别评级。
- G0.7 正反推研磨：目标倒推、爆炸半径、正推证据、反推质询必须锚定真实入口。
- G0.9 影响圈声明：先列改动面与旁路面，未列入影响圈不碰。
- G0.10 新旧并存清零：旧 `agent > layer > global` 语义必须在源码、测试、脚本、文档、trace 消费面同批退役。
- G0.12 门禁执行台账：本台账七节齐全并持续补证据。
- G0.13 最小必要性：不做自动切换供应商、不做健康系统、不引入额外状态。
- G1.4 验证真实性：真实 UI 与真实供应商请求必须分层登记。
- G1.5 验证器质量：供应商通道必须断言 trace、apiCall、物理请求三面 `providerId + model` 同源。
- G1.8 日志与观测同步：新增/变更来源字段必须覆盖生产事件、存储、导出与验证器。

## 3. 路由判定

加入门禁：G0.1、G0.3、G0.5、G0.6、G0.7、G0.9、G0.10、G0.12、G0.13、G1.1、G1.4、G1.5、G1.8。

排除项及理由：

- G0.2 无预算铁律：用户已长期明确不设预算，本轮不设置预算，也不以消耗为由中断。
- G0.8 收尾清理：本轮为方案审核前只读诊断，暂不进入产物清理。
- G1.12 封装：用户确认并执行修复后才升版封装。

## 4. 影响圈与作者反证

打算改的（待用户确认）：

- `src/services/pipelineProviderChannels.ts`：裁决顺序与请求 profile。
- `src/services/realSkillExecutor.ts`：移除 Agent 对 caller profile 的二次覆盖。
- `src/components/pipeline/PipelinePanel.vue`：run 冻结、folder/非 folder、修复、辅助路径统一消费。
- `src/services/aiService.ts`：连接测试语义与 trace 投影。
- `src/stores/runTrace.ts` / `electron/ipc/runTrace.js`：三面同源导出。
- `src/components/settings/ApiSettings.vue`：导入、覆盖导入、删除、用途变更闭环。
- 相关 spec 与 Electron 验证脚本。

可能碰到的：

- Agent 模型与层供应商模型不一致时的模型回退。
- run 级冻结是否包含 Agent fallback。
- 风格分析、大纲分析等辅助生成入口是否属于层语义。
- 旧测试与旧验证脚本仍守护 Agent 覆盖层绑定。
- 客户安装包 trace 与当前源码投影不一致。

作者反证：

- 假设“UI 已配置层绑定即生效”。证伪：`realSkillExecutor.callAi` 仍用 `agent?.providerId || options.providerId`，Agent 可覆盖层绑定。
- 假设“连接测试通过即可生成”。证伪：`testConnectionForProvider` 主要调用 `/models`，只有 404/405 才做最小对话请求，不能证明生成凭证可用。
- 假设“调度器导致全局失败”。证伪：providerScheduler 按 providerId 分队列，不同供应商可并行；本次失败是层供应商凭证 401。

## 5. 停止条件

1. 裁决语义在纯函数、执行器、UI、trace、测试、验证器六面一致为 `layer > agent > global`。
2. 四层所有生成请求均消费同一 caller profile 的 `providerId + model`。
3. 层绑定失效、凭证失败、模型缺失均显式失败并带层名，不静默回退。
4. trace 事件、apiCall、物理请求三面同源，导出可读。
5. 真实 Electron UI 配置冲突场景与真实供应商请求验证通过。
6. 旧 `agent > layer > global` 执行语义与守护测试清零。
7. DEV_LOG、经验文件、版本、封装、提交完成。

## 6. 执行证据

### 2026-11-04 只读诊断

- `src/services/pipelineProviderChannels.ts:64-98`：当前裁决顺序为 Agent > 层 > 全局。
- `src/services/realSkillExecutor.ts:1043-1077`：物理请求与 contextComposition 均使用 `agent?.providerId || options.providerId`。
- `src/services/realSkillExecutor.ts:1101`：providerSource 在 Agent 存在时强制写 `agent`。
- `src/services/aiService.ts:4503-4523`：连接测试主要测 `/models`，仅 404/405 回退最小对话请求。
- `src/stores/provider.ts:165-194`：删除供应商会清理层绑定；导入与用途变更闭环仍待审计。
- `src/stores/runTrace.ts:1872-1944`：物理调用已有 `finalUrl`、`contextComposition` 等字段；客户 trace 缺字段原因仍待对账。

## 7. 缺口清单

### 2026-11-04 执行后补充证据

- Phase H 修复辅助记忆 trace 断链：`src/services/memoryExtractor.ts:37-44` 在 `UnifiedMemoryAiCallTrace.beginApiCall` 声明 `providerSource`，`:64-70` 发起逻辑调用时写入 `auxiliary`；`src/composables/useAiCallTrace.ts:37-43` 补齐 `AiApiCallOptions.providerSource` 类型并透传 store。
- 真实 Electron UI 验证：`npm run build:vue` exit 0；`node scripts/verify-pipeline-provider-channel-electron.mjs` 输出 `[MODE] mock local providers`、`[PASS] layer provider UI, persistence, warnings, and routing verified; mode=mock-four-layer-providers; requests=4`；`report.json` 中 volumes/chapters/body 三个 run 的 `pipelineProviderChannel.source` 均为 `layer`，辅助记忆逻辑与物理请求 `providerSource` 均为 `auxiliary`。
- 旧语义清零：`rg -n "resolvePipelineProfile|resolveProviderChannel|agentProviderId|agentProfileId|layerProviderId" src` 显示 `pipelineProviderChannels.ts:70-88` 先 layer、后 agent、再 global；未发现 `agent > layer` 执行残留。
- 回归：`npx vitest run` → `Test Files 247 passed (247)`，`Tests 2653 passed (2653)`。
- 类型修复后：`npx vue-tsc --noEmit` exit 0。修复内容包括 `AiApiCallOptions.providerSource` 缺失类型和探针 spec 中不属于 `ProviderLike` 的 `models` 字段。

### 执行前快照（遗留项已在本轮解除）

- 生产代码未修改，方案待用户审核。
- 需继续审计：所有 provider/model 影响面、run 冻结边界、设置导入/覆盖/用途变更、trace 导出投影、旧测试与 Electron 验证脚本。
- 真实多供应商验证尚未执行；本轮不得声称修复完成。

### 2026-11-04 收尾证据刷新

- 全量回归复跑（spec 修复后新鲜证据）：`npx vitest run` → `Test Files 247 passed (247)`，`Tests 2653 passed (2653)`。
- `npx vue-tsc --noEmit` exit 0（无输出）。
- `package.json` 与 `package-lock.json` 根包版本同步为 `3.113.0`。
- `npm run build` 与 `npm run verify:packaging` 证据见下一节。

### 2026-11-04 封装与产物核验

- `npm run build` exit 0；NSIS 阶段 `rcedit` 两次 `Unable to commit changes` 后自动重试，最终产物构建成功。
- `npm run verify:packaging` 输出 `PACKAGING 3.113.0 VERIFICATION PASSED`；安装包 `dist\神意助手-Setup-3.113.0.exe`，字节数 `231664620`，SHA-256 `a1d22e8f7672e8f48701f26f006a7ee6be191bf24c1b0eb63b35b1ac88131aab`；renderer files `87`，electronAPI methods `94`。
- 已清理 `dist\神意助手-Setup-3.112.0.exe` 与同名 blockmap；`3.110.6` 历史产物按既有边界保留。

### 2026-11-04 回头看缺口闭环

1. 缺口 1 已补：真实 Electron UI 验证新增导入同 ID upsert、生成探针、运行记录层绑定来源三条 DOM 断言。复跑输出 `[PASS] layer provider UI, persistence, warnings, and routing verified; mode=mock-four-layer-providers; requests=6`。
2. 缺口 2 已闭：旧 report 的 `runtimeFingerprint.appVersion=3.112.0` 登记为构建时序产物；本轮 `build:vue` 后 `_audit/verification-pipeline-provider-channel/body-trace.json:21-23` 已为 `appVersion=3.113.0`，不是功能版本回退。
3. 缺口 3 维持：`3.110.6` 安装包受 ACL 锁定，按既有边界保留，不作为本轮改动对象。
4. 顺手修复溯源接缝：`ApiSettings.vue` 三个 infra 测试显式 `providerSource=none`；`useAiCallTrace.begin()` 不再丢弃 options 中的 `providerSource`；`runTrace.startApiCall()` 将通道裁决后的来源安全回填到 run 级。
5. 全量回归：`npx vue-tsc --noEmit` 与 `npx vitest run` 复跑证据见下一节。

### 2026-11-04 HEAD 回归修因与收口

- `src/services/realS2ProtectedContract.integration.spec.ts:56-74` 的旧候选样本是一整段重复文本；活体 Vivid-SKILL 0.4.1 的 `checkAuthorBaselineCalibration` 会将其判为 `段落中位3500字，高于作者基准P95上限51`，导致 HEAD 既有回归。A/B stash 复跑证明与供应商溯源修复无关。
- 已把上导游离样本改为 80 段、净字数 3200，候选改为 88 段、净字数 3500；样本使用确定性唯一汉字并保留 40 字中位段长，避免依赖随机语料。原测试目标（重复【正文交接】折叠后受保护契约仍位于提示词末尾）未变。
- 收口证据：`npx vitest run src/services/realS2ProtectedContract.integration.spec.ts` → `Tests 1 passed`；`npx vitest run` → `Test Files 247 passed (247)`、`Tests 2653 passed (2653)`；`npx vue-tsc --noEmit` exit 0；`npm run build:vue` exit 0。
