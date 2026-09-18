# API 对话框直写编辑器改造方案（2026-09-14）

## 1. 结论

本方案将主页编辑器与大纲工作台的 API 对话框升级为 **API 直写编辑器**：

- 模型调用 `editor.write`；
- 工具执行器立即校验并写入编辑器；
- 写入结果作为 tool result 回传给模型，模型在同一个请求循环内知道写入是否成功；
- 成功后消息气泡显示“已写入 · 可回滚”，用户可一键回滚；
- 校验失败不进入待确认区，而是返回结构化错误给模型重试；请求结束后仍失败则明确报错，原文保持不变；
- 生成流水线永远禁写；
- 旧“提案 + 确认”模式保留为兼容开关，不再作为直写模式的兜底路径。

这不是把旧待确认区自动点掉，而是把写入时机从“响应结束后 UI 解析批次”提前到“工具调用执行时同步写入”。现有 `aiService.callAiWithTools()` 已经支持工具执行与结果回传（src/services/aiService.ts:1083-1244），所以架构不需要推倒，只需要把写入工具变成真正执行写入的工具。

## 2. 为什么旧方案不可用

旧链路是“提案工具 + 响应后解析 + Diff 确认”，实际被三道闸门压死：

1. 意图路由只在 `edit/generate` 暴露写入工具：`resolveDialoguePermission()` 的 `canPropose` 判定在 src/services/dialogueFoundation.ts:57-63，过滤入口在 src/services/dialogueFoundation.ts:149。
2. 空目标直接不注册工具：主页在 src/components/chat/ChatPanel.vue:783，大纲在 src/components/common/OutlineWorkspace.vue:2546。
3. 工具描述反向引导“不会写入编辑器”：src/services/editorTools.ts:204，固定返回 `pending_user_confirmation` 在 src/services/editorTools.ts:291。

结果是多轮共创、空编辑器、讨论句式下模型根本没有可用写入工具，待确认区自然成为不可达功能。直写方案不再依赖意图分类、不再依赖响应后文本解析、不再依赖用户点确认。

## 3. 新工具协议：`editor.write`

### 3.1 工具定义

新增写入工具：

```json
{
  "name": "editor.write",
  "description": "立即写入当前编辑器。可提交 1-10 条受限编辑命令；应用会执行定位唯一性、目标版本、锁定状态与结构完整性校验，校验通过立即写入并返回结果；失败返回结构化错误，可修正参数后重试。",
  "policy": "write",
  "input": {
    "commands": [
      {
        "operation": "insert | replace_selection | replace_match | append | delete | rewrite",
        "content": "要写入的内容",
        "target": "replace_match/delete/rewrite 必填，原文片段必须唯一",
        "position": "cursor | selection_start | selection_end | end",
        "reason": "本条命令说明"
      }
    ],
    "reason": "整批写入说明"
  }
}
```

### 3.2 执行语义

`editor.write.execute()` 内部流程：

1. 读取当前目标快照；空编辑器允许 `insert/append`。
2. 校验 `context.writableTarget === context.targetId`，禁止跨目标写入。
3. 生成批次计划，复用 `planEditorEditBatch()`：
   - 定位唯一性：复用 locate 引擎，多命中返回 `ambiguous_target`；
   - 版本校验：目标内容变化返回 `version_changed`；
   - 锁定：返回 `locked`；
   - 命令与长度限制：沿用 1-10 条、单条 20000、批次 60000 字符上限。
4. 大纲工作台额外执行 `validateOutlineIntegrity()`，critical 失败拒绝写入。
5. 全部通过后立即调用注入的 `applyWrite(next, meta)` 写入编辑器。
6. 返回结构化 tool result。

成功返回：

```json
{
  "ok": true,
  "data": {
    "status": "written",
    "batchId": "ai-write-...",
    "commandCount": 3,
    "writtenLength": 1520,
    "rollbackAvailable": true
  }
}
```

失败返回：

```json
{
  "ok": false,
  "error": {
    "code": "ambiguous_target | target_not_found | version_changed | locked | integrity_failed | invalid_command | batch_too_large",
    "message": "第 2 条命令的 target 出现多次，必须扩展片段使其唯一",
    "retryable": true
  }
}
```

### 3.3 与旧工具的关系

- 直写模式（默认）：只暴露 `editor.write`，不暴露 `editor.propose_edits`，避免模型被两个相似工具分流。
- 兼容模式（用户可在设置中切回）：保留 `editor.propose_edits` + Diff 确认流程。
- 两套工具共享同一命令协议、诊断与写入核心，不维护两套规则。
- 生成流水线 workspace 下两者都禁止注册，现有禁写校验保留。

## 4. 架构改造

### 4.1 工具工厂支持真实写入

`createEditorTools(options)` 增加参数：

