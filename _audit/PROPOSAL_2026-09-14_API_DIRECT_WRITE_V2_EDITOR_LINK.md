# API 直写编辑器 V2 方案：直写 + 编辑器联动（2026-09-14）

## 0. 结论

V2 = V1 直写核心 + 社区验证的编辑器联动层。目标只有一个：用户对 API 说"这段设定应该写到哪"，API 必须能把编辑器滚动到正确位置、点亮目标区域；用户说"写进去"，API 通过 `editor.write` 立即写入，编辑器以流式呈现 + 智能跟随的方式让用户看得见，写入后一键可回滚。

本方案不引入新依赖、不换编辑器内核、不重写现有链路。核心改造点：

1. 新增 `editor.write` 工具：工具调用执行时直写编辑器，结果回传模型（V1 已定义，本方案保留并细化）。
2. 新增 `editor.reveal` 工具：复用 locate 引擎定位目标，执行光标置入、滚动居中、临时高亮。
3. 编辑器联动层：textarea 镜像 div 测量行位置，替换写死行高；写入呈现采用"遮罩 + 活动行高亮 + 智能跟随滚动"；大文档降级为"直接写入 + 定位首处变更"。
4. 保留并强化安全核心：版本 hash 校验、定位唯一性、锁定校验、每请求 1 次写入、批次回滚、流水线永远禁写。
5. 兼容原生工具与 JSON 直写协议两种供应商形态。

## 1. 为什么 V1 不够

V1 解决了写入时机，但调研显示成熟系统至少要满足四件事，V1 未覆盖：

1. **定位**：用户问"这段设定应该在第几段/哪个节点写入"，模型需要能主动滚动编辑器，展示候选位置。Roo/Cline/Monaco 都把 reveal 作为编辑器一等公民能力。
2. **呈现**：写入不能悄悄发生。Roo 用遮罩 + 活动行 + 智能跟随，Cline 用动画 + 大文件降级 + 首变更定位。我们的 1.5 秒顶栏闪条远低于这个标准。
3. **可回看**：OpenHands/Continue 在聊天流里展示 diff 卡片，用户不盯编辑器也能回看。直写模式必须在气泡中给摘要与定位入口。
4. **测量精度**：现有 `scrollTop = (linesBefore - 3) * 20/29` 在换行、缩放、中文长行场景必然偏移，必须改为镜像测量。

## 2. 工具协议

### 2.1 `editor.reveal`（新增）

```json
{
  "name": "editor.reveal",
  "description": "定位并高亮编辑器中的目标位置，不修改内容。用于回答'应该写在哪里'、展示候选写入点、写入前确认位置。",
  "policy": "read",
  "input": {
    "target": {
      "type": "fragment | paragraphIndex | anchor | range",
      "fragment": "原文唯一片段",
      "paragraphIndex": 0,
      "anchor": { "volumeTitle": "...", "chapterTitle": "...", "sectionTitle": "..." },
      "range": { "start": 0, "end": 0 }
    },
    "focus": "auto | start | end | center",
    "highlightDuration": 3000,
    "reason": "定位说明"
  }
}
```

执行语义：

1. 复用 `locate` 引擎：fragment 必须唯一命中，多命中返回 `ambiguous_target`；anchor 走结构解析降级路径（结构异常时降级段落索引并标记 `degraded`）。
2. 定位成功后通过注入的 `revealTarget` 回调交给编辑器层执行。
3. 返回结构化结果，包含 offset、line、column、length、结构路径、是否 degraded，供模型继续推理。

成功返回：

```json
{
  "ok": true,
  "data": {
    "status": "revealed",
    "offset": 12340,
    "line": 156,
    "length": 180,
    "structurePath": ["第二卷", "第 12 章", "冲突升级"],
    "degraded": false
  }
}
```

### 2.2 `editor.write`（V1 细化）

```json
{
  "name": "editor.write",
  "description": "立即写入当前编辑器。提交 1-10 条受限编辑命令，先执行定位唯一性、版本 hash、锁定与结构完整性校验，通过后立即写入并返回结果；失败返回结构化错误供修正重试。",
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
    "reveal": { "mode": "stream | instant", "firstChange": true },
    "reason": "整批写入说明"
}
```

