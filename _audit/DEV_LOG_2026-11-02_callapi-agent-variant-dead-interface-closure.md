# DEV LOG — callApiWithAgentVariant 死接口闭环

日期：2026-11-02  
版本：3.110.15 → 3.110.16  
方案：[PROPOSAL_2026-11-02_CALLAPI_AGENT_VARIANT_DEAD_INTERFACE_CLOSURE_V1.md](PROPOSAL_2026-11-02_CALLAPI_AGENT_VARIANT_DEAD_INTERFACE_CLOSURE_V1.md)  
台账：[TASK_LEDGER_2026-11-02_callapi-agent-variant-dead-interface-closure.md](TASK_LEDGERS/TASK_LEDGER_2026-11-02_callapi-agent-variant-dead-interface-closure.md)

## 目标

收口 V6.2 登记的独立后续项：删除 `PipelinePanel.vue` 中无任何调用方的 `callApiWithAgentVariant` 三行转发包装，保留唯一生产入口 `callApiWithAgentVariantOwned`，并加负向守护防止旧入口名回潮。

## 交付

1. `deai-injection-policy.spec.ts` 新增死包装负向守护：旧函数声明必须不存在，`Owned` 定义与生产调用必须存在，裸名（扣除 `Owned`）命中必须为 0。
2. 删除 `PipelinePanel.vue` 中 `callApiWithAgentVariant` 三行包装；不改 `Owned` 的名称、参数、行为、trace 与 `meta.deai` 传递。
3. `_audit/FOLDER_SKILL_DEAI_MENTOR_GUIDE_2026-11-01.md` 第 9 节补充：agent 调用唯一生产入口是 `callApiWithAgentVariantOwned`，旧包装名已退役。
4. 版本升级 3.110.16 并重新封装安装包。

## 验证

- RED：删除前新增负向用例运行 `npx vitest run src/components/pipeline/__tests__/deai-injection-policy.spec.ts` → 1 failed / 12 passed，失败点为旧包装函数声明存在。
- GREEN：删除后同一命令 → 1 file passed，13 tests passed。
- 定向回归：4 个降AI契约/显示/链路测试文件 → 38 tests passed。
- 类型：`npm run type-check` → exit 0。
- 构建：`npm run build:vue` → exit 0。
- 真实 Electron：`node scripts/verify-deai-guidance-ui.mjs` → run A/B/C/D/E 全部 PASS。
- 全量回归：`npm run test:services` → 239 files / 2553 tests 全部通过。
- 引用闭包：`rg -n "callApiWithAgentVariant" src scripts electron` 只剩测试负向断言、`Owned` 定义/调用/trace source；生产裸名命中 0。

## 边界

- 本轮不扩展为全仓死代码扫描；其他死代码候选独立立项。
- B6 教学有效性仍保持 `provisional`，本轮不声明降AI质量效果。
- 不修改手动去AI味功能、五态 UI、trace 事件语义与 `Owned` 内部实现。
