# 产物有效性与状态一致性修复方案

日期：2026-09-12  
版本：待审核，未执行  
证据样本：`C:/Users/凯瑞/Desktop/SKILL调试文件/run-trace-卷纲层-20260912-050116-deep/`  
经验基线：`_audit/神意开发经验总结_v4.md`  
当前版本：3.38.1，审核通过后目标版本 3.38.2

## 一、结论

这轮暴露的不是“又一个卷纲层 BUG”，而是应用缺少一层统一验收概念：**产物有效性**。

此前系统把“请求没有抛异常”当成“生成成功”，但真实模型存在一种状态：`finish_reason=length`、`completion_tokens=16384`、reasoning 上万字符、正文 0 字符。也就是模型把全部输出预算消耗在思考里，正文一个字没产出。当前链路会把这个结果继续传给下一步，最后 run 还显示 `success`。

同时存在第二类问题：folder 诊断层知道结果是 `degraded`，但 run 级、API 级、UI 级大量把非 failed 折叠成 `success`，导致 SKILL 制作方无法从运行记录判断真实质量。

第三类问题是 folder 模板优先级实现错误：真实 folder 包没有 `resources` 时，`template.md` 不会优先生效，实际用的是流水线 catalog 模板。

## 二、证据

### 1. 空正文被判定为成功

样本内 4 次 API 调用出现：

- `finish_reason=length`
- `completion_tokens=16384`
- `responseText` 长度 0
- reasoning 长度分别为 10492、31632、28450、30479、4990、12648、1176、27207 字符
- run 级最终仍显示 `success`

相关代码：

- `src/services/providerAdapter.ts:151-166`：`resolveFinishReason()` 在 `hasText=false` 时直接返回 `stop`，导致 usage 兜底永远不生效。
- `src/services/providerAdapter.ts:92-97`：非流式提取在正文为空时会把 `reasoning_content` 复制为 `text`，存在“把思考当正文”的风险。
- `src/services/aiService.ts:241-303`：流式解析同样在正文为空时回退到 reasoning。
- `src/services/realSkillExecutor.ts:524-616`：`result.text` 为空时仍进入 postProcess / validation；无 schema 时 `valid=true`，空输出被接受。
- `src/components/pipeline/PipelinePanel.vue:1684-1691`：folder 结果映射为 `result.status === 'failed' ? 'failed' : 'success'`，blocked/degraded/空输出全部吞掉。

### 2. degraded 被吞成 success

- `src/components/pipeline/PipelinePanel.vue:1756-1777`：folder `degraded` 只追加一行步骤日志。
- `src/stores/runTrace.ts:99`：run 状态类型只有 `success | failed | canceled`。
- `src/stores/runTrace.ts:878-912`：API 状态沿用同一套类型，事件级别只区分 success 与 error。
- `src/composables/useSkillTest.ts:232-243`：trace 包装器把所有未抛异常的调用固定写 `success`。
- `src/services/folderSkillEval.ts:356-405`：把 folder `degraded` 折叠为评测 `success`。
- `src/components/pipeline/PipelinePanel.vue:2338-2346`、`2461-2469`、`3376-3385`：直接 API 调用成功回写 trace 时不检查空正文和 finishReason。

### 3. folder template 优先级错误

`src/services/realSkillExecutor.ts:417-443`：

```ts
const useFolderTemplate = hasFolderTemplate && (pkg.resources?.length || 0) > 0
```

真实 folder 包没有 resources 时，`useFolderTemplate=false`，实际选择流水线传入的 base template，并写入误导性诊断 `base-template-applied`。

现有测试 `realSkillExecutor.spec.ts:409、435` 反而在断言这个错误行为，属于测试跟着错误实现走。

### 4. 失败提示对用户不可理解

`workspaceSkillEngine.ts` 与 `OutlineWorkspace.vue` 对空输出统一抛出“API 返回为空”。用户无法区分：

- 模型真的没有回答
- 模型思考耗尽 token
- 供应商返回异常结构

进度弹窗在长时间只有 reasoning、没有正文时也不给阶段提示，客户体感就是“卡死 4 分钟”。

## 三、全应用同类风险扫描

