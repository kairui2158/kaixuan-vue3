# 主页编辑器经验复用：P0 基线盘点

日期：2026-08-24
范围：只读盘点与源文件 Electron 基线，不修改业务代码。

## 经验规则引用

- `_audit/神意开发经验总结.md`：行为等价优先、一次一个闭环、构建后杀进程并用 `start-electron.bat`、CDP 同时核对 DOM 与 store、临时脚本结束后清理。
- 本轮只复用大纲工作台的验证协议和状态边界，不复制大纲工作台组件代码。

## 当前链路

输入：章节树点击正文/卷纲/章节概要，或编辑器 textarea 输入。
处理：`EditorPanel.onInput` -> `editorStore.updateContent`；`ChatPanel` 监听 activeTab 与 content。
输出：编辑器 DOM 与 editor Tab 内容更新。
联动：保存时按 `mode` 写入 `chapter.body`、`chapter.plot` 或 `volume.outline`。
存储：`projectStore.saveProject()` 写入 `wa_project_<id>`；聊天写入 `wa_chat_<id>`。
下游：右侧对话读取当前 Tab 的 `tabId/chapterId/mode/content`，AI 插入通过 `insert-text` 事件进入编辑器。

## 盘点证据

1. `src/components/editor/EditorPanel.vue`：存在 `#editor-content`、`@input="onInput"`、按三种 mode 保存、正文记忆抽取入口；无 active Tab 时 disabled。
2. `src/stores/editor.ts`：`openTab` 按 `chapterId + mode` 查找，正文/概要不会共用 Tab；存在 dirty、撤销/重做栈。
3. `src/components/chat/ChatPanel.vue`：监听 activeTab 切换会话，监听 activeTab.content 实时更新 `currentContext.content`。
4. `src/stores/chat.ts`：会话按 `tabId + chapterId` 隔离，消息持久化到 `wa_chat_<projectId>`。
5. `src/components/sidebar/ChapterTree.vue`：真实 DOM 存在“纲”和“概”入口；CDP 点击“概”后得到 `mode=ch-plot`，并且 currentContext 的 tabId/chapterId/mode 与该 Tab 一致。
6. `src/composables/useShortcuts.ts`：编辑器 textarea/input 的 Ctrl+S/Z/Y/F 被让渡给原生/组件处理，不被全局快捷键吞掉。
7. `src/stores/project.ts`：项目加载兼容 `wa_project_<id>` 与旧 `wa_project-<id>`，保存包含正文、概要、卷纲和聊天外的项目数据。
8. 源文件启动器证据：`start-electron.bat` 启动 `dist-renderer/index.html`，CDP 端口 `9227` 正常监听；探针输出显示项目 `_tmp_final_outline`、1 卷、1 章。

## P0 结果

- [x] 完成源码盘点：编辑器、编辑器 store、聊天 store、章节树、项目持久化、快捷键。
- [x] 完成源文件 Electron 启动基线：CDP 9227 可连接。
- [x] 完成章节概要真实入口验证：`ch-plot` Tab 与聊天 context 对齐。
- [ ] 正文按钮真实点击、输入保存、重启恢复：留到 P1/P2 的功能闭环，P0 不提前标 PASS。
- [ ] AI 插入跨 mode 的 `App.vue/handleInsertText`：作为 P4 风险核验，不在 P0 改码。

## P0 风险登记

`src/App.vue:206-229` 的 `handleInsertText` 仅按 `chapterId` 找 Tab；找不到时固定创建 `ch-body`。卷纲/概要的跨组件插入可能落错 Tab，必须在专门闭环中用真实事件复现后最小修复。

本轮临时探针已删除；没有修改真实项目数据。

## P1 实测补充（2026-08-24）

- [x] 章节树章节行打开正文：真实 DOM `#editor-content.disabled=false`，Tab 为 `mode=ch-body`。
- [x] 输入/删除路径：`textarea` 输入后 DOM 值、`editorStore.activeTab.content` 同值，`isDirty=true`。
- [x] 对话同步：输入后 `chat.currentContext.content.length` 从 61 变为 74，当前 `tabId/chapterId/mode` 与正文 Tab 一致。
- [x] 键盘复制/粘贴：Control+A/C/V 后内容长度保持 74，未被全局快捷键吞掉。
- [x] 探针恢复原正文，未调用保存，没有写入项目文件。

