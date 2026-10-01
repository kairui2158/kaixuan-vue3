# 2026-09-23 API 直写长文档成熟化修复方案 V3

## 1. 目标

把 2026-09-23 运行记录暴露的直写失败从单点补丁升级为系统修复，并用一场用户可见的真实 Electron 实测闭环：

1. 消除大纲、主页 direct 对话入口把 `direct-tool-intensive` 从 12 轮压回 6 轮的假上限。
2. 消除收敛轮把供应商伪工具调用文本当正文成功的假闭环。
3. 让 5000 字级真实文档的改句、增句、删句、重排、整篇整理全部由 API 通过 `editor.write` 真实写入编辑器。
4. 让 run trace 与 DiagLogger 完整记录权限、工具调用、写入结果与失败分支，供 SKILL 制作方判断。

不设 token 预算；真实实测未通过前不封装、不升版本。

## 2. 根因与责任层

### 2.1 权限层没有坏

本次 trace 中：

- `actualToolSurface` 包含 `editor.write`。
- system prompt 明确声明写入权限。
- 模型 reasoning 明确理解写权限，并计划先读后写。

因此“模型一直说没权限”不是本轮事实。真正问题是模型在读完前到达工具轮上限。

### 2.2 P0-A：入口假上限

`src/services/toolLoopPolicy.ts` 已规定 `direct-tool-intensive = 12` 轮，但生产入口仍显式传 `maxToolIterations: 6`：

- `src/components/common/OutlineWorkspace.vue:1504`
- `src/components/common/OutlineWorkspace.vue:2903`
- `src/components/common/OutlineWorkspace.vue:3169`
- `src/components/chat/ChatPanel.vue:1128`
- `src/components/chat/ChatPanel.vue:2289`

结果是场景声明为 intensive，实际上限仍被压回 6，违反 M39 策略单源原则。

### 2.3 P0-B：收敛轮假成功

`src/services/aiService.ts:1849` 后的收敛逻辑只判断“文本非空即成功”。本次供应商在无工具模式下输出了 39 字节的伪工具调用文本，`completion_tokens` 只有 7，却被应用标记为 `finishReason: tool_converged`。

同时收敛请求存在语义冲突：

- 历史 system 仍保留“需要修改内容时必须调用写入工具”。
- 收敛 system 又要求“停止调用任何工具”。
- 请求里未携带工具。

三者叠加会诱导部分供应商输出伪工具调用文本。

### 2.4 P1：长文档任务语义缺失

74,097 字大纲不可能靠 6 轮顺序读取完成。成熟系统必须分层：

- 句级修改：读取目标附近局部内容，然后单批写入。
- 章节级整理：结构地图、搜索、局部读取，多批写入。
- 整篇重排：进入 EditTask 分批任务，不允许单次 tool loop 硬吃全文。

本次 5000 字实测属于中等文档完整链路验收，既覆盖真实写入，也验证 12 轮内完成读、写、整理。

### 2.5 P2：chat run 观察口径

trace 顶层 `running` 与 turn `success` 并存不是收尾断点：

- `sessionKind = chat` 时，run 设计为跨多轮保持 running，直到会话封存。
- `finishOutlineRun()` 只收 turn，不收 run。

但导出给 SKILL 层时容易误读。需要补 `session-active` 明示事件或导出说明，避免 SKILL 制作方把 chat run 误判为卡死。

## 3. 修复设计

### 3.1 P0-A：删除入口覆盖上限

改动：

- OutlineWorkspace 三处删除 `maxToolIterations: 6`，保留 `scenario: 'direct-tool-intensive'`。
- ChatPanel 两处同样删除覆盖值。
- 单测锁定：`direct-tool-intensive` 未显式请求更低值时，实际轮次必须等于 12。

理由：

- 单源策略允许调用方请求更低上限用于特殊场景，但生产 direct 对话不应默认降级。
- `toolRunSupervisor` 仍有 150 秒无进展、300 秒总上限，安全性不靠轮次硬压。

### 3.2 P0-B：收敛轮正文质量门

新增收敛判定函数，输入为 convergence response，输出：

```ts
type ConvergenceTextVerdict =
  | { kind: 'usable'; text: string }
  | { kind: 'pseudo_tool_call'; text: string }
  | { kind: 'empty_or_failed'; text: string }
```

判定规则：

