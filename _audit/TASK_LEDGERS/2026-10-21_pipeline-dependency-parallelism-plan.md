# 2026-10-21 流水线依赖并行能力方案研磨（未写码）

## 1. 目标与边界

- 目标：在不破坏卷纲 / 章节 / 正文依赖关系的前提下，把“全局一次只能跑一项”改为“按目标锁调度的依赖并行”。
- 本轮边界：只做方案与验证设计，不修改生产代码、不运行封装。
- 硬前提：每层默认最多一个主运行；上游产物未确认/未稳定时，下游不得消费；全局供应商并发默认上限 2，超出排队。

## 2. 证据基线

- 经验文件：`_audit/神意开发经验总结_v7.md`（内容 v8.17）。
- 全局单例状态：`src/stores/pipeline.ts:7-61`。
- 全局按钮锁：`src/components/pipeline/PipelinePanel.vue:362`、`:467`、`:562`。
- trace 单当前运行：`src/stores/runTrace.ts:899`、`:935`、`:1104`。
  - 并发隔离现仅覆盖“source 之间”（`src/stores/runTrace.spec.ts:145`），不覆盖 pipeline source 内多运行。
- 信号回退：`src/components/pipeline/PipelinePanel.vue:2986`。
- 章节共享断点：`PipelinePanel.vue:4391`、`:4420`、`:4576`；`src/stores/pipeline.ts:51-58`。
- 保存合并窗口：`src/stores/project.ts:766-847`。
- 目标索引可变：`PipelinePanel.vue:1622-1625`；正文已有目标快照雏形 `:4619-4625`。
- 基线：HEAD `469b241c`，版本 3.102.0；工作区存在用户既有未提交改动，本轮不改动。

## 3. 研磨记录（20 轮）

| 轮 | 研磨对象 | 结论 |
|---|---|---|
| 1 | 目标反推 | 用户要的是依赖流水线并行，不是无限并发；必须先定义“可并行单元”与“不可并行目标” |
| 2 | 全局 AbortController | `startGeneration()` 会先 abort 旧控制器，直接放开按钮必然互相取消 |
| 3 | 全局状态模型 | 需要每运行状态：runId、controller、progress、status、traceRunId、断点 owner、反馈通道、目标锁 |
| 4 | 进度反馈 | `activeGenerationFeedbackStep`、`skillStepStates` 单实例，需按 runId 分槽 |
| 5 | 取消语义 | 必须每运行独立取消；成功/失败/取消三终态与 trace、UI、registry 三方收敛 |
| 6 | trace 冲突 | `currentRunId` 是 pipeline 单槽；并行后所有事件必须显式携带 runId，禁止 fallback |
| 7 | API 包装器 | `callApiWithAgentVariant` 有 `currentRunId` 与全局 signal fallback，需强制显式参数 |
| 8 | folder SKILL | `runStepSkills` 及后续 trace 写入需绑定 run 上下文，SKILL 只影响提示词不影响调度 |
| 9 | chain 断点 | owner 隔离已存在，但各层 owner 生成必须进入 run 记录，避免重复/错位 |
| 10 | 章节断点 | 仍用共享 `pipeline_breakpoint`，需迁到 `volumeId + projectId + mode` owner |
| 11 | 断点生命周期 | 写入/读取/清理/终态四行对账；清理失败不得宣称成功 |
| 12 | 目标索引 | 生成执行禁止依赖 UI 可变 index；启动时冻结 volumeId/chapterId 快照 |
| 13 | 依赖门 | 章节只消费 confirmed 且未被卷纲运行占用的卷；正文只消费已有且未被章节/正文占用的章 |
| 14 | 保存队列 | 现有合并队列有丢后续保存窗口，需严格串行链：每次运行侧数据变更后追加保存 |
| 15 | 数据替换 | `setVolumes`/`setChapters` 是整块替换，需按目标串行提交，避免并发覆盖 |
| 16 | 供应商 | 需全局并发上限与限流退避；HTTP 200 软错误不得被另一运行掩盖 |
| 17 | UI 观测 | 运行记录、流式状态、运行中锁提示都要按 runId 分流，不能只看 `isGenerating` |
| 18 | 新旧并存 | 旧全局路径必须显式迁移；registry 模式开启后旧无 owner 调用要报错，不得静默 fallback |
| 19 | 验证盲区 | 至少覆盖互不打断、取消一个、失败一个、重启持久化、trace 分离、供应商限流 |
| 20 | 回滚与成熟度 | 分阶段可回滚；方案可审核，但实现、集成、真实 Electron、live 供应商均未验证 |

## 4. 本轮产物

- 方案文档：`_audit/PROPOSAL_2026-10-21_PIPELINE_DEPENDENCY_PARALLELISM.md`。
- 本台账。

## 5. 未完成与登记

- 生产代码未修改，等待用户审核。
- 真实供应商并发行为、外部供应商矩阵、多项目并发场景均未验证，属于方案未验证面。
- 若用户批准，先执行 Phase 0 基线与失败测试，再进入 Phase A。
