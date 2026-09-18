# SKILL 调试对比工具执行方案（两次运行 diff 面板）

日期：2026-09-15  
状态：待审核  
目标版本：3.50.0（实施完成并通过验证后升级，不在本方案内直接改版本号）  
前置结论：编辑器联动深化（光标定位、滚动、高亮、流式跟随）已在 3.42.x 交付并验证；本方案只覆盖尚未实现的“两次运行 diff 面板”。

## 1. 目标与非目标

### 目标

为第三方 SKILL 制作方提供两次运行的结构化对比能力：

1. 在运行记录面板选择任意两次运行（A/B），查看模板改动前后的完整执行差异。
2. 对齐并对比 API 调用、提示词快照、物理请求、工具调用、本地处理报告、folder 诊断、状态历史与关键事件。
3. 对长文本（prompt、system、输出、流式全文）提供行级 diff 与摘要统计。
4. 支持复制对比结果、导出 JSON 对比报告，导出沿用现有递归脱敏规则。
5. 数据不足时明确显示“仅存在于 A / 仅存在于 B / 缺失”，不虚构对齐。

### 非目标

1. 不修改 runTrace 采集逻辑、schemaVersion、落盘目录结构。
2. 不把 diff 结果写回项目或编辑器，不做应用/拒绝变更操作。
3. 不新增第三方依赖，不引入虚拟滚动库。
4. 不做跨导出文件对比。第一期只对比应用内最近 20 条运行记录及其已导出的 payload 引用信息。

审核决策（2026-09-15）：

1. diff 导出必须包含全文，不做 4,000 字符截断。
2. A/B 选择状态面板关闭后不记忆，避免跨项目误配。

## 2. 影响圈与爆炸半径

### 打算新增

| 文件 | 内容 |
| --- | --- |
| `src/services/runTraceDiff.ts` | 纯函数 diff 服务：类型、对齐、摘要、导出结构 |
| `src/services/runTraceDiff.spec.ts` | 对齐与摘要单测 |
| `src/components/common/RunTraceDiffPanel.vue` | 对比面板 UI 与交互 |

### 打算修改

| 文件 | 修改 | 原因 |
| --- | --- | --- |
| `src/components/common/RunTracePanel.vue` | 头部/详情区新增“对比”入口与对比模式状态 | 现有面板是唯一运行列表入口，复用它可保持入口一致 |
| `package.json` | 无新增依赖；实施完成验证后才升 `3.50.0` | 版本升级属于收尾动作，不属于功能实现 |

### 可能碰到但不修改

`src/stores/runTrace.ts`、`src/services/diff-utils.js`、`useAiCallTrace.ts`、各 API 调用入口、导出主进程。

### 爆炸半径矩阵

| 变更 | 可能影响 | 控制方式 |
| --- | --- | --- |
| 复用 `diff-utils.js` 的 `lcsDiff()` | 大文本 O(n*m) 时间与内存；现有编辑器 diff 使用习惯 | 对比服务设置 30,000 行上限；超过上限只展示统计差异与首尾摘要，并显式提示 |
| 复用 `maskSensitiveValue()` | 导出脱敏行为变化或遗漏 | 只调用不复制实现；若该函数未公开导出，则经 runTrace store 暴露一个最小脱敏方法，主逻辑仍在 store 收口 |
| `RunTracePanel.vue` 增加对比模式 | 现有四 Tab 被挤压或单次运行功能被破坏 | 对比 UI 抽成独立组件；对比模式只替换详情区域，运行列表与现有详情逻辑保持原样；E2E 同时验证单次详情和对比模式 |
| 导出对比 JSON 带全文 | 泄漏敏感信息、写出超大文件导致 UI 等待或磁盘占用 | 导出前整体递归脱敏；导出改为后台执行并显示进行中状态；完成后显示文件大小和所在目录；失败必须给出明确原因，不允许静默 |
| 新增状态与计算属性 | 旧浏览器/低端机器卡顿 | diff 结果使用 `computed`，对比数据在面板未开启时不计算；超过上限自动降级统计模式 |

## 3. 数据对齐策略

### 3.1 API 调用对齐

优先级从高到低：

1. 相同 `turnId + step + skillId + seq`。
2. 相同 `turnId + skillId + seq`。
3. 相同 `turnId + seq`。
4. 相同 `seq`（无 turn 的任务型运行）。
5. 数量不同时，未匹配项标记 `onlyIn: 'A' | 'B'`，不做强行配对。

