# 生成流水线分层供应商语义修复方案 V1

> 方案日期: 2026-11-04
> 方案目标: 修复生成流水线四层供应商绑定语义，使层绑定完整支配该层所有生成请求
> 核心裁决语义: **layer > agent > global**
> 状态: 待审核

---

## 1. 核心需求（固定不可偏移）

用户在设置页面的"生成流水线"用途选项中为四层（设定层/卷纲层/章节层/正文层）各自绑定供应商后：

1. 该层发起的**所有生成请求**（folder 链、非 folder 链、修复链、重试链）必须使用层绑定的供应商。
2. 裁决优先级固定为 **layer > agent > global**。
3. 层绑定存在但供应商不可用时：**显式失败**，禁止静默回退到 Agent 或全局。
4. 层绑定不存在时：正常走 Agent fallback → global fallback。
5. 不做自动切换供应商、不做健康检查系统、不新增复杂状态机。
6. 覆盖面包括 trace、UI 显示、导入导出、验证器和 Electron 端到端验证。

### 反向目标（明确不做）

* 不做多供应商自动负载均衡
* 不做供应商健康探测/切换
* 不做新增 ProviderScheduler 队列改造
* 不做 SKILL 层内供应商感知
* 不做供应商冗余备份

---

## 2. 已确认根因矩阵（9 项，全部有 file:line 证据）

| # | 根因 | 证据位置 | 严重性 |
|---|------|----------|--------|
| R1 | 裁决顺序错误：当前代码是 `agent > layer > global`，层绑定被 Agent 覆盖 | `src/services/pipelineProviderChannels.ts:64-70` | **P0 阻断** |
| R2 | folder 执行器二次覆盖层 profile：`realSkillExecutor` 在三个位置用 Agent profile 覆盖传入的层 profile | `src/services/realSkillExecutor.ts:1043,1076,1101` | **P0 阻断** |
| R3 | run 级冻结不完整：`PipelinePanel.vue:1148-1165` 只冻结 `layerProviderId` 和 `globalProviderId`，Agent fallback 不受层冻结约束 | `src/components/pipeline/PipelinePanel.vue:1148-1165` | P1 高 |
| R4 | 旧测试守护旧语义：现有测试断言 `agent > layer`，阻止新语义落地 | `src/services/pipelineProviderChannels.spec.ts:28-95`、`src/services/realSkillExecutor.spec.ts:174-549` | P1 高 |
| R5 | memoryExtractor 未接层 profile：`memoryExtractor.ts:55-70` 直接走 global/agent，不读取层绑定 | `src/services/memoryExtractor.ts:55-70` | P1 高 |
| R6 | 设置导入非 upsert：`ApiSettings.vue:619` + `provider.ts:161-165`，同 ID 重复导入会添加副本而非覆盖 | `src/components/settings/ApiSettings.vue:619`、`src/stores/provider.ts:161-165` | P2 中 |
| R7 | 连接测试只测 `/models`：不能证明生成凭证/chat completions 端点可用 | `src/services/aiService.ts:4503-4523` | P2 中 |
| R8 | trace 五面不同源：event/apiCall/physical/UI/导出五个视图各自从不同来源取 provider 信息，且缺 `providerSource` 字段 | `src/components/RunTracePanel.vue:206`、`src/services/runTraceExportService.ts:75` | P1 高 |
| R9 | 正文硬信号修复传 `agent=null`：`PipelinePanel.vue:6602` 无层绑定时跳过 Agent fallback，静默走 global | `src/components/pipeline/PipelinePanel.vue:6602` | P1 高 |

### 关键证据摘录

**R1 裁决顺序错误** (`pipelineProviderChannels.ts:64-70`):
```typescript
// 当前代码逻辑（伪码）
function resolveProfile(agentProfile, layerProfile, globalProfile) {
  if (agentProfile) return agentProfile;    // ← Agent 优先于层
  if (layerProfile) return layerProfile;
  return globalProfile;
}
```

**R2 folder 执行器覆盖** (`realSkillExecutor.ts:1043`):
```typescript
// 传入的 requestProfile 已携带层绑定，但执行器内部用 agentProfile 二次覆盖
const effectiveProfile = options.agentProfile ?? requestProfile ?? globalProfile;
```

**R3 run 冻结不完整** (`PipelinePanel.vue:1148-1165`):
```typescript
// 冻结只保存两个 ID，Agent fallback 未纳入
frozenProfile = {
  layerProviderId: ...,
  globalProviderId: ...,
  // 缺 agentProfileId
};
```

