
  // N30: createParagraphRhythmVariation
  function createParagraphRhythmVariation(text) {
    var count = 0;
    var nl = String.fromCharCode(10);
    var linesArr = text.split(nl).filter(function(l) { return l.trim().length > 0; });
    if (linesArr.length < 6) return { text: text, count: 0 };
    var mergePattern = [2, 1, 3, 1, 2, 1, 4, 1, 2, 1, 3, 1, 2];
    var newParas = [];
    var idx = 0;
    var pi = 0;
    while (idx < linesArr.length) {
      var groupSize = mergePattern[pi % mergePattern.length];
      if (groupSize > linesArr.length - idx) groupSize = linesArr.length - idx;
      if (groupSize <= 1) { newParas.push(linesArr[idx]); idx++; }
      else { newParas.push(linesArr.slice(idx, idx + groupSize).join(nl)); count += groupSize - 1; idx += groupSize; }
      pi++;
    }
    return { text: newParas.join(nl + nl), count: count };
  }

var DeAiProcessor = (function() {
  // ================================================================
  // 硬规则层：纯字符级强制修正，不依赖模型语义理解
  // 从降得快博客方法论提炼，覆盖所有可机械执行的规则
  // 双层架构：本文件是硬规则层，另有方法论注入层在SKILL链中
  // ================================================================

  // 规则1：AI套话/AI偏好词删除（自动执行）
    // Hard rules registry for visualization
  var HARD_RULES = [
    { id: "cliches", name: "AI套话替换", enabled: true },
    { id: "connectors", name: "连接词替换", enabled: true },
    { id: "dropNames", name: "去掉句首人名", enabled: true },
    { id: "dropPronouns", name: "去掉句首他/她", enabled: true },
    { id: "mergeShort", name: "合并短句", enabled: true },
    { id: "narratorIntermediary", name: "中转词删除", enabled: true },
    { id: "causalInversion", name: "因果倒装", enabled: true },
    { id: "frameStripping", name: "框架剥离", enabled: true },
    { id: "reduceSensory", name: "压缩感官描写", enabled: true },
    { id: "templateOpening", name: "替换模板化开头", enabled: true },
    { id: "mergeShortPara", name: "合并短段落", enabled: true },
    { id: "shuffleListing", name: "打散列举模式", enabled: true },
    { id: "breakUniformity", name: "修复段落趋同", enabled: true },
    { id: "fixUniformLen", name: "修复句长趋同", enabled: true },
    { id: "rhythmVariation", name: "段落节奏变化", enabled: true },
   { id: "fixPeriods", name: "段首句号修复", enabled: true },
   { id: "breakConnectors", name: "打断连接词序列", enabled: true }
    ,{ id: "deDiReplace", name: "的/地替换", enabled: true }
    ,{ id: "dunhaoToComma", name: "顿号转逗号", enabled: true }
    ,{ id: "aiFreqDetect", name: "AI高频词检测", enabled: true }
 ];
  var _ruleConfig = null;
  function _isRuleEnabled(id) {
    if (!_ruleConfig || !_ruleConfig.hardRules) return true;
    var r = _ruleConfig.hardRules[id];
    if (r === false) return false;
    return true;
  }
var CLICHES = [
    { pattern: /值得注意的是[，,。、！？]/g, replace: '有意思的是' },
    { pattern: /综上所述[，,。、！？]/g, replace: '说到底' },
    { pattern: /总的来说[，,。、！？]/g, replace: '归根结底' },
    { pattern: /总而言之[，,。、！？]/g, replace: '一句话' },
    { pattern: /由此可见[，,。、！？]/g, replace: '这么看下来' },
    { pattern: /与此同时[，,。、！？]/g, replace: '同时' },
    { pattern: /换言之[，,。、！？]/g, replace: '换个说法' },
    { pattern: /简而言之[，,。、！？]/g, replace: '长话短说' },
    { pattern: /毫无疑问[，,。、！？]/g, replace: '不用说' },
    { pattern: /不可否认[，,。、！？]/g, replace: '说实话' },
    { pattern: /众所周知[，,。、！？]/g, replace: '大家都知道' },
    { pattern: /从某种程度来说[，,。、！？]/g, replace: '往小说' },
    { pattern: /从某种意义上说[，,。、！？]/g, replace: '往大了说' },
    { pattern: /总体而言[，,。、！？]/g, replace: '整体来看' },
    { pattern: /总体来说[，,。、！？]/g, replace: '整体来说' },
    { pattern: /由此可知[，,。、！？]/g, replace: '由此能看出' },
    { pattern: /显而易见[，,。、！？]/g, replace: '明眼人都能看出来' },
    { pattern: /不难发现[，,。、！？]/g, replace: '仔细看会发现' },
    { pattern: /不难看出[，,。、！？]/g, replace: '仔细看能看出' },
    { pattern: /值得深思[，,。、！？]/g, replace: '值得好好想想' },
    { pattern: /引人深思[，,。、！？]/g, replace: '让人忍不住想' },
    { pattern: /发人深省[，,。、！？]/g, replace: '让人警醒' },
    { pattern: /在这个过程中[，,。、！？]/g, replace: '这么一来' },
    { pattern: /进行了(一次|一场|一番)?/g, replace: '做了' },
    { pattern: /做出了(一个|一项|一次)?/g, replace: '做了' },
    { pattern: /存在着/g, replace: '存在' },
    { pattern: /产生了/g, replace: '产生' },
    { pattern: /形成了/g, replace: '形成' },
    { pattern: /极大的/g, replace: '很大的' },
    { pattern: /显著的/g, replace: '明显的' },
    { pattern: /深刻的/g, replace: '很深的' },
    { pattern: /充分的/g, replace: '足够的' },
    { pattern: /有效的(?!。)/g, replace: '有用的' },
    { pattern: /一定的/g, replace: '一些' },
    { pattern: /某种程度上/g, replace: '某种意义上' },
    { pattern: /需要引起注意的是[，,]/g, replace: '需要注意的是' },
    { pattern: /需要指出的是[，,]/g, replace: '需要说明的是' },
    { pattern: /众所周知的是[，,]/g, replace: '大家都知道' },
    { pattern: /具有重要意义的/g, replace: '重要的' },
    { pattern: /具有重要意义/g, replace: '很重要' },
    { pattern: /具有重要的/g, replace: '重要的' },
    { pattern: /具有.{1,8}特点/g, replace: '有特色' },
    { pattern: /具有.{1,8}价值/g, replace: '有价值' },
    { pattern: /具有.{1,8}作用/g, replace: '有用' },
    { pattern: /发挥着.{1,6}作用/g, replace: '有用' },
    { pattern: /发挥着越来越重要的/g, replace: '重要的' },
    { pattern: /发挥着.{1,6}重要的/g, replace: '重要的' },
    { pattern: /但需要注意的是[，,]/g, replace: '但' },
    { pattern: /但需要指出的是[，,]/g, replace: '但' },
    { pattern: /然而，不可否认的是/g, replace: '然而' },
    { pattern: /不过，总的来说[，,]/g, replace: '不过' },
    { pattern: /此外[，,]/g, replace: '另外' },
    { pattern: /对于普通人而言[，,]/g, replace: '对普通人来说' },
    { pattern: /对于创作者来说[，,]/g, replace: '对创作者来说' },
    { pattern: /对于(.{1,6})而言[，,]/g, replace: '对$1来说，' },
    { pattern: /这是一个值得.{1,8}的问题/g, replace: '这是个值得' },
    { pattern: /这是一个需要.{1,8}的过程/g, replace: '这是个需要' },
    { pattern: /只要掌握正确的方法[，,]/g, replace: '掌握了方法' },
    { pattern: /需要保持独立思考[，,]/g, replace: '要自己想' },
    { pattern: /应该选择适合自己的方法[，,]/g, replace: '找到适合自己的方法' },
    { pattern: /只有不断学习[，,]/g, replace: '不断学习' },
    { pattern: /要不断提升自己[，,]/g, replace: '要提升自己' },
    { pattern: /坚持非常重要[，,]/g, replace: '坚持很重要' },
    { pattern: /不仅能够.{1,10}还可以/g, replace: '能' },
    { pattern: /不仅.{1,10}而且/g, replace: '既' },
    { pattern: /与此同时[，,]/g, replace: '同时' },
    { pattern: /由此可以(看出|见|知道)/g, replace: '可以' },
    { pattern: /换句话说[，,。、！？]/g, replace: '说白了' },
    { pattern: /也就是说[，,。、！？]/g, replace: '就是说' },
    { pattern: /这意味着[，,]/g, replace: '这意味着' },
    { pattern: /这说明了[，,]/g, replace: '这说明' },
    { pattern: /这表明了[，,]/g, replace: '这表明' },
    { pattern: /这证明了[，,]/g, replace: '这证明' },
    { pattern: /这(说明|表明|证明)[^。]{3,20}。/g, replace: '。' },
    { pattern: /在提高效率的同时/g, replace: '同时' },
    { pattern: /不仅改变(了)?/g, replace: '改变' },
    { pattern: /也为.{1,8}创造了/g, replace: '给' },
    { pattern: /持续(进行|优化)[，,]/g, replace: '继续，' },
    { pattern: /只有不断(学习|努力|进步)[，,]才能/g, replace: '不断' },
    { pattern: /只要掌握正确的方法[，,]/g, replace: '掌握了方法' },
    { pattern: /对于企业来说[，,]/g, replace: '对企业来说' },
    { pattern: /对于普通人来说[，,]/g, replace: '对普通人来说' },
    { pattern: /对于创作者来说[，,]/g, replace: '对创作者来说' },
    { pattern: /在.{1,10}的同时/g, replace: '同时' },
    { pattern: /不仅.{1,10}还为.{1,8}创造了/g, replace: '既' },
    { pattern: /为.{1,6}创造了更多/g, replace: '给' },
  ];

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

 function fixParagraphStartPeriods(text) {
    var count = 0;
    var lines = text.split(/\n/);
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var firstPeriod = line.indexOf('。');
      if (firstPeriod === -1 || firstPeriod === 0) continue;
      var before = line.substring(0, firstPeriod);
      if (before.length <= 15 && before.length >= 3) {
        lines[i] = lines[i].replace('。', '，');
        count++;
      }
    }
    return { text: lines.join('\n'), count: count };
  }

  // 规则3：连续短句合并（自动执行）
  function mergeContinuousShortSentences(text) {
    var count = 0;
    var p = /([^\u3002\n]{3,15})\u3002([^\u3002\n]{3,15})\u3002([^\u3002\n]{3,15})\u3002/g;
    var result = text.replace(p, function(match) {
      if (match.length <= 55) {
        count++;
        return match.replace(/\u3002/g, function(m, idx) {
          if (idx < match.lastIndexOf('\u3002')) return '\uff0c';
          return m;
        });
      }
      return match;
    });
    return { text: result, count: count };
  }

  // 规则4：段落总结句删除（自动执行）
  var SUMMARY_PATTERNS = [
    /\u56e0\u6b64[\uff0c,]\u6211\u4eec(\u9700\u8981|\u5e94\u8be5|\u5e94\u5f53)[^\u3002]{3,30}\u3002$/,
    /\u7531\u6b64(\u53ef\u89c1|\u53ef\u77e5)[^\u3002]{3,30}\u3002$/,
    /\u603b\u7684\u6765\u8bf4[\uff0c,][^\u3002]{3,30}\u3002$/,
    /\u603b\u800c\u8a00\u4e4b[\uff0c,][^\u3002]{3,30}\u3002$/,
    /\u8fd9(\u8bf4\u660e|\u8868\u660e|\u8bc1\u660e)[^\u3002]{3,30}\u3002$/,
    /\u8fd9(\u662f\u4e00\u79cd|\u662f\u4e00\u4e2a)[^\u3002]{5,30}(\u9009\u62e9|\u65b9\u5f0f|\u65b9\u6cd5|\u65b9\u5411)\u3002$/,
    /\u53ea\u8981[^\u3002]{3,20}\u5c31\u80fd[^\u3002]{3,20}\u3002$/,
    /\u53ea\u6709[^\u3002]{3,20}\u624d\u80fd[^\u3002]{3,20}\u3002$/,
    /\u7efc\u4e0a[\uff0c,][^\u3002]{3,30}\u3002$/,
    /\u56e0\u6b64[\uff0c,][^\u3002]{3,30}\u3002$/,
    /\u7531\u6b64\u53ef\u89c1[\uff0c,][^\u3002]{3,30}\u3002$/,
    /这(说明|表明|证明)[^。]{3,30}。$/,
    /这意味着[^。]{3,30}。$/,
    /也就是说[，,][^。]{3,30}。$/,
    /换句话说[，,][^。]{3,30}。$/,
    /从(这个|以上|上述)(角度|意义|层面)来看[，,][^。]{3,30}。$/,
    /不难(看出|发现)[，,][^。]{3,30}。$/,
    /可以看出[，,][^。]{3,30}。$/,
    /可见[，,][^。]{3,30}。$/,
  ];

  function removeParagraphSummaries(text) {
    var count = 0;
    var paragraphs = text.split(/\n/);
    var total = paragraphs.length;
    for (var i = 0; i < paragraphs.length; i++) {
      if (i === total - 1) continue;
      var para = paragraphs[i].trim();
      if (para.length < 20) continue;
      for (var j = 0; j < SUMMARY_PATTERNS.length; j++) {
        if (SUMMARY_PATTERNS[j].test(para)) {
          paragraphs[i] = paragraphs[i].replace(SUMMARY_PATTERNS[j], '');
          count++;
          break;
        }
      }
    }
    return { text: paragraphs.join('\n'), count: count };
  }


  // 规则6.5：句首去重（自动执行）
  // 朱雀验证发现：替换词重复使用形成新的句首重复模式
  // 例：5个"然而"替换成5个"不过"，段6被判92% AI
  var PARAGRAPH_STARTER_ROTATION = {
    "不过": ["但话说回来", "只是", "话又说回来", "可转念一想"],
    "这么一来": ["这么着", "结果", "到最后", "弄了半天"],
    "有意思的是": ["逗的是", "妙的是", "巧的是", "好玩的是"],
    "这么看下来": ["这么算下来", "综合来看", "回过头看"],
    "到头来": ["末了", "到末了", "最后算算"],
    "一开始": ["起初", "起先", "刚开的时候"],
    "接着": ["然后", "跟着", "紧接着"],
    "另外": ["还有", "除此之外", "再就是"],
    "往后看": ["往后瞧", "往后数", "往远了看"],
    "看得出来": ["看得明白", "一眼能看明白", "不难看出"],
    "说实话": ["老实讲", "讲真", "掏心窝子说"],
    "归根结底": ["追根溯源", "说到根上", "往深了挖"],
    "说到底": ["说白了", "往白了说", "一句话讲"],
    "这代表着": ["这意味著", "这等于说", "这其实是在说"],
    "随着": ["伴随", "乘着", "借着"]
  };

  function deduplicateParagraphStarts(text) {
    var count = 0;
    var lines = text.split(String.fromCharCode(10));
    var rotationIndex = {};
    var starterCounts = {};
    // First pass: count all paragraph starters
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line || line.length < 3) continue;
      for (var key in PARAGRAPH_STARTER_ROTATION) {
        if (line.startsWith(key)) {
          starterCounts[key] = (starterCounts[key] || 0) + 1;
          break;
        }
      }
    }
    // Second pass: rotate starters that appear 3+ times total
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line || line.length < 3) continue;
      var matchedStarter = null;
      for (var key in PARAGRAPH_STARTER_ROTATION) {
        if (line.startsWith(key)) { matchedStarter = key; break; }
      }
      if (!matchedStarter) continue;
      if ((starterCounts[matchedStarter] || 0) >= 3) {
        var ri = rotationIndex[matchedStarter] || 0;
        if (ri > 0) {
          var rotations = PARAGRAPH_STARTER_ROTATION[matchedStarter];
          var replacement = rotations[(ri - 1) % rotations.length];
          lines[i] = lines[i].replace(matchedStarter, replacement);
          count++;
        }
        rotationIndex[matchedStarter] = ri + 1;
      }
    }
    return { text: lines.join(String.fromCharCode(10)), count: count };
}
  // 规则7：段落内连接词序列打散（自动执行）
  // 朱雀验证发现：段落内3+个连接词形成序列（一开始-接着-另外-到头来）被判AI
  // 解决方案：检测到序列时，将第2个及以后的连接词替换为逗号或自然衔接
  var INTRA_CONNECTORS = [
    "一开始", "接着", "另外", "到头来", "而且", "然后", "还有",
    "首先", "其次", "最后", "此外", "与此同时", "不仅如此",
    "归根结底", "说到底", "这么一来"
  ];

  function breakConnectorSequences(text) {
    var count = 0;
    var lines = text.split(String.fromCharCode(10));
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!line || line.trim().length < 20) continue;
      // Count connectors in this paragraph
      var connectorPositions = [];
      for (var ci = 0; ci < INTRA_CONNECTORS.length; ci++) {
        var conn = INTRA_CONNECTORS[ci];
        var idx = 0;
        while ((idx = line.indexOf(conn, idx)) !== -1) {
          connectorPositions.push({ word: conn, pos: idx });
          idx += conn.length;
        }
      }
      // Sort by position
      connectorPositions.sort(function(a, b) { return a.pos - b.pos; });
      // If 3+ connectors in one paragraph, remove the 2nd and 3rd
      if (connectorPositions.length >= 3) {
        // Process from end to start to preserve positions
        for (var pi = connectorPositions.length - 2; pi >= 1; pi--) {
          var cp = connectorPositions[pi];
          // Replace connector + following comma with just comma
          var afterPos = cp.pos + cp.word.length;
          var afterChar = line.substring(afterPos, afterPos + 1);
          if (afterChar === String.fromCharCode(0xff0c) || afterChar === ",") {
            line = line.substring(0, cp.pos) + line.substring(afterPos + 1);
          } else {
            line = line.substring(0, cp.pos) + line.substring(afterPos);
          }
          count++;
        }
        lines[i] = line;
      }
    }
    return { text: lines.join(String.fromCharCode(10)), count: count };
  }


  // 规则5：空泛开头检测（检测建议）
  var EMPTY_OPENINGS = [
    /^\u968f\u7740[^\u3002]{5,30}\u7684(\u4e0d\u65ad|\u5feb\u901f|\u6301\u7eed|\u98de\u901f|\u8fc5\u901f)?\u53d1\u5c55[\uff0c,]/,
    /^\u5728\u5f53\u4eca[^\u3002]{5,20}\u7684\u65f6\u4ee3[\uff0c,]/,
    /^\u8fd1\u5e74\u6765[^\u3002]{5,30}(\u4e0d\u65ad|\u5feb\u901f|\u6301\u7eed)?(\u8fdb\u6b65|\u53d1\u5c55|\u589e\u957f)[\uff0c,]/,
    /^\u4f17\u6240\u5468\u77e5[\uff0c,]/,
    /^\u4e0d\u53ef\u5426\u8ba4[\uff0c,]/,
    /^\u968f\u7740(\u4e92\u8054\u7f51|\u4eba\u5de5\u667a\u80fd|\u79d1\u6280|\u793e\u4f1a|\u65f6\u4ee3)[^\u3002]{5,30}[\uff0c,]/,
    /^\u5728(\u5f53\u4eca|\u5f53\u524d|\u8fd9\u4e2a)[^\u3002]{5,20}(\u793e\u4f1a|\u65f6\u4ee3|\u80cc\u666f)[^\u3002]{0,10}[\uff0c,]/,
    /^\u968f\u7740(\u4fe1\u606f|\u6570\u5b57|\u4e92\u8054\u7f51)\u65f6\u4ee3[^\u3002]{3,20}[\uff0c,]/,
    /^\u5f53\u4eca\u793e\u4f1a[\uff0c,]/,
    /^\u5728\u73b0\u4ee3\u793e\u4f1a[\uff0c,]/,
    /^随着(互联网|人工智能|科技|技术|时代|社会).{0,8}(不断发展|快速发展|不断进步|飞速发展|不断成熟)[，,]/,
    /^在当今(社会|信息|时代)[^。]{3,15}[，,]/,
    /^在当前(市场|社会|时代|环境)[^。]{3,15}[，,]/,
    /^近年来[，,][^。]{5,20}(不断|快速|持续)(发展|进步|增长)[，,]/,
    /^随着(信息|数字|互联网)时代[^。]{3,15}[，,]/,
    /^今天的社会[，,]/,
    /^在这个时代[，,]/,
  ];

  function detectEmptyOpening(text) {
    var firstPara = text.trim().split(/\n/)[0];
    for (var i = 0; i < EMPTY_OPENINGS.length; i++) {
      if (EMPTY_OPENINGS[i].test(firstPara)) return { detected: true, pattern: i, text: firstPara.substring(0, 60) };
    }
    return { detected: false };
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

  // 规则7：连接词序列检测（检测建议）
  var CONNECTOR_SEQUENCE = [
    ['\u9996\u5148', '\u5176\u6b21', '\u6b64\u5916', '\u6700\u540e'],
    ['\u9996\u5148', '\u5176\u6b21', '\u6700\u540e'],
    ['\u7b2c\u4e00', '\u7b2c\u4e8c', '\u7b2c\u4e09'],
    ['\u5176\u4e00', '\u5176\u4e8c', '\u5176\u4e09'],
    ['\u4e00\u65b9\u9762', '\u53e6\u4e00\u65b9\u9762'],
    ['\u9996\u5148', '\u7136\u540e', '\u6700\u540e'],
    ['\u7b2c\u4e00\u6b65', '\u7b2c\u4e8c\u6b65', '\u7b2c\u4e09\u6b65'],
    ['\u9996\u5148', '\u5176\u6b21', '\u53e6\u5916', '\u6700\u540e'],
    ['\u9996\u5148', '\u5176\u6b21', '\u800c\u4e14', '\u6700\u540e'],
  ];

  function detectConnectorPattern(text) {
    var detections = [];
    for (var i = 0; i < CONNECTOR_SEQUENCE.length; i++) {
      var seq = CONNECTOR_SEQUENCE[i];
      var allFound = true;
      var positions = [];
      for (var j = 0; j < seq.length; j++) {
        var idx = text.indexOf(seq[j]);
        if (idx === -1) { allFound = false; break; }
        positions.push(idx);
      }
      if (allFound) {
        var inOrder = true;
        for (var k = 1; k < positions.length; k++) {
          if (positions[k] <= positions[k-1]) inOrder = false;
          if (positions[k] - positions[k-1] > 1000) inOrder = false;
        }
        if (inOrder) detections.push({ pattern: seq.join('->'), positions: positions });
      }
    }
    return detections;
  }

  // 规则8：信息均匀度检测（检测建议）
  function detectInfoEvenness(text) {
    var paragraphs = text.split(/\n/).filter(function(p) { return p.trim().length > 20; });
    if (paragraphs.length < 5) return [];
    var detections = [];
    for (var i = 0; i <= paragraphs.length - 5; i++) {
      var lens = [];
      for (var j = 0; j < 5; j++) lens.push(paragraphs[i+j].trim().length);
      var maxL = Math.max.apply(null, lens);
      var minL = Math.min.apply(null, lens);
      if (minL === 0) continue;
      var ratio = (maxL - minL) / minL;
      if (ratio < 0.2) {
        detections.push({ startPara: i, lengths: lens, avgLen: Math.round(lens.reduce(function(a,b){return a+b;},0)/5) });
      }
    }
    return detections;
  }

  // 规则9：总分总结构检测（检测建议）
  function detectUniformStructure(text) {
    var paragraphs = text.split(/\n/).filter(function(p) { return p.trim().length > 30; });
    if (paragraphs.length < 3) return { detected: false };
    var summaryCount = 0;
    for (var i = 0; i < paragraphs.length; i++) {
      var para = paragraphs[i].trim();
      for (var j = 0; j < SUMMARY_PATTERNS.length; j++) {
        if (SUMMARY_PATTERNS[j].test(para)) { summaryCount++; break; }
      }
    }
    if (summaryCount >= 3 && summaryCount / paragraphs.length > 0.5) {
      return { detected: true, totalParas: paragraphs.length, summaryParas: summaryCount, ratio: Math.round(summaryCount / paragraphs.length * 100) / 100 };
    }
    return { detected: false };
  }

  // 规则10：通用正确观点检测（检测建议）
  var GENERIC_OPINIONS = [
    /\u6211\u4eec\u5e94\u8be5\u5408\u7406\u4f7f\u7528/,
    /\u53ea\u6709\u4e0d\u65ad\u5b66\u4e60/,
    /\u8981\u4e0d\u65ad\u63d0\u5347\u81ea\u5df1/,
    /\u5e94\u8be5\u9009\u62e9\u9002\u5408\u81ea\u5df1\u7684\u65b9\u6cd5/,
    /\u9700\u8981\u4fdd\u6301\u72ec\u7acb\u601d\u8003/,
    /\u575a\u6301\u975e\u5e38\u91cd\u8981/,
    /\u5728\u63d0\u9ad8\u6548\u7387\u7684\u540c\u65f6/,
    /\u4e5f\u8981\u4fdd\u6301\u72ec\u7acb\u601d\u8003/,
    /\u53ea\u6709[^\u3002]{3,15}\u624d\u80fd\u9002\u5e94\u65f6\u4ee3/,
    /\u6211\u4eec\u5e94\u8be5[^\u3002]{5,20}\u7684\u540c\u65f6/,
  ];

  function detectGenericOpinions(text) {
    var detections = [];
    for (var i = 0; i < GENERIC_OPINIONS.length; i++) {
      var matches = text.match(new RegExp(GENERIC_OPINIONS[i].source, 'g'));
      if (matches) detections.push({ pattern: matches[0], count: matches.length });
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

  // 规则12：过度正式表达检测（检测建议，新增）
  var FORMAL_PATTERNS = [
    /\u8be5\u65b9\u6cd5\u5177\u6709.{1,15}\u7279\u70b9/,
    /\u8be5\u65b9\u6cd5\u5177\u6709.{1,15}\u4f18\u52bf/,
    /\u672c.{1,4}\u5177\u6709.{1,10}\u610f\u4e49/,
    /\u5177\u6709.{1,8}\u7684\u524d\u666f/,
    /\u5177\u6709.{1,8}\u7684\u6f5c\u529b/,
    /\u5177\u6709.{1,8}\u7684\u4f18\u52bf/,
    /\u5bf9\u4e8e.{1,6}\u800c\u8a00[\uff0c,]/,
    /\u5728.{1,6}\u65b9\u9762[\uff0c,]/,
    /\u5728.{1,6}\u9886\u57df[\uff0c,]/,
    /\u5728.{1,6}\u8fc7\u7a0b\u4e2d[\uff0c,]/,
  ];

  function detectFormalExpressions(text) {
    var detections = [];
    for (var i = 0; i < FORMAL_PATTERNS.length; i++) {
      var matches = text.match(new RegExp(FORMAL_PATTERNS[i].source, 'g'));
      if (matches) detections.push({ pattern: matches[0], count: matches.length });
    }
    return detections;
  }

  // 规则13：列举过完整检测（检测建议，新增）
 function detectOverCompleteListing(text) {
   var paragraphs = text.split(/\n/).filter(function(p) { return p.trim().length > 20; });
   if (paragraphs.length < 3) return { detected: false };
    var listCount = 0;
    var listPatterns = [
      /(\u4f18\u70b9|\u4f18\u52bf|\u597d\u5904|\u7279\u70b9|\u4f5c\u7528)\u5305\u62ec/,
      /(\u4f18\u70b9|\u4f18\u52bf|\u597d\u5904|\u7279\u70b9|\u4f5c\u7528)\u6709/,
      /(\u7f3a\u70b9|\u4e0d\u8db3|\u95ee\u9898)\u5305\u62ec/,
      /(\u7f3a\u70b9|\u4e0d\u8db3|\u95ee\u9898)\u6709/,
      /\u4e00\u65b9\u9762.*\u53e6\u4e00\u65b9\u9762/,
      /\u5176\u4e00.*\u5176\u4e8c.*\u5176\u4e09/,
      /\u7b2c\u4e00.*\u7b2c\u4e8c.*\u7b2c\u4e09/,
    ];
    for (var i = 0; i < paragraphs.length; i++) {
      for (var j = 0; j < listPatterns.length; j++) {
        if (listPatterns[j].test(paragraphs[i])) { listCount++; break; }
      }
    }
    if (listCount >= 3 && listCount / paragraphs.length > 0.4) {
      return { detected: true, totalParas: paragraphs.length, listParas: listCount, ratio: Math.round(listCount / paragraphs.length * 100) / 100 };
    }
    return { detected: false };
  }


  // === 小说正文专用规则 (朱雀验证: 100% -> 12.9%) ===
  // 规则N1: 去掉句首"他" (验证: 100%->78.5%)
  function dropSentenceStartPronoun(text) {
    var count = 0;
    var r = text.replace(new RegExp("(^|[\\u3002\\uff01\\uff1f\\n])\\u4ed6", "g"), function(m, pre) { count++; return pre; });
    r = r.replace(new RegExp("(^|[\\u3002\\uff01\\uff1f\\n])\\u5979", "g"), function(m, pre) { count++; return pre; });
    return { text: r, count: count };
  }

  // 规则N2: 合并短句 (验证: 78.5%->73.8%)
  function mergeShortSentences(text) {
    var count = 0;
    var period = String.fromCharCode(0x3002);
    var excl = String.fromCharCode(0xff01);
    var quest = String.fromCharCode(0xff1f);
    var comma = String.fromCharCode(0xff0c);
    // 按段落处理，保留换行符
    var paragraphs = text.split(/\n\n+/);
    var processedParas = paragraphs.map(function(para) {
      var sents = [];
      var cur = "";
      for (var i = 0; i < para.length; i++) {
        cur += para[i];
        if (para[i] === period || para[i] === excl || para[i] === quest) { sents.push(cur); cur = ""; }
      }
      if (cur.trim()) sents.push(cur);
      var merged = [];
      for (var i = 0; i < sents.length; i++) {
        var s = sents[i].trim();
        var isShort = s.length < 25 && s.length > 3;
        if (isShort && merged.length > 0) {
          var prev = merged[merged.length - 1];
          var prevTrimmed = prev;
          var lastChar = prevTrimmed.charAt(prevTrimmed.length - 1);
          if (lastChar === period || lastChar === excl || lastChar === quest) {
            prevTrimmed = prevTrimmed.substring(0, prevTrimmed.length - 1);
          }
          var connectors = [comma, String.fromCharCode(0x2014,0x2014), String.fromCharCode(0xff1b)];
          var connIdx = count % 3;
          merged[merged.length - 1] = prevTrimmed + connectors[connIdx] + s;
          count++;
        } else {
          merged.push(sents[i]);
        }
      }
      return merged.join("");
    });
    return { text: processedParas.join("\n\n"), count: count };
  }

  // 规则N3: 删除感官描写子句 (验证: 73.8%->28.2%)
  var SENSORY_WORDS_N = ["温度","冷","热","凉","暖","烫","冰","潮湿","干燥","粗糙","光滑","刺","震","崝","沙沙","吱","味","气","荧光","触","摩擦","颤","麻","酸","疼","痛","紧","沉","轻","重","软","硬","光","蓝","白","绿","暗","亮"];
  function reduceSensoryDensity(text) {
    var count = 0;
    var r = text;
    var comma = String.fromCharCode(0xff0c);
    var period = String.fromCharCode(0x3002);
    var excl = String.fromCharCode(0xff01);
    var quest = String.fromCharCode(0xff1f);
    var nl = String.fromCharCode(10);
    var termClass = comma + period + excl + quest + nl;
    var totalSensory = 0;
    for (var wi = 0; wi < SENSORY_WORDS_N.length; wi++) {
      var wc = (text.match(new RegExp(SENSORY_WORDS_N[wi], "g")) || []).length;
      totalSensory += wc;
    }
    var density = text.length > 0 ? totalSensory / text.length * 100 : 0;
    if (density < 0.8) return { text: r, count: 0 };
    for (var wi = 0; wi < SENSORY_WORDS_N.length; wi++) {
     var w = SENSORY_WORDS_N[wi];
     var re = new RegExp(comma + "[^" + termClass + "]*" + w + "[^" + termClass + "]*(?=[" + termClass + "])", "g");
     // V54: compress instead of delete - keep sensory word, remove modifiers
      // V54 FINAL: compress every 3rd sensory clause - comma + 2 chars context (sweet spot, 40.2% AI)
      r = r.replace(re, function(m) { count++; if (count % 3 === 0) { var idx = m.indexOf(w); var start = Math.max(1, idx - 2); var core = m.substring(start, idx + w.length); return comma + core; } return m; });
    }
    return { text: r, count: count };
  }

  // 规则N4: 去掉句首人名 (验证: 28.2%->12.9%)
  function dropSentenceStartNames(text) {
    var count = 0;
    var period = String.fromCharCode(0x3002);
    var excl = String.fromCharCode(0xff01);
    var quest = String.fromCharCode(0xff1f);
    var nl = String.fromCharCode(10);
    var preClass = period + excl + quest + nl;
    var nameFreq = {};
    // Scan 2-char names: check 3rd char as verb
    var scan2 = new RegExp("(^|[" + preClass + "])([\\u4e00-\\u9fff]{2})", "g");
    var m2;
    while ((m2 = scan2.exec(text)) !== null) {
      var c2 = m2[2];
      // Skip function words
      if (c2 === "\u8fd9\u662f" || c2 === "\u4e0d\u662f" || c2 === "\u4f46\u662f" || c2 === "\u56e0\u4e3a" || c2 === "\u6240\u4ee5" || c2 === "\u5982\u679c" || c2 === "\u867d\u7136" || c2 === "\u53ea\u662f" || c2 === "\u8fd8\u662f" || c2 === "\u4e0d\u8fc7" || c2 === "\u4e8e\u662f" || c2 === "\u4e5f\u662f" || c2 === "\u4fbf\u662f" || c2 === "\u6b63\u662f" || c2 === "\u8fd9\u4e2a" || c2 === "\u90a3\u4e2a" || c2 === "\u4e00\u4e2a" || c2 === "\u4ed6\u7684" || c2 === "\u5979\u7684" || c2 === "\u6211\u7684" || c2 === "\u8fd9\u6837" || c2 === "\u90a3\u6837" || c2 === "\u6ca1\u6709" || c2 === "\u5df2\u7ecf" || c2 === "\u6b63\u5728" || c2 === "\u53ef\u4ee5" || c2 === "\u80fd\u591f" || c2 === "\u5e94\u8be5" || c2 === "\u4e0d\u80fd" || c2 === "\u4e0d\u4f1a" || c2 === "\u5c31\u662f" || c2 === "\u90fd\u662f" || c2 === "\u8fd8\u6709" || c2 === "\u53ea\u6709" || c2 === "\u53c8\u6709" || c2 === "\u6ca1\u9519" || c2 === "\u4e0d\u9519" || c2 === "\u4e0d\u597d" || c2 === "\u5f88\u597d" || c2 === "\u592a\u591a" || c2 === "\u5176\u4e2d" || c2 === "\u5176\u4ed6" || c2 === "\u5176\u5b9e" || c2 === "\u5176\u6b21" || c2 === "\u4e0d\u4ec5" || c2 === "\u660e\u767d" || c2 === "\u6e05\u695a" || c2 === "\u4e86\u89e3" || c2 === "\u719f\u6089" || c2 === "\u77e5\u9053" || c2 === "\u8bb0\u5f97" || c2 === "\u89c9\u5f97" || c2 === "\u60f3\u8d77" || c2 === "\u53d1\u73b0" || c2 === "\u53d1\u751f" || c2 === "\u51fa\u73b0" || c2 === "\u611f\u89c9" || c2 === "\u8ba4\u4e3a" || c2 === "\u4ee5\u4e3a" || c2 === "\u770b\u7740" || c2 === "\u542c\u7740" || c2 === "\u60f3\u7740" || c2 === "\u8bb0\u7740" || c2 === "\u8bf4\u7740" || c2 === "\u8fd9\u91cc" || c2 === "\u90a3\u91cc" || c2 === "\u54ea\u91cc" || c2 === "\u4ec0\u4e48" || c2 === "\u600e\u4e48" || c2 === "\u8fd9\u4e48" || c2 === "\u90a3\u4e48" || c2 === "\u591a\u4e48" || c2 === "\u5c11\u4e48" || c2 === "\u5982\u4f55" || c2 === "\u4e0d\u5149" || c2 === "\u4e0d\u5bf9" || c2 === "\u4e0d\u8981" || c2 === "\u4e0d\u60f3" || c2 === "\u4e0d\u8bf4" || c2 === "\u4e0d\u505a" || c2 === "\u4e0d\u77e5" || c2 === "\u4e0d\u89c9" || c2 === "\u4e0d\u770b" || c2 === "\u4e0d\u7406" || c2 === "\u4e0d\u7ba1" || c2 === "\u4e0d\u987e" || c2 === "\u4e0d\u95ee" || c2 === "\u8bf4\u7740" || c2 === "\u8bf4\u9053" || c2 === "\u8bf4\u4e86" || c2 === "\u8bf4\u5b8c" || c2 === "\u8bf4\u8bdd" || c2 === "\u8bf4\u8fc7" || c2 === "\u4e00\u5207" || c2 === "\u4e00\u573a" || c2 === "\u4e00\u6b21" || c2 === "\u4e0a\u9762" || c2 === "\u4e0b\u9762" || c2 === "\u91cc\u9762" || c2 === "\u5916\u9762" || c2 === "\u524d\u9762" || c2 === "\u540e\u9762" || c2 === "\u5de6\u9762" || c2 === "\u53f3\u9762" || c2 === "\u4e0a\u6b21" || c2 === "\u4e0b\u6b21" || c2 === "\u4e0a\u8fb9" || c2 === "\u4e0b\u8fb9" || c2 === "\u91cc\u8fb9" || c2 === "\u5916\u8fb9" || c2 === "\u524d\u8fb9" || c2 === "\u540e\u8fb9" || c2 === "\u4f60\u7684" || c2 === "\u6211\u7684" || c2 === "\u4ed6\u7684" || c2 === "\u5979\u7684") continue;
      // Check if 3rd char is an action verb
      var after2 = text.substring(m2.index + m2[0].length, m2.index + m2[0].length + 1);
      var verbs = "\u8bf4\u7ad9\u5750\u8d70\u63a8\u770b\u62ff\u653e\u8f6c\u542c\u70b9\u7b11\u62c9\u62cd\u6253\u51fa\u8fdb\u624b\u8138\u773c\u5fc3\u5934\u811a\u56de\u8d77\u505c\u8eab\u8116\u80a9\u660e\u77e5\u89c9\u60f3\u8bb0\u53eb\u5546\u95ee\u7b54\u8bb8\u8ba9\u9762\u542b\u5e26\u62bd\u62b5\u6309\u6293\u63e1\u9760\u4f0f\u4f4e\u62ac\u4fef\u63a2\u6478\u6368\u63ed\u6362\u7a7f\u8131\u6234\u6298\u5f2f\u8eba\u8dd1\u51b2\u8df3\u9000\u8eb2\u95ea\u8dea\u8e72\u6302\u95fb\u89c6\u77a9\u8e0f\u8e29\u7b49\u558a\u9a82\u54ed\u53f9\u5435\u5410\u547c\u5438\u54bd\u7728\u5f20\u5408\u54c5\u5634\u54fc\u7b2c\u4e00\u6709\u6240\u53ea\u624d\u5c31\u4f60\u6211\u4ed6\u5979\u4e0a\u4e0b\u91cc\u5916\u524d\u540e\u5de6\u53f3\u4e0d\u6ca1\u5df2\u6b63\u7a81\u5ffd\u4fbf\u5c31\u90fd\u8fd8\u53ea\u53c8\u6ca1\u9519\u4e0d\u5f88\u592a\u5176\u4e0d";
      var isAct2 = false;
      for (var v = 0; v < verbs.length; v++) { if (after2 === verbs.charAt(v)) { isAct2 = true; break; } }
      if (isAct2) { nameFreq[c2] = (nameFreq[c2] || 0) + 1; }
      // Also check 3-char names
      var c3 = text.substring(m2.index + m2[1].length, m2.index + m2[1].length + 3);
      if (c3.length === 3 && c3 !== c2 + text.charAt(m2.index + m2[0].length)) {
        var isStop3 = false;
        var sw3 = c3.substring(0,2);
        // Reuse stop check
        var after3 = text.substring(m2.index + m2[1].length + 3, m2.index + m2[1].length + 4);
        var isAct3 = false;
        for (var v3 = 0; v3 < verbs.length; v3++) { if (after3 === verbs.charAt(v3)) { isAct3 = true; break; } }
        if (isAct3) {
          // Make sure first 2 chars not in stop list
          var first2 = c3.substring(0,2);
          if (first2 !== "\u8fd9\u662f" && first2 !== "\u4e0d\u662f" && first2 !== "\u4f46\u662f" && first2 !== "\u56e0\u4e3a" && first2 !== "\u5982\u679c" && first2 !== "\u867d\u7136" && first2 !== "\u6240\u4ee5") {
            nameFreq[c3] = (nameFreq[c3] || 0) + 1;
          }
        }
      }
    }
    var detected = [];
    for (var name in nameFreq) { if (nameFreq[name] >= 3) detected.push(name); }
    if (detected.length < 3) { return { text: text, count: 0 }; }
    var escaped = detected.map(function(n) {
      var r = "";
      for (var ci = 0; ci < n.length; ci++) {
        var c = n.charAt(ci);
        if (".*+?^$()|[]\\".indexOf(c) !== -1) r += "\\";
        r += c;
      }
      return r;
    }).join("|");
    var nameRe = new RegExp("(^|[" + preClass + "])(" + escaped + ")", "g");
    var nameCount = 0;
    var r = text.replace(nameRe, function(m, pre, name) {
      nameCount++;
      if (nameCount % 3 !== 0) { count++; return pre; }
      return m;
    });
    return { text: r, count: count };
  }
  // 规则N5: 替换模板化开头
  var TEMPLATE_OPENING_RE = new RegExp("^[\u4e00-\u9fff]{0,4}(\u7ad9\u5728|\u5750\u5728|\u9762\u524d\u662f|\u8d70\u8fdb|\u63a8\u5f00|\u6765\u5230|\u8d70\u5411)")
  function replaceTemplateOpening(text) {
    var lines = text.split(String.fromCharCode(10));
    var count = 0;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (line.length > 20 && TEMPLATE_OPENING_RE.test(line)) {
        lines[i] = lines[i].replace(/^[\u4e00-\u9fff]{0,4}(\u7ad9\u5728|\u5750\u5728|\u9762\u524d\u662f|\u8d70\u8fdb|\u63a8\u5f00|\u6765\u5230|\u8d70\u5411)/, function(m, action) { return m; });
        count++;
        break;
      }
    }
    return { text: lines.join(String.fromCharCode(10)), count: count };
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


  // 规则N7: 段首空泛开头自动删除 (方法论规则1: 直接进入主题)
  function deleteEmptyOpenings(text) {
    var count = 0;
    var lines = text.split(String.fromCharCode(10));
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (line.length < 10) continue;
      for (var j = 0; j < EMPTY_OPENINGS.length; j++) {
        var match = line.match(EMPTY_OPENINGS[j]);
        if (match) {
          var matched = match[0];
          // Delete the matched opening + following comma/space
          lines[i] = lines[i].replace(matched, "");
          // Remove leading comma if any
          lines[i] = lines[i].replace(/^[，,s]+/, "");
          count++;
          break;
        }
      }
    }
    return { text: lines.join(String.fromCharCode(10)), count: count };
  }


  // 规则N8: 短段落合并 (方法论规则5: 打破信息均匀)
  function mergeShortParagraphs(text) {
    var count = 0;
    var lines = text.split(String.fromCharCode(10)).filter(function(l) { return l.trim().length > 0; });
    if (lines.length < 3) return { text: text, count: 0 };
    var merged = [lines[0]];
    for (var i = 1; i < lines.length; i++) {
      var prev = merged[merged.length - 1];
      var curr = lines[i].trim();
      if (prev.trim().length < 80 && curr.length < 80) {
        var sep = "";
        if (prev.trim().match(/[\u3002\uff01\uff1f]$/)) {
          sep = "";
        } else if (prev.trim().match(/[\uff0c,]$/)) {
          merged[merged.length - 1] = prev.trim().replace(/[\uff0c,]$/, "\u3002");
          sep = "";
        } else {
          sep = "\u3002";
        }
        merged[merged.length - 1] = merged[merged.length - 1] + sep + curr;
        count++;
      } else {
        merged.push(lines[i]);
      }
    }
    return { text: merged.join(String.fromCharCode(10)), count: count };
  }


  // 规则N9: 列举模式打散 (方法论规则6: 信息顺序比连接词更重要)
  function shuffleListingPattern(text) {
    var count = 0;
    var lines = text.split(String.fromCharCode(10));
    for (var li = 0; li < lines.length; li++) {
      var line = lines[li];
      // Detect listing pattern: 第一...第二...第三... or 首先...其次...最后...
      var listMatch = line.match(/[第一二三四五][^。！？]{5,50}[。！？]/g);
      if (listMatch && listMatch.length >= 3) {
        // Remove the listing prefixes and join with natural connectors
        var items = listMatch.map(function(m) {
          return m.replace(/^第[一二三四五]/, "").replace(/^[，,]/, "");
        });
        // Shuffle items (keep first one in place)
        for (var si = items.length - 1; si > 1; si--) {
          var sj = 1 + Math.floor(Math.random() * (si - 1));
          var tmp = items[si]; items[si] = items[sj]; items[sj] = tmp;
        }
        var rebuilt = items.join("，");
        lines[li] = line.replace(listMatch.join(""), rebuilt);
        count++;
      }
    }
    return { text: lines.join(String.fromCharCode(10)), count: count };
  }

  // 规则N10: 段落长度趋同修复 (方法论规则5+8: 打破信息均匀+段落结构变化)
  function breakParagraphUniformity(text) {
    var count = 0;
    var nl = String.fromCharCode(10);
    var period = String.fromCharCode(0x3002);
    var lines = text.split(nl);
    if (lines.length < 4) return { text: text, count: 0 };
    var result = [];
    for (var i = 0; i < lines.length; i++) {
      var para = lines[i];
      var pLen = para.trim().length;
      if (pLen > 300) {
        var midPoint = Math.floor(pLen / 2);
        var bestSplit = -1;
        for (var ci = midPoint; ci < pLen - 30; ci++) {
          if (para[ci] === period) { bestSplit = ci + 1; break; }
        }
        if (bestSplit < 0) {
          for (var ci2 = midPoint - 1; ci2 > 30; ci2--) {
            if (para[ci2] === period) { bestSplit = ci2 + 1; break; }
          }
        }
        if (bestSplit > 0) {
          result.push(para.substring(0, bestSplit));
          result.push(para.substring(bestSplit));
          count++;
          continue;
        }
      }
      result.push(para);
    }
    return { text: result.join(nl), count: count };
  }

  // 规则N11: 句长趋同修复 (方法论规则2: 连续三句差异<30%需变化)
  function fixUniformSentenceLength(text) {
    var count = 0;
    var period = String.fromCharCode(0x3002);
    var comma = String.fromCharCode(0xff0c);
    var excl = String.fromCharCode(0xff01);
    var quest = String.fromCharCode(0xff1f);
    var termClass = period + excl + quest;
    var nl = String.fromCharCode(10);
    var lines = text.split(nl);
    for (var li = 0; li < lines.length; li++) {
      var line = lines[li];
      var sents = [];
      var cur = '';
      for (var ci = 0; ci < line.length; ci++) {
        cur += line[ci];
        if (termClass.indexOf(line[ci]) !== -1) { sents.push(cur); cur = ''; }
      }
      if (cur.trim()) sents.push(cur);
      if (sents.length < 5) continue;
      var modified = false;
      for (var si = 0; si <= sents.length - 3; si++) {
        if (modified) break;
        var s1 = sents[si].trim().length;
        var s2 = sents[si+1].trim().length;
        var s3 = sents[si+2].trim().length;
        var maxL = Math.max(s1, s2, s3);
        var minL = Math.min(s1, s2, s3);
        if (minL === 0) continue;
        var ratio = (maxL - minL) / minL;
        if (ratio < 0.25 && maxL >= 12 && minL >= 8) {
          var s2text = sents[si+1];
          var lastChar = s2text.charAt(s2text.length - 1);
          if (termClass.indexOf(lastChar) !== -1 && lastChar === period) {
            var cutPos = Math.floor(s2text.length * 0.6);
            var cutChar = '';
            for (var cc = cutPos; cc < s2text.length - 2; cc++) {
              if (s2text[cc] === comma) { cutChar = cc; break; }
            }
            if (cutChar !== '') {
              sents[si+1] = s2text.substring(0, cutChar + 1) + period + s2text.substring(cutChar + 1);
              count++;
              modified = true;
            }
          }
        }
      }
      if (modified) lines[li] = sents.join('');
    }
    return { text: lines.join(nl), count: count };
  }
  // 规则N13: 句子删除 (方法论: 少一点标准答案, 允许不完整)
  function deleteSentences(text) {
    var count = 0;
    var period = String.fromCharCode(0x3002);
    var excl = String.fromCharCode(0xff01);
    var quest = String.fromCharCode(0xff1f);
    var nl = String.fromCharCode(10);
    var lines = text.split(nl);
    for (var li = 0; li < lines.length; li++) {
      var para = lines[li];
      var sents = [];
      var cur = "";
      for (var ci = 0; ci < para.length; ci++) {
        cur += para[ci];
        if (para[ci] === period || para[ci] === excl || para[ci] === quest) {
          sents.push(cur);
          cur = "";
        }
      }
      if (cur.trim()) sents.push(cur);
      if (sents.length < 4) continue;
      var newSents = [];
      for (var si = 0; si < sents.length; si++) {
        var s = sents[si].trim();
        if (si > 0 && si % 7 === 0 && s.length > 8 && s.length < 40) {
          if (!s.includes(String.fromCharCode(0x201c)) && !s.includes(String.fromCharCode(0x201d))) {
            count++;
            continue;
          }
        }
        newSents.push(sents[si]);
      }
      lines[li] = newSents.join("");
    }
    return { text: lines.join(nl), count: count };
  }

  // 规则N14: 激进断句 (方法论: 句长有快有慢, 短句制造节奏)
  function aggressiveSplitSentences(text) {
    var count = 0;
    var comma = String.fromCharCode(0xff0c);
    var period = String.fromCharCode(0x3002);
    var nl = String.fromCharCode(10);
    var lines = text.split(nl);
    for (var li = 0; li < lines.length; li++) {
      var para = lines[li];
      var sents = [];
      var cur = "";
      for (var ci = 0; ci < para.length; ci++) {
        cur += para[ci];
        if (para[ci] === period) {
          sents.push({ text: cur, end: period });
          cur = "";
        }
      }
      if (cur.trim()) sents.push({ text: cur, end: period });
      var newPara = "";
      for (var si = 0; si < sents.length; si++) {
        var s = sents[si].text;
        if (s.length > 35 && s.split(comma).length >= 3) {
          var parts = s.split(comma);
          if (parts.length >= 3) {
            var midPoint = Math.floor(parts.length / 2);
            var firstHalf = parts.slice(0, midPoint + 1).join(comma);
            var secondHalf = parts.slice(midPoint + 1).join(comma);
            if (firstHalf.trim().length > 10 && secondHalf.trim().length > 10) {
              newPara += firstHalf + period + secondHalf + sents[si].end;
              count++;
              continue;
            }
          }
        }
        newPara += s;
      }
      lines[li] = newPara;
    }
    return { text: lines.join(nl), count: count };
  }


  // 规则N12: 对白完整性削减 (方法论: AI对白过于完整)
  function splitLongDialogue(text) {
    var count = 0;
    var lq = String.fromCharCode(0x201c);
    var rq = String.fromCharCode(0x201d);
    var period = String.fromCharCode(0x3002);
    var comma = String.fromCharCode(0xff0c);
    var result = text;
    // Find long dialogue segments
    var re = new RegExp(lq + "([^" + rq + "]{80,})" + rq, "g");
    result = result.replace(re, function(m, content) {
      // Find a natural break point (after a comma or period in the middle)
      var mid = Math.floor(content.length / 2);
      var breakPoint = -1;
      for (var bi = mid; bi < content.length - 10; bi++) {
        if (content[bi] === comma || content[bi] === period) {
          breakPoint = bi + 1;
          break;
        }
      }
      if (breakPoint === -1) {
        for (var bi = mid - 1; bi > 10; bi--) {
          if (content[bi] === comma || content[bi] === period) {
            breakPoint = bi + 1;
            break;
          }
        }
      }
      if (breakPoint === -1) return m;
      var part1 = content.substring(0, breakPoint);
      var part2 = content.substring(breakPoint);
      count++;
      return lq + part1 + rq + String.fromCharCode(10) + String.fromCharCode(10) + "停了一下。" + String.fromCharCode(10) + String.fromCharCode(10) + lq + part2 + rq;
    });
    return { text: result, count: count };
  }



  // N23: 段落内句子智能重排 (改法: 改变信息顺序, 不增删文字)
  // 方法论规则6: 信息顺序比连接词更重要; 规则8: 段落结构不要统一
  function reorderSentencesInParagraph(text) {
    var count = 0;
    var nl = String.fromCharCode(10);
    var period = String.fromCharCode(0x3002);
    var excl = String.fromCharCode(0xff01);
    var quest = String.fromCharCode(0xff1f);
    var lq = String.fromCharCode(0x201c);
    var rq = String.fromCharCode(0x201d);
    var termClass = period + excl + quest;
    var lines = text.split(nl);
    var qualifyingCount = 0;
    for (var li = 0; li < lines.length; li++) {
      var para = lines[li];
      if (para.trim().length < 40) continue;
      if (para.indexOf(lq) >= 0 || para.indexOf(rq) >= 0) continue;
      var sents = [];
      var cur = '';
      for (var ci = 0; ci < para.length; ci++) {
        cur += para[ci];
        if (termClass.indexOf(para[ci]) !== -1) { sents.push(cur); cur = ''; }
      }
      if (cur.trim()) sents.push(cur);
      if (sents.length < 4) continue;
      qualifyingCount++;
      if (qualifyingCount % 3 !== 0) continue;
      var tmp = sents[1];
      sents[1] = sents[2];
      sents[2] = tmp;
      lines[li] = sents.join('');
      count++;
    }
    return { text: lines.join(nl), count: count };
  }

  // N27: 动词碎片重复 (加法: 从原文提取动词, 非固定模板)
  // 与N18关键区别: 加的是当前句子末尾的动词, 每次都不同
  // 方法论: 句长要有快有慢, 允许不完整
  function repeatVerbFragment(text) {
    var count = 0;
    var nl = String.fromCharCode(10);
    var period = String.fromCharCode(0x3002);
    var lq = String.fromCharCode(0x201c);
    var rq = String.fromCharCode(0x201d);
    var lines = text.split(nl);
    var verbs = "推冲走跑跳抓拉打踢转站坐看听闻摸拍捏攥皱叹咬眯瞪盯望瞥扭弯蹲跪躺趴靠扶撑握搓揉按扣掐挤蹭踩踏踹踢绊撞跌摔爬攀翻越跨迈进来下去出回过到给拿放拿说笑哭喊叫唱吵嚷闹问答吵骂吼唤呼吸吞眨张合咬啃吠嚎嘶咆哮吟呕呛喘咳嗽呕吐唾淌滴渗溢涌冒喷洒淋浇泼洒滴漏淌漫浸沉浮漂游潜水沫泡浪涛潮汐溅淋浇洒滴漏淌漫浸沉浮漂游溅淋浇洒";
    var applied = 0;
    var maxApply = 3;
    for (var li = 0; li < lines.length && applied < maxApply; li++) {
      var para = lines[li];
      if (para.trim().length < 20) continue;
      if (para.indexOf(lq) >= 0 || para.indexOf(rq) >= 0) continue;
      // Find sentences in this paragraph
      var sents = [];
      var cur = "";
      for (var ci = 0; ci < para.length; ci++) {
        cur += para[ci];
        if (para[ci] === period) { sents.push(cur); cur = ""; }
      }
      if (cur.trim()) sents.push(cur);
      // Pick a random sentence (not first, not last)
      if (sents.length < 3) continue;
      var pickIdx = 1 + Math.floor(Math.random() * (sents.length - 2));
      var sent = sents[pickIdx];
      // Get last char before period
      var lastChar = sent.charAt(sent.length - 2);
      if (verbs.indexOf(lastChar) < 0) continue;
      // Add verb fragment after the sentence
      sents[pickIdx] = sent + lastChar + period;
      lines[li] = sents.join("");
      count++;
      applied++;
    }
    return { text: lines.join(nl), count: count };
  }
  // N15: selectDeleteExplanation
  function selectDeleteExplanation(text) {
    var count = 0;
    var period = String.fromCharCode(0x3002);
    var excl = String.fromCharCode(0xff01);
    var quest = String.fromCharCode(0xff1f);
    var nl = String.fromCharCode(10);
    var lq = String.fromCharCode(0x201c);
    var rq = String.fromCharCode(0x201d);
    var linesArr = text.split(nl);
    var expKw = ['意味','说明','等于','反应','判断','角度','方向','背景','风格','习惯','关系','如果','因为','所以','这种','由此','因此','第一反应','关注的是','这意味着','也就是说'];
    var expTracker = 0;
    for (var li = 0; li < linesArr.length; li++) {
      var para = linesArr[li];
      var sents = []; var cur = '';
      for (var ci = 0; ci < para.length; ci++) {
        cur += para[ci];
        if (para[ci] === period || para[ci] === excl || para[ci] === quest) { sents.push(cur); cur = ''; }
      }
      if (cur.trim()) sents.push(cur);
      if (sents.length < 3) continue;
      var newSents = []; var delInPara = 0;
      for (var si = 0; si < sents.length; si++) {
        var s = sents[si].trim();
        if (si === 0) { newSents.push(sents[si]); continue; }
        if (sents.length === 1) { newSents.push(sents[si]); continue; }
        if (si === sents.length - 1 && delInPara === 0) { newSents.push(sents[si]); continue; }
        if (s.indexOf(lq) >= 0 || s.indexOf(rq) >= 0) { newSents.push(sents[si]); continue; }
        if (s.length < 15) { newSents.push(sents[si]); continue; }
        var isExp = false;
        for (var ki = 0; ki < expKw.length; ki++) { if (s.indexOf(expKw[ki]) >= 0) { isExp = true; break; } }
        if (isExp && delInPara < 2) { count++; delInPara++; continue; }
        newSents.push(sents[si]);
      }
      if (newSents.length > 0) linesArr[li] = newSents.join(''); else linesArr[li] = para;
    }
    return { text: linesArr.join(nl), count: count };
  }

  // N22: varySentenceEndPunctuation (modification: change periods to ellipsis/dash)
  // Pure punctuation change - no text added, no text removed, no text modified
  // Changes rhythm of pauses without introducing new content
  function varySentenceEndPunctuation(text) {
    var count = 0;
    var period = String.fromCharCode(0x3002);
    var nl = String.fromCharCode(10);
    var lq = String.fromCharCode(0x201c);
    var rq = String.fromCharCode(0x201d);
    var ellipsis = String.fromCharCode(0x2026) + String.fromCharCode(0x2026) + String.fromCharCode(0x2026);
    var dash = String.fromCharCode(0x2014) + String.fromCharCode(0x2014);
    var linesArr = text.split(nl);
    var altIdx = 0;
    for (var li = 0; li < linesArr.length; li++) {
      var para = linesArr[li];
      var periodPositions = [];
      for (var ci = 0; ci < para.length; ci++) {
        if (para[ci] === period) {
          var before = ci > 0 ? para.substring(Math.max(0, ci - 3), ci) : '';
          var after = ci < para.length - 1 ? para[ci + 1] : '';
          if (before.indexOf(rq) >= 0) continue;
          if (after === lq) continue;
          periodPositions.push(ci);
        }
      }
      if (periodPositions.length < 4) continue;
      var changedInPara = 0;
      var midStart = Math.floor(periodPositions.length * 0.3);
      var midEnd = Math.floor(periodPositions.length * 0.7);
      for (var pi = midStart; pi < midEnd; pi++) {
        if (changedInPara >= 1) break;
        if (pi === periodPositions.length - 1) continue;
        var pos = periodPositions[pi];
        var sentStart = pi === 0 ? 0 : periodPositions[pi - 1] + 1;
        var sentText = para.substring(sentStart, pos).trim();
        if (sentText.length < 10 || sentText.length > 40) continue;
        if (sentText.indexOf(lq) >= 0 || sentText.indexOf(rq) >= 0) continue;
        var replacement = altIdx % 2 === 0 ? ellipsis : dash;
        altIdx++;
        para = para.substring(0, pos) + replacement + para.substring(pos + 1);
        count++; changedInPara++;
        periodPositions = [];
        for (var ci2 = 0; ci2 < para.length; ci2++) {
          if (para[ci2] === period) {
            var b2 = ci2 > 0 ? para.substring(Math.max(0, ci2 - 3), ci2) : '';
            if (b2.indexOf(rq) >= 0) continue;
            periodPositions.push(ci2);
          }
        }
      }
      linesArr[li] = para;
    }
    return { text: linesArr.join(nl), count: count };
  }


// 主处理函数
    // N31: Thin dialogue-action alternation pattern
  // AI writes micro-expression after every dialogue line = too uniform
  // Fix: remove some action lines between consecutive dialogue lines
  function thinDialogueActionPattern(text) {
    var count = 0;
    var nl = String.fromCharCode(10);
    var lq = String.fromCharCode(0x201c);
    var rq = String.fromCharCode(0x201d);
    var allLines = text.split(nl);
    // Filter empty lines and build a mapping
    var linesArr = [];
    var lineMap = [];
    for (var li2 = 0; li2 < allLines.length; li2++) {
      if (allLines[li2].trim().length > 0) {
        linesArr.push(allLines[li2]);
        lineMap.push(li2);
      }
    }

    var actionKeywords = [
      '表情', '眉头', '嘴角', '脸上', '手指',
      '眼神', '打量', '点了下头',
      '哦了一声', '抓了抓', '清了清',
      '笑了笑', '叹了叹', '愃了愃',
      '缓缓', '微微', '轻轻'
    ];

    for (var i = 1; i < linesArr.length - 1; i++) {
      var prev = linesArr[i-1].trim();
      var curr = linesArr[i].trim();
      var next = linesArr[i+1].trim();

      var prevHasD = prev.indexOf(lq) >= 0 || prev.indexOf(rq) >= 0 || prev.indexOf('\x00DIALOGUE') >= 0;
      var nextHasD = next.indexOf(lq) >= 0 || next.indexOf(rq) >= 0 || next.indexOf('\x00DIALOGUE') >= 0;
      var currHasD = curr.indexOf(lq) >= 0 || curr.indexOf(rq) >= 0 || curr.indexOf('\x00DIALOGUE') >= 0;

      if (!prevHasD || !nextHasD || currHasD) continue;
      if (curr.length < 5 || curr.length > 120) continue;

      var isTemplate = false;
      for (var k = 0; k < actionKeywords.length; k++) {
        if (curr.indexOf(actionKeywords[k]) >= 0) { isTemplate = true; break; }
      }
      var actRe = new RegExp('了一[下声个]');
      if (actRe.test(curr)) isTemplate = true;

      if (!isTemplate) continue;

      // Skip if contains plot-critical keywords
      var criticalKw = ['但是', '但没有', '可能', '应该', '需要', '建议', '问题'];
      var hasCritical = false;
      for (var ck = 0; ck < criticalKw.length; ck++) {
        if (curr.indexOf(criticalKw[ck]) >= 0) { hasCritical = true; break; }
      }
      if (hasCritical) continue;

      // Delete template action sentences within the line, not the whole line
      var period = String.fromCharCode(0x3002);
      var lineSents = allLines[lineMap[i]].split(period);
      var newSents = [];
      var delInLine = 0;
      for (var si = 0; si < lineSents.length; si++) {
        var s = lineSents[si].trim();
        if (s.length > 0) {
          var sentIsTemplate = false;
          for (var k2 = 0; k2 < actionKeywords.length; k2++) {
            if (s.indexOf(actionKeywords[k2]) >= 0) { sentIsTemplate = true; break; }
          }
          if (actRe.test(s)) sentIsTemplate = true;
          // Only delete if there are other sentences to keep
          if (sentIsTemplate && lineSents.filter(function(x){return x.trim().length>0;}).length - delInLine > 1) {
            delInLine++;
            count++;
          } else {
            newSents.push(lineSents[si]);
          }
        } else {
          newSents.push(lineSents[si]);
        }
      }
      if (delInLine > 0) {
        allLines[lineMap[i]] = newSents.join(period);
      }
    }

    var result = allLines.filter(function(l) { return l.trim().length > 0; }).join(nl);
    return { text: result, count: count };
  }

  // N32: Remove explanation clauses inside dialogue
  // AI characters explain full reasoning = dialogue too complete
  // Fix: remove "because/if/so/means" clauses inside dialogue quotes
  function removeDialogueExplanationClauses(text) {
    var count = 0;
    var lq = String.fromCharCode(0x201c);
    var rq = String.fromCharCode(0x201d);
    var comma = String.fromCharCode(0xff0c);
    var period = String.fromCharCode(0x3002);

    // Find all dialogue segments
    var result = '';
    var i = 0;
    while (i < text.length) {
      if (text[i] === lq) {
        // Find closing quote
        var end = text.indexOf(rq, i + 1);
        if (end < 0) { result += text[i]; i++; continue; }
        var dialogue = text.substring(i + 1, end);

        // Remove explanation clauses: because...so, if...then, means, implies
        // Pattern: clause1 + comma + explanation_clause + period/comma
        var clauses = dialogue.split(comma);
        if (clauses.length >= 2) {
          var expKw = ['因为', '所以', '如果', '就会', '意味着', '说明', '等于', '也就是说', '从而', '因此', '因为这', '这意味着'];
          var newClauses = [];
          var removed = false;
          for (var ci = 0; ci < clauses.length; ci++) {
            var isExp = false;
            for (var ki = 0; ki < expKw.length; ki++) {
              if (clauses[ci].trim().indexOf(expKw[ki]) === 0) { isExp = true; break; }
            }
            if (isExp && clauses.length - (removed ? 1 : 0) > 2) {
              count++;
              removed = true;
            } else {
              newClauses.push(clauses[ci]);
            }
          }
          if (removed) {
            dialogue = newClauses.join(comma);
          }
        }

        result += lq + dialogue + rq;
        i = end + 1;
      } else {
        result += text[i];
        i++;
      }
    }
    return { text: result, count: count };
  }

  // N33: Remove template action tags after dialogue
  // Pattern: 。XX的表情/眉头/嘴角/脸上... → remove the action tag sentence
  // Also: XX没有马上回答/没有接话 → remove
  function removeTemplateActionTags(text) {
    var count = 0;
    var period = String.fromCharCode(0x3002);
    var comma = String.fromCharCode(0xff0c);
    var lq = String.fromCharCode(0x201c);
    var rq = String.fromCharCode(0x201d);
    
    // Split by period, process each sentence
    var parts = text.split(period);
    var newParts = [];
    
    // Template action tag patterns (at sentence start, after dialogue)
    var tagPatterns = [
      // XX的YY动作
      /[一-鿿]{1,4}的[表情眉头嘴角脸手指眼神]/,
      // XX没有马上/XX没有接话/XX没有动
      /[一-鿿]{1,4}没有[马上接话动]/,
      // XX点了下头/XX哦了一声
      /[一-鿿]{1,4}[点了哦]一[下声]/
    ];
    
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      if (part.length < 5) { newParts.push(part); continue; }
      
      // Check if this part starts with a template action tag
      // Only remove if: previous part ends with dialogue (rq), and this is a short action tag
      var prevPart = i > 0 ? parts[i-1] : '';
      var prevHasDialogue = prevPart.indexOf(rq) >= 0 || prevPart.indexOf(lq) >= 0;
      
      if (!prevHasDialogue) { newParts.push(part); continue; }
      
      // Check if this part is a template action tag (short, starts with name+action)
      var trimmed = part.trim();
      if (trimmed.length > 60) { newParts.push(part); continue; }
      
      var isTemplate = false;
      for (var pi = 0; pi < tagPatterns.length; pi++) {
        if (tagPatterns[pi].test(trimmed.substring(0, 10))) { isTemplate = true; break; }
      }
      
      if (isTemplate) {
        // Check if there are more sentences after this in the same "paragraph"
        // Only remove if it's not the last sentence (don't remove ending)
        if (i < parts.length - 2) {
          count++;
          continue; // skip this part (remove it)
        }
      }
      
      newParts.push(part);
    }
    
    return { text: newParts.join(period), count: count };
  }

  // N34: Remove structured psychological narration
  // AI pattern: "XX的第一反应是..." "XX的第二反应是..." "因为她知道..."
  // These are over-explanatory thought patterns that feel mechanical
  function removeStructuredPsych(text) {
    var count = 0;
    var period = String.fromCharCode(0x3002);
    var parts = text.split(period);
    var newParts = [];
    
    var psychPatterns = [
      // 第X反应是
      /[第一二三]反应是/,
      // 因为她知道/因为他知道
      /因为[她他]知道/,
      // XX知道XX说的是(假话/实话)
      /[一-鿿]{1,4}知道[一-鿿]{1,4}说的是/
    ];
    
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      if (part.length < 10) { newParts.push(part); continue; }
      
      var trimmed = part.trim();
      var isPsych = false;
      for (var pi = 0; pi < psychPatterns.length; pi++) {
        if (psychPatterns[pi].test(trimmed.substring(0, 20))) { isPsych = true; break; }
      }
      
      // Only remove if: not too long (under 60 chars) and there are other sentences
      if (isPsych && trimmed.length < 60 && parts.length - count > 3) {
        count++;
        continue;
      }
      
      newParts.push(part);
    }
    
    return { text: newParts.join(period), count: count };
  }


  // N36: removeTemplateActionPhrase - Remove standalone template actions
  function removeTemplateActionPhrase(text) {
    var count = 0;
    var period = String.fromCharCode(0x3002);
    var nl = String.fromCharCode(10);
    
    var templates = [
      String.fromCharCode(0x70b9, 0x4e86, 0x70b9, 0x5934),
      String.fromCharCode(0x6447, 0x4e86, 0x6447, 0x5934),
      String.fromCharCode(0x7b11, 0x4e86, 0x7b11),
      String.fromCharCode(0x53f9, 0x4e86, 0x53f9),
      String.fromCharCode(0x54fc, 0x4e86, 0x54fc)
    ];
    
    var result = text;
    for (var ti = 0; ti < templates.length; ti++) {
      var tmpl = templates[ti];
      var pattern = new RegExp(period + tmpl + period, "g");
      var matches = result.match(pattern);
      if (matches) {
        count += matches.length;
        result = result.replace(pattern, period);
      }
      var pattern2 = new RegExp(nl + tmpl + period, "g");
      var p3 = new RegExp(period + nl + nl + tmpl + String.fromCharCode(0xff0c), "g");
      var m3 = result.match(p3);
      if (m3) { count += m3.length; result = result.replace(p3, period + nl + nl); }
      var p4 = new RegExp(nl + tmpl + String.fromCharCode(0xff0c), "g");
      var m4 = result.match(p4);
      if (m4) { count += m4.length; result = result.replace(p4, nl); }
      var matches2 = result.match(pattern2);
      if (matches2) {
        count += matches2.length;
        result = result.replace(pattern2, nl);
      }
    }
    return { text: result, count: count };
  }


  // N37: Trim overly complete dialogue (methodology: AI dialogue too complete)
  // When dialogue >60 chars and contains reasoning, remove the last clause
  function trimCompleteDialogue(text) {
    var count = 0;
    var lq = String.fromCharCode(0x201c);
    var rq = String.fromCharCode(0x201d);
    var comma = String.fromCharCode(0xff0c);
    var period = String.fromCharCode(0x3002);
    var dash = String.fromCharCode(0x2014) + String.fromCharCode(0x2014);
    var result = "";
    var i = 0;
    while (i < text.length) {
      if (text[i] === lq) {
        var end = text.indexOf(rq, i + 1);
        if (end < 0) { result += text[i]; i++; continue; }
        var dialogue = text.substring(i + 1, end);
        // Check if dialogue is long and contains reasoning
        var reasonKw = ["如果", "因为", "所以", "建议", "意味着", "应该", "这样谈", "从而", "因此", "这样"];
        var hasReason = false;
        for (var rk = 0; rk < reasonKw.length; rk++) {
          if (dialogue.indexOf(reasonKw[rk]) >= 0) { hasReason = true; break; }
        }
        if (dialogue.length > 60 && hasReason) {
          // Split by period or comma
          var clauses = dialogue.split(new RegExp("[" + period + comma + "]"));
          if (clauses.length >= 3) {
            // Remove the last non-empty clause (usually the benefit/conclusion)
            var lastNonEmpty = -1;
            for (var ci = clauses.length - 1; ci >= 0; ci--) {
              if (clauses[ci].trim().length > 5) { lastNonEmpty = ci; break; }
            }
            if (lastNonEmpty > 0 && lastNonEmpty < clauses.length) {
              // Rebuild dialogue without the last clause
              var newClauses = [];
              for (var ci2 = 0; ci2 < clauses.length; ci2++) {
                if (ci2 !== lastNonEmpty) newClauses.push(clauses[ci2]);
                else break;
              }
              // Rejoin with original punctuation
              var newDialogue = "";
              var clauseIdx = 0;
              for (var si = 0; si < dialogue.length && clauseIdx < newClauses.length; si++) {
                newDialogue += dialogue[si];
                if (dialogue[si] === period || dialogue[si] === comma) {
                  clauseIdx++;
                  if (clauseIdx >= newClauses.length) {
                    newDialogue = newDialogue.substring(0, newDialogue.length - 1) + period;
                    break;
                  }
                }
              }
              result += lq + newDialogue + rq;
              count++;
              i = end + 1;
              continue;
            }
          }
        }
        result += lq + dialogue + rq;
        i = end + 1;
      } else {
        result += text[i];
        i++;
      }
    }
    return { text: result, count: count };
  }

  // N38: Remove conclusion sentences in narration (methodology: dont summarize every paragraph)
  function removeNarrationConclusions(text) {
    var count = 0;
    var period = String.fromCharCode(0x3002);
    var result = text;
    // Simple string-based conclusion detection
    var conclPhrases = [
      "拼在一起就是",
      "完整画像",
      "最难办",
      "这种悬着的状态",
      "两个人一个从",
      "综合来看"
    ];
    for (var pi = 0; pi < conclPhrases.length; pi++) {
      var phrase = conclPhrases[pi];
      var searchPos = 0;
      while (true) {
        var found = result.indexOf(phrase, searchPos);
        if (found < 0) break;
        // Find the start of this sentence (previous period)
        var sentStart = result.lastIndexOf(period, found);
        if (sentStart < 0) sentStart = 0; else sentStart++;
        // Find the end of this sentence (next period)
        var sentEnd = result.indexOf(period, found);
        if (sentEnd < 0) { searchPos = found + phrase.length; continue; }
        // Remove the sentence
        result = result.substring(0, sentStart) + result.substring(sentEnd + 1);
        count++;
        searchPos = sentStart;
      }
    }
    return { text: result, count: count };
  }
  // N39: Remove pre-dialogue micro-expression descriptions (methodology rule 11)
  // AI pattern: every dialogue turn is preceded by a micro-expression setup
  // Methodology: 不要每个对话回合都配等量的微表情描写
  function removePreDialogueMicroExpression(text) {
    var count = 0;
    var openQuote = String.fromCharCode(0x201c);
    var period = String.fromCharCode(0x3002);
    var comma = String.fromCharCode(0xff0c);
    var colon = String.fromCharCode(0xff1a);
    var lines9 = text.split(String.fromCharCode(10));
    var exprKeywords = [
      String.fromCharCode(0x8868,0x60c5),
      String.fromCharCode(0x795e,0x8272),
      String.fromCharCode(0x8138,0x8272),
      String.fromCharCode(0x773c,0x795e),
      String.fromCharCode(0x8bed,0x6c14),
      String.fromCharCode(0x58f0,0x97f3),
      String.fromCharCode(0x5634,0x89d2),
      String.fromCharCode(0x7709,0x5934),
      String.fromCharCode(0x76ee,0x5149),
      String.fromCharCode(0x7ec8,0x4e8e,0x5f00,0x53e3),
      String.fromCharCode(0x53f9,0x4e86,0x53e3,0x6c14),
      String.fromCharCode(0x8870,0x7740,0x8138),
      String.fromCharCode(0x8865,0x4e86,0x4e00,0x53e5),
      String.fromCharCode(0x6c89,0x9ed8,0x4e86,0x4e00,0x4f1a,0x513f),
    ];
    var actionVerbs = [
      String.fromCharCode(0x8d70), String.fromCharCode(0x62ff),
      String.fromCharCode(0x63a8), String.fromCharCode(0x6253),
      String.fromCharCode(0x7ad9), String.fromCharCode(0x5750),
      String.fromCharCode(0x7ffb), String.fromCharCode(0x62bd),
      String.fromCharCode(0x5408), String.fromCharCode(0x7ffb),
    ];

    for (var i = 0; i < lines9.length; i++) {
      var line = lines9[i];
      var qi = line.indexOf(openQuote);
      if (qi < 0) continue;
      var beforeQuote = line.substring(0, qi);

      // Find the last sentence break (period, comma, or colon)
      var lastPeriod = beforeQuote.lastIndexOf(period);
      var lastComma = beforeQuote.lastIndexOf(comma);
      var lastColon = beforeQuote.lastIndexOf(colon);
      var lastBreak = Math.max(lastPeriod, lastComma, lastColon);

      var setup = "";
      var setupStart = -1;
      var setupEnd = -1;

      if (lastBreak >= 0) {
        // If last break is a colon, the setup is everything before the colon
        if (lastColon >= 0 && lastColon >= lastPeriod && lastColon >= lastComma) {
          setupEnd = lastColon + 1;
          var prevBreak = Math.max(
            beforeQuote.lastIndexOf(period, lastColon - 1),
            beforeQuote.lastIndexOf(comma, lastColon - 1)
          );
          setupStart = prevBreak < 0 ? 0 : prevBreak + 1;
          setup = beforeQuote.substring(setupStart, setupEnd).trim();
        } else if (lastPeriod >= 0 && lastPeriod >= lastComma) {
          // Last break is a period - setup is the sentence ending at this period
          setupEnd = lastPeriod + 1;
          var prevBreak2 = Math.max(
            beforeQuote.lastIndexOf(period, lastPeriod - 1),
            beforeQuote.lastIndexOf(comma, lastPeriod - 1),
            beforeQuote.lastIndexOf(colon, lastPeriod - 1)
          );
          setupStart = prevBreak2 < 0 ? 0 : prevBreak2 + 1;
          setup = beforeQuote.substring(setupStart, setupEnd).trim();
        } else if (lastComma >= 0) {
          setupStart = lastComma + 1;
          setupEnd = qi;
          setup = beforeQuote.substring(setupStart, setupEnd).trim();
        }
      } else {
        // No breaks at all - entire beforeQuote is the setup
        setup = beforeQuote.trim();
        setupStart = 0;
        setupEnd = qi;
      }

      if (setup.length < 3 || setup.length > 50) continue;

      var hasExpr = false;
      for (var k = 0; k < exprKeywords.length; k++) {
        if (setup.indexOf(exprKeywords[k]) >= 0) { hasExpr = true; break; }
      }
      if (!hasExpr) continue;

      var hasAction = false;
      for (var v = 0; v < actionVerbs.length; v++) {
        if (setup.indexOf(actionVerbs[v]) >= 0) { hasAction = true; break; }
      }
      if (hasAction) continue;

      // Remove the setup expression
      lines9[i] = line.substring(0, setupStart) + line.substring(setupEnd);
      count++;
    }
    return { text: lines9.join(String.fromCharCode(10)), count: count };
  }

  // N40: Thin dialogue conditional chains (methodology rule 12)
  // AI pattern: characters explain full conditional reasoning
  // Methodology: 角色说话时不要把因果推理全部说出来
  function thinDialogueConditionals(text) {
    var count = 0;
    var openQuote = String.fromCharCode(0x201c);
    var closeQuote = String.fromCharCode(0x201d);
    var ruguo = String.fromCharCode(0x5982,0x679c);
    var jiu = String.fromCharCode(0x5c31);
    var comma = String.fromCharCode(0xff0c);
    var period = String.fromCharCode(0x3002);
    var result = "";
    var i = 0;
    while (i < text.length) {
      var qi = text.indexOf(openQuote, i);
      if (qi < 0) { result += text.substring(i); break; }
      result += text.substring(i, qi + 1);
      var ci = text.indexOf(closeQuote, qi + 1);
      if (ci < 0) { result += text.substring(qi + 1); break; }
      var dialogue = text.substring(qi + 1, ci);
      var modDialogue = dialogue;
      var searchPos = 0;
      while (true) {
        var ruguoPos = modDialogue.indexOf(ruguo, searchPos);
        if (ruguoPos < 0) break;
        var jiuPos = modDialogue.indexOf(jiu, ruguoPos);
        if (jiuPos >= 0 && jiuPos - ruguoPos < 30) {
          var before = modDialogue.substring(0, ruguoPos);
          var middle = modDialogue.substring(ruguoPos + 2, jiuPos);
          var after = modDialogue.substring(jiuPos + 1);
          modDialogue = before + middle + after;
          count++;
          searchPos = ruguoPos;
        } else {
          modDialogue = modDialogue.substring(0, ruguoPos) + modDialogue.substring(ruguoPos + 2);
          count++;
          searchPos = ruguoPos;
        }
      }
      // Clean up double punctuation left by removal
      // Pattern: ，。 or 。， or ，， or 。。
      modDialogue = modDialogue.split(comma + period).join(period);
      modDialogue = modDialogue.split(period + comma).join(period);
      modDialogue = modDialogue.split(comma + comma).join(comma);
      modDialogue = modDialogue.split(period + period).join(period);
      // Clean up leading punctuation
      while (modDialogue.length > 0 && (modDialogue.charAt(0) === comma || modDialogue.charAt(0) === period)) {
        modDialogue = modDialogue.substring(1);
      }
      result += modDialogue + closeQuote;
      i = ci + 1;
    }
    return { text: result, count: count };
  }

  // N41: Create dialogue turn weight variation (改法 - structural modification)
  // Methodology: 有些对话回合可以只有动作没有台词，有些只有台词没有动作描写
  // AI pattern: every dialogue turn has equal weight (dialogue + action tag)
  // Fix: every 3rd consecutive dialogue turn, strip simple attribution tags
  function createDialogueWeightVariation(text) {
    var count = 0;
    var openQuote = String.fromCharCode(0x201c);
    var closeQuote = String.fromCharCode(0x201d);
    var period = String.fromCharCode(0x3002);
    var comma = String.fromCharCode(0xff0c);
    var lines9 = text.split(String.fromCharCode(10));
    var dialogueTurnIdx = 0;
    var simpleTags = [
      String.fromCharCode(0x8bf4),
      String.fromCharCode(0x63a5,0x8bdd),
      String.fromCharCode(0x5f00,0x53e3),
    ];

    for (var i = 0; i < lines9.length; i++) {
      var line = lines9[i];
      if (line.indexOf(openQuote) < 0) continue;
      dialogueTurnIdx++;
      // Every 3rd consecutive dialogue turn: remove simple attribution (name + tag + punct)
      if (dialogueTurnIdx % 3 === 0) {
        var modified = line;
        for (var t = 0; t < simpleTags.length; t++) {
          var tag = simpleTags[t];
          var tpos = modified.indexOf(tag);
          while (tpos >= 0) {
            // Check what follows the tag
            var afterTagChar = modified.charAt(tpos + tag.length);
            var isSimpleAfter = afterTagChar === comma || afterTagChar === period;
            // Also check for “ (open quote) after tag - means dialogue continues
            if (afterTagChar === openQuote) {
              // Pattern: ...tag"dialogue..." - just remove tag, keep the quote
              modified = modified.substring(0, tpos) + modified.substring(tpos + tag.length);
              count++;
              tpos = modified.indexOf(tag);
              continue;
            }
            if (!isSimpleAfter) {
              tpos = modified.indexOf(tag, tpos + tag.length);
              continue;
            }
            // Find the name before the tag (1-4 Chinese chars before tag)
            var nameStart = tpos;
            for (var ci = tpos - 1; ci >= 0 && ci >= tpos - 4; ci--) {
              var ch = modified.charAt(ci);
              var code = ch.charCodeAt(0);
              // Check if Chinese character
              if (code >= 0x4e00 && code <= 0x9fff) {
                nameStart = ci;
              } else {
                break;
              }
            }
            // Only remove if we found a name (at least 1 char)
            if (nameStart < tpos) {
              // Remove from nameStart to tag + 1 (including following punct)
              var removeEnd = tpos + tag.length + 1;
              modified = modified.substring(0, nameStart) + modified.substring(removeEnd);
              count++;
              tpos = modified.indexOf(tag);
            } else {
              // No name found - just remove the tag itself
              modified = modified.substring(0, tpos) + modified.substring(tpos + tag.length + 1);
              count++;
              tpos = modified.indexOf(tag);
            }
          }
        }
        lines9[i] = modified;
      }
    }
    return { text: lines9.join(String.fromCharCode(10)), count: count };
  }


  // === V52: 改而不删规则 ===
  // 核心原则：信息零丢失，只改标点和表述方式

  function removeNarratorIntermediary(text) {
    var count = 0;
    var period = String.fromCharCode(0x3002);
    var comma = String.fromCharCode(0xff0c);
    var intermediaries = [
      '\u4ed6\u611f\u5230', '\u4ed6\u89c9\u5f97', '\u4ed6\u611f\u89c9',
      '\u4ed6\u5bdf\u89c9', '\u4ed6\u6ce8\u610f\u5230',
      '\u5979\u611f\u5230', '\u5979\u89c9\u5f97', '\u5979\u611f\u89c9'
    ];
    var bodyParts = [
      '\u540e\u9888','\u6307\u5c16','\u80c3','\u5fc3\u8df3','\u624b','\u811a',
      '\u5934','\u8138','\u80cc','\u80f8','\u5589\u5499','\u773c\u775b',
      '\u8033\u6735','\u5634','\u547c\u5438','\u80a9\u8180','\u819d\u76d6',
      '\u808c\u8089','\u76ae\u80a4','\u8840\u6db2','\u7259','\u810f','\u80a0'
    ];
    var r = text;
    for (var ii = 0; ii < intermediaries.length; ii++) {
      for (var bi = 0; bi < bodyParts.length; bi++) {
        var re = new RegExp(intermediaries[ii] + '(' + bodyParts[bi] + '[^' + period + comma + ']{2,25})', 'g');
        r = r.replace(re, function(m, rest) { count++; return rest; });
      }
    }
    return { text: r, count: count };
  }

