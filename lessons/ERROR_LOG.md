# 错误实时记录

## 2026-08-22｜P6｜CDP 验证载体第一次失败
- 错误描述：使用 `cmd.exe` 内联 `node -e` 连接 Playwright CDP 时返回 `Unterminated string constant`。
- 根因分析：Windows `cmd.exe` 对嵌套引号和转义处理破坏了内联 JavaScript；不是 Electron 或业务代码失败。
- 修复方案：改用 `_audit` 下的临时 `.cjs` 验证文件，执行后删除，不通过页面内替身或直接调用业务函数绕过验证。
- 修复验证结果：待执行。
- 是否闭环：待修复。

## 2026-08-22｜P6｜CDP 基线脚本无输出
- 错误描述：`node _audit\\p6_runtime_baseline.cjs` 返回后没有生成 `tests/reports` 报告或 `test_evidence` 截图，也没有可信的标准输出；同时 Electron 与 9227 仍在运行。
- 根因分析：当前命令载体未能提供可追溯的脚本执行结果，原因尚未确认；不能把空输出解释为验证通过。
- 修复方案：改用显式 `cmd /c` 诊断、检查 Node/Playwright 解析和 CDP 页面列表，再重新执行基线脚本。
- 修复验证结果：待执行。
- 是否闭环：待修复。

## 2026-08-22｜P6｜UI 回归验证器使用错误项目弹窗选择器
- 错误描述：P6 UI 脚本使用不存在的 `#project-modal` 判断和关闭项目弹窗，实际遮罩继续拦截 `#btn-pipeline` 点击并超时。
- 根因分析：验证器没有先读取 `ProjectModal.vue` 的真实模板；该组件根节点是无 ID 的 `.modal-overlay`，关闭按钮也是无 ID 的 `.btn-close`。
- 修复方案：改为按 `.modal-overlay` 中的标题“项目管理”和真实可见 `.btn-close` 定位；每次切换面板前先确认遮罩关闭。
- 修复验证结果：待重跑。
- 是否闭环：待修复。

## 2026-08-22｜P6｜UI 回归验证器未处理遗留遮罩
- 错误描述：修正选择器后再次运行，项目弹窗仍由上一次中断的脚本保持打开；脚本无条件点击项目入口，Playwright 被遮罩拦截并再次超时。
- 根因分析：验证器没有在每次闭环开始前读取并收束已有弹窗/遮罩状态。
- 修复方案：增加 `closeVisibleProjectModal()` 前置分支；已打开时先真实点击该弹窗的 `.btn-close`，关闭后再进入项目入口。
- 修复验证结果：待重跑。
- 是否闭环：待修复。

## 2026-08-22｜P6｜流水线层导航验证器选择器过时
- 错误描述：P6 UI 脚本用 `[data-step]`、`.pipeline-step-tab`、`.step-tab` 查找流水线层导航，实际 DOM 五层使用 `.pl-step`，导致 `PIPELINE_STEP_NAV_DISCOVERED=false`。
- 根因分析：验证器未依据 `PipelinePanel.vue` 当前模板的 `#pl-steps .pl-step` 结构编写选择器。
- 修复方案：改用 `#pl-steps .pl-step`，并以五个真实节点文本和顺序作为断言。
- 修复验证结果：待重跑。
- 是否闭环：待修复。

## 2026-08-22｜P6｜流水线层导航断言未去除展示装饰
- 错误描述：改用真实 `.pl-step` 后，断言得到 `"1\\n大纲\\n✓"` 等展示文本，未等于裸层名数组。
- 根因分析：验证器把用户可见的层序号/完成标记一起当成语义值比较。
- 修复方案：提取 `.pl-step-label` 文本，只比较五层业务名称和顺序。
- 修复验证结果：待重跑。
- 是否闭环：待修复。

