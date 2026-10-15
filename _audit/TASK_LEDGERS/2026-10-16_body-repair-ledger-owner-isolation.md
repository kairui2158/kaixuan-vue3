# 任务台账：正文修复台账与断点 owner 隔离

## 1. 目标与原话

- 用户原话：确认执行；你把这几轮我们讨论的全部进行汇总总结，整理出一个完整的执行方案给我。
- 目标行为：正文层失败先定点修复，再允许一次 full_chain 兜底；每次尝试和后处理进入同一 attempt 台账；chain 断点按项目/步骤/工作台 owner 隔离，不得跨目标恢复；生成中锁住卷/章节编辑与删除入口。

## 2. 门禁读证

- G0.3：区分已验证与未验证；Electron 使用本地 OpenAI-compatible provider，不冒充外部 live。
- G0.5：收尾执行全量测试、diff check、新旧语义扫描、验证证据核对。
- G0.6：方案先经用户确认后执行。
- G0.8：收尾清理可再生 profile，保留源码、测试、验证证据、台账与 DEV_LOG。
- G0.9：影响圈覆盖 orchestrator、chain breakpoint、workspaceSkillEngine、pipeline/coCreation store、ChatPanel、OutlineWorkspace、PipelinePanel、测试与验证脚本。
- G0.10：共享槽仅保留章节批次语义；chain 断点全部 owner 槽；旧无 owner chain 断点恢复被拒绝。
- G0.11：正文生成入口、卷/章节选择、生成按钮均由真实 DOM 点击/选择完成；未注入业务运行结果。
- G0.12：本台账即门禁执行记录。

## 3. 路由判定

- 加入：G0.3、G0.5、G0.6、G0.8、G0.9、G0.10、G0.11、G0.12。
- 排除 G1.10：本任务不改 API 直写授权语义。
- 排除 G1.19：本任务不改生成耗时策略，仅保证 attempt 与请求可观测。

## 4. 影响圈与作者反证

- 打算改的：正文 attempt 语义、post-process 台账、断点 owner、生成中 UI 锁、trace attempt 事件。
- 可能碰到的：章节批次共享断点、主页共创断点、大纲 chain 断点、运行记录体积、恢复/丢弃按钮。
- 反证一：`saveBreakpoint` 的 owner 槽是否会破坏章节断点？反证：`kind === 'chapters'` 恒走共享槽，新增测试证明两者共存且 owner 清理不删章节槽。
- 反证二：attempt 记录是否会把全文重复写入 trace？反证：初版确实会；本轮已改为摘要 + 200 字预览，并用 Electron 报告确认 `bodyPreview` 有界。
- 反证三：旧无 owner 断点是否可继续恢复？反证：`getChainResumePoint` 要求 owner 精确匹配，旧断点按 fresh run 处理。

## 5. 停止条件

- 完成：targeted/full_chain 语义测试通过；owner 隔离测试通过；全量服务测试通过；type-check 通过；真实 Electron UI 完成短文修复路径、UI 锁、持久化与 trace 验证；diff check 无错误；新旧断点消费面扫描清楚。
- 失败：修复无限循环、断点跨 owner 恢复、生成中可删除/编辑目标、trace 保存全文、全量测试或 type-check 失败。

## 6. 执行证据

- `npx vitest run src/services/bodyArtifactOrchestrator.spec.ts src/stores/coCreation.spec.ts src/stores/pipeline.spec.ts src/services/chainBreakpoint.spec.ts src/services/workspaceSkillEngine.spec.ts` → 5 files / 69 tests passed。
- `npm run test:services` → 164 files / 1929 tests passed。
- `npm run type-check` → exit 0。
- `npm run build:vue` → exit 0（仅既有 Vite 配置/大 chunk warning）。
- `node scripts/verify-body-repair-ledger-electron.mjs` → `===== BODY REPAIR LEDGER ELECTRON PASSED =====`。
  - run `run-1792086039057-1`：`success`。
  - attempts：`none/too_short/328 字`，随后 `targeted/complete/2460 字`。
  - 物理请求 2 次；targeted prompt 含上一版正文与目标字数。
  - 生成中卷/章节选择器与生成按钮均 disabled，结束后均恢复。
  - 证据：[_audit/verification-body-repair-ledger-electron/report.json](_audit/verification-body-repair-ledger-electron/report.json)。
- `git diff --check` → 无 whitespace 错误（仅历史 CRLF 提示）。
- 新旧语义扫描：`refreshBreakpoint()`/`clearBreakpoint()` 无参调用只在章节批次与 chain 成功终态；`loadBreakpoint` 均带 owner。

## 7. 缺口清单

- Phase 2 裁决：不新增持久化 per-attempt chain state sink。理由：正文 prompt context、attempt ledger、target guard 与 owner 断点已覆盖本轮故障面；再加状态 sink 会引入第二套恢复真相。代价是跨应用重启的中间 attempt 不持久化，失败断点仍从 chain checkpoint 恢复。
- Electron 使用本地 OpenAI-compatible provider，非外部 live。
- 本轮只验证正文层单章路径；批量子 Agent 与多 SKILL 组合不在本断言面。
