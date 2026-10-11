

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
  return {
    total: checked.length,
    hit: hit,
    missing: missing,
    mustMissing: missing.filter(function(item) { return item.level === 'must'; }).length,
    shouldMissing: missing.filter(function(item) { return item.level === 'should'; }).length,
    originalText: originalText,
    processedText: processedText
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
        findings: [],
        metrics: {
          sentenceLengthCV: 0,
          connectorDensity: 0,
          protectedSpans: { total: 0, hit: 0, missing: [] },
          retentionRatio: 1
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

      var bannedWords = detectBannedVocab(sourceText);
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
      return {
        findings: findings,
        metrics: {
          sentenceLengthCV: sentenceLengthCV,
          connectorDensity: connectorDensity,
          protectedSpans: {
            total: protectedSpans.length,
            hit: protectedSpans.length,
            missing: []
          },
          retentionRatio: 1
        }
      };
    },
    detectUniformSentenceLength: detectUniformSentenceLength,
    detectConnectorDensity: detectConnectorDensity,
    replaceDiWithDe: replaceDiWithDe,
    dunhaoToComma: dunhaoToComma,
    detectAiFreqWords: detectAiFreqWords,
    detectBannedVocab: detectBannedVocab,
    detectBannedPhrases: detectBannedPhrases,
    passesBodyIntegrityCheck: passesBodyIntegrityCheck,
    getMethodologyPrompt: function() { return DEAI_METHODOLOGY_PROMPT; },
    extractProtectedSpans: extractProtectedSpans,
    verifyProtectedSpans: verifyProtectedSpans,
    getMinimalEditPrompt: function() { return DEAI_MINIMAL_EDIT_PROMPT; },
    getDetectThresholds: function() { return DEAI_DETECT_THRESHOLDS; }
  };
})();

