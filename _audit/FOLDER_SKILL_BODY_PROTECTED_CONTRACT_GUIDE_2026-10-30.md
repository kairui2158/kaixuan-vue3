# Folder SKILL 正文层适配说明：受保护契约、候选账本与 word-gap 重试（2026-10-30）

## 最高优先警告

1. 应用已在 S2 正文生成步注入**受保护正文契约**。契约句出现在 folder `preProcess` 之后的最终 user prompt 末尾，SKILL 不能折叠、删除或改写。
2. 最终请求缺契约时，应用会阻止物理 API 调用并写 `protected-contract-missing`。这不是可降级 warning，而是执行失败。
3. 正文层 SKILL **不需要为本轮改动修改模板或脚本**。当前 `kaixuan-s2` 已通过真实脚本集成测试；需要做的是理解新语义，避免在后续迭代里误删协议。
4. 应用现在会保存所有重试候选的测量账本，并按契约距离与交接完整性选优。**“最后一次输出”不再天然成为最终验收对象。**
5. 字数不足重试使用 `word-gap` 反馈，不携带候选全文。反馈会附带从上一版【正文交接】提取的有界结构骨架（章节、已完成/未完成场景、角色状态、章末状态、FACT_LOCK 等），不要把“没有上一版全文”理解为可以丢掉既有场景。

## 适用对象

- 目标读者：`D:/codex/玄武规划SKILL/凯旋-正文层/kaixuan-s2` 及后续同构正文 generator SKILL。
- 应用版本：基于 3.110.8 工作区实现；本轮修复未升版、未封装、未提交，等待用户确认。
- 事故样本：`C:/Users/凯瑞/Desktop/SKILL调试文件/run-trace-正文层-20261030-213657-deep`。
- 代码单源：`src/services/protectedSkillContract.ts`、`src/services/realSkillExecutor.ts`、`src/services/schemaRetryFeedback.ts`。

## 应用现在怎么注入契约

S2 的执行顺序是：

1. 组装原始任务输入。
2. 执行 folder `preProcess`。
3. 由应用把契约句追加到最终 user prompt 末尾。
4. 校验最终请求必须包含契约；缺失则不调用供应商。

当前 3500 字目标的契约句原文：

```text
请生成本章节正文，目标约3500字（不低于2800字，不超过7000字）。正文本体后必须追加【正文交接】区块。
```

契约中的字数边界来自应用单源 `resolveProseWordContract`：`minRatio=0.8`，`maxRatio=2`。3500 字即 2800/7000。

### 对 preProcess 的直接影响

- `preProcess` 收到的输入里**没有这条受保护契约**。
- 因此 S2 `preProcess` 不要解析这段契约；解析不到是正常现象。
- S2 `preProcess` 现有“折叠重复【正文交接】”的行为保留。契约在折叠之后注入，集成测试证明最终 prompt 仍然以契约句结尾。
- SKILL 不要自己追加契约句，否则会产生双份契约语义。

## 输出协议不变项

受保护契约不改变 S2 的输出格式。以下仍是 SKILL 侧协议：

- 正文本体之后恰好输出一个 `【正文交接】` 区块。
- 交接字段保持完整：章节、POV、已完成场景、未完成场景、来源覆盖状态、角色状态变化、章末状态、下一章必须使用、目标字数、生成下限、场景总数、`FACT_LOCK`、`NEW_FACT`。
- `FACT_LOCK` 继续逐行字段输出，八个字段不允许省略。
- 模板中的“不要输出解释或元数据”指分析、说明、自造元信息；协议要求的 `【正文交接】` 仍必须输出。

应用不接管上述校验，仍由真实 S2 `postProcess` 执行；应用只在外层测量候选并选优。

## 应用如何测量每个候选

每个物理重试候选都会被记录，字段如下：

| 字段 | 含义 |
|---|---|
| `attempt` | 第几次尝试，当前上限 3 次 |
| `rawChars` | 候选输出字符长度 |
| `netWords` | 应用净字数口径，来自 `countBodyWords` |
| `handoffCount` | `【正文交接】` 出现次数 |
| `contractDistance` | `max(0, minWords-netWords)+max(0, netWords-maxWords)` |
| `missingHandoff` | 是否没有交接区块 |
| `valid` | SKILL `postProcess` 校验是否通过 |
| `errorCount` | 校验失败项数量 |

这些字段写入运行记录的 `apiCalls[].bodyCandidateLedger`。最终保留结果写入 `apiCalls[].bodyCandidateRetention`。

### 候选保留规则

