# 大纲工作台可编辑创作升级：P0 基线盘点

日期：2026-08-23
范围：大纲工作台可编辑创作升级，不涉及本阶段业务代码修改。

## P0 结论

- [x] 已读取《神意开发经验总结》及本任务相关验证规则。
- [x] 已盘点工作台、项目 store、流水线、快捷键、导入服务和持久化入口。
- [x] 已确认此前“导入后键盘编辑失效”的修复仍在工作区：`src/composables/useShortcuts.ts` 将普通输入控件交还原生快捷键处理。
- [x] 已确认当前工作区包含历史用户/前任务改动；本阶段未执行回滚、批量清理或覆盖。
- [x] 已建立后续阶段的状态模型和验收边界。

## 当前数据流

1. 工作台 `OutlineWorkspace.vue` 的 `textarea#outline-editor` 通过 `v-model` 直接绑定 `projectStore.outlineText`。
2. `projectStore.saveProject()` 将 `outlineText` 与 `outlineLocked` 写入当前项目 JSON；加载时从新旧项目 key 兼容读取这两个字段。
3. 工作台的“保存大纲到本地”同时执行项目 JSON 保存和独立 Markdown 文件导出，两个语义目前尚未拆开。
4. 工作台锁定时调用 `lockOutline()`、同步章节树/流水线并跳转流水线；`lockOutline()` 当前只把 `outlineLocked` 设为 `true`，没有独立锁定版本副本。
5. 流水线大纲层的 textarea 直接读取 `projectStore.outlineText`，确认步骤也直接以该字段作为锁定和分析输入。
6. AI 共创当前输出普通文本；现有复制、插入和整篇替换直接改写 `outlineText`，没有结构化编辑指令、预览确认或编辑事务。

## 当前缺口

- 草稿、已保存内容、锁定版本、流水线输入没有独立语义，存在锁定后修改污染流水线的风险。
- 工作台没有完整的复制、粘贴、剪切、撤销、重做、查找工具栏闭环。
- AI 编辑动作没有白名单协议、目标校验、预览确认和可撤销事务。
- 锁定后没有明确的解锁编辑入口，也没有重新确认锁定版本的流程。
- DOCX 导入此前仅在源码 `accept` 属性中声明，不能把它视为已通过真实行为验收；格式支持需要后续单独验证。
- 关闭/重启后的项目 JSON、独立大纲文件、流水线锁定输入尚未完成本任务的递归实测。

## 目标状态模型

后续实现必须保持向后兼容，并逐步形成以下语义：

`outlineDraft`（工作台当前编辑内容）
→ `outlineSaved`（最近一次写入项目 JSON 的内容）
→ `outlineLockedContent`（确认进入流水线的不可变快照）
→ 流水线只读取 `outlineLockedContent`。

旧项目没有新字段时，读取 `outlineText` 作为草稿和兼容的已保存内容；只有用户明确确认后才创建锁定快照。未锁定草稿的修改不能悄悄成为流水线输入。

## P1 验收边界

- 未锁定时：键盘输入、删除、选区编辑、导入后修改真实生效。
- 锁定时：编辑器明确保护；解锁入口明确且状态可见。
- 编辑器内容变化实时反映到 store，不能被异步保存覆盖。
- 每项验证必须使用源文件 Electron 启动器，并记录 DOM、store 和持久化实际值；构建成功不能替代行为验收。

## 本阶段证据

- `src/components/common/OutlineWorkspace.vue`
- `src/stores/project.ts`
- `src/components/pipeline/PipelinePanel.vue`
- `src/composables/useShortcuts.ts`
- `src/services/file-import.ts`
- `npm run build` 与源文件 Electron/CDP 编辑验证见 `_audit/DEV_LOG_2026-08-23-outline-editor-edit.md`。

## 状态

P0：完成盘点，未修改业务代码。
下一阶段：P1 基础编辑器闭环。

## P1 验证补记

