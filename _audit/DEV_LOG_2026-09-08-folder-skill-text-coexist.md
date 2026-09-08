# 开发日志：文本/Folder 技能同名共存（2026-09-08）

## 开发功能

解决客户实测反馈：文本技能与 Folder SKILL 同名时导入无效，设置页无法区分两种规格。

本次修改：

1. 技能身份引入 format 命名空间：Folder 技能内部 ID 归一化为 `folder:来源ID`，文本技能保留原始 ID。
2. 新增 `sourceId` 字段保留 Folder 技能 YAML 声明的原始 ID，设置页卡片展示“来源 ID”。
3. 展示层统一使用 `displaySkillName()`，同名技能分别显示“（文本）”和“（文件夹）”，并带规格徽标。
4. 单个导入与批量导入的冲突判断限定同规格，跨规格同名允许共存，不再出现“同 ID 导入无效”。
5. 主页共创选择器、流水线选择器、大纲工作台、降 AI 设置、绑定弹窗、技能市场全部按新命名空间读取。
6. 配置导入导出保留双规格记录，旧数据加载时自动补齐 `folder:` 前缀与 `sourceId`。

## 交付目的

第三方 SKILL 制作者可以继续使用自己的技能 ID（例如 `KAI-S1`），即使应用内已有同 ID 文本技能，也能作为独立 Folder 技能共存；用户在设置页和各层选择器中能明确区分并分别绑定，避免“导入无效”和“绑定被顶掉”。

## 验证证据

- `npm run type-check`：通过。
- `npm run test:services`：13 个测试文件通过，146 个测试通过。
- `npm run build:vue`：通过。
- 源 Electron 实测（`start-electron.bat`，CDP `127.0.0.1:9227`）：导入 `D:/codex/玄武规划SKILL/凯旋-正文层/kaixuan-s1` 时，已有文本技能 `KAI-S1`，返回 `added: 1, skipped: 0`。
- 实测技能存储 `C:\Users\凯瑞\Documents\神意助手数据\wa_skills.json` 同时存在 `KAI-S1`（文本）和 `folder:KAI-S1`（文件夹，`sourceId=KAI-S1`）。
- 设置页技能栏显示 `S1-骨架师V7（文本）`、`S1-骨架师（文件夹）`、`来源 ID：KAI-S1`。
- 主页共创选择器同时列出文本与 Folder 技能。
- 流水线章节层选择 `folder:KAI-S1` 后绑定值保持不变，未回退文本 ID。
- 保存退出并重启后，两条技能记录仍共存，选择器选项仍存在。

## 边界与遗留

- Folder 技能仍是只读展示，需要修改时通过“打开文件夹”维护磁盘源文件。
- 同名共存不改变文本技能与 Folder 技能各自的执行逻辑，chain/compose 行为不受影响。
- 源 Electron 保存退出后曾残留 Electron 进程，收尾时已全部关闭后再封装。