应用按以下顺序选择最终候选：

1. `valid=true` 优先。
2. `errorCount` 更少者优先。
3. `missingHandoff=false` 优先。
4. `contractDistance` 更小者优先。
5. 尝试序号更早者优先。

这意味着第 2、3 次更好的候选不会再被第 1 次旧候选覆盖。只有全部候选失败时，才保留最优失败候选并给出 degraded 结果，诊断码为 `schema-validation-best-candidate-retained`。

## word-gap 重试语义

当失败原因包含“正文过短/正文过长”时，应用改用 `word-gap` 策略。反馈包含：

```text
目标净字数
下限净字数
上限净字数
当前净字数
还差净字数
```

同时附上一版场景结构骨架。骨架从上一版 `【正文交接】` 提取，默认不超过 800 字符，包含：

- `章节`
- `POV`
- `已完成场景` / `未完成场景`
- `来源覆盖状态`
- `角色状态变化`
- `章末状态`
- `下一章必须使用`
- `场景总数`
- `FACT_LOCK`
- `NEW_FACT`

最后给出修复要求：以上方结构骨架为保留边界，只补足缺口场景和承接段，正文末尾必须保留 `【正文交接】`。

若上一版候选没有可解析的【正文交接】账本，应用会明确写“无法提供结构骨架”，不会伪造骨架；此时按原始任务输入重建正文，并补足交接账本。

### SKILL 应如何响应

- 基于原始任务输入与反馈中的结构骨架继续补写，不把反馈本身复述进正文。
- 不把“候选全文未回传”理解成丢弃上一版所有事实。
- 不为凑字数扩写解释性文字或重复段落，应补动作链、感知后果、对白回合和现场代价。
- 正文长度按**净字数**理解，而不是总字符数。

质量失败、结构失败、风格失败仍使用 bounded-summary 反馈，包含失败项、定位锚点和头尾 200 字符有界摘要，不携带全文。

## 终步打磨回显语义

应用不再把“S3 与 S2 高度相似”当成失败。终步角色由模板声明或链路语义推断：

- 终步为 `polish`：高重合只写 `chain-output-echo` info 观察事件，不触发重试；只有与上一步输出逐字相同（或内容哈希相同）才强制修复。
- 终步为 `generator`：回显比例达到 0.85 仍会触发一次修复。
- 角色无法识别时，应用保留 unresolved 警告，不会静默假设它是 S3 打磨步。

SKILL 侧若调整模板角色声明，请同步更新 `kaixuan-s3` 的终步角色元数据；应用消费的是声明后的单源角色，不再硬编码“最后一步就是打磨”。

## 与 kaixuan-s2 的对账结论

真实集成测试直接加载 `kaixuan-s2/script.js`，结论如下：

- S2 `preProcess` 折叠重复交接后，受保护契约仍位于最终 user prompt 末尾。
- S2 `postProcess` 接受的输出与应用的净字数测量兼容。
- 输出协议无需修改。
- `script.js` 只作为 fixture 读取，本轮未修改任何外部 SKILL 文件。

## SKILL 禁止事项

- 禁止在 `preProcess` 中解析受保护契约。
- 禁止在 prompt 或模板中重复注入受保护契约句。
- 禁止删除或改写最终 user prompt 末尾的契约句。
- 禁止把 `【正文交接】` 当成可选元数据省略。
- 禁止按总字符数与 3500/2800/7000 比较来宣称达标；应用使用净字数。
- 禁止因 word-gap 反馈未携带全文而重置事实、场景或段落结构。

## 排查与对账命令

```powershell
rg -n "请生成本章节正文|protected-contract-missing|bodyCandidateLedger|bodyCandidateRetention|word-gap" src/services src/stores src/components
```

应看到契约句、缺失阻断、候选账本和 word-gap 分支都有单源定义。

```powershell
npx vitest run src/services/realS2ProtectedContract.integration.spec.ts src/services/realSkillExecutor.spec.ts src/services/schemaRetryFeedback.spec.ts src/stores/runTrace.spec.ts
```

当前基线：12 个定向文件 306 条用例通过；`npm run type-check` exit 0。

## 证据

- `src/services/chainExecution.ts:52` 契约句原文。
- `src/services/realSkillExecutor.ts:952-970` 契约缺失阻断。
- `src/services/realSkillExecutor.ts:1378-1412` 候选比选与账本落点。
- `src/services/schemaRetryFeedback.ts:78-116` word-gap 分支。
- `src/services/realS2ProtectedContract.integration.spec.ts:52-141` 真实 S2 适配测试。
