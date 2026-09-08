# G6 记忆视图升级最终验收报告

生成时间：2026-09-06 13:23（Asia/Shanghai）

## 结论

- G6 施工主线完成：T0 数据转换与图生命周期、四视图 G6 化、空态、悬停、点击、折叠展开、拖拽、框选、来源跳转、存储零回写均有真实运行证据。
- 已验证：G1-G22 全部通过。
- R1-R8：仓库、交接文档与审计文件中均未找到 G6 语境下的 R1-R8 定义，不能凭空映射或冒充验收；需要任务下达方提供定义后补验。
- 遗留类型错误已修复：`src/composables/useResizers.ts:167` 改用 `window.setTimeout`，`npm run type-check` exit 0。
- 构建警告已评估：`npm run build:vue` exit 0，剩余警告均为非阻塞提示；详见“构建警告评估”。

## 三项遗漏修复

1. 悬停验证失败根因：点击节点后 `selectedId` 触发 `visibleData` 过滤并重新布局，旧坐标失效。探针已在点击后重新计算节点坐标，再执行 hover。
   - 证据：`_audit/tmp/g6-behavior-evidence.json` `relation_hover = { hoverSlot: true, hoverText: "悬停：林川" }`。
2. 空态验证失败根因：探针循环切换四个视图后才统一读取 DOM，非当前视图根节点不存在。探针已改为每个视图激活时立即采集。
   - 证据：`empty_views.relationEmpty/analysisEmpty/mindEmpty/timelineEmpty = true`，对应 canvas 数均为 `0`。
3. 验收门补强：`allStepsOk` 已纳入 `relation_hover.hoverSlot`、`relation_open_source.editorTitle.includes("第一章")`、`editorMode.includes("正文层")`，防止后续回归漏判。

## G1-G22 验收明细

| 编号 | 结果 | 证据 |
| --- | --- | --- |
| G1 | PASS | `node --check _audit/tmp/run_g6_behavior_probe.cjs` exit 0；`useG6Graph.ts` 由 `npm run build:vue` 编译通过 |
| G2 | PASS | `npx vitest run src/composables/useG6Graph.spec.ts`：`Tests 4 passed (4)`，`toG6Data` 断言 `data.label/type` 与关系边 |
| G3 | PASS | 同上 Vitest 输出，`adaptTreeForG6` 断言 `root.children[].label` 及事件层 |
| G4 | PASS | `npm run build:vue` exit 0；主包 `✓ built in 2.55s`，协议包 `✓ built in 39ms` |
| G5 | PASS | `src/components/memory/MindMap.vue` 保留 `memories/volumes/chapters` props 与 `openSource(event)` emits |
| G6 | PASS | `_audit/tmp/g6-mind.png`；行为探针 `mind_view.canvasNonEmpty=true` |
| G7 | PASS | 行为探针折叠 `vol_behavior` 后：`collapsed=true`、`eventRenderState="removed"`、模型 `eventVisibility="visible"`；展开后 `restoredRenderState="rendered"`。证明渲染层隐藏而模型数据保留 |
| G8 | PASS | `src/components/memory/MindMap.vue:72-75` 点击事件映射 `selectedEventId` 并 emit `event id`；来源跳转链路由 Relation 实测证明 |
| G9 | PASS | `G6Canvas.vue` `watch(props.data) -> updateGraphData`，且组件均由 `props.memories` computed 驱动 |
| G10 | PASS | `_audit/tmp/g6-relation.png`；行为探针 `relation_view.canvasNonEmpty=true` |
| G11 | PASS | 行为探针 `relation_drag.moved=true`；节点坐标从 `(843.6123, 375.5608)` 变为 `(835.2220, 382.3020)` |
| G12 | PASS | `_audit/tmp/g6-behavior-evidence.json` `relation_hover.hoverSlot=true`，`hoverText="悬停：林川"`；`RelationGraph.vue` 配置 `hover-activate degree:1` |
| G13 | PASS | 行为探针点击节点后出现 `.graph-selection`，点击“打开来源”后 `editorTitle="第一章"`、`editorMode="正文层"`、面板关闭 |
| G14 | PASS | `_audit/tmp/g6-analysis.png`；行为探针 `analysis_view.canvasNonEmpty=true` |
| G15 | PASS | 行为探针框选后 `brushText="节点 3 · 关系 1 | 框选 4 项"`、`selectedStateCount=4` |
| G16 | PASS | 行为探针 `analysis_legend.legendVisible=true`，`legendItems=4` |
| G17 | PASS | `_audit/tmp/g6-timeline.png`；行为探针 `timeline_view.canvasNonEmpty=true` |
| G18 | PASS | 行为探针设置 range 为 `2` 后 `timeline_range.value="2"`、`label="1-2 章"` |
| G19 | PASS | 行为探针点击 `evt_behavior_1` 后出现选择框，点击“打开章节”后 `editorTitle="第一章"`、`editorMode="正文层"`、面板关闭 |
| G20 | PASS | `src/components/memory/G6Canvas.vue` `onBeforeUnmount -> destroyGraph(graph)`；四视图关闭后 `canvases=0` |
| G21 | PASS | 行为探针 `panel_close.panelOpen=false`、`canvases=0`；四视图切换后运行时错误为空 |
| G22 | PASS | `src/styles/tokens.css:86-99` 15 个 `--g6-*` 变量各出现 1 次 |