```ts
export interface EditorWriteApplier {
  apply(input: {
    workspace: 'main' | 'outline'
    targetId: string
    batchId: string
    next: string
    original: string
    commands: EditorEditCommand[]
    reason?: string
  }): Promise<{
    ok: true
    rollbackAvailable: boolean
  } | {
    ok: false
    code: string
    message: string
  }>
}

createEditorTools({
  workspace,
  getSnapshot,
  getAllSnapshots,
  mode: 'proposal' | 'direct',
  applyWrite: EditorWriteApplier,
  validateIntegrity?: (original: string, next: string) => { ok: boolean; summary?: string }
})
```

主页 `applyWrite`：

1. 二次确认目标页签仍存在、当前内容等于快照内容；
2. `pushUndoState()` 保留原内容；
3. `updateContent()` 写入；
4. 派发 `editor-external-change`；
5. 派发 `editor-ai-batch-checkpoint`（batchId 关联回滚）；
6. 更新消息批次记录为 `applied`；
7. 写入 run trace 与诊断日志。

大纲 `applyWrite`：

1. 校验 `projectStore.outlineLocked`；
2. 校验当前大纲内容等于快照内容；
3. `commitOutlineChange(next)` 写入；
4. 批次记录置为 `applied`；
5. 写入 run trace 与诊断日志。

关键点：`applyWrite` 由组件注入，服务层不直接 import store，保持工具服务可单测。

### 4.2 权限矩阵

`resolveDialoguePermission()` / `resolveDialogueToolSurface()` 增加 `writeMode: 'proposal' | 'direct'`：

- `direct` 模式下，主页与大纲对所有意图暴露 `editor.write`；
- 意图仍保留给上下文组装和路由提示使用，但不再作为写入工具开关；
- pipeline workspace 无论什么模式都返回空工具面；
空编辑器不再作为禁写条件。空目标下 `insert/append` 可写，`replace/delete/rewrite` 会因目标缺失返回结构化错误。

### 4.3 供应商兼容模式

当前不支持原生工具的供应商会整体降级为普通文本调用（src/services/aiService.ts:1099-1134）。直写模式需要补一条兼容协议：

1. 兼容模式下注入 `EDITOR_WRITE_PROTOCOL` 系统提示，要求模型输出受限 JSON：`{ "tool": "editor.write", "commands": [...] }`；
2. 响应结束后由统一解析器解析并调用同一个 `editor.write` 执行器；
3. 解析失败或校验失败时以普通消息形式返回错误，不写编辑器；
4. 运行记录标注 `compatibility_write=true`，避免 SKILL 调试方误判为原生工具调用。

### 4.4 写入次数控制

- 直写模式沿用 `toolPolicy`，将 `maxWriteProposals` 语义升级为 `maxWriteCalls`；
- 默认每次请求允许 1 次 `editor.write`；
- 模型需要在一次调用里提交完整批次（最多 10 条命令）；
   第二次调用会收到 `write_limit_reached`，防止模型循环改写叠加；
- 6 轮工具循环上限保留，定位失败时模型可用 `editor.get_state/search/locate` 修正后重试。

### 4.5 回滚

- 写入成功即创建 `EditorBatchRecord`，状态直接为 `applied`；
   复用现有 `appliedContentHash`、undo 栈查找与一键回滚；
- 主页回滚复用 `rollbackEditorBatch()`（src/components/chat/ChatPanel.vue:2417）；
- 大纲回滚复用 `rollbackOutlineBatch()`（src/components/common/OutlineWorkspace.vue:1512）；
- 写入后若用户手动改过内容，回滚拒绝并提示使用编辑器撤销，防止覆盖用户创作。

### 4.6 UI

主页与大纲 API 输入区增加模式开关：

- `直写`：高亮，默认开启；
- `提案`：切回旧确认流程；
- 生成流水线无此开关。

气泡展示：

- 成功：`已写入编辑器 · 3 条修改 · 可回滚`
- 失败：`写入失败 · {错误码}：{原因}`，正文未改动
- 兼容模式：`兼容模式直写`

运行记录展示：

- `editor.write` 工具调用、输入命令、执行结果、耗时；
- `batch_event status=applied, reason=direct_write`；
- 失败时 `reason=direct_write_failed:{code}`。

## 5. 任务清单

### Phase 1：协议与服务层

#### Task 1：直写工具执行器

改动：

- `src/services/editorTools.ts`
- `src/services/editorTools.spec.ts`

验收：

- [ ] `direct` 模式暴露 `editor.write`，不暴露 `editor.propose_edits`；
- [ ] 校验通过时调用 `applyWrite` 并返回 `written`；
- [ ] 校验失败返回结构化错误且绝不调用 `applyWrite`；
- [ ] 空编辑器允许 `insert/append`；
- [ ] 一次最多 10 条命令，超限返回 `batch_too_large`。

验证：

- `npm run test:services -- editorTools`
- `npm run type-check`

#### Task 2：权限矩阵升级

改动：

- `src/services/dialogueFoundation.ts`
- `src/services/dialogueFoundation.spec.ts`
- `src/services/dialogueFoundationContract.spec.ts`

验收：

- [ ] `direct` 模式下主页/大纲全意图暴露 `editor.write`；
- [ ] `proposal` 模式行为保持现状；
- [ ] pipeline 在任何模式下都不暴露写入工具；
- [ ] 空目标可注册工具。

