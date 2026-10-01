# 2026-09-20 意图语料饱和补齐与结构化替换路由修复

## 背景

用户指出：意图路由的正样本、负样本和语料不能靠每次事故后零散补几个词，必须先用 20 轮精准搜索从社区真实数据源补齐，再测试。

本任务先完成三组 20 轮搜索：

- GitHub Code Search：`Chinese task-oriented dialogue dataset intent`、`RiSAWOZ`、`中文 意图分类 数据集` 等 20 个精准词。
- Hugging Face Search：`editing instructions`、`text rewriting`、`COIG`、`CQIA`、`BELLE` 等 20 个精准词。
- HF Mirror 精准补搜：`COIG-PC`、`COIG-CQIA`、`COIG-Writer`、`BelleGroup train_CN`、`中文 改写`、`natural language editing commands` 等 20 轮。

原始搜索证据：

- `_audit/RESEARCH_2026-09-20_intent-corpus-github-search.json`
- `_audit/RESEARCH_2026-09-20_intent-corpus-hf-search.json`
- `_audit/RESEARCH_2026-09-20_intent-corpus-precise-search.json`

实际采纳的真实数据源：`BelleGroup/train_1M_CN`、`BAAI/COIG-PC-Lite`、`m-a-p/COIG-Writer`、`COIG-CQIA`，并叠加 2026-09-20 真实运行记录。

## 根因

Electron 高强度实测暴露出结构化替换指令的路由缺口：

- `把第三章那个"灯塔顶端"换成"塔尖"` 是明确写入指令，但旧规则只依赖通用写入词，未识别“把/将 + 旧内容 + 换成/改成/改为/替换成/替换为 + 新内容”的祈使结构。
- `改成什么样`、`换成什么效果` 是预览问句，属于讨论请求；旧“弱写入 + 把”规则可能把这类问句误放行为写入。

这不是单纯缺几个词，而是路由缺少“结构化替换指令”和“结构化替换预览问句”两个语义形态，因此需要在 `resolvePermissionIntent` 中增加结构化判定，而不是把 `换成/改成` 裸加进全局写入词表。

## 修复

### 1. 路由判定

`src/services/chainIntentRouter.ts`：

- 新增 `STRUCTURED_REPLACE_ACTION_PATTERN`：识别 `换成|改成|改为|替换成|替换为`。
- 新增 `STRUCTURED_REPLACE_IMPERATIVE_PATTERN`：识别“把/将 + 旧内容 + 替换动作 + 新内容”的句尾祈使结构。
- 新增 `STRUCTURED_REPLACE_TOPIC_PATTERN`：识别“这几个字/这几个词/这个词/这些字/这句话 + 替换动作”的主题结构。
- 新增 `STRUCTURED_REPLACE_PREVIEW_PATTERN`：识别问号结尾，或包含“什么样/什么效果/怎么样/如何/什么”的预览问句。
- `resolvePermissionIntent()`：
  - 结构化替换祈使句或主题句命中且不是预览问句时，判为 `explicit-write`。
  - 结构化替换预览问句在弱写入规则前短路，避免误放行。

### 2. 单源语料

`_audit/phrase-corpus-saturated.json` 升级为 `2026-09-20.2`：

- `how-to-questions` 增加 `换成什么样 / 改成什么样 / 换成什么效果 / 改成什么效果 / 换成什么内容 / 改成什么内容`。
- 新增 `structured-replace-positive` 正样本组，共 6 条 edit 指令，全部带真实 source。
- 新增 `structured-replace-negative` 负样本组，共 8 条 discuss 预览问句，全部带真实 source。
- 由 `npm run sync:phrase-corpus` 同步生成 `src/services/chainIntentPhraseCorpus.ts`，保持单源。

### 3. 回归测试

- `src/services/chainIntentRouter.spec.ts`：新增 `routes structured replacement commands as writes without exposing preview questions`，覆盖 4 条写入正例和 3 条预览负例。
- `src/services/plainDialogueIntent.spec.ts`：新增 `keeps structured replacement commands writable and preview questions read-only`，覆盖普通对话入口的同款语义。

### 4. Electron 测试契约修正

`scripts/verify-api-direct-write-electron.mjs` 的 `natural-individual-edit` 场景中：

- 旧断言要求第 3 步之后第三章仍包含“灯塔顶端”，但第 2 步已经合法把“灯塔顶端”改成“塔尖”。
- 这是测试契约错误，不是应用回归；修正为 `index >= 1` 后统一校验未受影响章节。

## 验证

以下均为 2026-09-20 本轮新鲜输出：

- `npm run sync:phrase-corpus`
  - `phraseCount: 1765`
  - `sampleCount: 385`
- `npm run verify:phrase-corpus-sync`
  - `problems: []`
- `npm run evaluate:chain-intent`
  - `385/385 routing 1.0000`
  - `classification 1.0000`
  - edit / generate / discuss / analyze 四类 precision、recall、F1 全部 `1.0000`
- `npx vitest run src/services/chainIntentRouter.spec.ts src/services/plainDialogueIntent.spec.ts`
  - `2 files`
  - `23 tests passed`
- `npm run type-check`
  - 通过
- `npm run verify:production-wiring`
  - `277 modules`
  - `0 violations`
- `npm run build:vue`
  - 通过，仅存在既有 chunk size 警告
- `node scripts/verify-api-direct-write-electron.mjs`
  - `===== API DIRECT WRITE ELECTRON STRESS E2E PASSED =====`
  - 6 个场景全部通过，包含 deep trace 导出

## 回头看

- `STRUCTURED_REPLACE_PATTERN` 已不存在，当前仅保留拆分后的 4 个结构化常量，避免旧常量与新逻辑并存。
- `classifyChainIntent` 与 `routeChainIntent` 双入口均调用同一个 `resolvePermissionIntent`，无旁路。
- 结构化替换词没有裸加入全局 strong/weak 写入词表，避免“换成”等词在普通讨论中被过度放行。
- `_tmp_research/debug-intent-router.mjs` 已删除；其余调研证据保留用于溯源。

## 遗留

- 无本任务内未完成项。
- 既有 Electron `electron-log/renderer` preload 噪音错误仍按事实登记，不并入本任务范围。
