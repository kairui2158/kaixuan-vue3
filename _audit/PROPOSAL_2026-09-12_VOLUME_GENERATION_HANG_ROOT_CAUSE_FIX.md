# 3.38.2 卷纲生成挂死事故根因修复方案

> 状态：待审核，未执行任何业务代码修改
> 日期：2026-09-12
> 事故范围：安装版 3.38.2，卷纲层 folder chain 生成，S2 出现长时间 reasoning-only 后应用挂死，用户强制关闭

## 1. 事故结论

这次不是单一 Bug，而是四层问题叠加，其中三层属于应用必须修，一层属于流程必须修。

| 层级 | 事实 | 责任 |
|---|---|---|
| 模型层 | `glm-5.3-sp` 在 S2 把 16384 completion tokens 全部耗在 reasoning，正文为空；首次 294796ms 空正文，直出重试又 240363ms 空正文，重启后可复现 | 模型行为，但应用必须能承受 |
| 应用执行层 | `src/services/realSkillExecutor.ts:606-620` 检测到 `reasoning_exhausted/empty` 后静默追加一次直出重试，无 UI 状态、无 runTrace 事件、无用户提示 | 必修 P0 |
| 渲染层 | `src/services/aiService.ts:237-303/660-720` 每个流式回调都传累计全文并执行 `filterThinkingTags`；`src/components/pipeline/PipelinePanel.vue:999-1035` 每个 chunk 再全量过滤、截尾 500 字、更新响应式数组、触发 `autoScrollLog`。长 reasoning 流近似平方级开销，渲染进程约 1.08GB 内存、累计 CPU 418 秒，最终 Windows Application Hang 1002 / AppHangB1 | 必修 P0 |
| 发布验证层 | 3.38.2 的产物有效性门已有单测，但没有覆盖长 reasoning 流性能、真实 UI 长任务、安装版体感，因此单测绿灯但生产挂死 | 必修流程门 |

### 1.1 为什么“闭环了还会炸”

这是用户质问的核心，方案必须正面回答：

1. **验证等级不匹配。** 3.38.2 验证的是“空正文判 failed、直出重试、truncated 续写合并”的功能正确性；事故需要的是“16384 token reasoning-only 长流下 UI 不挂”的性能正确性。功能闭环不等于压力闭环。
2. **失败路径没有用户可见性。** 重试逻辑在执行器内部追加，UI 与 runTrace 都不知道它发生了。用户看到的“卡死”其实是“模型空转 + 静默重试 + 渲染压力”的组合，但没有任何一层把状态讲清楚。
3. **历史设计遗留的语义错位。** `onChunk/onReasoning` 从一开始就是累计全文语义，早期短请求下没人察觉；运行记录深度化后存储层已在 `src/stores/runTrace.ts:843-869` 转增量，但 UI 消费方仍是全量处理。等于把最贵的 O(n²) 工作留给了渲染进程。
4. **大方案连续叠加，缺少发布级回归矩阵。** Folder 协议、意图路由、产物有效性、trace 深度化各自有自己的验收标准，但没有一个统一的“发布前必须过”的矩阵把性能、失败路径、安装版、三入口 API 全部锁住。

## 2. 修复目标

1. 长达 16384 token 的 reasoning-only 流不会把 UI 压死，进程 CPU/内存保持线性。
2. 任何静默重试都必须变成可见状态：进度弹窗、气泡、运行记录三处至少可见其一。
3. 失败必须快速、明确、可恢复，不再出现 8 分 36 秒无反馈等待。
4. 发布声明必须由“发布验收矩阵”支撑，不允许单测通过就宣称闭环。

## 3. P0-1 流式管道改为 delta 语义

### 现状

- `parseSSEStream` 与主进程流桥在每次 delta 到达时回调累计全文：`src/services/aiService.ts:265/275/279/291/295/693/697`。
- 每次回调都对累计全文执行 `filterThinkingTags`（3 个正则全量替换）：`src/services/aiService.ts:219-223`。
- trace 包装层把回调语义注释为累计全文：`src/services/aiService.ts:1141-1152`。

### 改法