执行语义：

1. 快照校验：空编辑器只允许 `insert/append`；跨目标禁止。
2. 生成批次计划：复用 `planEditorEditBatch()`，定位多命中返回 `ambiguous_target`，版本变化返回 `version_changed`，锁定返回 `locked`，大纲 critical 完整性失败返回 `integrity_failed`。
3. 校验通过后调用组件注入的 `applyWrite(next, meta)`；服务层不直接 import store，保持可单测。
4. `applyWrite` 内部按 `reveal.mode` 走流式呈现或直接呈现，并记录批次。
5. 返回结构化 tool result；失败绝不调用 `applyWrite`。

### 2.3 工具面组合

| 模式 | 只读工具 | `editor.reveal` | `editor.write` | `editor.propose_edits` |
| --- | --- | --- | --- | --- |
| direct（默认） | 全部暴露 | 全部意图暴露 | 全部意图暴露，每请求 1 次 | 不暴露 |
| proposal（兼容开关） | 全部暴露 | 全部意图暴露 | 不暴露 | edit/generate 意图暴露 |
| pipeline | 只读 | 不暴露 | 不暴露 | 不暴露 |

`editor.reveal` 定为 read 权限的原因：它不修改内容，是讨论模式的定位交互工具。这样即使 discuss 意图，用户问"写到哪"也能得到可视化答案。

## 3. 编辑器联动层

### 3.1 镜像测量层

现状：主页与大纲 textarea 的定位都靠写死行高（20/29）计算 scrollTop，缩放/换行场景必偏。

改造：新增 `src/services/editorViewport.ts`：

```ts
export interface EditorViewportTarget {
  start: number
  end: number
  focus: 'auto' | 'start' | 'end' | 'center'
  highlightMs?: number
}

export interface EditorViewport {
  revealTarget(target: EditorViewportTarget): Promise<void>
  followWriteProgress(start: number, end: number): void
  stopFollow(): void
  dispose(): void
}

export function createTextareaViewport(options: {
  textarea: HTMLTextAreaElement
  mirror: HTMLDivElement
  highlightLayer?: HTMLDivElement
}): EditorViewport
```

实现要点：

1. 镜像 div 与 textarea 同字体、字号、行高、padding、border、white-space（`pre-wrap`）、word-break、box-sizing、滚动宽度。
2. `measureOffset(offset)`：截取 `value.slice(0, offset)` 填入镜像，读取 range 或末子节点位置；产出 line、top、left、height。
3. `scrollIntoView(rect, strategy)`：映射社区策略——`center` 对应 Monaco `InCenter`，`nearest` 对应 `InCenterIfOutsideViewport`，另支持 `start/end`。
4. 高亮层绝对定位在 textarea 上方，pointer-events: none；支持临时高亮与活动行两种样式。
5. 用户手动滚动、键盘编辑、选区变化时暂停智能跟随；停留 2500ms 后可恢复（社区帧参数参照）。

### 3.2 呈现形态

直写呈现按文档规模分层（Cline 3000 行阈值思路）：

| 条件 | 呈现方式 |
| --- | --- |
| 文档 <= 3000 行且写入批次 <= 60000 字符 | 流式呈现 |
| 文档 > 3000 行或批次超大 | 直接写入 + 定位首处变更 |

流式呈现流程（Roo 模式）：

1. 写入开始：未写入区域遮罩（opacity 0.4），当前写入行高亮，不抢输入焦点。
2. 帧级更新：每 45-50ms 一帧（经验规则 84：delta + 50-100ms 节流），每帧只推进安全行，未完成行不呈现。
3. 智能跟随：只有活动行快离开可视区时才滚动；未变内容用 center 追逐，正在输入内容用 nearest 防抖。
4. 写入结束：移除遮罩与活动行，定位到首处变更（InCenter + 底部缓冲），高亮停留 3 秒后清除。

直接呈现流程：

1. `applyWrite` 一次性写入最终内容。
2. 计算首处变更行，居中 reveal。
3. 首处变更整行高亮 3 秒；不播放动画，避免长文档卡顿（经验规则 84 的 O(n²) 教训）。

