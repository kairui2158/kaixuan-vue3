# 2026-10-16 正文修复台账与断点 owner 隔离

## 目标

正文生成失败不再无限泛化修复：非空草稿先做 targeted repair，失败后允许一次 full_chain fallback。每次尝试与后处理进入同一 attempt 台账；chain 断点按 owner 隔离；生成中锁住目标编辑入口。

## 交付内容

- `bodyArtifactOrchestrator`：
  - `repairScope` 从布尔修复升级为 `none / targeted / full_chain`。
  - targeted prompt 带上一版正文、字数、目标字数与错误清单。
  - full_chain 只允许一次兜底，之后终止，不再无限修复。
  - attempt 增加 `attemptId`、`repairScope`、`body`、`metadata`。
  - 新增 `recordBodyArtifactPostProcess()`，hard signal 与 DeAI 后处理写入同一 attempt 台账。
- 断点 owner 隔离：
  - pipeline chain 使用 `pipeline_breakpoint_owner_${ownerKey}`；主页共创使用 `co_creation_breakpoint_owner_${ownerKey}`。
  - 章节批次继续使用共享 `pipeline_breakpoint`，这是显式设计例外，不是新旧并存。
  - 旧无 owner chain 断点恢复被拒绝，按 fresh run 处理。
- `workspaceSkillEngine`：`breakpointOwnerKey` 成为 adapter 必填身份；加载、恢复、保存、清理均按 owner。
- `PipelinePanel`：
  - `genBody()` 增加防重入守卫。
  - 生成中锁定卷/章节选择、编辑、删除入口。
  - 修复请求记录改为拷贝 message，避免原对象被后续修改。
  - attempt trace 事件保存摘要与 200 字预览，不再把全文重复塞入运行记录。
- `ChatPanel` / `OutlineWorkspace`：断点读取、恢复、丢弃按当前目标计算 owner key。

## 验证

- 专项：5 files / 69 tests passed。
- 全量：`npm run test:services` → 164 files / 1929 tests passed。
- 类型：`npm run type-check` → exit 0。
- 构建：`npm run build:vue` → exit 0。
- 真实 Electron UI：`node scripts/verify-body-repair-ledger-electron.mjs` → `===== BODY REPAIR LEDGER ELECTRON PASSED =====`
  - 第一轮短文 `too_short`，第二轮 `targeted/complete`。
  - 物理 provider 请求 2 次。
  - 生成中卷/章节选择器与生成按钮 disabled，结束后恢复。
  - 证据：[_audit/verification-body-repair-ledger-electron/report.json](_audit/verification-body-repair-ledger-electron/report.json)

## Phase 2 裁决

不新增持久化 per-attempt chain state sink。现有 prompt context、attempt ledger、target guard、owner 断点已覆盖本轮故障面；引入第二套状态会制造新的恢复真相。代价：跨应用重启时中间 attempt 不持久化，失败仍从 chain checkpoint 恢复。

## 诚实边界

- Electron 使用本地 OpenAI-compatible provider，非外部 live。
- 本轮验证正文层单章路径；批量子 Agent 与多 SKILL 组合未纳入本轮断言。

## 台账

- [_audit/TASK_LEDGERS/2026-10-16_body-repair-ledger-owner-isolation.md](_audit/TASK_LEDGERS/2026-10-16_body-repair-ledger-owner-isolation.md)
