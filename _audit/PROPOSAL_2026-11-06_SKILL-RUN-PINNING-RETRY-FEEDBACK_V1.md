# PROPOSAL 2026-11-06: SKILL 运行级钉死与结构化重试反馈 V1

状态：待审核（未执行）。未获用户确认不进入写码阶段。

## 一、目标与责任范围

用户目标原话（本轮）：「你把属于你的责任问题做一个方案，而且要根据经验文件的门禁来」。

最终可感知行为：
1. 一次生成运行（含断点恢复）内，folder SKILL 包被运行级钉死：SKILL 目录在运行中途被换文件时，运行显式失败并留下可审计 trace 事件，禁止静默采用新包。
2. 正文链重试不再让模型「从零重建」：结构/格式/字数类失败将上一版完整候选作为定点修复基础回传；质量/风格类失败维持现有有界摘要策略。
3. SKILL 目录内 `agent.md` 与精简版 `script.js` 脱钩问题：本轮应用侧只产出脱钩报告，不写应用代码（应用不越界管理 SKILL 迭代）。

责任分层判定（已核实，不是猜测）：

| 责任项 | 层 | 判定依据 |
|---|---|---|
| 运行中 SKILL 换闸可被静默采用 | 应用 | `realSkillLoader.ts:21-22`（5s TTL cache）；`skill-loader.js:309-342`（每次加载实时读盘重算指纹）；`skillRouter.ts:145-160` probe 与 `realSkillExecutor.ts:723` 执行是两次独立 `loadRealSkill`，指纹只记录不执法。运行 07:11:57-07:42:48 期间磁盘文件 07:46-07:51 已被换成精简版（template.md=2769B `D2013D6D…`、script.js=4613B `91750E1E…`，与 trace 内运行时指纹 36576B `480c4bb4…`/34908B `843362b5…` 不一致），本轮未被中途污染属时序幸运，机制上下轮运行会静默换闸。 |
| 重试反馈丢失失败候选骨架 | 应用 | trace seq 82/142/175：`strategy=bounded-summary`，`scaffoldSource=none`，`suppressedCandidateChars=9269/7047/7894`；`schemaRetryFeedback.ts:215-395` 默认兜底只回头尾 200 字符摘要，失败候选全文未进入下一轮请求。 |
| `agent.md` 注入完整阈值合同但精简版 script 校验器无对应闸 | SKILL 目录 | `D:/codex/玄武规划SKILL/凯旋-正文层/kaixuan-s1/agent_kai_xuan_s1_scene.agent.md`（3795B，mtime 11-04）与精简版 script.js（只剩 checkSceneStructure/checkHandoff/checkNotReady）脱钩。应用不写该目录，只出报告。 |
| S1 三次物理调用全败于 postProcess 校验 | SKILL | trace 终态 failed 收口正确，无 degraded 放行；失败码属 SKILL 校验语义，应用侧不越界修。 |
| 降AI 未注入 | 非根因 | 本轮 `calibration-not-ready`，与失败无关，本轮不动。 |

## 二、修复项

### P0-A 运行级 SKILL 包钉死

根因锚点：`realSkillLoader.ts:21-22` TTL cache；`realSkillLoader.ts:86-92` 命中缓存直接返回；`skillRouter.ts:145-160` probe 拿到的包与 `realSkillExecutor.ts:723` 执行器内部再加载的包之间无一致性保证；`skill-loader.js:309-342` 每次加载都读盘重建指纹。

改造（最小实现，不加新全局状态、不加新 IPC 通道）：
1. `routeSkill` 的 probe 成功后，把 `probe.package.fingerprint` 作为运行基准，经 `executeOptions` 显式传入执行器（新增可选字段 `pinnedFingerprint`）。
2. `realSkillLoader.loadRealSkill(folderPath, { expectedFingerprint })`：带基准时绕过 TTL cache，直接走 `api.skillLoadFolder` 读盘，比对返回的 `skill.fingerprint` 与基准（file/hash/mtime/bytes 逐项）；不一致时返回 `error='skill_version_mismatch'`，不返回包。不带基准时维持现有 cache 行为。
3. `executeRealSkill` 收到 `pinnedFingerprint` 后内部加载改走带基准路径；不一致即 fail：错误文案含新旧指纹摘要，diagnostic `error/skill_version_mismatch`，PipelinePanel 落 trace 事件 `folder-skill-version-mismatch`（level=error，detail 含 folderPath、skillId、新旧指纹、attempt）。禁止静默采用磁盘新包。
4. 复核时机：每个物理 attempt 请求发出前一次（执行器 retry loop 内，`realSkillExecutor.ts:924` 起的循环体），S1→S2→S3 每步自然继承同一基准。断点恢复路径无需新增专门逻辑：恢复后 attempt 开始同样走带基准复核（trace seq 7 `body-generator-step-resume-restored` 场景被覆盖）。
5. 开发态逃生门：现有 `clearRealSkillCache`（`realSkillLoader.ts:200-201`）+ 重新启动运行即为显式 reload；不做运行中热载，不做新配置开关。

