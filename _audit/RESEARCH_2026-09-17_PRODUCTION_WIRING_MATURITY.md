# 2026-09-17 生产接线成熟度社区深度调研

## 调研问题

为什么“新链路已存在”仍然失效：修 A 时 B 继续用旧假设、旧链路、旧测试、旧规格没有被一次性清干净。本次调研目标是从成熟开源系统里找出可机器化的生产接线门禁，而不是继续靠人工记忆。

## 证据来源

全部为本轮真实克隆并读取的源码，缓存于 `_audit/research-cache/`：

| 项目 | 版本状态 | 关键源码 |
|---|---|---|
| semantic-router | GitHub main 分支浅克隆 | `semantic_router/route.py`、`routers/base.py` |
| Roo Code | GitHub main 分支浅克隆 | `src/core/auto-approval/index.ts`、`src/core/tools/WriteToFileTool.ts` |
| knip | GitHub main 分支浅克隆 | `packages/knip/src/ConfigurationChief.ts`、`IssueCollector.ts`、`graph/analyze.ts` |
| dependency-cruiser | GitHub main 分支浅克隆 + 本仓依赖 | `src/analyze/add-validations.mjs`、`types/rule-set.d.mts` |

## 发现 1：semantic-router 的路由成熟形态是“语料 + 每路由阈值 + 评估”

源码级证据：

1. `route.py:63-74`：每个 `Route` 自带 `score_threshold`，不是全局一个阈值。
2. `routers/base.py:646-701`：`_pass_routes()` 对每个 route 单独取 `route.score_threshold or self.score_threshold or 0.0`；没有任何 route 过阈值时返回空 `RouteChoice()`，不会硬选一个。
3. `routers/base.py:1671-1677`：`get_thresholds()` 暴露每路由阈值，供评估和调参消费。
4. `routers/base.py:1681-1755`：`fit()` 会先评估当前准确率，再迭代搜索每路由阈值，只保留最优组合。
5. `routers/base.py:1757-1798`：`evaluate()` / `_vec_evaluate()` 用标注集输出准确率，作为门禁数据。

结论：我们当前的“显式正则 + 全局阈值 + 少量 spec 断言”只达到其初级形态。生产级路由必须有独立评估脚本、每路由阈值、no-match 语义，并把评估结果作为发布门禁。

## 发现 2：Roo Code 的权限面是显式策略，不是字符串推断

源码级证据：

1. `src/core/auto-approval/index.ts:130-180`：`AutoApprovalHandler` 对每个工具显式分类：只读工具走 `alwaysAllowReadOnly`，写工具走 `alwaysAllowWrite / alwaysAllowWriteOutsideWorkspace / alwaysAllowWriteProtected`，未匹配一律 `ask`。
2. `src/core/tools/WriteToFileTool.ts:100-180`：写入前生成 unified diff，`askApproval()` 未通过则直接返回；另一分支如果用户拒绝，会调用 `revertChanges()` 恢复原文。
3. 写入成功后才设置 `task.didEditFile` 并推工具结果，避免“显示完成但实际没写”的假状态。

结论：工具面权限必须由单一策略函数决定，且所有入口共享。我们仓库当前存在第二接线：`ChatPanel.vue:2508` 直接 `createEditorTools()`，`ChatPanel.vue:2557` 直接 `resolveDialogueToolSurface()`，`OutlineWorkspace.vue:1181/2326/2352` 又各有一套。这不是语义错误本身，而是“入口可自建工具面”的结构性缺口。

## 发现 3：knip 把“旧残留”做成机器报告

源码级证据：

1. `constants.ts:233-268`：报告类型包括 unused dependencies、unlisted dependencies、unused exports、duplicate exports、circular dependencies、unused files。
2. `IssueCollector.ts:69-104`：连 `ignore` 规则本身都会被追踪；不再命中的 ignore pattern 会被报告为 unused，防止“为了掩盖问题留下的旧豁免”。
3. `graph/analyze.ts:354-360`：未使用文件直接进入 issue，不允许“先留着以后再说”。
4. `ConfigurationChief.ts:88-111`：production 模式作为一等配置，不同模式有不同入口。

结论：旧链路清理不能只靠 `rg` 人工判断。需要一个固定命令输出 issue 清单，并把豁免也纳入审计。

