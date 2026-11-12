# TASK LEDGER：大纲与首页编辑器性能残留根治 V1

## 1. 目标与原话

- 用户原话："大纲编辑器和首页编辑器输入会导致应用短暂的卡顿现象，和过度的UI显示"；"把找出来的所有问题进行记录，然后根据经验文件门禁逐项对账制作可执行且能达到交付的方案"。
- 最终可感知行为：输入无卡顿、UI 状态必要、历史补丁常驻开销收敛。
- 本轮交付物（方案阶段）：审计报告 + V1 执行方案 + 本台账骨架。

## 2. 门禁读证

| 门禁 | 证据（file:line 或关键句） |
|---|---|
| G0.13 | `神意开发经验总结_v9.md:134-140`："新机制前必须回答五问……禁止把更多配置当成质量提升" |
| G1.19 | `神意开发经验总结_v9.md:360`："真实运行数据排序出 Top 耗时来源前，任何'看起来慢'不得成为优化依据" |
| G1.15 | `神意开发经验总结_v9.md:313`："症状、链路、组合、机制四层" |
| G0.9/G0.10/G0.12 | `神意开发经验总结_v9.md:68/92/114` 对应条目已读 |
| G1.17 | `神意开发经验总结_v9.md:335`："至少三个最可能错误的假设与真实路径证伪方式" |

## 3. 路由判定

加入：G0.5、G0.6、G0.7、G0.9、G0.10、G0.12、G0.13、G1.15、G1.17、G1.19、G1.21。
排除：G2.13（不碰 SKILL/流水线协议）、G1.18（不改本地确定性转换协议）。理由见方案第 3 节。

## 4. 影响圈与作者反证

- 打算改与可能碰到：见 `PROPOSAL_2026-11-12_EDITOR_PERF_RESIDUAL_V1.md` 第 4 节。
- 三个最可能错误假设与证伪方式：见方案第 5 节（行索引主因假设、虚拟化主因假设、持久化安全假设）。

## 5. 停止条件

- Phase A 完成条件：六条真实路径账本全部产出且分段口径不重叠；Top 源排序结论写入账本摘要。
- Phase A 失败条件：任何路径无数据或分段重叠 → 停止，先修观测。
- Phase B-F 完成条件：各自验收红线通过 + 功能回归全绿 + 账本 after 达标。
- 总完成条件：全部 Phase 闭环 + type-check/test/build 全绿 + 真实 Electron 冒烟 + 用户确认。
- 禁止停止条件："看起来快了""测试全绿但没有账本对照""用户没反馈就是没问题"。

## 6. 执行证据

（待执行后回填）

| 阶段 | 命令 | 关键输出 | file:line |
|---|---|---|---|
| 审计 | rg/get-content 只读扫描 | 审计报告 28+ 条目 | 本文件第 1-2 节 |
| Phase A | `node scripts/measure-editor-perf-ledger.mjs` | 7 路径全部产出；最终账本 `ledger.json`；输入长动作 CPU 采样约 6.4k-6.5k samples | `scripts/measure-editor-perf-ledger.mjs:219-398`；`_audit/EDITOR_PERF_LEDGER_2026-11-12/ledger.json` |
| Phase D | `npm run type-check`；`npm run test:services`；`npm run build:vue` | type-check 通过；全量服务测试通过；Vue 构建通过 | `src/stores/editor.ts:71-88`；`src/components/chat/ChatPanel.vue:2783-2785`；`src/stores/editor.spec.ts:38-62` |
| Phase D 对照 | Phase A/D `ledger.json` | before `hashEditorContent=52`；after `hashEditorContent=0`；`home-typing-100k`、`home-typing-dense-messages`、`chat-sessions-persist-500`、`project-save-100k`、`home-message-panel-density` longTasks 均为 0 | `_audit/EDITOR_PERF_LEDGER_2026-11-12/ledger.json` |
| Phase B/C | 按 G1.19 观测 | 剩余 `_s`/`gs` 与大纲 54/58ms 抖动未形成可归因优化阈值；不做猜测性加闸 | `_audit/EDITOR_PERF_LEDGER_2026-11-12/ledger.json` |
| Phase E | `node scripts/measure-editor-perf-ledger.mjs` | 500 条会话 `.chat-message` 渲染 13 节点；`home-message-panel-density` longTasks=0；密集输入复跑 longTasks=0；真实 Electron 冒烟确认消息唯一落账、虚拟化与底部锚定 | `src/components/chat/ChatPanel.vue:9-89`；`scripts/measure-editor-perf-ledger.mjs:440-538` |
| Phase F | `rg -n "saveFeedback\\.value = .*\\n.*setTimeout"`；`rg -n "outlineStreamRecoveryTimer|setInterval"` | 旧模式 0 命中；单 timer helper 与错误事件触发收口 | `src/components/common/OutlineWorkspace.vue:686-696`；`src/components/common/OutlineWorkspace.vue:3648-3660` |

### Phase D 执行记录

1. `editor.updateContent` 先按同引用短路；无文档书签时跳过全文哈希，不再每次击键双哈希。有书签时仍计算一次新哈希并同步书签失效契约。
2. 交叉搜索确认 `ChatPanel` 对 `currentContext.content` 的每键写入无读取点，整段 watch 删除；`ChatPanel` 其余发送/快照点继续按需读取 `editorStore` 内容。
3. 新增两项行为断言：同引用输入不得把干净页签改脏；有书签内容变更必须用新内容哈希刷新书签。
4. after 账本复跑中 Home `hashEditorContent` 热点为 0 samples；剩余 `_s`（`computeFoldRanges` 压缩形态）与 `gs`（标题收集/列表链路压缩形态）分别为 45/11 samples，无 >50ms 长任务，按 G1.19 只登记不优化。