同一优先级多条候选时，只允许唯一匹配；出现歧义按 `seq` 顺序拆开并标记 `ambiguousAlignment`。每个对齐项必须记录使用的规则编号，导出报告可审计。

### 3.2 轮次与子资源对齐

1. 轮次：优先 `turnId + seq`；无 turns 时按 API 调用归入 `legacy` 组，与现有面板分组规则一致。
2. 提示词快照：优先 `promptSnapshotIds` 顺序；缺失时按 `apiCallId + skillId + builtAt` 排序对齐。
3. 物理请求：按 `apiCallId + seq + phase` 对齐。
4. 工具调用：按 API 对齐项内 `name + 出现序号` 对齐；数量不同显示单侧存在。
5. 处理报告：按 `apiCallId + stage + processor + 开始时间顺序` 对齐。
6. folder 诊断：不做强行配对，按数组顺序展示“单侧存在 / 内容差异”。
7. 状态历史：不合并双方状态链，分别展示，并标出首次分叉的状态转换。

### 3.3 兼容策略

兼容 schemaVersion 4-6 与旧数据缺字段情况。所有可选字段读取都允许 `undefined`，diff 值为 `undefined` 时显示“未记录”，不得当作空字符串参与语义判断。

## 4. 对比维度

### 4.1 概览

对比两次运行的基础信息：来源、层级、模式、状态、开始/结束时间、总耗时、项目、供应商、模型、技能列表、技能模式、会话类型、轮次数、API 调用数、工具调用数、降级/失败数、payload 数量、payload 完整性 warning 数。

### 4.2 API 调用

每个对齐项对比：状态、skill、agent、provider、model、temperature、maxTokens、intent、compatibilityMode、compatibilityWrite、toolsDowngraded、downgradeReason、finishReason、usage、durationMs、timeToFirstChunkMs、错误、完整性标记。

结构对齐后，再对以下文本做行级 diff：

1. `requestMessages` 按 role 分组。
2. `responseText`。
3. `streamText`。
4. `reasoningText`。

### 4.3 提示词与上下文

对比 prompt snapshot 的：技能名、版本、模式、promptName、变量键集合、变量值、folderFingerprint（文件名、hash、mtime、bytes）、contextBlocks（source、version、coverage、content）、systemPrompt、userPrompt、finalMessages。

重点输出三类信号：

1. 变量缺失/新增/值变化。
2. 上下文块新增/删除/覆盖模式变化。
3. folder 指纹变化，帮助 SKILL 制作方确认“两次运行加载的 SKILL 文件确实不同”。

### 4.4 物理请求与工具

对比 physicalCalls 的 phase、status、工具启用状态、finishReason、usage、耗时、requestMessages 与 responseText。

对比 toolCalls 的 name、input、result、status、error、durationMs；工具定义 toolSurface/toolDefinitions 的新增、删除和 policy 变化单独列出。

### 4.5 本地处理与 folder 诊断

对比 processingReports 的 stage、processor、status、ruleHits、issues、integrity、耗时、输入/输出预览。

对比 folderDiagnostics 的 status、errors、diagnostics、postProcessReport、apiMeta 结构与输出摘要。

### 4.6 事件与状态

对比时间线事件：按 `turnId + seq + type` 尝试对齐，同时提供按事件类型汇总的计数差异（如 A 有 direct-retry-start 2 次、B 0 次）。状态历史展示完整链和首次分叉。

## 5. UI 设计

### 5.1 入口与选择

1. 运行记录面板头部新增“对比运行”按钮。
2. 点击后进入对比模式：列表项变为可选 A/B；选择 A 和 B 后右侧显示对比面板。
3. 对比模式提供“退出对比”按钮，返回原四 Tab 单次详情，不改变原有选中 run。
4. A/B 允许选择同源不同运行，也允许跨 source 对比，但跨 source 时顶部显示“来源不同，对齐结果仅供参考”。

### 5.2 布局

右侧使用居中大面板内的上下结构：

1. 顶部：A/B 运行摘要卡，不嵌套卡片，用左右两列和底边框分隔。
2. 中部：分组 Tab：概览 / API / 提示词 / 输出 / 工具与处理 / 事件与状态。
3. 底部：复制、导出 JSON、切换单栏/双栏。

文本 diff 默认双栏对照：左 A 右 B，行号与增删高亮一致；移动端或窄窗口自动切单栏上下对照。单栏/双栏可手动切换。