诚实边界（G0.3）：本项保护「run 内不被换闸」；不承诺跨 run 恢复旧版本（应用不存 SKILL 版本库存档，恢复 run 的基准只能取启动时刻磁盘现状）。跨 run 版本库存档属于新存储机制，G0.13 五问不支持必要性，不做。

### P1-B 结构化重试反馈升级（正文链定点修复）

根因锚点：`schemaRetryFeedback.ts:215` 起，无 handoff/字数分支命中时落到 bounded-summary 兜底（:389-395），只回头尾 200 字符 + 3 条锚点。

改造（扩展现有单源合成器，不新增机制）：
1. 新增失败分类 `isStructureOrFormatFailure`：命中正文交接缺失/损坏、场景结构不匹配、施工卡不匹配、字数类错误（正文过短/过长）、字段缺失/label_drift 等协议结构类错误时，走新策略 `candidate-anchored`。
2. `candidate-anchored` 反馈结构：错误清单（沿用 maxErrors 有界）+ 上一版完整候选全文（带「这是上一版失败候选，仅作定点修复基础，不要逐字复述」声明）+ 修复要求（只修复失败项，保留已通过部分结构）。正文链（`protectedContract?.kind === 'body'`）启用；其他层维持现状。
3. 质量/风格类失败（句号密度、身体词密度、段落中位等）维持 bounded-summary；`word-gap`/`handoff-repair` 现有分支语义不变。
4. `SchemaRetryFeedbackResult.strategy` 枚举扩展 `'candidate-anchored'`，`scaffoldSource='candidate'`，`suppressedCandidateChars=0`；PipelinePanel trace 事件字段自然携带（`schema-retry-feedback-composed` 已透传全部字段，`PipelinePanel.vue:3320-3347`）。

预期效果：失败候选 9.7k 字符进入下一轮请求作为修复基底，模型不再从零重建；单次候选全文成本远低于每跳十几万字符的全量上下文，无额外延迟面。

### P2-C agent.md 脱钩报告（只报告，不写应用代码）

产出：`_audit/SKILL_REPORTS_2026-11-06_kaixuan-s1-agent-decoupling.md`，内容：脱钩事实（agent.md 阈值合同 vs 精简版 script 校验器清单）、风险（下轮运行提示词要求校验器不管）、建议（SKILL 层统一 agent.md 与 script.js 合同或恢复完整校验器）、引用 file:line。是否附加应用侧一致性诊断列为裁决点 D3。

### P3-D variables-missing 噪音

本轮不处理，登记为遗留观测项（裁决点 D4 延后）。与本次失败无因果。

## 三、影响圈七面（G0.9）

| 面 | 打算改 | 可能碰到 |
|---|---|---|
| 生产入口 | `skillRouter.ts`（pin 透传）、`realSkillExecutor.ts`（复核+失败分支） | routeSkill 其他调用方（folderSkillEval/folderSkillTest/workspaceSkillEngine/useDeAi）不受影响：新字段可选 |
| 服务层 | `realSkillLoader.ts`（expectedFingerprint 路径）、`schemaRetryFeedback.ts` | TTL cache 既有行为（无 pin 时不变）；`skillOrchestrator.ts` 无 pin 传参走旧路径 |
| UI | PipelinePanel 仅新增 trace 事件 `folder-skill-version-mismatch` | trace 面板白名单（runTrace.ts）需同步登记新事件类型 |
| 测试 | loader 指纹校验、executor pin 复核、retryFeedback 策略映射单测 | 既有 schemaRetryFeedback.spec.ts 旧断言同批对账 |
| 脚本 | Electron 负向验证（运行中换文件 → 显式失败） | G1.5 验证器纪律：先红后绿 |
| 规格文档 | 无新规格；SKILL 适配文档若已声明指纹行为需同步 | 不改 SKILL 目录 |
| 日志/trace | 新事件 + `strategy` 新枚举值 | 导出通道、验证器白名单同批 |

## 四、正反推研磨（G0.7）

