# useDeAi Composable 行为契约

> 源文件: `src/composables/useDeAi.ts`
> 职责: 去AI味核心处理引擎——3种模式的处理流水线、AI验证AI、朱雀检测、API调用
> 函数总数: 10（1导出入口 + 4处理模式 + 2验证 + 2工具 + 1 API调用）

---

## F01: callAiApi(systemPrompt, userText, useVerify?)

| 层 | 内容 |
|---|---|
| L1 结构 | async 函数。底层 API 调用封装，支持生成/验证两种供应商 |
| L2 输入来源 | 参数 systemPrompt/userText；providerStore.activeVerifyProvider/activeGenerateProvider；429重试间隔数组 |
| L3 输出目的地 | 返回 string（API 响应内容） |
| L4 副作用 | fetch HTTP 请求。429时 setTimeout 重试（最多8次，间隔30s-240s）。风险等级: 高 — 网络IO + 重试循环 |
| L5 通信范式 | providerStore 读取 + fetch HTTP |
| L6 验证用例 | Playwright: mock fetch 返回 200 → 返回 content；mock 429 → 重试8次后抛错；useVerify=true → 使用验证供应商 |
| L7 跨组件依赖 | 被 processChain/processSplitMerge/processMultiStep/crossModelCheck/zhuqueCheck 调用 |

## F02: getSkillTemplate(skillId)

| 层 | 内容 |
|---|---|
| L1 结构 | 普通函数。从 skillStore 获取技能模板文本 |
| L2 输入来源 | 参数 skillId；skillStore.skills 数组 |
| L3 输出目的地 | 返回 string（技能 template 或默认提示词） |
| L4 副作用 | 无。风险等级: 无 |
| L5 通信范式 | skillStore 读取 |
| L6 验证用例 | Playwright: 传入有效 skillId → 返回对应 template；传入无效 ID → 返回默认提示词 |
| L7 跨组件依赖 | 被 processChain/processSplitMerge/processMultiStep 调用 |

## F03: extractFirstSubject(text)

| 层 | 内容 |
|---|---|
| L1 结构 | 普通函数。提取文本首句主语用于 first_subject_different 验证 |
| L2 输入来源 | 参数 text（原文或处理结果） |
| L3 输出目的地 | 返回 string（主语关键词或首5字） |
| L4 副作用 | 无。风险等级: 无 |
| L5 通信范式 | 纯函数 |
| L6 验证用例 | Playwright: '他走了。' → 返回 '他'；'风吹过山谷。' → 返回 '风'；空串 → 返回 '' |
| L7 跨组件依赖 | 被 processChain 调用做 S1 输出验证 |

## F04: processChain(text, cfg)

| 层 | 内容 |
|---|---|
| L1 结构 | async 函数。串行链式处理: S1改写 → 硬规则pre → S2验证 → 硬规则post |
| L2 输入来源 | 参数 text（原文）, cfg（含 skillIds/hardruleEnabled/level）；DeAiSamples（风格样本）；skillStore（技能模板） |
| L3 输出目的地 | 返回 string（处理后的文本）；deAiStore.updateProgress 更新进度 |
| L4 副作用 | 多次 callAiApi（S1+S2）；DeAiProcessor.process（硬规则）；first_subject_different 验证+重试。风险等级: 高 — 多次API调用+文本修改 |
| L5 通信范式 | deAiStore 写入（进度） + callAiApi（HTTP） + DeAiProcessor（本地处理） |
| L6 验证用例 | Playwright: 配2个技能+硬规则ON → 检查进度经过 S1→hardrule→S2→hardrule 4步；S1首句主语与原文相同 → 触发重试 |
| L7 跨组件依赖 | deAiStore（进度）、skillStore（模板）、DeAiSamples（样本）、DeAiProcessor（硬规则） |

## F05: processSplitMerge(text, cfg)

| 层 | 内容 |
|---|---|
| L1 结构 | async 函数。Agent调度模式: 本地切分 → Promise.all并行重述 → 拼接 → 硬规则post |
| L2 输入来源 | 参数 text, cfg（含 splitSize/skillIds/hardruleEnabled）；splitSize 默认1000 |
| L3 输出目的地 | 返回 string；deAiStore.updateProgress 更新进度 |
| L4 副作用 | 切分文本（本地纯计算）；N次并行 callAiApi；DeAiProcessor.process（硬规则）。风险等级: 高 — N个并行API调用 |
| L5 通信范式 | deAiStore 写入（进度） + Promise.all（并行HTTP） + DeAiProcessor |
| L6 验证用例 | Playwright: 4000字文本+splitSize=1000 → 切出4段；4个并行请求；拼接后结果长度 > 原文50% |
| L7 跨组件依赖 | deAiStore、skillStore、DeAiProcessor |