## R1-R8 状态

状态：未定义。

搜索范围：`_audit/G6_INTEGRATION_HANDOFF.md`、`_audit/**`、`docs/**`、`src/**`、根目录。未发现任何 G6 语境下的 R1-R8 编号定义。既有 `V1/V2-R1` 与 `P4-R1` 属于其他任务，不能挪用。

结论：R1-R8 不能标记 PASS。请任务下达方提供 R1-R8 定义或确认其来源；提供后可基于现有探针补充专项验证。

## 验证命令与关键输出

### 行为探针

命令：`node _audit/tmp/run_g6_behavior_probe.cjs`

关键输出：

```json
{
  "runtimeErrors": [],
  "relation_hover": { "hoverSlot": true, "hoverText": "悬停：林川" },
  "relation_drag": { "moved": true },
  "analysis_brush": { "brushText": "节点 3 · 关系 1 | 框选 4 项", "selectedStateCount": 4 },
  "mind_node_toggle": {
    "beforeRenderState": { "renderState": "rendered", "modelVisibility": "visible" },
    "collapsedVisibility": { "collapsed": true, "eventRenderState": "removed", "eventVisibility": "visible" },
    "restoredRenderState": "rendered"
  },
  "relation_open_source": { "editorTitle": "第一章", "editorMode": "正文层", "memoryPanelClosed": true },
  "analysis_legend": { "legendVisible": true, "legendItems": 4 },
  "timeline_range": { "value": "2", "label": "1-2 章" },
  "panel_close": { "panelOpen": false, "canvases": 0 },
  "data_no_writeback": { "same": true },
  "empty_views": {
    "relationCanvas": 0, "relationEmpty": true,
    "analysisCanvas": 0, "analysisEmpty": true,
    "mindCanvas": 0, "mindEmpty": true,
    "timelineCanvas": 0, "timelineEmpty": true
  },
  "allStepsOk": true,
  "cleanup": { "ok": true }
}
```

### 单元测试

命令：`npx vitest run src/composables/useG6Graph.spec.ts`

关键输出：

```text
Test Files  1 passed (1)
Tests  4 passed (4)
Duration  6.95s
```

### 构建

命令：`npm run build:vue`

关键输出：

```text
vite v8.2.1 building client environment for production...
✓ 1589 modules transformed.
dist-renderer/assets/index-C4TxqiGr.js  2,445.45 kB │ gzip: 741.11 kB
✓ built in 6.49s
providerProtocols.cjs  8.18 kB
✓ built in 188ms
```

### 类型检查

命令：`npm run type-check`

关键输出：

```text
vue-tsc --noEmit
```

结果：exit 0，无类型错误。修复点：`src/composables/useResizers.ts:167` 由裸 `setTimeout` 改为 `window.setTimeout`，确保浏览器环境返回 `number`。

### 构建警告评估

命令：`npm run build:vue`

结论：构建成功且不影响 G6 验收；本轮不做侵入性重构，原因如下：

- `configLoader: 'native'`：`vite.config.ts` 与 `vite.protocols.config.ts` 以 CommonJS 方式加载但包含 ESM 语法。属于 Vite 8 前向兼容提示，非功能缺陷。
- `INEFFECTIVE_DYNAMIC_IMPORT`：`src/services/aiService.ts`、`src/stores/provider.ts`、`src/components/chat/ChatPanel.vue` 存在静态与动态导入混用。动态导入疑似承担打破循环依赖职责，贸然改静态导入可能引入初始化顺序回归。
- Chunk 超 500 kB：主包约 `2,445.45 kB`，需系统性代码分割设计，超出 G6 验收边界。
- `PLUGIN_TIMINGS`：构建耗时统计提示，非产物缺陷。

### Diff 检查

命令：`git diff --check`

结果：exit 0，无 whitespace error；输出仅包含既有 CRLF 提示。

## 证据文件索引

- 行为证据：`_audit/tmp/g6-behavior-evidence.json`
- 四视图渲染证据：`_audit/tmp/g6-views-evidence.json`
- 截图：`_audit/tmp/g6-relation.png`、`g6-analysis.png`、`g6-mind.png`、`g6-timeline.png`
- 探针脚本：`_audit/tmp/run_g6_behavior_probe.cjs`
- 施工交接：`_audit/G6_INTEGRATION_HANDOFF.md`

## 待补验收

1. R1-R8：等待任务下达方提供定义。