### 5.3 大文本与折叠

1. 每个 diff 区块默认展示前 300 行。
2. 提供“展开全部”，超过 30,000 行的文本自动进入统计模式：总行数、相同行、新增行、删除行、字符差、首 100 行与末 100 行摘要。
3. `streamText` 默认折叠，只显示累计长度和差异统计，点击后加载 diff，避免每次打开面板都做大规模 LCS 计算。
4. 复制结果和导出 JSON 均不受 300 行预览限制：复制输出完整 diff 报告，导出 JSON 包含全文。

### 5.4 可用性细节

1. 两次完全相同：显示“两次运行无差异”，并列出基础元信息。
2. 数量不一致：明确显示“仅存在于 A / 仅存在于 B”。
3. 对比运行中记录：顶部提示“该运行仍在进行中，结果是临时快照”。
4. 键盘：`Esc` 退出对比模式；按钮与列表保留现有 accessibility 属性风格。
5. 对比入口和结果中的状态文案复用 `statusText()` 语义，不新造第二套状态翻译。

## 6. 导出与复制

### 6.1 复制

生成纯文本对比报告：A/B 基础信息、对齐结果、每个维度的摘要、关键差异、全文 diff 内容。复制前执行递归脱敏，复制内容与导出内容同为全文口径。

### 6.2 导出 JSON

结构：

```json
{
  "schema": "shenyi.run-trace-diff",
  "schemaVersion": 1,
  "generatedAt": 0,
  "runs": {
    "a": { "id": "", "source": "", "mode": "", "status": "", "startedAt": 0 },
    "b": { "id": "", "source": "", "mode": "", "status": "", "startedAt": 0 }
  },
  "summary": {},
  "overview": [],
  "apiCalls": [],
  "promptSnapshots": [],
  "physicalCalls": [],
  "toolCalls": [],
  "toolSurface": [],
  "processingReports": [],
  "folderDiagnostics": [],
  "events": {},
  "stateHistory": {},
  "warnings": []
}
```

导出全文规则：

1. `requestMessages`、`responseText`、`streamText`、`reasoningText`、prompt snapshot、物理请求、工具输入/结果、处理报告输入/输出预览、folder 诊断输出均写入全文。
2. UI 预览折叠、300 行展示、统计降级只影响屏幕显示，不影响导出内容。
3. 导出为后台任务：点击后按钮进入“导出中”状态，主进程写文件期间用户可继续查看 diff。
4. 导出完成后提示文件大小；若超过 50MB，额外提示“文件较大，建议直接发给 SKILL 制作方时压缩传输”。
5. 导出失败必须显示错误原因，并保留面板内容，不允许静默失败。

导出复用现有 `runTraceExport` 通道，主进程侧不改导出协议时必须确认该通道对未知 schema 结构可透传；若校验 schema，则同步新增 diff schema 分支。导出内容必须在渲染层先递归脱敏，主进程侧如新增 diff 分支也执行同样递归脱敏，保持现有双层防护原则。

## 7. 实施步骤

### 第一步：diff 纯函数服务

新增 `src/services/runTraceDiff.ts`：

1. 定义 `RunTraceDiffResult` 与分组类型。
2. 实现 API、turn、snapshot、physical、tool、processing 的对齐函数。
3. 实现字段 diff、行级 diff 摘要和大文本降级。
4. 实现导出 JSON 与纯文本报告生成。

验证：`src/services/runTraceDiff.spec.ts` 覆盖第 9 节全部单测场景。

### 第二步：接入 RunTracePanel

1. 增加 `compareMode`、`compareRunAId`、`compareRunBId` 状态。
2. 列表项增加 A/B 选择控件，入口按钮和退出逻辑。
3. 对比模式下渲染 `RunTraceDiffPanel.vue`，传入 A/B run 与必要工具函数。
4. 不修改单次运行详情的原有渲染分支。

验证：组件渲染测试或源 Electron E2E 至少覆盖选择、展示、退出。

### 第三步：对比面板 UI

1. 实现六组 Tab 与双栏/单栏文本对照。
2. 实现折叠、展开、统计降级、单侧存在、运行中提示。
3. 实现复制与导出按钮。

验证：E2E 覆盖关键交互与空态。

### 第四步：验证、日志与收尾