本轮共扫描约 50 处 `callAi` 相关调用点。按风险分级如下。

### 高风险

| 位置 | 问题 |
| --- | --- |
| `src/services/realSkillExecutor.ts:524-616` | folder 主执行器不校验空正文；空输出进入 postProcess 和 chain |
| `src/services/providerAdapter.ts:151-166` | 空正文短路成 `stop`，掩盖 token 耗尽 |
| `src/components/pipeline/PipelinePanel.vue:1684-1777` | folder blocked/degraded/空输出被折叠为 success 或仅日志 |
| `src/stores/runTrace.ts:99、878-912` | 状态模型没有 degraded，无法记录半成品 |

### 中风险

| 位置 | 问题 |
| --- | --- |
| `src/services/workspaceSkillEngine.ts:614-796` | 已有空输出抛错，但无原因分类；run meta 的 degraded 也可能被上层吞掉 |
| `src/composables/useSkillTest.ts:232-243` | 技能测试 trace 固定写 success |
| `src/services/folderSkillEval.ts:356-405` | degraded 折叠成 success，评测结果偏乐观 |
| `src/components/pipeline/PipelinePanel.vue:2338-2346` | 直接调用 API 后不检查空正文/length |
| `src/components/pipeline/PipelinePanel.vue:2461-2469` | 同上 |
| `src/components/pipeline/PipelinePanel.vue:3376-3385` | 正文最小编辑路径同样固定 success |
| `src/services/providerAdapter.ts:92-97`、`aiService.ts:241-303` | 空正文时可能把 reasoning 当正文返回 |

### 低风险但必须统一

| 位置 | 问题 |
| --- | --- |
| `src/composables/useAiTools.ts:38-82` | 返回 `text \|\| null`，不携带 finishReason，调用方只能报“生成失败” |
| `src/composables/useDeAi.ts:53-80` | trace 成功状态不看空正文 |
| `src/components/chat/ChatPanel.vue`、`src/components/common/OutlineWorkspace.vue` | 已有终态回写，但状态分类依赖上游，需接入统一分类 |
| `src/services/namingService.ts`、`src/services/memoryExtractor.ts` | 空输出会走各自失败路径，但错误信息不分原因 |

### 已有正确基础

- `src/services/skillOrchestrator.ts:281-315`：composite 链已经把“degraded 且无输出”阻断，可以作为状态语义参考。
- `src/stores/runTrace.ts:878-912`：终态保护已经存在，success 不能覆盖 canceled/failed，只需扩展 degraded。
- `src/services/continuation.ts`、`continuationService.ts`：已有续生成模型，可作为“部分正文 + length”的恢复路径。

## 四、修复设计

### P0-1：建立统一产物有效性分类

新增 `src/services/generationValidity.ts`：

```ts
export type GenerationValidityKind =
  | 'usable'
  | 'truncated'
  | 'reasoning_exhausted'
  | 'empty'
  | 'canceled'
  | 'error'

export interface GenerationValidity {
  kind: GenerationValidityKind
  usable: boolean
  message: string
}
```

输入：

- `text`
- `reasoning`
- `finishReason`
- `usage`
- `maxTokens`

判定规则：

1. `finishReason=length` 且正文非空：`truncated`，可续生成。
2. `finishReason=length` 且正文为空、reasoning 非空：`reasoning_exhausted`，不可作为产物。
3. 正文为空且无 reasoning：`empty`。
4. `canceled`：用户取消。
5. 其余异常：`error`。
6. 正文非空且 finishReason 正常：`usable`。

不做任何阈值猜测：只依赖显式 finishReason，或 usage completion_tokens 达到 maxTokens 的确定性证据。

### P0-2：修正 finishReason 归一化

修改 `providerAdapter.ts`：

1. `resolveFinishReason()` 的 `hasText` 短路逻辑改为：
   - 显式 `length/max_tokens/max_output_tokens` 优先返回 `length`。
   - 空正文时不再直接返回 `stop`。
   - 空正文 + completion_tokens 达到 maxTokens 时返回 `length`，由上层有效性分类器判定 `reasoning_exhausted`。
