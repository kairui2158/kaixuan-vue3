# 记忆板块异常路径与视图边界核验

日期：2026-08-26
范围：本轮遗留项 1，记忆板块异常路径、JSON 导入合并边界、四视图挂载与页面边界。

## 真实 Electron/CDP 证据

启动方式：`start-electron.bat`，页面 URL：`file:///D:/codex/novel-workshop-vue3/dist-renderer/index.html`。

1. 真实点击 `#btn-memory` 后，`#memory-panel` 存在且可见。
2. 依次点击记忆面板的“关系图”“图谱分析”“思维导图”“时间线”按钮，异步等待后每次只有对应视图节点挂载：
   - 关系图：`.memory-relation-graph=true`
   - 图谱分析：`.memory-graph-analysis=true`
   - 思维导图：`.memory-mind-map=true`
   - 时间线：`.memory-timeline=true`
3. 每个视图的 `document.documentElement.scrollWidth - clientWidth` 均为 `0`。
4. 初始记忆列表 `.mem-content=true`，页面宽度为 `1904/1904`。

## 源码边界核对

- `src/services/memoryIO.ts:46-70`：损坏 JSON、包装格式、裸数据格式和五个核心数组字段均有中文错误返回。
- `src/services/memoryIO.ts:77-138`：合并导入深拷贝当前数据；按 ID/名称/关系组合键跳过重复项；新条目追加；更新 `meta.totals`，不覆盖当前版本。
- `src/components/common/MemoryPanel.vue:17-19,268-296`：默认入口为“导入 JSON（合并）”；覆盖导入是单独入口并有二次确认；两条路径均经 `projectStore.recordMemoryChange()`。

## 结论

- [x] 记忆四视图真实挂载和横向边界
- [x] 合并默认、不覆盖已有条目
- [x] 覆盖导入需用户显式选择并确认
- [x] 损坏 JSON 和结构缺失错误可识别
- [ ] 真实磁盘文件选择、关闭重启恢复：留到安装包/原生导入导出阶段用客户数据边界验证

本项在当前源文件 Electron 环境下核销；磁盘持久化不在本项伪造通过。
