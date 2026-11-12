# 大纲编辑器 + 首页编辑器 性能与过度设计审计报告

- 日期：2026-11-12
- 审计对象：`src/components/common/OutlineWorkspace.vue`（7679 行）+ `src/components/chat/ChatPanel.vue`（5724 行）
- 审计模式：只读静态审查 + DEV_LOG 需求反查。本轮未修改任何生产代码。
- 用户原始症状（原话锚定）："大纲编辑器和首页编辑器输入会导致应用短暂的卡顿现象，和过度的UI显示"。
- 结论边界（G1.19）：本报告按 G1.15 完成静态三层定位；所有耗时项先标【候选热链】，Phase A 只读耗时账本产出并排序后，才允许进入修复实施排序。

## 一、确认问题清单

### P0 大纲编辑器输入热链

| ID | file:line | 机制 | 触发条件 | 分类 | 处理归属 |
|---|---|---|---|---|---|
| OW1 | `src/components/common/OutlineWorkspace.vue:3684-3689` | watch outlineText 无条件 `scheduleMultiCursorRepaint()` → rAF → `renderMultiCursors()` → viewport 重测 | 每次击键；多光标未激活也执行 | 真实开销 + 链路过宽 | Phase B |
| OW1b | `src/services/editorViewport.ts:115-119` → `src/services/editorVirtualization.ts:88-127` | `getLineWindow()` → `lineIndexCache.getLineCount(value)`；缓存未命中时 `load()` 全文逐字符扫行/建索引 | ≤50 万字内容变化即重建；>50 万字走 streamed 只数行数 | 真实开销 | Phase B |
| OW2 | `src/components/common/OutlineWorkspace.vue:93` + `:74` | textarea v-model 直写 `projectStore.outlineText`；字数显示同源 | 每次击键进入 store 响应式并扇出全部依赖 | 结构放大器 | Phase B |
| OW3 | `src/components/common/OutlineWorkspace.vue:3304-3306` | `findMatches` computed 对全文执行 `computeEditorMatches` | 查找面板打开 + 每次击键 | 功能开销缺节流 | Phase B |
| OW4 | `src/components/common/OutlineWorkspace.vue:587-613` | `virtualMessages` computed 每次重建全量消息数组 | outlineText 或消息数组变化 | 结构放大器 | Phase E/F |
| OW5 | `src/components/common/OutlineWorkspace.vue:5750` | `handleEditorBeforeInput` 每次输入前触发 undo 事务入栈（内部 800ms 合并） | 每次击键 | 真实开销（量级待采账） | Phase B/F |
| OW6 | `src/components/common/OutlineWorkspace.vue:3617/3620-3624` | 断流恢复 5 秒 `setInterval` 常驻，非生成态也在轮询 | 组件挂载起持续运行 | 过度设计（兜底做成了常驻） | Phase F |
| OW7 | `src/components/common/OutlineWorkspace.vue` 2647/3767/3784/3803/3818/3823/3828/3848/3861/3866/3871/3877/3891/3913/4214/4395/4505/4628/4634/4653/4660/4839/4847/4852/4893/7093 | `saveFeedback` 清空 setTimeout 复制粘贴约 28 处，无互斥、无统一清理 | 每次相关操作 | 复制粘贴债 | Phase F |

### P0 首页编辑器输入热链

| ID | file:line | 机制 | 触发条件 | 分类 | 处理归属 |
|---|---|---|---|---|---|
| HP1 | `src/components/common/ApiChatInput.vue:92-99/103/122` | `autosize()` 每次输入 `height='auto'` 后读 `scrollHeight` 再写回 | 每次击键强制 reflow | 真实开销 | Phase C |
| HP2 | `src/stores/editor.ts:72-88` | `updateContent` 对新旧全文各做一次 `hashEditorContent` + bookmark 过滤重建 | 每次编辑器内容变化（含每次击键） | 真实开销 + 脏判定过精 | Phase D |
| HP3 | `src/components/chat/ChatPanel.vue:2786-2790` | watch `activeTab.content` 把全文赋给 `chatStore.currentContext.content` | 每次击键跨 store 全文拷贝 | 跨 store 放大器 | Phase D |
| HP4 | `src/components/chat/ChatPanel.vue:13` + `src/components/chat/ChatMessage.vue`（503 行） | `v-for` 渲染全部消息，无虚拟化；每条消息渲染完整操作面/诊断/终稿/断点状态 | 消息数量线性放大 DOM 与组件开销 | 结构债 + 过度 UI | Phase E |
| HP5 | `src/components/chat/ChatPanel.vue:151/154` | 字数 + token 消耗条常驻；token 条生成后不隐藏 | 常驻 | 过度 UI 显示 | Phase E |
| HP6 | `src/components/chat/ChatMessage.vue:346` | `renderedContent = computed(renderMarkdown(messageSource))` 无节流 | 流式/更新时全文 Markdown 重渲染 | 真实开销 | Phase E |
| HP7 | `src/components/chat/ChatPanel.vue:318-333` | 组件注入 10 个 store（agent/provider/editor/skill/chat/project/coCreation/settings/aiTask/runTrace） | 常驻依赖面 | 结构债 | Phase F |
| HP8 | `src/stores/chat.ts:121-133` | sessions 持久化 250ms 防抖后 `JSON.parse(JSON.stringify(sessions))` 全量深拷贝再写盘 | 流式/更新消息触发，防抖窗口到期执行 | 周期性卡顿候选 | Phase D |

