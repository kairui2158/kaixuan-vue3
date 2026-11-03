# DEV_LOG：正文层内嵌降AI协同 V6.1 真实供应商 Live 观测

日期：2026-11-03
关联方案：`_audit/PROPOSAL_2026-11-02_BODY_DEAI_COLLABORATION_V6_1.md`
关联台账：`_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-03_body-deai-v6-1-live.md`
SKILL 适配说明：`_audit/SKILL_ADAPTATION_2026-11-03_body-deai-v6-1-live.md`

## 目标

完成 V6.1 Phase C 第 3 条：真实供应商方向性抽样，只登记 observational，不作为发布门禁，不修改生产代码与 folder SKILL 正式目录。

## 证据修正

本文件曾登记 `run-1793648298222-1`、`run-1793649386380-421`、`run-1793650221953-777` 三次 success。复查发现这三个 runId 只出现在文档中，当前证据目录没有对应深 trace 或 summary，不能作为 live 结论。

本文件已改为只引用 `_audit/verification-deai-stage-guidance-live/` 下五个可对账目录。早期“3/3 success”声明撤回，不作为 3.112.0 发布证据。

## 实际改动

1. 新增 `scripts/decrypt-provider-key-for-live.mjs`
   - 独立 Electron 辅助进程，将 `userData` 指到生产 `D:/神意助手数据/_app-user-data`。
   - 使用 `safeStorage.decryptString` 解密 `enc:` 密钥，明文仅通过 stdout JSON 传给父进程，不写文件、不落日志。
2. 扩展 `scripts/verify-deai-stage-guidance-live.mjs`
   - `loadLiveProvider()` 保留 `encryptedApiKey`，运行前经解密桥接替换，随后删除密文引用。
   - 全局超时 60 分钟、章节超时 20 分钟，均可环境变量覆盖。
   - 每章 try/catch；失败时导出 `chapter-N-failure.json`、`chapter-N-last-snapshot.json`，并尽力导出失败时深 trace 与 run 状态。
3. `package.json` 新增 `verify:deai-stage-guidance-live`。

## 真实 Live 结果

| 证据目录 | 结果 |
| --- | --- |
| `run-20261102-224433` | 第 1 章 failed；未进入后续章。 |
| `run-20261102-232746` | 第 1 章 success，第 2 章 success，第 3 章仍在 `running`；不是有效 3/3 完成。 |
| `run-20261103-000521` | 第 1 章 success，第 2 章 failed；第 3 章未执行。 |
| `run-20261103-004846` | 第 1 章 success，第 2 章 failed；第 3 章未执行。 |
| `run-20261103-020722` | 第 1 章 success，第 2 章 failed；第 3 章未执行。 |

成功章节均观测到：

- S1/S2/S3 请求 variant：`methodology / creative / polish`。
- S2 后 S3 前有 `deai-stage-guidance`。
- 终稿后有 `deai-calibration`，并写入校准账本。
- UI 三线可见：方法论、诊断、校准。
- 模型画像保持冻结：`released=false`，`guidanceChars=0`。

## 失败归因

1. `run-20261103-020722` 第 2 章：S2 三次候选净字数约 1434/1447/1447，均低于 1600 下限；第 3 次出现 reasoning-only 停滞约 12 分钟，应用按 `reasoning_only_stalled` 断流并用关闭思考重试。三次 word-gap retry 均携带 S1 场景骨架、FACT_LOCK、目标/当前/还差净字数，且未携带候选全文。该章未进入 S3，因此没有 `deai-stage-guidance` 是正确行为。
2. 其余失败目录保留 `chapter-N-failure.json`、`chapter-N-last-snapshot.json` 与深 trace，可按同一方式归因；本文件不把失败包装成成功。

## 观测边界

1. 本轮是 observational：证明真实供应商接线与观测一致，不证明写作质量提升，不是发布门禁。
2. 五次运行包含失败与未完成状态；这些状态是证据，不得删除或改写。
3. 3.112.0 交付门禁以全量类型检查、服务测试、构建、封装核验、敏感扫描、显式提交和提交后复查为准；live 观测不替代这些门禁。

## 证据索引

- `_audit/verification-deai-stage-guidance-live/run-20261102-224433/summary.json`
- `_audit/verification-deai-stage-guidance-live/run-20261102-232746/summary.json`
- `_audit/verification-deai-stage-guidance-live/run-20261103-000521/summary.json`
- `_audit/verification-deai-stage-guidance-live/run-20261103-004846/summary.json`
- `_audit/verification-deai-stage-guidance-live/run-20261103-020722/summary.json`
