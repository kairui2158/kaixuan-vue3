class App {
 constructor() {
   this.currentProjectId = null;
  this.currentVolumeId = null;
  this.currentChapterId = null;
  this.currentAgentId = null;
   this.editorMode = 'ch-body'; // 'vol-outline' | 'ch-plot' | 'ch-body'
   this.editorContextVolIdx = -1;
   this.editorContextChIdx = -1;
  this.settings = this.loadSettings();
   this.messages = [];
    this.isStreaming = false;
   this.abortController = null;
   // de-AI is a post-processing feature, no pre-generation injection
   this._textFilterEnabled = false;
   this._deAiConfig = { skills: [], agentId: null, hardRulesEnabled: true, agentMode: "chain", splitSize: 1000 };
    this._deAiConfig.level = this._deAiConfig.level || "medium";
    this._deAiConfig.version = this._deAiConfig.version || "v3";
    this._deAiConfig.textType = this._deAiConfig.textType || "novel";
    try { var _savedDeAi = StorageManager.get("app-deai-config"); if (_savedDeAi) this._deAiConfig = _savedDeAi; } catch(e){console.warn("[WARN] catch #1 renderer_v2.js",e);if(window.DiagLogger)DiagLogger.warn("catch","renderer_v2.js #1",e);}
   try { this.init(); } catch(e) { console.error("[ERR] App.init failed:", e.message, e.stack); }
 }

  loadSettings() {
  try {
     var raw = StorageManager.get("app-settings");
      if (raw) {
        if (raw.apiKey && raw.apiKey.indexOf("enc:") === 0 && window.electronAPI && typeof window.electronAPI.decrypt === "function") {
          try { raw.apiKey = window.electronAPI.decrypt(raw.apiKey); } catch(e2) { console.warn("[WARN] decrypt apiKey failed", e2); }
        }
        if (!raw.maxTokens || raw.maxTokens < 128000) raw.maxTokens = 128000;
        return raw;
      }
  } catch(e) { console.warn("[WARN]", e); }
   return { baseUrl: "", apiKey: "", model: "", systemPrompt: "", streamMode: false, fontSize: 14, editorFontSize: 15, theme: "dark", maxTokens: 128000 };
 }

saveSettings() {
    var toStore = this.settings;
    if (toStore.apiKey && toStore.apiKey.indexOf("enc:") !== 0 && window.electronAPI && typeof window.electronAPI.encrypt === "function") {
      toStore = Object.assign({}, this.settings);
      try { toStore.apiKey = window.electronAPI.encrypt(toStore.apiKey); } catch(e) { console.warn("[WARN] encrypt apiKey failed", e); }
    }
    StorageManager.set("app-settings", toStore);
  this.populateModelSelect();
 }

  get isConfigured() {
    return !!(this.settings.baseUrl && this.settings.apiKey && this.settings.model);
  }

  getConfigError() {
    if (this.settings.baseUrl && this.settings.apiKey && this.settings.model) return null;
    var missing = [];
    if (!this.settings.baseUrl) missing.push('接口地址');
    if (!this.settings.apiKey) missing.push('API密钥');
    if (!this.settings.model) missing.push('模型名称');
    return 'API配置不完整，缺少: ' + missing.join('、') + '。请在设置中补全。';
  }

 init() {
    window._app = this;
    var self = this;
    document.addEventListener("keydown", function(e) {
      if (e.key === "Escape") { self.closeAllPanels(); return; }
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "1") { e.preventDefault(); self.openOutlineWorkspace(); }
        else if (e.key === "2") { e.preventDefault(); self.showSettingsCollection(); }
        else if (e.key === "3") { e.preventDefault(); self.showPipeline(); }
        else if (e.key === "4") { e.preventDefault(); self.showMemory(); }
        else if (e.key === "5") { e.preventDefault(); self.showPluginMarket(); }
        else if (e.key === ",") { e.preventDefault(); self.toggleSettings(true); }
        if (e.key === "z") { e.preventDefault(); self._undo(); }
        else if (e.key === "y") { e.preventDefault(); self._redo(); }
        else if (e.key === "s") { e.preventDefault(); self.saveEditorContent(); }
      }
    });
   if (typeof Notyf !== "undefined") { this._notyf = new Notyf({ duration: 3000, position: { x: "right", y: "top" }, dismissible: true }); }
 this.bindEvents();
    // Migrate: rename default volumes to first volume (data cleanup)
  try {
    var _allProjs = ProjectManager.getAll();
    var _migrated = 0;
    _allProjs.forEach(function(proj) {
      var _vols = ChapterManager.getVolumes(proj.id) || [];
      _vols.forEach(function(v) {
        if (v.name === "默认卷") {
          ChapterManager.updateVolume(proj.id, v.id, { name: "第一卷" });
          _migrated++;
        }
      });
      var _pd = StorageManager.get("project-" + proj.id) || {};
      if (_pd._pipeline && _pd._pipeline.volumes) {
        _pd._pipeline.volumes.forEach(function(pv) {
          if (pv.name === "默认卷") pv.name = "第一卷";
        });
        StorageManager.set("project-" + proj.id, _pd);
      }
    });
    if (_migrated > 0) console.log("[OK] Migrated " + _migrated + " volumes");
  } catch(eMig) { console.warn("[WARN] migration:", eMig); }
  
if (this.settings.providerId && ProviderManager.get(this.settings.providerId)) {
    this.currentProviderId = this.settings.providerId;
  } else {
    var allP = ProviderManager.getAll();
    if (allP.length > 0) this.currentProviderId = allP[0].id;
  }
  this.fillSettingsForm();
  this.populateModelSelect();
  this.populateAgentSelect();
  this._applyAppearance();
  this.updateUIState();
    this._initPanelResizers();
   // Auto-select last edited project
    var allProjs = ProjectManager.getAll();
    if (allProjs.length > 0) {
      allProjs.sort(function(a, b) {
        var da = new Date(a.updatedAt || a.createdAt || 0);
        var db = new Date(b.updatedAt || b.createdAt || 0);
        return db - da;
      });
      var lastSession = StorageManager.get('lastSession');
      if (lastSession && lastSession.pid) {
        var lsProj = allProjs.find(function(p) { return p.id === lastSession.pid; });
        if (lsProj) {
          this.currentProjectId = lastSession.pid;
          var pn = document.getElementById('current-project-name');
          if (pn) pn.textContent = lsProj.name;
          var pl = this._plData();
          if (pl && pl.volumes && lastSession.vid) {
            var lsVol = pl.volumes.find(function(v) { return v.id === lastSession.vid || v.cmId === lastSession.vid; });
            if (lsVol && lastSession.cid) {
              var lsCh = lsVol.chapters.find(function(c) { return c.id === lastSession.cid || c.title === lastSession.cid; });
              if (lsCh) {
                this.currentVolumeId = lastSession.vid;
                this.currentChapterId = lastSession.cid;
                console.log('[OK] Restored last session: ' + lsProj.name + ' / ' + lsVol.name + ' / ' + lsCh.title);
              }
            }
          }
          if (!this.currentVolumeId && pl && pl.volumes && pl.volumes.length > 0) {
            this.currentVolumeId = pl.volumes[0].id;
            if (pl.volumes[0].chapters && pl.volumes[0].chapters.length > 0) this.currentChapterId = pl.volumes[0].chapters[0].id;
          }
          // FIX v2.7.24: if currentChapterId still null but chapters exist, auto-open first chapter
          if (!this.currentChapterId && pl && pl.volumes) {
            for (var vi = 0; vi < pl.volumes.length; vi++) {
              if (pl.volumes[vi].chapters && pl.volumes[vi].chapters.length > 0) {
                this.currentVolumeId = pl.volumes[vi].id;
                this.currentChapterId = pl.volumes[vi].chapters[0].id;
                break;
              }
            }
          }
        }
      }
      if (!this.currentProjectId) {
        this.currentProjectId = allProjs[0].id;
        var pn2 = document.getElementById('current-project-name');
        if (pn2) pn2.textContent = allProjs[0].name;
        var pl2 = this._plData();
        if (pl2 && pl2.volumes && pl2.volumes.length > 0) {
          this.currentVolumeId = pl2.volumes[0].id;
          if (pl2.volumes[0].chapters && pl2.volumes[0].chapters.length > 0) this.currentChapterId = pl2.volumes[0].chapters[0].id;
        }
        // FIX v2.7.24: if currentChapterId still null, search all volumes
        if (!this.currentChapterId && pl2 && pl2.volumes) {
          for (var vi2 = 0; vi2 < pl2.volumes.length; vi2++) {
            if (pl2.volumes[vi2].chapters && pl2.volumes[vi2].chapters.length > 0) {
              this.currentVolumeId = pl2.volumes[vi2].id;
              this.currentChapterId = pl2.volumes[vi2].chapters[0].id;
              break;
            }
          }
        }
      }
      try { this._syncTreeToPipeline(); } catch(e) { console.warn('[WARN] startup sync:', e); }
      this.renderChapterTree();
      this.renderSkillArea();
    }
  // Auto-open the first chapter in editor
  if (this.currentProjectId && this.currentVolumeId && this.currentChapterId) {
    try { this.openChapter(this.currentVolumeId, this.currentChapterId); } catch(e) { console.warn('[WARN] auto-open chapter failed:', e.message); }
  }
  this._lastSaveTime = Date.now();
  this._startAutoSaveTimer();
  // Defensive: ensure all overlay panels are hidden on startup (fixes stale visible class blocking UI)
  this.closeAllPanels();
  // Listen for final save request from main process on exit
  if (window.electronAPI && window.electronAPI.onFinalSave) {
    var selfRef = this;
    window.electronAPI.onFinalSave(function() {
      try { selfRef.autoSave(); } catch(e) { console.warn('[WARN] final save failed:', e); }
      try { selfRef._syncTreeToPipeline(); } catch(e){console.warn("[WARN] catch #2 renderer_v2.js",e);if(window.DiagLogger)DiagLogger.warn("catch","renderer_v2.js #2",e);}
      try { var _pl = selfRef._plData(); if (_pl) selfRef._plPersist(_pl); } catch(e){console.warn("[WARN] catch #3 renderer_v2.js",e);if(window.DiagLogger)DiagLogger.warn("catch","renderer_v2.js #3",e);}
      try { StorageManager.set("lastSession", { pid: selfRef.currentProjectId, vid: selfRef.currentVolumeId, cid: selfRef.currentChapterId, ts: Date.now() }); } catch(e){console.warn("[WARN] catch #4 renderer_v2.js",e);if(window.DiagLogger)DiagLogger.warn("catch","renderer_v2.js #4",e);}
     selfRef._lastSaveTime = Date.now();
     console.log('[OK] Final save completed before exit');
   });
 }
  // Listen for close request from main process - show custom exit-confirm modal
  if (window.electronAPI && window.electronAPI.onCloseRequest) {
    var selfRef2 = this;
    window.electronAPI.onCloseRequest(function() {
      var modal = document.getElementById("exit-confirm-modal");
      if (modal) { modal.classList.remove("modal-hidden"); modal.classList.add("visible"); }
    });
    // Bind exit-confirm modal buttons
    var btnSave = document.getElementById("btn-exit-save");
    var btnDirect = document.getElementById("btn-exit-direct");
    var btnCancel = document.getElementById("btn-exit-cancel");
    if (btnSave) btnSave.addEventListener("click", function() {
      var m = document.getElementById("exit-confirm-modal");
      m.classList.remove("visible"); m.classList.add("modal-hidden");
      window.electronAPI.respondCloseChoice(0);
    });
    if (btnDirect) btnDirect.addEventListener("click", function() {
      var m = document.getElementById("exit-confirm-modal");
      m.classList.remove("visible"); m.classList.add("modal-hidden");
      window.electronAPI.respondCloseChoice(1);
    });
   if (btnCancel) btnCancel.addEventListener("click", function() {
     var m = document.getElementById("exit-confirm-modal");
     m.classList.remove("visible"); m.classList.add("modal-hidden");
     window.electronAPI.respondCloseChoice(2);
   });
    // Bind header close button (×) - same as cancel
    var closeBtn = document.querySelector("#exit-confirm-modal .exit-close");
    if (closeBtn) closeBtn.addEventListener("click", function() {
      var m = document.getElementById("exit-confirm-modal");
      m.classList.remove("visible"); m.classList.add("modal-hidden");
      window.electronAPI.respondCloseChoice(2);
    });
  }
}

