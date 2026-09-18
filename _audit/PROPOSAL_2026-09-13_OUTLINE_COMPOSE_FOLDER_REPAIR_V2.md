# 大纲工作台写入闭环修复方案 V2

日期：2026-09-13  
方案性质：正式修复方案，待用户审核；本阶段只定稿，不修改业务代码。  
替代版本：`_audit/PROPOSAL_2026-09-13_OUTLINE_COMPOSE_FOLDER_REPAIR.md`  
依据：

- 运行记录：`run-trace-outline-20260913-160439-deep`
- SKILL 层反馈：`outline.write_range` / `approved` 状态缺口
- 统一底座：`_audit/PROPOSAL_2026-09-11_API_DIALOGUE_FOUNDATION_UNIFICATION.md`
- 工程规则：`_audit/神意开发经验总结_v5.md`
- 最新日志：`_audit/DEV_LOG_2026-09-13-full-unification-repair.md`

---

## 1. 实测证据

本次 12 轮 compose + folder 会话中，用户从第 7 轮开始连续要求写入大纲：

| 轮次 | 用户输入 | 实际工具调用 | 结果 |
|---|---|---|---|
| 7 | 那该应该在大纲什么位置里写入？ | 无 | 只给文字建议 |
| 8 | 通过，你把内容插入进大纲 | 无 | 无提案 |
| 9 | 你插入了吗？ | `outline.search` | 只读搜索 |
| 10 | 可以 | 无 | 无提案 |
| 11 | 你写进大纲了么？ | `editor.search` / `editor.get_state` | 只读 |
| 12 | 你能把我复制粘贴的位置标注出来么 | `outline.read_range` x4 | 只读定位 |

整份记录中：

1. `editor.propose_edits` 出现次数：0。
2. 编辑批次事件出现次数：0。
3. 意图路由事件出现次数：0。
4. API call 记录数：0。
5. 模型最终明确建议用户手动复制粘贴。

结论：不是模型偶然不用工具，而是 compose + folder 分支没有接入统一底座，写入工具从未进入请求。

---

## 2. 根因

### 2.1 应用层主因

1. **compose 绕过意图路由**  
   compose 分支直接使用 `forcedIntent || 'auto'`，没有调用 `routeChainIntent`。写入请求不会被识别为 edit/generate。

2. **auto 意图降级为 discuss**  
   `resolveDialoguePermission('auto')` 默认归一为 discuss，`proposeEdits=false`，所以 `editor.propose_edits` 被 `resolveDialogueToolSurface` 过滤掉。

3. **compose API 记录缺失**  
   compose 分支不调用 `onApiCallStart/onApiCallFinish`；UI 侧兜底分支因 `allMetas.length === 1` 永远跳过，导致 12 轮全部无 API 记录。

4. **提案缺失不可观测**  
   edit/generate 轮结束但没有 `propose_edits` 时，没有任何 warning，用户只能靠追问发现写入失败。

5. **深度导出缺陷沿用 V1 方案**  
   主文件内嵌完整 prompt、payload 缺 `folderFingerprint`、ContextPack 为空壳、同轮重复快照。

### 2.2 SKILL 层次责

1. SKILL 输出【修改预览】文本，而不是产出 `editor.propose_edits` 工具调用。
2. SKILL 将用户口语“通过/可以”解读为已批准，但没有应用层事件可依赖。

### 2.3 对 SKILL 层 `outline.write_range` 建议的裁定

不新增直写工具。理由：

1. 应用铁律是“AI 写入永远是提案 + 用户确认 + hash 校验 + 批次回滚”。
2. `outline.write_range` 若表示“工具成功即 approved”，等于绕过用户确认，重新打开模型直写通道。
3. 读取范围已经由 `outline.read_range` 承担，它是只读工具。

安全等价实现：

- 读：`outline.get_structure` / `outline.read_range` / `outline.search`
- 写：`editor.propose_edits`
- 状态语义：
  - 工具成功 = `pending_user_confirmation`
  - `approved` 只能来自用户在 UI 中确认批次
  - 模型不得通过文本 `status: approved` 宣称已写入

---

## 3. 修复目标

1. 用户说“插入/写入/改到大纲”时，compose 请求的工具面必须包含 `editor.propose_edits`。
2. 模型调用写入工具后，气泡必须显示编辑命令批次和“查看修改”。
3. 用户确认前大纲文本 hash 不变；确认后进入批次台账并可回滚。
4. edit/generate 轮没有提案时，应用必须主动提示并写入 `proposal-missing` warning。
5. compose + folder 的 API 调用、工具调用、prompt、物理请求全部进入运行记录。
6. chain、plain、流水线行为零回归。

---

## 4. 明确不做

1. 不做模型直写编辑器。
2. 不新增 `outline.write_range` 直写工具。
3. 不改 Folder 协议六文件与执行器内核。
4. 不改生成流水线一次性生成语义。
5. 不为省 token 删除导出现场。
6. 不引入新依赖。

---

## 5. M1 影响圈声明

