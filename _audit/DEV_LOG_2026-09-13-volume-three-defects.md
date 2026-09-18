# 2026-09-13 卷纲层三缺陷修复

## 背景

客户提供 `run-trace-卷纲层-20260913-094433-deep/` 实测记录。复查确认三项问题：P0 续生成错卷、P1 run-trace 主文件外置化漏项、P2 folder 降级终态漏判。本轮以该真实 trace 为验证基准，不使用合成数据替代。

## 根因

1. **P0 续生成错卷**：`buildVolumePrompt()` 的 continue 提示词正确（尾部明确“已生成 N 卷、只生成第 N+1 卷”）。污染源是 folder SKILL 的 `samples.txt` 放置了完整“第 1 卷任务包”成品，且注入位置在 user message 第 18 字符处，模型优先采信该假任务包。应用侧已有 `skillHealth.inspectSkillSamples()` 导入体检警告，运行时防线未在本轮擅自扩展。
2. **P1 外置化漏项**：`folderDiagnostics[].apiMeta.requestMessages` 在主文件重复保存完整请求（最大 537KB/个）；更严重的是 `resolve()` 把首个 payload 对象整体内联进 `__payload.value`，导致“外置”实际只替换了重复项。
3. **P2 降级终态漏判**：`isOutputDegradingWarning()` 只识别 `post-process-issue:` 后缀，而 SKILL 作者常省略 code，导致裸 `post-process-issue` 永不降级；`traceStatusFromRun()` 也完全不看 `folderDiagnostics`。

## 修复

1. `realSkillExecutor.ts`：
   - 新增结构缺失降级码白名单（lost-section / missing-continuity-snapshot / missing-micro-scene-range / missing-marker）与中英文前缀匹配。
   - `isOutputDegradingWarning()` 改为对 `post-process-issue:` 后缀分级；文风/协议提示不降级。
2. `electron/ipc/runTrace.js`：
   - `folderDiagnostics.apiMeta.requestMessages` 走 request payload，主文件只留 role + 500 字 preview + length + `requestPayloadRef`，并与 apiCalls 去重合并。
   - `resolve()` 输出仅含 id，禁止内联 `value`。
   - `payloadIdentity()` 对旧数据 `undefined` 字段容错。
   - `postProcessReport.output` 同样外置为 preview + ref。
   - `responseText` 保留 500 字 preview + `responseTextPayloadRef`（logical 与 physical 均适用）。
3. `runTrace.ts`：收紧 `RunTraceFolderDiagnostic` 类型，补充 apiMeta/postProcessReport 结构；新增 `folderDiagnosticsStatus()`。
4. `PipelinePanel.vue`：run 终态归并 folder diagnostics（failed > degraded）。

## 验证

- `npx vitest run electron/ipc/runTrace.spec.js src/services/realSkillExecutor.spec.ts src/stores/runTrace.spec.ts src/services/volumeGeneration.spec.ts`：4 文件 / 68 测试通过。
- `npx vue-tsc --noEmit`：通过。
- `npm run build:vue`：构建成功。
- 真实 trace 复测（`run-trace-卷纲层-20260913-094433-deep/run-trace.json`）：
  - 主文件 6,626,734 字节 -> 480,814 字节。
  - payload 22 -> 26 个（新增 4 个 postProcess 输出）。
  - `folderDiagnostics.apiMeta.requestMessages` 全部为 preview + `requestPayloadRef`。
  - `postProcessReport.output` 全部为 preview + `outputPayloadRef`。
  - `inline-payload-values 0`，`report-inline-outputs 0`。

## 追加修复（同日复验）

复验时发现旧版导出的 trace 中 `responseText` 本身已经是 `{ __payload: { kind, value } }`。新导出器此前只外置了字符串形态，遇到旧对象会把对象 hash 当作新 payload 再存一份，但旧 `value` 继续留在主 trace，导致旧 trace 二次导出仍携带大响应。

修复：

- `normalizeLegacyPayloads()` 在重建 payload 前解包旧版内联 `__payload.value`。
- `replacePayloadFields()` 对 logical / physical `responseText` 统一改为 `responseTextPreview` + `responseTextPayloadRef`，字段本身置空，不再区分新旧来源。
- 新增回归测试：旧格式响应二次导出后主 trace 不得出现 `"value":"完整响应"`。

追加验证：

- `npx vitest run electron/ipc/runTrace.spec.js src/services/realSkillExecutor.spec.ts src/stores/runTrace.spec.ts src/services/volumeGeneration.spec.ts`：4 文件 / 69 测试通过。
- 真实 6.63MB 旧导出复测：主 trace 70,557 字节，payload 26 个，`__payload.value` 内联路径 0。

## 交接边界

- P0 的 SKILL 侧整改由 SKILL 制作方处理：`samples.txt` 改占位符结构，不放完整成品。应用侧导入体检已能 warning。
- 运行时 samples 完整成品拦截是否新增，需用户确认后另立项，不在本轮范围内。