**R9 修复链断线** (`PipelinePanel.vue:6602`):
```typescript
// 正文修复传 agent=null，层不存在时直接走 global
callApi({ agent: null, layerProviderId, ... });
```

---

## 3. 全链路调用面矩阵

以下矩阵列出生成流水线中所有会发起 AI 请求的调用面及其当前状态：

| 调用面 | 位置 | 当前 provider 来源 | 目标来源 | 状态 |
|--------|------|-------------------|----------|------|
| folder S1/S2/S3/S4 生成 | `realSkillExecutor.ts:1030-1110` | Agent 优先 | layer > agent > global | 需修 |
| 非 folder 直连生成 | `PipelinePanel.vue:3982-3985` | 消费 request profile 但 resolver 优先级错误 | layer > agent > global | 需修 |
| 正文 targeted repair | `PipelinePanel.vue:6480-6602` | agent=null, 走 global | layer > agent > global | 需修 |
| 正文 word-gap repair | `PipelinePanel.vue:3053+` | 混合 | layer > agent > global | 需修 |
| 章节链修复 | `chapterBatchOrchestrator.ts` | 混合 | layer > agent > global | 需修 |
| memoryExtractor | `memoryExtractor.ts:55-70` | global/agent | 需裁决归属 | 待裁决 |
| finalDraftService | `finalDraftService.ts` | global | auxiliary/global（不继承层） | 需标记 |
| folderSkillEval baseline | eval 模块 | global | auxiliary（不继承层） | 需标记 |
| providerScheduler 队列 | `providerScheduler.ts` | 按 providerId 分队 | 不改（非根因） | 保留 |

### memoryExtractor 归属裁决

**建议： auxiliary/global（不继承层绑定）**

理由：记忆提取是全书级辅助操作，不属于某一层的"生成请求"语义。如果绑定到正文层，会导致：
1. 正文层生成被暂停等待记忆提取完成（串行化）
2. 正文层供应商的 token 预算被记忆提取占用
3. 切换正文层供应商时记忆提取结果不一致

**如果用户希望记忆提取跟随正文层**：需在设置中增加独立开关，默认 off。本方案 V1 按辅助路径处理。

---

## 4. 新裁决语义（layer > agent > global）

### 4.1 纯函数签名

```typescript
// src/services/pipelineProviderChannels.ts
interface ResolveProfileInput {
  layerProviderId: string | null | undefined;
  agentProfileId: string | null | undefined;
  globalProviderId: string | null | undefined;
}

interface ResolveProfileResult {
  providerId: string;
  source: 'layer' | 'agent' | 'global' | 'none';
  /** trace 用的原始输入快照 */
  candidates: ResolveProfileInput;
}

function resolvePipelineProfile(input: ResolveProfileInput): ResolveProfileResult {
  // 固定裁决顺序：layer > agent > global
  // 不允许任何调用方传入 overrides 改变此顺序
  if (input.layerProviderId) return { providerId: input.layerProviderId, source: 'layer', candidates: input };
  if (input.agentProfileId) return { providerId: input.agentProfileId, source: 'agent', candidates: input };
  if (input.globalProviderId) return { providerId: input.globalProviderId, source: 'global', candidates: input };
  return { providerId: '', source: 'none', candidates: input };
}
```

### 4.2 铁律约束

1. **裁决函数不允许有 `priority` 或 `order` 参数**。这是固定语义，不是可配置项。
2. **层绑定存在但供应商不可用时，resolve 返回 `{ source: 'layer', providerId, valid: false }`**，调用方必须显式失败，不得静默跳到 agent。
3. **Agent fallback 只在层绑定不存在时生效**，不存在"层绑定失效就降级到 Agent"的场景。
4. **`source` 必须写入 trace**，UI 和导出都从同一来源读取。

---

## 5. Run 级冻结语义修复

### 5.1 当前问题

`PipelinePanel.vue:1148-1165` 冻结 run 开始时的 provider 状态，但只冻结 `layerProviderId` 和 `globalProviderId`，Agent fallback 不受冻结约束。这意味着：
1. run 中途修改 Agent 设置，会影响该 run 中层绑定不存在的步骤
2. 但层绑定本身是冻结的，不会中途漂移

### 5.2 修复方案

**冻结 Agent fallback ID**，使完整三元组在 run 开始时全部固定：

```typescript
// PipelinePanel.vue
frozenProfile = {
  layerProviderId: currentLayerProviderId,   // 已有
  agentProfileId: currentAgentProfileId,     // ← 新增
  globalProviderId: currentGlobalProviderId, // 已有
};
```