## 2026-08-21 22:01:00｜P0｜纯函数验证载体首次失败
- 错误描述：`node scripts/tmp-p0-memory-merge.cjs` 调用 TypeScript 编译单文件时返回 `TS5112: tsconfig.json is present but will not be loaded if files are specified on commandline`。
- 根因分析：TypeScript 7 对“指定输入文件 + 仓库 tsconfig”要求显式传入 `--ignoreConfig`；不是业务源码编译错误。
- 修复方案：只在独立验证载体的 tsc 参数中增加 `--ignoreConfig`，不修改项目 tsconfig 和业务代码。
- 修复验证结果：待重跑。
- 是否闭环：待修复。

## 2026-08-21 22:02:00｜P0｜纯函数验证载体第二次失败
- 错误描述：编译命令返回后，验证脚本找不到 `scripts/.tmp-p0-compile/memoryIO.js`。
- 根因分析：TypeScript 保留了源码目录结构，实际输出路径是 `scripts/.tmp-p0-compile/services/memoryIO.js`；脚本错误假设输出在临时目录根部。
- 修复方案：按 TypeScript 实际输出目录加载编译模块；业务代码不变。
- 修复验证结果：待重跑。
- 是否闭环：待修复。

## 2026-08-21 22:05:00｜P0｜CDP 导入验证首次失败
- 错误描述：`tmp-p0-cdp-import.cjs` 点击 `#btn-memory` 超时，Playwright 报告 `#panel-backdrop` 拦截指针事件。
- 根因分析：上一轮菜单验证留下记忆面板/遮罩处于打开状态，验证脚本无条件再次点击侧栏按钮，未处理“面板已经打开”的状态分支。
- 修复方案：验证脚本增加面板状态判断；已打开时直接复用，关闭时才点击；每次菜单操作前先关闭已有菜单。
- 修复验证结果：待重跑。
- 是否闭环：待修复。

## 2026-08-21 22:07:00｜P0｜CDP 导入验证第二次失败
- 错误描述：面板已打开，但点击 `#btn-import-memory` 等待 30 秒后超时，按钮未出现在 DOM 中。
- 根因分析：验证脚本在多次导入之间无条件点击 `.mem-more-btn`，没有确认下拉菜单是否已打开；按钮受 `v-if` 控制，菜单未打开时不存在。
- 修复方案：增加 `openMoreMenu()`，仅在导入按钮不可见时点击菜单按钮，并等待目标按钮可见后再操作。
- 修复验证结果：待重跑。
- 是否闭环：待修复。

## 2026-08-21 22:10:00｜P0｜CDP 导入验证第三次失败
- 错误描述：导入按钮已渲染并进入点击动作，但 Playwright 在点击阶段超时；应用停在 Electron 同步原生文件对话框。
- 根因分析：`window.electronAPI.dialogOpenFile` 由 `contextBridge` 暴露并同步调用主进程，渲染页内给该属性赋值未能替换底层 IPC 方法；页面自动化不能把原生文件对话框当作浏览器对话框处理。
- 修复方案：不再用页面内 API 替身伪造导入；改为准备真实测试 JSON 并用原生窗口输入路径，导入后再回到 CDP 检查 store、持久化和提示。验证脚本只保留 DOM/状态读取职责。
- 修复验证结果：待重跑。
- 是否闭环：待修复。

## 2026-08-22｜整合交付｜类型检查工具恢复后暴露历史类型债务
- 错误描述：将 TypeScript 固定到 `5.7.3` 后，`npm run type-check` 能进入源码检查，但因全局 `window.electronAPI` 缺少声明、旧 JS 模块缺少声明、组件接口和 Pinia 字段不一致等历史问题失败。
- 根因分析：此前 `typescript@7.0.2` 与 `vue-tsc` 的启动器不兼容，掩盖了源码级类型问题；工具修复后才暴露真实债务。
- 修复方案：本轮只修复阻断构建与解析的 `PipelinePanel.vue:88` 模板表达式错误；不在记忆整合交付中批量重构全项目类型系统。
- 修复验证结果：`npm run build:vue` 通过；`npm run type-check` 未通过，历史类型债务列入未核销边界。
- 是否闭环：工具链阻断已闭环；全项目类型检查未闭环。

