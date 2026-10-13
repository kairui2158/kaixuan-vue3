# 2026-10-13 oh-story-claudecode 采纳项升级方案

## 范围

基于 `_audit/RESEARCH_2026-10-13_OH_STORY_CLAUDECODE_ANALYSIS.md` 的五组采纳结论，产出可审核的升级优化方案：P0-B Memory 状态事务、P0-A 作用域上下文闭包、P1-C 新增物三级申报、P1-D 写后硬信号 Stop 网、P1-E 契约语义扩充。方案文件：`_audit/PROPOSAL_2026-10-13_OH_STORY_ADOPTED_UPGRADE_PLAN.md`。

## 本轮产物

- 每项给出 Before/After 对账表，覆盖权威状态、并发保护、上下文构造、授权分级、写后兜底、契约语义。
- 明确落地顺序：P0-B 先行（状态是派生视图与申报登记的地基），随后 P0-A，再 P1-C/D/E。
- 明确验证门禁：单测、全量回归、type-check、production wiring、Electron 真实实测；未实测收益一律标注“未验证”。
- 明确防旧存留：调用点迁移后增加依赖规则测试，禁止组件直调 `mergeMemory`，禁止双写路径。

## 诚实边界

- 本轮只产出方案，不改生产代码。
- 方案中的性能收益不承诺百分比，待真实 before/after 双运行后出实测对账表。
- 尺寸上限不照抄上游 3072/12288/8192 字节，落地前先采样校准。
- 原报告中上游 `story_codex_hook.py` 路径已在方案阶段复核，真实路径为 `skills/story-setup/references/codex/hooks/story_codex_hook.py`；新增物分级真实路径为 `skills/story-setup/references/codex/agents/narrative-writer.toml`。
