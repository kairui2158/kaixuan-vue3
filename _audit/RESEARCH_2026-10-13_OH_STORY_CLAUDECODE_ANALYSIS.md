# oh-story-claudecode 对本应用的全维度价值分析

> 日期：2026-10-13
> 上游仓库：`zenstory-ai/oh-story-claudecode`（GitHub，MIT License）
> 分析基线：本地克隆 `C:/Users/凯瑞/AppData/Local/Temp/oh-story-claudecode`，main 分支提交 `2cf7be6`，版本 v0.8.5
> 分析对象：本仓库 `D:/codex/novel-workshop-vue3`，分支 `codex/direct-write-negative-verification`，提交 `d7dac0b`（3.82.0 后工作区干净）
> 证据标准：只引用真实源码文件与行号，不以 README/宣传语充当证据；未执行的面明确写"未验证"。
> 产物边界：本报告是调研与方案，不修改任何生产代码；所有生产改动需经用户审核后另行立项。

## 1. 总结论

**结论：有用，但价值不在"搬功能"，而在补协议、状态一致性与质量门禁的确定性底座。**

oh-story-claudecode 的本质是一套围绕"长篇小说持续写作"的工程化协议：单一权威状态文件 + 派生视图 + 事务化提交 + 分级产物契约 + 先读后写门禁 + 检测器分级与收敛终止。它与我们的 Electron 应用技术形态完全不同（它是 Claude Code / Codex / OpenCode 等编码 Agent 的 SKILL + hooks + Python/JS 工具集，我们是 Vue3 + TypeScript + Electron + IndexedDB + OpenAI 兼容 API），不能整仓移植；但它的多个机制恰好对上我们生成流水线最近反复暴露的问题面：上下文消费效率、跨批次连续性、产物契约语义、新增设定失控、正文质量兜底。

优先级排序后的高价值方向：

1. **P0：作用域化大纲读取协议**（解决 S2/正文层重复携带全文、上下文最薄、长文读取 2/30 这一类问题的协议根源）
2. **P0：追踪状态事务化**（解决生成流水线跨批次状态互相覆盖、memory 无修订号并发保护的问题）
3. **P1：新增物三级分类**（直接写 / 写了要报 / 先问作者；解决正文生成私自加设定、加伏笔、动终局底牌的失控面）
4. **P1：正文写后硬信号 Stop 网**（截断、拒绝语、工程词、复读，模型无关的兜底检测）
5. **P1：产物契约语义扩充**（卷契约、主推线、终局禁碰清单、作用域段位）

明确不建议采纳的部分见第 6 节：文件型书库结构、bash/python 运行时 hooks、多端 agent TOML、dashboard、browser-cdp、照搬去 AI 味提示词。

## 2. 上游仓库结构盘点

| 技能 | 文件数 | 核心内容 | 与本应用相关性 |
|---|---:|---|---|
| story-long-write | 100 | 长篇写作主流程：追踪事务、章/日更工作流、卷纲作用域协议、写前门禁 | **极高**：对应我们的卷纲/章节/正文生成流水线 |
| story-setup | 174 | 部署脚手架、agents TOML、hooks、协议参考、规则库 | **高**：Agent 职责边界、hook 兜底、版本门禁可参考 |
| story-deslop | 13 | 去 AI 味检测器管线与 Gate 规则 | **中高**：对应 DEAI，可补分级与收敛终止 |
| story-import | 19 | 旧项目追踪迁移 | **中**：我们的导入归档可参考事务迁移思想 |
| story-review | 27 | 审查、质量评分 | **中**：对应 narrativeValidation，可参考 S1-S4 分级 |
| story-short-write | 47 | 短篇写作流程 | **中低**：机制与长篇重叠，不单独立项 |
| story-long-analyze / story-long-scan | 21 / 17 | 长篇拆书、扫榜分析 | **中低**：SKILL 层能力，不是应用层缺口 |
| story-short-analyze / story-short-scan | 23 / 10 | 短篇分析、扫榜 | **低** |
| story / story-cover | 10 / 2 | 入口与封面 | **低** |
| browser-cdp | 2 | 浏览器 CDP 工具 | **不适用**：我们无此需求 |

