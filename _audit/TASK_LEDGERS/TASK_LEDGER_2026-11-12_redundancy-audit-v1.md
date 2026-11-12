# TASK_LEDGER - 2026-11-12 - redundancy-audit-v1

## 1. 目标与原话

用户原话：

> 你前面做的是审查当时的过度设计，那现在要做的是用同样的执行纪律和条件，来深度审查有无冗余组件和语义以及状态机，有无以及不适用的了属于负担了

最终可感知行为：

1. 完成冗余组件、冗余语义、冗余状态机与不适用负担的审计。
2. 结论按处置分级：删除、退役、保留、冻结、独立审计。
3. 输出方案供用户审核，本轮禁止删除。

本轮交付物：

1. `_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-12_redundancy-audit-v1.md`
2. `_audit/REDUNDANCY_AUDIT_2026-11-12.md`
3. `_audit/PROPOSAL_2026-11-12_REDUNDANCY_CLEANUP_V1.md`

## 2. 门禁读证

| Gate | 经验文件证据 | 本轮适用 |
| --- | --- | --- |
| G0.10 | `_audit/神意开发经验总结_v9.md:92`：删除或替换链路必须覆盖源码、测试、脚本、规格、日志、运行状态、构建产物七层 | 方案 Phase 必须有负向断言 |
| G0.12 | `_audit/神意开发经验总结_v9.md:114`：非平凡任务必须产出台账七节 | 本台账 |
| G0.13 | `_audit/神意开发经验总结_v9.md:134`：最小必要性与过度设计禁令；删除过时负担 | 审计主门禁 |
| G1.2 | `_audit/神意开发经验总结_v9.md:154`：删除类操作先对生产源码、测试脚本、历史资料三面搜索 | 每个删除候选 |
| G1.3 | `_audit/神意开发经验总结_v9.md:158`：同一状态语义多入口分叉必须审计旁路 | progressPhase、pipeline run 状态 |
| G1.11 | `_audit/神意开发经验总结_v9.md:274`：删除/修复链路时旧断言同批更新 | editTaskExecutor、progressPhase 方案 |
| G1.14 | `_audit/神意开发经验总结_v9.md:303`：缺陷面枚举，sibling 横扫与旧协议残留 | 台账第七节 |
| G1.15 | `_audit/神意开发经验总结_v9.md:332`：判定组件必要性必须评估用户入口、不可替代价值、组合风险、删除收益 | 报告四级评估 |
| G1.20 | `_audit/神意开发经验总结_v9.md:384`：预算实例单源，防双预算 | 编辑任务状态机排查 |
| G1.21 | `_audit/神意开发经验总结_v9.md:396`：脚本质量与生命周期 | scripts 孤儿独立方案 |
| G1.27 | `_audit/神意开发经验总结_v9.md:475`：死亡标识符逐成员消费点扫描；链步状态列出写入者/读取者 | 删除候选与状态机排查 |

## 3. 路由判定

### 加入

1. G0.10、G0.12、G0.13、G1.2、G1.3、G1.11、G1.14、G1.15、G1.27：审计对象涉及源码、语义、状态机、测试契约与删除闭包。
2. G1.21：`scripts/` 孤儿面需要登记，但本轮只排除出执行范围。

### 排除

| Gate | 排除理由 |
| --- | --- |
| G1.10 | 本轮不修改写入授权，只审计组件引用；权限面无命中。 |
| G1.13 | 本轮不执行 Electron 实测；只交付方案，等批准后才可能进入实施验证。 |
| G1.22 | 本轮不修改检测、评分或阈值逻辑。 |
| G1.24 | 本轮不修改共享测量或候选比选。 |
| G1.28 | 本轮不是修复承诺回归；实施批准后若进入方案执行再适用。 |

## 4. 影响圈与作者反证

### 打算改的范围

本轮不改代码。建议后续删除：

1. `src/services/editTaskExecutor.ts`
2. `src/services/editTaskExecutor.spec.ts`
3. `src/stores/chapter.ts`
4. `src/components/common/DiffModal.vue.d.ts`
5. `PipelineProgressPhase` 四个未生产消费的枝
6. `package.json` 中 `verify:postprocess-ui-electron`

### 可能碰到的范围

1. `.dependency-cruiser.cjs:62`
2. `src/services/toolLoopPolicy.spec.ts:24-32`
3. `src/services/runProgressChannel.spec.ts:33-55`
4. DEV_LOG 历史索引与历史报告

### 作者反证

1. 假设：`editTaskExecutor` 可能是备用运行入口。证伪：`rg -n "executeEditTask|createTaskFromSnapshot|editTaskExecutor" src .dependency-cruiser.cjs scripts package.json`，生产引用为 0，只剩自 spec、`toolLoopPolicy.spec.ts` 源码契约和 depcruise 豁免。
2. 假设：`PipelineRunCenter.vue` 可能是流水线冗余。证伪：`src/components/pipeline/PipelinePanel.vue:77` 真实挂载，跨 layer 全景语义不同于 Panel 内每层最新 run。
3. 假设：`PipelineProgressPhase` 死枝可能被 registry 内部默认状态使用。证伪：`runRegistry.ts:13` 只是类型联合，生产发射点 `pipeline.ts:262` 只有 queued/requesting/terminal。
4. 假设：孤儿 store 会被动态引用或设置页导入。证伪：全仓非审计面 `useChapterStore` 只命中自身声明。

## 5. 停止条件

### 本轮完成条件

