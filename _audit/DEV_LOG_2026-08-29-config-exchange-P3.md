# Agent/Skill Markdown 导入底座 P3

日期：2026-08-29

## 目标

让设置页导入预览展示真实来源、协议类型、字段追踪、诊断和未知字段，并修正 JSON 来源的协议标签。

## 修改

- `src/components/settings/AgentSettings.vue`：协议展示明确区分标准 JSON、标准协议 Markdown、兼容解析 Markdown；预览展示来源、字段读取、诊断、未知字段和冲突计划。
- `src/components/settings/SkillSettings.vue`：保持与 Agent 设置页相同的协议展示和诊断边界。

## 验证

- `npx vue-tsc --noEmit`：exit 0，无输出。
- `npx vitest run src/services/configExchange.spec.ts`：1 个文件通过，23 个测试通过。
- `npm run build:vue`：Vite 构建成功，189 modules transformed；保留既有动态导入和包体积警告。
- `taskkill /f /im electron.exe`：本轮旧 Electron 进程全部终止。
- `start-electron.bat`：输出 `[OK] Electron found`、`[OK] dist-renderer found`、`[OK] Application started`，监听 9227。
- 生产 CDP：生产 `file://` 页面标题为 `神意助手`；设置弹窗、7 个标签、Agent/Skill 面板和导入按钮真实渲染，容器未测出横向溢出。
- 预览诊断节点为 0：本轮未选择文件，属于空态；原生文件选择、确认提交、store、磁盘和重启恢复保留到 P5/P6。

## 阶段结论

P3 只核销设置页预览代码与生产可见性边界，不扩大为客户 Markdown 导入闭环通过。下一阶段为 P4 提交、冲突策略和持久化一致性。