function causalInversion(text) {
    var count = 0;
    var period = String.fromCharCode(0x3002);
    var comma = String.fromCharCode(0xff0c);
    var dash = String.fromCharCode(0x2014) + String.fromCharCode(0x2014);
    var r = text;
    var re1 = new RegExp('\\u56e0\\u4e3a([^' + period + comma + ']{4,30})' + comma + '\u6240\u4ee5([^' + period + ']{4,40})' + period, 'g');
    r = r.replace(re1, function(m, cause, effect) {
      count++; return effect.trim() + dash + cause.trim() + period;
    });
    var re2 = new RegExp('\\u7531\\u4e8e([^' + period + comma + ']{4,30})' + comma + '\u56e0\u6b64([^' + period + ']{4,40})' + period, 'g');
    r = r.replace(re2, function(m, cause, effect) {
      count++; return effect.trim() + dash + cause.trim() + period;
    });
    return { text: r, count: count };
  }

  function frameStripping(text) {
    var count = 0;
    var period = String.fromCharCode(0x3002);
    var comma = String.fromCharCode(0xff0c);
    var r = text;
    var frames = [
      [new RegExp('\u8fd9\u610f\u5473\u7740' + comma, 'g'), ''],
      [new RegExp('\u4e5f\u5c31\u662f\u8bf4' + comma, 'g'), ''],
      [new RegExp('\u6362\u53e5\u8bdd\u8bf4' + comma, 'g'), ''],
      [new RegExp('\u4e0d\u96be\u53d1\u73b0' + comma, 'g'), ''],
      [new RegExp('\u4e0d\u96be\u770b\u51fa' + comma, 'g'), ''],
      [new RegExp('\u53ef\u4ee5\u770b\u51fa' + comma, 'g'), ''],
      [new RegExp('\u53ef\u89c1' + comma, 'g'), ''],
      [new RegExp('\u4ece\u67d0\u79cd\u7a0b\u5ea6\u6765\u8bf4' + comma, 'g'), ''],
    ];
    for (var fi = 0; fi < frames.length; fi++) {
      var before = r.length;
      r = r.replace(frames[fi][0], frames[fi][1]);
      if (r.length < before) count++;
    }
    r = r.replace(new RegExp(comma + comma, 'g'), comma);
    r = r.replace(new RegExp('^' + comma, 'gm'), '');
    return { text: r, count: count };
  }

