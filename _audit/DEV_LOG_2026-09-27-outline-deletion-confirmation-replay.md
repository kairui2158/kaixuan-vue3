# DEV_LOG 2026-09-27：客户大纲删除确认 trace 可见 Electron 全量复刻

## 背景

用户提供 `run-trace-outline-20260926-212218-deep`，要求复刻第 6 轮“把上一轮的决策写入大纲”：21 个物理请求、41 次工具调用、14 次失败，并在可见 Electron 窗口中验证“授权删除”和“拒绝删除”双分支。用户在桌面监督，禁止 headless 冒充。

## 产品修复

1. `src/services/toolLoopPolicy.ts`：显式请求的工具轮数不再被钳回默认值，可在安全硬上限 64 内生效；`compatibility-json` 仍固定为 1。
2. `src/services/toolRunSupervisor.ts`：同一模型迭代内的并行失败只计一次错误轮，跨 3 个迭代才中止；支持 `hardDeadlineMs: null`。
3. `src/components/common/OutlineWorkspace.vue`：direct 工具循环把 `event.iteration` 传给 `reportToolError`，避免并行工具失败被误判为连续多轮错误。

## 历史语义对账

客户 trace 第 31-33 次工具调用是 `editor.locate / failed / write_only_mode`。当前产品已修复“读工具被永久降级为 write_only_mode”的历史缺陷：连续只读轮会收到 steering 提醒，但完整工具面保持可用。因此验证脚本对这 3 条调用采用显式“历史失败 / 当前成功”双语义断言：

- 其余 38 次工具调用的 `name/status/errorCode` 仍逐条严格匹配。
- 当前失败数必须为 11：7 次 `editor.write`（3 次 `missing_field`，4 次标题删除授权门）和 4 次 `editor.read_range / invalid_input`。
- 3 条历史 `write_only_mode` 读取调用在当前应用必须为 `success`。

该差异写入 `result.json` 的 `historicalWriteOnlyLocateFailures=3` 与 `historicalWriteOnlyLocateNowSuccessful=3`，禁止把恢复旧缺陷当成“复刻成功”。

## 测试钩子登记

`window.__outlineDeletionReplayMaxToolIterations` 是客户 trace 回放专用测试钩子，只允许验证脚本按物理请求序列显式注入；生产默认值仍为 direct-tool-intensive 的 12 轮。该钩子不得用于其他功能，也不得作为生产行为开关。对应经验文件规则 121：运行时钩子必须在消费时点实时读取，禁止模块加载期固化。

## 可见 Electron 实测

- 大纲种子（第二轮真实文档导入版）：用户指定桌面文档 `C:/Users/凯瑞/Desktop/测试/《绿潮》大纲总纲.md`；验证前先断言其与客户 `payloads/212-prompt.json` 的 74,841 字符快照 byte-identical，再从空项目开始，通过大纲工作台 `#btn-import-outline` 的真实 file input 导入，不允许 store 直注。
- 物理请求：21/21。
- 工具调用：41/41。
- 当前失败：11；历史 `write_only_mode`：3 条，当前全部成功。
- 授权分支：仅删除 3 个授权目标，长度差 1,566 字符，第三个标题与独立正文保留。
- 拒绝分支：原文 74,841 字符完全不变。
- 证据：`_audit/verification-outline-deletion-gate/electron/result.json` 与 3 张截图；`result.json` 记录 `testDocumentPath`。

## 验证证据

- `node scripts/verify-outline-deletion-confirmation-electron.mjs`（store 注入版）：PASS，可见 Electron PID 18052。
- `node scripts/verify-outline-deletion-confirmation-electron.mjs`（真实文档导入版）：PASS，可见 Electron PID 19064；空项目 → 真实文件导入 → API 输入 → 21/21 请求 → 41/41 工具调用 → 授权 → 拒绝，全链路复刻通过。
- `npx vitest run src/services/toolLoopPolicy.spec.ts src/services/toolRunSupervisor.spec.ts`：2 个文件 9 条测试 PASS。
- `npm run type-check`：exit 0。