### 3.3 光标与焦点

1. 定位/写入后 `setSelectionRange(start, end)`；reveal 讨论模式不 focus，保持用户输入权。
2. 流式期间不 `focus()`，避免抢焦点；结束时可 focus 到目标起点。
3. 大纲锁定态（`outlineLocked`）允许 reveal 与高亮，禁止 write。

### 3.4 与现有组件的关系

- `EditorPanel.vue`：新增 mirror/highlight DOM；`handleDiffLocate` 改走 `viewport.revealTarget`；`tool-activity` 增加写入进度事件（状态从顶栏闪条升级为遮罩/活动行反馈）。
- `OutlineWorkspace.vue`：同样接入 viewport；锁定态只读 reveal；`commitOutlineChange` 仍是唯一写入口。
- `DiffModal` 的 `diff-locate` 事件保持兼容，内部改走 viewport。
- `ChatPanel.vue`：`editor.write` 的气泡显示"已写入编辑器 · N 条修改 · 可回滚 · 查看位置"，点击"查看位置"调用 reveal firstChange。

### 3.5 运行记录

每次 reveal/write 完整记录：

```json
{
  "name": "editor.write",
  "input": {
    "commands": [ ... ],
    "reveal": { "mode": "stream", "firstChange": true }
  },
  "result": {
    "ok": true,
    "data": { "status": "written", "batchId": "ai-write-...", "commandCount": 3, "writtenLength": 1520, "firstChange": { "start": 12340, "line": 156 }, "rollbackAvailable": true }
  },
  "status": "success",
  "duration": 820
}
```

呈现层事件同步进 run trace：`editor-presentation-start`、`editor-presentation-frame`（合并计数，不逐帧刷 trace）、`editor-presentation-finished`。失败路径记录 `editor-presentation-failed` 与降级原因。

## 4. 安全模型

1. **版本校验**：写入前比对快照 contentVersion/hash，失配返回 `version_changed`，原文不变。
2. **唯一性**：replace_match/delete/rewrite 的 target 必须唯一；多命中 `ambiguous_target`，模型可先用 `editor.search/locate/reveal` 扩展片段后重试。
3. **锁定**：大纲锁定、只读输入框、不存在页签均拒绝。
4. **完整性**：大纲写入前后执行 `validateOutlineIntegrity()`，critical 拒绝。
5. **次数**：每请求 1 次 `editor.write`，第二次返回 `write_limit_reached`，防止模型循环叠改。
6. **回滚**：写入成功创建 `EditorBatchRecord(applied)`，气泡一键回滚；用户后续手动改过内容则拒绝回滚，提示使用编辑器撤销。
7. **流水线禁写**：pipeline workspace 工具面永远为空写入项，现校验保留并加契约测试。
8. **焦点保护**：呈现层不抢输入焦点；`saveDirectly` 式不干扰模式作为后续可选实验，不进入本期默认行为。

## 5. 供应商兼容

不支持的供应商走 JSON 直写协议：

```json
{ "tool": "editor.write", "commands": [ ... ], "reveal": { "mode": "stream", "firstChange": true } }
```

1. 系统提示注入 `EDITOR_WRITE_PROTOCOL`，要求输出受限 JSON。
2. 响应结束后统一解析并调用同一执行器；解析/校验失败不写编辑器，普通消息报错。
3. 运行记录标注 `compatibility_write=true`，避免 SKILL 调试方误判为原生工具调用。
4. 兼容模式的 reveal 需求降级为返回文本位置说明；编辑器端仍执行定位，但不作为模型可用工具循环内能力。

## 6. 任务清单

### 6.0 防回归硬门禁（先于所有任务执行）

本节是针对历史“修一处坏一处”教训的强制门禁。任何任务未过本节，不得进入下一任务；任何任务只跑定向测试不跑阶段全量回归，不得宣称完成。

#### 6.0.1 改动前基线冻结

每个 Phase 开始前执行并保存输出：

```powershell
npm run test:services *> _audit/baseline-services-phase{n}.txt
npm run type-check *> _audit/baseline-typecheck-phase{n}.txt
npm run build:vue *> _audit/baseline-build-phase{n}.txt
```

