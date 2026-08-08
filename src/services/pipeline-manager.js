// PipelineManager — 流水线逻辑（从 panels.js 提取）
// 所有 _pl* 方法仍挂载到 App.prototype，保持零行为变化

App.prototype._plExtractJsonArray = function(text) {
  if (!text || typeof text !== 'string') return null;
  var cleaned = text;
  var fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) cleaned = fenceMatch[1].trim();
  try { var d = JSON.parse(cleaned); if (Array.isArray(d)) return d; if (d && typeof d === 'object') return [d]; } catch(e){console.warn("[WARN] catch #1 pipeline-manager.js",e);if(window.DiagLogger)DiagLogger.warn("catch","pipeline-manager.js #1",e);}
  var firstBracket = cleaned.indexOf('[');
  var lastBracket = cleaned.lastIndexOf(']');
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    var sub = cleaned.substring(firstBracket, lastBracket + 1);
    try { var v = JSON.parse(sub); if (Array.isArray(v)) return v; } catch(e2){console.warn("[WARN] catch #2 pipeline-manager.js",e2);if(window.DiagLogger)DiagLogger.warn("catch","pipeline-manager.js #2",e2);}
    var lastObjEnd = sub.lastIndexOf('}');
    if (lastObjEnd > 0) {
      var truncated = sub.substring(0, lastObjEnd + 1) + ']';
      try { var tv = JSON.parse(truncated); if (Array.isArray(tv)) return tv; } catch(e3){console.warn("[WARN] catch #3 pipeline-manager.js",e3);if(window.DiagLogger)DiagLogger.warn("catch","pipeline-manager.js #3",e3);}
    }
  }
  if (firstBracket >= 0) {
    var partial = cleaned.substring(firstBracket);
    var lastBrace = partial.lastIndexOf('}');
    if (lastBrace > 0) {
      var repaired = partial.substring(0, lastBrace + 1) + ']';
      try { var rv = JSON.parse(repaired); if (Array.isArray(rv)) return rv; } catch(e4){console.warn("[WARN] catch #4 pipeline-manager.js",e4);if(window.DiagLogger)DiagLogger.warn("catch","pipeline-manager.js #4",e4);}
    }
  }
  // 单个JSON对象（非数组）：提取第一个 { 到最后一个 } ，或处理截断
  var firstBrace = cleaned.indexOf('{');
  var lastBraceAll = cleaned.lastIndexOf('}');
  if (firstBrace >= 0 && lastBraceAll > firstBrace) {
    var objSub = cleaned.substring(firstBrace, lastBraceAll + 1);
    try { var obj = JSON.parse(objSub); if (obj && typeof obj === 'object') return [obj]; } catch(e5){console.warn("[WARN] catch #5 pipeline-manager.js",e5);if(window.DiagLogger)DiagLogger.warn("catch","pipeline-manager.js #5",e5);}
  }
  if (firstBrace >= 0) {
    var objPartial = cleaned.substring(firstBrace);
    var lastBrace2 = objPartial.lastIndexOf('}');
    if (lastBrace2 > 0) {
      var objRepaired = objPartial.substring(0, lastBrace2 + 1);
      try { var obj2 = JSON.parse(objRepaired); if (obj2 && typeof obj2 === 'object') return [obj2]; } catch(e6){console.warn("[WARN] catch #6 pipeline-manager.js",e6);if(window.DiagLogger)DiagLogger.warn("catch","pipeline-manager.js #6",e6);}
      // 尝试补全截断的字符串和对象
      if (lastBrace2 < objPartial.length - 1) {
        var cutAt = objPartial.lastIndexOf(':"');
        if (cutAt > 0) {
          var afterColon = objPartial.substring(cutAt + 2);
          var lastQuote = afterColon.lastIndexOf('"');
          if (lastQuote >= 0) {
            var repaired2 = objPartial.substring(0, cutAt + 2 + lastQuote + 1) + '}';
            try { var obj3 = JSON.parse(repaired2); if (obj3 && typeof obj3 === 'object') return [obj3]; } catch(e7){console.warn("[WARN] catch #7 pipeline-manager.js",e7);if(window.DiagLogger)DiagLogger.warn("catch","pipeline-manager.js #7",e7);}
          }
        }
      }
    }
  }
  // 深度截断：响应完全没有闭合 } 或 ]，用正则提取字段
  if (firstBrace >= 0 || firstBracket >= 0) {
    var src = firstBracket >= 0 ? cleaned.substring(firstBracket) : cleaned.substring(firstBrace);
    var nameMatch = src.match(/"name"\s*:\s*"([^"]+)"/);
    var outlineMatch = src.match(/"outline"\s*:\s*"([\s\S]*?)(?:"|$)/);
    var summaryMatch = src.match(/"summary"\s*:\s*"([^"]+)"/);
    var suggestedMatch = src.match(/"suggestedWords"\s*:\s*(\d+)/);
   var titleMatch = src.match(/"title"\s*:\s*"([^"]+)"/);
   var plotMatch = src.match(/"plot"\s*:\s*"([\s\S]*?)(?:"|$)/);
   var categoryMatch = src.match(/"category"\s*:\s*"([^"]+)"/);
   var attrsMatch = src.match(/"attrs"\s*:\s*"([^"]+)"/);
   if (nameMatch || titleMatch) {
     var partial = {
       name: nameMatch ? nameMatch[1] : (titleMatch ? titleMatch[1] : ""),
       outline: outlineMatch ? outlineMatch[1] : (plotMatch ? plotMatch[1] : ""),
       summary: summaryMatch ? summaryMatch[1] : "",
       suggestedWords: suggestedMatch ? parseInt(suggestedMatch[1]) : 0
     };
     if (titleMatch && !nameMatch) { partial.title = titleMatch[1]; partial.plot = plotMatch ? plotMatch[1] : ""; }
     if (categoryMatch) { partial.category = categoryMatch[1]; }
     if (attrsMatch) { partial.attrs = { "desc": attrsMatch[1] }; } else { partial.attrs = {}; }
     console.warn("[WARN] JSON深度截断修复: extracted partial data (name=" + partial.name + ", outlineLen=" + (partial.outline||"").length + ")");
     return [partial];
   }
  }
    return null;
};

App.prototype._plGenBodyForChapter = function(vi, ci) {
    var self = this;
    if (!this.isConfigured) { this._toast("请先配置API", "error"); return; }
    var pl = this._plData();
    if (!pl || !pl.volumes[vi] || !pl.volumes[vi].chapters[ci]) { this._toast("章节不存在", "error"); return; }
    var vol = pl.volumes[vi];
    var ch = vol.chapters[ci];
    var wordCount = ch.wordCount || pl.chapterWordCount || 2000;
    this._showLoading("AI 生成正文中...");
    var outline = pl.outlineText || "";
    var settingsText = pl.settingsText || "";
    var boundText = this._getBoundSettingsText();
    if (boundText) settingsText += "\n\n[\u7ea6\u675f\u8bbe\u5b9a]\n" + boundText;
    var volOutline = vol.outline || vol.summary || "";
    var _styleCtxCh = this._plStyleContext(pl);
    var params = "[全书大纲]\n" + outline + "\n\n[设定摘要]\n" + settingsText + (_styleCtxCh ? "\n\n[风格与节奏分析]\n" + _styleCtxCh + "\n\n" : "") + "\n\n[当前卷概要]\n" + vol.name + ": " + volOutline + "\n\n[当前章节剧情点]\n" + ch.title + ": " + (ch.plot || "") + "\n\n请为本章节生成约" + wordCount + "字的正文内容。记住这一章节讲的是什么，这一章节在这一卷纲中的位置，这一卷纲的主题和概要，以及这一卷纲在大纲里要记住的设定。";
    var result = document.getElementById("pl-body-result");
    if (result) { result.style.display = "block"; result.innerHTML = ""; }
    var opts = { agentId: pl.agentId, skillIds: (pl.s5Skills || []).filter(function(id) { return id; }) };
    this.apiGenerate("body", params, function(chunk) {
      if (result) result.innerHTML = "<pre>" + self._escHtml(chunk) + "</pre>";
    }, opts).then(function(text) {
      if (text) {
        ch.body = text;
        ch.bodyGenerated = true;
        pl.bodyText = text;
        self._plPersist(pl);
        if (result) result.innerHTML = "<pre>" + self._escHtml(text) + "</pre>";
        self._toast("正文生成完成，" + text.length + "字", "success");
        // Sync to editor - auto-linkage from pipeline to middle editor area
       try {
         self.currentVolumeId = vol.id;
         self.currentChapterId = ch.id;
         var edEl = document.getElementById("editor-content");
         if (edEl) { edEl.value = text; edEl.disabled = false; }
         var edTitleEl = document.getElementById("editor-title");
         if (edTitleEl) edTitleEl.textContent = ch.title;
         if (typeof self.updateWordCount === "function") self.updateWordCount();
       } catch(eLink) {
          console.error("[ERR] Editor sync failed:", eLink.message, eLink.stack);
        }
        // Also sync to ChapterManager for persistence
        try {
          var cmVolId2 = vol.cmId || vol.id;
          var cmChId2 = ch.cmId || ch.id;
          var cmCh2 = ChapterManager.getChapter(self.currentProjectId, cmVolId2, cmChId2);
          if (cmCh2) {
            ChapterManager.updateChapter(self.currentProjectId, cmVolId2, cmChId2, { content: text });
          }
        } catch(eCm) {
          console.warn("[WARN] ChapterManager sync failed:", eCm.message);
        }
        self.renderChapterTree();
      } else {
        self._toast("生成失败，API返回空内容", "error");
      }
    }).catch(function(e) {
      self._toast("生成失败: " + (e.message || String(e)), "error");
    }).finally(function() {
      self._hideLoading();
    });
  };