## 结论

客户第 6 轮死锁路径已可在当前应用真实复现、收敛并进入用户授权门。旧 `write_only_mode` 永久降级不再回归；工具轮上限与并行失败误判根因已修复。封装不在本轮范围内，必须等用户确认实测结果后再执行。

## 09-27 真实 API 六轮复刻补充

### 执行范围与口径

用户要求起点与终点对齐客户原始诉求：整理排序、清理错误标点、删除重复项、只删除用户确认的游离内容，并授权写入。本轮执行 `scripts/verify-outline-deletion-live-replay-electron.mjs`，从客户 trace 读取 6 个用户轮次，在可见 Electron 窗口中使用真实 API（`deepseek-v4-pro` / `https://openapi.cloud-ai.cn/v1`）复刻，全程用户可见。测试大纲为用户指定文档 `C:/Users/凯瑞/Desktop/测试/《绿潮》大纲总纲.md`，验证脚本先断言其与客户现场同为 74,841 字符。

### 结果

- 6/6 轮 `turnStatus=success`，导出 trace 含 6 个 turn、6 条 API call 记录。
- 第 2 轮：16 次物理请求、29 次工具调用；一次真实编辑成功，删减 550 字符后停在标题删除授权门，符合删除守卫设计。
- 第 6 轮：删除确认弹窗真实出现，脚本模拟用户点击“授权本次删除”；授权链路事件完整落盘。
- 授权批次最终从 74,841 → 74,257 字符，`removedChars=34`；卷一 `#### 7.8/7.9` 正文完整保留，未被整节误删。
- 授权事件计数：3 次 `outline-deletion-confirmation-requested`，2 次 `superseded`（后续请求替代旧确认），1 次 `granted`，1 次 `consumed`。
- 证据：`_audit/verification-outline-deletion-live-replay/result.json`、7 张截图；导出 trace 位于 `_data/outline-deletion-live-replay-exports/run-trace-outline-20260927-085239-deep/run-trace.json`。

### 本轮暴露的新事实

1. **上次“卡死”根因是验证脚本超时，不是应用缺陷。** 原脚本步进超时为 10 分钟，而长文档工具循环单轮真实耗时可达 15-20 分钟；脚本在等待窗口时自行放弃，窗口表象像应用卡死。已把 `STEP_TIMEOUT_MS` 默认从 `600000` 提升到 `1,800,000`（`scripts/verify-outline-deletion-live-replay-electron.mjs:20`），并保留 `SHENYI_LIVE_STEP_TIMEOUT_MS` 覆盖口。
2. **第 3 轮路由与客户旧 trace 存在差异。** 客户现场“删除游离板块”被判为 `discuss`，当前复刻判为 `edit` 并正确停在删除授权门。当前语义更符合用户命令，但这是行为差异，不能写成“完全复刻一致”；后续如做路由校准，应把该句作为显式对账样本。
3. **授权删除存在语义残留，但授权边界正确。** 最终批次只删除两个游离标题行，减少 34 字符；其正文因失去标题而变成无标题正文。早期的整块删除尝试被 `integrity_failed` 阻断后，模型改用“仅删标题”策略通过了结构校验。这说明删除合同防住了大面积丢稿，但没有阻止“标题删除后正文失去归属”这种较细的语义残留，登记为后续产品议题，不在本轮验收口径内。
4. **`state-stuck-detected` 在长轮次中出现 2 次。** 该事件是活跃状态看门狗在长耗时物理请求期间的观测告警，不是终态篡改；轮次最终均收敛成功。但 trace 阅读者容易把它误解为应用卡死，后续应考虑给长物理请求登记“进行中”心跳或在告警文案中标注观测性质。

### 验收结论

六轮真实 API 复刻通过：链路可收敛、删除有授权门、授权结果真实落盘、正文守卫生效。遗留三项登记：路由差异样本、标题删除后的无标题正文语义残留、看门狗告警的展示语义。三项均未阻断本轮验证，但在声称“删除闭环完全成熟”前必须逐项处理。
