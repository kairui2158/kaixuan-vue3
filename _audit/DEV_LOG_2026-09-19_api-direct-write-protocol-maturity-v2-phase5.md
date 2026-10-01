# DEV LOG: API 直写协议成熟化 V2 Phase 5

日期：2026-09-19

## 本阶段范围

- 按“单元 / 协议仿真 / mock E2E / live”四层收口验证，禁止互相冒充。
- 执行全量回归、生产接线门禁、意图评估与构建。
- 回写 V2 Phase 3-5 开发日志、经验文件 v5.19 与总索引。

## 验证记录

- `npm run type-check`：通过。
  - 收尾时发现 `skillValidation.spec.ts` 的非法 schema 负例被 TS 类型检查拒绝；已用 `as unknown as JsonSchema` 显式保留负例语义，复跑通过。
- `npm run test:services`：72 文件 / 692 测试全部通过。
- `node scripts/verify-api-direct-write-provider-matrix.mjs`（无 live 配置）
  - 协议仿真：五供应商全部 pass。
  - live：五供应商 untested。
- live（用户临时提供 key，仅环境变量传入，未落盘）
  - base：`https://openapi.cloud-ai.cn/v1`
  - model：`deepseek-v4.1-flash`
  - openai-compatible：pass，返回 1 个合法 tool call。
  - Anthropic、Gemini、DeepSeek 直连、Azure 直连：untested。
- `npm run build:vue`：通过；仅存在既有 chunk 大小与 `__dirname` 警告，非本轮新增。
- `node scripts/verify-api-direct-write-v2-e2e.mjs`：通过。
  - 13 张截图场景全部保存。
  - 覆盖主页空文档插入、替换回滚、多命中、版本变化、大段即时写入、流式跟随、定位讨论、非法协议矩阵、权限拒绝、重复写入、跨轮工具审计、大纲直写、锁定态、流水线无工具面、兼容 JSON 降级。
  - 运行记录导出包含 write / reveal / presentation 证据；诊断覆盖面证据落盘。
- `npm run evaluate:chain-intent`
  - 基础语料 20/20 分类与路由通过。
  - 饱和语料 335 样本 / 1653 短语 / 22 组。
  - analyze / edit / generate / discuss 四类 precision、recall、F1 均为 1.0000，无失败类别。

## 验证分层结论

- 单元与回归：通过。
- 协议仿真：五供应商 pass。
- mock E2E：通过。
- live：仅 openai-compatible pass；其余供应商未实测，交付时必须如实标注 `untested`。

## 回头看

- `git status` 对账确认本轮新增策略源、压测脚本、验证产物与 V2 文档均在预期文件集内。
- 旧 V1 Phase 3-5 日志保留为历史，不覆盖；V2 使用 `maturity-v2-phaseN` 命名，避免新旧并存混淆。