| # | 推演 | 结论与证伪方式 |
|---|---|---|
| 1 | pin 挂在 routeSkill probe，composite 链多步各 probe 一次，基准是否逐步正确？ | 是：每步 probe 即该步基准，步内 attempt 继承；证伪：composite 多步单测断言各步基准独立。 |
| 2 | TTL cache 与 expectedFingerprint 并存会不会让缓存返回旧包躲过复核？ | 不会：带 pin 强制直读磁盘绕过 cache；证伪：单测 mock TTL 命中路径 + pin 路径分流。 |
| 3 | 复核成本？ | 每次 attempt 一次 IPC 读盘+哈希（4-6 文件，毫秒级），相对 20 分钟级物理调用可忽略；G1.19 无需基准。 |
| 4 | 运行中换闸 fail 会不会误伤「用户没动文件」场景？ | 误伤面=文件系统时间戳/内容真实变化；mtime+bytes+hash 三元组比对，缺 hash 判 mismatch（fail-closed）。 |
| 5 | candidate-anchored 会不会诱导模型逐字复述失败稿？ | 反馈声明明确「定点修复基础，不要逐字复述」；单测断言文案含声明。 |
| 6 | 全文回传会不会撑爆上下文？ | 9.7k 字符相对现请求量级是小数；且仅正文链结构类失败触发。 |
| 7 | 断点恢复时磁盘已被换（本轮 07:46 场景）能否恢复旧包？ | 不能（见诚实边界）；恢复 run 基准=启动时刻现状，中途变更仍会被拦。 |
| 8 | 反推：只做 P1-B 不做 P0-A 行不行？ | 不行：换闸后校验器闸完全消失，重试反馈再好也拦不住语义错乱；两者共同构成「闸不消失+失败可修复」。 |
| 9 | 反推：P0-A 在 loader 层做指纹存档（版本库）行不行？ | G0.13 五问：现有机制（pin+fail-closed）已覆盖用户目标，版本库是新存储链路，冻结。 |
| 10 | 新事件白名单漏登记会不会静默丢事件？ | 影响圈已列 runTrace 白名单；单测覆盖生产事件→存储→导出链路（G1.8）。 |

## 五、G0.13 最小必要性五问（逐项）

P0-A：用户目标必须依赖（否则 SKILL 迭代会静默破坏生成）；现有机制（指纹只记录）不够；延迟可忽略；删除会失去防换闸能力；更小实现=复用现有指纹结构+现有 loadRealSkill 入口，无新 IPC、无新存储。支持。

P1-B：必须依赖（失败候选骨架丢失是本轮实测失败主诱因）；现有 bounded-summary 不够；仅正文链结构失败触发，无新增状态；删除会回到从零重建；更小实现=扩展既有单源合成器枚举。支持。

P2-C：报告必要（跨层交接责任）；不做应用代码；删除损失=SKILL 层不知情；无更小实现以外的收益。支持（仅报告形态）。

P3-D：不处理，延后（无因果）。

## 六、验证标准（G0.6 四层评级）

| 层 | 评级 | 断点 |
|---|---|---|
| 执行器/工具层 | 成熟 | 无 |
| 应用方案/交互闭环 | 成熟 | 无（fail run 是显式用户可见行为，不加运行中裁定 UI） |
| 实现接线 | 成熟 | 接缝均已 file:line 核实 |
| 验证标准 | 成熟（条件放行） | Electron 负向验证依赖真实运行环境；若供应商外部条件不可用则该层登记 `untested` 保留，单测与执行器层 runtime 断言先行 |

验证清单：
1. 单测（runtime 断言，非源码字符串）：loader 带/不带 pin 的 cache 分流与 mismatch 返回；executor 收到 pin 后 mismatch fail 且不发物理调用（G1.5 守卫拦截证明昂贵外呼未发生）。
2. retryFeedback 策略映射：结构/字数/质量三类输入 → strategy 正确；旧 spec 同批对账。
3. Electron 真实验证（G1.13 隔离 profile）：运行中改 SKILL 文件 → trace 出现 `folder-skill-version-mismatch` 且 run failed；断点恢复路径（seq 7 resume 场景）同测。
4. G1.4 分层：以上未跑的层一律登记 untested，禁止冒充。

## 七、裁决点

| # | 问题 | 建议 |
|---|---|---|
| D1 | 指纹不一致时直接 fail run 还是弹窗让用户裁定？ | 建议 fail run（不加运行中裁定状态，G0.13） |
| D2 | candidate-anchored 只限正文链还是四层全开？ | 建议仅正文链（`protectedContract.kind==='body'`），其他层维持现状 |
| D3 | agent.md 一致性诊断是否加应用代码？ | 建议本轮只出报告，诊断延后（G0.13） |
| D4 | variables-missing 噪音 | 建议延后 |
| D5 | pin 挂 routeSkill 还是 loader 层全局单例 | 建议 routeSkill 显式传参，loader 不加全局状态 |

## 八、执行与收尾计划（确认后执行）

1. 台账七节（G0.12）写入 `_audit/TASK_LEDGERS/`，第七节含 G1.14 缺陷面枚举（分支枚举/sibling 写读/旧协议残留/链式字段三列对账）。
2. 按第三节影响圈实施：routeSkill pin 透传 → loader pin 路径 → executor 复核+fail → retryFeedback candidate-anchored → trace 白名单。
3. 验证：单测 → type-check → Electron 负向（外部条件允许时）。
4. DEV_LOG + 经验文件升级（新教训：SKILL 运行后换闸静默风险；指纹必须执法不能只记录）。
5. GATE 模板含 `[DEFECT-SWEEP]` 引用台账枚举。
6. git 提交与封装按用户指示执行。

## 九、缺口清单（G0.3）

1. 跨 run SKILL 版本库存档：明确不做（G0.13 冻结），登记为能力边界。
2. Electron 负向验证依赖外部运行条件，未跑前属 untested。
3. P3-D variables-missing 噪音延后。
4. 本方案未执行任何源码改动；所有 file:line 引用为只读核实结果。
