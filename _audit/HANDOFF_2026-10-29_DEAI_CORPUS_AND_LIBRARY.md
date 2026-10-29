# 交接文件：降AI校准语料积累与应用内拆书库（2026-10-29）

## 1. 交接目标

本文件是给下一轮执行的完整交接规范。目标不是重复讨论“要不要校准”，而是把两条线分清楚并落地：

1. **Track A：开发期校准语料库**，只服务降AI检测器阈值校准，不是应用内功能，不进安装包。
2. **Track B：应用内拆书库/资料库**，是独立产品功能，服务于风格分析、声纹、参考检索，未来可向 Track A 输出“可校准样本包”。

两条线可以复用数据，但**不能绑定成一个前置关系**。不允许为了解除降AI `provisional` 而半途把应用内拆书库做成大功能；也不允许因为应用内拆书库未立项而阻塞校准语料积累。

## 2. 当前基线

- 当前 V2 检测内核与 V3 落地情况见 `_audit/DEV_LOG_2026-10-29_body-embedded-deai-v3.md`。
- 校准报告见 `_audit/DEAI_SAMPLE_CALIBRATION_2026-10-29.md`。
- 当前校准数据见 `_audit/verification-deai-calibration/deai-v2-calibration-2026-10-29.json`。
- 现有校准方式：`scripts/calibrate-deai-v2-thresholds.mjs`，固定种子 `20261029`，负样本来自单一作者《踏星》，正样本为现场合成的重复骨架/词汇 hedging 两类。
- 当前 `provisional: true` 位于 `src/services/de-ai.js:626/:1012`。解除它需要按本文件 Track A 的样本结构与校准门禁推进，不允许由单测数量或主观感觉解锁。

## 2.1 必读上下文（执行前，不可跳过）

下一对话框在写任何代码或创建任何目录前，必须先读以下文件，并按经验文件门禁执行：

1. `_audit/神意开发经验总结_v9.md`
   - 这是经验主文件，当前版本 v9.8.0。
   - 重点读 G0.12“门禁执行台账”：非平凡任务开始先建 `_audit/TASK_LEDGERS/` 七节台账，收尾逐节补证据，无台账不得声称完成。
   - 重点读 G1.22“检测/评分类校准门禁”：改动检测、评分、阈值、词库或 verdict 前后，必须跑真实负样本误伤与正样本召回，分层指标与整体判定分开报告；`provisional` 只能按样本结构解除。
   - 重点读 G0.6/G0.9/G0.10：诚实闭环、全量影响圈、新旧语义不共存；本任务的语料索引、校准脚本、报告文件都不能只做表面登记。
2. `_audit/DEV_LOG_2026-10-29_body-embedded-deai-v3.md`
   - 当前降AI V3 的落地记录，包含 Phase 1-10 范围、真实 Electron 验证、性能数据与诚实边界。
   - 本任务不得重复实现其中已完成项，只能基于它继续积累语料。
3. `_audit/TASK_LEDGERS/2026-10-29_deai-github-benchmark-review.md`
   - V3 执行台账，第 4 节记录外部基准对账与历史问题修复结论。
   - 第 7 节明确“未执行 live 生成对比、未做多作者校准”，本任务就是要补齐后者，不是重开前者。
4. `_audit/SCRIPT_QUALITY_LESSONS_2026-10-29.md` 与 `_audit/TASK_LEDGERS/2026-10-29_script-quality-lessons.md`
   - 历史脚本质量教训。本任务要写收割脚本、索引脚本、校准脚本，属于高风险脚本任务。
   - 必须遵守其中的脚本门禁：复杂脚本先落 `.mjs/.ps1` 文件再执行，不做一行式硬写；失败脚本要读完整错误换方案，不得连跑硬试；不得把调试脚本遗留在 `_audit` 根目录冒充交付物。
5. `_audit/DEAI_SAMPLE_CALIBRATION_2026-10-29.md`
   - 当前唯一一次真实样本校准报告，明确单一作者负样本、合成正样本、56% suspicious+ 误伤率的边界。
   - 新任务的目标是扩样本结构，不是在现有数据上反复调参。

读后要求：在本任务台账的“门禁读证”节，登记上述文件的读取证据（关键行号或结论），并在执行中逐条对照。未读经验文件直接开工，视为任务失败。

## 3. Track A：开发期校准语料库

### 3.1 定位

这是一个**开发期离线资产**，不属于应用运行时功能。它的目的只有一个：为降AI检测器提供可复现的多作者负样本和真实模型正样本，跑误伤率、召回率、分层统计，解除整体 verdict 的 `provisional`。

### 3.2 存放位置

建议建在 `D:/codex/deai-corpus/`，与应用仓库分离，避免语料随代码仓库、安装包或客户环境扩散。

### 3.3 目录结构

