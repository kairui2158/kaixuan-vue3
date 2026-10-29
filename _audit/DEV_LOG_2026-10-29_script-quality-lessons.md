# DEV_LOG 2026-10-29 脚本质量全量复盘

## 1. 目标

用户提供明确纠偏：脚本质量问题是历史性、系统性的，要求回顾所有能访问的对话记录和脚本记录，做脚本文件教训总结；并追加硬约束“不要抽样，要全量分析”。

## 2. 数据口径

- 会话物理文件 479 个：archived_sessions 121、sessions 127、D 盘备份 231。
- 唯一文件名 231 个；同一会话在 C/D 盘重复时不重复计数。
- 已统计文件 235 个：常规 230 + 巨型 5。
- 工具调用 449,106；脚本命令 46,679；错误/非零输出 116,577；JSONL 解析失败 11。
- `exec` 143,235 只来自 5 个巨型会话；常规 stats 没有该字段，所以“143,235 exec”必须说明口径，不能宣称全量 exec。
- 可疑脚本事件 16,526。
- 仓库脚本 704 个 / 204,305 行 / 8,117,974 bytes；分类与风险计数见主文档。
- 版本化脚本 54 个，其中 `verify-packaging-3-*` 31 个。旧交接里的 31/32 口径过窄，本轮废弃。

## 3. 仪器自身事故

旧 `summary.json` 把 5 个巨型会话报成 1 行 / 0 调用，原因是 `_audit/tmp-full-script-audit.mjs:70`、`:110` 使用 `readFile(file, 'utf8').catch(() => '')` 吞掉读取失败。巨型会话单独用 `tmp-full-script-audit-large.mjs` 统计后修正。此点作为 G1.21 的核心来源：审计仪器自身必须进入查账对象。

## 4. junction 事故证据

原始执行回显位于 `D:/codex/_codex_history_backup/sessions/2026/10/29/rollout-2026-10-29T02-01-14-01a183ac-5ef5-7c41-8699-3f726c01af84.jsonl:76`。脚本链为强制关闭 Codex -> 固定 sleep -> 数量比较复制 -> 原目录改名 -> 新建 junction -> 无哈希、无回滚、无异常恢复。中途失败后形成半迁移状态，导致会话不可恢复。

## 5. 根因

1. 脚本被当作一次性手段，未按交付物管理。
2. 验证门只验目标行为，不验仪器自身。
3. 审计/迁移/临时脚本逃逸 G1.5 的验证器范围。
4. 危险动作没有统一恢复计划。
5. 临时脚本无生命周期契约，版本化验证器无限堆积。

## 6. 产物

- `_audit/SCRIPT_QUALITY_LESSONS_2026-10-29.md`：全量复盘主文档。
- `_audit/神意开发经验总结_v9.md`：升级 v9.7.0，新增 G1.21，使用路由追加第 11 条。
- 本 DEV_LOG。
- `_audit/TASK_LEDGERS/2026-10-29_script-quality-lessons.md`：七节任务台账。
- `_audit/DEV_LOG_MASTER_INDEX.md`：登记本轮。
- 证据目录保留：`_audit/script-quality-audit-20261029/`。
- 删除本轮 3 个临时审计脚本：`tmp-full-script-audit.mjs`、`tmp-full-script-audit-large.mjs`、`tmp-script-pattern-summary.mjs`。

## 7. 验证

见任务台账第 6 节。2026-10-29 收尾复核已完成：

- `Test-Path` 3 个临时审计脚本 → `False False False`。
- `git status --short` → 3 个临时审计脚本已从未跟踪列表消失；用户 12 个脏文件保持原状。
- `rg` 经验文件 → `v9.7.0` 第 3 行、`### G1.21` 第 392 行、使用路由第 11 条第 566 行。
- `rg` 索引 → `2026-10-29 脚本质量全量复盘与 G1.21` 第 1311 行。
- `rg` 主文档 → 479 / 449,106 / 46,679 / 16,526 / 704 / 204,305 均已落盘。
- 3 份新文档 `Test-Path` → `True True True`。

## 8. 边界

- 未改产品源码，未提交 git，未封装，未做 live API 验证。
- 历史会话 JSONL 不修改。
- `_audit/tmp_verify_restore_ui.cjs`、`scripts/verify-outline-legacy-restore-electron.mjs`、`_audit/verification-outline-legacy-restore-electron-archive/` 属其他任务遗留，本轮不处理。
- 用户脏文件 12 个保持原样。