## 3. 全维度证据对账表

> "移植方式"一列的含义：`设计移植` 指按我们的 TS/Electron 形态重新实现机制；`代码移植` 指可带版权声明直接复用源码；`不移植` 指只作为教训或对照。

| # | 维度 | oh-story 机制（源码证据） | 我们现状（源码证据） | 差距判断 | 移植方式 | 适配成本 | 预期收益 | 优先级 |
|---|---|---|---|---|---|---|---|---|
| A | 长篇状态权威与事务 | `_tracking-state.json` 单一权威，派生视图禁止手改：`skills/story-long-write/references/tracking-transaction.md:3-11`；项目级写锁 `.tracking-commit.lock`：`scripts/tracking_commit.py:277-289`；临时文件 + `os.replace` 原子写入：`:243-254`；delta/context/snapshot 硬上限 3072/12288/8192 字节：`:43-47`；`expected_state_revision` 拒绝 stale 事务：`:1030-1047`、`:1627-1630` | `memoryVersion.ts:21-74` 只有 before/after 快照与回滚；`memoryMerger.ts:118-277` 有锁定字段与证据去重；`conversationContextService.ts:1031-1246` 有写队列但 memory 合并无修订号乐观锁 | **高**：生成流水线跨批次并发写 memory 时无 stale 拒绝，事件/伏笔可能被旧批次覆盖 | 设计移植 | 中（需 IndexedDB 事务表 + 修订号 + 锁队列） | 长篇流水线连续性显著提升，杜绝旧批次覆盖新状态 | **P0** |
| B | 上下文定点消费 | 写前只读 `outline_view.py --unit {单元ID}` 一次，本批复用，不整读卷纲：`workflow-chapter.md:13`、`workflow-daily.md:23`；完整 state 不进 prompt：`workflow-chapter.md:14`；旧信息按需 `grep` 定点查：`workflow-daily.md:37`；上下文卡 ≤12288 字节：`tracking-transaction.md:136` | `chapterExecutionPackage.ts:104-111` 把 memoryContext 拼进执行包；`memoryRetriever.ts:65-93` 已有只读筛选但无字节预算；`editorContextPipeline.ts:112-170` 编辑器侧有 packed 模式；流水线侧缺少"单元作用域闭包"概念 | **中高**：章节/正文层没有"卷级常任 + 当前单元闭包"读取协议，容易全量带或漏带 | 设计移植 | 中 | S2/正文上下文从"最薄一环"变成"按作用域闭包供给"，长文读取次数下降 | **P0** |
| C | 产物契约语义 | 卷契约含读者期待、主推线、解锁里程碑、禁碰终局底牌、契约风险：`artifact-protocols.md:52-61`；故事线 `L01` 与单元 `L1-03` 编号分层：`:17`、`:63-69`；段位契约 `> 作用域：卷级常任/单元级`：`:97-107`；`outline_view.py --check --strict` 归零验收：`:102`；伏笔 F 编号、打脸债、压力线轮转：`:142-164` | `volumeGenerationContract.ts:7-96` 校验 expectedCount/重复卷名；`chapterGenerationContract.ts:70-103` 校验数量/区间/历史标题；`bodyArtifactContract.ts:49-57` 校验字数区间；`volumeBatchOrchestrator.ts:63-107` 已带历史清单防重复 | **中**：我们有"数量契约"，缺"承诺与禁区的语义契约"（主推线、禁碰底牌、契约风险） | 设计移植 | 中 | 卷纲/章节规划层可显式约束"不许动什么"，减少剧情越权与后期崩线 | **P1** |
| D | 先读后写门禁 | 细纲缺失/空/字段不全时停止补建再写：`workflow-chapter.md:13`；正文写前缺细纲、追踪不一致、未展开 shell 路径直接拦截：`story_codex_hook.py:1312-1373`；追踪修订号/章号不一致 SessionStart 拦截：`:527-590` | `documentReadLedger.ts:75-108` 有读账本；`editorTools.ts:1046` 工具描述要求先读；`editTaskService.ts:201-214` checkpoint 版本校验；生成流水线缺"产物落盘前契约文件必须存在且通过校验"的硬门禁 | **中**：编辑器直写有版本校验；生成流水线缺写前契约门禁 | 设计移植 | 低-中 | 生成层减少"没细纲硬写、没追踪硬续"的废稿 | **P1** |
| E | 新增物分级 | 三级：直接写/写了要报/先问作者，拿不准归"写了要报"：`narrative-writer.toml:20-28`；严禁为填表加设定：`:28` | `types/memory.ts:36` 有 `confirmed/pending/stale/conflicted/rejected`；`memoryExtractor.ts:158-168` 要求 evidence 原文；`memoryMerger.ts:50-60` 有冲突标记；无"生成时新增物必须申报/停笔问作者"的分级协议 | **中**：我们能事后抽记忆，但缺写时分级授权，模型仍可能私自加金手指/伏笔 | 设计移植 | 中 | 正文越权新增设定、提前揭底牌的概率下降，审查有明确清单 | **P1** |
| F | Agent 职责边界 | 写手不写追踪不改纲：`narrative-writer.toml:34`；canonical 路径直读，禁止 Glob/Grep、禁止跨 skill 读取：`:40-45`；架构师同样受限：`story-architect.toml:23-28` | `skillGuidanceSanitizer.ts:84` 清洗旧预览状态机；`agentToolConflict.ts:4-22` 声明冲突工具；`agentOrchestrator.ts:424-447` 注入审计；`skillAgentBinding.ts:3-22` 绑定 key | **中低**：我们有工具面隔离，缺"角色级文件/数据域禁令"（谁永远不能写追踪、谁永远不能改纲） | 设计移植 | 低 | SKILL/Agent 只影响领域能力，执行权限继续由应用单源控制，职责不再混战 | **P1** |
| G | 质量检测分级与收敛 | 检测器只报告不改写，Gate 分必须修/建议看/仅提示：`story-deslop/SKILL.md:189-192`（管线）、`workflow-chapter.md:31`（S1/S2 必修）；收敛终止条件防无限润色：`SKILL.md:223-226` | `de-ai.js:48-110` 阈值体系、`:568` 正文完整性保护、`:608-691` blocking/advisory 分级；`narrativeValidation.ts:66` 有 outline locked 分支；缺跨端 parity 测试与统一 Findings Schema | **中低**：我们已有较完整中文小说 DEAI 体系，缺的是"检测器不可改写 + 分级收敛 + 同口径 parity"的工程化收口 | 设计移植 + 局部代码参考 | 低 | 质量链更稳定，不会为归零而机械改写或无限润色 | **P2** |
| H | 写后硬信号 Stop 网 | Codex 无 PostToolUse，用 Stop 事件对 git 改动正文复扫截断/拒绝语/工程词/复读：`story_codex_hook.py:1636-1653`；规则正则与 JS 同构，`test-prose-net-parity.sh` 锁 parity：`:210`、`:1295-1297` | `runTrace`/`stateWatchdog` 覆盖任务状态；正文内容写后复扫目前依赖 DEAI 管线调用时机，没有"回合结束必扫硬信号"的独立轻网 | **中**：模型拒绝语、截断、工程词泄漏可能进入正文而未被兜底拦截 | 设计移植 | 低 | 用户可见质量兜底，模型无关；尤其适合外部 SKILL 干扰输出时 | **P1** |
| I | 串行写作纪律 | 必须主会话串行逐章写，禁止子代理并发（追踪互相覆盖）：`workflow-daily.md:21`；每章写完立即提交追踪：`:30` | 流水线 batch orchestrator 串行；Agent V3 允许子 Agent 并行加速 | **低（主要是护栏）**：并行提速必须以"状态写入串行化"为前提 | 教训采纳 | 低 | 未来做流水线并发时不会把 P0 事务系统打穿 | **P1 规则** |
| J | 版本门禁与多端兼容 | `agents_version` 不匹配时提示但不阻断，缺失才降级 solo：`story-deslop/SKILL.md:17-19`；Windows stdin/stdout 强制 UTF-8 字节读写：`story_codex_hook.py:24-45` | `skillRouter`/`skillAgentBinding` 有绑定；缺 SKILL/Agent bundle 版本一致性提示 | **低**：我们是单应用内置，不需要多端部署矩阵，但需要 SKILL 版本口径 | 设计移植（轻量） | 低 | 减少"旧 SKILL 配新应用"的隐性错配 | **P2** |
| K | 文件型书库 / Dashboard / 导入迁移 | 以 Markdown 文件树为存储（`artifact-protocols.md:7-17`） | 我们用 IndexedDB + 项目模型 + UI 工作台 | **不适用**：存储形态、产品定位不同 | 不移植 | - | - | 不采纳 |
| L | bash/python hooks、多端 agent TOML、browser-cdp | `hooks.json:3-82` 多运行时 hook；`agents/*.toml` 多端配置；`browser-cdp` 2 文件 | 我们是 TS 服务 + Electron IPC 单端 | **不适用**：技术载体不同，只取机制不取载体 | 不移植 | - | - | 不采纳 |