```text
D:/codex/deai-corpus/
  README.md
  manifest.json
  sources/
    human/
      authors/<author-id>/
        works/<work-id>/
          source.txt
          chapters.jsonl
    model/
      <provider-id>/<model-id>/
        samples.jsonl
  labels/
    human-negative.jsonl
    model-positive.jsonl
  calibration/
    reports/
    snapshots/
```

`manifest.json` 登记来源、授权状态、作者、题材、样本数、创建时间、是否可用于校准。任何无法确认来源或授权状态的样本，只允许登记为 `restricted`，不得进入校准集。

### 3.4 负样本来源与要求

负样本是“确定不是 AI 生成”的人写文本，用来测误伤率。

来源优先级：

1. 现有 `D:/codex/拆文库/` 的多作者作品。
2. 后续用户自行导入的人写拆书文本。
3. 需要时可补充公版、开源或明确授权文本，不允许未经确认抓取仍在版权期的作品。

最低结构门槛：

- 至少 3-5 位作者。
- 至少 2-3 个题材（玄幻、都市、悬疑、言情等）。
- 每作者 50-100 章，单章 1500-6000 非空白字符，沿用当前校准脚本口径。
- 每条样本保留 author、work、title、chapter index、char count、source path、license/authorization 字段。

### 3.5 正样本来源与要求

正样本是“确定由 AI 生成”的正文输出，用来测召回率。

第一阶段优先从历史 run trace 收割：

1. 扫描 `C:/Users/凯瑞/Desktop/SKILL调试文件/run-trace-*-deep/` 与同目录 standard 版本。
2. 优先从 `payloads/` 里提取生成步原始响应，而不是从 UI 回显或后续人工修稿中提取。
3. 保留 provider、model、timestamp、pipeline layer、skill/template version、trace path、attempt id。
4. 只收录正文层生成步输出；不要把 S1/S2/S3 的中间产物混淆成最终正样本。

第二阶段再接应用内自动归档：

- 每次正文生成完成后，把模型原始输出登记为候选正样本。
- 用户验收时可轻量标注：AI 味重、轻微、可接受。
- 真实标注结果进入 `labels/`，不是简单把所有模型输出都当强标签。

### 3.6 校准流程

1. 建立语料索引与去重：同 chapter、同 model attempt 只允许一个主记录，重复来源以引用方式登记。
2. 分层抽样：按作者、题材、模型分层，保持负样本与正样本分布可解释。
3. 跑 `detectBody` 得到每条 verdict、score、findings、thresholds。
4. 输出：
   - 人写误伤率：suspicious+ 占比、blocking 占比。
   - AI 召回率：n-gram 命中率、整体 finding 命中率。
   - 分作者/题材/模型报告。
   - 阈值敏感度曲线，不允许只报一个点。
5. 用 held-out 复验集重跑，防止调参过拟合。
6. 通过后才允许移除 `provisional`，并把新阈值、词库、评分权重随版本发布。

### 3.7 Track A 验收门禁

- 负样本：多作者、多题材、来源与授权字段完整。
- 正样本：真实模型输出，供应商/模型/attempt 可追溯。
- 报告：分层误伤率与召回率齐全，且 held-out 复验通过。
- 代码：`DEAI_V2_THRESHOLDS` 与 `DEAI_V2_BLOCKING_VOCAB` 更新为 `source: 'calibrated'`。
- 结论：`provisional` 移除或降级为局部边界，且在 DEV_LOG、任务台账、经验文件同步登记。

## 4. Track B：应用内拆书库/资料库

### 4.1 定位

这是独立产品功能，目标不是“给校准器凑数据”，而是给用户提供拆书、风格分析、资料沉淀和创作参考能力。

### 4.2 产品面建议

- 拆书导入：支持把人写作品拆成章节、场景、人物、风格样本。
- 风格资产：从拆书结果生成风格档案、作者声纹、句式样本、叙事偏好。
- 检索与引用：在设定层、大纲层、正文层提供可检索参考，但不允许自动改写正文。
- 授权管理：明确记录来源与使用范围，未授权文本不进入跨项目共享能力。
- 隐私边界：用户本地数据默认不离开本机，不参与云端共享。

### 4.3 与 Track A 的接口

Track B 可以向 Track A 输出“可校准样本包”：

```json
{
  "type": "human-negative-sample-pack",
  "manifestVersion": 1,
  "items": [
    {
      "author": "...",
      "work": "...",
      "chapterTitle": "...",
      "text": "...",
      "authorization": "confirmed"
    }
  ]
}
```

校准语料库消费该包后，更新 `manifest.json` 与 `labels/human-negative.jsonl`。

反向接口：Track A 校准出的阈值、词库、作者声纹规则，随版本进入应用运行时。Track B 不拥有第二套降AI判定权威，避免与正文层内嵌降AI V3 的 `skillDeaiContract` 打架。

