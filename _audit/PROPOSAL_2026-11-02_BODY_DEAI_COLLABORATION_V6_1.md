# 正文层内嵌降AI协同升级方案 V6.1

日期：2026-11-02
状态：V6.1 已执行并完成过度设计收敛：Phase A/B/C 与缺口闭环已完成；模型画像注入因校准 NOT READY 冻结；live 归档修正为五个真实证据目录，包含失败、两章成功后第 3 章 running、以及三次第 1 章成功后第 2 章失败，均为 observational，不作为质量提升证明。早期“3/3 success”runId 无证据，已撤回
前置：V5 方法指导者方案已落地；3.111.0 三次正文层实测确认 `guidanceOwnership=skill` 时应用方法论 0 注入属实。V6.1 最新 live 实测为 `guidanceOwnership=app`，方法论、S2→S3 诊断、校准三线均有注入/落账，不能继续引用旧接管态结论解释当前行为
核心目标：**SKILL 写作，应用送情报；应用不做第二作者，不替 SKILL 证明写作质量**

## 1. 目标修正

V6 草案把“20 章同模型同章节配对对照”写成了效果硬门禁，这是过度设计。用户判断成立：

1. SKILL 是活体，质量提升的主通道是 SKILL 根据诊断报告自我迭代。
2. 应用侧责任是接线正确、情报稳定、负向可挡、证据可审计。
3. 用大规模 A/B 对照证明“应用协同有效”，会拖慢交付，并把质量责任错误地留在应用侧。

V6.1 修正为：

- **硬门禁只验证接线与负向守护**，不做效果证明。
- **质量观测只做 3 章方向性抽样**，登记为 observational，不阻塞发布。
- **SKILL 迭代报告是主交付物**，让 folder SKILL 作者用真实数据改模板。

## 2. 协同结构

### 2.1 生成前：模型画像（冻结）

原设计在 S1/S2/S3 生成前注入 provider/model 维度的已验证惯病画像。过度设计复查判定：`sampleCount >= 5` 只能说明“出现过”，不能证明低误伤、高召回或阈值适配；在校准结论仍为 NOT READY 时允许注入，会把统计噪声送进 prompt。因此画像注入默认冻结：

1. `DEAI_MODEL_PROFILE_RELEASED=false`，release gate 为 `calibration-not-ready`。
2. 冻结期不注入任何画像文本；即使账本中存在 `sampleCount >= 5` 的规则，`guidanceChars` 也必须为 0。
3. trace 仍保留 `deai-model-profile`，记录 `released=false`、`releaseGate`、eligible/injected 数量，便于审计。
4. 画像读取、run 内 immutable、provider/model 隔离实现保留，供未来校准通过后启用；启用前必须补误伤率、召回率与分层校准证据。

### 2.2 S2 后、S3 前：位置化诊断

S2 输出后、S3 物理调用前，应用对 S2 候选做本地位置化诊断，并注入 S3 prompt：

1. 最多 6 条、1200 字符。
2. 只给位置、规则名、命中事实，不给改写文本。
3. 不改变终态、不触发重试、不参与验收。
4. S3 请求必须发生在诊断之后；trace 记录诊断生成与注入的先后关系。

### 2.3 终稿后：校准与迭代报告

终稿通过后的诊断不再宣称“已生效”。应用只做：

1. 把本轮 findings 写入校准账本，供画像证据积累使用；冻结期不把账本规则注入 prompt。
2. 生成 SKILL 迭代报告：命中规则、位置分布、S3 前后 findings 差分、误伤候选。
3. 报告作为 folder SKILL 作者迭代模板的输入，应用不自动改 SKILL 规则。

## 3. 并入三次实测缺陷

