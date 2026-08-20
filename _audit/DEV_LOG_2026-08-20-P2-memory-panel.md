# 记忆板块 P2：正文确认与记忆面板显示闭环

## 本轮目标

修复正文确认后记忆已写入 `MemoryData.entities`，但 `MemoryPanel.vue` 仍只读取兼容字段 `items`，导致用户看到“暂无记忆条目”的路径错位。

## 精准修改

- `src/components/common/MemoryPanel.vue`
  - 增加统一 `memoryDisplayItems` computed，将旧 `items` 与新模型的实体、关系、事件、世界观、伏笔转换为展示条目。
  - 分类列表由 `memoryCategories` computed 动态汇总，保留旧分类并按实际数据显示新模型分类。
  - 旧条目仍保留编辑/删除入口；新模型条目只读展示，避免产生第二套写入路径。
- 未修改正文确认和记忆合并逻辑；其已在本断点前通过真实验证。

## 验证证据

1. `npx vite build`：`154 modules transformed`，`✓ built in 774ms`。
2. `taskkill /f /im electron.exe` 后执行 `call start-electron.bat < nul`；CDP `http://127.0.0.1:9227/json/version` 返回 Electron 33。
3. CDP 真实 UI：通过 `#btn-memory` 打开记忆管理，点击“实体”分类，得到：
   - `PANEL_VISIBLE=true`
   - `ENTITY_CATEGORY_VISIBLE=true`
   - `FILTER_LABEL=实体`
   - `ENTITY_CARD_COUNT=1`
   - `ENTITY_CONTENT_VISIBLE=true`
   - `CLOSED=true`
   - `REOPENED=true`
   - `PERSISTED_ENTITY_COUNT=1`
4. 记忆面板重启后默认关闭，先点击真实入口再验证；不能把默认关闭误报为功能失败。

## 边界

- P2 单章正文确认、预览拒绝/锁定、关闭不写入、确认写入及面板显示已取得证据。
- “连续 20 章模拟”与真实 API 抽取失败注入尚未完成，计划表对应项保持未勾选。
- 本轮临时验证脚本在 `_audit/tmp/`，交付前清理。

## 经验

新记忆模型写入后，所有用户可见面板必须核对实际读取路径；兼容字段不能被误认为新模型的展示来源。重启验证必须先执行真实打开入口，再检查面板内部递归行为。