## 4. 建议采纳方案（供审核，不擅自执行）

### Phase 1：作用域上下文协议（P0）

目标：给卷纲/章节/正文生成建立"卷级常任 + 当前单元闭包"的上下文读取协议，替代"要么全量带、要么随机摘"的现状。

1. 在卷纲产物中引入段位作用域标记：`卷级常任` / `单元级`，解析器输出闭包（常任段 + 当前单元段 + 逐章表裁剪）。
2. `chapterExecutionPackage` 消费作用域闭包，不再整读卷纲；`memoryRetriever` 输出增加字节预算上限。
3. 增加严格校验：作用域未声明、单元 ID 不存在、闭包为空、闭包超预算都返回结构化错误。
4. 验证：单测覆盖闭包裁剪与超预算；Electron + 真实 API 用一卷多单元项目对比 Phase 5F 基线的上下文字节数与请求耗时。

### Phase 2：追踪状态事务系统（P0）

目标：把流水线 memory 写入从"直接 merge"升级为"修订号 + 锁队列 + 原子提交 + 容量上限"的事务。

1. IndexedDB 增加 tracking state 表：单一权威 state + `state_revision`。
2. 批次写 memory 前读修订号，提交时校验；不匹配则拒绝并按新状态重建 delta（参考 `rebuild_stale_draft` 的安全合并思想：`tracking_commit.py:1520`）。
3. delta/context/snapshot 引入目标值 + 硬上限；超限拒绝而不是截断。
4. 派生视图（章节执行包、上下文卡）由 state 生成，禁止独立手改；提供 `check` 一致性命令。
5. 验证：并发两个批次写同一项目 memory，断言旧修订号提交被拒；崩溃恢复后 state 与派生视图一致；全量回归 + Electron 复测。

