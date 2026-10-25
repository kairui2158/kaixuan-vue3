# TASK_LEDGER 2026-10-26 Outline Export And Message Scroll Closure

## 1. 目标与原话

- 用户原话：`运行记录导出按钮失效，大纲编辑器里的API共创页面鼠标无法操作。` 后续澄清：`我说的鼠标无反应是在大纲共创API信息滚动显示页面而不是输入框。`
- 最终可感知行为：
  1. 大纲工作台运行记录导出按钮能真实点击并产出包含 `export.json` 的目录。
  2. 大纲共创消息滚动区在普通列表与虚拟列表、静态与生成态下均响应真实滚轮。
  3. 流式输出不得抢走用户滚动位置；用户滚回底部附近后恢复自动跟随。
  4. 修复进入 3.108.1 安装包，源码版与打包版双真实 Electron UI 验证。
- 本轮交付物：两个产品修复、定向守护测试、两个真实 UI 回归脚本、3.108.1 安装包、DEV_LOG、经验文件 v9.3.0、工作区收尾。

## 2. 门禁读证

- G0.1：`每轮任务先复述原始目标与最终可感知行为；执行中偏离目标必须显式登记原因。`
- G0.3：`完成声明必须区分已验证、未验证、无法验证、历史证据保留。`
- G0.4：`动手前复读最新 DEV_LOG 与本文件相关层级；修复后回写 DEV_LOG 与经验。`
- G0.5：`每次任务收尾前必须执行回头看：对账原始目标、逐行审 diff、盘点生产入口与旁路、双向扫描生产与验证器、核对日志与测试证据、核对本轮证据真实属于本轮。`
- G0.7：`非平凡修改必须完成：目标倒推、爆炸半径矩阵、正推生效证据、反推质询、优先级证据化修订。`
- G0.8：`任务完成声明前必须分层清理：可再生成旧产物、临时探针、解包残留、旧安装产物、blockmap。`
- G0.9：`动手前先列“打算改的”和“可能碰到的”；未列入影响圈的不碰。`
- G0.11：`X 本身必须由真实 DOM 点击、输入或选择完成；脚本注入只允许用于准备外部依赖、隔离数据和安装素材。`
- G0.12：`所有非平凡任务必须产出任务台账，写入 _audit/TASK_LEDGERS/ 并由当轮 DEV_LOG 链接。`
- G1.1：`必须用 apply_patch 逐行编辑；提交前 git diff 逐行过。`
- G1.4：`验证报告必须分层：能力矩阵、协议仿真、mock E2E、真实供应商、真实 Electron UI、真实用户可见操作。各层只声明自己证明的范围。`
- G1.5：`验证器断言升级必须与采集器、证据载体同批升级。`
- G1.7：`读取 dist-renderer/dist 前必须校验产物新于全部源码与构建配置。`
- G1.8：`runTrace 与 DiagLogger 必须同批覆盖并双侧对账`，导出链路属于本轮观测面。
- G1.12：`先核验新安装包（版本、NSIS、asar、真实启动、electronAPI、安装路径、SHA256）再删旧产物；删除后确认只剩当前版本一套。`

## 3. 路由判定

- 加入：G0.1、G0.3、G0.4、G0.5、G0.7、G0.8、G0.9、G0.11、G0.12、G1.1、G1.4、G1.5、G1.7、G1.8、G1.12。
- 排除：
  - G1.9 状态机与终态收敛：本轮不改变任务/run 终态语义，滚动跟随状态只属于 UI 交互意图，不进入生成状态机。
  - G1.10 权限与安全门：本轮不修改写入工具、权限面或 API 直写授权。
  - G2 流水线领域门禁：本轮触点是大纲工作台 UI 与运行记录导出，不生成卷纲、章节或正文。

## 4. 影响圈与作者反证

- 打算改：`RunTracePanel.vue`、`runTraceExportWorkerService.ts`、`OutlineWorkspace.vue`、两个 spec、两个验证脚本、`package.json`、审计文档与经验文件。
- 可能碰到：
  - Worker 入参携带 Pinia reactive proxy 时触发 `DataCloneError`，导致导出按钮静默失败。
  - `overflow: hidden` 依赖子元素滚动，普通列表没有子滚动器时整个消息区不可滚。
  - scroll 不冒泡，普通监听收不到虚拟列表滚动意图。
  - 流式 `scrollToBottom()` 每帧写入，既造成 UI 压力又抢走用户滚动位置。
  - 关闭共创页与组件卸载可能残留 timer/listener。
- 最可能错假设与证伪：
  - “导出失败是主进程 IPC 问题”：真实点击后 `postMessage` 抛 `DataCloneError`，且 `structuredClone(run)` 复现失败，证明是 Worker 入参问题。
  - “鼠标失灵是输入区 pointer-events”：用户澄清后对准 `.ow-messages`；源码 CSS 为 `overflow: hidden`，普通列表无子滚动器，滚轮无位移，证明是滚动容器问题。
  - “自动跟随必须持续拉底”：生成态滚轮反向位移保持，回底后自动跟随恢复，证明用户意图保护可兼容自动跟随。

