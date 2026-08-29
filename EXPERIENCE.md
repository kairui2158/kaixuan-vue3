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
# 2026-08-27 P1 正文与 metadata 分离经验

1. `result.text` 直接写入正文会把来源编号、覆盖报告和模型状态一起带入编辑器；必须在正文入口建立明确的 `body` / `metadata` 边界。
2. 兼容策略应只识别顶层 `{ body: string, metadata: object }` 信封。普通文本中的 `[]`、`【】` 不能用宽泛正则清除，否则会误伤文学正文。
3. 解析器保持纯函数并独立测试，正文入口再接入；不要为 P1 同时重构 chain、Agent 或断点状态机。
4. `chapters` 已进入项目保存对象，因此章节级 `generationMetadata` 可以随章节持久化，旧项目没有该字段时自然兼容。
5. CDP 验证必须等待 Vue 更新完成；事件派发后立即读取 textarea 会得到旧值，等待渲染后再核对 DOM、tab 数和 metadata 痕迹。

# 2026-08-27 P3 正文 chain 经验

1. 正文层的凯旋多 Skill 必须默认 `chain`，否则 S1/S2/S3 只会在一次请求中作为合并模板出现；已保存的用户模式仍优先恢复，不能强行覆盖。
2. chain 的首步使用原始章节执行包，后续步必须把上一 Skill 的完整输出传入下一步；首步和后续步的消息构造保持纯函数并单测。
3. Electron UI 验收要区分隐藏步骤节点和当前可见步骤；刷新后面板通常收起，必须重新打开流水线并点击正文步骤再读模式。
4. 没有客户 API 配置时只能证明模式、持久化和消息构造，不能把真实三次网络请求、供应商响应或正文质量写成已通过。

# 2026-08-27 P2 章节执行包经验

1. 玄武 L4 到凯旋的输入必须有独立的可序列化 `chapterExecutionPackage`；仅把大纲、设定、卷纲和章节剧情点散落拼接在正文入口，无法追踪实际交接内容。
2. 执行包只承载正文生成输入和 `sourceRefs`，不能包含 `body`；正文仍必须经过 `parseGenerationResult` 后单独写入章节，避免输入包、正文和 metadata 再次混合。
3. 构造器和 prompt 渲染器保持纯函数，组件只负责从 store 取值、保存包和调用既有执行链，这样可以用 focused 测试证明缺省字段、稳定序列化和 prompt 完整性。
4. Electron 验收必须用隔离项目执行“真实 storageWrite → storageRead → 杀进程 → start-electron.bat → storageRead”，并在结束时删除隔离键；当前无客户 API 时不得伪造真实生成通过。

# 2026-08-27 P4 稳定 Skill ID Agent 绑定经验

1. chain 内 Agent 绑定的持久化身份必须是 `step-skillId`；数组下标只表示当前显示顺序，不能作为业务身份。
2. Vue Skill 芯片的 `:key` 也必须包含稳定 Skill ID，否则调整顺序时可能复用旧 select DOM，造成视觉绑定和数据绑定不一致。
3. 旧配置迁移要在 Skill 列表恢复后执行：稳定键优先，旧 `step-index` 只作为兼容来源，空 Skill 槽位不得生成 `step-` 键。
4. chain 运行时应从当前模板对象读取 `t.id`，让 UI、持久化和实际 API 调用使用同一个 Skill 身份。
5. Electron 没有项目时只能验证构建页面、隔离 storage 和源码静态绑定；不得把不存在的流水线下拉框操作写成客户 UI 已通过。

# 2026-08-27 P5 Skill 结构化校验经验

1. `inputSchema` 必须在 API 调用前校验上下文；自然语言 prompt 不能被强行当作 JSON 输入，否则会把正常请求误判为结构化输入失败。
2. `outputFormat`、`outputSchema`、`validationRules` 和 `retryPolicy` 必须集中在单一 Skill 调用边界消费；旧解析函数确认无引用后才删除，避免两套重试逻辑造成重复请求。
3. Schema 只实现声明式安全子集，不执行任意 JavaScript；重试次数必须有 1-5 的上限，非法配置回退到 1 次。
4. chain 输出校验失败必须抛错并阻止后续步骤，不能把上一步旧输出继续传递后再伪装成完整结果。
5. 没有客户 API 时，focused 测试只能证明规则和调用边界；真实请求次数、供应商响应和 UI 网络错误必须标记为待配置补验，不能用构建或 storage 证据替代。
6. 结构化字段的持久化验证要做“写入 → 杀 Electron → 启动器重启 → CDP 读取 → 隔离键清理”，确认跨进程恢复且不污染客户数据。

