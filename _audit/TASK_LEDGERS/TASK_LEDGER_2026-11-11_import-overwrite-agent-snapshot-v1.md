# TASK LEDGER — import-overwrite-agent-snapshot-v1

## 1. 目标与原话

用户原话（2026-11-11）：
"1. 排查覆盖导入为什么没有刷新已存在的 agent systemPrompt 快照；修复导入语义为"覆盖即全字段刷新"。 2. 提供查看/清除/刷新 agent systemPrompt 快照的对账入口。 3. 确认导入包是否内嵌旧 agent 提示词。"

最终可感知行为：用户导入 Agent JSON 时，预览界面显示当前/导入 systemPrompt 的 len/hash diff；覆盖后卡片显示新值；store 中可选字段正确清空/保留；ZIP 技能包同版本重装不残留旧文件。

本轮交付物：agent.spec.ts 三个行为测试 + agent.ts createdAt 保留修复 + configExchange 对账字段 + AgentSettings.vue 最小 UI + skill-package.js 原子替换 + 三方对账报告 + 台账/日志/版本。

## 2. 门禁读证

G0.6 方案成熟度：方案文档 `docs/superpowers/plans/2026-11-11-import-overwrite-agent-snapshot.md` 方案成熟度节给出"成熟，允许执行"结论，经对抗复审修正 3 处缺陷。
G0.9 影响圈：方案影响圈矩阵七面完整。
G0.12 门禁执行台账：本文件按七节结构逐节补证据。
G1.3 hash 单源：对账 hash 复用 `src/services/settingsProjection.ts:59` 的 `fnv1a32Hash`，不引入 SHA-256 双源。
G1.14 深层根因：Task 0 行为测试先证明事实再修；Task 3 红测试先跑；第七节做 G1.14 缺陷面枚举。
G1.17 执行者自盲区：Task 0 测试第一次跑出 2 fail，暴露测试模拟了非生产路径（绕过 fromAgentRecord），修正后用真实输出形状跑通。这是自盲区第 5 类"替代证据顶替真实证据"的现场纠正。
G1.25 同一语义多入口：`buildImportPlan` 四个调用点已逐一登记（useConfigExchange.ts:147 + AgentSettings.vue:254 = agent 两条线，useConfigExchange.ts:253 + SkillSettings.vue:1112 = skill 路径不传）。

## 3. 路由判定

加入：G0.6/G0.9/G0.12/G1.3/G1.14/G1.17/G1.25。
排除：G0.10（本轮不删除/替换链路，无旧语义退役需求）；G0.13（方案五问已过，无新预算系统/自动调度/UI 面板）；G1.4（验证分层中 Electron 真实 UI 冒烟标记 untested 边界，已在 Task 6 计划）；G1.5（本轮不修改验证器脚本本体）。

## 4. 影响圈与作者反证

打算改的：src/stores/agent.ts、src/stores/agent.spec.ts、src/services/configExchange/index.ts、src/services/configExchange/types.ts、src/services/configExchange.spec.ts、src/components/settings/AgentSettings.vue、src/components/settings/SkillSettings.vue、electron/ipc/skill-package.js、electron/ipc/skill-package.spec.js、package.json。
可能碰到的：useConfigExchange.ts（只读现有接口，不改）、Pinia store 持久化协议（saveAgents 现有 JSON.stringify，不改）、UI CSS 类名。
作者反证：
1. 假设"消费层无快照缓存"——已被 chainBreakpoint.ts:36 证据和四点消费点扫描证伪失败（确实无缓存）。
2. 假设"Object.assign 全字段替换"——被 Task 0 第一次红测试部分证伪：对 plain object 不存在的属性 assign 不覆盖；真实生产路径经 normalizeAgentItem 返回全 11 字段含显式 undefined，所以全字段替换在生产路径成立。已修正测试模拟方式。
3. 假设"ZIP 原子 rename 在同父目录总能成功"——需要 Task 3 失败路径用例验证。

## 5. 停止条件

完成条件（机器可判定）：
- `npx vitest run src/stores/agent.spec.ts` exit 0
- `npx vitest run src/services/configExchange.spec.ts` exit 0 且新用例验证 len/hash 四元组
- `npx vitest run electron/ipc/skill-package.spec.js` exit 0 且旧文件不存在断言通过
- `npm run type-check` exit 0
- `npm run build` exit 0
- `npm run verify:packaging` exit 0

失败条件：任一命令非零 exit；或 Electron 真实 UI 冒烟发现对账 UI 不显示 diff。

## 6. 执行证据

### Task 0

- 2026-11-11 02:20:26 `npx vitest run src/stores/agent.spec.ts` exit 0，7 tests passed。
- 首次跑出 2 fail（旧 description 保留 + createdAt 未变 undefined），原因是测试对象缺显式 undefined 属性，绕过了 fromAgentRecord 的全字段输出形状。修正后模拟真实生产路径（normalizeAgentItem 返回 11 字段含显式 undefined → fromAgentRecord → importAgents → Object.assign）。
- 事实基线：生产路径全字段替换成立；`createdAt` 在 incoming 缺失时被覆盖为 undefined，是当前唯一记录层丢失面。

