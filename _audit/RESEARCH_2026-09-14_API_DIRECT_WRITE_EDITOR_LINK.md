# API 直写与编辑器联动社区深度调研报告（2026-09-14）

## 0. 调研结论（先给判断）

这次调研覆盖 Roo Code、Cline、OpenHands、Continue、VS Code 官方 API、CodeMirror、Monaco 七个真实项目或官方实现。结论如下：

1. **直写编辑器本身是成熟模式**。Roo Code 有 `saveDirectly` 路径，Continue 的 CLI `writeFile` 直接写文件并返回 unified diff 给模型，说明"工具执行时写入 + 写入结果回传模型"是被社区验证过的架构。
2. **成熟系统从不让编辑器"悄悄变化"**。写入必然伴随可见形态：diff 视图流式呈现（Roo 默认路径）、聊天流 diff 卡片回看（OpenHands、Continue）、或直写但不打扰焦点（Roo 实验路径）。
3. **呈现形态的最佳答案是"流式呈现 + 智能跟随"**：旧内容遮罩、活动行高亮、只有活动行快滚出视口时才跟随滚动、大文件跳过动画直接呈现最终结果、结束后定位第一处变更并清除装饰。
4. **定位能力是编辑器一等公民 API**。Monaco 提供 13 个 `reveal*` 变体，核心区分 `InCenter` 与 `InCenterIfOutsideViewport`（防抖动）；CodeMirror 提供 `scrollIntoView(pos, {y: "center"})` 与活动行高亮。我们现有 `scrollTop = (linesBefore - 3) * 20/29` 写死行高的做法在成熟标准下不合格。
5. **我们的方向正确，但 V1 缺编辑器联动层**。V1 解决了"写入时机"（工具执行时写入），没有解决"写入哪里、怎么看见、怎么跟随"，这两项必须一起补，否则用户仍然不知道模型改了哪里。

## 1. 调研对象与证据

全部为真实源码/官方文档取证，无虚构项目。GitHub API 匿名额度耗尽后，CodeMirror 与 Monaco 通过浅克隆取证。

| 项目 | Stars | 证据文件 | 关键能力 |
| --- | ---: | --- | --- |
| Roo Code (`RooCodeInc/Roo-Code`) | 24,305 | `src/integrations/editor/DiffViewProvider.ts` | 真流式写入、遮罩、活动行、智能跟随、直接落盘 |
| Cline (`cline/cline`) | 67,935 | `apps/vscode/src/hosts/vscode/VscodeEditPreview.ts` 等 | 模拟流式动画、大文件降级、差异行防抖滚动 |
| VS Code (`microsoft/vscode`) | 192,461 | `src/vscode-dts/vscode.d.ts` | `revealRange`、装饰类型、选区/视口事件 |
| OpenHands (`All-Hands-AI/OpenHands`) | 87,757 | `src/components/features/chat/tool-visualizers/file-editor/file-editor.tsx` | 聊天流 diff 卡片、range 深链 |
| Continue (`continuedev/continue`) | 35,894 | `editFileTool` 与 CLI `writeFile` | 直写文件 + diff 作为 tool result 回传 |
| CodeMirror view (`codemirror/view`) | 7,818 | `src/docview.ts`、`src/editorview.ts` | 事务式 `scrollIntoView`、行块测量、活动行 |
| Monaco Editor (`microsoft/monaco-editor`) | 46,730 | 官方 playground samples | 13 个 `reveal*` 变体、整行/行内装饰 |

## 2. Roo Code：直写与流式呈现的完整参照

### 2.1 流式写入视图

`src/integrations/editor/DiffViewProvider.ts`:

