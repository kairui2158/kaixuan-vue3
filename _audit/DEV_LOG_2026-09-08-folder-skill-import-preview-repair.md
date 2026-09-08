# 开发日志：Folder 技能导入状态与单个导入预览修复（2026-09-08）

## 开发功能

解决客户实测反馈的两个 Folder SKILL 导入缺陷：

1. **导入成功后卡片显示“路径失效”**：`loadFolderSkill()` 与 `confirmFolderBatchImport()` 写入 `folderStatusMap` 时使用来源 ID（如 `KAI-S1`），而设置页卡片渲染按归一化 ID（`folder:KAI-S1`）查询。写入键与读取键不一致，导致状态查不到而显示“路径失效”。本次统一通过 `skillStore.normalizeSkillId(record.id, 'folder')` 写入状态键。
2. **单个“导入文件夹技能”未触发导入预览**：原逻辑是选完目录后直接入库，缺少预览确认环节。本次新增 `previewFolderSkill()` 与 `refreshFolderSkillPlan()` 服务函数，单个导入改为与批量导入一致的“选择文件夹 -> 预览弹窗 -> 选择冲突策略 -> 确认导入”两段式流程。

配套修改：

- 单个导入预览弹窗展示技能名、归一化 ID、路径、冲突策略（跳过重复 / 覆盖已有技能）。
- 预览冲突判断使用 `folder:` 前缀 ID，同名文本技能不会误判为重复，继续允许跨规格共存。
- `folderSkillBatchImport.spec.ts` 新增 3 个回归用例：单个预览归一化 ID 与冲突状态、同名文本技能不冲突、策略切换刷新单条计划。

## 交付目的

Folder SKILL 导入后设置页能真实反映磁盘路径有效性，不再出现“导入成功但显示路径失效”的误导状态；单个导入与批量导入保持一致的可确认、可反悔体验，用户在入库前能看到将导入的内容和冲突处理结果。

## 验证证据

- `npm run type-check`：通过。
- `npm run test:services`：14 个测试文件，149 个测试全部通过（新增 3 个用例）。
- `npm run build:vue`：主构建与 providerProtocols 构建通过。
- 源 Electron 真实 UI 验证（CDP `127.0.0.1:9227`）：
  - 设置入口：侧边栏“设置”按钮 -> “技能”页。
  - 单个导入选择 `_audit/tmp/real-skill-fixtures/folder-minimal` 后，预览弹窗正常出现，显示“导入文件夹技能”、正确路径、`folder:folder-minimal` 归一化 ID。
  - 冲突策略下拉包含“跳过重复（推荐）/ 覆盖已有技能”；切换为覆盖后确认按钮可用。
  - 确认导入后弹窗关闭，卡片状态显示“路径有效”。
  - 应用提示：`文件夹技能导入完成：新增 0 个，更新 1 个，跳过 0 个`。

## 边界与遗留

- 已封装为 3.28.6 交付，详见 [DEV_LOG_2026-09-08-packaging-3.28.6.md](DEV_LOG_2026-09-08-packaging-3.28.6.md)。
- Folder 技能仍保持只读展示，修改源文件通过“打开文件夹”完成。
- 单个导入预览复用批量导入的样式与交互语义，不改变批量导入、技能包导入和文本技能导入逻辑。