bindEvents() {
    var self = this;
    document.getElementById("messages-list").addEventListener("click", function(e) {
      var btn = e.target.closest(".msg-btn");
      if (!btn) return;
      var msgEl = btn.closest(".msg");
      if (!msgEl) return;
      var msgs = Array.from(msgEl.parentElement.children);
      var idx = msgs.indexOf(msgEl);
      if (idx < 0) return;
     if (btn.classList.contains("msg-btn-copy")) self._copyMessage(idx);
     else if (btn.classList.contains("msg-btn-regen")) self._regenerateMessage(idx);
      else if (btn.classList.contains("msg-btn-apply")) self._applyToEditor(idx);
   });
   document.getElementById("btn-send").addEventListener("click", function() { self.sendMessage(); });
    document.getElementById("user-input").addEventListener("keydown", function(e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); self.sendMessage(); }
    });
    document.getElementById("user-input").addEventListener("input", function() { self.autoResizeInput(); var cc = document.getElementById("char-count"); if (cc) cc.textContent = this.value.length; var sendBtn = document.getElementById("btn-send"); if (sendBtn) sendBtn.disabled = !this.value.trim(); });
    document.getElementById("btn-settings").addEventListener("click", function() { self.toggleSettings(true); });
   document.getElementById("btn-close-settings").addEventListener("click", function() { self.toggleSettings(false); });
    var btnDash = document.getElementById("btn-dashboard");
    if (btnDash) btnDash.addEventListener("click", function() { self.showWritingDashboard(); });
   document.querySelector("#settings-modal .modal-backdrop").addEventListener("click", function() { self.toggleSettings(false); });
   document.getElementById("btn-toggle-key").addEventListener("click", function() { self.toggleApiKeyVisibility(); });
    var btnBack = document.getElementById("btn-provider-back");
    if (btnBack) btnBack.addEventListener("click", function() { self.exitProviderEdit(); });
    var tempSlider = document.getElementById("cfg-temperature");
    if (tempSlider) tempSlider.addEventListener("input", function() { var tv = document.getElementById("cfg-temperature-val"); if (tv) tv.textContent = tempSlider.value; self._formDirty = true; });
    // Mark form dirty on any edit view input change
    ["cfg-provider-name","cfg-base-url","cfg-api-key","cfg-system-prompt","cfg-max-tokens","cfg-stream-mode","cfg-provider-purpose"].forEach(function(id) { var el = document.getElementById(id); if (el) { var evt = el.type === "checkbox" ? "change" : "input"; el.addEventListener(evt, function() { self._formDirty = true; }); } });
    document.getElementById("btn-test-connection").addEventListener("click", function() { self.testConnection(); });
    document.getElementById("btn-save-settings").addEventListener("click", function() { self.saveSettingsFromForm(); });
    var btnExport = document.getElementById("btn-export-data");
    if (btnExport) btnExport.addEventListener("click", function() {
      try {
        if (!window.electronAPI || !window.electronAPI.dialogSaveFile) { self._toast("导出功能仅在桌面程序中可用", "error"); return; }
        var savePath = window.electronAPI.dialogSaveFile("writing-assistant-backup.json");
        if (!savePath) return;
        var result = window.electronAPI.storageExport(savePath);
        if (result && result.success) { self._toast("导出成功: " + result.count + " 条数据", "success"); }
        else { self._toast("导出失败", "error"); }
      } catch(e) { self._toast("导出错误: " + e.message, "error"); }
    });
    var btnImport = document.getElementById("btn-import-data");
    if (btnImport) btnImport.addEventListener("click", function() {
      try {
        if (!window.electronAPI || !window.electronAPI.dialogOpenFile) { self._toast("导入功能仅在桌面程序中可用", "error"); return; }
        var importPath = window.electronAPI.dialogOpenFile();
        if (!importPath) return;
        var result = window.electronAPI.storageImport(importPath);
        if (result && result.success) {
          self._toast("导入成功: " + result.count + " 条数据将重启后生效", "success");
          setTimeout(function() { location.reload(); }, 2000);
        }
        else { self._toast("导入失败", "error"); }
      } catch(e) { self._toast("导入错误: " + e.message, "error"); }
    });
    document.getElementById("btn-clear").addEventListener("click", function() { self.clearChat(); });
    document.getElementById("btn-outline-workspace").addEventListener("click", function() { self.openOutlineWorkspace(); });
    document.getElementById("btn-settings-collection").addEventListener("click", function() { self.showSettingsCollection(); });
    document.getElementById("btn-close-sc").addEventListener("click", function() { self.closeSettingsCollection(); });
    document.getElementById("btn-pipeline").addEventListener("click", function() { self.showPipeline(); });
    document.getElementById("btn-close-pl").addEventListener("click", function() { self.closePipeline(); });
    document.getElementById("btn-memory").addEventListener("click", function() { self.showMemory(); });
    document.getElementById("btn-close-mem").addEventListener("click", function() { self.closeMemory(); });
   // Phase 3
    document.getElementById("btn-plugin-market").addEventListener("click", function() { self.showPluginMarket(); });
    document.getElementById("btn-close-market").addEventListener("click", function() { self.closePluginMarket(); });
    document.querySelector("#plugin-market-modal .modal-backdrop").addEventListener("click", function() { self.closePluginMarket(); });
    document.getElementById("btn-market-search").addEventListener("click", function() { self.searchGitHub(); });
    document.getElementById("market-search-input").addEventListener("keydown", function(e) { if (e.key === "Enter") self.searchGitHub(); });
    document.getElementById("btn-set-token").addEventListener("click", function() { self._toggleTokenInput(); });
    document.getElementById("btn-token-help").addEventListener("click", function() { self._toggleTokenHelp(); });
    document.getElementById("btn-save-token").addEventListener("click", function() { self._saveGitHubToken(); });
    document.getElementById("btn-prev-page").addEventListener("click", function() { self._prevPage(); });
   document.getElementById("btn-next-page").addEventListener("click", function() { self._nextPage(); });   document.getElementById("btn-open-project").addEventListener("click", function() { self.openProjectModal(); });
   document.getElementById("btn-close-diff").addEventListener("click", function() { self._closeDiff(); });
   document.getElementById("btn-diff-apply").addEventListener("click", function() { self._applyDiffResult(); });
   document.getElementById("btn-diff-cancel").addEventListener("click", function() { self._closeDiff(); });
   document.getElementById("btn-diff-accept-all").addEventListener("click", function() { for (var k = 0; k < (self._diffChangeCount||0); k++) self._diffAccepted[k] = true; self._renderDiff(); });
   document.getElementById("btn-diff-reject-all").addEventListener("click", function() { for (var k = 0; k < (self._diffChangeCount||0); k++) self._diffAccepted[k] = false; self._renderDiff(); });
   document.getElementById("btn-diff-next").addEventListener("click", function() { self._diffCurrentIdx = Math.min((self._diffCurrentIdx||0)+1, (self._diffChangeCount||1)-1); var el = document.querySelectorAll('.diff-line[data-idx="' + self._diffCurrentIdx + '"]'); if (el[0]) el[0].scrollIntoView({block:"center"}); });
   document.getElementById("btn-diff-prev").addEventListener("click", function() { self._diffCurrentIdx = Math.max((self._diffCurrentIdx||0)-1, 0); var el = document.querySelectorAll('.diff-line[data-idx="' + self._diffCurrentIdx + '"]'); if (el[0]) el[0].scrollIntoView({block:"center"}); });
   document.querySelector("#diff-modal .modal-backdrop").addEventListener("click", function() { self._closeDiff(); });
   document.getElementById("project-modal").querySelector(".modal-backdrop").addEventListener("click", function() { self.closeProjectModal(); });
    document.querySelectorAll(".pm-close").forEach(function(b) { b.addEventListener("click", function() { self.closeProjectModal(); }); });
    document.getElementById("project-list").addEventListener("click", function(e) { var btn = e.target.closest("[data-a]"); if (!btn) return; if (btn.dataset.a === "pm-open") self.openProject(btn.dataset.id); else if (btn.dataset.a === "pm-delete") self.deleteProject(btn.dataset.id); });
    document.getElementById("btn-new-project").addEventListener("click", function() { self.showNewProjectForm(); });
    document.getElementById("btn-create-project").addEventListener("click", function() { self.createProject(); });
    document.getElementById("new-project-modal").querySelector(".modal-backdrop").addEventListener("click", function() { document.getElementById("new-project-modal").classList.remove("visible"); });
    document.querySelectorAll(".npm-close").forEach(function(b) { b.addEventListener("click", function() { document.getElementById("new-project-modal").classList.remove("visible"); }); });
    document.getElementById("btn-tree-gen").addEventListener("click", function() { self.showPipeline(); });
    document.getElementById("tree-body").addEventListener("click", function(e) { var btn = e.target.closest("[data-a]"); if (!btn) return; if (btn.dataset.a === "view-outline") self.openOutlineWorkspace(); else if (btn.dataset.a === "toggle-vol") self.toggleVolume(btn.dataset.id); else if (btn.dataset.a === "view-vol-outline") self.openVolumeOutline(btn.dataset.id); else if (btn.dataset.a === "view-ch-plot") self.openChapterPlot(btn.dataset.vid, btn.dataset.cid); else if (btn.dataset.a === "open-ch") self.openChapter(btn.dataset.vid, btn.dataset.cid); else if (btn.dataset.a === "del-ch") { e.stopPropagation(); self.deleteChapterFromTree(btn.dataset.vid, btn.dataset.cid); } else if (btn.dataset.a === "add-ch") self.addChapter(btn.dataset.vid); else if (btn.dataset.a === "gen-ch") self._treeGenChapters(btn.dataset.vid); else if (btn.dataset.a === "gen-body") self._treeGenBody(btn.dataset.vid, btn.dataset.cid); else if (btn.dataset.a === "add-vol") self.showVolumeForm(); });
  document.getElementById("tree-body").addEventListener("contextmenu", function(e) { self.showContextMenu(e); });
  document.getElementById("tree-body").addEventListener("dblclick", function(e) {
      var chNode = e.target.closest("[data-a='open-ch']");
      if (chNode) {
        e.preventDefault();
        e.stopPropagation();
        var vid = chNode.dataset.vid;
        var cid = chNode.dataset.cid;
        var span = chNode.querySelector("span:not(.tree-actions)");
        if (!span || span.isContentEditable) return;
        span.setAttribute("contenteditable", "true");
        span.focus();
        document.execCommand("selectAll", false, null);
        var saveRename = function() {
          span.removeAttribute("contenteditable");
          span.removeEventListener("blur", saveRename);
          span.removeEventListener("keydown", onKey);
          var newName = span.textContent.trim();
          if (newName) {
            var ch = ChapterManager.getChapter(self.currentProjectId, vid, cid);
            if (ch) { ch.title = newName; ChapterManager.save(); self.renderChapterTree(); }
          }
        };
        var onKey = function(ev) {
          if (ev.key === "Enter") { ev.preventDefault(); saveRename(); }
          else if (ev.key === "Escape") { span.removeAttribute("contenteditable"); span.removeEventListener("blur", saveRename); span.removeEventListener("keydown", onKey); self.renderChapterTree(); }
        };
        span.addEventListener("blur", saveRename);
        span.addEventListener("keydown", onKey);
      }
    });
    // 拖拽排序
    var dragNode = null;
    document.getElementById("tree-body").addEventListener("dragstart", function(e) {
      dragNode = e.target.closest("[draggable=true]");
      if (dragNode) { dragNode.style.opacity = "0.5"; e.dataTransfer.effectAllowed = "move"; }
    });
    document.getElementById("tree-body").addEventListener("dragover", function(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      var target = e.target.closest("[draggable=true]");
      if (target && target !== dragNode) { target.style.borderTop = "2px solid var(--accent-primary)"; }
    });
    document.getElementById("tree-body").addEventListener("dragleave", function(e) {
      var target = e.target.closest("[draggable=true]");
      if (target) { target.style.borderTop = ""; }
    });
    document.getElementById("tree-body").addEventListener("drop", function(e) {
      e.preventDefault();
      var target = e.target.closest("[draggable=true]");
      if (target) { target.style.borderTop = ""; }
      if (!dragNode || !target || dragNode === target) { dragNode = null; return; }
      dragNode.style.opacity = "";
      var parentEl = target.parentElement;
      if (parentEl) {
        parentEl.insertBefore(dragNode, target);
        // 更新 ChapterManager 排序
        var orderedIds = [];
        var items = parentEl.querySelectorAll("[draggable=true]");
        items.forEach(function(item) {
          var cid = item.dataset.cid;
          if (cid) orderedIds.push(cid);
        });
        if (orderedIds.length > 0) {
          var vid = target.dataset.vid || dragNode.dataset.vid;
          if (vid) ChapterManager.reorderChapters(self.currentProjectId, vid, orderedIds);
        }
      }
      dragNode = null;
    });
    document.getElementById("tree-body").addEventListener("dragend", function(e) {
      if (dragNode) { dragNode.style.opacity = ""; dragNode = null; }
    });
    document.addEventListener("click", function() { self.hideContextMenu(); });
    document.getElementById("skill-bind-modal").querySelector(".modal-backdrop").addEventListener("click", function() { document.getElementById("skill-bind-modal").classList.remove("visible"); });
    document.querySelectorAll(".sbm-close").forEach(function(b) { b.addEventListener("click", function() { document.getElementById("skill-bind-modal").classList.remove("visible"); }); });
    document.getElementById("btn-save-skill-binding").addEventListener("click", function() { self.saveNodeSkillBinding(); });
    document.getElementById("ctx-menu").addEventListener("click", function(e) { var btn = e.target.closest("[data-a]"); if (!btn) return; if (btn.dataset.a === "ctx-bind-skill") self.showSkillBindingModal(); else if (btn.dataset.a === "ctx-gen-chapters") self._treeGenChapters(self._ctxNodeId); else if (btn.dataset.a === "ctx-gen-body") self._treeGenBody(self._ctxVolumeId, self._ctxNodeId); self.hideContextMenu(); });
    document.getElementById("volume-modal").querySelector(".modal-backdrop").addEventListener("click", function() { document.getElementById("volume-modal").classList.remove("visible"); });
    document.querySelectorAll(".vm-close").forEach(function(b) { b.addEventListener("click", function() { document.getElementById("volume-modal").classList.remove("visible"); }); });
    document.getElementById("btn-save-volume").addEventListener("click", function() { self.saveVolume(); });
    document.getElementById("editor-content").addEventListener("input", function() { self._pushUndoState(); self.updateWordCount(); self.autoSave(); });
    var ed = document.getElementById('editor-content');
    if (ed) {
      ed.addEventListener('mouseup', function() { self._checkInlineMenu(); });
      ed.addEventListener('keyup', function(e) { if (e.key === 'Escape') self._hideInlineMenu(); else self._checkInlineMenu(); });
    }
    document.addEventListener('mousedown', function(e) {
      var menu = document.getElementById('inline-menu');
      if (menu && !menu.contains(e.target) && e.target.id !== 'editor-content') self._hideInlineMenu();
    });
    document.getElementById("agent-select").addEventListener("change", function() { self.currentAgentId = this.value || null; self.populateModelSelect(); self._autoSelectAgentModel(); self.renderAgentInfo(); });
    document.getElementById("agent-select-chat") && document.getElementById("agent-select-chat").addEventListener("change", function() { var ts = document.getElementById("agent-select"); if (ts) { ts.value = this.value; ts.dispatchEvent(new Event("change")); } });
    document.getElementById("model-select-chat") && document.getElementById("model-select-chat").addEventListener("change", function() { var ts = document.getElementById("model-select"); if (ts) { ts.value = this.value; ts.dispatchEvent(new Event("change")); } });
    document.getElementById("model-select") && document.getElementById("model-select").addEventListener("change", function() { var cs = document.getElementById("model-select-chat"); if (cs) { cs.value = this.value; } });
   document.getElementById("model-select") && document.getElementById("model-select").addEventListener("change", function() { if (this.value) { self.settings.model = this.value; self.saveSettings(); self.updateUIState(); if (window.DiagLogger) DiagLogger.info('model', 'model-select changed -> settings.model=' + this.value); } });
   document.getElementById("model-select") && document.getElementById("model-select").addEventListener("change", function() { if (typeof self._updateFlowPreview === 'function') self._updateFlowPreview(); });
    document.getElementById("agent-select") && document.getElementById("agent-select").addEventListener("change", function() { var cs = document.getElementById("agent-select-chat"); if (cs) { cs.value = this.value; } });
    document.getElementById("editor-content").addEventListener("click", function() { self._updateCursorPos(); });
    document.getElementById("editor-content").addEventListener("keyup", function() { self._updateCursorPos(); });
   document.querySelectorAll(".modal-tab").forEach(function(tab) { tab.addEventListener("click", function() { self.switchTab(tab.dataset.tab); }); });
    var cfgFontSize = document.getElementById("cfg-font-size");
    if (cfgFontSize) cfgFontSize.addEventListener("input", function() { document.getElementById("cfg-font-size-val").textContent = this.value + "px"; });
    var cfgEditorFontSize = document.getElementById("cfg-editor-font-size");
    if (cfgEditorFontSize) cfgEditorFontSize.addEventListener("input", function() { document.getElementById("cfg-editor-font-size-val").textContent = this.value + "px"; });
    var btnSaveAppearance = document.getElementById("btn-save-appearance");
    if (btnSaveAppearance) btnSaveAppearance.addEventListener("click", function() { self._saveAppearance(); });
   var btnAddSkill = document.getElementById("btn-add-skill");
   if (btnAddSkill) btnAddSkill.addEventListener("click", function() { self.showSkillForm(); });
   else console.warn("[WARN] btn-add-skill not found in DOM");
   var btnCancelSkill = document.getElementById("btn-cancel-skill");
   if (btnCancelSkill) btnCancelSkill.addEventListener("click", function() { self.hideSkillForm(); });
   var btnSaveSkill = document.getElementById("btn-save-skill");
   if (btnSaveSkill) btnSaveSkill.addEventListener("click", function() { self.saveSkill(); });
   var sfBindType = document.getElementById("sf-bind-type");
   if (sfBindType) sfBindType.addEventListener("change", function() { self.toggleBindTarget(); });
    document.getElementById("skill-list").addEventListener("click", function(e) {
      var btn = e.target.closest("[data-a]");
      if (!btn) return;
      var id = btn.dataset.id;
      if (btn.dataset.a === "skill-edit") self.showSkillForm(id);
      else if (btn.dataset.a === "skill-delete") self.deleteSkill(id);
      else if (btn.dataset.a === "skill-test") self.testSkill(id);
    });
   var btnAddAgent = document.getElementById("btn-add-agent");
   if (btnAddAgent) btnAddAgent.addEventListener("click", function() { self.showAgentForm(); });
   var btnCancelAgent = document.getElementById("btn-cancel-agent");
   if (btnCancelAgent) btnCancelAgent.addEventListener("click", function() { self.hideAgentForm(); });
   var btnSaveAgent = document.getElementById("btn-save-agent");
   if (btnSaveAgent) btnSaveAgent.addEventListener("click", function() { self.saveAgent(); });
   var afTemp = document.getElementById("af-temperature");
   if (afTemp) afTemp.addEventListener("input", function() { document.getElementById("af-temp-val").textContent = this.value; });
   var agentList = document.getElementById("agent-list");
   if (agentList) agentList.addEventListener("click", function(e) {
      var btn = e.target.closest("[data-a]");
      if (!btn) return;
      var id = btn.dataset.id;
      if (btn.dataset.a === "edit-agent") self.showAgentForm(id);
      else if (btn.dataset.a === "delete-agent") self.deleteAgent(id);
      else if (btn.dataset.a === "agent-test") self.openAgentTest(id);
      else if (btn.dataset.a === "activate-agent") { self.currentAgentId = id; self.populateAgentSelect(); self.renderAgentInfo(); self.renderAgentList(); self._toast("已启用智能体", "success"); }
   });
    // 键盘快捷键（使用 hotkeys-js）
    hotkeys.filter = function(){ return true; };
    hotkeys("escape", function(e) {
      e.preventDefault();
      if (document.getElementById("find-replace-bar").classList.contains("visible")) { self._closeFindBar(); }
      else {
        try { self.toggleSettings(false); } catch(e) { console.warn("[WARN]", e); }
        try { self.closeProjectModal(); } catch(e) { console.warn("[WARN]", e); }
        try { self.closeSettingsCollection(); } catch(e) { console.warn("[WARN]", e); }
        try { self.closeMemory(); } catch(e) { console.warn("[WARN]", e); }
        try { self.closePipeline(); } catch(e) { console.warn("[WARN]", e); }
        try { document.getElementById("new-project-modal").classList.remove("visible"); document.getElementById("new-project-modal").style.display = "none"; } catch(e) { console.warn("[WARN]", e); }
        try { document.getElementById("volume-modal").classList.remove("visible"); document.getElementById("volume-modal").style.display = "none"; } catch(e) { console.warn("[WARN]", e); }
        try { document.getElementById("skill-bind-modal").classList.remove("visible"); document.getElementById("skill-bind-modal").style.display = "none"; } catch(e) { console.warn("[WARN]", e); }
        try { document.getElementById("sc-bind-modal").classList.remove("visible"); document.getElementById("sc-bind-modal").style.display = "none"; } catch(e) { console.warn("[WARN]", e); }
      }
    });
    hotkeys("ctrl+f,command+f", function(e) {
      e.preventDefault();
      var ed = document.getElementById("editor-content");
      if (!ed.disabled) { self._openFindBar(); }
    });
    hotkeys("ctrl+s,command+s", function(e) {
      e.preventDefault();
      self.autoSave();
    });
    hotkeys("ctrl+shift+n,command+shift+n", function(e) {
      e.preventDefault();
      self.showNewProjectForm();
    });
    hotkeys("ctrl+shift+p,command+shift+p", function(e) {
      e.preventDefault();
      self.openProjectModal();
    });
    hotkeys("ctrl+k,command+k", function(e) {
      e.preventDefault();
      self.clearChat();
    });
   document.getElementById("btn-fetch-models").addEventListener("click", function() { self.fetchModelList(); });
   // 编辑器头部按钮绑定 (之前19个按钮存在于HTML但从未绑定事件)
   var _ed = document.getElementById("editor-content");
   var _btnUndo = document.getElementById("btn-undo");
   if (_btnUndo) _btnUndo.addEventListener("click", function() { self._undo(); });
   var _btnRedo = document.getElementById("btn-redo");
   if (_btnRedo) _btnRedo.addEventListener("click", function() { self._redo(); });
   var _btnGen = document.getElementById("btn-generate-content");
   if (_btnGen) _btnGen.addEventListener("click", function() { self.generateContent(); });
    var _btnSave = document.getElementById("btn-save-editor");
    if (_btnSave) _btnSave.addEventListener("click", function() { self.saveEditorContent(); });
   var _btnExport = document.getElementById("btn-export");
   var _expDropdown = document.getElementById("export-dropdown");
   if (_btnExport && _expDropdown) {
     _btnExport.addEventListener("click", function(e) { e.stopPropagation(); _expDropdown.classList.toggle("open"); });
     _expDropdown.addEventListener("click", function(e) {
       var b = e.target.closest("[data-format]");
       if (b) { _expDropdown.classList.remove("open"); self.exportChapter(b.dataset.format); }
     });
     document.addEventListener("click", function() { _expDropdown.classList.remove("open"); });
   }
   var _btnNames = document.getElementById("btn-ai-names");
   if (_btnNames) _btnNames.addEventListener("click", function() { if (_ed) self.generateNames("character", _ed.value); });
   var _btnWR = document.getElementById("btn-writing-rules");
   if (_btnWR) _btnWR.addEventListener("click", function() { var _p = ProjectManager.get(self.currentProjectId); self.generateWritingRules(_p ? (_p.outline||"") : ""); });
   var _btnTL = document.getElementById("btn-timeline");
   if (_btnTL) _btnTL.addEventListener("click", function() { var _p = ProjectManager.get(self.currentProjectId); self.extractTimeline(_p ? (_p.outline||"") : ""); });
   var _btnBR = document.getElementById("btn-batch-review");
   if (_btnBR) _btnBR.addEventListener("click", function() { self.batchReviewChapters(); });
   var _btnRev = document.getElementById("btn-revise");
   if (_btnRev) _btnRev.addEventListener("click", function() { if (self.currentChapterId) self.reviseChapter(self.currentChapterId); });
   var _btnDeAi = document.getElementById("btn-de-ai");
   if (_btnDeAi) _btnDeAi.addEventListener("click", function() { self.deAiProcess(); });
    var _btnDeAiAddSkill = document.getElementById("btn-deai-add-skill");
    if (_btnDeAiAddSkill) _btnDeAiAddSkill.addEventListener("click", function() { self._addDeAiSkill(); });
    var _btnSaveDeAi = document.getElementById("btn-save-deai");
    if (_btnSaveDeAi) _btnSaveDeAi.addEventListener("click", function() { self._saveDeAiConfig(); });
   var _btnTheme = document.getElementById("theme-toggle-btn");
   if (_btnTheme) _btnTheme.addEventListener("click", function() { self._toggleTheme(); });
 }

 _syncDeAiConfigFromDOM() {
   var modeSel = document.getElementById("deai-mode-select");
   if (modeSel) this._deAiConfig.agentMode = modeSel.value;
   // Read split size from the active mode's input
   var _curMode = this._deAiConfig.agentMode || 'chain';
   var _splitId = _curMode === 'multi-step' ? 'deai-split-size-ms' : 'deai-split-size';
   var splitInp = document.getElementById(_splitId);
   if (splitInp) this._deAiConfig.splitSize = parseInt(splitInp.value) || 1000;
   var hrT = document.getElementById("deai-hardrule-enabled");
   if (hrT) this._deAiConfig.hardRulesEnabled = hrT.checked;
   // Read agent from the active mode's select
   var _agId = _curMode === 'split-merge' ? 'deai-agent-select-sm' : (_curMode === 'multi-step' ? 'deai-agent-select-ms' : 'deai-agent-select');
   var agSel = document.getElementById(_agId);
   if (agSel) this._deAiConfig.agentId = agSel.value || null;
   // Fallback: if active mode's select is empty, check other selects
   if (!this._deAiConfig.agentId) {
     var _allAgIds = ['deai-agent-select', 'deai-agent-select-sm', 'deai-agent-select-ms'];
     for (var _ai = 0; _ai < _allAgIds.length; _ai++) {
       var _tmpSel = document.getElementById(_allAgIds[_ai]);
       if (_tmpSel && _tmpSel.value) { this._deAiConfig.agentId = _tmpSel.value; break; }
     }
   }
   var lvRadios = document.querySelectorAll('input[name="deai-level"]');
    for (var li = 0; li < lvRadios.length; li++) { if (lvRadios[li].checked) this._deAiConfig.level = lvRadios[li].value; }
    var verRadios = document.querySelectorAll('input[name="deai-version"]');
    for (var vi = 0; vi < verRadios.length; vi++) { if (verRadios[vi].checked) this._deAiConfig.version = verRadios[vi].value; }
   var ttSel = document.getElementById("deai-text-type");
   if (ttSel) this._deAiConfig.textType = ttSel.value;
   // Sync filter words from config so _applyTextFilter uses user's custom words
   if (this._deAiConfig.filterWords && Array.isArray(this._deAiConfig.filterWords)) {
     this._deAiFilterWords = this._deAiConfig.filterWords;
   }
}

    async deAiProcess() {
    var _diagDeAiStart = Date.now();
    if (window.DiagLogger) DiagLogger.info("deai", "deAiProcess started, mode=" + (this._deAiConfig ? this._deAiConfig.agentMode : "unknown") + ", skills=" + (this._deAiConfig && this._deAiConfig.skills ? this._deAiConfig.skills.length : 0));
    var editor = document.getElementById("editor-content");
    if (!editor) { this._toast("编辑区未找到", "error"); return; }
    var text = editor.value;
    if (!text || text.trim().length < 10) { this._toast("内容太少，无法处理", "error"); return; }
    this._syncDeAiConfigFromDOM();
    var cfg = this._deAiConfig || { skills: [], agentId: null, hardRulesEnabled: true };
   // Agent调度模式：切分+并行+拼接
   if (cfg.agentMode === "split-merge" && cfg.skills && cfg.skills.length > 0) {
      var _smCancel = new AbortController();
     var _smResult = await this._deAiSplitMerge(text, cfg, _smCancel);
      // P9: AI验证AI cross_model_check for split-merge
      var _smVP = null; try { _smVP = ProviderManager.getVerifyProvider(); } catch(eSmVP){console.warn("[WARN] catch #5 renderer_v2.js",eSmVP);if(window.DiagLogger)DiagLogger.warn("catch","renderer_v2.js #5",eSmVP);}
      if (_smVP && typeof SkillValidators !== "undefined" && SkillValidators.cross_model_check) {
        try {
          this._toast("AI验证AI正在运行...", "info");
          var _smCm = await SkillValidators.cross_model_check(_smResult, text, {}, {verifyProvider: _smVP, aiRequest: this._aiRequest.bind(this)});
          if (!_smCm.ok) console.warn("[WARN] split-merge cross_model_check: " + (_smCm.hint || ""));
          else console.log("[OK] split-merge cross_model_check passed");
        } catch(eSmCm) { console.warn("[WARN] sm cross_model_check error", eSmCm); }
      }
     if (cfg.hardRulesEnabled) {
        try { var _hrR = DeAiProcessor.processSafe(_smResult, cfg); _smResult = _hrR.text; } catch(e) { console.warn("deAI hardrule post-merge failed", e); }
      }
      editor.value = _smResult;
     if (this._updateWordCount) this._updateWordCount();
     var _smFail = 0;
     if (window.DiagLogger) DiagLogger.trackDeAi("split-merge", (cfg.skills||[]).length, cfg.hardRulesEnabled, Date.now() - _diagDeAiStart, "ok");
     this._toast("去AI味Agent调度处理完成", "success");
     return;
   }
    // V64 multi-step模式：代码控制多步流程（事件核→偏转→重组→验证）
   if (cfg.agentMode === "multi-step" && cfg.skills && cfg.skills.length >= 3) {
      var _msCancel = new AbortController();
      var _msResult = await this._deAiMultiStep(text, cfg, _msCancel);
      // P9: AI验证AI cross_model_check for multi-step
      var _msVP = null; try { _msVP = ProviderManager.getVerifyProvider(); } catch(eMsVP){console.warn("[WARN] catch #6 renderer_v2.js",eMsVP);if(window.DiagLogger)DiagLogger.warn("catch","renderer_v2.js #6",eMsVP);}
      if (_msVP && typeof SkillValidators !== "undefined" && SkillValidators.cross_model_check) {
        try {
          this._toast("AI验证AI正在运行...", "info");
          var _msCm = await SkillValidators.cross_model_check(_msResult, text, {}, {verifyProvider: _msVP, aiRequest: this._aiRequest.bind(this)});
          if (!_msCm.ok) console.warn("[WARN] multi-step cross_model_check: " + (_msCm.hint || ""));
          else console.log("[OK] multi-step cross_model_check passed");
        } catch(eMsCm) { console.warn("[WARN] ms cross_model_check error", eMsCm); }
      }
     if (cfg.hardRulesEnabled) {
        try { var _hrR2 = DeAiProcessor.processSafe(_msResult, cfg); _msResult = _hrR2.text; } catch(e) { console.warn("deAI hardrule post-multistep failed", e); }
      }
      editor.value = _msResult;
      if (this._updateWordCount) this._updateWordCount();
      if (window.DiagLogger) DiagLogger.trackDeAi("multi-step", (cfg.skills||[]).length, cfg.hardRulesEnabled, Date.now() - _diagDeAiStart, "ok");
      this._toast("去AI味Multi-step处理完成", "success");
      return;
    }
    var currentText = text;
    var NL = String.fromCharCode(10);

    // Build step list: S1 -> hardrule-mid -> S2 -> hardrule-post (Fix D: S1 runs on original text first)
    var steps = [];
    if (cfg.skills && cfg.skills.length > 0) {
      for (var si = 0; si < cfg.skills.length; si++) {
        var skName = cfg.skills[si];
        try { var _sk = SkillManager.get(cfg.skills[si]); if (_sk) skName = _sk.name; } catch(e){console.warn("[WARN] catch #7 renderer_v2.js",e);if(window.DiagLogger)DiagLogger.warn("catch","renderer_v2.js #7",e);}
        steps.push({ type: "skill", idx: si, name: skName, status: "pending" });
        // Insert hardrule between S1 and S2 (not before S1)
        if (cfg.hardRulesEnabled && si === 0 && cfg.skills.length > 1) {
          steps.push({ type: "hardrule-mid", idx: 0, name: "硬规则清洗", status: "pending" });
        }
      }
    }
    if (cfg.hardRulesEnabled) {
      steps.push({ type: "hardrule-post", idx: steps.length, name: "硬规则安全网", status: "pending" });
    }
    if (steps.length === 0) { this._toast("未配置任何去AI味技能或硬规则", "warn"); if (window.DiagLogger) DiagLogger.warn("deai", "deAiProcess aborted: no skills or hardrules"); return; }

    // Show progress modal
    this._showDeAiProgress(steps);

    // Cancel signal
    var cancelController = new AbortController();
    var cancelled = false;
    var cancelBtn = document.getElementById("btn-deai-cancel");
    if (cancelBtn) cancelBtn.addEventListener("click", function() { cancelled = true; cancelController.abort(); });

    var totalSteps = steps.length;

    for (var stepI = 0; stepI < totalSteps; stepI++) {
      if (cancelled) break;
      var step = steps[stepI];
      step.status = "active";
      this._updateDeAiProgress(steps, stepI, totalSteps, 0);

      if (step.type === "skill") {
       var sk = null;
       try { sk = SkillManager.get(cfg.skills[step.idx]); } catch(e) { console.warn("[WARN] deAI skill get failed", e); }
       if (!sk) {
         console.warn("[WARN] deAI skill " + (step.idx+1) + " not found, skipping");
         step.status = "failed";
         this._updateDeAiProgress(steps, stepI, totalSteps, 0);
         continue;
       }
       // Fix C: SKILL template as system message, params+text as user message
       var _deAiParamPrefix = "[去AI味参数]\n文体类型: " + (cfg.textType || "novel") + "\n改写版本: " + (cfg.version || "v3") + "\n改写强度: " + (cfg.level || "medium") + "\n\n";
       var userContent;
       if (step.idx === 0) {
          userContent = _deAiParamPrefix + "[以下为待处理文本]\n" + currentText;
       } else {
          userContent = _deAiParamPrefix + "以下是上一个技能的输出结果，请根据当前技能进行处理：" + NL + NL + "--- 上一步输出 ---" + NL + currentText;
       }
       // Fix E: Inject style samples to S1 (first skill), not last skill
        if (step.idx === 0 && typeof DeAiSamples !== "undefined") {
          try { userContent += NL + NL + "[风格参考样本]\n" + DeAiSamples.getSampleText(); } catch(e) { console.warn("[WARN] deAI samples inject failed", e); }
       }
       // Fix C: SKILL template is the system message
        var sysContent = this._renderSkillTemplate(sk, "deai", {selectedText: currentText}) || "你是专业的文本处理专家，请严格按照技能指令处理文本。只输出处理后的完整正文，不要输出任何说明或标记。";
       // Ensure system message ends with output instruction
        if (sysContent.indexOf("只输出") === -1) sysContent += "\n\n只输出处理后的完整正文，不要输出任何说明或标记。";
       var agentModel = null, agentTemp = null;
       if (cfg.agentId) { try { var ag = AgentManager.get(cfg.agentId); if (ag) { agentModel = ag.model || null; agentTemp = ag.temperature != null ? ag.temperature : null; } } catch(e){console.warn("[WARN] catch #8 renderer_v2.js",e);if(window.DiagLogger)DiagLogger.warn("catch","renderer_v2.js #8",e);} }
       // Fix B: Last skill (S2/verifier) uses verify stage for low temperature
       var _deAiStage = (step.idx === cfg.skills.length - 1) ? "verify" : "rewrite";
       var _deAiTemp = this._getDeAiTemperature(cfg.level || "medium", cfg.version || "v3", _deAiStage);
       if (agentTemp === null) agentTemp = _deAiTemp;
       var self = this;
       var inputLen = currentText.length;
       var estOutputLen = Math.max(inputLen, 500);
       var _origText = currentText;
       try {
        var _deAiVP=null; try{_deAiVP=ProviderManager.getVerifyProvider();}catch(e){}
        var chainResult = await this._aiRequest({
           baseUrl: _deAiVP?_deAiVP.baseUrl:undefined, apiKey: _deAiVP?_deAiVP.apiKey:undefined,
           messages: [{role:"system",content:sysContent},{role:"user",content:userContent}],
            model: (function(){ try { var _vp=ProviderManager.getVerifyProvider(); if(_vp&&_vp.model) return _vp.model; }catch(e){} return self.settings.model || agentModel; })(),
          temperature: agentTemp,
           maxTokens: this._getAgentMaxTokens ? this._getAgentMaxTokens() : 128000,
           stream: true,
           signal: cancelController.signal,
           onChunk: function(partialText) {
             var received = (partialText || "").length;
             var ratio = estOutputLen > 0 ? Math.min(received / estOutputLen, 0.85) : 0;
             self._updateDeAiProgress(steps, stepI, totalSteps, ratio);
           },
           onReasoning: function(reasoningText) {
             var reasoningLen = (reasoningText || "").length;
             var ratio = estOutputLen > 0 ? Math.min(reasoningLen / (estOutputLen * 2), 0.3) : 0;
             self._updateDeAiProgress(steps, stepI, totalSteps, ratio);
             var stepEl = document.getElementById("deai-progress-step");
             if (stepEl) stepEl.textContent = (steps[stepI].type === "skill" ? "技能 " + (steps[stepI].idx + 1) + "/" + steps.length + ": " + steps[stepI].name : "硬规则处理") + " [AI思考中...]";
           }
         });
        if (chainResult && chainResult.text) currentText = chainResult.text;
        // Fix A: Run first_subject_different validator after each skill step
        if (typeof SkillValidators !== "undefined" && SkillValidators.first_subject_different) {
          try {
            var _fvResult = await SkillValidators.first_subject_different(currentText, _origText, {}, {});
            if (!_fvResult.ok) {
              console.warn("[WARN] deAI first_subject_different failed for skill " + (step.idx+1) + ": " + (_fvResult.hint || ""));
            }
          } catch(eFv) { console.warn("[WARN] deAI validator error", eFv); }
        }
        // AI验证AI: cross_model_check after S1 (first skill) output
        // P10: Add verify step to progress modal
        if (step.idx === 0) {
          var _vpForProg = null; try { _vpForProg = ProviderManager.getVerifyProvider(); } catch(eVpP){console.warn("[WARN] catch #9 renderer_v2.js",eVpP);if(window.DiagLogger)DiagLogger.warn("catch","renderer_v2.js #9",eVpP);}
          if (_vpForProg) {
            var _verifyStep = { type: "verify-ai", idx: step.idx, name: "AI验证AI(" + (_vpForProg.name || "") + ")", status: "active" };
            steps.splice(stepI + 1, 0, _verifyStep);
            totalSteps++;
            this._updateDeAiProgress(steps, stepI, totalSteps, 1);
          }
        }
        if (step.idx === 0 && typeof SkillValidators !== "undefined" && SkillValidators.cross_model_check) {
          var _vp = null;
          try { _vp = ProviderManager.getVerifyProvider(); } catch(eP2){console.warn("[WARN] catch #10 renderer_v2.js",eP2);if(window.DiagLogger)DiagLogger.warn("catch","renderer_v2.js #10",eP2);}
          if (_vp) {
            try {
              var _cmResult = await SkillValidators.cross_model_check(currentText, _origText, {}, {
                verifyProvider: _vp,
                aiRequest: this._aiRequest.bind(this)
              });
              if (!_cmResult.ok) {
                console.warn("[WARN] deAI cross_model_check (verify provider: " + _vp.name + ") issues: " + (_cmResult.hint || ""));
                if (_cmResult.score != null) console.log("[INFO] cross_model_check score: " + _cmResult.score);
              } else {
                console.log("[OK] deAI cross_model_check passed" + (_cmResult.score != null ? " (score: " + _cmResult.score + ")" : ""));
              }
            } catch(eCm) { console.warn("[WARN] deAI cross_model_check error", eCm); }
          } else {
            console.log("[INFO] deAI: no verify provider configured, skipping cross_model_check");
          }
        }
        step.status = "done";
         this._updateDeAiProgress(steps, stepI, totalSteps, 1);
       } catch(stepErr) {
         console.error("[ERR] deAI chain step " + (step.idx+1) + " failed: " + stepErr.message);
         step.status = "failed";
         this._updateDeAiProgress(steps, stepI, totalSteps, 0);
         if (cancelled) break;
       }
     } else if (step.type === "hardrule-mid" || step.type === "hardrule-post") {
       // Hard rules: mid=full process (between S1 and S2), post=safe subset only
       try {
         var result = step.type === "hardrule-post"
           ? DeAiProcessor.processSafe(currentText, this._deAiConfig)
           : DeAiProcessor.process(currentText, this._deAiConfig);
         currentText = result.text;
         step.status = "done";
         this._updateDeAiProgress(steps, stepI, totalSteps, 1);
       } catch(hrErr) {
         console.error("[ERR] hardrule failed: " + hrErr.message);
         step.status = "failed";
         this._updateDeAiProgress(steps, stepI, totalSteps, 0);
       }
     }
    }

    // Close modal and write result
    this._hideDeAiProgress();
    editor.value = currentText;
    if (this._updateWordCount) this._updateWordCount();

    if (cancelled) {
      this._toast("去AI味已取消", "warn");
    } else {
      var failCount = steps.filter(function(s) { return s.status === "failed"; }).length;
      if (failCount > 0) {
        this._toast("去AI味完成（" + failCount + "步失败）", "warn");
      } else {
        if (window.DiagLogger) DiagLogger.trackDeAi(cfg.agentMode || "chain", (cfg.skills||[]).length, cfg.hardRulesEnabled, Date.now() - _diagDeAiStart, "ok");
    this._toast("去AI味处理完成", "success");
      }
    }
  }
 
  _showDeAiProgress(steps) {
    var modal = document.getElementById("deai-progress-modal");
    if (!modal) return;
    modal.classList.remove("modal-hidden");
    modal.style.display = "flex";
    var fill = document.getElementById("deai-progress-fill");
    if (fill) fill.style.width = "0%";
    var pct = document.getElementById("deai-progress-percent");
    if (pct) pct.textContent = "0%";
    var stepEl = document.getElementById("deai-progress-step");
    if (stepEl) stepEl.textContent = "准备中...";
    var listEl = document.getElementById("deai-step-list");
    if (!listEl) return;
    listEl.innerHTML = "";
    for (var i = 0; i < steps.length; i++) {
      var item = document.createElement("div");
      item.className = "deai-step-item pending";
      item.id = "deai-step-" + i;
      var dot = document.createElement("span");
      dot.className = "deai-step-dot";
      var label = document.createElement("span");
      label.className = "deai-step-label";
      label.textContent = (steps[i].type === "skill" ? "技能" + (steps[i].idx + 1) : steps[i].type === "segment" ? "段落" + (steps[i].idx + 1) : "硬规则") + ": " + steps[i].name;
      var status = document.createElement("span");
      status.className = "deai-step-status";
      status.textContent = "等待";
      item.appendChild(dot);
      item.appendChild(label);
      item.appendChild(status);
      listEl.appendChild(item);
    }
  }

  _updateDeAiProgress(steps, currentStep, totalSteps, subRatio) {
    var fill = document.getElementById("deai-progress-fill");
    var pct = document.getElementById("deai-progress-percent");
    var stepEl = document.getElementById("deai-progress-step");
    // Calculate overall progress: each step gets equal share, subRatio is within current step
    var baseProgress = (currentStep / totalSteps) * 100;
    var stepProgress = (subRatio / totalSteps) * 100;
    var overall = Math.min(Math.round(baseProgress + stepProgress), 99);
    if (currentStep === totalSteps - 1 && subRatio >= 1) overall = 100;
    if (fill) fill.style.width = overall + "%";
    if (pct) pct.textContent = overall + "%";
    // Update step list
    for (var i = 0; i < steps.length; i++) {
      var item = document.getElementById("deai-step-" + i);
      if (!item) continue;
      var statusEl = item.querySelector(".deai-step-status");
      item.classList.remove("pending", "active", "done", "failed");
      if (steps[i].status === "pending") {
        item.classList.add("pending");
        if (statusEl) statusEl.textContent = "等待";
      } else if (steps[i].status === "active") {
        item.classList.add("active");
        if (statusEl) statusEl.textContent = "执行中";
        if (stepEl) stepEl.textContent = steps[i].type === "skill" ? "技能 " + (steps[i].idx + 1) + "/" + steps.length + ": " + steps[i].name : steps[i].type === "segment" ? "段落 " + (steps[i].idx + 1) + "/" + steps.length + ": " + steps[i].name : "硬规则处理";
      } else if (steps[i].status === "done") {
        item.classList.add("done");
        if (statusEl) statusEl.textContent = "完成";
      } else if (steps[i].status === "failed") {
        item.classList.add("failed");
        if (statusEl) statusEl.textContent = "失败";
      }
    }
  }

  _hideDeAiProgress() {
    var modal = document.getElementById("deai-progress-modal");
    if (!modal) return;
    var fill = document.getElementById("deai-progress-fill");
    if (fill) { fill.style.transition = "width 0.3s ease"; fill.style.width = "100%"; }
    var pct = document.getElementById("deai-progress-percent");
    if (pct) pct.textContent = "100%";
    var stepEl = document.getElementById("deai-progress-step");
    if (stepEl) stepEl.textContent = "完成";
    var self = this;
    setTimeout(function() {
      modal.classList.add("modal-hidden");
      modal.style.display = "none";
      if (fill) { fill.style.width = "0%"; fill.style.transition = ""; }
    }, 600);
  }

  _splitText(text, targetSize) {
    var minSize = Math.floor(targetSize * 0.7);
    var maxSize = Math.floor(targetSize * 1.3);
    var segments = [];
    // Split by single newline (editor text uses \n)
    var paragraphs = text.split("\n");
    var currentChunk = "";
    var currentConnector = "";
    var nextConnector = "";
    for (var pi = 0; pi < paragraphs.length; pi++) {
      var para = paragraphs[pi];
      if (para.length === 0) {
        // Empty line: treat as connector part
        currentConnector += "\n";
        continue;
      }
      var potentialLen = currentChunk.length + para.length + currentConnector.length;
      if (currentChunk.length >= minSize && potentialLen > maxSize) {
        // Current chunk is in the cuttable zone and adding this paragraph would exceed max
        segments.push({ text: currentChunk, connector: nextConnector });
        nextConnector = currentConnector;
        currentChunk = para;
        currentConnector = "\n";
      } else {
        currentChunk += currentConnector + para;
        currentConnector = "\n";
      }
      // Long paragraph internal sentence boundary fallback
      while (currentChunk.length > maxSize) {
        // Find nearest sentence end after minSize
        var cutStart = minSize;
        var sentenceEnd = -1;
        var sentenceChars = ["。", "！", "？", "…", ".", "!", "?", "\n"];
        for (var s = cutStart; s < currentChunk.length && s < maxSize + 200; s++) {
          if (sentenceChars.indexOf(currentChunk.charAt(s)) >= 0) {
            sentenceEnd = s + 1;
            break;
          }
        }
        if (sentenceEnd < 0) {
          // Search backwards from maxSize
          for (var sb = maxSize; sb > minSize; sb--) {
            if (sentenceChars.indexOf(currentChunk.charAt(sb)) >= 0) {
              sentenceEnd = sb + 1;
              break;
            }
          }
        }
        if (sentenceEnd < 0) sentenceEnd = maxSize; // last resort: hard cut
        var part1 = currentChunk.substring(0, sentenceEnd);
        var part2 = currentChunk.substring(sentenceEnd);
        segments.push({ text: part1, connector: nextConnector });
        nextConnector = "";
        currentChunk = part2;
        currentConnector = "";
      }
    }
    // Last chunk
    if (currentChunk.length > 0) {
      segments.push({ text: currentChunk, connector: nextConnector });
    }
    // Merge tiny trailing segment into previous
    if (segments.length > 1 && segments[segments.length - 1].text.length < minSize / 2) {
      var last = segments.pop();
      segments[segments.length - 1].text += last.connector + last.text;
    }
   console.log("[DEAI-SPLIT] Split " + text.length + " chars into " + segments.length + " segments, sizes: " + segments.map(function(s){return s.text.length}).join(","));
    // Add overlap context: each segment (except first) carries last ~150 chars of previous as context
    var overlapSize = Math.min(150, Math.floor(splitSize * 0.15));
    for (var oi = 1; oi < segments.length; oi++) {
      var prevText = segments[oi - 1].text;
      var overlapText = prevText.substring(Math.max(0, prevText.length - overlapSize));
      // Cut at sentence boundary
      var sentEnds = ["。", "！", "？", "\n"];
      for (var se = 0; se < sentEnds.length; se++) {
        var lastSent = overlapText.lastIndexOf(sentEnds[se]);
        if (lastSent >= 0 && lastSent > overlapText.length / 2) {
          overlapText = overlapText.substring(lastSent + 1);
          break;
        }
      }
      segments[oi].overlapContext = overlapText;
    }
   return segments;
  }

  // V64 multi-step: code-controlled multi-step pipeline