- L111-115：`fadedOverlayController`（旧内容 0.4 遮罩）+ `activeLineController`（当前写入行高亮）+ 初始滚动到文档开头。
- L119-158 `update(accumulatedContent, isFinal)`：非 final 阶段丢弃最后一条不完整行；用 WorkspaceEdit 替换内容；更新活动行；解除已写入部分的遮罩；只有活动行快离开可视区时才调用 `scrollEditorToLine(endLine)`。
- L163-192 final：写入最终完整内容，清除全部 decoration，不再保持动画态。
- L569-577：`revealRange(line + 4, InCenter)`，给目标行下方留缓冲。
- L580-605：`scrollToFirstDiff()` 用 diff 库算第一处差异行，再居中揭示。
- L642+：`saveDirectly` 直接 `fs.writeFile`，`openFile=false` 时只在内存打开文档触发诊断，不抢用户焦点。

**对我们的直接启示**：流式呈现不是简单 append 文本，而是"写入区可见、未写入区遮罩、当前行高亮、智能跟随"四个状态共同工作。

### 2.2 直写与默认路径并存

`src/core/tools/ApplyDiffTool.ts` L175-190：两种模式分叉——直写走 `saveDirectly`；默认走 diff 视图 `open()` → `update(content, true)` → `scrollToFirstDiff()` → 用户审批 → 拒绝 `revertChanges()`。

`src/core/auto-approval/AutoApprovalHandler.ts`：自动审批有请求次数与成本上限，超限仍回到人工审批。这说明成熟系统即便直写，也保留限流和回退边界。

## 3. Cline：呈现节奏与大文件降级

`apps/vscode/src/hosts/vscode/VscodeEditPreview.ts`:

- L13-17：动画起始 400ms、结束 250ms；**超过 3000 行跳过动画，直接渲染最终 diff 并定位到第一处变更**。
- L67-70：SDK 只能给完整工具输入，右侧虚拟文档播放的是"模拟流式动画"，刻意用演示动画表达写入位置，而不是真实生成进度。
- L107-167：旧内容遮罩 + activeLine 扫过；L148-153：未变行（zip）用 `InCenter` 追逐滚动，变更行（typing）用 `InCenterIfOutsideViewport` 防抖。
- 动画结束后 250ms 再 reveal 到 `firstChangedLine`。

`apps/vscode/src/integrations/editor/EditPreview.ts`：帧参数为 `ZIP_FRAME_MS=16`、`ZIP_LINES_PER_FRAME=8`、`TYPE_FRAME_MS=45`、`MAX_ANIMATION_FRAMES=200`、`MAX_ANIMATED_LINES=3000`；每一帧都是"新内容前缀 + 原内容后缀"。

**对我们的直接启示**：用户问"滚动字还是一次性呈现"，社区答案是分层的：常规文本用流式/扫过呈现；超过阈值直接呈现最终态并定位首处变更。我们的长篇大纲正需要这个分层。

## 4. VS Code / Monaco / CodeMirror：定位 API 标准

### 4.1 VS Code 官方 API

`src/vscode-dts/vscode.d.ts`：

- L756 `TextEditorRevealType`：`Default / In / InCenter / InCenterIfOutsideViewport / AtTop`。
- L1360 `TextEditor.revealRange(range, revealType)`。
- L11107/11112：选区变化与可视区变化事件，可用来判断用户是否正在手动滚动。
- L11275 `createTextEditorDecorationType`。

### 4.2 Monaco 官方示例

`interacting-with-the-editor/revealing-a-position/sample.js` L28-41：官方推荐 API 族包括 `revealLine / revealLineInCenter / revealLineInCenterIfOutsideViewport / revealPosition / revealPositionInCenter / revealPositionInCenterIfOutsideViewport / revealRange / revealRangeInCenter / revealRangeInCenterIfOutsideViewport` 等变体。

`line-and-inline-decorations/sample.js` L18-36：`createDecorationsCollection([{range, options: {isWholeLine: true, linesDecorationsClassName}}])` 支持整行与行内装饰。

### 4.3 CodeMirror

浅克隆取证（`D:/codex/_research_cm_view`，调研后清理）：