### Phase 3：新增物三级 + 写后硬信号网（P1）

目标：写时控制越权新增，写后模型无关兜底。

1. 正文生成契约新增"新增物申报表"：直接写 / 写了要报 / 先问作者；命中"先问作者"时暂停并回传作者确认，不落盘。
2. 回合结束对新增正文执行轻量硬信号复扫：截断、生成拒绝语、工程词、紧邻整行复读；命中即回写修正请求。
3. 检测器只报告不改写；修正由一次定点请求完成，复扫后收敛。
4. 验证：构造四类硬信号样本各 N 条的 Electron 实测；证明外部 SKILL 干扰时正文仍被兜底。

### Phase 4：契约语义与质量收敛（P1/P2）

1. 卷契约字段扩展：读者期待、主推线、解锁里程碑、禁碰终局底牌、契约风险；生成与审查两侧消费同一契约。
2. DEAI 增加 Findings Schema 与收敛终止条件；建立检测器同口径 parity 测试。
3. SKILL/Agent bundle 版本口径提示，不阻断执行。

### 执行顺序建议

Phase 1 与 Phase 2 可并行设计但串行落地：先 Phase 2（状态事务是 Phase 1 派生视图的地基），再 Phase 1（作用域闭包），随后 Phase 3、Phase 4。若用户优先要可见性能收益，也可先 Phase 1，但必须把 Phase 2 列为不可延后的依赖项，因为无事务状态的作用域闭包会在并发批次下失真。

