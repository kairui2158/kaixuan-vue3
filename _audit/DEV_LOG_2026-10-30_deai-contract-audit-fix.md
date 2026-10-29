# DEV LOG：folder SKILL 降AI契约质疑对账与补漏（2026-10-30）

## 背景

用户把 `_audit/FOLDER_SKILL_DEAI_CONTRACT_GUIDE_2026-10-29.md` 提交给 SKILL 对话框后，SKILL 方回传 8 条质疑，认为手册承诺与应用实现不一致。本任务逐条核实这 8 条，真实缺口补代码与测试，设计边界如实保留，不把过时指控伪装成已修。

## 交付

- 契约纯校验收口：新增 `src/services/skillDeaiContractValidation.ts` 作为主进程与渲染进程共享单源；`src/services/skillDeaiContract.ts` re-export，不再维护第二份默认值。
- 主进程预检接线：`vite.protocols.config.mts` 增加 `skillDeaiContractValidation.cjs` 构建；`electron/ipc/skill-package.js` 通过 dist CJS 调用 `validateSkillDeaiMeta`，错误进入包预检 issue，警告进入 warning。
- agent/compose 接线补漏：`PipelinePanel.vue` 的非 folder agent 路径传入 `resolveSkillDeaiMetaFromTemplate(template)`；compose 合成模板补回 `meta` 字段。
- trace 参数化：`emitDeaiInjectionPolicyTrace` 增加 `step` 参数，调用点传入实际 step，不再硬编码正文层编号。
- 测试补位：新增 `finalStepDetection: off` 终步 findings 不注入用例；保留 `suffix-only` 与 `on` 等价性用例；新增 agent 路径真实消费 skill-declared meta 的防退化用例；技能包预检与 CJS 加载测试补齐。

## 8 条质疑逐项对账

| # | SKILL 方质疑 | 判定 | 本轮处理 |
|---|---|---|---|
| 1 | `finalStepDetection` 是死开关 | 过时不准确：`realSkillExecutor.ts:510-513` 真实消费该开关，`off` 时不注入终步 findings | 真缺口是缺关断测试，已补 `realSkillExecutor.spec.ts:1649` |
| 2 | `suffix-only` 与 `on` 无实际分支 | 属实但是契约 v1 设计语义：唯一生成期注入通道是 `systemPromptSuffix`，trace 保留声明原值 | 手册第 1 节如实披露；等价性测试保留在 `deai-injection-policy.spec.ts:64` |
| 3 | agent 路径未真实接线 | 部分属实：非 folder 路径已有接线，compose 合成模板曾丢失 `meta` | 修复 `PipelinePanel.vue:4764`，防退化测试锁定接线 |
| 4 | agent 集成测试传 `null` | 属实：旧测试只证明“未声明”路径 | 新增源码锚定测试，锁定 `skillDeaiMetaParam` 投影、真实 meta 传参、compose `meta` 接线 |
| 5 | 冲突检测是固定中文词表 | 属实，v1 明确边界，不做同义改写级语义判断 | 不伪装成缺陷修复；手册第 1 节继续披露边界 |
| 6 | trace 硬编码 `step: 4` | 指控已过时：当前函数已参数化 step，调用点传入实际 step | 不改运行时；本轮对账确认 |
| 7 | 缺 `off`、`suffix-only`、agent 真实 meta 三类测试 | 属实 | 三类测试均已补齐并通过 |
| 8 | 预检报告错误无落地入口 | 部分属实：入口曾因主进程 require 路径不可用而破 | 修复共享 CJS 构建与 require，`skill-package.js:7,52-60` 消费，预检测试通过 |

## 验证

本轮新鲜验证：

- `npx vitest run src/services/realSkillExecutor.spec.ts` → 1 file, 59 tests passed。
- `npx vitest run src/components/pipeline/__tests__/deai-injection-policy.spec.ts src/services/skillDeaiContract.spec.ts src/services/skillPackageManager.spec.ts electron/ipc/skill-package.spec.js` → 4 files, 28 tests passed。
- `npm run type-check` → `vue-tsc --noEmit` exit 0，无类型错误。
- `git diff --check` → 无 whitespace 错误（仅既有 CRLF 提示）。

上一轮已验证并作为历史证据保留，不作为本轮闭环证据：

- `npm run build:vue` 成功，生成共享 CJS。
- 全量 Vitest 86 项定向集通过。

## 边界

- 不提交 git，不重新封装，版本保持 `3.110.7`。
- `suffix-only` 等价语义与中文词表边界是契约 v1 的声明边界，本轮不改语义、不造第二个生成期通道。
- 冲突检测的语义级升级需要新的样本与设计，登记为未来契约升级候选，不得冒充本轮已修。
- 真实 folder SKILL 导入后的 UI 预检操作未做 Electron 级实测，本轮用预检纯函数测试 + CJS 加载测试证明链路可执行，UI 层保持 `untested`。

## 经验回写

- `_audit/神意开发经验总结_v9.md` 升级 v9.8.2，新增 G1.23“契约开关四件套”：真实消费点、测试锚定、手册如实说明、跨进程共享实现一致性；并要求外部质疑逐条分级判定。