要求：

- 基线必须先跑通；如果当前工作树本身已有失败，先记录失败清单，禁止把既有失败归咎于本次改动。
- 每个任务的实际 diff 必须逐一列出，禁止“顺手重构”“顺手格式化”造成无关噪声。
- 修改前必须复读最新 DEV_LOG 与经验文件相关规则，本次任务涉及规则 26/67/69/76/84/57。

#### 6.0.2 触点矩阵（改前登记，改后对账）

| 触点 | 改前确认 | 改后验证 |
| --- | --- | --- |
| editorTools | 现有 propose_edits 契约 | 旧 proposal 模式测试全部保持通过 |
| dialogueFoundation | 三入口工具面契约 | 主页/大纲/流水线横向契约测试 |
| aiService | 6 轮工具循环与限流 | 无工具供应商、异常流、限流路径不回归 |
| EditorPanel | diff-locate/撤销/外改事件 | 旧 Diff 定位、撤销、批次回滚实测 |
| OutlineWorkspace | 锁定态与 commitOutlineChange | 锁定禁写、结构解析、大纲撤销实测 |
| ChatPanel | 气泡回滚与批次台账 | 旧批次、回滚、消息渲染不回归 |
| runTrace | 导出包还原执行 | write/reveal/presentation 全量落 trace |
| 生成流水线 | 禁写契约 | 流水线工具面为空，生成链路实测 |

改后未逐项对账触点矩阵，不得勾选任务完成。

#### 6.0.3 回头看检查

每个 Phase 收尾必须执行：

1. 全量 `npm run test:services`，不是只跑本次新增测试。
2. 全量 `npm run type-check`。
3. 全量 `npm run build:vue`。
4. 手工回归四条历史高危链路：Diff 定位、编辑器撤销、大纲锁定、批次回滚。
5. 用真实 Electron 启动做三入口操作验证：主页、大纲、流水线。
6. 导出本次运行记录，检查 write/reveal/presentation/失败路径是否完整。
7. 复查本阶段 diff，确认没有未声明文件、临时脚本、调试输出。
8. 更新 DEV_LOG，写明根因、改动、验证输出、遗留项。

#### 6.0.4 闭环证据标准

“完成”必须同时提供以下证据，缺一即视为未完成：

1. 基线输出文件与本阶段全量验证输出文件（before/after）。
2. 关键文件 diff 摘要，列出每个修改点的目的。
3. 测试结果：新增/修改用例数量、失败数必须为 0（既有失败需单独列出并证明与本次无关）。
4. Electron 真实操作记录：场景、操作步骤、观察结果。
5. 运行记录导出包：包含 write/reveal 的 input/result/status/duration，以及 presentation 事件。
6. 回滚验证：至少一次成功回滚后内容 hash 与写入前一致；一次用户已修改后拒绝回滚。
7. 流水线验证：工具面不含写入工具，至少跑一次真实生成确认未受影响。
8. 截图或录屏证据：reveal 高亮、流式呈现、大文档直接呈现、失败气泡四种形态。

#### 6.0.5 明确禁止

- 禁止把“编译通过”当闭环。
- 禁止只测新功能不测旧功能。
- 禁止跳过 Electron 真实 UI 操作。
- 禁止在未更新 DEV_LOG 与经验文件前收尾。
- 禁止删除或改写既有测试来让结果通过。
- 禁止把失败路径留成“后续再测”。

### Phase 1：协议与服务层

#### Task 1：`editor.write` 执行器

改动：

- `src/services/editorTools.ts`
- `src/services/editorTools.spec.ts`

验收：

- [ ] direct 模式暴露 `editor.write`、不暴露 `editor.propose_edits`；
- [ ] 校验通过调用 `applyWrite` 并返回 `written`；
- [ ] 校验失败返回结构化错误且绝不调用 `applyWrite`；
- [ ] 空编辑器允许 `insert/append`；
- [ ] 一次最多 10 条命令，超限 `batch_too_large`。

验证：

```powershell
npm run test:services -- editorTools
npm run type-check
```

#### Task 2：`editor.reveal` 工具

改动：