## 2026-08-22 00:00:00｜P6｜记忆面板验证器路径错误
- 错误描述：验证器首次读取 `src/components/memory/MemoryPanel.vue`，文件不存在。
- 根因分析：按旧目录假设定位组件，没有先用 `rg --files src` 核对当前 Vue3 组件实际路径。
- 修复方案：改用实际路径 `src/components/common/MemoryPanel.vue` 继续核验；不修改业务代码。
- 修复验证结果：已读取真实模板与导入导出实现，确认合并导入和覆盖导入均有独立入口与确认分支。
- 是否闭环：已修复。

## 2026-08-22 00:00:00｜P6｜收尾备份命令引号错误
- 错误描述：使用 `cmd.exe` 执行临时证据备份时，命令字符串带有多余反斜杠引号，`copy` 报路径不存在。
- 根因分析：命令载体的引号层级处理错误，未先用单个文件做试拷贝。
- 修复方案：不删除任何文件，改用原生 `cmd` 无反斜杠引号语法，并先验证备份目录和单个文件存在。
- 修复验证结果：待重跑。
- 是否闭环：待修复。

## 2026-08-22 00:00:00｜P6｜最终进程清理命令分隔符错误
- 错误描述：`cmd.exe` 中把 `taskkill /F /IM electron.exe /T` 与后续查询用分号拼接，系统将 `/T;` 识别为无效参数。
- 根因分析：Windows cmd 不使用 PowerShell 风格分号作为命令分隔符。
- 修复方案：拆成独立命令调用；清理范围仍限定为 Electron 进程和本轮 P6 中间证据目录。
- 修复验证结果：待重跑。
- 是否闭环：待修复。

## 2026-08-22｜P6 收尾｜临时证据清理载体错误
- 时间戳：2026-08-22
- 所在阶段：P6 收尾
- 错误描述：PowerShell 清理命令被执行载体拒绝；改用 cmd 复制时工作目录解析为错误路径；cmd 内联 Node 脚本又因嵌套引号返回 `Unterminated string constant`。
- 根因分析：命令载体对复杂引号、相对路径和多段命令的解析不稳定，不是业务代码错误；首次失败后仍尝试了相同的内联结构，增加了无效重试。
- 修复方案：停止复杂内联命令，使用一次性 `_audit/p6_cleanup.cjs`，以绝对路径、工作区边界检查完成备份和删除；执行后删除该临时脚本。
- 修复验证结果：两张 P6 临时截图均输出 `[OK] ... backed up and removed`；`test_evidence` 中不再有 `p6_*` 截图；业务源码未被清理。
- 是否闭环：已修复。
## 2026-10-20｜设定锁定投影｜Electron 预检断言使用被压缩的源码符号
- 错误描述：真实 Electron 验证在启动前失败，提示 renderer bundle 缺少 `getLockedSettingsForLayer`。实际 bundle 已包含 `settings-projection-composed` 与投影实现，说明新代码已经进入构建产物。
- 根因分析：Vite/Rollup 构建会压缩并重命名函数标识符，验证脚本用未压缩源码符号做断言；这是脚本断言缺陷，不是应用实现缺陷。新鲜度检查本应断言稳定产物特征而不是可被压缩的源码名。
- 修复方案：预检断言改为同时检查稳定的 `settings-projection-composed` 事件类型和用户可见的 `设定锁定投影已组装` 标签，并继续保留旧通道 `[绑定设定]` 的反向断言。
- 修复验证结果：`node scripts/verify-settings-lock-projection-electron.mjs` 输出 `===== SETTINGS LOCK PROJECTION ELECTRON PASSED =====`；`report.json` 记录 `homeProjection.includesWangFang=true`、`excludesDraftLinZhou=true`，首页 assistant 回复落入 `activeMessages`，`home-layer/provider-requests.json` 保留完整请求体。
- 是否闭环：已修复。

