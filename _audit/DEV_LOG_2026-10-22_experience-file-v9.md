# 2026-10-22 经验文件 v9 去旧纳新

## 任务目标

- 台账：[_audit/TASK_LEDGERS/2026-10-22_experience-file-v9-restructure.md](_audit/TASK_LEDGERS/2026-10-22_experience-file-v9-restructure.md)
- 目标：按用户指令对经验文件“重新汇总去旧纳新，升级版本号”；只升级经验文件内部版本，不改应用版本，`package.json` 保持 `3.103.0`。

## 改动内容

- `_audit/神意开发经验总结_v9.md`
  - 文件名由 `_v7.md` 通过 `git mv` 升级为 `_v9.md`，Git 历史保留，避免旧新双文件并存。
  - 标题从 v8 升级为 v9，头部版本从 v8.20 升级为 `v9.0.0`，更新日期 `2026-10-22`。
  - 删除头部 v8.0-v8.20 的版本流水账，替换为修订史维护规则：头部只保留当前版本号、日期与结构规则，过程细节经 DEV_LOG 总索引、TASK_LEDGER 与 Git 历史追溯。
  - 修正使用路由中重复的 `9.` 编号，G0.12 路由改为 `10.`。
  - 门禁正文语义未改动，G 编号不变。
- `STACK.md`：规则来源指针迁移到 `_v9.md`，版本写为 `v9.0.0`，标题日期更新为 `2026-10-22`。
- `docs/ARCHITECTURE_V2.6.md`、`docs/ARCHITECTURE_V2.7.md`：当前规则指针迁移到 `_v9.md`；两文仍是历史架构资料。
- 历史 DEV_LOG、PROPOSAL、TASK_LEDGER 与带历史注记的过程稿中的 `_v7.md` 引用保留，不改写当时事实。

## 验证

- `Get-ChildItem _audit -Filter '神意开发经验总结*.md'`：仅 `神意开发经验总结_v9.md`。
- `rg -n "神意开发经验总结_v7\.md" STACK.md docs src scripts electron _audit`：活跃指针 0 命中；剩余命中均属历史记录或历史注记。
- `rg -n "^9\. |^10\. " _audit/神意开发经验总结_v9.md`：路由编号唯一，`10.` 为 G0.12 路由。
- `git diff --check`：exit 0，无 whitespace error，仅 LF/CRLF 提示。

## 诚实边界

- 本轮为文档与规则元信息整理，无生产代码变更，因此未运行 `type-check`、服务测试或 Electron 验证。
- 旧文件 `神意开发经验总结_v7.md` 的历史内容通过 Git rename 历史追溯；本轮未另行复制旧版快照。
- 历史“现行规则”注记按当时事实保留，未重写为 v9 口径。

## 收尾

- DEV_LOG 总索引已追加本轮条目。
- Git 提交：`docs(experience): consolidate gates into v9 experience file`。
- 提交后 `git status --short` 干净。
