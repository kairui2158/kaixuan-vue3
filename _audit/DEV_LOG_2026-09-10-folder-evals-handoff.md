# 2026-09-10 Folder SKILL 评测协议交接文档

## 开发功能

新增 `_audit/SKILL_HANDOFF_FOLDER_EVALS.md`，面向第三方 Folder SKILL 制作方说明 `evals.json` 评测协议。

文档覆盖：

1. 文件位置与导入行为：根目录 `evals.json`、坏 JSON 降级 warning、不注入模型上下文。
2. 完整结构与字段表：`schema` / `name` / `cases`，用例 `id` / `name` / `input` / `assertions`。
3. 六种断言的真实语义：`min_length`、`max_length`、`contains`、`not_contains`、`json_valid`、`resource_referenced`，特别标明 `caseSensitive` 默认区分大小写、`json_valid` 要求整段输出可解析、`resource_referenced` 校验资源清单而非输出文本。
4. with/baseline 双路执行流程与 `improved/same/degraded/indeterminate` 判定规则。
5. 报告位置、运行记录「技能评测」来源、`eval-report` 事件。
6. 费用规则：只显式触发、每用例至少两次 API 调用、建议 3 到 10 个用例。
7. 用例编写建议、常见失败原因、快速模板。

## 用途

第四阶段已把 with/baseline 评测能力做进应用，但第三方制作方缺少协议说明书。本文档补齐这个缺口，使制作方可以为自己的技能包编写标准评测用例，用户可以运行评测并导出现场，SKILL 改版后有可比对的质量证据。

## 验证

```text
node -e "...extract and validate markdown json blocks..."
validated 10 json blocks
```

用脚本提取文档中全部 10 个 JSON 代码块并逐个校验：语法合法；`cases` 数组、用例 `id` 唯一性、`input` 非空、`assertions` 非空、断言类型与必填参数均与 `folderSkillEval.ts` 的解析规则一致。
