# 2026-09-20 意图路由业界主流成熟体系方案 V6

**方案状态：已审核通过，未实施**
**方案成熟度：成熟（架构、依赖、接线点、风险、验证闭环、Electron 级真实 UI 高强度实测门禁均已核实；按 Phase 顺序执行）**

## 0. 结论

当前应用的路由体系不是“没有路由”，而是停留在第 2 代：**高精度规则层 + jieba 分词 + TF-IDF 余弦语义层**。它对已收录说法非常准，但对换说法、错别字、口语化长句、领域名词组合的泛化能力不足。

业界主流成熟体系是四层递进：

1. 规则/权限层：保留，作为安全闸门。
2. 词法/TF-IDF 层：保留，作为低成本快速分类。
3. **本地 embedding 语义层：新增，这是本次核心升级。**
4. LLM 兜底路由层：可选开启，用于低置信复杂输入。

V6 的核心动作是把第 3 层补上，并把阈值从“手写常数”升级为“数据校准值”，同时建立真实 trace 回流的评测闭环。

## 1. 调研证据与真实性

本轮 20 轮搜索证据已落盘：

- 搜索结果：`_audit/RESEARCH_2026-09-20_intent-router-maturity-search.json`
- semantic-router README：`_tmp_research/semantic-router-readme.txt`
- semantic-router 阈值优化文档：`_tmp_research/semantic-router-threshold-optimization.ipynb`
- semantic-router RouteLayer 源码：`_tmp_research/semantic-router-base-router.txt`
- Rasa fallback 文档：`_tmp_research/rasa-fallback-doc.txt`
- transformers.js README：`_tmp_research/transformers-js-readme.txt`

关键真实数据：

| 对象 | 数据 | 对本方案的意义 |
| --- | --- | --- |
| `aurelio-labs/semantic-router` | 3,911 stars | 语义路由作为独立层的社区成熟度证明 |
| `huggingface/transformers.js` | 16,304 stars | JS/TS 生态本地运行 ONNX 模型的成熟度证明 |
| `BAAI/bge-small-zh-v1.5` | 5,094,242 downloads | 中文小模型 embedding 的主流度证明 |
| `Xenova/bge-small-zh-v1.5` | 49,944 downloads，`transformers.js` 标签 | 已有可直接加载的 ONNX/量化版本 |
| `shibing624/text2vec-base-chinese` | 992,051 downloads | 备选中文 embedding 模型 |
| `llm-semantic-router/Vela-1.0-Encoder-307M-Embedding` | 4,433 downloads | semantic-router 生态专用编码器，但体量更大，不作首选 |

社区机制证据：

1. **semantic-router RouteLayer**：每个 Route 由名称、utterances、encoder 组成；`total_score >= current_threshold` 才通过；无路由通过时返回空 RouteChoice，而不是异常。
2. **semantic-router 阈值优化**：默认阈值 0.5 只是占位；官方提供 `fit/evaluate/get_thresholds` 方法，用标注样本自动校准每路由阈值。示例中不同 encoder 的最优阈值差异很大，手写阈值不可靠。
3. **Rasa FallbackClassifier**：低置信输入进入 `nlu_fallback`；two-stage fallback 先让用户澄清，用户否认后再走最终兜底；fallback 会 revert 用户消息，避免污染后续预测。
4. **transformers.js**：支持 `feature-extraction` pipeline、ONNX Runtime、`q8` 量化；适合 Electron 本地运行。

## 2. 应用现状反查

### 2.1 现有架构

主文件：`src/services/chainIntentRouter.ts`

现有决策顺序：

1. `resolvePermissionIntent`：权限问题、位置咨询、显式写入等高精度规则。
2. 上下文恢复：`CONTINUATION_INPUTS`、`await_user` 标记。
3. `scoreIntentsByKeywords`：短语词表打分。
4. TF-IDF 余弦：`INTENT_EXAMPLES` 每意图约 30 条示例。

生产入口：

- `src/components/chat/ChatPanel.vue:738`
- `src/components/common/OutlineWorkspace.vue:2148`
- `src/services/workspaceSkillEngine.ts:1135`

### 2.2 已确认缺陷