App.prototype.showPipeline = function() {
    if (!this.currentProjectId) { this._toast("请先打开一个项目", "info"); return; }
    this.setSidebarActive("btn-pipeline");
    var pl = this._plData();
   this._closeAllPanels();
    var plEl = document.getElementById("pipeline-panel");
    plEl.classList.remove("pl-hidden"); plEl.classList.add("visible");
   this._plPopulateAgentSkills();
    this._plLoadOutline();
    this._plRefreshSteps();
   this._plShowStep(pl.step);
   this._plBindEvents();
  }
 App.prototype.closePipeline = function() {
   var plClose = document.getElementById("pipeline-panel");
   plClose.classList.remove("visible"); plClose.classList.add("pl-hidden");
  document.getElementById("app-main").classList.add("visible");
  this.setSidebarActive(null);
  this.renderChapterTree();
  this._updateBreadcrumb();
}
  App.prototype._plBindEvents = function() {
    var self = this;
    document.getElementById("btn-pl-load-outline").onclick = function() { self._plLoadOutline(); };
    document.getElementById("btn-pl-confirm-outline").onclick = function() { self._plConfirmOutline(); };
    document.getElementById("btn-pl-gen-settings").onclick = function() { self._plGenSettings(); };
    document.getElementById("btn-pl-save-settings").onclick = function() { self._plSaveSettings(); };
    var btnConfirmSettings = document.getElementById("btn-pl-confirm-settings");
    if (btnConfirmSettings) btnConfirmSettings.onclick = function() { self._plConfirmSettings(); };
   document.getElementById("btn-pl-gen-volumes").onclick = function() { self._plGenVolumes(); };
    var btnAutoVol = document.getElementById("btn-pl-autogen-volumes");
    if (btnAutoVol) btnAutoVol.onclick = function() { self._plAutoGenVolumes(); };
    var btnSingleVol = document.getElementById("btn-pl-gen-single-volume");
    if (btnSingleVol) btnSingleVol.onclick = function() { self._plGenSingleVolume(); };
    var btnContVol = document.getElementById("btn-pl-continue-volumes");
    if (btnContVol) btnContVol.onclick = function() { self._plContinueGenVolumes((self._plData().volumes || []).length - 1); };
   document.getElementById("btn-pl-create-volumes").onclick = function() { self._plCreateVolumes(); };
   document.getElementById("btn-pl-gen-chapters").onclick = function() { self._plGenChapters(); };
    var btnAutoCh = document.getElementById("btn-pl-autogen-chapters");
    if (btnAutoCh) btnAutoCh.onclick = function() { self._plAutoGenChapters(); };
    document.getElementById("btn-pl-gen-body").onclick = function() { self._plGenBody(); };
    document.getElementById("btn-pl-insert-body").onclick = function() { self._plInsertBody(); };
    var btnConfirmCh = document.getElementById("btn-pl-confirm-chapters");
    if (btnConfirmCh) btnConfirmCh.onclick = function() { self._plConfirmAllChapters(); };
    var btnConfirmBody = document.getElementById("btn-pl-confirm-body");
    if (btnConfirmBody) btnConfirmBody.onclick = function() { self._plConfirmBody(); };
    var chSelect = document.getElementById("pl-chapter-select");
    if (chSelect) chSelect.onchange = function() { self._plRenderContextSummary(); };
    // Agent selector
    var agentSel = document.getElementById("pl-agent-select");
    if (agentSel) agentSel.onchange = function() { var p = self._getProjectData(); if (p) { if (!p._pipeline) p._pipeline = {}; p._pipeline.agentId = this.value || null; self._saveProjectData(p); } self.currentAgentId = this.value || null; self.renderAgentInfo(); self.renderSkillArea(); self.populateAgentSelect(); };
    // Skill selectors for each step
    ["s1","s2","s3","s4","s5"].forEach(function(step) {
      var sel = document.getElementById("pl-" + step + "-skill");
      if (sel) sel.onchange = function() { self._plAddSkill(step, this.value); this.value = ""; };
      var addBtn = document.getElementById("pl-" + step + "-add-skill");
      if (addBtn) addBtn.onclick = function() { var s = document.getElementById("pl-" + step + "-skill"); if (s && s.value) { self._plAddSkill(step, s.value); s.value = ""; } };
    });
    // Word count input
   var wcInput = document.getElementById("pl-word-count");
   if (wcInput) wcInput.onchange = function() { var p = self._getProjectData(); if (p) { if (!p._pipeline) p._pipeline = {}; p._pipeline.chapterWordCount = parseInt(this.value) || 2000; self._saveProjectData(p); } };
   // Chapter per-chapter word count input (step 4) — syncs to pl.chapterWordCount and updates estimate
   var chWcInput = document.getElementById("pl-chapter-wordcount");
   if (chWcInput) {
     chWcInput.oninput = function() {
       var pl2 = self._plData(); if (pl2) { pl2.chapterWordCount = parseInt(this.value) || 3000; self._plPersist(pl2); }
       if (pl2 && pl2.currentVolumeIndex >= 0) self._plUpdateChEstCount(pl2.currentVolumeIndex);
     };
   var chBsInput = document.getElementById("pl-chapter-batchsize");
   if (chBsInput) {
     chBsInput.oninput = function() {
       var pl3 = self._plData(); if (pl3) { pl3.chapterBatchSize = parseInt(this.value) || 5; self._plPersist(pl3); }
     };
   }
     // Initialize from saved data
     var plInit = self._plData();
     if (plInit && plInit.chapterWordCount) chWcInput.value = plInit.chapterWordCount;
   }
   var steps = document.querySelectorAll(".pl-step");
    for (var i = 0; i < steps.length; i++) {
      steps[i].addEventListener("click", function() {
        var s = parseInt(this.dataset.step);
        var pl = self._plData();
        self._plShowStep(s);
      });
    }

   var navBtns = document.querySelectorAll('.pl-nav-btn');
   for (var j = 0; j < navBtns.length; j++) {
     (function(btn) {
       btn.addEventListener('click', function() {
         if (btn.classList.contains('prev')) { var p = parseInt(btn.dataset.prev); if (p >= 1) self._plShowStep(p); }
         else { self._plGoNext(); }
       });
     })(navBtns[j]);
   }  }

  App.prototype._plGoNext = function() {
    // 规则18修复：导航"下一步"必须先确认当前步骤，禁止绕过确认直接跳转
    // 参照Step1的_plConfirmOutline范例：确认函数成功后自动跳转下一步
    var pl = this._plData();
    var curStep = 1;
    for (var i = 1; i <= 5; i++) {
      var el = document.getElementById("pl-step-" + i + "-content");
      if (el && el.style.display !== "none" && !el.classList.contains("pl-hidden")) { curStep = i; break; }
    }
    if (curStep === 1) {
      this._plShowStep(2); return;
    }
    if (curStep === 2) {
      if (pl.settingsGenerated || pl.settingsConfirmed) { this._plShowStep(3); return; }
      if (this._plTempSettings) { this._plSaveSettings(); return; }
      this._toast("请先点击「AI 生成设定」生成设定后再进入下一步", "info"); return;
    }
    if (curStep === 3) {
      if (pl.volumesConfirmed) { this._plShowStep(4); return; }
      this._plCreateVolumes(); return;
    }
    if (curStep === 4) {
      if (pl.chaptersConfirmed) { this._plShowStep(5); return; }
      this._plConfirmAllChapters(); return;
    }
    if (curStep === 5) { return; }
  };

 App.prototype._plPopulateAgentSkills = function() {
    // Populate agent selector
    var agentSel = document.getElementById("pl-agent-select");
    if (!agentSel) return;
    var pl = this._plData();
    var agents = AgentManager.getAll ? AgentManager.getAll() : [];
    agentSel.innerHTML = '<option value="">不使用智能体</option>';
    agents.forEach(function(a) {
      var opt = document.createElement("option");
      opt.value = a.id; opt.textContent = a.name || "未命名";
      if (pl.agentId === a.id) opt.selected = true;
      agentSel.appendChild(opt);
    });
    // Populate skill selectors for each step
    var self = this;
    ["s1","s2","s3","s4","s5"].forEach(function(step) {
      var sel = document.getElementById("pl-" + step + "-skill");
      if (!sel) return;
      var skills = SkillManager.getAll ? SkillManager.getAll() : [];
      sel.innerHTML = '<option value="">无</option>';
      skills.forEach(function(sk) {
        var opt = document.createElement("option");
        opt.value = sk.id; opt.textContent = sk.name || "未命名";
        sel.appendChild(opt);
      });
      self._plRenderSkillChips(step);
    });
  }

 App.prototype._plAddSkill = function(step, skillId) {
   if (!skillId) return;
   var p = this._getProjectData();
   if (!p) { console.warn("[WARN] _plAddSkill: no project data"); return; }
   if (!p._pipeline) p._pipeline = { step: 1, outlineConfirmed: false, settingsGenerated: false, volumesGenerated: false, chaptersGenerated: false, agentId: null, s1Skills: [], s2Skills: [], s3Skills: [], s4Skills: [], s5Skills: [], outlineText: "", settingsText: "", volumesText: "", chaptersText: "", bodyText: "", volumeCount: 3, chapterWordCount: 2000, volumes: [], chapters: {}, settingsConfirmed: false, volumesConfirmed: false, chaptersConfirmed: false, currentVolumeIndex: -1, styleTags: "", pacingParams: "", outlineAnalyzed: false };
   var key = step + "Skills";
   if (!p._pipeline[key]) p._pipeline[key] = [];
   if (p._pipeline[key].indexOf(skillId) < 0) p._pipeline[key].push(skillId);
   this._saveProjectData(p);
   this._plRenderSkillChips(step);
   this.renderSkillArea();
 }

  App.prototype._plRemoveSkill = function(step, skillId) {
  var p = this._getProjectData();
  if (!p || !p._pipeline) return;
  var key = step + "Skills";
  if (!p._pipeline[key]) return;
  var idx = p._pipeline[key].indexOf(skillId);
  if (idx >= 0) p._pipeline[key].splice(idx, 1);
  this._saveProjectData(p);
  this._plRenderSkillChips(step);
  this.renderSkillArea();
 }

 App.prototype._plMoveSkill = function(step, index, direction) {
   var p = this._getProjectData();
   if (!p || !p._pipeline) return;
   var key = step + "Skills";
   var arr = p._pipeline[key];
   if (!arr) return;
   var newIndex = index + direction;
   if (newIndex < 0 || newIndex >= arr.length) return;
   var tmp = arr[index];
   arr[index] = arr[newIndex];
   arr[newIndex] = tmp;
   this._saveProjectData(p);
   this._plRenderSkillChips(step);
   this.renderSkillArea();
 };
 
  App.prototype._plRenderSkillChips = function(step) {
    var pl = this._plData();
    if (!pl) return;
    var key = step + "Skills";
    var skills = pl[key] || [];
    var container = document.getElementById("pl-" + step + "-skills-list");
    if (!container) return;
    var self = this;
    if (skills.length === 0) { container.innerHTML = ""; return; }
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = "3px";
    container.innerHTML = skills.map(function(id, idx) {
      var sk = SkillManager.get(id);
      if (!sk) return "";
      var upDisabled = idx === 0;
      var downDisabled = idx === skills.length - 1;
      var upStyle = upDisabled ? "opacity:0.3;cursor:default" : "cursor:pointer;color:#5af";
      var downStyle = downDisabled ? "opacity:0.3;cursor:default" : "cursor:pointer;color:#5af";
      var upClick = upDisabled ? "" : "onclick=\"app._plMoveSkill('" + step + "'," + idx + ",-1)\"";
      var downClick = downDisabled ? "" : "onclick=\"app._plMoveSkill('" + step + "'," + idx + ",1)\"";
      return '<div style="display:flex;align-items:center;gap:4px;padding:3px 8px;background:#2a3a2e;border-radius:3px;font-size:11px;color:#8bc">' +
        '<span style="background:#3a5a3e;border-radius:50%;width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;font-size:10px;color:#bdf;font-weight:bold">' + (idx+1) + '</span>' +
        '<span style="flex:1">' + sk.name + '</span>' +
        '<span style="' + upStyle + ';padding:0 3px;font-size:13px" ' + upClick + '>&#8593;</span>' +
        '<span style="' + downStyle + ';padding:0 3px;font-size:13px" ' + downClick + '>&#8595;</span>' +
        '<span style="cursor:pointer;color:#f55;padding:0 3px" onclick="app._plRemoveSkill(\'' + step + '\',\'' + id + '\')">&times;</span>' +
        '</div>';
    }).join("");
  }

  App.prototype._plLoadOutline = function() {
   var p = this._getProjectData();
   var outline = p.outline || "";
   if (!outline) {
     var ed = document.getElementById("outline-editor");
     if (ed) outline = ed.value || "";
   }
   document.getElementById("pl-outline").value = outline;
 }

  // FIX: outline stored in projects index (ProjectManager), not in project-{id} data.
  // Fall back to ProjectManager.get() so the pipeline can read the confirmed outline.
  App.prototype._plLoadOutline = function() {
    var p = this._getProjectData();
    var outline = p.outline || "";
    if (!outline && this.currentProjectId && typeof ProjectManager !== "undefined") {
      var proj = ProjectManager.get(this.currentProjectId);
      if (proj) outline = proj.outline || "";
    }
    if (!outline) {
      var ed = document.getElementById("outline-editor");
      if (ed) outline = ed.value || "";
    }
    if (!outline && p._pipeline && p._pipeline.outlineText) {
      outline = p._pipeline.outlineText;
    }
    var ta = document.getElementById("pl-outline");
    if (ta) ta.value = outline;
  }
  App.prototype._plRefreshSteps = function() {
    var pl = this._plData();
    var statuses = [
      pl.outlineConfirmed ? "已确认" : "待生成",
      pl.outlineConfirmed ? "待生成" : "等待大纲",
      pl.settingsGenerated ? "待生成" : "等待设定",
      pl.volumesGenerated ? "待生成" : "等待卷纲",
      pl.chaptersGenerated ? "待生成" : "等待章节"
    ];
    for (var i = 1; i <= 5; i++) {
      var stepEl = document.querySelector(".pl-step[data-step=\"" + i + "\"]");
      if (stepEl) {
        stepEl.classList.remove("active", "completed");
        if (i < pl.step) stepEl.classList.add("completed");
        if (i === pl.step) stepEl.classList.add("active");
      }
      document.getElementById("pl-status-" + i).textContent = statuses[i-1];
    }
  }
  App.prototype._plShowStep = function(n) {
    for (var i = 1; i <= 5; i++) {
      var _stepEl = document.getElementById("pl-step-" + i + "-content"); _stepEl.style.display = (i === n) ? "block" : "none"; if (i === n) { _stepEl.classList.remove("pl-hidden"); } else { _stepEl.classList.add("pl-hidden"); }
      var stepEl = document.querySelector(".pl-step[data-step=\"" + i + "\"]");
      if (stepEl) { stepEl.classList.remove("active"); if (i === n) stepEl.classList.add("active"); }
    }
    try { var _pl = this._plData(); if (_pl) { _pl.step = n; this._plPersist(_pl); } } catch(e) { console.warn('[plShowStep] persist step failed:', e); }
   if (n === 3) this._plRenderVolumeCards();
   if (n === 2) this._plRenderBoundSettings();
  if (n === 4) { this._plRenderVolList(); this._plPopulateChapterSelect(); }
  if (n === 5) this._plPopulateChapterSelect();
  if (n === 4) {
    // Safety net: ensure chapter word count input binding exists (in case showPipeline wasn't called)
    var chWcEl = document.getElementById("pl-chapter-wordcount");
    if (chWcEl && !chWcEl.oninput) {
      var selfRef = this;
      chWcEl.oninput = function() {
        var pl2 = selfRef._plData(); if (pl2) { pl2.chapterWordCount = parseInt(this.value) || 3000; selfRef._plPersist(pl2); }
        if (pl2 && pl2.currentVolumeIndex >= 0) selfRef._plUpdateChEstCount(pl2.currentVolumeIndex);
      };
      var plInit2 = this._plData();
      if (plInit2 && plInit2.chapterWordCount) chWcEl.value = plInit2.chapterWordCount;
    }
    // FIX T9: Auto-calculate estimated chapter count when entering step 4
    var plEst = this._plData();
    if (plEst && plEst.currentVolumeIndex >= 0) {
      this._plUpdateChEstCount(plEst.currentVolumeIndex);
    } else if (plEst && plEst.volumes && plEst.volumes.length > 0) {
      this._plUpdateChEstCount(0);
    }
  }
}
 App.prototype._plRenderBoundSettings = function() {
   var pl = this._plData();
   var container = document.getElementById("pl-bound-settings-list");
   if (!container) return;
   var bound = (pl && pl.boundSettings) ? pl.boundSettings : [];
   if (bound.length === 0) {
     container.innerHTML = "<p style='color:var(--text-dim,#666);font-size:14px;padding:8px'>暂无来自设定合集的绑定项。请在设定合集中绑定设定后回到此步骤。</p>";
     return;
   }
   var self = this;
   var html = "";
   for (var i = 0; i < bound.length; i++) {
     var b = bound[i];
     var isOn = b.enabled !== false;
     var btnClass = isOn ? "btn-primary btn-sm" : "btn-secondary btn-sm";
     var btnText = isOn ? "已启用" : "未启用";
     var dotColor = isOn ? "#4a9" : "#666";
     html += "<div style='display:flex;align-items:center;gap:8px;padding:8px;border-bottom:1px solid var(--border-color,#333)'>"
       + "<span style='width:8px;height:8px;border-radius:50%;background:" + dotColor + ";flex-shrink:0'></span>"
       + "<span style='font-size:12px;color:var(--text-dim,#888);min-width:50px'>" + self._escHtml(b.cat) + "</span>"
       + "<span style='font-size:14px;flex:1'>" + self._escHtml(b.name) + "</span>"
       + "<button class='" + btnClass + " pl-bound-toggle' data-idx='" + i + "' data-on='" + (isOn ? "1" : "0") + "' style='min-width:64px'>" + btnText + "</button>"
       + "</div>";
   }
   container.innerHTML = html;
   var btns = container.querySelectorAll(".pl-bound-toggle");
   for (var t = 0; t < btns.length; t++) {
     btns[t].onclick = function() {
       var idx = parseInt(this.dataset.idx);
       var wasOn = this.dataset.on === "1";
       var _pl = self._plData();
       if (_pl.boundSettings && _pl.boundSettings[idx]) {
         _pl.boundSettings[idx].enabled = !wasOn;
         self._plPersist(_pl);
         self._plRenderBoundSettings();
       }
     };
   }
 }
 App.prototype._plConfirmOutline = function() {
    var p = this._getProjectData();
    var outline = document.getElementById("pl-outline").value.trim();
    if (!outline) { this._toast("请输入大纲内容", "info"); return; }
    p.outline = outline;
    this._saveProjectData(p);
    var pl = this._plData();
   this._plInvalidateDownstream(2);
   var pl = this._plData();
   pl.outlineConfirmed = true;
   pl.outlineText = outline;
   pl.step = 2;
    var wcInput = document.getElementById("pl-book-word-count");
    if (wcInput) {
      var wan = parseFloat(wcInput.value);
      pl.bookWordCount = (!isNaN(wan) && wan > 0) ? Math.round(wan * 10000) : 0;
    }
   this._plPersist(pl);
    this._plRefreshSteps();
    this._plShowStep(2);
    document.getElementById("pl-status-1").textContent = "已确认";
    this._plAnalyzeOutline();
  }
  App.prototype._plStyleContext = function(pl) {
  if (!pl) return "";
  var parts = [];
  if (pl.styleTags) parts.push("风格标签：" + pl.styleTags);
  if (pl.pacingParams) parts.push("节奏参数：" + pl.pacingParams);
  return parts.length > 0 ? parts.join("\n") : "";
};
App.prototype._plAnalyzeOutline = function() {
  var self = this;
  var pl = this._plData();
  if (!pl || !pl.outlineText) return;
  if (pl.outlineAnalyzed && pl.styleTags) return;
 var params = "\u8bf7\u5206\u6790\u4ee5\u4e0b\u5c0f\u8bf4\u5927\u7eb2\u7684\u5199\u4f5c\u98ce\u683c\u548c\u8282\u594f\u7279\u5f81\u3002\u8fd4\u56deJSON\u5bf9\u8c61\uff1a{styleTags:\"\u98ce\u683c\u6807\u7b7e\u4ee5\u9017\u53f7\u5206\u9694\", pacingParams:\"\u8282\u594f\u53c2\u6570\u63cf\u8ff0\"}\u3002\n\n\u5927\u7eb2\uff1a\n" + pl.outlineText;
  // _plAnalyzeOutline 是内部风格分析步骤，不应携带大纲层的s1Skills
  // 否则会进入链式模式返回SKILL输出而非{styleTags,pacingParams}JSON
  var opts = { agentId: pl.agentId, skillIds: [] };
 this.apiGenerate("outline-analysis", params, null, opts).then(function(text) {
    if (!text) { console.warn("[WARN] Outline analysis returned empty"); return; }
    try {
      var result = self._plExtractJsonArray(text);
      var data = (result && result[0]) ? result[0] : null;
      if (!data) { var m = text.match(/\{[\s\S]*\}/); if (m) { try { data = JSON.parse(m[0]); } catch(e2){console.warn("[WARN] catch #8 pipeline-manager.js",e2);if(window.DiagLogger)DiagLogger.warn("catch","pipeline-manager.js #8",e2);} } }
      if (data) {
        pl.styleTags = data.styleTags || data.style || "";
        pl.pacingParams = data.pacingParams || data.pacing || "";
        pl.outlineAnalyzed = true;
        self._plPersist(pl);
        console.log("[OK] Outline analyzed: styleTags=" + (pl.styleTags||"").substring(0,50) + ", pacing=" + (pl.pacingParams||"").substring(0,50));
        try { self._toast("大纲分析完成", "success"); } catch(e){console.warn("[WARN] catch #9 pipeline-manager.js",e);if(window.DiagLogger)DiagLogger.warn("catch","pipeline-manager.js #9",e);}
      } else {
        pl.styleTags = text.substring(0, 200);
        pl.outlineAnalyzed = true;
        self._plPersist(pl);
        console.log("[OK] Outline analyzed (raw text fallback)");
      }
    } catch(e) { console.warn("[WARN] Outline analysis parse failed:", e.message); }
  }).catch(function(e) { console.warn("[WARN] Outline analysis failed (non-blocking):", e.message); });
};
App.prototype._plSaveSettings = function() {
    if (!this._plTempSettings) return;
    var sc = this._scData(); if (!sc) { document.getElementById("sc-categories").innerHTML = "<button class=\"sc-cat-btn sc-cat-add\" id=\"btn-add-category\">+ 新增分类</button>"; document.getElementById("sc-items-list").innerHTML = "<p class=\"empty-hint\">请先创建项目后使用设定合集</p>"; return; } if (!sc) return;
    try {
      var items = this._plExtractJsonArray(this._plTempSettings);
      if (!items) {
        this._toast("当前内容为校验报告，正在自动补全设定...", "info");
        var _pl = this._plData();
        var _outline = (_pl && _pl.outlineText) || (document.getElementById("pl-outline") && document.getElementById("pl-outline").value) || ((ProjectManager.get(this.currentProjectId)||{}).outline || "");
        var _cats = []; // 动态分类，不再需要手动选择
        var _result = document.getElementById("pl-settings-result");
        this._plGenSettingsFromReport(this._plTempSettings, _outline, _cats, _pl, _result);
        return;
      }
     items.forEach(function(item) {
        var rawCat = (item.category || "人物").toString();
        // 动态分类：直接用 category 作为 key，不固定4个分类
        if (Array.isArray(sc.items)) {
          // 兼容：如果已被转成数组格式，转回对象格式
          var arr = sc.items;
          sc.items = {};
          arr.forEach(function(g) { if (g && g.category) sc.items[g.category] = g.items || []; });
        }
        if (!sc.items[rawCat]) sc.items[rawCat] = [];
        sc.items[rawCat].push({ id: "set_" + Date.now() + "_" + Math.random().toString(36).substr(2,6), name: item.name || "未命名", attrs: item.attrs || {}, content: item.description || "", bound: false, boundTo: null, enabled: true });
     });
      var _sp = this._getProjectData(); _sp.settingsCollection = sc; this._saveProjectData(_sp);
      this._plInvalidateDownstream(3);
      var pl = this._plData();
      pl.settingsGenerated = true;
      pl.step = 3;
      this._plPersist(pl);
      this._plRefreshSteps();
      this._plShowStep(3);
      document.getElementById("pl-status-2").textContent = "已完成";
      this._toast("设定已保存到合集", "success");
    } catch (e) {
      this._toast("解析失败: " + e.message, "error");
    }
  }

