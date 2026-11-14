# 2026-11-15 3.128.0 封装与旧安装产物清理

## 交付

- 版本从 `3.127.9` 升级为 `3.128.0`，交付本轮正文层 SKILL 现役指纹与 retry 载荷对账结论后的正式安装包。
- 生成 `dist/神意助手-Setup-3.128.0.exe`（231,670,509 bytes，SHA-256 `3f5336e0adc6a01dab12a71b96cb0f083ce14a54d0ad39c51e1944cab203429f`）。
- 清理 `dist` 内 27 个旧安装产物：`3.110.6`、`3.125.0` 到 `3.127.9` 的全部旧 `.exe` 和配套 `.blockmap`。保留 3.128.0 安装包、blockmap、`win-unpacked`、`latest.yml`、`builder-debug.yml` 与 `builder-effective-config.yaml`。
- 证据落盘：`_audit/verification-packaging-3.128.0/packaging-evidence.json`。

## 验证

- `npm run type-check` exit 0。
- `npm run test:services` exit 0：253 个测试文件、2770 个用例全部通过。
- `npm run build` exit 0：Vue 构建与 Electron NSIS 打包完成。
- `npm run verify:packaging` exit 0：packaged app 启动、first window、electronAPI 94 个方法与 rendered shell 核验通过。
- 清理后 `dist` 复核只保留 3.128.0 当前产物与构建元数据。

## 边界

- 本轮不改 folder SKILL；不新增预算系统、调度器、UI 或第二裁判。
- 清理动作只针对 `dist` 中已确认旧版本的安装包/blockmap，不删除任何源码、文档、运行记录或验证证据。
