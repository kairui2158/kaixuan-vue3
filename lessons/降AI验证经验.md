# Zhuque AI Detection Test Results - de-ai.js Rule Effectiveness

## Date: 2026-07-31
## Tool: Zhuque AI Detection (matrix.tencent.com/ai-detect)
## Test text: 6374 chars, dense AI features

## Complete Test Results

| Test | Strategy | AI Rate | Change | Verdict |
|------|----------|---------|--------|---------|
| I | Replace cliches + vary connectors + merge sentences + fix periods | 38.85% | -35.2% | BREAKTHROUGH |
| E | Merge short sentences only (period to comma) | 55.51% | -18.6% | Very effective |
| D | Fix paragraph start periods only (period to comma) | 70.49% | -3.6% | Effective |
| A | Original text (baseline) | 74.07% | - | - |
| F | Delete summary sentences only | 74.57% | +0.5% | Neutral |
| B | Full process (current de-ai.js) | 75.18% | +1.1% | Ineffective |
| G | Delete connectors only | 90.67% | +16.6% | Counterproductive |
| C | Delete cliches only | 100% | +26% | Catastrophic |

## Core Findings

### Finding 1: Replace works, Delete harms
- Delete cliches: AI rate 74% to 100% (+26%)
- Delete connectors: AI rate 74% to 91% (+17%)
- Replace cliches + connectors: AI rate 74% to 39% (-35%)
- Root cause: Deletion creates broken syntax fragments. Zhuque detects unnatural fractures as AI editing artifacts.

### Finding 2: Short sentences are the strongest AI signal
- Continuous short sentences (under 15 chars each, period-separated) flagged as high AI probability
- Merging short sentences (period to comma) reduced AI rate by 18.6%, the largest single-rule improvement

### Finding 3: Paragraph start period fix works but small effect
- Changing period to comma within first 15 chars of paragraph: -3.6%

### Finding 4: Summary sentence deletion is neutral
- Only removing summary sentences at paragraph end: +0.5% (no significant change)

### Finding 5: Current de-ai.js is counterproductive
- Full process (B) is WORSE than original (A) by 1.1%
- Because de-ai.js core operation is DELETION (90 CLICHES patterns all use replace empty string)
- Deletion creates more suspicious broken text than the original AI text

## Zhuque Detection Architecture

### Data Flow
- WebSocket: wss://matrix.tencent.com/ai_gen_txt_server/getClassify
- Auth: Tencent TCaptcha (appid: 2089775896)
- Request: {text: content}
- Response: {confidence: 0-1, labels_ratio: {0: human, 1: AI, 2: mixed}, segment_labels: [...], availableUses: remaining}

### Detection Dimensions (inferred from segment labels)
1. Sentence length distribution: Continuous short sentences are strong AI signal
2. Grammar completeness: Deleted-word fragments are AI editing signal
3. Vocabulary diversity: Repeated connectors (e.g. 31 instances of raner) are AI signal
4. Sentence uniformity: 3+ consecutive sentences with similar length (<30% variance) are AI signal
5. Paragraph uniformity: 5+ consecutive paragraphs with similar word count are AI signal

## Correct de-ai Strategy (Based on Test Data)

### Strategy 1: Merge continuous short sentences (MOST effective, -18.6%)
### Strategy 2: Fix paragraph start periods (effective, -3.6%)
### Strategy 3: REPLACE cliches (NOT delete!)
### Strategy 4: VARY connectors (NOT delete!)
### Strategy 5: Delete summary sentences (neutral, low priority)

### FORBIDDEN operations:
- NEVER delete cliche phrases (replace with natural alternatives)
- NEVER delete connecting words (replace with variants)
- NEVER delete complete sentences (only replace and merge)

## de-ai.js Rewrite Direction

### Auto-execute layer (4 rules):
1. CLICHES array: Change ALL replace:empty to replace:natural_alternative
2. fixParagraphStartPeriods: Keep unchanged (effective)
3. mergeContinuousShortSentences: Keep unchanged (most effective)
4. removeParagraphSummaries: Keep but lower priority (neutral)

### NEW auto-execute layer:
5. CONNECTOR_REPLACE: Connector word replacement (not deletion)
   - raner -> but/however/just (randomly selected)
   - first -> at first / first thing
   - second -> then / next
   - furthermore -> also / plus
   - last -> in the end / ultimately

### Detection suggestion layer: Keep existing rules 6-13

## Test J & K Results (2026-07-31)

| Test | Strategy | AI Rate | Change | Verdict |
|------|----------|---------|--------|---------|
| J | Rewritten de-ai.js (all replace, no delete) | 23.12% | -51.0% | NEW BEST |
| K | J + paragraph starter dedup (rotate repeats) | 13.86% | -60.2% | BREAKTHROUGH |

### K Segment Analysis (13.86% AI)
- 5 segments total, 2 flagged as AI
- seg2 (65.3% AI): connector sequence pattern inside paragraphs
- seg4 (74.1% AI): uniform essay structure, no variation
- seg1/3/5 all passed (human-like)