App.prototype._plCreateVolumes = function() {
    var pl = this._plData();
    if (!pl || !pl.volumes || pl.volumes.length === 0) { this._toast("请先生成卷纲", "info"); return; }
    var unconfirmed = pl.volumes.filter(function(v) { return !v.confirmed; });
    if (unconfirmed.length > 0) { this._toast("请先确认所有卷纲 (" + unconfirmed.length + " 个未确认)", "info"); return; }
    pl.volumesConfirmed = true;
    pl.step = 4;
    this._plPersist(pl);
    // Sync pipeline volumes to ChapterManager so chapter tree shows them
    var self = this;
    // Delete stale CM volumes not in PL (prevents old volumes persisting after regeneration)
    var cmVols = ChapterManager.getVolumes(self.currentProjectId) || [];
    cmVols.forEach(function(cmVol) {
      var plVol = pl.volumes.find(function(v) { return v.name === cmVol.name; });
      if (!plVol) {
        ChapterManager.deleteVolume(self.currentProjectId, cmVol.id);
      }
    });
    // Sync PL volumes to CM
    pl.volumes.forEach(function(vol, idx) {
      var existingVol = ChapterManager.getVolumes(self.currentProjectId).find(function(v) { return v.name === vol.name; });
      if (!existingVol) {
        ChapterManager.createVolume(self.currentProjectId, { name: vol.name, outline: vol.outline || vol.summary || "" });
      } else {
        existingVol.outline = vol.outline || vol.summary || existingVol.outline;
        ChapterManager.updateVolume(existingVol.id, existingVol);
      }
    });
    this._plRefreshSteps();
    this._plShowStep(4);
    document.getElementById("pl-status-3").textContent = "已完成";
  }
  App.prototype._plPopulateChapterSelect = function() {
    var select = document.getElementById("pl-chapter-select");
    if (!select) return;
    select.innerHTML = "<option value=\"\">请选择章节</option>";
    var pl = this._plData();
    if (!pl || !pl.volumes) return;
    var self = this;
    pl.volumes.forEach(function(vol, vi) {
      if (!vol.confirmed) return;
      if (!vol.chapters || vol.chapters.length === 0) return;
      var optgroup = document.createElement("optgroup");
      optgroup.label = vol.name;
      vol.chapters.forEach(function(ch, ci) {
        if (!ch.confirmed) return;
        var option = document.createElement("option");
        option.value = vi + ":" + ci;
        option.textContent = vol.name + " - " + ch.title;
        optgroup.appendChild(option);
      });
      if (optgroup.children.length > 0) select.appendChild(optgroup);
    });
  }

    // FIX3: Settings layer confirmation - saves bound settings and advances to volume layer
  App.prototype._plConfirmSettings = function() {
    var pl = this._plData();
    if (!pl) { this._toast("数据异常", "error"); return; }
    // If there are temp settings (AI generated but not saved), save them first
    if (this._plTempSettings) { this._plSaveSettings(); }
    // Mark settings as confirmed
    pl.settingsConfirmed = true;
    if (!pl.settingsGenerated) pl.settingsGenerated = true;
    pl.step = 3;
    this._plPersist(pl);
    this._plRefreshSteps();
    this._plShowStep(3);
    document.getElementById("pl-status-2").textContent = "已确认";
    this._toast("设定已确认，进入卷纲层", "success");
  };

App.prototype._plGenSettings = function() {
    var self = this;
    if (!this.isConfigured) { this._toast("请先配置API", "error"); return; }
    var pl = this._plData(); var outline = (pl && pl.outlineText) || document.getElementById("pl-outline").value || (ProjectManager.get(this.currentProjectId)||{}).outline || "";
    if (!outline) { this._toast("请先编写或加载大纲", "error"); return; }
    this._showLoading("AI 生成设定中...");
    var boundText = this._getBoundSettingsText();
    var params = "大纲：\n" + outline + "\n\n请根据大纲内容自行决定需要哪些分类（如角色、世界观、势力、地理、物种、物品、魔法体系等），不要限定在固定分类里。\n每条设定格式：{name, category, attrs: {描述, 特点, 关系}}\n只返回JSON数组，不要返回报告或说明文字。";
    if (boundText) params += "\n\n[约束设定]\n" + boundText;
    var result = document.getElementById("pl-settings-result");
    result.style.display = "block";
    result.innerHTML = "";
    var opts = { agentId: pl.agentId, skillIds: (pl.s2Skills || []).filter(function(id) { return id; }) };
   this.apiGenerate("settings", params, function(chunk) {
     result.innerHTML = "<pre>" + self._escHtml(chunk) + "</pre>";
    }, opts).then(function(text) {
      if (text) {
        var parsedItems = self._plExtractJsonArray(text);
        if (parsedItems) {
          result.innerHTML = "<pre>" + self._escHtml(text) + "</pre>";
          pl.settingsText = text;
          self._plTempSettings = text;
          document.getElementById("btn-pl-save-settings").style.display = "";
          self._hideLoading();
        } else {
         result.innerHTML = "<pre>" + self._escHtml(text) + "\n\n--- 检测到校验报告，正在根据报告自动补全设定... ---</pre>";
         self._hideLoading();
          self._plGenSettingsFromReport(text, outline, [], pl, result);
       }
      } else {
        self._hideLoading();
      }
   }).catch(function(err) {
     self._hideLoading();
     self._toast("AI生成设定失败: " + (err && err.message ? err.message : String(err)), "error");
     console.error("[ERR] _plGenSettings:", err);
   });
 }

 App.prototype._plGenSettingsFromReport = function(reportText, outline, cats, pl, resultEl) {
    var self = this;
    this._showLoading("根据校验报告补全设定中...");
    var params = "大纲：\n" + outline + "\n\n以下是设定校验报告，指出了缺失的设定条目：\n\n" + reportText + "\n\n请根据大纲和校验报告，生成完整的设定条目（包括已有和缺失的），自行决定分类。\n每条设定格式：{name, category, attrs: {描述, 特点, 关系}}\n只返回JSON数组，不要返回报告或说明文字。";
    var boundText = this._getBoundSettingsText();
    if (boundText) params += "\n\n[约束设定]\n" + boundText;
    var opts = { agentId: pl.agentId, skillIds: [] };
    this.apiGenerate("settings", params, function(chunk) {
      resultEl.innerHTML = "<pre>" + self._escHtml(chunk) + "</pre>";
    }, opts).then(function(text) {
      if (text) {
        resultEl.innerHTML = "<pre>" + self._escHtml(text) + "</pre>";
        pl.settingsText = text;
        self._plTempSettings = text;
        document.getElementById("btn-pl-save-settings").style.display = "";
        self._toast("设定补全完成，请点击保存", "success");
      }
      self._hideLoading();
    }).catch(function(err) {
      self._hideLoading();
      self._toast("设定补全失败: " + (err && err.message ? err.message : String(err)), "error");
      console.error("[ERR] _plGenSettingsFromReport:", err);
    });
  }