## 5. 执行顺序

### Phase A1：历史正样本收割

1. 写离线脚本扫描 `run-trace-*` 目录。
2. 识别正文层生成步的原始模型输出。
3. 生成 `sources/model/<provider>/<model>/samples.jsonl`。
4. 保留 trace path、attempt id、model、timestamp。
5. 交付统计报告：trace 数、可提取数、跳过原因分布。

### Phase A2：多作者负样本整理

1. 扫描 `D:/codex/拆文库/`。
2. 建 author/work/chapter 索引。
3. 去重并登记来源、授权状态。
4. 生成 `labels/human-negative.jsonl`。

### Phase A3：校准器升级

1. 扩展 `scripts/calibrate-deai-v2-thresholds.mjs`，支持多作者、多题材、多模型分层。
2. 增加 held-out 复验与阈值敏感度输出。
3. 报告中明确 suspicious+、blocking、n-gram、词汇、结构、漂移的分层表现。

### Phase A4：解除 provisional

1. 用新语料复跑校准。
2. 通过验收门禁后更新阈值、词库与评分权重。
3. 将 `provisional` 从整体判定移除，或只保留作者/题材局部边界。
4. 更新 DEV_LOG、任务台账、经验文件与版本号。

### Phase B1：应用内拆书库立项

独立立项，另写方案，不进入本 Track A 的完成判定。建议先做最小闭环：导入、章节索引、来源授权字段、基本检索；不要一开始就做风格推理、自动改写、云端同步。

## 6. 禁止事项

1. 不允许把语料库塞进应用安装包或客户运行目录。
2. 不允许在客户机器上要求这些样本存在，运行时检测不得依赖开发语料。
3. 不允许为了凑样本把 UI 回显、人工修稿、S1/S2/S3 中间产物混成正样本。
4. 不允许把应用内拆书库设为解除 `provisional` 的前置功能。
5. 不允许新增第二套降AI判定权威，所有运行时检测仍以 `de-ai.js` 与 `skillDeaiContract` 单源为准。
6. 不允许用单测数量代替样本结构；`provisional` 只能由多作者、多题材、真实模型样本解除。
7. 不允许在无授权登记的情况下把第三方仍在版权期的作品纳入校准集。

## 7. 交接验收清单

- [ ] `D:/codex/deai-corpus/` 建立并含 README 与 manifest。
- [ ] 历史正样本收割脚本产出统计报告。
- [ ] 多作者负样本索引完成，来源与授权字段完整。
- [ ] 校准脚本支持分层与 held-out 复验。
- [ ] 新校准报告归档。
- [ ] `provisional` 状态更新或明确继续保留原因。
- [ ] DEV_LOG、任务台账、经验文件同步更新。

## 8. 关键参考

- 经验主文件：`_audit/神意开发经验总结_v9.md`
- 当前 V3 DEV_LOG：`_audit/DEV_LOG_2026-10-29_body-embedded-deai-v3.md`
- V3 执行台账：`_audit/TASK_LEDGERS/2026-10-29_deai-github-benchmark-review.md`
- 脚本质量经验：`_audit/SCRIPT_QUALITY_LESSONS_2026-10-29.md`
- 脚本质量台账：`_audit/TASK_LEDGERS/2026-10-29_script-quality-lessons.md`
- 当前 V3 方案：`_audit/PROPOSAL_2026-10-29_BODY_EMBEDDED_DEAI_V3.md`
- 校准报告：`_audit/DEAI_SAMPLE_CALIBRATION_2026-10-29.md`
- folder SKILL 契约手册：`_audit/FOLDER_SKILL_DEAI_CONTRACT_GUIDE_2026-10-29.md`
- 发布收尾清单：`_audit/RELEASE_CHECKLIST.md`
- 校准脚本：`scripts/calibrate-deai-v2-thresholds.mjs`
- 当前校准 JSON：`_audit/verification-deai-calibration/deai-v2-calibration-2026-10-29.json`
- 降AI契约：`src/services/skillDeaiContract.ts`
- 检测内核：`src/services/de-ai.js`

## 9. 给下一对话框的第一步指令

下一对话框不要先改产品源码，也不要先创建语料目录。第一动作应是：

1. 读本文件第 2.1 节必读上下文，尤其是经验文件 G0.12 与 G1.22。
2. 建本任务七节台账 `_audit/TASK_LEDGERS/`，在“门禁读证”节登记经验文件与 DEV_LOG 读取证据。
3. 读本文件第 3 节 Track A。
4. 建 `D:/codex/deai-corpus/` 基础目录与 manifest。
5. 写历史正样本收割脚本，先只读 `run-trace-*`，输出统计报告。
6. 再做多作者负样本索引。
7. 完成后再回来讨论是否进入 Phase A3/A4 与 Track B 立项。
