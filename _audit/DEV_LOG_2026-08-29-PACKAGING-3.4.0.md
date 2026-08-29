# 2026-08-29 Packaging 3.4.0

## Objective

在设定层 UI P0-P10 全部验收后，升级版本并交付 Windows 安装包。

## Changes

- 将根 `package.json` 版本从 `3.2.1` 升级到 `3.4.0`。
- 同步 `package-lock.json` 中根项目版本字段到 `3.4.0`。
- 构建生产 renderer 与 Windows x64 NSIS 安装包。

## Verification

1. `npm run type-check`：exit code 0。
2. `npm run test:services`：44/44 通过。
3. `npm run build:vue`：构建成功，811ms。
4. `npm run build`：exit code 0；生成 `dist/神意助手-Setup-3.4.0.exe`。
5. 安装包大小：`93,657,193` 字节。
6. 安装包 SHA256：`9D827C16163E4973D4FF05B25B07E76DE5BF54277FC100A9A57A05CA10F153F8`。
7. Electron 重启后 4 个进程存活，`127.0.0.1:9227` 可连接。
8. CDP 生产页证据：标题 `神意助手`，URL `file:///D:/codex/novel-workshop-vue3/dist-renderer/index.html`，`window.electronAPI` 类型 `object`，UA 含 `shenyi-assistant/3.4.0`。

## Known warnings

- Vite 既有 dynamic import 和大 chunk 警告为非阻断。
- Windows code signing 因未配置签名信息而跳过。

## Boundary

安装包存在与生产页面启动通过不扩大为客户 API、真实供应商或安装版端到端验收结论。
