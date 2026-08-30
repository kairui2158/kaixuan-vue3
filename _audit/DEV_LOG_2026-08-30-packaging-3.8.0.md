# 2026-08-30 Packaging 3.8.0

## Objective
AI 命名工作台完成验证后，升级版本并交付 Windows 安装包。

## Changes
- 将根 `package.json` 版本从 `3.7.0` 升级到 `3.8.0`
- 同步 `package-lock.json` 根项目版本字段到 `3.8.0`
- 构建生产 renderer 并打包 Windows x64 NSIS 安装包

## Verification
1. `npx vue-tsc --noEmit` -> exit:0 | 无类型错误
2. `npx vitest run` -> exit:0 | 12 spec files, 100 tests passed
3. `npx vite build` -> exit:0 | 195 modules transformed, built in 903ms
4. `npm run build` -> exit:0 | 生成 `dist/神意助手-Setup-3.8.0.exe`
5. 安装包大小：95,637,236 字节（约 91.2 MB）
6. 安装包 SHA256：C8DC4CC46AC3FE6F5769D32652D8F3ED714EA3584271131139269479D19E9DEA
7. Electron 生产页面验证：标题 `神意助手`，URL `file:///D:/codex/novel-workshop-vue3/dist-renderer/index.html`，`window.electronAPI` 类型 `object`，UA `shenyi-assistant/3.8.0`
8. CDP 验证：btn-ai-names 存在 -> 点击后 .naming-overlay 可见 -> 弹窗标题 `AI 命名工作台` -> 7 个标签页（角色/地点/城市/势力/物品/功法技能/自定义）

## Known warnings
- Vite 既有的 dynamic import 和大 chunk 警告为非阻断
- Windows code signing 因未配置签名信息而跳过
- CDP `Page.captureScreenshot` 超时（非业务阻断，页面 DOM 验证已通过）

## Boundary
- 安装包存在与生产页面启动通过，不扩大为客户 API、真实供应商或安装版端到端验收
- 真实 AI 生成、收藏/历史跨进程恢复和编辑器插入仍需客户配置 API Key 后补验
