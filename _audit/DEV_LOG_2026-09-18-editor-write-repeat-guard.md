# 开发日志：编辑器重复写入守卫与直写证据补强（2026-09-18）

## 背景

用户明确要求取消“编辑器写入次数预算”：有效写入不应该被人为上限截断，真正的风险是模型连续提交完全相同的写入请求导致循环。社区对照结论也支持这一方向：OpenAI Agents 与 LangGraph 的轮次上限应保留在工具循环层，Roo-Code 拦连续相同调用，Aider 依赖批次快照回滚；把“写入次数”当安全单位是错误抽象。

## 根因

1. 旧实现把 `maxEditorWrites` / `turnWriteBudget` 当作写入安全闸，默认一次写入后模型继续有效修改会被拒，客户看到的是“写入权限异常”而不是正常协作。
2. `aiService.ts` 的工具循环缺少“重复输入”维度：不同参数的连续写入是合法编辑流，只有完全相同输入才是循环信号。
3. run trace 在物理调用更新时可能用空正文覆盖已有正文，direct 工具轮的最终输出会从顶层 `responseText` 消失，SKILL 调试方无法判断模型真实输出。
4. 看门狗 active 阈值 300 秒小于大型大纲工具轮实际耗时，可能在合法慢请求上误中止。

## 改动

1. `src/services/aiService.ts`：删除 `maxEditorWrites` / `turnWriteBudget` / 写入预算事件；新增 `stableToolSignature()` 与 `createRepeatedWriteGuard()`；连续 3 次完全相同写入输入返回 `duplicate_write_blocked`，拦截后计数重置，失败写入不累计。
2. `src/components/common/OutlineWorkspace.vue`、`src/components/chat/ChatPanel.vue`：技能模式与 direct 对话两处移除预算参数，接入 `onRepeatedWriteBlocked`，写入 `write-duplicate-blocked` warn 事件。
3. `src/services/realSkillTypes.ts`：删除 `maxEditorWrites` 字段。
4. `src/stores/runTrace.ts`：physical 更新不再用空正文/空请求消息覆盖已有证据；终态不被 late running 回调复活；终态前从最后一个非空 physical 回填顶层 `responseText`。
5. `src/services/stateWatchdog.ts`：active 阈值 300 秒提升到 600 秒，测试同步。
6. 文档：SKILL 交接文档改为重复守卫语义；经验文件 v5 规则 26 修订，禁止把写入次数当安全单位。
7. 回头看补强：重复写入事件保留真实 `toolName`，不再写死 `editor.write`。

## 验证

1. `npm run type-check`：通过。
2. `npm run test:services`：71 个测试文件、646 条测试全部通过。
3. 旧链路扫描：`turnWriteBudget|maxEditorWrites|onWriteBudget|write_limit_reached|write-budget-created|write-budget-exhausted|writeLimitCode|writeLimitMessage` 在 `src` / `scripts` 中 0 命中。
4. 新链路扫描：`duplicate_write_blocked` / `onRepeatedWriteBlocked` / `write-duplicate-blocked` 覆盖服务层、双入口和测试。

## 回头看：第 2 轮

### 新发现问题

1. 兼容 JSON 直写路径没有接入重复守卫：`executeCompatibilityEditorWrite` 按每次 `callAi` 独立创建守卫，同一批 JSON 写入参数可以跨调用无限重复落进编辑器，和原生工具路径行为不一致。
2. 兼容直写失败会把 physical call 标记为 success：SKILL 调试方看到“成功”但编辑器实际写入失败（例如 `version_changed`），trace 证据和真实结果相反。
3. 原生工具路径被重复守卫拦截时没有 `logToolRequest`：诊断日志会缺这一轮工具请求，导致“为什么这次没有写入”无法从日志回答。

### 修复

1. `createAiService` 工厂内新增 `compatibilityWriteGuards` 注册表；scope key 为 `projectId::workspace::targetId::sessionId`，全部从 `params.meta` 取值，避免跨项目误伤。
2. 兼容直写执行后按 `result.ok` 写 physical status；失败时带 error 信息。
3. 原生工具路径拦截分支补 `logToolRequest`，`toolCapability: 'native_tools'`。

## 回头看：第 3 轮

### 审计范围

1. trace 事件四入口接线（技能链 / direct 对话 / home / outline）。
2. 运行记录会话链（activeRun 复用、chat turn 不误关、seal 收口）。
3. 意图与工具面绑定（snapshot、applyWrite、targetId 校验）。
4. aiService 400/422 降级链（仅 `tools unsupported` 触发 JSON 协议）。
5. editorTools 直写应用链（version 校验、undo 快照、渐进呈现、失败批次重试）。
6. `runTraceDiff` 对 `write-duplicate-blocked` 的呈现：事件 diff 按 `turnId + seq + type` 配对并按 type 汇总计数，不维护白名单，新事件自动进入对比面板。

### 测试夹具根因（不是生产缺陷，但会误导后续回归）

1. 测试 JSON 围栏中的 `\n` 被写成真实换行，导致代码围栏拆行、协议解析失败；改为 `['```json', payload, '```'].join('\n')`。
2. `providerType: 'legacy-json'` 不可达：`normalizeProviderType` 会把未知类型归一为 `openai-compatible`。真实可达的兼容路径是“原生工具请求被 400/422 且错误文本含 `tools unsupported` 拒绝后降级 JSON 协议”，测试必须用两段式 mock。

## 回头看：第 4 轮

### 新发现问题

1. 兼容写入守卫注册表无界增长：每个 `project::workspace::target::session` 组合永久保留 guard，guard 内还保存最后一次写入的完整签名；长会话多项目中属于慢性内存泄漏，且大签名会放大泄漏。

### 修复

1. 注册表上限 100 个 scope；新 scope 超限时淘汰最旧 scope。
2. 已存在的 scope 每次命中会刷新到 Map 最新位置，实现 LRU 语义，避免活跃会话被误淘汰。