P1 结论：正文编辑输入闭环实测通过，未发现需要改码的问题。下一阶段进入 P2：保存与项目持久化、重启恢复。注意本次恢复原文后 Tab 仍为 dirty，这是未保存的编辑器状态，P2 必须验证保存按钮是否正确落盘并清除 dirty。

## P2 实测补充（2026-08-24）

- [x] 正文输入后点击 `#btn-save-editor`：Pinia `chapter.body` 与 `wa_project_<id>` 中对应章节正文相同，`isDirty=false`。
- [x] 恢复原正文后再次保存：store 与项目存储均恢复原值，`isDirty=false`。
- [x] 杀掉全部 Electron 进程后用 `start-electron.bat` 重启：读取到同一项目 `_tmp_final_outline` 和原正文；启动初始无 Tab、textarea 按无 active Tab 设计为 disabled。
- [ ] 卷纲与章节概要的保存/重启恢复仍未在 P2 实测，列入 P6 的多模式联动回归，避免把正文单模式证据扩大为全模式通过。

P2 结论：正文保存、项目 JSON 落盘和重启恢复通过；未修改业务代码。临时探针已删除。

## P3 实测补充（2026-08-24）

- [x] Ctrl+Z：临时输入后恢复原文；输出 `undoRestored=true`。
- [x] Ctrl+Y：重做恢复临时输入；输出 `redoRestored=true`。
- [x] 初次发现 Ctrl+F 失败：工具栏查找可打开，但 textarea 内快捷键无效，状态为 `findVisible=false`。根因是 `EditorPanel.onKeydown` 只匹配小写 `e.key === 'f'`。
- [x] 最小修复：`src/components/editor/EditorPanel.vue` 将快捷键先归一化 `const key = e.key.toLowerCase()`，只改 Ctrl+S/Ctrl+F 的判断。
- [x] 构建后杀 Electron、`start-electron.bat` 重启、CDP 回归：Ctrl+F 输出 `findOpen=1`、`findVisible=true`、查找结果 `1/1`、query 为“钥匙”。
- [x] 临时正文未保存，探针已删除。

P3 结论：撤销、重做、查找与快捷键闭环通过。下一阶段进入 P4，专门验证主页编辑器与右侧对话的实时双向上下文。

## P4 实测补充（2026-08-24）

- [x] 正文 Tab 打开后，聊天 session 的 `tabId/chapterId` 与正文 Tab 一致，`mode=ch-body`。
- [x] 正文输入临时内容后，`chat.currentContext.content` 实时变更，输出 `endsWithProbe=true`。
- [x] 点击章节“概”后，新建独立 `ch-plot` Tab 与独立聊天 session；`currentContext.mode=ch-plot`，没有复用正文会话。
- [x] 恢复正文原值并真实点击保存，输出 `dirty=false`；探针已删除。
- [x] CDP 点击被父级 `.chapter-item` 拦截时改用真实 DOM `el.click()`，符合已记录的 T2 验证经验。

P4 结论：编辑器到右侧对话的实时上下文同步、正文/概要会话隔离通过。下一阶段进入 P5，验证 AI 插入/替换/重生成是否按当前 Tab 与模式落点。

## P5 实施记录（2026-08-24）

### 根因与最小修改

- `src/App.vue:206` 的 `handleInsertText` 原先只按 `chapterId` 查找 Tab，未区分正文、章节概要、卷纲；找不到时固定创建正文 Tab。
- `src/components/pipeline/PipelinePanel.vue:2119,2153,2431` 的正文插入事件没有声明模式，接收端无法做明确路由。
- 已按行为等价原则最小修改：接收端优先按 `tabId`，其次按 `chapterId + mode`；无模式旧事件继续按正文兼容；三个正文流水线事件明确写入 `mode: 'ch-body'`。

### 验证状态

- [x] `npx vite build`：成功，`175 modules transformed`，生成 `dist-renderer/index.html` 与新 JS/CSS 资源。
- [ ] 杀 Electron → `start-electron.bat` → CDP 真实操作：当前启动器在本轮终端会话中被 `pause`/子进程等待阻断，`127.0.0.1:9227` 未建立，未将构建结果冒充真实行为通过。
- [ ] 正文 Tab 插入、选区替换、无选区整章替换：待 CDP 可连接后核销。
- [ ] 同章节 `ch-plot` Tab 与 `ch-body` Tab 隔离：待 CDP 可连接后核销。