// ================================================================
// 方法论注入层：完整降AI方法论作为创作约束
// 注入到SKILL链的system prompt中，让模型在生成阶段就遵守
// 覆盖脚本无法实现的语义规则（具体化、打破信息均匀）
// ================================================================
var DEAI_METHODOLOGY_PROMPT = "【降AI创作约束 - 生成阶段执行】\n你在生成文本时必须遵守以下降AI写作规则。规则融合降得快方法论与社区前沿实践（anti-ai-prose/humanize/unslop/PortOS等），覆盖三信号体系（perplexity/burstiness/stylometric fingerprint）。\n\n核心认知：同义词替换无效。真正影响AI特征的不是几个词，而是整篇文章的表达规律——句子排列、段落组织、信息顺序、完整度分布。只换词不改结构，检测结果不会变化。因此以下规则以肯定式约束为主，告诉模型应该怎么写，而非仅仅禁止什么。\n\n1. 第一句必须是具体动作或感官细节。直接切入场景：角色的动作、身体感受、环境声音或视觉画面。禁止以「随着」「在当今」「众所周知」等空泛词句开头。\n\n2. 句长方差要大。连续三句长度差异必须>30%。穿插短句（5字以下）制造节奏冲击，穿插长句（30字以上）铺展细节。但注意：短句碎片链（连续3句以上<8字）本身是AI信号，禁止过度使用。\n\n3. 用具体动作替代抽象形容。禁止用「他感受到了强大的力量」「空气仿佛凝固了」等模糊填充。必须写具体：手指颤抖、指甲嵌入掌心、血珠从指缝渗出。每个动作要有明确的身体部位、力度和方向。\n\n4. 场景结尾留下未解决张力。段落可以没有结论，场景结尾更不能收束太整齐。禁止「总的来说」「由此可以看出」「因此我们需要」等收束句。有些场景说完就停，把悬念留给下一个场景。\n\n5. 戏剧价值决定篇幅。有戏剧张力的场景多写几段，过渡性场景可以一笔带过。没有戏剧价值的场景不该存在。禁止每个场景篇幅差不多的均匀分配——均匀是AI文本最典型的特征。\n\n6. 连接词按叙事需要使用。禁止「首先-其次-此外-最后」的固定序列。有些连接词省略，有些换成具体动作过渡，有些合并句子。注意：删掉连接词但信息顺序不变等于无效——必须改变信息呈现顺序本身。\n\n7. 叙述视角体现判断。叙述者的判断体现为：看什么不看什么（选择性）、语气倾向（冷峻/温情/讽刺）、信息节奏（什么先说什么后说）。禁止「我们应该合理使用」等放之四海而皆准的正确话。叙述者不是评论员，不需要表态。\n\n8. 段落结构要有变化。禁止每段都用「提出观点-解释原因-列举案例-总结」的同一个结构。有些段直接进动作，有些段先讲问题，有些段说完就停。特别注意：禁止「描述-对话-描述」的循环结构——这是AI叙事最差的结构特征。每个对话回合的描写配比必须不同。\n\n9. 自然不等于混乱。禁止故意加语病、错别字、重复表达。保留清晰度，增加真实变化。真正的自然是加入真实细节、轻重变化和节奏波动，不是故意写错。过度纠错（如连续短句碎片、「不是X。是Y。」句式）本身也是AI信号。\n\n10. 小说正文特殊保护。不能改变：人物名字、地点、时间、等级体系、金手指设定、关键剧情、伏笔。表达可以变化，但人物关系和核心设定不能随意改变。对白要符合人物性格，动作和场景不能随意打乱。伏笔埋设到回收距离至少3章。\n\n11. 对话要有残缺和轻重。AI对白过于完整——角色说话时会把原因、推理和结论全部说完。真人说话不完整。有些对话回合只有动作没有台词，有些只有台词没有动作描写。禁止每个对话回合都配等量微表情描写。有些对话之间直接连续，不加动作描写。对话场景的轻重变化比叙述场景更重要。\n\n12. 对话中减少解释性从句。角色说话时禁止把因果推理全部说出来。「因为...所以...」「如果...就...」「这意味着...」这些解释性从句在对话中应该减少。让读者自己推理，不要替读者总结。角色可以说半句话，用动作或表情暗示剩下的部分。\n\n13. 叙事视角保持一致。同一段内禁止在有限视角和全知视角之间跳转。如果本章是某角色的有限视角，不能突然插入其他角色的内心独白。视角切换只在场景分隔处进行。\n\n14. 节奏与情绪匹配。紧张场景：短句密集，动作快节奏，减少描写。舒缓场景：长句铺陈，增加感官细节和环境描写。禁止所有场景用同一节奏推进。\n\n15. 密度阈值约束。以下词汇在每500字内不得超过1次：「确实」「当然」「不仅...而且」「值得注意的是」「显而易见」「不言而喻」「至关重要」「不可或缺」「换言之」「简而言之」「综上所述」。密度超限即为AI风格堆叠。\n\n16. 禁止Chatbot痕迹。对话和叙述中禁止出现「当然！」「没问题！」「确实如此」「希望对你有帮助」「让我们来看看」等助手腔。这些是聊天界面残留，不是小说语言。\n\n17. 禁止speculative gap-filling。AI用「似乎」「仿佛」「给人一种...的感觉」「让人不禁」「隐约可以感受到」等模糊表述填充信息缺口。如果角色不安，就写他不安的具体表现，不要写「他似乎有些不安」。\n\n以上规则在生成时就要遵守，不是事后修改。生成阶段遵守这些规则，能从根源降低AI文本特征。";
var DEAI_CREATIVE_PROMPT = [
  '【降AI创作风格 - 创作执行阶段】',
  '只做正向风格执行，不做方法解释，不输出检查清单。',
  '1. 第一句直接进入具体动作、身体感受、环境声音或视觉画面。',
  '2. 连续三句的长度保持明显差异；用短句制造节奏冲击，用长句铺展细节。',
  '3. 用明确部位、力度和方向的具体动作呈现情绪；保留人物名字、地点、时间、等级体系、金手指设定、关键剧情和伏笔。',
  '4. 场景按戏剧价值分配轻重；结尾允许保留未解决张力。',
  '5. 连接词只按叙事需要使用；优先用动作变化、选择性观察和信息顺序承担过渡。',
  '6. 对话保留残缺和轻重：有些回合只有动作，有些只有台词；不替读者总结因果。',
  '7. 同一段保持叙事视角一致；紧张场景短句密集，舒缓场景长句铺陈。',
  '8. 只输出本步骤定稿产物。'
].join('\n');

function resolveDeaiPromptForChainStep(step, skillIndex) {
  if (step !== 4) return "";
  return skillIndex === 1 ? DEAI_CREATIVE_PROMPT : DEAI_METHODOLOGY_PROMPT;
}

export { DeAiProcessor, DEAI_METHODOLOGY_PROMPT, DEAI_CREATIVE_PROMPT, resolveDeaiPromptForChainStep };