- [x] `npm run build`：Vite 构建成功，electron-builder 生成 `dist\\win-unpacked\\神意助手.exe` 与 `dist\\神意助手-Setup-3.2.1.exe`。
- [x] `taskkill /F /IM electron.exe` 后使用 `call start-electron.bat` 启动源文件版，CDP 端口 `9227` 可连接。
- [x] CDP 实测未锁定状态：`#outline-editor` 存在，`readonly=null`，填入文本后值实际变化。
- [x] CDP 实测锁定路径：点击 `#btn-lock-outline` 后进入流水线，`#pl-outline` 存在且 `readonly` 属性为空字符串；关闭流水线后回到工作台，`#outline-editor` 的 `readonly` 为空字符串，`#btn-unlock-outline` 存在。
- [x] CDP 实测解锁路径：点击 `#btn-unlock-outline` 后 `#outline-editor readonly=null`，再次填入文本成功。
- [x] P1 未修改流水线的既有锁定逻辑，仅让工作台与 store 的锁定状态一致。

P1：完成。P2：进入编辑器工具栏闭环。

## P2 验证补记

- [x] 工具栏新增真实按钮：`#btn-ow-undo`、`#btn-ow-redo`、`#btn-ow-copy`、`#btn-ow-cut`、`#btn-ow-paste`、`#btn-ow-find`。
- [x] 查找栏新增 `#ow-find-input`、上一个、下一个、关闭；不会凭空改正文，只会定位并选中匹配文本。
- [x] `npm run build:vue` 原始输出：`175 modules transformed`、`built in 4.54s`。
- [x] 源文件 Electron/CDP 实测：剪切后 `cutValue ""`；粘贴后恢复 `第一幕\\n林舟发现钥匙\\n第二幕`；撤销和重做分别改变正文；查找“钥匙”得到 `findResult 已定位`，选区 `[9,11,"钥匙"]`。
- [x] `npm run build` 原始输出完成，生成 `dist\\win-unpacked\\神意助手.exe`、`dist\\神意助手-Setup-3.2.1.exe` 和 blockmap。

P2：完成。P3：进入保存与持久化闭环。

## P3 验证补记（部分完成，未前移）

- [x] 编辑器输入 `P3持久化核验\\n第一章：重启后必须恢复` 后，等待自动保存，Electron storage 中项目 `wa_project_p1787414333932` 的 `outlineText` 与 DOM 完全一致。
- [x] `taskkill /F /IM electron.exe` 后重新 `call start-electron.bat`，打开大纲工作台，DOM 恢复值仍为 `P3持久化核验\\n第一章：重启后必须恢复`，项目 JSON 同步值一致，`outlineLocked=false`。
- [x] Electron CDP 调用 `dialogWriteFile` 写入临时路径返回 `ok=true`；Node 原始读取输出为 `P3导出核验\\n第一章：文件内容一致`，与写入文本一致。
- [x] 验证临时文件已删除，输出 `TEMP_EXPORT_REMOVED`；未把临时文件留在项目目录。
- [x] 系统保存对话框本身仍需人工点击真实路径做一次客户验收；应用写入接口和内容一致性已有本轮证据。

P3：完成（项目 JSON、重启恢复、独立文件写入接口均有证据）。P4：进入锁定与版本隔离闭环。

## P4 验证补记

- [x] 新增兼容字段 `outlineLockedText` 和计算值 `pipelineOutlineText`；旧项目无快照时，锁定旧内容自动作为兼容快照。
- [x] 流水线大纲显示及设定、卷纲、章节、正文、风格分析请求改读 `pipelineOutlineText`；工作台仍编辑 `outlineText`。
- [x] `npm run build:vue` 原始输出：`175 modules transformed`、`built in 1.34s`。
- [x] 源文件 Electron/CDP 实测锁定：编辑器输入 `P4草稿版本`，点击锁定后流水线 `#pl-outline` 值为 `P4草稿版本`，`readonly=""`。
- [x] 解锁后编辑：项目 JSON 实际为 `outlineText=P4解锁后的草稿`、`outlineLocked=false`、`outlineLockedText=P4草稿版本`；已证明草稿修改不会覆盖旧流水线快照。
- [x] `npm run build` 原始输出完成，安装包和 `dist\\win-unpacked` 均重新生成。

P4：完成。P5：进入 AI 结构化编辑协议与白名单解析闭环。

## P5 验证补记（进行中）

- [x] `OutlineWorkspace.vue` 增加 `OutlineEditCommand` 类型和六种白名单操作：`insert`、`replace_selection`、`replace_section`、`append`、`delete`、`rewrite`。
- [x] 解析器拒绝空响应、超长响应、非法 JSON、非 `outline_edit` 类型、未知操作；`replace_section`/`delete` 要求目标，非删除操作要求内容。
- [x] 普通 AI 回复仍按原有文本消息保存；结构化命令仅挂载为待确认元数据，没有自动修改编辑器。
- [x] `npm run build:vue` 原始输出：`175 modules transformed`、`built in 4.98s`。
- [ ] CDP 边界探针尚未完成：两次探针均因 Windows 内嵌 JSON 引号转义失败，未取得合法/非法命令的运行时原始输出；不能把 P5 标记完成。

