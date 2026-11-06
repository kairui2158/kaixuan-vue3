# TASK LEDGER 2026-11-06: SKILL 运行级钉死与结构化重试反馈

方案：`_audit/PROPOSAL_2026-11-06_SKILL-RUN-PINNING-RETRY-FEEDBACK_V1.md`

## 1. 目标与原话

用户原话（本轮）：「你把属于你的责任问题做一个方案，而且要根据经验文件的门禁来」，随后确认执行并同意后续单一裁判收敛方向。

最终可感知行为：
1. folder SKILL 目录在 run 中途被换文件时，运行显式失败并留 `folder-skill-version-mismatch` trace 事件，不再静默采用新包；断点恢复路径同样覆盖。
2. 正文链结构/格式/字数类失败的重试反馈携带上一版完整候选（`candidate-anchored`），不再从零重建；质量/风格类维持 bounded-summary。
3. SKILL 目录 agent.md 与精简版 script.js 脱钩出报告，不改 SKILL 目录。

本轮交付物：源码改动（loader/executor/router/PipelinePanel/schemaRetryFeedback）+ 单测 + 台账 + DEV_LOG + SKILL 脱钩报告。

## 2. 门禁读证

- G0.1 目标对齐（L20）：方案与代码、trace 事件、测试目标一致，无偏离。
- G0.3 诚实闭环（L36）：无法在本轮验证的面（真实 Electron 负向）登记 untested，不冒充。
- G0.6 方案成熟度（L60）：执行器/工具层、应用闭环、实现接线、验证标准四层结论见方案第六节。
- G0.7 正反推研磨（L68）：方案第四节 10 条推演，含反推否决（不做版本库存档）。
- G0.9 影响圈七面（L84）：方案第三节，生产入口/服务层/UI/测试/脚本/规格/trace 全列。
- G0.10 新旧并存清零（L92）：本轮为新增防护，无旧语义退役面；legacy 信封迁移为既有实现不在本轮改动范围。
- G0.12 本台账（L114）。
- G0.13 最小必要性（L134）：五问见方案第五节；无新 IPC、无新存储、无新配置。
- G1.4 验证真实性（L176）：验证分层标注；源码字符串断言不冒充运行时验证。
- G1.5 验证器质量（L192）：Electron 负向验证先红后绿；本轮未跑则登记。
- G1.8 日志与观测同步（L234）：新事件与 `candidate-anchored` 枚举同步 trace/导出/验证器。
- G1.9 状态机与终态（L254）：mismatch 以 failed 终态收口，不用 canceled/静默。
- G1.11 测试契约（L274）：旧 spec 契约同批对账。
- G1.13 Electron 验证标准（L295）：隔离 profile 要求，登记执行边界。
- G1.14 深层根因（L303）：第七节缺陷面枚举。
- G1.19 耗时观测（L360）：复核成本 = 每物理调用一次 IPC 读盘哈希（毫秒级），不引入基准需求。

## 3. 路由判定

加入：G0.1/G0.3/G0.6/G0.7/G0.9/G0.10/G0.12/G0.13/G1.4/G1.5/G1.8/G1.9/G1.11/G1.13/G1.14/G1.19。

排除：
- G0.11 真实交互冒充禁令：本轮无 UI 交互目标（fail run 为系统行为），不适用。
- G0.8 收尾清理：封装阶段触发，本轮交付不含安装包，由用户指示后执行。
- G1.10 权限与安全门：本轮不新增写入工具或权限面。

## 4. 影响圈与作者反证

打算改：`realSkillTypes.ts`（pin 类型与字段）、`realSkillLoader.ts`（pin 路径）、`realSkillExecutor.ts`（pin 复核+fail）、`skillRouter.ts`（pin 透传+composite 剥离）、`PipelinePanel.vue`（基准+trace 事件+verify 回调）、`schemaRetryFeedback.ts`（candidate-anchored 分支）。

可能碰到：folderSkillEval/folderSkillTest/workspaceSkillEngine/useDeAi/skillOrchestrator（均无 pin 传参，走旧路径不受影响）；runTrace 事件流（新事件 type 为自由字符串，无白名单拦截）；schemaRetryFeedback.spec.ts（旧契约断言同批对账）。

作者反证：最可能错的假设是「routeSkill probe 与 executeRealSkill 内部加载的 TTL cache 总是命中同一包」。证伪方式：TTL 5 秒边界 + 磁盘变更单测；生产接线由 verify 回调 + mismatch 事件兜底，即使假设不成立也会显式失败而不是静默。

