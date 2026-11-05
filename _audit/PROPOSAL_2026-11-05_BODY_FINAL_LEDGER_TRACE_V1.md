# PROPOSAL 2026-11-05 正文层终步账本/Trace可信度 V1.1

## 目标与原话

用户原话要求：按经验文件门禁整理详细方案，并回答"为什么降AI没有注入、没有注入岂不是做不到指导作用"。本轮为方案审核稿，不含代码改动。

最终可感知行为：
1. 终步账本格式由应用单方钉死，S3不再因应用序列化噪声产生 18 字段假失败。
2. 已有候选账本、反馈审计与 folder 指纹在 trace 中可被直接对账，不新增重复字段。
3. 降AI"生成前指导"继续生效；未校准画像继续被冻结，不误导生成。

## 降AI未注入的真实结论

本轮 trace 显示两个降AI层行为不同：

| 层 | trace 证据 | 状态 | 判定 |
|---|---|---|---|
| 方法指导包 | seq=16 S2 5条/355字符；seq=294 S3 5条/360字符；seq=283 S3 位置诊断 5条/144字符 | 已注入 | 生成前指导正常 |
| 模型事实画像 | `deaiModelProfile.ts:11` `DEAI_MODEL_PROFILE_RELEASED=false`；gate=`calibration-not-ready` | 未注入 | 正确冻结 |

结论：不是"降AI失效"。方法指导包已经完成生成前教学；模型画像因人写误伤率约43%、模型正样本召回约45%、样本组仅4条，未达发布标准，按 G0.13 不允许注入。若强行注入，才是真正风险。

## P0-1 终步账本 bullet 前缀互镜像

- 现象：旧 S3 对应用格式化账本判 18 字段全缺。
- 根因：`chainExecution.ts:153-186` 的 `formatFinalStepLedger` 把 `extractedMeta[N]` 输出为 `- extractedMeta[N]: ...` bullet 形态；旧 S3 checkHandoff 只认无前缀行。
- 现状：当前磁盘版 `kaixuan-s3/script.js:934-947` 已有 bullet-only 检测分支，可识别该漂移并给定向错误。
- 修复方向：应用侧把终步账本改为无列表前缀的固定形态：`extractedMeta[0]: ...`。理由：
  1. 字段行本质是协议键值，不是 Markdown 列表。
  2. 避免应用与 SKILL 继续互镜像对方格式，形成追风循环。
  3. SKILL 现有 bullet-only 分支保留为防御闸，不新增接口。
- 影响圈：`formatFinalStepLedger`、`chainExecution.spec.ts`、终步 metadata 对账、S3 trace、S3 适配文档。
- 验证：
  - 单测断言 `formatUpstreamMetadata(meta,'final_step_ledger')` 不含 `^- ` 前缀。
  - 断言 `extractedMeta[N]` 值完整且不超过既有 4000/12000 截断。
  - 负向断言旧 bullet 形态不再出现在新请求。

## P1 既有可信度证据（只补接线，不新增字段）

用户追问成熟度、过度设计、冗余、数据膨胀与耗时后，本轮反查发现 V1 的三项观测设计属于重复建设，已删除。

1. **保留候选已有独立账本**
   - `runTrace.ts:205-230` 已有 `bodyCandidateLedger`、`candidateLedger`、`bodyCandidateRetention`、`retainedCandidateIndex`。
   - `realSkillExecutor.ts:1533-1585` 已按 contractDistance/errors 选优；`PipelinePanel.vue:3168-3204` 已写入 trace。
   - 方案只做两件事：修复前先导出当前 trace 对账 retained 与 payload ref；若 UI 缺少"retained candidate"入口，才允许在渲染层加一行只读说明。
2. **重建反馈已有审计**
   - `runTrace.ts:955-1130` 已记录 `strategy`、`candidateChars`、`feedbackChars`、`anchorCount`、`previewChars`、`scaffoldSource`、`scaffoldChars`、`scaffoldFieldCount`、`suppressedCandidateChars`。
   - 本轮实测里 `scaffoldSource=none / suppressedCandidateChars=2961` 已可定位"摘要重开"原因。
   - 不新增 `sourceCandidateRef` 等字段；保留有界反馈，不恢复全文。
3. **SKILL 指纹已存在但未接流水线 trace**
   - 加载器 `skill-loader.js:309-328` 与 `realSkillLoader.ts:37-46` 已返回 `fingerprint`；trace 类型也有 `folderFingerprint`。
   - `workspaceSkillEngine.ts:1028-1050` 已接线，但生成流水线 `PipelinePanel.vue:3275 routeSkill` 未使用 `onFolderLoaded` 记录快照。
   - 最小修复是流水线调用处接收 `pkg.fingerprint` 并写入既有 `RunTracePromptSnapshot.folderFingerprint`；不新建 `skillRuntimeFingerprints`。

## 观察确认（本轮不修）

1. **deep/standard 双目录**：`runTrace.js:69 uniqueExportDestination` 已防同模式覆盖；deep/standard 是同 run 的两种自包含导出，不是同 run 双写故障。payload SHA 一致是正确去重结果。
2. **S3 缩水 3633→2982**：属 SKILL 层职责，应用不越界修，仅保持 trace 可见。
3. **模型画像发布**：等校准样本补齐，不设时间承诺。

## G0.6 成熟度

| 层 | 结论 | 依据 |
|---|---|---|
| 执行器/工具层 | 成熟 | 只改 `formatFinalStepLedger` 与既有流水线快照接线，无新运行时 |
| 应用方案/交互闭环 | 成熟 | 用户按既有 candidateLedger/反馈审计/指纹判断，不制造第二套账本 |
| 实现接线 | 成熟 | P0-1 是旧格式退役；P1 是补既有字段的真实调用路径 |
| 验证标准 | 成熟 | 单测 + 真实 trace 对账；候选与反馈只验证已有证据可见，不造新数据 |

## G0.7 反推质询

1. 去掉 bullet 前缀会不会破坏现有 S3？答：不会；SKILL 已有 bullet-only 兼容，新格式回到其原始期望。
2. 新增候选状态字段会不会膨胀？答：已否决；V1 该项属重复账本，V1.1 不做。
3. 保留全文候选是否更安全？答：否；已有 payload 落盘，全文重复入反馈会违反上下文预算。
4. fingerprint 会不会膨胀或泄露路径？答：写入既有 folderFingerprint，仅 hash/mtime/bytes/文件名，每次步骤一份快照，不复制 SKILL 内容。
5. 会不会增加耗时？答：不会。P0-1 本地字符串替换；P1 只是把已加载包内 hash 写入快照，无新磁盘扫描与 API 调用。
6. 最大漏项假设：若只改应用格式而不同批迁移旧测试断言，会产生 G0.10 残留；方案已列影响圈含 spec。

## 停止条件

完成 = P0-1 与 P1 均有 diff + 测试 + trace 对账证据；候选账本、反馈审计、folderFingerprint 在真实 trace 可见；G0.10 旧 bullet 断言全仓清零；G0.12 台账七节闭合。
失败 = 任一项只改代码无回归证据，或新增第二套候选/反馈/指纹账本。

## 缺口清单

方案阶段无执行证据；用户审核通过后建台账再动码。