2. 删除“正文为空时把 reasoning 复制为 text”的回退：
   - `extractNonStreamText()` 只返回正文。
   - `parseSSEStream()` 只把 content 累计为正文。
   - reasoning 保持独立字段，供运行记录和诊断使用。
3. `aiService` 不负责业务重试，只保证 finishReason、usage、reasoning 完整向上传递。

### P0-3：folder 执行器产物有效性门

修改 `realSkillExecutor.ts`：

1. 在 postProcess 之前执行 `classifyGenerationValidity()`。
2. `reasoning_exhausted` / `empty`：
   - 不进入 postProcess。
   - 记录诊断 `generation-invalid:{kind}`。
   - 触发一次“直出模式重试”：在 system prompt 末尾追加明确指令，要求跳过内部思考过程、直接输出正文。
   - 重试仍为空则返回 `failed`，错误信息写明“模型思考耗尽输出预算，未生成正文”。
3. `truncated` 且已有正文：
   - 不丢弃正文。
   - 记录诊断 `generation-truncated`。
   - 触发续生成请求，合并正文，合并处做边界去重。
   - 续生成后仍截断则返回 `degraded`，保留可用正文。
4. `usable` 才进入现有 postProcess / schema validation。
5. postProcess 产生 blocking issue 时，不允许被后续 schema 分支覆盖成有效输出。

### P0-4：folder template.md 真正优先

修改 `realSkillExecutor.ts:417-443`：

1. `useFolderTemplate = hasFolderTemplate`，不再要求 resources 存在。
2. folder 有模板且流水线传入 base template 时：
   - 使用 folder `template.md`。
   - 将流水线已解析变量注入 folder 模板。
   - 诊断改为 `folder-template-priority`。
3. 删除误导性 `base-template-applied` 诊断。
4. folder 无模板时才使用 base template，诊断保留 `base-template-fallback`。
5. `preProcess.templateOverride` 仍保持最高优先级，用于脚本动态改写模板。

### P0-5：状态一致性与 runTrace 降级态

修改 `src/stores/runTrace.ts`：

1. run 状态和 API 状态扩展为 `success | degraded | failed | canceled`。
2. `finishApiCall()` 接受 degraded：
   - 事件类型 `api-degraded`。
   - 事件级别 warning。
   - 展示文案“完成（降级）”。
3. run 终态规则：
   - 任一 API failed，run failed。
   - 无 failed，任一 API degraded 或 folder diagnostics degraded，run degraded。
   - 用户取消优先 canceled。
   - 全部 success 才是 success。
4. trace 保留 `finishReason`、`usage`、reasoning 长度与预览，方便 SKILL 层判断模型行为。

修改 `PipelinePanel.vue`：

1. `finishFolderTraceFromResult()` 状态映射：
   - failed/blocked -> failed
   - degraded + 空输出 -> failed
   - degraded + 有输出 -> degraded
   - success -> success
2. folder 诊断、API 终态、run 终态三者使用同一状态来源，不再各自判断。
3. 步骤 UI 在 degraded 时显示黄色降级态，不再只打一行日志。

修改其他固定 success 的 trace 回写：

- `useSkillTest.ts`
- `useDeAi.ts`
- `PipelinePanel.vue:2338、2461、3376`
- `folderSkillEval.ts`

统一规则：回写前必须调用产物有效性分类；`reasoning_exhausted/empty` 写 failed，`truncated/degraded` 写 degraded。

### P0-6：用户可见的失败原因

新增统一错误文案：

- `reasoning_exhausted`：模型思考耗尽输出预算，未生成正文；已重试 1 次仍失败。
- `truncated`：输出被截断，已自动续写合并；如仍不完整，请减少单步任务量或提高 maxTokens。
- `empty`：模型没有返回正文，请检查模型/供应商配置。
- `error`：保留原始错误。

进度弹窗增加阶段提示：

1. 收到 reasoning 但未收到正文时，显示“模型思考中，尚未输出正文”。
2. 有效性门失败时立即结束弹窗，不再等待后续步骤。
3. degraded 时弹窗显示降级原因摘要。

## 五、测试与真实用户验证

### 单元测试

新增/修改：