- `src/editorview.ts` L892+：`EditorView.scrollIntoView(pos | SelectionRange, {y: "nearest" | "start" | "end" | "center", x})`。
- `src/docview.ts` L514-560：`coordsAt` 计算目标矩形，`scrollRectIntoView` 精确滚动，移动端降级 `block:"nearest"`。
- `src/active-line.ts` L17-28：`view.lineBlockAt(r.head)` 获取活动行并 decoration 标记。
- `src/cursor.ts` L49-65：行边界定位。

**textarea 等价能力清单**：CodeMirror 的行块测量、居中滚动、活动行高亮、selection 更新，正是我们用镜像 div + overlay 需要等价实现的四件事。

## 5. OpenHands 与 Continue：直写后的可回看形态

OpenHands（`src/components/features/chat/tool-visualizers/file-editor/file-editor.tsx`）：聊天流内工具调用以 diff 卡片呈现，路径 chip 带 range，点击深链打开文件对应行号区间。用户不需要盯编辑器，也能从对话里回看改动。

Continue：`editFileTool` 要求模型先读再改，并走权限策略；CLI `writeFile` 直接写文件，同时返回 unified diff 作为 tool result 给模型。模型在下一轮能看到自己实际写入的 diff，形成闭环。

**对我们的直接启示**：直写后消息气泡必须给出写入摘要与定位入口，运行记录必须完整记录工具调用，不能只在编辑器里生效、在对话里不可见。

## 6. 横向对比

| 维度 | Roo Code | Cline | OpenHands | Continue | 我们现状 |
| --- | --- | --- | --- | --- | --- |
| 直写路径 | 有，`saveDirectly` | 有 | 有 | CLI `writeFile` | 无，只提案 |
| 默认呈现 | diff 视图流式 | 编辑预览动画 | 聊天流 diff 卡片 | diff 回传 | 顶栏 3px 闪条 |
| 流式策略 | 真流式 + 遮罩 | 模拟动画 + 帧参数 | 非流式卡片 | 非流式 diff | 无 |
| 智能跟随 | 快出视口才滚 | zip/typing 分策略 | 点击深链 | 无自动滚动 | 无 |
| 大文件 | - | 3000 行跳过动画 | range 分页 | - | 无 |
| 定位 API | revealRange + firstDiff | 13 个 reveal 变体 | range 深链 | 先读再改 | 写死行高 scrollTop |
| 回滚 | revertChanges | 审批拒绝 | diff 卡片 | diff 回看 | undo/批次回滚已有 |

## 7. 对我们应用的判断

我们已具备底座：工具循环、run trace、hash 校验、批次回滚、undo checkpoint 都在。真正缺的是三块：

1. **写入工具是假的**：`editor.propose_edits` 固定返回 `pending_user_confirmation`（`src/services/editorTools.ts:291`），且 discuss 意图下写入工具不注册（`src/services/dialogueFoundation.ts:57-63`）。
2. **编辑器定位是原始的**：主页与大纲都靠写死行高计算 scrollTop（`src/components/editor/EditorPanel.vue:514-516`、`src/components/common/OutlineWorkspace.vue:1179-1181`），没有镜像测量、没有高亮、没有滚动策略。
3. **写入可见性是弱的**：`tool-activity` 只有 1.5 秒顶栏闪条（`src/components/editor/EditorPanel.vue:483-499`），用户看不到写入段落和写入过程。

因此 V2 必须同时做三件事：真写入工具、真定位/呈现层、写入后可回看。只做写入不做联动，等于把"待确认区不可用"换成"写进去了但用户看不见"。

## 8. 临时取证目录清理

调研过程中克隆的两个临时目录已清理：

```powershell
Remove-Item -LiteralPath 'D:/codex/_research_cm_view' -Recurse -Force
Remove-Item -LiteralPath 'D:/codex/_research_monaco' -Recurse -Force
```

验收：两个目录均不存在；业务目录与业务代码未被调研过程修改。