P5：保持进行中。下一次只修复验证载体并核验白名单识别，不进入 P6。

## P5/P6 真实结构化编辑验证补记（2026-08-23）

- [x] 使用源文件 Electron（`start-electron.bat`，CDP `9227`）从主页面真实打开大纲工作台；未使用 Pinia/localStorage 注入或手写项目状态。
- [x] 通过真实 AI 对话入口发送一次请求；受控响应只用于核验应用请求、解析和编辑闭环，探针输出 `INTERCEPTED 1`。
- [x] 合法 `outline_edit` JSON 被识别为编辑指令，聊天区出现 `COMMAND_COUNT 1`，并显示“预览修改”入口。
- [x] 点击“预览修改”后出现 `PREVIEW_VISIBLE 1`；预览前正文为 `第一幕\n女主发现钥匙\n第二幕`。
- [x] 点击“取消”后正文仍为 `第一幕\n女主发现钥匙\n第二幕`，且 `PREVIEW_AFTER_CANCEL 0`，证明取消不会写入编辑器。
- [x] 再次预览并点击“确认修改”，正文真实变为 `第一幕\n女主发现一把刻着王族徽记的钥匙\n第二幕`。
- [x] 运行时读取实际项目键 `wa_project_p1787414333932`，`PROJECT_OUTLINE` 与编辑器一致；`PROJECT_CHAT_LAST` 同时包含原始 JSON 和解析后的 `outlineEdit` 元数据。
- [x] 验证后已删除临时探针 `_audit/outline_p5_probe.cjs`，并终止 Electron 进程；未留下测试脚本或临时导出文件。

### P5/P6 结论

P5 结构化编辑协议和 P6 预览/确认闭环已取得本轮源文件 Electron/CDP/项目落盘证据，均可从活动目标队列剔除。证据边界：响应由受控拦截提供，证明应用侧请求、解析、白名单、预览、取消、确认和持久化；不证明供应商网络稳定性或模型自身是否会按提示返回 JSON。

P5/P6：完成。下一阶段：P7 AI 编辑事务、撤销/重做和同步闭环。

## P7 AI 编辑事务与撤销/重做验证（2026-08-23）

- [x] `OutlineWorkspace.vue` 新增 AI/插入/整篇替换统一使用的 `commitOutlineChange`：写入前记录旧正文，清空重做栈，限制历史深度 50，并同步 `projectStore.outlineText` 与项目 JSON。
- [x] 结构化确认路径已接入事务提交；不再直接绕过历史层写入正文。
- [x] 构建原始输出：`npm run build:vue`，`175 modules transformed`，`built in 3.02s`。
- [x] 按规则杀 Electron 并用 `start-electron.bat` 重启源文件版本，真实发送一次受控结构化 AI 回复；输出 `requests:1`。
- [x] 确认后编辑器值为 `P7原始大纲\nP7 AI修改后的段落`；点击撤销后恢复 `P7原始大纲\n目标段落`；点击重做后再次恢复 AI 修改值。
- [x] 读取实际项目键 `wa_project_p1787414333932`，落盘值与重做后的编辑器值一致。
- [x] 验证后删除 `_audit/outline_p7_probe.cjs` 并终止 Electron；未保留临时脚本。

### P7 结论

P7 的 AI 编辑事务、撤销/重做和编辑器→store→项目 JSON 同步已取得源文件 Electron/CDP 证据，阶段完成并从活动队列剔除。撤销栈是本次工作台会话级状态；项目正文持久化是真实落盘的，未把临时探针数据扩大解释为供应商行为证据。

P7：完成。下一阶段：P8 选区、光标、章节/幕定位与对话持久化边界。

## P6 验证补记（进行中）