1. **上游事实链解析缺口**：`buildUpstreamWordGapScaffold` 只认旧协议行首格式，S1 骨架解析为空，导致 S2 retry 降级为“修复基础缺失”。V6.1 将 S1 骨架真实字段提炼为事实链锚点，S2 retry 优先复用，不再默认全链重建。
2. **apiCall 观测缺口**：skill 接管态下 `deaiPromptVariant=undefined`。V6.1 显式写入 `skill-creative` 等接管态 variant，保证 UI、trace、物理请求三层一致。
3. **UI 表达缺口**：“0注入”把 S2→S3 诊断链路藏掉了。V6.1 UI 分三线显示：方法论、诊断、校准。

## 4. 负向守护

1. **规则挤压**：画像冻结期不注入；诊断不包含写作方法论；方法论 owner 仍是 SKILL。
2. **先验污染**：诊断禁止携带候选全文和改写建议文本。
3. **耗时**：本地诊断限时 50ms；单步注入预算 1200 字符；超限丢弃条目并 trace 留痕。
4. **误伤**：画像规则除样本支撑外还必须通过校准发布门禁；误伤候选进入 SKILL 迭代报告，不进入画像。
5. **状态纠缠**：画像版本化，run 内 immutable；跨 run 更新必须显式版本号。
6. **裁判越权**：诊断不改变 success/errors/retry/终态，只进入 prompt 与 trace。

## 5. 过度设计诊断（必查）

每个 Phase 出方案和验收前必须回答四问，命中任一即删除或降级为观测：

1. 该机制是否在替 SKILL 承担质量责任？是则删除。
2. 该机制是否为了“证明应用有用”而不是解决用户可见问题？是则降级为 observational。
3. 该机制是否引入新的用户配置、等待状态或跨层共享状态？是则重新设计。
4. 删除该机制后，接线正确性与负向守护是否仍可验证？是则该机制属于可选增强，默认不启用。

本轮诊断结果：

- **删除**：20 章配对效果硬门禁。
- **降级为 observational**：3 章方向性抽样，只报告，不阻塞。
- **保留**：S2→S3 诊断注入、画像观测与隔离、SKILL 迭代报告、上游事实链修复、观测字段修复。
- **冻结**：模型画像 prompt 注入，直到校准发布门禁通过。
- **不新增**：用户配置项、阻塞等待状态、自动 SKILL 规则修改、应用侧质量总分。

## 6. 执行阶段

### Phase A：诊断前置与事实链修复

1. 新增位置化诊断模块，S2 后、S3 前执行。
2. 修复 S1 骨架事实链解析，S2 retry 优先复用骨架锚点。
3. trace 新增 `deai-stage-guidance` 事件，记录生成时间、条数、字符、hash、注入目标。
4. 验收：单测覆盖位置计算与预算；集成测试证明 S3 requestMessages 在诊断之后包含诊断内容；终态与 retry 不因诊断变化。

### Phase B：模型画像与观测修复

1. 建立 provider/model 画像读取与版本隔离。
2. 修复 skill 接管态 `deaiPromptVariant` 观测。
3. UI 三线显示：方法论、诊断、校准。
4. 验收：画像冻结期不注入；run 内画像 immutable；trace 记录 release gate；UI 数值与 trace 完全一致。

### Phase C：校准账本与 SKILL 报告

1. findings 写入校准账本；画像更新必须引用版本号，且冻结期不进入 prompt。
2. 生成 SKILL 迭代报告，包含误伤候选与前后差分。
3. live 方向性抽样按时间线归档：
   - 真实证据目录共五个：`run-20261102-224433` 第 1 章 failed；`run-20261102-232746` 第 1/2 章 success、第 3 章 running；`run-20261103-000521`、`run-20261103-004846`、`run-20261103-020722` 均为第 1 章 success、第 2 章 failed、第 3 章未执行。成功章节的 variant、诊断、校准、UI 三线与 trace 一致；全部登记 observational，不作为发布门禁。
   - 最新冻结后复测：`run-20261103-020722` 第 1 章 success，方法论 15 条/1073 字符，S2→S3 诊断 3 条/92 字符，校准 6 条，UI 三线可见；第 2 章 S2 三次候选净字数约 1434/1447/1447，均低于 1600 下限，第 3 次出现 reasoning-only 停滞约 12 分钟后由应用按 `reasoning_only_stalled` 断流并用关闭思考重试，最终 run failed，第 3 章未执行。
   - 第 2 章 failure 归因：S2 施工净字数不足，不是候选选择回退、word-gap 骨架缺失或全链重建；三次 retry 均携带 S1 场景骨架、FACT_LOCK 与目标/当前/还差净字数，且未携带候选全文。第 2 章未进入 S3，因此没有 `deai-stage-guidance` 是正确行为，不能伪造注入。