- `src/services/editorTools.ts`
- `src/services/editorTools.spec.ts`

验收：

- [ ] fragment 唯一命中返回结构化位置；
- [ ] 多命中返回 `ambiguous_target`；
- [ ] anchor ��结构解析，结构异常降级段落索引并标记 `degraded`；
- [ ] read 工具，不修改内容。

验证：

```powershell
npm run test:services -- editorTools
```

#### Task 3：权限矩阵与循环控制

改动：

- `src/services/dialogueFoundation.ts`
- `src/services/dialogueFoundation.spec.ts`
- `src/services/dialogueFoundationContract.spec.ts`
- `src/services/aiService.ts`
- `src/services/aiService.spec.ts`

验收：

- [x] direct 模式主页/大纲全意图暴露 write 与 reveal；
- [x] proposal 模式行为保持现状；
- [x] pipeline 任何模式禁写；
- [x] 每请求 1 次 write，超限 `write_limit_reached`；
- [ ] 兼容模式 JSON 协议可用。

验证：

```powershell
npm run test:services -- dialogueFoundation
npm run test:services -- aiService
npm run type-check
```

### Phase 2：编辑器联动层

#### Task 4：viewport 服务

改动：

- `src/services/editorViewport.ts`（新增）
- `src/services/editorViewport.spec.ts`（新增）

验收：

- [ ] 镜像测量换行/中文长行/软换行正确；
- [ ] `center/nearest/start/end` 四种滚动策略；
- [ ] 高亮层临时高亮与活动行两种样式；
- [ ] 手动滚动暂停智能跟随。

验证：

```powershell
npm run test:services -- editorViewport
npm run type-check
```

#### Task 5：主页编辑器接入

改动：

- `src/components/editor/EditorPanel.vue`
- `src/components/chat/ChatPanel.vue`

验收：

- [ ] `handleDiffLocate` 改走 viewport，写死 20px 行高删除；
- [ ] reveal/write 的定位与高亮可用；
- [ ] 流式呈现遮罩 + 活动行 + 智能跟随；
- [ ] 气泡提供"查看位置"入口。

验证：

```powershell
npm run type-check
npm run build:vue
```

#### Task 6：大纲工作台接入

改动：

- `src/components/common/OutlineWorkspace.vue`

验收：

- [ ] 写死 29px 行高删除；
- [ ] 锁定态 reveal 可用、write 拒绝；
- [ ] `commitOutlineChange` 仍是唯一写入口；
- [ ] 大纲结构锚点定位可用。

验证：

```powershell
npm run type-check
npm run build:vue
```

### Phase 3：体验与收尾

#### Task 7：兼容模式与设置

验收：

- [ ] 不支持原生工具供应商可 JSON 直写；
- [ ] 设置提供 direct/proposal 切换，默认 direct；
- [ ] 兼容模式 UI 明示定位可靠性较低。

验证：

```powershell
npm run test:services
```

#### Task 8：运行记录深度化

验收：

- [ ] reveal/write 完整记录 input/result/status/duration；
- [ ] 呈现层事件合并记录，无逐帧刷 trace；
- [ ] 兼容模式标注 `compatibility_write`；
- [ ] 失败路径含 `editor-presentation-failed` 与降级原因。

验证：

```powershell
npm run test:services
```

#### Task 9：E2E 与真实操作验证

验收矩阵：

| 场景 | 期望 |
| --- | --- |
| 空编辑器 + insert | 写入成功，首处变更居中高亮 |
| 唯一目标 replace_match | 写入成功，回滚后原文一致 |
| 多命中 target | `ambiguous_target`，原文不变 |
| 用户已改内容后回滚 | 拒绝回滚并提示撤销栈 |
| 大纲锁定 + write | 拒绝，reveal 可用 |
| 大纲锁定 + reveal | 定位高亮成功 |
| discuss 意图问"写在哪里" | reveal 高亮，不写入 |
| >3000 行文档写入 | 直接呈现 + 首处变更定位 |
| 流式写入滚动跟随 | 快出视口才滚动，用户滚动暂停跟随 |
| pipeline 工具面 | 无写入工具 |
| 兼容供应商 | JSON 直写成功，trace 标注 |
| 运行记录导出 | 还原完整 write/reveal 过程 |