| 编号 | 缺陷 | 证据 |
| --- | --- | --- |
| D1 | 无 dense embedding 层，无法理解换说法 | TF-IDF 是词袋模型，`INTENT_EXAMPLES` 为静态示例 |
| D2 | 阈值 `0.45/0.08` 是手写常数，不是数据校准值 | `chainIntentRouter.ts:35-44` |
| D3 | `no-keyword-overlap` 直接 fallback，缺少语义兜底 | `routeChainIntent` 关键词层失败后未进入 embedding 层 |
| D4 | 评测集饱和失真 | 385/385 全对，F1 全 1.0000；语料由词表生成，无法测泛化 |
| D5 | 无真实 trace 回流闭环 | 运行记录未转化为 holdout/回归样本 |
| D6 | LLM 兜底路由缺失 | no_match 后无模型辅助判断，只能用户澄清 |

### 2.3 为什么“一直补词表”不是成熟路线

词表规则是高精度安全闸门，但它的维护成本随用户表达多样性线性增长。过去多轮事故的本质是：每个新说法都要等客户踩坑后补词，补完后旧评测集继续全对，系统看起来成熟，实际泛化能力没有提升。

Embedding 层解决的是“意思相近但字面不同”的问题，例如：

- “第一卷钩子得重新弄一下”
- “开篇那个吸引点我不太满意”
- “开头抓人的地方要再强化”

这些句子不需要逐条收录，向量语义即可归入 edit/discuss 候选，再由安全规则决定是否允许写入。

## 3. Electron 级真实 UI 高强度实测总门禁

本方案的所有关键节点不得只靠单元测试、服务测试或 mock 请求宣称通过。**每个 Phase 的验收都包含 Electron 级真实 UI 高强度实测；实测未过，该 Phase 不得闭环，不得进入下一阶段。**

### 3.1 实测环境要求

1. 使用真实 Electron 应用窗口，不做纯 DOM 替代。
2. 使用真实用户操作路径：启动应用、进入大纲工作台/主页编辑器、输入文本、观察气泡和编辑器状态。
3. 路由输入必须从 UI 输入框真实发送，不允许绕过 UI 直接调用内部函数充当验收。
4. 每轮实测必须落盘验证文件，包括输入、UI 观察、trace 输出、编辑器结果四侧对账。
5. 失败样本必须回流到对抗样本库，修复后重跑原失败场景和新补充场景。

### 3.2 多轮次规则

每个关键节点至少执行三轮：

| 轮次 | 目的 |
| --- | --- |
| 第 1 轮 | 主线验证：确认计划内功能按设计运行 |
| 第 2 轮 | 变体验证：换说法、错别字、口语化、混合意图 |
| 第 3 轮 | 压力与回归验证：连续输入、长文本、模型加载窗口期、重复操作、异常恢复 |

任何一轮发现阻断性问题，修复后从第 1 轮重新计数；不允许只重跑失败的那一条。

### 3.3 多维度规则

每个关键节点至少覆盖：

1. **意图维度**：analyze、edit、generate、discuss、no_match、ambiguous。
2. **入口维度**：大纲工作台、主页编辑器、API 对话框。
3. **表达维度**：标准命令、同义改写、错别字、口语化长句、领域名词组合。
4. **安全维度**：权限问题、位置咨询、禁止写入、显式写入。
5. **状态维度**：模型未加载、模型加载中、模型就绪、模型损坏、LLM 无网络。
6. **链路维度**：UI 提示、trace 记录、实际工具面、编辑器结果必须一致。

### 3.4 高强度场景清单

以下场景为固定压测项，任何涉及路由行为变更的 Phase 都不得跳过：

1. 连续 20 条混合意图输入，统计误路由和写入误触发。
2. 同一意图 5 种以上说法改写，验证 embedding 泛化收益。
3. 常见错别字注入，验证不误判为写入。
4. 权限询问与写入指令混合，验证安全闸门优先级。
5. 模型加载窗口期连续发送请求，验证降级和恢复。
6. fallback 澄清后恢复原 run，验证不重复路由、不丢上下文。
7. 大纲工作台与主页编辑器交替操作，验证跨入口一致性。
8. 失败后重试同一路由请求，验证无状态污染。

### 3.5 验收证据格式

每个 Phase 的 Electron 实测输出必须包含：