验证：

- `npm run test:services -- dialogueFoundation`
- `npm run type-check`

#### Task 3：写入次数与循环控制

改动：

- `src/services/aiService.ts`
- `src/services/aiService.spec.ts`

验收：

- [ ] `maxWriteCalls` 默认 1，第二次 `editor.write` 返回 `write_limit_reached`；
- [ ] 工具结果正确回传模型，模型可基于错误修正；
- [ ] 6 轮工具循环上限与可读错误保持不回归。

验证：

- `npm run test:services -- aiService`
- `npm run type-check`

### Phase 2：主页编辑器接入

#### Task 4：主页 applyWrite 注入

改动：

- `src/components/chat/ChatPanel.vue`

验收：

- [ ] 模型调用 `editor.write` 后，响应过程中编辑器立即更新；
- [ ] 写入前 hash/版本校验，内容变化拒绝；
- [ ] 写入后 undo 栈、checkpoint、回滚可用；
- [ ] 气泡显示写入结果；
- [ ] 切回 `proposal` 模式时旧流程可用。

验证：

- `npm run type-check`
- `npm run test:services`
- Electron E2E。

### Phase 3：大纲工作台接入

#### Task 5：大纲 applyWrite 注入

改动：

- `src/components/common/OutlineWorkspace.vue`

验收：

- [ ] `editor.write` 直接写回大纲；
- [ ] 锁定状态拒绝写入；
- [ ] 完整性 critical 失败拒绝写入；
- [ ] 一键回滚可用；
- [ ] trace 标记 `direct_write`。

验证：

- `npm run type-check`
- `npm run test:services`
- Electron E2E。

### Phase 4：兼容模式、设置与收尾

#### Task 6：供应商兼容直写协议

验收：

- [ ] 不支持原生工具的供应商可通过 JSON 协议直写；
- [ ] 解析/校验失败不写编辑器；
- [ ] trace 标注 `compatibility_write`。

#### Task 7：设置与 UI

改动：

- `src/stores/settings.ts`
- `src/components/chat/ChatPanel.vue`
- `src/components/common/OutlineWorkspace.vue`
- 设置页对应组件

验收：

- [ ] 新增 `editorWriteMode: { main: 'direct' | 'proposal', outline: 'direct' | 'proposal' }`；
- [ ] 默认 `direct`；
- [ ] 状态持久化，重启保留；
- [ ] 旧配置缺省时迁移为 `direct`。

#### Task 8：观测、文档与版本收尾

验收：

- [ ] run trace 完整记录 write 工具调用、applied/failed、rollback；
- [ ] 诊断日志 detail 含 `writeMode=direct`；
- [ ] 新增 DEV_LOG 并更新索引；
- [ ] 经验文件修订规则 26/69：直写必须走 `editor.write` 统一执行器与全部校验，禁止旁路；pipeline 永远禁写；
- [ ] 版本升级并封装。

## 6. 不改动清单

- 生成流水线禁写规则；
- `PipelinePanel.vue` 生成逻辑；
- 批次状态机与回滚算法；
- undo/redo 机制；
- 供应商工具调用归一化协议；
- Folder skill 执行器；
- DiffModal（仅 proposal 模式继续使用）。

## 7. 风险与对策

| 风险 | 等级 | 对策 |
| --- | --- | --- |
| 模型写错内容 | 高 | 命令上限 + locate 唯一性 + 大纲完整性校验；写入即建回滚点，一键恢复 |
| 写错位置 | 高 | 模糊/多命中直接拒绝并返回错误，模型可用只读工具修正后重试 |
| 版本竞态 | 高 | 快照 hash 二次校验，内容变化拒绝写入 |
| 连续写入叠加 | 中 | 每请求 1 次 `editor.write`，第二次返回限制错误 |
| 兼容供应商误判 | 中 | JSON 协议只认受限结构，失败不写入并记录 `compatibility_write` |
| 用户不知内容已变 | 中 | 气泡即时显示写入结果，编辑器目标联动更新 |
| 旧确认流程回归风险 | 中 | proposal 模式保留，E2E 同时覆盖两种模式 |

## 8. 验证矩阵

1. `npm run test:services`
2. `npm run type-check`
3. `npm run build:vue`
4. Electron E2E（mock 供应商 + CDP + 干净 profile + try/finally 清理）：
   - 主页直写成功；
   - 主页空编辑器插入；
   - 主页版本变化拒绝；
   - 主页定位失败后模型修正重试；
   - 主页写入后一键回滚；
   - 大纲直写成功；
   - 大纲锁定拒绝；
   - 大纲完整性 critical 拒绝；
   - 大纲回滚；
   - proposal 模式不回归；
   - pipeline 无写入工具；
   - 兼容供应商 JSON 直写；
   - run trace 完整记录 direct_write 事件。
5. 收尾对账：方案勾选、DEV_LOG、索引、经验文件、临时 profile/导出目录清理复核。
