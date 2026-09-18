# 大纲工作台 compose + folder 缺口修复方案

日期：2026-09-13  
方案性质：正式修复方案，待用户审核；本阶段只定稿，不修改业务代码。  
依据：

- 对账报告：`run-trace-outline-20260913-160439-deep`
- 方案基线：`_audit/PROPOSAL_2026-09-10_OUTLINE_COCREATION_FOUNDATION.md`
- 统一底座：`_audit/PROPOSAL_2026-09-11_API_DIALOGUE_FOUNDATION_UNIFICATION.md`
- 工程规则：`_audit/神意开发经验总结_v5.md`

---

## 1. 问题定义

### 1.1 对账结论

本次实测 12 轮大纲工作台 folder skill compose 会话证明：

1. **读取侧已落地**：ContextPack、结构地图、按需读取工具真实生效。
2. **compose 分支未接入统一底座**：
   - `apiCalls: 0`，无请求/响应/usage/物理请求记录。
   - 0 个 routing 事件，未调用意图路由。
   - 用户明确要求写入时，写入工具未暴露。
3. **提案链路断裂**：用户三轮要求写入，模型最终让用户手动复制粘贴；全程 0 次 `editor.propose_edits`、0 个 batch event。
4. **深度导出不彻底**：主文件仍内嵌完整 prompt 快照（约 1.2M 字符）；payload 缺 `folderFingerprint`；`contextBlocks` 是 `final-message` 空壳。
5. **prompt 快照重复**：12 轮产生 16 个快照，6 轮出现两份完全相同 prompt。

### 1.2 根因定位

| 缺口 | 代码根因 | 责任层 |
|---|---|---|
| compose API 记录缺失 | `workspaceSkillEngine.ts` compose 分支不调用 `onApiCallStart/onApiCallFinish`；`OutlineWorkspace.vue` 补记录分支因 `allMetas.length === 1` 永远跳过 | 应用层 |
| compose 绕过意图路由 | compose 分支只读 `forcedIntent || 'auto'`，不调用 `routeChainIntent` | 应用层 |
| 写入工具未暴露 | `auto` 意图被 `resolveDialoguePermission` 降级为 discuss 只读 | 应用层 |
| 提案协议未产出 | SKILL 输出【修改预览】文本，不输出 `propose_edits` 工具调用 | SKILL 次责 |
| 主文件膨胀 | `promptSnapshots` 仍保留 `systemPrompt/userPrompt/finalMessages` 全文 | 应用层 |
| payload 缺指纹 | 导出 payload 层未透传 `folderFingerprint` | 应用层 |
| 快照重复 | folder 路径与文本路径各触发一次 `onPromptBuilt`；内容寻址未排除易变字段 | 应用层 |

---

## 2. 修复目标

1. **API 记录零盲区**：compose + folder 与 chain、plain 一样，每次 API 调用都有 start/finish、请求、响应、usage、物理请求与流式记录。
2. **意图路由统一**：compose 与 chain 使用同一路由结果与权限判定，不再因“并行模式”绕过统一底座。
3. **写入闭环可用**：edit/generate 意图下写入工具真实暴露；模型调用 `editor.propose_edits` 后进入 pending batch；确认前编辑器不变。
4. **导出可还原**：导出包包含完整 prompt、folder 指纹、结构化 ContextPack；主文件只保留引用和预览。
5. **不回归**：chain、plain、流水线、folder 协议、会话聚合、直出重试全部保持现有行为。

---

## 3. 明确不做

1. 不做模型直写编辑器；所有写入仍是提案 + 用户确认 + hash 校验 + 批次回滚。
2. 不改 Folder 协议六文件与执行器内核。
3. 不改生成流水线的一次性生成语义。
4. 不以“省 token”为目的削减上下文；导出瘦身只做外置，不删现场。
5. 不在本方案内引入新依赖。

---

## 4. M1 影响圈声明

### 4.1 计划修改

| 文件 | 修改点 |
|---|---|
| `src/services/workspaceSkillEngine.ts` | compose 接入统一路由；compose API start/finish；prompt 事件携带 callId；消除重复 prompt-built |
| `src/components/common/OutlineWorkspace.vue` | compose API 记录回调；pending batch 展示；提案缺失提示；导出上下文块 |
| `src/stores/runTrace.ts` | prompt snapshot 外置引用；payload 指纹；API call 绑定；去重键 |
| `src/services/runTraceExport.ts`（实际导出服务以 rg 为准） | payload 外置、指纹透传、主文件瘦身 |
| `src/services/workspaceSkillEngine.spec.ts` | compose + folder 回归测试 |
| `src/services/chainIntentRouter.spec.ts` | compose 路由一致性测试 |
| `src/stores/runTrace.spec.ts` | 导出与去重测试 |

### 4.2 计划新增

| 文件 | 用途 |
|---|---|
| `scripts/verify-outline-compose-folder-repair.mjs` | 源 Electron + CDP + mock 供应商真实操作验证 |

### 4.3 明确不碰