## F06: processMultiStep(text, cfg)

| 层 | 内容 |
|---|---|
| L1 结构 | async 函数。Multi-step模式: 事件核提取 → 视角偏转 → 重组输出 → 硬规则post → S2验证 |
| L2 输入来源 | 参数 text, cfg（含 skillIds/hardruleEnabled）；DeAiSamples（注入S1） |
| L3 输出目的地 | 返回 string；deAiStore.updateProgress 更新进度 |
| L4 副作用 | 4次串行 callAiApi（提取+偏转+重组+验证）；DeAiProcessor.process。风险等级: 高 — 4次API调用+文本完全重组 |
| L5 通信范式 | deAiStore 写入（进度） + 串行 callAiApi + DeAiProcessor |
| L6 验证用例 | Playwright: 配1个技能 → 进度经过 extract→perspective→reconstruct→verify 4步；输出长度 > 原文50% |
| L7 跨组件依赖 | deAiStore、skillStore、DeAiSamples、DeAiProcessor |

## F07: crossModelCheck(originalText, processedText, cfg)

| 层 | 内容 |
|---|---|
| L1 结构 | async 函数。AI验证AI: 用验证供应商对比原文和处理结果，修正信息丢失 |
| L2 输入来源 | 参数 originalText/processedText/cfg；providerStore.activeVerifyProvider |
| L3 输出目的地 | 返回 string（修正后文本或原处理结果） |
| L4 副作用 | callAiApi（useVerify=true）。风险等级: 中 — 可能修改处理结果 |
| L5 通信范式 | providerStore 读取 + callAiApi（验证供应商） |
| L6 验证用例 | Playwright: 无验证供应商 → 返回原文本不报错；有验证供应商 → 调用API，返回长度 > 处理结果50% |
| L7 跨组件依赖 | providerStore、callAiApi |

## F08: zhuqueCheck(text, cfg)

| 层 | 内容 |
|---|---|
| L1 结构 | async 函数。AI检测: 用验证供应商分析AI生成特征，高分则重写 |
| L2 输入来源 | 参数 text/cfg；providerStore.activeVerifyProvider |
| L3 输出目的地 | 返回 string（重写后文本或原文本） |
| L4 副作用 | callAiApi 检测 + 可能的 callAiApi 重写。风险等级: 中 — 可能二次重写文本 |
| L5 通信范式 | providerStore 读取 + callAiApi |
| L6 验证用例 | Playwright: 无验证供应商 → 返回原文本；ai_score>60 → 触发重写；ai_score<=60 → 返回原文本 |
| L7 跨组件依赖 | providerStore、callAiApi |

## F09: process(text)

| 层 | 内容 |
|---|---|
| L1 结构 | async 函数。导出入口。根据 mode 分发到对应处理函数，统一执行 crossModelCheck + zhuqueCheck 后置验证 |
| L2 输入来源 | 参数 text；deAiStore 全状态（mode/skillIds/agentId/hardruleEnabled/level/splitSize） |
| L3 输出目的地 | 返回 string（最终处理结果） |
| L4 副作用 | startProcessing/finishProcessing；window.addEventListener('deai-cancel')/removeEventListener；3种模式分发。风险等级: 高 — 完整处理流水线 |
| L5 通信范式 | deAiStore 写入（全状态） + window 事件（取消） + 模式分发 |
| L6 验证用例 | Playwright: mode='chain' → 调用 processChain；mode='split-merge' → 调用 processSplitMerge；发送 'deai-cancel' → AbortController.abort |
| L7 跨组件依赖 | deAiStore（全状态）、processChain/processSplitMerge/processMultiStep、crossModelCheck、zhuqueCheck |

## F10: getAgentConfig(agentId)

| 层 | 内容 |
|---|---|
| L1 结构 | 普通函数。从 agentStore 获取智能体配置 |
| L2 输入来源 | 参数 agentId；agentStore.agents 数组 |
| L3 输出目的地 | 返回 agent 对象或 null |
| L4 副作用 | 无。风险等级: 无 |
| L5 通信范式 | agentStore 读取 |
| L6 验证用例 | Playwright: 传入有效 agentId → 返回 agent 对象；传入 null → 返回 null |
| L7 跨组件依赖 | 当前未被 process 函数实际使用（预留） |

---

## 副作用风险表