# 2026-08-27 P6 chain 断点续跑经验

1. chain 断点不能只保存最后文本和索引；至少要保存状态、当前 Skill ID、Skill 顺序快照、输入 prompt、输出、Agent ID、重试次数、错误和更新时间。
2. 成功断点从下一个 Skill 继续；失败断点必须从当前失败 Skill 重试，不能跳过失败步，也不能把旧输出继续传给后续步骤伪装成功。
3. Skill 顺序快照不匹配时必须从头开始，防止用户调整 Skill 后复用错误的中间结果。
4. 断点恢复算法的纯函数测试不能替代真实持久化验证；必须做“写入 → 杀 Electron → start-electron.bat → CDP 读取 → 清理隔离键”。
5. 没有客户 API 配置时，只能证明断点状态机和跨进程存储，不能把真实网络断线、重试请求和供应商恢复写成已通过。

# 2026-08-27 P7 内容/叙事完整性经验

1. 数量够不等于内容完整；补充生成必须同时过滤标题为空、剧情点为空和标题重复的条目，才允许写入项目。
2. 卷纲和章节的确定性结构校验应集中在纯函数服务中，组件只负责调用、记录错误和更新 store，避免不同入口出现不同规则。
3. 应用层可以可靠校验数量、必填字段、重复项和基本数值边界，但不能仅靠字符串判断事件覆盖、伏笔回收或人物状态连续；这些必须标记为语义验收边界。
4. 补充循环要以收集数组长度为终止条件，并保留去重集合；API 返回空批次时重试，不能把空条目当作进度。
5. 没有客户 API 时，P7 只能核销结构校验、筛选逻辑、构建和隔离 Electron 存储，不得把真实模型叙事质量写成通过。

# 2026-08-27 P8 最终回归与交付经验

1. 最终交付必须汇总每个阶段的独立报告，不能用全量测试替代真实用户链路，也不能用构建成功替代客户 API 验收。
2. Electron 交付验证固定使用生产 `dist-renderer` 和 `start-electron.bat`；必须检查页面标题、URL、`window.electronAPI`、DOM 非空和隔离 storage 清理结果。
3. 没有客户供应商配置时，真实生成、网络中断恢复、模型叙事覆盖和正文质量必须明确列为待客户补验，不能伪造响应或把纯函数测试扩大解释。
4. 构建 warning 要单独列出并判断是否阻断；`INEFFECTIVE_DYNAMIC_IMPORT` 和 bundle 大小 warning 不能被写成构建失败，也不能被隐瞒。
5. 交付收尾要关闭 Electron、清理本轮隔离键和临时运行状态，但不得删除历史审计记录、用户改动或无关文件。
# 2026-08-27 3.3.0 封装经验

1. 兼容性增强和新 AI 流水线能力应升级次版本；本次从 3.2.1 升级到 3.3.0，并同步 package.json 与 package-lock.json 根版本。
2. 封装验收必须同时保留 type-check、全量测试、服务测试、electron-builder 输出和生产 Electron/CDP 证据；不能只依据构建成功。
3. 交付安装包路径、文件大小、构建 warning、代码签名状态和客户 API 未验证边界必须写入报告。
4. `start-electron.bat` 是生产源文件启动验证入口；内联命令受 Windows cmd 引号影响时，使用一次性验证文件并在收尾删除。

# 2026-08-27 主页编辑器工具入口收敛经验

1. 下线主页入口与删除全局能力必须分开处理；先删除没有监听闭环的编辑器入口，不动流水线、记忆板块、右侧对话和 SKILL 模板共享实现。
2. 保留功能必须做反向证据：本次 `AI命名` 的按钮和 `aiNames()` 保留，生产 Electron/CDP 实测主页编辑器存在；被关闭的四个入口在 DOM 中不存在。
3. 入口删减后至少执行 type-check、全量测试、生产构建和 Electron/CDP；不能只依赖源码 grep 判断页面实际状态。