// cfg.skills[0]=S1A event core, [1]=S1B perspective, [2]=S1C rewrite, [3]=S2 verify (optional)
async _deAiMultiStep(text, cfg, cancelController) {
  var NL = String.fromCharCode(10);
  var self = this;
  var cancelled = false;
  var cancelBtn = document.getElementById("btn-deai-cancel");
  if (cancelBtn) cancelBtn.addEventListener("click", function() { cancelled = true; cancelController.abort(); });
  var agentModel = null, agentTemp = null;
  if (cfg.agentId) { try { var ag = AgentManager.get(cfg.agentId); if (ag) { agentModel = ag.model || null; agentTemp = ag.temperature != null ? ag.temperature : null; } } catch(e){console.warn("[WARN] catch #11 renderer_v2.js",e);if(window.DiagLogger)DiagLogger.warn("catch","renderer_v2.js #11",e);} }
 var baseTemp = this._getDeAiTemperature(cfg.level || "medium", cfg.version || "v3", "rewrite");
  if (agentTemp === null) agentTemp = baseTemp;
  var maxTokens = this._getAgentMaxTokens ? this._getAgentMaxTokens() : 128000;
  var _deAiParamPrefix = "[去AI味参数]" + NL + "文体类型: " + (cfg.textType || "novel") + NL + "改写版本: " + (cfg.version || "v3") + NL + "改写强度: " + (cfg.level || "medium") + NL + NL;
  var skills = [];
  for (var si = 0; si < cfg.skills.length; si++) { try { skills.push(SkillManager.get(cfg.skills[si])); } catch(e) { skills.push(null); } }
  if (!skills[0] || !skills[1] || !skills[2]) { this._toast("Multi-step需要至少3个SKILL（S1A/S1B/S1C）", "error"); return text; }
  var hasS2 = skills.length >= 4 && skills[3];
  var splitSize = cfg.splitSize || 1500;
  var segments = this._splitText(text, splitSize);
  if (segments.length === 0) { this._toast("切分失败", "error"); return text; }

  // Progress: 4 phases (S1A, S1B, S1C, S2)
  var phaseNames = ["事件核提取", "视角偏转", "重组输出"];
  if (hasS2) phaseNames.push("S2验证");
  var progressSteps = phaseNames.map(function(n) { return { name: n, status: "pending" }; });
  this._showDeAiProgress(progressSteps);
  var totalPhases = progressSteps.length;
  var currentPhase = 0;
  function phaseActive() { progressSteps[currentPhase].status = "active"; self._updateDeAiProgress(progressSteps, currentPhase, totalPhases, 0); }
  function phaseDone(ratio) { progressSteps[currentPhase].status = "done"; self._updateDeAiProgress(progressSteps, currentPhase, totalPhases, ratio || 1); currentPhase++; }
  function updateProg(ratio) { if (!cancelled) self._updateDeAiProgress(progressSteps, currentPhase, totalPhases, ratio); }

 // Helper: call API with skill template as system prompt
async function callStep(skill, userInput, estLen) {
  return callStepWithTemp(skill, userInput, estLen, agentTemp);
 }
 // Fix B: callStep with temperature override (S2 verify uses low temp)
 async function callStepWithTemp(skill, userInput, estLen, tempOverride) {
  var sysContent = skill.template || ("你是专业的文本处理专家。只输出处理结果，不输出说明。");
  var userContent = _deAiParamPrefix + "[以下为待处理文本]" + NL + userInput;
 var _callTemp = (tempOverride != null) ? tempOverride : agentTemp;
  var _msVP2=null; try{_msVP2=ProviderManager.getVerifyProvider();}catch(e){}
  var result = await self._aiRequest({ baseUrl: _msVP2?_msVP2.baseUrl:undefined, apiKey: _msVP2?_msVP2.apiKey:undefined, messages: [{role:"system",content:sysContent},{role:"user",content:userContent}], model: (function(){ try { var _vp=ProviderManager.getVerifyProvider(); if(_vp&&_vp.model) return _vp.model; }catch(e){} return self.settings.model || agentModel; })(), temperature: _callTemp, maxTokens: maxTokens, stream: false, signal: cancelController.signal });
  return (result && result.text) ? result.text : "";
}

  // Helper: parallel map with concurrency limit
  async function parallelMap(items, fn, concurrency) {
    var results = new Array(items.length);
    var idx = 0;
    var completed = 0;
    async function worker() {
      while (idx < items.length && !cancelled) {
        var myIdx = idx++;
        try { results[myIdx] = await fn(items[myIdx], myIdx); } catch(e) { console.warn("[WARN] parallelMap item " + myIdx + " failed", e); results[myIdx] = items[myIdx].text || items[myIdx] || ""; }
        completed++;
        updateProg(completed / items.length * 0.9);
      }
    }
    var workers = [];
    for (var w = 0; w < Math.min(concurrency, items.length); w++) workers.push(worker());
    await Promise.all(workers);
    return results;
  }

  // Validation: event cores - check for [段N] markers
  function validateEventCores(output, inputSeg) {
    if (!output || output.trim().length < 20) return false;
    var coreCount = (output.match(/段\d+/g) || []).length;
    var paraCount = inputSeg.split(NL).filter(function(p) { return p.trim().length > 10; }).length;
    return coreCount >= Math.max(1, Math.floor(paraCount * 0.7));
  }

  // Validation: perspective rotation - check [换主语/视点转移/因果倒置/存在句转换] markers
  function validatePerspective(output) {
    if (!output) return true;
    var methods = output.match(/(换主语|视点转移|因果倒置|存在句转换)/g) || [];
    if (methods.length < 3) return true;
    for (var i = 0; i < methods.length - 2; i++) {
      if (methods[i] === methods[i+1] && methods[i+1] === methods[i+2]) return false;
    }
    return true;
  }

  // Validation: first sentence subject
  function extractFirstSubject(txt) {
    if (!txt) return "";
    var firstLine = txt.trim().split(/[。！？\n]/)[0];
    var pronouns = ["他", "她", "它", "我", "你"];
    for (var pi = 0; pi < pronouns.length; pi++) { if (firstLine.indexOf(pronouns[pi]) >= 0) return pronouns[pi]; }
    var m = firstLine.match(/^[一-龥]{2,3}/);
    return m ? m[0] : firstLine.substring(0, 3);
  }

 var segTexts = segments.map(function(s) { return s.text; });
 var segOverlaps = segments.map(function(s) { return s.overlapContext || ""; });
 var origSubjects = segTexts.map(extractFirstSubject);

 // Phase 1: S1A event core extraction (all segments parallel, 3 concurrent)
 phaseActive();
 var step1Inputs = segTexts.map(function(t, i) {
   var input = segOverlaps[i] ? "[上文尾部参考，请勿输出此段]\n" + segOverlaps[i] + NL + NL + t : t;
   // Fix E: Inject style samples to S1A (first skill, first segment only)
   if (i === 0 && typeof DeAiSamples !== "undefined") { try { input += NL + NL + "[风格参考样本]\n" + DeAiSamples.getSampleText(); } catch(eS){console.warn("[WARN] catch #12 renderer_v2.js",eS);if(window.DiagLogger)DiagLogger.warn("catch","renderer_v2.js #12",eS);} }
   return input;
 });
 var step1Outputs = await parallelMap(step1Inputs, function(seg, i) {
   return callStep(skills[0], seg, seg.length);
 }, 3);
  // Validate + retry failed
  for (var v1 = 0; v1 < step1Outputs.length; v1++) {
    if (cancelled) break;
    if (!validateEventCores(step1Outputs[v1], segTexts[v1])) {
      console.warn("[WARN] S1A validation failed seg " + v1 + ", retrying");
      try { step1Outputs[v1] = await callStep(skills[0], segTexts[v1], segTexts[v1].length); } catch(eR1){console.warn("[WARN] catch #13 renderer_v2.js",eR1);if(window.DiagLogger)DiagLogger.warn("catch","renderer_v2.js #13",eR1);}
    }
  }
  phaseDone();
  if (cancelled) { this._hideDeAiProgress(); return text; }

  // Phase 2: S1B perspective shift (all segments parallel, 3 concurrent)
  phaseActive();
  var step2Outputs = await parallelMap(step1Outputs, function(input, i) {
    return callStep(skills[1], input, input.length);
  }, 3);
  // Validate perspective rotation
  for (var v2 = 0; v2 < step2Outputs.length; v2++) {
    if (!validatePerspective(step2Outputs[v2])) { console.warn("[WARN] S1B perspective not rotated seg " + v2); }
  }
  phaseDone();
  if (cancelled) { this._hideDeAiProgress(); return text; }

  // Phase 3: S1C rewrite (all segments parallel, 3 concurrent)
  phaseActive();
  var step3Outputs = await parallelMap(step2Outputs, function(input, i) {
    return callStep(skills[2], input, input.length);
  }, 3);
  // Validate: first subject comparison + retry
  for (var v3 = 0; v3 < step3Outputs.length; v3++) {
    if (cancelled) break;
    var s3subj = extractFirstSubject(step3Outputs[v3]);
    if (s3subj === origSubjects[v3] && origSubjects[v3].length > 0) {
      console.warn("[WARN] S1C first subject same (" + origSubjects[v3] + "), retrying seg " + v3);
      try { step3Outputs[v3] = await callStep(skills[2], step2Outputs[v3] + NL + NL + "[注意：首句主语与原文相同，请更换视角或主语]", step2Outputs[v3].length); } catch(eR3){console.warn("[WARN] catch #14 renderer_v2.js",eR3);if(window.DiagLogger)DiagLogger.warn("catch","renderer_v2.js #14",eR3);}
    }
  }
  phaseDone();
  if (cancelled) { this._hideDeAiProgress(); return text; }

  // Merge all segments
  var mergedText = step3Outputs.join(NL + NL);

  // Phase 4 (optional): S2 verification - full text, single call
  var finalText = mergedText;
 if (hasS2) {
   phaseActive();
   try {
     var s2Input = mergedText;
     // Fix B: S2 uses verify stage low temperature; Fix E: samples go to S1A not S2
     var _s2Temp = self._getDeAiTemperature(cfg.level || "medium", cfg.version || "v3", "verify");
     finalText = await callStepWithTemp(skills[3], s2Input, mergedText.length, _s2Temp);
   } catch(e4) { console.warn("[WARN] multi-step S2 failed", e4); finalText = mergedText; }
   phaseDone();
 }

  this._hideDeAiProgress();
  if (cancelled) { this._toast("去AI味已取消", "warn"); }
  return finalText;
}

  async _deAiSplitMerge(text, cfg, cancelController) {
    var NL = String.fromCharCode(10);
    // Get agent config
    var agentModel = null, agentTemp = null, agentSysPrompt = null;
    if (cfg.agentId) {
      try { var ag = AgentManager.get(cfg.agentId); if (ag) { agentModel = ag.model || null; agentTemp = ag.temperature != null ? ag.temperature : null; agentSysPrompt = ag.systemPrompt || null; } } catch(e) { console.warn("[WARN] deAI agent get failed", e); }
    }
    // Get output skill (only need 1)
    var outputSkill = null;
    if (cfg.skills && cfg.skills.length > 0) {
      try { outputSkill = SkillManager.get(cfg.skills[0]); } catch(e) { console.warn("[WARN] deAI skill get failed", e); }
    }
    if (!outputSkill) { this._toast("未找到输出SKILL，无法执行Agent调度", "error"); return text; }
    var skillTemplate = this._renderSkillTemplate(outputSkill, "deai", {selectedText: text});
    var splitSize = cfg.splitSize || 1000;
    // Step 1: Local split
    var segments = this._splitText(text, splitSize);
    if (segments.length <= 1) { this._toast("文章太短，无需切分", "info"); return text; }
    // Build progress steps for segment mode
    var steps = [];
    for (var si = 0; si < segments.length; si++) {
      steps.push({ type: "segment", idx: si, name: "(" + segments[si].text.length + "字)", status: "pending" });
    }
    this._showDeAiProgress(steps);
    var stepEl = document.getElementById("deai-progress-step");
    if (stepEl) stepEl.textContent = "正在切分文章... 完成";
    var self = this;
    var totalSteps = steps.length;
    // Step 2: Parallel process with concurrency limit 3
    var results = new Array(segments.length);
    var completed = 0;
    var running = 0;
    var maxConcurrent = 3;
    var cancelled = false;
    var cancelBtn = document.getElementById("btn-deai-cancel");
    if (cancelBtn) cancelBtn.addEventListener("click", function() { cancelled = true; cancelController.abort(); });

    function processSegment(segIdx) {
      return new Promise(function(resolve, reject) {
        resolve();
      }).then(function() {
       var seg = segments[segIdx];
       steps[segIdx].status = "active";
       self._updateDeAiProgress(steps, segIdx, totalSteps, 0);
       // Fix C: SKILL template is system message, not user message
       var chainPrompt = seg.text;
       if (seg.overlapContext) chainPrompt = "[上文尾部参考，请勿重复输出此段]\n" + seg.overlapContext + NL + NL + chainPrompt;
      var _smParamPrefix = "[去AI味参数]\n文体类型: " + (cfg.textType || "novel") + "\n改写版本: " + (cfg.version || "v3") + "\n改写强度: " + (cfg.level || "medium") + "\n\n[以下为待处理文本]\n";
       chainPrompt = _smParamPrefix + chainPrompt;
       if (typeof DeAiSamples !== "undefined" && segIdx === 0) { try { chainPrompt += NL + NL + "[风格参考样本]\n" + DeAiSamples.getSampleText(); } catch(e){console.warn("[WARN] catch #15 renderer_v2.js",e);if(window.DiagLogger)DiagLogger.warn("catch","renderer_v2.js #15",e);} }
     var _smTemp = self._getDeAiTemperature(cfg.level || "medium", cfg.version || "v3", "rewrite");
      if (agentTemp === null) agentTemp = _smTemp;
      var sysContent = skillTemplate || agentSysPrompt || "你是专业的文本处理专家，请严格按照技能指令处理文本。只输出处理后的完整正文，不要输出任何说明或标记。";
             if (sysContent.indexOf("只输出") === -1) sysContent += "\n\n只输出处理后的完整正文，不要输出任何说明或标记。";
        var estOutputLen = Math.max(seg.text.length, 500);
       var _smVP2=null; try{_smVP2=ProviderManager.getVerifyProvider();}catch(e){}
       return self._aiRequest({
         baseUrl: _smVP2?_smVP2.baseUrl:undefined, apiKey: _smVP2?_smVP2.apiKey:undefined,
        messages: [{role:"system",content:sysContent},{role:"user",content:chainPrompt}],
          model: (function(){ try { var _vp=ProviderManager.getVerifyProvider(); if(_vp&&_vp.model) return _vp.model; }catch(e){} return self.settings.model || agentModel; })(),
        temperature: agentTemp,
          maxTokens: self._getAgentMaxTokens ? self._getAgentMaxTokens() : 128000,
          stream: true,
          signal: cancelController.signal,
          onChunk: function(partialText) {
            var received = (partialText || "").length;
            var ratio = estOutputLen > 0 ? Math.min(received / estOutputLen, 0.85) : 0;
            self._updateDeAiProgress(steps, segIdx, totalSteps, ratio);
          },
          onReasoning: function(rt) {
            var ratio = estOutputLen > 0 ? Math.min((rt||"").length / (estOutputLen * 2), 0.3) : 0;
            self._updateDeAiProgress(steps, segIdx, totalSteps, ratio);
            var se = document.getElementById("deai-progress-step");
            if (se) se.textContent = "段落 " + (segIdx+1) + "/" + totalSteps + " [AI思考中...]";
          }
        }).then(function(chainResult) {
          results[segIdx] = (chainResult && chainResult.text) ? chainResult.text : seg.text;
          steps[segIdx].status = "done";
          completed++;
          self._updateDeAiProgress(steps, segIdx, totalSteps, 1);
        }).catch(function(err) {
          console.error("[ERR] deAI segment " + (segIdx+1) + " failed: " + err.message);
          results[segIdx] = seg.text;
          steps[segIdx].status = "failed";
          completed++;
          self._updateDeAiProgress(steps, segIdx, totalSteps, 0);
        });
      });
    }

    // Concurrency limiter
    return new Promise(function(resolve) {
      var queue = [];
      for (var i = 0; i < segments.length; i++) queue.push(i);
      function schedule() {
        if (cancelled) { resolve(self._mergeSegments(results, segments)); return; }
        while (running < maxConcurrent && queue.length > 0) {
          var idx = queue.shift();
          running++;
          processSegment(idx).then(function() {
            running--;
            if (queue.length > 0 || running > 0) { schedule(); }
            else {
              // All done
              var finalText = self._mergeSegments(results, segments);
              self._hideDeAiProgress();
              resolve(finalText);
            }
          });
        }
      }
      schedule();
    });
  }

  _mergeSegments(results, segments) {
    if (!results || results.length === 0) return "";
    var finalText = results[0] || segments[0].text;
    for (var i = 1; i < results.length; i++) {
      finalText += segments[i].connector + (results[i] || segments[i].text);
    }
    return finalText;
  }

  renderDeAiSettings() {
    var self = this;

    // --- Populate skill selects for all 3 cards ---
    var skillSelectIds = ["deai-skill-select", "deai-skill-select-sm", "deai-skill-select-ms"];
    for (var si = 0; si < skillSelectIds.length; si++) {
      var sel = document.getElementById(skillSelectIds[si]);
      if (!sel) continue;
      sel = sel.cloneNode(true);
      document.getElementById(skillSelectIds[si]).parentNode.replaceChild(sel, document.getElementById(skillSelectIds[si]));
      sel = document.getElementById(skillSelectIds[si]);
      while (sel.firstChild) sel.removeChild(sel.firstChild);
      var opt = document.createElement("option");
      opt.value = ""; opt.textContent = "选择技能...";
      sel.appendChild(opt);
      try { var allSkills = SkillManager.getAll(); for (var j = 0; j < allSkills.length; j++) { var o = document.createElement("option"); o.value = allSkills[j].id; o.textContent = allSkills[j].name; sel.appendChild(o); } } catch(e){console.warn("[WARN] catch #16 renderer_v2.js",e);if(window.DiagLogger)DiagLogger.warn("catch","renderer_v2.js #16",e);}
    }

    // --- Populate agent selects for all 3 cards ---
    var agentSelectIds = ["deai-agent-select", "deai-agent-select-sm", "deai-agent-select-ms"];
    for (var ai = 0; ai < agentSelectIds.length; ai++) {
      var asel = document.getElementById(agentSelectIds[ai]);
      if (!asel) continue;
      asel = asel.cloneNode(true);
      document.getElementById(agentSelectIds[ai]).parentNode.replaceChild(asel, document.getElementById(agentSelectIds[ai]));
      asel = document.getElementById(agentSelectIds[ai]);
      while (asel.firstChild) asel.removeChild(asel.firstChild);
      var aopt = document.createElement("option");
      aopt.value = ""; aopt.textContent = "不使用智能体";
      asel.appendChild(aopt);
      try { var allAgents = AgentManager.getAll(); for (var k = 0; k < allAgents.length; k++) { var ao = document.createElement("option"); ao.value = allAgents[k].id; ao.textContent = allAgents[k].name; asel.appendChild(ao); } } catch(e){console.warn("[WARN] catch #17 renderer_v2.js",e);if(window.DiagLogger)DiagLogger.warn("catch","renderer_v2.js #17",e);}
      if (this._deAiConfig && this._deAiConfig.agentId) asel.value = this._deAiConfig.agentId;
      (function(aselect, selfRef) {
        aselect.addEventListener("change", function() {
          if (!selfRef._deAiConfig) selfRef._deAiConfig = {};
          selfRef._deAiConfig.agentId = aselect.value || null;
        });
      })(asel, self);
    }

    // --- Mode card click logic ---
    var cards = document.querySelectorAll(".deai-mode-card");
    var currentMode = (this._deAiConfig && this._deAiConfig.agentMode) ? this._deAiConfig.agentMode : "chain";
    for (var ci = 0; ci < cards.length; ci++) {
      (function(card) {
        card.addEventListener("click", function(e) {
          if (e.target.tagName === "SELECT" || e.target.tagName === "INPUT" || e.target.tagName === "BUTTON" || e.target.tagName === "OPTION") return;
          var mode = card.getAttribute("data-mode");
          self._selectDeAiMode(mode);
        });
      })(cards[ci]);
    }
    this._selectDeAiMode(currentMode);

    // --- Add skill button for chain and multi-step ---
    var addBtn = document.getElementById("btn-deai-add-skill");
    if (addBtn) {
      addBtn = addBtn.cloneNode(true);
      document.getElementById("btn-deai-add-skill").parentNode.replaceChild(addBtn, document.getElementById("btn-deai-add-skill"));
      document.getElementById("btn-deai-add-skill").addEventListener("click", function() {
        var sel = document.getElementById("deai-skill-select");
        if (sel && sel.value) {
          if (!self._deAiConfig) self._deAiConfig = {};
          if (!self._deAiConfig.skills) self._deAiConfig.skills = [];
          if (self._deAiConfig.skills.indexOf(sel.value) === -1) {
            self._deAiConfig.skills.push(sel.value);
            self._renderDeAiSkillList();
            self._updateFlowPreview();
            if (window.DiagLogger) DiagLogger.info("deai", "Skill added (chain): " + sel.value);
          }
        }
      });
    }
    var addBtnMs = document.getElementById("btn-deai-add-skill-ms");
    if (addBtnMs) {
      addBtnMs = addBtnMs.cloneNode(true);
      document.getElementById("btn-deai-add-skill-ms").parentNode.replaceChild(addBtnMs, document.getElementById("btn-deai-add-skill-ms"));
      document.getElementById("btn-deai-add-skill-ms").addEventListener("click", function() {
        var sel = document.getElementById("deai-skill-select-ms");
        if (sel && sel.value) {
          if (!self._deAiConfig) self._deAiConfig = {};
          if (!self._deAiConfig.skills) self._deAiConfig.skills = [];
          if (self._deAiConfig.skills.indexOf(sel.value) === -1) {
            self._deAiConfig.skills.push(sel.value);
            self._renderDeAiSkillList();
            self._updateFlowPreview();
            if (window.DiagLogger) DiagLogger.info("deai", "Skill added (multi-step): " + sel.value);
          }
        }
      });
    } else {
      if (window.DiagLogger) DiagLogger.error("deai", "btn-deai-add-skill-ms not found in DOM");
    }

    // --- Split size inputs ---
    var splitIds = [{id:"deai-split-size",card:"split-merge"},{id:"deai-split-size-ms",card:"multi-step"}];
    for (var spi = 0; spi < splitIds.length; spi++) {
      var splitEl = document.getElementById(splitIds[spi].id);
      if (splitEl) {
        splitEl = splitEl.cloneNode(true);
        document.getElementById(splitIds[spi].id).parentNode.replaceChild(splitEl, document.getElementById(splitIds[spi].id));
        splitEl = document.getElementById(splitIds[spi].id);
        splitEl.value = (this._deAiConfig && this._deAiConfig.splitSize) ? this._deAiConfig.splitSize : 1000;
        (function(inp, selfRef) {
          inp.addEventListener("change", function() {
            if (!selfRef._deAiConfig) selfRef._deAiConfig = {};
            var v = parseInt(inp.value) || 1000;
            if (v < 500) v = 500;
            if (v > 3000) v = 3000;
            inp.value = v;
            selfRef._deAiConfig.splitSize = v;
            selfRef._updateFlowPreview();
          });
        })(splitEl, self);
      }
    }

    // --- Hard rule toggle ---
    var hrToggle = document.getElementById("deai-hardrule-enabled");
    if (hrToggle) {
      hrToggle = hrToggle.cloneNode(true);
      document.getElementById("deai-hardrule-enabled").parentNode.replaceChild(hrToggle, document.getElementById("deai-hardrule-enabled"));
      hrToggle = document.getElementById("deai-hardrule-enabled");
      hrToggle.checked = this._deAiConfig ? this._deAiConfig.hardRulesEnabled : true;
      hrToggle.addEventListener("change", function() {
        if (!self._deAiConfig) self._deAiConfig = {};
        self._deAiConfig.hardRulesEnabled = hrToggle.checked;
        self._updateFlowPreview();
      });
    }

    // --- Level/Version/TextType radios ---
    this._renderDeAiSkillList();
    this._renderDeAiHardRules();
    var lvRadios = document.querySelectorAll('input[name="deai-level"]');
    for (var lri = 0; lri < lvRadios.length; lri++) {
      if (lvRadios[lri].value === (this._deAiConfig && this._deAiConfig.level ? this._deAiConfig.level : "medium")) lvRadios[lri].checked = true;
      (function(radio, selfRef) { radio.addEventListener("change", function() { selfRef._deAiConfig.level = radio.value; selfRef._updateFlowPreview(); }); })(lvRadios[lri], this);
    }
    var verRadios = document.querySelectorAll('input[name="deai-version"]');
    for (var vri = 0; vri < verRadios.length; vri++) {
      if (verRadios[vri].value === (this._deAiConfig && this._deAiConfig.version ? this._deAiConfig.version : "v3")) verRadios[vri].checked = true;
      (function(radio, selfRef) { radio.addEventListener("change", function() { selfRef._deAiConfig.version = radio.value; selfRef._updateFlowPreview(); }); })(verRadios[vri], this);
    }
    var ttSel = document.getElementById("deai-text-type");
    if (ttSel) {
      ttSel.value = (this._deAiConfig && this._deAiConfig.textType) ? this._deAiConfig.textType : "novel";
      ttSel.addEventListener("change", function() { self._deAiConfig.textType = ttSel.value; self._updateFlowPreview(); });
    }
    this._updateFlowPreview();
    this._updateVerifyProviderStatus();
  }

  _selectDeAiMode(mode) {
    if (!this._deAiConfig) this._deAiConfig = {};
    this._deAiConfig.agentMode = mode;
    if (window.DiagLogger) DiagLogger.info("deai", "Mode switched to: " + mode);
    var hidden = document.getElementById("deai-mode-select");
    if (hidden) hidden.value = mode;
    var cards = document.querySelectorAll(".deai-mode-card");
    for (var i = 0; i < cards.length; i++) {
      var cardMode = cards[i].getAttribute("data-mode");
      if (cardMode === mode) {
        cards[i].classList.add("active");
        var body = cards[i].querySelector(".deai-mode-card-body");
        if (body) body.style.display = "block";
      } else {
        cards[i].classList.remove("active");
        var body2 = cards[i].querySelector(".deai-mode-card-body");
        if (body2) body2.style.display = "none";
      }
    }
    this._updateFlowPreview();
  }

  _updateVerifyProviderStatus() {
    if (window.DiagLogger) DiagLogger.info("deai", "_updateVerifyProviderStatus called");
    var box = document.getElementById("deai-verify-provider-status");
    if (!box) return;
    var nameEl = document.getElementById("deai-verify-provider-name");
    var hintEl = document.getElementById("deai-verify-provider-hint");
    var vp = null;
    try { vp = ProviderManager.getVerifyProvider(); } catch(e){console.warn("[WARN] catch #18 renderer_v2.js",e);if(window.DiagLogger)DiagLogger.warn("catch","renderer_v2.js #18",e);}
    if (vp) {
      box.className = "deai-verify-status configured";
      box.querySelector(".deai-verify-icon").textContent = "[OK]";
      if (nameEl) nameEl.textContent = vp.name || "验证供应商";
      if (hintEl) hintEl.textContent = "去AI味时将用此供应商做跨模型语义审核（模型: " + (vp.model || "默认") + "）";
    } else {
      box.className = "deai-verify-status not-configured";
      box.querySelector(".deai-verify-icon").textContent = "[!]";
      if (nameEl) nameEl.textContent = "未配置验证供应商";
      if (hintEl) hintEl.textContent = "在设置-供应商中将任一供应商用途设为验证即可启用AI验证AI";
    }
  }

 _renderDeAiSkillList() {
    var container = document.getElementById("deai-skills-list");
    if (!container) return;
    while (container.firstChild) container.removeChild(container.firstChild);
    var containerMs = document.getElementById("deai-skills-list-ms");
    if (containerMs) { while (containerMs.firstChild) containerMs.removeChild(containerMs.firstChild); }
    var skills = (this._deAiConfig && this._deAiConfig.skills) ? this._deAiConfig.skills : [];
    var self = this;
    for (var i = 0; i < skills.length; i++) {
      var skName = skills[i];
      try { var s = SkillManager.get(skills[i]); if (s) skName = s.name; } catch(e){console.warn("[WARN] catch #19 renderer_v2.js",e);if(window.DiagLogger)DiagLogger.warn("catch","renderer_v2.js #19",e);}
      var chip = document.createElement("div");
      chip.className = "deai-skill-chip";
      var span = document.createElement("span");
      span.textContent = (i+1) + ". " + skName;
      var btn = document.createElement("button");
      btn.className = "deai-skill-remove";
      btn.textContent = "×";
      btn.setAttribute("data-idx", String(i));
      (function(idx) { btn.addEventListener("click", function() { self._deAiConfig.skills.splice(idx, 1); self._renderDeAiSkillList(); self._updateFlowPreview(); if (window.DiagLogger) DiagLogger.info("deai", "Skill removed at idx=" + idx); }); })(i);
      chip.appendChild(span);
      chip.appendChild(btn);
      container.appendChild(chip);
      if (containerMs) {
        var chipMs = chip.cloneNode(true);
        var btnMs = chipMs.querySelector(".deai-skill-remove");
        if (btnMs) {
          (function(idx2) { btnMs.addEventListener("click", function() { self._deAiConfig.skills.splice(idx2, 1); self._renderDeAiSkillList(); self._updateFlowPreview(); }); })(i);
        }
        containerMs.appendChild(chipMs);
      }
    }
    if (window.DiagLogger) DiagLogger.info("deai", "Skill list rendered: " + skills.length + " skills");
  }
 
  // New methods to add to renderer_v2.js for hard rule visualization
  _renderDeAiHardRules() {
    var container = document.getElementById("deai-hardrules-list");
    if (!container) return;
    while (container.firstChild) container.removeChild(container.firstChild);
    container.style.display = "block";
    var rules = [];
    try { rules = DeAiProcessor.getHardRules(); } catch(e) { console.warn("[WARN] getHardRules", e); return; }
    var self = this;
    if (!this._deAiConfig.hardRules) this._deAiConfig.hardRules = {};
    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      var label = document.createElement("label");
      label.className = "deai-hardrule-item";
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = self._deAiConfig.hardRules[rule.id] !== false;
      cb.setAttribute("data-rule-id", rule.id);
      (function(rid) {
        cb.addEventListener("change", function() {
          self._deAiConfig.hardRules[rid] = cb.checked;
        });
      })(rule.id);
      var text = document.createElement("span");
      text.textContent = rule.name;
      label.appendChild(cb);
      label.appendChild(text);
      container.appendChild(label);
    }
  }
 
  _addDeAiSkill() {
    var skillSelect = document.getElementById("deai-skill-select");
    if (!skillSelect || !skillSelect.value) { this._toast("请先选择技能", "error"); return; }
    if (!this._deAiConfig.skills) this._deAiConfig.skills = [];
    if (this._deAiConfig.skills.indexOf(skillSelect.value) !== -1) { this._toast("该技能已添加", "warn"); return; }
    this._deAiConfig.skills.push(skillSelect.value);
    this._renderDeAiSkillList();
    this._updateFlowPreview();
    this._toast("技能已添加", "success");
  }
 
  _saveDeAiConfig() {
    var agentSelect = document.getElementById("deai-agent-select");
    var hrToggle = document.getElementById("deai-hardrule-enabled");
    if (agentSelect) this._deAiConfig.agentId = agentSelect.value || null;
    if (hrToggle) this._deAiConfig.hardRulesEnabled = hrToggle.checked;
    var modeSelect2 = document.getElementById("deai-mode-select");
    if (modeSelect2) this._deAiConfig.agentMode = modeSelect2.value;
    var splitInput2 = document.getElementById("deai-split-size");
   if (splitInput2) this._deAiConfig.splitSize = parseInt(splitInput2.value) || 1000;
    var lvR = document.querySelectorAll('input[name="deai-level"]');
    for (var li2 = 0; li2 < lvR.length; li2++) { if (lvR[li2].checked) this._deAiConfig.level = lvR[li2].value; }
    var verR = document.querySelectorAll('input[name="deai-version"]');
    for (var vi2 = 0; vi2 < verR.length; vi2++) { if (verR[vi2].checked) this._deAiConfig.version = verR[vi2].value; }
    var ttS = document.getElementById("deai-text-type");
    if (ttS) this._deAiConfig.textType = ttS.value;
   StorageManager.set("app-deai-config", this._deAiConfig);
   this._toast("去AI味设置已保存", "success");
 }

 _getDeAiTemperature(level, version, stage) {
   var tempMap = { light: 0.4, medium: 0.7, heavy: 1.0 };
   var t = tempMap[level] || 0.7;
   if (version === "v2") t = t * 0.7;
   // Stage-based temperature: split/verify=low precision, rewrite=high creativity
   if (stage === "split" || stage === "verify") t = Math.min(t, 0.3);
   if (stage === "rewrite" || stage === "perspective") t = Math.max(t, 0.6);
   return t;
 }

  _updateFlowPreview() {
    var el = document.getElementById("deai-flow-preview");
    if (!el) return;
    var cfg = this._deAiConfig || {};
    var level = cfg.level || "medium";
    var version = cfg.version || "v3";
    var mode = cfg.agentMode || "chain";
    var hr = cfg.hardRulesEnabled !== false;
    var skillCount = (cfg.skills && cfg.skills.length) ? cfg.skills.length : 0;
    var editor = document.getElementById("editor-content");
    var textLen = editor ? editor.value.length : 0;
    var splitSize = cfg.splitSize || 1000;
    var temp = this._getDeAiTemperature(level, version);
   var _hasVP = false; try { _hasVP = !!ProviderManager.getVerifyProvider(); } catch(eVp2){console.warn("[WARN] catch #20 renderer_v2.js",eVp2);if(window.DiagLogger)DiagLogger.warn("catch","renderer_v2.js #20",eVp2);}
   var steps = [];
   if (mode === "split-merge") {
      var segs = Math.max(1, Math.ceil(textLen / splitSize));
      steps.push("切分文章(" + segs + "段)");
      steps.push("并行重述(" + level + ", temp=" + temp.toFixed(2) + ")");
      if (_hasVP) steps.push("AI验证AI(跨模型审核)");
      steps.push("合并");
      if (skillCount > 0) steps.push("SKILL验证(" + skillCount + "个)");
    } else if (mode === "multi-step") {
      var msegs = Math.max(1, Math.ceil(textLen / splitSize));
      steps.push("切分文章(" + msegs + "段)");
      steps.push("事件核提取");
      steps.push("视角偏转");
      steps.push("重组输出");
      if (_hasVP) steps.push("AI验证AI(跨模型审核)");
      if (skillCount > 0) steps.push("S2验证(" + skillCount + "个SKILL)");
      if (hr) steps.push("硬规则安全网");
  } else {
     // Chain mode: S1 -> hardrule -> S2 -> hardrule-post (Fix D)
     for (var i = 0; i < skillCount; i++) {
       var sTemp = (i === skillCount - 1) ? this._getDeAiTemperature(level, version, "verify") : temp;
       steps.push("SKILL" + (i+1) + "(" + (i === 0 ? "改写" : "验证") + ", temp=" + sTemp.toFixed(2) + ")");
       if (i === 0 && _hasVP) steps.push("AI验证AI(跨模型审核)");
       if (hr && i === 0 && skillCount > 1) steps.push("硬规则清洗");
     }
     if (hr) steps.push("硬规则安全网");
   }
    steps.push("完成");
    var estTime = 0.5;
    if (mode === "split-merge") {
      var segs2 = Math.max(1, Math.ceil(textLen / splitSize));
      estTime = 0.5 + 0.5 + Math.ceil(segs2 / 3) * 4 + 0.5 + (skillCount > 0 ? 3.5 : 0) + (_hasVP ? 3 : 0);
    } else if (mode === "multi-step") {
      var msegs2 = Math.max(1, Math.ceil(textLen / splitSize));
      estTime = 0.5 + Math.ceil(msegs2 / 2) * 6 + (skillCount > 0 ? 4 : 0) + (hr ? 0.5 : 0) + (_hasVP ? 3 : 0);
    } else {
      estTime = 0.5 + skillCount * 4 + (hr ? 0.5 : 0) + (_hasVP ? 3 : 0);
    }
    if (version === "v2") estTime *= 0.8;
    var html = steps.map(function(s, idx) {
      if (idx === steps.length - 1) return '<span class="deai-flow-step">' + s + '</span>';
      return '<span class="deai-flow-step">' + s + '</span><span class="deai-flow-arrow">→</span>';
    }).join("");
   html += '<br>预计耗时: <span class="deai-flow-time">约 ' + Math.round(estTime) + ' 秒</span>';
   html += ' | 强度: ' + level + ' | 版本: ' + version + ' | 温度: ' + temp.toFixed(2);
   var _curModel = this.settings.model || this._getSelectedModel() || '未选择';
   html += ' | 模型: <span class="deai-flow-model">' + this._escHtml(_curModel) + '</span>';
    el.innerHTML = html;
  }
fillSettingsForm() {
    // Reset provider views: show list, hide edit (prevents stale state from previous session)
    var _lv = document.getElementById('provider-list-view');
    var _ev = document.getElementById('provider-edit-view');
    if (_lv) _lv.style.display = '';
    if (_ev) { _ev.style.display = 'none'; _ev.classList.add('modal-hidden'); }
    this.renderProfileList();
     // Fill edit form with current active provider data (for when user opens edit view)
     var baseUrlEl = document.getElementById('cfg-base-url');
     var apiKeyEl = document.getElementById('cfg-api-key');
     var streamEl = document.getElementById('cfg-stream-mode');
     var spEl = document.getElementById('cfg-system-prompt');
     var tempEl = document.getElementById('cfg-temperature');
     var mtEl = document.getElementById('cfg-max-tokens');
     if (baseUrlEl) baseUrlEl.value = this.settings.baseUrl || '';
     if (apiKeyEl) apiKeyEl.value = this.settings.apiKey || '';
     if (streamEl) streamEl.checked = this.settings.streamMode !== false;
     if (spEl) spEl.value = this.settings.systemPrompt || '';
     if (tempEl) { tempEl.value = this.settings.temperature != null ? this.settings.temperature : 0.7; var tv = document.getElementById('cfg-temperature-val'); if (tv) tv.textContent = tempEl.value; }
     if (mtEl) mtEl.value = this.settings.maxTokens ;
     // Render model list for current provider
     var curModels = [];
     if (this.currentProviderId) { var cp = ProviderManager.get(this.currentProviderId); if (cp) curModels = cp.models || []; }
     this.renderProviderModelList(curModels, this.settings.model);
   }

  renderProfileList() {
     var container = document.getElementById("provider-card-list");
     if (!container) return;
     var profiles = ProviderManager.listProfiles();
     if (profiles.length === 0) {
       container.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:8px">\u8fd8\u6ca1\u6709\u4f9b\u5e94\u5546\uff0c\u70b9\u51fb\u4e0b\u65b9 + \u6dfb\u52a0</div>';
       // Show + card
       var addCard = document.createElement('div');
       addCard.className = 'provider-card provider-card-add';
       addCard.innerHTML = '+';
       addCard.title = '\u6dfb\u52a0\u4f9b\u5e94\u5546';
       var self0 = this;
       addCard.onclick = function() { self0.enterProviderEdit(null); };
       container.appendChild(addCard);
       return;
     }
     var self = this;
     container.innerHTML = '';
     profiles.forEach(function(p) {
       var card = document.createElement('div');
       card.className = p.active ? 'provider-card provider-card-active' : 'provider-card';
       // Extract domain from baseUrl
       var domain = p.baseUrl || '';
       try { domain = new URL(p.baseUrl).hostname; } catch(e) { console.warn("[WARN]", e); }
       var badge = p.active ? '<span class="provider-badge provider-badge-on">\u4f7f\u7528\u4e2d</span>' : '<span class="provider-badge provider-badge-off">\u9759\u9ed8</span>';
       // Bug fix: verify/detect providers show ready badge instead of silent
       if (!p.active && p.purpose && (p.purpose === 'verify' || p.purpose === 'detect')) {
         badge = '<span class="provider-badge provider-badge-on">已就绪</span>';
       }
       card.innerHTML = '<div class="provider-card-header">' +
         '<span class="provider-card-name">' + self._escHtml(p.name) + '</span>' +
         badge +
         '</div>' +
         '<div class="provider-card-url">' + self._escHtml(domain) + '</div>' +
         '<div class="provider-card-models">' + p.modelCount + ' \u4e2a\u6a21\u578b</div>' +
          (p.purpose && p.purpose !== 'generate' ? '<span class="provider-badge provider-badge-purpose">' + (p.purpose === 'verify' ? '\u9a8c\u8bc1' : '\u68c0\u6d4b') + '</span>' : '') +
         '<button class="provider-card-edit" title="\u7f16\u8f91">\u270e</button>';
        card.onclick = function(e) {
          if (e.target.classList.contains('provider-card-edit')) return;
          // Bug fix: verify/detect providers don't call quickSwitch — they coexist with generate provider
          var _pInfo = ProviderManager.get(p.id);
          if (_pInfo && (_pInfo.purpose === 'verify' || _pInfo.purpose === 'detect')) {
            // Just refresh deAI verify status, don't change active generate provider
            self._updateVerifyProviderStatus();
            if (window.DiagLogger) DiagLogger.info('provider', 'Verify/detect provider clicked, not switching active: ' + (_pInfo.name||''));
            self._toast((_pInfo.purpose === 'verify' ? '验证' : '检测') + '供应商已就绪，不影响生成供应商', 'info');
            return;
          }
          var result = ProviderManager.quickSwitch(p.id);
          if (result && result.provider) {
           self.currentProviderId = p.id;
           self.settings.providerId = p.id;
           self.settings.baseUrl = result.provider.baseUrl || '';
           self.settings.apiKey = result.provider.apiKey || '';
           // Bug B fix: keep user's selected model if it exists in new provider, otherwise pick first
           var _newModels = result.provider.models || [];
           var _curModel = self.settings.model || '';
           var _modelExists = _curModel && _newModels.indexOf(_curModel) >= 0;
           if (result.model && !self.settings.model) {
             self.settings.model = result.model;
           } else if (!_modelExists && _newModels.length > 0) {
             // current model not in new provider, pick first available
             self.settings.model = _newModels[0];
           }
           // if _modelExists is true, keep self.settings.model as-is (user's choice preserved)
         self.saveSettings();
         self.renderProfileList();
         self.populateModelSelect();
         self.updateUIState();
            self.renderSkillArea();
            if (typeof self._updateFlowPreview === 'function') self._updateFlowPreview();
            if (window.DiagLogger) DiagLogger.info('provider', 'quickSwitch to ' + (result.provider.name||'') + ', model=' + self.settings.model);
            self._updateVerifyProviderStatus();
            }
        };
       card.querySelector('.provider-card-edit').onclick = function(e) {
         e.stopPropagation();
         self.enterProviderEdit(p.id);
       };
       container.appendChild(card);
     });
     // Add "+" card at the end
     var addCard = document.createElement('div');
     addCard.className = 'provider-card provider-card-add';
     addCard.innerHTML = '+';
     addCard.title = '\u6dfb\u52a0\u4f9b\u5e94\u5546';
     addCard.onclick = function() { self.enterProviderEdit(null); };
     container.appendChild(addCard);
   }
 
   enterProviderEdit(providerId) {
     var listView = document.getElementById('provider-list-view');
     var editView = document.getElementById('provider-edit-view');
     if (listView) listView.style.display = 'none';
     if (editView) { editView.style.display = ''; editView.classList.remove('modal-hidden'); }
     this._editingProviderId = providerId;
     this._formDirty = false;
     var titleEl = document.getElementById('provider-edit-title');
     if (providerId) {
       var p = ProviderManager.get(providerId);
       if (p) {
         if (titleEl) titleEl.textContent = '\u7f16\u8f91: ' + p.name;
         var nameEl = document.getElementById('cfg-provider-name'); if (nameEl) nameEl.value = p.name || '';
         var urlEl = document.getElementById('cfg-base-url'); if (urlEl) urlEl.value = p.baseUrl || '';
         var keyEl = document.getElementById('cfg-api-key'); if (keyEl) keyEl.value = p.apiKey || '';
         var streamEl = document.getElementById('cfg-stream-mode'); if (streamEl) streamEl.checked = (p.streamMode !== false);
         var tempEl = document.getElementById('cfg-temperature'); if (tempEl) { tempEl.value = p.temperature != null ? p.temperature : 0.7; var tempVal = document.getElementById('cfg-temperature-val'); if (tempVal) tempVal.textContent = tempEl.value; }
         var mtEl = document.getElementById('cfg-max-tokens'); if (mtEl) mtEl.value = p.maxTokens ;
         var ppEl = document.getElementById('cfg-provider-purpose'); if (ppEl) ppEl.value = p.purpose || 'generate';
         var spEl = document.getElementById('cfg-system-prompt'); if (spEl) spEl.value = p.systemPrompt || '';
         this.renderProviderModelList(p.models || [], this.settings.model);
         var connEl = document.getElementById('provider-conn-status');
         if (connEl) connEl.textContent = p.id === this.currentProviderId ? '\u5f53\u524d\u542f\u7528\u4e2d' : '\u672a\u542f\u7528';
       }
     } else {
       if (titleEl) titleEl.textContent = '\u65b0\u589e\u4f9b\u5e94\u5546';
       var nameEl2 = document.getElementById('cfg-provider-name'); if (nameEl2) nameEl2.value = '';
       var urlEl2 = document.getElementById('cfg-base-url'); if (urlEl2) urlEl2.value = '';
       var keyEl2 = document.getElementById('cfg-api-key'); if (keyEl2) keyEl2.value = '';
       var streamEl2 = document.getElementById('cfg-stream-mode'); if (streamEl2) streamEl2.checked = true;
       var tempEl2 = document.getElementById('cfg-temperature'); if (tempEl2) { tempEl2.value = 0.7; var tempVal2 = document.getElementById('cfg-temperature-val'); if (tempVal2) tempVal2.textContent = '0.7'; }
       var mtEl2 = document.getElementById('cfg-max-tokens'); if (mtEl2) mtEl2.value = "";
       var ppEl2 = document.getElementById('cfg-provider-purpose'); if (ppEl2) ppEl2.value = 'generate';
       var spEl2 = document.getElementById('cfg-system-prompt'); if (spEl2) spEl2.value = '';
       this.renderProviderModelList([], '');
       var connEl2 = document.getElementById('provider-conn-status'); if (connEl2) connEl2.textContent = '';
     }
   }
 
  async exitProviderEdit() {
     if (this._formDirty) {
      if (!(await this._confirm('有未保存的修改，是否放弃修改？'))) return;
     }
     var listView = document.getElementById('provider-list-view');
     var editView = document.getElementById('provider-edit-view');
     if (listView) listView.style.display = '';
     if (editView) { editView.style.display = 'none'; editView.classList.add('modal-hidden'); }
     this._editingProviderId = null;
     this._formDirty = false;
     this.renderProfileList();
   }
 
   renderProviderModelList(models, activeModel) {
     var container = document.getElementById('provider-model-list');
     if (!container) return;
     container.innerHTML = '';
     if (!models || models.length === 0) {
       container.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:8px">\u70b9\u51fb\u4e0a\u65b9\u201c\u83b7\u53d6\u6a21\u578b\u5217\u8868\u201d\u6309\u94ae</div>';
       return;
     }
     var self = this;
     models.forEach(function(m) {
       var item = document.createElement('div');
       item.className = m === activeModel ? 'provider-model-item provider-model-active' : 'provider-model-item';
       item.innerHTML = '<span class="provider-model-name">' + self._escHtml(m) + '</span>' +
         (m === activeModel ? '<span class="provider-badge provider-badge-on">\u542f\u7528\u4e2d</span>' : '<button class="btn-sm btn-secondary provider-model-enable">\u542f\u7528</button>');
       if (m !== activeModel) {
         item.querySelector('.provider-model-enable').onclick = function() {
           self.activateProviderModel(m);
         };
       }
       container.appendChild(item);
     });
   }
 
   activateProviderModel(modelId) {
     this.settings.model = modelId;
     this.saveSettings();
     var models = [];
     if (this._editingProviderId) {
       var p = ProviderManager.get(this._editingProviderId);
       if (p) models = p.models || [];
     }
     this.renderProviderModelList(models, modelId);
     this.populateModelSelect();
     this.updateUIState();
   }

 updateUIState() {
   var hint = document.querySelector(".input-hint");
    // 更新状态栏
    var connEl = document.getElementById("status-connection");
    var modelEl = document.getElementById("status-model");
    var wordsEl = document.getElementById("status-words");
   if (this.isConfigured) {
    // hint.textContent moved to config-status span
    var cs = document.getElementById("config-status");
    if (cs) cs.textContent = "已配置: " + this.settings.model + " | Base: " + this.settings.baseUrl;
    hint.classList.add("configured");
     if (connEl) { connEl.textContent = "[OK] 已连接"; connEl.className = "connected"; }
     if (modelEl) modelEl.textContent = this.settings.model || "";
  } else {
    // hint.textContent moved to config-status span
    var cs2 = document.getElementById("config-status");
    if (cs2) cs2.textContent = "未配置 API | 请在设置中进行配置";
    hint.classList.remove("configured");
     if (connEl) { connEl.textContent = "[ERR] 未连接"; connEl.className = "disconnected"; }
     if (modelEl) modelEl.textContent = "";
  }
    if (wordsEl) wordsEl.textContent = "字数: " + this._getWordCount();
 }

  _updateCursorPos() {
    var cursorEl = document.getElementById("status-cursor");
    if (!cursorEl) return;
    var editor = document.getElementById("editor-content");
    if (!editor || editor.disabled) { cursorEl.textContent = ""; return; }
    var pos = editor.selectionStart;
    var text = editor.value.substring(0, pos);
    var lines = text.split("\n");
    cursorEl.textContent = "行 " + lines.length + ", 列 " + (lines[lines.length - 1].length + 1);
  }