### 5.3 不做的事

* 不冻结供应商的模型名/温度/token 上限（这些是步骤级参数，允许按步骤调整）
* 不冻结供应商的 API key（运行时从 store 读取，key 更新不应影响进行中的 run）

---

## 6. Folder 执行器修复

### 6.1 当前问题

`realSkillExecutor.ts` 在三个位置（1043/1076/1101）用 Agent profile 二次覆盖传入的层 profile。修复方式：

1. 函数签名改为接收 `ResolveProfileInput`（完整三元组），不再接收单独的 agentProfile。
2. 内部调用 `resolvePipelineProfile` 统一裁决。
3. 删除所有 `agentProfile ?? xxx` 模式的 fallback 覆盖。

### 6.2 签名变更

```typescript
// Before
interface ExecutorOptions {
  agentProfile?: string;       // ← 删除
  requestProfile?: string;     // ← 改名
  ...
}

// After
interface ExecutorOptions {
  profileInput: ResolveProfileInput;  // 完整三元组，由编排层传入
  ...
}
```

### 6.3 编排层传入

`PipelinePanel.vue` 在调用 folder 执行器时构造完整三元组：

```typescript
const profileInput = {
  layerProviderId: frozenProfile.layerProviderId ?? layerBindingMap.get(layerKey),
  agentProfileId: frozenProfile.agentProfileId,
  globalProviderId: frozenProfile.globalProviderId,
};
```

---

## 7. 非 Folder 链修复

### 7.1 当前状态

`PipelinePanel.vue:3982-3985` 的非 folder 直连路径已消费 request profile，但底层 `resolvePipelineProfile` 的裁决顺序错误（R1），所以层绑定被 Agent 覆盖。

### 7.2 修复方式

R1 修复后非 folder 链自动生效。需额外确认：
1. 直连路径的调用点都传入了 `layerProviderId`（不仅是 `agentProfileId`）
2. 修复链（targeted repair/word-gap）也使用同一 `resolvePipelineProfile`

---

## 8. 辅助外呼归属

| 路径 | 归属 | 处理方式 |
|------|------|----------|
| `finalDraftService.requestFinalDraft` | auxiliary/global | 显式标记 `source: 'auxiliary'`，不读层绑定 |
| `folderSkillEval` baseline | auxiliary | 同上 |
| `memoryExtractor.unifiedMemoryAiCall` | auxiliary/global | 同上（见 §3 裁决理由） |

**处理方式**：这三个调用点在发起请求时传 `layerProviderId: null`，`resolvePipelineProfile` 自动降级到 agent/global。trace 中 `providerSource: 'auxiliary'`。

---

## 9. 设置导入 upsert

### 9.1 当前问题

`ApiSettings.vue:619` 导入供应商配置时调用 `provider.addProfile()`，`provider.ts:161-165` 中 `addProfile` 直接 push，同 ID 重复导入会添加副本。

### 9.2 修复方案

新增 `upsertProfile` 方法到 provider store：

```typescript
// src/stores/provider.ts
function upsertProfile(profile: ProviderProfile) {
  const idx = state.profiles.findIndex(p => p.id === profile.id);
  if (idx >= 0) {
    state.profiles[idx] = { ...profile };  // 替换
  } else {
    state.profiles.push({ ...profile });   // 新增
  }
}
```

`ApiSettings.vue` 导入逻辑改调 `upsertProfile`。

### 9.3 保留字段策略

导入 upsert 时保留原 profile 的以下字段（导入数据不覆盖）：
* `enabled` 状态
* `models` 列表（如果导入数据中 models 为空）
* `lastTestResult` / `lastTestAt`

其余字段（name、baseUrl、apiKey、headers、notes、purpose）以导入数据为准。

---

## 10. 生成探针（连接测试升级）

### 10.1 当前问题

`aiService.ts:4503-4523` 连接测试只调 `/models`，不能证明 chat completions 端点和生成凭证可用。

### 10.2 修复方案

新增 `testGenerationProbe` 方法：

1. 发送一条最小 chat completion 请求（`max_tokens: 8`，`messages: [{ role: 'user', content: 'Reply OK' }]`）
2. 如果返回有效响应 → 连接测试通过
3. 如果返回 401/403/404/429 → 连接测试失败，显示具体错误
4. `/models` 测试保留为预检（检查 baseUrl 格式和基础连通性），生成探针为最终判定

### 10.3 UI

在供应商卡片的"测试连接"按钮旁增加"测试生成"按钮。测试结果显示：
```
✓ /models 连通  ✓ 生成探针通过 (42ms, model: gpt-4o)
```

