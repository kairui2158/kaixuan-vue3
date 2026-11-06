
import { BODY_LAYER_STEP } from './skillDeaiContractValidation'

var DeAiProcessor = (function() {
  // ================================================================
  // 硬规则层：纯字符级强制修正，不依赖模型语义理解
  // 从降得快博客方法论提炼，覆盖所有可机械执行的规则
  // 双层架构：本文件是硬规则层，另有方法论注入层在SKILL链中
  // ================================================================

  // 规则1：AI套话/AI偏好词删除（自动执行）
    // Hard rules registry for visualization
  var HARD_RULES = [
    { id: "cliches", name: "AI套话安全替换", enabled: true },
    { id: "connectors", name: "连接词替换", enabled: true },
    { id: "deDiReplace", name: "的/地替换", enabled: true },
    { id: "dunhaoToComma", name: "顿号转逗号", enabled: true },
    { id: "aiFreqDetect", name: "AI高频词检测", enabled: true },
    { id: "bannedVocab", name: "禁用词检测", enabled: true },
    { id: "bannedPhrases", name: "禁用句式检测", enabled: true }
 ];
  var _ruleConfig = null;
  function _isRuleEnabled(id) {
    if (!_ruleConfig || !_ruleConfig.hardRules) return true;
    var r = _ruleConfig.hardRules[id];
    if (r === false) return false;
    return true;
  }
// 正文专用安全替换表：不删除内容、不改变句读、不引入议论腔。
// 带标点的规则必须用捕获组保留原标点，否则会输出缺标点的断裂句。
var CLICHES_BODY_SAFE = [
  { pattern: /值得注意的是([，,。、！？])/g, replace: '有意思的是$1' },
  { pattern: /与此同时([，,。、！？])/g, replace: '同时$1' },
  { pattern: /毋庸置疑([，,。、！？])/g, replace: '不用问$1' },
  { pattern: /不可否认([，,。、！？])/g, replace: '没法否认$1' },
  { pattern: /进行了(一次|一场|一番)?/g, replace: '做了$1' },
  { pattern: /做出了(一个|一项|一次)?/g, replace: '做了$1' },
  { pattern: /存在着/g, replace: '存在' },
  { pattern: /产生了/g, replace: '产生' },
  { pattern: /形成了/g, replace: '形成' },
  { pattern: /极大的/g, replace: '极大的' },
  { pattern: /显著的/g, replace: '明显的' },
  { pattern: /深刻的/g, replace: '很深的' },
  { pattern: /充分的/g, replace: '足够的' }
];

// 降AI V2：脚本层只检测、只报告、不改写。
// 阈值集中在这里，避免规则散落 magic number。
var DEAI_DETECT_THRESHOLDS = {
  minTextLength: 10,
  minSentenceCount: 3,
  maxPerKilo: {
    aiFreqWord: 3,
    bannedVocab: 0.8,
    cliche: 1,
    connector: 3.5
  },
  minSentenceLengthCV: 0.25
};

// V2 内核阈值。2026-10-29 多作者校准后仍保持 provisional：
// 9 部人写作品（900 章）显示误伤率强依赖作者/题材，且真实正样本
// 仍只有一个 provider/model。阈值只代表当前保守边界，不是成品定稿。
var DEAI_V2_THRESHOLDS = {
  minEffectiveChars: 80,
  shortTextChars: 1200,
  shortTextScale: 0.7,
  dialogueHedgingMultiplier: 1.5,
  maxNarrationHedgingPerKilo: 4,
  ngramMinEffectiveChars: 300,
  maxRepeatedBigram: 12,
  maxRepeatedTrigram: 8,
  styleDriftWindowChars: 2000,
  minStyleDriftWindows: 2,
  styleDriftAdvisoryDelta: 0.1,
  styleDriftBlockingDelta: 0.2,
  sentenceCVAdvisory: 1,
  sentenceCVStrong: 1.1,
  sentenceCVHighNgramBigram: 900,
  sentenceCVHighNgramTrigram: 300,
  sentenceCVHighStyleDrift: 0.2,
  scoreAdvisory: 25,
  scoreSuspicious: 45,
  scoreLikelyAi: 65,
  scoreBlocking: 80
};

var DEAI_V2_HEDGING_WORDS = [
  '似乎', '仿佛', '好像', '或许', '可能', '也许', '大概', '恐怕', '应该', '显然', '确实', '当然'
];

var DEAI_V2_FUNCTION_CHARS = '的了是在他她它你我这那和与也都就把被着过不有人来去说到对上下里';

// V2 报告层使用的高置信禁用词子集。全量 BANNED_VOCAB 包含大量自然中文
// 通用词，真实人写章节 100% 触发 blocking，只能作为硬规则层提示，不能
// 作为 V2 评分/阻断依据（Phase 10 踏星 200 章校准）。
var DEAI_V2_BLOCKING_VOCAB = [
  '虎躯一震', '心中五味杂陈', '百感交集', '一股暖流涌上心头', '心中涌起一股难以言喻的感觉',
  '宛如天神下凡', '毁天灭地的一击', '绝世容颜', '倾国倾城', '仙气飘飘',
  '像打开了潘多拉的魔盒', '时间仿佛在这一刻凝固', '千言万语涌到嘴边却说不出口',
  '内心久久不能平静', '心情久久不能平复', '感觉天都塌了', '如遭雷击', '如坠冰窟',
  '空气仿佛凝固了', '时间仿佛静止了', '空气中弥漫着紧张的气息', '令人窒息的威压',
  '心脏漏跳了一拍', '心跳漏跳了一拍', '血液倒流', '全身的血液都在倒流', '浑身血液仿佛凝固',
  '电流般的感觉', '触电般的感觉', '勾唇一笑', '危险的弧度', '薄唇轻启', '眸光一暗', '眸色渐深', '凤眸',
  '命运的齿轮开始转动', '灵魂深处', '心中泛起涟漪', '内心深处的某根弦被触动',
  '记忆如潮水般涌来', '不仅如此', '随之而来的是', '正如我们所知', '不得不说',
  '以此为契机', '以此类推', '归根结底',
  '赋能', '重塑', '深度融合', '底层逻辑', '深耕', '痛点', '风口', '蓝海', '破圈', '迭代',
  '颠覆认知', '释放潜能', '拥抱未来', '点亮梦想', '干货满满', '重磅来袭',
  '瞳孔骤缩', '瞳孔猛缩', '瞳孔微缩', '瞳孔骤然收缩', '瞳孔猛地一缩',
  '呼吸一滞', '嘴角勾起一抹弧度', '嘴角勾起弧度', '嘴角勾起一抹笑意', '嘴角微微上扬',
  '某处发烫', '冷寂', '以一种', '指节泛白', '指节发白', '空气凝滞如铁',
  '看得目瞪口呆', '嘴巴张得能塞下一个鸡蛋', '透露出的寒意',
  '让空气的温度都下降了几度', '时间仿佛被按下了暂停',
  '带着一丝', '声音坚定', '眼神坚定', '眼神锐利', '不可置信', '不可置疑',
  '不可估量', '无法想象', '无法用言语形容', '脸上带着笑意',
  '不卑不亢', '显得异常清晰', '目光里毫不遮掩', '针扎', '指甲掐进肉里',
  '一阵莫名的', '一股莫名的', '力道大得惊人', '淬了毒', '近乎偏执'
];

var DEAI_MINIMAL_EDIT_PROMPT = [
  '【降AI深度修复 - 最小编辑】',
  '你只允许在原句上做最小修补，目标是降低AI痕迹，同时保住事实和信息。',
  '禁止：整段重写、回译、扩写、压缩、改变叙事顺序、新增事实、改变人物设定。',
  '优先级：事实正确 > 信息完整 > 去AI痕迹 > 人味。',
  '输出要求：只输出修改后的正文，不解释，不添加标题，不使用代码块。',
  '若某个问题无法在不损伤语义的情况下修复，保留原句。'
].join('\n');

function countPatternMatches(text, pattern) {
  var flags = pattern.flags || '';
  var normalized = flags.indexOf('g') >= 0 ? flags : flags + 'g';
  var re = new RegExp(pattern.source, normalized);
  var matches = text.match(re);
  return matches ? matches.length : 0;
}

function countSentenceEndings(text) {
  var matches = text.match(/[。！？!?]/g);
  return matches ? matches.length : 0;
}

function countParagraphs(text) {
  return text.split(/\n+/).filter(function(p) { return p.trim().length > 0; }).length;
}

function hasBrokenPunctuation(text) {
  return /，。|。，|[，。、！？!?]{2,}|\.{4,}|—{2,}/.test(text);
}

function passesBodyIntegrityCheck(originalText, processedText) {
  if (!originalText || !processedText) return false;
  if (countParagraphs(originalText) !== countParagraphs(processedText)) return false;
  var originalCount = countSentenceEndings(originalText);
  var processedCount = countSentenceEndings(processedText);
  if (originalCount !== processedCount) return false;
  if (hasBrokenPunctuation(processedText) && !hasBrokenPunctuation(originalText)) return false;
  var ratio = processedText.length / originalText.length;
  return ratio >= 0.95 && ratio <= 1.05;
}

function collectSentenceLengths(text) {
  return text
    .split(/[\u3002\uff01\uff1f!?]+/)
    .map(function(sentence) { return sentence.replace(/\s/g, '').length; })
    .filter(function(length) { return length > 0; });
}

function calcSentenceLengthCV(text) {
  var lengths = collectSentenceLengths(text);
  if (lengths.length < DEAI_DETECT_THRESHOLDS.minSentenceCount) return 0;
  var sum = lengths.reduce(function(a, b) { return a + b; }, 0);
  var mean = sum / lengths.length;
  if (mean === 0) return 0;
  var variance = lengths.reduce(function(acc, length) {
    return acc + Math.pow(length - mean, 2);
  }, 0) / lengths.length;
  return Math.round(Math.sqrt(variance) / mean * 100) / 100;
}

function calcPerKilo(count, text) {
  var charCount = text.replace(/\s/g, '').length;
  if (charCount === 0) return 0;
  return Math.round(count / charCount * 1000) / 10;
}

function calcPerKiloByChars(count, charCount) {
  if (!charCount) return 0;
  return Math.round(count / charCount * 1000) / 10;
}

function resolveV2PerKiloThreshold(name, effectiveChars) {
  var base = DEAI_DETECT_THRESHOLDS.maxPerKilo[name];
  var chars = Number.isFinite(effectiveChars) ? effectiveChars : 0;
  var scaled = chars > 0 && chars < DEAI_V2_THRESHOLDS.shortTextChars
    ? base * DEAI_V2_THRESHOLDS.shortTextScale
    : base;
  return Math.round(scaled * 10) / 10;
}

function extractDialogueSegments(text) {
  var segments = [];
  var re = /[\u201c\u300c]([^\u201d\u300d]{1,200})[\u201d\u300d]/g;
  var match;
  while ((match = re.exec(text)) !== null) {
    segments.push(match[1]);
  }
  return segments;
}

function removeDialogueSegments(text) {
  return text
    .replace(/[\u201c\u300c][^\u201d\u300d]{1,200}[\u201d\u300d]/g, '')
    .replace(/[\u201c\u300c][^\u201d\u300d]*$/, '');
}

function countWordList(text, words) {
  var total = 0;
  var samples = [];
  for (var i = 0; i < words.length; i++) {
    var word = words[i];
    var count = 0;
    var idx = 0;
    while ((idx = text.indexOf(word, idx)) >= 0) {
      count++;
      idx += word.length;
    }
    if (count > 0) {
      total += count;
      samples.push(word + '(' + count + ')');
    }
  }
  return { total: total, samples: samples };
}

function normalizeForNgram(text) {
  return String(text || '')
    .replace(/[\s\u3000-\u303f\uff00-\uffef]/g, '')
    .toLowerCase();
}

function isFunctionalGram(gram) {
  for (var i = 0; i < gram.length; i++) {
    if (DEAI_V2_FUNCTION_CHARS.indexOf(gram.charAt(i)) < 0) return false;
  }
  return true;
}

function countRepeatedNgrams(text, gramSize) {
  var normalized = normalizeForNgram(text);
  if (normalized.length < gramSize) return { total: 0, samples: [] };
  var counts = {};
  var order = [];
  for (var i = 0; i + gramSize <= normalized.length; i++) {
    var gram = normalized.substring(i, i + gramSize);
    if (isFunctionalGram(gram)) continue;
    if (!counts[gram]) {
      counts[gram] = 0;
      order.push(gram);
    }
    counts[gram]++;
  }
  var repeated = [];
  for (var j = 0; j < order.length; j++) {
    var key = order[j];
    if (counts[key] > 1) repeated.push({ gram: key, count: counts[key] });
  }
  repeated.sort(function(a, b) { return b.count - a.count; });
  return {
    total: repeated.reduce(function(acc, item) { return acc + item.count; }, 0),
    distinct: repeated.length,
    max: repeated.length > 0 ? repeated[0].count : 0,
    samples: repeated.slice(0, 8).map(function(item) { return item.gram + '(' + item.count + ')'; })
  };
}

function calcHedgingLayerCounts(narrationText, dialogueText) {
  var narration = countWordList(narrationText, DEAI_V2_HEDGING_WORDS);
  var dialogue = countWordList(dialogueText, DEAI_V2_HEDGING_WORDS);
  return { narration: narration, dialogue: dialogue };
}

// V2 报告层的高置信禁用词检测。与 processBody 的全量词库分离：
// 全量词库保留给旧硬规则展示，V2 只用真实样本校准后的子集。
function detectV2BannedVocab(text) {
  var found = [];
  for (var i = 0; i < DEAI_V2_BLOCKING_VOCAB.length; i++) {
    var word = DEAI_V2_BLOCKING_VOCAB[i];
    var count = 0;
    var idx = 0;
    while ((idx = text.indexOf(word, idx)) >= 0) { count++; idx += word.length; }
    if (count > 0) found.push({ word: word, count: count });
  }
  return found;
}

function calcStyleDriftWindowMetrics(text) {
  var charCount = text.replace(/\s/g, '').length;
  return {
    charCount: charCount,
    sentenceLengthCV: calcSentenceLengthCV(text),
    connectorPerKilo: countWordList(text, CONNECTOR_WORDS).total > 0
      ? calcPerKiloByChars(countWordList(text, CONNECTOR_WORDS).total, charCount)
      : 0,
    aiFreqPerKilo: calcPerKiloByChars(countWordList(text, AI_FREQ_WORDS).total, charCount)
  };
}

function normalizeDriftMetric(value) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(value, 1);
}

function detectStyleDrift(text) {
  var windows = [];
  for (var i = 0; i < text.length; i += DEAI_V2_THRESHOLDS.styleDriftWindowChars) {
    var chunk = text.substring(i, i + DEAI_V2_THRESHOLDS.styleDriftWindowChars);
    if (chunk.trim().length < DEAI_V2_THRESHOLDS.minEffectiveChars) continue;
    windows.push(calcStyleDriftWindowMetrics(chunk));
  }
  if (windows.length < DEAI_V2_THRESHOLDS.minStyleDriftWindows) return null;
  var first = windows[0];
  var last = windows[windows.length - 1];
  var firstValue = normalizeDriftMetric(first.sentenceLengthCV) + normalizeDriftMetric(first.connectorPerKilo) + normalizeDriftMetric(first.aiFreqPerKilo);
  var lastValue = normalizeDriftMetric(last.sentenceLengthCV) + normalizeDriftMetric(last.connectorPerKilo) + normalizeDriftMetric(last.aiFreqPerKilo);
  var delta = Math.round(Math.abs(firstValue - lastValue) * 100) / 100;
  if (delta < DEAI_V2_THRESHOLDS.styleDriftAdvisoryDelta) return null;
  return {
    windowCount: windows.length,
    firstLastDelta: delta,
    severity: delta >= DEAI_V2_THRESHOLDS.styleDriftBlockingDelta ? 'blocking' : 'advisory'
  };
}

function resolveAiEditedFraction(score, effectiveChars) {
  if (effectiveChars < DEAI_V2_THRESHOLDS.minEffectiveChars) return 'unknown';
  if (score >= DEAI_V2_THRESHOLDS.scoreLikelyAi) return 'heavy';
  if (score >= DEAI_V2_THRESHOLDS.scoreSuspicious) return 'mixed';
  if (score >= DEAI_V2_THRESHOLDS.scoreAdvisory) return 'light';
  return 'none';
}

function resolveDetectVerdict(score, hasBlockingFinding) {
  if (hasBlockingFinding && score >= DEAI_V2_THRESHOLDS.scoreBlocking) return 'blocking';
  if (score >= DEAI_V2_THRESHOLDS.scoreLikelyAi) return 'likely_ai';
  if (score >= DEAI_V2_THRESHOLDS.scoreSuspicious) return 'suspicious';
  if (score >= DEAI_V2_THRESHOLDS.scoreAdvisory) return 'advisory';
  return 'clean';
}

function hasSentenceCVExcess(sentenceLengthCV, ngramFindings, styleDrift) {
  var strong = DEAI_V2_THRESHOLDS.sentenceCVStrong;
  var advisory = DEAI_V2_THRESHOLDS.sentenceCVAdvisory;
  if (sentenceLengthCV < advisory) return null;
  var bigramCount = ngramFindings.find(function(finding) { return finding.id === 'deai-repeated-bigram'; });
  var trigramCount = ngramFindings.find(function(finding) { return finding.id === 'deai-repeated-trigram'; });
  var bigram = bigramCount ? Number(bigramCount.count) || 0 : 0;
  var trigram = trigramCount ? Number(trigramCount.count) || 0 : 0;
  var drift = styleDrift ? Number(styleDrift.firstLastDelta) || 0 : 0;
  var corroborated = bigram >= DEAI_V2_THRESHOLDS.sentenceCVHighNgramBigram ||
    trigram >= DEAI_V2_THRESHOLDS.sentenceCVHighNgramTrigram ||
    drift >= DEAI_V2_THRESHOLDS.sentenceCVHighStyleDrift;
  var excess = sentenceLengthCV - strong;
  if (excess > 0 && corroborated) {
    return {
      severity: 'advisory',
      contribution: Math.round(28 + excess * 20)
    };
  }
  if (sentenceLengthCV >= advisory) {
    return {
      severity: 'advisory',
      contribution: excess > 0 ? Math.min(18, Math.round(excess * 10)) : 0
    };
  }
  return null;
}

function makeFinding(id, severity, type, count, perKilo, samples, suggestion) {
  return {
    id: id,
    severity: severity,
    type: type,
    count: count,
    perKilo: perKilo,
    samples: samples,
    suggestion: suggestion
  };
}

function extractProtectedSpans(text, options) {
  var settings = options || {};
  var spans = [];
  var knownValues = [];
  if (Array.isArray(settings.mustSpans)) {
    knownValues = knownValues.concat(settings.mustSpans);
  }
  if (Array.isArray(settings.shouldSpans)) {
    knownValues = knownValues.concat(settings.shouldSpans);
  }
  var seen = {};
  for (var i = 0; i < knownValues.length; i++) {
    var value = String(knownValues[i] || '').trim();
    if (!value || seen[value]) continue;
    seen[value] = true;
    var start = text.indexOf(value);
    if (start >= 0) {
      spans.push({
        spanId: 'span-' + spans.length,
        start: start,
        end: start + value.length,
        value: value,
        source: 'config',
        level: settings.shouldSpans && settings.shouldSpans.indexOf(value) >= 0 ? 'should' : 'must'
      });
    }
  }

  var dialogueRegExp = /[“"]([^”"]{1,120})[”"]/g;
  var dialogueMatch;
  while ((dialogueMatch = dialogueRegExp.exec(text)) !== null) {
    var dialogue = dialogueMatch[0];
    if (seen[dialogue]) continue;
    seen[dialogue] = true;
    spans.push({
      spanId: 'span-' + spans.length,
      start: dialogueMatch.index,
      end: dialogueMatch.index + dialogue.length,
      value: dialogue,
      source: 'dialogue',
      level: 'should'
    });
  }
  return spans;
}

function verifyProtectedSpans(originalText, processedText, spans) {
  var checked = Array.isArray(spans) ? spans : [];
  var missing = [];
  var hit = 0;
  for (var i = 0; i < checked.length; i++) {
    var span = checked[i];
    if (!span || !span.value) continue;
    if (processedText.indexOf(span.value) >= 0) {
      hit++;
    } else {
      missing.push({
        spanId: span.spanId,
        value: span.value,
        level: span.level || 'must',
        source: span.source || 'unknown'
      });
    }
  }
  var total = checked.length;
  return {
    total: checked.length,
    hit: hit,
    missing: missing,
    mustMissing: missing.filter(function(item) { return item.level === 'must'; }).length,
    shouldMissing: missing.filter(function(item) { return item.level === 'should'; }).length,
    retentionRatio: total > 0 ? Math.round(hit / total * 100) / 100 : 1,
    originalText: originalText,
    processedText: processedText
  };
}

function normalizeSentenceForChangeRate(sentence) {
  return String(sentence || '')
    .replace(/[，。！？、；：,.!?;:\s“”"'（）()\[\]【】]/g, '')
    .toLowerCase();
}

function splitSentencesForChangeRate(text) {
  return String(text || '')
    .split(/(?<=[。！？!?])\s*|\n+/)
    .map(function(sentence) { return sentence.trim(); })
    .filter(Boolean);
}

function longestCommonSentenceSequence(a, b) {
  var left = a.map(normalizeSentenceForChangeRate);
  var right = b.map(normalizeSentenceForChangeRate);
  if (left.length === 0 || right.length === 0) return 0;
  var prev = new Array(right.length + 1).fill(0);
  var curr = new Array(right.length + 1).fill(0);
  for (var i = left.length - 1; i >= 0; i--) {
    for (var j = right.length - 1; j >= 0; j--) {
      curr[j] = left[i] === right[j]
        ? prev[j + 1] + 1
        : Math.max(prev[j], curr[j + 1]);
    }
    var swap = prev;
    prev = curr;
    curr = swap;
  }
  return prev[0];
}

function evaluateDeepFixEdit(originalText, editedText, blockingFindingCount) {
  var originalSentences = splitSentencesForChangeRate(originalText);
  var editedSentences = splitSentencesForChangeRate(editedText);
  var baseCount = Math.max(originalSentences.length, editedSentences.length, 1);
  var common = longestCommonSentenceSequence(originalSentences, editedSentences);
  var changeRate = Math.round((1 - common / baseCount) * 100) / 100;
  var blocking = Number.isFinite(blockingFindingCount) ? Math.max(0, blockingFindingCount) : 0;
  var warnThreshold = blocking > 3 ? 0.22 : 0.30;
  var rejectThreshold = blocking > 3 ? 0.38 : 0.50;
  if (changeRate >= rejectThreshold) {
    return {
      changeRate: changeRate,
      accepted: false,
      reason: 'change_rate_exceeded',
      rejectThreshold: rejectThreshold,
      warnThreshold: warnThreshold
    };
  }
  if (changeRate >= warnThreshold) {
    return {
      changeRate: changeRate,
      accepted: true,
      warning: 'change_rate_high',
      rejectThreshold: rejectThreshold,
      warnThreshold: warnThreshold
    };
  }
  return {
    changeRate: changeRate,
    accepted: true,
    rejectThreshold: rejectThreshold,
    warnThreshold: warnThreshold
  };
}

function buildDetectReportV2(text, base) {
  var dialogueSegments = extractDialogueSegments(text);
  var dialogueText = dialogueSegments.join('\n');
  var narrationText = removeDialogueSegments(text);
  var effectiveChars = narrationText.replace(/\s/g, '').length;
  var dialogueChars = dialogueText.replace(/\s/g, '').length;

  var thresholds = [];
  var addThreshold = function(name, value, scaledValue) {
    thresholds.push({
      name: name,
      value: value,
      scaledValue: scaledValue,
      source: 'default'
    });
  };
  ['aiFreqWord', 'bannedVocab', 'cliche', 'connector'].forEach(function(name) {
    var value = DEAI_DETECT_THRESHOLDS.maxPerKilo[name];
    var scaled = resolveV2PerKiloThreshold(name, effectiveChars);
    addThreshold(name, value, scaled);
  });

  var findings = base.findings.slice();
  findings = findings.map(function(finding) {
    if (finding.id === 'deai-freq-words' || finding.id === 'deai-banned-vocab' || finding.id === 'deai-banned-phrase' || finding.id === 'deai-connector-density') {
      var thresholdName = finding.id === 'deai-freq-words'
        ? 'aiFreqWord'
        : finding.id === 'deai-banned-vocab'
          ? 'bannedVocab'
          : finding.id === 'deai-banned-phrase'
            ? 'cliche'
            : 'connector';
      var scaled = resolveV2PerKiloThreshold(thresholdName, effectiveChars);
      if (finding.perKilo > scaled && finding.severity !== 'blocking') {
        return Object.assign({}, finding, { severity: 'blocking', suggestion: finding.suggestion + '（V2 自适应阈值：' + scaled + '）' });
      }
    }
    return finding;
  });

  var hedgingLayers = calcHedgingLayerCounts(narrationText, dialogueText);
  var narrationThreshold = DEAI_V2_THRESHOLDS.maxNarrationHedgingPerKilo;
  var dialogueThreshold = Math.round(narrationThreshold * DEAI_V2_THRESHOLDS.dialogueHedgingMultiplier * 10) / 10;
  var narrationHedgingPerKilo = calcPerKiloByChars(hedgingLayers.narration.total, effectiveChars);
  var dialogueHedgingPerKilo = calcPerKiloByChars(hedgingLayers.dialogue.total, dialogueChars);
  if (effectiveChars >= DEAI_V2_THRESHOLDS.minEffectiveChars && narrationHedgingPerKilo > narrationThreshold) {
    findings.push(makeFinding(
      'deai-narration-hedging',
      'advisory',
      '叙述层模糊限定词偏高',
      hedgingLayers.narration.total,
      narrationHedgingPerKilo,
      hedgingLayers.narration.samples.slice(0, 8),
      '把叙述中的模糊判断改成具体动作、身体感受或可观察事实。'
    ));
  }
  if (dialogueChars >= DEAI_V2_THRESHOLDS.minEffectiveChars && dialogueHedgingPerKilo > dialogueThreshold) {
    findings.push(makeFinding(
      'deai-dialogue-hedging',
      'advisory',
      '对白层模糊限定词偏高',
      hedgingLayers.dialogue.total,
      dialogueHedgingPerKilo,
      hedgingLayers.dialogue.samples.slice(0, 8),
      '保留角色语气，只处理堆叠的模糊限定词。'
    ));
  }
  thresholds.push({ name: 'narrationHedging', value: narrationThreshold, scaledValue: narrationThreshold, source: 'default' });
  thresholds.push({ name: 'dialogueHedging', value: dialogueThreshold, scaledValue: dialogueThreshold, source: 'default' });

  var ngramFindings = [];
  if (effectiveChars >= DEAI_V2_THRESHOLDS.ngramMinEffectiveChars) {
    var narrationForNgram = normalizeForNgram(narrationText);
    var bigrams = countRepeatedNgrams(narrationForNgram, 2);
    var trigrams = countRepeatedNgrams(narrationForNgram, 3);
    var scaledBigramThreshold = Math.round(DEAI_V2_THRESHOLDS.maxRepeatedBigram * (effectiveChars < DEAI_V2_THRESHOLDS.shortTextChars ? DEAI_V2_THRESHOLDS.shortTextScale : 1) * 10) / 10;
    var scaledTrigramThreshold = Math.round(DEAI_V2_THRESHOLDS.maxRepeatedTrigram * (effectiveChars < DEAI_V2_THRESHOLDS.shortTextChars ? DEAI_V2_THRESHOLDS.shortTextScale : 1) * 10) / 10;
    if (bigrams.max > scaledBigramThreshold) {
      var bigramFinding = makeFinding(
        'deai-repeated-bigram',
        'advisory',
        '二元词组重复指纹',
        bigrams.total,
        calcPerKiloByChars(bigrams.total, effectiveChars),
        bigrams.samples,
        '改变信息呈现顺序或合并相邻表达，避免同构短语反复出现。'
      );
      ngramFindings.push(bigramFinding);
    }
    if (trigrams.max > scaledTrigramThreshold) {
      var trigramFinding = makeFinding(
        'deai-repeated-trigram',
        'advisory',
        '三元词组重复指纹',
        trigrams.total,
        calcPerKiloByChars(trigrams.total, effectiveChars),
        trigrams.samples,
        '同一句式骨架反复出现，优先重排其中一个句子的信息顺序。'
      );
      ngramFindings.push(trigramFinding);
    }
    thresholds.push({ name: 'repeatedBigramMax', value: DEAI_V2_THRESHOLDS.maxRepeatedBigram, scaledValue: scaledBigramThreshold, source: 'default' });
    thresholds.push({ name: 'repeatedTrigramMax', value: DEAI_V2_THRESHOLDS.maxRepeatedTrigram, scaledValue: scaledTrigramThreshold, source: 'default' });
  }
  findings = findings.concat(ngramFindings);

  var styleDrift = detectStyleDrift(narrationText);
  if (styleDrift) {
    findings.push(makeFinding(
      'deai-style-drift',
      styleDrift.severity,
      '前后风格漂移',
      1,
      styleDrift.firstLastDelta,
      ['窗口数 ' + styleDrift.windowCount + '，首尾指标差 ' + styleDrift.firstLastDelta],
      '检查后半章是否被提示词或后处理带偏，保持叙述密度和句长节奏连续。'
    ));
  }

  var sentenceCVSignal = hasSentenceCVExcess(base.sentenceLengthCV, ngramFindings, styleDrift);
  if (sentenceCVSignal) {
    findings.push(makeFinding(
      'deai-sentence-cv-excess',
      sentenceCVSignal.severity,
      '句长方差异常',
      1,
      base.sentenceLengthCV,
      ['全篇句长变异系数 ' + base.sentenceLengthCV + '，真实人写样本通常低于 1.0'],
      '句长变化需要有叙事原因：短句留给动作和转折，长句承担信息，不要为降AI机械拉大方差。'
    ));
  }

  var blockingFindings = findings.filter(function(finding) { return finding.severity === 'blocking'; });
  var advisoryFindings = findings.filter(function(finding) { return finding.severity === 'advisory'; });
  var score = Math.min(100, blockingFindings.length * 12 + advisoryFindings.length * 6 + Math.round((styleDrift ? styleDrift.firstLastDelta * 10 : 0)) + (sentenceCVSignal ? sentenceCVSignal.contribution : 0));
  var verdict = resolveDetectVerdict(score, blockingFindings.length > 0);
  var aiEditedFraction = resolveAiEditedFraction(score, effectiveChars);

  return {
    kernelVersion: 'v2',
    provisional: true,
    effectiveChars: effectiveChars,
    dialogueChars: dialogueChars,
    score: score,
    verdict: verdict,
    aiEditedFraction: aiEditedFraction,
    findings: findings,
    styleDrift: styleDrift || undefined,
    thresholds: thresholds,
      metrics: {
        sentenceLengthCV: base.sentenceLengthCV,
        connectorDensity: base.connectorDensity,
        protectedSpans: {
          total: base.protectedSpans.length
        }
      }
  };
}

  // 规则2：段落首句号修正（自动执行）
  // 规则1.5：连接词替换（自动执行，非删除）
  // 实测验证：替换连接词降AI率35%，删除连接词反而升17%
  var CONNECTOR_REPLACE = [
    { pattern: /然而[，,]/g, replace: '不过，' },
    { pattern: /然而/g, replace: '不过' },
    { pattern: /首先[，,]/g, replace: '一开始，' },
    { pattern: /其次[，,]/g, replace: '接着，' },
    { pattern: /最后[，,]/g, replace: '到头来，' },
    { pattern: /可以预见[，,]/g, replace: '往后看，' },
    { pattern: /可见[，,]/g, replace: '看得出来，' },
   { pattern: /该方法具有/g, replace: '这个方法有' },
    { pattern: /因此[，,]/g, replace: '所以，' },
    { pattern: /因此/g, replace: '所以' },
   { pattern: /另外[，,]/g, replace: '还有，' },
 ];

  // 规则5：的/地替换（结构助词地→的，排除特例词）
 var DI_EXCEPTIONS = [
    '地上','地下','地面','地板','地毯','地图','地方','地位','地段','地区','地域','地带','地基','地震','地质','地形','地理','地球','地点','地窖','地牢','地道','地铁',
    '地步','地盘','地界','地标','地砖','地漏','地沟','地堡','地雷','地摊','地契','地主','地税','地租','地利','地力','地亩','地瓜','地黄','地龙','地衣',
    '地表','地貌','地壳','地核','地幔','地热','地温','地势','地暖','地胶','地平线','地下室','地下水','地方志','地头蛇','地球仪','地热能','地震波',
    '地磅','地层','地狱','地址','地线','地灯','地脚','地矿','地火','地气','地脉','地缝','地坑','地穴','地洞','地哨','地卡','地柜','地台','地座','地塞',
    '基地','阵地','工地','耕地','田地','荒地','空地','草地','林地','沙地','泥地','湿地','旱地','洼地','坡地','山地','领地','封地','飞地','属地','租地','占地','用地',
    '异地','原地','就地','当地','产地','腹地','要地','胜地','圣地','净地','谷地','盆地','高地','低地','实地','场地','目的地',
    '大地','天地','菜地','麦地','稻地','瓜地','茶地','园地','苗地','矿地','窑地','坟地','墓地','宅地','闲地','熟地','生地','白地','水地',
    '营地','驻地','禁地','境地','僻地','死地','绝地','险地','重地','密地','福地','宝地','吉地','凶地','人地',
    '此地','余地','战地','火地','雪地','冰地','沼地','碱地','盐地','涝地','渍地','梯地','台地','平地','凹地','凸地','丘地',
    '扫地','拖地','擦地','洗地','种地','入地','见地','拔地','跌地','摔地','滚地','爬地','蹲地','趴地','躺地','坐地','站地','陷地','毁地','废地',
    '画地','挖地','填地','埋地','藏地','据地','易地','席地','无地',
    '忽地','蓦地','陡地','猛地','倏地','骤地','顿地','猝地','暗地','私地',
    '似的','真的','的确','特地','故地','本地','外地','内地','随地','顺地','落地','着地','坠地','碎地','满地','遍地','一地','心地',
    '怎样地','这么地','那么地','什么地',
    '天崩地裂','天翻地覆','天高地厚','天寒地冻','天荒地老','天经地义','天罗地网','天南地北','天旋地转','天造地设','天诛地灭',
    '天差地远','天长地久','天悬地隔','天崩地坼','天塌地陷','天摇地动','天公地道',
    '开天辟地','顶天立地','惊天动地','欢天喜地','冰天雪地','幕天席地','铺天盖地',
    '死心塌地','设身处地','五体投地','脚踏实地','别有天地','春回大地','出人头地','呼天抢地','翻天覆地',
    '一席之地','立足之地','用武之地','弹丸之地','不毛之地','一箭之地','安身之地','容身之地','立锥之地',
    '因地制宜','就地取材','就地正法','画地为牢','扫地出门','人地生疏','席地而坐','无地自容','易地而处',
    '拔地而起','掷地有声','花天酒地','洞天福地','地久天长','地动山摇','地广人稀','地大物博','地灵人杰','地老天荒',
    '昏天黑地','怨天怨地','吼天喊地','哭天喊地','上天入地','遮天盖地','漫天掩地','哀天叫地','布天盖地','扑天盖地',
    '弥天盖地','遮天映地','掀天揭地','掀天动地','瞒天瞒地','遮天压地','轰天震地','撼天动地','裂地崩天','塌天陷地',
    '推天撞地','有天无地','呼天唤地','叫天叫地','怨天尤地','咒天骂地','怨天忧地','哀天叩地','悲天悯地','一天一地',
    '一败涂地','见天见地','漫天匝地','遍地开花','席地幕天','入地无门','无地可施','死地求生','绝地反击','险地逢生'
  ];
 function replaceDiWithDe(text) {
   var count = 0;
   var output = '';
   var lastIndex = 0;
    var re = /地/g;
    var match;
   while ((match = re.exec(text)) !== null) {
     var pos = match.index;
     var isException = false;
     for (var ei = 0; ei < DI_EXCEPTIONS.length; ei++) {
       var exc = DI_EXCEPTIONS[ei];
        var diPos = exc.indexOf('地');
        if (diPos === -1) continue;
        var startInText = pos - diPos;
        if (startInText < 0) continue;
        var endInText = startInText + exc.length;
        if (endInText > text.length) continue;
        if (text.substring(startInText, endInText) === exc) { isException = true; break; }
     }
     output += text.substring(lastIndex, pos);
     if (isException) {
       output += '地';
     } else {
       output += '的';
       count++;
     }
     lastIndex = pos + 1;
   }
   output += text.substring(lastIndex);
   return { text: output, count: count };
 }

  // 规则6：顿号转逗号（U+3001 → ，）
  function dunhaoToComma(text) {
    var count = 0;
    var result = text.replace(/\u3001/g, function() { count++; return '\uff0c'; });
    return { text: result, count: count };
  }

  // 规则7：AI高频词检测标记（检测不删除，返回列表供S2参考）
  var AI_FREQ_WORDS = [
    '缓缓地','不禁','一抹','深邃的','值得注意的是','综上所述','与此同时',
    '不仅','而且','然而','因此','此外','另外','总的来说','总而言之',
    '首先','其次','最后','值得一提的是','众所周知','不可否认',
    '毫无疑问','显而易见','换言之','简而言之','由此可见','在这个过程中',
    '在这个背景下','随着'
  ];
  function detectAiFreqWords(text) {
    var found = [];
    for (var i = 0; i < AI_FREQ_WORDS.length; i++) {
      var word = AI_FREQ_WORDS[i];
      var re = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      var matches = text.match(re);
      if (matches && matches.length > 0) {
        found.push({ word: word, count: matches.length });
      }
    }
    return found;
  }

  // === EXPANDED: 禁用词库 (255条, 来源: WriterHelper default_rules.json) ===
  // 检测不删除, 返回列表供S2验证参考和UI显示
  var BANNED_VOCAB = [
    "虎躯一震","心中五味杂陈","百感交集","一股暖流涌上心头","心中涌起一股难以言喻的感觉",
    "宛如天神下凡","毁天灭地的一击","绝世容颜","倾国倾城","仙气飘飘",
    "像打开了潘多拉的魔盒","时间仿佛在这一刻凝固","千言万语涌到嘴边却说不出口",
    "内心久久不能平静","心情久久不能平复","感觉天都塌了","后颈发凉",
    "瞳孔骤缩","瞳孔猛缩","瞳孔微缩","瞳孔骤然收缩","瞳孔猛地一缩",
    "呼吸一滞","嘴角勾起一抹弧度","嘴角勾起弧度","嘴角勾起一抹笑意","嘴角微微上扬",
    "某处发烫","如遭雷击","如坠冰窟","空气仿佛凝固了","时间仿佛静止了",
    "空气中弥漫着紧张的气息","令人窒息的威压","心脏漏跳了一拍","心跳漏了一拍",
    "血液倒流","全身的血液都在倒流","浑身血液仿佛凝固","电流般的感觉","触电般的感觉",
    "勾唇","勾唇一笑","危险的弧度","薄唇轻启","眸光一暗","眸色渐深","凤眸",
    "命运的齿轮开始转动","灵魂深处","心中泛起涟漪","内心深处的某根弦被触动",
    "记忆如潮水般涌来","不仅如此","随之而来的是","正如我们所知","不得不说",
    "以此为契机","以此类推","归根结底","事实上","实际上",
    "赋能","重塑","深度融合","底层逻辑","深耕","痛点","风口","蓝海","破圈","迭代",
    "颠覆认知","释放潜能","拥抱未来","点亮梦想","干货满满","重磅来袭",
    "忍不住","默默","渐渐地","轻轻地","悄然","顿时","猛地","瞬间",
    "发干","轰","炸开","就像是","嘴角勾起","取而代之的是","紧锁",
    "立刻","连忙","显然","似乎","虽然","大致","确实","几乎",
    "可能","注定","接下来","渐渐","更是","一定","或许","十分",
    "沉重","看不出","淡淡","郑重","此刻","恐怕","清淡","不知道",
    "心中一凛","眼中闪过一丝惊讶","行云流水","心下了然","话锋一转","眼神深邃",
    "显著","至关重要","微微挑眉","波涛汹涌","绝对","不可估量",
    "仿佛","随时","无法想象","无法用言语形容","脸上带着笑意",
    "平静地","显得有些兴奋","心中了然","激动地","眼神热切","目光里毫不遮掩",
    "淡淡地","不卑不亢","显得异常清晰","暂时","像是","不断","像",
    "这一刻","再次","一时之间","这一次","看似","沉吟","隐隐有了猜测",
    "淡淡地应了一句","目光扫过","心中一片平静","知道","一丝","坚定",
    "深吸一口气","缓缓地说","锐利的眼睛","他的表情变暗","他的心一跳","他的脸变了",
    "不容置疑","嘴角","脸色","不易察觉","的目光","心中","觉得",
    "意识到","感觉到","认为","一抹","一股","些许","有点","略微","口吻",
    "纯粹","冰冷","电弧","闪烁","裹挟","清冷","沸腾","扭曲","撕裂",
    "漆黑","窒息","剧痛","心中一动","不动声色","小心翼翼","沉吟片刻",
    "心里隐隐有了猜测","我知道","果然","脸上堆满了笑","淬了毒",
    "看得目瞪口呆","嘴巴张得能塞下一个鸡蛋","透露出的寒意",
    "让空气的温度都下降了几度","声音不大","时间仿佛被按下了暂停",
    "带着一丝","声音坚定","眼神坚定","眼神锐利","不可置信","不可置疑",
    "指节泛白","指节发白","空气凝滞如铁","死寂","沉寂","以一种",
    "他知道","冷寂","声音轻细","好像","充满","针扎","指甲掐进肉里",
    "一阵莫名的","一股莫名的","炸雷","精准地","僵住了","凝固",
    "甜腻","扯出","力道大得惊人","闷响","诅咒","冰凉","宣战",
    "近乎偏执","巨大"
  ];

  // === EXPANDED: 禁用句式 (34条, 来源: WriterHelper default_rules.json) ===
  // 检测不删除, 返回列表供S2验证参考
  var BANNED_PHRASES = [
    { pattern: "不是.{1,20}而是.{1,20}", desc: "翻转句式，偶用为修辞、多用即AI标配" },
    { pattern: "与其.{1,20}不如.{1,20}", desc: "取舍句式套话" },
    { pattern: "一方面.{1,20}另一方面.{1,20}", desc: "并列句式，机械对仗" },
    { pattern: "虽然.{1,20}但是.{1,20}", desc: "转折句式，滥用显平淡" },
    { pattern: "不仅.{1,20}而且.{1,20}", desc: "递进句式套话" },
    { pattern: "既.{1,15}又.{1,15}", desc: "并列句式套话" },
    { pattern: "要么.{1,15}要么.{1,15}", desc: "选择句式套话" },
    { pattern: "只要.{1,20}就.{1,20}", desc: "条件句式套话" },
    { pattern: "只有.{1,20}才.{1,20}", desc: "条件句式套话" },
    { pattern: "如果.{1,20}那么.{1,20}", desc: "假设句式套话" },
    { pattern: "即使.{1,20}也.{1,20}", desc: "让步句式套话" },
    { pattern: "因为.{1,20}所以.{1,20}", desc: "因果句式，滥用显机械" },
    { pattern: "尽管.{1,20}还是.{1,20}", desc: "让步句式套话" },
    { pattern: "宁可.{1,20}也不.{1,20}", desc: "取舍句式套话" },
    { pattern: "不但.{1,20}反而.{1,20}", desc: "递进句式套话" },
    { pattern: "首先.{1,30}其次.{1,30}最后.{1,30}", desc: "枚举句式，一步一列显机械" },
    { pattern: "倘若.{1,20}就.{1,20}", desc: "假设句式套话" },
    { pattern: "不单.{1,20}更.{1,20}", desc: "递进句式套话" },
    { pattern: "固然.{1,20}然而.{1,20}", desc: "让步句式套话" },
    { pattern: "越是.{1,15}越.{1,15}", desc: "对比句式套话" },
    { pattern: "与其说.{1,20}不如说.{1,20}", desc: "取舍句式套话" },
    { pattern: "随着.{1,15}的发展", desc: "万能开头套话" },
    { pattern: "在这个信息爆炸的时代", desc: "万能开头套话" },
    { pattern: "在当今时代背景下", desc: "万能开头套话" },
    { pattern: "你有没有想过", desc: "提问式设局" },
    { pattern: "是不是经常觉得", desc: "提问式设局" },
    { pattern: "你是否遇到过", desc: "提问式设局" },
    { pattern: "首先需要指出的是", desc: "句首过渡套话" },
    { pattern: "从更深层次来看", desc: "句首过渡套话" },
    { pattern: "有趣的是", desc: "句首过渡套话" },
    { pattern: "让我们一起看看", desc: "生硬引导语" },
    { pattern: "接下来我们将", desc: "生硬引导语" },
    { pattern: "让我们共同期待", desc: "结尾煽情套话" },
    { pattern: "准备好迎接.{1,15}了吗", desc: "营销式开场" }
  ];

  function detectBannedVocab(text) {
    var found = [];
    for (var i = 0; i < BANNED_VOCAB.length; i++) {
      var word = BANNED_VOCAB[i];
      if (text.indexOf(word) >= 0) {
        var count = 0;
        var idx = 0;
        while ((idx = text.indexOf(word, idx)) >= 0) { count++; idx += word.length; }
        found.push({ word: word, count: count });
      }
    }
    return found;
  }

  function detectBannedPhrases(text) {
    var found = [];
    for (var i = 0; i < BANNED_PHRASES.length; i++) {
      var bp = BANNED_PHRASES[i];
      var re = new RegExp(bp.pattern, "g");
      var matches = text.match(re);
      if (matches && matches.length > 0) {
        found.push({ pattern: bp.pattern, desc: bp.desc, count: matches.length });
      }
    }
    return found;
  }


  // 规则6：句长趋同检测（检测建议）
  function detectUniformSentenceLength(text) {
    var detections = [];


    var sentences = text.split(/\u3002/).filter(function(s) { return s.trim().length > 5; });
    for (var i = 0; i <= sentences.length - 3; i++) {
      var s1 = sentences[i].trim().length;
      var s2 = sentences[i+1].trim().length;
      var s3 = sentences[i+2].trim().length;
      var maxLen = Math.max(s1, s2, s3);
      var minLen = Math.min(s1, s2, s3);
      if (minLen === 0) continue;
      var ratio = (maxLen - minLen) / minLen;
      if (ratio < 0.3 && maxLen >= 10) {
        detections.push({ position: i, lengths: [s1, s2, s3], avgLen: Math.round((s1+s2+s3)/3), ratio: Math.round(ratio*100)/100 });
      }
    }
    return detections;
  }

  // 规则11：连接词密度检测（检测建议）
  var CONNECTOR_WORDS = [
    '\u9996\u5148', '\u5176\u6b21', '\u6b64\u5916', '\u6700\u540e',
    '\u53e6\u5916', '\u7136\u540e', '\u540c\u65f6', '\u4e00\u65b9\u9762', '\u53e6\u4e00\u65b9\u9762',
    '\u800c\u4e14', '\u5e76\u4e14', '\u7136\u800c', '\u56e0\u6b64', '\u6240\u4ee5',
  ];

  function detectConnectorDensity(text) {
    var charCount = text.replace(/\s/g, '').length;
    if (charCount < 100) return { detected: false };
    var total = 0;
    var details = [];
    for (var i = 0; i < CONNECTOR_WORDS.length; i++) {
      var count = (text.match(new RegExp(CONNECTOR_WORDS[i], 'g')) || []).length;
      if (count > 0) { total += count; details.push({ word: CONNECTOR_WORDS[i], count: count }); }
    }
    var perKChar = Math.round(total / charCount * 1000);
    if (perKChar > 8) {
      return { detected: true, total: total, perKChar: perKChar, details: details };
    }
    return { detected: false };
  }

  // 规则N6: 对白保护 (方法论: 对白中的套话是角色语气，不该删)
  function protectDialogue(text) {
    var segments = [];
    var leftQuote = String.fromCharCode(0x201c);
    var rightQuote = String.fromCharCode(0x201d);
    var result = text;
    var idx = 0;
    while (true) {
      var start = result.indexOf(leftQuote);
      if (start === -1) break;
      var end = result.indexOf(rightQuote, start + 1);
      if (end === -1) break;
      var dialogue = result.substring(start, end + 1);
      var placeholder = "\x00DIALOGUE_" + idx + "\x00";
      segments.push(dialogue);
      result = result.substring(0, start) + placeholder + result.substring(end + 1);
      idx++;
    }
    return { text: result, segments: segments };
  }
  function restoreDialogue(text, segments) {
    var result = text;
    for (var i = segments.length - 1; i >= 0; i--) {
      var placeholder = "\x00DIALOGUE_" + i + "\x00";
      result = result.replace(placeholder, segments[i]);
    }
    return result;
  }


  // processBody 是唯一生产入口：只执行字符级安全规则，不碰段落/句子结构。


  return {
    setRuleConfig: function(cfg) { _ruleConfig = cfg; },
    getHardRules: function() { return HARD_RULES; },
    // processBody — 正文专用，只执行字符级安全规则，不碰段落/句子结构。
    // 历史结构重组规则已删除；任何新规则必须通过正文完整性校验后再接入。
    processBody: function(text, config) {
      if (!text || text.trim().length < 10) return { text: text, originalText: text, stats: { total: 0, details: [] }, detections: [] };
      var originalText = text;
      var stats = { total: 0, details: [] };
      var detections = [];
      _ruleConfig = config || null;
      var dialogueData = protectDialogue(text);
      text = dialogueData.text;
      var clicheCount = 0;
      if (_isRuleEnabled('cliches')) {
        for (var i = 0; i < CLICHES_BODY_SAFE.length; i++) {
          var clicheRule = CLICHES_BODY_SAFE[i];
          clicheCount += countPatternMatches(text, clicheRule.pattern);
          text = text.replace(clicheRule.pattern, clicheRule.replace);
        }
      }
      if (clicheCount > 0) { stats.details.push('替换 ' + clicheCount + ' 处套话/AI偏好词'); stats.total += clicheCount; }
      var connectorCount = 0;
      if (_isRuleEnabled('connectors')) {
        for (var ci2 = 0; ci2 < CONNECTOR_REPLACE.length; ci2++) {
          var connectorRule = CONNECTOR_REPLACE[ci2];
          connectorCount += countPatternMatches(text, connectorRule.pattern);
          text = text.replace(connectorRule.pattern, connectorRule.replace);
        }
      }
      if (connectorCount > 0) { stats.details.push('替换 ' + connectorCount + ' 处连接词'); stats.total += connectorCount; }
      var rnDi = _isRuleEnabled('deDiReplace') ? replaceDiWithDe(text) : { text: text, count: 0 };
      text = rnDi.text;
      if (rnDi.count > 0) { stats.details.push('替换 ' + rnDi.count + ' 处的/地'); stats.total += rnDi.count; }
      var rnDun = _isRuleEnabled('dunhaoToComma') ? dunhaoToComma(text) : { text: text, count: 0 };
      text = rnDun.text;
      if (rnDun.count > 0) { stats.details.push('替换 ' + rnDun.count + ' 处顿号'); stats.total += rnDun.count; }
      if (_isRuleEnabled('aiFreqDetect')) {
        var freqWords = detectAiFreqWords(text);
        if (freqWords.length > 0) {
          var freqDesc = freqWords.map(function(f) { return f.word + '(' + f.count + '次)'; }).join(', ');
          detections.push({ type: 'AI高频词', count: freqWords.length, desc: freqDesc });
        }
      }
      if (_isRuleEnabled('bannedVocab')) {
        var bannedWords = detectBannedVocab(text);
        if (bannedWords.length > 0) {
          var bannedDesc = bannedWords.map(function(b) { return b.word + '(' + b.count + '次)'; }).join(', ');
          detections.push({ type: '禁用词', count: bannedWords.length, desc: bannedDesc });
        }
      }
      if (_isRuleEnabled('bannedPhrases')) {
        var bannedPhrasesFound = detectBannedPhrases(text);
        if (bannedPhrasesFound.length > 0) {
          var bpDesc = bannedPhrasesFound.map(function(p) { return p.desc + '(' + p.count + '次)'; }).join(', ');
          detections.push({ type: '禁用句式', count: bannedPhrasesFound.length, desc: bpDesc });
        }
      }
      text = restoreDialogue(text, dialogueData.segments);
      if (!passesBodyIntegrityCheck(originalText, text)) {
        console.warn('[DEAI V56] Body integrity protection triggered, rolled back to original text');
        stats.details.push('完整性保护触发，已回滚原文');
        stats.total = 0;
        return { text: originalText, originalText: originalText, stats: stats, detections: detections };
      }
      return { text: text, originalText: originalText, stats: stats, detections: detections };
    },
    // 降AI V2：正文检测报告。只读不改写，供检测报告模式和深度修复模式复用。
    detectBody: function(text, config) {
      var sourceText = text || '';
      var emptyReport = {
        kernelVersion: 'v2',
        provisional: true,
        effectiveChars: 0,
        dialogueChars: 0,
        score: 0,
        verdict: 'clean',
        aiEditedFraction: 'unknown',
        findings: [],
        thresholds: [],
        metrics: {
          sentenceLengthCV: 0,
          connectorDensity: 0,
          protectedSpans: { total: 0 }
        }
      };
      if (!sourceText || sourceText.trim().length < DEAI_DETECT_THRESHOLDS.minTextLength) {
        return emptyReport;
      }

      var originalText = sourceText;
      var _prevRuleConfig = _ruleConfig;
      _ruleConfig = config || null;
      var protectedSpans = extractProtectedSpans(sourceText, {
        mustSpans: config && config.protectedMustSpans,
        shouldSpans: config && config.protectedShouldSpans
      });

      var findings = [];
      var charCount = sourceText.replace(/\s/g, '').length;
      var perKiloBase = charCount > 0 ? charCount / 1000 : 0;

      var freqWords = detectAiFreqWords(sourceText);
      if (freqWords.length > 0) {
        var freqCount = freqWords.reduce(function(acc, item) { return acc + item.count; }, 0);
        var freqPerKilo = Math.round(freqCount * (perKiloBase > 0 ? 1 / perKiloBase : 0) * 10) / 10;
        findings.push(makeFinding(
          'deai-freq-words',
          freqPerKilo > DEAI_DETECT_THRESHOLDS.maxPerKilo.aiFreqWord ? 'blocking' : 'advisory',
          'AI高频词',
          freqCount,
          freqPerKilo,
          freqWords.slice(0, 8).map(function(item) { return item.word + '(' + item.count + ')'; }),
          '改写为具体动作、具体事实或直接删除，不建议同义词硬换。'
        ));
      }

      var bannedWords = detectV2BannedVocab(sourceText);
      if (bannedWords.length > 0) {
        var bannedCount = bannedWords.reduce(function(acc, item) { return acc + item.count; }, 0);
        var bannedPerKilo = Math.round(bannedCount * (perKiloBase > 0 ? 1 / perKiloBase : 0) * 10) / 10;
        findings.push(makeFinding(
          'deai-banned-vocab',
          bannedPerKilo > DEAI_DETECT_THRESHOLDS.maxPerKilo.bannedVocab ? 'blocking' : 'advisory',
          '禁用词',
          bannedCount,
          bannedPerKilo,
          bannedWords.slice(0, 8).map(function(item) { return item.word + '(' + item.count + ')'; }),
          '优先删除或换成具体描写；密度超限时必须人工处理。'
        ));
      }

      var bannedPhrases = detectBannedPhrases(sourceText);
      if (bannedPhrases.length > 0) {
        var phraseCount = bannedPhrases.reduce(function(acc, item) { return acc + item.count; }, 0);
        var phrasePerKilo = Math.round(phraseCount * (perKiloBase > 0 ? 1 / perKiloBase : 0) * 10) / 10;
        findings.push(makeFinding(
          'deai-banned-phrase',
          phrasePerKilo > DEAI_DETECT_THRESHOLDS.maxPerKilo.cliche ? 'blocking' : 'advisory',
          '禁用句式',
          phraseCount,
          phrasePerKilo,
          bannedPhrases.slice(0, 8).map(function(item) { return item.desc + '(' + item.count + ')'; }),
          '调整信息顺序或合并句子，避免机械对仗。'
        ));
      }

      var connectorResult = detectConnectorDensity(sourceText);
      var connectorDensity = connectorResult.detected ? connectorResult.perKChar : calcPerKilo(0, sourceText);
      if (connectorResult.detected) {
        findings.push(makeFinding(
          'deai-connector-density',
          connectorResult.perKChar > DEAI_DETECT_THRESHOLDS.maxPerKilo.connector ? 'blocking' : 'advisory',
          '连接词密度偏高',
          connectorResult.total,
          connectorResult.perKChar,
          connectorResult.details.slice(0, 8).map(function(item) { return item.word + '(' + item.count + ')'; }),
          '删掉部分连接词，用动作或场景转折承担过渡。'
        ));
      }

      var uniformLengths = detectUniformSentenceLength(sourceText);
      if (uniformLengths.length > 0) {
        findings.push(makeFinding(
          'deai-uniform-sentence-length',
          'advisory',
          '句长趋同',
          uniformLengths.length,
          0,
          uniformLengths.slice(0, 3).map(function(item) { return '连续3句约' + item.avgLen + '字'; }),
          '加入短句或长句，让连续三句长度差异超过30%。'
        ));
      }

      var sentenceLengthCV = calcSentenceLengthCV(sourceText);
      if (sentenceLengthCV > 0 && sentenceLengthCV < DEAI_DETECT_THRESHOLDS.minSentenceLengthCV) {
        findings.push(makeFinding(
          'deai-sentence-cv',
          'advisory',
          '句长方差不足',
          1,
          sentenceLengthCV,
          ['全篇句长变异系数 ' + sentenceLengthCV],
          '让叙事节奏有轻重变化，避免所有句子长度接近。'
        ));
      }

      if (hasBrokenPunctuation(sourceText)) {
        findings.push(makeFinding(
          'deai-broken-punctuation',
          'blocking',
          '崩坏标点',
          1,
          0,
          ['存在连续标点、断句空缺或重复标点'],
          '先人工修复标点，再进入深度修复。'
        ));
      }

      _ruleConfig = _prevRuleConfig;
      return buildDetectReportV2(sourceText, {
        findings: findings,
        sentenceLengthCV: sentenceLengthCV,
        connectorDensity: connectorDensity,
        protectedSpans: protectedSpans,
        charCount: charCount
      });
    },
    detectBodyV2: function(text, config) {
      return DeAiProcessor.detectBody(text, config);
    },
    detectUniformSentenceLength: detectUniformSentenceLength,
    detectConnectorDensity: detectConnectorDensity,
    replaceDiWithDe: replaceDiWithDe,
    dunhaoToComma: dunhaoToComma,
    detectAiFreqWords: detectAiFreqWords,
    detectBannedVocab: detectBannedVocab,
    detectBannedPhrases: detectBannedPhrases,
    passesBodyIntegrityCheck: passesBodyIntegrityCheck,
    extractProtectedSpans: extractProtectedSpans,
    verifyProtectedSpans: verifyProtectedSpans,
    evaluateDeepFixEdit: evaluateDeepFixEdit,
    collectDeaiFindingsWithObservability: collectDeaiFindingsWithObservability,
    detectStyleDrift: detectStyleDrift,
    getMinimalEditPrompt: function() { return DEAI_MINIMAL_EDIT_PROMPT; },
    getDetectThresholds: function() { return DEAI_DETECT_THRESHOLDS; }
  };
})();

function collectDeaiFindingsWithObservability(candidate, onDegraded, detect) {
  var detector = detect || function(text) { return DeAiProcessor.detectBody(text, {}); };
  try {
    return { findings: detector(candidate).findings || [], degraded: false };
  } catch (error) {
    var message = error && error.message ? error.message : String(error);
    if (typeof onDegraded === 'function') onDegraded(message);
    return { findings: [], degraded: true, degradedReason: message };
  }
}
export {
  BODY_LAYER_STEP,
  DeAiProcessor,
  collectDeaiFindingsWithObservability
};