```json
{
  "phase": 2,
  "round": 3,
  "dimension": "model-loading-window",
  "input": "开篇那个吸引点我不太满意",
  "expected": "edit candidate via embedding",
  "uiObservation": "fallback bubble displayed",
  "traceObservation": "embedding-unavailable, fallback=await-user",
  "editorResult": "unchanged",
  "verdict": "pass"
}
```

四侧对账不一致时，即使功能表面可用也判 fail。

## 4. 目标架构

### 4.1 四层路由

```text
用户输入
  ↓
L1 规则/权限安全闸门
    显式写入、位置咨询、只读问题、禁止写入
  ↓ 未命中
L2 词法层
    短语词表 + TF-IDF
    高置信直接输出；低置信/无命中进入 L3
  ↓ 低置信或无命中
L3 本地 embedding 语义层
    bge-small-zh-v1.5 q8 ONNX
    意图代表句向量库 + cosine 相似度
  ↓ 仍低置信
L4 LLM 兜底路由
    小型分类请求，输出 JSON 意图 + 理由 + 置信度
  ↓ 仍失败
Rasa 式两阶段 fallback
    先用户澄清；用户否认后进入只读讨论
```

### 4.2 分层职责

| 层 | 职责 | 不允许做的事 |
| --- | --- | --- |
| L1 | 保护写入边界、识别权限/位置/禁止语义 | 不承担泛化分类 |
| L2 | 快速处理已收录表达 | 不因无命中直接终止 |
| L3 | 处理换说法、错别字、口语化表达 | 不绕过 L1 写入安全规则 |
| L4 | 处理复杂长句和跨意图请求 | 不自动执行写入；仅返回分类建议 |

核心原则：**语义层可以提升识别率，但不能提升权限。** 所有写入仍必须经过 L1 的安全闸门和现有工具授权体系。

## 5. 技术选型

### 5.1 首选模型

`Xenova/bge-small-zh-v1.5`，理由：

1. 中文专用，源头模型 `BAAI/bge-small-zh-v1.5` 下载量 509 万。
2. 已带 `transformers.js` 标签和 ONNX 量化文件。
3. small 级别模型，适合桌面应用本地推理。
4. MIT 许可的 BGE 系列，商用风险低。

备选：

| 模型 | 用途 |
| --- | --- |
| `shibing624/text2vec-base-chinese` | 若 BGE 中文短句区分度不足，做 A/B 对比 |
| `llm-semantic-router/Vela-1.0-Encoder-307M-Embedding` | 若需要多语言或 semantic-router 生态专用编码器，再评估 |

### 5.2 运行位置

不在 Vue 渲染进程直接跑模型，改为：

1. Electron main process 或 UtilityProcess 加载模型。
2. 通过 IPC 暴露 `intent:embed`。
3. 渲染进程的 `chainIntentRouter` 只请求向量，不持有模型。

理由：

1. 避免 renderer 首次加载模型导致 UI 卡顿。
2. 模型生命周期与窗口解耦，页面刷新不重复加载。
3. 与现有 Electron 主进程能力一致，便于打包。

### 5.3 依赖与打包

新增依赖：

- `@huggingface/transformers`（或其 Node 依赖子集）
- 模型文件随安装包内置，不做首次联网下载

用户已明确不限制安装包体积，因此采用内置模型方案，保证离线可用和首次启动稳定性。

## 6. 阈值与置信度校准

### 6.1 不再使用手写阈值作为最终标准

现有 `0.45/0.08` 保留为初始冷启动值，但必须被校准结果替代。

### 6.2 校准数据

建立三类数据：

1. **正样本**：真实用户请求，按 intent 标注。
2. **负样本**：闲聊、无关请求、应进入 no_match 的输入。
3. **对抗样本**：
   - 同义改写：同一意图换 5 种说法。
   - 错别字：常见输入错误。
   - 领域名词组合：钩子、伏笔、时间线、人物弧光、卷纲等。
   - 混合意图：生成后讨论、分析后修改。

### 6.3 校准流程

1. 数据集切分：训练 70%、校准 15%、holdout 15%。
2. 对每个 intent 扫描阈值区间。
3. 优化目标不是单一 accuracy，而是：
   - 高 recall：讨论/分析请求不得被拦死。
   - 高 precision：edit/generate 不得误触发写入。
   - no_match 保持可控：无关输入要能拒绝。