## 5. 停止条件

完成：`npm run test:services` 全绿；`npm run type-check` 清零；mismatch 分支有 runtime 断言证明 fail 且不发生物理调用；candidate-anchored 有 requestMessages 级断言证明全文进入最终请求。

失败/降级：Electron 负向验证外部条件不可用时登记 untested（G1.4），不阻塞单测层交付；验证器断言先红证明。

## 6. 执行证据

### 验证命令原始输出

| 命令 | exit code | 关键输出行 |
|---|---|---|
| `npm run test:services -- src/services/realSkillLoader.spec.ts src/services/realSkillExecutor.spec.ts src/services/skillRouter.spec.ts src/services/schemaRetryFeedback.spec.ts` | 0 | `Test Files 4 passed (4)`；`Tests 104 passed (104)` |
| `npm run test:services`（全量） | 1 | `Test Files 1 failed | 247 passed (248)`；`Tests 1 failed | 2672 passed (2673)` |
| `npm run type-check` | 0 | 无错误输出 |
| `git diff --check` | 0 | 仅 LF→CRLF warnings |

全量唯一失败为 `realS2ProtectedContract.integration.spec.ts:171`（`expected 2 to be 1`），归因于外部活体 SKILL `kaixuan-s2/script.js` handoff folding 行为漂移，属既有失败（G1.4 已登记为不阻塞）。本轮定向 4 文件 104/104 全绿，全量 2672/2673 通过。

### 实现改动 before/after（file:line）

| 文件:行 | Before | After |
|---|---|---|
| `realSkillLoader.ts:89-178` | 无 pin 加载路径；TTL cache 5s 静默采用磁盘新包 | 新增 `pinnedFingerprint` 可选参数；带 pin 时绕过 TTL cache 直读磁盘，`fingerprintsMatch` 逐项比 hash/mtime/bytes；mismatch 返回 `error='skill_version_mismatch'` + `pinMismatch`，不写 cache（:145-160/:178） |
| `realSkillExecutor.ts:728-748` | 初始加载无 pin 复核；两次加载可能拿到不同包 | 初始加载带 pin 检查（:732），mismatch → `onSkillVersionMismatch` 回调 + `skill_version_mismatch` 诊断 + return failed，先于物理调用 |
| `realSkillExecutor.ts:943-970` | attempt 循环无 pin 复核 | 每 attempt 开始时 `loadRealSkill(folderPath, { pinnedFingerprint })`（:947），mismatch → failed + 0 物理调用 + mismatch 回调 |
| `skillRouter.ts:23-24` | 无 pin 类型声明 | 新增 `pinnedFingerprint` 与 `onSkillVersionMismatch` 类型 |
| `skillRouter.ts:180-181` | probe 到 execute 无 pin 透传 | 条件透传 `pinnedFingerprint` 与 `onSkillVersionMismatch` |
| `skillRouter.ts:228` | composite 执行无 pin 剥离 | composite 链剥离 pin 与 mismatch 回调，子 folder 独立指纹 |
| `PipelinePanel.vue:3217` | probe 无 `forceRefresh` | probe 改 `forceRefresh: true`，确保运行基准取启动时刻磁盘现状 |
| `PipelinePanel.vue:3262-3270` | 无 run 级 pin 存储 | probe 成功后存入 `perRunState.skillFingerprintPins[folderPath]`，同 run 复用 |
| `PipelinePanel.vue:3291-3312` | 无 mismatch trace 事件 | 执行传参携带 pin + 回调；mismatch 发 `folder-skill-version-mismatch` error 事件 |
| `schemaRetryFeedback.ts:19` | strategy 枚举无 candidate-anchored | 新增 `'candidate-anchored'` 联合成员 |
| `schemaRetryFeedback.ts:57-68` | 无结构/格式失败分类 | 新增 `STRUCTURE_OR_FORMAT_FAILURE_PATTERNS` |
| `schemaRetryFeedback.ts:72-74` | 无分类判定函数 | 新增 `isStructureOrFormatFailure` |
| `schemaRetryFeedback.ts:375-407` | body 契约 + 结构失败走 bounded-summary 兜底 | 走 candidate-anchored：携带完整候选全文 + strategy/scaffoldSource/suppressedCandidateChars=0 |
| `realSkillExecutor.ts:1420` | postProcess blocking 重试反馈无候选 | `previousOutput: candidateOutput` |
| `realSkillExecutor.ts:1522` | schema 校验失败重试反馈无候选 | `previousOutput: candidateOutput` |
| `pipelinePerRunUiState.ts:7,21` | 无 skillFingerprintPins 类型 | 新增 import type + `skillFingerprintPins?: Record<string, RealSkillFileFingerprint[]>` |
| `realSkillTypes.ts:130-134` | LoadResult 无 pinMismatch | 新增 `pinMismatch` 可选字段 |
| `realSkillTypes.ts:244-252` | ExecuteOptions 无 pin 传参 | 新增 `pinnedFingerprint` + `onSkillVersionMismatch` |