### 10.4 自动探针

生成流水线 run 启动前，如果启用的层绑定供应商从未通过过生成探针，自动执行一次。失败时弹窗提示但不阻断（用户可选择继续）。

---

## 11. Trace 五面同源

### 11.1 当前问题

五个 trace 视图（event/apiCall/physical/UI/导出）各自从不同来源取 provider 信息，且缺 `providerSource` 字段。

### 11.2 修复方案

1. 所有 trace 写入点统一使用 `resolvePipelineProfile` 的结果，记录完整 `providerSource`。
2. `runTrace.ts` 的新增字段：`providerSource: 'layer' | 'agent' | 'global' | 'auxiliary' | 'none'`。
3. `RunTracePanel.vue:206` 显示改为从同一结构读取。
4. `runTraceExportService.ts:75` 导出时包含 `providerSource`。

### 11.3 同源验证

Electron 验证脚本中增加断言：同一 step 的 event/apiCall/physical/UI/export 五面中 `providerId` 和 `providerSource` 完全一致。

---

## 12. 测试迁移

### 12.1 现有测试的处置

| 文件 | 当前断言 | 处置 |
|------|----------|------|
| `pipelineProviderChannels.spec.ts:28-95` | 断言 `agent > layer` | **删除**，替换为新语义测试 |
| `realSkillExecutor.spec.ts:174-549` | 多处断言 agent fallback 优先 | **删除相关 case**，替换 |

### 12.2 新测试矩阵

| 测试 | 输入 | 期望 |
|------|------|------|
| layer 存在时优先于 agent | layer=A, agent=B, global=C | source=layer, providerId=A |
| layer 缺失时走 agent | layer=null, agent=B, global=C | source=agent, providerId=B |
| layer 和 agent 都缺失时走 global | layer=null, agent=null, global=C | source=global, providerId=C |
| layer 存在但供应商不存在 | layer=missing-id, agent=B | source=layer, valid=false, 显式失败 |
| 全部缺失 | 三项都 null | source=none |
| run 冻结包含 agentProfileId | run 开始后改 Agent 设置 | run 中不变 |
| folder 执行器不覆盖层 profile | 传入 layer=A + agent=B | executor 内部 source=layer |
| 非 folder 直连消费层 profile | 同上 | 同上 |
| 修复链使用层 profile | targeted repair + layer=A | source=layer |
| memoryExtractor 不继承层 | layer=A | source=auxiliary/global |
| 设置导入 upsert | 同 ID 导入 | profiles.length 不变，内容替换 |

---

## 13. Electron 端到端验证

### 13.1 脚本扩展

`scripts/verify-pipeline-provider-channel-electron.mjs` 已有四层 mock 模式。需增加：

1. Agent 与层绑定冲突场景：设置层=A + Agent=B，验证实际请求走 A
2. Agent 覆盖层绑定的负向断言：验证不会走 B
3. 修复链场景：触发 targeted repair，验证修复请求走层绑定
4. 辅助链路场景：触发 memoryExtractor，验证走 global
5. 导入 upsert 场景：导入同 ID 配置，验证 profiles.length 不变
6. trace providerSource 同源断言：五面对比

### 13.2 验证模式

| 模式 | 说明 | 判定 |
|------|------|------|
| mock | 无网络请求，拦截 fetch 验证 URL/headers | 断言 providerId |
| live | 真实供应商，发送最小请求 | 断言响应来源和 trace 记录 |

---

## 14. 真实供应商验证

1. 在设置中添加至少 2 个供应商（不同 baseUrl）
2. 卷纲层绑定供应商 A，章节层绑定供应商 B
3. 分别触发一次生成，从 trace 确认：
   * 卷纲层的请求发到 A 的 baseUrl
   * 章节层的请求发到 B 的 baseUrl
   * `providerSource` 均为 `layer`
4. 断开 A 的网络（或填错 apiKey），重跑卷纲层 → 验证显式失败，不走 Agent/global

---

## 15. 旧语义清零

### 15.1 搜索模式

修复完成后用以下模式搜索，确认无残留：

```
rg -n "agent.*priority|agent.*first|agent.*before.*layer" src/
rg -n "agentProfile\s*\?\?" src/services/ src/components/
rg -n "agent.*fallback.*before|agent.*override.*layer" src/
```

### 15.2 语义清零定义

1. 所有 `agentProfile ??` fallback 模式已删除
2. 所有测试中 `agent > layer` 的断言已删除
3. `resolvePipelineProfile` 唯一裁决入口，无旁路
4. trace/UI/导出五面均显示 `providerSource`

