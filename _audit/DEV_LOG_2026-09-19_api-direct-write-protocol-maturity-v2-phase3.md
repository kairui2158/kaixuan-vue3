# DEV LOG: API 直写协议成熟化 V2 Phase 3

日期：2026-09-19

## 本阶段范围

- 建立编辑直写协议版本协商机制，保持 v1 语义不变。
- 未知 / 不兼容版本返回 `unsupported_protocol_version`，错误信息携带当前支持列表。
- 模型未传版本时按 v1 兼容解析，并记录 `protocolVersionDefaulted:true`，不冒充显式协商。
- 协商结果从 `aiService` 事件透传到主页、大纲工作台和 runTrace，SKILL 调试方可看到缺省事实。

## 实现细节

- `src/services/editorEditSemantics.ts`
  - 单源导出 `EDITOR_EDIT_PROTOCOL_VERSION` 与 `SUPPORTED_EDITOR_EDIT_PROTOCOL_VERSIONS`。
- `src/services/editorTools.ts`
  - `editor.write` schema 描述 `protocolVersion` 的缺省语义。
  - 未知版本返回结构化错误和支持列表。
  - `resolveEditorEditProtocol()` 输出版本与 `defaulted`。
- `src/services/aiService.ts`
  - native 路径统一在工具执行前解析协议版本，`permissionDenied` / `duplicate_write_blocked` 等终态同样携带协议解析事实。
  - 修复 `jsonProtocolResolution` 在 `input` 声明前访问导致的 ReferenceError。
- `src/components/chat/ChatPanel.vue`、`src/components/common/OutlineWorkspace.vue`、`src/stores/runTrace.ts`
  - 事件、physical call、trace 输入与持久化字段全部补齐 `protocolVersionDefaulted`。

## 验证记录

- `npm exec -- vitest run src/services/aiService.spec.ts`：协议缺省事件断言通过。
- `npm exec -- vitest run src/services/editorTools.spec.ts`：`unsupported_protocol_version` 与支持列表断言通过。
- `npm run test:services`：72 文件 / 692 测试全部通过。
- `npm run type-check`：通过。

## 回头看补修

- 初轮实现曾把协议解析声明放在权限拒绝 / 重复写入分支之后，导致异常路径先引用后声明。
- 回头看将解析提升到工具执行循环的统一入口，五个 `reportPhysical` 分支共用同一解析结果，消除分支间字段漂移。
