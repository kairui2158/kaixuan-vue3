# DEV_LOG 2026-11-06 正文层断点状态机 V2

## 目标

修复正文链断点恢复时 `bodyGeneratorStepIndex` 被 attempt 清空后无人回填、run 级裁决误判 `generator_not_identified` 的状态机死锁；同批完成单源收敛、泄漏清理与语义级 wiring 测试。

## 交付

- `PipelinePanel.vue` attempt 起点不再清空生成步索引，改为 `resolveAttemptStartGeneratorIndex` 恢复；恢复结果进入 `body-generator-step-resume-restored` info 事件。
- `chainExecution.ts` 成为三入口共享单源：账本恢复、执行包构建、attempt 起点；`source` 字段可区分 persisted 与 fallback。
- 终态 finally 清理 `hardSignalUnresolvedRuns`，删除无发射点的 `resetPerRunUi` 死代码。
- owner 断点闭包 wiring 测试从纯 `toContain` 升级为三入口行为矩阵，并加负向断言禁止旧清空语义回归。
- S3 直跑断点增加产物前置守卫：已完结链检查点会被拒绝，targeted repair 必须重新生成；`chain-completed-checkpoint-rejected` 留证。
- 经验文件 G1.27 增加 per-run 状态三列审计要求：写点、清点、回填点必须同批对账，wiring 测试禁止只锁字符串存在。

## 验证

- 定向 4 文件：173/173 passed。
- 全量：247 files / 2665 tests passed。
- `npx vue-tsc --noEmit`：exit 0。
- `npm run build:vue`：exit 0。
- Electron：`node scripts/verify-owner-breakpoint-closure-electron.mjs` exit 0，输出 `OWNER BREAKPOINT CLOSURE ELECTRON PASSED`；runId `run-1793917241497-1`。
- 关键证据：requestCount 5，targetedRequestCount 2，`completedCheckpointRejected=true`，`targetedGeneratorStep=true`，attempt ledger 从 4 字失败转为 targeted 2600 字 complete，3 帧心跳连续。
- 证据哈希：trace `AE5AD297F144C60933EAF2BA40041CB25A166BB9A1F7166EE8DD2041DADEA395`，report `6D56228ADC588CA6FF2D678295056EC72342275AD7DDC47FD9A9065F60D765C1`，provider `C4E5D3927732FE1693E548C6012B9737214E9E74B20B7322A9834B9D5BDFD2D8`。

## 边界

- Electron 回归使用内置 mock 供应商，不声明真实外部供应商内容质量。
- PowerShell 控制台显示 trace 中文存在 GBK 观测失真；UTF-8 字节与 JSON 结构正常。
- 3.114.3 封装与发布证据见封装台账。

## 迭代收尾（2026-11-06）

- 台账 6.4 补齐 3.114.3 封装证据（SHA256 2923a6...ea96、verdict pass），7 节闭环为"本轮无登记缺口"。
- dist 旧产物清理：3.114.2 系列与构建元数据移入 `_audit/retired-installers/`（已加入 .gitignore）；`3.110.6.exe` 文件系统锁死无法删除，历史会话证实 10-28 构建当日即 Access denied，登记为遗留边界。
- Electron 回归路由状态修正：G1.13 从"未激活"更新为"已激活"，与 report.json `completedCheckpointRejected=true` 对齐。
- 事故发现与修复：`DEV_LOG_MASTER_INDEX.md` 被覆盖写入删掉约 1390 行历史索引，从 git HEAD 恢复后追加本轮条目（1765-1773 行）。
- 经验文件升级 v10.1.0：
  - G1.12 新增产物锁定证据链与 Move 隔离 .gitignore 门禁。
  - G1.27 新增长期累积文件追加写门禁（禁止 Set-Content 覆盖、写入后行数对比、P0 观测断层定级）。
- 提交：d594d7a7 fix(pipeline): restore body generator step index on attempt start（23 files, +1699/-585）。

## 门禁迭代 v10.2.0（2026-11-06）

- 背景：用户复盘确认发现能力缺失——问题发现长期依赖用户实测触发，响应式修复链缺少主动缺陷面枚举动作。
- G1.14 升级：修复完成后强制四类缺陷面扫描（分支/清理点枚举、sibling 写读对横扫、旧协议残留全仓、链式字段三列对账），清单与处置写入台账第七节；GATE 无 `[DEFECT-SWEEP]` 字段判 FAIL。
- G0.12 升级：第七节禁止用"无缺口"替代枚举证据；GATE 模板新增 `[DEFECT-SWEEP]` 硬闸；用户实测触发的事后发现必须登记门禁失效事故。
- 防偷懒定级：新增第七类偷懒通道"改动点回归冒充缺陷面清零"，与前六类并列封堵。
