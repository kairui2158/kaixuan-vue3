# 开发日志：文件夹技能导入入口与引导修复

日期：2026-09-08
版本：3.28.3 修复（未重新封装）

## 需求

用户实测发现设置页的“导入文件夹技能”与“批量导入文件夹技能”没有在文件夹层级完成选择，而是要求继续向内点击，尤其单个导入曾复用文件选择对话框，必须点到 `SKILL.md` 才能生效。

## 根因

1. 单个导入入口此前使用 `dialog:openFileAsync`，选择语义错配：一个要选“技能文件夹”，一个却打开文件选择器，用户被迫进入文件夹并选中 `SKILL.md`。
2. 批量导入已使用 `dialog:openDirectoryAsync`，但当用户选中“技能文件夹本身”时，`skill:listFolders` 真实返回 `ok:true, folders:[]`；原提示逻辑只挂在 `ok:false` 分支，导致 UI 显示“扫描 0 个候选文件夹”，没有告诉用户应返回上一级。

## 修改内容

- `src/components/settings/SkillSettings.vue`
  - `importFolderSkill()` 与 `reselectFolderSkill()` 改用 `window.electronAPI.dialogOpenDirectoryAsync()`，直接选择技能文件夹本身。
  - 沿用 `skillLoadFolder()` 校验文件夹结构，选中无效文件夹时提示具体缺失文件。
- `src/services/folderSkillBatchImport.ts`
  - `previewFolderSkillBatch()` 在 `ok:true` 且 `folders` 为空时补充 `skillLoadFolder(rootPath)` 判断。
  - 若根目录本身是合法技能文件夹，返回“你选择的是技能文件夹本身。请返回上一级，选择包含它的根目录后重试。”
- `src/services/folderSkillBatchImport.spec.ts`
  - 新增“扫描返回空数组但根目录本身是技能文件夹”的回归用例。

## 用途

用户现在可以直接在文件夹层级完成导入：单个导入选中技能文件夹即可导入成功；批量导入误选技能文件夹本身时会得到明确纠错引导，而不是空结果或深层点击。

## 验证

以下验证均在本轮实际执行：

- `npx vitest run src/services/folderSkillBatchImport.spec.ts`
  - `Test Files 1 passed (1)`
  - `Tests 5 passed (5)`
- `npm run type-check`
  - 通过，无错误输出。
- `npm run build:vue`
  - 主构建与 providerProtocols 构建均通过。
- 源 Electron + CDP，模式 `self`（`SHENYI_TEST_DIRECTORY_PATH` 指向 `folder-minimal`）：
  - 单个导入成功：Pinia 出现 `folder-minimal`，`format: folder`，`folderPath` 指向技能文件夹本身。
  - 批量导入显示：`你选择的是技能文件夹本身。请返回上一级，选择包含它的根目录后重试。`
  - `allStepsOk: true`
- 源 Electron + CDP，模式 `root`（目录指向 `real-skill-fixtures` 根目录）：
  - 批量预览打开，`共扫描 10 个候选文件夹，可导入 8 个`。
  - 10 个候选项全部显示，其中 8 个可导入，2 个因缺 `template.md` 显示无效。
  - `allStepsOk: true`

## 边界

- 未改动导入协议、Folder SKILL 结构、主进程扫描规则和设置页其他功能。
- 未重新封装安装包。
