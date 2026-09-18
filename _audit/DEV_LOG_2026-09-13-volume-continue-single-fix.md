# 2026-09-13 卷纲续生成单卷修复

## 问题

客户在卷纲层点击“续生成”后，应用一次性生成了所有剩余卷。用户确认的产品语义是：点一次“续生成”，只生成下一卷；写回项目后，再点一次继续。

## 根因

- `src/services/volumeGeneration.ts` 的 `continue` 分支提示词写死为“继续生成第 N+1 卷到第 M 卷”，这是批量补齐语义。
- `clampGeneratedVolumes()` 在 continue 且已有卷时按剩余卷数截取，未强制单卷；continue 且空列表时完全不截取。
- folder SKILL 的 S1 提示写“只锁定当前那一卷”，与应用层批量补齐提示冲突；本次实测中应用层批量语义占据主导。

## 修复

- continue 空列表：提示改为“请只生成第1卷的卷纲”，输出 JSON 数组正好 1 项。
- continue 已有卷：提示改为“请只生成第 N+1 卷的卷纲”，输出 JSON 数组正好 1 项。
- `clampGeneratedVolumes()`：continue 无论空列表还是已有卷，一律只保留 1 项，模型多输出时截断并标记 `truncated`。
- `PipelinePanel.vue`：续生成按钮 title 与生成日志明确“本次只生成下一卷”。
- `HelpGuide.vue`：帮助文档同步说明“续生成同样只生成下一卷”。
- `volumeGeneration.spec.ts`：覆盖 continue 空列表、continue 已有卷、continue 模型多输出三种单卷约束。

## 验证

- `npm run test:services`：14 个测试文件、186 条测试全部通过。
- `npm run type-check`：`vue-tsc --noEmit` 通过。
- `npm run build:vue`：主构建与 protocols 构建均成功。

## 未纳入本次

- samples.txt 改为占位符结构。
- JSON 解析围栏清洗。
- chain 中间产物滚雪球与 chain-output-echo。

这三项是独立后续项，不混入本次语义修复。
