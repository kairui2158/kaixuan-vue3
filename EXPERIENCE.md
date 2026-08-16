# 2026-08-16 经验记录
# 次级栏章节树链路验证

## 发现问题
1. CDP Input.insertText 对 textarea 的 v-model 有效，但需要先聚焦元素并等待聚焦完成
2. 验证脚本的响应队列管理需严格递增 ID，send_and_ignore 会导致响应混淆
3. EditorPanel 中标签页的 class 是 .tab 不是 .tab-item
4. closeCtxMenu 绑定在 tree-body 的 @click 上，不是 body
5. ensureVolumesFromOutline 对中文标题解析为乱码，疑似编码问题

## 修复记录
- 删除 ChapterTree.vue 中的 btn-tree-gen 生成按钮
- 修复 SkillBindModal 常显弹出问题（加 v-if="props.visible"）
- 验证脚本改用递增 ID 和严格响应等待

## 验证结论
核心链路（大纲工作台→输入→保存→锁定→章节树→右键→绑定技能→流水线）全部通过。
失败项均为验证脚本问题，不是应用 Bug。

# 2026-08-16 直接退出保存 E2E 经验

## 结论
1. 直接退出链路可用：窗口 X → lifecycle 拦截 → ExitConfirmModal → directExit() → saveProject() + editor-save → force-quit。
2. 用户当前未保存的编辑器正文，在点击“直接退出”后已证明会写入 Documents/神意助手数据，不是只保存在内存。
3. 验收必须走“窗口操作 + 弹窗点击 + 磁盘 JSON”三重证据，不能再只看 store 或 DOM。
4. E2E 临时项目必须保留原始 lastProjectId 并在验证后写回，避免污染用户默认项目。
5. 进程清理必须在验证脚本内完成：启动前 kill 旧进程，关闭后再次确认无 Electron 残留。

# 2026-08-16 右侧对话框替换按钮 + 双向同步 + 持久化

## 问题
1. ChatPanel.vue 脚本区被 PowerShell 内联转义污染，导致语法错误（未定义变量、花括号不匹配）
2. `messages` 用 `ref([])` 而不是 `computed(() => chatStore.activeMessages)`，导致 store 数据不同步
3. 缺少 `projectId` computed，addMessage 调用没传 projId 参数
4. `callApi` 内引用了未定义的 `response` 变量和 `projId` 变量
5. 缺少编辑器 ↔ 对话的 watch 双向绑定
6. 缺少编辑器选中内容替换按钮
## 修复记录
1. ChatPanel.vue 脚本区全部重写：
   - `messages` 改为 `computed(() => chatStore.activeMessages)`，添加 `projectId` computed
   - 修复所有 addMessage 调用传入 projId，修复 callApi 的 response 变量 scope 和 projId 参数
   - 修复 regenerateMessage 的花括号语法错误
2. 替换 replaceSelection 函数用 DOM + store 双模式
3. 添加两个 watch 绑定：editorStore.activeTab 切换 chat session，activeTab?.content 同步到 chat context
4. ChatMessage.vue 添加替换按钮（@replace emit）
5. chat.ts store 的 addMessage 支持传 projectId
## 验证结果
1. Vite build + electron-builder 成功
2. CDP 验证：注入 assistant 消息后，替换按钮渲染（复制、重生成、应用、替换）
3. 替换功能验证：选中编辑器文字 → 点击替换按钮 → 选中文字被替换为消息内容，store 同步更新
4. 数据持久化通过 chat.ts saveSessions 自动写入 wa_chat_{projectId}.json
## 经验教训
1. 修复被 PowerShell 污染的脚本文件时，必须用 apply_patch 或 Write 写文件，避免 node -e 或内联替换
2. 《行为等价》原则：替换按钮应同时操作 DOM 和 store，确保双向同步
3. 对话绑定到编辑器的正确方式：watch activeTab 变化时自动切换 chat session
4. CDP 验证必须模拟真实用户场景（有 activeTab 的编辑器），不能假设 DOM 存在就够
5. 测试后必须清理数据和文件，避免污染用户会话
6. 构建成功后需要实际 CDP 验证而不是只看编译通过

# 2026-08-16 Skill/MCP/Agent 真实执行链路