1. 台账七节完整。
2. 审计报告每个候选都有 file:line 与消费扫描证据。
3. 方案按 Phase 给出删除闭包、负向断言和验证命令。
4. 不执行删除；等待用户批准。

### 实施前必须补足

1. `npm run verify:production-wiring`
2. `npm run type-check`
3. 目标 vitest 文件
4. 每个删除候选的 `git diff --check`

## 6. 执行证据

### 基线

1. `git log --oneline -3`：
   - `c935a9b2 perf(editor): fix phase e/f deep-review regressions, release 3.127.1`
2. 工作区存在用户侧未跟踪材料，本任务未触碰。

### F1：chapter store

命令：`rg -n "useChapterStore|stores/chapter|from 'src/stores/chapter'" ...`

关键结果：

1. `src/stores/chapter.ts:18`：唯一生产面命中，自身声明。
2. `_audit/call-graph.*` 与历史会话记录不是当前生产消费。

### F2：DiffModal declaration

命令：`rg -n "DiffModal.vue.d.ts|DiffModal" src`

关键结果：

1. `src/components/common/DiffModal.vue.d.ts:1-3` 是孤儿 declaration。
2. 当前 `_audit/call-graph.*` 不是运行时消费。

### F3：editTaskExecutor

命令：`rg -n "executeEditTask|createTaskFromSnapshot|editTaskExecutor" src .dependency-cruiser.cjs scripts package.json`

关键结果：

1. 生产源码引用：0。
2. 自测试：`src/services/editTaskExecutor.spec.ts:3,21,25,61,86,125,146`。
3. 源码契约：`src/services/toolLoopPolicy.spec.ts:27-31`。
4. 豁免规则：`.dependency-cruiser.cjs:62`。
5. 生产入口：`useEditTaskSession.startOrContinueBatch`，状态机经 `editTaskService` 单一转换表收口。
6. `createTaskFromSnapshot` 定义于 `editTaskExecutor.ts:53`，只被同文件 `executeEditTask` 消费。

### F4：progressPhase

命令：`rg -n "PipelineProgressPhase" src`

关键结果：

1. 类型定义：`src/services/runRegistry.ts:13-20`，7 个枝。
2. 生产发射：`src/stores/pipeline.ts:262` 只有 queued/requesting/terminal。
3. spec 死枝证据：`src/services/runProgressChannel.spec.ts:33-55` 使用 streaming/validating/repairing。

### F5：npm script

命令：`rg -n "verify:postprocess-ui-electron|verify:deai-stage-guidance-live" package.json scripts _audit docs`

关键结果：

1. `package.json:29` 定义，生产/测试/文档三面无当前消费。
2. `_audit/DEV_LOG_2026-10-17_protocol-status-echo-consolidation.md:32` 只有历史登记。
3. `verify:deai-stage-guidance-live` 有 spec `readFileSync` 消费倾向，方案列保留。

### 排除的候选

1. `PipelineRunCenter.vue`：`PipelinePanel.vue:77` 挂载，保留。
2. pipelineStore `runs` / `activeRuns` 双导出：两处有真实消费，保留。
3. Agent 覆盖导入链路：`agent.ts:55-75` 已全字段刷新并有 spec，保留。
4. `useEditTaskSession`：显式事件驱动，无旁路 patch，保留。
5. `chainIntentCorpus.ts`、`crashMonitor.ts`、`repairFeedbackWait.js`、intent 工厂三件、`shadowIntentCorpus.ts`：继承上轮保留判定。
6. `__shenyiStepArtifact` 兼容层：`PipelinePanel.vue:883,4433-4455` 仍消费，保留。
7. `DEAI_MODEL_PROFILE_RELEASED=false`：有意冻结，spec 锁定，保留。
8. 1000+ 类型导出：TS 结构类型 API 面，不按导出名误判死代码。

## 7. 缺口清单与缺陷面枚举

### G1.14 枚举清单

| 枚举面 | 命中 | 处置 |
| --- | --- | --- |
| 分支清理：候选对象自身状态清理点 | F3 不在生产执行路径；F4 四枝无生产发射 | 方案删除或裁剪 |
| sibling 横扫：同款编辑任务执行器 | `useEditTaskSession` 为生产入口；`editTaskService` 为状态机单源 | 保留 |
| sibling 横扫：流水线 run 展示入口 | `PipelineRunCenter.vue` 与 Panel 层视图语义不同 | 保留 |
| 旧协议残留：`__shenyiStepArtifact` | 生产消费，非死语义 | 保留 |
| 旧协议残留：旧 npm script | `verify:postprocess-ui-electron` 无当前消费 | 方案 Phase P3 |
| 链式字段：谁写/谁读 | progressPhase 生产只写 queued/requesting/terminal；registry 消费同字段 | 四枝死语义，P2 裁剪 |
| 死亡标识符：import 成员 | F1/F2/F3/F5 全部逐一扫描 | 未扩大删除 |
| `scripts/` 孤儿 | 187 个中 120+ 无直接入口，但多为 DEV_LOG 一次性验证产物 | 独立方案，本轮不删 |

### 缺口清单

1. 未执行：不执行删除；等方案批准。
2. 未执行：未跑 Electron 实测；本轮目标不是运行验证。
3. 降级：`scripts/` 孤儿只登记不处置；避免一次性删除历史验证资产。
4. 遗留项：用户侧未跟踪文件与验证包未触碰。
5. 无法在本轮证明：删除后的生产 wiring、type-check、vitest 行为；必须实施后跑。
6. 本轮无 G1.14 命中后静默遗漏；所有命中均已登记。

## 状态

方案待审。本轮状态：审计与方案完成，执行未开始。