toggleSettings(show) {
  var modal = document.getElementById("settings-modal");
  if (show) {
    // Modal mutex: fully close plugin market before opening settings
    var _pmm = document.getElementById("plugin-market-modal");
    if (_pmm) { _pmm.classList.remove("visible"); _pmm.classList.add("modal-hidden"); }
    modal.classList.remove("modal-hidden");
    modal.classList.add("visible");
    this.fillSettingsForm();
    this.switchTab("api");
    this.setSidebarActive("btn-settings");
   } else {
     modal.classList.remove("visible");
     modal.classList.add("modal-hidden");
     this.setSidebarActive(null);
   }

  }

  toggleApiKeyVisibility() {
    var inp = document.getElementById("cfg-api-key");
    var btn = document.getElementById("btn-toggle-key");
      if (inp.type === "password") { inp.type = "text"; btn.textContent = "隐藏"; }
      else { inp.type = "password"; btn.textContent = "显示"; }
  }

 async saveSettingsFromForm() {
     var self = this;
     var providerId = this._editingProviderId;
     var providerName = document.getElementById('cfg-provider-name') ? document.getElementById('cfg-provider-name').value.trim() : '';
     var baseUrl = document.getElementById('cfg-base-url').value.trim().replace(/\/+$/, '');
     var apiKey = document.getElementById('cfg-api-key').value.trim();
     var streamMode = document.getElementById('cfg-stream-mode') ? document.getElementById('cfg-stream-mode').checked : true;
     var temperature = parseFloat(document.getElementById('cfg-temperature') ? document.getElementById('cfg-temperature').value : '0.7');
     var maxTokens = parseInt(document.getElementById('cfg-max-tokens') ? document.getElementById('cfg-max-tokens').value : '128000', 10);
     var systemPrompt = document.getElementById('cfg-system-prompt') ? document.getElementById('cfg-system-prompt').value.trim() : '';
      var providerPurpose = document.getElementById('cfg-provider-purpose') ? document.getElementById('cfg-provider-purpose').value : 'generate';
 
     if (!providerName) { this._toast('\u4f9b\u5e94\u5546\u540d\u79f0\u4e0d\u80fd\u4e3a\u7a7a', 'error'); return; }
     if (!baseUrl) { this._toast('\u63a5\u53e3\u5730\u5740\u4e0d\u80fd\u4e3a\u7a7a', 'error'); return; }
     if (!apiKey) { this._toast('API\u5bc6\u94a5\u4e0d\u80fd\u4e3a\u7a7a', 'error'); return; }
 
     // Get models from current provider data (fetched models are stored in provider)
     var models = [];
     if (providerId) { var p = ProviderManager.get(providerId); if (p) models = p.models || []; }
 
     if (providerId) {
       // Update existing provider
       ProviderManager.update(providerId, {
         name: providerName, baseUrl: baseUrl, apiKey: apiKey, models: models,
          streamMode: streamMode, temperature: temperature, maxTokens: maxTokens, systemPrompt: systemPrompt,
          purpose: providerPurpose
       });
     } else {
       // Create new provider
       var newP = ProviderManager.add({
         name: providerName, baseUrl: baseUrl, apiKey: apiKey, models: models,
          streamMode: streamMode, temperature: temperature, maxTokens: maxTokens, systemPrompt: systemPrompt,
          purpose: providerPurpose
       });
       providerId = newP.id;
       this.currentProviderId = providerId;
     }
 
      // If this is the active provider, sync to this.settings
      var activeId = ProviderManager.getActiveProfile();
      // Bug fix: don't sync verify/detect provider settings to this.settings (generate config)
      var _savedPurpose = providerPurpose;
     if (_savedPurpose !== 'verify' && _savedPurpose !== 'detect' && (!activeId || providerId === activeId || providerId === this.currentProviderId)) {
       this.settings.providerId = providerId;
       this.settings.baseUrl = baseUrl;
      this.settings.apiKey = apiKey;
      this.settings.streamMode = streamMode;
      this.settings.temperature = temperature;
      this.settings.maxTokens = maxTokens;
      this.settings.systemPrompt = systemPrompt;
      if (models.length > 0 && !this.settings.model) this.settings.model = models[0];
      this.saveSettings();
     }

    // Always refresh model dropdown and UI after save (Bug fix: verify provider save also needs to refresh)
    this.populateModelSelect();
    this.updateUIState();
    this.renderSkillArea();

     // Always refresh verify provider status after save
     this._formDirty = false;
      this._toast('\u4fdd\u5b58\u6210\u529f', 'success');
      this.exitProviderEdit();
      this._updateVerifyProviderStatus();
     if (window.DiagLogger) DiagLogger.info('provider', 'Provider saved, deAI status refreshed');
   }

  async fetchModelList() {
    var self = this;
    var baseUrl = document.getElementById('cfg-base-url').value.trim().replace(/\/+$/, '');
    var apiKey = document.getElementById('cfg-api-key').value.trim();
    var btn = document.getElementById('btn-fetch-models');
    if (!baseUrl || !apiKey) { this._toast('请填写 Base URL 和 API Key', 'error'); return; }
    if (btn) { btn.textContent = '获取中...'; btn.disabled = true; }
     try {
        var result = await window.electronAPI.fetchModels(baseUrl, apiKey);
        if (result && result.ok) {
          var data = result.data;
          var models = data.data || [];
          var modelIds = models.map(function(m) { return m.id; });
        if (this._editingProviderId) {
          try { ProviderManager.update(this._editingProviderId, { models: modelIds }); } catch(e) {}
        }
        this.renderProviderModelList(modelIds, this.settings.model);
        var datalist = document.getElementById('model-datalist');
        if (datalist) {
          datalist.innerHTML = '';
          modelIds.forEach(function(m) { datalist.innerHTML += '<option value="' + self._escHtml(m) + '">'; });
        }
        this.populateModelSelect();
        this._toast('获取成功，共 ' + modelIds.length + ' 个模型', 'success');
      } else {
        var errMsg = result ? (result.error || ('HTTP ' + (result.status || 'unknown'))) : 'no result';
        this._toast('获取失败: ' + errMsg, 'error');
      }
    } catch (err) {
      this._toast('请求失败: ' + err.message, 'error');
    }
    if (btn) { btn.textContent = '获取模型列表'; btn.disabled = false; }
    this._formDirty = true;
  }


  async testConnection() {
    var baseUrl = document.getElementById("cfg-base-url").value.trim().replace(/\/+$/, "");
    var apiKey = document.getElementById("cfg-api-key").value.trim();
    var btn = document.getElementById("btn-test-connection");
      if (!baseUrl || !apiKey) { this._toast("请填写 Base URL 和 API Key", "error"); return; }
      this._showLoading("测试连接中..."); this._setBtnLoading(btn, true);
      btn.textContent = "测试中..."; btn.disabled = true;
    var controller = new AbortController();
    var timeout = setTimeout(function() { controller.abort(); }, 10000);
    try {
        var result = await window.electronAPI.fetchModels(baseUrl, apiKey);
        if (result && result.ok) {
          var data = result.data;
          var models = data.data || [];
          var modelIds = models.map(function(m) { return m.id; });
          if (this._editingProviderId) { try { ProviderManager.update(this._editingProviderId, { models: modelIds }); } catch(e){} }
          this.renderProviderModelList(modelIds, this.settings.model);
         var datalist = document.getElementById('model-datalist');
          if (datalist) { datalist.innerHTML = ''; modelIds.forEach(function(m) { datalist.innerHTML += '<option value="' + self._escHtml(m) + '">'; }); }
          this._toast('获取成功，共 ' + modelIds.length + ' 个模型', 'success');
        } else {
          var errMsg = result ? (result.error || ('HTTP ' + (result.status || 'unknown'))) : 'no result';
          this._toast('获取失败: ' + errMsg, 'error');
        }
      } catch (err) {
        if (err.name === 'TimeoutError' || err.name === 'AbortError') { this._toast('请求超时，请检查网络', 'error'); }
        else { this._toast('请求失败: ' + err.message, 'error'); }
      }
     if (btn) { btn.textContent = '获取模型列表'; btn.disabled = false; }
     this._formDirty = true;
   }

 async sendMessage() {
    var text = document.getElementById("user-input").value.trim();
    if (!text) return;
    if (this.isStreaming) {
      // 流式中点击发送按钮=中止生成
      if (this.abortController) { try { this.abortController.abort(); } catch(e){console.warn("[WARN] catch #21 renderer_v2.js",e);if(window.DiagLogger)DiagLogger.warn("catch","renderer_v2.js #21",e);} }
      return;
    }
      if (!this.isConfigured) { this._toast(this.getConfigError() || "请先配置API设置", "error"); return; }
    this._showLoading("发送中...");
    document.getElementById("user-input").value = "";
    this.autoResizeInput();
    this.setStreaming(true);
    this.addMessage("user", text);
    var aiMsg = this.addMessage("ai", "", true);
   try { await this.streamChat(text, aiMsg); }
   catch (err) {
      aiMsg.el.classList.add("msg-error");
      aiMsg.el.querySelector('.message-content').textContent = "[ERR] " + err.message;
     aiMsg.el.classList.remove("streaming-cursor");
      if (err.name === "AbortError" || err.message.indexOf("Failed to fetch") !== -1 || err.message.indexOf("NetworkError") !== -1 || err.message.indexOf("network") !== -1) {
        this._toast("网络连接异常，请检查网络后重试", "error");
      } else if (err.message.indexOf("请求太频繁") !== -1 || err.message.indexOf("429") !== -1) {
        this._toast("请求过于频繁，请稍后重试", "error");
      } else if (err.message.indexOf("服务器内部错误") !== -1 || err.message.indexOf("500") !== -1) {
        this._toast("服务器错误，请稍后重试", "error");
      } else {
        this._toast("发送失败: " + err.message, "error");
      }
   }
    this.setStreaming(false);
    this._hideLoading();
   var sendBtn = document.getElementById("btn-send");
   if (sendBtn) sendBtn.disabled = false;
 }

  /**
   * _looksLikeJSON — 检测文本是否为JSON格式（过滤层智能跳过）
   */
  _looksLikeJSON(text) {
    if (!text || typeof text !== "string") return false;
    var t = text.trim();
    if (t.length === 0) return false;
    return t.charAt(0) === "[" || t.charAt(0) === "{";
  }

  /**
   * _applyTextFilter — 确定性文本过滤层
   * 不依赖模型语义理解，纯字符级强制修正，对抗模型生成惯性
   * 规则1：段落开头句号改逗号（段落开头后第一个句号，句号前文本≤30字）
   * 规则2：碎片短句合并（50字窗口内≥3个句号，句间文本≤15字，合并第一个句号）
   */
  _applyTextFilter(text, filterWords) {
    if (!text || typeof text !== "string" || text.length === 0) return text;
    var _aiWords = filterWords || ["值得注意的是", "此外", "与此同时", "由此可见", "综上所述", "总体而言", "从某种程度来说", "进行了", "做出了", "存在着", "发生了", "产生了", "形成了", "极大的", "显著的", "深刻的", "充分的", "有效的"];
    if (_aiWords.length > 0) {
      var beforeLen = text.length;
      for (var awi = 0; awi < _aiWords.length; awi++) {
        var aw = _aiWords[awi];
        while (text.indexOf(aw) >= 0) {
          text = text.replace(aw, "");
        }
      }
      if (text.length !== beforeLen) {
        console.log("[FILTER] AI words filtered: " + beforeLen + " -> " + text.length + " chars");
      }
    }
    var result = text;

    // --- 规则1：段落开头句号改逗号 ---
    var lines = result.split("\n");
    for (var li = 0; li < lines.length; li++) {
      var line = lines[li];
      var trimmedLine = line.trim();
      if (trimmedLine.length === 0) continue;
      if (/^[=─━═\-]{3,}$/.test(trimmedLine)) continue;

      var firstPeriodIdx = -1;
      for (var ci = 0; ci < line.length; ci++) {
        if (line.charAt(ci) === "。" || line.charAt(ci) === ".") {
          firstPeriodIdx = ci;
          break;
        }
      }
      if (firstPeriodIdx === -1) continue;

      var beforePeriod = line.substring(0, firstPeriodIdx).trim();
      if (beforePeriod.length > 0 && beforePeriod.length <= 30) {
        line = line.substring(0, firstPeriodIdx) + "，" + line.substring(firstPeriodIdx + 1);
        lines[li] = line;
      }
    }
    result = lines.join("\n");

    // --- 规则2：碎片短句合并 ---
    var periods = [];
    for (var pi = 0; pi < result.length; pi++) {
      if (result.charAt(pi) === "。" || result.charAt(pi) === ".") {
        periods.push(pi);
      }
    }
    if (periods.length >= 3) {
      var merged = result;
      var offset = 0;
     for (var pi2 = 0; pi2 < periods.length - 2; pi2++) {
       var p1 = periods[pi2] + offset;
       var p2 = periods[pi2 + 1] + offset;
       var p3 = periods[pi2 + 2] + offset;
       if (p3 - p1 <= 50) {
         var seg1 = merged.substring(p1 + 1, p2).trim();
         var seg2 = merged.substring(p2 + 1, p3).trim();
         if (seg1.length <= 15 && seg2.length <= 15) {
           // Also check text BEFORE p1: find previous period or newline or start
           var seg0Start = 0;
           if (pi2 > 0) { seg0Start = periods[pi2 - 1] + offset + 1; }
           // Check for newline before p1 within current line
           var lineStart = merged.lastIndexOf("\n", p1);
           if (lineStart >= 0 && lineStart + 1 > seg0Start) { seg0Start = lineStart + 1; }
           var seg0 = merged.substring(seg0Start, p1).trim();
           if (seg0.length <= 15) {
            merged = merged.substring(0, p1) + "，" + merged.substring(p1 + 1);
           }
         }
       }
     }
      result = merged;
    }

    console.log("[FILTER] Text filter applied, length: " + text.length + " → " + result.length);
    return result;
  }

  async apiGenerate(type, params, onChunk, opts) {
    if (!this.isConfigured) { this._toast("请先配置 API", "error"); return null; }
    var prompts = {
      outline: "请根据以下信息生成小说大纲，包含卷和章节结构：\n",
      skills: "请根据以下大纲内容，生成3-5个专用Skill建议。每个Skill包含name、description、category、injectMode、template。返回JSON数组。\n",
      settings: "请根据以下大纲内容，拆解出所有人物、世界观、物种、物资等设定条目。返回JSON数组，每项含name、category、description、attrs。\n",
      volumes: "请根据以下大纲和设定，生成卷纲结构。返回JSON数组，每项含name、outline。\n",
      chapters: "请根据以下卷纲，生成本卷的章节梗概。返回JSON数组，每项含title、summary。\n",
      body: "请根据以下章节梗概和设定，生成章节正文。\n",
      character: "请根据已有设定，生成一个新人物角色。返回JSON，含name、description、attrs。\n",
      worldview: "请根据已有设定，生成世界观条目。返回JSON，含name、description、attrs。\n",
      rewrite: "请改写以下文本，保持原意但用更生动的表达：\n",
      expand: "请扩写以下文本，增加细节和描写：\n",
      polish: "请润色以下文本，修正语法和用词，不改变原意：\n",
      translate: "请将以下文本翻译为目标语言：\n",
      style: "请将以下文本转换为指定叙事风格：\n",
      regenerate: "请重新生成以下段落，保持上下文连贯：\n",
      continue: "请续写以下文本，保持风格和语气一致：\n",
      condense: "请精简以下文本，删除冗余内容，保留核心信息：\n",
      modify: "请按用户描述的方向修改以下文本：\n"
    };
    var sysPrompts = {
      outline: "你是专业小说大纲架构师",
      skills: "你是大纲架构师，擅长分析故事大纲并生成创作辅助技能",
      settings: "你是小说设定分析师，擅长从大纲中提取人物、世界观、物种、物资等设定",
      volumes: "你是小说结构规划师",
      chapters: "你是章节剧情设计师",
      body: "你是专业小说写手",
      character: "你是角色设计师",
      worldview: "你是世界观构建师",
      rewrite: "你是文字改写专家",
      expand: "你是扩写专家",
      polish: "你是文字润色专家",
      translate: "你是翻译专家",
      style: "你是风格转换专家",
      regenerate: "你是段落重生成专家",
      continue: "你是续写专家",
      condense: "你是文字精简专家",
      modify: "你是文字修改专家"
    };
    var prompt = (prompts[type] || "请生成内容：\n") + (params || "");
   // Agent systemPrompt substitution: if opts.agentId provided, use agent systemPrompt
  var sysContent = sysPrompts[type] || "你是AI助手";
  var agentModel = null, agentTemperature = null, agentMaxTokens = null;
  if (opts && opts.agentId) {
    try {
      var ag = AgentManager.get(opts.agentId);
      if (ag) {
        if (ag.systemPrompt) sysContent = ag.systemPrompt;
        if (ag.model) agentModel = ag.model;
        if (ag.temperature != null) agentTemperature = ag.temperature;
        if (ag.maxTokens) agentMaxTokens = ag.maxTokens;
        console.log("[AGENT] Using agent: " + ag.name + " model=" + (agentModel||'default') + " temp=" + (agentTemperature!=null?agentTemperature:'default') + " maxTokens=" + (agentMaxTokens||'default'));
      }
    } catch(e) { console.warn("[WARN]", e); }
  }
    // Skill chain execution: if multiple skills, run sequentially (chain mode)
    // Single skill: append template to prompt (backward compatible)
    // Multiple skills: Skill1 generates -> output becomes input for Skill2 -> etc.
  if (opts && opts.skillIds && opts.skillIds.length > 0) {
    var _skillIds = opts.skillIds.filter(function(id) { return id; });
    if (_skillIds.length > 0) {
      var _self = this;
      var _filterToggle = document.querySelector("#pl-text-filter-toggle");
      _self._textFilterEnabled = _filterToggle ? _filterToggle.checked : false;
      var _maxTokens = Math.max((opts && opts.maxTokens) || 0, agentMaxTokens || 0, this._getAgentMaxTokens() || 0);
      if (!_maxTokens || _maxTokens <= 0) _maxTokens = 128000;
      var _skills = _skillIds.map(function(id) { try { return SkillManager.get(id); } catch(e) { return null; } }).filter(function(s) { return s; });
      if (_skills.length === 0) { console.warn("[WARN] No valid skills found, falling back to no-skill mode"); }
      else {
        console.log("[ENGINE] Executing " + _skills.length + " skill(s) via SkillExecutionEngine");
       try { this._toast(_skills.length > 1 ? "链式执行" + _skills.length + "个技能，请稍候..." : "正在使用技能: " + _skills[0].name, "info"); } catch(e){console.warn("[WARN] catch #22 renderer_v2.js",e);if(window.DiagLogger)DiagLogger.warn("catch","renderer_v2.js #22",e);}
        var _autoValidatorResult = SkillExecutionEngine.getAutoValidators(type, { expectedCount: opts.expectedCount });
        var _autoValidators = _autoValidatorResult.validators || [];
        var _autoFinalValidators = _autoValidatorResult.finalValidators || [];
       var _verifyProvider = null;
        try { _verifyProvider = ProviderManager.getVerifyProvider(); } catch(eP){console.warn("[WARN] catch #23 renderer_v2.js",eP);if(window.DiagLogger)DiagLogger.warn("catch","renderer_v2.js #23",eP);}
        var _engineOpts = {
          aiRequest: this._aiRequest.bind(this),
          model: agentModel,
          temperature: agentTemperature,
          maxTokens: _maxTokens,
          stream: true,
          onChunk: function(t) { if (onChunk) onChunk(t); },
         validators: _autoValidators,
          finalValidators: _autoFinalValidators,
         verifyProvider: _verifyProvider,
          expectedCount: opts.expectedCount || null,
          minProseLength: (opts.wordsPerChapter ? Math.floor(opts.wordsPerChapter * 0.8) : 0)
        };
        try {
          var _engineResult = await SkillExecutionEngine.chain(prompt, _skills, _engineOpts);
          _self._lastChainReports = _engineResult.reports || [];
          var _finalText = _engineResult.text;
          if (_self._textFilterEnabled && !_self._looksLikeJSON(_finalText)) {
            _finalText = _self._applyTextFilter(_finalText, _self._deAiFilterWords || null);
          }
          return _finalText;
        } catch(engineErr) {
          console.error("[ERR] SkillExecutionEngine failed:", engineErr);
          this._toast("技能执行失败: " + engineErr.message, "error");
          throw engineErr;
        }
      }
    }
  }

  var messages = [{role:"system",content:sysContent},{role:"user",content:prompt}];
    var maxTokens = Math.max((opts && opts.maxTokens) || 0, agentMaxTokens || 0, this._getAgentMaxTokens() || 0);
    if (!maxTokens || maxTokens <= 0) maxTokens = 128000; // fallback: never let API use default 4096
    try {
      var result = await this._aiRequest({
        messages: messages,
        model: agentModel,
        temperature: agentTemperature,
        maxTokens: maxTokens,
        stream: true,
        onChunk: function(t) { if (onChunk) onChunk(t); },
        onReasoning: function(rt) { if (onChunk) onChunk("[AI思考中] " + rt.slice(-200)); }
      });
      return result.text;
    } catch(e) {
      console.error("[ERR] apiGenerate(" + type + "):", e);
      this._toast("生成失败: " + e.message, "error");
      throw e;
    }
 }

  /**
   * _aiRequest — 统一 AI 请求公共方法
   * 合并三处重复的 fetch+流解析+reasoning_content+重试逻辑
   */
  async _aiRequest(cfg) {
   var _diagKey = "api-" + Date.now() + "-" + Math.random().toString(36).substr(2,5);
   if (window.DiagLogger) DiagLogger.perfStart(_diagKey);
 var reqBody = {
   model: cfg.model || this.settings.model || this._getSelectedModel(),
   messages: cfg.messages,
     stream: cfg.stream !== false,
   };
  // Adaptive max_tokens: send value, auto-halve on 400 error (model limit exceeded)
  // This handles both: DeepSeek (8192 limit) and OpenAI (128000 limit) without hardcoding
  var _mt = cfg.maxTokens && cfg.maxTokens > 0 ? cfg.maxTokens : 8192;
  reqBody.max_tokens = _mt;
   if (cfg.temperature != null) reqBody.temperature = cfg.temperature;
    var timeoutMs = cfg.timeoutMs || 600000;
    var doRetry = cfg.retry !== false;
    var maxRetries = doRetry ? 8 : 0;
    var retryDelays = [2000, 4000, 6000, 8000, 10000, 12000, 15000, 20000, 25000, 30000, 35000, 40000, 45000, 50000, 55000, 60000, 65000, 70000, 75000, 80000];
    var lastErr = null;
    for (var attempt = 0; attempt <= maxRetries; attempt++) {
      try {
       var signal = cfg.signal
         ? AbortSignal.any([cfg.signal, AbortSignal.timeout(timeoutMs)])
         : AbortSignal.timeout(timeoutMs);
        var _reqBaseUrl = cfg.baseUrl || this.settings.baseUrl;
        var _reqApiKey = cfg.apiKey || this.settings.apiKey;
        var resp = await fetch(_reqBaseUrl + "/chat/completions", {
          method: "POST",
          headers: { Authorization: "Bearer " + _reqApiKey, "Content-Type": "application/json" },
         body: JSON.stringify(reqBody),
         signal: signal
       });
        if (!resp.ok) {
          if (doRetry && (resp.status === 429 || resp.status === 502 || resp.status === 503) && attempt < maxRetries) {
            console.warn("[WARN] _aiRequest got " + resp.status + ", retry " + (attempt + 1) + "/" + maxRetries);
            await new Promise(function (r) { setTimeout(r, retryDelays[attempt]); });
            lastErr = new Error("HTTP " + resp.status);
            continue;
          }
         var errMap = { 400: "请求参数错误", 401: "API Key 无效", 403: "访问被禁止", 404: "接口不存在", 429: "请求太频繁", 500: "服务器内部错误" };
         // Adaptive max_tokens: on 400 error, try reading body and halving max_tokens
         if (resp.status === 400 && reqBody.max_tokens && reqBody.max_tokens > 1024 && attempt < maxRetries) {
           try {
             var errBody = await resp.clone().json();
             var errStr = JSON.stringify(errBody).toLowerCase();
             console.warn("[WARN] 400 error body:", errStr.substring(0, 200));
             if (errStr.includes("max_tokens") || errStr.includes("max output") || errStr.includes("maximum") || errStr.includes("too large") || errStr.includes("token")) {
               reqBody.max_tokens = Math.floor(reqBody.max_tokens / 2);
               console.warn("[WARN] 400 likely max_tokens too large, halving to " + reqBody.max_tokens + ", retry " + (attempt+1) + "/" + maxRetries);
               await new Promise(function(r){setTimeout(r,1000);});
               continue;
             }
           } catch(e2) { /* body not JSON, try halving anyway */ }
           // Even if we can't read body, try halving if max_tokens is large
           reqBody.max_tokens = Math.floor(reqBody.max_tokens / 2);
           console.warn("[WARN] 400 error, halving max_tokens to " + reqBody.max_tokens + ", retry " + (attempt+1) + "/" + maxRetries);
           await new Promise(function(r){setTimeout(r,1000);});
           continue;
         }
         throw new Error(errMap[resp.status] || "HTTP " + resp.status);
        }
        if (cfg.stream === false) {
          var data = await resp.json();
          var msg = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message : {};
          var text = msg.content || "";
          var reasoning = msg.reasoning_content || "";
          if (!text && reasoning) text = reasoning;
          if (data.usage && cfg.onUsage) cfg.onUsage(data.usage);
          if (cfg.onChunk) cfg.onChunk(text);
          if (window.DiagLogger && _diagKey) { var _el = DiagLogger.perfEnd(_diagKey, "api", "API"); DiagLogger.trackApiCall(reqBody.model || "?", 0, _el, "ok"); }
         return { text: text, reasoning: reasoning };
        }
        var reader = resp.body.getReader();
        var decoder = new TextDecoder();
        var fullText = "";
        var reasoningText = "";
        var buffer = "";
        // Feature 3: streaming idle detection
        var _idleCount = 0;
        var _idleThreshold = 15000;
        var _hasContent = false;
        while (true) {
          var _idleTimer = null;
          var _idlePromise = new Promise(function(resolve) { _idleTimer = setTimeout(function() { resolve('idle'); }, _idleThreshold); });
          var _chunkPromise = reader.read().then(function(c) { return { type: 'chunk', data: c }; });
          var _raceResult = await Promise.race([_chunkPromise, _idlePromise]);
          if (_idleTimer) clearTimeout(_idleTimer);
          if (_raceResult === 'idle') {
            _idleCount++;
            console.warn('[WARN] Stream idle ' + _idleCount + ' times (' + _idleThreshold + 'ms), aborting');
            if (_idleCount >= 3) _idleThreshold = 10000;
            try { await reader.cancel(); } catch(e){console.warn("[WARN] catch #24 renderer_v2.js",e);if(window.DiagLogger)DiagLogger.warn("catch","renderer_v2.js #24",e);}
            throw new Error('stream_idle_timeout: no data for ' + _idleThreshold + 'ms (idle: ' + _idleCount + ')');
          }
          var chunk = _raceResult.data;
          if (chunk.done) break;
          _hasContent = true;
          if (cfg.onPause) await cfg.onPause();
          buffer += decoder.decode(chunk.value, { stream: true });
          var lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (var j = 0; j < lines.length; j++) {
            var line = lines[j].trim();
            if (!line || line.indexOf("data: ") !== 0) continue;
            var d = line.slice(6);
            if (d === "[DONE]") continue;
            try {
              var json = JSON.parse(d);
              var deltaObj = json.choices && json.choices[0] && json.choices[0].delta ? json.choices[0].delta : {};
              var contentDelta = deltaObj.content || null;
              var reasoningDelta = deltaObj.reasoning_content || null;
              if (reasoningDelta) { reasoningText += reasoningDelta; if (cfg.onReasoning) cfg.onReasoning(reasoningText); }
              if (contentDelta) { fullText += contentDelta; if (cfg.onChunk) cfg.onChunk(fullText); }
            } catch (e) { console.warn("[WARN]", e); }
          }
        }
        if (!fullText && reasoningText) { console.log("[API] reasoning fallback (" + reasoningText.length + " chars)"); fullText = reasoningText; }
        if (window.DiagLogger && _diagKey) { var _el2 = DiagLogger.perfEnd(_diagKey, "api", "API stream"); DiagLogger.trackApiCall(reqBody.model || "?", 0, _el2, "ok"); }
        return { text: fullText, reasoning: reasoningText };
      } catch (e) {
        if (window.DiagLogger && _diagKey) DiagLogger.trackApiCall(reqBody.model || "?", 0, 0, "error", e.message);
      if (cfg.signal && cfg.signal.aborted) throw e;
        if (e.name === "TimeoutError" || e.name === "AbortError") {
          lastErr = e;
          if (doRetry && attempt < maxRetries) { console.warn("[WARN] _aiRequest retry " + (attempt+1) + "/" + maxRetries); await new Promise(function(r){setTimeout(r,retryDelays[attempt]);}); continue; }
          throw e;
        }
       lastErr = e;
       // Do not retry client errors (400/401/403/404) - they will never succeed
       var _noRetry = e.message.indexOf("API Key") !== -1 || e.message.indexOf("访问被禁止") !== -1 || e.message.indexOf("接口不存在") !== -1 || e.message.indexOf("请求参数错误") !== -1;
       if (doRetry && attempt < maxRetries && !_noRetry) {
         console.warn("[WARN] _aiRequest " + e.message + ", retry " + (attempt+1) + "/" + maxRetries);
         await new Promise(function(r){setTimeout(r,retryDelays[attempt]);});
         continue;
       }
        break;
      }
    }
    // Feature 3: Heartbeat reconnection - after all retries exhausted, keep trying at 60s intervals
    if (doRetry && lastErr) {
      console.warn('[WARN] All ' + maxRetries + ' retries exhausted, entering heartbeat mode (60s intervals)');
      var hbAttempt = 0;
      while (true) {
        hbAttempt++;
        await new Promise(function(r) { setTimeout(r, 60000); });
        console.log('[HEARTBEAT] Probe attempt ' + hbAttempt + '...');
        try {
          var hbSignal = AbortSignal.timeout(timeoutMs);
          var hbResp = await fetch((_reqBaseUrl || this.settings.baseUrl) + '/chat/completions', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + (_reqApiKey || this.settings.apiKey), 'Content-Type': 'application/json' },
            body: JSON.stringify(reqBody),
            signal: hbSignal
          });
          if (hbResp.ok) {
            console.log('[HEARTBEAT] API recovered on attempt ' + hbAttempt + ', resuming request');
            // Re-run the original request with fresh reader
            if (cfg.stream !== false) {
              var hbReader = hbResp.body.getReader();
              var hbDecoder = new TextDecoder();
              var hbFullText = '';
              var hbReasoning = '';
              var hbBuffer = '';
              while (true) {
                var hbChunk = await hbReader.read();
                if (hbChunk.done) break;
                hbBuffer += hbDecoder.decode(hbChunk.value, { stream: true });
                var hbLines = hbBuffer.split('\n');
                hbBuffer = hbLines.pop() || '';
                for (var hj = 0; hj < hbLines.length; hj++) {
                  var hbLine = hbLines[hj].trim();
                  if (!hbLine || hbLine.indexOf('data: ') !== 0) continue;
                  var hbD = hbLine.slice(6);
                  if (hbD === '[DONE]') continue;
                  try {
                    var hbJson = JSON.parse(hbD);
                    var hbDelta = hbJson.choices && hbJson.choices[0] && hbJson.choices[0].delta ? hbJson.choices[0].delta : {};
                    var hbContent = hbDelta.content || null;
                    var hbReason = hbDelta.reasoning_content || null;
                    if (hbReason) { hbReasoning += hbReason; if (cfg.onReasoning) cfg.onReasoning(hbReasoning); }
                    if (hbContent) { hbFullText += hbContent; if (cfg.onChunk) cfg.onChunk(hbFullText); }
                  } catch(e){console.warn("[WARN] catch #25 renderer_v2.js",e);if(window.DiagLogger)DiagLogger.warn("catch","renderer_v2.js #25",e);}
                }
              }
              if (!hbFullText && hbReasoning) hbFullText = hbReasoning;
              return { text: hbFullText, reasoning: hbReasoning };
            } else {
              var hbData = await hbResp.json();
              var hbMsg = hbData.choices && hbData.choices[0] && hbData.choices[0].message ? hbData.choices[0].message : {};
              return { text: hbMsg.content || '', reasoning: hbMsg.reasoning_content || '' };
            }
          }
        } catch(hbErr) {
          console.warn('[HEARTBEAT] Probe ' + hbAttempt + ' failed: ' + hbErr.message);
        }
      }
    }
    throw lastErr || new Error('_aiRequest failed');
  }

   _checkInlineMenu() {
    var ed = document.getElementById("editor-content");
    if (!ed) return;
    var text = "";
    var rect = null;
    var sel = window.getSelection();
    if (sel && sel.toString().trim().length >= 2) {
      text = sel.toString().trim();
      try { rect = sel.getRangeAt(0).getBoundingClientRect(); } catch(e) { rect = null; }
    }
    if ((!text || text.length < 2) && ed.selectionStart !== undefined && ed.selectionEnd !== undefined && ed.selectionStart !== ed.selectionEnd) {
      text = ed.value.substring(ed.selectionStart, ed.selectionEnd).trim();
      var edRect = ed.getBoundingClientRect();
      rect = { left: edRect.left + 20, top: edRect.top + 20, width: 100, bottom: edRect.top + 40 };
    }
    if (!text || text.length < 2) { this._hideInlineMenu(); return; }
    if (!rect || rect.width === 0) {
      var edRect2 = ed.getBoundingClientRect();
      rect = { left: edRect2.left + 20, top: edRect2.top + 20, width: 100, bottom: edRect2.top + 40 };
    }
    var menu = document.getElementById("inline-menu");
    if (!menu) {
      menu = document.createElement("div");
      menu.id = "inline-menu";
      document.body.appendChild(menu);
    }
    var actions = [
      {key:"rewrite",label:"改写"},{key:"expand",label:"扩写"},
      {key:"polish",label:"润色"},{key:"regenerate",label:"重写"},
      {key:"translate",label:"翻译"},{key:"style",label:"风格"},
      {key:"scene",label:"场景描写"},{key:"dialogue",label:"对话生成"},
      {key:"plot",label:"情节推演"},{key:"inject",label:"上下文注入"},
      {key:"continue",label:"续写"},{key:"condense",label:"精简"},{key:"modify",label:"修改"},
      {key:"summary",label:"概括"},{key:"character",label:"角色描写"},
      {key:"environment",label:"环境描写"},{key:"psychology",label:"心理描写"},
      {key:"pacing",label:"节奏调整"},{key:"foreshadow",label:"伏笔铺垫"},
      {key:"conflict",label:"冲突强化"},{key:"emotion",label:"情感强化"}
    ];
    var html = "";
    var self = this;
    actions.forEach(function(a) {
      html += '<button class="inline-menu-btn" data-action="' + a.key + '">' + a.label + "</button>";
    });
    menu.innerHTML = html;
    menu.style.left = (rect.left + window.scrollX) + "px";
    menu.style.top = (rect.bottom + window.scrollY + 8) + "px";
    menu.classList.add("visible");
    menu.querySelectorAll(".inline-menu-btn").forEach(function(btn) {
      btn.onclick = function() { self._applyInlineAction(btn.dataset.action, text); };
    });
  }

  _hideInlineMenu() {
    var menu = document.getElementById("inline-menu");
    if (menu) menu.classList.remove("visible");
  }

  _applyInlineAction(action, selectedText) {
    this._hideInlineMenu();
    var actionLabels = {
      rewrite:"改写",expand:"扩写",polish:"润色",regenerate:"重写段落",
      translate:"翻译",style:"风格转换",scene:"场景描写",dialogue:"对话生成",
      plot:"情节推演",inject:"上下文注入",
      continue:"续写",condense:"精简",modify:"修改",
      summary:"概括",character:"角色描写",environment:"环境描写",
      psychology:"心理描写",pacing:"节奏调整",foreshadow:"伏笔铺垫",
      conflict:"冲突强化",emotion:"情感强化"
    };
    var label = actionLabels[action] || action;
    var chatInput = document.getElementById("user-input");
    if (!chatInput) return;
    var prompt = "【" + label + "】请对以下选中文本进行" + label + "操作：\n\n" + selectedText;
    if (action === "inject") {
      prompt = "请基于以下上下文继续写作：\n\n" + selectedText;
    }
    chatInput.value = prompt;
    this.autoResizeInput();
    var cc = document.getElementById("char-count");
    if (cc) cc.textContent = chatInput.value.length;
    if (window.showToast) window.showToast("info", "已将" + label + "请求填入对话区，可补充要求后发送");
    chatInput.focus();
  }

    async streamChat(userText, aiMsg) {
    this.abortController = new AbortController();
    var self = this;
    var messages = this.buildMessages(userText);
    aiMsg.el.classList.add("streaming-cursor");
    try {
      var result = await this._aiRequest({
        messages: messages,
        model: this._getSelectedModel(),
        temperature: this._getAgentTemperature(),
        maxTokens: this._getAgentMaxTokens(),
        stream: true,
        signal: this.abortController.signal,
        retry: false,
        onPause: function() { return self._waitIfPaused(); },
        onChunk: function(t) {
          aiMsg.el.querySelector(".message-content").innerHTML = (typeof marked !== "undefined" ? marked.parse(t) : self._escHtml(t));
          self.scrollToBottom();
        },
        onReasoning: function(rt) {
          aiMsg.el.querySelector(".message-content").innerHTML = "<em style=\"color:var(--text-secondary)\">[AI思考中] " + self._escHtml(rt.slice(-200)) + "</em>";
          self.scrollToBottom();
        },
        onUsage: function(u) { if (u) self._updateTokenCount(u); }
      });
      var fullText = result.text;
      aiMsg.el.classList.remove("streaming-cursor");
      aiMsg.text = fullText;
      aiMsg.role = "assistant";
      aiMsg.el.querySelector(".message-content").innerHTML = (typeof marked !== "undefined" ? marked.parse(fullText) : self._escHtml(fullText));
      self._estimateTokens(userText, fullText);
      // 添加操作按钮
      var existingActions = aiMsg.el.querySelector(".msg-actions");
      if (!existingActions) {
        var actions = document.createElement("div");
        actions.className = "msg-actions";
        actions.innerHTML = '<button class="msg-btn msg-btn-copy" title="复制"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg></button><button class="msg-btn msg-btn-regen" title="重新生成"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg></button><button class="msg-btn msg-btn-apply" title="应用到编辑器"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>';
        aiMsg.el.appendChild(actions);
        self.scrollToBottom();
      }
    } catch(e) {
      aiMsg.el.classList.remove("streaming-cursor");
      if (e.name === "AbortError") {
        aiMsg.text = "[已停止]";
        aiMsg.el.querySelector(".message-content").innerHTML = "<em style=\"color:var(--text-secondary)\">[已停止生成]</em>";
      } else {
        aiMsg.el.querySelector(".message-content").innerHTML = "<span style=\"color:var(--danger)\">[ERR] " + self._escHtml(e.message) + "</span>";
      }
    }
  }

    _updateTokenCount(usage) {
    var bar = document.getElementById("token-bar");
    var tc = document.getElementById("token-count");
    if (!bar || !tc) return;
    var total = (usage.total_tokens || 0);
    tc.textContent = total;
    bar.style.display = total > 0 ? "" : "none";
  }

  _estimateTokens(userText, aiText) {
    var inputLen = (userText || "").length;
    var outputLen = (aiText || "").length;
    var est = Math.ceil((inputLen + outputLen) / 1.5);
    this._updateTokenCount({ total_tokens: est });
  }

 buildMessages(userText) {
    // 组装顺序: 系统提示 -> 设定 -> 技能 -> 记忆 -> 历史 -> 用户消息
    var messages = [];
    var systemParts = [];

    // 1. 系统提示词
    if (this.settings.systemPrompt) systemParts.push(this.settings.systemPrompt);

    // 0.5 智能体系统提示词（最高优先级，覆盖全局）
    if (this.currentAgentId) {
      try {
        var agent = AgentManager.get(this.currentAgentId);
        if (agent && agent.systemPrompt) { systemParts.unshift(agent.systemPrompt); }
      } catch(e) { console.warn("[WARN]", e); }
    }

    // 2. 上下文设定
     var ctxSettings = this.getContextSettings();
     if (ctxSettings.length > 0) {
      var setText = "当前上下文设定：";
      ctxSettings.forEach(function(cs) {
        setText += "\\n【" + cs.name + "】(" + (cs.category || "通用") + ")";
        var keys = Object.keys(cs.attrs || {});
        for (var k = 0; k < keys.length; k++) { setText += "\\n  " + keys[k] + ": " + cs.attrs[keys[k]]; }
      });
      systemParts.push(setText);
    }

    // 2.5. 触发词扫描 - 从最近用户消息中匹配触发关键词
    var matchedItems = this._scanTriggerKeywords();
    if (matchedItems.length > 0) {
      var trigText = "触发匹配的设定条目：";
      matchedItems.forEach(function(mi) {
        trigText += "\n【" + mi.name + "】(" + (mi.catName || "") + ")";
        var attrs = mi.attrs || {};
        Object.keys(attrs).forEach(function(k) { trigText += "\n  " + k + ": " + attrs[k]; });
        if (mi.triggerKeywords) trigText += "\n  触发词: " + mi.triggerKeywords.join(", ");
      });
      systemParts.push(trigText);
    }
  
    // 3. 技能
    var skills = this.getContextSkills();
    if (skills.length > 0) {
      var skillText = "生效中的技能：";
      skills.forEach(function(s) {
        skillText += "\\n【" + s.name + "】(" + (s.injectMode || "system_prefix") + ")\\n" + this._renderSkillTemplate(s, "dialogue");
      });
      systemParts.push(skillText);
    }

    // 4. 长文记忆

    // 3.5 编辑面板模式上下文 (v2.7.18): 按editorMode注入当前编辑内容+对应层pipeline SKILL
    try {
      var plCtx = this._plData();
      if (plCtx) {
        var ctxText2 = "", ctxLabel2 = "", ctxSkillIds2 = [];
        if (this.editorMode === "vol-outline" && this.editorContextVolIdx >= 0) {
          var volC2 = plCtx.volumes[this.editorContextVolIdx];
          ctxLabel2 = "卷纲纲要";
          ctxText2 = volC2 ? (volC2.outline || "") : "";
          ctxSkillIds2 = plCtx.s3Skills || [];
        } else if (this.editorMode === "ch-plot" && this.editorContextVolIdx >= 0 && this.editorContextChIdx >= 0) {
          var volP2 = plCtx.volumes[this.editorContextVolIdx];
          var chP2 = volP2 ? volP2.chapters[this.editorContextChIdx] : null;
          ctxLabel2 = "章节剧情梗概";
          ctxText2 = chP2 ? (chP2.plot || "") : "";
          ctxSkillIds2 = plCtx.s4Skills || [];
        } else if (this.editorMode === "ch-body") {
          ctxLabel2 = "正文";
          ctxSkillIds2 = plCtx.s5Skills || [];
          if (this.currentVolumeId && this.currentChapterId) {
            for (var vi2 = 0; vi2 < plCtx.volumes.length; vi2++) {
              if (plCtx.volumes[vi2].id === this.currentVolumeId) {
                for (var vj2 = 0; vj2 < plCtx.volumes[vi2].chapters.length; vj2++) {
                  if (plCtx.volumes[vi2].chapters[vj2].id === this.currentChapterId) { ctxText2 = plCtx.volumes[vi2].chapters[vj2].body || ""; break; }
                }
              }
            }
          }
        }
        if (ctxText2) { systemParts.push("当前编辑内容（" + ctxLabel2 + "）：\n" + ctxText2); }
        if (ctxSkillIds2.length > 0) {
          var existingSk = {};
          for (var es = 0; es < skills.length; es++) { if (skills[es] && skills[es].id) existingSk[skills[es].id] = true; }
          var ctxSkillText2 = "";
          for (var si2 = 0; si2 < ctxSkillIds2.length; si2++) {
            if (existingSk[ctxSkillIds2[si2]]) continue;
            var sObj2 = null; try { sObj2 = SkillManager.get(ctxSkillIds2[si2]); } catch(eS2){console.warn("[WARN] catch #26 renderer_v2.js",eS2);if(window.DiagLogger)DiagLogger.warn("catch","renderer_v2.js #26",eS2);}
            if (sObj2 && sObj2.template) { ctxSkillText2 += "\n【" + sObj2.name + "】\n" + this._renderSkillTemplate(sObj2, this.editorMode === "vol-outline" ? "volume" : (this.editorMode === "ch-plot" ? "chapter" : "body")) + "\n"; }
          }
          if (ctxSkillText2) { systemParts.push("当前层级 Skill（" + ctxLabel2 + "）：" + ctxSkillText2); }
        }
      }
    } catch(eCtx2) { console.warn("[WARN] editorMode ctx inject:", eCtx2); }

    var mem = this._memData();
    if (mem && mem.items && mem.items.length > 0) {
      var memText = "相关记忆：";
      var recentMem = mem.items.slice(-10);
      for (var m = 0; m < recentMem.length; m++) {
        var mi = recentMem[m];
        memText += "\\n- [" + (mi.category || "") + "] " + (mi.title || mi.name || "");
        if (mi.content) memText += ": " + mi.content;
      }
      systemParts.push(memText);
    }

    // 组装系统消息
    if (systemParts.length > 0) { messages.push({ role: "system", content: systemParts.join("\\n\\n---\\n\\n") }); }

    // 5. 历史消息（含深度限制）
    var maxDepth = 21;
    for (var s = 0; s < skills.length; s++) {
      var d = skills[s].injectDepth;
      if (d && d > 0 && d < maxDepth) maxDepth = d;
    }
    var recent = this.messages.slice(-maxDepth, -1);
    for (var i = 0; i < recent.length; i++) {
      var rm = recent[i];
      if (rm.role === "user" || rm.role === "assistant") { messages.push({ role: rm.role, content: rm.text }); }
    }

    // 6. 用户消息
    messages.push({ role: "user", content: userText });

    return messages;
  }