P5 当前结论：代码修复已完成，真实行为验证未完成，目标队列保持 P5 in_progress，不进入 P6。

## P5 真实验证补充（2026-08-24）

- [x] 源文件 Electron 已通过独立进程启动，CDP `127.0.0.1:9227` 可连接。
- [x] 正文 Tab 通过真实聊天输入产生气泡，DOM 显示“复制 / 重生成 / 插入 / 替换”。
- [x] 点击“插入”：正文光标位置从原文开头插入回复内容，编辑器值发生变化。
- [x] 点击“替换”：先选中正文前两个字符，再确认替换；结果只替换选区，未整章覆盖。
- [x] 恢复原正文并点击保存；最终正文回到原值，聊天测试消息已清空。
- [ ] “重生成”尚未核销：本轮供应商请求停留在“正在准备请求”，未获得第二条助手回复；未将按钮存在冒充重生成成功。
- [ ] 同章节正文/概要 Tab 的插入隔离仍需在有实际回复气泡的概要会话中核销。

P5 当前结论仍为 in_progress：插入与选区替换有真实证据，重生成和跨模式气泡隔离尚未完成，因此不推进 P6。

## P5 概要会话补充（2026-08-24）

- [x] 章节概要 `ch-plot` 会话真实产生助手气泡，DOM 同时显示“复制 / 重生成 / 插入 / 替换”。
- [x] 点击概要气泡“插入”后，`#editor-content` 从 `章节概要持久化探针` 变为原内容加助手回复；当前为概要 Tab，未写入正文 Tab。
- [x] 选中概要编辑器全部内容后点击“替换”，气泡显示“已替换”，编辑器内容仍属于概要 Tab。
- [x] 点击概要气泡“重生成”后得到新的助手回复；重生成前后回复文本不同，且助手气泡仍为 1 个，说明旧的用户/助手对被替换后重新发送，而非追加错误消息。
- [x] 测试概要已恢复为 `章节概要持久化探针` 并点击保存，编辑器回到干净状态。

P5 结论：正文插入/选区替换、概要插入/替换/重生成与 Tab 隔离均已产生本轮真实 CDP 证据；P5 可进入阶段收尾。

## P6 真实验证补充（2026-08-24）

- [x] 点击卷纲入口打开 `vol-outline` 编辑 Tab；输入临时内容后点击保存，保存路径写入 `volume.outline`。
- [x] 点击章节概要入口打开 `ch-plot` 编辑 Tab；输入临时内容后点击保存，保存路径写入对应 `chapter.plot`。
- [x] 使用带 `mode: 'ch-plot'` 的 `insert-text` 事件验证接收端不会把章节概要写入当前正文 Tab；正文内容保持原值。
- [x] 测试卷纲、概要内容已清空并保存；项目存储复核 `storedVolume=''`、`storedPlot=''`。
- [ ] P6 全部联动仍待完成：流水线生成来源、重启恢复和正文/卷纲/概要三模式完整端到端链路尚未核销。

P6 当前结论：模式编辑与保存子闭环有证据，但阶段整体仍未完成；目标队列不前移。

## P6 重启恢复补充（2026-08-24）

- [x] 使用 Node 独立进程杀掉 Electron 并重新启动源文件应用，重新连接 CDP `127.0.0.1:9227`。
- [x] 重启后读取 `wa_lastProjectId` 得到 `p1787414333932`，读取 `wa_project_p1787414333932`。
- [x] 重启后项目存储中的三种模式内容与保存前一致：`volume.outline=卷纲持久化探针`、`chapter.plot=章节概要持久化探针`、`chapter.body=林舟在暴雨夜里发现一枚刻着北辰纹章的旧钥匙。他决定天亮后去旧钟楼寻找锁孔。非法JSON路径验证：白石港的银色印记只在月光下显现。`。
- [x] 本次真实命令为 `node _audit/tmp_p6_restart.cjs`，输出同时包含 `projectId=p1787414333932`、`before` 三字段和 `expected` 三字段，三项值完全一致。

P6 重启恢复子闭环：通过。P6 仍不能整体标记完成，剩余流水线生成到正确编辑器 Tab 的端到端联动待核销。

## P6 流水线正文生成核验（2026-08-24）