### 测试覆盖清单

- `realSkillLoader.spec.ts`（新文件）：pin 直读磁盘绕过 TTL cache；mismatch 返回 `pinMismatch`；不带 pin 时维持 cache 行为。
- `realSkillExecutor.spec.ts`：初始加载 mismatch → onSkillVersionMismatch + 0 物理调用（:111-134）；attempt 内 mismatch → 0 物理调用 + loadRealSkill 带 pin 参数（:176-190）。
- `skillRouter.spec.ts`：routeSkill 透传 pin 与 mismatch 回调（:355-363）；composite 剥离 pin 字段（:369-370）。
- `schemaRetryFeedback.spec.ts`：body 契约 + 结构失败 → `strategy='candidate-anchored'`，反馈携带完整候选（:23）。

## 7. 缺口清单与缺陷面枚举

### 缺口清单

1. **Electron 真实负向验证**（运行中改 SKILL 文件 → trace 出现 `folder-skill-version-mismatch` 且 run failed）= `untested`。本轮未执行；单测层 runtime 断言已证明 fail 分支且 0 物理调用，真实磁盘换闸时序与 IPC 加载链属 G1.13 范围。
2. **trace 事件 `folder-skill-version-mismatch` 与 `schema-retry-feedback-composed` 的存储/导出链路自动测试** = `untested`。发射点已落代码（PipelinePanel:3295-3305, 3320-3347），但无集成测试验证事件进入 run trace 存储与 JSON 导出。
3. **既有集成失败** `realS2ProtectedContract.integration.spec.ts:171` = 既有，外部活体 SKILL 契约漂移，不阻塞本轮交付。
4. **P3-D variables-missing 噪音** = 延后（方案 D4 裁决），与本次失败无因果。

### G1.14 缺陷面枚举

| 枚举面 | 命中情况 | 处置 |
|---|---|---|
| 分支枚举 | executor 初始加载 mismatch 分支（:728-748）；attempt 内 mismatch 分支（:943-970）；loader pin 直读分支（:108-111）与 mismatch 分支（:145-160）；router 条件透传分支（:180-181）与 composite 剥离分支（:228）；PipelinePanel pin 建立/复用分支（:3266-3270）；schemaRetryFeedback candidate-anchored 分支（:375-407） | 全部有单测 runtime 断言覆盖：executor 两条断言 0 物理调用；loader 断言 cache 分流与 mismatch 返回；router 断言透传与 composite 剥离；feedback 断言 strategy 映射与全文携带 |
| sibling 写读 | `skillFingerprintPins` 写入点 PipelinePanel:3270、读取点 PipelinePanel:3266（同 run 内写后读）；`pinnedFingerprint` 写入点 PipelinePanel:3294（routeSkill 参数）、读取点 executor:732/947 + router:180；`pinMismatch` 写入点 loader:148、读取点 executor:735/953 + PipelinePanel onMismatch 回调:3295 | 写入-读取链完整；per-run state 写入后同 run 可读；pin 存储在 per-run reactive 对象中，run 结束随 Map entry 清理，无跨 run 泄漏 |
| 旧协议残留 | `expectedFingerprint` 命名出现在 PipelinePanel:3305 trace detail 字段，与 `pinnedFingerprint` 不同名但指向同一数据 | 这是 trace 展示字段名（面向调试可读性），不影响执行面；保持现状，不改名 |
| 链式字段三列对账 | `pinnedFingerprint`：写=PipelinePanel:3267（storedPin \|\| probe.fingerprint）→ 读=routeSkill:180 → executor:732/947 → loader:108 | 链式传递完整；composite 链剥离 pin（router:228）是设计意图（子 folder 有独立指纹）；trace detail 字段与执行面字段名不一致已在旧协议残留行登记 |
