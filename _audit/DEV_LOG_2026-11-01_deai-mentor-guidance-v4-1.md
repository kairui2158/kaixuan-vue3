# DEV_LOG_2026-11-01_deai-mentor-guidance-v4-1

## 目标

按用户确认升级 V4.1：补入 V4 审计出的 10 个漏项，并针对“执行缺漏、闭环缺失”的系统性病灶新增可验证的执行条例。

## 交付

1. 新增方案：`_audit/PROPOSAL_2026-11-01_DEAI_MENTOR_GUIDANCE_V4_1.md`
2. 新增台账：`_audit/TASK_LEDGERS/TASK_LEDGER_2026-11-01_deai-mentor-guidance-v4-1.md`
3. V4 台账头部补 V4.1 指向
4. 主索引登记本日志

## 关键修正

1. 双向隔离补半边：设置页观测混源消费 pipeline 事件，纳入 Phase A 只读过滤。
2. blocking 第二裁判退场：流水线路径不再让降AI findings 决定 attempt success/errors。
3. 注入预算补声纹：1200 指导 + 700 声纹 = 1900 字符硬上限，trace 分项。
4. step 4 多点耦合收口为共享常量，负向扫描裸字面量。
5. HelpGuide、预检 warning、finalStepRetry 透传、keyword-lite 双实现、voice profile 快照、脆弱断言全部纳入任务清单。
6. 新增执行条例：Task 单元、预写验证、五列执行对账表、中断恢复协议、回头看清单、违例即停。

## 验证

- 只读复核 10 个漏项的当前源码锚点，均与 V4 审计结论一致。
- 本轮未改生产代码，不运行应用测试；批准后按 V4.1 验证矩阵执行。

## 边界

- 待用户审核；审核通过前不改生产代码。
- 不升版、不封装、不提交 git。
- 不改手动去AI味功能本体。
- 教学有效性与阈值校准保持 provisional。