## 2026-10-20｜设定锁定投影｜旧通道反向断言误伤旧输出解析器
- 错误描述：修正第一个预检后，脚本再次失败，提示 bundle 仍包含 `[绑定设定]`。
- 根因分析：`src/services/chainExecution.ts:50` 保留 `[绑定设定]` 是为了截断旧 SKILL 输出回显，不是提示词注入通道；真正禁止的是 `绑定设定：` 这类重复 prompt 通道。反向断言粒度过粗，把合法兼容解析器当成了旧路径。
- 修复方案：反向断言从 `[绑定设定]` 收窄为 `绑定设定：`，继续禁止旧注入通道，同时允许旧输出解析兼容存在。
- 修复验证结果：待重跑 `node scripts/verify-settings-lock-projection-electron.mjs`。
- 是否闭环：待修复。

## 2026-10-20｜设定锁定投影｜种子数据让“全卷生成”期望数归零
- 错误描述：真实 UI 运行到卷纲层时，应用提示“无效卷纲契约：期望卷数必须大于 0”，mock provider 收到 0 次请求。迁移、锁定、解锁、批量锁定截图和心跳均已产生，说明前半段真实 UI 操作是有效的。
- 根因分析：种子项目预置了 1 个已有卷，并把 `pipelineConfig.volumeCount` 设为 1。`genVolumes('auto')` 的契约是 `expectedCount = max(0, effectiveVolumes - existingCount)`，因此期望数合法地变成 0。验证脚本没有复现用户在 UI 中设置计划卷数大于已有卷数的动作，也没有先移除占位卷；这是测试设计缺陷，不是本任务投影链路缺陷。
- 修复方案：在打开卷纲层后，通过真实 DOM 把 `#pl-volume-count` 设置为 2，让“全卷生成”仍需生成 1 卷；继续用真实按钮触发生成，不注入结果。
- 修复验证结果：待重跑 `node scripts/verify-settings-lock-projection-electron.mjs`。
- 是否闭环：待修复。

## 2026-10-20｜设定锁定投影｜mock 供应商端口未复现真实 chat 端点
- 错误描述：卷纲层点击后进入生成，但批次最终为 0 卷；章节层同样只出现请求后得到 0 章，并触发标题历史重复告警。心跳显示状态在推进，不是 UI 卡死。
- 根因分析：验证脚本把 mock baseUrl 指向服务器根路径。应用对 `openai-compatible` 供应商会按协议补 `/v1/chat/completions`，而本地 mock 只监听根路径，未按请求路径区分意图，也无法证明请求到达的是生成端点。测试环境与真实供应商协议形态不一致，属于脚本设计缺陷。
- 修复方案：mock 服务器按真实路径 `/v1/chat/completions` 返回 OpenAI 兼容响应；provider 仍保持 `openai-compatible`，让 UI、供应商协议解析和 API 调用走同一条真实链路。
- 修复验证结果：待重跑 `node scripts/verify-settings-lock-projection-electron.mjs`。
- 是否闭环：待修复。

## 2026-10-20｜设定锁定投影｜mock 回复缺少批次契约必填字段
- 错误描述：改为 `/v1/chat/completions` 后请求到达了真实生成链路，卷纲请求体里也完整出现王芳和林舟的锁定投影；但批次最终仍为 0 卷，并按修复策略重试多次。
- 根因分析：当前卷纲契约要求每项包含 `readerExpectations/mainPlotLine/unlockMilestone/forbiddenFinalCards/contractRisk`。mock 回复仍是最早的 4 字段 JSON，验收器合法拒绝；同时 mock 卷名与既有卷相同，触发“不得重复已有卷名”。章节 mock 同理与历史标题重复。这仍是测试夹具不满足真实契约的问题，不是投影链路缺陷。
- 修复方案：mock 回复补齐卷纲契约字段，卷名改为不重复的第二卷；章节标题改为“第2章 航行图”，并保持剧情内容能体现王芳的话痨风格。
- 修复验证结果：待重跑 `node scripts/verify-settings-lock-projection-electron.mjs`。
- 是否闭环：待修复。