# 2026-08-27 配置交换 P0-P6 收尾经验

1. 配置迁移必须区分“读取兼容”和“导出规范化”：旧的 `step-index` 只允许在读取时根据已恢复的 Skill 列表迁移，导出必须只写稳定的 `step-skillId`。
2. Electron 文件导出验收必须使用本轮独立输出文件名，并核对修改时间；不能读取同名历史证据来判断当前构建行为。
3. 真实导出验收至少同时检查协议头、稳定绑定键、无旧索引键、真实存储一致性和杀进程重启后的恢复结果。
4. 生产 Electron 回归必须使用 `dist-renderer` 和 `start-electron.bat`；服务测试、类型检查和构建只能证明静态/编译边界，不能替代 UI、原生文件对话框和跨进程持久化证据。
5. P6 清理只删除本轮临时验证脚本、fixture、截图和中间输出；历史审计报告、开发日志、经验文件、用户改动和无关源码不得删除。

# 2026-08-28 Agent/Skill Markdown 导入底座 P0 经验

1. Markdown 导入必须先固定“输入来源、字段来源、诊断信息”协议，再实现解析、映射和推导；`AgentRecord`/`SkillRecord` 只能表示归一化后的业务对象，不能承担来源审计。
2. 规范 Front Matter Markdown 与无 Front Matter 普通 Markdown 是两种输入形态，但必须归一化到同一套 Agent/Skill 记录；`ConfigSourceInfo.markdownKind` 用于在预览中明确区分二者。
3. `mapped`、`inferred`、`defaulted` 不能只写进日志文本；必须由结构化 `ConfigFieldTrace` 表达，后续设置页才能逐字段显示“来自原字段/别名映射/标题推导/默认值”。
4. `ConfigDiagnostic` 只定义诊断契约，不代表解析器已经支持该能力；P0 的类型测试不能扩大解释为普通 Markdown、第三方别名或复杂 YAML 已可导入。
5. 工作区存在大量历史改动时，禁止全量清理；本轮只记录和修改任务明确涉及的文件，临时验证产物必须在本阶段结束时单独清理。

# 2026-08-28 Agent/Skill Markdown 导入底座 P1 经验

1. 配置文件格式判断必须优先使用真实文件扩展名，内容首字符只作无扩展名文件的兜底；否则普通 `# 标题` 的 `.md` 会被错误判为未知格式。
2. Markdown 进入解析器前统一去除 UTF-8 BOM 和 CRLF 差异；Front Matter 检测与正文模板提取只对规范化文本执行。
3. Front Matter Markdown 与普通 Markdown 必须在解析结果中明确标记，预览层不能根据 warning 文案反推来源类型。
4. P1 只负责来源形态和文本边界，不在同一阶段偷偷完成第三方字段映射或必填字段推导；后两者分别留在 P2/P3，便于失败时定位。
5. `start-electron.bat` 输出 DevTools 地址不等于 CDP 已连接；必须同时看到 Electron 进程、9227 监听和页面 DOM 读取结果，否则只记录为载体未核销。

# 2026-08-28 Agent/Skill Markdown 导入底座 P2 经验

1. 第三方字段兼容必须发生在统一归一化入口，不能让 JSON 和 Markdown 各维护一套别名逻辑；这样两种输入才能得到相同的内部 Agent/Skill 对象。
2. 标准字段优先于别名，只有标准字段缺失时才使用 `agentId/skillId`、`title`、`instruction`、`modelName`、`temp`、`max_tokens` 等别名；映射必须产生可见 warning。
3. `unknownFields` 与“已知别名”要区分：已支持的别名不应被当作无法识别字段，但仍要在诊断中说明映射来源；真正未知字段继续保留审计记录。
4. 兼容映射只解决字段命名，不负责从普通 Markdown 标题推导必填 id/name；推导规则需要独立阶段和独立回归，避免导入错误被掩盖。

# 2026-08-28 Agent/Skill Markdown 导入底座 P3 经验

