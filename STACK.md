# 技术栈（2026-10-22）

## 运行时
- Node.js v24（本机验证 24.16.0）
- Electron v33（main / preload / renderer 三层）

## 前端
- Vue 3 + TypeScript + Pinia + Vue Router
- Vite 8 / Rolldown 构建 renderer
- Vitest 单测，Playwright + Electron E2E 实测

## 存储
- localStorage：轻量配置
- IndexedDB（idb）：本地数据
- Electron 主进程 IPC：配置、网络与原生能力桥接

## API
- OpenAI 兼容 API
- 主进程网络桥：`providerNet:request` / `providerNet:stream`

## 开发工具
- npm 依赖管理（package.json / package-lock.json）
- vue-tsc 类型检查
- electron-builder NSIS 打包

## 规则来源
- `_audit/神意开发经验总结_v9.md`（v9.4.0）是唯一开发经验规则文件
- `_audit/DEV_LOG_MASTER_INDEX.md` 是开发日志唯一总索引

## 已知陷阱
- UTF-8 BOM（U+FEFF）在源文件开头会导致 Electron 主进程语法错误，所有文件必须以无 BOM 的 UTF-8 保存