App.prototype._plGenVolumes = function() {
    var self = this;
    if (!this.isConfigured) { this._toast("请先配置API", "error"); return; }
    var pl = this._plData();
    var outline = (pl.outlineText || document.getElementById("pl-outline").value || (ProjectManager.get(this.currentProjectId)||{}).outline || "");
    if (!outline) { this._toast("请先确认大纲", "error"); return; }
    var count = parseInt(document.getElementById("pl-volume-count").value) || 3;
    var settingsText = pl.settingsText || "";
    var boundText = this._getBoundSettingsText();
    if (boundText) settingsText += "\n\n[\u7ea6\u675f\u8bbe\u5b9a]\n" + boundText;
    this._showLoading("AI 生成卷纲中...");
    var params = "大纲：\n" + outline + "\n\n拆分为" + count + "卷，每卷包含名称和简要大纲";
    if (pl.bookWordCount && pl.bookWordCount > 0) {
      params += "。全书约" + pl.bookWordCount + "字，请合理分配每卷字数";
    }
    params += "。返回JSON数组：[{name, outline, suggestedWords}]。";
    if (settingsText) params += "\n\n[设定摘要]\n" + settingsText;
    var _styleCtx = this._plStyleContext(pl);
    if (_styleCtx) params += "\n\n[风格与节奏分析]\n" + _styleCtx;
    var result = document.getElementById("pl-volume-result");
    var volCardsEl = document.getElementById("pl-volume-cards");
    if (volCardsEl) volCardsEl.style.display = "none";
    result.style.display = "block";
    result.innerHTML = "";
    var opts = { agentId: pl.agentId, skillIds: (pl.s3Skills || []).filter(function(id) { return id; }) };
    if (opts.skillIds && opts.skillIds.length > 0) {
      var _sn = opts.skillIds.map(function(sid) { try { var _s = SkillManager.get(sid); return _s ? _s.name : null; } catch(e) { return null; } }).filter(function(n) { return n; });
      if (_sn.length > 0) result.innerHTML = "<div class='pl-skill-badge'>[SKILL] 已注入技能: " + _sn.join(", ") + "</div>";
      console.log("[SKILL] Volumes generation using skills:", _sn.join(", "));
    }
   this.apiGenerate("volumes", params, function(chunk) {
     result.innerHTML = "<pre>" + self._escHtml(chunk) + "</pre>";
    }, opts).then(function(text) {
      if (text) {
       pl.volumesText = text;
       var _cr = self._lastChainReports || [];
       var displayText = text;
       var vols = self._plExtractJsonArray(text);
       if (vols && vols.length > 0) { displayText = vols.map(function(v) { return "## " + v.name + "\n" + (v.outline || ""); }).join("\n\n"); pl.volumes = vols.map(function(v, idx) { return { id: "vol_" + Date.now() + "_" + idx, name: v.name || ("Volume " + (idx+1)), outline: v.outline || "", summary: v.outline || "", chapters: [], confirmed: false, suggestedWords: parseInt(v.suggestedWords) || 0, chainReports: _cr }; }); } else { console.warn("[WARN] JSON extract failed for volumes"); self._toast("AI返回的卷纲格式异常，已显示原始内容", "warn"); }
       self._plPersist(pl);
        self._plRenderVolumeCards();
        self._syncTreeToPipeline();
        self.renderChapterTree();
     } else {
        self._toast("AI返回了空内容，请重试", "error");
      }
      self._hideLoading();
    }).catch(function(err) {
      self._hideLoading();
      var r = document.getElementById("pl-volume-result");
      if (r) r.style.display = "none";
      self._toast("AI生成卷纲失败: " + (err && err.message ? err.message : String(err)), "error");
     console.error("[ERR] _plGenVolumes:", err);
   });
 }

  App.prototype._plAutoGenVolumes = function() {
    var self = this;
    if (!this.isConfigured) { this._toast("请先配置API", "error"); return; }
    var pl = this._plData();
    if (!pl || !pl.bookWordCount || pl.bookWordCount <= 0) { this._toast("请先在大纲层填写全书字数", "info"); return; }
    var outline = (pl.outlineText || document.getElementById("pl-outline").value || (ProjectManager.get(this.currentProjectId)||{}).outline || "");
    if (!outline) { this._toast("请先确认大纲", "error"); return; }
    var settingsText = pl.settingsText || "";
    var boundText = this._getBoundSettingsText();
    if (boundText) settingsText += "\n\n[\u7ea6\u675f\u8bbe\u5b9a]\n" + boundText;
    this._showLoading("AI 根据字数生成卷纲中...");
    var params = "大纲：\n" + outline + "\n\n本书计划约" + pl.bookWordCount + "字。请根据大纲内容和字数，建议拆分为几卷，每卷包含名称、简要大纲和建议字数。返回JSON数组：[{name, outline, suggestedWords}]。";
    if (settingsText) params += "\n\n[设定摘要]\n" + settingsText;
    var _styleCtx2 = this._plStyleContext(pl);
    if (_styleCtx2) params += "\n\n[风格与节奏分析]\n" + _styleCtx2;
    var result = document.getElementById("pl-volume-result");
    var volCardsEl = document.getElementById("pl-volume-cards");
    if (volCardsEl) volCardsEl.style.display = "none";
    if (result) { result.style.display = "block"; result.innerHTML = ""; }
    var opts = { agentId: pl.agentId, skillIds: (pl.s3Skills || []).filter(function(id) { return id; }) };
    if (opts.skillIds && opts.skillIds.length > 0) {
      var _sn = opts.skillIds.map(function(sid) { try { var _s = SkillManager.get(sid); return _s ? _s.name : null; } catch(e) { return null; } }).filter(function(n) { return n; });
      if (_sn.length > 0 && result) result.innerHTML = "<div class='pl-skill-badge'>[SKILL] 已注入技能: " + _sn.join(", ") + "</div>";
      console.log("[SKILL] AutoGenVolumes using skills:", _sn.join(", "));
    }
    this.apiGenerate("volumes", params, function(chunk) {
      if (result) result.innerHTML = "<pre>" + self._escHtml(chunk) + "</pre>";
    }, opts).then(function(text) {
      if (text) {
        pl.volumesText = text;
        var _cr2 = self._lastChainReports || [];
        try {
          var vols = self._plExtractJsonArray(text);
          if (vols && vols.length > 0) {
            pl.volumes = vols.map(function(v, idx) {
              return { id: "vol_" + Date.now() + "_" + idx, name: v.name || ("Volume " + (idx+1)), outline: v.outline || "", summary: v.outline || "", chapters: [], confirmed: false, suggestedWords: parseInt(v.suggestedWords) || 0, chainReports: _cr2 };
            });
            pl.autoVolumeCount = pl.volumes.length;
            var vcInput = document.getElementById("pl-volume-count");
            if (vcInput) vcInput.value = pl.autoVolumeCount;
          }
        } catch(e) { console.warn("[WARN]", e); self._toast("AI返回的卷纲格式异常，已显示原始内容", "warn"); }
        self._plPersist(pl);
        self._plRenderVolumeCards();
        self._syncTreeToPipeline();
        self.renderChapterTree();
      } else {
        self._toast("AI返回了空内容，请重试", "error");
      }
      self._hideLoading();
    }).catch(function(err) {
      self._hideLoading();
      var r = document.getElementById("pl-volume-result");
      if (r) r.style.display = "none";
      self._toast("AI生成卷纲失败: " + (err && err.message ? err.message : String(err)), "error");
      console.error("[ERR] _plAutoGenVolumes:", err);
    });
  }


  App.prototype._plGenSingleVolume = function(targetIdx) {
    var self = this;
    if (!this.isConfigured) { this._toast("请先配置API", "error"); return; }
    var pl = this._plData();
    if (!pl) { this._toast("流水线数据不存在", "error"); return; }
    var outline = (pl.outlineText || (document.getElementById("pl-outline") || {}).value || ((ProjectManager.get(this.currentProjectId)||{}).outline) || "");
    if (!outline) { this._toast("请先确认大纲", "error"); return; }
    if (typeof targetIdx !== "number" || isNaN(targetIdx)) targetIdx = (pl.volumes||[]).length;
    pl.volumes = pl.volumes || [];
    var total = pl.volumes.length;
    var volNo = targetIdx + 1;
    var prevVol = (targetIdx > 0 && pl.volumes[targetIdx - 1]) ? pl.volumes[targetIdx - 1] : null;
    var prevBlueprint = prevVol ? (prevVol.outline || prevVol.summary || "") : "";
    var foreshadowList = "";
    if (prevBlueprint) {
      var fl = [];
      var flines = prevBlueprint.split("\n");
      for (var fi = 0; fi < flines.length; fi++) {
        var ln = flines[fi];
        if (/伏笔|V\[?-?\d.*-?F\d/i.test(ln) || /编号|回收卷|埋设/.test(ln)) fl.push(ln.trim());
      }
      if (fl.length > 0) foreshadowList = fl.slice(0, 30).join("\n");
    }
    var settingsText = pl.settingsText || "";
    var boundText = this._getBoundSettingsText();
    if (boundText) settingsText += "\n\n[约束设定]\n" + boundText;
    this._showLoading("逐卷生成第" + volNo + "卷中...");
    var params = "大纲：\n" + outline;
    if (pl.bookWordCount && pl.bookWordCount > 0) {
      params += "\n\n本书约" + pl.bookWordCount + "字。当前已生成" + total + "卷，本次生成第" + volNo + "卷，请根据剩余篇幅合理分配本卷字数。";
    } else {
      params += "\n\n本次生成第" + volNo + "卷。";
    }
    params += "\n\n返回JSON数组：[{name, outline, summary, suggestedWords}]。name为卷名，outline为本卷蓝图文本，summary为不超过150字摘要，suggestedWords为本卷建议字数(整数)。";
    if (settingsText) params += "\n\n[设定摘要]\n" + settingsText;
    var _styleCtx3 = this._plStyleContext(pl);
    if (_styleCtx3) params += "\n\n[风格与节奏分析]\n" + _styleCtx3;
    // Build context from all previous volumes (not just the immediately previous one)
    if (targetIdx > 0) {
      var prevVolsCtx = [];
      for (var pvi = 0; pvi < targetIdx; pvi++) {
        var pv = pl.volumes[pvi];
        if (pv) {
          var pvSummary = pv.summary || pv.outline || "";
          if (pvSummary && pvSummary.length > 200) pvSummary = pvSummary.substring(0, 200) + "...";
          prevVolsCtx.push("第" + (pvi + 1) + "卷 " + (pv.name || "") + ": " + pvSummary);
        }
      }
      if (prevVolsCtx.length > 0) {
        params += "\n\n[前卷剧情摘要]\n" + prevVolsCtx.join("\n") + "\n请确保本卷剧情与以上各卷衔接，人物状态延续。";
      }
    }
    if (prevBlueprint) {
      params += "\n\n[上一卷蓝图(第" + (volNo - 1) + "卷)]\n" + prevBlueprint;
      if (foreshadowList) params += "\n\n[上一卷已埋伏笔]\n" + foreshadowList + "\n请在本次生成中延续并合理回收相关伏笔。";
      params += "\n\n请确保本卷剧情与上一卷衔接，人物状态延续，不出现跳跃式变化。";
    } else {
      params += "\n\n这是首卷，请为全书定下基调。";
    }
    var result = document.getElementById("pl-volume-result");
    var volCardsEl = document.getElementById("pl-volume-cards");
    if (volCardsEl) volCardsEl.style.display = "none";
    if (result) { result.style.display = "block"; result.innerHTML = ""; }
    var opts = { agentId: pl.agentId, skillIds: (pl.s3Skills || []).filter(function(id) { return id; }) };
    if (opts.skillIds && opts.skillIds.length > 0) {
      var _sn = opts.skillIds.map(function(sid) { try { var _s = SkillManager.get(sid); return _s ? _s.name : null; } catch(e) { return null; } }).filter(function(n) { return n; });
      if (_sn.length > 0 && result) result.innerHTML = "<div class='pl-skill-badge'>[SKILL] 已注入技能: " + _sn.join(", ") + "</div>";
      console.log("[SKILL] SingleVolume gen using skills:", _sn.join(", "));
    }
    this.apiGenerate("volumes", params, function(chunk) {
      if (result) result.innerHTML = "<pre>" + self._escHtml(chunk) + "</pre>";
    }, opts).then(function(text) {
      if (text) {
        pl.volumesText = text;
        var _cr3 = self._lastChainReports || [];
        try {
          var vols = self._plExtractJsonArray(text);
          if (vols && vols.length > 0) {
            var v = vols[0];
            var newVol = {
              id: "vol_" + Date.now(),
              name: v.name || ("第" + volNo + "卷"),
              outline: v.outline || "",
              summary: v.summary || v.outline || "",
              chapters: [],
              confirmed: false,
              suggestedWords: parseInt(v.suggestedWords) || (pl.bookWordCount ? Math.round(pl.bookWordCount / Math.max(total + 1, 1)) : 0),
              cmId: null,
              chainReports: _cr3
            };
            if (targetIdx >= pl.volumes.length) {
              pl.volumes.push(newVol);
            } else {
              var oldChapters = pl.volumes[targetIdx].chapters || [];
              newVol.chapters = oldChapters;
              newVol.confirmed = false;
              pl.volumes[targetIdx] = newVol;
            }
          } else {
            self._toast("AI返回的卷纲格式异常，未找到有效JSON数组", "warn");
          }
        } catch(e) {
          console.warn("[WARN] _plGenSingleVolume parse:", e);
          self._toast("AI返回的卷纲格式异常，已显示原始内容", "warn");
        }
        self._plPersist(pl);
        self._plRenderVolumeCards();
        self._syncTreeToPipeline();
        self.renderChapterTree();
      } else {
        self._toast("AI返回了空内容，请重试", "error");
      }
      self._hideLoading();
    }).catch(function(err) {
      self._hideLoading();
      var r = document.getElementById("pl-volume-result");
      if (r) r.style.display = "none";
      self._toast("逐卷生成失败: " + (err && err.message ? err.message : String(err)), "error");
      console.error("[ERR] _plGenSingleVolume:", err);
    });
  }

  /**
   * 增量续生成：从指定卷之后批量生成所有缺失卷
   * 保留 fromIdx 及之前的卷，从 fromIdx+1 开始逐卷生成
   * 每卷用上一卷的纲要+所有已确认卷摘要作为上下文
   */
  App.prototype._plContinueGenVolumes = async function(fromIdx) {
    var self = this;
    if (!this.isConfigured) { this._toast("请先配置API", "error"); return; }
    var pl = this._plData();
    if (!pl) { this._toast("流水线数据不存在", "error"); return; }
    pl.volumes = pl.volumes || [];
    if (fromIdx < 0 || fromIdx >= pl.volumes.length) { this._toast("卷号无效", "error"); return; }
    var targetCount = parseInt(document.getElementById("pl-volume-count") ? document.getElementById("pl-volume-count").value : (fromIdx + 2)) || (fromIdx + 2);
    var toGen = targetCount - (fromIdx + 1);
    if (toGen <= 0) { this._toast("当前已有" + pl.volumes.length + "卷，目标" + targetCount + "卷，无需续生成", "info"); return; }
    this._toast("续生成：从第" + (fromIdx + 2) + "卷开始，共生成" + toGen + "卷", "info");
    // Delete volumes after fromIdx (they will be regenerated)
    if (pl.volumes.length > fromIdx + 1) {
      // Only delete unlocked volumes after fromIdx, keep locked ones
      for (var di = pl.volumes.length - 1; di > fromIdx; di--) {
        if (!pl.volumes[di].locked) {
          pl.volumes.splice(di, 1);
        }
      }
      this._plPersist(pl);
    }
    for (var gi = 0; gi < toGen; gi++) {
      var curIdx = fromIdx + 1 + gi;
      this._showLoading("续生成第" + (curIdx + 1) + "/" + targetCount + "卷中...");
      try { this._toast("正在续生成第" + (curIdx + 1) + "卷 (" + (gi + 1) + "/" + toGen + ")", "info"); } catch(e){console.warn("[WARN] catch #10 pipeline-manager.js",e);if(window.DiagLogger)DiagLogger.warn("catch","pipeline-manager.js #10",e);}
      await this._plGenSingleVolume(curIdx);
    }
    this._hideLoading();
    this._toast("续生成完成，共生成" + toGen + "卷", "success");
  }

  /**
   * 智能补全：扫描所有卷，在锁定卷之间的空缺处逐卷生成新卷
   * 锁定卷保留不动，未锁定的空缺处用splice插入新卷
   * 每卷传入双向上下文（上文卷摘要+下文锁定卷摘要）
   */
  App.prototype._plSmartSupplementVolumes = async function() {
    var self = this;
    if (!this.isConfigured) { this._toast("请先配置API", "error"); return; }
    var pl = this._plData();
    if (!pl || !pl.volumes || pl.volumes.length === 0) { this._toast("请先生成或添加至少1卷", "info"); return; }
    
    // Find gaps: positions where we need to insert new volumes between locked volumes
    var gaps = [];
    var lockedIndices = [];
    for (var i = 0; i < pl.volumes.length; i++) {
      if (pl.volumes[i].locked) lockedIndices.push(i);
    }
    
    if (lockedIndices.length === 0) {
      this._toast("请先锁定至少1卷，智能补全会在锁定卷之间生成空缺卷", "info");
      return;
    }
    
    // Detect gaps between consecutive locked volumes (gap = empty or unconfirmed/unlocked volumes between them)
    for (var g = 0; g < lockedIndices.length - 1; g++) {
      var startLocked = lockedIndices[g];
      var endLocked = lockedIndices[g + 1];
      var gapSize = endLocked - startLocked - 1;
      if (gapSize > 0) {
        // There are volumes between these locked ones - check if they need regenerating
        var needGen = [];
        for (var k = startLocked + 1; k < endLocked; k++) {
          if (!pl.volumes[k].locked && (!pl.volumes[k].name || !pl.volumes[k].outline)) {
            needGen.push(k);
          }
        }
        if (needGen.length > 0) gaps.push({indices: needGen, beforeIdx: endLocked});
      }
    }
    
    // Also check for gap after last locked volume (if user deleted trailing volumes)
    var lastLocked = lockedIndices[lockedIndices.length - 1];
    var targetCount = parseInt(document.getElementById("pl-volume-count") ? document.getElementById("pl-volume-count").value : (pl.volumes.length)) || pl.volumes.length;
    if (lastLocked < targetCount - 1) {
      var trailingGaps = [];
      for (var t = lastLocked + 1; t < targetCount; t++) {
        if (t >= pl.volumes.length || !pl.volumes[t] || !pl.volumes[t].name || !pl.volumes[t].outline) {
          trailingGaps.push(t);
        }
      }
      if (trailingGaps.length > 0) gaps.push({indices: trailingGaps, beforeIdx: -1});
    }
    
    if (gaps.length === 0) {
      this._toast("未检测到空缺卷，所有锁定卷之间已无缺失", "info");
      return;
    }
    
    var totalGen = gaps.reduce(function(sum, gap) { return sum + gap.indices.length; }, 0);
    this._toast("智能补全：检测到" + totalGen + "卷空缺，开始逐卷生成", "info");
    
    var genCount = 0;
    for (var gi = 0; gi < gaps.length; gi++) {
      var gap = gaps[gi];
      for (var ii = 0; ii < gap.indices.length; ii++) {
        var targetIdx = gap.indices[ii];
        genCount++;
        this._showLoading("智能补全第" + genCount + "/" + totalGen + "卷...");
        try { this._toast("正在生成第" + (targetIdx + 1) + "卷 (" + genCount + "/" + totalGen + ")", "info"); } catch(e){console.warn("[WARN] catch #11 pipeline-manager.js",e);if(window.DiagLogger)DiagLogger.warn("catch","pipeline-manager.js #11",e);}
        // Build dual-direction context
        var prevCtx = "";
        if (targetIdx > 0) {
          for (var pi = targetIdx - 1; pi >= 0; pi--) {
            var pv = pl.volumes[pi];
            if (pv && (pv.name || pv.outline)) {
              var pvText = pv.locked ? (pv.outline || pv.summary || "") : (pv.summary || "").substring(0, 200);
              prevCtx = "第" + (pi + 1) + "卷 " + (pv.name || "") + ": " + pvText + (prevCtx ? "\n" + prevCtx : "");
              break;
            }
          }
        }
        var nextCtx = "";
        if (gap.beforeIdx >= 0 && gap.beforeIdx < pl.volumes.length) {
          var nv = pl.volumes[gap.beforeIdx];
          if (nv && nv.locked) {
            nextCtx = "后续锁定卷摘要: " + (nv.summary || nv.outline || "").substring(0, 200);
          }
        }
        await this._plGenSingleVolumeWithContext(targetIdx, prevCtx, nextCtx);
      }
    }
    this._hideLoading();
    this._toast("智能补全完成，共生成" + genCount + "卷", "success");
  }

/**
   * 带双向上下文的单卷生成（供智能补全调用）
   */
  App.prototype._plGenSingleVolumeWithContext = async function(targetIdx, prevCtx, nextCtx) {
    var self = this;
    var pl = this._plData();
    if (!pl) { this._toast("流水线数据不存在", "error"); return; }
    var outline = (pl.outlineText || (document.getElementById("pl-outline") || {}).value || ((ProjectManager.get(this.currentProjectId)||{}).outline) || "");
    if (!outline) { this._toast("请先确认大纲", "error"); return; }
    pl.volumes = pl.volumes || [];
    var volNo = targetIdx + 1;
    var settingsText = pl.settingsText || "";
    var boundText = this._getBoundSettingsText();
    if (boundText) settingsText += "\n\n[约束设定]\n" + boundText;
    var params = "大纲：\n" + outline;
    if (pl.bookWordCount && pl.bookWordCount > 0) {
      params += "\n\n本书约" + pl.bookWordCount + "字。本次生成第" + volNo + "卷。";
    } else {
      params += "\n\n本次生成第" + volNo + "卷。";
    }
    params += "\n\n返回JSON数组：[{name, outline, summary, suggestedWords}]。";
    if (settingsText) params += "\n\n[设定摘要]\n" + settingsText;
    var _styleCtx3 = this._plStyleContext(pl);
    if (_styleCtx3) params += "\n\n[风格与节奏分析]\n" + _styleCtx3;
    if (prevCtx) params += "\n\n[前卷剧情摘要]\n" + prevCtx + "\n请确保本卷剧情与以上前卷衔接。";
    if (nextCtx) params += "\n\n[后续卷方向提示]\n" + nextCtx + "\n请确保本卷剧情能自然引向后续卷。";
    if (!prevCtx && !nextCtx) params += "\n\n这是首卷，请为全书定下基调。";
    var opts = { agentId: pl.agentId, skillIds: (pl.s3Skills || []).filter(function(id) { return id; }) };
    try {
      var text = await this.apiGenerate("volumes", params, null, opts);
      if (text) {
        pl.volumesText = text;
        var _cr3 = this._lastChainReports || [];
        var vols = this._plExtractJsonArray(text);
        if (vols && vols.length > 0) {
          var v = vols[0];
          var newVol = {
            id: "vol_" + Date.now(),
            name: v.name || ("第" + volNo + "卷"),
            outline: v.outline || "",
            summary: v.summary || v.outline || "",
            chapters: [],
            confirmed: false,
            suggestedWords: parseInt(v.suggestedWords) || (pl.bookWordCount ? Math.round(pl.bookWordCount / Math.max(pl.volumes.length + 1, 1)) : 0),
            cmId: null,
            chainReports: _cr3
          };
          var oldChapters = (targetIdx < pl.volumes.length && pl.volumes[targetIdx]) ? (pl.volumes[targetIdx].chapters || []) : [];
          newVol.chapters = oldChapters;
          if (targetIdx >= pl.volumes.length) {
            pl.volumes.push(newVol);
          } else {
            pl.volumes[targetIdx] = newVol;
          }
        } else {
          this._toast("AI返回的卷纲格式异常", "warn");
        }
        this._plPersist(pl);
        this._plRenderVolumeCards();
        this._syncTreeToPipeline();
        this.renderChapterTree();
      } else {
        this._toast("AI返回了空内容", "error");
      }
    } catch(err) {
      this._toast("智能补全第" + volNo + "卷失败: " + (err && err.message ? err.message : String(err)), "error");
      console.error("[ERR] _plGenSingleVolumeWithContext:", err);
    }
  }

 App.prototype._plRenderVolumeCards = function() {
   var pl = this._plData();
    if (!pl) return;
    var container = document.getElementById("pl-volume-cards");
    if (!container) return;
    var self = this;
   if (!pl.volumes || pl.volumes.length === 0) {
     container.style.display = "block";
     container.classList.remove("pl-hidden");
     container.innerHTML = "";
     var addBtnEmpty = document.createElement("button");
     addBtnEmpty.textContent = "+ 添加卷";
     addBtnEmpty.style.cssText = "padding:6px 16px;background:var(--accent,#4a9eff);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;margin-top:4px;";
     addBtnEmpty.onclick = function() { pl.volumes = pl.volumes || []; pl.volumes.push({ id: "vol_" + Date.now(), name: "", outline: "", summary: "", confirmed: false, chapters: [] }); self._plPersist(pl); self._plRenderVolumeCards(); };
     container.appendChild(addBtnEmpty);
     var volResultEmpty = document.getElementById("pl-volume-result");
     if (volResultEmpty) volResultEmpty.style.display = "none";
     return;
   }
   container.style.display = "block";
   container.classList.remove("pl-hidden");
   var volResult = document.getElementById("pl-volume-result");
   if (volResult) volResult.style.display = "none";
    container.innerHTML = "";
    pl.volumes.forEach(function(vol, i) {
      var card = document.createElement("div");
      card.className = "pl-vol-card" + (vol.confirmed ? " confirmed" : "");
      card.style.cssText = "border:1px solid " + (vol.confirmed ? "#4a9" : "var(--border,#3a3a3e)") + ";border-radius:8px;padding:12px;margin-bottom:8px;background:var(--bg-card,#1e1e22);overflow:hidden;min-width:0;max-width:100%;box-sizing:border-box;";
      var header = document.createElement("div");
      header.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:8px;";
      var idx = document.createElement("span");
      idx.textContent = "#" + (i + 1);
      idx.style.cssText = "color:var(--text-dim,#888);font-size:14px;min-width:24px;";
      var nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.value = vol.name || "";
      nameInput.style.cssText = "flex:1;padding:4px 8px;background:var(--bg-input,#2a2a2e);color:var(--text,#e0e0e0);border:1px solid var(--border,#3a3a3e);border-radius:4px;font-size:14px;";
      nameInput.addEventListener("input", function() { pl.volumes[i].name = this.value; });
      nameInput.addEventListener("change", function() { self._plPersist(pl); });
      var delBtn = document.createElement("button");
      delBtn.textContent = "x";
      delBtn.className = "pl-vol-del-btn";
      delBtn.style.cssText = "padding:4px 10px;background:var(--bg-input,#2a2a2e);color:#f88;border:1px solid var(--border,#3a3a3e);border-radius:4px;cursor:pointer;font-size:14px;";
      delBtn.onclick = function() { pl.volumes.splice(i, 1); self._plPersist(pl); self._plRenderVolumeCards(); self._plCheckAllVolumesConfirmed(); };
      header.appendChild(idx);
      header.appendChild(nameInput);
      header.appendChild(delBtn);
      var outlineTa = document.createElement("textarea");
      outlineTa.value = vol.outline || "";
      outlineTa.style.cssText = "width:100%;min-height:60px;padding:8px;background:var(--bg-input,#2a2a2e);color:var(--text,#e0e0e0);border:1px solid var(--border,#3a3a3e);border-radius:4px;font-size:14px;resize:vertical;box-sizing:border-box;";
      outlineTa.addEventListener("input", function() { pl.volumes[i].outline = this.value; pl.volumes[i].summary = this.value; });
      outlineTa.addEventListener("change", function() { self._plPersist(pl); });
      card.appendChild(header);
      card.appendChild(outlineTa);
      if (vol.suggestedWords && vol.suggestedWords > 0) {
        var wcInfo = document.createElement("div");
        wcInfo.style.cssText = "font-size:12px;color:var(--accent,#4a9eff);margin-top:4px;margin-bottom:4px;";
        wcInfo.textContent = "本卷字数: " + vol.suggestedWords.toLocaleString() + " 字";
        card.appendChild(wcInfo);
      }
      var actions = document.createElement("div");
      actions.style.cssText = "display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;";
      var saveBtn = document.createElement("button");
      saveBtn.textContent = "保存本卷";
      saveBtn.style.cssText = "padding:4px 12px;background:var(--bg-input,#2a2a2e);color:#8cf;border:1px solid var(--border,#3a3a3e);border-radius:4px;cursor:pointer;font-size:12px;white-space:nowrap;flex-shrink:0;";
      saveBtn.onclick = function() { self._plSaveVolume(i); };
      var confirmBtn = document.createElement("button");
      confirmBtn.textContent = vol.confirmed ? "✓ 已确认" : "确认本卷";
      confirmBtn.style.cssText = "padding:4px 12px;background:var(--bg-input,#2a2a2e);color:#8f8;border:1px solid var(--border,#3a3a3e);border-radius:4px;cursor:pointer;font-size:12px;white-space:nowrap;flex-shrink:0;";
      
      confirmBtn.onclick = function() { self._plConfirmVolume(i); };
      actions.appendChild(saveBtn);
      actions.appendChild(confirmBtn);
      var nextBtn = document.createElement("button");
      nextBtn.textContent = "生成下一卷";
      nextBtn.style.cssText = "padding:4px 12px;background:var(--bg-input,#2a2a2e);color:#fc8;border:1px solid var(--border,#3a3a3e);border-radius:4px;cursor:pointer;font-size:12px;white-space:nowrap;flex-shrink:0;";
      nextBtn.onclick = function() { self._plGenSingleVolume(i + 1); };
      actions.appendChild(nextBtn);
      var continueBtn = document.createElement("button");
      continueBtn.textContent = "续生成后续";
      continueBtn.title = "从本卷开始，批量生成后续所有缺失卷，保留本卷及之前的卷";
      continueBtn.style.cssText = "padding:4px 12px;background:#3a4a2e;color:#cf8;border:1px solid #4a5a3e;border-radius:4px;cursor:pointer;font-size:12px;white-space:nowrap;flex-shrink:0;";
      continueBtn.onclick = function() { self._plContinueGenVolumes(i); };
      actions.appendChild(continueBtn);

      // Lock button (Feature 1: incremental volume generation)
      var lockBtn = document.createElement("button");
      lockBtn.textContent = vol.locked ? "\u2b50 \u5df2\u9501\u5b9a" : "\u9501\u5b9a";
      lockBtn.title = vol.locked ? "\u89e3\u9501\u672c\u5377" : "\u9501\u5b9a\u672c\u5377(\u9501\u5b9a\u540e\u4e0d\u4f1a\u88ab\u8986\u76d6\u6216\u5220\u9664)";
      lockBtn.style.cssText = "padding:4px 12px;background:" + (vol.locked ? "#4a3a1e" : "var(--bg-input,#2a2a2e)") + ";color:" + (vol.locked ? "#fc8" : "var(--text-dim,#888)") + ";border:1px solid " + (vol.locked ? "#6a5a3e" : "var(--border,#3a3a3e)") + ";border-radius:4px;cursor:pointer;font-size:12px;white-space:nowrap;flex-shrink:0;";
      if (vol.locked) { card.style.borderColor = "#caa040"; }
      lockBtn.onclick = function() {
        var _pl = self._plData();
        _pl.volumes[i].locked = !_pl.volumes[i].locked;
        self._plPersist(_pl);
        self._plRenderVolumeCards();
        self._toast(_pl.volumes[i].locked ? "\u5df2\u9501\u5b9a\u7b2c" + (i+1) + "\u5377" : "\u5df2\u89e3\u9501\u7b2c" + (i+1) + "\u5377", "info");
      };
      actions.appendChild(lockBtn);

      card.appendChild(actions);
      // Chain reports display (if skill chain was used)
      if (vol.chainReports && vol.chainReports.length > 0) {
        var reportToggle = document.createElement("button");
        reportToggle.textContent = "查看链式报告 (" + vol.chainReports.length + "步)";
        reportToggle.style.cssText = "padding:4px 12px;background:var(--bg-input,#2a2a2e);color:#c8f;border:1px solid var(--border,#3a3a3e);border-radius:4px;cursor:pointer;font-size:12px;margin-top:8px;";
        var reportBox = document.createElement("div");
        reportBox.style.cssText = "display:none;margin-top:8px;border:1px solid var(--border,#3a3a3e);border-radius:6px;overflow:hidden;";
        reportToggle.onclick = function() {
          if (reportBox.style.display === "none") {
            reportBox.style.display = "block";
            reportToggle.textContent = "收起链式报告";
          } else {
            reportBox.style.display = "none";
            reportToggle.textContent = "查看链式报告 (" + vol.chainReports.length + "步)";
          }
        };
        vol.chainReports.forEach(function(rpt) {
          var rptSection = document.createElement("div");
          rptSection.style.cssText = "padding:8px;border-bottom:1px solid var(--border,#3a3a3e);";
          var rptTitle = document.createElement("div");
          rptTitle.style.cssText = "font-size:12px;color:var(--accent,#4a9eff);margin-bottom:4px;font-weight:bold;";
          rptTitle.textContent = "Skill " + rpt.step + "/" + rpt.totalSteps + ": " + rpt.skillName;
          var rptPre = document.createElement("pre");
          rptPre.style.cssText = "white-space:pre-wrap;word-wrap:break-word;font-size:12px;color:var(--text,#e0e0e0);max-height:300px;overflow-y:auto;margin:0;padding:4px;background:var(--bg-input,#2a2a2e);border-radius:4px;";
          rptPre.textContent = rpt.text || "(空)";
          rptSection.appendChild(rptTitle);
          rptSection.appendChild(rptPre);
          reportBox.appendChild(rptSection);
        });
        card.appendChild(reportToggle);
        card.appendChild(reportBox);
      }
      container.appendChild(card);
    });
    var batchBar = document.createElement("div");
    batchBar.style.cssText = "display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;";
    var confirmAllBtn = document.createElement("button");
    confirmAllBtn.textContent = "一键确认所有卷纲";
    confirmAllBtn.style.cssText = "padding:6px 16px;background:#4a9;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;";
    confirmAllBtn.onclick = function() {
      var unconfirmed = pl.volumes.filter(function(v) { return !v.confirmed; });
      if (unconfirmed.length === 0) { self._toast("所有卷纲已确认", "info"); return; }
      pl.volumes.forEach(function(vol) { vol.confirmed = true; });
      self._plPersist(pl);
      self._plRenderVolumeCards();
      self._toast("已确认全部 " + pl.volumes.length + " 卷", "success");
    };
    batchBar.appendChild(confirmAllBtn);
    var addBtn = document.createElement("button");
    addBtn.textContent = "+ 添加卷";
    addBtn.style.cssText = "padding:6px 16px;background:var(--accent,#4a9eff);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;";
    addBtn.onclick = function() { pl.volumes.push({ id: "vol_" + Date.now(), name: "", outline: "", summary: "", confirmed: false, chapters: [] }); self._plPersist(pl); self._plRenderVolumeCards(); };
    batchBar.appendChild(addBtn);
    var smartBtn = document.createElement("button");
    smartBtn.textContent = "\u667a\u80fd\u8865\u5168";
    smartBtn.title = "\u626b\u63cf\u6240\u6709\u5377\uff0c\u5728\u9501\u5b9a\u5377\u4e4b\u95f4\u7684\u7a7a\u7f3a\u5904\u9010\u5377\u751f\u6210\u65b0\u5377\uff0c\u9501\u5b9a\u5377\u4e0d\u53d7\u5f71\u54cd";
    smartBtn.style.cssText = "padding:6px 16px;background:#3a4a2e;color:#cf8;border:1px solid #4a5a3e;border-radius:6px;cursor:pointer;font-size:14px;";
    smartBtn.onclick = function() { self._plSmartSupplementVolumes(); };
    batchBar.appendChild(smartBtn);
    container.appendChild(batchBar);
    self._plCheckAllVolumesConfirmed();
  }
  App.prototype._plSaveVolume = function(index) {
    var pl = this._plData();
    if (!pl || !pl.volumes[index]) { this._toast("卷纲不存在", "error"); return; }
    var vol = pl.volumes[index];
    var cards = document.querySelectorAll("#pl-volume-cards .pl-vol-card");
    if (cards[index]) {
      var nameInput = cards[index].querySelector("input[type=text]");
      var outlineTa = cards[index].querySelector("textarea");
      if (nameInput) vol.name = nameInput.value;
      if (outlineTa) { vol.outline = outlineTa.value; vol.summary = outlineTa.value; }
    }
    var existingVols = ChapterManager.getVolumes(this.currentProjectId) || [];
    var cmVol = null;
    for (var i = 0; i < existingVols.length; i++) {
      if (existingVols[i].id === vol.id || existingVols[i].id === vol.cmId) { cmVol = existingVols[i]; break; }
    }
    if (!cmVol) {
      var newVol = ChapterManager.createVolume(this.currentProjectId, { name: vol.name, outline: vol.outline });
      vol.cmId = newVol.id;
    } else {
      ChapterManager.updateVolume(this.currentProjectId, cmVol.id, { name: vol.name, outline: vol.outline });
      vol.cmId = cmVol.id;
    }
    this._plPersist(pl);
    this._toast("卷纲已保存: " + vol.name, "success");
  }
  App.prototype._plConfirmVolume = function(index) {
    var pl = this._plData();
    if (!pl || !pl.volumes[index]) return;
    var vol = pl.volumes[index];
    if (!vol.name || !vol.outline) { this._toast("请先填写卷名和纲要", "info"); return; }
    this._plSaveVolume(index);
    pl = this._plData();
    var vol = pl.volumes[index];
    vol.confirmed = !vol.confirmed;
    this._plPersist(pl);
    if (vol.confirmed) {
      this._plCheckAllVolumesConfirmed();
    } else {
      pl = this._plData();
      pl.volumesConfirmed = false;
      pl.chaptersConfirmed = false;
      this._plPersist(pl);
      this._plInvalidateDownstream(3, index);
    }
    this._plRenderVolumeCards();
    this._plRefreshSteps();
  }
  App.prototype._plCheckAllVolumesConfirmed = function() {
    var pl = this._plData();
    if (!pl || !pl.volumes || pl.volumes.length === 0) return;
    var allConfirmed = pl.volumes.every(function(v) { return v.confirmed; });
    var hint = document.getElementById("pl-vol-confirm-hint");
    var btnConfirm = document.getElementById("btn-pl-create-volumes");
    if (allConfirmed) {
      pl.volumesConfirmed = true;
      if (hint) hint.style.display = "none";
      if (btnConfirm) { btnConfirm.style.display = ""; btnConfirm.textContent = "全部确认卷纲"; }
    } else {
      pl.volumesConfirmed = false;
      if (hint) hint.style.display = "";
      if (btnConfirm) btnConfirm.style.display = "none";
    }
    this._plPersist(pl);
  }

  App.prototype._plGenChapters = function() {
    // Now: generate chapters for a specific volume (called from vol list)
    // This is kept for backward compat but delegates to per-volume generation
    var pl = this._plData();
    if (!pl || !pl.volumesConfirmed) { this._toast("请先在上一步确认卷纲", "info"); return; }
    if (pl.currentVolumeIndex < 0 || pl.currentVolumeIndex === undefined) { this._toast("请在左侧选择一个卷纲", "info"); return; }
    this._plGenChaptersForVolume(pl.currentVolumeIndex);
  }
  App.prototype._plRenderVolList = function() {
    var pl = this._plData();
    if (!pl) return;
    var container = document.getElementById("pl-vol-list");
    if (!container) return;
    var self = this;
    var confirmedVols = (pl.volumes || []).filter(function(v) { return v.confirmed; });
    if (confirmedVols.length === 0) { container.innerHTML = "<p class=\"empty-hint\">请先在上一步确认卷纲</p>"; return; }
    container.innerHTML = "";
    confirmedVols.forEach(function(vol) {
      var realIdx = pl.volumes.indexOf(vol);
      var item = document.createElement("div");
      item.className = "pl-vol-list-item" + (pl.currentVolumeIndex === realIdx ? " active" : "");
      var chCount = (vol.chapters || []).length;
      var confirmedCount = (vol.chapters || []).filter(function(c) { return c.confirmed; }).length;
      item.innerHTML = "<span>" + self._escHtml(vol.name) + "</span><span class=\"vol-status\">" + confirmedCount + "/" + chCount + "</span>";
     item.onclick = function() {
       var _pl = self._plData();
       _pl.currentVolumeIndex = realIdx;
       self._plPersist(_pl);
       self._plRenderVolList();
       self._plRenderChapterCards(realIdx);
        self._plUpdateChEstCount(realIdx);
     };
     container.appendChild(item);
   });
   // Auto-render chapter cards for the current volume when panel opens
   if (confirmedVols.length > 0 && pl.currentVolumeIndex >= 0 && pl.currentVolumeIndex < pl.volumes.length) {
     self._plRenderChapterCards(pl.currentVolumeIndex);
      self._plUpdateChEstCount(pl.currentVolumeIndex);
   } else if (confirmedVols.length > 0) {
     var firstRealIdx = pl.volumes.indexOf(confirmedVols[0]);
     pl.currentVolumeIndex = firstRealIdx;
     self._plPersist(pl);
     self._plRenderChapterCards(firstRealIdx);
      self._plUpdateChEstCount(firstRealIdx);
   }
 }
 // Helper: read per-chapter word count from UI input, fallback to data, default 3000
 App.prototype._plGetChBatchSize = function() {
  var el = document.getElementById("pl-chapter-batchsize");
  if (el) { var v = parseInt(el.value); if (v && v >= 1) return v; }
  var pl = this._plData();
  return (pl && pl.chapterBatchSize) ? pl.chapterBatchSize : 5;
};

App.prototype._plGetChWordCount = function() {
   var el = document.getElementById("pl-chapter-wordcount");
   if (el) { var v = parseInt(el.value); if (v && v >= 500) return v; }
   var pl = this._plData();
   return (pl && pl.chapterWordCount) ? pl.chapterWordCount : 3000;
 };
 // Helper: update "estimated chapter count" hint based on selected volume's word count
 App.prototype._plUpdateChEstCount = function(volIdx) {
   var el = document.getElementById("pl-ch-est-count");
   if (!el) return;
   var pl = this._plData();
   if (!pl || !pl.volumes[volIdx]) { el.textContent = "选择卷纲后显示预计章节数"; return; }
   var vol = pl.volumes[volIdx];
   var volWords = parseInt(vol.suggestedWords) || 0;
   if (!volWords) {
     var vcount = (pl.volumes && pl.volumes.length) || 1;
     volWords = (pl.bookWordCount && pl.bookWordCount > 0) ? Math.round(pl.bookWordCount / vcount) : 0;
   }
   var chWc = this._plGetChWordCount();
   if (volWords > 0) {
     var est = Math.max(1, Math.round(volWords / chWc));
     el.textContent = "本卷约 " + volWords + " 字 / 每章 " + chWc + " 字 = 预计 " + est + " 章";
 } else {
   el.textContent = "卷纲未设字数，默认生成 5 章";
  }
};
/**
 * Feature 2: 分批增量章节生成
 * 每批生成 batchSize 章并立即保存+渲染UI，断网时已生成章节不丢失
 */
App.prototype._plGenChaptersBatched = async function(volIdx, opts) {
  var self = this;
  var pl = this._plData();
  if (!pl || !pl.volumes[volIdx]) { this._toast("卷不存在", "error"); return; }
  var vol = pl.volumes[volIdx];
  var chWordCount = parseInt(pl.chapterWordCount) || this._plGetChWordCount() || 3000;
  if (!chWordCount || chWordCount < 500) chWordCount = 3000;
  var volWords = parseInt(vol.suggestedWords) || 0;
  if (!volWords) {
    var vcount = (pl.volumes && pl.volumes.length) || 1;
    volWords = (pl.bookWordCount && pl.bookWordCount > 0) ? Math.round(pl.bookWordCount / vcount) : 0;
  }
  var expectedCount = (volWords > 0) ? Math.max(1, Math.round(volWords / chWordCount)) : 5;
  if (opts && opts.expectedCount) expectedCount = opts.expectedCount;
  
  var batchSize = this._plGetChBatchSize();
  if (batchSize < 1) batchSize = 1;
  if (batchSize > 20) batchSize = 20;
  
  var outline = pl.outlineText || "";
  var settingsText = pl.settingsText || "";
  var boundText = this._getBoundSettingsText();
  if (boundText) settingsText += "\n\n[约束设定]\n" + boundText;
  var _styleCtxCh = this._plStyleContext(pl);
  
  // Ensure chapters array exists
  if (!vol.chapters) vol.chapters = [];
  
  // Save progress record
  pl.genProgress = {
    layer: 'chapters',
    volIdx: volIdx,
    volId: vol.id,
    completedCount: vol.chapters.length,
    expectedCount: expectedCount,
    status: 'in_progress',
    timestamp: Date.now()
  };
  self._plPersist(pl);
  
  // Render initial UI with progress bar
  self._plRenderChapterCards(volIdx);
  self._plShowChapterProgressBar(volIdx, vol.chapters.length, expectedCount, 'in_progress');
  
  var totalBatches = Math.ceil((expectedCount - vol.chapters.length) / batchSize);
  var batchIdx = 0;
  
  while (vol.chapters.length < expectedCount) {
    batchIdx++;
    var currentCount = vol.chapters.length;
    var remaining = expectedCount - currentCount;
    var thisBatch = Math.min(batchSize, remaining);
    var startCh = currentCount + 1;
    var endCh = currentCount + thisBatch;
    
    console.log("[CHAPTER] Batch " + batchIdx + "/" + totalBatches + ": generating ch" + startCh + "-" + endCh);
    try { self._toast("正在生成第" + startCh + "-" + endCh + "章 (" + currentCount + "/" + expectedCount + "已完成)", "info"); } catch(e){console.warn("[WARN] catch #12 pipeline-manager.js",e);if(window.DiagLogger)DiagLogger.warn("catch","pipeline-manager.js #12",e);}
    
    // Build context: existing chapter titles+summaries so AI knows what happened before
    var prevChapsCtx = "";
    if (currentCount > 0) {
      var prevSummaries = [];
      var ctxStart = Math.max(0, currentCount - 10); // last 10 chapters as context
      for (var ci = ctxStart; ci < currentCount; ci++) {
        var pc = vol.chapters[ci];
        if (pc && pc.title) {
          var pcSummary = (pc.plot || pc.summary || "").substring(0, 100);
          prevSummaries.push("第" + (ci + 1) + "章 " + pc.title + ": " + pcSummary);
        }
      }
      if (prevSummaries.length > 0) {
        prevChapsCtx = "\n\n[前文已生成章节]\n" + prevSummaries.join("\n") + "\n请确保新章节与前文剧情衔接，不重复已发生的情节。";
      }
    }
    
    var batchParams = "[全书大纲]\n" + outline + "\n\n[设定摘要]\n" + settingsText + 
      (_styleCtxCh ? "\n\n[风格与节奏分析]\n" + _styleCtxCh + "\n\n" : "") + 
      "\n\n[当前卷概要]\n" + vol.name + ": " + (vol.outline || vol.summary || "") + 
      (volWords > 0 ? "\n\n本卷计划约" + volWords + "字" : "") + 
      "\n\n前面已生成了第1-" + currentCount + "章。请继续生成第" + startCh + "章到第" + endCh + "章，共" + thisBatch + "章。每章约" + chWordCount + "字。" +
      prevChapsCtx +
      "\n\n返回JSON数组：[{title, plot, summary}]。";
    
    var batchOpts = { agentId: pl.agentId, skillIds: (pl.s4Skills || []).filter(function(id) { return id; }), expectedCount: expectedCount };
    
    try {
      var batchText = await self.apiGenerate("chapters", batchParams, null, batchOpts);
      if (batchText) {
        var batchChaps = self._plExtractJsonArray(batchText);
        if (batchChaps && batchChaps.length > 0) {
          // Add new chapters to vol.chapters
          for (var bi = 0; bi < batchChaps.length && vol.chapters.length < expectedCount; bi++) {
            var bc = batchChaps[bi];
            var chIdx = vol.chapters.length;
            vol.chapters.push({
              id: "ch_" + Date.now() + "_" + chIdx,
              title: bc.title || ("第" + (chIdx + 1) + "章"),
              plot: bc.plot || bc.summary || "",
              summary: bc.summary || "",
              confirmed: false,
              wordCount: chWordCount,
              body: "",
              bodyGenerated: false
            });
          }
          // IMMEDIATELY save and render after each batch
          self._plPersist(pl);
          self._plRenderChapterCards(volIdx);
          self._plShowChapterProgressBar(volIdx, vol.chapters.length, expectedCount, 'in_progress');
          self._plRenderVolList();
          try { self.renderChapterTree(); } catch(e) { console.warn("[WARN] tree render:", e); }
          console.log("[CHAPTER] Batch " + batchIdx + " done, total: " + vol.chapters.length + "/" + expectedCount);
        } else {
          console.warn("[WARN] Batch " + batchIdx + " returned no valid JSON chapters");
        }
      }
    } catch(batchErr) {
      console.error("[ERR] Batch " + batchIdx + " failed:", batchErr.message);
      // Mark progress as interrupted and show recovery bar
      pl.genProgress.status = 'interrupted';
      pl.genProgress.completedCount = vol.chapters.length;
      pl.genProgress.timestamp = Date.now();
      self._plPersist(pl);
      self._plShowChapterProgressBar(volIdx, vol.chapters.length, expectedCount, 'interrupted');
      throw batchErr;
    }
  }
  
  // All chapters generated successfully
  pl.genProgress.status = 'completed';
  pl.genProgress.completedCount = vol.chapters.length;
  pl.genProgress.timestamp = Date.now();
  self._plPersist(pl);
  self._plHideChapterProgressBar(volIdx);
  self._plRenderChapterCards(volIdx);
  self._plRenderVolList();
  try { self.renderChapterTree(); } catch(e) { console.warn("[WARN] tree render:", e); }
  self._toast("章节生成完成，共" + vol.chapters.length + "章", "success");
  return vol.chapters;
};

/**
 * Feature 2: 显示章节生成进度条
 */
App.prototype._plShowChapterProgressBar = function(volIdx, completed, expected, status) {
  var container = document.getElementById("pl-chapter-cards");
  if (!container) return;
  var bar = document.getElementById("pl-ch-progress-bar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "pl-ch-progress-bar";
    bar.style.cssText = "position:sticky;top:0;z-index:100;padding:8px 12px;background:var(--bg-tertiary,#1a1a1e);border:1px solid var(--border,#3a3a3e);border-radius:6px;margin-bottom:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;";
    container.insertBefore(bar, container.firstChild);
  }
  var pct = expected > 0 ? Math.round(completed / expected * 100) : 0;
  var statusText = status === 'interrupted' ? "\u26a0\ufe0f \u751f\u6210\u4e2d\u65ad" : "\u751f\u6210\u4e2d";
  var statusColor = status === 'interrupted' ? "#f88" : "var(--accent,#4a9eff)";
  var resumeBtn = status === 'interrupted' ? ' <button id="pl-ch-resume-btn" style="padding:4px 12px;background:#4a6a3e;color:#cf8;border:1px solid #5a7a4e;border-radius:4px;cursor:pointer;font-size:12px;">\u6062\u590d\u751f\u6210</button>' : '';
  bar.innerHTML = '<span style="color:' + statusColor + ';font-size:13px;white-space:nowrap;">' + statusText + ': ' + completed + '/' + expected + ' \u7ae0 (' + pct + '%)</span>' +
    '<div style="flex:1;min-width:80px;height:8px;background:var(--bg-input,#2a2a2e);border-radius:4px;overflow:hidden;"><div style="width:' + pct + '%;height:100%;background:' + statusColor + ';transition:width 0.3s;"></div></div>' +
    resumeBtn;
  var resumeEl = document.getElementById("pl-ch-resume-btn");
  if (resumeEl) {
    var self = this;
    resumeEl.onclick = function() { self._plResumeChapterGen(volIdx); };
  }
};

/**
 * Feature 2: 隐藏章节生成进度条
 */
App.prototype._plHideChapterProgressBar = function(volIdx) {
  var bar = document.getElementById("pl-ch-progress-bar");
  if (bar) {
    setTimeout(function() { if (bar && bar.parentNode) bar.parentNode.removeChild(bar); }, 3000);
  }
};

/**
 * Feature 2: 恢复章节生成（从断点继续）
 */
App.prototype._plResumeChapterGen = async function(volIdx) {
  var self = this;
  var pl = this._plData();
  if (!pl || !pl.volumes[volIdx]) { this._toast("卷不存在", "error"); return; }
  var vol = pl.volumes[volIdx];
  if (!vol.chapters) vol.chapters = [];
  
  // Check if there's a progress record
  if (pl.genProgress && pl.genProgress.layer === 'chapters' && pl.genProgress.volIdx === volIdx) {
    var expected = pl.genProgress.expectedCount;
    var completed = vol.chapters.length;
    if (completed >= expected) {
      this._toast("该卷章节已全部生成", "info");
      self._plHideChapterProgressBar(volIdx);
      return;
    }
    this._toast("从第" + (completed + 1) + "章恢复生成", "info");
  }
  
  // Call batched generation - it will pick up from vol.chapters.length
  try {
    await this._plGenChaptersBatched(volIdx, {});
  } catch(e) {
    this._toast("恢复生成失败: " + (e.message || String(e)), "error");
  }
};



// _plCalcMaxTokens removed - no token budget, let API decide max output

   // Direct chapter generation: no DOM dependency, for tree quick-action
 App.prototype._plGenChaptersDirect = function(volIdx) {
    var self = this;
    if (!this.isConfigured) { this._toast("请先配置API", "error"); return; }
    var pl = this._plData();
    if (!pl || !pl.volumes[volIdx]) return;
    var vol = pl.volumes[volIdx];
    // Feature 2: Use batched incremental generation
    vol.chapters = [];
    this._plPersist(pl);
    this._plGenChaptersBatched(volIdx, {}).then(function() {
      self._toast("章节生成完成", "success");
    }).catch(function(e) {
      self._toast("生成失败: " + (e.message || String(e)), "error");
    });
  };
  App.prototype._plGenChaptersForVolume = function(volIdx) {
    var self = this;
    if (!this.isConfigured) { this._toast("请先配置API", "error"); return; }
    var pl = this._plData();
    if (!pl || !pl.volumes[volIdx]) return;
    var vol = pl.volumes[volIdx];
    // Feature 2: Use batched incremental generation
    // Clear existing chapters and generate from scratch
    vol.chapters = [];
    this._plPersist(pl);
    this._showLoading("AI 分批生成章节中...");
    // Delegate to batched generation
    this._plGenChaptersBatched(volIdx, {}).then(function() {
      self._hideLoading();
    }).catch(function(err) {
      self._hideLoading();
      self._toast("章节生成失败: " + (err && err.message ? err.message : String(err)), "error");
      console.error("[ERR] _plGenChaptersForVolume:", err);
    });
  }
  App.prototype._plAutoGenChapters = function(volIdx) {
    var self = this;
    if (!this.isConfigured) { this._toast("请先配置API", "error"); return; }
    var pl = this._plData();
    if (!pl || !pl.volumes[volIdx]) {
      if (pl && pl.currentVolumeIndex !== undefined && pl.currentVolumeIndex >= 0) { volIdx = pl.currentVolumeIndex; pl = this._plData(); }
      else { this._toast("请先选择一个卷", "info"); return; }
    }
    if (!pl || !pl.volumes[volIdx]) { this._toast("卷不存在", "error"); return; }
    var vol = pl.volumes[volIdx];
    // Feature 2: Use batched incremental generation (auto mode)
    vol.chapters = [];
    this._plPersist(pl);
    this._showLoading("AI 自动分批生成章节中...");
    this._plGenChaptersBatched(volIdx, {}).then(function() {
      self._hideLoading();
    }).catch(function(err) {
      self._hideLoading();
      self._toast("自动生成章节失败: " + (err && err.message ? err.message : String(err)), "error");
      console.error("[ERR] _plAutoGenChapters:", err);
    });
  }
  App.prototype._plRenderChapterCards = function(volIdx) {
   var pl = this._plData();
   if (!pl || !pl.volumes[volIdx]) return;
   var vol = pl.volumes[volIdx];
    var container = document.getElementById("pl-chapter-cards");
    if (!container) return;
    var self = this;
    var hint = document.getElementById("pl-ch-empty-hint");
    var chResult = document.getElementById("pl-chapter-result");
    if (chResult) chResult.style.display = "none";
    if (!vol.chapters || vol.chapters.length === 0) {
      if (hint) hint.style.display = "";
      container.style.display = "block";
      container.innerHTML = '<button class="btn-primary" id="btn-pl-gen-ch-for-vol" style="margin-top:4px">AI 生成章节</button><button style="padding:6px 16px;background:var(--accent,#4a9eff);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;margin-top:4px;margin-left:8px" id="btn-pl-add-ch-empty">+ 添加章节</button><button style="padding:6px 12px;background:#4a6a3e;color:#cf8;border:1px solid #5a7a4e;border-radius:6px;cursor:pointer;font-size:12px;margin-top:4px;margin-left:8px" id="btn-pl-resume-ch" title="从已生成的章节断点处继续生成">续生成章节</button>';
      var genBtn = container.querySelector("#btn-pl-gen-ch-for-vol");
      if (genBtn) genBtn.onclick = function() { self._plGenChaptersForVolume(volIdx); };
      var resumeBtn = container.querySelector("#btn-pl-resume-ch");
    if (resumeBtn) resumeBtn.onclick = function() { self._plResumeChapterGen(volIdx); };
      var addEmptyBtn = container.querySelector("#btn-pl-add-ch-empty");
      if (addEmptyBtn) addEmptyBtn.onclick = function() {
        if (!vol.chapters) vol.chapters = [];
        vol.chapters.push({ id: "ch_" + Date.now(), title: "", plot: "", summary: "", confirmed: false, wordCount: pl.chapterWordCount || 2000, body: "", bodyGenerated: false });
        self._plPersist(pl);
        self._plRenderChapterCards(volIdx);
        self._plRenderVolList(); try { self.renderChapterTree(); } catch(e) { console.warn("[WARN] tree render after chapter gen:", e); }
      };
      return;
    }
    if (hint) hint.style.display = "none";
    container.style.display = "block";
    container.innerHTML = "";
    // Feature 2: Add resume button if chapters exist but may be incomplete
    if (vol.chapters.length > 0) {
      var topBar = document.createElement("div");
      topBar.style.cssText = "display:flex;gap:8px;margin-bottom:8px;align-items:center;flex-wrap:wrap;";
      var chWordCount = parseInt(pl.chapterWordCount) || self._plGetChWordCount() || 3000;
      var volWords = parseInt(vol.suggestedWords) || 0;
      if (!volWords) { var vc = (pl.volumes && pl.volumes.length) || 1; volWords = (pl.bookWordCount && pl.bookWordCount > 0) ? Math.round(pl.bookWordCount / vc) : 0; }
      var expCount = (volWords > 0) ? Math.max(1, Math.round(volWords / chWordCount)) : 0;
      if (expCount > 0 && vol.chapters.length < expCount) {
        topBar.innerHTML = '<span style="color:var(--accent,#4a9eff);font-size:13px;">\u5df2\u751f\u6210 ' + vol.chapters.length + '/' + expCount + ' \u7ae0</span>';
        var resumeTopBtn = document.createElement("button");
        resumeTopBtn.textContent = "\u7eed\u751f\u6210\u7ae0\u8282";
        resumeTopBtn.style.cssText = "padding:4px 12px;background:#4a6a3e;color:#cf8;border:1px solid #5a7a4e;border-radius:4px;cursor:pointer;font-size:12px;";
        resumeTopBtn.onclick = function() { self._plResumeChapterGen(volIdx); };
        topBar.appendChild(resumeTopBtn);
        container.appendChild(topBar);
      }
    }
    vol.chapters.forEach(function(ch, i) {
      var card = document.createElement("div");
      card.className = "pl-ch-card" + (ch.confirmed ? " confirmed" : "");
      card.style.cssText = "border:1px solid " + (ch.confirmed ? "#4a9" : "var(--border,#3a3a3e)") + ";border-radius:8px;padding:12px;margin-bottom:8px;background:var(--bg-card,#1e1e22);overflow:hidden;min-width:0;max-width:100%;box-sizing:border-box;";
      var header = document.createElement("div");
      header.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:8px;";
      var idx = document.createElement("span");
      idx.textContent = vol.name + " #" + (i + 1);
      idx.style.cssText = "color:var(--text-dim,#888);font-size:14px;min-width:80px;";
      var titleInput = document.createElement("input");
      titleInput.type = "text";
      titleInput.value = ch.title || "";
      titleInput.style.cssText = "flex:1;padding:4px 8px;background:var(--bg-input,#2a2a2e);color:var(--text,#e0e0e0);border:1px solid var(--border,#3a3a3e);border-radius:4px;font-size:14px;";
      titleInput.addEventListener("input", function() { vol.chapters[i].title = this.value; });
      titleInput.addEventListener("change", function() { self._plPersist(pl); });
      var delBtn = document.createElement("button");
      delBtn.textContent = "x";
      delBtn.style.cssText = "padding:4px 10px;color:#f88;cursor:pointer;font-size:14px;";
      delBtn.onclick = function() { vol.chapters.splice(i, 1); self._plPersist(pl); self._plRenderChapterCards(volIdx); self._plRenderVolList(); try { self.renderChapterTree(); } catch(e) { console.warn("[WARN] tree render after chapter gen:", e); } };
      header.appendChild(idx); header.appendChild(titleInput); header.appendChild(delBtn);
      var plotTa = document.createElement("textarea");
      plotTa.value = ch.plot || "";
      plotTa.style.cssText = "width:100%;min-height:60px;padding:8px;background:var(--bg-input,#2a2a2e);color:var(--text,#e0e0e0);border:1px solid var(--border,#3a3a3e);border-radius:4px;font-size:14px;resize:vertical;box-sizing:border-box;";
      plotTa.placeholder = "章节剧情点...";
      plotTa.addEventListener("input", function() { vol.chapters[i].plot = this.value; });
      plotTa.addEventListener("change", function() { self._plPersist(pl); });
      var wcRow = document.createElement("div");
      wcRow.style.cssText = "display:flex;align-items:center;gap:8px;margin-top:8px;";
      var wcLabel = document.createElement("span");
      wcLabel.textContent = "目标字数:";
      wcLabel.style.cssText = "font-size:12px;color:var(--text-dim,#888);";
      var wcInput = document.createElement("input");
      wcInput.type = "number";
      wcInput.value = ch.wordCount || 2000;
      wcInput.style.cssText = "width:80px;padding:4px 8px;background:var(--bg-input,#2a2a2e);color:var(--text,#e0e0e0);border:1px solid var(--border,#3a3a3e);border-radius:4px;font-size:12px;";
      wcInput.addEventListener("input", function() { vol.chapters[i].wordCount = parseInt(this.value) || 2000; });
      wcInput.addEventListener("change", function() { self._plPersist(pl); });
      wcRow.appendChild(wcLabel); wcRow.appendChild(wcInput);
      var actions = document.createElement("div");
      actions.style.cssText = "display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;";
      var saveBtn = document.createElement("button");
      saveBtn.textContent = "保存本章";
      saveBtn.style.cssText = "padding:4px 12px;color:#8cf;cursor:pointer;font-size:12px;border:1px solid var(--border,#3a3a3e);border-radius:4px;background:var(--bg-input,#2a2a2e);white-space:nowrap;flex-shrink:0;";
      saveBtn.onclick = function() { self._plSaveChapter(volIdx, i); };
      var confirmBtn = document.createElement("button");
      confirmBtn.textContent = ch.confirmed ? "✓ 已确认" : "确认本章";
      confirmBtn.style.cssText = "padding:4px 12px;color:#8f8;cursor:pointer;font-size:12px;border:1px solid var(--border,#3a3a3e);border-radius:4px;background:var(--bg-input,#2a2a2e);white-space:nowrap;flex-shrink:0;";
      
      confirmBtn.onclick = function() { self._plConfirmChapter(volIdx, i); };
      actions.appendChild(saveBtn); actions.appendChild(confirmBtn);
      card.appendChild(header); card.appendChild(plotTa); card.appendChild(wcRow); card.appendChild(actions);
      container.appendChild(card);
    });
    var batchBar = document.createElement("div");
    batchBar.style.cssText = "display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;align-items:center;";
    // Fix 3: batch word count for all chapters
    var wcLabel = document.createElement("span");
    wcLabel.textContent = "全章目标字数:";
    wcLabel.style.cssText = "font-size:12px;color:var(--text-dim,#888);";
    var wcBatchInput = document.createElement("input");
    wcBatchInput.type = "number";
    wcBatchInput.value = pl.chapterWordCount || 2000;
    wcBatchInput.style.cssText = "width:80px;padding:4px 8px;background:var(--bg-input,#2a2a2e);color:var(--text,#e0e0e0);border:1px solid var(--border,#3a3a3e);border-radius:4px;font-size:12px;";
    var wcBatchBtn = document.createElement("button");
    wcBatchBtn.textContent = "一键设置";
    wcBatchBtn.style.cssText = "padding:4px 12px;background:#4a9eff;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;";
    wcBatchBtn.onclick = function() {
      var wc = parseInt(wcBatchInput.value) || 2000;
      pl.chapterWordCount = wc;
      vol.chapters.forEach(function(ch) { ch.wordCount = wc; });
      self._plPersist(pl);
      self._plRenderChapterCards(volIdx);
      self._toast("已设置全部 " + vol.chapters.length + " 章为 " + wc + " 字", "success");
    };
    batchBar.appendChild(wcLabel); batchBar.appendChild(wcBatchInput); batchBar.appendChild(wcBatchBtn);
    // Fix 4b: batch confirm all chapters
    var confirmAllChBtn = document.createElement("button");
    confirmAllChBtn.textContent = "一键确认所有章节";
    confirmAllChBtn.style.cssText = "padding:6px 16px;background:#4a9;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;";
    confirmAllChBtn.onclick = function() {
      var unconfirmed = vol.chapters.filter(function(ch) { return !ch.confirmed; });
      if (unconfirmed.length === 0) { self._toast("所有章节已确认", "info"); return; }
      vol.chapters.forEach(function(ch) { ch.confirmed = true; });
      self._plPersist(pl);
      self._plRenderChapterCards(volIdx);
      self._toast("已确认全部 " + vol.chapters.length + " 章", "success");
    };
    batchBar.appendChild(confirmAllChBtn);
    var addBtn = document.createElement("button");
    addBtn.textContent = "+ 添加章节";
    addBtn.style.cssText = "padding:6px 16px;background:var(--accent,#4a9eff);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;";
    addBtn.onclick = function() {
      vol.chapters.push({ id: "ch_" + Date.now(), title: "", plot: "", summary: "", confirmed: false, wordCount: pl.chapterWordCount || 2000, body: "", bodyGenerated: false });
      self._plPersist(pl);
      self._plRenderChapterCards(volIdx);
      self._plRenderVolList(); try { self.renderChapterTree(); } catch(e) { console.warn("[WARN] tree render after chapter gen:", e); }
    };
    batchBar.appendChild(addBtn);
    container.appendChild(batchBar);
    self._plCheckAllChaptersConfirmed();
  }
  App.prototype._plSaveChapter = function(volIdx, chIdx) {
    var pl = this._plData();
    if (!pl || !pl.volumes[volIdx] || !pl.volumes[volIdx].chapters[chIdx]) return;
    var vol = pl.volumes[volIdx];
    var ch = vol.chapters[chIdx];
    var cards = document.querySelectorAll("#pl-ch-cards-area .pl-ch-card, #pl-chapter-cards .pl-ch-card");
    if (cards[chIdx]) {
      var titleInput = cards[chIdx].querySelector("input[type=text]");
      var plotTa = cards[chIdx].querySelector("textarea");
      var wcInput = cards[chIdx].querySelector("input[type=number]");
      if (titleInput) ch.title = titleInput.value;
      if (plotTa) { ch.plot = plotTa.value; ch.summary = plotTa.value; }
      if (wcInput) ch.wordCount = parseInt(wcInput.value) || 2000;
    }
    // Sync to ChapterManager
    var cmVolId = vol.cmId || vol.id;
    var existingChs = ChapterManager.getChapters(this.currentProjectId, cmVolId) || [];
    var cmCh = null;
    for (var i = 0; i < existingChs.length; i++) {
      if (existingChs[i].id === ch.id || existingChs[i].id === ch.cmId) { cmCh = existingChs[i]; break; }
    }
    if (!cmCh) {
      var newCh = ChapterManager.createChapter(this.currentProjectId, cmVolId, { title: ch.title, content: "" });
      if (newCh) {
        ch.cmId = newCh.id;
      } else {
        // Volume not in ChapterManager yet - create it first, then create chapter
        var newVol = ChapterManager.createVolume(this.currentProjectId, { name: vol.name || "未命名卷", outline: vol.outline || "" });
        vol.cmId = newVol.id;
        cmVolId = vol.cmId;
        newCh = ChapterManager.createChapter(this.currentProjectId, cmVolId, { title: ch.title, content: "" });
        if (newCh) ch.cmId = newCh.id;
      }
    } else {
      ChapterManager.updateChapter(this.currentProjectId, cmVolId, cmCh.id, { title: ch.title });
      ch.cmId = cmCh.id;
    }
    this._plPersist(pl);
    this._toast("章节已保存: " + ch.title, "success");
  }
  App.prototype._plConfirmChapter = function(volIdx, chIdx) {
    var pl = this._plData();
    if (!pl || !pl.volumes[volIdx] || !pl.volumes[volIdx].chapters[chIdx]) return;
    var ch = pl.volumes[volIdx].chapters[chIdx];
    if (!ch.title || !ch.plot) { this._toast("请先填写章节标题和剧情点", "info"); return; }
    this._plSaveChapter(volIdx, chIdx);
    pl = this._plData();
    ch = pl.volumes[volIdx].chapters[chIdx];
    ch.confirmed = !ch.confirmed;
    this._plPersist(pl);
    this._plCheckAllChaptersConfirmed();
    this._plRenderChapterCards(volIdx);
    this._plRenderVolList();
    this._plPopulateChapterSelect();
    this._plRefreshSteps();
  }
  App.prototype._plCheckAllChaptersConfirmed = function() {
    var pl = this._plData();
    if (!pl || !pl.volumes) return;
    var allConfirmed = true;
    var totalChapters = 0;
    var confirmedChapters = 0;
    pl.volumes.forEach(function(v) {
      if (!v.confirmed) return;
      (v.chapters || []).forEach(function(c) {
        totalChapters++;
        if (c.confirmed) confirmedChapters++;
      });
    });
    if (totalChapters === 0) { allConfirmed = false; }
    else { allConfirmed = (confirmedChapters === totalChapters); }
    var btnConfirm = document.getElementById("btn-pl-confirm-chapters");
    if (allConfirmed && totalChapters > 0) {
      pl.chaptersConfirmed = true;
      if (btnConfirm) btnConfirm.style.display = "";
    } else {
      pl.chaptersConfirmed = false;
      if (btnConfirm) btnConfirm.style.display = "none";
    }
    this._plPersist(pl);
    // FIX T10: Disable step4 next-nav button when chapters not all confirmed
    var step4NextBtn = document.querySelector("#pl-step-4-content .pl-nav-btn.next");
    if (step4NextBtn) { step4NextBtn.disabled = !allConfirmed; }
  }
  App.prototype._plConfirmAllChapters = function() {
    var pl = this._plData();
    if (!pl) return;
    var total = 0, confirmed = 0;
    pl.volumes.forEach(function(v) {
      if (!v.confirmed) return;
      (v.chapters || []).forEach(function(c) { total++; if (c.confirmed) confirmed++; });
    });
    if (total === 0 || confirmed < total) { this._toast("请先确认所有章节", "info"); return; }
    pl.chaptersConfirmed = true;
    pl.step = 5;
    this._plPersist(pl);
    this._plRefreshSteps();
    this._plShowStep(5);
    document.getElementById("pl-status-4").textContent = "已完成";
  }

  App.prototype._plRenderContextSummary = function() {
    var pl = this._plData();
    if (!pl) return;
    var chSel = document.getElementById("pl-chapter-select");
    var summary = document.getElementById("pl-context-summary");
    if (!summary) return;
    var val = chSel ? chSel.value : "";
    if (!val) { summary.style.display = "none"; summary.innerHTML = ""; return; }
    var parts = val.split(":");
    var vi = parseInt(parts[0]);
    var ci = parseInt(parts[1]);
    if (isNaN(vi) || isNaN(ci) || !pl.volumes[vi] || !pl.volumes[vi].chapters[ci]) { summary.style.display = "none"; return; }
    var vol = pl.volumes[vi];
    var ch = vol.chapters[ci];
    var wcInput = document.getElementById("pl-word-count");
    if (wcInput) wcInput.value = ch.wordCount || 2000;
    summary.style.display = "block";
    var self = this;
    summary.innerHTML = 
      '<div class="ctx-section"><div class="ctx-label">全书大纲</div><div class="ctx-content">' + self._escHtml((pl.outlineText || "").substring(0, 300)) + '...</div></div>' +
      '<div class="ctx-section"><div class="ctx-label">设定摘要</div><div class="ctx-content">' + self._escHtml((pl.settingsText || "").substring(0, 200)) + '...</div></div>' +
      '<div class="ctx-section"><div class="ctx-label">当前卷概要</div><div class="ctx-content">' + self._escHtml(vol.name + ": " + (vol.outline || "").substring(0, 200)) + '</div></div>' +
      '<div class="ctx-section"><div class="ctx-label">当前章节剧情点</div><div class="ctx-content">' + self._escHtml(ch.title + ": " + (ch.plot || "")) + '</div></div>' +
      '<div class="ctx-section"><div class="ctx-label">目标字数</div><div class="ctx-content">' + (ch.wordCount || 2000) + ' 字</div></div>';
  }
  App.prototype._plGenBody = function() {
    var self = this;
    if (!this.isConfigured) { this._toast("请先配置API", "error"); return; }
    var chSel = document.getElementById("pl-chapter-select");
    var val = chSel ? chSel.value : "";
    if (!val) { this._toast("请选择目标章节", "error"); return; }
    var parts = val.split(":");
    var vi = parseInt(parts[0]);
    var ci = parseInt(parts[1]);
    var pl = this._plData();
    if (!pl || !pl.volumes[vi] || !pl.volumes[vi].chapters[ci]) { this._toast("章节不存在", "error"); return; }
    var vol = pl.volumes[vi];
    var ch = vol.chapters[ci];
    var wcInput = document.getElementById("pl-word-count");
    if (wcInput) { ch.wordCount = parseInt(wcInput.value) || ch.wordCount || 2000; }
    var wordCount = ch.wordCount || 2000;
    this._showLoading("AI 生成正文中...");
    var outline = pl.outlineText || "";
    var settingsText = pl.settingsText || "";
    var boundText = this._getBoundSettingsText();
    if (boundText) settingsText += "\n\n[\u7ea6\u675f\u8bbe\u5b9a]\n" + boundText;
    var volOutline = vol.outline || vol.summary || "";
    var _styleCtxCh = this._plStyleContext(pl);
    var params = "[全书大纲]\n" + outline + "\n\n[设定摘要]\n" + settingsText + (_styleCtxCh ? "\n\n[风格与节奏分析]\n" + _styleCtxCh + "\n\n" : "") + "\n\n[当前卷概要]\n" + vol.name + ": " + volOutline + "\n\n[当前章节剧情点]\n" + ch.title + ": " + (ch.plot || "") + "\n\n请为本章节生成约" + wordCount + "字的正文内容。记住这一章节讲的是什么，这一章节在这一卷纲中的位置，这一卷纲的主题和概要，以及这一卷纲在大纲里要记住的设定。";
    var result = document.getElementById("pl-body-result");
    result.style.display = "block";
    result.innerHTML = "";
    var opts = { agentId: pl.agentId, skillIds: (pl.s5Skills || []).filter(function(id) { return id; }) };
   this.apiGenerate("body", params, function(chunk) {
     result.innerHTML = "<pre>" + self._escHtml(chunk) + "</pre>";
    }, opts).then(function(text) {
      if (text) {
        result.innerHTML = "<pre>" + self._escHtml(text) + "</pre>";
        ch.body = text;
        ch.bodyGenerated = true;
        pl.bodyText = text;
        self._plTempBody = text;
        self._plTempBodyVi = vi;
        self._plTempBodyCi = ci;
        self._plPersist(pl);
        var insertBtn = document.getElementById("btn-pl-insert-body");
        if (insertBtn) insertBtn.style.display = "";
        var confirmBodyBtn = document.getElementById("btn-pl-confirm-body");
        if (confirmBodyBtn) confirmBodyBtn.style.display = "";
      }
      self._hideLoading();
    }).catch(function(err) {
      self._hideLoading();
      self._toast("AI生成正文失败: " + (err && err.message ? err.message : String(err)), "error");
      console.error("[ERR] _plGenBody:", err);
    });
  }
  App.prototype._plInsertBody = function() {
    if (!this._plTempBody) return;
    var pl = this._plData();
    var vi = this._plTempBodyVi;
    var ci = this._plTempBodyCi;
    if (vi === undefined || ci === undefined || !pl.volumes[vi] || !pl.volumes[vi].chapters[ci]) return;
    var vol = pl.volumes[vi];
    var ch = vol.chapters[ci];
    ch.body = this._plTempBody;
    ch.bodyGenerated = true;
    // Sync to ChapterManager
    var cmVolId = vol.cmId || vol.id;
    var cmChId = ch.cmId || ch.id;
    var cmCh = ChapterManager.getChapter(this.currentProjectId, cmVolId, cmChId);
    if (cmCh) {
      cmCh.content = (cmCh.content || "") + "\n" + this._plTempBody;
      ChapterManager.updateChapter(this.currentProjectId, cmVolId, cmChId, { content: cmCh.content });
    } else {
      var newCh = ChapterManager.createChapter(this.currentProjectId, cmVolId, { title: ch.title, content: this._plTempBody });
      ch.cmId = newCh.id;
    }
    this._plPersist(pl);
    // Open in editor
    this.currentVolumeId = cmVolId;
    this.currentChapterId = cmChId;
    var ed = document.getElementById("editor-content");
    if (ed) { ed.value = ch.body; ed.disabled = false; }
    var edTitle = document.getElementById("editor-title");
    if (edTitle) edTitle.textContent = ch.title;
    this.updateWordCount();
    this._toast("正文已插入编辑器", "success");
  }
  App.prototype._plConfirmBody = function() {
    var pl = this._plData();
    if (!pl) return;
    var vi = this._plTempBodyVi;
    var ci = this._plTempBodyCi;
    if (vi === undefined || ci === undefined || !pl.volumes[vi] || !pl.volumes[vi].chapters[ci]) { this._toast("请先生成正文", "info"); return; }
    var ch = pl.volumes[vi].chapters[ci];
    if (!ch.body) { this._toast("请先生成正文", "info"); return; }
    ch.bodyGenerated = true;
    this._plPersist(pl);
    this._toast("正文已确认", "success");
  }

  App.prototype._plInvalidateDownstream = function(fromStep, volIdx, chIdx) {
    var pl = this._plData();
    if (!pl) return;
    if (fromStep <= 1) {
      pl.settingsConfirmed = false; pl.volumesConfirmed = false; pl.chaptersConfirmed = false;
      if (pl.volumes) pl.volumes.forEach(function(v) { v.confirmed = false; (v.chapters||[]).forEach(function(c) { c.confirmed = false; c.bodyGenerated = false; }); });
    }
    if (fromStep <= 2) {
      pl.volumesConfirmed = false; pl.chaptersConfirmed = false;
      if (pl.volumes) pl.volumes.forEach(function(v) { v.confirmed = false; (v.chapters||[]).forEach(function(c) { c.confirmed = false; c.bodyGenerated = false; }); });
    }
    if (fromStep <= 3 && volIdx !== undefined && pl.volumes[volIdx]) {
      pl.volumes[volIdx].confirmed = false;
      (pl.volumes[volIdx].chapters||[]).forEach(function(c) { c.confirmed = false; c.bodyGenerated = false; });
      pl.chaptersConfirmed = false;
    } else if (fromStep <= 3) {
      if (pl.volumes) pl.volumes.forEach(function(v) { v.confirmed = false; });
      pl.volumesConfirmed = false; pl.chaptersConfirmed = false;
    }
    if (fromStep <= 4 && volIdx !== undefined && chIdx !== undefined && pl.volumes[volIdx] && pl.volumes[volIdx].chapters[chIdx]) {
      pl.volumes[volIdx].chapters[chIdx].confirmed = false;
      pl.volumes[volIdx].chapters[chIdx].bodyGenerated = false;
    } else if (fromStep <= 4 && volIdx !== undefined && pl.volumes[volIdx]) {
      (pl.volumes[volIdx].chapters||[]).forEach(function(c) { c.confirmed = false; c.bodyGenerated = false; });
      pl.chaptersConfirmed = false;
    }
    this._plPersist(pl);
    this._plRefreshSteps();
  }
  // ===== 记忆管理 =====
  App.prototype._memData = function() {
    if (!this.currentProjectId) return null;
    var p = this._getProjectData();
    if (!p.memories) p.memories = { categories: ["情节", "人物", "世界观", "伏笔"], items: [] };
    return p.memories;
  }
  App.prototype.showMemory = function() {
    if (!this.currentProjectId) { this._toast("请先打开一个项目", "info"); return; }
    this.setSidebarActive("btn-memory");
    var mem = this._memData();
    if (!mem) { this._toast("请先打开一个项目", "info"); return; }
   this._closeAllPanels();
    var memEl = document.getElementById("memory-panel");
    memEl.classList.remove("mem-hidden"); memEl.classList.add("visible");
   this._renderMemCategories();
    this._renderMemories("all");
  }
 App.prototype.closeMemory = function() {
   var memClose = document.getElementById("memory-panel");
   memClose.classList.remove("visible"); memClose.classList.add("mem-hidden");
  document.getElementById("app-main").classList.add("visible");
  this.setSidebarActive(null);
  this._updateBreadcrumb();
}
  App.prototype._renderMemCategories = function() {
    var mem = this._memData(); if (!mem) return;
    var container = document.getElementById("mem-cat-list");
    var self = this;
    var html = "<button class=\"mem-cat-btn active\" data-cat=\"all\">全部</button>";
    for (var i = 0; i < mem.categories.length; i++) {
      html += "<button class=\"mem-cat-btn\" data-cat=\"" + this._escHtml(mem.categories[i]) + "\">" + this._escHtml(mem.categories[i]) + "</button>";
    }
    container.innerHTML = html;
    container.onclick = function(e) {
        var btn = e.target.closest(".mem-cat-btn");
        if (!btn) return;
        var all = container.querySelectorAll(".mem-cat-btn");
        for (var k = 0; k < all.length; k++) all[k].classList.remove("active");
        btn.classList.add("active");
        self._renderMemories(btn.dataset.cat);
      };
      document.getElementById("btn-add-mem-cat").onclick = async function() {
      var name = await showPromptModal("\u8f93\u5165\u65b0\u5206\u7c7b\u540d\u79f0:", "");
      if (!name) return;
      mem.categories.push(name);
      self._saveProjectData(self._getProjectData());
      self._renderMemCategories();
    };
  }
  App.prototype._renderMemories = function(cat) {
    var mem = this._memData(); if (!mem) return;
    document.getElementById("mem-current-cat").textContent = cat === "all" ? "全部记忆" : cat;
    var container = document.getElementById("mem-list");
    var self = this;
    var items = cat === "all" ? mem.items : mem.items.filter(function(it) { return it.category === cat; });
    if (items.length === 0) {
      container.innerHTML = "<p class=\"empty-hint\">暂无记忆条目</p>";
    } else {
      var html = "";
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        html += "<div class=\"mem-item\" data-idx=\"" + i + "\"><div class=\"mem-item-header\"><span class=\"mem-item-key\">" + this._escHtml(item.key) + "</span><span class=\"mem-item-cat\">" + this._escHtml(item.category) + "</span><div class=\"mem-item-actions\"><button class=\"btn-sm btn-secondary mem-edit-btn\" data-idx=\"" + i + "\">编辑</button><button class=\"btn-sm btn-danger mem-del-btn\" data-idx=\"" + i + "\">删除</button></div></div><div class=\"mem-item-content\">" + this._escHtml(item.content) + "</div><div class=\"mem-item-date\">" + (item.created || "") + "</div></div>";
      }
      container.innerHTML = html;
      container.onclick = function(e) {
        var editBtn = e.target.closest(".mem-edit-btn");
        if (editBtn) { self._editMemory(parseInt(editBtn.dataset.idx)); return; }
        var delBtn = e.target.closest(".mem-del-btn");
        if (delBtn) { self._deleteMemory(parseInt(delBtn.dataset.idx)); return; }
      };
    }
      document.getElementById("btn-add-mem").disabled = false;
    document.getElementById("btn-add-mem").onclick = function() { self._showMemForm(-1); };
  }
  App.prototype._showMemForm = function(idx) {
    var mem = this._memData(); if (!mem) return;
    var self = this;
    var item = idx >= 0 ? mem.items[idx] : null;
    var catOpts = "";
    for (var i = 0; i < mem.categories.length; i++) {
      var sel = item && item.category === mem.categories[i] ? " selected" : "";
      catOpts += "<option value=\"" + mem.categories[i] + "\"" + sel + ">" + mem.categories[i] + "</option>";
    }
    var html = "<div class=\"mem-form\"><h4>" + (item ? "编辑记忆" : "新增记忆") + "</h4><div class=\"form-group\"><label>键名</label><input id=\"mem-key\" value=\"" + (item ? this._escHtml(item.key) : "") + "\" placeholder=\"例如: 主角性格\"></div><div class=\"form-group\"><label>分类</label><select id=\"mem-cat\">" + catOpts + "</select></div><div class=\"form-group\"><label>内容</label><textarea id=\"mem-content\" rows=\"4\" placeholder=\"记忆内容...\">" + (item ? this._escHtml(item.content) : "") + "</textarea></div><div class=\"form-actions\"><button class=\"btn-primary\" id=\"btn-save-mem\">保存</button><button class=\"btn-secondary\" id=\"btn-cancel-mem\">取消</button></div></div>";
    var cat = document.querySelector(".mem-cat-btn.active");
    var currentCat = cat ? cat.dataset.cat : "all";
    document.getElementById("mem-list").insertAdjacentHTML("afterbegin", html);
    document.getElementById("btn-add-mem").disabled = true;
    document.getElementById("btn-save-mem").addEventListener("click", function() { self._saveMemory(idx, currentCat); });
    document.getElementById("btn-cancel-mem").addEventListener("click", function() { self._renderMemories(currentCat); });
  }
  App.prototype._saveMemory = function(idx, cat) {
    var p = this._getProjectData(); if (!p) return; if (!p.memories) p.memories = { categories: ["情节", "人物", "世界观", "伏笔"], items: [] }; var mem = p.memories;
    var key = document.getElementById("mem-key").value.trim();
    var category = document.getElementById("mem-cat").value;
    var content = document.getElementById("mem-content").value.trim();
    if (!key || !content) { this._toast("键名和内容不能为空", "info"); return; }
    var item = { key: key, category: category, content: content, created: new Date().toISOString().slice(0, 10) };
    if (idx >= 0) { mem.items[idx] = item; }
    else { mem.items.push(item); }
    this._saveProjectData(p);
    this._renderMemories(cat);
  }
  App.prototype._editMemory = function(idx) {
    this._showMemForm(idx);
  }
  App.prototype._deleteMemory = async function(idx) {
    if (!(await this._confirm("确定删除此记忆？"))) return;
    var p = this._getProjectData(); if (!p) return; if (!p.memories) return; var mem = p.memories;
    mem.items.splice(idx, 1);
    this._saveProjectData(p);
    this._renderMemories();
    this._toast("删除成功", "success");
  }
  App.prototype._plData = function() {
    if (!this.currentProjectId) return null;
    var p = this._getProjectData();
    if (!p._pipeline) p._pipeline = {
      step: 1, outlineConfirmed: false, settingsGenerated: false,
      volumesGenerated: false, chaptersGenerated: false,
      agentId: null,
      s1Skills: [], s2Skills: [], s3Skills: [], s4Skills: [], s5Skills: [],
      outlineText: "", settingsText: "", volumesText: "", chaptersText: "", bodyText: "",
     volumeCount: 3, chapterWordCount: 2000,
     volumes: [], chapters: {},
      settingsConfirmed: false, volumesConfirmed: false, chaptersConfirmed: false,
      currentVolumeIndex: -1,
      bookWordCount: 0, autoVolumeCount: 0, styleTags: "", pacingParams: "", outlineAnalyzed: false
    };
    // Clean up null/undefined entries from skill arrays (data integrity)
  ['s1Skills','s2Skills','s3Skills','s4Skills','s5Skills'].forEach(function(k) {
    if (p._pipeline[k]) p._pipeline[k] = p._pipeline[k].filter(function(id) { return id; });
  });
  // Migrate old volumes to new structure with confirmed/chapters fields
    if (p._pipeline.volumes && p._pipeline.volumes.length > 0) {
      p._pipeline.volumes.forEach(function(v) {
        if (v.confirmed === undefined) v.confirmed = false;
        if (!v.chapters || !Array.isArray(v.chapters)) v.chapters = [];
        v.chapters.forEach(function(c) {
          if (c.confirmed === undefined) c.confirmed = false;
          if (c.body === undefined) c.body = "";
          if (c.bodyGenerated === undefined) c.bodyGenerated = false;
          if (c.wordCount === undefined) c.wordCount = 2000;
          if (c.plot === undefined) c.plot = "";
          if (c.summary === undefined) c.summary = "";
        });
      });
    }
    this._saveProjectData(p);
    return p._pipeline;
  }
 App.prototype._plPersist = function(pl) {
   var p = this._getProjectData();
   p._pipeline = pl;
   this._saveProjectData(p);
 }

