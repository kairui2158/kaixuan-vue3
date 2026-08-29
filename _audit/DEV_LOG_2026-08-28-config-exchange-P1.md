# Agent/Skill Markdown 导入底座 P1 开发日志

## 目标

建立扩展名、编码、Front Matter、普通 Markdown 的分层解析入口，让 `.md` 文件不再因为不是 `---` 开头而被直接判为未知。

## 本轮修改

- `src/services/configExchange/markdown.ts`
  - 统一去除 UTF-8 BOM，并把 CRLF/CR 规范化为 LF。
  - 将 Front Matter 和普通 Markdown 标记为 `front-matter` / `plain-markdown`。
  - `parseAgentMd`、`parseSkillMd` 接收并返回来源文件元数据。
- `src/composables/useConfigExchange.ts`
  - 格式判断优先使用 `.json`、`.md`、`.markdown` 扩展名，保留内容识别兜底。
  - 读取文件时携带文件名和扩展名，传入 Markdown 解析器。
- `src/services/configExchange.spec.ts`
  - 增加 BOM 普通 Markdown 和 BOM+CRLF Front Matter focused 测试。

## 验证

- `npx vitest run src/services/configExchange.spec.ts --reporter=verbose`
  - `Test Files 1 passed (1)`
  - `Tests 16 passed (16)`
- `npm run type-check`
  - `vue-tsc --noEmit` 无错误输出。
- `npm run build:vue`
  - `vite v8.2.1`，`189 modules transformed`，`built in 2.74s`。
  - 仅有已有的动态导入和大 chunk warning。
- `call start-electron.bat`
  - 输出 `[OK] Electron found`、`[OK] dist-renderer found`、`[OK] Application started`，并打印 DevTools 9227 地址。
  - 后续 `netstat -ano | findstr :9227` 无监听，CDP 探针返回 `ECONNREFUSED`；本阶段 Electron/CDP 真实载体保持 `UNVERIFIED`。

## 状态

- [x] 扩展名优先识别
- [x] BOM/换行规范化
- [x] Front Matter/普通 Markdown 分类
- [x] focused 测试、类型检查、生产 Vue 构建
- [ ] Electron/CDP 页面导入验收：载体启动后退出，待独立排查，不扩大为业务失败
- [ ] P2 第三方字段兼容映射（下一阶段）
