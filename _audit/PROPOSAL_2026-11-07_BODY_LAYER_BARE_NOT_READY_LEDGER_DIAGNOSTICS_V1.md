# 正文层应用侧修复方案 V1.1（按两条转达项精简）

日期：2026-11-07  
适用版本：3.116.0 / commit `5439e76c`  
事故样本：`run-trace-正文层-20261107-012220-deep`  
边界：只修应用侧；`D:/codex/玄武规划SKILL/凯旋-正文层/` 只读，不改 SKILL。

修订：V1.1 按 G0.13 删除超出两条转达项的 A5/A6；A3 收敛为原样回传；核心修复收敛为 A1-A4。

## 0. 结论

本轮只修两条转达项：① S3 的结构阻断（裸 `[NOT-READY]`）被应用当“正文过短”送进字数修复阶梯，最终走 full_chain；② 应用把 S2 多行交接账本压成单行，破坏 S3 字段解析（触发器非根因）。对应修复：A1+A2 解决识别与路由，A4 解决账本保真，A3 只负责把 S3 阻断原文随重试回路原样带回 S2。原 V1 的 A5/A6 超出两条转达项，按 G0.13 裁剪出本轮，记录在“已裁剪项”。

## 1. 事实链

1. S1 payload 063 交接包含 `场景分段`、`场景字数`、`场景施工卡`。
2. S2 生成字数达标，但交接缺上述三项；其 postProcess 未拦截，与安装包内 SKILL 副本过旧相关。
3. S3 payload 016 输出裸 `[NOT-READY] 交接输入不可恢复：归一化后仍缺字段：场景分段、场景字数、场景施工卡`。
4. 应用 trace 事件 #29/#47/#123/#124 按 too_short 走 `none -> targeted -> full_chain -> repair_exhausted`；trace 事件 #120/#121 显示终步 metadata missing=1 且 label_drift 回填。

## 2. 经验门禁读证

- **G2.9 双层验收**：叙事有效性归 SKILL，应用只消费显式机器可读 verdict；`not_ready` 路由回上游。裸 `[NOT-READY]` 是 SKILL 输出的显式结构裁决，应用接收它不等于新增第二裁判。
- **G2.9 targeted 修复**：必须复用上游产物，缺产物才显式降级并写 `body-targeted-repair-artifact-missing`。
- **G2.9 trace**：blocking 证据必须透传到事件、run meta 与验收层，不得只藏在深层 JSON。
- **G0.13 最小必要性**：不加新验收层、不新增状态机、不扩成通用分支引擎；复用现有 `blocked` 出口与 targeted 修复。
- **G1.1 精准编辑**：所有改动用 apply_patch 逐行完成；不重写无关文件。

## 3. 修复项

### A1. 裸 `[NOT-READY]` 接收面

现状：`src/services/chapterEventDensity.ts:98-115` 只认 `narrativeStatus` 字段式裁决；`chapterEventDensity.spec.ts:13` 明确断言裸 `NOT-READY` 返回 null。执行器在 `realSkillExecutor.ts:1295-1298` 调用 `resolveChapterNarrativeBlock`，因此 S3 的裸阻断直接漏过。

改法：

1. 在 `chapterEventDensity.ts` 新增常量：
   `HANDOFF_NOT_READY_PATTERN = /^\s*\[(?:NOT-READY|BLOCK)\]\s*(.+)/i`。
2. `resolveChapterNarrativeBlock` 增加“结构阻断”分支：
   - 命中裸 `[NOT-READY]` / `[BLOCK]` 时返回同一 `chapter-narrative-not-ready` code；
   - `gap` 保持 SKILL 原文原因；
   - `guidance` 写明“交接输入不可恢复时路由到生成步 targeted 修复”；
   - 该分支 `retryableInBodyLayer` 用 `true`，表示可在正文链内回生成步修复，不是叙事质量重试。
3. 原字段式 `not_ready` 分支保持现状，`retryableInBodyLayer` 仍为 `false`，继续要求回章节规划层补剧情点。

产物出口：`realSkillExecutor.ts:1298` 已按 `narrativeBlock` 返回 `blocked`，不需要复制阻断判断。`PipelinePanel.vue:3445-3483` 会把非章节叙事阻断的 `blocked` 带入 `folder-skill-blocking-gate` 并抛错，但在 `stepArtifactContext` 存在时，`PipelinePanel.vue:3538-3562` 会返回 `{ output, callerStatus: 'blocked', blockingGateFailed, errors }`。正文编排器可消费该结构化失败。