1. 跑定向单测、type-check、前端构建。
2. 跑源 Electron E2E：真实 Pinia 注入两条不同结构 trace，验证选择、分组、单侧存在、导出脱敏。
3. 更新 DEV_LOG、总索引；如沉淀出通用规则再更新经验文件。
4. 回头看：逐行 diff 自审，确认没有改 trace 采集层。
5. 用户审核通过后升级 3.50.0 并封装，安装版实测对比功能与单次运行面板回归。

## 8. 风险与审核决策

| 风险 | 处理 |
| --- | --- |
| 大文本 diff 卡顿 | 30,000 行阈值、streamText 懒 diff、统计降级；导出走后台写文件，不在 UI 线程拼超长字符串 |
| 对齐歧义 | 规则编号入结果，歧义项拆分显示，不强行配对 |
| 敏感信息泄漏 | 复用现有脱敏函数并加导出泄漏测试 |
| 跨 source 对齐误导 | 顶部提示“仅供参考” |
| 单次详情被挤压 | 独立组件 + 详情区域替换，不嵌套卡片，不改四 Tab 原逻辑 |
| `lcsDiff()` 性能不足 | 第一期只用于已限流文本；若实测超时，再评估内部分块，不新增依赖 |

审核已确认：导出带全文；A/B 选择不跨面板关闭记忆。

## 9. 验收标准

1. 可选择任意 A/B 两次运行，进入和退出对比模式不影响原有单次详情。
2. 概览、API、提示词、输出、工具与处理、事件与状态六组差异全部可见。
3. API 数量、轮次数量、snapshot、physical、tool、processing 报告数量不一致时均显示单侧存在。
4. 超长文本进入统计降级，不冻结 UI。
5. 复制和导出内容不包含 API Key；导出 JSON 带上述 schema 结构，且长文本字段为全文，不出现 `truncated: true`。
6. 定向单测、type-check、前端构建、源 Electron E2E 全部通过。
7. DEV_LOG、总索引与经验文件（如适用）完成回写。

## 10. 回头看检查点

实施完成后执行 M17：

1. 复述用户目标：只新增两次运行 diff 面板，不改采集、不碰编辑器联动。
2. 逐行 diff 自审：每行必须归入本方案；`runTrace.ts`、`useAiCallTrace.ts`、API 调用入口不得出现实现性改动。
3. 同款逻辑扫描：确认 diff 入口唯一，状态文案与现有 `statusText()` 语义一致，脱敏只调用既有收口。
4. 日志与经验核对：DEV_LOG/总索引更新；若发现“UI 观测层新增必须核对导出通道”等新通用规则，回写经验文件。
5. 证据复核：测试与 E2E 输出必须属于本轮，不引用旧轮结果。

## 11. 测试计划

### 单元测试（diff 服务）

1. 两次完全相同 run：无差异，基础摘要成组。
2. API 数量不同：多出项标记 `onlyIn`。
3. API 状态/模型/耗时/错误不同：字段差异正确。
4. turn 数量不同：轮次单侧存在。
5. prompt snapshot 缺失：显示未记录，不异常。
6. snapshot 变量、上下文块、folder 指纹变化：三类信号正确。
7. physicalCalls phase/status/usage 差异。
8. toolCalls 数量、input/result/status 差异。
9. processingReports ruleHits/issues/integrity 差异。
10. 超长文本触发 UI 统计降级，但导出结构仍保留全文。
11. JSON 导出结构、schemaVersion、全文完整性（以超长 fixture 验证导出内容与源文本完全一致）。
12. 脱敏：Authorization、api key、sk- 开头密钥全部被掩码。
13. 对齐规则优先级与歧义拆分。

### E2E / 真实 UI 验证

1. 打开运行记录，进入对比模式，选 A/B，六 Tab 可见。
2. 单侧 API/轮次/工具/报告显示“仅存在于 A/B”。
3. 超长输出进入统计模式，面板无冻结。
4. 复制报告、导出 JSON 成功；导出文件无 API Key。
5. 退出对比模式后，原有四 Tab 单次详情仍正常。
6. 面板关闭重开后，单次运行选择逻辑无残留污染。
7. 大体积全文导出期间面板可操作，导出完成后显示文件大小；关闭面板不中断已开始的导出任务，导出结果仍写入目标目录。

## 12. 明确不做

1. 不修改 `RUN_TRACE_SCHEMA_VERSION`。
2. 不改单次运行导出的 payloads 目录结构。
3. 不改 runTrace 采集、状态归并和看门狗。
4. 不做编辑器 diff 应用/拒绝操作。
5. 不引入虚拟滚动、diff 算法或 UI 第三方依赖。