## 2026-10-20｜设定锁定投影｜真实 UI 揭示批次夹具仍不满足输出契约
- 错误描述：卷纲 mock 已补字段并改名后，请求正常到达 provider，但仍被验收器拒绝；章节层则从 0 章推进到 1 章后被判定“标题与历史重复”。
- 根因分析：这不是锁定投影缺陷。真实 UI 比单测更能暴露夹具与真实批次契约的差距：卷纲生成被 orchestrator 以“返回产物不完整”拒绝，章节批次的“缺失第2章到第4章”与 mock 固定返回“第2章”无法一一对应。验证脚本使用静态 mock 承担动态批次生成场景，是脚本设计不足。
- 修复方案：mock 改为按请求内容动态生成：从“补充生成第X卷到第Y卷”提取区间并生成对应卷；从“缺失第X章到第Y章”提取区间并生成对应章节；保证每轮名称不重复。保持真实 UI 点击与真实 API 请求不变。
- 修复验证结果：待重跑 `node scripts/verify-settings-lock-projection-electron.mjs`。
- 是否闭环：待修复。

## 2026-10-20｜设定锁定投影｜mock 意图识别未对齐真实批次指令
- 错误描述：动态 mock 改造后，卷纲层仍 4 次 `api-success` 却 `acceptedCount: 0`；章节层首轮只接受 1 章，重试阶段反复报“章节标题与历史重复：第2章 航行图”。读取 `provider-requests.json` 证实：卷纲真实用户提示使用 `[大纲]` 标记，脚本只识别 `[全书大纲]`；章节首轮使用“生成第2章到第4章”，重试使用“补充生成第3章到第4章”，脚本却只解析“缺失第X章到第Y章”。
- 根因分析：mock 的意图分支是按旧样例硬编码的，没有以真实 trace 中的请求文本为准；它把卷纲请求判成普通正文请求，把章节区间回退成固定“第2章 航行图”。这是验证夹具协议漂移，不是设定投影或批次验收器缺陷。
- 修复方案：mock 以 `[大纲]` / `[全书大纲]` 两种真实标记识别卷纲；章节区间解析同时覆盖“生成第X章到第Y章”“补充生成第X章到第Y章”“缺失第X章到第Y章”。修复后必须重跑真实 Electron UI 验证。
- 修复验证结果：待重跑 `node scripts/verify-settings-lock-projection-electron.mjs`。
- 是否闭环：待修复。

## 2026-10-20｜设定锁定投影｜跨步骤后未恢复设定面板可见性
- 错误描述：章节层批次失败后，脚本直接查找设定卡片中的“解锁林舟”按钮并超时；按钮存在但当前停留在章节步骤，设定列表不可见。
- 根因分析：`clickSettingButton()` 假定设定步骤始终可见，没有在跨步骤操作后先导航回设定层。自动化脚本缺少 UI 状态收束，容易被误判为应用卡死。
- 修复方案：跨步骤需要操作设定卡片时，先真实点击第 2 步并等待 `#pl-bound-settings-list` 可见，再执行锁定/解锁按钮点击。
- 修复验证结果：待重跑 `node scripts/verify-settings-lock-projection-electron.mjs`。
- 是否闭环：待修复。

