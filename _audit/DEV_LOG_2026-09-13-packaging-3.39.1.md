# 2026-09-13  3.39.1 修复版封装

## 背景

3.39.0 封装后，设置页“技能”入口消失，属于交付级回归，3.39.0 废弃。

## 根因

- `src/components/settings/SkillSettings.vue` 中 `modalVisibility` computed 引用了后置声明的 `editingSkillId`。
- 该 computed 被 `watch(..., { immediate: true })` 立即执行，组件初始化即触发 TDZ 异常。
- Vue 组件渲染失败导致技能页整页不可用；type-check 无法覆盖该运行时初始化顺序问题。
- 临时调试钩子 `@vue:unhandled` 已移除，`SettingsModal.vue` 恢复干净状态。

## 修复

- 将 `editingSkillId` 与 `editingName` 声明前移至弹窗状态区，`modalVisibility` 求值时依赖已初始化。
- 保留 `scripts/verify-settings-skill-page-e2e.mjs` 作为真实 Electron 回归门禁：打开设置、切到技能 Tab、确认无渲染错误、确认新增技能与导入 folder 技能按钮可见。

## 验证

- `npx vue-tsc --noEmit`：通过。
- `npm run build:vue`：通过，1634 modules transformed。
- `node scripts/verify-settings-skill-page-e2e.mjs`：PASS。
- `npx vitest run src/composables/useModalQueue.spec.ts`：6/6 通过。
- `npm run build`：通过，产物为 `dist/神意助手-Setup-3.39.1.exe`。
- `dist/latest.yml`：`version: 3.39.1`。
- `dist/builder-effective-config.yaml`：`oneClick: false`、`allowToChangeInstallationDirectory: true`、`include: build/installer.nsh`。
- asar 内 `package.json`：`name=shenyi-assistant`、`version=3.39.1`。
- SHA256：`F639CA4089784B3119CC14F3B8E3735B3CB7C5D32C3D6D0F92794D3240B8FD3E`。
- 产物大小：130,363,433 字节（约 124.3 MB）。
- 旧 3.39.0 安装器与 blockmap 已从 `dist/` 删除。

## 遗留

- 测试环境 `wa_lastProjectId` 曾出现非法值 `a1_upgrade`，脚本会显示“存储损坏已恢复”警告；不属于本次技能页回归，待后续排查来源。
- `a1_upgrade` 非法 lastProjectId 来源待排查。