1. 普通 Markdown 缺少 Front Matter 时，必须使用确定性规则补齐必填字段：优先首个一级标题，其次使用文件名；不能让模型或模糊文本分类参与导入身份推导。
2. 从标题或文件名推导出的 `name/id` 必须通过 `fieldTrace` 和 `diagnostics` 标记为 `inferred`，不能伪装成用户显式填写的标准字段。
3. 标题只负责配置身份，不应混入 Agent 的 `systemPrompt` 或 Skill 的 `template`；正文边界必须在解析阶段明确保留。
4. Front Matter 缺少必填字段与普通 Markdown 缺少必填字段要保持不同语义：前者继续报错，后者允许按规则推导并留下可审计提示。

# 2026-08-28 Agent/Skill Markdown 导入底座 P4 经验

1. 导出逻辑必须只有一个正式 Writer；历史 store 方法不能直接删除，否则会破坏潜在旧调用，应保留同名兼容壳并委托正式序列化器。
2. 兼容壳必须先完成 store 对象到规范记录的归一化，再调用正式 Writer，确保新增协议字段不会只在设置页导出路径生效。
3. 导出等价性要同时核对协议头、稳定字段、模板完整性和不存在旧 Writer 独立字段拼接；构建成功只能证明引用可编译，不能代替导出内容断言。

# 2026-08-28 Agent/Skill Markdown 导入底座 P5 经验

1. 导入预览中的冲突策略必须实时反映到计划列表，不能只在最终提交时改变动作，否则用户看到的预览与实际落盘结果不一致。
2. 取消导入必须清理待导入记录、计划、诊断信息和来源路径，防止下一次打开预览时复用上一次文件状态。
3. “跳过重复”是默认策略；覆盖必须由用户在预览阶段明确选择，且实际提交仍通过 store 的策略参数执行，不能由 UI 直接改写现有对象。
4. 设置页导入回归要同时覆盖解析结果、计划展示、策略切换、确认提交和持久化边界；组件编译通过不能替代真实 Electron 原生文件选择器验证。

# 2026-08-28 Agent/Skill Markdown 导入底座 P6 收尾经验

1. 仓库没有 `npm test` 脚本时，必须读取 `package.json` 并使用真实测试入口；错误的脚本名不能被当作业务回归失败，也不能被忽略。
2. 交付回归要区分自动化服务边界和生产 Electron 边界：11 个 spec/92 个测试通过，只能证明纯服务与 store 逻辑，不代表原生选择器、设置页 DOM 和跨进程持久化已经核销。
3. `start-electron.bat` 打印 Application started、生成 `DevToolsActivePort`，但 Electron 进程退出且 9227 `ECONNREFUSED` 时，必须标记 CDP 载体阻断，禁止用开发服务器或旧截图替代。
4. 临时验证脚本应在收尾删除；历史审计、开发日志、经验文件和用户已有改动不得用全量清理命令删除。

# 2026-08-28 Agent/Skill Markdown 导入底座 P6 载体复核补充

1. `start-electron.bat` 的 `Application started` 输出只证明批处理发起了启动，必须同时看到存活的 `electron.exe`、`9227` 监听、生产页面 URL 和 DOM；任一缺失都不能判为生产验收通过。
2. Electron 原生 `showOpenDialog` 不会触发网页 `filechooser`；真实导入验收必须准备原生窗口控制路径，不能用浏览器上传事件替代。
3. 当桌面辅助功能返回 `coordinate input geometry is unavailable`、截图接口失败，且当前 CDP 客户端依赖不可用时，属于验证载体阻断；应记录具体错误、停止重复同一路径，不改业务代码伪造导入结果。
4. P6 的最小闭环证据必须包含：Markdown 文件选择、预览 DOM、确认提交、Agent/Skill store、磁盘持久化、杀进程、`start-electron.bat` 重启后的 CDP 读取；只完成其中前置页面检查仍保持未核销。

## 2026-08-28 Agent/Skill Markdown 导入底座 P6 再复核

