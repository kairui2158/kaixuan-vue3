# TASK_LEDGER_2026-11-01_folder-skill-meta-declaration-handoff

## 1. Objective

闭环“文件夹磁盘声明缺失”警告的责任归属与规范传导缺口：

1. 判定 `folder-hydration-field-cleared` 与进度条文案“文件夹磁盘声明缺失”的语义、触发条件和责任边界。
2. 补齐应用侧 folder SKILL `meta.json` 磁盘声明规范，覆盖 `intents`、`contextPolicy` 及既有 `sampleCount/smartSamples/deai/chainHandoff` 字段。
3. 产出给 SKILL 层的补齐清单，明确各层当前缺口、建议值、禁止事项和验收标准。
4. 把“权威源迁移必须同批更新对外手册与体检口径”回写经验门禁，防止下次实现收口后合同断链。

硬性验收：应用侧规范、SKILL handoff、经验门禁、DEV_LOG、总索引全部落地；应用代码不改行为；既有测试锚点保持绿灯。

## 2. Gate Evidence

- `_audit/神意开发经验总结_v9.md` 已读取，适用条目：
  - G0.1 目标对齐：关键句“每轮任务先复述原始目标与最终可感知行为；执行中偏离目标必须显式登记原因”。
  - G0.12 门禁执行台账：关键句“所有非平凡任务……必须产出任务台账，写入 `_audit/TASK_LEDGERS/` 并由当轮 DEV_LOG 链接”。
  - G1.23 契约开关四件套：关键句“真实消费点、测试锚定、手册如实说明、主进程与渲染进程共享实现一致性”；本轮新增权威源迁移条款。
  - G1.25 同一语义多入口与 CJS 测试替身：关键句“运行时只允许一个磁盘元数据水合源，store 快照仅用于首屏渲染”。
  - G2.13 SKILL 执行中立：关键句“SKILL guidance 只允许改变提示词、领域能力与上下文组织；禁止改变应用执行协议”。
- 技能：docs-generator、verification-gate 已读取。本任务是契约文档与经验回写，不触碰运行时代码，按 docs-generator 的“无占位符、示例可执行、结构化披露”执行；按 verification-gate 的“新鲜证据先于完成声明”执行。
- 基线：HEAD `5da14fc5`（3.110.12 已封装提交），开工前 `git status --short` 为空。

## 3. Routing Decision

采纳项：

- G0.1、G0.12、G0.5 影响圈、G1.16 经验回写因果、G1.23 契约四件套/权威源迁移、G1.25 磁盘权威源、G2.13 SKILL 中立。

排除项与理由：

- G1.4-G1.13 UI/验证器门禁：不适用。本轮未改 UI、运行时、脚本与测试断言，不引入真实 UI 回归面；验证限定为文档证据、字段锚点与定向测试绿灯。
- G2.9 流水线验收门禁：不适用。本任务不改变生成验收、候选账本、叙事 verdict 或重试语义。
- G2.14 存储迁移：不适用。本任务不改变任何存储位置或迁移策略。

## 4. Impact Circle And Author Counter-Evidence

影响面：

- 新增 `_audit/FOLDER_SKILL_META_DECLARATION_SPEC_2026-11-01.md`。
- 新增 `_audit/SKILL_META_DECLARATION_HANDOFF_2026-11-01.md`。
- 修订 `_audit/FOLDER_SKILL_BODY_PROTECTED_CONTRACT_GUIDE_2026-10-30.md`、`_audit/SKILL_NARRATIVE_VERDICT_HANDOFF_2026-10-31.md`：增加对新规范的交叉引用。
- 修订 `_audit/神意开发经验总结_v9.md`：G1.23 新增权威源迁移条款，版本 v9.8.7 → v9.8.8。
- 新增 `_audit/DEV_LOG_2026-11-01_folder-skill-meta-declaration-handoff.md` 并登记 `_audit/DEV_LOG_MASTER_INDEX.md`。

反证点：

- **不改运行时代码的反证**：`folderSkillRuntimeHydration.spec.ts` 已锁定“磁盘缺失字段清空”与“磁盘权威源”语义；`skillHealth.spec.ts` 已锁定缺声明 warning 与非法值 error。规范必须描述现有行为，而不是借文档改动悄悄扩语义。
- **不改 SKILL 层 meta.json 的反证**：SKILL 目录在本仓库外，且本轮已由用户裁决为“先出应用侧规范与适配说明，再交 SKILL 层执行”；应用侧越权改 SKILL 包会破坏责任边界。
- **不新增导入校验的反证**：本轮缺口是“规范未传导”，不是“校验缺失”；在手册传导前收紧校验会把历史合规包错误判为不健康。是否升为 error 留给后续 SKILL 全层补齐后裁决。

## 5. Stop Conditions

- 定向测试红灯时停止文档收口，先判定是文档描述错误还是测试锚点过时。
- 发现规范描述与实现语义冲突时，以 `skillIdentity.ts` / `realSkillLoader.ts` 实现为准修正文档，不反向改实现迎合文档。
- SKILL 层如对 `includeOutline` 建议值提出模板重复注入异议，先登记到后续对账清单，不单方面改规范建议值。

## 6. Execution Evidence

1. **责任归属**：运行时警告由 `src/services/folderSkillRuntimeHydration.ts:82-89` 产生；进度条文案由 `src/components/pipeline/PipelinePanel.vue:2505-2514` 渲染；体检同口径见 `src/services/skillHealth.ts:126-142`。触发条件为磁盘 `meta.json` 缺 `intents/contextPolicy`。
2. **历史断链**：`git show 226eece1 -- src/services/folderSkillRuntimeHydration.ts` 证明水合与权威源语义于 2026-10-31 引入；`_audit/DEV_LOG_2026-10-31_skill-import-chain-overhaul.md:8` 写明“磁盘包成为 contextPolicy 权威源”，但当时两份 SKILL 手册均未出现声明要求。
3. **全层缺口**：2026-11-01 扫描 `D:/codex/玄武规划SKILL` 全部 folder `meta.json`，`contextPolicy` 全层缺失；`intents` 仅 L1、L4 已声明。缺口已写入 handoff 第 4 节。
4. **规范落地**：新增字段清单、合法值矩阵、缺失后果、最小示例、各层建议值、体检/运行时判定矩阵、更新步骤、禁止事项与实现锚点。
5. **既有手册修订**：正文受保护契约手册与叙事 verdict 手册各新增一条指向本规范的交叉引用，明确“本规范只新增元数据声明，不改既有合同”。
6. **经验回写**：G1.23 新增“权威源迁移必须同批更新对外手册与体检/预检口径”，经验文件版本升级 v9.8.8。

## 7. Gap List

1. SKILL 层 `meta.json` 尚未补齐；该缺口现在有明确 owner：SKILL 层按 handoff 执行，应用侧等待实测验收。
2. 各层 `includeOutline` 建议值基于模板职责推断；SKILL 层按模板实际注入情况复核后可调整合法值，但不得退回缺省。
3. 本轮不升版、不封装、不提交 git；按项目惯例留待用户后续裁决是否并入下一个封装节点。