## 发现 4：dependency-cruiser 的规则是“生产接线门禁”的直接实现

源码级证据：

1. `src/analyze/add-validations.mjs:17-39`：每个模块和依赖都会经过 `validateModule/validateDependency`，违规直接写入结果。
2. `types/rule-set.d.mts:47-51`：规则支持 `orphan: true`，孤儿模块可设为 error。
3. `types/rule-set.d.mts:163-177`：规则支持 `reachable`，可以强制“评估脚本必须消费语料单源”。
4. `README.md:107-109`：`pathNot` 可禁止特定目录依赖特定模块，例如禁止 UI 直接依赖底层执行器。

结论：本项目已安装 `dependency-cruiser@18.3.1`，可以立刻用它落三条硬规则：UI 禁止直接 import 工具执行器；评估脚本必须 import 意图语料单源；旧工具名禁止在生产代码 reachable。

## 与我们仓库的对账

| 社区机制 | 我们现状 | 缺口 |
|---|---|---|
| 每路由阈值 + 评估集 | `chainIntentCorpus.ts` 只有 spec 内消费 | 缺独立评估脚本与发布门禁 |
| 单一权限策略函数 | `dialogueFoundation.ts` 已有，但组件仍可直接调用底层 | 缺入口隔离 |
| unused/orphan 机器报告 | 依赖已装，无项目规则 | 缺配置 |
| 依赖图 forbidden/reachable 规则 | 未使用 | 缺配置 |
| 拒绝后 revert | `editorEditService` 有批次回滚 | 需入口统一后统一验证 |

## 调研结论

成熟系统不依赖“开发者记得删干净”。它们把旧链路清理变成三类机器门禁：意图路由有评估集，权限工具有单源策略，依赖图有 forbidden/reachable/orphan 规则。我们的生产接线缺失不是单点 bug，而是缺少这三类门禁。

## 补充调研：第四轮词库饱和统计

用户判定前三轮补词仍不足，要求“补到不能再补”。第四轮对 RiSAWOZ 训练集做全量句式统计，并与 Roo Code、本仓 trace、写作领域枚举交叉。

真实统计输出：

- 数据：`dst_all_train10000.json`
- 对话数：10000
- 用户话轮：67290
- 行为分布：Request 44965、Inform 26509、General 9768、Bye 9439、Greeting 8173
- 提取骨架：45 类标记句式、问句尾缀、短承接
- 提取脚本：`_audit/research-cache/risawoz/extract-phrase-skeletons.cjs`
- 统计输出：`_audit/research-cache/risawoz/phrase-skeleton-summary.json`

从 RiSAWOZ 迁移的是行为句式，不是领域词：

1. 澄清/条件：我希望、我想要、最好是、最好能、能不能、可不可以、有没有、是不是、要不要。
2. 追问：呢、啊、呀、吧、那它、那这个、那这、还有。
3. 请求：请、麻烦、帮我、再帮我、帮我看看、给我推荐。
4. 短承接：好的、好啊、行啊、嗯、明白了、谢谢、再见。

第四轮最终词库矩阵：

- 文件：`_audit/phrase-corpus-saturated.json`
- 词库：994 个词/短语、22 个分组
- 验收样本：170 条
- 结构：写入授权 148、位置咨询 153、状态/权限/禁写 131、参考索取 130、短承接 87、澄清请求 99、意图关键词 246
- 机器审计：`node scripts/audit-phrase-corpus-saturation.cjs` 输出 `problems: []`

饱和判定：四源交叉后，当前已知用户表达面已覆盖；新增词必须提供来源与“现有词为何不能覆盖”的证据，否则拒绝入库。当前判定为“方案层饱和”，生产接入仍待用户审核后执行。

## 补充调研：第五轮词库追加统计

用户判定第四轮仍未达到“补到不能再补”。本轮新增两个本地真实语料源并全量抽取：

- CrossWOZ `train.json`：5012 组对话、42346 条用户话轮。提取脚本 `_audit/research-cache/crosswoz/extract-phrase-corpus-fifth-round.cjs`（输出到 `phrase-corpus-fifth-round-summary.json`）。
- COIG-CQIA `zhihu_score9.0-10_clean_v10.jsonl`：2561 条高质量中文 instruction。
- 标记词：53 类中文行为标记；输出文件 `_audit/research-cache/phrase-corpus-fifth-round-summary.json`。