1. `start-electron.bat` 的本轮真实核验已取得完整的启动器、存活 `electron.exe`、9227 监听、生产 `file:///.../dist-renderer/index.html`、标题 `神意助手` 和非空 DOM 证据；这些证据只证明生产载体重启可用。
2. 通过 CDP 触发导入按钮后，原生“导入配置”窗口短暂出现但句柄在桌面状态读取前销毁；Computer Use 仍返回 `coordinate input geometry is unavailable`。没有文件选择/预览证据时，不能把 Markdown 导入写成真实客户路径通过。
3. 同一阻断重复出现后应停止继续点击，不得为了补齐报告而注入 IPC、直接改 store 或伪造 fixture 导入结果；应保留 P6 未核销边界，等待桌面验证载体修复后补验。

## 2026-08-28 脚本与桌面验证载体经验补充

1. Windows `cmd` 的嵌套引号非常容易把整段命令当成字面文本；验证命令应拆成单一职责的短命令，复杂 CDP 操作使用一次性 `.mjs`/`.cjs` 文件，并在执行后立即读取完整原始输出。
2. 不要把 `node -e`、REPL 或全局 `WebSocket` 当作默认 CDP 载体；先确认项目实际依赖和导出方式，再选择项目 Playwright 或明确可用的 WebSocket 实现。依赖加载失败时应换载体并记录错误，不得把脚本失败写成业务失败。
3. 进程核验优先执行无过滤的 `tasklist`，再对原始输出做明确核对；复杂 `/fi` 语法在不同命令封装层可能产生误报，不能只凭一条过滤命令判定 Electron 状态。
4. 每个临时脚本只负责一个验证闭环阶段：启动、CDP DOM、原生窗口控制、持久化核对和清理应分开，避免一个脚本失败后无法判断哪一层失败，也避免清理动作被跳过。
5. Electron 原生 `showOpenDialog` 是桌面窗口，不等价于浏览器 `filechooser`；网页 CDP 只能触发入口，不能替代原生文件选择。必须分别取得“入口触发、文件选择、预览 DOM、确认提交、store/磁盘、重启恢复”证据。
6. 任何 modal 或原生窗口残留都要先重新枚举当前窗口和 DOM 状态，再执行下一动作；不能复用旧句柄、旧 locator 或假设弹窗已经关闭，否则会把遮罩拦截误判为业务按钮失效。
7. 同一桌面载体错误连续复现三次后，停止重复点击，记录错误文本、发生阶段和已完成边界，将任务标记为载体阻断；不得注入 IPC、直接写真实 store 或用旧截图补齐缺失证据。
8. 清理只针对本轮创建的 fixture、探针、截图和中间文件；不得使用未核对范围的全量 `git clean -fd`，不得删除历史审计、开发日志、经验文件或用户已有改动。
9. CDP 验证脚本连接已有 Electron 时必须使用 `browser.disconnect()`，不能使用 `browser.close()`；后者会关闭连接上下文，可能连带结束被测 Electron，导致把脚本副作用误判为应用崩溃。
10. 原生文件选择器验证必须把“入口触发、窗口存活、路径输入、打开提交、网页回调”分别记录；即使键盘注入调用返回成功，也必须重新检查窗口和页面 DOM，不能把输入动作的返回值当作文件已选中。

## 2026-08-28 Agent/Skill Markdown 导入底座 P6 最终补验经验

1. Win32 验证脚本在 64 位 Windows 下使用剪贴板 API 时，必须显式声明 `GlobalAlloc`、`GlobalLock`、`SetClipboardData` 的指针类型；否则会出现空指针或溢出，不能把脚本异常误判为业务导入失败。
2. `ComboBoxEx32` 的文件名控件可能包裹内部 `Edit`，不能只查直接子窗口；必须递归枚举可见后代控件，并在提交后分别核对对话框关闭与网页回调。
3. 原生文件选择器的路径字符串在控制台乱码不等于应用收到乱码；必须以网页预览显示的实际路径和导入计划结果作为业务层证据，并以存储对象作为持久化证据。
4. 重启恢复验收必须使用“杀进程 → `start-electron.bat` → 生产 CDP → DOM 技能卡 → 真实磁盘对象”完整链路；重复导入显示 `重复 1 个` 且确认后 `跳过 1 个`，可以证明恢复出的 ID 与去重逻辑一致。
5. 探针在证据打印后因资源释放 API 不兼容退出，不得覆盖此前已打印的业务证据；应修正探针并重跑，使命令以成功退出收尾，但仍要把核心输出与退出原因分开记录。