### 5.1 计划修改

| 文件 | 修改点 |
|---|---|
| `src/services/workspaceSkillEngine.ts` | compose 接入共享路由；API start/finish；工具面接入；prompt 事件绑定 callId |
| `src/components/common/OutlineWorkspace.vue` | compose API 记录；pending batch 展示；proposal-missing 提示；导出上下文块 |
| `src/stores/runTrace.ts` | API call 绑定、prompt 外置引用、payload 去重 |
| 导出服务（以 `rg "runTraceExport"` 实际结果为准） | payload 外置、指纹透传、主文件瘦身 |
| `src/services/workspaceSkillEngine.spec.ts` | compose 路由、工具、API 记录回归 |
| `src/services/chainIntentRouter.spec.ts` | compose/chain 同请求同意图 |
| `src/stores/runTrace.spec.ts` | 导出完整性测试 |
| Folder SKILL 交接文档 | 写入协议契约 |

### 5.2 计划新增

| 文件 | 用途 |
|---|---|
| `scripts/verify-outline-compose-folder-repair-v2.mjs` | 源 Electron + CDP + mock 供应商真实操作验证 |

### 5.3 明确不碰

- `src/services/realSkillExecutor.ts`
- `electron/ipc/skill-loader.js`
- `src/services/folderSkillEval.ts`
- `src/services/de-ai.js`
- `chainIntentRouter.ts` 判定算法本体
- 生成流水线层级语义

---

## 6. 阶段 1：compose API 记录闭环（P0）

### Task 1.1 engine 发起 API start/finish

compose 分支调用 `callWorkspaceSkill` 前：

1. 解析 provider/model。
2. 调用 `callbacks.onApiCallStart` 获取 `callId`。
3. `callId` 写入 active call 集合，供物理请求绑定。
4. 完成后调用 `onApiCallFinish`，写入 requestMessages、responseText、finishReason、usage、durationMs。
5. 异常、取消、空产物必须 finish，禁止 running 僵尸。

验收：

- [ ] 成功路径 status=success，responseText 非空。
- [ ] 失败路径 status=failed，error 非空。
- [ ] 取消路径 status=canceled。
- [ ] 12 轮会话导出 12 条 API call。
- [ ] prompt、工具、物理请求挂同一 callId。

### Task 1.2 移除 UI 死兜底

1. 删除 `allMetas.length === 0` 才补记录的分支。
2. `onPromptBuilt` 使用本轮 callId，不再依赖全局游标。
3. finish 后清理 callId，防止下一轮误挂。

验收：

- [ ] 无 API call 双记。
- [ ] 连续发送不会把快照挂到上一轮。

### Checkpoint 1

- [ ] `npx vitest run src/services/workspaceSkillEngine.spec.ts`
- [ ] chain 与 plain API 记录无回归。

---

## 7. 阶段 2：意图路由与写入工具统一（P0）

### Task 2.1 抽取共享路由解析

把 chain 分支的 `routeChainIntent + legacy fallback + forcedIntent + fallback_requested` 抽成共享函数，compose 复用。

验收：

- [ ] compose 与 chain 对同一请求得到同一 intent。
- [ ] “把内容插入进大纲”识别为 edit。
- [ ] “分析缺失什么”识别为 analyze/discuss。
- [ ] no_match 返回 awaiting_confirmation，不发起 API。

### Task 2.2 权限面真实暴露

1. `resolveDialoguePermission` 仍是唯一权限来源。
2. edit/generate 时 compose 工具面包含 `editor.propose_edits`。
3. discuss/analyze 只保留读取工具。
4. folder 技能过滤后无可执行项时 awaiting，不静默全跑。

验收：

- [ ] edit 请求的 tools 包含 `editor.propose_edits`。
- [ ] discuss 请求的 tools 不包含写入工具。
- [ ] mock provider 能收到写入工具声明。

### Task 2.3 追问轮不降级

用户连续追问“你插入了吗/可以/写进大纲了么”时，必须基于会话近期写入意图重新路由，不能因为上一轮失败降级为讨论。

验收：

- [ ] 第 9、10、11 轮同类追问被识别为 edit。
- [ ] 识别失败时进入 fallback，不静默只读。

### Checkpoint 2

- [ ] compose routing 事件完整。
- [ ] discuss 只读，edit 才提案。
- [ ] chain 路由行为无回归。

---

## 8. 阶段 3：写入提案闭环（P0）

### Task 3.1 提案工具真实可用

模型调用 `editor.propose_edits` 后：

1. 生成 pending batch。
2. 气泡显示编辑命令与“查看修改”。
3. 确认前大纲 hash 不变。
4. 确认后进入批次台账，可回滚。
5. 取消后 rejected，编辑器不变。

验收：

- [ ] mock 模型调用后出现 pending batch event。
- [ ] 确认前 hash 不变。
- [ ] 确认后文本按提案变化，状态 applied。
- [ ] 取消后 rejected，hash 不变。

### Task 3.2 proposal-missing 可观测

