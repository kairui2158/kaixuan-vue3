# Agent/Skill Markdown 导入底座 P0 开发日志

## 目标

固定两种 Markdown 输入形态共用的协议元数据，给后续解析、字段映射、推导、预览和冲突处理提供统一契约。本阶段不修改业务解析行为。

## 本轮修改

- `src/services/configExchange/types.ts`
  - 增加 `ConfigSourceInfo`、`MarkdownInputKind`、`ConfigFieldTrace`、`ConfigDiagnostic`。
  - 为 `ConfigParseResult` 增加来源、字段追踪和诊断元数据。
  - 增加 `ParsedConfigItem`，明确归一化对象与来源信息分离。
- `src/services/configExchange.spec.ts`
  - 增加规范 Front Matter/普通 Markdown 共用来源契约的类型级 focused 测试。
- `EXPERIENCE.md`
  - 记录 P0 协议先行和证据边界经验。

## 验证

命令：`npx vitest run src/services/configExchange.spec.ts --reporter=verbose`

结果：`Test Files 1 passed (1)`，`Tests 14 passed (14)`。

命令：`npm run type-check`

结果：`vue-tsc --noEmit` 无错误输出，进程退出码 0。

## 边界

本阶段没有证明普通 `# 标题` Markdown、无 Front Matter 文件、第三方字段别名或复杂 YAML 已能导入；这些保留给 P1-P3。没有启动 Electron，因为 P0 仅新增协议类型和纯单元测试，原生文件选择器不在本阶段改动范围。

## 状态

- [x] 协议类型落地
- [x] focused 测试通过
- [x] 类型检查通过
- [x] 经验文件和开发日志更新
- [ ] P1 解析管线（下一阶段）