1. 协议解析器内部保留累计缓冲，对每个 delta 只做局部 thinking-tag 过滤；无法确定标签跨块时保留小块尾部缓冲，流结束后 flush。
2. `onChunk/onReasoning` 统一改为 delta 语义，并在 `AIRequestParams` 注释与类型文档中写死：**回调只传新增文本**。
3. trace 包装层同步简化：收到 delta 直接 `streamBuffer += delta`，不再做前缀比较。
4. 所有消费方逐一对账改造：
   - 流水线：`PipelinePanel.vue:1770-1781、2378-2389、2506-2517`
   - 主页聊天：`ChatPanel.vue:838-841、1837-1840、2014-2017`
   - 大纲工作台：`OutlineWorkspace.vue:1971-1974、2497-2500、2733-2736`
   - 续写链：`continuationService.ts:29-32` 与两个 `continueSnapshot` 消费点
   - Folder 执行器透传：`realSkillExecutor.ts:576-577`
   - 工作台技能引擎：`workspaceSkillEngine.ts:570-573、726-729`
   - 意图路由透传：`skillRouter.ts:121-122`
5. 为防止第三方协议或未来代码误传累计值，在服务边界增加一次性防御：若回调文本以已输出累计文本为前缀且长度显著增加，记录 warning 并按 delta 处理；不做永久双语义兼容。

### 验收

- 单测：OpenAI-compatible、Anthropic、Gemini 三协议各构造 3000 个 delta，断言回调只传新增文本、最终 text/reasoning 与旧实现一致。
- 单测：`<think>` 标签跨 delta 边界拆开时最终过滤结果正确。
- 性能：mock 16384 token reasoning-only 流，回调总过滤成本为 O(n)，无每个 chunk 的全量正则扫描。
- 回归：三入口 UI 均按新增内容滚动显示，最终消息内容与改造前一致。

## 4. P0-2 UI 流式渲染节流

### 现状

- `appendPipelineReasoning` 每个 chunk 全量处理并触发 `autoScrollLog`：`PipelinePanel.vue:1020-1035、1085-1095`。
- 流水线日志数组是响应式数组，每次 chunk 都触发 Vue 依赖更新。
- 事故时渲染进程内存约 1.08GB、累计 CPU 418 秒，UI 无响应。

### 改法

1. `appendPipelineReasoning/appendPipelineStream` 改为 delta 累积 + 渲染节流：
   - 帧级合并（`requestAnimationFrame`）优先，兜底 50-100ms 定时合并。
   - 预览行固定维护最新 500 字，滚动仅在节流点执行一次。
   - 长流期间不重复扫描整个 logs 数组；marker 索引缓存在局部状态。
2. 聊天区与大纲工作台的流式消息同样通过 delta 累积 + 节流更新，禁止每个 chunk 直接 `updateLastMessage` / `streamingContent.value = text`。
3. `runTrace` 的 append 已是增量，保留现有语义，但从“每个 chunk 调一次”改为节流批次写入，避免高频 store 更新。
4. 请求结束、取消、异常时必须 flush 最后一次渲染与 trace 批次，防止丢尾。

### 验收

- mock 长流下 UI 主线程单帧 JS 时间低于 16ms，无连续 500ms 无响应窗口。
- 展示内容完整，不丢首尾 chunk；取消/失败路径也能 flush。
- 渲染进程内存增长与最终 reasoning 长度成线性关系，不随 chunk 次数平方增长。

## 5. P0-3 直出重试可见化

### 现状

- `realSkillExecutor.ts:606-620` 在 `reasoning_exhausted/empty` 后静默执行直出重试，UI 与 runTrace 均无事件。
- 用户感知为“什么都没发生”，与实际“正在重试一次 4 分钟模型调用”不一致。

### 改法

1. 增加执行器回调（或扩展现有 progress callback）：
   - `generation-invalid`：携带 kind、message、reasoning 长度、首次耗时。
   - `direct-retry-start`：明确提示“正文为空，已切换直出模式重试”。
   - `direct-retry-finished`：携带成功/失败与耗时。
2. Pipeline 弹窗、进度条、运行记录全部消费这些事件；runTrace 增加结构化事件，不允许只写普通日志行。
3. 请求开始前设置可取消状态；直出重试期间用户可点“取消”，应用立即终止请求并进入 failed，不等第二次 4 分钟。
4. 直出重试失败时错误消息给出明确行动指引：换模型、降低 maxTokens/推理配置、导出运行记录。

### 验收

- mock 空 reasoning-only 响应触发重试时，进度弹窗在 1 秒内出现重试状态。
- runTrace 导出包含三段事件与耗时，SKILL 调试方可以还原现场。
- 取消按钮能立即中止第二次调用，无残留 running API 记录。