function process(text, config) { _ruleConfig = config || null;
    if (!text || text.trim().length < 10) return { text: text, originalText: text || '', stats: { total: 0, details: [] }, detections: [] };
    var originalText = text;
    // N6: Protect dialogue before processing
        var stats = { total: 0, details: [] };
    var detections = [];

    // N31: dialogue-action alternation thinning (before dialogue protection)
    var rn31 = { text: text, count: 0 }; // V52 DISABLED
    text = rn31.text;
    if (rn31.count > 0) { stats.details.push("sparse " + rn31.count + " dialogue-actions"); stats.total += rn31.count; }

    // N32: dialogue-internal explanation clause removal (before dialogue protection)
    var rn32 = { text: text, count: 0 }; // V52 DISABLED
    text = rn32.text;
    if (rn32.count > 0) { stats.details.push("trim " + rn32.count + " dialogue explanations"); stats.total += rn32.count; }

    // N33: remove template action tags after dialogue
    var rn33 = { text: text, count: 0 }; // V54 DISABLED: 改而不删
    text = rn33.text;
    if (rn33.count > 0) { stats.details.push("remove " + rn33.count + " template action tags"); stats.total += rn33.count; }

    // N34: remove structured psychological narration
    var rn34 = { text: text, count: 0 }; // V52 DISABLED
    text = rn34.text;
    if (rn34.count > 0) { stats.details.push("remove " + rn34.count + " structured psych"); stats.total += rn34.count; }
    var rn36 = { text: text, count: 0 }; // V54 DISABLED: 改而不删
    text = rn36.text;
    if (rn36.count > 0) { stats.details.push("remove " + rn36.count + " template actions"); stats.total += rn36.count; }
    // N37: Trim overly complete dialogue
    var rn37 = { text: text, count: 0 }; // V52 DISABLED
    text = rn37.text;
    if (rn37.count > 0) { stats.details.push("trim " + rn37.count + " complete dialogue"); stats.total += rn37.count; }
    // N39: Remove pre-dialogue micro-expression (before dialogue protection)
    var rn39 = { text: text, count: 0 }; // V54 DISABLED: 改而不删
    text = rn39.text;
    if (rn39.count > 0) { stats.details.push("remove " + rn39.count + " pre-dialogue micro-expr"); stats.total += rn39.count; }

    // N40: Thin dialogue conditional chains (before dialogue protection)
    var rn40 = { text: text, count: 0 }; // V52 DISABLED
    text = rn40.text;
    if (rn40.count > 0) { stats.details.push("thin " + rn40.count + " dialogue conditionals"); stats.total += rn40.count; }

    // N41: Create dialogue turn weight variation
    var rn41 = { text: text, count: 0 }; // V54 DISABLED: 改而不删
    text = rn41.text;
    if (rn41.count > 0) { stats.details.push("vary " + rn41.count + " dialogue turn weights"); stats.total += rn41.count; }


    var dialogueData = protectDialogue(text);
    text = dialogueData.text;
    // === 小说正文专用规则 (自动执行,优先运行) ===
    var rn4 = _isRuleEnabled("dropNames") ? dropSentenceStartNames(text) : { text: text, count: 0 };
    text = rn4.text;
    if (rn4.count > 0) { stats.details.push("去掉 " + rn4.count + " 处句首人名"); stats.total += rn4.count; }

    var rn1 = _isRuleEnabled("dropPronouns") ? dropSentenceStartPronoun(text) : { text: text, count: 0 };
    text = rn1.text;
    if (rn1.count > 0) { stats.details.push("去掉 " + rn1.count + " 处句首他"); stats.total += rn1.count; }

    var rn2 = _isRuleEnabled("mergeShort") ? mergeShortSentences(text) : { text: text, count: 0 };
    text = rn2.text;
    if (rn2.count > 0) { stats.details.push("合并 " + rn2.count + " 处短句"); stats.total += rn2.count; }

    // V52: 改而不删新规则
    var rnA = _isRuleEnabled("narratorIntermediary") ? removeNarratorIntermediary(text) : { text: text, count: 0 };
    text = rnA.text;
    if (rnA.count > 0) { stats.details.push("中转词删除 " + rnA.count + " 处"); stats.total += rnA.count; }

    var rnB = _isRuleEnabled("causalInversion") ? causalInversion(text) : { text: text, count: 0 };
    text = rnB.text;
    if (rnB.count > 0) { stats.details.push("因果倒装 " + rnB.count + " 处"); stats.total += rnB.count; }

    var rnC = _isRuleEnabled("frameStripping") ? frameStripping(text) : { text: text, count: 0 };
    text = rnC.text;
    if (rnC.count > 0) { stats.details.push("框架剥离 " + rnC.count + " 处"); stats.total += rnC.count; }

    var rn3 = _isRuleEnabled("reduceSensory") ? reduceSensoryDensity(text) : { text: text, count: 0 }; // V54: COMPRESS mode (改而不删)
    text = rn3.text;
    if (rn3.count > 0) { stats.details.push("压缩 " + rn3.count + " 处感官描写"); stats.total += rn3.count; }

    var rn5 = _isRuleEnabled("templateOpening") ? replaceTemplateOpening(text) : { text: text, count: 0 };
    text = rn5.text;
    if (rn5.count > 0) { stats.details.push("替换 " + rn5.count + " 处模板化开头"); stats.total += rn5.count; }

    var rn7 = { text: text, count: 0 }; // V54 DISABLED: 改而不删
    text = rn7.text;
    if (rn7.count > 0) { stats.details.push("删除 " + rn7.count + " 处空泛开头"); stats.total += rn7.count; }

    var rn8 = _isRuleEnabled("mergeShortPara") ? mergeShortParagraphs(text) : { text: text, count: 0 };
    text = rn8.text;
    if (rn8.count > 0) { stats.details.push("合并 " + rn8.count + " 处短段落"); stats.total += rn8.count; }

    var rn9 = _isRuleEnabled("shuffleListing") ? shuffleListingPattern(text) : { text: text, count: 0 };
    text = rn9.text;
    if (rn9.count > 0) { stats.details.push("打散 " + rn9.count + " 处列举模式"); stats.total += rn9.count; }

    var rn10 = _isRuleEnabled("breakUniformity") ? breakParagraphUniformity(text) : { text: text, count: 0 };
    text = rn10.text;
    if (rn10.count > 0) { stats.details.push("修复 " + rn10.count + " 处段落趋同"); stats.total += rn10.count; }

    var rn11 = _isRuleEnabled("fixUniformLen") ? fixUniformSentenceLength(text) : { text: text, count: 0 };
    text = rn11.text;
    if (rn11.count > 0) { stats.details.push("修复 " + rn11.count + " 处句长趋同"); stats.total += rn11.count; }

    var rn12 = splitLongDialogue(text);
    text = rn12.text;
    if (rn12.count > 0) { stats.details.push("削减 " + rn12.count + " 处超长对白"); stats.total += rn12.count; }
    // --- 自动执行层 ---
    var rn15 = { text: text, count: 0 }; // V54 DISABLED: 改而不删
    text = rn15.text;
    if (rn15.count > 0) { stats.details.push('删除 ' + rn15.count + ' 处解释性叙述'); stats.total += rn15.count; }
    // N38: Remove narration conclusion sentences
    var rn38 = { text: text, count: 0 }; // V54 DISABLED: 改而不删
    text = rn38.text;
    if (rn38.count > 0) { stats.details.push("remove " + rn38.count + " conclusion sentences"); stats.total += rn38.count; }
    // N23 DISABLED: proven harmful (80%->100%)
    // var rn23 = reorderSentencesInParagraph(text);
    // text = rn23.text; // N23 disabled
    // if (rn23.count > 0) { stats.details.push('重排 ' + rn23.count + ' 处段落内句子'); stats.total += rn23.count; } // N23 disabled
    // N27 DISABLED: proven harmful (80%->100%, even 2 chars added)
    // var rn27 = repeatVerbFragment(text);
    // text = rn27.text; // N27 disabled
    // if (rn27.count > 0) { stats.details.push('重复 ' + rn27.count + ' 处动词碎片'); stats.total += rn27.count; } // N27 disabled


    // N22 DISABLED: proven harmful (80%->100% on urban2)
    // var rn22 = varySentenceEndPunctuation(text);
    // text = rn22.text; // N22 disabled
    // if (rn22.count > 0) { stats.details.push('变换 ' + rn22.count + ' 处句尾标点'); stats.total += rn22.count; }

    // N30 moved to end (V35 fix: was destroyed by r2/r6/r7/r8seq)

    var clicheCount = 0;
    for (var i = 0; i < CLICHES.length && _isRuleEnabled("cliches"); i++) {
      var before = text.length;
      text = text.replace(CLICHES[i].pattern, CLICHES[i].replace);
      if (text.length < before) clicheCount++;
    }
    if (clicheCount > 0) { stats.details.push('\u5220\u9664 ' + clicheCount + ' \u5904\u5957\u8bdd/AI\u504f\u597d\u8bcd'); stats.total += clicheCount; }

    // Rule 1.5: Connector word replacement (auto-execute)
    var connectorCount = 0;
    for (var ci2 = 0; ci2 < CONNECTOR_REPLACE.length && _isRuleEnabled("connectors"); ci2++) {
      var beforeConn = text.length;
      text = text.replace(CONNECTOR_REPLACE[ci2].pattern, CONNECTOR_REPLACE[ci2].replace);
      if (text.length !== beforeConn) connectorCount++;
    }
   if (connectorCount > 0) { stats.details.push('替换 ' + connectorCount + ' 处连接词'); stats.total += connectorCount; }

    // 规则5: 的/地替换 (自动执行)
    var rnDi = _isRuleEnabled("deDiReplace") ? replaceDiWithDe(text) : { text: text, count: 0 };
    text = rnDi.text;
    if (rnDi.count > 0) { stats.details.push('替换 ' + rnDi.count + ' 处的/地'); stats.total += rnDi.count; }

    // 规则6: 顿号转逗号 (自动执行)
    var rnDun = _isRuleEnabled("dunhaoToComma") ? dunhaoToComma(text) : { text: text, count: 0 };
    text = rnDun.text;
    if (rnDun.count > 0) { stats.details.push('替换 ' + rnDun.count + ' 处顿号'); stats.total += rnDun.count; }

    // 规则7: AI高频词检测 (检测不删除，存入detections供S2参考)
    if (_isRuleEnabled("aiFreqDetect")) {
      var freqWords = detectAiFreqWords(text);
      if (freqWords.length > 0) {
        var freqDesc = freqWords.map(function(f) { return f.word + '(' + f.count + '次)'; }).join(', ');
        detections.push({ type: 'AI高频词', count: freqWords.length, desc: freqDesc });
      }
    }

    // V44: N30 moved BEFORE r2/r6/r7 (reproducing V16 ordering)
                    var nl30 = String.fromCharCode(10);
    var paras30 = text.split(/\n\n+/).filter(function(p) { return p.trim().length > 0; });
    var paraCV30 = 0;
    if (paras30.length >= 3) {
      var avg30 = paras30.reduce(function(s,p2){return s+p2.length;},0) / paras30.length;
      var sd30 = Math.sqrt(paras30.reduce(function(s,p2){return s+Math.pow(p2.length-avg30,2);},0) / paras30.length);
      paraCV30 = avg30 > 0 ? sd30 / avg30 : 0;
    }
            var nl42 = String.fromCharCode(10);
    var paras42 = text.split(/\n+/).filter(function(p) { return p.trim().length > 0; });
    text = paras42.join(nl42);
    
    var rn30 = _isRuleEnabled("rhythmVariation") ? createParagraphRhythmVariation(text) : { text: text, count: 0 };
    text = rn30.text;
    if (rn30.count > 0) { stats.details.push("restructure " + rn30.count + " paras"); stats.total += rn30.count; }


    var r2 = _isRuleEnabled("fixPeriods") ? fixParagraphStartPeriods(text) : { text: text, count: 0 };
    text = r2.text;
    if (r2.count > 0) { stats.details.push('\u4fee\u6b63 ' + r2.count + ' \u5904\u6bb5\u9996\u53e5\u53f7'); stats.total += r2.count; }

    // SKIPPED: mergeContinuousShortSentences replaced by N2
    // var r3 = mergeContinuousShortSentences(text);
    // text = r3.text;
    // 
   var r6 = { text: text, count: 0 }; // V54 DISABLED: 改而不删
   text = r6.text;
   if (r6.count > 0) { stats.details.push('\u5220\u9664 ' + r6.count + ' \u5904\u6bb5\u843d\u603b\u7ed3\u53e5'); stats.total += r6.count; }

    // Rule 6.5: Paragraph starter deduplication (auto-execute)
    var r7dedup = deduplicateParagraphStarts(text);
    text = r7dedup.text;
    if (r7dedup.count > 0) { stats.details.push("去重 " + r7dedup.count + " 处句首重复"); stats.total += r7dedup.count; }

    // Rule 7: Break intra-paragraph connector sequences (auto-execute)
    var r8seq = _isRuleEnabled("breakConnectors") ? breakConnectorSequences(text) : { text: text, count: 0 };
    text = r8seq.text;
    if (r8seq.count > 0) { stats.details.push("打散 " + r8seq.count + " 处连接词序列"); stats.total += r8seq.count; }



    // Rule 6.5: Paragraph starter deduplication (auto-execute)
    // 朱雀检测发现：替换词重复使用形成新的句首重复模式（段6 92% AI）
    // 例：5个"然而"→5个"不过"，结构特征不变，仍是AI信号
    var r7dedup = deduplicateParagraphStarts(text);
    text = r7dedup.text;
    if (r7dedup.count > 0) { stats.details.push('去重 ' + r7dedup.count + ' 处句首重复'); stats.total += r7dedup.count; }


    // 规则4.5：段落开头标点清理（自动执行）
    // 套话删除后可能遗留段落开头的逗号
    var pLines = text.split(String.fromCharCode(10));
    var cleanupCount = 0;
    for (var ci = 0; ci < pLines.length; ci++) {
      var pTrim = pLines[ci].replace(new RegExp("^" + String.fromCharCode(92) + "s+"), "");
      var leadPunct = new RegExp("^[" + String.fromCharCode(0xff0c) + ",\u3002\u3001\uff01\uff1f]");
      if (leadPunct.test(pTrim)) {
        var stripRe = new RegExp("^(" + String.fromCharCode(92) + "s*)[" + String.fromCharCode(0xff0c) + ",\u3002\u3001\uff01\uff1f]+");
        pLines[ci] = pLines[ci].replace(stripRe, function(m, sp) { cleanupCount++; return sp; });
      }
      var pEnd = pLines[ci].replace(new RegExp(String.fromCharCode(92) + "s+$"), "");
      if (pEnd.length > 5) {
        var trailComma = new RegExp("[" + String.fromCharCode(0xff0c) + ",]$");
        if (trailComma.test(pEnd)) {
          var fixRe = new RegExp("[" + String.fromCharCode(0xff0c) + ",](" + String.fromCharCode(92) + "s*)$");
          pLines[ci] = pLines[ci].replace(fixRe, function(m, sp) { return String.fromCharCode(0x3002) + sp; });
        }
      }
    }
    text = pLines.join(String.fromCharCode(10));
    if (cleanupCount > 0) { stats.details.push("清理 " + cleanupCount + " 处段落开头标点"); stats.total += cleanupCount; }

    // --- 检测建议层 ---
    var r4 = detectUniformSentenceLength(text);
    if (r4.length > 0) detections.push({ type: '\u53e5\u957f\u8d8b\u540c', count: r4.length, desc: '\u8fde\u7eed3\u53e5\u957f\u5ea6\u76f8\u8fd1\uff0c\u5efa\u8bae\u624b\u52a8\u8c03\u6574' });

    var r5 = detectEmptyOpening(text);
    if (r5.detected) detections.push({ type: '\u7a7a\u6cdb\u5f00\u5934', count: 1, desc: '\u5f00\u5934\u662f\u6a21\u677f\u5316\u80cc\u666f\u94fa\u57ab\uff0c\u5efa\u8bae\u76f4\u63a5\u8fdb\u5165\u4e3b\u9898' });

    var r7 = detectConnectorPattern(text);
    if (r7.length > 0) detections.push({ type: '\u8fde\u63a5\u8bcd\u5e8f\u5217', count: r7.length, desc: '\u68c0\u6d4b\u5230\u5e8f\u5217\uff0c\u5efa\u8bae\u6253\u6563' });

    var r8 = detectInfoEvenness(text);
    if (r8.length > 0) detections.push({ type: '\u4fe1\u606f\u5747\u5300', count: r8.length, desc: '\u8fde\u7eed5\u6bb5\u5b57\u6570\u76f8\u8fd1\uff0c\u5efa\u8bae\u8ba9\u6bb5\u843d\u6709\u8f7b\u91cd\u53d8\u5316' });

    var r9 = detectUniformStructure(text);
    if (r9.detected) detections.push({ type: '\u603b\u5206\u603b\u7ed3\u6784', count: r9.summaryParas, desc: r9.summaryParas + '/' + r9.totalParas + '\u6bb5\u6709\u603b\u7ed3\u53e5(' + r9.ratio + ')\uff0c\u5efa\u8bae\u51cf\u5c11' });

    var r10 = detectGenericOpinions(text);
    if (r10.length > 0) detections.push({ type: '\u901a\u7528\u6b63\u786e\u89c2\u70b9', count: r10.length, desc: '\u68c0\u6d4b\u5230\u7a7a\u6cdb\u6b63\u786e\u8bdd\uff0c\u5efa\u8bae\u6362\u6210\u5177\u4f53\u7ecf\u5386' });

    var r11 = detectConnectorDensity(text);
    if (r11.detected) detections.push({ type: '\u8fde\u63a5\u8bcd\u5bc6\u5ea6', count: r11.total, desc: '\u6bcf\u5343\u5b57' + r11.perKChar + '\u4e2a\u8fde\u63a5\u8bcd\uff0c\u5efa\u8bae\u51cf\u5c11' });

    var r12 = detectFormalExpressions(text);
    if (r12.length > 0) detections.push({ type: '\u8fc7\u5ea6\u6b63\u5f0f\u8868\u8fbe', count: r12.length, desc: '\u68c0\u6d4b\u5230\u6a21\u677f\u5316\u6b63\u5f0f\u8868\u8fbe\uff0c\u5efa\u8bae\u53e3\u8bed\u5316' });

    var r13 = detectOverCompleteListing(text);
    if (r13.detected) detections.push({ type: '\u5217\u4e3e\u8fc7\u5b8c\u6574', count: r13.listParas, desc: r13.listParas + '/' + r13.totalParas + '\u6bb5\u5728\u5217\u4e3e\uff0c\u5efa\u8bae\u6709\u53d6\u820d' });

    // N6: Restore dialogue after processing
    text = restoreDialogue(text, dialogueData.segments);
        
    // V52: 字数保护
    var _origLen = originalText.length;
    var _procLen = text.length;
    if (_origLen > 0 && _procLen / _origLen < 0.75) {
      console.warn('[DEAI V52] Length protection: ' + _procLen + '/' + _origLen + ' = ' + Math.round(_procLen/_origLen*100) + '%');
      stats.details.push('LENGTH PROTECTION ' + Math.round(_procLen/_origLen*100) + '%');
      text = originalText;
    }

return { text: text, originalText: originalText, stats: stats, detections: detections };
  }

  return {
    setRuleConfig: function(cfg) { _ruleConfig = cfg; },
    getHardRules: function() { return HARD_RULES; },
    process: process,
    processSafe: function(text, config) {
      if (!text || text.trim().length < 10) return { text: text, originalText: text, stats: { total: 0, details: [] }, detections: [] };
      var originalText = text;
      var stats = { total: 0, details: [] };
      _ruleConfig = config || null;
      var dialogueData = protectDialogue(text);
      text = dialogueData.text;
      var r2 = fixParagraphStartPeriods(text);
      text = r2.text;
      if (r2.count > 0) { stats.details.push('修正 ' + r2.count + ' 处段首句号'); stats.total += r2.count; }
      var rnDi = _isRuleEnabled('deDiReplace') ? replaceDiWithDe(text) : { text: text, count: 0 };
      text = rnDi.text;
      if (rnDi.count > 0) { stats.details.push('替换 ' + rnDi.count + ' 处的/地'); stats.total += rnDi.count; }
      var rnDun = _isRuleEnabled('dunhaoToComma') ? dunhaoToComma(text) : { text: text, count: 0 };
      text = rnDun.text;
      if (rnDun.count > 0) { stats.details.push('替换 ' + rnDun.count + ' 处顿号'); stats.total += rnDun.count; }
      var r7dedup = deduplicateParagraphStarts(text);
      text = r7dedup.text;
      if (r7dedup.count > 0) { stats.details.push('去重 ' + r7dedup.count + ' 处句首重复'); stats.total += r7dedup.count; }
      text = restoreDialogue(text, dialogueData.segments);
      return { text: text, originalText: originalText, stats: stats, detections: [] };
    },
    fixParagraphStartPeriods: fixParagraphStartPeriods,
    mergeContinuousShortSentences: mergeContinuousShortSentences,
    detectUniformSentenceLength: detectUniformSentenceLength,
    detectEmptyOpening: detectEmptyOpening,
    removeParagraphSummaries: removeParagraphSummaries,
    deduplicateParagraphStarts: deduplicateParagraphStarts,
    breakConnectorSequences: breakConnectorSequences,
    detectConnectorPattern: detectConnectorPattern,
    detectInfoEvenness: detectInfoEvenness,
    detectUniformStructure: detectUniformStructure,
    detectGenericOpinions: detectGenericOpinions,
    detectConnectorDensity: detectConnectorDensity,
    detectFormalExpressions: detectFormalExpressions,
    detectOverCompleteListing: detectOverCompleteListing,
    dropSentenceStartPronoun: dropSentenceStartPronoun,
    mergeShortSentences: mergeShortSentences,
    reduceSensoryDensity: reduceSensoryDensity,
    dropSentenceStartNames: dropSentenceStartNames,
    createParagraphRhythmVariation: createParagraphRhythmVariation,
    repeatVerbFragment: repeatVerbFragment,
    reorderSentencesInParagraph: reorderSentencesInParagraph,
    selectDeleteExplanation: selectDeleteExplanation,
    varySentenceEndPunctuation: varySentenceEndPunctuation,
    replaceTemplateOpening: replaceTemplateOpening,
        removeNarratorIntermediary: removeNarratorIntermediary,
    causalInversion: causalInversion,
   frameStripping: frameStripping,
    replaceDiWithDe: replaceDiWithDe,
    dunhaoToComma: dunhaoToComma,
    detectAiFreqWords: detectAiFreqWords,
getMethodologyPrompt: function() { return DEAI_METHODOLOGY_PROMPT; }
  };
})();