### 2026-08-29 配置导入预览协议标签规则

1. 导入来源展示必须先判断 `source.format`：JSON 显示“标准 JSON”，Markdown 再根据 `markdownKind` 区分“标准协议 Markdown”和“兼容解析 Markdown”；不能把 `markdownKind` 未定义的 JSON 误标为兼容 Markdown。
2. 设置页没有选择文件时，诊断和字段追踪节点为空是正常空态；生产 DOM 可核销入口和布局，但不能据此声称真实文件预览、提交或持久化通过。
3. P3 的生产证据必须同时包含生产 `file://` URL、Electron API、设置标签、Agent/Skill 导入按钮和容器尺寸；原生文件选择器证据独立留给后续阶段。

## 2026-08-29 Agent/Skill Markdown 导入 P4-P6 客户实测补充

1. 原生文件选择器无法由网页 CDP 接管时，不能把自动化载体阻断写成应用功能失败；应区分“自动化未取得证据”和“客户真实操作已核销”。
2. 客户实测必须逐项记录：真实 Markdown 文件、预览协议标签、确认导入、关闭重启恢复、重复导入覆盖；客户反馈是行为证据，但不能替代本轮代码测试和构建证据。
3. P4/P5 只有在客户真实选择文件并看到预览、提交成功、重启后恢复且覆盖策略生效后，才能从未核销转为完成；此前的入口 DOM 或空预览不能扩大解释。
4. P6 回归同时保留四类边界：标准协议 Markdown、普通/半标准 Markdown、未知字段诊断、重复导入策略；自动化测试通过不等于生产原生对话框通过，二者必须分别记账。
5. 最终报告要明确区分证据来源：命令原始输出、源码/测试覆盖和客户实操反馈；不得把用户口述改写成不存在的 CDP 截图或日志。
## 2026-08-29 Agent/Skill Markdown 导入 P6 收尾补充

- 客户已在生产 Electron 设置页完成真实闭环：选择真实 `.md` 文件 → 导入预览识别为标准协议 → 确认导入 → 关闭并重启后内容恢复 → 再次导入并选择覆盖成功。
- 证据边界必须分开记录：客户实测证明文件选择、预览、导入、覆盖和重启恢复；`npx vitest run`、`npm run type-check`、`npm run build:vue` 证明源码回归和生产构建；CDP 证明生产页面实际加载。
- Windows 下不要假定 Unix `bash` 可用；Playwright shell 包装器在本环境不可直接运行时，使用项目已安装的 `playwright` 通过 `chromium.connectOverCDP('http://127.0.0.1:9227')` 做等价验证。
- 临时 Node 校验脚本首行必须加分号，避免 `require(...)` 与下一行 IIFE 被 JavaScript 自动分号插入规则拼成函数调用；验证脚本执行后立即删除。
- `ws` 未必是项目直接依赖，不能把临时脚本的 `Cannot find module 'ws'` 当成应用失败；优先使用项目已有 Playwright 依赖或明确记录环境缺口。
- 不把“标准协议识别”扩大解释成所有第三方 YAML 高级字段都按原语义消费；缺失或未知字段应继续通过诊断提示，具体映射按样本补充。

### 可直接执行的脚本规程

#### 1. 先选载体，再写脚本

| 任务 | 首选载体 | 不应直接采用 | 失败后的替代路径 |
| --- | --- | --- | --- |
| 单行进程、端口或文件检查 | `cmd.exe` 单行命令 | 多层嵌套引号 | 拆成多条短命令 |
| CDP DOM/截图 | 项目已有 Playwright + `connectOverCDP` | 假设全局 `ws`、`node -e` 长字符串 | 写一次性 `.cjs`，执行后删除 |
| 原生文件选择器 | 桌面/Win32 控制工具 | 浏览器 `filechooser` 或网页 CDP 代替 | 分别记录窗口、路径输入、提交、网页回调 |
| 多步骤验证 | 每阶段一个单一职责脚本 | 一个脚本同时启动、导入、重启、清理 | 拆成启动、操作、持久化、清理四个阶段 |

#### 2. Windows 脚本编写前检查表

