# DEV_LOG 2026-11-06 SKILL 运行级钉死与结构化重试反馈

## 目标

修复两个应用侧缺陷：(1) folder SKILL 目录在 run 中途被换文件时被 TTL cache 静默采用新包；(2) 正文链结构/格式/字数类失败的重试反馈丢失失败候选骨架，模型从零重建导致不稳定。

## 交付

- **运行级 SKILL 钉死**：`routeSkill` probe 成功后把指纹存入 per-run state，执行器初始加载与每 attempt 开始时带 `pinnedFingerprint` 直读磁盘复核；不一致返回 `skill_version_mismatch` + `pinMismatch`，run 显式 failed，先于物理调用；composite 链剥离 pin 让子 folder 独立指纹。
- **candidate-anchored 反馈**：正文链（protectedContract.kind==='body'）结构/格式/字数类失败时，重试反馈携带上一版完整候选全文（`strategy='candidate-anchored'`，`scaffoldSource='candidate'`，`suppressedCandidateChars=0`）；质量/风格类维持 bounded-summary。
- **trace 事件**：新增 `folder-skill-version-mismatch` error 事件，含 folderPath/skillId/新旧指纹/attempt。
- **SKILL 脱钩报告**：`_audit/SKILL_REPORTS_2026-11-06_kaixuan-s1-agent-decoupling.md`；确认 agent.md 不参与应用加载，方案中"精简版只剩三个校验器"已过时，当前 script.js 为完整版。

## 验证

- 定向 4 文件（loader/executor/router/feedback spec）：104/104 passed。
- 全量服务测试：1 既有失败（外部 SKILL 契约漂移）+ 2672 passed。
- `npm run type-check`：exit 0。
- `git diff --check`：exit 0。
- 关键 runtime 断言：executor 初始加载 mismatch → 0 物理调用 + failed；attempt 内 mismatch → 0 物理调用 + failed；loader pin 直读绕过 cache；router 透传 + composite 剥离；feedback 全文携带。

## 边界

- Electron 真实负向验证（运行中换 SKILL 文件 → trace mismatch + run failed）= `untested`，单测层已覆盖 fail 分支语义。
- trace 事件存储/导出链路无自动集成测试 = `untested`，发射点已落代码。
- 跨 run SKILL 版本库存档 = 明确不做（G0.13 冻结）。
- agent.md 与 script.js 语义合同一致性归 SKILL 层管理，应用不越界。

## 迭代收尾（2026-11-06）

- 台账第 6/7 节补齐验证命令输出、file:line before/after、测试覆盖清单与 G1.14 缺陷面四行枚举。
- 经验文件 G2.9 修订：
  - 重试候选条目由"禁止候选全文"收窄为"质量/风格类失败禁止候选全文；结构/格式/字数类失败必须携带完整候选作为定点修复基础"。
  - 新增"SKILL 运行基准钉死必须在每个 attempt 开始时复查且失败先于物理调用"要求。
  - 版本升级 v10.3.0。
- DEV_LOG_MASTER_INDEX 追加本轮条目（G1.27 追加写，不覆盖）。
