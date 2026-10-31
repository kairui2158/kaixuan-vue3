# DEV_LOG_2026-11-01_folder-skill-meta-declaration-handoff

## 目标

闭环正文层生成时 API 进度条出现“文件夹磁盘声明缺失”的责任归属与规范传导缺口：确认这是应用侧权威源迁移后手册断链，而不是 SKILL 层违规；补齐应用侧 meta.json 声明规范、给 SKILL 层的补齐说明，并把教训回写经验门禁。

## 交付内容

- 新增 [_audit/FOLDER_SKILL_META_DECLARATION_SPEC_2026-11-01.md](_audit/FOLDER_SKILL_META_DECLARATION_SPEC_2026-11-01.md)：磁盘 `meta.json` 声明唯一规范，覆盖 `intents/contextPolicy` 字段清单、合法值、缺失后果、最小示例、各层建议值、体检与运行时判定矩阵、更新步骤与禁止事项。
- 新增 [_audit/SKILL_META_DECLARATION_HANDOFF_2026-11-01.md](_audit/SKILL_META_DECLARATION_HANDOFF_2026-11-01.md)：给 SKILL 层的执行清单，含全层当前缺口表、建议值、验收标准和与既有合同的边界。
- 修订正文受保护契约手册与叙事 verdict 手册，增加指向新规范的交叉引用；不改变原合同语义。
- 更新 [_audit/神意开发经验总结_v9.md](_audit/神意开发经验总结_v9.md) G1.23：新增“权威源迁移必须同批更新对外手册与体检/预检口径”，版本 v9.8.7 → v9.8.8。

## 根因与因果

1. 2026-10-31 `226eece1` 收口技能导入链路时，把 folder 磁盘包设为 `contextPolicy` 权威源，并新增缺失字段清空与 warn 观测。
2. 同一轮 DEV_LOG 写明了新权威源，但发给 SKILL 层的手册从未要求声明 `intents/contextPolicy`；SKILL 层按旧手册交付，`meta.json` 只声明了当时被要求的样本与降AI字段。
3. 2026-11-01 正文层实测暴露警告；全量扫描确认 `contextPolicy` 全层缺失，`intents` 只有大纲层和章节层已声明。结论：不是单层事故，是规范传导断链。

## 验证过程

见台账第 6 节与“本轮验证输出”。本轮未修改运行时代码，不触发用户可见回归面；验证限定为文档存在性、规范与实现锚点一致性、既有语义测试绿灯。

## 本轮验证输出

1. `npx vitest run src/services/folderSkillRuntimeHydration.spec.ts src/services/skillHealth.spec.ts src/services/folderSkillRecordFactory.spec.ts src/services/skillIdentity.spec.ts` → `Test Files 4 passed (4)`、`Tests 24 passed (24)`。
2. `npm run type-check` → `vue-tsc --noEmit` exit 0。
3. 规范字段对账：`rg -n "intents|contextPolicy" src/services/folderSkillRuntimeHydration.ts src/services/realSkillLoader.ts src/services/skillHealth.ts src/services/skillIdentity.ts` → 30 行匹配，运行时水合、磁盘加载、体检、合法值单源均使用同一字段名。
4. 文档互链对账：`rg -n "FOLDER_SKILL_META_DECLARATION_SPEC_2026-11-01|SKILL_META_DECLARATION_HANDOFF_2026-11-01" _audit` → 规范、handoff、两份既有手册、DEV_LOG、台账均已互链。
5. 经验版本对账：`rg -n "v9.8.8|权威源迁移" _audit/神意开发经验总结_v9.md` → 头部 v9.8.8 / 2026-11-01，G1.23 权威源迁移条款存在。
6. `git diff --check` → 无空白错误；仅输出 Windows 行尾提示，与仓库现有行为一致。

## 证据

- 运行时观测：`src/services/folderSkillRuntimeHydration.ts:82-89`
- 进度条文案：`src/components/pipeline/PipelinePanel.vue:2505-2514`
- 体检口径：`src/services/skillHealth.ts:126-142`
- 合法值单源：`src/services/skillIdentity.ts:1-55`
- 规范：[_audit/FOLDER_SKILL_META_DECLARATION_SPEC_2026-11-01.md](_audit/FOLDER_SKILL_META_DECLARATION_SPEC_2026-11-01.md)
- Handoff：[_audit/SKILL_META_DECLARATION_HANDOFF_2026-11-01.md](_audit/SKILL_META_DECLARATION_HANDOFF_2026-11-01.md)
- 台账：[_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-01_folder-skill-meta-declaration-handoff.md](_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-01_folder-skill-meta-declaration-handoff.md)

## 教训回写

- G1.23 新增权威源迁移条款：权威源迁移不是实现内部重构，它改变外部协作方的交付合同；运行时收口、体检口径、对外手册、最小示例必须同批落地。
- 本次断链不是 SKILL 不配合，而是应用把合同写在 DEV_LOG 里却没有发给合同相对人。以后凡是“权威源/契约面”变更，DEV_LOG 不算对外发布。

## 边界

- 不修改 SKILL 层磁盘包；SKILL 侧补齐由 handoff 执行。
- 不改运行时行为、不新增导入阻断、不升版、不封装、不提交 git。