## 问题
1. `skill-engine.js` 和 `skill-validators.js` 是两个孤立的 IIFE 文件，从未被任何模块 import，Vite 构建时警告 "can't be bundled without type='module'"
2. CDP 验证显示 `hasSkillEngine: false`，说明 Skill 执行引擎从未被加载
3. `mcp-protocol.ts` 存在但没有任何地方 import/使用，纯死代码；`ToolRegistry` 注册了 4 个本地工具但无法被调用
4. ChatPanel 只把 skill 模板作为 system prompt 注入，没有真实调用 SkillExecutionEngine 的 chain/splitMerge/multiStep
5. Agent store 的 Agent 接口缺少 tools 字段，无法把可用工具暴露给 AI

## 修复记录
1. `skill-engine.js` / `skill-validators.js` 移到 `public/` 目录，Vite 会原样复制到构建产物
2. 两个文件内部改为 `window.SkillExecutionEngine = exports` / `window.SkillValidators = validators`，确保挂载到全局
3. `index.html` 在 Vue 应用之前用普通 `<script>` 加载这两个文件，绕过 Vite module 打包限制
4. `main.ts` import `mcp-protocol` 和 `tool-registry`，挂到 `window.MCPProtocol` / `window.ToolRegistry`
5. ChatPanel `sendMessage` 增加 Skill 执行协议：
   - 有 enabledSkills 时按 `executionMode` 调用 `SkillExecutionEngine.chain/splitMerge/multiStep` 预加工输入
   - 输入以 `@tool-name {params}` 开头时走 `MCPProtocol.callToolLocal` 真实工具调用
   - 常规对话仍走 `callApi` + `useAiRequest`
6. Agent 接口增加 `tools?: string[]`，ChatPanel 把选中 Agent 的 tools 注入 system prompt

## 验证结果
1. `window.SkillExecutionEngine` 加载成功（`hasSkillEngine: true`）
2. `window.SkillValidators` 加载成功（`hasValidators: true`）
3. `window.MCPProtocol` / `window.ToolRegistry` 已挂载，4 个内置工具注册完成
4. CDP 实际调用 `MCPProtocol.callToolLocal('text.wordCount', { text: '神意助手测试文本' })` 返回 8
5. CDP 实际调用 `SkillExecutionEngine.chain()` 用 fake skill 跑通完整链路，返回文本和 reports
6. ChatPanel 挂载正常，send 按钮/输入框存在，消息容器有内容
7. `npx vite build` 成功，skill-*.js 正确复制到 dist-renderer，Vite 不再报 "can't be bundled" 警告

## 经验教训
1. `public/` 是 Vite 放"仅原样复制"文件的正确目录，不需要 Vite import；`src/services/` 只放被打包的文件
2. IIFE + `<script>` 直引是不需要改写成 ES module 的最稳方案；在 `main.ts` import IIFE 会导致 Vite 报错或 var 不挂全局
3. MCPProtocol 是工具调用的桥接层，必须由主入口 import 并挂到 window 才能被 ChatPanel/Agent 使用
4. `@工具名 {参数JSON}` 前缀是用户在对话框直接调用本地工具的自然入口
5. 行为等价不只指 UI/交互，还包括工具层真实执行：skill 模板注入 prompt ≠ skill 真实跑 engine

# 2026-08-16 "插入"与"替换"按钮行为拆分

## 问题
1. 右侧对话 assistant 消息原有两个按钮："应用"和"替换"，但两者代码逻辑完全一样（选中片段替换 / 无选中整章替换）
2. "应用"语义含糊，用户不清楚它是"插入"还是"替换"
3. 用户明确要求：不叫"应用"，叫"插入"；且两个按钮职责必须真正分开

## 修复记录
1. ChatMessage.vue 文案改为"插入"和"替换"，提示分别改为"插入到光标处" / "整章替换为消息内容"
2. ChatPanel.vue 将原 applyToEditor / replaceSelection 重构为：
   - insertToEditor(content)：有选中文字 → 替换选中区间；无选中 → 在光标处插入内容，不破坏原正文
   - replaceWhole(content)：无论是否选中，确认弹窗后整章替换为消息内容
3. ChatPanel.vue 模板事件绑定同步更新

## 验证结果
1. npx vite build 构建成功
2. CDP 注入 assistant 消息后，DOM 实测按钮为 ["复制", "重生成", "插入", "替换"]
3. 用户可预期行为：插入 = 光标处插入；替换 = 确认后整章替换

## 经验教训
1. 两个语义相近的按钮如果代码完全一样，名称不同反而制造困惑；行为必须可区分
2. 插入与替换的边界：插入保留原文（光标处落点），替换是破坏性操作（确认弹窗），用户感知差异要明确