### A2. 失败候选元数据与 targeted 路由

现状：`bodyArtifactOrchestrator.ts:373-429` 的 `BodyArtifactAttempt` 只有 `body`，`callerErrors` 只进 errors；`PipelinePanel.vue:3538-3562` 返回的 `callerStatus` 与 `blockingGateFailed` 被 `runStepSkills` 的 `.then(text => ...)` 隐藏成纯字符串。

改法：

1. `BodyArtifactAttempt` 增加 `metadata.structuredFailure`：
   `{ callerStatus, blockingGateFailed, handoffNotReady }`，只记录，不新建状态机。
2. `PipelinePanel.vue` `callBodyApi` 的 `.then` 返回值扩展为：
   `text, structuredFailure`。`bodyArtifactOrchestrator.ts:344-354` 解析并挂到 generation metadata。
3. `generateBodyArtifact` 在 validation 失败时判断：
   `lastAttempt.metadata.structuredFailure.handoffNotReady === true && lastAttempt.body.trim().length === 0`
   则下一轮强制 `repairScope = 'targeted'`；即使有非空草稿，也不把 45 字短文当定点修复基础。
4. `planBodyArtifactExecution` 已支持 generator index 定点重跑，无新计划形态。

### A3. 阻断信息原样回传（只运输，不转述）

现状：S3 阻断消息原文已含缺失字段清单（“归一化后仍缺字段：场景分段、场景字数、场景施工卡”）。三层之间不直接对话，重试循环由应用持有，这条消息必须经应用编排回路传回 S2。

改法：

1. A2 接通 structuredFailure 后，`folderResult.errors` 中的 SKILL 阻断原文随 `attempt.errors` 进入下一轮 targeted prompt 的错误清单，原样透传。应用不做字段提取、不改写措辞、不单独重组段落。
2. 唯一的应用侧修正：handoffNotReady 失败类下，targeted prompt 不打印“上一版正文字数：45”。45 是阻断消息长度而非正文长度，这是应用自身 prompt 的误导文案，修正它属于修应用自己的输出，不是教学 SKILL。
3. 反馈不携带失败候选全文，遵守 G2.9 的 retry 防复述边界。
4. 排除：删除原草案“正则提取缺失字段并单独成段”的设计。该解析与 SKILL 中文措辞耦合，属于 G0.13 过度设计。

### A4. 终步账本换行保真

现状：`chainExecution.ts:189-193` 把多行值压成单行；`chainExecution.ts:162-166` 对 `extractedMeta` 逐项加 `extractedMeta[i]:` 前缀。

改法：

1. `sanitizeFinalStepLedgerText` 改为：
   - 替换 `【正文交接】` marker 逻辑保持；
   - 只把 CRLF/CR 归一成 `\n`；
   - 不再做 `\s+ -> 空格`；
   - 空白行折叠为单个换行；
   - 行级 trim，保留行间结构。
2. `extractedMeta` 渲染改为两段头：
   `【正文交接】\nextractedMeta[0]\n<多行原文>\n【正文交接结束】`；多项时按 index 顺序连续输出。
3. 非 extractedMeta 字段保持 `- key:` 形态，内部换行也保留，避免低风险字段再丢结构。
4. 同步审查 `sanitizeUpstreamMetadataText`：summary 模式本来就是压缩口径，本轮不改；只更新 `chainExecution.spec.ts` 的 final_step_ledger 断言。

### 已裁剪项（V1 原文 A5/A6，按 G0.13 移出本轮）

- A5 `folder-diagnostics` 事件摘要透传：诊断对象已整体写入 `run.folderDiagnostics` 和事件 payload，阻断原文在导出中可见。事件 detail 可读性优化属于观测层打磨，不是本轮两条转达项的必要依赖。记录为待办，不在本轮加 helper 和新摘要逻辑。
- A6 导入内容指纹可见化：运行时已有 folder fingerprint pin 防线（G2.9 已登记），安装包副本陈旧是用户侧导入节奏问题，应用本轮不新增导入日志逻辑。

## 4. 明确排除项

1. 不改 `D:/codex/玄武规划SKILL/凯旋-正文层/`，SKILL 副本旧文案由用户侧 SKILL 对话框同步。
2. 不把裸 `[NOT-READY]` 扩展成任意自然语言阻断解析器。
3. 不新增应用侧叙事质量判断，不比较叙事内容优劣。
4. 不新增 20 章配对、影子对比、扩展验证链路。
5. 不修改正文合同下限；本轮故障不是合同阈值问题。