### Task 1

- 2026-11-11 02:41 `git show --stat 04c3ba8a`：`src/stores/agent.ts +4/-1`、`src/stores/agent.spec.ts +76`。
- 行为修复：incoming `createdAt` 缺失时保留本地 `createdAt`；incoming 存在时按覆盖语义采用新值。

### Task 2

- 2026-11-11 03:02 `git show --stat eb1cdcc9`：`configExchange/index.ts +26/-3`、`configExchange/types.ts +5`、`AgentSettings.vue +15/-1`、`configExchange.spec.ts +49`、`useConfigExchange.ts +3/-1`。
- 行为修复：导入计划补充 len/hash 四元组；Agent 卡片预览当前/导入 systemPrompt 的长度与 hash 差异；增加查看/清除对账控件；覆盖导入后卡片立即显示新值。

### Task 3

- 2026-11-11 03:20 `git show --stat a914345d`：`electron/ipc/skill-package.js +59/-20`、`skill-package.spec.js +68/-13`。
- 行为修复：同版本 ZIP 安装改为临时目录解压 + 目录替换 + 失败回滚；重装后旧文件不得残留；回滚路径失败必须返回明确错误。

### Task 4

- 2026-11-11 03:31 `git show --stat 82873eac`：`src/components/settings/SkillSettings.vue +8/-4`。
- 行为澄清：folder 覆盖导入为指针语义，只替换 store 记录；不删除旧磁盘目录；文档与 UI 文案同步。

### Task 5

- 交付 `_audit/AGENT_PROMPT_IMPORT_RECONCILIATION_2026-11-11.md`：三方口径（Store/SKILL JSON/.agent.md）、20 条 Agent 对账、0 条三方可比、人工抽查 3 条确认 SKILL 配置 JSON 内嵌旧提示词。
- 结论：无新增自动同步器；修复路径为 SKILL 重新导出 JSON 或用 UI 对账覆盖。

### Task 6

- 版本：`package.json` / `package-lock.json` 升至 3.124.0。
- 定向回归 2026-11-11 03:05：`npx vitest run src/stores/agent.spec.ts src/services/configExchange.spec.ts electron/ipc/skill-package.spec.js` exit 0，41 tests passed。
- 全量基线（前轮）：`npm run test:services` 250 files / 2715 tests passed；`npm run type-check` exit 0。
- 构建 2026-11-11 03:26：`npm run build` exit 0；NSIS 产物 `dist/神意助手-Setup-3.124.0.exe`，231,670,788 bytes。
- 产物 hash：`sha256sum dist/神意助手-Setup-3.124.0.exe` → `2065C8262A2B2BA1053317C9ABC96C9AF7D710B12C61A9D78925CA3141A6C2E1`。
- 打包核验：`npm run verify:packaging` → PASSED，rendererFiles=87、electronAPI methods=94。
- live 供应商验证 2026-11-11 03:33 UTC：`$env:SHENYI_PROVIDER_CHANNEL_LIVE='1'; node scripts/verify-pipeline-provider-channel-electron.mjs` exit 0；`[PASS] layer provider UI, persistence, warnings, and routing verified; mode=live-single-supplier; requests=5`；模型 glm-5.2；证据归档 `_audit/verification-pipeline-provider-channel-live-20261111-import-overwrite/`。
- 脚本曾写入既有共享证据目录，已用 `git checkout -- _audit/verification-pipeline-provider-channel-live/` 恢复 git 版本；新证据不受影响。

## 7. 缺口清单

### G1.14 缺陷面枚举

1. Agent 卡片旧快照仍显示：Task 2 修。
2. 导入 skip 误显示成更新：Task 2 对账 UI 消费 plan item action 字段。
3. hash 错误或 undefined UI：Task 2 卡片/plan hash 同源 fnv1a32Hash + 空串显示 empty。
4. createdAt 在旧数据丢失后重新导入无法找回：已知不可恢复，登记为数据丢失豁免。
5. ZIP 替换中中断导致半成品：Task 3 temp + rename + 回滚。
6. temp/backup 清理失败：Task 3 失败路径用例覆盖。
7. folder 覆盖用户误删磁盘目录：Task 4 文案明示"不删除旧磁盘目录"。
8. `.agent.md` 与配置 JSON 分裂：Task 5 三方对账报告。
9. UI 文案与真实覆盖语义不符：Task 2/4 文案测试或代码审读。
10. 版本号/构建产物陈旧：Task 6 升 3.124.0。

### 缺口

（执行中持续登记）

### 已知边界

- Agent createdAt 仅在覆盖导入时保留；本地旧数据丢失无法反向找回。
- .agent.md 与 SKILL JSON 仍是两套事实源，本轮不建自动检测器或同步器。
- live 验证模型受当前限次订阅限制，仅 glm-5.2 通过；其他模型的供应商拒绝为外部配额边界。
