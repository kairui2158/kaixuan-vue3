# PROPOSAL - RunTrace Attempt 归属与反馈审计残留修复 V1

日期：2026-11-08  
分支：`codex/direct-write-negative-verification`  
基线：`35cc417d` / `v3.118.0`  
性质：可执行修复方案；用户批准后才改代码。

## 1. 结论

SKILL 提出的“attempt2 盲飞缺反馈”不成立：payload 文件编号按导出内容去重后的首次出现序分配，不是 attempt 时序。本轮实测中 `payload-005` 是 S1 第一次 attempt（设计上无重试反馈），`payload-009` 才是第二次 attempt；`apiResponseIndex.physicalCalls[].response.ref` 已能证明正确映射。

真实应用侧残留收敛为 3 项：

1. 导出 payload 编号缺少 attempt 归属，第三方只能靠编号猜测，必然复发误读。
2. `body-feedback-audit` 是 info 审计事件，但不在 `RETAINED_AUDIT_EVENT_TYPES` 白名单，会被 128 条事件压缩淘汰。
3. 事件压缩的 info 淘汰策略按数组顺序整批执行，历史审计事件位于 info 洪水之前时会被淘汰，白名单只能补已知项，不能根治这一结构问题。

## 2. 证据

| 证据 | 位置 | 事实 |
| --- | --- | --- |
| 编号分配 | `electron/ipc/runTrace.js:250-271` | 按 `kind + sha256` 去重，`payload-N = unique.length + 1`。 |
| 权威时序映射 | `electron/ipc/runTrace.js:428-461` | `buildApiResponseIndex` 已建立 physical call 到 payload ref 的映射。 |
| 映射字段缺失 | `src/stores/runTrace.ts:633-642` | `RunTracePayloadRef` 只有 `id/file/bytes/chars/sha256/duplicateCount/artifactRole/createdAt`。 |
| 导出 ref 生成 | `electron/ipc/runTrace.js:391-426` | refs 没有回写首次出现的事件 seq / physical call id。 |
| 白名单 | `src/stores/runTrace.ts:1008-1031` | 含上一轮新增的两类反馈事件，不含 `body-feedback-audit`。 |
| 淘汰逻辑 | `src/stores/runTrace.ts:1627-1647` | 非白名单 info 逐条淘汰，`droppedInfoEvents` 只计数不记录明细。 |
| 审计事件 | `src/stores/runTrace.ts:1108-1147` | `recordBodyFeedbackAudit` 发射 info 级 `body-feedback-audit`。 |
| 旧 trace 实测 | `run-trace-正文层-20261108-074151-deep` | `total=518 / kept=128 / droppedInfo=390`；`body-feedback-audit=0`、`schema-retry-feedback-composed=0`；payload 与 physical call 权威映射可交叉验证。 |

## 3. 修复目标

让一份导出 trace 不依赖内部口头解释即可回答：

1. `payload-N` 对应哪次 API / physical call / attempt。
2. 反馈构造和反馈使用审计事件在长 trace 中不被压缩丢失。
3. 历史运行发生信息淘汰时，能知道淘汰了哪些事件类型，而不是只剩总数。

## 4. 实施项

### A1. payload attempt 归属

`collectPayloads` 收集每个 payload 时记录 `apiCallId`、`apiCallSeq`、`physicalCallId`、`physicalCallSeq` 与 `firstSeenSource`。`firstSeenSource` 固定取 `apiCalls`（省略）/ `promptSnapshots` / `processingReports` / `folderDiagnostics` 之一。实现收口时不再声明 `firstSeenEventSeq`：现有事件缺少稳定 `apiCallId` 回链，事件序号会虚构审计关系。

导出 manifest 落地两个新接口：

```ts
interface RunTracePayloadAttemptRef {
  apiCallId?: string
  apiCallSeq?: number
  physicalCallId?: string
  physicalCallSeq?: number
  firstSeenSource?: string
}

interface RunTracePayloadRef {
  // 既有字段不动
  firstSeen?: RunTracePayloadAttemptRef
}

interface RunTracePayloadPayloadToAttemptIndex {
  schemaVersion: 1
  entries: Array<{ payloadRef: string } & RunTracePayloadAttemptRef>
}
```

`apiResponseIndex` 保留原字段，不重构。新索引由导出器按 `collectPayloads` 顺序一次性生成；缺失归属时省略可选字段。

