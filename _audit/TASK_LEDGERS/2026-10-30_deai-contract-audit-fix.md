# TASK LEDGER：folder SKILL 降AI契约质疑对账与补漏（2026-10-30）

## 1. 目标与原话

用户原话核心：“你方案里的给SKILL的手册我提交给SKILL对话框了，但是SKILL对话框提出了问题，看来你不诚实。”并列出 SKILL 方 8 条质疑。最终可感知行为：8 条逐项给出真实判定，真实缺口修复并测试，设计边界不被伪装，经验文件补门禁。

交付物：契约共享校验单源、主进程预检 CJS 接线、compose meta 补线、三类测试、DEV_LOG、经验文件 v9.8.2、主索引登记。

## 2. 门禁读证

- G0.3 诚实闭环：不能把过时指控说成已修，不能把设计边界说成缺陷。
- G0.5 回头看：8 条逐项对源码与测试，区分真实消费、测试锚定、手册披露、共享实现四层。
- G0.12 门禁执行台账：本文件即七节凭证。
- G1.1 精准编辑与 diff 自审：只碰本任务相关文件，不清理无关脏改动。
- G1.4 验证真实性：本轮重跑 executor 测试、契约相关测试与 type-check；上一轮 build 只作历史证据。
- G1.23（本轮新增）：契约开关四件套，真实消费点、测试锚定、手册如实说明、跨进程共享实现一致性。

## 3. 路由判定

- 加入：契约开关审计、跨进程共享校验、技能包预检、agent/compose 接线、测试防退化。
- 排除：git 提交与封装，用户未要求，当前版本保持 3.110.7。
- 排除：真实 live 生成验证，本轮问题集中在静态接线与测试锚定，真实 UI 预检登记为 `untested`。
- 排除：语义级冲突检测升级，v1 手册已披露词表边界，升级需要样本与契约版本设计，不能在审计轮顺手改语义。

## 4. 影响圈与作者反证

打算改：`skillDeaiContractValidation.ts`、`skillDeaiContract.ts`、`vite.protocols.config.mts`、`electron/ipc/skill-package.js`、`PipelinePanel.vue`、契约相关测试、审计文档。

可能碰到：主进程加载渲染进程产物、compose 模板元数据、agent 调用签名、终步重试 findings。最可能错的假设是“手册写了就等于实现了”，证伪方式为逐条找真实消费点与测试锚点；结果证明第 1、6 条指控过时，第 2 条是已披露边界，第 3、4、7、8 条存在真实缺口。

## 5. 停止条件

机器可判定条件：8 条质疑都有 `file:line` 判定；`finalStepDetection: off`、`suffix-only` 等价、agent 真实 meta 三类测试存在且通过；主进程能加载共享 CJS；`realSkillExecutor` 定向测试 59/59；契约相关测试 28/28；`vue-tsc` exit 0；DEV_LOG、台账、主索引、经验文件全部落盘。

## 6. 执行证据

- 终步开关消费点：`src/services/realSkillExecutor.ts:510` → `options.finalStepRetry?.deaiDetection ?? 'on'`；`:511-513` 关断时不收集 findings。
- 关断测试：`src/services/realSkillExecutor.spec.ts:1649` → `keeps finalStepDetection off free of app-owned DEAI findings`。
- suffix-only 等价：`src/services/skillDeaiContractValidation.ts:30` → `SUFFIX_ONLY_EQUIVALENT_MODE = 'on'`；测试 `deai-injection-policy.spec.ts:64`。
- agent 接线：`src/components/pipeline/PipelinePanel.vue:3158` 传 `resolveSkillDeaiMetaFromTemplate(template)`；compose `meta` 在 `:4764`。
- 防退化测试：`src/components/pipeline/__tests__/deai-injection-policy.spec.ts:125` 锁定真实消费链。
- trace step 参数化：`PipelinePanel.vue:936` 函数签名含 `step`；调用点 `:2744`、`:3633`。
- 预检：`electron/ipc/skill-package.js:7` require 共享 CJS；`:52-60` 消费 `validateSkillDeaiMeta`；测试 `skillPackageManager.spec.ts:122`、`skill-package.spec.js:22-29`。
- 本轮命令输出：`realSkillExecutor` 59 passed；契约相关 4 files / 28 tests passed；`vue-tsc --noEmit` exit 0；`git diff --check` 无 whitespace 错误。

## 7. 缺口清单

- 本轮不提交 git、不重新封装，版本保持 `3.110.7`。
- 真实 Electron 导入技能压缩包并查看预检 UI 的操作未执行，保持 `untested`。
- 冲突检测仍是中文固定词表，不做同义改写级语义判断；这是 v1 手册披露的设计边界，登记为未来契约升级候选。
- schema retry 仍回传候选全文的同族优化项不属于本轮 8 条质疑范围，不冒充本轮修复。