4. 验收：报告可导出；抽样结果不改变方案放行结论；不出现自动改 SKILL 规则的执行路径。

## 7. 成熟度结论

- 执行器/工具层：成熟。诊断、trace、S3 注入点均有现有锚点。
- 应用方案/交互闭环：成熟。无新增配置、无阻塞状态、UI 与 trace 同源。
- 实现接线：成熟，但必须 A→B→C 顺序执行。
- 验证标准：成熟。接线、预算、负向守护、观测一致性均有机器可判定断言。

## 8. 本轮边界

1. 缺口闭环已补齐：校准账本 500 条上限与裁剪 trace、误伤候选 UI 登记入口、模型画像 body 层语义入口、per-run 并发守护测试。
2. 模型画像调用点已由 `pipelineLayerForStep(step) === 'body'` 判定，负向断言防止 `step === 4` 与 `true` 字面量回归；画像 prompt 注入已因校准 NOT READY 冻结。
3. 误伤登记只进 SKILL 报告，不进校准账本、画像、guidance 或终态。
4. 2026-11-03 追加闭环已完成并重新验证：
   - `releaseGate` 修复：`DEAI_MODEL_PROFILE_RELEASED=false` 时，无论 eligible 规则数量多少，trace 均输出 `releaseGate=calibration-not-ready`；无 eligible 规则时 label 为“模型事实画像未达标，未注入”。
   - 单条 finding 的 `sample` 独立截断为 120 字符，避免总预算内单条超长挤压其他证据。
   - 0 条 finding 也输出 `deai-stage-guidance` 观测事件：`S2 后降AI位置诊断已执行：0条 / 未注入`，detail 记录 `injected=false`；该事件只补观测证据，不注入 prompt、不影响终态。
   - live/Electron 停滞检测签名移除 `at` 时间戳，避免每秒心跳污染“业务状态变化”判断。
   - live 断言升级为硬断言：stage guidance、预算、UI 诊断线、模型画像 release gate 全覆盖。
5. 2026-11-03 过度设计追加收敛已完成：
   - 删除 `resolveDeaiModelProfileGuidanceForRun` 的冗余 `isBodyLayer` 参数，调用点保留 body 层语义作为唯一入口。
   - S2→S3 诊断入口从 `step === 4` 改为 `isBodyLayer && si < templates.length - 1 && ...`，防止未来步骤重排后静默失效。
   - 集成测试锚点同步迁移，并负向断言旧步骤号条件不得回归。
   - 过度设计四问结论保持通过：不替 SKILL 承担质量责任；不为证明应用有用而注入；不新增配置、等待状态或跨层共享状态；删除冗余后接线与负向守护仍可验证。
6. 最新验证：定向 3 files / 34 tests passed；`npm run type-check` exit 0；`npm run build:vue` exit 0；真实 Electron E2E 通过（3 个逻辑 call、3 次物理 call）；`npm run test:services` 245 files / 2638 tests passed。
7. 真实供应商 live 只能作为 observational 接线观测，不作为质量提升证明。2026-11-03 用户已授权 3.112.0 交付：升版、封装、显式提交 git；发布门禁以全量验证、封装核验、敏感扫描、显式提交和提交后复查为准。
5. 不修改 folder SKILL 目录；三章 S3 postProcess 质量阈值缺口仍交 SKILL 作者迭代。
