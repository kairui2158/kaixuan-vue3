# 2026-09-25 F2 超长文档性能层收尾

## 范围

- `src/services/editorVirtualization.ts`：超长文档 offset 行号改为精确换行计数，导出 `countNewlinesBefore()` 供 viewport 消费。
- `src/services/editorViewport.ts`：删除 CRLF 规范化，索引、偏移、镜像测量同源；新增 `getLine()`；清理接口重复声明。
- `src/services/editorSearch.ts`：搜索高亮计划接入 `getLine` 预过滤；视窗外匹配只算行号，不做 DOM 测量；活动匹配保持可测量；增加测量缓存。
- `src/components/editor/EditorPanel.vue`：搜索高亮层传入 `getLine`。
- `scripts/benchmark-editor-long-document.mjs`：独立结果目录、唯一搜索词、直接写 store 避免逐字输入触发全量匹配、点击改为 `page.evaluate`。
- `scripts/verify-outline-virtualization-electron.mjs`：入口选择器改为稳定 `#btn-outline-workspace`；只清理自己的报告文件，不再删除整个共享验证目录。

## 验收证据

- `node scripts/benchmark-editor-long-document.mjs`：`PASS: benchmark document=500002 chars; worstActionMs=617`；报告 `_audit/verification-editor-long-document/long-document-benchmark.json`，滚动 94ms、跳转 126ms、搜索 617ms、写入跟随 94ms，搜索高亮 1 处且 active 1 处。
- `node scripts/verify-editor-virtualization-electron.mjs`：`PASS: 10/10 virtualization rounds`；报告 `_audit/verification-editor-virtualization/electron-10-rounds.json`。
- `node scripts/verify-outline-virtualization-electron.mjs`：`PASS: 10/10 outline virtualization rounds`；报告 `_audit/verification-editor-virtualization/outline-electron-10-rounds.json`。
- `npm run test:services`：104 个文件 / 1047 条测试全部通过。
- `npm run type-check`：通过。
- `npm run build:vue`：通过，仅既有 chunk 大小与 Vite 配置 warning。

## 回头看

- 固定字符串扫描 `computeLineOffsets`、`split('\n')`、`replace(/\r\n/g` 于编辑器与大纲生产链路均无残留命中。
- 大纲验证脚本首轮失败不是产品缺陷，而是旧入口选择器按可见文本查找，导航已改为图标按钮；修复为稳定 ID 后功能断言通过。
- 复跑时发现大纲脚本曾删除整个共享目录，导致编辑器报告丢失；已改为单文件清理，两份报告现在可共存。
- 本阶段不改 textarea 底座，不触碰 IME、选区、undo、API 直写协议，只收敛虚拟化索引、viewport 测量与搜索高亮窗口。