不重排 `payload-N` 编号：去重、duplicateCount、旧 trace 兼容和现有 E2E 的编号断言全部保持不变。

### A2. `body-feedback-audit` 白名单

在 `RETAINED_AUDIT_EVENT_TYPES` 追加 `body-feedback-audit`。理由：它记录候选字符数、反馈字符数、锚点数和抑制字符数，是重试行为的事后审计，不是高频过程事件；同一数据面的 `schema-retry-feedback-composed` / `final-step-feedback-composed` 已在上一轮加入，这里属于补漏。

同批测试：白名单事件 + 30 条 info 噪声压缩后必须保留 `body-feedback-audit`，导出 JSON 包含该事件，`droppedInfoEvents` 正确递增。

### A3. 历史压缩可见性

`evictExcessEvents` 的淘汰顺序改为：

1. 优先淘汰非保留类型且重复的 info 事件，保持同类去重。
2. 再淘汰非保留类型的唯一 info 事件。
3. 不淘汰 `warn` / `error`，不淘汰白名单事件。

每次淘汰都会向 `eventLedger.droppedInfoEventsByType` 记录被淘汰事件类型与数量；不把旧事件重新纳入 `run.events`，不修改历史导出产物。新增 `RUN_TRACE_SCHEMA_VERSION` 不需要；新增 ledger 字段属向后兼容扩展。

## 5. 非目标与边界

1. 不改生成链路、验收裁决、重试策略和 SKILL 调用语义。
2. 不修改 folder SKILL 与 SKILL 手册。
3. 不重排或重写历史 payload 编号，不做破坏性迁移。
4. 不把 `api-start`、`run-activity`、`physical-call`、`direct-retry-start/finished` 等高频过程事件加入白名单；它们由 `apiResponseIndex`、物理记录或非 info 级事件覆盖。
5. 不改 `chain-handoff-delivery`、`body-step-acceptance`、`body-artifact-attempt/validated` 的等级语义；事实裁决失败已经是 `warn/error`，成功态保持 info。

## 6. 防过度设计自查

| 问题 | 结论 |
| --- | --- |
| 用户目标是否必须依赖它 | 是。trace 是失败裁决证据，payload 编号误导已造成外部误判。 |
| 现有机制为什么不够 | `apiResponseIndex` 有时序映射，但 payload 自身缺少归属，第三方默认按编号对时序。 |
| 是否增加延迟、状态纠缠或语义冲突 | 低。导出时一次构建，不引入运行时共享状态。 |
| 删除它是否损失真实用户价值 | 是。删除会让“payload 编号 ≠ attempt”继续误导调试。 |
| 是否有更小实现 | 已按最小化：只加 `firstSeen` 与可选索引，不改编号；白名单只补一项；压缩只保留计数加轻量类型汇总。 |

## 7. 验证矩阵

| 层级 | 验证 |
| --- | --- |
| 主进程单测 | 新增 payload 归属测试：重复 payload、不同 api call、physical call、事件来源、缺失归属。 |
| 白名单单测 | 新增 `body-feedback-audit` 压缩保留测试。 |
| 淘汰策略单测 | 新增三类测试：同类重复先淘汰、唯一事件不误删白名单、warn/error 保持不动。 |
| 回放脚本 | 指定历史 trace：`apiResponseIndex` 与新索引一致；不重排 payload id；manifest 可还原 attempt 时序。 |
| 导出兼容 | schema 22/23 均可重新导出；新增字段缺省不破坏旧读取。 |
| 回归 | `npx vitest run src/stores/runTrace.spec.ts electron/ipc/runTrace.spec.js`；`npm run test:services`；`npm run type-check`；`npm run build:vue`。 |
| Electron / live | 通过真实供应商生成一次长正文运行，验证保留反馈审计事件、新索引导出与旧 payload 编号语义。 |

## 8. 台账与交付

1. 建立本轮 TASK_LEDGER，登记证据、实施、验证、G1.14 缺陷面枚举、风险与收尾。
2. 编号不升版；本轮 3.118.0 收口。若需要重新封装，使用 `npm run build` + `npm run verify:packaging` 并记录 SHA-256。
3. GATE 使用 `[DEFECT-SWEEP]` 引用台账缺陷枚举清单；无证据不得声明闭环。
4. 方案批准前不改代码。