// ================================================================
// 方法论注入层：完整降AI方法论作为创作约束
// 注入到SKILL链的system prompt中，让模型在生成阶段就遵守
// 覆盖脚本无法实现的语义规则（具体化、打破信息均匀）
// ================================================================
var DEAI_METHODOLOGY_PROMPT = "【降AI创作约束 - 生成阶段执行】\n你在生成文本时必须遵守以下降AI写作规则。这些规则来自降得快方法论（5篇完整博客提炼）：\n\n核心认知：同义词替换无效。真正影响AI特征的不是几个词，而是整篇文章的表达规律——句子排列、段落组织、信息顺序、完整度分布。只换词不改结构，检测结果不会变化。\n\n1. 直接进入主题，不要空泛开头。不要以随着...的不断发展在当今...的时代开头。第一句话就切入具体问题或场景。\n\n2. 句长要有快有慢。不要让连续三句话长度相近（差异<30%）。适当插入短句（5字以下）或长句（30字以上）。短句不是越多越好，要有快有慢。长句拆短不等于自然，机械拆分会让文字变生硬。\n\n3. 用具体替代抽象。错误：AI能够有效提高内容创作效率。正确：用具体工作、具体时间、具体动作、具体判断替代抽象表达。增加具体经历和真实过程。\n\n4. 允许段落没有结论。不要每段结尾都有总的来说由此可以看出因此我们需要。有些内容说完直接结束。每段都总结=机械感。\n\n5. 打破信息均匀。不要每个知识点篇幅差不多。熟悉的一笔带过，有经验的多讲几段，没测过的可以不提。太平均是AI文本最典型的特征。明确的取舍比全面更自然。\n\n6. 连接词不要按固定顺序。不要首先-其次-此外-最后的固定序列。有些省略，有些换成具体动作，有些合并句子。信息顺序比连接词更重要——删掉连接词但信息顺序不变=无效。\n\n7. 观点要有个人判断。不要写我们应该合理使用只有不断学习才能适应时代这类放之四海而皆准的正确话。加入明确态度和个人经验。哪些用过？哪些没效？明确说出来。\n\n8. 段落结构不要统一。不要每段都用提出观点-解释原因-列举案例-总结的同一个结构。有些段直接进案例，有些段先讲问题，有些段说完就停。\n\n9. 不要制造错误。自然不等于混乱。不要故意加语病、错别字、重复表达。保留清晰度，增加真实变化。真正的自然是加入真实经历、个人判断和轻重变化，不是故意写错。\n\n10. 小说正文特殊保护。小说降AI时不能改变：人物名字、地点、时间、等级体系、金手指设定、关键剧情、伏笔。表达可以变化，但人物关系和核心设定不能随意改变。对白要符合人物性格，动作和场景不能随意打乱。\n\n11. 对话不要太完整。AI生成的对白过于完整——角色说话时会把原因、推理和结论全部说完。真人说话通常没有那么完整。有些对话回合可以只有动作没有台词，有些可以只有台词没有动作描写。不要每个对话回合都配等量的微表情描写。有些对话之间直接连续，不加动作描写。有些回合多写几句，有些一笔带过。对话场景的轻重变化比叙述场景更重要。\n\n12. 对话中的解释性从句。角色说话时不要把因果推理全部说出来。因为...所以...、如果...就...、这意味着...这些解释性从句在对话中应该减少。让读者自己推理，不要替读者总结。角色可以说半句话，用动作或表情暗示剩下的部分。\n\n以上规则在生成时就要遷守，不是事后修改。生成阶段遷守这些规则，能从根源降低AI文本特征。";

if(typeof module!=="undefined"&&module.exports){module.exports={DeAiProcessor:DeAiProcessor,DEAI_METHODOLOGY_PROMPT:DEAI_METHODOLOGY_PROMPT};}