| 风险等级 | 函数 | 说明 |
|---|---|---|
| 高 | F01 callAiApi | 网络IO + 429重试循环（最多8次×4分钟） |
| 高 | F04 processChain | 多次API调用 + 硬规则 + 首句主语验证重试 |
| 高 | F05 processSplitMerge | N个并行API调用 + 文本切分/拼接 |
| 高 | F06 processMultiStep | 4次串行API调用 + 文本完全重组 |
| 高 | F09 process | 完整处理流水线入口 |
| 中 | F07 crossModelCheck | 验证供应商API调用，可能修改结果 |
| 中 | F08 zhuqueCheck | 检测API + 可能的二次重写 |
| 无 | F02 getSkillTemplate | 纯读取 |
| 无 | F03 extractFirstSubject | 纯函数 |
| 无 | F10 getAgentConfig | 纯读取 |

---

## 通信范式汇总

| 范式 | 函数 | 说明 |
|---|---|---|
| deApiStore 写入 | F04, F05, F06, F09 | updateProgress/startProcessing/finishProcessing |
| providerStore 读取 | F01, F07, F08 | 获取生成/验证供应商配置 |
| skillStore 读取 | F02 | 获取技能模板 |
| agentStore 读取 | F10 | 获取智能体配置 |
| fetch HTTP | F01 | 所有API调用的底层实现 |
| window 事件 | F09 | deai-cancel 监听/移除 |
| DeAiProcessor | F04, F05, F06 | 本地硬规则处理 |
| DeAiSamples | F04, F06 | 风格样本注入S1 |

---

## L6 Playwright 验证用例映射

| 用例编号 | 对应函数 | 测试脚本 | 状态 |
|---|---|---|---|
| T-deai-process-01 | F09 process 入口分发 | test_p8_deai.js | 已有（23/23 PASS） |
| T-deai-process-02 | F04 processChain 流程 | test_p8_deai.js | 已有 |
| T-deai-process-03 | F05 processSplitMerge 切分 | test_p8_deai.js | 已有 |
| T-deai-process-04 | F06 processMultiStep 多步 | test_p8_deai.js | 已有 |
| T-deai-process-05 | F07 crossModelCheck 验证 | test_p8_deai.js | 已有 |
| T-deai-process-06 | F09 deai-cancel 取消 | 需补全 | window事件取消处理 |
| T-deai-process-07 | F01 429重试 | 需补全 | 429重试8次后抛错 |
| T-deai-process-08 | F04 风格样本注入S1 | 需补全 | DeAiSamples注入验证 |
| T-deai-process-09 | F04 first_subject_different | 需补全 | S1首句主语相同触发重试 |
| T-deai-process-10 | F08 zhuqueCheck | 需补全 | ai_score>60触发重写 |

---

## 关键行为契约备注

1. **执行顺序 (Fix D)**: chain模式中 S1 先在原文上运行，然后硬规则清洗，再 S2 验证。旧架构曾把硬规则放在 S1 之前导致 AI 率上升，新架构已修正。
2. **风格样本注入 (Fix E)**: DeAiSamples 只注入 S1（第一个技能/改写主力），不注入 S2（验证师）。每次只取前3个样本（约300-450字），不是全部38个。
3. **S2 低温验证 (Fix B)**: S2 使用 useVerify=true，temperature=0.3（验证阶段低温），S1 使用 temperature=0.7（改写阶段高温）。
4. **429重试机制**: callAiApi 实现8次递增重试（30s→240s），与旧架构 renderer_v2.js 的规则18 SOP一致。重试期间通过 updateProgress 更新进度提示。
5. **取消机制**: process() 注册 window 'deai-cancel' 事件监听器，通过 AbortController.abort() 取消进行中的 fetch。finally 块确保移除监听器。
6. **zhuqueCheck 的 ai_score 解析**: 从 API 返回文本中用正则 `"ai_score"\s*:\s*(\d+)` 提取分数，而非 JSON.parse。这是因为模型可能返回非纯JSON。分数>60触发重写。
7. **split-merge 切分策略**: 优先在段落边界(\n\n)切分，其次在句号/感叹号/问号切分，最后硬切。浮动范围200字（splitSize+200内找断点）。
8. **multi-step 无切分**: 当前 processMultiStep 不切分全文，直接整篇传入。长文本可能超过模型上下文限制——这是已知限制，需后续版本加切分。
9. **crossModelCheck 截断**: 比较时原文截取前2000字，避免超长文本导致API token溢出。
10. **agentConfig 未使用**: getAgentConfig 函数存在但 process 函数未实际调用它获取 model/temperature——agent 配置当前仅通过供应商间接影响调用参数。