## 5. 执行顺序

1. A4 账本换行保真（独立、低风险，先保 S3 输入）。
2. A1 裸 `[NOT-READY]` 接收面。
3. A2 structuredFailure / targeted 路由。
4. A3 阻断信息原样回传。
5. 全量相关单测 + Electron 构建验证。

## 6. 验证路径

1. `chapterEventDensity.spec.ts`：
   - 裸 `[NOT-READY] 交接输入不可恢复：归一化后仍缺字段：场景分段、场景字数、场景施工卡` 返回结构阻断；
   - 字段式 `narrativeStatus: not_ready` 保持不可在正文层重试；
   - `[BLOCK]` 同样进入结构阻断分支。
2. `chainExecution.spec.ts`：
   - final_step_ledger 保留多行 `【正文交接】/【正文交接结束】`；
   - extractedMeta 输出不再压成单行；
   - summary 模式继续有界摘要。
3. `bodyArtifactOrchestrator.spec.ts`：
   - S3 返回空体 + `handoffNotReady` 时，第二轮进入 targeted；
   - targeted prompt 原样包含 SKILL 阻断消息（含其自报的缺失字段清单）；
   - 修复反馈不包含上一版候选全文。
4. Electron 生产构建通过，手工烟测从新建章节跑正文链，确认：
   - S3 短阻断不再触发 full_chain；
   - trace 能看到 targeted 分支和原样回传的阻断消息。

## 7. 风险与回退

1. A1 可能误捕自然文本中的 `[BLOCK]`：只匹配行首且短句形态，不扫全文任意位置；SKILL 协议固定，风险可控。
2. A2 会扩大 `.then` 返回结构：只影响 `callBodyApi` 当前唯一生产调用点 `PipelinePanel.vue:6405`，类型收窄，不做全局字符串/对象联合放宽。
3. A4 ledger 可能变长：仍沿用 4000/12000 现有限额；超限继续截断并写 `ledger_limit`。
4. A5/A6 已移出本轮，无对应风险面。

## 8. 停止条件

完成定义为：上述 4 项代码落地、相关测试全绿、`npm run type-check` 通过、Electron 构建通过、manual smoke 验证 targeted 路由生效。若 blocked 出口在某个隐藏入口不进入 `callBodyApi` 返回链，方案降级为如实标记 targeted 路由 untested，不允许假验证。

## 9. 执行对账（2026-11-07）

版本已从 3.116.0 升级到 3.117.0。

| 项 | 状态 | 证据 |
| --- | --- | --- |
| A1 裸 `[NOT-READY]` 接收面 | 完成 | `chapterEventDensity.ts:31`、`chapterEventDensity.ts:100-110`；裸阻断返回 `chapter-narrative-not-ready` 且 `retryableInBodyLayer=true`。 |
| A2 structuredFailure / targeted 路由 | 完成 | `bodyArtifactOrchestrator.ts:80-97`、`bodyArtifactOrchestrator.ts:326-337`、`PipelinePanel.vue:6470-6514`。 |
| A3 阻断原文原样回传 | 完成 | `bodyArtifactOrchestrator.ts:371-390` 保留 output 与 structuredFailure；错误清单沿现有 attempt 回路进入 targeted prompt。 |
| A4 账本换行保真 | 完成 | `chainExecution.ts:153-207`；`formatFinalStepExtractedMeta` 输出固定两段头并保留多行。 |
| 回归修复 | 完成 | `callBodyApi` 返回结果分支原先先判 structuredFailure，导致有 output 时 raw 为空；已改为先消费 structured output，再单独处理仅 structuredFailure。新增 orchestrator 回归测试覆盖。 |
| 集成 fixture 更新 | 完成 | `realS2ProtectedContract.integration.spec.ts` 补齐 `场景分段`、`场景字数`、`场景施工卡`，匹配当前 SKILL 契约。 |

验证结果：

1. `npx vitest run src/services`：210 个测试文件、2293 条测试全部通过，用时 48.94s。
2. `npm run type-check`：退出码 0。
3. `npm run build`：退出码 0，产出 `dist/神意助手-Setup-3.117.0.exe`。
4. `git diff --check`：无 whitespace 错误。

诚实边界：本轮未在 Electron GUI 中使用真实供应商执行新的手工烟测。targeted 路由由 `bodyArtifactOrchestrator.spec.ts` 的 S3 空体 + `handoffNotReady` 回归用例验证；真实 GUI 烟测仍是发布前待办，不在本提交中虚标完成。