1. `providerAdapter.spec.ts`
   - 空正文 + length + usage 达上限 -> `length`
   - 空正文 + 无 usage -> `stop`
   - 非流式空正文不复制 reasoning 为 text
   - 流式空正文不复制 reasoning 为 text
2. `generationValidity.spec.ts`
   - 六种分类全覆盖
   - finishReason 优先级
3. `realSkillExecutor.spec.ts`
   - 空正文 + reasoning_exhausted：重试一次，仍空则 failed
   - 重试后产生正文：success
   - 截断正文：续写合并，不丢正文
   - folder 无 resources 时仍优先 template.md
   - 删除 `base-template-applied` 断言，改为 `folder-template-priority`
4. `skillRouter.spec.ts`、`skillOrchestrator.spec.ts`
   - folder failed/blocked/degraded 状态原样向上传递
5. `runTrace.spec.ts`
   - degraded API、degraded run
   - failed 优先于 degraded
   - success 不能覆盖 canceled/failed/degraded
6. `folderSkillEval.spec.ts`
   - degraded 不再折叠为 success

### 回归命令

```powershell
npm run type-check
npm run test:services
npx vitest run src/services/providerAdapter.spec.ts src/services/realSkillExecutor.spec.ts src/services/skillRouter.spec.ts src/services/skillOrchestrator.spec.ts src/stores/runTrace.spec.ts
```

注：`package.json` 中没有独立 `test` 脚本，回归使用上述真实存在的命令。

### Electron 真实用户路径验证

使用源码 Electron + 本地受控 OpenAI 兼容 SSE mock 服务，不依赖外部付费 API：

1. mock 场景 A：只发 reasoning，usage 达 maxTokens，finishReason=length  
   验收：步骤失败，run failed，错误文案明确，无空正文进入下一步。
2. mock 场景 B：先 reasoning 后正文，最后 finishReason=length  
   验收：显示“思考中”，随后正文滚动，trace 记录 reasoning 与正文，终态按截断处理。
3. mock 场景 C：folder 无 resources  
   验收：请求 system prompt 使用 folder template.md，trace 无 `base-template-applied`。
4. mock 场景 D：postProcess 返回 blocking issue  
   验收：folder 结果 failed/degraded，run 状态与 UI 一致。
5. 真实安装包冒烟：配置用户现有供应商后执行一次卷纲 folder chain  
   验收：导出运行记录，所有 API 均有终态、finishReason、usage、reasoning 长度；无空正文 success。

## 六、执行顺序

1. 新增 `generationValidity.ts` 与测试。
2. 修正 `providerAdapter.ts` 与 `aiService.ts` 的空正文/reasoning 归一化。
3. folder executor 接入有效性门、重试、续生成、模板优先级。
4. runTrace 增加 degraded，并统一 PipelinePanel 状态映射。
5. 修复 useSkillTest、useDeAi、folderSkillEval、直接 API trace 回写。
6. 补齐 UI 失败文案与进度阶段提示。
7. 执行全部单测、type-check、Electron 真实用户路径验证。
8. 更新开发日志、经验文件 v4。
9. 版本升级 3.38.2，封装安装包。

## 七、风险与回滚

- 不改 SKILL 内容，不改 folder 包格式，不改供应商配置格式。
- reasoning 不再冒充正文，可能导致部分依赖该回退的供应商路径暴露真实空输出；这是预期行为，错误信息会明确原因。
- run 增加 degraded 属于向后兼容扩展，导出 JSON 新字段可被旧读取端忽略。
- 改动集中在 providerAdapter、aiService、realSkillExecutor、runTrace、PipelinePanel 与少量 composable，出问题可按文件回滚。

## 八、经验文件回写点

执行完成后写入 `_audit/神意开发经验总结_v4.md`：

1. “请求成功”不等于“产物有效”；验收必须包含空正文、reasoning 耗尽、截断三类真实状态。
2. run 级状态必须由 API 级与 folder 诊断级共同归并，禁止上层把 degraded 折叠成 success。
3. folder template.md 的优先级不得附带 resources 条件；测试必须覆盖无 resources 的真实包形态。
4. mock 测试必须包含“有 reasoning、无正文”的供应商行为，否则会把模型缺陷伪装成应用成功。