## 2026-10-20｜设定锁定投影｜全屏流水线状态下重复点击侧栏按钮
- 错误描述：章节层完成后，脚本准备回到设定层解锁林舟时超时；`#btn-pipeline` 可见且可点，但点击被全屏 `#pipeline-panel` 的 `.pl-header` 拦截。
- 根因分析：`openPipelineSettings()` 无条件点击侧栏按钮；而面板已经处于打开状态时，侧栏按钮位于全屏遮罩之下。脚本缺少“面板已打开则只切换步骤”的状态分支，这是自动化导航缺陷，不是应用卡死。
- 修复方案：先检查 `#pipeline-panel` 是否可见；已打开时直接切换到设定步骤，未打开时才点击 `#btn-pipeline`。后续退出流水线也改为真实点击 `#btn-close-pl`。
- 修复验证结果：待重跑 `node scripts/verify-settings-lock-projection-electron.mjs`。
- 是否闭环：待修复。

## 2026-10-20｜设定锁定投影｜mock 正文与首页回复不满足真实契约
- 错误描述：卷纲、章节、正文三层的投影均已进入真实请求；卷纲与章节批次通过。但正文 mock 仅 29 字，被应用正确判定“不低于2100字”失败并触发 2 次修复。随后首页对话等待 150 秒超时；心跳显示 `home` run 已建立且有 1 次 API 调用，但聊天消息没有 assistant 内容。
- 根因分析：正文夹具没有满足目标字数契约；首页 mock 依赖 system 文本 `当前上下文锁定设定`，但真实首页请求是把该段拼进多模态/多段 system 内容，且普通回答回复了散文，意图分类器返回 `discuss` 后应用没有把该内容作为用户可见 assistant 消息落盘。验证脚本把夹具缺陷与应用状态混在一起等待。
- 修复方案：正文 mock 生成不低于 2100 字的合格正文；首页 mock 按用户问题 `王芳在这章应该怎么说话？` 与锁定设定共同识别，返回直接讨论回复。保留真实 DOM 输入、真实按钮发送与真实 API 请求。
- 修复验证结果：待重跑 `node scripts/verify-settings-lock-projection-electron.mjs`。
- 是否闭环：待修复。

## 2026-10-20｜设定锁定投影｜关闭按钮在窗口内不可点击
- 错误描述：卷纲、章节、正文全部 `done` 后，脚本等待 `#btn-close-pl` 超时；按钮在 DOM 中，但当前窗口尺寸下没有进入可点击区域。
- 根因分析：验证脚本使用固定 ID 定位关闭按钮，却没有考虑全屏面板头部操作按钮过多时的可见性/滚动约束。自动化脚本又把不可点击当成不存在。
- 修复方案：关闭动作改用组件模板中真实的 `@click.self` 遮罩关闭语义，点击 `#pipeline-panel` 的左上空白遮罩区域，并等待面板 detached。
- 修复验证结果：待重跑 `node scripts/verify-settings-lock-projection-electron.mjs`。
- 是否闭环：待修复。

## 2026-10-20｜设定锁定投影｜首页断言读取了不存在的 chat.messages 字段
- 错误描述：首页请求已到达本地 provider，心跳显示 `home` run 建立、`apiCalls: 1`，但验证脚本等待 assistant 消息 150 秒超时，且 `home-layer/` 证据未生成。
- 根因分析：`useChatStore` 是 setup store，只导出 `activeSessionId/activeSession/activeMessages/currentContext` 等字段，没有 `messages` 兼容字段。脚本断言读取 `chat.messages`，条件永远不可能满足；这是验证脚本对 Pinia 状态结构的误读，不是应用吞掉回复。此前未在超时时保存会话与 run 现场，导致只能靠代码推断。
- 修复方案：首页断言改为读取 `chat.activeMessages`；新增 `dumpHomeDiagnostics()`，超时前把 active session、activeMessages、generation 状态、currentContext、runTrace 汇总和 provider 请求写入 `home-diagnostics.json`，确保后续失败不再只有心跳摘要。
- 修复验证结果：待重跑 `node scripts/verify-settings-lock-projection-electron.mjs`。
- 是否闭环：待修复。