4. 输出每意图阈值和全局歧义阈值。
5. 阈值写入配置文件，并记录来源、时间、数据版本。

### 6.4 Rasa 式 fallback

低置信或歧义时：

1. 第一阶段：给出候选意图，请用户澄清。
2. 用户选择后恢复原 run，不重新路由。
3. 用户否认后进入只读讨论。
4. fallback 请求写入 trace，不污染后续主路由预测。

## 7. 评测闭环

### 7.1 评测集重建

现有 385 样本保留为回归集，但不再作为“成熟度证明”。

新增：

1. `holdout-real-trace.json`：来自真实运行记录，人工标注。
2. `adversarial-intent.json`：同义改写、错别字、混合意图。
3. `negative-intent.json`：应 no_match 的输入。

### 7.2 指标

评估脚本输出：

1. 总准确率。
2. 每意图 precision/recall/F1。
3. no_match 拒绝率。
4. edit/generate 误触发率（最高风险指标）。
5. 分层归因：命中 L1/L2/L3/L4/fallback 的比例。
6. 失败样本分类：wrong-intent、low-confidence、no-keyword-overlap、ambiguous。

### 7.3 trace 回流

运行记录新增路由诊断字段：

```json
{
  "router": {
    "version": "v6",
    "layers": ["rule", "keyword", "embedding", "llm-fallback"],
    "decisionLayer": "embedding",
    "embeddingModel": "Xenova/bge-small-zh-v1.5",
    "scores": {
      "analyze": 0.42,
      "edit": 0.71,
      "generate": 0.12,
      "discuss": 0.55
    },
    "thresholds": {
      "analyze": 0.62,
      "edit": 0.68,
      "generate": 0.70,
      "discuss": 0.60
    },
    "fallback": {
      "mode": "await-user",
      "stage": "clarify"
    }
  }
}
```

这样 SKILL 设计方能从 trace 判断：是词表缺失、语义距离不够、阈值过严，还是 SKILL 模板本身的问题。

## 8. 实施计划

### Phase 1：数据与评估基座

改动：

1. 新增评测数据文件。
2. 扩展 `scripts/evaluate-chain-intent-router.mjs`。
3. 从近期真实 trace 抽取样本，人工标注。

验收：

1. 评测输出分层归因和失败分类。
2. holdout 和 adversarial 集进入 CI/本地验证脚本。
3. 当前词表体系在这些新集上的失败样本清单落盘。
4. **Electron 实测门禁：** 在真实 UI 中执行第 3 节规定的三轮实测，确认现有词表体系的真实失败场景被准确采集进样本库；UI、trace、工具面、编辑器结果四侧对账。

### Phase 2：Embedding 服务

改动：

1. Electron main/UtilityProcess 新增 embedding loader。
2. IPC 通道 `intent:embed`。
3. 渲染进程新增 embedding client 和缓存。

验收：

1. 模型内置安装包可离线加载。
2. 加载失败进入 router-degraded，不崩溃、不静默。
3. 首次加载不阻塞 UI，后续请求延迟可接受。
4. **Electron 实测门禁：** 三轮覆盖模型未加载、加载中、就绪、损坏四种状态；加载窗口期连续发送混合意图请求；每轮落盘四侧对账证据。

### Phase 3：路由器接入

改动：

1. `chainIntentRouter.ts` 在关键词层低置信/无命中后调用 embedding 层。
2. 新增每意图代表句向量库。
3. L1 安全规则优先级保持最高。
4. no_match 前必须经过 embedding 层。

验收：

1. 对抗样本中同义改写识别率显著提升。
2. edit/generate 误触发率不高于现有词表体系。
3. 权限问题、位置咨询、禁止写入行为不变。
4. **Electron 实测门禁：** 三轮覆盖六个意图维度、两个入口、五类表达变体；固定执行 20 条混合意图压测；写入类误触发为 0 容忍。

### Phase 4：阈值校准

改动：

1. 新增校准脚本。
2. 按意图输出阈值配置。
3. trace 记录阈值来源。

验收：

1. 阈值来自校准数据，不再手写。
2. holdout 指标优于冷启动阈值。
3. 每意图阈值和歧义阈值有版本记录。
4. **Electron 实测门禁：** 用校准前后两套阈值在真实 UI 中各跑三轮；校准后必须在讨论不被拦死、edit/generate 不误触发两项同时优于校准前，才允许合入。