addMessage(role, text, isStreaming) {
    var self = this;
   var emptyEl = document.querySelector("#messages-list #chat-empty-state") || document.querySelector("#messages-list .empty-state") || document.querySelector("#messages-list .chat-empty");
   if (emptyEl) emptyEl.remove();
  var msg = { role: role, text: text, time: Date.now() };
   var el = document.createElement("div");
   el.className = "msg msg-" + role;
    var content = document.createElement("div");
    content.className = "message-content";
    if (role === "ai") { content.innerHTML = (typeof marked !== "undefined" ? marked.parse(text) : self._escHtml(text)); }
    else { content.textContent = text; }
    if (isStreaming && role === "ai" && !text) {
      var spinner = document.createElement("span");
      spinner.className = "loading-dots";
      spinner.innerHTML = "<span></span><span></span><span></span>";
      content.appendChild(spinner);
    }
    el.appendChild(content);
    if (isStreaming) el.classList.add("streaming-cursor");
    if (role === "ai" && !isStreaming) {
      var actions = document.createElement("div");
      actions.className = "msg-actions";
      actions.innerHTML = '<button class="msg-btn msg-btn-copy" title="复制"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg></button><button class="msg-btn msg-btn-regen" title="重新生成"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg></button><button class="msg-btn msg-btn-apply" title="应用到编辑器"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>';
      el.appendChild(actions);
    }
   document.getElementById("messages-list").appendChild(el);
    msg.el = el;
   this.messages.push(msg);
   this.scrollToBottom();
   return msg;
 }

  scrollToBottom() {
    if (this._scrollRAF) cancelAnimationFrame(this._scrollRAF);
    var self = this;
    this._scrollRAF = requestAnimationFrame(function() {
      var container = document.getElementById("messages-container");
      if (container) { container.scrollTo(0, container.scrollHeight); }
      self._scrollRAF = null;
      setTimeout(function() {
        var c = document.getElementById("messages-container");
        if (c) c.scrollTo(0, c.scrollHeight);
      }, 150);
    });
  }

  _getWordCount() {
    var editor = document.getElementById("editor-content");
    if (!editor || !editor.value) return 0;
    var text = editor.value.trim();
    if (!text) return 0;
    return text.replace(/\s+/g, "").length;
  }

  _initPanelResizers() {
    var self = this;
    function initResizer(resizerId, leftPanelId, rightPanelId, isVertical) {
      var resizer = document.getElementById(resizerId);
      var left = document.getElementById(leftPanelId);
      var right = document.getElementById(rightPanelId);
      if (!resizer || !left || !right) return;
      var startX, startY, startLeftW, startRightW;
      resizer.addEventListener("mousedown", function(e) {
        e.preventDefault();
        startX = e.clientX;
        startY = e.clientY;
        startLeftW = left.getBoundingClientRect().width;
        startRightW = right.getBoundingClientRect().width;
        resizer.classList.add("active");
        document.body.style.cursor = isVertical ? "col-resize" : "row-resize";
        document.body.style.userSelect = "none";
        function onMove(ev) {
          var delta = isVertical ? (ev.clientX - startX) : (ev.clientY - startY);
          var newLeftW = Math.max(120, startLeftW + delta);
          var totalW = startLeftW + startRightW;
          var newRightW = totalW - newLeftW;
          if (newRightW < 120) { newLeftW = totalW - 120; newRightW = 120; }
          left.style.width = newLeftW + "px";
          left.style.flex = "none";
          right.style.width = newRightW + "px";
          right.style.flex = "none";
        }
        function onUp() {
          resizer.classList.remove("active");
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
        }
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      });
    }
    initResizer("resizer-chapter", "chapter-tree", "editor-panel", true);
    initResizer("resizer-editor-chat", "editor-panel", "chat-panel", true);
  }

  async clearChat() {
    if (!(await this._confirm("确定要清空所有对话记录吗？"))) return;
    this.messages = [];
    document.getElementById("messages-list").innerHTML = "";
  }

  _updateBreadcrumb() {
    var bc = document.getElementById("breadcrumb-bar");
    if (!bc) return;
    var panels = [
      { el: document.getElementById("outline-workspace"), label: "大纲工作台", close: "closeOutlineWorkspace" },
      { el: document.getElementById("settings-collection-panel"), label: "设定合集", close: "closeSettingsCollection" },
      { el: document.getElementById("pipeline-panel"), label: "生成流水线", close: "closePipeline" },
      { el: document.getElementById("memory-panel"), label: "记忆管理", close: "closeMemory" }
    ];
    var html = '<span class="breadcrumb-home" onclick="window._app&&window._app.closeAllPanels()">小说工坊</span>';
    for (var i = 0; i < panels.length; i++) {
      if (panels[i].el && panels[i].el.classList.contains("visible")) {
        html += '<span class="breadcrumb-sep">/</span>';
        html += '<span class="breadcrumb-item" onclick="window._app&&window._app.' + panels[i].close + '()">' + panels[i].label + '<span class="bc-close">&times;</span></span>';
      }
    }
    bc.innerHTML = html;
  }

  autoResizeInput() {
    var inp = document.getElementById("user-input");
    inp.style.height = "auto";
    inp.style.height = Math.min(inp.scrollHeight, 120) + "px";
  }

 setStreaming(streaming) {
   this.isStreaming = streaming;
   var btn = document.getElementById("btn-send");
   if (streaming) {
     btn.innerHTML = "<svg width='12' height='12' viewBox='0 0 24 24' fill='currentColor'><rect x='4' y='4' width='16' height='16' rx='2'/></svg>";
     btn.title = "\u505c\u6b62";
     btn.classList.add("btn-stop");
   } else {
     btn.innerHTML = "<svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><line x1='22' y1='2' x2='11' y2='13'/><polygon points='22 2 15 22 11 13 2 9 22 2'/></svg>";
     btn.title = "\u53d1\u9001";
     btn.classList.remove("btn-stop");
     this.abortController = null;
   }
 }

  _getSelectedModel() {
    // 优先使用当前智能体绑定的模型
    if (this.currentAgentId) {
      try {
        var agent = AgentManager.get(this.currentAgentId);
        if (agent && agent.model) return agent.model;
      } catch(e) { console.warn("[WARN]", e); }
    }
    var sel = document.getElementById("model-select");
    if (sel && sel.value) return sel.value;
    return this.settings.model;
  }

  _getAgentTemperature() {
    if (this.currentAgentId) {
      try {
        var agent = AgentManager.get(this.currentAgentId);
        if (agent && agent.temperature != null) return agent.temperature;
      } catch(e) { console.warn("[WARN]", e); }
    }
    return 0.7;
  }

  _getAgentMaxTokens() {
    if (this.currentAgentId) {
      try {
        var agent = AgentManager.get(this.currentAgentId);
        if (agent && agent.maxTokens) return Math.max(agent.maxTokens, 128000);
      } catch(e) { console.warn("[WARN]", e); }
    }
    return Math.max(this.settings.maxTokens || 0, 128000);
  }

  _autoSelectAgentModel() {
    if (!this.currentAgentId) return;
    try {
      var agent = AgentManager.get(this.currentAgentId);
      if (agent && agent.model) {
        var sel = document.getElementById("model-select");
        var selChat = document.getElementById("model-select-chat");
        if (sel) sel.value = agent.model;
        if (selChat) selChat.value = agent.model;
      }
    } catch(e) { console.warn("[WARN]", e); }
  }
  populateAgentSelect() {
    var sel = document.getElementById("agent-select");
    var selChat = document.getElementById("agent-select-chat");
    var html = '<option value="">' + "\u9ed8\u8ba4" + '</option>';
    var agents = AgentManager.getAll();
    agents.forEach(function(a) {
      html += '<option value="' + a.id + '">' + a.name + '</option>';
    });
    if (sel) { var curVal = this.currentAgentId || ""; sel.innerHTML = html; sel.value = curVal; }
    if (selChat) { selChat.innerHTML = html; selChat.value = this.currentAgentId || ""; }
  }

  populateModelSelect() {
    var self = this;
    var sel = document.getElementById("model-select");
    var selChat = document.getElementById("model-select-chat");
    var html = '<option value="">' + "\u81ea\u52a8" + '</option>';
    // 收集所有模型（去重）
    var modelSet = {};
    // 1. 当前供应商的所有模型
    if (this.currentProviderId) {
      var p = ProviderManager.get(this.currentProviderId);
      if (p && p.models && p.models.length > 0) {
        p.models.forEach(function(m) { if (m && !modelSet[m]) modelSet[m] = true; });
      }
    }
    // 2. 当前智能体的模型
    var agentId = this.currentAgentId;
    if (agentId) {
      var agent = AgentManager.get(agentId);
      if (agent && agent.model) { if (!modelSet[agent.model]) modelSet[agent.model] = true; }
    }
    // 3. settings.model
    if (this.settings.model) { if (!modelSet[this.settings.model]) modelSet[this.settings.model] = true; }
    // 生成 option
    for (var m in modelSet) {
      if (modelSet.hasOwnProperty(m)) {
        html += '<option value="' + self._escHtml(m) + '">' + self._escHtml(m) + '</option>';
      }
    }
   if (sel) sel.innerHTML = html;
   if (sel && this.settings.model) { sel.value = this.settings.model; }
   if (selChat) { selChat.innerHTML = html; selChat.value = sel ? sel.value : ""; }
  }

  switchTab(tabName) {
    document.querySelectorAll(".modal-tab").forEach(function(t) { t.classList.remove("active"); });
    document.querySelector(".modal-tab[data-tab='" + tabName + "']").classList.add("active");
    document.querySelectorAll(".tab-content").forEach(function(tc) { tc.classList.remove("visible"); });
    var tab = document.getElementById("tab-" + tabName);
    if (tab) tab.classList.add("visible");
    // 同步 style.display，覆盖内联 display:none
    document.querySelectorAll(".tab-content").forEach(function(tc) { tc.style.display = "none"; });
    if (tab) tab.style.display = "block";
    if (tabName === "skills") this.renderSkillList();
    if (tabName === "agents") this.renderAgentList(); this.populateAgentSelect();
    if (tabName === "appearance") this._fillAppearanceForm();
    if (tabName === "deai") this.renderDeAiSettings();
    if (tabName === "diag") this.renderDiagPanel();
    if (tabName === "skills") { this.hideSkillForm(); }
    if (tabName === "agents") { this.hideAgentForm(); }
  }
  
  renderDiagPanel() {
    var self = this;
    var stats = DiagLogger.getStats();
    var statsEl = document.getElementById("diag-stats");
    if (statsEl) {
      var upMin = Math.floor(stats.uptime / 60000);
      var upSec = Math.floor((stats.uptime % 60000) / 1000);
      statsEl.textContent = "运行:" + upMin + "分" + upSec + "秒 | 缓冲:" + stats.buffered + " | 错误:" + stats.errorCount + " | 警告:" + stats.warnCount;
    }
    var enChk = document.getElementById("diag-enabled");
    if (enChk) {
      enChk.checked = stats.enabled;
      enChk.onchange = function() { DiagLogger.setEnabled(enChk.checked); };
    }
    var lvSel = document.getElementById("diag-level");
    if (lvSel) {
      var lvMap = { 0: "error", 1: "warn", 2: "info", 3: "debug" };
      lvSel.value = lvMap[stats.level] || "info";
      lvSel.onchange = function() { DiagLogger.setLevel(lvSel.value); };
    }
    var refreshBtn = document.getElementById("btn-diag-refresh");
    if (refreshBtn) refreshBtn.onclick = function() { self.renderDiagPanel(); };
    var exportBtn = document.getElementById("btn-diag-export");
    if (exportBtn) exportBtn.onclick = function() { DiagLogger.flush(); var r = DiagLogger.export(); if (r) self._toast("已导出到:" + r, "success"); else self._toast("导出取消或失败", "error"); };
    var clearBtn = document.getElementById("btn-diag-clear");
    if (clearBtn) clearBtn.onclick = function() { if (confirm("确认清空所有诊断日志?")) { DiagLogger.clear(); self.renderDiagPanel(); } };
    // Load and display logs
    var listEl = document.getElementById("diag-log-list");
    if (listEl) {
      DiagLogger.flush();
      var entries = DiagLogger.read("");
      if (!entries || entries.length === 0) {
        listEl.innerHTML = "<div style='padding:12px;color:var(--text-muted);'>暂无日志记录</div>";
      } else {
        var html = "";
        // Show last 200 entries, newest first
        var show = entries.slice(-200).reverse();
        for (var i = 0; i < show.length; i++) {
          var e = show[i];
          var color = e.level === "error" ? "#ff6b6b" : (e.level === "warn" ? "#ffd93d" : "#6bcf7f");
          html += "<div style='padding:3px 4px;border-bottom:1px solid rgba(255,255,255,0.05);'>";
          html += "<span style='color:" + color + ";font-weight:bold;'>[" + e.level.toUpperCase() + "]</span> ";
          html += "<span style='color:#888;'>" + (e.ts || "") + "</span> ";
          html += "<span style='color:#aaa;'>(" + (e.cat || "?") + ")</span> ";
          html += "<span style='color:#ddd;'>" + (e.msg || "") + "</span>";
          if (e.detail) html += " <span style='color:#666;font-size:11px;'>" + (e.detail.length > 120 ? e.detail.substring(0, 120) + "..." : e.detail) + "</span>";
          html += "</div>";
        }
        listEl.innerHTML = html;
      }
    }
  }

  _fillAppearanceForm() {
    var fs = document.getElementById("cfg-font-size");
    var efs = document.getElementById("cfg-editor-font-size");
    var theme = document.getElementById("cfg-theme");
    if (!fs) return;
    fs.value = this.settings.fontSize || 14;
    document.getElementById("cfg-font-size-val").textContent = fs.value + "px";
    if (efs) { efs.value = this.settings.editorFontSize || 15; document.getElementById("cfg-editor-font-size-val").textContent = efs.value + "px"; }
    if (theme) theme.value = this.settings.theme || "dark";
  }

  _applyAppearance() {
    var fs = this.settings.fontSize || 14;
    var efs = this.settings.editorFontSize || 15;
    var theme = this.settings.theme || "dark";
    document.documentElement.style.setProperty("--font-size", fs + "px");
    document.documentElement.style.setProperty("--font-size-editor", efs + "px");
    var editor = document.getElementById("editor-content");
    if (editor) editor.style.fontSize = efs + "px";
    document.body.classList.toggle("light-theme", theme === "light");
  }

  _saveAppearance() {
    var fs = document.getElementById("cfg-font-size");
    var efs = document.getElementById("cfg-editor-font-size");
    var theme = document.getElementById("cfg-theme");
    if (fs) this.settings.fontSize = parseInt(fs.value) || 14;
    if (efs) this.settings.editorFontSize = parseInt(efs.value) || 15;
    if (theme) this.settings.theme = theme.value;
    this.saveSettings();
    this._applyAppearance();
  }

  renderSkillList() {
    var skills = SkillManager.getAll();
    var self = this;
    var list = document.getElementById("skill-list");
    if (skills.length === 0) { list.innerHTML = "<p class='empty-hint'>暂无可用技能，请先在设置中添加</p>"; return; }
    var html = "";
    skills.forEach(function(s) {
        var catLabel = s.category || "未分类";
        var bl = s.bindTarget ? (s.bindTarget.type === "project" ? "全局" : s.bindTarget.type === "volume" ? "卷" : "章") : "未绑定";
        var injectLabel = s.injectMode || "system_prefix";
        html += "<div class='skill-card'>";
        html += "<div class='skill-card-header'><span class='skill-card-name'>" + self._escHtml(s.name) + "</span><span class='skill-card-badge'>" + self._escHtml(catLabel) + "</span></div>";
        html += "<div class='skill-card-desc'>" + self._escHtml(s.description || "无描述") + "</div>";
        html += "<div class='skill-card-meta'>绑定: " + bl + " | 注入: " + injectLabel + "</div>";
        html += "<div class='skill-card-actions'><button class='btn-sm btn-secondary' data-a='skill-test' data-id='" + s.id + "'>测试</button><button class='btn-sm btn-secondary' data-a='skill-edit' data-id='" + s.id + "'>编辑</button><button class='btn-sm btn-danger' data-a='skill-delete' data-id='" + s.id + "'>删除</button></div>";
        html += "</div>";
    });
    list.innerHTML = html;
  }
showSkillForm(skillId) {
    var sf = document.getElementById("skill-form");
    sf.classList.remove("modal-hidden");
    sf.style.display = "block";
    document.getElementById("skill-list").style.display = "none";
    document.getElementById("btn-add-skill").style.display = "none";
    this._editingSkillId = null;
    if (skillId) {
        document.getElementById("skill-form-title").textContent = "编辑技能";
      var s = SkillManager.get(skillId);
      if (!s) return;
      this._editingSkillId = s.id;
      document.getElementById("sf-name").value = s.name;
      document.getElementById("sf-desc").value = s.description || "";
      document.getElementById("sf-category").value = s.category || "";
     document.getElementById("sf-inject-mode").value = s.injectMode;
      document.getElementById("sf-frequency").value = s.injectFrequency || "every";
      document.getElementById("sf-depth").value = (s.injectDepth != null ? s.injectDepth : 0);
      document.getElementById("sf-bind-type").value = (s.bindTarget && s.bindTarget.type) ? s.bindTarget.type : "project";
     document.getElementById("sf-template").value = s.template;
    } else {
        document.getElementById("skill-form-title").textContent = "新建技能";
      document.getElementById("sf-name").value = "";
      document.getElementById("sf-desc").value = "";
      document.getElementById("sf-category").value = "";
      document.getElementById("sf-inject-mode").value = "system_prefix";
      document.getElementById("sf-frequency").value = "every";
      document.getElementById("sf-depth").value = 0;
     document.getElementById("sf-bind-type").value = "project";
     document.getElementById("sf-template").value = "";
    }
   this.toggleBindTarget();
    if (this._editingSkillId) { var _edSk = SkillManager.get(this._editingSkillId); if (_edSk && _edSk.bindTarget && _edSk.bindTarget.id) { document.getElementById("sf-bind-id").value = _edSk.bindTarget.id; } else { document.getElementById("sf-bind-id").value = ""; } }
  this.renderLinkedSkillList();
  this._initSkillTemplatePreview();
}

_initSkillTemplatePreview() {
  var ta = document.getElementById('sf-template');
  var pv = document.getElementById('sf-template-preview');
  if (!ta || !pv) return;
  var self = this;
  var renderPreview = function() {
    var raw = ta.value || '';
    if (!raw.trim()) { pv.innerHTML = ''; return; }
    try {
      var html;
      if (typeof marked !== 'undefined') {
        html = marked.parse(raw);
      } else {
        html = self._escHtml(raw).replace(/\n/g, '<br>');
      }
      var div = document.createElement('div');
      div.innerHTML = html;
      var scripts = div.querySelectorAll('script');
      for (var i = 0; i < scripts.length; i++) {
        var pre = document.createElement('div');
        pre.className = 'script-block';
        pre.textContent = scripts[i].textContent;
        scripts[i].parentNode.replaceChild(pre, scripts[i]);
      }
      var walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT, null, null);
      var nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(function(n) {
        var text = n.textContent;
        if (/\{\{.+?\}\}/.test(text)) {
          var span = document.createElement('span');
          span.innerHTML = self._escHtml(text).replace(/\{\{(.+?)\}\}/g, '<span class="var-highlight">{{$1}}</span>');
          n.parentNode.replaceChild(span, n);
        }
      });
      pv.innerHTML = div.innerHTML;
    } catch(e) {
      pv.innerHTML = '<em style="color:var(--text-muted)">预览渲染失败: ' + self._escHtml(e.message) + '</em>';
    }
  };
 ta.removeEventListener('input', ta._sfPreviewHandler);
 ta._sfPreviewHandler = renderPreview;
 ta.addEventListener('input', renderPreview);
 renderPreview();

  var varContainer = document.querySelector('.var-tags');
  if (varContainer && !varContainer._varBtnBound) {
    varContainer._varBtnBound = true;
    varContainer.addEventListener('click', function(e) {
      var btn = e.target.closest('.btn-var');
      if (!btn) return;
      var varName = btn.dataset.var;
      var insertText = '{{' + varName + '}}';
      var start = ta.selectionStart;
      var end = ta.selectionEnd;
      ta.value = ta.value.substring(0, start) + insertText + ta.value.substring(end);
      ta.selectionStart = ta.selectionEnd = start + insertText.length;
      ta.focus();
      renderPreview();
    });
  }
}

