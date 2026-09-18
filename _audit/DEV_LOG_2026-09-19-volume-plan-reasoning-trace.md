# 2026-09-19 卷纲计划与 Reasoning Trace 修复开发日志

## 任务

针对 09-18 卷纲层运行记录暴露的问题完成两项修复：卷纲计划在生成、续生成、自动生成与模板上下文之间统一；reasoning 流式契约统一为 delta，并把最终思考全文回填到运行记录。

## 根因与修复

### 1. 卷纲计划分叉与超预算

问题：计划卷数、已生成卷数、每卷字数此前由多个入口各自计算，续生成时模板上下文可能仍按“计划总数”注入，导致已生成 3 卷后继续按全量计划生成，且单卷字数可能超出剩余预算。

修复：

1. 新增 `src/services/volumePlanIntegrity.ts`，统一输出计划卷数、已生成卷数、已分配字数、剩余字数、当前卷预算与冲突信息。
2. `src/services/volumeGeneration.ts` 的 prompt 构建消费同一份计划，显式注入 `[已生成卷数]`，计划冲突时输出 `[卷纲计划冲突]`。
3. `PipelinePanel.vue` 的模板上下文改为：`volumeCount = 已生成卷数`，`wordsPerVolume = 当前卷预算`。
4. single、continue、auto 三条写回路径统一调用 `clampVolumeWordsToPlan()`；发生钳制时写入 `volume-budget-clamped` trace 事件。

### 2. Folder 模板空变量

问题：folder 模板变量解析时 `null / undefined` 与“已知但为空”混在一起，占位符可能残留或被误判。

修复：`realSkillExecutor.ts` 的 `injectResolvedVariables()` 将空值归一为空字符串；已知但为空的变量渲染为 `未设置`，并记录 `template-variable-empty` 诊断。

### 3. Reasoning 契约分叉

问题：`onChunk` 与 `onReasoning` 的累计/delta 语义在服务层和记录层不一致。此前 trace 包装把 reasoning 混入正文累计缓冲，`appendReasoning()` 又尝试做前缀差分，导致思考流可能被重复拼接或漏记。

修复：

1. `aiService.ts`：`onReasoning` 只累计到独立 `reasoningBuffer`，不再写入正文 `streamBuffer`。
2. `runTrace.ts`：`appendReasoning()` 直接追加 delta，删除旧的前缀差分逻辑。
3. 全仓清零“cumulative reasoning”旧语义注释；`runTrace.spec.ts` 更新为 delta 契约。

### 4. Reasoning 最终全文回填

问题：流式 reasoning 被修正后，最终 `reasoningText` 只覆盖生成流水线，部分失败、降级和旁路入口缺现场。

修复：

1. `realSkillTypes.ts` 的 `apiMeta` 增加 `reasoningText`。
2. `realSkillExecutor.ts` 在 failed / degraded / success 三类返回中回填最终思考全文。
3. `PipelinePanel.vue` 三处 `onPhysicalCall` 映射与 folder、普通 agent、engine、大纲风格分析、正文降 AI 深度修复的 `finishApiCall` 均回填最终 reasoning。

### 5. M17 回头看补漏

回头看发现两个“主链路已修但旁路未接”的缺口：

1. 大纲工作台没有把 reasoning 写入 run trace。现在 `workspaceSkillEngine.ts` 增加 `onReasoning` callback，`OutlineWorkspace.vue` 的技能链路、直接对话、续生成全部接入 `appendOutlineReasoning()`。
2. 主页续生成路径没有 reasoning。现在 `continuationService.ts` 增加 `onReasoning`，`ChatPanel.vue` 续生成接入 `appendHomeReasoning()` 并在最终 trace 回填 `reasoningText`。

同时补齐 `workspaceSkillEngine` 的运行 meta `reasoningText`，folder、text、retry、compose 路径均回填；`onApiCallFinish` 的 result 类型增加 `reasoning`，供主页与大纲工作台回调使用。

### 6. M17 第二轮回头看补漏