验证：

```powershell
npm run test:services
npm run type-check
npm run build:vue
```

外加 Electron 真实 UI 操作验证（用户场景逐条手测）。

闭环要求：本任务不是“跑一遍命令”，必须产出可复查的证据包：

- `_audit/verification-api-direct-write-v2/` 目录；
- `before-services.txt` / `after-services.txt`；
- `before-typecheck.txt` / `after-typecheck.txt`；
- `before-build.txt` / `after-build.txt`；
- `electron-manual-checks.md`，逐条记录 12 个 E2E 场景的操作与观察结果；
- `run-trace-export.json`，证明 write/reveal/presentation 全量落记录；
- `regression-checks.md`，记录 Diff 定位、编辑器撤销、大纲锁定、批次回滚、流水线生成五条旧链路验证结果；
- `screenshots/`，保存 reveal、流式呈现、大文档直接呈现、失败提示四类截图。

任何一项缺失，本任务不得勾选完成。

#### Task 10：经验与日志修订

改动：

- `_audit/神意开发经验总结_v5.md` 规则 26、69：
  - 旧：AI 写入永远是提案 + 用户确认，不得直写。
  - 新：AI 写入必须走 `editor.write` 统一执行器 + hash 校验 + 定位唯一性 + 批次回滚；禁止旁路；pipeline 永远禁写。
- 新增规则：编辑器定位必须走 viewport 镜像测量与 reveal 策略，禁止写死行高。
- 新增 `DEV_LOG_2026-09-14-api-direct-write-v2.md` 并更新主索引。

## 7. 影响范围

| 区域 | 影响 |
| --- | --- |
| 主页编辑器 | reveal/write/viewport/流式呈现 |
| 大纲工作台 | reveal/write/viewport/锁定语义 |
| ChatPanel | 气泡摘要、查看位置、回滚 |
| dialogueFoundation | direct/proposal 权限矩阵 |
| aiService | write 工具循环、JSON 兼容协议 |
| runTrace | reveal/write/presentation 事件 |
| 生成流水线 | 仅新增契约断言：禁写不回归 |
| 降 AI / 硬规则 | 无改动 |

## 8. 风险与对策

| 风险 | 对策 |
| --- | --- |
| textarea 镜像测量和真实渲染不一致 | 同步字体/行高/padding/white-space/word-break；单测覆盖中英文换行 |
| 流式呈现引起新卡顿 | 严格 delta + 50ms 节流；>3000 行直接呈现（规则 84） |
| 用户误以为写入失败 | 气泡即时反馈 + 查看位置 + 运行记录 |
| 模型循环改写叠改 | 每请求 1 次 write；第二次 `write_limit_reached` |
| 大纲锁定态被绕过 | 工具面锁定校验 + `commitOutlineChange` 双重校验 |
| 兼容供应商 JSON 解析失败 | 不写编辑器，错误明示，trace 保留原始输出 |

## 9. 本方案审核通过后的执行顺序

1. 复读最新 DEV_LOG 与经验文件相关规则（规则 26/69/76/84/57）。
2. 执行 6.0.1 基线冻结：全量服务测试、type-check、build，保存 before 输出；若基线失败，先记录失败清单再开工。
3. Phase 1 → Phase 2 → Phase 3 顺序执行；每任务完成先跑定向验证，再对照 6.0.2 触点矩阵，未对账不勾选。
4. 每 Phase 收尾执行 6.0.3 回头看：全量测试、type-check、build、四条历史高危链路手工回归、Electron 三入口实测、运行记录导出复查、diff 复查、DEV_LOG 更新。
5. Task 9 按 6.0.4 产出证据包，八类证据缺一不可；证据不落盘不得宣称闭环。
6. 更新经验文件规则 26/69，新增 viewport 定位规则；更新 DEV_LOG 与主索引。
7. 清理临时文件（含上次调研遗留的 `D:/codex/_research_cm_view`、`D:/codex/_research_monaco`，若执行环境仍拦截删除则如实列入遗留清单）。
8. 版本升级与封装（版本号与封装时间以执行时最新状态为准）。