迁移原则不变：只迁移行为句式，不迁移酒店、景点、平台领域实体。CrossWOZ 贡献了礼貌请求、比较选择、状态确认、位置归属；COIG-CQIA 贡献了解释原因、说明依据、详细区别、举例说明、说明条件。

第五轮最终词库矩阵：

- 文件：`_audit/phrase-corpus-saturated.json`
- 词库：1540 个词/短语、22 个分组
- 验收样本：246 条
- 结构：写入授权 148、位置咨询 272、状态/权限/禁写 311、参考索取 249、短承接 87、澄清请求 227、意图关键词 246
- 机器审计：`node scripts/audit-phrase-corpus-saturation.cjs` 输出 `problems: []`
- 长短语式共存观测：175 条；这是最长命中优先匹配的必要设计，不是审计错误

第五轮追加的六类缺口：

1. 位置归属：放在哪一卷、挂在哪个节点、落在哪一节、坐标在哪、分支挂在哪。
2. 权限状态：能不能动正文、是否支持写入、写入了吗我看不到变化、是不是卡住了。
3. 礼貌请求：麻烦你告诉我位置、麻烦你标出目标位置、请定位到相关段落。
4. 对比选择：哪一版更适合这一卷、哪个写法更贴近主线、给我一份对比表。
5. 解释说明：解释一下理由、说明判断依据、用大白话解释、再讲讲理由。
6. 条件约束：硬约束是时间线不能变、重点是主线不要跑偏、我更倾向于保留原句。

饱和判定：在 RiSAWOZ、CrossWOZ、COIG-CQIA、Roo Code、本仓 trace、写作领域枚举六源交叉后，当前已知用户表达面已覆盖；新增词必须提供来源与“现有词为何不能覆盖”的证据，否则拒绝入库。当前判定为“方案层饱和”，生产接入仍待用户审核后执行。

## 补充调研：中文话术语料

第一轮调研偏机制，话术语料不足。第二轮补充三个真实来源：

1. RiSAWOZ：`terryqj0107/RiSAWOZ`，已克隆到本地并解包。`RiSAWOZ-data/task2-data-DST/dst_all_train10000.json` 提供约 1 万组中文对话，含用户原话 `transcript` 与 `user_acts` 行为标注。可迁移的是请求、补充条件、确认、比较、追问、感谢、结束、短承接这些行为句式，不是旅游领域词。
2. Roo Code：工具提示词源码给出成熟话术范式。读工具明确单次范围与锚点；写工具要求写前必读、精确匹配、非唯一失败；系统规则要求优先用工具自取信息、追问时给 2-4 个完整选项、完成必须收口。
3. COIG-CQIA：仓库真实存在，但 `COIG-CQIA-full.jsonl` 的 LFS 对象 404，不可复现；仅小的 COIG-PC 样本可用，因此不纳入本阶段主语料。

结论：最优方案需要“机制门禁 + 行为语料”两层同时补。语料必须带来源标签进入评估集和示例库，并保留负样本，不能只补写入正样本。

## 补充调研：意图与位置词库

现有实现只有 16 个写入动词、9 个位置表达，状态/权限询问只有 1 条复合正则，无法覆盖真实用户表达。RiSAWOZ 的行为标注给出的启发是：用户常以“有没有”“能不能”“我希望”“这个是吗”等澄清句式补充条件，这些句子必须先于写入动词判定；Roo Code 的规则给出的启发是：工具能力必须显式写进提示词，包括定位、读取、写入、完成、追问边界。

本方案补四张词表：

1. 写入授权词表：保存、改成、调整、合并、拆分、移动、写回、回填、直接应用、按方案执行等。
2. 位置咨询词表：哪一部分、第几段、适合放在、目标片段、锚点、候选位置、看上下文、滚动到那里等。
3. 状态与权限词表：有权限吗、能不能写、写了吗、为什么没写入、先不写、只讨论。
4. 参考索取词表：给我建议、给几个选项、先出文案、比较一下、哪个更合适。

并且必须固定冲突优先级：状态/权限 > 禁写声明 > 位置咨询 > 参考索取 > 显式写入 > 语义兜底。“告诉我插入点在哪里”必须只读，“把这段插入第三段”必须写入，两者都含“插入”。
