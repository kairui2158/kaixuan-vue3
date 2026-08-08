var SkillValidators = (function() {

  function _tryParseJSON(text) {
    if (!text) return null;
    var cleaned = text.trim();
    var jsonStart = cleaned.indexOf("[");
    var jsonEnd = cleaned.lastIndexOf("]");
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
    } else {
      jsonStart = cleaned.indexOf("{");
      jsonEnd = cleaned.lastIndexOf("}");
      if (jsonStart >= 0 && jsonEnd > jsonStart) {
        cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
      }
    }
    try { return JSON.parse(cleaned); }
    catch(e) { return null; }
  }

  function _extractFirstSubject(txt) {
    if (!txt) return "";
    var firstLine = txt.trim().split(/[。！？\n]/)[0];
    var pronouns = ["他", "她", "它", "我", "你"];
    for (var pi = 0; pi < pronouns.length; pi++) {
      if (firstLine.indexOf(pronouns[pi]) >= 0) return pronouns[pi];
    }
    var m = firstLine.match(/^[一-龥]{2,3}/);
    return m ? m[0] : firstLine.substring(0, 3);
  }

  var validators = {

    json_array: function(output, originalInput, config, opts) {
      var parsed = _tryParseJSON(output);
      if (parsed === null) {
        return { ok: false, hint: "output is not valid JSON, please output a JSON array" };
      }
      if (!Array.isArray(parsed)) {
        return { ok: false, hint: "expected a JSON array but got " + typeof parsed };
      }
      return { ok: true, data: parsed };
    },

    exact_count: function(output, originalInput, config, opts) {
      var expected = config.value;
      var parsed = _tryParseJSON(output);
      if (parsed === null || !Array.isArray(parsed)) {
        return { ok: false, hint: "cannot verify count: output is not a JSON array" };
      }
      var actual = parsed.length;
      if (actual !== expected) {
        return {
          ok: false,
          hint: "expected exactly " + expected + " items but got " + actual + ", please adjust to exactly " + expected
        };
      }
      return { ok: true };
    },

    field_exists: function(output, originalInput, config, opts) {
      var fields = config.fields || [];
      var itemLabel = config.itemLabel || "item";
      var parsed = _tryParseJSON(output);
      if (parsed === null || !Array.isArray(parsed)) {
        return { ok: false, hint: "cannot verify fields: output is not a JSON array" };
      }
      var missing = [];
      for (var i = 0; i < parsed.length; i++) {
        for (var fi = 0; fi < fields.length; fi++) {
          var f = fields[fi];
          if (!parsed[i][f] && parsed[i][f] !== 0) {
            missing.push(itemLabel + " " + (i + 1) + " 缺少字段: " + f);
          }
        }
      }
      if (missing.length > 0) {
        return { ok: false, hint: missing.slice(0, 5).join("; ") };
      }
      return { ok: true };
    },

    min_length: function(output, originalInput, config, opts) {
      var min = config.value || 100;
      var actual = (output || "").trim().length;
      if (actual < min) {
        return { ok: false, hint: "output too short: " + actual + " chars, minimum is " + min };
      }
      return { ok: true };
    },

    first_subject_different: function(output, originalInput, config, opts) {
      if (!output || !originalInput) return { ok: true };
      var origSubj = _extractFirstSubject(originalInput);
      var outSubj = _extractFirstSubject(output);
      if (origSubj && outSubj && origSubj === outSubj) {
        return { ok: false, hint: "first subject (" + origSubj + ") matches original, please change perspective" };
      }
      return { ok: true };
    },

    event_core_count: function(output, originalInput, config, opts) {
      if (!output || output.trim().length < 20) return { ok: false, hint: "output too short for event cores" };
      var coreCount = (output.match(/段\d+/g) || []).length;
      var paraCount = (originalInput || "").split(/\n/).filter(function(p) { return p.trim().length > 10; }).length;
      var minCores = Math.max(1, Math.floor(paraCount * 0.7));
      if (coreCount < minCores) {
        return { ok: false, hint: "event cores too few: " + coreCount + ", need at least " + minCores };
      }
      return { ok: true };
    },

    perspective_rotation: function(output, originalInput, config, opts) {
      if (!output) return { ok: true };
      var methods = output.match(/(换主语|视点转移|因果倒置|存在句转换)/g) || [];
      if (methods.length < 3) return { ok: true };
      for (var i = 0; i < methods.length - 2; i++) {
        if (methods[i] === methods[i + 1] && methods[i + 1] === methods[i + 2]) {
          return { ok: false, hint: "perspective method repeated 3 times in a row: " + methods[i] };
        }
      }
      return { ok: true };
    },

    cross_model_check: async function(output, originalInput, config, opts) {
      if (!opts || !opts.verifyProvider || !opts.aiRequest) return { ok: true };
      var verifyProvider = opts.verifyProvider;
      var prompt = "请检查以下重述是否真正改变了句式结构，不是简单换词。" + "\n" +
        "判断标准：" + "\n" +
        "1. 不是简单换词，句式结构有变化" + "\n" +
        "2. 首句主语与原文不同" + "\n" +
        "3. 信息完整性保留" + "\n\n" +
        "原文：" + "\n" + (originalInput || "").slice(0, 800) + "\n\n" +
        "重述：" + "\n" + (output || "").slice(0, 800) + "\n\n" +
        '输出JSON: {"pass": true/false, "issues": ["问题1"], "score": 85}';
      try {
        var result = await opts.aiRequest({
          messages: [{ role: "system", content: "你是文本质量审核专家，只输出JSON" },
                     { role: "user", content: prompt }],
          model: verifyProvider.model || null,
          maxTokens: 500,
          stream: false,
          baseUrl: verifyProvider.baseUrl,
          apiKey: verifyProvider.apiKey
        });
        var check = _tryParseJSON(result.text || result);
        if (check && check.pass === false) {
          return { ok: false, hint: (check.issues || ["cross-model check failed"]).join("; "), score: check.score };
        }
        return { ok: true, score: check ? check.score : null };
      } catch(e) {
        console.warn("[WARN] cross_model_check failed", e);
        return { ok: true };
      }
    },

    zhuque_check: async function(output, originalInput, config, opts) {
      if (!opts || !opts.zhuqueProvider) return { ok: true };
      var zhuque = opts.zhuqueProvider;
      try {
        var resp = await fetch(zhuque.baseUrl || "https://matrix.tencent.com/ai-detect/api", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: output })
        });
        var data = await resp.json();
        var aiRate = (data.ai_rate !== undefined) ? data.ai_rate : (data.score !== undefined ? data.score : 0);
        var threshold = config.threshold || 30;
        if (aiRate > threshold) {
          return { ok: false, hint: "AI rate still high: " + aiRate + "% (threshold: " + threshold + "%)", aiRate: aiRate };
        }
        return { ok: true, aiRate: aiRate };
      } catch(e) {
        console.warn("[WARN] zhuque_check failed", e);
        return { ok: true };
      }
    },

    field_min_length: function(output, originalInput, config, opts) {
      var field = config.field || "";
      var min = config.value || 1;
      var itemLabel = config.itemLabel || "item";
      var requirement = config.requirement || "";
      var parsed = _tryParseJSON(output);
      if (parsed === null || !Array.isArray(parsed)) {
        return { ok: false, hint: "cannot verify field length: output is not a JSON array" };
      }
      var issues = [];
      for (var i = 0; i < parsed.length; i++) {
        var val = parsed[i][field];
        if (val === undefined || val === null || String(val).trim() === "") {
          if (min <= 1) {
            issues.push(itemLabel + " " + (i + 1) + " 的" + field + "为空");
          } else {
            issues.push(itemLabel + " " + (i + 1) + " 缺少字段: " + field);
          }
        } else {
          var actualLen = String(val).trim().length;
          if (actualLen < min) {
            var hintMsg = itemLabel + " " + (i + 1) + " 的" + field + "字段内容过短(" + actualLen + "字)";
            if (requirement) {
              hintMsg += "，需要至少" + min + "字包含" + requirement;
            } else {
              hintMsg += "，需要至少" + min + "字";
            }
            issues.push(hintMsg);
          }
        }
      }
      if (issues.length > 0) {
        return { ok: false, hint: issues.slice(0, 5).join("; ") };
      }
      return { ok: true };
    },

    json_escape_valid: function(output, originalInput, config, opts) {
      if (!output) return { ok: true };
      var cleaned = output.trim();
      var jsonStart = cleaned.indexOf("[");
      var jsonEnd = cleaned.lastIndexOf("]");
      if (jsonStart < 0 || jsonEnd <= jsonStart) return { ok: true };
      var jsonText = cleaned.substring(jsonStart, jsonEnd + 1);
      var inString = false;
      var escape = false;
      var literalNewline = false;
      for (var ci = 0; ci < jsonText.length; ci++) {
        var ch = jsonText.charAt(ci);
        if (escape) { escape = false; continue; }
        if (ch === "\\") { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString && (ch === "\n" || ch === "\r")) {
          literalNewline = true;
          break;
        }
      }
      if (literalNewline) {
        return { ok: false, hint: "JSON字符串值内存在未转义的换行符，请使用\\n表示换行" };
      }
      try { JSON.parse(jsonText); }
      catch(e) {
        return { ok: false, hint: "JSON解析错误: " + e.message + "，请转义双引号为\\\"或使用中文引号" };
      }
      return { ok: true };
    },

    prose_metadata_exists: function(output, originalInput, config, opts) {
      if (!output) return { ok: false, hint: "输出为空" };
      var markers = config.markers || ["【骨架完毕】"];
      var text = output.trim();
      var lastLines = text.split("\n").slice(-5).join("\n");
      var found = false;
      for (var mi = 0; mi < markers.length; mi++) {
        if (lastLines.indexOf(markers[mi]) >= 0) { found = true; break; }
      }
      if (!found) {
        return { ok: false, hint: "输出末尾缺少元数据标记行" + markers.join("/") + "，请补充结构化元数据行" };
      }
      return { ok: true };
    },

    prose_scene_count_match: function(output, originalInput, config, opts) {
      if (!output) return { ok: true };
     var lastLines = output.trim().split("\n").slice(-5).join("\n");
      var match = lastLines.match(/处理场景数[：:]\s*(\d+)\s*\/\s*(\d+)/);
      if (!match) { match = lastLines.match(/场景数[：:]\s*(\d+)\s*\/\s*(\d+)/); }
      if (!match) return { ok: true };
      var actual = parseInt(match[1], 10);
      var expected = parseInt(match[2], 10);
      if (actual < expected) {
        var diff = expected - actual;
        return { ok: false, hint: "场景数不匹配：实际处理" + actual + "个场景，骨架声明" + expected + "个场景，缺少" + diff + "个场景。请补全缺失场景的正文。" };
      }
      return { ok: true };
    },

    prose_min_length: function(output, originalInput, config, opts) {
      if (!output) return { ok: false, hint: "输出为空" };
      var min = config.value || 1000;
      var actual = output.trim().length;
      if (actual < min) {
        return { ok: false, hint: "正文长度" + actual + "字，低于最小要求" + min + "字。请继续生成未完成的正文部分。" };
      }
      return { ok: true };
    },

    analysis_word_detection: function(output, originalInput, config, opts) {
      if (!output) return { ok: true };
      var words = config.words || ["我需要", "首先", "让我", "接下来", "现在", "根据", "我们来", "我将", "我会", "首先我", "然后我", "接着我"];
      var lines = output.split("\n");
      var proseLines = lines.filter(function(l) { return l.trim().length > 0 && l.indexOf("【") !== 0 && l.indexOf("---") !== 0; });
      var first500 = proseLines.join("\n").substring(0, 500);
      for (var wi = 0; wi < words.length; wi++) {
        if (first500.indexOf(words[wi]) >= 0) {
          return { ok: false, hint: "输出中检测到分析引导词'" + words[wi] + "'，违反输出铁律。请删除分析过程，只输出成品正文/骨架。" };
        }
      }
      return { ok: true };
    }
  };

  return validators;
})();

console.log("[OK] SkillValidators loaded");