### P1 全局持久化碰撞源

| ID | file:line | 机制 | 触发条件 | 分类 | 处理归属 |
|---|---|---|---|---|---|
| BG1 | `src/stores/project.ts:1783-1787` | 项目自动保存每 30 秒把整个项目（大纲+卷章+记忆+全部子集合）一次序列化写 IPC | 定时触发；输入时可能撞车 | 周期性卡顿候选 | Phase D |
| BG2 | `src/components/common/OutlineWorkspace.vue:3620-3624` | 轮询定时器卸载时正确清理，但常驻设计本身多余 | 挂载期持续 | 过度设计 | Phase F |

### P1 UI 过度显示

| ID | 现象 | 证据 | 处理归属 |
|---|---|---|---|
| UI1 | 首页状态栏字数/token/配置三组信息同行常驻 | `ChatPanel.vue:151-154` | Phase E |
| UI2 | 首页每条消息带完整操作矩阵（复制/续写/重生成/插入/替换/回滚/定位/诊断/终稿/断点） | `ChatMessage.vue` 模板 1-180 | Phase E |
| UI3 | 首页消息区无虚拟化 | `ChatPanel.vue:13` | Phase E |
| UI4 | 大纲反馈文本清空逻辑散落 28 处 | OW7 行号表 | Phase F |
| UI5 | 大纲断流恢复轮询无生成态门控 | `OutlineWorkspace.vue:3617` | Phase F |

### P2 疑似问题（Phase A 采账定性）

| ID | 疑点 | 为什么不能现在定性 |
|---|---|---|
| X1 | safe_mode 只有终态降级，无 warning 中间档（`src/utils/throttledMarkdown.ts:3/9`、`OutlineChatMessage.vue:157/243/261/271`） | 现有项目的实际消息量与触发阈值未采账，无法证明中间档有必要（G0.13） |
| X2 | `ApiChatInput` 挂载/空值也触发 autosize（`ApiChatInput.vue:103/122`） | 每次击键 reflow 已确认，但空值触发的真实占比需账本数据 |

## 二、机制层判定：历史需求与现状反差

| 历史锚点 | 当时承诺/需求 | 现状反差 |
|---|---|---|
| `_audit/DEV_LOG_2026-09-14-chat-input-unification.md` | 共享 `ApiChatInput` 统一主页和大纲输入 | 统一达成，但引入每次击键强制 reflow（HP1） |
| `_audit/DEV_LOG_2026-09-03-home-co-creation.md` P2 | 共享执行引擎不 import 组件、不读写 Pinia、adapter 注入 | 引擎承诺在服务层保留，但组件面已膨胀到 10 个 store 注入（HP7） |
| `_audit/DEV_LOG_MASTER_INDEX.md:498`（超长文档性能层） | viewport 同源测量、虚拟化 | viewport 机制存在，但每次击键经 rAF 打穿全文行索引（OW1/OW1b） |
| `_audit/DEV_LOG_MASTER_INDEX.md:103` | 大纲消息虚拟化 | 大纲有 DynamicScroller，首页没有（OW4 vs UI3 不对称） |
| `_audit/DEV_LOG_2026-11-07-outline-editor-v1.2-phase5-closeout.md` | V1.2 六阶段收口 | 交付完成，但"组件严重超载"登记未根治，现状 7679 行 |

## 三、G1.15 四层静态定位结论

1. 症状层：输入短暂卡顿 + UI 过度显示。候选热链为 OW1-OW4（大纲）与 HP1-HP3（首页）。
2. 链路层：大纲击键 → store v-model → watch → rAF 全文行索引 → UI 重测；首页击键 → editor hash → 跨 store context 拷贝 → autosize reflow。
3. 组合层：周期持久化（HP8/BG1）与输入热链叠加时形成间歇性卡顿窗口；消息面板结构债（HP4）与流式渲染（HP6）叠加形成 UI 卡顿。
4. 机制层：多处"兜底/安全"机制被实现为常驻或全量操作（轮询、全文哈希、全文正则、全量持久化），是历史事故补丁堆叠后的保守默认，属于过度设计形态。

## 四、初步严重度排序（Phase A 前的假设，不是最终修复顺序）

1. OW1/OW1b：大纲每次击键全文行扫描（最可疑的单点热链）。
2. HP1+HP2+HP3：首页三段击键开销叠加。
3. HP8/BG1：周期性全量持久化与输入撞车。
4. OW3：查找面板打开时的全文正则。
5. HP4/HP5：首页消息面板结构债与过度 UI。
6. OW5/OW6/OW7/HP7：次级开销与清理债。

以上排序必须被 Phase A 账本证实或推翻后才进入修复。
