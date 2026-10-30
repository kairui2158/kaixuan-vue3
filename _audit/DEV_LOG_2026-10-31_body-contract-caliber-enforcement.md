# DEV LOG：正文受保护契约字数口径与应用侧执法（2026-10-31）

## 背景

3.110.9 封装后，SKILL 方对候选账本和 word-gap 反馈提出两项残留：

1. `measureProtectedBodyCandidate` 直接对完整候选输出计字，`【正文交接】` 中的章节、POV、FACT_LOCK 等账本字段也被计入净字数，导致候选比选偏向“账本更长”，word-gap 的当前字数与缺口虚高。
2. word-gap 只依赖 SKILL postProcess 报“正文过短/过长”；S2 `checkSceneBudgets` 只有交接里自报正数“生成下限”才检查。模型漏填数字时，应用三次重试期间不执法，直到最终验收才失败。

## 交付

- `measureProtectedBodyCandidate` 与 word-gap 的 `currentWords` 统一改为：先 `parseGenerationResult(output).body` 剥离交接账本，再 `countBodyWords`。
- 新增 `countProtectedBodyWords`、`extractProtectedBody` 单源口径函数，避免两个语义域继续共用完整输出。
- 新增 `validateProtectedBodyCandidate`：对剥离后正文本体执行 `resolveProseWordContract`，低于 80% 下限或超过 200% 上限返回错误文案。
- `executeRealSkill` 在 postProcess 之后追加应用侧执法门：受保护 body 契约存在且违规时，注入 `protected-body-contract` blocking issue，复用既有 blocking 重试与候选比选路径，不再依赖 SKILL 自报字数。
- 修正执行器测试的 `aiService` mock：新口径链路经由 `generationResult -> filterThinkingTags`，mock 必须提供该函数；真实 S2 集成测试同步补齐。
- `schemaRetryFeedback.spec.ts` 断言从 `\d+` 收紧为精确字数，防止测试吞回口径污染。
- 新增防误导断言：正文本体相同、交接账本一长一短时，`netWords` 与 `contractDistance` 不变，只允许 `rawChars` 变化。
- 更新 SKILL 适配手册：应用侧 80%/200% 契约是权威执法，交接“生成下限”只是申报信息；账本不计入净字数。

## 验证

- 定向回归 12 文件：12 passed / 303 tests passed。
- `npm run type-check`：exit 0。
- `git diff --check`：exit 0，仅 CRLF 提示。
- 红/绿证据：旧实现下 `当前净字数：1098` 暴露账本污染；修复后精确为 `1000`。执法门新增用例验证 2000 字触发一次重试，3000 字通过。

## 边界

- 不修改 `D:/codex/玄武规划SKILL/`，folder SKILL 只作为 fixture 读取。
- 用户已确认收尾：升版、封装与 git 提交在 3.110.10 完成，见 [DEV_LOG_2026-10-31_release-3-110-10.md](DEV_LOG_2026-10-31_release-3-110-10.md)。
- 本轮验证为单测与真实 S2 脚本集成测试，未发起 live 供应商请求。