### Phase 5：LLM 兜底与 fallback 收口

改动：

1. L3 仍低置信时调用小模型分类。
2. 输出结构化 JSON：intent、confidence、reason。
3. 无网络或模型失败时进入两阶段 fallback。

验收：

1. LLM 兜底默认策略明确，可配置。
2. LLM 失败不阻塞用户请求。
3. fallback 恢复继承原 run，不重复路由。
4. **Electron 实测门禁：** 三轮覆盖有网络、无网络、超时、返回非法 JSON 四种路径；fallback 澄清、恢复、取消、重试都必须在真实 UI 中验证。

### Phase 6：全链路验证与收尾

验证内容：

1. 单元测试：分层路由、阈值、降级、fallback。
2. 服务测试：embedding client、IPC、缓存。
3. corpus/holdout/adversarial/negative 四类评测。
4. Electron 真实 UI 高强度实测：
   - 换说法请求能进入正确意图。
   - 错别字请求不误写。
   - 权限问题仍为 discuss。
   - 位置咨询不触发写入。
   - fallback 澄清可恢复。
   - 模型加载窗口期请求可降级可恢复。
   - 大纲工作台与主页编辑器交替操作行为一致。
5. trace 四侧对账：UI 显示、trace 记录、实际工具面、编辑器结果一致。
6. **最终门禁：** 执行第 3.4 节全部高强度场景，每个场景至少三轮；任何一轮 fail 则回到对应 Phase 修复并重新计数。

## 9. 风险与对策

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| 模型加载慢 | 首次路由延迟 | 后台预加载；未就绪时 L1/L2 可用，trace 标记 embedding-unavailable |
| embedding 误判写入 | 意外触发编辑 | L1 安全闸门优先；edit/generate 阈值单独校准；高风险仍 await-user |
| 模型文件损坏 | 路由降级 | 内置文件 hash 校验；损坏时进入 router-degraded |
| 安装包变大 | 下载变慢 | 用户已明确不限制体积；保留小模型首选 |
| LLM 兜底增加成本 | 额外 API 调用 | 仅低置信触发；输出要求短 JSON；失败直接 fallback |
| 新旧路由并存 | 修一处坏一处 | L2 失败必须进入 L3，禁止旁路；旧测试保留，新增分层断言 |
| UI 实测覆盖不足 | 单元测试通过但真实路径翻车 | 每个 Phase 强制三轮多维度 Electron 实测，四侧对账，失败重计轮次 |

## 10. 反推检查

### 10.1 会不会破坏现有能力？

不会覆盖 L1。显式写入、权限问题、位置咨询、禁止写入仍由规则层先判。embedding 只处理规则未命中的输入。

### 10.2 会不会让写入更危险？

不会自动提升权限。语义层只影响 intent 分类，工具授权仍由现有 `authorizeDialogueTools` 和编辑器写入协议控制。

### 10.3 会不会再次出现“评测全对、实际翻车”？

会明显降低概率。新评测集来自真实 trace、对抗改写和负样本，不再由词表生成。评测同时输出失败分类和分层归因。

### 10.4 会不会引入难维护的新体系？

不引入 LangGraph/OpenAI Agents runtime。只新增本地 embedding 服务和校准脚本，仍属于当前应用的 service + Electron 架构。

## 11. 审核点

1. 已确认：引入 `Xenova/bge-small-zh-v1.5` q8 ONNX 作为首选 embedding 模型并内置安装包。
2. 已确认：embedding 运行在 Electron main/UtilityProcess，通过 IPC 提供给渲染进程。
3. 已确认：LLM 兜底作为第五阶段实现，且只处理 L1/L2/L3 仍低置信的输入。
4. 已确认：从真实运行记录抽取 holdout 样本，并由当前会话完成首轮人工标注。
5. 已确认：每个关键 Phase 均执行多轮次、多维度 Electron 级真实 UI 高强度实测，实测未过不得进入下一阶段。

按 Phase 1 到 Phase 6 顺序执行，不跳阶段；每个 Phase 的 Electron 实测门禁未过即停，不提前宣布闭环。