- [x] 重新打开源文件 Electron 的生成流水线，进入第 5 层正文，确认目标卷/章节选择存在，`AI生成正文` 按钮可用。
- [x] 真实点击 `AI生成正文`，观察约 150 秒：界面一直保持“生成中...”，没有产生正文 Tab，编辑器内容未变化，说明本次 API 请求未返回，不能把它记为联动成功。
- [x] 真实点击“取消生成”：取消按钮消失，生成按钮恢复“AI生成正文”且可用，未创建错误 Tab，应用回到可恢复状态。
- [ ] 生成供应商实际返回正文后，仍需核验 `insert-text` 打开目标 `ch-body` Tab、内容写入正确章节、保存后项目 JSON 与章节树同步。

P6 当前结论：模式编辑、三种模式重启恢复、手动模式隔离已验证；流水线真实 API 返回前的自动落点仍未核销。本阶段保持 `in_progress`，不得进入 P7。

## P6 根因复核与阶段边界（2026-08-24）

- [x] 当前运行配置确认：生成供应商为 `prv_msjcwbhl_2i62p4`，用途 `generate`，模型 `deepseek-v4-pro`，地址 `https://openapi.cloud-ai.cn/v1`；未发现未配置生成供应商或误路由到验证供应商。
- [x] 诊断日志确认：同一供应商历史存在成功响应（13,873ms、4,582ms）；本次正文尝试出现 `60014ms`、`60009ms` 请求超时，最终以 `365982ms`、`140163ms` 用户取消收束。
- [x] 根因分类：本次未完成是供应商请求长时间无响应后由用户取消，属于外部响应未返回；不是生成成功后的 Tab 或项目落点错误。
- [x] 取消恢复确认：取消按钮消失，生成按钮恢复可用，未创建错误 Tab，应用恢复可操作状态。
- [ ] 仍缺真实成功响应后的证据：返回正文 → 正确 `ch-body` Tab → 目标章节内容 → 项目 JSON/章节树同步。因此 P6 不得标记通过，也不得进入 P7。

原始证据：本轮 CDP 读取 `window.electronAPI.storageRead('wa_providers')` 与 `await window.electronAPI.diagRead('')`；关键日志为 `purpose=generate provider=prv_msjcwbhl_2i62p4 model=deepseek-v4-pro 60014ms FAIL 请求超时`、`60009ms FAIL 请求超时`、`365982ms FAIL 用户取消`、`140163ms FAIL 用户取消`。

## P6 再次真实重试（2026-08-24）

- [x] 当前流水线正文层真实点击 `#btn-pl-gen-body`，保持当前目标卷/章、无智能体、无 Skill 配置不变。
- [x] 完整观察窗口内生成按钮持续显示“生成中...”，取消按钮存在，编辑器仍为 `章节概要持久化探针`，编辑器 Tab 数为 `0`。
- [x] 真实点击 `#btn-pl-cancel-generation` 后，DOM 输出为：生成按钮 `AI生成正文`、取消按钮 `false`、Tab 数 `0`、编辑器内容未被改写。
- [ ] 本次仍没有供应商成功正文，因此自动打开 `ch-body`、写入目标章、项目 JSON 和章节树同步继续缺少成功响应证据。

本次原始 CDP 输出摘要：`gen=生成中... cancel=true tabs=0 editor=章节概要持久化探针`（重复观察）；取消后：`gen=AI生成正文 cancel=false tabs=0 editorTail=章节概要持久化探针`。P6 仍保持 `IN_PROGRESS / EXTERNAL_RESPONSE_BLOCKED`，不进入 P7。

## P6 第三次真实重试与阶段边界（2026-08-24）

- [x] 源文件 Electron 页面确认：`file:///D:/codex/novel-workshop-vue3/dist-renderer/index.html`，CDP `127.0.0.1:9227`，正文生成入口真实存在。
- [x] 第三次独立真实点击正文生成并观察 90 秒：生成按钮保持“生成中...”，取消按钮可见，编辑器 Tab 数为 `0`，编辑器内容仍为“章节概要持久化探针”。
- [x] 真实点击取消后：生成按钮恢复“AI生成正文”，取消按钮消失，Tab 数仍为 `0`，编辑器内容不变。
- [ ] 供应商没有返回正文，仍缺“成功响应 → ch-body Tab → 目标章节 → 项目 JSON/章节树”的成功证据。

