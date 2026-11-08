# TASK LEDGER - runtrace-attempt-audit-v1

日期：2026-11-08  
版本：3.118.0（不升版）  
分支：`codex/direct-write-negative-verification`  
基线：`35cc417d2e9c792b73c4d176211a3a8e75709580`  
方案：[_audit/PROPOSAL_2026-11-08_RUNTRACE_ATTEMPT_AUDIT_RESIDUAL_V1.md](_audit/PROPOSAL_2026-11-08_RUNTRACE_ATTEMPT_AUDIT_RESIDUAL_V1.md)

## 1. 背景

外部审计把 `payload-005` 按导出编号误读为第二次 attempt，得出“部分重试缺反馈”的结论。复核确认 payload 编号按导出内容去重后的首次出现分配，不是 API attempt 时序；真正的应用侧缺口是导出物没有把 payload 与 attempt 归属显式落盘。同时，`body-feedback-audit` 这类 info 审计事件可能被事件压缩淘汰，且历史淘汰只剩总数、看不到类型分布。

## 2. 实施摘要

| 项 | 实现 | 证据 |
| --- | --- | --- |
| A1 | payload 收集时保留首次出现的 API/physical call 归属；导出新增 `firstSeen` 与 `payloadToAttemptIndex`；不重排编号。 | `electron/ipc/runTrace.js:175-182`、`192`、`428-441` |
| A2 | `body-feedback-audit` 加入 `RETAINED_AUDIT_EVENT_TYPES`。 | `src/stores/runTrace.ts:1049` |
| A3 | 事件压缩改为先淘汰同类重复 info，再淘汰唯一 info；每次淘汰记录 `droppedInfoEventsByType`；warn/error 与白名单仍不淘汰。 | `src/stores/runTrace.ts:1655-1694` |
| 类型接口 | 新增 `RunTracePayloadToAttemptIndexEntry`、payload `firstSeen`、ledger 类型分布字段。 | `src/stores/runTrace.ts:513-524`、`635-669` |
| 测试 | 新增 payload 归属/交叉一致性、白名单保留、重复优先淘汰用例。 | `electron/ipc/runTrace.spec.js:65-131`、`384-387`；`src/stores/runTrace.spec.ts:2681-2724` |

方案收口时移除了 `firstSeenEventSeq`：事件缺少稳定 `apiCallId` 回链，强行填序号会虚构审计关系。接口声明中一处缩进异常也已修正，不改行为。

## 3. 验证证据

### 回归与构建

```text
npx vitest run src/stores/runTrace.spec.ts electron/ipc/runTrace.spec.js
Test Files 2 passed (2); Tests 139 passed (139)

npm run test:services
Test Files 249 passed (249); Tests 2689 passed (2689)

npm run type-check
exit 0

npm run build:vue
vite production build exit 0; vite protocols build exit 0
```

### 历史 trace 回放

输入：`C:/Users/凯瑞/Desktop/SKILL调试文件/run-trace-正文层-20261108-074151-deep/run-trace.json`

```text
history payload refs=45
rebuilt payload refs=31
first-20 id mismatches=[]
all common id mismatches=[]
payloadToAttemptIndex entries=31
apiResponseIndex owner refs=6
apiResponseIndex owner mismatches=[]
verifyApiResponseIndex={"total":3,"brokenRefs":[],"ok":true}
sample owner={"call":"api-1794094912037-15","ref":"payload-002","owner":{"payloadRef":"payload-002","apiCallId":"api-1794094912037-15","apiCallSeq":1}}
```

45 -> 31 是旧存储导出时已把 prompt/processing/folder 全文替换为 ref，重放时这些被替换字段为空，所以不再新增 payload；已有 payload 编号未变。这是幂等重放，不是编号回归。

### 差异检查

```text
git diff --check（V1 相关 5 个文件）exit 0
numstat:
electron/ipc/runTrace.js 47/18
electron/ipc/runTrace.spec.js 73/0
src/stores/runTrace.ts 58/6
src/stores/runTrace.spec.ts 44/0
```

## 4. [DEFECT-SWEEP] 缺陷面枚举

| 缺陷面 | 检查结论 | 证据 |
| --- | --- | --- |
| 归属事实面 | 只记录首次出现来源，不根据重复 payload 假造其他 attempt。 | `electron/ipc/runTrace.js:175-182` |
| 编号兼容面 | 去重顺序、`duplicateCount`、payload-N 分配和旧编号语义不变。 | 回放 `first-20 id mismatches=[]`；`electron/ipc/runTrace.js:391-426` 未改 |
| API 索引面 | 保留 `apiResponseIndex` 原结构，仅新增只读交叉索引。 | `electron/ipc/runTrace.js:428-441` |
| 缺失归属面 | 非 API 来源使用 `firstSeenSource`；API 来源省略该字段；完全缺失时索引项省略可选字段。 | `electron/ipc/runTrace.js:204-233`；测试 `electron/ipc/runTrace.spec.js:108-125` |
| 审计保留面 | `body-feedback-audit` 在 128 条上限压缩后仍保留并导出。 | `src/stores/runTrace.spec.ts:2681-2703` |
| 淘汰策略面 | 同类重复先淘汰，首个观测保留；唯一类型不先消失；白名单与 warn/error 不淘汰。 | `src/stores/runTrace.ts:1655-1694`；`src/stores/runTrace.spec.ts:2705-2724` |
| 台账一致性面 | `droppedInfoEventsByType` 每次淘汰都更新；总数与类型分布可对账。 | 测试断言 `{ progress: 4 }`；`src/stores/runTrace.ts:1687-1689` |
| 消费面 | 只扩展 manifest 与 ledger，不改 RunTracePanel 判定、生成链路或裁决语义。 | diff 范围仅 runTrace 导出器/类型/测试/方案 |
| 敏感信息面 | payload 去敏感与 mask 流程未改；索引只引用已有 payload id。 | `electron/ipc/runTrace.js:14-40` 与 payload 处理流程未改 |
| 历史产物面 | 不迁移、不重写旧 trace；旧 schema 可被新导出器重放读取。 | 历史 trace 回放成功，`verifyApiResponseIndex ok=true` |
| 过度设计面 | 不新增事件、不重建 payload、不引入运行时共享状态；只补导出归属和最小压缩可见性。 | 方案第 6 节；实现差异 222/24 行 |

## 5. 风险与边界

- 历史导出产物不会自动获得新索引；只有重新导出或新运行产生。
- 重复 payload 只指向首次出现；其他 attempt 的相同文本需要结合 `apiResponseIndex` 对账。
- `droppedInfoEventsByType` 是向后兼容扩展；旧读取端忽略未知字段。
- 未做 Electron GUI 真实供应商重测；本轮不触碰生成链路，历史失败根因仍属 SKILL/模型层。

## 6. 收尾

只提交 V1 相关 6 个文件；不提交 `_audit/verification-pipeline-provider-channel-live/` 与 `_audit/verification-body-bare-not-ready-targeted/` 下的用户脏文件。版本保持 3.118.0，本轮不做重新封装。
