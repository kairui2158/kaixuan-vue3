# 编辑器底座与 API 直写匹配修复方案

日期：2026-09-24  
状态：已执行（2B 幽灵撤销栈已裁决并删除；2C 大纲替换已落地；双入口等价性 E2E 已接入最终门禁）
范围：主页编辑器、大纲工作台编辑器、API 直写双入口适配层  
非目标：不修改 `editor.write` 命令协议、不放宽权限门、不改变大纲锁定/完整性校验、不做编辑器 UI 重设计、不在本方案内封装发版。

## 1. 审计结论

两个编辑器当前是“双组件 + 共享服务底座”：

| 层 | 现状 | 成熟度 |
| --- | --- | --- |
| 工具执行器 | `editorTools.ts` 单源，13 个读工具 + `editor.write` | 高 |
| 权限与工具面 | `dialogueToolSurface.ts` + 服务层二次授权 | 高 |
| 长文档策略 / EditTask | `longDocumentPolicy.ts`、`editTaskService.ts` 单源 | 高 |
| 入口适配 | 主页 `ChatPanel.vue` 与大纲 `OutlineWorkspace.vue` 各自维护 | 中 |
| 上下文注入 | 大纲走 ContextPack；主页存在两条注入通道 | 中低 |
| 撤销体系 | 主页双栈并行；大纲组件内自建栈 | 中低 |

API 直写核心链路是同源的，且已有 13 场景 Electron 压测、1M 字符实测和 909 条服务测试通过。真正的问题集中在入口适配层：同一信息在两个入口的语义不一致，以及主页存在绕过长文档保护的第二通道。

## 2. 问题清单

### P0：直接影响客户行为

#### P0-1 主页长文档全文双通道注入

证据：

- `src/components/chat/ChatPanel.vue:2072` 附近的“当前编辑目标”块有 12000 字符保护，超长时只注入长度提示。
- `src/components/chat/ChatPanel.vue:2053` 附近 `chatCtx.editorContent = activeTab.content` 没有长度限制。
- `src/components/chat/ChatPanel.vue:2062` 附近把 `chatCtx.editorContent` 全文写入 system prompt。

后果：

- 长文档保护被第二条通道绕过，几十万字 tab 仍会全文进入 system prompt。
- 与 `longDocumentPolicy` 的设计意图冲突。
- 会放大长文档请求耗时、上下文预算压力，并让模型在重复全文中分配注意力。

#### P0-2 主页选区全程丢失

证据：

- 请求快照在 `ChatPanel.vue:648`、`1044`、`2307` 附近硬编码 `selectionStart: 0`。
- `getCurrentTarget()` 在 `ChatPanel.vue:2970` 附近也硬编码选区为 0。
- 仅 `_pendingInlineSelection` 事件路径能短暂带回真实选区。

后果：

- 用户选中文字后向 API 提问，模型收到“当前无选区”。
- 选中替换、焦点询问、局部改写等场景在主页和大纲语义不一致。

#### P0-3 主页多目标快照版本号失真

证据：

- `ChatPanel.vue:3136` 附近的 `getAllSnapshots()` 对所有 tab 返回 `contentVersion: 0`。
- `editor.write` 当前只硬校验 workspace/targetId，不校验版本号，所以不会直接拦截写入。

后果：

- trace、checkpoint、跨 tab 读取拿到的版本语义失真。
- 未来一旦把版本号升级为硬门槛，会在这里集中爆雷。

### P1：结构性分叉，短期可用但会持续制造回归

#### P1-1 读上限函数重复实现

证据：

- 主页 `resolveHomeReadCapChars()`：`ChatPanel.vue:1286`。
- 大纲 `resolveOutlineReadCapChars()`：`OutlineWorkspace.vue:842`。
- 两处数学逻辑当前一致，但无单源约束。

#### P1-2 12000 字符常量分散

证据：

- `editorDocumentMap.ts` 定义默认/最大读取 12000。
- `ChatPanel.vue` 内另有硬编码 12000 判断。