### Key Finding: Paragraph Starter Dedup
- J had 92% AI segment because replacement words repeated at paragraph starts
- 5x same starter = same structural pattern, still AI signal
- K added rotation: 2nd+ occurrence gets rotated to different word
- 20 paragraph starts rotated, AI rate dropped from 23% to 14%
- Remaining AI segments have connector sequences INSIDE paragraphs

### Next Steps
- seg2: connector words form sequences within paragraphs
- seg4: essay-style uniform sentence structure

## Test N: Novel Body Text (2026-07-31)

| Test | Content | Strategy | AI Rate | Verdict |
|------|---------|----------|---------|---------|
| N-raw | 5001 chars novel body (simulated AI) | Raw | 100.0% | Baseline |
| N-processed | Same | Full de-ai.js | 100.0% | INEFFECTIVE |

### Critical Finding
- de-ai.js effective on essay text (74% -> 14%)
- de-ai.js completely ineffective on novel body text (100% -> 100%)
- Only 22 modifications triggered (21 period fixes + 1 summary removal)
- No cliches, connectors, or structural patterns to replace
- Novel text AI detection is based on deeper stylistic fingerprints:
  - Consistent sensory detail density
  - Balanced paragraph lengths
  - Smooth transitions
  - Polished descriptive style
- These cannot be fixed with character-level post-processing
- Must be addressed at generation level (SKILL prompt methodology)

### Conclusion
de-ai.js = effective for essay/outline/structured content
de-ai.js = ineffective for novel body text
Novel text needs generation-level approach, not post-processing

## 小说正文专用规则验证 (2026-07-31)

### 测试环境
- 工具: 朱雀AI检测 (matrix.tencent.com/ai-detect)
- 测试文本: 5001字小说正文 (text_N_novel_body.txt)
- 守护进程: zhuque_persistent.js (文件通信: pending_test.json -> latest_result.json)
- 总测试次数: 28次

### 验证链路 (逐轮递进)

| 轮次 | 变体 | AI率 | 降幅 | 关键操作 |
|------|------|------|------|---------|
| 基线 | N_raw | 100.0% | - | 原文 |
| R1 | Q1_dropSubject | 78.5% | -21.5 | 去掉句首"他" |
| R2 | R1_mergeShort | 73.8% | -4.7 | Q6+合并25字以下短句 |
| R3 | S1_R1R4 | 45.5% | -30.3 | R1+R4组合 |
| R3 | S5_R1R4_newOpening | 39.8% | -5.7 | S1+替换模板化开头 |
| R4 | T4_moreSensory | 28.2% | -11.6 | 删2/3感官(非1/2) |
| R5 | U1_T4_dropNames | 12.9% | -15.3 | T4+删2/3句首人名 |
| 最终 | DEAI_N5 | 22.2% | -10.4 | de-ai.js完整处理(含N5) |

### 5条小说专用硬规则 (已写入de-ai.js)

1. 规则N1: 去掉句首"他" (100%->78.5%)
   - 正则: /(^|[" + String.fromCharCode(0x3002,0xff01,0xff1f,10) + "])" + String.fromCharCode(0x4ed6) + "/g
   - 小说中32%的句子以"他"开头,是最大AI信号

2. 规则N2: 合并短句 (78.5%->73.8%)
   - 25字以下句子合并到前句,用逗号连接

3. 规则N3: 删除感官描写子句 (73.8%->28.2%)
   - 删除2/3的感官描写子句(逗号引导,含温度/触觉/听觉等词)
   - 关键: 删2/3比删1/2更有效(28.2% vs 75.8%)

4. 规则N4: 去掉句首人名 (28.2%->12.9%)
   - 去掉2/3的句首人名(林觉民/陈暮/方岫岩/小周)

5. 规则N5: 替换模板化开头 (43.6%->22.2%)
   - 检测"XX站在/坐在/面前是"等模板化描写
   - 替换为短句开头

### 无效操作 (朱雀验证: 反效果)

| 操作 | AI率 | 原因 |
|------|------|------|
| 不规则段落拆分(Q7) | 100% | 拆段不改变句子结构 |
| 插入口语碎片(R2) | 84.8% | 碎片不改变AI特征 |
| 打乱段落顺序(R3) | 88.8% | 顺序不改变句子级特征 |
| 全组合(Q8) | 90.8% | 过度处理产生断裂 |

### 核心结论
1. 小说正文AI信号: 句首主语重复 + 感官密度均匀 + 模板化开头
2. 有效方向: 去重复主语 + 降感官密度 + 替换模板开头
3. 无效方向: 段落结构操作 + 插入碎片 + 打乱顺序
4. de-ai.js完整处理: 100% -> 22.2%
5. 纯小说规则处理: 100% -> 12.9%
6. 差距原因: de-ai.js的其他规则(套话替换/段首句号修正)对小说有轻微干扰
### 最终验证补充 (2026-07-31)

