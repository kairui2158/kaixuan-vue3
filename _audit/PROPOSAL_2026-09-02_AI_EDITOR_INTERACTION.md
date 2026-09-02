# AI 与编辑器交互升级方案（P0-P8）

> 日期：2026-09-02  
> 状态：待审核，未执行  
> 适用范围：主页编辑器、大纲工作台、AI 对话气泡、统一 AI 服务层  
> 约束来源：`_audit/神意开发经验总结_v2.md` §1、§3、§5、§7、§8

## 结论

当前应用已经有三块可用基础：大纲工作台的 `outline_edit` 受限编辑指令、`DiffModal` 差异预览、主页聊天“插入/替换”手动入口。真正缺的是统一的“编辑意图协议”和主页编辑器的安全落地层。

本方案不是让 API 直接操作编辑器，而是建立四层闭环：

`AI 输出受限编辑指令 -> 应用解析并定位 -> 用户预览确认 -> 编辑器服务统一写入并进入撤销/保存链路`

## 社区调研结论

| 项目 | 可借鉴点 | 对本应用的启发 |
|---|---|---|
| Aider | `SEARCH/REPLACE` 编辑格式；不同模型适配不同格式；architect 与 editor 分离 | 用“搜索块 + 替换块”解决长文只改局部的问题，避免整章重写 |
| Cline | 编辑预览是只读虚拟文档；确认前不落盘；动画有预算上限 | 预览阶段绝不改 store；大文本渲染必须有性能预算 |
| Continue | 流式 diff；新旧行按算法逐行对齐；容忍缩进类小偏差 | API 流式输出时可以提前生成差异预览，但最终仍需完整解析校验 |
| Roo Code | `apply_diff` 工具协议；搜索块要求精确匹配；先读文件再改 | 先给 AI 当前选区和上下文；搜索块失配必须拒绝并提示，不猜 |

共同原则：模型只能提出编辑建议，不能直接获得编辑器控制权；每次写入必须有 diff、确认、撤销、失败降级四件套。

## 现状对账

| 能力 | 主页编辑器 | 大纲工作台 | 差距 |
|---|---|---|---|
| 手动插入 | 有，直接改 DOM | 有，走 `commitOutlineChange` | 主页应改为编辑器服务写入 |
| 手动替换 | 有选区替换，无选区替换整章需确认 | 有，按指令预览 | 交互可保留，底层统一 |
| AI 结构化编辑 | 无 | 有 `outline_edit` 六种操作 | 协议抽成通用层，主页接入 |
| Diff 预览 | App 级 `DiffModal` 已存在但未接入聊天 | 无专用预览弹窗，只有内容预览 | 统一为 EditReviewModal |
| 撤销 | `useUndoRedo`，单 tab 本地 | 自维护 undo/redo | 写入必须进入各自撤销栈 |
| 保存 | 按模式写项目字段 | `projectStore.setOutline` | 编辑服务不能绕过保存语义 |
| 选区传递 | `_pendingInlineSelection` + 上下文 `selectedText` | `getCurrentOutlineSelection` | 统一为 EditorTarget 快照 |
| 续生成 | 已接入 | 已接入 | 本方案不改动 |

## P0 边界与影响圈

目标：防止“改 A 激活 B”。

1. 列出 `EditorPanel.vue`、`ChatPanel.vue`、`ChatMessage.vue`、`OutlineWorkspace.vue`、`DiffModal.vue` 的引用关系。
2. 列出编辑写入涉及的字段：`editorStore.tabs/activeTabId`、`projectStore.outlineText/volumes/chapters`、`chatStore.currentContext`、continuation 快照。
3. 明确本方案不修改：去 AI 味流程、生成流水线业务逻辑、SKILL 编辑器、供应商协议、续生成状态机。
4. 冻结 UI 风格：使用 `tokens.css` 现有变量，不新增孤立配色。

## P1 通用编辑协议

新建 `src/services/editorEditProtocol.ts`。

```ts
type EditorEditOperation =
  | 'insert'
  | 'replace_selection'
  | 'replace_match'
  | 'append'
  | 'delete'
  | 'rewrite'

interface EditorEditCommand {
  type: 'editor_edit'
  version: 1
  operation: EditorEditOperation
  content?: string
  target?: string       // 精确匹配原文；replace_match/delete 必填
  position?: 'cursor' | 'selection_start' | 'selection_end' | 'end'
  reason?: string
}
```

规则：

1. `target` 必须是原文精确片段，禁止行号猜测；失配返回 `target_not_found`。
2. `insert` 只允许在光标或选区边界插入，不覆盖正文。
3. `replace_selection` 必须有当前选区快照，否则降级为预览插入建议。
4. `delete` 必须携带 `target`，禁止删除整章。
5. `rewrite` 只允许对选区或精确目标重写，必须走 diff。
6. 所有命令单次内容上限沿用 20000 字符，超限拒绝。
7. 协议解析失败时不伪装成功，返回 `invalid_command`，保留原始气泡内容。

## P2 编辑器目标与选区快照

新建 `src/services/editorTarget.ts`。

目标对象统一包含：workspace、tabId、chapterId、mode、内容版本、选区起止、选区文本、内容摘要。发送 AI 请求前生成快照；应用编辑时校验快照版本，版本不一致则提示“编辑器内容已变化，请重新生成”。

