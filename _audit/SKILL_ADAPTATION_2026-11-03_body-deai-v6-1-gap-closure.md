# 正文层内嵌降AI V6.1 缺口闭环：SKILL 适配说明

日期：2026-11-03
关联方案：`_audit/PROPOSAL_2026-11-02_BODY_DEAI_COLLABORATION_V6_1.md`
关联开发日志：`_audit/DEV_LOG_2026-11-03_body-deai-v6-1-gap-closure.md`

## 本轮应用侧变化

1. 校准账本加入固定上限 500 条。写入时按 `sampleCount desc, updatedAt desc` 保留强证据条目，超出部分裁剪。trace 的 `deai-calibration` 事件会带上 `ledgerEntryCount`、`maxEntries`、`pruned`、`prunedCount`，SKILL 作者可以从导出的 trace 里看到裁剪边界。
2. 模型画像 guidance 的入口从“第 4 步硬编码”改为“body 层语义标记”。应用内部仍用 `BODY_LAYER_STEP` 常量作为当前流水线编号，但注入判定不再依赖面板里的字面数字。folder SKILL 如果重排 S1/S2/S3 或增删前置步骤，不会因为这个入口静默失效。
3. 误伤候选现在有真实登记入口。正文层降AI反馈区域内提供“登记误伤”输入与按钮，输入会写入当前 run 的 `deaiSkillReport.falsePositives`，导出报告的“误伤候选”章节会带出。登记只影响报告，不进入校准账本，不影响画像门槛、guidance 注入和正文终态。
4. S2 诊断、报告状态继续挂在 per-run 状态上，attempt 重置会清空暂存诊断；诊断 guidance 是链内局部变量，不跨 run 共享。
5. 2026-11-03 追加：S2 诊断每条 finding 的 `sample` 独立截断为 120 字符；总预算仍为 1200 字符。0 条 finding 时 trace 会输出 `S2 后降AI位置诊断已执行：0条 / 未注入`，这是观测事件，不代表质量失败，也不会注入 S3。
6. 2026-11-03 追加：模型画像冻结期一律输出 `releaseGate=calibration-not-ready`。无 eligible 规则时 label 为“模型事实画像未达标，未注入”；有 eligible 规则时 label 为“模型事实画像已冻结，未注入”。两者都表示不注入。
7. 2026-11-03 过度设计收敛：S2→S3 诊断入口改为 body 层语义，不再依赖面板第 4 步编号。folder SKILL 未来重排 S1/S2/S3 时，只要仍属于正文层链，诊断接线不会因步骤号变化静默失效；`step` 字段仅用于 trace 展示。

## SKILL 作者如何消费

1. 查看误伤：导出 `deai-skill-report-*.md`，读“误伤候选”章节。没有登记时显示 `- 无`。
2. 登记误伤：在正文层降AI反馈区域输入，格式建议 `ruleId：为什么这是合法形态`。登记后重新导出报告即可。
3. 判断画像是否可用：当前画像 prompt 注入已因校准 NOT READY 冻结。`sampleCount >= 5` 只代表进入候选观测，不代表可注入；未来启用必须另行通过误伤率、召回率与分层校准发布门禁。
4. 判断账本是否被裁剪：读 `deai-calibration` trace 的 `pruned/prunedCount`。若强证据条目被裁掉，应优先提高样本覆盖而不是依赖低证据旧条目。
5. 判断 S2 是否进入 S3：只有 S2 通过并进入 S3 时才应出现 `deai-stage-guidance`。S2 失败导致 run 终止时没有该事件是正确行为，不是应用漏接线。
6. 判断字数失败：最新 live `run-20261103-020722` 第 2 章三次 S2 候选净字数约 1434/1447/1447，均低于 1600 下限；retry 已携带场景骨架、FACT_LOCK 与净字数缺口，未携带候选全文。该失败属于 S2 施工长度不足，应由 SKILL 作者迭代施工策略，应用不替 SKILL 改写作规则。

## 边界声明

- 应用只送情报，不替 SKILL 判断误伤，不改写正文，不影响终态。
- 误伤登记是人工回传通道，不是自动判定器。
- 账本上限 500 条是防膨胀保护；被裁剪条目不再参与画像候选。冻结期账本只用于证据积累与 trace 观测。
- 本轮不升版、不封装、不提交 git。