- [x] 预览区 `#ow-edit-preview`、`#btn-ow-apply-edit`、`#btn-ow-cancel-edit` 已接入；未点击确认前不写入 `outlineText`。
- [x] 确认执行只允许白名单操作；目标不存在、删除目标不存在、替换选区无选区时拒绝写入并给出提示。
- [x] `npm run build:vue` 原始输出：`175 modules transformed`、`built in 1.27s`。
- [ ] 当前运行环境没有 API 结构化 `outline_edit` 回复，CDP 实测只看到 `preview 0`、`buttons 0`、`chatMessages 0`；尚未取得“合法命令→预览→取消/确认”的真实运行时证据。
- [ ] P5/P6 保持在目标队列，不进入 P7；不能将代码存在、构建成功或静态按钮存在扩大为行为完成。
# P8 追加验证记录（2026-08-24）

## 本轮结论

- P8 已完成，已前移到 P9。
- 源文件 Electron 已按 `start-electron.bat` 启动，CDP `9227` 可连接。
- 真实打开大纲工作台并打开“AI 共创大纲”后，结构化命令预览可见；预览阶段正文保持不变；确认后正文更新且预览关闭。
- 真实发送新的 `replace_selection` 结构化命令后，选区内容被准确替换，选区外内容保持不变。
- 清空选区后确认同一命令，正文保持不变并显示“请先在编辑器中框选要替换的内容”。
- 杀 Electron 后按 `start-electron.bat` 重启，编辑器正文恢复；重新打开工作台和 AI 共创后，8 条对话记录恢复，指定用户请求仍存在。

## 证据

```text
BUILD: npm run build:vue -> 175 modules transformed; built in 2.94s
START: start-electron.bat -> DevTools listening on ws://127.0.0.1:9227
OPEN: #btn-outline-workspace -> #outline-editor visible=true
CHAT: #btn-ai-co-create -> #ow-chat-input visible=true
PREVIEW: #ow-edit-preview visible=1
PREVIEW_CONTENT: 第一幕\\n目标段落\\n第二幕\\n幕外内容
CONFIRM: 预览关闭，编辑器内容发生替换
STORAGE: wa_project_p1787414333932 outline 与恢复快照一致，outlineChat count=6
NO_SELECTION: unchanged=true; Chinese feedback=true
RESTART: editor restored; chat visible=true; restored messages=8; request restored=true
PROCESS: 验证结束后 Electron 已终止，临时探针已删除
```

## 数据边界

本轮沿用了上一轮验证项目 `p1787414333932`，落盘正文仍为上一轮测试快照 `P7原始大纲\\nP7 AI修改后的段落`；没有将其当作用户原稿恢复，也没有覆盖为新的未知内容。后续验证必须使用独立可逆项目或先取得可确认的原稿快照。

## P9 源文件与安装包验收（2026-08-24）

### 状态

- [x] `npm run build:vue`：成功，`175 modules transformed`。
- [x] `start-electron.bat` 源文件 Electron：成功启动，CDP `9227` 可连接；P8 重启恢复已由源文件入口核销。
- [x] `npm run build`：成功生成当前封装产物。
- [ ] 安装包深度交互：未核销。

### 当前封装证据

```text
electron-builder 25.1.8
packaging platform=win32 arch=x64 electron=33.0.0
building target=nsis file=dist\\神意助手-Setup-3.2.1.exe archs=x64 oneClick=false perMachine=false
dist\\神意助手-Setup-3.2.1.exe LastWriteTime=2026-08-24 00:33:07
dist\\win-unpacked\\神意助手.exe LastWriteTime=2026-08-24 00:31:36
```

### 安装包边界

先前 shell 启动路径因中文路径和嵌套引号解析失败，不能作为应用失败证据。随后使用 Node 原生 `child_process.spawn` 启动解包程序，取得以下真实证据：

```text
SPAWNED_PID=8560
神意助手.exe  D:\codex\novel-workshop-vue3\dist\win-unpacked\神意助手.exe
CDP 9228: title=神意助手
url=file:///D:/codex/novel-workshop-vue3/dist/win-unpacked/resources/app.asar/dist-renderer/index.html
```

通过安装包页面加载项目 `_tmp_final_outline` 并打开 `#btn-outline-workspace` 后：

```text
#outline-editor visible=true
disabled=false
readOnly=false
toolbar=撤销/重做/复制/剪切/粘贴/查找/从文件导入/保存大纲到本地/确认大纲
```

真实输入 `[PACKAGED_EDIT_PROBE]` 后内容发生变化，恢复原值成功；编辑器 `clientWidth=964`、`scrollWidth=964`。因此 P9 安装包启动与大纲工作台可编辑核心行为 PASS。API 供应商网络和完整客户新项目流程不属于本轮安装包编辑闭环证据。