- `src/services/realSkillExecutor.ts`
- `electron/ipc/skill-loader.js`
- `src/services/folderSkillEval.ts`
- `src/services/de-ai.js`
- `src/services/chainIntentRouter.ts` 的判定算法本体
- 生成流水线层级传递与断点语义

---

## 5. 阶段 1：compose API 记录闭环（P0）

### Task 1.1 compose 调用前启动 API 记录

**描述**：`runWorkspaceSkills` compose 分支在调用 `callWorkspaceSkill` 前：

1. 解析 provider/model（与 chain 分支同逻辑）。
2. 调用 `callbacks.onApiCallStart` 获取 `callId`。
3. 将 `callId` 写入 `activeSkillCallIds`，保证 `onPhysicalCall` 能绑定记录。
4. 请求完成后调用 `onApiCallFinish`，写入 `requestMessages/responseText/finishReason/usage/durationMs`。
5. 异常、取消、空产物路径都必须 finish，禁止 running 僵尸。

**验收标准**：

- [ ] compose + folder 成功路径：1 个 API call，status=success，responseText 非空。
- [ ] 失败路径：status=failed，error 非空。
- [ ] 取消路径：status=canceled，无 running 残留。
- [ ] 物理请求、工具调用、prompt snapshot 均挂到同一个 callId。
- [ ] `finishRun` 前无 running API call。

**验证**：

```powershell
npx vitest run src/services/workspaceSkillEngine.spec.ts
```

**规模**：M

### Task 1.2 OutlineWorkspace 移除死分支

**描述**：

1. 删除 `result.allMetas.length === 0` 才补记录的 compose 兜底。
2. `onPromptBuilt` 不再依赖 `runTraceStore.getApiCallId('outline')` 全局游标，改用本轮 `onApiCallStart` 返回的 callId。
3. `onApiCallFinish` 后清理当前 callId，避免下一轮误挂。

**验收标准**：

- [ ] 12 轮 compose 会话导出 12 条 API call，不再是 0。
- [ ] 每个 prompt snapshot 的 `apiCallId` 指向真实 API call。
- [ ] 多轮连续发送不会把快照挂到上一轮。

**验证**：

- 单测 + E2E 脚本断言 API call 数量与归属。

**规模**：M

### Checkpoint 1

- [ ] `npx vitest run src/services/workspaceSkillEngine.spec.ts`
- [ ] compose + folder mock 会话导出含 API call、responseText、usage。
- [ ] chain 与 plain 路径 API 记录不回归。

---

## 6. 阶段 2：compose 意图路由统一（P0）

### Task 2.1 抽取共享路由解析

**描述**：把 chain 分支中 `routeChainIntent + legacy fallback + forcedIntent + fallback_requested` 的解析逻辑抽成共享函数，chain 与 compose 共用。compose 不再直接使用 `forcedIntent || 'auto'`。

**验收标准**：

- [ ] compose 与 chain 对同一请求得到同一 intent。
- [ ] routing_started、routing_result、skill_skipped、fallback_requested 事件在 compose 中同样出现。
- [ ] no_match 时 compose 返回 `awaiting_confirmation`，不发起 API。
- [ ] forcedIntent 仍然优先。

**验证**：

```powershell
npx vitest run src/services/workspaceSkillEngine.spec.ts src/services/chainIntentRouter.spec.ts
```

**规模**：L，拆两个闭环执行。

### Task 2.2 compose 权限面接入

**描述**：

1. `composeToolAccess` 由解析后的 intent 决定：analyze/discuss 只读；edit/generate 暴露 `editor.propose_edits`。
2. `resolveDialoguePermission` 保持唯一权限来源。
3. filter 后无可执行技能时返回 awaiting，不静默全跑。

**验收标准**：

- [ ] “把内容插入进大纲”类请求识别为 edit，工具面包含 `editor.propose_edits`。
- [ ] “分析缺失什么”类请求识别为 analyze/discuss，工具面无写入工具。
- [ ] no_match 弹出 fallback 确认，不直接全链执行。

**验证**：

- 单测覆盖 discuss/edit/no_match 三类。
- E2E 用 mock provider 断言请求 tools。

**规模**：M

### Checkpoint 2

- [ ] compose routing 事件完整。
- [ ] discuss 只读、edit 才提案。
- [ ] chain 路由行为无回归。

---

## 7. 阶段 3：写入提案闭环（P1）

### Task 3.1 提案工具真实可用

**描述**：edit/generate 意图下，`editor.propose_edits` 进入 compose 工具面。模型调用后：

1. 生成 pending batch。
2. 气泡显示“查看修改”。
3. 确认前编辑器内容不变。
4. 应用后进入批次台账，可回滚。

**验收标准**：

- [ ] mock 模型调用 `propose_edits` 后，出现 pending batch event。
- [ ] 用户未确认前 outline 文本 hash 不变。
- [ ] 确认后文本按提案变化，批次状态 applied。
- [ ] 取消提案后批次 rejected，编辑器不变。

**验证**：

- E2E：edit 请求 -> propose_edits -> pending -> apply。

**规模**：M