## 5. 与既有经验的对应关系

- G1.15 "细胞层递进"：oh-story 的价值正是把"写得慢/写崩"追到协议层（作用域、事务、门禁），与我们近期把 API 直写问题追到执行语义层的经验一致。
- G1.8 "修复反馈与观测"：它的 `check` 一致性命令、`expected_state_revision`、Stop 复扫都是"观测即门禁"的形态，可与 runTrace 体系融合。
- G0.9/G0.10 "影响圈与新旧并存"：Phase 2 引入新状态权威时，必须同步迁移 memoryMerger 全部调用点并保留旧入口防御断言，禁止新旧状态双写并存。

## 6. 明确不建议采纳清单

1. **文件型书库结构**：Markdown 文件树是它的宿主约束，不是优势；我们已有 IndexedDB、项目模型和编辑器底座，迁移只会引入双存储状态。
2. **bash/python hooks 与多端 TOML**：载体不适配 Electron/TS，机制已列入设计移植，代码不搬。
3. **browser-cdp 技能**：与产品目标无关。
4. **Dashboard/多书管理**：价值中等且不是当前痛点，先不立项。
5. **照搬它的去 AI 味提示词**：我们的 `de-ai.js` 体系更贴近中文网文（三信号、完整性保护、正负样本），只吸收"检测器不改写 + 分级 + 收敛终止"的工程结构。
6. **星标/热度作为采纳依据**：本报告不把 7.5k stars 当作工程证据，只认源码机制。

## 7. 许可与合规

上游为 MIT License。本报告建议的是设计移植，不直接复制其源码；若后续确实复制任何一段代码，必须随代码保留其版权声明与 MIT 许可文本，并在 DEV_LOG 登记来源文件。

## 8. 回头看与缺口清单

1. **已验证**：全部表格行均有双方源码 file:line 证据；上游文件行号来自本地真实克隆，仓库提交 `2cf7be6`。
2. **路径勘误**：前一轮交接摘要把上游文件写成 `story-long-write/...` 顶层路径，真实路径为 `skills/story-long-write/...`；本轮已按真实路径复核全部引用，未沿用错误路径。
3. **未验证**：未在本地运行 oh-story 的完整写作流程（它是编码 Agent 工作流，需要 Claude Code/Codex 部署环境），因此对其"实际生成效果"不做完成度声明；本报告只评估机制设计价值。
4. **应用侧未验证**：Phase 1-4 均为方案，未改生产代码，未跑性能对比；字节数与耗时收益是推断，真实收益必须以 Phase 1/2 落地后的 before/after 账本为准（遵循 G1.19：耗时观测先于性能决策）。
5. **本轮无登记缺口**之外的两个边界：a) 未逐文件分析 472 个上游文件的每一行，分析深度集中在 story-long-write/story-setup/story-deslop 的机制文件与 demo 协议实例；b) story-import/story-review 只做结构级对账，未逐行深挖，若用户要求"每一个技能逐文件"可再立项扩展。