de-ai.js完整处理 vs 纯小说规则对比:

| 版本 | AI率 | 说明 |
|------|------|------|
| 原文 | 100.0% | 基线 |
| U1手动(纯小说规则) | 12.9% | 最佳:去他+合并+删2/3感官+删2/3人名+换开头 |
| de-ai.js(含N5) | 22.2% | 完整process函数(套话+连接词+段首句号+小说规则) |
| de-ai.js(扩展词表) | 23.1% | N3感官词表从38扩到73个,效果持平 |
| de-ai.js对U1二次处理 | 21.5% | 二次处理反而变差(过度处理) |
| 纯小说规则(无其他规则) | 28.5% | 只跑N1-N5,不跑套话/连接词等 |

关键发现:
1. de-ai.js完整处理(22.2%)比纯小说规则(28.5%)更好 - 其他规则确实有帮助
2. 扩展感官词表无显著提升(22.2%->23.1%) - 词表不是瓶颈
3. 二次处理变差(12.9%->21.5%) - 小说规则不可重复执行
4. 纯手动U1(12.9%)仍优于de-ai.js完整(22.2%) - 差距来自执行顺序和精度

最终de-ai.js状态:
- 语法验证: PASS (node --check)
- 功能验证: PASS (process返回正确stats)
- 朱雀验证: 100% -> 22.2% (-77.8个百分点)
- 5条小说规则全部触发: N1(52) N2(58) N3(86) N4(10) N5(1)
- 文件: js/de-ai.js, 33538字节

## Cross-Validation Results (V1-V6) - 2026-07-31

### Test Scenes
- sci: 3052 chars, sci-fi, POV 苏铭 (18 sentence-starts)
- urban: 2490 chars, urban, POV 林晓 (11) + 张姐 (13)
- ancient: 3184 chars, historical detective, POV 沈砚 (35) + 赵捕 (12) + others

### Complete Comparison

| Version | Sci | Urban | Ancient | What changed |
|---|---|---|---|---|
| Raw | 100% | 100% | 100% | Baseline |
| V1 | 10.1% | 100% | 62.6% | N4 hardcoded (did not fire) |
| V2 | 22.7% | 87.3% | 19.5% | N4 auto-detect (fired on all) |
| V3 | 66.2% | 100% | 50.4% | N1+N4 protect paragraph starts |
| V4 | 44.5% | 100% | 41.0% | N1 original + N4 paragraph protect |
| V5 | 10.0% | 100% | 53.5% | N4 threshold 25 (only high-freq names) |
| V6 | 10.0% | 100% | 19.5% | N4 multi-name gate (3+ names required) |

### V6 = Production Version (Best Overall)
- Sci: 10.0% (V1 level, N4 does not fire)
- Ancient: 19.5% (V2 level, N4 fires with 5+ names)
- Urban: 100% (text too short at 2490 chars, below 3000 char normal range)

### Key Findings from V1-V6

#### Finding 6: Paragraph-start subject protection HURTS
- V3 (protect all paragraph-start subjects): sci 10.1% -> 66.2%, ancient 19.5% -> 50.4%
- Keeping 他 at paragraph starts is a STRONG AI signal for Zhuque
- AI text tends to overuse 他 as sentence subject; removing it reduces AI score
- Original N1 (remove ALL 他 from sentence starts) is CORRECT

#### Finding 7: N4 name removal is scene-dependent
- Removing names from sentence starts HURTS single-POV scenes (sci: 苏铭=18, 10.1% -> 22.7%)
- Removing names HELPS multi-character scenes (ancient: 沈砚=35, 62.6% -> 19.5%)
- Root cause: single POV character removal creates subjectless prose (AI signal)
- Multi-character scenes have enough variety that removing some names reduces repetition

#### Finding 8: Multi-name detection gate solves the dilemma
- V6 solution: N4 only fires when 3+ distinct names are detected
- Single-POV scenes (2 names): N4 does not fire -> names preserved -> low AI score
- Multi-character scenes (5+ names): N4 fires -> names reduced -> low AI score
- This is adaptive: the rule adjusts based on scene complexity

#### Finding 9: Text length matters
- Urban (2490 chars) consistently scores 100% across all versions
- Zhuque treats short texts as single segments, amplifying any AI signal
- Normal novel chapters are 3000-4000 chars, which should perform better
- Minimum recommended text length for de-ai processing: 3000 chars

### Production de-ai.js Configuration (V6)
1. N1: Remove ALL 他 from sentence starts (no paragraph protection)
2. N2: Merge short sentences (period -> comma)
3. N3: Delete 2/3 sensory clauses
4. N4: Auto-detect names, fire only when 3+ distinct names found, remove 2/3 of each
5. N5: Detect template openings but do not modify (no-op)
6. Cliche replacement (not deletion)
7. Connector word replacement with rotation
8. Connector sequence breaking