1. 空文本或请求失败：走既有 `tool_converged_local` 本地摘要。
2. 文本去空白后以工具调用标记开头、包含左右括号、长度低于 500：判为伪工具调用。
3. 文本存在真实自然语言段落，且不满足伪调用形态：判为可用正文。
4. 伪调用后允许一次强纠正收敛请求，system 明确写：当前请求没有工具；禁止输出任何工具调用形态文本；只能输出给用户看的自然语言总结，或说明本轮未完成写入。
5. 强纠正仍失败：返回 `tool_converged_local`，并在 UI 显示“本轮未完成写入”，禁止显示成功。

禁止的实现：

- 禁止把伪调用剥掉后把剩余字符当成功正文。
- 禁止用宽松规则把所有含工具名的文本一律判失败，必须同时满足长度与结构条件，避免误伤正常讨论。

### 3.3 P0-C：收敛消息语义覆盖

收敛轮 system 指令必须覆盖旧写入指令的适用性：

```text
工具调用轮次已达上限。当前请求不携带任何工具。
不要输出 tool call、伪 tool call、JSON 工具协议或“我将调用工具”的计划。
基于已获得的工具结果输出给用户看的最终回答。
如果没有完成写入，必须明确说明“本轮未写入”，不要宣称已完成。
```

同时给 run trace 增加事件：

- `tool-convergence-pseudo-call`
- `tool-convergence-corrected`
- `tool-convergence-local-fallback`

DiagLogger 同步记录，避免 runTrace 有而诊断日志无。

### 3.4 P1：长文档任务语义

新增意图判定：

| 用户语义 | 执行形态 |
|---|---|
| 修改某句、某段 | direct tool loop + `editor.write` |
| 新增一句、一段 | direct tool loop + `editor.write` |
| 删除一句、一段 | direct tool loop + `editor.write` |
| 重排章节、段落 | EditTask 分批，每批有 checkpoint |
| 整理整篇格式、顺序 | EditTask 分批，禁止一次性全文幻觉重写 |

5000 字实测走 direct tool loop 加 `editor.write`；超过单批安全阈值的整篇操作进入 EditTask，不在本次硬塞。

### 3.5 P2：chat run 观察口径

不改 chat 生命周期。新增：

- turn 收尾后，若 run 属于 chat 且仍在 running，写 `session-active` 事件。
- 导出 trace 的说明字段标明 `sessionKind=chat`，顶层 running 表示会话仍在进行，不是失败。
- 文档同步给 SKILL 层。

## 4. 真实用户级实测方案

### 4.1 测试文稿

生成一篇约 5000 字的乱编文章《青石镇的雨季》，要求：

- 20 个左右小节，每节 200-300 字。
- 带固定编号、固定句式、固定锚点句，便于精确断言。
- 内容为虚构小说设定，不使用客户真实项目内容。
- 文稿写入 `_audit/verification-api-direct-write-user-visible-2026-09-23/test-manuscript.md`。

### 4.2 测试环境

- 使用当前源码构建后的真实 Electron 窗口，不隐藏窗口，用户在电脑前可见。
- 使用应用内已配置的 `glm-5.3-sp` 供应商。
- 每步操作后停顿，等用户看见编辑器内容变化。
- 不使用 mock 供应商替代本次验收。

### 4.3 操作序列

1. 导入 5000 字测试文稿到大纲编辑器。
2. 发送：“把第 3 节里的‘雨水淹了石桥’改成‘雨水漫过石桥，青苔在水线下一层层发亮’。”
3. 发送：“在第 7 节结尾新增一句：‘她把伞收起来，雨水顺着袖口流进袖子里。’”
4. 发送：“删除第 11 节里的‘镇上的人都说她不会回来’。”
5. 发送：“把第 15 节移动到第 5 节之前，保持两节内容完整。”
6. 发送：“整理整篇文章：统一小节编号、清除多余空行、按编号重排，并保持所有正文内容不丢失。”

### 4.4 每步断言

编辑器内容：

- 目标句已按指令修改、新增或删除。
- 非目标句保持原样。
- 移动后内容无重复、无丢失。
- 整理后编号连续、空行规范。

UI：

- API 对话顶部显示实时状态，不长时间停在“等待 API 返回”。
- 写入后编辑器滚动或定位到变更位置。
- assistant 只在 `editor.write` 返回 `written` 后宣称已写入。

run trace：