#### P1-3 主页撤销双栈并行

证据：

- API 写入走 `editorStore.pushUndoState()`。
- 同批次又派发 `editor-ai-batch-checkpoint`，EditorPanel 的本地 `undoRedo` 记 checkpoint。
- 编辑器快捷键撤销与聊天气泡回滚使用不同栈。

#### P1-4 大纲缺少替换功能

证据：

- 主页有查找 + 替换。
- 大纲只有查找，没有替换。

### P2：登记项，不在本轮 P0/P1 内抢跑

1. Anthropic / Gemini / Azure 直写 live 实测仍为 `untested`，当前只有协议级验证。
2. 主页与大纲上下文注入架构差异需要进一步统一，但不能和 P0-1 混在一次改动里。
3. 大纲结构完整性门、锁定门是领域设计差异，保留，不视为缺陷。

## 3. 修复方案

### Phase 0：基线锁定

1. 记录当前版本基线：
   - `npm run test:services`
   - `npm run type-check`
   - `npm run verify:production-wiring`
   - `node scripts/verify-api-direct-write-electron.mjs`
2. 新增“双入口等价性矩阵”测试清单，作为后续每一步的对照表：
   - 短文档局部修改
   - 长文档分页读取 + 局部修改
   - 有选区 / 无选区
   - 活动 tab / 非活动 tab
   - 版本冲突
   - 批次回滚
   - 大纲锁定拒绝
   - trace 字段一致性

验收：基线全绿；矩阵落入测试计划文件，不允许只存在于对话里。

### Phase 1：P0 修复

#### 1A. 主页上下文注入单通道化

改动：

1. 新增 `src/services/editorContextPolicy.ts`：
   - `EDITOR_CONTEXT_FULL_CONTENT_MAX_CHARS = 12000`
   - `shouldInjectFullEditorContent(length)`
   - `buildMainEditorContextPack({ label, content, selection })`
2. 主页长文档不再把全文写入 `chatCtx.editorContent`。
3. 超过阈值时注入结构化摘要：
   - 目标 label
   - 总长度
   - 当前选区
   - 首尾有限片段
   - 明确要求使用 `editor.document_map` / `editor.read_range` 读取焦点外内容
4. 删除“当前编辑目标”与“主创作上下文”的重复注入，保留一个统一入口。

不做：

- 不复制大纲 ContextPack 的全部结构，不在本轮重构主页上下文服务。
- 不改变工具面和权限。

验收：

- 单测：短文档全文注入；12000 边界；超长文档不注入全文且包含工具指引。
- E2E：主页 10 万字文档请求，system prompt 不含全文，`document_map` / `read_range` 可用，`editor.write` 仍能完成局部修改。

#### 1B. 主页选区恢复

改动：

1. 抽出统一快照构造函数，所有主页请求快照必须经过它。
2. 活动 tab 从真实编辑器 DOM 读取 `selectionStart / selectionEnd`。
3. 非活动 tab 选区保持 0，并在 snapshot 中标记 inactive。
4. 删除请求快照与 `getCurrentTarget()` 中的硬编码 0。

验收：

- 单测：有选区、无选区、选区在文档尾部、选区越界回退。
- E2E：主页选中一段文字后提问，trace 和 system prompt 均能看到真实选区；无选区时仍明确提示使用 `insert / replace_match / append`。

#### 1C. 主页多目标快照版本号修正

改动：

1. `getAllSnapshots()` 对每个 tab 调用 `createEditorTargetSnapshot()`。
2. 活动 tab 带真实选区；非活动 tab 选区为 0。
3. `contentVersion` 使用稳定内容版本，不再恒为 0。

验收：

- 单测：同一内容重复快照版本不变；内容变化后版本变化；不同 tab 版本隔离。
- E2E：跨 tab `workspace_summary` / `multi_get_state` / `global_search` 返回真实版本；API 写入活动 tab 后版本更新。

### Phase 2：P1 单源化

#### 2A. 读上限与常量单源

