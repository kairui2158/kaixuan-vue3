# 开发日志：运行记录深度化 V2（2026-09-11）

## 任务背景

第三方 SKILL 制作方需要用运行记录复现完整实验现场。V1 已有三层结构和脱敏基础，但缺成熟系统的工程护栏：标准语义、稳定 ID、大对象外置、事件不变量与 UI 门控。本任务按 `_audit/PROPOSAL_2026-09-11_RUN_TRACE_SKILL_DEBUG_DEPTH_V2.md` 落地，不设置 token 预算。

## 交付内容

1. v4 数据模型：新增语义映射、工具现场、物理请求、提示词快照、处理报告、payload 引用与会话轮次字段；旧 v3 JSON 兼容。
2. API 现场回填：每个逻辑 API 调用记录 requestMessages、responseText、usage、finishReason；工具循环、降级、续生成与重试可按物理请求区分。
3. 提示词快照与本地处理报告：记录模板变量、folder 指纹、上下文块、硬规则/DEAI 处理结果与完整性回滚状态。
4. Payload 外置：完整现场按类型进入 `payloads/*.json`，主 JSON 保存引用与 sha256；标准/轻量/深度导出均校验 payload 完整性，raw-http 先脱敏再落盘。
5. 稳定性修复：renderer 按 run 串行保存、主进程按目录串行写盘；滚动清理等待保存队列结束；流式累计回调改为严格前缀差量；会话、工具、物理请求均具稳定 ID。
6. UI 增强：运行记录详情增加 API 增强、时间线筛选、工具统计与提示词/处理报告入口，并保留近 20 次滚动窗口。

## 本轮收尾修复

1. 自动保存并发写坏 JSON：`finishTurn` 与 `finishRun` 同 tick 触发两次异步保存，主进程先 `rm` 再写目录，Windows 下交错后把 `run-trace.json` 写成两个 JSON 尾巴拼接。修复为 renderer 侧按 run id 串行、主进程侧按目标目录串行。
2. 滚动清理断言异常：`trimRuns` 从 `splice` 返回值取响应式代理导致 `dirName` 读取异常，改为 `slice + 整体替换`；`removeRunDirectory` 统一从 `runDirNameById` 或 `run.dirName` 取目录，并等待保存队列结束。
3. 流式回调误拼接：`appendCumulativeStream` 的重叠后缀算法会拼接非前缀回调，改为严格前缀判断，非前缀回调直接丢弃。

## 验证

- `node scripts/verify-run-trace-depth-v2.mjs`：exit 0，最终输出 `===== RUN TRACE V2 E2E VERIFICATION PASSED =====`，覆盖滚动删除、会话续接、三种导出模式、payload sha256、脱敏与上下文压缩事件。
- `npx vitest run src/stores/runTrace.spec.ts`：19/19 passed。
- `npm run type-check`：exit 0。
- `npm run build:vue`：exit 0。
- `npm run build` 曾因旧 Electron 进程锁定 `dist/win-unpacked/shenyi-assistant.exe` 失败；这是文件锁问题，不是代码问题，本轮不做版本封装。
- 临时产物清理：`scripts/diag-run-trace-remove.mjs`、`_data/run-trace-remove-diag-profile/`、`_data/run-trace-v2-e2e-profile/`、`_data/run-trace-v2-exports/`、`_data/run-trace/home/` 已删除，`Test-Path` 全部 False。
- 调试标记复核：`RUN_TRACE_REMOVE_DEBUG`、`RUN_TRACE_REMOVE_STORE_DEBUG`、`RUN_TRACE_PRESSURE_DEBUG`、`DEBUG:rolling` 全仓库无残留。

## 重要发现

源 Electron E2E 验证脚本未传 `--dev` 时加载的是 `dist-renderer` 构建产物。因此每次修改前端源码后，必须先执行 `npm run build:vue` 再运行验证脚本；否则验证旧 bundle，出现“代码改了但现象不变”的假象。

## 用途

运行记录从“事后摘要”升级为第三方可独立复现实验的完整现场。SKILL 制作方可以通过导出的请求、响应、流式、提示词、工具调用、处理报告与 payload 原文精确定位技能问题，用户也可以按次选择标准、轻量或深度导出，同时保证 API Key 等敏感信息不出现在任何导出文件中。

## 遗留边界

1. chain 中间产物滚雪球不在本任务范围内，需要另行改造 chain 模式上下文传递方式。
2. 本轮未升级版本号、未生成安装包；客户验证需待后续封装任务。

## 2026-09-11 补充：5 项遗留实测闭环

### 交付内容

1. 统一 Markdown 渲染门控：`src/utils/markdownService.ts` 的 `renderMarkdown()` 对超过 20 万字符的输入直接生成纯文本预览和提示，不再执行 marked + DOMPurify；覆盖主页聊天气泡、大纲共创气泡、技能预览与工具结果。原始消息数据不截断，复制、插入、导出仍使用完整内容。
2. 验收脚本修正：按 `startedAt` 倒序选取最新 outline run，替代错误的 `.at(-1)`；第 5 项测试补清技能配置、封存旧 run、修正 SSE mock 分隔符，并真实点击运行记录面板的 API Tab 与“完整返回”折叠区。
3. 方案验收表补齐：原 5 项未勾项全部补实测并勾选。

### 实测结果

- 大纲共创 chain：2 次真实 provider 调用、2 条 API 记录、2 条物理请求、turn status=success。
- 生成流水线：设定/卷纲/章节/正文 4 个 run，每 run 1 条 API 调用、1 条物理请求。
- 降级一致性：气泡显示 JSON 兼容模式提示，trace 记录 normal / downgrade_initial / downgrade_retry。
- 10 万字大纲运行记录面板：355ms 打开（阈值 3000ms）。
- 21 万字符响应：运行记录面板 812ms 打开（阈值 3000ms），并显示“文本超过 20 万字符，已截断预览”提示。
- 最终命令输出：`===== RUN TRACE V2 REMAINING VERIFICATION ALL PARTS PASSED =====`。

### 用途

超长响应不会再冻结渲染主线程；第三方 SKILL 制作方仍可通过导出的 payload 获得完整原文，用户界面只做安全预览。