价值：解决用户切 tab、自动保存、手改正文导致的错位写入。

## P3 编辑执行服务

新建 `src/services/editorEditService.ts`，纯函数，不碰 DOM。

职责：

1. 接收 `EditorTarget` + `EditorEditCommand`。
2. 生成 `EditPlan`：原文、新文、操作类型、定位方式、失败原因。
3. 不直接写 Pinia，不直接写项目文件。
4. 支持 `apply` 与 `revert` 两个动作；应用前记录原内容，撤销一次完整回滚。

写入路径：

- 主页编辑器：`EditPlan -> editorStore.updateContent -> undoRedo.pushState`。
- 大纲工作台：`EditPlan -> projectStore.setOutline -> OutlineWorkspace 撤销栈`。
- 禁止继续在 `ChatPanel.insertToEditor()` 直接修改 `editor.value`。

## P4 确认 UI：EditReviewModal

复用/改造现有 `DiffModal`，新增操作语义：

1. 顶部显示：目标（章节/大纲）、操作类型、失败原因。
2. 中部双栏 diff：原文 / AI 修改；支持逐处接受、拒绝、全部接受、全部拒绝。
3. 底部：应用、取消；`rewrite` 和整章类操作默认红色确认。
4. 预览阶段不写 store、不写项目文件；关闭即丢弃。
5. 大文本保护：超过阈值时只渲染变更附近上下文，完整文本保存在内存中。

## P5 主页 AI 对话接入

1. `ChatMessage` 增加“应用编辑”入口；普通文本回复保留插入/替换。
2. `ChatPanel` 请求 prompt 注入编辑协议说明与当前选区上下文。
3. 返回后先解析 `editor_edit`：
   - 有效：生成 EditPlan 并打开 EditReviewModal。
   - 无效/普通文本：保持现有气泡与手动按钮。
4. 用户确认后调用 editorEditService，并更新 `_pendingInlineSelection`。
5. 写入成功后进入现有保存链路，标记 tab dirty；不自动覆盖已保存章节。

## P6 大纲工作台迁移

1. `outline_edit` 迁移到通用协议，保留旧字段兼容读取。
2. 已有六种操作映射到 P1 协议：`replace_section -> replace_match`。
3. 保留锁定保护：大纲锁定时只能预览，不能应用。
4. 保留大纲工作台现有撤销栈和保存语义。
5. 不改变聊天、续生成、技能链路行为。

## P7 诊断日志与错误路径

每条 AI 编辑请求记录：

`requestId、providerId、model、workspace、tabId、operation、targetLength、contentLength、result（parsed/rejected/applied）、failureReason、durationMs`

错误路径必须覆盖：

1. 模型返回非法 JSON。
2. `target_not_found`。
3. 选区丢失或 tab 切换。
4. 内容版本变化。
5. 大纲锁定。
6. 用户取消预览。
7. 编辑应用失败但预览成功。

禁止把失败写成成功气泡；诊断面板可按 `ai-service + editor-edit` 过滤。

## P8 验证与收尾

验证门：

1. 单测：协议解析、目标校验、EditPlan 生成、失败分类。
2. 构建与类型检查。
3. 源应用 Electron + CDP 真实操作：
   - 主页选中一段正文，让 AI 改写，确认 diff 后写入、撤销、保存。
   - 无选区插入。
   - 大纲工作台结构化编辑迁移。
   - 错误路径至少覆盖非法 JSON、目标失配、tab 切换、大纲锁定。
4. 持久化验证：应用后保存、重启恢复；取消预览不产生 dirty。
5. UI 回归：气泡按钮、编辑器工具栏、弹窗不溢出。

## 风险与对策

| 风险 | 对策 |
|---|---|
| 模型不稳定输出 JSON | 解析失败降级普通回复 + 手动按钮，不重试污染正文 |
| 长文本 diff 卡顿 | 复用现有 diff 工具，预览只渲染变更窗口 |
| 旧 outline_edit 兼容 | P6 保留旧格式读取与单测 |
| 直接 DOM 写入残留 | P3 完成后删除 ChatPanel 直写路径，三面引用扫描 |
| 误改已保存章节 | 只更新 tab 内容并标 dirty，用户保存才落项目字段 |
| 隐藏组件被激活 | P0 影响圈冻结，diff 逐行归入本需求 |

## 实施顺序

P0 影响圈 -> P1 协议 -> P2 目标快照 -> P3 执行服务 -> P4 预览 UI -> P5 主页接入 -> P6 大纲迁移 -> P7 日志 -> P8 验证收尾。

## 验收标准

1. AI 不能绕过预览确认直接修改编辑器。
2. 主页编辑器支持插入、替换选区、精确匹配替换、删除、选区重写。
3. 每次应用都能一次撤销回原状。
4. 目标失配、非法 JSON、tab 切换、锁定状态有明确提示且不写入。
5. 取消预览后编辑器、dirty 状态、保存内容完全不变。
6. 大纲工作台旧 `outline_edit` 配置无需用户迁移。
7. 诊断日志能还原每次编辑请求的解析、确认、应用结果。