## 5. 停止条件

1. `npm run type-check` exit 0。
2. 定向测试 `directWriteWiring.spec.ts`、`runTraceExportWorkerService.spec.ts` 全部通过。
3. `npm run build:vue` exit 0。
4. `npm run build` 产出 3.108.1 NSIS、blockmap、latest.yml、win-unpacked，且 SHA256 可复算。
5. 源码版导出真实 Electron UI 回归 PASS，导出目录含 `export.json`。
6. 打包版导出真实 Electron UI 回归 PASS，导出目录含 `export.json`。
7. 源码版消息滚动真实 Electron UI 回归 PASS：普通列表、虚拟列表、静态态、生成态滚轮位移均非 0。
8. 打包版消息滚动真实 Electron UI 回归 PASS，同 7。
9. 旧 3.108.0 安装产物删除后 `exists=false`。
10. DEV_LOG、总索引、G0.12 台账、经验文件全部登记 3.108.1 与本轮教训。
11. git 状态分类后提交本轮相关文件，无未说明遗留。

## 6. 执行证据

- 产品修复：
  - [OutlineWorkspace.vue](/d:/codex/novel-workshop-vue3/src/components/common/OutlineWorkspace.vue:535) 新增 `outlineMessageFollowEnabled`、`activeMessageScrollElement()`、`syncOutlineMessageFollowState()`、`handleOutlineMessageUserScroll()`、80ms 滚动写入节流；`scrollToBottom()` 尊重用户跟随状态；卸载清理 timer/listener。
  - [OutlineWorkspace.vue](/d:/codex/novel-workshop-vue3/src/components/common/OutlineWorkspace.vue:7337) `.ow-messages` 从 `overflow: hidden` 改为 `overflow-x: hidden; overflow-y: auto`。
  - [runTraceExportWorkerService.ts](/d:/codex/novel-workshop-vue3/src/services/runTraceExportWorkerService.ts:53) 新增 `unwrapCloneable()` / `makeCloneableRun()`，`postMessage` 前解除 reactive proxy；`postMessage` 抛错转为受控失败并清理 pending。
  - [RunTracePanel.vue](/d:/codex/novel-workshop-vue3/src/components/common/RunTracePanel.vue:261) 导出/复制按钮增加状态与失败反馈，不再静默失败。
- 定向测试：
  - `npx vitest run src/services/directWriteWiring.spec.ts src/services/runTraceExportWorkerService.spec.ts` → 2 files / 29 tests 全部 PASS。
  - `npm run type-check` → exit 0。
  - `npm run build:vue` → exit 0。
  - 打包：`npm run build` → 3.108.1 NSIS 产出，`dist/神意助手-Setup-3.108.1.exe`，SHA256 `D2AF831266D686D8E1703F80ED3C73D91201310E636EA8A2074E4B921E245782`。
- 源码版真实 Electron UI：
  - 导出：`_audit/verification-outline-export-ui-source/result.json`，真实点击导出按钮，导出目录含 `export.json`。
  - 滚动：`_audit/verification-outline-message-scroll-ui-source/result.json`，plain-list `delta=600`、生成态 `delta=-600`；virtual-list `delta=600`、生成态 `delta=-600`。
- 打包版真实 Electron UI（本轮新增）：
  - `node scripts/verify-outline-export-ui-regression.mjs packaged` → PASS，导出目录 `run-trace-导出回归-20261026-042144-standard`，含 `export.json`，`pageErrors=[]`，`consoleMessages=[]`。
  - `node scripts/verify-outline-message-scroll-ui-regression.mjs packaged` → PASS，plain-list `staticDown=600`、`generatingScroll=-600`；virtual-list `staticDown=600`、`generatingScroll=-600`；两个场景 `responsivenessState=normal`、`freezeCount=0`。
- 产物清理：
  - `dist/神意助手-Setup-3.108.0.exe` → 删除后 `exists=false`。
  - `dist/神意助手-Setup-3.108.0.exe.blockmap` → 删除后 `exists=false`。

## 7. 缺口清单

- 本轮已验证：导出按钮真实点击、消息滚动普通/虚拟列表、静态/生成态滚轮、源码版与打包版双通道。
- 未验证面：
  - 未做 NSIS 安装器的人工安装路径核验；以 electron-builder 产物、尺寸、latest.yml、SHA256 与 win-unpacked 双 UI 回归为准。
  - 未做真实外部供应商长流滚动验证；本轮生成态由应用真实 streaming 测试钩子进入，滚动与跟随语义不依赖供应商内容。
  - 未复跑全应用 13 个历史 Electron 脚本；本轮触点已有 4 项真实 Electron UI 回归，历史脚本回归范围以既有 DEV_LOG 证据为准。
- 遗留项：无未收口遗留；`verification-outline-v6-baseline` 下三个归档目录为本轮前验证器归档现场，按 G1.5 证据保留规则不删除。
