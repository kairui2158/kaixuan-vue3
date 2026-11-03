# DEV_LOG：正文层内嵌降AI V6.1 模型画像过度设计冻结

日期：2026-11-03
关联方案：`_audit/PROPOSAL_2026-11-02_BODY_DEAI_COLLABORATION_V6_1.md`
关联台账：`_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-03_body-deai-v6-1-overdesign-freeze.md`

## 目标

按用户批准执行过度设计收敛：模型画像在校准结论仍为 NOT READY 时不得进入 prompt。保留 S2→S3 诊断、校准账本、SKILL 迭代报告和 UI 三线，不回退成应用第二作者。

## 根因

原实现只凭 `sampleCount >= 5` 就允许画像注入。这个门槛只能证明某规则出现过，不能证明低误伤、高召回、阈值适配或跨题材稳定。降AI校准结论仍是 provisional / NOT READY，因此统计噪声可能直接进入 S1/S2/S3 prompt，属于把观测数据提前产品化的过度设计。

## 实际改动

1. `src/services/deaiModelProfile.ts`
   - 新增 `DEAI_MODEL_PROFILE_RELEASED = false` 与 `DEAI_MODEL_PROFILE_RELEASE_GATE = 'calibration-not-ready'`。
   - `buildDeaiModelProfileGuidance` 在冻结期直接返回空字符串，即使候选规则达到样本门槛。
   - `buildDeaiModelProfileTraceEvent` 对 eligible 规则输出 `warn` 事件，label 为“模型事实画像已冻结，未注入”，detail 记录 `released=false`、`releaseGate`、eligible/injected 数量与 `guidanceChars=0`。
2. `src/services/deaiModelProfile.spec.ts`
   - 新增冻结态断言：候选规则存在时 guidance 仍为 0，trace 明确 release gate。
   - 原注入格式测试改为按发布开关分支，避免用未发布路径冒充已发布行为。
3. `scripts/verify-deai-stage-guidance-electron.mjs`
   - 物理请求断言 `【模型事实情报】` 不出现。
   - `deai-model-profile` trace 断言 `released=false`、`releaseGate=calibration-not-ready`、`injectedRuleCount=0`。
4. `scripts/verify-deai-stage-guidance-live.mjs`
   - summary schema 升级为 version 3，观测对象新增 `modelProfile` 字段。
   - live 收尾前断言每章都有画像观测，且冻结期 `injectedRuleCount=0`、`guidanceChars=0`。
5. `src/components/pipeline/__tests__/deai-stage-guidance.integration.spec.ts`
   - 新增源码守护，防止绕过发布开关或删除冻结 trace 语义。
6. 文档与经验
   - V6.1 方案、两份 SKILL 适配说明、经验总结 G1.22 同步为“画像观测保留、prompt 注入冻结”。

## 过度设计复查

- 未新增用户配置、阻塞等待、评分系统或自动 SKILL 修改。
- 未扩大 S2→S3 诊断职责，诊断仍不参与验收、重试和终态。
- 未删除校准账本与画像观测，因为它们是未来解冻的必要证据链。
- 冻结使用单一布尔发布开关，不构建新的复杂发布系统。

## 验证

- `npx vitest run src/services/deaiModelProfile.spec.ts src/components/pipeline/__tests__/deai-stage-guidance.integration.spec.ts`
  - RED：旧测试假设画像会注入，2 failed。
  - GREEN：更新为冻结语义后，2 files / 21 tests passed。
- `node --check scripts/verify-deai-stage-guidance-electron.mjs`：exit 0。
- `node --check scripts/verify-deai-stage-guidance-live.mjs`：exit 0。

## 追加清理：报告 trace 死项

- 复查发现 `deai-skill-report` 只存在于 `RETAINED_AUDIT_EVENT_TYPES`，没有任何生产发射点；但报告导出按钮、导出结果、取消/失败提示和误伤登记是真实用户可见功能。
- 裁决：不为 trace 而 trace，删除 whitelist 死项；不新增报告导出 trace 事件，避免扩大运行记录面。
- 同步：`deai-stage-guidance.integration.spec.ts` 改为负向守护，禁止 `deai-skill-report` 再进入 retained trace whitelist。
- 追加验证：`npx vitest run src/components/pipeline/__tests__/deai-stage-guidance.integration.spec.ts src/services/deaiSkillReport.spec.ts` → 2 files / 19 tests passed。
- 追加验证：`npm run type-check` → exit 0。
- 追加验证：`npm run test:services` → 245 files / 2631 tests passed。

## 边界

- 当前已有一个 live 进程在本改动前启动，其运行中的 trace 仍可能体现旧画像行为；该进程不作为冻结后验证证据，也不得强杀。
- 冻结后的真实 Electron 复跑已通过；真实供应商 observational live 已在五个证据目录中留证，含失败与 running 状态。
- 本轮当时不升版、不封装、不提交 git；2026-11-03 用户已授权 3.112.0 交付，发布证据由发布台账接续。