## 6. P0-4 渲染进程资源守护

### 现状

- `electron/main.js:317-333` 已记录 render/child process gone 的 reason/exitCode，这部分不再重复修。
- 挂死前 8 分 36 秒没有应用内可观测的 CPU/内存与流式压力数据，无法提前告警。

### 改法

1. 主进程为每个窗口建立轻量资源采样器：长任务期间每 3-5 秒记录渲染进程 CPU、内存、每秒流式回调次数；结束或异常时写入诊断日志。
2. 设置压力阈值（初始 CPU 持续 >90% 或 5 秒内主线程无响应）时主进程写 `renderer-pressure-high` 诊断事件。
3. 第一版不做自动降级，只做观测与诊断，避免误杀正常长任务。

### 验收

- mock 长流期间诊断日志出现周期性资源采样。
- 事故复现路径中能观察到 `renderer-pressure-high` 与流式回调频率。
- 采样器随任务结束停止，空闲期不持续写日志。

## 7. P1-1 失败路径完整落 trace

### 改法

1. 直出重试、连续失败、取消、timeout、reasoning-only、degraded 全部落结构化事件。
2. runTrace API 记录补齐：请求开始/结束时间、duration、status、reasoning 长度、final text 长度、finish_reason、usage、重试阶段。
3. 与 `realSkillExecutor.ts` 返回的 `folderPackageCache/postProcessReport/apiMeta` 保持同源，不二次推断。

### 验收

- 导出的 JSON 可完整还原“首次空正文 → 直出重试 → 成功/失败”全过程。
- 三入口（流水线、大纲共创、主页对话）共用同一事件结构。

## 8. P1-2 发布验收矩阵

这一项是流程根因的防线，以后所有版本封装前必须执行。

| 门 | 内容 | 通过标准 |
|---|---|---|
| G1 功能回归 | 相关 vitest 套件 + type-check + build | 0 failure，无类型错误 |
| G2 压力基准 | mock 16384 token reasoning-only + 高频 delta | UI 无响应窗口 <500ms，资源线性增长 |
| G3 失败路径 | 空 reasoning-only、timeout、取消、连续失败、degraded | 每条路径可见、可取消、trace 完整 |
| G4 真实 UI | 源 Electron + mock provider 真实操作 | 三入口 API 流式、重试、取消、导出全部真实点击验证 |
| G5 安装版实测 | 3.38.x 安装版同场景操作 | 安装版无挂死、无静默等待、资源正常 |
| G6 文档闭环 | DEV_LOG + 经验文件规则回写 | 新规则归位，无尾部日期章节 |

发布结论只能引用 G1-G6 的原始输出；任何一项未跑，交付说明必须明确写“未验证”，禁止用旧测试冒充。

## 9. 执行顺序

1. P0-1 流式 delta 语义（先协议层，再全部消费方）
2. P0-2 UI 节流（依赖 P0-1）
3. P0-3 直出重试可见化
4. P0-4 资源守护
5. P1-1 失败路径 trace
6. 建立发布验收矩阵并执行 G1-G6
7. 更新 `DEV_LOG_2026-09-12-volume-generation-hang-fix.md` 与经验文件 v4 规则
8. 通过审核后升级版本并封装

## 10. 明确不做

- 不改 `electron/main.js` 的 render-process-gone 日志，已存在。
- 不做模型侧“自动换模型”策略，本次只保证应用可见、可取消、可诊断。
- 不引入新依赖，不重构无关渲染结构。
- 不回滚 3.38.2 已验证的产物有效性门；本方案在其上补性能与可见性。

## 11. 需要审核确认

1. 是否接受 `onChunk/onReasoning` 一次性切换为 delta 语义？这是根治项，改动面大但可全量对账；保守做法是保留旧语义并在 UI 层转换，但会把 O(n²) 留在服务层。
2. 直出重试是否默认开启，还是允许用户在长任务前选择“失败即停”？
3. 资源守护第一版只观测不干预，是否接受？

## 12. 结论

根子不是某一行代码写错，而是“功能闭环标准”被误当成了“发布闭环标准”。3.38.2 修住了空正文不进 chain，但没有验证长流压力和静默重试的用户可见性；渲染层历史遗留的累计回调语义在大模型 reasoning 时代被放大成挂死。本方案先根治流式语义与 UI 压力，再把重试变成可见可取消，最后用 G1-G6 发布矩阵防止下一次“单测绿灯、生产挂死”。