## 7. Phase A 结论

- 旧 observer 重复计数已修：每次安装前先 `disconnect()`；复跑不再出现同 `startTime` 重复条目。
- CDP Profiler 已接入：真实返回契约为 `profile.nodes` + 数字 `samples`，热点按 sample id 聚合；不使用不可用 source map 反推源行。
- 最终账本：Home 击键 Top 应用热源是 `hashEditorContent`（`editorTarget` chunk，52 samples）和 `gs` bundle 函数（37 samples）；密集消息下同源继续出现 33/29 samples。基础 Home/Outline 击键最终复跑无 >50ms 长任务；`outline-typing-100k-find-open` 上轮出现 71-74ms，最终复跑为 0，但热点中 DevTools evaluator 覆盖度较高，不能归因到应用源行。持久化 500 消息、100k 项目保存、消息密度静态渲染均无 >50ms 长任务。
- G1.19 排序：首个可归因优化源为 Phase D 的 Home `hashEditorContent`；首页消息虚拟化还不能直接立项，需滚动/流式分路复测；大纲查找面板需缩小 evaluator 前后窗口或加专用分段探针后再定。

## 8. 缺口清单

| 缺陷面 | 状态 | 处置 |
|---|---|---|
| G1.14 枚举：输入热链（大纲 7 项/首页 8 项/全局 2 项/UI 5 项/疑似 2 项） | 已枚举，见审计报告第一节 | Phase A 账本定性后逐项处置 |
| Phase A 账本 | 已执行；CPU 热点归因受压缩 bundle/DevTools evaluator 限制 | 先修可归因的 `hashEditorContent`；其他源按分路探针补充证据 |
| Phase A 粒度：20-50ms 分段 | 当前只采 PerformanceObserver >50ms + CPU 采样 | Phase D 已完成同一脚本 before/after 对照；不凭 50ms 以下样本改生产 |
| 大纲 find-open 归因 | 最新复跑 1×58ms；热点仍被 runtime/GC 与 evaluator 淹没 | 按 G1.19 观测；下轮若复现需缩小 Profiler 窗口或专区分段 |
| 持久化安全假设验证 | Phase D 已触及面已执行 | D1/D2 通过编辑 store 行为断言、`ChatPanel` 零读取交叉搜索、全量持久化相关服务测试验证；D3/D4 未实施，进程杀恢复门禁留给其实施批次 |
| 真实 Electron 冒烟 | 已执行 | 500 条会话启用虚拟列表、`.chat-message` 13 节点、底部锚定、发送后用户消息精确 +1；无供应商一帧状态切换导致“生成中…”仅做信息性探针 |

## 9. Phase E/F 收尾结论

1. Phase E 交付：消息列表 300 条阈值分流；密集路径用 `DynamicScroller`，非密集路径保留 v-for 且 key 改为稳定 `msg.id`；Markdown 用 `useThrottledMarkdown`，非流式挂载与流结束 flush；删除首页 token-bar 死代码。
2. Phase F 交付：大纲保存反馈收敛为 `showSaveFeedback` 单 timer；5 秒恢复轮询退役，改为 `onProviderNetStreamFrame` 中 `transportEvent === 'error'` 触发一次检查，并在卸载时清理。
3. 缺陷补修：虚拟滚轮需要约束高度，`.messages-container` 改为 flex/min-height 约束；密集会话挂载后才注入时补一帧回底，虚拟化阈值切换也补回底。
4. 最终账本：七路径产出；`home-message-panel-density` 13 nodes / longTasks 0；密集输入 0；chat persistence 0；project save 0；outline typing 与 find-open 各 1 个 54/58ms 抖动，无本轮改动热点，按观测登记。
5. 收尾验证：type-check 通过；全量服务 251 files / 2739 tests passed；build:vue 通过；NSIS 3.127.0 构建通过；packaging 真实启动验证 PASSED。

本节登记：方案阶段无执行缺口；Phase A 未执行是待用户批准的有意断点，不是遗漏。

## 10. Phase E/F 深度复查闭环

1. 复查发现：非密集回退仍滚动外层容器，而真实滚动容器是 `#messages-list`；整轮生成结束后没有恢复检查兜底；密集回底冒烟对等待前旧快照断言；`saveFeedbackTimer` 未卸载清理。
2. 兼容性核证：`git log -S "id: 'msg_" -- src/stores/chat.ts` 命中 2026-08-16 提交 `3d6f03c5`；仍为运行时历史数据补 `loadSessions` id 兜底，并加回归断言。
3. 修复结果：非密集回底直接滚动内层列表；生成结束 250ms 后事件驱动一次恢复检查；冒烟断言改为等待后最新几何；保存反馈 timer 与恢复 watch/timer 卸载清理。
4. 诚实边界：本轮为最小语义修复，不恢复轮询、不加调度器、不扩 UI；密集路径已修真实断言，非密集路径需下一轮账本补 <300 条冒烟。
5. 收尾验证：`npm run type-check` 通过；`npx vitest run src/stores/chat.spec.ts` 8 tests passed；`npm run test:services` 251 files / 2740 tests passed；`npm run build:vue` 通过；真实 Electron 账本 7 路径全部产出（2026-11-12 22:04 本地时间）；3.127.1 `verify:packaging` PASSED。