hideSkillForm() {
    var sf = document.getElementById("skill-form");
    sf.classList.add("modal-hidden");
    sf.style.display = "none";
    document.getElementById("skill-list").style.display = "";
    document.getElementById("btn-add-skill").style.display = "";
    this._editingSkillId = null;
    this.renderSkillList();
  }

  toggleBindTarget() {
     var self = this;
     var type = document.getElementById("sf-bind-type").value;
     document.getElementById("sf-bind-id-group").style.display = type === "project" ? "none" : "";
     if (type !== "project") {
       var select = document.getElementById("sf-bind-id");
       select.innerHTML = "<option value=\"\">选择目标...</option>";
       if (type === "volume") {
         var volumes = ChapterManager.getVolumes(self.currentProjectId);
         for (var i = 0; i < volumes.length; i++) {
            select.innerHTML += "<option value=\"" + volumes[i].id + "\">" + self._escHtml(volumes[i].name) + "</option>";
         }
       } else if (type === "chapter") {
         var vols = ChapterManager.getVolumes(self.currentProjectId);
         for (var v = 0; v < vols.length; v++) {
           var chs = ChapterManager.getChapters(self.currentProjectId, vols[v].id);
           for (var c = 0; c < chs.length; c++) {
            select.innerHTML += "<option value=\"" + chs[c].id + "\">" + self._escHtml(vols[v].name) + " / " + self._escHtml(chs[c].title) + "</option>";
           }
         }
       }
     }
  }
  renderLinkedSkillList() {
    var skills = SkillManager.getAll();
    var html = "";
    var self = this;
    skills.forEach(function(s) {
      if (self._editingSkillId && s.id === self._editingSkillId) return;
      html += "<label><input type='checkbox' value='" + s.id + "'> " + self._escHtml(s.name) + "</label>";
    });
    document.getElementById("sf-linked-list").innerHTML = html || "<span style='color:#666;font-size:12px'>暂无其他可联动技能</span>";
  }

  saveSkill() {
    var name = document.getElementById("sf-name").value.trim();
    if (!name) { this._toast("请填写技能名称", "error"); return; }
    if (SkillManager.nameExists(name, this._editingSkillId)) { this._toast("技能名称已存在", "error"); return; }
    var linkedIds = [];
    document.querySelectorAll("#sf-linked-list input:checked").forEach(function(cb) { linkedIds.push(cb.value); });
    var data = {
      name: name, description: document.getElementById("sf-desc").value.trim(),
      category: document.getElementById("sf-category").value.trim(),
     injectMode: document.getElementById("sf-inject-mode").value,
     injectFrequency: document.getElementById("sf-frequency").value,
     injectDepth: (function(){var d=parseInt(document.getElementById("sf-depth").value);return isNaN(d)?0:d;}()),
     bindTarget: { type: document.getElementById("sf-bind-type").value, id: document.getElementById("sf-bind-id").value },
      template: document.getElementById("sf-template").value,
      linkedSkillIds: linkedIds
    };
    if (this._editingSkillId) { SkillManager.update(this._editingSkillId, data); }
    else { SkillManager.create(data); }
    this.hideSkillForm();
  }

  async deleteSkill(id) {
    var s = SkillManager.get(id);
    if (!s) return;
    if (!(await this._confirm("确定要删除技能 [" + s.name + "] 吗？"))) return;
    SkillManager.delete(id);
    this.renderSkillList();
  }

 async testSkill(id) {
    var s = SkillManager.get(id);
    if (!s) return;
    var modal = document.getElementById("skill-test-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "skill-test-modal";
      modal.className = "modal";
      modal.innerHTML = "<div class='modal-content' style='max-width:600px'><div class='modal-header'><h4 id='stm-title'>测试技能</h4><button id='stm-close' class='btn-close'>&times;</button></div><div class='modal-body'><div class='form-group'><label>模拟输入文本（替换 {{selectedText}}）</label><textarea id='stm-input' rows='4' class='full-width' placeholder='输入测试文本，模拟技能注入后的上下文...'></textarea></div><div class='form-actions'><button id='btn-stm-run' class='btn-primary'>运行测试</button></div><div id='stm-result' style='margin-top:12px;padding:12px;background:var(--bg-secondary);border-radius:8px;min-height:60px'><span style='color:var(--text-secondary)'>测试结果将显示在这里</span></div></div></div>";
      document.body.appendChild(modal);
      var self2 = this;
      document.getElementById("stm-close").addEventListener("click", function() { modal.classList.remove("visible"); modal.style.display = "none"; });
      modal.addEventListener("click", function(e) { if (e.target === modal) { modal.classList.remove("visible"); modal.style.display = "none"; } });
      document.getElementById("btn-stm-run").addEventListener("click", function() { self2._runSkillTest(id); });
    }
    document.getElementById("stm-title").textContent = "测试技能 - " + s.name;
    document.getElementById("stm-input").value = "这是一段测试文本，用于验证技能效果。";
    document.getElementById("stm-result").innerHTML = "<span style='color:var(--text-secondary)'>点击运行测试，将通过API发送请求并流式显示结果</span>";
    modal.classList.add("visible");
    modal.style.display = "flex";
  }

  _runSkillTest(skillId) {
    var s = SkillManager.get(skillId);
    if (!s) return;
    var input = document.getElementById("stm-input").value.trim();
    if (!input) { this._toast("请输入测试文本", "error"); return; }
    if (!this.isConfigured) { this._toast(this.getConfigError() || "请先配置API", "error"); return; }
    var resultDiv = document.getElementById("stm-result");
    resultDiv.innerHTML = "<em style='color:var(--text-secondary)'>流式请求中...</em>";
    var prompt = this._renderSkillTemplate(s, "dialogue", {selectedText: input});






    var messages = [{ role: "system", content: "你是技能执行器，请严格按照技能模板执行任务。" }, { role: "user", content: prompt }];
    var self = this;
    var btnRun = document.getElementById("btn-stm-run");
    if (btnRun) { btnRun.disabled = true; btnRun.textContent = "生成中..."; }
    try {
      fetch(self.settings.baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + self.settings.apiKey },
        body: JSON.stringify({ model: self._getSelectedModel(), messages: messages, stream: true }),
        signal: AbortSignal.timeout(120000)
      }).then(function(r) {
        if (!r.ok) throw new Error(r.status + " " + r.statusText);
        var reader = r.body.getReader();
        var decoder = new TextDecoder();
        var fullText = "";
        var buffer = "";
        function pump() {
          reader.read().then(function(chunk) {
            if (chunk.done) {
              resultDiv.innerHTML = "<div style='color:var(--text-primary);white-space:pre-wrap'>" + self._escHtml(fullText || "[空回复]") + "</div>";
             return;
           }
            buffer += decoder.decode(chunk.value, { stream: true });

           var lines = buffer.split("\n"); buffer = lines.pop() || "";
            for (var j = 0; j < lines.length; j++) {
              var line = lines[j].trim();
              if (!line || line.indexOf("data: ") !== 0) continue;
              var d = line.slice(6);
              if (d === "[DONE]") continue;
              try {
                var json = JSON.parse(d);
                var delta = json.choices && json.choices[0] && json.choices[0].delta ? json.choices[0].delta.content : null;
                if (delta) {
                  fullText += delta;
                  resultDiv.innerHTML = "<div style='color:var(--text-primary);white-space:pre-wrap'>" + self._escHtml(fullText) + "</div>";
                  resultDiv.scrollTop = resultDiv.scrollHeight;
                }
              } catch(e2) { console.warn("[WARN]", e2); }
            }
            pump();
          });
        }
        pump();
      }).catch(function(e) {
        resultDiv.innerHTML = "<span style='color:var(--danger)'>[ERR] " + self._escHtml(e.message) + "</span>";
      }).finally(function() {
        if (btnRun) { btnRun.disabled = false; btnRun.textContent = "运行测试"; }
      });
    } catch(e) {
      resultDiv.innerHTML = "<span style='color:var(--danger)'>[ERR] " + self._escHtml(e.message) + "</span>";
      if (btnRun) { btnRun.disabled = false; btnRun.textContent = "运行测试"; }
    }
  }

  renderAgentList() {
    var agents = AgentManager.getAll();
    var self = this;
    var list = document.getElementById("agent-list");
    if (agents.length === 0) { list.innerHTML = "<p class='empty-hint'>暂无智能体，点击上方按钮添加</p>"; return; }
    var html = "";
    agents.forEach(function(a) {
      var providerLabel = "";
      var providers = ProviderManager.getAll();
      for (var pi = 0; pi < providers.length; pi++) {
        if (providers[pi].id === a.provider) { providerLabel = providers[pi].name; break; }
      }
      if (!providerLabel) providerLabel = a.provider || "未绑定供应商";
      var modelLabel = a.model || "未指定模型";
      html += "<div class='agent-card'>";
      html += "<div class='agent-card-header'><span class='agent-card-name'>" + self._escHtml(a.name) + "</span><span class='agent-card-model'>" + self._escHtml(modelLabel) + "</span></div>";
      html += "<div class='agent-card-desc'>" + self._escHtml(a.description || "无描述") + "</div>";
      html += "<div class='agent-card-meta'><span class='agent-card-provider'>供应商: " + self._escHtml(providerLabel) + "</span></div>";
      var isActive = (self.currentAgentId === a.id);
      html += "<div class='agent-card-actions'><button data-a='activate-agent' data-id='" + a.id + "' class='btn-sm " + (isActive ? "btn-primary" : "btn-secondary") + "'>" + (isActive ? "已启用" : "启用") + "</button><button data-a='edit-agent' data-id='" + a.id + "' class='btn-sm btn-secondary'>编辑</button><button data-a='delete-agent' data-id='" + a.id + "' class='btn-sm btn-danger'>删除</button></div>";
      html += "</div>";
    });
    list.innerHTML = html;
  }
showAgentForm(agentId) {
    var af = document.getElementById("agent-form");
    af.classList.remove("modal-hidden");
    af.style.display = "block";
    document.getElementById("agent-list").style.display = "none";
    document.getElementById("btn-add-agent").style.display = "none";
   this._editingAgentId = null;
   this.populateAgentProviderSelect();
   if (agentId) {
     var a = AgentManager.get(agentId);
     if (!a) return;
     this._editingAgentId = a.id;
     document.getElementById("agent-form-title").textContent = "编辑智能体";
     document.getElementById("af-name").value = a.name;
     document.getElementById("af-desc").value = a.description || "";
     document.getElementById("af-prompt").value = a.systemPrompt || "";
     document.getElementById("af-provider").value = a.provider || "";
     document.getElementById("af-model").value = a.model || "";
     document.getElementById("af-temperature").value = a.temperature != null ? a.temperature : 0.7;
     document.getElementById("af-temp-val").textContent = a.temperature != null ? a.temperature : 0.7;
     document.getElementById("af-max-tokens").value = a.maxTokens ;
   } else {
     document.getElementById("agent-form-title").textContent = "新建智能体";
     document.getElementById("af-name").value = "";
     document.getElementById("af-desc").value = "";
     document.getElementById("af-prompt").value = "";
     document.getElementById("af-provider").value = "";
     document.getElementById("af-model").value = "";
     document.getElementById("af-temperature").value = 0.7;
     document.getElementById("af-temp-val").textContent = "0.7";
     document.getElementById("af-max-tokens").value = "";
   }
  }

hideAgentForm() {
    var af = document.getElementById("agent-form");
    af.classList.add("modal-hidden");
    af.style.display = "none";
    document.getElementById("agent-list").style.display = "";
    document.getElementById("btn-add-agent").style.display = "";
    this._editingAgentId = null;
    this.renderAgentList(); this.populateAgentSelect();
  }

  saveAgent() {
    var name = document.getElementById("af-name").value.trim();
    if (!name) { this._toast("请填写智能体名称", "error"); return; }
   var data = {
     name: name,
     description: document.getElementById("af-desc").value.trim(),
     systemPrompt: document.getElementById("af-prompt").value,
     provider: document.getElementById("af-provider").value,
     model: document.getElementById("af-model").value.trim(),
     temperature: parseFloat(document.getElementById("af-temperature").value),
     maxTokens: parseInt(document.getElementById("af-max-tokens").value, 10)
   };
    if (this._editingAgentId) { AgentManager.update(this._editingAgentId, data); }
    else { AgentManager.create(data); }
    this.hideAgentForm();
  }

  async deleteAgent(id) {
    var a = AgentManager.get(id);
   if (!a) return;
    if (!(await this._confirm("确定要删除智能体 [" + a.name + "] 吗？"))) return;
   AgentManager.delete(id);
   this.renderAgentList(); this.populateAgentSelect();
 }

  // Phase 3: 项目列表渲染
  openProjectModal() {
    var list = document.getElementById("project-list");
    var projects = ProjectManager.getAll();
    if (projects.length === 0) { list.innerHTML = "<p class='empty-hint'>暂无项目，点击下方按钮创建</p>"; }
    else {
      var html = "";
      var self = this;
      projects.forEach(function(p) {
        html += "<div class='item-row'><div class='item-info'><div class='item-name'>" + self._escHtml(p.name) + "</div><div class='item-meta'>" + p.updatedAt.slice(0,10) + "</div></div>";
        html += "<div class='item-actions'><button class='btn-sm btn-secondary' data-a='pm-open' data-id='" + p.id + "'>\u6253\u5f00</button><button class='btn-sm btn-danger' data-a='pm-delete' data-id='" + p.id + "'>\u5220\u9664</button></div></div>";
      });
      list.innerHTML = html;
    }
    document.getElementById("project-modal").classList.add("visible");
    document.getElementById("project-modal").style.display = "flex";
  }

  closeProjectModal() { document.getElementById("project-modal").classList.remove("visible"); document.getElementById("project-modal").style.display = "none"; }

  openProject(id) {
    var p = ProjectManager.get(id);
    if (!p) return;
    this.currentProjectId = p.id;
    document.getElementById("current-project-name").textContent = p.name;
    document.getElementById("editor-title").textContent = "未选择章节";
    document.getElementById("editor-content").value = "";
    document.getElementById("editor-content").disabled = true;
    this.currentChapterId = null;
    this.currentVolumeId = null;
    // 标签页系统
    this.renderChapterTree();
    this.closeProjectModal();
  }

  async deleteProject(id) {
    var p = ProjectManager.get(id);
    if (!p) return;
    if (!(await this._confirm("确定要删除项目 [" + p.name + "] 吗？所有章节也将被删除。"))) return;
    ProjectManager.delete(id);
    if (this.currentProjectId === id) { this.currentProjectId = null; this.currentChapterId = null; this.currentVolumeId = null; document.getElementById("current-project-name").textContent = "未选择项目"; document.getElementById("tree-body").innerHTML = "<p class=\u0027empty-hint\u0027>请选择或创建项目</p>"; document.getElementById("editor-content").disabled = true; document.getElementById("editor-content").value = ""; }
    this.openProjectModal();
  }

  showNewProjectForm() {
    document.getElementById("new-project-modal").classList.add("visible");
    document.getElementById("new-project-modal").style.display = "flex";
    document.getElementById("npm-name").value = "";
    document.getElementById("npm-outline").value = "";
  }

  createProject() {
    var name = document.getElementById("npm-name").value.trim();
    if (!name) { this._toast("请输入项目名称", "error"); return; }
    var p = ProjectManager.create({name: name, outline: document.getElementById("npm-outline").value});
    document.getElementById("new-project-modal").classList.remove("visible");
    document.getElementById("new-project-modal").style.display = "none";
    this.openProject(p.id);
  }

 // Phase 3: 章节树
