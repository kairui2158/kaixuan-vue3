# 2026-10-07 长文档执行效率修复

## 范围

- 新增 `src/services/documentTransformService.ts`：确定性本地变换执行器，支持标点、空行、编号、结构重排、完全重复删除与 Word 基础排版整理；输出 diff 与结构/正文多重集/去重约束校验。
- `src/services/longDocumentExecutionPlanner.ts` 新增 `local-transform` 执行模式：严格词法映射、本地试跑必须 `completed`、不确定回落模型路径。
- `src/services/toolContextCompactor.ts`：只压缩更旧的成功读取结果；写入、失败、小结果、协议形态保留；审计主线 `messages` 与 `toolRequestDeltas` 保留原文。
- `src/services/aiService.ts`：`no_write_progress` 收敛门；重复读取指纹缓存；模型终局总结与实际 diff 满足时允许完成。
- 首页与大纲双入口接入 `local-transform`；本地完成后立即结束 run，不锁 API 输入框。
- 修复两个真实实现缺陷：
  1. 首页 `runHomeLocalTransform()` 曾把 `plan.progressLabel` 写入 `turn.userRequest`，trace 丢失用户原话；改为 `input.requestText`。
  2. 首页活动任务曾用写入前快照 `contentVersion` 收口；新增 `completeHomeActiveTaskAfterLocalTransform()`，写入后重建快照再收口。

## 深挖记录

- step5 原话不含“标点/符号”，原验证断言是测试语义错误，不是实现缺陷；改为“标点保持不变”。
- chat run 终态保持 `running` 是设计内语义：本地变换完成后会话保持开启等待下一轮，不是卡死。
- `createInactiveMainEditorTargetSnapshot` 仍被多处消费，不是死代码，不删除。
- `runHomeLocalTransform()` 内不再使用写入前版本完成活动任务，新旧语义未并存。

## 验证

- `npx vitest run src/services/activeExecutionTaskStore.spec.ts src/services/directWriteWiring.spec.ts src/services/longDocumentExecutionPlanner.spec.ts src/services/documentTransformService.spec.ts`：72/72 通过。
- `npm run type-check`：通过。
- `npm run build:vue`：通过并刷新 renderer。
- `node scripts/benchmark-long-document-local-transform.mjs`：PASS。
  - step5 真实 7,602 字：3.319ms，205 行变化，校验 ok。
  - 合成 1,035,784 字：61.561ms，7,600 行变化，校验 ok。
- `node scripts/verify-long-document-local-transform-electron.mjs`：PASS。
  - Electron PID 58328，可见窗口，CDP 9296，step5 原话请求。
  - 大纲入口：181ms，0 物理请求 / 0 API call / 0 工具调用，11 行变化。
  - 首页入口：165ms，0 物理请求 / 0 API call / 0 工具调用，11 行变化。
  - 六项断言全绿；证据 `_audit/verification-long-document-execution-efficiency/local-transform-electron.json`。

## 诚实边界

- 真实 API 语义分支 `untested`：当前无可用 live key；禁止 mock 冒充 live 结果。
- 版本封装未执行；当前 3.76.0；是否升版本并封装由用户另行确认。

## 客户重点复验

- 在大纲或首页发送 step5 同类请求：“整理整篇文章：统一小节编号、清除多余空行、按编号重排，并保持所有正文内容不丢失。”
- 应看到“已本地完成整理……未发起模型请求”，编辑器内容即时变化；导出运行记录应包含 `execution_mode: local-transform`、操作集、diff、校验结果与耗时。
- 含语义判断的请求（如改写、合并近义重复）不应走本地变换，应进入模型路径。
