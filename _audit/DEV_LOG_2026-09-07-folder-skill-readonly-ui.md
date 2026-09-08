# 2026-09-07 Folder SKILL 设置页只读展示

## 开发功能

- Folder SKILL 在设置页技能栏改为只读展示：隐藏“编辑”和“导出 MD”，新增“打开文件夹”。
- “打开文件夹”通过 `skill:openFolder` IPC 校验路径后调用系统文件管理器打开原目录。
- Folder SKILL 的模板摘要改为从磁盘 `template.md` 实时读取，避免展示应用内过期副本。
- 文本 SKILL 保持原有“编辑”和“导出 MD”能力不变。

## 用途

Folder SKILL 的权威数据在磁盘文件夹中。应用内编辑只会修改应用副本，不会写回磁盘，容易造成两份数据漂移。改为只读展示后，用户通过系统文件夹维护源文件，通过“打开文件夹”直达原目录，避免误以为编辑结果已同步到 SKILL 文件夹。

## 实现范围

- `electron/ipc/skill-loader.js`：新增 `skill:openFolder` IPC，复用 `resolveExistingDirectory()` 校验，失败返回中文错误。
- `electron/preload.js`：新增 `skillOpenFolder` 桥接。
- `src/main.ts`：浏览器环境补充 `skillOpenFolder` mock。
- `src/services/realSkillLoader.ts`：`FolderSkillStatus` 新增 `templatePreview`。
- `src/components/settings/SkillSettings.vue`：Folder 卡片按钮区分、模板摘要实时读取、打开文件夹入口。

## 验证

- `npm run type-check`：通过。
- `npm run test:services`：125 个测试通过。
- `npm run build:vue`：通过。
- 源 Electron + CDP 真实 UI 验证：
  - Folder 卡片显示“打开文件夹、体检、加入流水线、导出 ZIP、版本回退、测试、删除”。
  - Folder 卡片不再显示“编辑”和“导出 MD”。
  - 文本 SKILL 卡片保留“编辑”和“导出 MD”。
  - Folder 卡片显示“路径有效”和磁盘 `template.md` 摘要。
  - `skillOpenFolder` IPC 返回 `ok: true`。

## 收尾

- 移除验证用 `folder-full` 测试技能。
- 结束源 Electron 进程。
- 清理临时验证脚本。
