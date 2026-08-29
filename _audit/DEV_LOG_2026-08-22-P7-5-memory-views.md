# P7-5 记忆四视图数据闭环核验

日期：2026-08-22
状态：部分通过；未标记为整合验收通过

## 本轮范围

本轮只核验记忆板块的单一数据源、正文记忆入口、四视图、导入策略和 Electron 源文件运行基线。没有把代码存在、按钮可见或构建通过扩大解释为完整行为通过。

## 对账结果

- [x] 读取经验文件、P7-4 日志和当前记忆相关源码。
- [x] 记忆单一事实来源：四视图由 `MemoryPanel.vue` 传入 `projectStore.memories`，图数据由 `useMemoryGraph.ts` 的 computed 入口生成；四个视图没有保存自己的实体/关系/事件副本。
- [x] 四视图真实 CDP 切换：关系图、图谱分析、思维导图、时间线的 DOM 节点分别出现。
- [x] 导入策略静态核验：默认入口为“导入 JSON（合并）”，另有明确的“覆盖导入 JSON”；合并路径调用 `mergeImportedMemory` 和 `recordMemoryChange`，不是直接替换 store。
- [x] 旧数据兼容：`project.ts` 的 `normalizeMemories` 接受旧 `categories/items` 并补齐新结构；持久化使用项目对象中的 `memories` 字段。
- [x] 主编辑器入口存在：正文模式显示“提取记忆”，正文先保存，再进入审核预览；审核支持逐条拒绝/恢复和锁定/解锁，确认后调用 `recordMemoryChange`。
- [x] 生成流水线正文入口存在：流水线也调用相同的 `mergeMemory`/`recordMemoryChange` 路径。
- [ ] 真实供应商成功抽取：当前环境未提供可安全调用的测试供应商/测试项目，未伪造 API 返回。
- [ ] 正文抽取审核“拒绝后不写入”的 Electron 行为：未取得真实抽取结果，未核销。
- [ ] 导入 JSON 原生文件选择、确认、落盘前后差异：代码路径已核对，真实文件对话框行为未核销。
- [ ] 关闭 Electron 后重新启动、打开同一项目并确认四视图恢复同一业务数据：当前没有可安全复用的测试项目，未伪造恢复证据。
- [ ] 动画/短剧板块读取记忆：源码未发现真实动画/短剧模块接入；当前结论为“未接入”，不是完成。

## 运行证据

构建命令 `npm run build:vue`：`175 modules transformed`，生成 `dist-renderer/index.html` 与最新 JS/CSS bundle。

源文件启动器 `start-electron.bat`：CDP 页面为 `file:///D:/codex/novel-workshop-vue3/dist-renderer/index.html`，页面标题为“神意助手”；不是开发服务器页面。

真实 CDP 页面读取到：`#btn-extract-memory` 数量为 `1`；记忆面板四个视图按钮文本为“关系图、图谱分析、思维导图、时间线”；点击后对应 `#memory-relation-graph`、`#memory-graph-analysis`、`#memory-mind-map`、`#memory-timeline` 均分别渲染；更多菜单包含“导入 JSON（合并）”和“覆盖导入 JSON”。

## 结论

代码级连接和四视图同源已确认，主编辑器与流水线都有正文记忆入口。真实抽取、审核、原生导入导出和关闭重启恢复仍未核销；动画/短剧尚未接入。因此 P7-5 只能标记“部分通过”，不能宣称记忆整合验收完成。

## 收尾

- 本轮未修改业务源码。
- 本轮未写入项目、聊天、供应商或记忆业务数据。
- Electron 进程已在收尾阶段清理。
- P7-6 仅提出计划，不在本轮执行。
