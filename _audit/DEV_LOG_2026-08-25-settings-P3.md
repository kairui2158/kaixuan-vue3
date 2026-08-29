# 设定层 P3：列表与当前项编辑区

## 范围

- 将设定层从“每项完整卡片”调整为“紧凑列表 + 唯一当前项编辑区”。
- 保留现有设定对象、绑定、删除、保存和项目持久化行为。

## 修改

- `src/components/pipeline/PipelinePanel.vue`
- 增加 `selectedSettingId` 和 `selectedSettingItem`。
- 列表行只显示名称、摘要、绑定状态和序号。
- 当前项编辑区提供名称、属性、绑定/解除绑定、删除、保存。
- 删除当前项后自动选择相邻项。

## 验证

- `npx vite build`：176 modules transformed，构建成功；仅有既有 dynamic import/chunk size 警告。
- `taskkill /f /im electron.exe` 后使用 `start-electron.bat` 启动，CDP `9227` 可连接。
- 真实进入流水线设定层并推进到设定步骤。
- `P3_VISIBLE_DOM`：15 个列表行；列表 `clientHeight=190`、`scrollHeight=493`、`overflow=auto`；列表内 textarea 数量为 `0`；当前项编辑区可见。
- `P3_SELECT`：点击列表行后 `active=true`、编辑区可见、名称为“陈暮”。
- `P3_BIND`：点击绑定后显示“解除绑定”，状态为“已绑定到流水线”。
- `P3_PROJECT_STORAGE`：`wa_project_proj-1787573402261` 中读取到修改后的名称和 `isBound=true`。
- `P3_RESTORE`：测试名称恢复为“陈暮”，绑定恢复为 `false`，未污染客户项目。

## 结论

- P3：PASS。进入 P4 动态分类导航。