继续审计发现流式 reasoning 的“过滤尾巴”分叉：`parseSSEStream()` 与 `streamViaMainProcess()` 在 `reasoningFilter.flush()` 时只把尾部内容发给 `onReasoning` 回调，没有并入返回值 `reasoning`。物理调用记录因包装层累计回调而完整，但最终逻辑 API call 用返回值回填，导致同一份思考在物理记录完整、在逻辑记录被截断。

修复：两条流式路径改为只累计过滤后的 reasoning 输出；`flush()` 尾巴同时追加到返回值与回调。UI、物理调用、逻辑 API call 三者现在消费同一份过滤后全文。

新增回归测试：

1. reasoning 含跨 chunk 标签时，回调 delta 拼接与最终 `reasoning` 完全一致。
2. reasoning 标签未闭合时，标签内容不进入正文，但完整进入最终 `reasoning`。

### 7. M17 第三轮修复前回头看：终态回填覆盖缺口

继续对账发现第二层同族缺陷：`runTrace.finishApiCall()` 与 `appendPhysicalCall()` 原先使用 `patch.reasoningText || call.reasoningText` 一类“非空即覆盖”的语义。修复后的服务层会回传完整过滤全文，但旧结构、重试、中断或旁路调用仍可能传入缺少 flush 尾巴的较短文本；此时完整 delta 累计值会被短文本覆盖，导致 UI 与物理记录完整、最终逻辑 API call 再次截断。

修复：

1. `finishApiCall()` 只在 `patch.reasoningText` 不短于当前累计值时替换；短旧版载荷保持现场。
2. `appendPhysicalCall()` 对同一 `physicalCallId` 的 reasoning 更新采用同一长度门，允许更长 canonical 全文替换局部累计，阻止短 legacy 载荷倒退。
3. 修复过程中暴露 `existing.reasoningText` 可为 `undefined` 的类型边界，统一按空串归一后再比较。

新增回归测试：

1. 短 legacy 最终 reasoning 不能覆盖已累计 delta。
2. 更长的 canonical 最终 reasoning 可以替换局部累计值。

### 8. M17 第四轮修复前回头看：物理记录终态载荷倒退

继续追查发现物理记录还有一组更隐蔽的覆盖缺口：

1. `aiService` 的重试循环在每个 attempt 开始时重置 `streamBuffer` / `reasoningBuffer`，但 `physicalCallId` 是 `physical-开始时间-attempt`；同一 attempt 会先以 running 上报，再在失败/取消时上报终态，同一物理记录会被多次更新。
2. `appendPhysicalCall()` 对 `responseText` / `streamText` 原先是“非空即覆盖”。running 事件携带空正文会清掉失败前已获得的正文；失败后的空 stream 也不会破坏旧流，但成功后如果出现迟到空回调，会把终态正文冲掉。
3. `running` 终态不可重开只保护了 status，不保护正文与流式现场。

修复：

1. `appendPhysicalCall()` 对 `responseText` / `streamText` 增加长度门与终态保护：已处于终态且后续为 running 时不覆盖；只有更长文本才允许覆盖当前现场。
2. 保留 reasoning 既有长度门，形成三个文本字段的统一“不倒退”策略。
3. 新增回归测试：running 部分流 + failed 终态正文 + 迟到 running 空载荷后，三者全部保留，status 保持 failed。

验证：`npm run test:services -- src/stores/runTrace.spec.ts src/stores/runTrace.integrity.spec.ts` 51 passed；`npm run type-check` exit 0。

### 9. M17 第五轮修复前回头看：旁路入口与续写现场

继续对账发现三类 reasoning 丢失入口：

1. 技能测试、智能体测试、评测、`useAiTools.callAi`、命名服务、记忆抽取的成功终态没有把 `result.reasoning` 写入 trace；trace 接口本身也缺 `reasoningText` 等终态字段。
2. `backfillApiResponseFromPhysicalCalls()` 只回填正文，不回填 reasoning；而 `finishApiCall()` 又只在正文为空时调用回填，导致“正文成功、思考为空”的逻辑记录无法从物理记录恢复现场。
3. `realSkillExecutor` 截断续写合并了 `text` / `usage` / `finishReason`，但 `reasoning` 被第一次调用值固定；续写成功后最终 `apiMeta.reasoningText` 不是 canonical 现场。