renderChapterTree() {
  var tree = document.getElementById("tree-body");
  if (!this.currentProjectId) {
    if (tree) tree.innerHTML = '<div class="empty-hint">请先创建或打开项目</div>';
    return;
  }
  try {
  // Read from pipeline data (source of truth for tree), fallback to ChapterManager
  var plData = null;
  try { plData = this._plData(); } catch(ePl) { console.warn("[WARN] _plData in renderChapterTree:", ePl); }
  var volumes = (plData && plData.volumes && plData.volumes.length > 0) ? plData.volumes : ChapterManager.getVolumes(this.currentProjectId);
   var html = "";
   var self = this;
   volumes.forEach(function(vol) {
     var isOpen = self.currentVolumeId === vol.id;
     html += "<div class='tree-volume'><div draggable='true' class='tree-volume-header' data-a='toggle-vol' data-id='" + vol.id + "'>";
     html += "<span class='arrow" + (isOpen ? " open" : "") + "'>\u25bc</span> " + vol.name + " (" + vol.chapters.length + "\u7ae0) <button class='tree-vol-btn' data-a='view-vol-outline' data-id='" + vol.id + "' title='\u67e5\u770b\u5377\u7eb2' style='font-size:10px;padding:1px 4px;margin-left:2px;cursor:pointer;background:#3a5a3e;color:#bdf;border-radius:2px'>\u7eb2</button>";
     html += "</div><div draggable='true' class='tree-chapters" + (isOpen ? " open" : "") + "'>";
     vol.chapters.forEach(function(ch) {
       var active = self.currentChapterId === ch.id ? " active" : "";
       html += "<div draggable='true' class='tree-chapter" + active + "' data-a='open-ch' data-vid='" + vol.id + "' data-cid='" + ch.id + "'>" + self._escHtml(ch.title) + " <button class='tree-ch-plot-btn' data-a='view-ch-plot' data-vid='" + vol.id + "' data-cid='" + ch.id + "' title='\u67e5\u770b\u5267\u60c5' style='font-size:9px;padding:0 3px;cursor:pointer;background:#3a4a5e;color:#8bc;border-radius:2px'>\u6897</button>";
       html += "<span class='tree-actions'><button data-a='gen-body' data-vid='" + vol.id + "' data-cid='" + ch.id + "' title='AI生成正文'>✎</button><button data-a='del-ch' data-vid='" + vol.id + "' data-cid='" + ch.id + "'>\u00d7</button></span>";
       html += "</div>";
     });
     html += "<button class='tree-add-btn' data-a='add-ch' data-vid='" + vol.id + "'>+ 添加章节</button>";
     html += "<button class='tree-gen-btn' data-a='gen-ch' data-vid='" + vol.id + "'>AI生成章节</button>";
     html += "</div></div>";
   });
   html += "<button class='tree-add-btn' data-a='add-vol'>+ 添加卷</button>";
   tree.innerHTML = html;
   } catch(e) {
     console.error("[ERR] renderChapterTree failed:", e);
     if (tree) tree.innerHTML = '<div class="error-boundary"><div class="error-title">章节树渲染失败</div><div>' + self._escHtml(e.message||"") + '</div></div>';
   }
 }

  toggleVolume(volId) {
    this.currentVolumeId = this.currentVolumeId === volId ? null : volId;
    this.renderChapterTree();
  }

  // ===== 编辑面板多模式：卷纲纲要/章节剧情/正文 =====
  openVolumeOutline(volId) {
    var volIdx = -1, volName = "", outline = "";
    try {
      var pl = this._plData();
      if (pl && pl.volumes) {
        for (var i = 0; i < pl.volumes.length; i++) {
          if (pl.volumes[i].id === volId) { volIdx = i; volName = pl.volumes[i].name; outline = pl.volumes[i].outline || ""; break; }
        }
      }
    } catch(e) { console.warn("[WARN] openVolumeOutline:", e); }
    if (volIdx < 0) { this._toast("未找到该卷数据", "error"); return; }
    this.editorMode = "vol-outline";
    this.editorContextVolIdx = volIdx;
    this.editorContextChIdx = -1;
    this.currentVolumeId = volId;
    this.currentChapterId = null;
    document.getElementById("editor-title").textContent = volName + " - 卷纲纲要";
    document.getElementById("editor-content").value = outline;
    document.getElementById("editor-content").disabled = false;
    this.updateWordCount();
    this._updateEditorModeBadge();
    this._updateChatContextBar();
    this.renderChapterTree();
  }

  openChapterPlot(volId, chId) {
    var volIdx = -1, chIdx = -1, title = "", plot = "";
    try {
      var pl = this._plData();
      if (pl && pl.volumes) {
        outer: for (var i = 0; i < pl.volumes.length; i++) {
          if (pl.volumes[i].id === volId) {
            volIdx = i;
            for (var j = 0; j < pl.volumes[i].chapters.length; j++) {
              if (pl.volumes[i].chapters[j].id === chId || pl.volumes[i].chapters[j].title === chId) {
                chIdx = j; title = pl.volumes[i].chapters[j].title; plot = pl.volumes[i].chapters[j].plot || ""; break outer;
              }
            }
          }
        }
      }
    } catch(e) { console.warn("[WARN] openChapterPlot:", e); }
    if (chIdx < 0) { this._toast("未找到该章数据", "error"); return; }
    this.editorMode = "ch-plot";
    this.editorContextVolIdx = volIdx;
    this.editorContextChIdx = chIdx;
    this.currentVolumeId = volId;
    this.currentChapterId = chId;
    document.getElementById("editor-title").textContent = title + " - 剧情梗概";
    document.getElementById("editor-content").value = plot;
    document.getElementById("editor-content").disabled = false;
    this.updateWordCount();
    this._updateEditorModeBadge();
    this._updateChatContextBar();
    this.renderChapterTree();
  }

  saveEditorContent() {
    var content = document.getElementById("editor-content").value;
    try {
      var pl = this._plData();
      if (!pl || !pl.volumes) { this._toast("无项目数据", "error"); return; }
      if (this.editorMode === "vol-outline" && this.editorContextVolIdx >= 0) {
        pl.volumes[this.editorContextVolIdx].outline = content;
        this._plPersist(pl);
        this._toast("卷纲已保存", "success");
      } else if (this.editorMode === "ch-plot" && this.editorContextVolIdx >= 0 && this.editorContextChIdx >= 0) {
        pl.volumes[this.editorContextVolIdx].chapters[this.editorContextChIdx].plot = content;
        this._plPersist(pl);
        this._toast("剧情梗概已保存", "success");
      }
    } catch(e) { this._toast("保存失败: " + e.message, "error"); }
  }

  _updateEditorModeBadge() {
    var badge = document.getElementById("editor-mode-badge");
    if (!badge) return;
    var labels = { "vol-outline": "卷纲层", "ch-plot": "章节层", "ch-body": "正文层" };
    badge.textContent = labels[this.editorMode] || "";
    badge.className = "editor-mode-badge mode-" + this.editorMode;
    this._updateToolbarVisibility();
  }

  _updateToolbarVisibility() {
    var isBody = (this.editorMode === "ch-body");
    var hideIds = ["btn-generate-content", "btn-ai-names", "btn-writing-rules", "btn-timeline", "btn-batch-review", "btn-revise", "btn-de-ai"];
    for (var i = 0; i < hideIds.length; i++) {
      var el = document.getElementById(hideIds[i]);
      if (el) el.style.display = isBody ? "" : "none";
    }
    var seps = document.querySelectorAll(".editor-toolbar-sep");
    for (var s = 0; s < seps.length; s++) {
      if (s === 1 || s === 3 || s === 4) seps[s].style.display = isBody ? "" : "none";
    }
  }

  _updateChatContextBar() {
    var bar = document.getElementById("chat-context-bar");
    if (!bar) return;
    var layerLabel = "", targetLabel = "", skillLabel = "";
    try {
      var pl = this._plData();
      if (!pl) return;
      if (this.editorMode === "vol-outline" && this.editorContextVolIdx >= 0) {
        var vol = pl.volumes[this.editorContextVolIdx];
        layerLabel = "卷纲层"; targetLabel = vol ? vol.name : "";
        var sks = pl.s3Skills || [];
        skillLabel = sks.length > 0 ? sks.map(function(id){ var s; try{s=SkillManager.get(id)}catch(e){console.warn("[WARN] catch #27 renderer_v2.js",e);if(window.DiagLogger)DiagLogger.warn("catch","renderer_v2.js #27",e);}; return s?s.name:"" }).filter(Boolean).join(" -> ") : "未绑定";
      } else if (this.editorMode === "ch-plot" && this.editorContextVolIdx >= 0 && this.editorContextChIdx >= 0) {
        var vol2 = pl.volumes[this.editorContextVolIdx];
        var ch = vol2 ? vol2.chapters[this.editorContextChIdx] : null;
        layerLabel = "章节层"; targetLabel = ch ? ch.title : "";
        var sks2 = pl.s4Skills || [];
        skillLabel = sks2.length > 0 ? sks2.map(function(id){ var s; try{s=SkillManager.get(id)}catch(e){console.warn("[WARN] catch #28 renderer_v2.js",e);if(window.DiagLogger)DiagLogger.warn("catch","renderer_v2.js #28",e);}; return s?s.name:"" }).filter(Boolean).join(" -> ") : "未绑定";
      } else if (this.editorMode === "ch-body") {
        layerLabel = "正文层";
        if (this.currentVolumeId && this.currentChapterId) {
          try {
            for (var i = 0; i < pl.volumes.length; i++) {
              if (pl.volumes[i].id === this.currentVolumeId) {
                for (var j = 0; j < pl.volumes[i].chapters.length; j++) {
                  if (pl.volumes[i].chapters[j].id === this.currentChapterId) { targetLabel = pl.volumes[i].chapters[j].title; break; }
                }
              }
            }
          } catch(e){console.warn("[WARN] catch #29 renderer_v2.js",e);if(window.DiagLogger)DiagLogger.warn("catch","renderer_v2.js #29",e);}
        }
        var sks3 = pl.s5Skills || [];
        skillLabel = sks3.length > 0 ? sks3.map(function(id){ var s; try{s=SkillManager.get(id)}catch(e){console.warn("[WARN] catch #30 renderer_v2.js",e);if(window.DiagLogger)DiagLogger.warn("catch","renderer_v2.js #30",e);}; return s?s.name:"" }).filter(Boolean).join(" -> ") : "未绑定";
      }
    } catch(e) { console.warn("[WARN] _updateChatContextBar:", e); }
    bar.innerHTML = "<span class=\"ctx-layer\">" + layerLabel + "</span>" +
      (targetLabel ? "<span class=\"ctx-sep\">|</span><span class=\"ctx-target\">" + this._escHtml(targetLabel) + "</span>" : "") +
      "<span class=\"ctx-sep\">|</span><span class=\"ctx-skills-label\">SKILL:</span><span class=\"ctx-skills\">" + this._escHtml(skillLabel) + "</span>";
  }

  // ===== 标签页系统 =====
  openChapter(volId, chId) {
    var title = null, content = '';
    try {
      var pl = this._plData();
      if (pl && pl.volumes) {
        outer: for (var i2 = 0; i2 < pl.volumes.length; i2++) {
          var pv = pl.volumes[i2];
          if (pv.id === volId || pv.cmId === volId) {
            for (var j = 0; j < pv.chapters.length; j++) {
              if (pv.chapters[j].id === chId || pv.chapters[j].title === chId) {
                title = pv.chapters[j].title;
                content = pv.chapters[j].body || '';
                break outer;
              }
            }
          }
        }
      }
    } catch(e) { console.warn('[WARN] openChapter PL search:', e); }
    if (!title) {
      var ch = ChapterManager.getChapter(this.currentProjectId, volId, chId);
      if (ch) { title = ch.title; content = ch.content || ''; }
    }
    if (!title) { console.warn('[WARN] openChapter: chapter not found', volId, chId); return; }
    this.currentChapterId = chId;
    this.currentVolumeId = volId;
    this.editorMode = "ch-body";
    this.editorContextVolIdx = -1;
    this.editorContextChIdx = -1;
    document.getElementById('editor-title').textContent = title;
    document.getElementById('editor-content').value = content;
    document.getElementById('editor-content').disabled = false;
    this.updateWordCount();
    this._updateEditorModeBadge();
    this._updateChatContextBar();
     this.renderChapterTree();
     this.renderSkillArea();
     try { this._syncTreeToPipeline(); } catch(e) { console.warn('[WARN] sync on openChapter:', e); }
  }  async deleteChapterFromTree(volId, chId) {
    // Prioritize pipeline data - find chapter in PL first
    var plDeleted = false;
    var chTitle = null;
    try {
      var pl = this._plData();
      if (pl && pl.volumes) {
        for (var i = 0; i < pl.volumes.length; i++) {
          if (pl.volumes[i].id === volId || pl.volumes[i].name === volId) {
            for (var j = 0; j < pl.volumes[i].chapters.length; j++) {
              if (pl.volumes[i].chapters[j].id === chId || pl.volumes[i].chapters[j].title === chId) {
                chTitle = pl.volumes[i].chapters[j].title;
                if (!(await this._confirm("确定删除章节 [" + chTitle + "]吗？"))) return;
                pl.volumes[i].chapters.splice(j, 1);
                this._plPersist(pl);
                plDeleted = true;
                break;
              }
            }
            break;
          }
        }
      }
    } catch(e) { console.warn("[WARN] delete from pipeline:", e); }
    // Also delete from ChapterManager if exists
    var cmCh = ChapterManager.getChapter(this.currentProjectId, volId, chId);
    if (cmCh) {
      if (!plDeleted) { if (!(await this._confirm("确定删除章节 [" + cmCh.title + "]吗？"))) return; }
      ChapterManager.deleteChapter(this.currentProjectId, volId, chId);
    }
    try { this._syncTreeToPipeline(); } catch(e) { console.warn("[WARN] sync after delete:", e); }
    if (this.currentChapterId === chId) { this.currentChapterId = null; this.currentVolumeId = volId; document.getElementById("editor-content").disabled = true; document.getElementById("editor-content").value = ""; document.getElementById("editor-title").textContent = "未选择章节"; }
    this.renderChapterTree();
  }
    showVolumeForm(volId) {
    if (!this.currentProjectId) { this._toast("请先创建或打开项目", "error"); return; }
    this._editingVolumeId = volId || null;
    var modal = document.getElementById("volume-modal");
    if (volId) {
      // Try pipeline data first, fallback to ChapterManager
      var v = null;
      try {
        var pl = this._plData();
        if (pl && pl.volumes) {
          var plVol = pl.volumes.find(function(pv) { return pv.id === volId || pv.name === volId; });
          if (plVol) v = { name: plVol.name, outline: plVol.outline || plVol.summary || "", chapters: plVol.chapters || [], chapterCount: (plVol.chapters || []).length || 10 };
        }
      } catch(e) { console.warn("[WARN] read volume from pipeline:", e); }
      if (!v) v = ChapterManager.getVolume(this.currentProjectId, volId);
      if (!v) return;
      document.getElementById("vm-title").textContent = "编辑卷";
      document.getElementById("vm-name").value = v.name;
      document.getElementById("vm-outline").value = v.outline || "";
      document.getElementById("vm-chapter-count").value = v.chapterCount || 10;
      document.getElementById("vm-chapter-count-group").style.display = v.chapters.length === 0 ? "" : "none";
    } else {
      document.getElementById("vm-title").textContent = "新建卷";
      document.getElementById("vm-name").value = "";
      document.getElementById("vm-outline").value = "";
      document.getElementById("vm-chapter-count").value = "10";
      document.getElementById("vm-chapter-count-group").classList.add("visible");
    }
    modal.style.display = "flex";
    modal.classList.add("visible");
  }
  saveVolume() {
    var name = document.getElementById("vm-name").value.trim();
    if (!name) { this._toast("请输入卷名称", "error"); return; }
    var count = parseInt(document.getElementById("vm-chapter-count").value) || 10;
    var data = { name: name, outline: document.getElementById("vm-outline").value, chapterCount: count };
    if (this._editingVolumeId) {
      ChapterManager.updateVolume(this.currentProjectId, this._editingVolumeId, data);
      try { this._syncVolumeEdit(this._editingVolumeId, data); } catch(e) { console.warn('[WARN] sync volume edit:', e); }
    } else {
      var v = ChapterManager.createVolume(this.currentProjectId, data);
      try { this._syncTreeToPipeline(); } catch(e) { console.warn('[WARN] sync after create volume:', e); }
      ChapterManager.generateChapters(this.currentProjectId, v.id, count);
    }
    document.getElementById("volume-modal").classList.remove("visible");
    document.getElementById("volume-modal").style.display = "none";
    this.renderChapterTree();
  }

    addChapter(volId) {
    if (!this.currentProjectId) { this._toast("请先创建或打开项目", "error"); return; }
    // Prioritize pipeline data - add chapter to PL first
    try {
      var pl = this._plData();
      if (pl && pl.volumes) {
        for (var i = 0; i < pl.volumes.length; i++) {
          if (pl.volumes[i].id === volId || pl.volumes[i].name === volId) {
            var newCh = { id: "ch_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6), title: "新章节", plot: "", summary: "", body: "", bodyGenerated: false, wordCount: pl.chapterWordCount || 2000, confirmed: true };
            pl.volumes[i].chapters.push(newCh);
            this._plPersist(pl);
            break;
          }
        }
      }
    } catch(e) { console.warn("[WARN] add chapter to pipeline:", e); }
    // Also add to ChapterManager
    var cmVol = ChapterManager.getVolume(this.currentProjectId, volId);
    if (cmVol) {
      ChapterManager.createChapter(this.currentProjectId, volId, { title: "新章节" });
    } else {
      try { this._syncTreeToPipeline(); } catch(e) { console.warn("[WARN] sync before add:", e); }
      cmVol = ChapterManager.getVolume(this.currentProjectId, volId);
      if (cmVol) ChapterManager.createChapter(this.currentProjectId, volId, { title: "新章节" });
    }
    this.currentVolumeId = volId;
    try { this._syncTreeToPipeline(); } catch(e) { console.warn("[WARN] sync after add chapter:", e); }
    this.renderChapterTree();
  }
  // Phase 3: 字数统计 + 自动保存
  updateWordCount() {
    var text = document.getElementById("editor-content").value;
    var count = text.replace(/\s/g, "").length;
    document.getElementById("word-count").textContent = count + " 字";
  }

  // Returns save status info for the exit confirmation dialog
  getSaveStatusInfo() {
    return {
      hasProject: !!this.currentProjectId,
      lastSaveTime: this._lastSaveTime ? new Date(this._lastSaveTime).toLocaleTimeString('zh-CN') : null,
      projectCount: (typeof ProjectManager !== 'undefined' && ProjectManager.getAll) ? ProjectManager.getAll().length : 0
    };
  }

autoSave() {
    this._lastSaveTime = Date.now();
  if (!this.currentProjectId || !this.currentVolumeId || !this.currentChapterId) return;
  var content = document.getElementById('editor-content').value;
  var saved = false;
  try {
    var pl = this._plData();
    if (pl && pl.volumes) {
      outer: for (var i2 = 0; i2 < pl.volumes.length; i2++) {
        var pv = pl.volumes[i2];
        if (pv.id === this.currentVolumeId || pv.cmId === this.currentVolumeId) {
          for (var j = 0; j < pv.chapters.length; j++) {
            if (pv.chapters[j].id === this.currentChapterId || pv.chapters[j].title === this.currentChapterId) {
              pv.chapters[j].body = content;
              pv.chapters[j].bodyGenerated = content.length > 0;
              pv.chapters[j].updatedAt = new Date().toISOString();
              saved = true;
              break outer;
            }
          }
        }
      }
    }
    if (saved) this._plPersist(pl);
  } catch(e) { console.warn('[WARN] autoSave to PL:', e); }
  try {
    ChapterManager.updateChapter(this.currentProjectId, this.currentVolumeId, this.currentChapterId, { content: content });
  } catch(e) { console.warn('[WARN] autoSave to CM:', e); }
}
  // Periodic auto-save every 30 seconds (crash recovery)
  _startAutoSaveTimer() {
    var self = this;
    if (this._autoSaveTimer) clearInterval(this._autoSaveTimer);
    this._autoSaveTimer = setInterval(function() { self.autoSave(); }, 30000);
  }

  _stopAutoSaveTimer() {
    if (this._autoSaveTimer) { clearInterval(this._autoSaveTimer); this._autoSaveTimer = null; }
  }

  // 技能区精简显示：当前 Agent + 已启用 Skills
renderSkillArea() {
    try {
      var hasProject = !!this.currentProjectId;
      var el = document.getElementById("skill-list-active");
      if (!el) { this.renderAgentInfo(); return; }
      if (!hasProject) {
        el.innerHTML = '<span style="color:var(--text-muted);font-style:italic">请先创建或打开项目</span>';
        this.renderAgentInfo();
        return;
      }
      // Collect active skills from pipeline data + context skills
      var activeIds = {};
      var plData = null;
      try { plData = this._plData(); } catch(e) { console.warn("[WARN]", e); }
      if (plData) {
        if (plData.s1Skills) plData.s1Skills.forEach(function(id) { activeIds[id] = true; });
        if (plData.s2Skills) plData.s2Skills.forEach(function(id) { activeIds[id] = true; });
        if (plData.s3Skills) plData.s3Skills.forEach(function(id) { activeIds[id] = true; });
        if (plData.s4Skills) plData.s4Skills.forEach(function(id) { activeIds[id] = true; });
        if (plData.s5Skills) plData.s5Skills.forEach(function(id) { activeIds[id] = true; });
      }
      // Also include context skills (bound to current chapter/volume)
      var ctxSkills = this.getContextSkills();
      ctxSkills.forEach(function(s) { if (s && s.id) activeIds[s.id] = true; });
      var ids = Object.keys(activeIds);
      if (ids.length === 0) {
        el.innerHTML = '<span style="color:var(--text-muted)">未启用技能</span>';
      } else {
        el.innerHTML = ids.map(function(id) {
          var sk = SkillManager.get(id);
          if (!sk) return '';
          return '<span style="display:inline-flex;align-items:center;gap:2px;margin-right:6px" title="' + (sk.description||"") + '"><span style="color:var(--success);font-size:10px">' + "●" + '</span> ' + sk.name + '</span>';
        }).join("");
      }
      this.renderAgentInfo();
    } catch(e) {
      console.error("[ERR] renderSkillArea failed:", e);
    }
  }

 renderAgentInfo() {
   var bar = document.getElementById("agent-info-bar");
   if (!bar) return;
   var plAgentId = null;
    try { var pl = this._plData(); if (pl && pl.agentId) plAgentId = pl.agentId; } catch(e){console.warn("[WARN] catch #31 renderer_v2.js",e);if(window.DiagLogger)DiagLogger.warn("catch","renderer_v2.js #31",e);}
    var activeAgentId = this.currentAgentId || plAgentId;
    if (!activeAgentId) {
    bar.style.display = "block";
    var cfgHint = this.isConfigured ? "" : " (API未配置)";
    bar.innerHTML = '<span style="color:var(--text-muted);font-size:12px">未选择智能体' + this._escHtml(cfgHint) + '，请在设置中配置</span>';
    return;
  }
   var a = AgentManager.get(activeAgentId);
   if (!a) {
    bar.style.display = "block";
    bar.innerHTML = '<span style="color:var(--text-muted);font-size:12px">智能体数据丢失，请重新选择</span>';
    return;
  }
   var self = this;
   bar.style.display = "block";
   var name = a.name || "";
    var model = a.model || this.settings.model || "";
    var provider = "";
    var p = ProviderManager.getAll().find(function(pr) { return pr.id === a.provider; });
    if (p) provider = p.name;
    var isActive = this.isConfigured ? "active" : "inactive";
    var dotColor = this.isConfigured ? "#4caf88" : "#565660";
    var html = '<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">';
    html += '<span style="color:' + dotColor + ';font-size:14px">' + (this.isConfigured ? "\u25CF" : "\u25CB") + '</span>';
    html += '<span style="color:var(--accent);font-weight:bold;font-size:11px">' + self._escHtml(name) + '</span>';
    if (provider) html += '<span style="color:var(--text-muted);font-size:10px">' + self._escHtml(provider) + '</span>';
    if (model) html += '<span style="color:var(--text-muted);font-size:10px">' + self._escHtml(model) + '</span>';
    html += '</div>';
    bar.innerHTML = html;
  }

 _getBoundSettingsForContext(volId, chId) {
    var _p = this._getProjectData(); if (!_p || !_p.settingsCollection) return "";
    var sc = _p.settingsCollection;
   var contextIds = [];
    if (volId) contextIds.push(volId);
    if (chId) contextIds.push(chId);
    if (contextIds.length === 0) {
      // No specific context: include all settings
      var allText = "";
      var cats = sc.categories || Object.keys(sc.items);
      for (var c = 0; c < cats.length; c++) {
        var items = sc.items[cats[c]] || [];
        for (var i = 0; i < items.length; i++) {
          var it = items[i];
          allText += "\n[" + (cats[c]) + "] " + (it.name || "") + ": ";
          var keys = Object.keys(it.attrs || {});
          for (var k = 0; k < keys.length; k++) { allText += keys[k] + "=" + it.attrs[keys[k]] + " "; }
        }
      }
      return allText;
    }
    // Filter by bound targets matching volId/chId
    var result = "";
    var cats2 = sc.categories || Object.keys(sc.items);
    for (var c2 = 0; c2 < cats2.length; c2++) {
      var items2 = sc.items[cats2[c2]] || [];
      for (var i2 = 0; i2 < items2.length; i2++) {
        var item = items2[i2];
        var targets = item.bindTargets || [];
        var matched = false;
        for (var t = 0; t < targets.length; t++) {
          if (contextIds.indexOf(targets[t]) >= 0) { matched = true; break; }
        }
        if (matched) {
          result += "\n[" + (cats2[c2]) + "] " + (item.name || "") + ": ";
          var ks = Object.keys(item.attrs || {});
          for (var kk = 0; kk < ks.length; kk++) { result += ks[kk] + "=" + item.attrs[ks[kk]] + " "; }
        }
      }
    }
    // Also include unbound settings as general constraints
    var genResult = "";
    for (var c3 = 0; c3 < cats2.length; c3++) {
      var items3 = sc.items[cats2[c3]] || [];
      for (var i3 = 0; i3 < items3.length; i3++) {
        var item3 = items3[i3];
        var targets3 = item3.bindTargets || [];
        if (targets3.length === 0) {
          genResult += "\n[" + (cats2[c3]) + "] " + (item3.name || "") + ": ";
          var ks3 = Object.keys(item3.attrs || {});
          for (var kk3 = 0; kk3 < ks3.length; kk3++) { genResult += ks3[kk3] + "=" + item3.attrs[ks3[kk3]] + " "; }
        }
      }
    }
    if (genResult) result = "\n[通用约束]" + genResult + result;
    return result;
  }

  // 生成模式：AI根据上下文生成章节内容
  async generateContent() {
    if (this.editorMode && this.editorMode !== "ch-body") { this._toast("当前是" + (this.editorMode === "vol-outline" ? "卷纲纲要" : "章节剧情") + "模式，请点击章节进入正文编辑后再生成", "warning"); return; }
    if (!this.currentChapterId) { this._toast("请先在左侧选择一个章节", "error"); return; }
    if (!this.isConfigured) { this._toast(this.getConfigError() || "请先配置API设置", "error"); return; }
    var ch = ChapterManager.getChapter(this.currentProjectId, this.currentVolumeId, this.currentChapterId);
    if (!ch) return;
    var proj = ProjectManager.get(this.currentProjectId);
    var pl = null;
    try { pl = this._plData(); } catch(e) { console.warn("[WARN]", e); }
    var outline = (pl && pl.outlineText) || (proj ? (proj.outline || "") : "");
    var settingsText = this._getBoundSettingsForContext(this.currentVolumeId, this.currentChapterId);
    var volInfo = "";
    var volumes = (pl && pl.volumes.length > 0) ? pl.volumes : (ChapterManager.getVolumes(this.currentProjectId) || []);
    for (var vi = 0; vi < volumes.length; vi++) {
      if (volumes[vi].id === this.currentVolumeId || String(vi) === this.currentVolumeId || String(vi+1) === this.currentVolumeId) {
        volInfo = volumes[vi].name + " - " + (volumes[vi].outline || volumes[vi].summary || "");
        break;
      }
    }
    var wordCount = (pl && pl.chapterWordCount) || 2000;
    var params = "[全书大纲]\n" + outline + "\n\n[设定合集]\n" + settingsText + "\n\n[当前卷概要]\n" + volInfo + "\n\n[当前章节剧情点]\n" + ch.title + " - " + (ch.outline || ch.summary || ch.plot || "") + "\n\n请为本章节生成约" + wordCount + "字的正文内容。";
    var opts = { agentId: pl ? pl.agentId : null, skillIds: (pl && pl.s5Skills) || [], wordsPerChapter: (pl && pl.chapterWordCount) || 0 };
    if (!(await this._confirm("将使用AI生成章节[" + ch.title + "]的内容，当前编辑器内容将被覆盖。确定继续吗？"))) return;
    this._showLoading("AI生成中...");
    var self = this;
    this.apiGenerate("body", params, function(chunk) {
      document.getElementById("editor-content").value = chunk;
      self.updateWordCount();
    }, opts).then(function(text) {
      self._hideLoading();
      if (text) {
        document.getElementById("editor-content").value = text;
        self.updateWordCount();
        self.autoSave();
      } else {
        self._toast("生成失败，请检查API配置", "error");
      }
    }).catch(function(err) {
      self._hideLoading();
      self._toast("生成失败: " + (err.message||err), "error");
    });
  }

  // 导出当前章节为Markdown文件
  // 导出章节（支持多种格式）
  exportChapter(format) {
    format = format || "md";
    if (!this.currentChapterId) { this._toast("请先选择一个章节", "error"); return; }
    var ch = ChapterManager.getChapter(this.currentProjectId, this.currentVolumeId, this.currentChapterId);
    if (!ch) return;
    var content = ch.content || "";
    var title = ch.title || "未命名章节";
    var safeName = title.replace(/[\\\\/:*?"<>|]/g, "_");
    var blob; var ext;
    
    if (format === "txt") {
      var txt = title + "\n\n" + content;
      blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
      ext = ".txt";
    } else if (format === "epub") {
      var epub = this._buildEpub(title, content);
      blob = new Blob([epub], { type: "application/epub+zip" });
      ext = ".epub";
    } else {
      var md = "# " + title + "\n\n" + content;
      blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
      ext = ".md";
    }
    
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = safeName + ext;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // 构建基本 EPUB（HTML 打包）
  _buildEpub(title, content) {
    var html = "<!DOCTYPE html><html><head><meta charset=\u0022UTF-8\u0022><title>" + title + "</title></head><body><h1>" + title + "</h1>" + content.replace(/\n/g, "<br>") + "</body></html>";
    return html;
  }

  // ===== 设定合集 =====
  _scCatMap = { characters: "角色设定", worldview: "世界观设定", species: "物种设定", items: "物资设定" };
  _escHtml(str) { return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;"); }

  /* ===== P1-13: Pause/Resume Generation ===== */
  _isPaused = false;
  _resumeResolver = null;

  async _waitIfPaused() {
    if (!this._isPaused) return;
    return new Promise(function(resolve) { this._resumeResolver = resolve; }.bind(this));
  }

  /* ===== P1-4: AI Diff Component ===== */
 _showDiffView(original, modified) {
   var modal = document.getElementById("diff-modal");
   if (!modal) return;
   modal.style.display = "flex";
   var origEl = document.getElementById("diff-original");
   var modEl = document.getElementById("diff-modified");
   if (!origEl || !modEl) return;
   var self = this;
   var origLines = (original || "").split("\n");
   var modLines = (modified || "").split("\n");
    origEl.innerHTML = origLines.map(function(l) { return "<div class=\"diff-line removed\">" + self._escHtml(l) + "</div>"; }).join("");
    modEl.innerHTML = modLines.map(function(l) { return "<div class=\"diff-line added\">" + self._escHtml(l) + "</div>"; }).join("");
    this._diffOriginal = original;
    this._diffModified = modified;
    var countEl = document.getElementById("diff-count");
    if (countEl) countEl.textContent = Math.abs(modLines.length - origLines.length) + " 处变更";
  }

  _closeDiffView() {
    var modal = document.getElementById("diff-modal");
    if (modal) modal.style.display = "none";
  }

  /* ===== P1-2 + P1-3: AI Inline Action ===== */
  _aiInlineAction(action, selectedText) {
    var prompts = {
      rewrite: "请改写以下内容，保持原意但用不同的表达方式：\n\n",
      expand: "请扩写以下内容，增加细节和描写，保持原有方向：\n\n",
      polish: "请润色以下内容，提升文笔和文学性，保持原意：\n\n",
      continue: "请续写以下内容，保持风格和方向一致：\n\n",
      condense: "请精简以下内容，去除冗余，保持核心信息：\n\n"
    };
    var labels = { rewrite: "改写", expand: "扩写", polish: "润色", continue: "续写", condense: "精简" };
    var prompt = (prompts[action] || "请处理以下内容：") + selectedText;
    // Fill the chat input and switch to chat
    var input = document.getElementById("user-input");
    if (input) { input.value = prompt; }
    this._inlineActionContext = { action: action, originalText: selectedText };
    // Auto-send
    this.sendMessage();
  }

  /* ===== P1-11: Undo/Redo ===== */
  _undoStack = [];
  _redoStack = [];
  _maxUndo = 50;
  _lastEditorSnapshot = "";

  _pushUndoState() {
    var editor = document.getElementById("editor-content");
    if (!editor) return;
    var val = editor.value;
    if (val === this._lastEditorSnapshot) return;
    this._undoStack.push(this._lastEditorSnapshot);
    if (this._undoStack.length > this._maxUndo) this._undoStack.shift();
    this._redoStack = [];
    this._lastEditorSnapshot = val;
  }

  _undo() {
    if (this._undoStack.length === 0) return;
    var editor = document.getElementById("editor-content");
    if (!editor) return;
    this._redoStack.push(editor.value);
    editor.value = this._undoStack.pop();
    this._lastEditorSnapshot = editor.value;
    this.updateWordCount();
  }

  _redo() {
    if (this._redoStack.length === 0) return;
    var editor = document.getElementById("editor-content");
    if (!editor) return;
    this._undoStack.push(editor.value);
    editor.value = this._redoStack.pop();
    this._lastEditorSnapshot = editor.value;
    this.updateWordCount();
  }

  /* ===== P0 Components: Progress Bar ===== */
  /* ===== P0 Components: Spinner ===== */
  /* ===== P0 Components: Confirm Dialog ===== */
  _confirm(message, title) {
    var self = this;
    return new Promise(function(resolve) {
      var backdrop = document.createElement('div');
      backdrop.className = 'confirm-backdrop';
      var dialog = document.createElement('div');
      dialog.className = 'confirm-dialog';
      dialog.innerHTML = '<div class="confirm-title">' + self._escHtml(title || '确认') + '</div><div class="confirm-message">' + self._escHtml(message) + '</div><div class="confirm-actions"><button class="btn-sm btn-secondary" data-act="cancel">取消</button><button class="btn-sm btn-primary" data-act="ok">确定</button></div>';
      backdrop.appendChild(dialog);
      document.body.appendChild(backdrop);
      dialog.querySelector('[data-act="ok"]').onclick = function() { backdrop.remove(); resolve(true); };
      dialog.querySelector('[data-act="cancel"]').onclick = function() { backdrop.remove(); resolve(false); };
      backdrop.onclick = function(e) { if (e.target === backdrop) { backdrop.remove(); resolve(false); } };
    });
  }

  /* ===== P0 Components: Empty State ===== */
  /* ===== P1-14: JSON Repair ===== */
  _repairJson(str) {
    if (!str) return null;
    str = str.trim();
    if (str.startsWith("```")) { str = str.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, ""); }
   str = str.replace(/,\s*([\]})])/g, "$1");
    var arrStart = str.indexOf("[");
    var arrEnd = str.lastIndexOf("]");
    var objStart = str.indexOf("{");
    var objEnd = str.lastIndexOf("}");
    if (arrStart >= 0 && arrEnd > arrStart && (objStart < 0 || arrStart < objStart)) {
      str = str.substring(arrStart, arrEnd + 1);
    } else if (objStart >= 0 && objEnd > objStart) {
      str = str.substring(objStart, objEnd + 1);
    }
   str = str.replace(/[\x00-\x1F]/g, function(ch) { return ch === "\n" || ch === "\r" || ch === "\t" ? ch : ""; });
    try { return JSON.parse(str); } catch(e) {
      str = str.replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
      try { return JSON.parse(str); } catch(e2) { return null; }
    }
  }

  _toast(msg, type) {
    if (typeof Notyf !== "undefined" && this._notyf) {
     this._notyf.open({ type: type || "success", message: msg });
   } else {
      var tag = type === "error" ? "[ERR]" : type === "success" ? "[OK]" : "[INFO]";
      var t = document.getElementById("dom-toast");
      if (!t) { t = document.createElement("div"); t.id = "dom-toast"; t.style.cssText = "position:fixed;bottom:20px;right:20px;z-index:99999;padding:10px 16px;border-radius:6px;background:#333;color:#fff;font-size:14px;max-width:360px;box-shadow:0 4px 12px rgba(0,0,0,0.3);transition:opacity 0.3s;"; document.body.appendChild(t); }
      t.textContent = (type === "error" ? "[ERR] " : "") + msg;
      t.style.opacity = "1";
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(function() { t.style.opacity = "0"; }, 3000);
   }
  }

  _showLoading(msg) {
    var el = document.getElementById("loading-indicator");
    var txt = document.getElementById("loading-text");
    if (el) { el.style.display = "flex"; }
    if (txt) { txt.textContent = msg || "处理中..."; }
  }
 _hideLoading() {
   var el = document.getElementById("loading-indicator");
    if (el) { el.style.display = "none"; el.classList.remove("visible"); }
 }
 _setBtnLoading(btn, loading) {
   if (!btn) return;
   if (loading) {
     btn.classList.add("btn-loading");
     btn.disabled = true;
   } else {
    btn.classList.remove("btn-loading");
     btn.disabled = false;
   }
 }

  _openFindBar() {
    var bar = document.getElementById("find-replace-bar");
    bar.classList.add("visible");
    document.getElementById("find-input").value = "";
    document.getElementById("replace-input").value = "";
    document.getElementById("find-count").textContent = "";
    document.getElementById("find-input").focus();
    this.findMatches = [];
    this.findIndex = -1;
    var self = this;
    if (this._findBarListenersAdded) return;
    this._findBarListenersAdded = true;
    document.getElementById("find-input").addEventListener("input", function() { self._doFind(); });
    document.getElementById("find-input").addEventListener("keydown", function(e) { if (e.key === "Enter") { e.preventDefault(); e.shiftKey ? self._findPrev() : self._findNext(); } });
    document.getElementById("btn-find-next").addEventListener("click", function() { self._findNext(); });
    document.getElementById("btn-find-prev").addEventListener("click", function() { self._findPrev(); });
    document.getElementById("btn-replace-one").addEventListener("click", function() { self._replaceOne(); });
    document.getElementById("btn-replace-all").addEventListener("click", function() { self._replaceAll(); });
    document.getElementById("btn-find-close").addEventListener("click", function() { self._closeFindBar(); });
  }

  _closeFindBar() {
    var bar = document.getElementById("find-replace-bar");
    bar.classList.remove("visible");
    this._clearHighlights();
    this.findMatches = [];
    this.findIndex = -1;
  }

  _doFind() {
    this._clearHighlights();
    var q = document.getElementById("find-input").value;
    var ed = document.getElementById("editor-content");
    if (!q) { this.findMatches = []; this.findIndex = -1; document.getElementById("find-count").textContent = ""; return; }
    var text = ed.value;
    this.findMatches = [];
    var idx = 0;
    var qlen = q.length;
    while ((idx = text.indexOf(q, idx)) !== -1) {
      this.findMatches.push(idx);
      idx += qlen;
    }
    this.findIndex = this.findMatches.length > 0 ? 0 : -1;
    document.getElementById("find-count").textContent = this.findMatches.length > 0 ? (this.findIndex + 1) + "/" + this.findMatches.length : "0/0";
    if (this.findMatches.length > 0) {
      ed.focus();
      ed.setSelectionRange(this.findMatches[0], this.findMatches[0] + qlen);
      ed.scrollTop = 0;
    }
  }

  _findNext() {
    if (this.findMatches.length === 0) return;
    this.findIndex = (this.findIndex + 1) % this.findMatches.length;
    this._selectMatch();
  }

  _findPrev() {
    if (this.findMatches.length === 0) return;
    this.findIndex = (this.findIndex - 1 + this.findMatches.length) % this.findMatches.length;
    this._selectMatch();
  }

  _selectMatch() {
    var q = document.getElementById("find-input").value;
    var ed = document.getElementById("editor-content");
    var pos = this.findMatches[this.findIndex];
    ed.focus();
    ed.setSelectionRange(pos, pos + q.length);
    document.getElementById("find-count").textContent = (this.findIndex + 1) + "/" + this.findMatches.length;
    var lineHeight = 20;
    var linesBefore = ed.value.substring(0, pos).split("\n").length;
    ed.scrollTop = Math.max(0, (linesBefore - 3) * lineHeight);
  }

  _replaceOne() {
    if (this.findMatches.length === 0) return;
    var q = document.getElementById("find-input").value;
    var rp = document.getElementById("replace-input").value;
    var ed = document.getElementById("editor-content");
    var pos = this.findMatches[this.findIndex];
    ed.value = ed.value.substring(0, pos) + rp + ed.value.substring(pos + q.length);
    this._doFind();
  }

  _replaceAll() {
    var q = document.getElementById("find-input").value;
    var rp = document.getElementById("replace-input").value;
    var ed = document.getElementById("editor-content");
    if (!q) return;
    var count = this.findMatches.length;
    ed.value = ed.value.split(q).join(rp);
    this._doFind();
  }

  _clearHighlights() {
  }

 _copyMessage(idx) {
   try {
     var msg = this.messages[idx];
     if (!msg) return;
     navigator.clipboard.writeText(msg.text).then(function() {
       window.showToast("success", "已复制到剪贴板");
     }).catch(function() {
       var ta = document.createElement("textarea");
       ta.value = msg.text;
       document.body.appendChild(ta);
       ta.select();
       document.execCommand("copy");
       document.body.removeChild(ta);
       window.showToast("success", "已复制到剪贴板");
     });
   } catch(e) { console.error("[copyMessage]", e); window.showToast("error", "复制失败: " + e.message); }
 }

 _regenerateMessage(idx) {
   try {
     var msg = this.messages[idx];
     if (!msg || msg.role === "user" || this.isStreaming) return;
     // Find the last user message before this AI message
     var userText = "";
     for (var i = idx - 1; i >= 0; i--) {
       if (this.messages[i].role === "user") { userText = this.messages[i].text; break; }
     }
     if (!userText) { window.showToast("warning", "找不到对应的用户消息"); return; }
     // Remove this AI message and any messages after it
     var oldMsgs = this.messages.splice(idx);
     oldMsgs.forEach(function(m) {
       if (m.el && m.el.parentNode) m.el.parentNode.removeChild(m.el);
     });
     // Re-send
     this.setStreaming(true);
     var aiMsg = this.addMessage("ai", "", true);
     var self = this;
     this.streamChat(userText, aiMsg).then(function() {
       self.setStreaming(false);
    }).catch(function(err) {
       aiMsg.el.querySelector('.message-content').textContent = "[ERR] " + err.message;
      aiMsg.el.classList.remove("streaming-cursor");
      self.setStreaming(false);
    });
   } catch(e) { console.error("[regenerateMessage]", e); window.showToast("error", "重新生成失败: " + e.message); }
 }

 _applyToEditor(idx) {
   try {
     var msg = this.messages[idx];
     if (!msg || msg.role === "user") return;
     var editor = document.getElementById("editor-content");
     if (!editor) { window.showToast("error", "编辑器不可用"); return; }
     if (editor.disabled) { window.showToast("error", "请先打开一个章节"); return; }
     var text = msg.text || "";
     if (!text) { window.showToast("warning", "消息内容为空"); return; }
     var start = editor.selectionStart;
     var end = editor.selectionEnd;
     var val = editor.value;
     if (start !== end) {
       editor.value = val.substring(0, start) + text + val.substring(end);
       editor.selectionStart = editor.selectionEnd = start + text.length;
     } else {
       editor.value = val.substring(0, start) + text + val.substring(start);
       editor.selectionStart = editor.selectionEnd = start + text.length;
     }
     editor.dispatchEvent(new Event("input"));
    window.showToast("success", "已应用到编辑器");
   } catch(e) { console.error("[applyToEditor]", e); window.showToast("error", "应用失败: " + e.message); }
 }

  _lcsDiff(a, b) {
    var aLines = a.split("\n");
    var bLines = b.split("\n");
    var n = aLines.length, m = bLines.length;
    var dp = [];
    for (var i = 0; i <= n; i++) dp.push(new Array(m + 1).fill(0));
    for (var i = n - 1; i >= 0; i--) {
      for (var j = m - 1; j >= 0; j--) {
        dp[i][j] = aLines[i] === bLines[j] ? dp[i+1][j+1] + 1 : Math.max(dp[i+1][j], dp[i][j+1]);
      }
    }
    var changes = [];
    var i = 0, j = 0;
    while (i < n && j < m) {
      if (aLines[i] === bLines[j]) { changes.push({type:"unchanged", text:aLines[i]}); i++; j++; }
      else if (dp[i+1][j] >= dp[i][j+1]) { changes.push({type:"removed", text:aLines[i]}); i++; }
      else { changes.push({type:"added", text:bLines[j]}); j++; }
    }
    while (i < n) { changes.push({type:"removed", text:aLines[i]}); i++; }
    while (j < m) { changes.push({type:"added", text:bLines[j]}); j++; }
    return changes;
  }

  _renderDiff() {
    var origEl = document.getElementById("diff-original");
    var modEl = document.getElementById("diff-modified");
    var countEl = document.getElementById("diff-count");
    if (!origEl || !modEl) return;
    origEl.innerHTML = "";
    modEl.innerHTML = "";
    var changeIdx = 0;
    var self = this;
    this._diffChanges.forEach(function(c) {
      if (c.type !== "unchanged") {
        var idx = changeIdx;
        var oLine = document.createElement("div");
        oLine.className = "diff-line " + (c.type === "removed" ? "removed" : "unchanged");
        oLine.textContent = c.type === "removed" ? c.text : "";
        if (c.type === "removed") {
          oLine.dataset.idx = idx;
          var rej = document.createElement("span");
          rej.className = "diff-action reject";
          rej.textContent = "x";
          rej.onclick = function() { self._rejectDiffLine(idx); };
          oLine.appendChild(rej);
        }
        origEl.appendChild(oLine);
        var mLine = document.createElement("div");
        mLine.className = "diff-line " + (c.type === "added" ? "added" : "unchanged");
        mLine.textContent = c.type === "added" ? c.text : "";
        if (c.type === "added") {
          mLine.dataset.idx = idx;
          var acc = document.createElement("span");
          acc.className = "diff-action accept";
          acc.textContent = "v";
          acc.onclick = function() { self._acceptDiffLine(idx); };
          mLine.appendChild(acc);
        }
        modEl.appendChild(mLine);
        changeIdx++;
      } else {
        var oLine2 = document.createElement("div");
        oLine2.className = "diff-line unchanged";
        oLine2.textContent = c.text;
        origEl.appendChild(oLine2);
        var mLine2 = document.createElement("div");
        mLine2.className = "diff-line unchanged";
        mLine2.textContent = c.text;
        modEl.appendChild(mLine2);
      }
    });
    if (countEl) countEl.textContent = changeIdx + " 处变更";
    this._diffChangeCount = changeIdx;
  }

  _acceptDiffLine(idx) {
    this._diffAccepted[idx] = true;
    document.querySelectorAll('.diff-line[data-idx="' + idx + '"]').forEach(function(el) {
      el.style.opacity = "0.5";
      el.style.textDecoration = "line-through";
    });
  }

  _rejectDiffLine(idx) {
    this._diffAccepted[idx] = false;
    document.querySelectorAll('.diff-line[data-idx="' + idx + '"]').forEach(function(el) {
      el.style.opacity = "0.3";
    });
  }

  _buildDiffResult() {
    var result = [];
    var changeIdx = 0;
    for (var i = 0; i < this._diffChanges.length; i++) {
      var c = this._diffChanges[i];
      if (c.type === "unchanged") { result.push(c.text); }
      else if (c.type === "added") {
        if (this._diffAccepted[changeIdx] !== false) result.push(c.text);
        changeIdx++;
      } else if (c.type === "removed") {
        if (this._diffAccepted[changeIdx] === true) { /* skip removed line */ }
        else result.push(c.text);
        changeIdx++;
      }
    }
    return result.join("\n");
  }

  _applyDiffResult() {
    var editor = document.getElementById("editor-content");
    if (!editor || editor.disabled) { window.showToast("error", "请先打开章节"); return; }
    var result = this._buildDiffResult();
    var start = editor.selectionStart;
    var end = editor.selectionEnd;
    var val = editor.value;
    editor.value = val.substring(0, start) + result + val.substring(end);
    editor.selectionStart = editor.selectionEnd = start + result.length;
    editor.dispatchEvent(new Event("input"));
    this._closeDiff();
    window.showToast("success", "Diff 结果已应用");
  }

  _closeDiff() {
    var modal = document.getElementById("diff-modal");
    if (modal) { modal.classList.remove("visible"); modal.style.display = "none"; }
  }

 populateAgentProviderSelect() {
    var self = this;
   var sel = document.getElementById("af-provider");
    if (!sel) return;
    sel.innerHTML = "<option value=''>使用全局默认</option>";
    var providers = ProviderManager.getAll();
    providers.forEach(function(p) {
       sel.innerHTML += "<option value='" + p.id + "'>" + self._escHtml(p.name) + "</option>";
    });
  }

  openAgentTest(agentId) {
    var a = AgentManager.get(agentId);
    if (!a) return;
    var modal = document.getElementById("agent-test-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "agent-test-modal";
      modal.className = "modal";
      modal.innerHTML = "<div class='modal-content' style='max-width:600px'><div class='modal-header'><h4 id='atm-title'>测试智能体</h4><button id='atm-close' class='btn-close'>&times;</button></div><div class='modal-body'><div class='form-group'><label>测试消息</label><textarea id='atm-input' rows='4' class='full-width' placeholder='输入测试消息，模拟与智能体对话...'></textarea></div><div class='form-actions'><button id='btn-atm-run' class='btn-primary'>运行测试</button></div><div id='atm-result' style='margin-top:12px;padding:12px;background:var(--bg-secondary);border-radius:8px;min-height:60px'><span style='color:var(--text-secondary)'>测试结果将显示在这里</span></div></div></div>";
      document.body.appendChild(modal);
      var self = this;
      document.getElementById("atm-close").addEventListener("click", function() { modal.classList.remove("visible"); });
      modal.addEventListener("click", function(e) { if (e.target === modal) modal.classList.remove("visible"); });
    }
    document.getElementById("atm-title").textContent = "测试智能体 - " + a.name;
    document.getElementById("atm-input").value = "";
    document.getElementById("atm-result").innerHTML = "<span style='color:var(--text-secondary)'>测试结果将显示在这里</span>";
    modal.style.display = "flex";
    this._testAgentId = agentId;
    var self = this;
    document.getElementById("btn-atm-run").onclick = function() { self.runAgentTest(); };
  }

    async runAgentTest() {
    var a = AgentManager.get(this._testAgentId);
    if (!a) return;
    var input = document.getElementById("atm-input").value.trim();
    if (!input) { this._toast("请输入测试消息", "error"); return; }
    if (!this.isConfigured) { this._toast(this.getConfigError() || "请先配置API密钥", "error"); return; }
    var resultDiv = document.getElementById("atm-result");
    resultDiv.innerHTML = "<em style=\"color:var(--text-secondary)\">流式请求中...</em>";
    var model = a.model || this._getSelectedModel();
    var temperature = a.temperature != null ? a.temperature : 0.7;
    var maxTokens = a.maxTokens ;
    var messages = [];
    if (a.systemPrompt) { messages.push({ role: "system", content: a.systemPrompt }); }
    messages.push({ role: "user", content: input });
    var self = this;
    var btnRun = document.getElementById("btn-atm-run");
    if (btnRun) { btnRun.disabled = true; btnRun.textContent = "生成中..."; }
    try {
      var result = await this._aiRequest({
        messages: messages,
        model: model,
        temperature: temperature,
        maxTokens: maxTokens,
        stream: true,
        retry: true,
        timeoutMs: 600000,
        onChunk: function(t) {
          resultDiv.innerHTML = "<div style=\"color:var(--text-primary);white-space:pre-wrap\">" + self._escHtml(t) + "</div>";
          resultDiv.scrollTop = resultDiv.scrollHeight;
        },
        onReasoning: function(rt) {
          resultDiv.innerHTML = "<em style=\"color:var(--text-secondary)\">[AI思考中] " + self._escHtml(rt.slice(-200)) + "</em>";
          resultDiv.scrollTop = resultDiv.scrollHeight;
        }
      });
      var fullText = result.text;
      if (!fullText) fullText = "[空回复]";
      resultDiv.innerHTML = "<div style=\"color:var(--text-primary);white-space:pre-wrap\">" + self._escHtml(fullText) + "</div>";
      resultDiv.scrollTop = resultDiv.scrollHeight;
    } catch(e) {
      resultDiv.innerHTML = "<span style=\"color:var(--danger)\">[ERR] " + self._escHtml(e.message) + "</span>";
    } finally {
      if (btnRun) { btnRun.disabled = false; btnRun.textContent = "发送"; }
    }
  }

  async searchGitHub() {
    var self = this;
    var query = document.getElementById("market-search-input").value.trim();
    var category = document.getElementById("market-category").value;
    var statusEl = document.getElementById("market-status");
    var resultsEl = document.getElementById("market-results");

    if (!query) { statusEl.textContent = "[ERR] 请输入搜索关键词"; return; }

    // 根据分类添加主题过滤
    var q = query;
    if (category === "agent") q += " topic:ai-agent";
    else if (category === "skill") q += " topic:skill";

    statusEl.textContent = "搜索中...";
    resultsEl.innerHTML = "";

    try {
      var controller = new AbortController();
      var timeout = setTimeout(function() { controller.abort(); }, 30000);
      var token = StorageManager.get("githubToken"); var headers = { "Accept": "application/vnd.github.v3+json" }; if (token) { headers["Authorization"] = "Bearer " + token; } var sort = document.getElementById("market-sort").value; var sortParam = sort === "updated" ? "&sort=updated" : (sort === "stars" ? "&sort=stars" : ""); this._currentPage = 1; var url = "https://api.github.com/search/repositories?q=" + encodeURIComponent(q) + sortParam + "&order=desc&per_page=15&page=" + this._currentPage;
      var resp = await fetch(url, { signal: controller.signal, headers: headers });
      clearTimeout(timeout);

      if (!resp.ok) {
        if (resp.status === 403) { statusEl.textContent = "[ERR] GitHub API 速率限制，请稍后重试"; return; }
        statusEl.textContent = "[ERR] 搜索失败 (" + resp.status + ")";
        return;
      }

      var data = await resp.json();
      if (!data.items || data.items.length === 0) {
        statusEl.textContent = "未找到相关仓库，请尝试其他关键词";
        return;
      }

      statusEl.textContent = "找到 " + data.total_count + " 个仓库，显示前 " + data.items.length + " 个";
      self._renderMarketResults(data.items);
    } catch (err) {
      if (err.name === "AbortError") { statusEl.textContent = "[ERR] 请求超时（30秒），请检查网络"; }
      else { statusEl.textContent = "[ERR] " + err.message; }
    }
  }

  async _installFromMarket(fullName, htmlUrl, btn) {
    var self = this;
    btn.textContent = "安装中...";
    btn.disabled = true;

    try {
      // 获取 README.md
      var readmeUrl = "https://api.github.com/repos/" + fullName + "/readme";
      var resp = await fetch(readmeUrl, { headers: { "Accept": "application/vnd.github.v3.raw+json", "Authorization": "Bearer " + (StorageManager.get("githubToken") || "") } });

      if (!resp.ok) {
        this._toast("无法获取仓库 README (" + resp.status + ")");
        btn.textContent = "安装";
        btn.disabled = false; this._setBtnLoading(btn, false);
        return;
      }

      var readme = await resp.text();
      var parsed = self._parseRepoReadme(readme, fullName);

      // 询问用户要安装为什么类型
      var type = await this._confirm("检测到仓库: " + fullName + "  描述: " + parsed.description + "  点击确定安装为 Agent，取消安装为 Skill") ? "agent" : "skill";

      if (type === "agent") {
        AgentManager.create({
          name: parsed.name,
          description: parsed.description,
          provider: "",
          model: "",
          temperature: 0.7,
          maxTokens: 128000,
          systemPrompt: parsed.template
        });
        this._toast("Agent '" + parsed.name + "' 已安装！请到设置面板配置供应商和模型。");
      } else {
        SkillManager.create({
          name: parsed.name,
          description: parsed.description,
          category: "GitHub导入",
          injectMode: "system_prefix",
          template: parsed.template
        });
        this._toast("Skill '" + parsed.name + "' 已安装！可在技能面板查看和编辑。");
      }

      btn.textContent = "已安装";
      btn.classList.add("installed");
      btn.disabled = true;

      // 刷新设置面板中的列表
      self.fillSettingsForm();

    } catch (err) {
      this._toast("安装失败: " + err.message, "error");
      btn.textContent = "安装";
      btn.disabled = false; this._setBtnLoading(btn, false);
    }
  }

  async _goToPage(page) {
    var self = this;
    var resultsEl = document.getElementById("market-results");
    var statusEl = document.getElementById("market-status");
    var paginationEl = document.getElementById("market-pagination");
    var pageInfoEl = document.getElementById("page-info");
    var prevBtn = document.getElementById("btn-prev-page");
    var nextBtn = document.getElementById("btn-next-page");
    if (statusEl) statusEl.textContent = "搜索中...";
    if (resultsEl) resultsEl.innerHTML = "";
    try {
      var query = document.getElementById("market-search-input").value.trim();
      var category = document.getElementById("market-category").value;
      var sort = document.getElementById("market-sort").value;
      var sortParam = sort === "updated" ? "&sort=updated" : (sort === "stars" ? "&sort=stars" : "");
      var q = query + (category ? " " + category : "");
      var token = StorageManager.get("githubToken"); var headers = { "Accept": "application/vnd.github.v3+json" }; if (token) { headers["Authorization"] = "Bearer " + token; }
      var url = "https://api.github.com/search/repositories?q=" + encodeURIComponent(q) + sortParam + "&order=desc&per_page=15&page=" + page;
      var resp = await fetch(url, { headers: headers, signal: AbortSignal.timeout(30000) });
      if (resp.status === 403) { if (statusEl) statusEl.textContent = "[ERR] GitHub API 速率限制，请稍后重试"; return; }
      if (!resp.ok) { if (statusEl) statusEl.textContent = "[ERR] 搜索失败 (" + resp.status + ")"; return; }
      var data = await resp.json();
      self._renderMarketResults(data.items, data.total_count);
      if (pageInfoEl) pageInfoEl.textContent = "第 " + page + " 页";
      if (prevBtn) prevBtn.disabled = page <= 1;
      if (paginationEl) paginationEl.style.display = "flex";
      if (statusEl) statusEl.textContent = data.total_count ? "找到 " + data.total_count + " 个结果" : "无结果";
    } catch (err) { if (statusEl) statusEl.textContent = "[ERR] 搜索失败: " + err.message; }
  }

 /* ===== P1-5: AI 味检测与祛除 ===== */
  /* ===== SKILL Template Engine: build context for variable replacement ===== */
  _buildSkillContext(scene, extra) {
    var ctx = {};
    try {
      var pl = this._plData ? this._plData() : null;
      var proj = this._getProjectData ? this._getProjectData() : null;
      if (proj) { ctx.novelTitle = proj.name || ""; }
      if (pl) {
        ctx.outlineContent = pl.outlineText || "";
        ctx.volumeCount = pl.volumeCount || 0;
        ctx.wordsPerVolume = pl.volumeWordCount || 0;
        ctx.chapterCount = pl.chapterCount || 0;
        ctx.wordsPerChapter = pl.chapterWordCount || 0;
        ctx.styleTags = pl.styleTags || "";
        ctx.pacingParams = pl.pacingParams || "";
        if (pl.volumes && pl.volumes.length > 0) {
          var vi = (this.editorContextVolIdx !== undefined && this.editorContextVolIdx >= 0) ? this.editorContextVolIdx : 0;
          var vol = pl.volumes[vi];
          if (vol) {
            ctx.volumeOutline = vol.outline || vol.summary || "";
            if (vol.chapters && vol.chapters.length > 0) {
              var ci = (this.editorContextChIdx !== undefined && this.editorContextChIdx >= 0) ? this.editorContextChIdx : 0;
              var ch = vol.chapters[ci];
              if (ch) {
                ctx.chapterTitle = ch.title || "";
                ctx.chapterSummary = ch.summary || "";
                ctx.chapterPlot = ch.plot || "";
                var prevCh = ci > 0 ? vol.chapters[ci - 1] : null;
                ctx.prevChapterSummary = prevCh ? (prevCh.summary || prevCh.plot || "") : "";
              }
            }
          }
        }
      }
      try {
        if (proj && proj.settingsCollection) {
          var chars = proj.settingsCollection.items["characters"] || [];
          ctx.characters = chars.map(function(c) { return c.name; }).join(", ");
        }
      } catch(eC){console.warn("[WARN] catch #32 renderer_v2.js",eC);if(window.DiagLogger)DiagLogger.warn("catch","renderer_v2.js #32",eC);}
    } catch(e) { console.warn("[WARN] _buildSkillContext error:", e); }
    if (extra) { Object.keys(extra).forEach(function(k) { ctx[k] = extra[k]; }); }
    return ctx;
  }

  _renderSkillTemplate(skill, scene, extra) {
    if (!skill) return "";
    var raw = skill.template || skill.description || "";
    if (!raw) return "";
    try {
      var ctx = this._buildSkillContext(scene, extra);
      if (typeof SkillTemplateEngine !== "undefined") {
        return SkillTemplateEngine.render(raw, ctx);
      }
      return raw;
    } catch(e) {
      console.warn("[WARN] _renderSkillTemplate error:", e);
      return raw;
    }
  }

  async _callAiApi(prompt, systemPrompt, skillIds) {
    if (!this.settings.baseUrl || !this.settings.apiKey) {
      this._toast("请先配置 API 供应商", "error");
      return null;
    }
    var messages = [];
    var _fullSys = systemPrompt || "";
    if (skillIds && skillIds.length > 0) {
      for (var _si = 0; _si < skillIds.length; _si++) {
        try { var _sk = SkillManager.get(skillIds[_si]); if (_sk && _sk.template) { _fullSys += "\n\n--- \u6280\u80fd\u7ea6\u675f ---\n\u3010" + _sk.name + "\u3011: " + this._renderSkillTemplate(_sk, "dialogue"); } } catch(e){console.warn("[WARN] catch #33 renderer_v2.js",e);if(window.DiagLogger)DiagLogger.warn("catch","renderer_v2.js #33",e);}
      }
    }
    if (_fullSys) messages.push({ role: "system", content: _fullSys });
    messages.push({ role: "user", content: prompt });
    try {
      var resp = await fetch(this.settings.baseUrl + "/chat/completions", {
        method: "POST",
        headers: { Authorization: "Bearer " + this.settings.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ model: this._getSelectedModel(), messages: messages, stream: false }),
        signal: AbortSignal.timeout(120000),
      });
      if (!resp.ok) throw new Error("API 错误 (" + resp.status + ")");
      var data = await resp.json();
      return data.choices?.[0]?.message?.content || "";
    } catch(e) {
      this._toast("[API错误] " + e.message, "error");
      return null;
    }
  }


  /* ===== P1-6: 章节自动识别与拆分 ===== */

  /* ===== P1-7: 大纲自动拆解到设定合集 ===== */
  async decomposeOutline(outlineText) {
    if (!outlineText || outlineText.trim().length < 50) return;
    if (!this.currentProjectId) return;
    this._showLoading("正在拆解大纲到设定合集...");
    var prompt = "请从以下小说大纲中提取设定信息，根据大纲内容自行决定需要哪些分类（如角色、世界观、物种、物品、势力、地理、魔法体系、技术、组织等），不要限定在固定分类里。\n" +
      '返回JSON格式: [{"category":"分类名","name":"名称","content":"描述"}]\n' +
      "只返回JSON数组，不要其他文字。\n\n大纲：\n" + outlineText;
    var result = await this._callAiApi(prompt, "你是专业的小说设定编辑，擅长从大纲中提取各类设定信息，能根据大纲内容灵活判断需要哪些分类。");
    this._hideLoading();
    if (!result) return;
    var parsed = this._repairJson(result);
    if (!parsed) { this._toast("大纲拆解失败", "error"); return; }
    var self = this;
    var count = 0;
    var p = this._getProjectData();
    if (!p.settingsCollection) p.settingsCollection = { categories: [], items: {} };
    var sc = p.settingsCollection;
    if (!sc) return;
    // 动态分类：支持AI返回数组格式 [{category,name,content}] 或对象格式 {cat:[items]}
    var itemsArr = null;
    if (Array.isArray(parsed)) { itemsArr = parsed; }
    else {
      itemsArr = [];
      Object.keys(parsed).forEach(function(cat) {
        var arr = parsed[cat];
        if (Array.isArray(arr)) arr.forEach(function(it) { itemsArr.push({ category: cat, name: it.name, content: it.content }); });
      });
    }
    itemsArr.forEach(function(item) {
      if (!item.name) return;
      var scCat = (item.category || "其他").toString();
      if (!sc.items[scCat]) { sc.categories.push(scCat); sc.items[scCat] = []; }
      sc.items[scCat].push({ name: item.name, attrs: { "描述": item.content || "" }, bindTargets: [], triggerKeywords: [] });
      count++;
    });
    self._saveProjectData(p);
    this._toast("从大纲提取了 " + count + " 条设定", "success");
    this.renderSettingsCategories();
    this.renderSettingsItems(this._scCurrentCat || "characters");
    if (window.showToast) window.showToast("success", "大纲已拆解到设定合集: " + count + " 条");
    else this._toast("大纲已拆解到设定合集: " + count + " 条", "success");
  }

  /* ===== P1-12: 伏笔管理 ===== */
  async extractForeshadowing(outlineText) {
    if (!outlineText || outlineText.trim().length < 50) return;
    if (!this.currentProjectId) return;
    this._showLoading("正在提取伏笔...");
    var prompt = "请从以下小说大纲中识别所有的伏笔（铺垫、暗示、悬念、未解之谜等）。\n" +
      '返回JSON格式: [{"name":"伏笔名称","content":"伏笔内容和预期效果"}]\n' +
      "只返回JSON，不要其他文字。\n\n大纲：\n" + outlineText;
    var result = await this._callAiApi(prompt, "你是专业的小说结构分析师，擅长识别伏笔和铺垫。");
    this._hideLoading();
    if (!result) return;
    var foreshadows = this._repairJson(result);
    if (!foreshadows || !Array.isArray(foreshadows) || foreshadows.length === 0) {
      this._toast("未识别到伏笔", "success");
      return;
    }
    var self = this;
    var p = this._getProjectData();
    if (!p.settingsCollection) p.settingsCollection = { categories: [], items: {} };
    var sc = p.settingsCollection;
    if (!sc) return;
    if (!sc.categories.includes("foreshadow")) {
      sc.categories.push("foreshadow");
      sc.items["foreshadow"] = [];
    }
    var count = 0;
    foreshadows.forEach(function(item) {
      if (item.name) {
        sc.items["foreshadow"].push({ name: item.name, attrs: { "内容": item.content || "" }, bindTargets: [], triggerKeywords: [] });
        count++;
      }
    });
    self._saveProjectData(p);
    this._toast("提取了 " + count + " 条伏笔", "success");
   this.renderSettingsCategories();
   this.renderSettingsItems("foreshadow");
  }

  /* ===== P2-36: 错别字检测 ===== */

  /* ===== P2-37: AI 起名 ===== */
  async generateNames(type, context) {
    type = type || "character";
    var typeMap = { character: "角色名", location: "地点名", faction: "门派/势力名", item: "物品名" };
    var typeLabel = typeMap[type] || "名称";
    this._showLoading("正在生成" + typeLabel + "...");
    var prompt = "请生成10个" + typeLabel + "，要求符合小说风格，独特且有记忆点。\n" +
      '返回JSON格式: [{"name":"名称","meaning":"含义说明"}]\n' +
      (context ? "背景信息：" + context + "\n" : "") +
      "只返回JSON。";
    var _plNames = null; try { _plNames = this._plData(); } catch(e){console.warn("[WARN] catch #34 renderer_v2.js",e);if(window.DiagLogger)DiagLogger.warn("catch","renderer_v2.js #34",e);}
    var result = await this._callAiApi(prompt, "你是专业的小说命名专家。", (_plNames && _plNames.s2Skills) || []);
    this._hideLoading();
    if (!result) return;
    var names = this._repairJson(result);
    if (!names || !Array.isArray(names) || names.length === 0) {
      this._toast("生成失败", "error");
      return;
    }
    var self = this;
    var p = self._getProjectData();
    if (!p.settingsCollection) p.settingsCollection = { categories: [], items: {} };
    var sc = p.settingsCollection;
    if (!sc) return;
    if (!sc.categories.includes("characters")) {
      sc.categories.push("characters");
      sc.items["characters"] = [];
    }
    var count = 0;
    names.forEach(function(n) {
      if (n.name) {
        sc.items["characters"].push({ name: n.name, attrs: n.meaning ? { "含义": n.meaning } : {}, bindTargets: [], triggerKeywords: [] });
        count++;
      }
    });
    self._saveProjectData(p);
    self._toast("生成了 " + count + " 个角色名，已冔入设定合集", "success");
    self.renderSettingsCategories();
    self.renderSettingsItems("characters");
  }

  /* ===== P2-38: 灵感生成 ===== */

  /* ===== P2-39: 多剧情生成 ===== */

  /* ===== P2-35: 阅读感诊断 ===== */

  /* ===== P2-26: 写作规则生成 ===== */
  async generateWritingRules(outline) {
    if (!outline) {
      var owEditor = document.getElementById("outline-editor");
      outline = owEditor ? owEditor.value.trim() : "";
    }
    if (!outline) { this._toast("请先填写大纲", "error"); return; }
    this._showLoading("正在生成写作规则...");
    var prompt = "请分析以下小说大纲，生成一套写作规则（包括文风、节奏、视角、描写原则等）。\n" +
      '返回JSON格式: {"rules":[{"category":"分类","rule":"规则内容"}]}\n' +
      "只返回JSON。\n\n大纲：\n" + outline;
    var _plRules = null; try { _plRules = this._plData(); } catch(e){console.warn("[WARN] catch #35 renderer_v2.js",e);if(window.DiagLogger)DiagLogger.warn("catch","renderer_v2.js #35",e);}
    var result = await this._callAiApi(prompt, "你是专业小说编辑，擅长制定写作规范。", (_plRules && _plRules.s2Skills) || []);
    this._hideLoading();
    if (!result) return;
    var parsed = this._repairJson(result);
    if (!parsed || !parsed.rules || !Array.isArray(parsed.rules)) { this._toast("生成失败", "error"); return; }
    var p = this._getProjectData();
    if (!p.settingsCollection) p.settingsCollection = { categories: [], items: {} };
    var sc = p.settingsCollection;
    if (!sc) return;
    if (!sc.categories.includes("writingRules")) {
      sc.categories.push("writingRules");
      sc.items["writingRules"] = [];
    }
    var count = 0;
    parsed.rules.forEach(function(r) {
      if (r.rule) {
        sc.items["writingRules"].push({ name: r.category || "规则", attrs: { "规则": r.rule }, bindTargets: [], triggerKeywords: [] });
        count++;
      }
    });
    this._saveProjectData(p);
    this._toast("生成了 " + count + " 条写作规则", "success");
    this.renderSettingsCategories();
    this.renderSettingsItems("writingRules");
  }

  /* ===== P2-27: 章节准备素材 ===== */

  /* ===== P2-34: 书籍拆解 ===== */
  /* ===== P2-25: 时间线网络 ===== */
  async extractTimeline(outline) {
    if (!outline) {
      var owEditor = document.getElementById("outline-editor");
      outline = owEditor ? owEditor.value.trim() : "";
    }
    if (!outline) { this._toast("请先填写大纲", "error"); return; }
    this._showLoading("正在提取时间线...");
    var prompt = "请从以下大纲中提取时间线事件，按时间顺序排列。\n" +
      '返回JSON格式: [{"event":"事件","time":"时间点","characters":"相关角色","description":"描述"}]\n' +
      "只返回JSON。\n\n大纲：\n" + outline;
    var result = await this._callAiApi(prompt, "你是小说结构分析师，擅长梳理时间线。");
    this._hideLoading();
    if (!result) return;
    var events = this._repairJson(result);
    if (!events || !Array.isArray(events) || events.length === 0) { this._toast("未提取到时间线", "error"); return; }
    this._renderTimelineCanvas(events);
  }

  _renderTimelineCanvas(events) {
    var existing = document.getElementById("timeline-modal");
    if (existing) existing.remove();
    var modal = document.createElement("div");
    modal.id = "timeline-modal";
    modal.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:10000;display:flex;align-items:center;justify-content:center;";
    var box = document.createElement("div");
    box.style.cssText = "background:var(--bg-primary,#161619);border:1px solid var(--border,#2a2a30);border-radius:8px;padding:20px;max-width:90vw;max-height:85vh;overflow:auto;";
    var title = document.createElement("h3");
    title.textContent = "时间线网络图";
    title.style.cssText = "color:var(--text-primary,#e4e4e7);margin:0 0 12px 0;font-size:16px;";
    box.appendChild(title);
    var canvas = document.createElement("canvas");
    canvas.width = 800; canvas.height = Math.max(300, events.length * 60 + 40);
    canvas.style.cssText = "max-width:100%;border-radius:6px;background:#0d0d0f;";
    var ctx = canvas.getContext("2d");
    ctx.strokeStyle = "#7c8cf8"; ctx.lineWidth = 2; ctx.fillStyle = "#e4e4e7"; ctx.font = "13px sans-serif";
    var centerY = 30;
    ctx.beginPath(); ctx.moveTo(40, centerY); ctx.lineTo(canvas.width - 40, centerY); ctx.stroke();
    var stepX = (canvas.width - 80) / Math.max(1, events.length - 1);
    for (var i = 0; i < events.length; i++) {
      var x = 40 + i * stepX; var y = centerY;
      ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fillStyle = "#7c8cf8"; ctx.fill();
      ctx.fillStyle = "#e4e4e7";
      ctx.fillText((events[i].time || "T" + (i + 1)).substring(0, 10), x - 20, y - 14);
      var label = (events[i].event || "").substring(0, 12);
      ctx.fillText(label, x - label.length * 3, i % 2 === 0 ? y + 28 : y + 48);
    }
    box.appendChild(canvas);
    var list = document.createElement("div");
    list.style.cssText = "margin-top:12px;color:var(--text-primary,#e4e4e7);font-size:14px;line-height:1.6;";
    events.forEach(function(e, i) {
      var p = document.createElement("p");
      p.textContent = (i + 1) + ". [" + (e.time || "") + "] " + (e.event || "") + (e.characters ? " — " + e.characters : "");
      list.appendChild(p);
    });
    box.appendChild(list);
    var closeBtn = document.createElement("button");
    closeBtn.textContent = "关闭";
    closeBtn.style.cssText = "margin-top:12px;padding:6px 16px;background:var(--accent,#7c8cf8);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;";
    closeBtn.onclick = function() { modal.remove(); };
    box.appendChild(closeBtn);
    modal.appendChild(box);
    modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
    document.body.appendChild(modal);
   this._toast("时间线已生成，共 " + events.length + " 个事件", "success");
  }

  /* ===== P2-42: Theme Toggle ===== */
  _toggleTheme() {
    var current = document.documentElement.getAttribute("data-theme") || "dark";
    var next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    StorageManager.set("app-theme", next);
    var btn = document.getElementById("theme-toggle-btn");
    if (btn) btn.textContent = next === "dark" ? "☀" : "☾";
    this._toast("已切换到" + (next === "dark" ? "暗色" : "亮色") + "主题", "success");
  }

  _loadTheme() {
    var theme = StorageManager.get("app-theme") || "dark";
    document.documentElement.setAttribute("data-theme", theme);
    var btn = document.getElementById("theme-toggle-btn");
    if (btn) btn.textContent = theme === "dark" ? "☀" : "☾";
  }

  /* ===== P2-33: Writing Dashboard ===== */
 showWritingDashboard() {
    this.closeAllPanels();
   var existing = document.getElementById("dashboard-modal");
    if (existing) existing.remove();
    if (!this.currentProjectId) { this._toast("请先创建项目", "error"); return; }
    var vols = ChapterManager.getVolumes(this.currentProjectId);
    var self = this;
    var totalChapters = 0, totalWords = 0, completedChapters = 0;
    var volStats = [];
    vols.forEach(function(vol) {
      var chs = vol.chapters || [];
      totalChapters += chs.length;
      var volWords = 0;
      chs.forEach(function(ch) {
        var wc = (ch.content || "").length;
        volWords += wc;
        totalWords += wc;
        if (wc > 100) completedChapters++;
      });
      volStats.push({ name: vol.name || "未命名卷", chapters: chs.length, words: volWords });
    });
    var avgWords = totalChapters > 0 ? Math.round(totalWords / totalChapters) : 0;
    var completionRate = totalChapters > 0 ? Math.round(completedChapters / totalChapters * 100) : 0;
    var maxVolWords = Math.max.apply(null, volStats.map(function(v) { return v.words; }).concat([1]));
    var modal = document.createElement("div");
    modal.id = "dashboard-modal";
    modal.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:10000;display:flex;align-items:center;justify-content:center;";
    var box = document.createElement("div");
    box.className = "modal-content";
    box.style.cssText = "max-width:600px;width:90vw;max-height:85vh;overflow:auto;";
    var html = '<div class="modal-header"><h3>写作仪表盘</h3><button class="btn-close" onclick="this.closest(\'#dashboard-modal\').remove()">&times;</button></div>';
    html += '<div class="writing-dashboard">';
    html += '<div class="dashboard-grid">';
    html += '<div class="dashboard-card"><div class="dashboard-card-title">总卷数</div><div class="dashboard-card-value">' + vols.length + '</div></div>';
    html += '<div class="dashboard-card"><div class="dashboard-card-title">总章节</div><div class="dashboard-card-value">' + totalChapters + '</div></div>';
    html += '<div class="dashboard-card"><div class="dashboard-card-title">总字数</div><div class="dashboard-card-value">' + totalWords.toLocaleString() + '</div></div>';
    html += '<div class="dashboard-card"><div class="dashboard-card-title">平均每章</div><div class="dashboard-card-value">' + avgWords.toLocaleString() + '</div></div>';
    html += '<div class="dashboard-card"><div class="dashboard-card-title">完成度</div><div class="dashboard-card-value">' + completionRate + '%</div></div>';
    html += '<div class="dashboard-card"><div class="dashboard-card-title">已完成章节</div><div class="dashboard-card-value">' + completedChapters + '/' + totalChapters + '</div></div>';
    html += '</div>';
    if (volStats.length > 0) {
      html += '<h4 style="margin:0 0 8px;font-size:var(--font-size-md);color:var(--text-primary)">各卷字数分布</h4>';
      html += '<div class="dashboard-bar-chart">';
      volStats.forEach(function(vs) {
        var pct = Math.round(vs.words / maxVolWords * 100);
        var colorClass = pct > 70 ? "accent" : pct > 30 ? "success" : "warning";
        html += '<div class="dashboard-bar-row"><span class="dashboard-bar-label">' + self._escHtml(vs.name) + '</span><div class="dashboard-bar-track"><div class="dashboard-bar-fill ' + colorClass + '" style="width:' + pct + '%"></div></div><span class="dashboard-bar-value">' + vs.words.toLocaleString() + '</span></div>';
      });
      html += '</div>';
    }
    html += '</div>';
    box.innerHTML = html;
    modal.appendChild(box);
    modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
    document.body.appendChild(modal);
  }

  /* ===== P2-32: Chapter Overview Panel ===== */
  async showChapterOverview(chapterId) {
    if (!this.currentProjectId || !this.currentVolumeId) { this._toast("请先选择章节", "error"); return; }
    var ch = ChapterManager.getChapter(this.currentProjectId, this.currentVolumeId, chapterId || this.currentChapterId);
    if (!ch) { this._toast("章节不存在", "error"); return; }
    var existing = document.getElementById("chapter-overview-panel");
    if (existing) existing.remove();
    var panel = document.createElement("div");
    panel.id = "chapter-overview-panel";
    panel.className = "chapter-overview visible";
    var self = this;
    panel.innerHTML = '<div class="chapter-overview-header"><span class="chapter-overview-title">' + self._escHtml(ch.title || "章节概述") + '</span><button class="chapter-overview-close">&times;</button></div><div class="chapter-overview-section"><div class="chapter-overview-section-title">章节摘要</div><div id="chapter-overview-summary" class="chapter-overview-loading"><span class="spinner"></span>正在生成AI摘要...</div></div><div class="chapter-overview-section"><div class="chapter-overview-section-title">字数统计</div><div class="chapter-overview-content">' + (ch.content || "").length + ' 字</div></div>';
    document.body.appendChild(panel);
    panel.querySelector(".chapter-overview-close").onclick = function() { panel.remove(); };
    if (this.isConfigured && ch.content && ch.content.length > 50) {
      var prompt = "请用一段话总结以下章节的核心内容（100字以内）：\n\n" + ch.content.substring(0, 2000);
      var result = await this._callAiApi(prompt, "你是小说编辑助手。");
      var summaryEl = document.getElementById("chapter-overview-summary");
      if (summaryEl) {
        if (result) {
          summaryEl.className = "chapter-overview-content";
          summaryEl.textContent = result;
        } else {
          summaryEl.className = "chapter-overview-content";
          summaryEl.textContent = "摘要生成失败";
        }
      }
    } else {
      var summaryEl2 = document.getElementById("chapter-overview-summary");
      if (summaryEl2) {
        summaryEl2.className = "chapter-overview-content";
       summaryEl2.textContent = "内容不足或未配置API，无法生成摘要";
      }
    }
  }

  /* ===== P2-41: Lifecycle Cleanup ===== */
  _panelCleanupTimers = {};
  _cleanupPanel(panelId) {
    var panel = document.getElementById(panelId);
    if (!panel) return;
    var spinner = panel.querySelectorAll(".spinner");
    spinner.forEach(function(s) { s.remove(); });
    var progressBar = panel.querySelectorAll(".progress-bar");
    progressBar.forEach(function(p) { p.remove(); });
    if (this._panelCleanupTimers && this._panelCleanupTimers[panelId]) {
      clearInterval(this._panelCleanupTimers[panelId]);
      delete this._panelCleanupTimers[panelId];
    }
    var inputs = panel.querySelectorAll("input, textarea");
    inputs.forEach(function(inp) {
      if (inp.dataset.persist !== "true") {
        inp.removeEventListener("input", inp._debounceHandler);
      }
    });
  }

  /* ===== P2-28: Batch Chapter Review ===== */
  _batchReviewAborted = false;

  async batchReviewChapters() {
    if (!this.currentProjectId) { this._toast("请先创建项目", "error"); return; }
    var vols = ChapterManager.getVolumes(this.currentProjectId);
    if (!vols || vols.length === 0) { this._toast("没有卷/章节", "error"); return; }
    this._batchReviewAborted = false;
    var results = [];
    var total = 0;
    vols.forEach(function(v) { total += (v.chapters || []).length; });
    var reviewed = 0;
    this._showLoading("批量审阅 0/" + total + " ...");
    for (var vi = 0; vi < vols.length; vi++) {
      var vol = vols[vi];
      var chs = vol.chapters || [];
      for (var ci = 0; ci < chs.length; ci++) {
        if (this._batchReviewAborted) { this._hideLoading(); this._toast("审阅已中断", "warning"); return results; }
        var ch = chs[ci];
        if (ch.content && ch.content.length > 50) {
          var prompt = "请审阅以下章节内容，指出问题（逻辑、节奏、人物一致性等），给出改进建议。\n" +
            '返回JSON: {"score":8,"issues":["问题1"],"suggestions":["建议1"]}\n' +
            "只返回JSON。\n\n标题：" + ch.title + "\n内容（前2000字）：\n" + ch.content.substring(0, 2000);
          var _plReview = null; try { _plReview = this._plData(); } catch(e){console.warn("[WARN] catch #36 renderer_v2.js",e);if(window.DiagLogger)DiagLogger.warn("catch","renderer_v2.js #36",e);}
          var result = await this._callAiApi(prompt, "你是专业小说审阅编辑。", (_plReview && _plReview.s5Skills) || []);
          if (result) {
            var review = this._repairJson(result);
            if (review) {
              results.push({ volumeId: vol.id, chapterId: ch.id, title: ch.title, review: review });
            }
          }
        }
        reviewed++;
        this._showLoading("批量审阅 " + reviewed + "/" + total + " ...");
      }
    }
    this._hideLoading();
    this._batchReviewResults = results;
    this._showBatchReviewResults(results);
    return results;
  }

 _showBatchReviewResults(results) {
   var modal = document.createElement("div");
   modal.id = "batch-review-modal";
   var self = this;
   modal.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:10000;display:flex;align-items:center;justify-content:center;";
   var box = document.createElement("div");
    box.style.cssText = "background:var(--bg-secondary,#161619);border:1px solid var(--border-color,#2a2a30);border-radius:8px;padding:20px;max-width:700px;width:90vw;max-height:80vh;overflow:auto;";
    var html = '<h3 style="color:var(--text-primary,#e4e4e7);margin:0 0 12px;">批量审阅结果 (' + results.length + ' 章)</h3>';
    results.forEach(function(r) {
      var score = r.review.score || "N/A";
      var issues = (r.review.issues || []).join("; ");
      var sugg = (r.review.suggestions || []).join("; ");
      html += '<div style="margin-bottom:12px;padding:10px;background:var(--bg-tertiary,#1d1d21);border-radius:6px;">';
      html += '<div style="color:var(--text-primary,#e4e4e7);font-size:14px;font-weight:500;">' + self._escHtml(r.title) + ' <span style="color:var(--accent,#7c8cf8)">评分: ' + score + '/10</span></div>';
      if (issues) html += '<div style="color:var(--danger,#e0556a);font-size:12px;margin-top:4px;">问题: ' + self._escHtml(issues) + '</div>';
      if (sugg) html += '<div style="color:var(--success,#4caf88);font-size:12px;margin-top:4px;">建议: ' + self._escHtml(sugg) + '</div>';
      html += '</div>';
    });
    html += '<button id="btn-close-batch-review" style="margin-top:8px;padding:6px 16px;background:var(--accent,#7c8cf8);color:#fff;border:none;border-radius:6px;cursor:pointer;">关闭</button>';
    box.innerHTML = html;
    modal.appendChild(box);
    modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
    document.body.appendChild(modal);
    document.getElementById("btn-close-batch-review").onclick = function() { modal.remove(); };
  }

  /* ===== P2-29: Chapter Revision ===== */
  async reviseChapter(chapterId) {
    if (!this.currentProjectId || !this.currentVolumeId) { this._toast("请先选择章节", "error"); return; }
    var ch = ChapterManager.getChapter(this.currentProjectId, this.currentVolumeId, chapterId || this.currentChapterId);
    if (!ch) { this._toast("章节不存在", "error"); return; }
    if (!ch.content || ch.content.length < 50) { this._toast("章节内容太短", "error"); return; }
    this._showLoading("正在生成修订建议...");
    var prompt = "请对以下章节内容进行修订，改善文笔、修正逻辑问题、增强描写。\n" +
      "直接返回修订后的完整文本，不要其他说明。\n\n标题：" + ch.title + "\n\n原文：\n" + ch.content;
    var _plRevise = null; try { _plRevise = this._plData(); } catch(e){console.warn("[WARN] catch #37 renderer_v2.js",e);if(window.DiagLogger)DiagLogger.warn("catch","renderer_v2.js #37",e);}
    var result = await this._callAiApi(prompt, "你是专业小说编辑，擅长修订和润色。", (_plRevise && _plRevise.s5Skills) || []);
    this._hideLoading();
    if (!result) { this._toast("修订失败", "error"); return; }
    this._showDiffView(ch.content, result.trim());
    this._toast("修订建议已生成，请查看对比", "success");
  }
}