---

## 16. 四层成熟度评级（G0.6）

| 层级 | 评级 | 理由 |
|------|------|------|
| 执行器/工具层 | **成熟** | 纯函数修改，调用面已扫完，根因明确，测试矩阵完整 |
| 应用方案/交互闭环 | **成熟** | UI 改动点已定位（设置导入、trace 显示、生成探针按钮），行为清晰 |
| 实现接线 | **成熟** | 所有 file:line 已确认，签名变更方向清晰，无半猜 |
| 验证标准 | **成熟** | Electron mock + live 双模式 + 五面同源 + 负向断言 + 旧语义清零 |

**结论：四层均成熟，可进入执行。**

---

## 17. 执行顺序

| Phase | 内容 | 涉及文件 |
|-------|------|----------|
| A | 修 `resolvePipelineProfile` 裁决顺序 + 删旧测试 | `pipelineProviderChannels.ts`, `pipelineProviderChannels.spec.ts` |
| B | 修 folder 执行器签名 + 删 agentProfile 覆盖 | `realSkillExecutor.ts`, `realSkillExecutor.spec.ts` |
| C | 修 run 冻结 + 编排层传入 + 修复链 | `PipelinePanel.vue` |
| D | 修 memoryExtractor + 辅助路径标记 | `memoryExtractor.ts`, `finalDraftService.ts` |
| E | 设置导入 upsert | `provider.ts`, `ApiSettings.vue` |
| F | 生成探针 | `aiService.ts`, `ApiSettings.vue` |
| G | trace 五面同源 | `runTrace.ts`, `RunTracePanel.vue`, `runTraceExportService.ts` |
| H | Electron 验证脚本扩展 | `scripts/verify-pipeline-provider-channel-electron.mjs` |
| I | 真实供应商验证 + 旧语义清零搜索 | 全局 |
| J | 经验文件更新 + 开发日志 + 封装 | `_audit/`, `package.json`, electron builder |

每 Phase 完成后运行 `npm test` 确认不引入新 fail。

---

## 18. 停止条件

以下任一条件触发时停止执行，报告用户：

1. 修改 `resolvePipelineProfile` 后，发现存在超过 10 个调用方需要同步改签名 → 停，重新评估
2. folder 执行器删除 agentProfile 后，发现非供应商链（如 embedding/分类）也依赖此字段 → 停，需拆分
3. trace 五面同源改造涉及超过 5 个独立 store → 停，重新评估范围
4. Electron mock 模式下无法拦截实际请求 → 停，报告

---

## 19. 风险反推

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| 裁决顺序改变后某些旧链路隐式依赖 agent 优先 | 中 | 高 | R4 中已列出旧测试位置，同批删除；新增负向断言 |
| folder 执行器签名变更导致编译错误蔓延 | 中 | 中 | TypeScript strict 模式，编译器自动定位所有调用点 |
| run 冻结新增 agentProfileId 后，中途改 Agent 的用户期望破坏 | 低 | 低 | 这是修正而非破坏；freeze 语义本就应该是完整的 |
| memoryExtractor 归属裁决用户不同意 | 低 | 低 | 可后续加开关，不影响主修复 |
| 生成探针在某些供应商上超时或格式不兼容 | 中 | 低 | 超时设 15s；探针失败不阻断 run 启动 |
| trace 五面同源改造遗漏某个视图 | 低 | 中 | Electron 脚本五面对比断言兜底 |

---

## 20. 方案自检清单

1. 核心需求固定为 §1，不偏移
2. 9 项根因全部有 file:line 证据
3. 全链路调用面矩阵已扫完（含辅助路径分类）
4. 新裁决语义有明确签名和铁律
5. run 冻结完整性已补
6. folder 执行器修复方案有签名变更方向
7. 非 folder 链 + 修复链已覆盖
8. memoryExtractor 归属有裁决理由
9. 设置导入 upsert 有保留字段策略
10. 生成探针有 UI 和自动探针设计
11. trace 五面同源有验证方案
12. 测试矩阵覆盖所有分支（含负向）
13. Electron mock + live 双模式
14. 真实供应商验证步骤
15. 旧语义清零搜索模式
16. 四层成熟度均为"成熟"
17. 执行顺序分 Phase，每 Phase 有测试门
18. 停止条件明确
19. 风险反推 6 项含缓解
20. 无过度设计：不做负载均衡、不做健康系统、不做自动切换、不做冗余备份
21. 无状态机新增：裁决为纯函数，无异步等待
22. 遵循 G0.13 防过度设计门禁