修复：

1. `useSkillTest.ts` 四处、`useAiTools.ts`、`namingService.ts`、`memoryExtractor.ts` 成功终态统一回填 `reasoningText`；命名与记忆 trace 接口补齐 `reasoningText` / `finishReason` / `usage` 字段。
2. `backfillApiResponseFromPhysicalCalls()` 同方向回填正文与 reasoning，且正文或 reasoning 任一为空都触发回填；已有值不被物理记录覆盖。
3. 截断续写合并结果时同步替换 `reasoning`，最终 `apiMeta.reasoningText` 取续写调用的 canonical 思考全文。

新增回归测试：物理记录 reasoning 回填到空逻辑记录；截断续写后 `apiMeta.reasoningText` 取续写调用值。

验证：`npm run test:services -- src/stores/runTrace.spec.ts src/stores/runTrace.integrity.spec.ts src/composables/useAiCallTrace.spec.ts src/services/namingService.spec.ts src/services/realSkillExecutor.spec.ts` 92 passed；`npm run type-check` exit 0。

### 10. M17 第六轮修复前回头看：DeAI 调用现场

对全部 `finishApiCall` 生产入口矩阵复核发现 `useDeAi.callAiApi()`：该入口已把 `result.reasoning` 送入产物有效性判定，但成功/降级终态没有回填 `reasoningText`，导致去AI味 API 调用的思考现场继续缺失。评测入口虽直接调用 `aiService.callAi`，但由 `useSkillTest` 的 traced service 包裹，已回填 reasoning；其余直接调用集中在 PipelinePanel、OutlineWorkspace、workspaceSkillEngine 主链路，均已回填。

修复：`useDeAi.callAiApi()` 成功/降级终态补 `reasoningText: traceResult.reasoning || ''`；失败分支保持失败现场，不虚构空思考。

验证：`npm run test:services` 72 files / 678 tests passed。

### 11. M17 第七轮修复前回头看：共享流式入口终态守卫

复核 PipelinePanel 的 `appendPipelineDelta` / `flushPipelineStreamState` 链路发现：流式 delta 已经同时进入 UI 预览、`appendStream()`、`appendReasoning()`，主链路并非只更新 UI。但 `renderPipelineStreamState()` 写入时读取的是 `currentApiCallId`，而调用方持有的可能是显式 `traceCallId`；同一步骤内连续调用时，A 调用的尾部 delta 可能在 B 调用开始后渲染并写错归属。同时，`appendReasoning()` 与 `appendCumulativeStream()` 都有 `running` 终态守卫，唯独共享入口 `appendStream()` 没有，终态后的迟到正文 delta 会继续污染已完成 API 记录。

修复：`appendStream()` 增加与 reasoning 一致的终态守卫，终态后迟到流式 delta 不再写入。这先封住共享层的倒退通道；按步骤缓冲到当前 call 的归属歧义需要 trace 状态持有显式 callId，属于结构改动，记录为后续审计项。

新增回归测试：终态后迟到 stream delta 不改变 `streamText` 现场。

验证：`npm run test:services -- src/stores/runTrace.spec.ts src/stores/runTrace.integrity.spec.ts` 53 passed。

## 验证

