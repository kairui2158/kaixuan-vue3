# DEV LOG：word-gap 上游事实链骨架（2026-10-31）

## 背景

三份正文层运行记录复核后，SKILL 方指出：word-gap 反馈缺骨架时不应降级为“全链重建”提示，应优先用 FACT_LOCK 与末章事实链重建【正文交接】账本。042804 trace 证明这不是数据缺口：请求里已经携带上游场景骨架、`[上一章事实]` 和 `FACT_LOCK`，失败点在反馈合成器没有消费这份数据。

## 根因

`chainUpstreamContext` 存在于执行器，也注入了 user prompt，但 `buildSchemaRetryFeedback` 的两处调用都没有传入它；反馈器自身也没有上游骨架构建逻辑。于是候选缺【正文交接】时，唯一可用分支就是旧的 `none` 降级文案：“无法提供结构骨架，按原始任务输入重建正文”。这会把一次可定点补写的缺口放大成昂贵的全链重写。

## 交付

- word-gap 骨架改为三级优先级：候选账本优先，其次上游事实链，最后才是明确的 `none` 降级。
- 新增上游骨架提取器，只取 `[上一章事实]`、`【场景N】`、`POV`、`FACT_LOCK` 事实行，800 字符有界，不携带上游正文全文。
- upstream 分支明确指令：`基于 FACT_LOCK 与上游事实链重建【正文交接】账本，只补足缺口，不要整段正文重写`。
- 执行器两处反馈合成调用接入 `chainUpstreamContext`。
- trace 的 `schema-retry-feedback-composed` 事件新增 `strategy`、`scaffoldSource`、`scaffoldChars`、`scaffoldFieldCount`，运行记录可以直接判定反馈走了哪条分支。
- 补齐单测、真实调用链集成测试，并更新 SKILL 适配手册中的 word-gap 语义。

## 验证

```text
npx vitest run src/services/schemaRetryFeedback.spec.ts src/services/realSkillExecutor.spec.ts src/services/realS2ProtectedContract.integration.spec.ts
Test Files  3 passed (3)
Tests       71 passed (71)
```

```text
npm run type-check
> vue-tsc --noEmit
exit 0
```

```text
git diff --check
exit 0
```

红绿锚点：旧实现下 upstream 用例会命中“无法提供结构骨架”和“按原始任务输入重建正文”；新实现反馈包含 `FACT_LOCK：王芳=话痨`、`基于 FACT_LOCK 与上游事实链重建【正文交接】账本`，且不再包含旧降级文案。

## 边界

- 不修改 `D:/codex/玄武规划SKILL/`，folder SKILL 仅作为 fixture 读取。
- 本轮验证边界为单测、真实 S2 集成测试、type-check、diff 检查与 042804 trace 对账，未发起 live 供应商请求。
- 不升版、不封装、不提交 git；降AI校准相关的既有脏文件不属于本轮交付，保持原状。
