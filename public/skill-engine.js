var SkillExecutionEngine_IIFE = (function() {
  var NL = String.fromCharCode(10);

  function _splitText(text, targetSize) {
    var minSize = Math.floor(targetSize * 0.7);
    var maxSize = Math.floor(targetSize * 1.3);
    var segments = [];
    var paragraphs = text.split("\n");
    var currentChunk = "";
    var currentConnector = "";
    var nextConnector = "";
    for (var pi = 0; pi < paragraphs.length; pi++) {
      var para = paragraphs[pi];
      if (para.length === 0) { currentConnector += NL; continue; }
      var potentialLen = currentChunk.length + para.length + currentConnector.length;
      if (currentChunk.length >= minSize && potentialLen > maxSize) {
        segments.push({ text: currentChunk, connector: nextConnector });
        nextConnector = currentConnector;
        currentChunk = para;
        currentConnector = NL;
      } else {
        currentChunk += currentConnector + para;
        currentConnector = NL;
      }
      while (currentChunk.length > maxSize) {
        var cutStart = minSize;
        var sentenceEnd = -1;
        var sentenceChars = ["。", "！", "？", "…", ".", "!", "?", NL];
        for (var s = cutStart; s < currentChunk.length && s < maxSize + 200; s++) {
          if (sentenceChars.indexOf(currentChunk.charAt(s)) >= 0) { sentenceEnd = s + 1; break; }
        }
        if (sentenceEnd < 0) {
          for (var sb = maxSize; sb > minSize; sb--) {
            if (sentenceChars.indexOf(currentChunk.charAt(sb)) >= 0) { sentenceEnd = sb + 1; break; }
          }
        }
        if (sentenceEnd < 0) sentenceEnd = maxSize;
        var part1 = currentChunk.substring(0, sentenceEnd);
        var part2 = currentChunk.substring(sentenceEnd);
        segments.push({ text: part1, connector: nextConnector });
        nextConnector = "";
        currentChunk = part2;
        currentConnector = "";
      }
    }
    if (currentChunk.length > 0) { segments.push({ text: currentChunk, connector: nextConnector }); }
    if (segments.length > 1 && segments[segments.length - 1].text.length < minSize / 2) {
      var last = segments.pop();
      segments[segments.length - 1].text += last.connector + last.text;
    }
    var overlapSize = Math.min(150, Math.floor(targetSize * 0.15));
    for (var oi = 1; oi < segments.length; oi++) {
      var prevText = segments[oi - 1].text;
      var overlapText = prevText.substring(Math.max(0, prevText.length - overlapSize));
      var sentEnds = ["。", "！", "？", NL];
      for (var se = 0; se < sentEnds.length; se++) {
        var lastSent = overlapText.lastIndexOf(sentEnds[se]);
        if (lastSent >= 0 && lastSent > overlapText.length / 2) { overlapText = overlapText.substring(lastSent + 1); break; }
      }
      segments[oi].overlapContext = overlapText;
    }
    return segments;
  }

  async function _parallelMap(items, fn, concurrency, onProgress) {
    var results = new Array(items.length);
    var idx = 0;
    var completed = 0;
    var cancelled = false;
    async function worker() {
      while (idx < items.length && !cancelled) {
        var myIdx = idx++;
        try { results[myIdx] = await fn(items[myIdx], myIdx); }
        catch(e) { console.warn("[WARN] parallelMap item " + myIdx + " failed", e); results[myIdx] = items[myIdx].text || items[myIdx] || ""; }
        completed++;
        if (onProgress) onProgress(completed / items.length);
      }
    }
    var workers = [];
    for (var w = 0; w < Math.min(concurrency, items.length); w++) workers.push(worker());
    await Promise.all(workers);
    return results;
  }

  function _extractFirstSubject(txt) {
    if (!txt) return "";
    var firstLine = txt.trim().split(/[。！？\n]/)[0];
    var pronouns = ["他", "她", "它", "我", "你"];
    for (var pi = 0; pi < pronouns.length; pi++) { if (firstLine.indexOf(pronouns[pi]) >= 0) return pronouns[pi]; }
    var m = firstLine.match(/^[一-龥]{2,3}/);
    return m ? m[0] : firstLine.substring(0, 3);
  }

  function _lookupPath(context, path) {
    if (!context || !path) return undefined;
    var parts = path.split(".");
    var cur = context;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function _valText(val) {
    if (val === null || val === undefined) return "";
    if (typeof val === "object") {
      try { return JSON.stringify(val); } catch(e) { return String(val); }
    }
    return String(val);
  }

  function _isCondTrue(expr, context) {
    expr = (expr || "").trim();
    var negate = false;
    if (expr.charAt(0) === "!") {
      negate = true;
      expr = expr.substring(1).trim();
    }
    if (expr === "") return false;
    var val = _lookupPath(context, expr);
    var truthy = !(val === undefined || val === null || val === "" || val === false || val === 0 ||
      (typeof val === "object" && Object.keys(val).length === 0));
    return negate ? !truthy : truthy;
  }

  function resolveTemplate(template, context, opts) {
    template = template || "";
    context = context || {};
    opts = opts || {};
    var missing = opts.keepMissing !== false;
    var out = "";
    var i = 0;
    var len = template.length;
    var guard = 0;
    while (i < len && guard++ < 100000) {
      var open = template.indexOf("{{", i);
      if (open < 0) { out += template.substring(i); break; }
      var close = template.indexOf("}}", open + 2);
      if (close < 0) { out += template.substring(i); break; }
      out += template.substring(i, open);
      var raw = template.substring(open + 2, close).trim();
      var lower = raw.toLowerCase();
      if (lower.indexOf("if ") === 0) {
        var condExpr = raw.substring(3).trim();
        var scanPos = close + 2;
        var depth = 1;
        var elsePos = -1;
       var elseClose = -1;
        var endifOpen = -1;
        var endPos = -1;
        var scanGuard = 0;
        while (scanPos < len && scanGuard++ < 100000) {
          var nOpen = template.indexOf("{{", scanPos);
          if (nOpen < 0) break;
          var nClose = template.indexOf("}}", nOpen + 2);
          if (nClose < 0) break;
          var nTag = template.substring(nOpen + 2, nClose).trim();
          var nLower = nTag.toLowerCase();
          if (nLower.indexOf("if ") === 0) {
            depth++;
         } else if (nLower.indexOf("endif") === 0) {
            depth--;
            if (depth === 0) { endifOpen = nOpen; endPos = nClose + 2; break; }
          } else if (nLower.indexOf("else") === 0 && depth === 1 && elsePos < 0) {
            elsePos = nOpen;
            elseClose = nClose;
          }
          scanPos = nClose + 2;
        }
        if (endPos < 0) {
          out += template.substring(open);
          break;
        }
        var sectionEnd = endPos - 2;
        var condTrue = _isCondTrue(condExpr, context);
        var trueBody = elsePos >= 0 ? template.substring(close + 2, elsePos) : template.substring(close + 2, endifOpen);
        var falseBody = elsePos >= 0 ? template.substring(elseClose + 2, endifOpen) : "";
        out += condTrue ? resolveTemplate(trueBody, context, opts) : resolveTemplate(falseBody, context, opts);
        i = endPos;
        continue;
      }
      if (lower.indexOf("else") === 0 || lower.indexOf("endif") === 0) {
        out += template.substring(open, close + 2);
        i = close + 2;
        continue;
      }
      var pipeIdx = raw.indexOf("|");
      var varPath = (pipeIdx >= 0 ? raw.substring(0, pipeIdx) : raw).trim();
      var fallback = pipeIdx >= 0 ? raw.substring(pipeIdx + 1) : null;
      var rawVal = _lookupPath(context, varPath);
      if (rawVal === undefined || rawVal === null || rawVal === "") {
        if (fallback !== null) out += fallback;
        else if (missing) out += template.substring(open, close + 2);
      } else {
        out += _valText(rawVal);
      }
      i = close + 2;
    }
    return out;
  }

  async function _callStep(skill, userInput, opts) {
    // Priority: opts.systemPrompt (from agent) > skill.template > default
    var rawContent = (opts && opts.systemPrompt) || (skill && skill.template) || "你是专业的文本处理专家。只输出处理结果，不输出说明。";
    var sysContent = rawContent;
    if (opts && opts.templateContext) {
      var skillCtx = opts.templateContext;
      if (skill && skill.customVars && typeof skill.customVars === "object") {
        var merged = {};
        for (var mk in opts.templateContext) merged[mk] = opts.templateContext[mk];
        for (var cvk in skill.customVars) merged[cvk] = skill.customVars[cvk];
        skillCtx = merged;
      }
      try { sysContent = resolveTemplate(rawContent, skillCtx, { keepMissing: false }); }
      catch(eT) { console.warn("[WARN] resolveTemplate failed, using raw template", eT); }
    }
    var userContent = userInput;
    if (opts.paramPrefix) userContent = opts.paramPrefix + userContent;
    var result = await opts.aiRequest({
      messages: [{ role: "system", content: sysContent }, { role: "user", content: userContent }],
      model: opts.model || null,
      temperature: opts.temperature != null ? opts.temperature : null,
      maxTokens: opts.maxTokens || 128000,
      stream: opts.stream !== false,
      onChunk: opts.onChunk || null,
      signal: opts.signal || null
    });
    return (result && result.text) ? result.text : (typeof result === "string" ? result : "");
  }

  async function _runValidator(validator, output, originalInput, opts) {
    if (!validator) return { ok: true };
    if (typeof validator === "function") {
      try { return await validator(output, originalInput, opts); }
      catch(e) { console.warn("[WARN] validator function failed", e); return { ok: true }; }
    }
    if (typeof validator === "object" && validator.type && window.SkillValidators) {
      var fn = window.SkillValidators[validator.type];
      if (!fn) return { ok: true };
      try { return await fn(output, originalInput, validator, opts); }
      catch(e) { console.warn("[WARN] validator " + validator.type + " failed", e); return { ok: true }; }
    }
    return { ok: true };
  }

  async function chain(input, skills, opts) {
    opts = opts || {};
    var text = input;
    var reports = [];
    for (var si = 0; si < skills.length; si++) {
      var skill = skills[si];
      if (!skill) { reports.push({ step: si + 1, totalSteps: skills.length, skillName: "(missing)", text: text, error: "skill not found" }); continue; }
      var prevText = text;
      var stepLabel = "[Skill " + (si + 1) + "/" + skills.length + ": " + skill.name + "]";
      console.log("[ENGINE] Chain step " + (si + 1) + "/" + skills.length + ": " + skill.name);
      if (opts.onProgress) opts.onProgress(si, skills.length, "active");
      var chainPrompt;
      if (si === 0) {
        chainPrompt = text + NL + NL + "--- skill constraint ---" + NL + stepLabel + ": " + (skill.template || "");
      } else {
        chainPrompt = "以下是上一个skill的输出结果，请根据当前skill进行处理：" + NL + NL + stepLabel + ": " + (skill.template || "") + NL + NL + "--- previous output ---" + NL + text;
      }
      try {
        var result = await _callStep(skill, chainPrompt, opts);
        text = result;
        if (!text) { console.warn("[WARN] Chain step " + (si + 1) + " returned empty, keeping previous"); text = prevText; }
        if (opts.templateContext) opts.templateContext.prevResponse = text;
        if (opts.validators && opts.validators[si]) {
          var vResult = await _runValidator(opts.validators[si], text, prevText, opts);
          if (!vResult.ok) {
            console.warn("[WARN] Chain step " + (si + 1) + " validation failed, retrying");
            if (opts.onProgress) opts.onProgress(si, skills.length, "retry");
            var retryPrompt = chainPrompt;
            if (vResult.hint) retryPrompt += NL + NL + "[validation feedback: " + vResult.hint + "]";
            try {
              text = await _callStep(skill, retryPrompt, opts);
              if (opts.templateContext) opts.templateContext.prevResponse = text;
            }
            catch(eR) { console.warn("[WARN] retry failed for step " + (si + 1), eR); text = prevText; }
          }
        }
        reports.push({ step: si + 1, totalSteps: skills.length, skillName: skill.name, text: text, validation: vResult || { ok: true } });
      } catch(stepErr) {
        console.error("[ERR] Chain step " + (si + 1) + " failed: " + stepErr.message);
        text = prevText;
        reports.push({ step: si + 1, totalSteps: skills.length, skillName: skill.name, text: text, error: stepErr.message });
      }
     if (opts.onProgress) opts.onProgress(si + 1, skills.length, "done");
   }
    if (opts.finalValidators && opts.finalValidators.length > 0 && skills.length > 0) {
      var lastSkill = skills[skills.length - 1];
      for (var fvi = 0; fvi < opts.finalValidators.length; fvi++) {
        var fvConfig = opts.finalValidators[fvi];
        var fvResult = await _runValidator(fvConfig, text, input, opts);
        if (!fvResult.ok) {
          console.warn("[WARN] Final validation " + fvi + " failed: " + (fvResult.hint || ""));
          if (lastSkill) {
            var fvRetryPrompt = "以下是上一个skill的输出结果，请根据当前skill进行处理：" + NL + NL + "[Skill " + skills.length + "/" + skills.length + ": " + (lastSkill.name || "") + "]" + NL + (lastSkill.template || "") + NL + NL + "--- previous output ---" + NL + text + NL + NL + "[validation feedback: " + (fvResult.hint || "") + "]";
            try {
              var fvRetryResult = await _callStep(lastSkill, fvRetryPrompt, opts);
              if (fvRetryResult) text = fvRetryResult;
            } catch(eFV) { console.warn("[WARN] Final validation retry failed", eFV); }
          }
        }
      }
    }
    return { text: text, reports: reports };
  }

  async function splitMerge(input, skills, opts) {
    opts = opts || {};
    var outputSkill = skills[0];
    if (!outputSkill) { return { text: input, reports: [] }; }
    var splitSize = opts.splitSize || 1000;
    var segments = _splitText(input, splitSize);
    if (segments.length === 0) return { text: input, reports: [] };
    console.log("[ENGINE] splitMerge: " + segments.length + " segments, splitSize=" + splitSize);
    var segTexts = segments.map(function(s) { return s.text; });
    var segOverlaps = segments.map(function(s) { return s.overlapContext || ""; });
    var stepInputs = segTexts.map(function(t, i) {
      return segOverlaps[i] ? "[context from previous, do not output this part]" + NL + segOverlaps[i] + NL + NL + t : t;
    });
    if (opts.onProgress) opts.onProgress(0, stepInputs.length, "active");
    var results = await _parallelMap(stepInputs, function(seg) {
      var segPrompt = seg + NL + NL + "--- skill constraint ---" + NL + (outputSkill.template || "");
      return _callStep(outputSkill, segPrompt, opts);
    }, 3, function(ratio) { if (opts.onProgress) opts.onProgress(Math.floor(ratio * stepInputs.length), stepInputs.length, "processing"); });
   var mergedText = results.join(NL + NL);
   if (skills.length > 1 && skills[1]) {
     console.log("[ENGINE] splitMerge: running merge skill");
     if (opts.onProgress) opts.onProgress(0, 1, "merging");
     var mergePrompt = mergedText + NL + NL + "--- skill constraint ---" + NL + (skills[1].template || "");
     mergedText = await _callStep(skills[1], mergePrompt, opts);
   }
   if (opts.finalValidators && opts.finalValidators.length > 0) {
     for (var fvi = 0; fvi < opts.finalValidators.length; fvi++) {
       var fvResult = await _runValidator(opts.finalValidators[fvi], mergedText, input, opts);
       if (!fvResult.ok) {
         console.warn("[WARN] splitMerge final validation " + fvi + " failed: " + (fvResult.hint || ""));
         var fvRetryPrompt = mergedText + NL + NL + "--- skill constraint ---" + NL + (outputSkill.template || "") + NL + NL + "[validation feedback: " + (fvResult.hint || "") + "]";
         try { var fvRetryResult = await _callStep(outputSkill, fvRetryPrompt, opts); if (fvRetryResult) mergedText = fvRetryResult; } catch(eFV) { console.warn("[WARN] splitMerge final validation retry failed", eFV); }
       }
     }
   }
   if (opts.onProgress) opts.onProgress(1, 1, "done");
   return { text: mergedText, reports: [{ step: 1, totalSteps: 1, skillName: outputSkill.name + " (split-merge)", text: mergedText }] };
  }

  async function multiStep(input, skills, opts) {
    opts = opts || {};
    if (!skills[0] || !skills[1] || !skills[2]) { console.warn("[WARN] multiStep needs at least 3 skills"); return { text: input, reports: [] }; }
    var hasS2 = skills.length >= 4 && skills[3];
    var splitSize = opts.splitSize || 1500;
    var segments = _splitText(input, splitSize);
    if (segments.length === 0) return { text: input, reports: [] };
    var segTexts = segments.map(function(s) { return s.text; });
    var segOverlaps = segments.map(function(s) { return s.overlapContext || ""; });
    var origSubjects = segTexts.map(_extractFirstSubject);
    var reports = [];
    console.log("[ENGINE] multiStep: " + segments.length + " segments, " + skills.length + " skills");

    var step1Inputs = segTexts.map(function(t, i) {
      return segOverlaps[i] ? "[context]" + NL + segOverlaps[i] + NL + NL + t : t;
    });
    if (opts.onProgress) opts.onProgress(0, 4, "phase1");
    var step1Outputs = await _parallelMap(step1Inputs, function(seg) {
      return _callStep(skills[0], seg, opts);
    }, 3, function(r) { if (opts.onProgress) opts.onProgress(r * 1, 4, "phase1"); });
    for (var v1 = 0; v1 < step1Outputs.length; v1++) {
      if (opts.validators && opts.validators[0]) {
        var vr1 = await _runValidator(opts.validators[0], step1Outputs[v1], segTexts[v1], opts);
        if (!vr1.ok) {
          console.warn("[WARN] S1A validation failed seg " + v1 + ", retrying");
          try { step1Outputs[v1] = await _callStep(skills[0], segTexts[v1] + (vr1.hint ? NL + NL + "[" + vr1.hint + "]" : ""), opts); } catch(eR1) {}
        }
      }
    }
    reports.push({ step: 1, totalSteps: skills.length, skillName: skills[0].name, text: step1Outputs.join(NL), phase: "event_core" });

    if (opts.onProgress) opts.onProgress(1, 4, "phase2");
    var step2Outputs = await _parallelMap(step1Outputs, function(inp) {
      return _callStep(skills[1], inp, opts);
    }, 3, function(r) { if (opts.onProgress) opts.onProgress(1 + r * 1, 4, "phase2"); });
    if (opts.validators && opts.validators[1]) {
      for (var v2 = 0; v2 < step2Outputs.length; v2++) {
        var vr2 = await _runValidator(opts.validators[1], step2Outputs[v2], step1Outputs[v2], opts);
        if (!vr2.ok) console.warn("[WARN] S1B validation issue seg " + v2 + ": " + (vr2.hint || ""));
      }
    }
    reports.push({ step: 2, totalSteps: skills.length, skillName: skills[1].name, text: step2Outputs.join(NL), phase: "perspective" });

    if (opts.onProgress) opts.onProgress(2, 4, "phase3");
    var step3Outputs = await _parallelMap(step2Outputs, function(inp) {
      return _callStep(skills[2], inp, opts);
    }, 3, function(r) { if (opts.onProgress) opts.onProgress(2 + r * 1, 4, "phase3"); });
    for (var v3 = 0; v3 < step3Outputs.length; v3++) {
      var s3subj = _extractFirstSubject(step3Outputs[v3]);
      if (s3subj === origSubjects[v3] && origSubjects[v3].length > 0) {
        console.warn("[WARN] S1C first subject same (" + origSubjects[v3] + "), retrying seg " + v3);
        try { step3Outputs[v3] = await _callStep(skills[2], step2Outputs[v3] + NL + NL + "[note: first subject matches original, please change perspective]", opts); } catch(eR3) {}
      }
      if (opts.validators && opts.validators[2]) {
        var vr3 = await _runValidator(opts.validators[2], step3Outputs[v3], segTexts[v3], opts);
        if (!vr3.ok && vr3.hint) {
          try { step3Outputs[v3] = await _callStep(skills[2], step2Outputs[v3] + NL + NL + "[" + vr3.hint + "]", opts); } catch(eR3b) {}
        }
      }
    }
    reports.push({ step: 3, totalSteps: skills.length, skillName: skills[2].name, text: step3Outputs.join(NL), phase: "rewrite" });

    var mergedText = step3Outputs.join(NL + NL);

    if (hasS2) {
      if (opts.onProgress) opts.onProgress(3, 4, "phase4");
      try {
        var s2Input = mergedText;
        if (typeof DeAiSamples !== "undefined") { try { s2Input += NL + NL + "[style samples]" + NL + DeAiSamples.getSampleText(); } catch(eS) {} }
        mergedText = await _callStep(skills[3], s2Input, opts);
      } catch(e4) { console.warn("[WARN] multi-step S2 failed", e4); }
      reports.push({ step: 4, totalSteps: skills.length, skillName: skills[3].name, text: mergedText, phase: "verify" });
   }

   if (opts.finalValidators && opts.finalValidators.length > 0) {
     var lastMSkill = hasS2 ? skills[3] : skills[2];
     for (var msFvi = 0; msFvi < opts.finalValidators.length; msFvi++) {
       var msFvResult = await _runValidator(opts.finalValidators[msFvi], mergedText, input, opts);
       if (!msFvResult.ok) {
         console.warn("[WARN] multiStep final validation " + msFvi + " failed: " + (msFvResult.hint || ""));
         if (lastMSkill) {
           var msFvRetryPrompt = mergedText + NL + NL + "--- skill constraint ---" + NL + (lastMSkill.template || "") + NL + NL + "[validation feedback: " + (msFvResult.hint || "") + "]";
           try { var msFvRetryResult = await _callStep(lastMSkill, msFvRetryPrompt, opts); if (msFvRetryResult) mergedText = msFvRetryResult; } catch(eMSFV) { console.warn("[WARN] multiStep final validation retry failed", eMSFV); }
         }
       }
     }
   }
   if (opts.onProgress) opts.onProgress(4, 4, "done");
   return { text: mergedText, reports: reports };
 }

  function getAutoValidators(type, opts) {
    opts = opts || {};
    var validators = {
      "settings": [{ type: "json_array" }, { type: "field_exists", fields: ["name"] }],
      "volumes": [{ type: "json_array" }, { type: "min_length", value: 50 }],
      "chapters": [{ type: "json_array" }, { type: "field_exists", fields: ["title", "plot"] }],
      "body": [{ type: "min_length", value: 500 }]
    };
   var result = validators[type] || [];
   if (type === "chapters" && opts.expectedCount) {
     result = result.concat([{ type: "exact_count", value: opts.expectedCount }]);
   }
    var finalValidators = [];
    if (type === "settings") {
      finalValidators = [
        { type: "field_exists", fields: ["name", "category", "attrs"], itemLabel: "设定项" }
      ];
    } else if (type === "volumes") {
      finalValidators = [
        { type: "field_exists", fields: ["name", "outline", "summary", "suggestedWords"], itemLabel: "卷纲" },
        { type: "field_min_length", field: "outline", value: 500, itemLabel: "卷纲", requirement: "起承转合四段情节、角色弧光、核心冲突、伏笔与意象、感官调色板、潜台词、卷末状态" },
        { type: "json_escape_valid" }
      ];
    } else if (type === "chapters") {
      finalValidators = [
        { type: "field_exists", fields: ["title", "plot"], itemLabel: "章节" },
        { type: "field_min_length", field: "title", value: 1, itemLabel: "章节" },
        { type: "field_min_length", field: "plot", value: 200, itemLabel: "章节", requirement: "核心事件、场景节拍、情感弧光、伏笔操作、独立块提示、章末钩子" },
        { type: "json_escape_valid" }
      ];
      if (opts.expectedCount) {
        finalValidators.push({ type: "exact_count", value: opts.expectedCount });
      }
    }
    if (type === "body") {
      finalValidators = [
        { type: "prose_metadata_exists", markers: ["【骨架完毕】", "【正文完毕】", "【打磨完毕】"] },
        { type: "prose_scene_count_match" },
        { type: "prose_min_length", value: (opts.minProseLength || 1000) },
        { type: "analysis_word_detection" }
      ];
    }
    return { validators: result, finalValidators: finalValidators };
  }

  var exports = {
    chain: chain,
    splitMerge: splitMerge,
    multiStep: multiStep,
    resolveTemplate: resolveTemplate,
    getAutoValidators: getAutoValidators,
    _splitText: _splitText,
    _parallelMap: _parallelMap,
    _extractFirstSubject: _extractFirstSubject
  };
  window.SkillExecutionEngine = exports;
  return exports;
})();

console.log("[OK] SkillExecutionEngine loaded");