改动：

1. 把读上限解析迁入 `editorContextPolicy.ts`：
   - provider 窗口优先
   - fallback 到 `resolveModelContextWindow`
   - 最低 12000
   - 窗口比例 2%
2. 主页与大纲统一 import，删除两个本地函数。
3. `editorDocumentMap` 的 12000 常量改为引用单源常量。

验收：

- 单测覆盖 32k / 128k / 200k / 1M / 未知模型。
- `rg` 回头看：不存在第二份读上限实现。

#### 2B. 主页撤销单栈化

改动：

1. 以 `editorStore.tabUndoStacks / tabRedoStacks` 作为主页唯一撤销源。
2. EditorPanel 的快捷键撤销/重做改走 store。
3. API 批次 checkpoint 与聊天气泡回滚使用同一栈。
4. 保留 `useUndoRedo` 给非编辑器场景，或在本轮确认无其他使用者后删除该用途。

验收：

- 单测：手动编辑、API 写入、回滚、撤销、重做的栈行为一致。
- E2E：API 写入后分别用编辑器撤销和聊天气泡回滚，两者结果一致且不互相污染。

#### 2C. 大纲补齐替换

改动：

1. 大纲查找栏增加替换输入与“替换 / 全部替换”。
2. 走 `commitOutlineChange()`，自动进入大纲撤销栈。
3. 锁定态禁止替换。

验收：

- 单测：单次替换、全部替换、无匹配、锁定拒绝。
- E2E：大纲真实 UI 替换后可撤销/重做。

### Phase 3：等价性与观测收口

1. 新增双入口等价性 E2E：
   - 同一 5000 字文档在主页与大纲分别执行修改、插入、删除、移动、标点整理。
   - 同一 10 万字文档验证分页读取、长文档策略、局部写入。
   - 选区、版本号、trace 字段在两入口口径一致。
2. run trace / DiagLogger 同步：
   - 选区来源：real / none / inactive
   - 上下文注入模式：full / packed
   - 版本号来源：stable content version
3. 回头看扫描：
   - `rg` 确认无旧读上限函数、无硬编码选区 0、无恒 0 版本号、无第二份 12000 常量。
4. 更新 `_audit/SKILL_HANDOFF_API_DIRECT_WRITE_TOOLS.md` 与开发日志。

### Phase 4：最终门禁

全部通过后才允许进入封装流程：

1. `npm run test:services` 全绿。
2. `npm run type-check` 通过。
3. `npm run verify:production-wiring` 0 违规。
4. `node scripts/verify-api-direct-write-electron.mjs` 全场景通过。
5. 新增双入口等价性 E2E 通过。
6. 回头看连续 3 轮无新问题。
7. 日志与文档同步完成。

## 4. 风险反推

| 风险 | 反推 | 防线 |
| --- | --- | --- |
| P0-1 改动导致短文档上下文缺失 | 短文档仍走全文注入，只有超阈值切换 packed | 边界单测 + 5000 字 E2E |
| P0-1 改动破坏 SKILL 依赖的 editorContent | packed 模式保留 label/长度/选区/首尾片段与工具指引 | SKILL 场景回归 |
| P0-2 选区读取在组件未挂载时失败 | DOM 不存在时回退 none，不抛错 | 空编辑器 / 未挂载单测 |
| P0-3 版本号变化影响写入 | `editor.write` 当前不做版本硬拦截，行为不变 | 现有 13 场景压测回归 |
| P1-3 撤销单栈化引入 UI 回归 | 先补等价测试，再迁移实现 | 撤销/重做/回滚 E2E |
| 修一处坏一处 | Phase 0 先锁基线，每阶段只做一个主题 | 每阶段独立验证 + 回头看 |

## 5. 交付物

1. 修复代码与单测。
2. 双入口等价性 E2E 脚本与执行报告。
3. trace / DiagLogger 新字段覆盖证据。
4. 更新后的 SKILL 直写说明文档。
5. 开发日志与本方案状态更新。