### Task 3.2 提案缺失可观测

**描述**：intent 为 edit/generate 且结束时没有任何 `propose_edits` 调用时：

1. 写入 trace 事件 `proposal-missing`，级别 warning。
2. 气泡尾部提示“本轮未生成可应用修改”。
3. 不阻断输出，不伪造提案。

**验收标准**：

- [ ] 模型只输出讨论文本时，trace 有 `proposal-missing`。
- [ ] 正常提案时无该事件。

**规模**：S

### Task 3.3 SKILL 层协议约定

**描述**：更新 folder SKILL 交接文档：写入意图下必须输出 `editor.propose_edits` 工具调用，不允许用 `status: approved` 文本替代用户确认。

**验收标准**：

- [ ] 文档明确工具名、输入结构、目标锚点、确认语义。
- [ ] 应用侧 `proposal-missing` 作为调试信号。

**规模**：S

---

## 8. 阶段 4：深度导出修正（P1）

### Task 4.1 prompt 快照外置

**描述**：

1. run 主文件中 prompt snapshot 只保留 id、turnId、apiCallId、skillId、mode、长度、payloadRef、preview。
2. 完整 systemPrompt/userPrompt/finalMessages/variables 移入 payload。
3. 导出校验保持 sha256。

**验收标准**：

- [ ] 12 轮长会话主 `run-trace.json` 明显瘦身，目标 < 500KB。
- [ ] payload 仍能还原完整 prompt。
- [ ] `payloadVerification.ok === true`。

**规模**：M

### Task 4.2 payload 补齐指纹与 ContextPack

**描述**：

1. payload 文件透传 `folderFingerprint`。
2. `contextBlocks` 不再用 `final-message` 空壳，改为 ContextPack 结构块：source、version、coverage、chars。
3. 保留 system 消息全文用于还原，不删现场。

**验收标准**：

- [ ] 每个 folder prompt payload 均含 5 文件指纹。
- [ ] ContextPack 块有 source/version/coverage。
- [ ] 旧导出仍可打开，不因字段缺失崩溃。

**规模**：M

### Task 4.3 快照去重

**描述**：

1. 修复 folder/text 双路径重复触发 `onPromptBuilt`。
2. 内容寻址规范化：排除 id、builtAt、createdAt 等易变字段后再计算 hash。
3. 同内容 payload 共享，`duplicateCount` 累加。

**验收标准**：

- [ ] 12 轮会话不再出现 16 个快照；同轮同内容只保留 1 个物理 payload。
- [ ] 完全相同 prompt 的 sha256 一致。
- [ ] 事件时间线仍能看出构建发生。

**规模**：M

### Checkpoint 4

- [ ] 主文件瘦身。
- [ ] payload 完整可还原。
- [ ] 指纹与 ContextPack 齐全。
- [ ] 去重不丢现场。

---

## 9. 验证矩阵

| 场景 | 验证点 |
---|---|
| compose discuss | routing 事件、只读工具、API call 完整、无提案 |
| compose edit | 写入工具暴露、propose_edits、pending batch、确认前不变 |
| compose no_match | fallback 确认，不发起 API |
| compose 失败 | API failed，无僵尸 |
| compose 取消 | API canceled，无僵尸 |
| 长文档 | ContextPack、结构地图、read_range 保留 |
| 导出 | payload 校验、指纹、ContextPack、主文件瘦身 |
| 去重 | 同内容 payload 共享，不重复膨胀 |
| chain 回归 | 路由、API、工具、断点不变 |
| plain 回归 | 直接对话 API 记录不变 |
| 流水线回归 | 五层生成不引入交互工具 |

## 10. 命令门

1. `npm run type-check`
2. `npm run test:services`
3. `npm run build:vue`
4. `npx vitest run`
5. `node scripts/verify-outline-compose-folder-repair.mjs`

E2E 前必须重新 `npm run build:vue`，避免验证旧 bundle。

---

## 11. 风险与回退

| 风险 | 等级 | 缓解 |
---|---|---|
| compose 路由误伤既有并行用法 | 高 | 保留 forcedIntent；no_match 走 fallback；E2E 覆盖三类意图 |
| API call 双记 | 高 | 以 engine 回调为唯一入口；删除 UI 兜底；断言 call 数 |
| 提案工具暴露后模型滥用 | 中 | 仍是提案 + 确认 + hash；确认前不变 |
| 导出外置丢现场 | 高 | payload sha256 校验；E2E 断言可还原 |
| 去重误合并不同 prompt | 中 | 规范化 hash 只排除易变字段，不排除内容 |

回退原则：每个任务独立闭环；出问题只回退该任务，不动 Folder 协议与生成流水线。

---

## 12. 执行顺序

1. 阶段 1 -> 2 -> 3 -> 4，顺序执行。
2. 每个 Task 完成后立即验证并附证据。
3. 每个 Checkpoint 全绿才进入下一阶段。
4. 全部完成后更新 `神意开发经验总结_v5.md` 与 DEV_LOG。
5. 再讨论版本升级与封装。