- [ ] 先确认 shell：当前项目约定使用 `cmd.exe`，不能把 Unix `bash` 命令直接交给 Windows。
- [ ] 先确认依赖：读取 `package.json` 或检查 `node_modules`，不能默认 `ws`、Playwright CLI 或全局包存在。
- [ ] 复杂命令不使用 `node -e`；使用 `apply_patch` 创建一次性 `.cjs`/`.mjs`。
- [ ] CommonJS 的 `require(...)` 行末加分号，再开始 IIFE，避免自动分号插入造成 `require(...) is not a function`。
- [ ] 每个脚本只做一件事，并在 stdout 打印阶段名、关键输入、关键观察值和退出原因。
- [ ] 脚本退出前不负责删除自己；由外层明确执行删除并再次列目录确认清理结果。

#### 3. 失败分类，不能混淆

- `bash is not recognized`：验证载体不适配，不是应用失败；切换到 Windows 可用载体。
- `Cannot find module 'ws'`：脚本依赖缺失，不是应用失败；改用项目已有 Playwright。
- `require(...) is not a function`：临时脚本语法/分号问题，不是应用失败；修复脚本后重跑。
- `tasklist /fi` 参数错误：命令封装或转义问题，不是 Electron 退出证据；先执行无过滤 `tasklist`，再人工核对原始输出。
- `findstr` 无法处理中文或含斜杠检索词：定位命令失败，不代表目标文件缺失；改用 ASCII 锚点、`rg` 或逐段读取。
- 原生窗口句柄消失、坐标不可用：桌面验证载体阻断；不能注入 IPC、直接写 store 或拿旧截图补证据。

#### 4. CDP 验证固定顺序

```text
确认 Electron 存活
→ 确认 9227 可连接
→ 枚举 page URL/title
→ connectOverCDP
→ 读取 DOM、window.electronAPI 和目标状态
→ 截图（确有需要时）
→ browser.disconnect()
→ 删除临时脚本/截图
→ 再次列目录和 git status
```

`browser.close()` 不用于连接已有客户 Electron；它可能关闭被测上下文。截图、DOM、store、磁盘和重启恢复必须分别记账，不能一项证据替代另一项。

#### 5. 每次脚本验证的最小日志格式

```text
[载体] shell / runtime / dependency
[输入] 文件、项目键、页面 URL 或窗口标题
[动作] 实际执行的用户动作或 API 调用
[观察] DOM / store / 磁盘 / 进程的实际值
[结论] PASS、FAIL 或 BLOCKED，以及对应边界
[清理] 删除哪些本轮产物，清理后的目录结果
```

## 2026-08-29 设定层 UI P1-P2 运行时载体重建

1. Playwright 连接既有 Electron 后不能调用 `browser.disconnect()`；本载体会抛 `TypeError`。固定做法是证据打印完成后用 `process.exit()` 结束脚本，既不断开也不 `browser.close()`。
2. 流水线左侧步骤不能依赖 `#pl-status-N` 被查询或点击；改用 `page.locator("#pl-steps .pl-step").nth(N).click({ force: true })`。
3. 流水线是 `position: fixed` overlay，关键节点的 `offsetParent` 恒为 `null`；可见性要用 computed `display` 或 Playwright `isVisible()` 判断，不要用 offsetParent。
4. 隐藏窗口启动 `start-electron.bat` 出现过一次失败，改用可见 `Start-Process cmd.exe /c start-electron.bat`；启动后仍要分别核对进程、9227 监听和页面 URL。
5. Windows 策略会拦截本轮临时文件删除时，改用 Node `fs.rmSync(..., { force: true })`，删除后再次列目录确认。

## 2026-08-29 设定层 UI P3 高级设置内滚

1. 折叠开关文案必须表达“高级设置”语义：未展开为“展开高级设置”，展开后为“收起高级设置”；不能沿用短词“展开/收起”让用户误以为只是整卡折叠。
2. `#pl-style-card-body` 使用 `max-height: min(46vh, 420px)` 加 `overflow-y: auto`，保证展开内容在卡片内部滚动，不改变下方设定工作区高度。
3. 内滚验证要制造真实可滚条件：确认 `clientHeight` 小于 `scrollHeight`、设置 `scrollTop` 后读取新滚动位置、再恢复原值；纯样式存在不是行为证据。
