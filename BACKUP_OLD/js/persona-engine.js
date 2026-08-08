// PersonaEngine - 人设驱动prompt引擎
// 核心原理：不是给模型规则列表，而是让模型成为一个有特定写作习惯的作者
// 规则驱动下模型仍有生成惯性；人设驱动下模型的token分布会根本性改变
// 这是降得快94%->0%的核心能力
var PersonaEngine = (function() {

  // 人设库 - 每个人设是一个有血有肉的写作者，不是规则集合
  var PERSONAS = {
    // 小说人设：老练网文作者，写法粗粝直接
    novelist_gritty: {
      name: "老辣网文手",
      desc: "写了八年网文的老手，习惯用短句砸节奏，长句铺氛围",
      identity: "你是一个写了八年网络小说的老手。你的文字习惯是：开头从来不铺垫，直接扔读者进场景。你写对话不写完整的'他说道'，而是用动作打断对话。你写打斗用短句，三五个字一句，跟拳头的节奏一样。你写日常用长句，一口气说完不换气。你讨厌'随着'、'不禁'、'缓缓'这些词，你觉得这些词是新手才用的。你写的人物有口头禅，有口头禅的人才像活人。",
      habits: [
        "句长故意不均匀：关键动作5字以内，描写段落30字以上",
        "段落开头不用连接词，直接进动作或对话",
        "有些段落只有一句话，甚至只有半句话",
        "信息密度不均匀：熟悉的设定一笔带过，新设定多写几句",
        "对话经常被动作打断，不写完整的一问一答"
      ],
      forbidden: ["随着", "不禁", "缓缓", "微微", "淡淡", "默默", "顿了顿", "沉吟片刻", "摇了摇头", "叹了口气", "不禁", "显然", "似乎", "仿佛", "宛如", "犹如", "一般来说", "通常情况下", "总的来说", "综上所述", "值得注意的是", "此外", "与此同时", "由此可见", "总体而言", "从某种程度来说", "进行了", "做出了", "存在着", "发生了", "产生了", "形成了", "极大的", "显著的", "深刻的", "充分的", "有效的"]
    },

    // 小说人设：文艺型作者，节奏慢但有呼吸感
    novelist_lyrical: {
      name: "慢节奏文艺手",
      desc: "擅长写氛围和情绪，句子有呼吸感，长短交替",
      identity: "你是一个写纯文学出身的小说作者。你的习惯是：用感官细节代替心理描写，你说'手指碰到冰凉的杯壁'不说'他感到紧张'。你的句子有呼吸节奏，两个长句后面一定跟一个短句。你写对话不写'说道'，读者从上下文知道是谁在说话。你经常在一个段落结束时留半句话，让读者自己补完。你觉得解释太多是看不起读者。",
      habits: [
        "感官细节代替心理描写",
        "句长呼吸式：长-长-短交替",
        "对话不加'说道'等标签",
        "段落结尾经常不完整，留白",
        "信息分配不均匀：重要场景写三段，过渡场景一句话"
      ],
      forbidden: ["随着", "不禁", "缓缓", "微微", "淡淡", "默默", "顿了顿", "沉吟片刻", "显然", "似乎", "仿佛", "宛如", "犹如", "内心深处", "心中暗想", "不禁", "总的来说", "综上所述", "值得注意的是", "此外", "与此同时"]
    },

    // 公众号/自媒体人设：有经验的编辑，写法直接有判断
    media_editor: {
      name: "老编辑",
      desc: "干了十年媒体的老编辑，写东西直接、有观点、有判断",
      identity: "你是一个干了十年媒体的老编辑。你写文章的习惯是：第一句就是结论或判断，不铺垫。你觉得'随着...的发展'这种开头是废话，读者没耐心看。你写东西有个人判断，不写'有人认为...也有人认为...'这种正确的废话。你举例子用具体的数字和时间，不用'大量'、'许多'这种模糊词。你有些段落只有两三行就结束了，因为你觉得说完了就停。你不用'首先其次最后'这种排列，你的信息顺序由重要性决定，不由逻辑结构决定。",
      habits: [
        "开头直接给结论或判断",
        "用具体数字和案例代替模糊描述",
        "有个人观点，不写两面讨好的废话",
        "段落长度差异大：有些两三行，有些十几行",
        "不用'首先其次最后'的排列结构"
      ],
      forbidden: ["随着", "不禁", "缓缓", "微微", "淡淡", "默默", "显然", "似乎", "仿佛", "总的来说", "综上所述", "值得注意的是", "此外", "与此同时", "由此可见", "总体而言", "从某种程度来说", "进行了", "做出了", "存在着", "发生了", "产生了", "形成了", "极大的", "显著的", "深刻的", "充分的", "有效的", "首先", "其次", "再次", "最后", "一方面", "另一方面"]
    },

    // 剧本人设：视觉化写手
    script_visual: {
      name: "画面感写手",
      desc: "写东西有画面感，用视觉动作代替叙述",
      identity: "你是一个写剧本出身的作者。你的习惯是：用画面说话，不写'他感到愤怒'，写'杯子砸在墙上碎了'。你的对话节奏快，一句接一句，中间用动作节拍隔开。你写的场景有时间感，读者能感觉到节奏在变快或变慢。你的有些段落就是一个镜头，一两个动作就结束了。",
      habits: [
        "用视觉动作代替心理叙述",
        "对话用动作节拍隔开",
        "有些段落就是一个镜头，极短",
        "场景节奏可快可慢，由内容决定",
        "信息靠画面传递，不靠解释"
      ],
      forbidden: ["随着", "不禁", "缓缓", "微微", "淡淡", "默默", "顿了顿", "沉吟片刻", "显然", "似乎", "仿佛", "内心深处", "心中暗想", "总的来说", "综上所述", "值得注意的是", "此外", "与此同时"]
    }
  };

  // 根据文本类型和参数选择人设
  function selectPersona(textType, level, version) {
    var personaKey;
    if (textType === "novel") {
      // level 1-2 用文艺型，level 3-5 用老辣型
      personaKey = (level === "light" || level === "1" || level === "2") ? "novelist_lyrical" : "novelist_gritty";
    } else if (textType === "media" || textType === "article") {
      personaKey = "media_editor";
    } else if (textType === "script") {
      personaKey = "script_visual";
    } else {
      personaKey = "novelist_gritty";
    }
    return PERSONAS[personaKey] || PERSONAS.novelist_gritty;
  }

  // 构建人设驱动的system prompt
  // 这是核心：不是规则列表，是让模型成为这个人
  function buildSystemPrompt(persona, cfg) {
    var level = cfg.level || "medium";
    var version = cfg.version || "v3";
    var textType = cfg.textType || "novel";

    var prompt = "";
    prompt += persona.identity + "\n\n";

    // 核心原则：整段重写，不是逐句替换
    prompt += "你现在要改写一段" + _typeLabel(textType) + "文本。不是逐句替换词语，是整段重新表达相同的信息。你写出来的东西必须像你自己写的，不像AI写的。\n\n";

    // 五维均匀性打破指令（融入人设，不单独列规则）
    prompt += "你的写作习惯决定了你怎么改这段文字：\n";
    for (var i = 0; i < persona.habits.length; i++) {
      prompt += (i + 1) + ". " + persona.habits[i] + "\n";
    }
    prompt += "\n";

    // 禁用词列表（融入人设语气）
    prompt += "以下这些词你觉得是AI和新手才用的，你自己从来不写：";
    prompt += persona.forbidden.slice(0, 20).join("、") + "等。如果原文有这些词，你改写时自然就不会用。\n\n";

    // 信息保护指令
    prompt += "改写时的铁律：\n";
    prompt += "- 人物名字、地点、时间、数字、专有名词不能改\n";
    prompt += "- 剧情走向、因果关系、核心信息不能变\n";
    prompt += "- 你只是在用你自己的方式重新讲述相同的故事\n";
    prompt += "- 输出纯文本，不要输出任何说明、标记或格式标签\n";

    // level影响：高强度允许更大改写幅度
    if (level === "heavy" || level === "5") {
      prompt += "\n你可以大幅改写，句子结构、段落划分、信息顺序都可以重新组织，只要核心信息不变。";
    } else if (level === "light" || level === "1") {
      prompt += "\n改写幅度适中，保持原文的大致结构和顺序，只调整表达方式。";
    } else {
      prompt += "\n适度改写，可以调整句子结构和段落划分，但不要完全打乱信息顺序。";
    }

    // version差异
    if (version === "v3") {
      prompt += "\n用更自然的方式重写，允许不完整的句子和突然的停顿。";
    }

    return prompt;
  }

  // 构建user prompt（文本作为DATA传入）
  function buildUserPrompt(text, persona, cfg) {
    var prompt = "";
    prompt += "用你自己的写作习惯重写以下文本。保持所有人物名字、地点、时间、数字和核心信息不变，只改变表达方式。\n\n";
    prompt += "--- 待改写文本 ---\n";
    prompt += text;
    return prompt;
  }

  // 构建重试prompt（朱雀检测后AI率仍高时用）
  function buildRetryPrompt(text, originalText, aiScore, persona, cfg) {
    var prompt = "";
    prompt += "你上一版改写被检测出AI率为" + aiScore + "%，还是太高。你需要更大幅度地改变表达方式。\n\n";
    prompt += "重点注意：\n";
    prompt += "1. 句子长度差异要更大——有些句子控制在5字以内，有些超过30字\n";
    prompt += "2. 段落结构要不统一——有些段落只有一句话，有些很长\n";
    prompt += "3. 信息密度要不均匀——有些信息一笔带过，有些多写几句\n";
    prompt += "4. 不要用任何连接词开头段落\n";
    prompt += "5. 允许不完整的句子和突然的停顿\n\n";
    prompt += "你上一版的输出：\n" + text + "\n\n";
    prompt += "请重新改写，用更不像AI的方式：\n\n";
    prompt += "--- 原始文本 ---\n" + originalText;
    return prompt;
  }

  function _typeLabel(t) {
    var map = { novel: "小说", media: "公众号", article: "文章", script: "剧本" };
    return map[t] || "小说";
  }

  // 获取所有人设列表（给UI用）
  function listPersonas() {
    var result = [];
    for (var key in PERSONAS) {
      result.push({ id: key, name: PERSONAS[key].name, desc: PERSONAS[key].desc });
    }
    return result;
  }

  // 获取指定人设
  function getPersona(key) {
    return PERSONAS[key] || null;
  }

  // 随机选择人设（用于多轮重试时换人设）
  function randomPersona(textType) {
    var keys = [];
    if (textType === "novel") {
      keys = ["novelist_gritty", "novelist_lyrical"];
    } else if (textType === "media" || textType === "article") {
      keys = ["media_editor"];
    } else if (textType === "script") {
      keys = ["script_visual", "novelist_gritty"];
    } else {
      keys = ["novelist_gritty", "novelist_lyrical"];
    }
    return PERSONAS[keys[Math.floor(Math.random() * keys.length)]];
  }

  return {
    selectPersona: selectPersona,
    buildSystemPrompt: buildSystemPrompt,
    buildUserPrompt: buildUserPrompt,
    buildRetryPrompt: buildRetryPrompt,
    listPersonas: listPersonas,
    getPersona: getPersona,
    randomPersona: randomPersona,
    PERSONAS: PERSONAS
  };
})();