edit/generate 结束且没有 `propose_edits`：

1. trace 写 `proposal-missing` warning。
2. 气泡尾部提示“本轮未生成可应用修改”。
3. 不阻断输出，不伪造提案。

验收：

- [ ] 无提案的 edit 轮出现 warning。
- [ ] 正常提案轮无 warning。

### Task 3.3 状态语义硬约束

1. 工具返回只允许 `pending_user_confirmation`。
2. `approved` 只能由用户 UI 确认事件产生。
3. SKILL 文本中的 `status: approved` 不产生任何写入效果。

验收：

- [ ] 伪造 approved 文本无法改变编辑器内容。
- [ ] trace 中 approved 事件来源只能是用户操作。

### Checkpoint 3

- [ ] E2E：edit -> propose_edits -> pending -> apply。
- [ ] E2E：edit -> no proposal -> warning。
- [ ] E2E：fake approved text -> no write。

---

## 9. 阶段 4：SKILL 契约更新（P1）

### Task 4.1 交接文档

更新 folder SKILL 交接文档，写入：

1. 读范围用 `outline.read_range`。
2. 写入必须调用 `editor.propose_edits`。
3. 工具成功是 pending，不是 approved。
4. 用户确认只能发生在大纲工作台 UI。
5. 不允许输出“已写入”文本，除非收到应用层 applied 事件。

验收：

- [ ] 工具名、输入结构、目标锚点、确认语义齐全。
- [ ] `proposal-missing` 作为调试信号说明。

### Checkpoint 4

- [ ] SKILL 层可直接按文档产出合规调用。

---

## 10. 阶段 5：深度导出修正（P1）

### Task 5.1 prompt 外置

主 trace 只保留 id、turnId、apiCallId、skillId、mode、长度、payloadRef、preview；全文进 payload。

验收：

- [ ] 12 轮主文件目标 < 500KB。
- [ ] payload sha256 校验通过。

### Task 5.2 指纹与 ContextPack

1. payload 透传 `folderFingerprint`。
2. `contextBlocks` 改为结构化 ContextPack 块。
3. 保留 system 全文，不删现场。

验收：

- [ ] 每个 folder payload 含 5 文件指纹。
- [ ] ContextPack 块含 source/version/coverage/chars。
- [ ] 旧导出可打开。

### Task 5.3 快照去重

1. 修复 folder/text 双路径重复 `onPromptBuilt`。
2. hash 排除 id、builtAt 等易变字段。
3. 同内容 payload 共享，duplicateCount 累加。

验收：

- [ ] 12 轮不再产生 16 个快照。
- [ ] 时间线仍可见。

### Checkpoint 5

- [ ] 主文件瘦身。
- [ ] payload 可还原。
- [ ] 指纹与 ContextPack 齐全。

---

## 11. 验证矩阵

| 场景 | 验证点 |
|---|---|
| compose discuss | routing、只读工具、API 记录、无提案 |
| compose edit | 写入工具暴露、propose_edits、pending batch、确认前不变 |
| compose 追问写入 | 后续轮保持 edit 意图，不降级 |
| compose no_match | fallback 确认，不发起 API |
| compose 失败/取消 | API 状态正确，无僵尸 |
| 伪造 approved 文本 | 不产生写入 |
| 长文档 | ContextPack、结构地图、read_range 保留 |
| 导出 | payload 校验、指纹、ContextPack、瘦身 |
| chain 回归 | 路由、API、工具、断点不变 |
| plain 回归 | 直接对话 API 记录不变 |
| 流水线回归 | 五层生成不引入交互工具 |

---

## 12. 命令门

1. `npm run type-check`
2. `npm run test:services`
3. `npm run build:vue`
4. `npx vitest run`
5. `node scripts/verify-outline-compose-folder-repair-v2.mjs`

E2E 前必须重新 `npm run build:vue`，避免验证旧 bundle。

---

## 13. 风险与回退

| 风险 | 等级 | 缓解 |
|---|---|---|
| compose 路由误伤既有并行用法 | 高 | forcedIntent 优先；no_match 走 fallback；三类意图 E2E |
| API call 双记 | 高 | engine 回调唯一入口；删除 UI 兜底；断言 call 数 |
| 写入工具暴露后滥用 | 中 | 仍为提案 + 确认 + hash；确认前不变 |
| 追问轮误判 | 中 | 会话近期意图作为辅助信号，不替代当前轮文本 |
| 导出外置丢现场 | 高 | sha256 校验；E2E 断言还原 |
| 去重误合并 | 中 | hash 只排除易变字段，不排除内容 |

回退原则：每个任务独立闭环，出问题只回退该任务，不动 Folder 协议与生成流水线。

---

## 14. 执行顺序

1. 阶段 1 -> 2 -> 3 -> 4 -> 5，顺序执行。
2. 每个 Task 完成后立即验证并附证据。
3. 每个 Checkpoint 全绿才进入下一阶段。
4. 全部完成后更新经验文件与 DEV_LOG。
5. 再讨论版本升级与封装。
