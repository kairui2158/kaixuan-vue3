# TASK_LEDGER_2026-11-03_body-deai-v6-1-live.md

## 1. 目标与原话

- 用户原话：`进行下一步`
- 方案授权：`_audit/PROPOSAL_2026-11-02_BODY_DEAI_COLLABORATION_V6_1.md` Phase C 第 3 条（真实供应商方向性抽样，observational，不作为发布门禁）。
- 本轮目标：保留真实供应商 live 的成功、失败、未完成证据，核实 V6.1 接线、观测与 UI 是否一致。
- 最终可感知行为：观测产物包含 summary、心跳、Electron 日志、失败快照与深 trace；方法论、诊断、校准、模型画像冻结状态可从 trace/UI 对账。

## 2. 门禁读证

- G0.3 诚实闭环（`_audit/神意开发经验总结_v9.md:36`）：live 失败是观测数据，不得包装成成功。
- G0.5 回头看（`:52`）：反向核对脚本、trace、summary 三层，撤回无证据 runId。
- G1.4 验证真实分层（`:158`）：mock E2E 不冒充 live；provider、baseUrl、model 来自真实供应商配置。
- G1.21 脚本质量（`:402`）：验证脚本必须有超时、阶段日志、finally 清理、失败证据导出。
- G1.12 封装与工作区收尾（`:284`）：live 观测不作为发布门禁，发布仍需全量验证与封装核验。

## 3. 路由判定

- 加入：G0.3/G0.5/G1.4/G1.21/G1.12。
- 排除：G2.10（旧 trace 回放不能替代 live）；G2.14（存储根迁移不参与本轮）。
- 本轮为 observational：不修改 folder SKILL 正式目录，不用 live 结果替代发布门禁。

## 4. 影响圈与作者反证

- 实际修改：`scripts/verify-deai-stage-guidance-live.mjs`、`scripts/decrypt-provider-key-for-live.mjs`、`package.json`、本 DEV_LOG、本台账、SKILL 适配说明。
- 不修改：`src/**` 生产代码、`D:/codex/玄武规划SKILL/凯旋-正文层/**`。
- 作者反证：若明文密钥落文件/日志/trace，或 mock provider 冒充 live，或失败被包装为成功，或文档 runId 无证据，本轮即失败。

## 5. 停止条件

- 完成：五个证据目录的 summary 均可读取并与文档结果一致；成功/失败/running 状态未被包装；密钥形状反查为 0；台账/DEV_LOG/方案状态闭环。
- 失败：证据目录缺失、summary 与文档矛盾、出现密钥形状命中、无证据 runId 被继续引用。

## 6. 执行证据

- `run-20261102-224433/summary.json`：`status=failed`，第 1 章 `run-1793659490507-1` terminal failed。
- `run-20261102-232746/summary.json`：第 1 章 `run-1793662075727-1` success；第 2 章 `run-1793662841226-353` success；第 3 章 `run-1793664170642-893` 仍为 running，不能计为 3/3。
- `run-20261103-000521/summary.json`：第 1 章 `run-1793664330181-1` success；第 2 章 `run-1793665496823-468` failed。
- `run-20261103-004846/summary.json`：第 1 章 `run-1793666936209-1` success；第 2 章 `run-1793668285067-523` failed。
- `run-20261103-020722/summary.json`：第 1 章 `run-1793671649736-1` success；第 2 章 `run-1793673332353-537` failed；第 3 章未执行。
- 成功章节均包含 `deaiPromptVariant=methodology/creative/polish`、`deai-stage-guidance`、`deai-calibration`、`deai-model-profile(released=false)` 与 UI 三线。
- `run-20261103-020722` 第 2 章：S2 三次候选净字数约 1434/1447/1447，均低于 1600 下限；retry 携带 S1 场景骨架、FACT_LOCK 与 word-gap，未携带候选全文。
- 证据修正：`run-1793648298222-1`、`run-1793649386380-421`、`run-1793650221953-777` 无当前证据，已从文档结论中撤回。

## 7. 缺口清单

- observational 边界：本观测证明真实供应商接线、variant、诊断、校准、UI 与 trace 一致；不证明写作质量提升，不作为发布门禁。
- 交给 SKILL 层：成功章节的 S3 postProcess 降级阈值、失败章节的 S2 施工净字数不足，均需 folder SKILL 作者基于深 trace 迭代；应用不替 SKILL 改写作规则。
- 交付边界：本台账不承担 3.112.0 发布完成声明；发布证据见 `_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-03_release-3.112.0.md`。
