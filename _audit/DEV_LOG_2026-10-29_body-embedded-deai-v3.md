# DEV_LOG 2026-10-29 正文层内嵌降AI V3 落地

## 1. 目标

按 `_audit/PROPOSAL_2026-10-29_BODY_EMBEDDED_DEAI_V3.md` 完成正文层内嵌降AI升级，并通过 Phase 9 集成回归收口。Phase 10（真实中文网文样本校准）已执行：四条放行标准 PASS，但整体判定层保持 `provisional` 边界。

## 2. 范围

- 观测诚信：删除假 `retentionRatio`，检测异常进入 `quality_gate_degraded`。
- 深度修复：新增句级 LCS 变更率门禁（0.30 warning / 0.50 reject，按 blocking findings 分级）。
- 检测内核：V2 增加长度自适应阈值、中文 2/3-gram 指纹、叙述/对白分层、风格漂移与整体评分。
- 作者声纹：`buildDeaiVoiceProfile` 从 `styleProfileEffective` 投影，生成期与深度修复共用。
- 提示词：S1/S2/S3 压缩为 12/5/6 条，并保留小说事实保护与过度纠错反信号。
- `legacy-auto`：新项目默认关闭，UI 明示字符替换不提高人味。
- 契约：新增 `src/services/skillDeaiContract.ts`，folder/agent 双路径共享投影，SKILL 只声明不夺权。
- 手册：交付 `_audit/FOLDER_SKILL_DEAI_CONTRACT_GUIDE_2026-10-29.md`。
- 验证：新增 `scripts/verify-deai-body-electron.mjs` 真实 Electron 三场景验证器。
- 执行台账：[_audit/TASK_LEDGERS/2026-10-29_deai-github-benchmark-review.md](_audit/TASK_LEDGERS/2026-10-29_deai-github-benchmark-review.md) 第 10 节，覆盖 V3 Phase 1-10 与收尾边界。

## 3. 关键接线

- folder 路径：`PipelinePanel.vue:2721` 读取 `meta.deai`，`resolveDeaiProjection` 单源投影；`systemPromptSuffix` 进入 `realSkillExecutor`。
- agent 路径：`PipelinePanel.vue:3593` 显式补传 `skillDeaiMeta`，无元数据时标记 `app-default-no-skill-meta`。
- 观测：`PipelinePanel.vue:944` 注入策略，`:2727/:3616` 非法声明，`:2743/:3648` 变体与冲突。
- trace 白名单：`src/stores/runTrace.ts:942-950`。
- 提示词源：`src/services/de-ai.js:1133-1163`。

## 4. 真实 Electron 验证

命令：`node scripts/verify-deai-body-electron.mjs`

结果：PASS，三场景均成功，三张 UI 截图、三份 trace、三份物理请求、心跳 16 帧归档于 `_audit/verification-deai-body-electron/`。

| 场景 | 断言 |
|---|---|
| 无 `meta.deai` | 3 条 policy，source=`app-default-no-skill-meta`，variant=`methodology/creative/polish`；3 条 prompt-variant；3 次物理请求 system 分别含三个注入标记；apiCall 变体一致 |
| `generation: off` | source=`skill-disabled`，variant=`off/off/off`；prompt-variant 事件 0；物理请求 system 均无注入标记；apiCall 变体均空 |
| 非法声明 | source=`skill-declared`；6 条 `deai-contract-warning`，每条含 `contractVersion 仅支持 1` 与 `generation 必须是`，保留原值 99/`sometimes`；回退默认并注入三变体 |

## 5. 性能

`src/services/de-ai-v2.spec.ts:133` 的 20,000+ 字基准：检测 + 变更率合计低于 300ms。该基准随全量测试新鲜重跑。

## 6. 封装

- 版本：3.110.7
- 安装包：`dist/神意助手-Setup-3.110.7.exe`
- 本轮收尾仅新增验证脚本与审计文档，不重复打包；renderer 已重新构建并用于上述 Electron 验证。

## 7. 诚实边界

- Phase 10 已完成数据校准并归档，但整体判定层 NOT CALIBRATED：所有阈值、评分与 n-gram 契约保持 `provisional`，不得宣称最终版。保留原因是单一作者负样本、合成正样本，以及 56% suspicious+ 误伤率（详见第 8 节与校准报告）。
- 本轮未发起 live 供应商请求；Electron 验证使用本地 mock 供应商，但操作、UI、物理请求、trace 均为真实链路。
- 工作区包含前轮与本轮大量未提交改动，本轮未做 git 提交。

## 8. Phase 10 真实中文样本校准

- 脚本：`scripts/calibrate-deai-v2-thresholds.mjs`
- 报告：`_audit/DEAI_SAMPLE_CALIBRATION_2026-10-29.md`
- 数据：`_audit/verification-deai-calibration/deai-v2-calibration-2026-10-29.json`
- 样本：《踏星》主故事 5,588 章，固定种子 `20261029` 抽 200 章（非空白 1500-6000 字）；两类合成正样本各 80 章。
- 首轮缺陷：V2 报告层复用 255 词全量 `BANNED_VOCAB`，真实人写章节 100% blocking、82.5% suspicious+。
- 修复：新增 `DEAI_V2_BLOCKING_VOCAB` 高置信子集与 `detectV2BannedVocab()`，`detectBody` 改用子集；`processBody` 硬规则层保留全量词库。修复后 blocking 81.5%，suspicious+ 56%。
- 放行标准：对白 hedging 误伤率 0%（192 章有对白）；两类合成正样本 n-gram 命中率均 100%；变更率门禁三态由 `de-ai-v2.spec.ts` 覆盖；20,000 字 `detectBody` 26.01ms（本轮复跑）。
- 结论：分层指标 PASS，整体判定 NOT CALIBRATED，`provisional` 保留。
- 测试：定向 2 files / 16 tests PASS；全量 227 files / 2431 tests PASS（56.88s）。