// prompt() is not supported in Electron - use this modal-based replacement
function showPromptModal(title, defaultVal) {
  return new Promise(function(resolve) {
    var overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;";
    var box = document.createElement("div");
    box.style.cssText = "background:#161619;border:1px solid #2a2a30;border-radius:8px;padding:24px;min-width:360px;max-width:480px;";
    var label = document.createElement("p");
    label.textContent = title;
    label.style.cssText = "color:#e4e4e7;font-size:14px;margin:0 0 12px 0;";
    var input = document.createElement("input");
    input.type = "text";
    input.value = defaultVal || "";
    input.style.cssText = "width:100%;box-sizing:border-box;padding:8px 10px;background:#0d0d0f;border:1px solid #2a2a30;border-radius:6px;color:#e4e4e7;font-size:14px;outline:none;";
    var row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px;justify-content:flex-end;margin-top:16px;";
    var okBtn = document.createElement("button");
    okBtn.textContent = "\u786e\u5b9a";
    okBtn.style.cssText = "padding:6px 16px;background:#7c8cf8;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;";
    var cancelBtn = document.createElement("button");
    cancelBtn.textContent = "\u53d6\u6d88";
    cancelBtn.style.cssText = "padding:6px 16px;background:#1d1d21;color:#e4e4e7;border:1px solid #2a2a30;border-radius:6px;cursor:pointer;font-size:14px;";
    row.appendChild(cancelBtn);
    row.appendChild(okBtn);
    box.appendChild(label);
    box.appendChild(input);
    box.appendChild(row);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    input.focus();
    input.select();
    function close(val) { document.body.removeChild(overlay); resolve(val); }
    okBtn.addEventListener("click", function() { close(input.value); });
    cancelBtn.addEventListener("click", function() { close(null); });
    overlay.addEventListener("click", function(e) { if (e.target === overlay) close(null); });
    input.addEventListener("keydown", function(e) {
      if (e.key === "Enter") close(input.value);
      if (e.key === "Escape") close(null);
    });
  });
}

document.addEventListener("DOMContentLoaded", function() {
  window.showToast = function(type, message, duration) {
    var container = document.getElementById("toast-container");
    if (!container) { console.warn("[WARN] toast-container not found"); return; }
    var toast = document.createElement("div");
    toast.className = "toast " + (type || "info");
    toast.textContent = message || "";
    container.appendChild(toast);
    var ms = duration || 3000;
    setTimeout(function() {
      toast.classList.add("toast-out");
      setTimeout(function() { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
    }, ms);
  };

  window._initTooltips = function() {
    var tip = document.getElementById("tooltip");
    if (!tip) return;
    var hoverTimer = null;
    document.addEventListener("mouseover", function(e) {
      var el = e.target.closest("[data-tooltip]");
      if (!el) { tip.classList.remove("visible"); return; }
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(function() {
        var text = el.getAttribute("data-tooltip");
        if (!text) return;
        tip.textContent = text;
        var rect = el.getBoundingClientRect();
        tip.style.left = (rect.left + rect.width / 2 - tip.offsetWidth / 2) + "px";
        tip.style.top = (rect.bottom + 6) + "px";
        tip.classList.add("visible");
      }, 300);
    });
    document.addEventListener("mouseout", function(e) {
      var el = e.target.closest("[data-tooltip]");
      if (el) { clearTimeout(hoverTimer); tip.classList.remove("visible"); }
    });
  };
  window._safeRender = function(renderFn, fallbackName) {
    try {
      return renderFn();
    } catch(e) {
      console.error("[ERR] Render failed:", fallbackName, e);
      var errDiv = document.createElement("div");
      errDiv.className = "error-boundary";
      errDiv.innerHTML = '<div class="error-title">渲染错误: ' + (window.app && window.app._escHtml) ? window.app._escHtml(fallbackName || "unknown") : (fallbackName || "unknown") + "</div>" +
        "<div>" + (e.message || "未知错误") + "</div>" +
        '<div class="error-actions"><button class="btn-secondary" onclick="location.reload()">重试</button></div>';
      document.body.appendChild(errDiv);
      return null;
    }
  };

 if (window.StorageManager && StorageManager.init) StorageManager.init();
 if (window.DiagLogger && DiagLogger.init) DiagLogger.init();
 window.app = new App();

 // === Fix: Modal mutex - showPluginMarket closes settings modal ===
 App.prototype.showPluginMarket = function() {
   var sm = document.getElementById("settings-modal");
   if (sm) { sm.classList.remove("visible"); sm.classList.add("modal-hidden"); }
   var pm = document.getElementById("plugin-market-modal");
   pm.classList.remove("modal-hidden");
   pm.classList.add("visible");
   this.setSidebarActive("btn-plugin-market");
   var si = document.getElementById("market-search-input");
   if (si) si.focus();
   if (typeof this._updateGitHubStatus === "function") this._updateGitHubStatus();
 };

  window.addEventListener("beforeunload", function() {
    if (window.app) {
      try { window.app._stopAutoSaveTimer(); } catch(e){console.warn("[WARN] catch #38 renderer_v2.js",e);if(window.DiagLogger)DiagLogger.warn("catch","renderer_v2.js #38",e);}
      try { window.app.autoSave(); } catch(e) { console.warn("[WARN] final autoSave:", e); }
      try { window.app._syncTreeToPipeline(); } catch(e) { console.warn("[WARN] final sync:", e); }
      try { if (window.app._plData) { var _pl = window.app._plData(); if (_pl) window.app._plPersist(_pl); } } catch(e) { console.warn("[WARN] final plPersist:", e); }
      try { StorageManager.set("lastSession", { pid: window.app.currentProjectId, vid: window.app.currentVolumeId, cid: window.app.currentChapterId, ts: Date.now() }); } catch(e){console.warn("[WARN] catch #39 renderer_v2.js",e);if(window.DiagLogger)DiagLogger.warn("catch","renderer_v2.js #39",e);}
    }
  });
  if (window._initTooltips) window._initTooltips();
});