P6 阶段结论：应用侧生成状态、取消恢复和无副作用已验证；连续三次独立尝试均被供应商长时间无响应阻断，按任务规则将 P6 标记为 `BLOCKED_EXTERNAL_RESPONSE`，不把外部阻断冒充应用通过。后续目标队列剔除 P6，进入 P7；P6 成功响应后的落点验证保留为外部环境恢复后的专项复验。

## P7 记忆抽取与审核联动（2026-08-24）

- [x] 主编辑器正文真实点击“提取记忆”：正文先保存，约 45 秒后显示“记忆变更预览”，本轮出现 5 条实体/世界观变更。
- [x] 审核动作真实执行：第一条点击“拒绝”，第二条点击“锁定”，预览仍保持，其余条目可继续审核。
- [x] 点击“确认写入记忆”后弹窗关闭，记忆板块打开并显示抽取出的实体与世界观内容。
- [x] 项目 JSON 持久化核对：`wa_project_p1787414333932` 中 `memories.entities=11`、`world=3`、`history=10`。
- [x] 杀 Electron → `start-electron.bat` → CDP 重连后，`file:///D:/codex/novel-workshop-vue3/dist-renderer/index.html` 加载同一项目，读取到相同记忆计数，记忆面板可见且包含“雾松台”。

P7 结论：主编辑器正文抽取、审核、确认写入、记忆视图更新、项目持久化和重启恢复均有本轮真实证据，阶段核销完成。

## P8 错误路径与恢复（2026-08-24）

- [x] 空正文边界：清空正文后 `#btn-extract-memory.disabled=true`，没有发起抽取请求；恢复原正文并保存后 `dirty=0`。
- [x] 预览取消：真实发起抽取得到预览，点击“取消”后弹窗关闭，项目记忆数量前后均为 `14`，确认取消没有写入。
- [x] 生成取消：P6 三次真实生成尝试均可点击取消，取消后生成按钮恢复、取消按钮消失、Tab 为 `0`、编辑器内容保持不变。
- [x] 失败恢复边界：P6 诊断记录外部超时/用户取消，应用没有创建错误正文 Tab，也没有覆盖项目正文。

P8 结论：本轮覆盖的空输入、预览取消、生成取消和外部超时恢复路径均有真实 DOM/存储证据；阶段核销完成。供应商成功响应后的正文落点仍属于 P6 外部恢复专项，不在本阶段扩大结论。

## P9 UI 一致性回归（2026-08-24）

- [x] 初始 Electron 运行时检查发现 3 个真实外框横向溢出：项目名容器、章节树活动行、编辑器活动 Tab；页面根级 `scrollWidth-clientWidth=0`。
- [x] 根因定位：章节树章节行没有 flex 收缩边界，Tab 内标题没有 `min-width:0`；文本与右侧操作按钮争用宽度。
- [x] 最小修复：`src/components/sidebar/ChapterTree.vue` 将章节行改为可收缩 flex，并给标题 span 增加省略；`src/components/editor/EditorPanel.vue` 给 Tab 标题 span 增加收缩省略。
- [x] `npm run build:vue`：`175 modules transformed`，生成 `index-CjQ00IRC.css` / `index-D_tOq_Sn.js`。
- [x] 杀 Electron → `start-electron.bat` → CDP 重连；页面为 `file:///D:/codex/novel-workshop-vue3/dist-renderer/index.html`，编辑器外框 `1128/1128`，页面 `1904/1904`。
- [x] 复测没有章节行/Tab 外框溢出；剩余两个文本节点是预期的 `text-overflow:ellipsis` 自身 scrollWidth，不构成可见穿出。

P9 结论：主页编辑器关键 UI 结构、字号、气泡/面板边界和横向溢出已完成本轮真实回归；本轮发现的两个真实布局缺陷已最小修复并复测。

## P10 最终交付收尾（2026-08-24）

- [x] 更新本轮开发日志和经验文件，记录 P6 三次外部阻断边界、P7/P8/P9 真实证据与防回滚规则。
- [x] 生成交付报告：`_audit/主页编辑器经验复用_P5-P10交付报告_2026-08-24.md`。
- [x] 最终构建通过：`npm run build:vue`，`175 modules transformed`。
- [x] 构建后杀 Electron、使用 `start-electron.bat` 重启并通过 CDP 读取源文件页面。
- [x] 本轮没有新增临时探针、截图或中间文件残留；既有历史证据和用户变更未删除。

P10 结论：本轮目标队列收尾。P6 成功响应落点保留为外部环境恢复后的专项复验，不得在本报告中写成已通过。
