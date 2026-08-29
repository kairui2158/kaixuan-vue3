# DEV_LOG 2026-08-27 P5 结构化校验

## 本阶段

为 Skill 增加声明式输入/输出校验和有限重试，并接入 chain/compose 的统一 Skill 调用边界。

## 变更

- 新增 `src/services/skillValidation.ts` 及 focused tests。
- `Skill` 和流水线模板保留 `inputSchema`、`outputSchema`、`retryPolicy`。
- `callValidatedSkill` 在请求前校验输入，在响应后校验 JSON/schema/rules；失败不向后续 chain 步骤传递。
- `outputFormat=json` 在没有显式 retryPolicy 时保持旧兼容语义，最多两次请求。
- 删除 `PipelinePanel.vue` 中已无引用的旧 `tryParseJson`。

## 验证

- focused：5 files / 17 tests passed。
- service：2 files / 44 tests passed。
- `npm run type-check`：无错误。
- `npm run build:vue`：181 modules transformed，构建成功。
- 源文件 `start-electron.bat` 启动并通过 CDP 验证结构化 Skill 字段写入、跨进程恢复和隔离键清理。

## 边界

没有客户 API 配置，未伪造真实网络请求、供应商重试计数或 UI 生成结果。上述项目需客户配置后补验。

## 经验引用

遵循 `EXPERIENCE.md` 中 2026-08-27 P1/P2/P3/P4 规则：先保持数据边界，单阶段最小修改；Electron 采用隔离键跨进程验证；无客户 API 不宣称真实生成通过。