- edit 意图 turn 的 `actualToolSurface` 含 `editor.write`。
- API call 层含工具调用、工具结果、写入批次。
- 三层工具面一致。
- 无伪 `tool_converged` 正文成功。
- 工具轮次按 12 轮策略执行。
- chat run 顶层 running 有 `session-active` 说明。

DiagLogger：

- 权限授予、工具开始、写入成功或失败、收敛降级、本地摘要均有记录。
- 与 run trace 双侧对账，无单侧缺失。

### 4.5 证据产物

输出到：

```text
_audit/verification-api-direct-write-user-visible-2026-09-23/
```

包含：

- `test-manuscript.md`
- 六轮操作前后的编辑器内容快照。
- 每轮 run trace 导出。
- 每轮 DiagLogger 片段。
- 操作截图或窗口状态记录。
- 最终验收 JSON。

### 4.6 失败即停

任何一轮出现以下情况立即停止：

- API 声称已写入但编辑器内容未变。
- `editor.write` 返回失败但 UI 显示成功。
- 收敛轮出现伪工具调用且未被拦截。
- 12 轮内未完成且无明确失败提示。
- run trace 与诊断日志单侧缺失。

失败后先补失败分支测试，再重新跑完整六轮，不允许只重跑失败的一轮充数。

## 5. 门禁与影响圈

遵守：

- M1 影响圈。
- M6 最新开发日志与经验复读。
- M8 runTrace 与 DiagLogger 双侧同步。
- M17 回头看。
- M18 方案成熟度。
- M22 tool-loop 状态机。
- M39 策略单源。
- M40 Electron 级直写实测。
- M45 验证器口径。

预计触碰：

- `src/services/aiService.ts`
- `src/services/toolLoopPolicy.ts`
- `src/components/common/OutlineWorkspace.vue`
- `src/components/chat/ChatPanel.vue`
- `src/stores/runTrace.ts`
- `src/services/aiService.spec.ts`
- `src/services/toolLoopPolicy.spec.ts`
- 真实 UI 验证脚本与 `_audit` 证据目录
- DEV_LOG 与经验文件

不触碰：

- pipeline 层交互工具禁令。
- Folder SKILL 协议。
- 意图路由阈值与语料训练集。
- 打包与版本号，直到实测通过后另行确认。

## 6. 成熟度结论

方案成熟度：可执行成熟版。

依据：

- 根因来自真实 trace 与现行代码，不是推测。
- 修复区分权限层、循环层、收敛层、长文档层，不把问题压成一个补丁。
- 单测、trace、DiagLogger、真实 Electron 可见操作四层验收。
- 明确失败即停与完整重跑规则，防止只修失败一步的假闭环。

待用户确认后执行。

## 7. 执行结果（2026-09-23 收口）

状态：功能与实测闭环；未升版本、未封装（待另行确认）。

### 7.1 `timeoutMs: null`

- 已实现 `resolveRequestTimeout()`，显式 `null` 不再回退默认 600 秒。
- `aiService.spec.ts` 108 passed；全量 services 856 passed；type-check、`build:vue` 通过。

### 7.2 Step5 完整性误杀

- 根因：容器 heading 的 body 是全文档拼接串，参与字符串包含比较后，节重排必然误报 `body_content_lost`。
- 修复：容器节点只校验自身直接引言，子节正文逐节比较。
- 真实 trace 回放：重排全文 `ok=true / criticalCount=0`；人为删节仍 `body_content_lost` critical 阻断。

### 7.3 live 六步实测

真实供应商（`openapi.cloud-ai.cn`，`deepseek-v4-pro`）完整重跑：

```text
[PASS] live-step1-modify: writes=1, physical=3
[PASS] live-step2-append: writes=1, physical=3
[PASS] live-step3-delete: writes=1, physical=2
[PASS] live-step4-move: writes=1, physical=3
[PASS] live-step5-tidy: writes=1, physical=4
[PASS] live-step6-reorder: writes=1, physical=4
===== API DIRECT WRITE LIVE V3 PASSED (7602 chars) =====
```

Step5 已满足“单条 `replace_document` 直接成功”，无 move 补救、无二次全文替换、无完整性误杀。

证据：

- trace：`_data/api-direct-write-live-v3-profile/app-data/run-trace/outline/run-trace-outline-20260923-180811/run-trace.json`
- 截图/前后文档：`_audit/verification-api-direct-write-live-v3/`
- 开发日志：`DEV_LOG_2026-09-23-api-direct-write-live-v3-timeout-integrity.md`