- `npm run test:services -- src/services/realSkillExecutor.spec.ts`：30 passed。
- `npm run test:services -- src/stores/runTrace.spec.ts`：45 passed。
- `npm run test:services -- src/services/aiService.spec.ts`：90 passed。
- `npm run test:services -- src/services/workspaceSkillEngine.spec.ts src/services/skillOrchestrator.spec.ts src/services/runTraceDiff.spec.ts`：51 passed。
- `npm run type-check`：exit 0。
- `npm run test:services`：72 files / 672 tests passed。
- `npm run test:services -- src/services/aiService.spec.ts`：92 passed。
- `npm run test:services`：72 files / 674 tests passed。
- `npm run test:services -- src/stores/runTrace.spec.ts src/stores/runTrace.integrity.spec.ts src/services/aiService.spec.ts`：142 passed。
- `npm run type-check`：exit 0。
- `git diff --check`：无 whitespace error，仅既有 CRLF 提示。
- `npm run build:vue`：exit 0；仅存在既有 dynamic import / chunk size 警告，非本轮错误。
- `npm run test:services -- src/services/volumePlanIntegrity.spec.ts`：6 passed。
- `npm run test:services -- src/services/volumeGeneration.spec.ts`：15 passed。
- `npm run test:services`（第七轮后全量）：72 files / 679 tests passed。
- `npm run type-check`（第七轮后全量）：exit 0。

## 版本收口

- `package.json` 版本从 `3.53.5` 升级为 `3.53.6`。
- `npm run build` 前端与 Electron 打包通过；首次打包因旧 `win-unpacked/神意助手.exe` 瞬时文件锁失败，确认无进程占用后重跑成功。
- 安装包产物：`dist/神意助手-Setup-3.53.6.exe`（129,843,291 bytes），NSIS 元数据 `FileVersion/ProductVersion=3.53.6`。

## 回头看结论

1. 全仓已无 “cumulative reasoning” 旧语义注释。
2. `appendReasoning()` 生产入口仅剩 PipelinePanel、OutlineWorkspace、ChatPanel 三处，全部为 delta 语义。
3. `reasoningText` 已覆盖 physical call 层（PipelinePanel、ChatPanel、OutlineWorkspace）与最终 API call 层（PipelinePanel、ChatPanel、OutlineWorkspace、realSkillExecutor、workspaceSkillEngine）。
4. 卷纲计划变量未发现第三入口残留旧语义，统一来源集中在 `volumePlanIntegrity.ts`、`volumeGeneration.ts`、`PipelinePanel.vue`。
5. 第二轮回头看发现并修复 `flush()` 尾巴未并入返回值的截断缺口；全量服务测试与类型检查通过。
6. 第三轮修复前发现终态回填的“非空即覆盖”旧语义，已改为长度门替换，并用两条回归测试锁定短 legacy 不覆盖、长 canonical 可替换。
7. 第四轮修复前发现同一物理请求的 running/终态回调会重置流缓冲，旧实现允许迟到空载荷冲掉终态正文与流现场；已改为文本不倒退策略并用回归锁定。
8. 第五轮修复前发现旁路入口、回填触发条件与截断续写三处 reasoning 现场缺口；已统一终态回填与同向物理回填，续写后保留 canonical reasoning。
9. 第七轮修复前发现共享流式入口 `appendStream()` 缺终态守卫；已与 reasoning 语义对齐并回归锁定。按步骤缓冲使用 `currentApiCallId` 的归属歧义列为后续结构审计项。
10. 第八轮回头看 `useAiCallTrace.finish()`、取消链路、active call 兜底与主页编辑器/设置页调用矩阵，未发现新缺口；按“一轮无新发现即停止”规则结束本轮循环。

## 经验回写

- 新增 M35 卷纲计划单一事实源门禁。
- 新增 §8 规则 125（多流契约分层）与规则 126（卷纲计划单一事实源）。
- 根因索引新增“流式契约跨字段误复制”“计划变量多源分叉”。
- 规则 125 补充：回调累计值与返回值不是天然同源，最终回填必须以同一份过滤后全文为准，并用回调拼接等于返回值做回归断言。
- 规则 125 继续补充：所有 `finishApiCall` 成功终态必须显式回填 `reasoningText`；物理记录回填必须同向覆盖正文与 reasoning，触发条件不能只看正文；多调用合并（重试/续写）后的最终 meta 必须使用最后一次有效调用的 canonical reasoning。
- 规则 125 继续补充：正文流式与 reasoning 流式在记录层必须拥有同样的终态守卫；禁止只有一个字段防迟到 delta、另一个字段可继续写入。UI 流式缓冲不得隐式依赖 `currentApiCallId` 归属，后续结构改动必须携带显式 callId。
