// panels.js - 面板逻辑
// 扩展 renderer_v2.js 的 App 类

App.prototype.closeAllPanels = function() {
  try { document.getElementById("panel-backdrop").classList.remove("visible"); } catch(e) { console.warn("[WARN]", e); }
   try { var _ow=document.getElementById("outline-workspace"); _ow.classList.remove("visible"); _ow.classList.add("ow-hidden"); } catch(e) { console.warn("[WARN]", e); }
   try { var _sc=document.getElementById("settings-collection-panel"); _sc.classList.remove("visible"); _sc.classList.add("sc-hidden"); } catch(e) { console.warn("[WARN]", e); }
  try { var _sbm = document.getElementById("sc-bind-modal"); if (_sbm) { _sbm.classList.remove("visible"); _sbm.style.display = "none"; } } catch(e2) { console.warn("[WARN]", e2); }
   try { var _pl=document.getElementById("pipeline-panel"); _pl.classList.remove("visible"); _pl.classList.add("pl-hidden"); } catch(e) { console.warn("[WARN]", e); }
   try { var _mem=document.getElementById("memory-panel"); _mem.classList.remove("visible"); _mem.classList.add("mem-hidden"); } catch(e) { console.warn("[WARN]", e); }
   try { document.getElementById("app-main").classList.add("visible"); } catch(e) { console.warn("[WARN]", e); }
  this.setSidebarActive(null);
  this._updateBreadcrumb();
 }

  App.prototype.setSidebarActive = function(btnId) {
    document.querySelectorAll(".sidebar-btn").forEach(function(btn) { btn.classList.remove("active"); });
    if (btnId) {
      var btn = document.getElementById(btnId);
      if (btn) btn.classList.add("active");
    }
  }
  // Outline workspace methods
 App.prototype._closeAllPanels = function() {
   document.getElementById("app-main").classList.remove("visible");
    var ow = document.getElementById("outline-workspace");
    ow.classList.remove("visible"); ow.classList.add("ow-hidden");
    var sc = document.getElementById("settings-collection-panel");
    sc.classList.remove("visible"); sc.classList.add("sc-hidden");
    var pl = document.getElementById("pipeline-panel");
    pl.classList.remove("visible"); pl.classList.add("pl-hidden");
    var mem = document.getElementById("memory-panel");
    mem.classList.remove("visible"); mem.classList.add("mem-hidden");
 };
 App.prototype.openOutlineWorkspace = function() {
   var self = this;
   this._closeAllPanels();
    var owEl = document.getElementById("outline-workspace");
    owEl.classList.remove("ow-hidden"); owEl.classList.add("visible");
   this.setSidebarActive("btn-outline-workspace");
    var proj = ProjectManager.get(this.currentProjectId);
    document.getElementById("outline-editor").value = proj ? (proj.outline || "") : "";
    this.updateOWWordCount();
    // 编辑器事件
    var ed = document.getElementById("outline-editor");
    ed.onblur = function() { self.saveOutlineBlur(); };
    ed.oninput = function() { self.updateOWWordCount(); };
    ed.addEventListener("dragover", function(e) { e.preventDefault(); ed.classList.add("drag-over"); });
    ed.addEventListener("dragleave", function() { ed.classList.remove("drag-over"); });
    ed.addEventListener("drop", function(e) {
      e.preventDefault(); ed.classList.remove("drag-over");
      var file = e.dataTransfer.files[0]; if (!file) return;
      self._importDroppedFile(file);
    });
    // 按钮事件
    document.getElementById("btn-import-outline").onclick = function() { self.importOutlineFile(); };
    document.getElementById("btn-ai-co-create").onclick = function() { self.toggleAICoCreate(); };
    document.getElementById("btn-generate-outline-skills").onclick = function() { self.generateOutlineSkills(); };
    document.getElementById("btn-lock-outline").onclick = function() { self.lockOutline(); };
    document.getElementById("btn-close-outline-workspace").onclick = function() { self.closeOutlineWorkspace(); };
    document.getElementById("btn-export-outline-md").onclick = function() { self._exportOutline("md"); };
    document.getElementById("btn-export-outline-txt").onclick = function() { self._exportOutline("txt"); };
    var rh = document.querySelector('.ow-resize-handle');
    if (rh) {
      var rz = false, sX, sY, sW, sH;
      rh.addEventListener('mousedown', function(e) {
        e.preventDefault(); rz = true;
        var ws = document.getElementById('outline-workspace');
        sX = e.clientX; sY = e.clientY; sW = ws.offsetWidth; sH = ws.offsetHeight;
        document.body.style.cursor = 'se-resize';
      });
      document.addEventListener('mousemove', function(e) {
        if (!rz) return;
        var ws = document.getElementById('outline-workspace');
        ws.style.width = Math.max(400, sW + (e.clientX - sX)) + 'px';
        ws.style.height = Math.max(300, sH + (e.clientY - sY)) + 'px';
        ws.style.right = 'auto'; ws.style.bottom = 'auto';
      });
      document.addEventListener('mouseup', function() { if (rz) { rz = false; document.body.style.cursor = ''; } });
    }
  }
App.prototype.closeOutlineWorkspace = function() {
   var owClose = document.getElementById("outline-workspace");
   owClose.classList.remove("visible"); owClose.classList.add("ow-hidden");
  document.getElementById("app-main").classList.add("visible");
  this.saveOutlineBlur();
  this._updateBreadcrumb();
}

App.prototype.saveOutlineBlur = function() {
   if (!this.currentProjectId) return;
   var content = document.getElementById("outline-editor").value;
   ProjectManager.update(this.currentProjectId, { outline: content });
 }

  App.prototype._exportOutline = function(fmt) {
    var text = document.getElementById("outline-editor").value;
    if (!text.trim()) { this._toast("大纲为空，无法导出", "error"); return; }
    var ext = fmt === "txt" ? "txt" : "md";
    var blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "outline." + ext;
    a.click();
    URL.revokeObjectURL(a.href);
    this._toast("大纲已导出为 " + ext, "success");
  }

 App.prototype.updateOWWordCount = function() {
    var text = document.getElementById("outline-editor").value;
    document.getElementById("ow-word-count").textContent = text.replace(/\\s/g, "").length + " 字";
  }

  App.prototype.importOutlineFile = function() {
    var inp = document.createElement("input");
    inp.type = "file"; inp.accept = ".txt,.md,.text,.rtf,.doc,.docx";
    var self = this;
    inp.onchange = function() {
      var file = inp.files[0];
      if (!file) return;
      var fileName = (file.name || "").toLowerCase();
      // .txt/.md/.text: smart encoding detection (UTF-8 first, GBK fallback)
      if (fileName.endsWith(".txt") || fileName.endsWith(".md") || fileName.endsWith(".text")) {
        var r = new FileReader();
        r.onload = function(e) {
          var buf = new Uint8Array(e.target.result);
          var text = self._smartDecode(buf);
          document.getElementById("outline-editor").value = text;
          self.saveOutlineBlur(); self.updateOWWordCount();
        };
        r.readAsArrayBuffer(file);
        return;
      }
      // .rtf: smart encoding detection + strip RTF control codes
      if (fileName.endsWith(".rtf")) {
        var rr = new FileReader();
        rr.onload = function(e) {
          var buf = new Uint8Array(e.target.result);
          var raw = self._smartDecode(buf);
          var text = raw.replace(/\\[a-z]+-?\d*\s?/g, "").replace(/[{}]/g, "").replace(/\\\\/g, "\\").replace(/\\'/g, "'").trim();
          if (!text || text.length < 5) { self._toast("RTF内容为空", "error"); return; }
          document.getElementById("outline-editor").value = text;
          self.saveOutlineBlur(); self.updateOWWordCount();
        };
        rr.readAsArrayBuffer(file);
        return;
      }
      // .docx: reuse _parseDocx method
      if (fileName.endsWith(".docx")) {
        var ra = new FileReader();
        ra.onload = function(e) {
          self._parseDocx(new Uint8Array(e.target.result), document.getElementById("outline-editor"));
        };
        ra.readAsArrayBuffer(file);
        return;
      }
            // .doc: legacy binary, cannot parse
      if (fileName.endsWith(".doc")) {
        self._toast(".doc旧版格式不支持，请另存为.docx或.txt", "error");
        return;
      }
     // fallback: try as text
     var rf = new FileReader();
      rf.onload = function(e) {
        var buf = new Uint8Array(e.target.result);
        var text = self._smartDecode(buf);
        document.getElementById("outline-editor").value = text;
        self.saveOutlineBlur(); self.updateOWWordCount();
      };
      rf.readAsArrayBuffer(file);
   };
   inp.click();
 }

  App.prototype._smartDecode = function(buf) {
    var utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    if (utf8.indexOf("\ufffd") === -1) return utf8;
    try {
      var gbk = new TextDecoder("gbk", { fatal: false }).decode(buf);
      if (gbk.indexOf("\ufffd") === -1) return gbk;
      return gbk;
    } catch (ex) {
      return utf8;
    }
  };

  App.prototype._importDroppedFile = function(file) {
    var self = this;
    var fileName = (file.name || "").toLowerCase();
    var ed = document.getElementById("outline-editor");

    if (fileName.endsWith(".txt") || fileName.endsWith(".md") || fileName.endsWith(".text")) {
      var r = new FileReader();
      r.onload = function(e) {
        var buf = new Uint8Array(e.target.result);
        ed.value = self._smartDecode(buf);
        self.saveOutlineBlur(); self.updateOWWordCount();
      };
      r.readAsArrayBuffer(file);
      return;
    }
    if (fileName.endsWith(".rtf")) {
      var rr = new FileReader();
      rr.onload = function(e) {
        var buf = new Uint8Array(e.target.result);
        var raw = self._smartDecode(buf);
        var text = raw.replace(/\\[a-z]+-?\d*\s?/g, "").replace(/[{}]/g, "").replace(/\\\\/g, "\\").replace(/\\'/g, "'").trim();
        if (!text || text.length < 5) { self._toast("RTF内容为空", "error"); return; }
        ed.value = text;
        self.saveOutlineBlur(); self.updateOWWordCount();
      };
      rr.readAsArrayBuffer(file);
      return;
    }
    if (fileName.endsWith(".docx")) {
      var ra = new FileReader();
      ra.onload = function(e) {
        self._parseDocx(new Uint8Array(e.target.result), ed);
      };
      ra.readAsArrayBuffer(file);
      return;
    }
    if (fileName.endsWith(".doc")) {
      self._toast(".doc旧版格式不支持，请另存为.docx或.txt", "error");
      return;
    }
    var rf = new FileReader();
    rf.onload = function(e) {
      var buf = new Uint8Array(e.target.result);
      ed.value = self._smartDecode(buf);
      self.saveOutlineBlur(); self.updateOWWordCount();
    };
    rf.readAsArrayBuffer(file);
  };

  App.prototype._parseDocx = function(buf, ed) {
    var self = this;
    var dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    function rd16(o) { return dv.getUint16(o, true); }
    function rd32(o) { return dv.getUint32(o, true); }
    var eocdOff = -1;
    for (var scan = buf.byteLength - 22; scan >= 0; scan--) {
      if (scan + 22 <= buf.byteLength && rd32(scan) === 0x06054b50) { eocdOff = scan; break; }
    }
    if (eocdOff < 0) { self._toast("无法解析Word文档结构(ZIP)", "error"); return; }
    var cdEntries = rd16(eocdOff + 10);
    var cdOffset = rd32(eocdOff + 16);
    var docEntry = null;
    var cdOff = cdOffset;
    for (var ci = 0; ci < cdEntries; ci++) {
      if (cdOff + 46 > buf.byteLength || rd32(cdOff) !== 0x02014b50) break;
      var cdMethod = rd16(cdOff + 10);
      var cdCompSize = rd32(cdOff + 20);
      var cdFnLen = rd16(cdOff + 28);
      var cdEfLen = rd16(cdOff + 30);
      var cdCommentLen = rd16(cdOff + 32);
      var cdLocalOff = rd32(cdOff + 42);
      var cdFnStart = cdOff + 46;
      var cdFnEnd = cdFnStart + cdFnLen;
      if (cdFnEnd > buf.byteLength) break;
      var cdName = new TextDecoder().decode(buf.subarray(cdFnStart, cdFnEnd));
      if (cdName === "word/document.xml") {
        var localFnLen = rd16(cdLocalOff + 26);
        var localEfLen = rd16(cdLocalOff + 28);
        var dataStart = cdLocalOff + 30 + localFnLen + localEfLen;
        docEntry = { method: cdMethod, data: buf.subarray(dataStart, dataStart + cdCompSize), size: cdCompSize };
        break;
      }
      cdOff = cdFnEnd + cdEfLen + cdCommentLen;
    }
    if (!docEntry) { self._toast("无法在Word文档中找到内容文件", "error"); return; }
    function extractText(xmlStr) {
      function decEntities(s) {
        return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
                .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
      }
      var lines = [];
      var paras = xmlStr.split(/<w:p[\s>]/);
      for (var i = 1; i < paras.length; i++) {
        var para = paras[i];
        var endIdx = para.indexOf("</w:p>");
        if (endIdx >= 0) para = para.substring(0, endIdx);
       var tParts = [];
        var re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
       var m;
        while ((m = re.exec(para)) !== null) { tParts.push(decEntities(m[1])); }
        if (tParts.length > 0) lines.push(tParts.join(""));
      }
      return lines.join("\n");
    }
    function applyResult(text) {
      if (!text || text.length < 5) { self._toast("Word文档内容为空", "error"); return; }
      ed.value = text;
      self.saveOutlineBlur(); self.updateOWWordCount();
    }
    if (docEntry.method === 0) {
      applyResult(extractText(new TextDecoder().decode(docEntry.data)));
    } else if (docEntry.method === 8) {
      if (typeof DecompressionStream === "undefined") {
        self._toast("当前环境不支持Word解析，请另存为.txt或.md", "error");
        return;
      }
      var blob2 = new Blob([docEntry.data]);
      var reader2 = blob2.stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
      var chunks = [];
      (function pump() {
        reader2.read().then(function(r) {
          if (r.done) {
            var totalLen = 0;
            for (var c = 0; c < chunks.length; c++) totalLen += chunks[c].length;
            var merged = new Uint8Array(totalLen);
            var pos = 0;
            for (var c2 = 0; c2 < chunks.length; c2++) { merged.set(chunks[c2], pos); pos += chunks[c2].length; }
            applyResult(extractText(new TextDecoder().decode(merged)));
          } else {
            chunks.push(r.value);
            pump();
          }
        }).catch(function() {
          self._toast("Word文档解压失败，请另存为.txt或.md", "error");
        });
      })();
    } else {
      self._toast("不支持的Word压缩方式(" + docEntry.method + ")，请另存为.txt或.md", "error");
    }
  };

App.prototype.toggleAICoCreate = function() {
  var area = document.getElementById("ow-chat-area");
   area.style.display = (area.style.display === "none" || area.style.display === "") ? "flex" : "none";
 var outline = document.getElementById("outline-editor").value;
    var self = this;
    document.getElementById("btn-ow-send").onclick = function() {
      var input = document.getElementById("ow-chat-input"); var text = input.value.trim();
      if (!text || !self.isConfigured) { if (!self.isConfigured) self._toast("请先配置API", "warning"); return; }
      var msgs = document.getElementById("ow-chat-messages");
      msgs.innerHTML += '<div class="ow-msg-user">' + self._escHtml(text) + "</div>";
      input.value = "";
      var owOutline = document.getElementById("outline-editor").value;
      var prompt = "[上下文：当前大纲]\n" + owOutline + "\n\n[用户消息]\n" + text;
      var loading = document.createElement("div"); loading.className = "ow-msg-ai"; loading.textContent = "AI 思考中...";
      msgs.appendChild(loading); msgs.scrollTop = msgs.scrollHeight;
      var aiDiv = loading;
      fetch(self.settings.baseUrl + "/chat/completions", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + self.settings.apiKey },
        body: JSON.stringify({ model: self._getSelectedModel(), messages: [{ role: "user", content: prompt }], stream: self.settings.streamMode !== false }), signal: AbortSignal.timeout(120000)
      }).then(function(r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        if (self.settings.streamMode === false) {
          return r.json().then(function(d) {
            var t = d.choices && d.choices[0] && d.choices[0].message ? d.choices[0].message.content : "[空回复]";
            aiDiv.textContent = t;
            msgs.scrollTop = msgs.scrollHeight;
          });
        }
        var reader = r.body.getReader();
        var decoder = new TextDecoder();
        var fullText = ""; var buffer = "";
        return function pump() {
          return reader.read().then(function(chunk) {
            if (chunk.done) { aiDiv.textContent = fullText || "[空回复]"; return; }
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
                if (delta) { fullText += delta; aiDiv.textContent = fullText; msgs.scrollTop = msgs.scrollHeight; }
              } catch(e) { console.warn("[WARN]", e); }
            }
            return pump();
          });
        }();
      }).catch(function(e) { aiDiv.textContent = "[ERR] " + e.message; });
    };
  }

  App.prototype.generateOutlineSkills = function() {
    var outline = document.getElementById("outline-editor").value;
    if (!outline) { this._toast("请先填写大纲内容", "error"); return; }
    var self = this;
    if (!this.isConfigured) { this._toast("请先配置API密钥", "error"); return; }
    this._showLoading("生成技能建议中...");
    var prompt = "请根据以下大纲内容，生成3-5个专用Skill建议。每个Skill包含name、description、category、injectMode、template。返回JSON数组。\\n" + outline;
    var messages = [{role:"system",content:"你是大纲架构师，擅长分析故事大纲并生成创作辅助技能"},{role:"user",content:prompt}];
    fetch(this.settings.baseUrl + "/chat/completions", {method:"POST",headers:{Authorization:"Bearer "+this.settings.apiKey,"Content-Type":"application/json"},body:JSON.stringify({model:this._getSelectedModel(),messages:messages,stream:false}),signal:AbortSignal.timeout(60000)})
    .then(function(r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(function(data) {
      var text = data.choices?.[0]?.message?.content || "";
      try {
        var skills = JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] || "[]");
        var html = "<div class='checkbox-list'>";
        skills.forEach(function(s,i) { html += "<label><input type='checkbox' checked data-idx='"+i+"'> "+self._escHtml(s.name)+" - "+self._escHtml(s.description)+"</label>"; });
        html += "</div><button id='btn-add-selected-skills' class='btn-primary btn-sm'>添加选中的Skill</button>";
        document.getElementById("ow-skill-suggestions").innerHTML = html;
        self._hideLoading();
        document.getElementById("btn-add-selected-skills").onclick = function() { self.addSelectedSkills(skills); };
      } catch(e) { self._hideLoading(); self._toast("生成失败: "+e.message, "error"); }
    }).catch(function(e) { self._hideLoading(); self._toast("生成失败: "+e.message, "error"); });
  }

  App.prototype.addSelectedSkills = function(skills) {
    document.querySelectorAll("#ow-skill-suggestions input:checked").forEach(function(cb) {
      var s = skills[parseInt(cb.dataset.idx)];
      if (!SkillManager.nameExists(s.name)) {
        SkillManager.create({name:s.name,description:s.description,category:s.category||"大纲专属",injectMode:s.injectMode||"system_prefix",template:s.template||"",bindTarget:{type:"project",id:this.currentProjectId||""}});
      }
    });
    this.renderBoundSkills();
  }

 App.prototype.renderBoundSkills = function() {
   var self = this;
   var bound = this.currentProjectId ? SkillManager.getByProjectId(this.currentProjectId) : [];
   var html = "";
   bound.forEach(function(s) {
      html += "<div class='bound-item'><span>"+self._escHtml(s.name)+"</span><button data-a='unbind-skill' data-id='"+s.id+"' class='btn-sm btn-danger'>删除</button></div>";
    });
    document.getElementById("ow-bound-list").innerHTML = html || "<span style='font-size:12px;color:#666'>暂无绑定Skill</span>";
    
    document.querySelectorAll("[data-a=unbind-skill]").forEach(function(btn) {
      btn.onclick = function() { SkillManager.delete(this.dataset.id); self.renderBoundSkills(); };
    });
  }


  App.prototype.lockOutline = function() {
    try {
      if (!this.currentProjectId) {
        var outlineText = document.getElementById("outline-editor").value.trim();
        var projName = outlineText ? outlineText.split("\n")[0].replace(/^#+\s*/, "").substring(0, 20) : "新小说";
        var newProj = ProjectManager.create({ name: projName, outline: outlineText });
        if (newProj) { this.currentProjectId = newProj.id; document.getElementById("current-project-name").textContent = projName; }
        else { this._toast("创建项目失败", "error"); return; }
      }
      this.saveOutlineBlur();
     var _pLock = this._getProjectData();
     if (_pLock) { _pLock.outlineLocked = true; this._saveProjectData(_pLock); }

      // FIX: sync outline text into project-{id} data so _plLoadOutline can read it
      var _pLock2 = this._getProjectData();
      if (_pLock2) { _pLock2.outline = document.getElementById("outline-editor").value.trim(); this._saveProjectData(_pLock2); }
     var vols = ChapterManager.getVolumes(this.currentProjectId);
     if (!vols || vols.length === 0) {
       // 解析大纲创建卷和章
       var outline = document.getElementById("outline-editor").value.trim();
       var lines = outline ? outline.split("\n") : [];
       var parsedVols = [];
       var curVol = null;
       for (var li = 0; li < lines.length; li++) {
         var line = lines[li].trim();
         if (!line) continue;
         if ((line.startsWith("# ") && !line.startsWith("## ")) || /^第[一二三四五六七八九十\d]+卷/.test(line)) {
           var vname = line.replace(/^# /, "").replace(/^第[一二三四五六七八九十\d]+卷[：:]?\s*/, "").substring(0, 30) || ("卷" + (parsedVols.length + 1));
           curVol = ChapterManager.createVolume(this.currentProjectId, { name: vname, outline: "" });
           parsedVols.push(curVol);
        } else if ((line.startsWith("## ") && !line.startsWith("### ")) || /^第[一二三四五六七八九十\d]+章/.test(line)) {
          if (!curVol) { curVol = ChapterManager.createVolume(this.currentProjectId, { name: "第一卷", outline: "" }); parsedVols.push(curVol); }
          var cname = line.replace(/^## /, "").replace(/^第[一二三四五六七八九十\d]+章[：:]?\s*/, "").substring(0, 30) || ("章" + (ChapterManager.getVolume(this.currentProjectId, curVol.id).chapters.length + 1));
          ChapterManager.createChapter(this.currentProjectId, curVol.id, { title: cname, content: "" });
        }
      }
      // 有卷但没章，在第一卷创建默认章
      if (parsedVols.length > 0) {
        var fv2 = ChapterManager.getVolume(this.currentProjectId, parsedVols[0].id);
        if (!fv2.chapters || fv2.chapters.length === 0) {
          ChapterManager.createChapter(this.currentProjectId, parsedVols[0].id, { title: "第1章", content: "" });
        }
        this.currentVolumeId = parsedVols[0].id;
        var fv3 = ChapterManager.getVolume(this.currentProjectId, parsedVols[0].id);
        this.currentChapterId = fv3 && fv3.chapters && fv3.chapters.length > 0 ? fv3.chapters[0].id : null;
      }
      else {
        this._toast("大纲已保存，未解析到卷章结构", "info");
      }
    } else {
        this._toast("大纲已保存，进入创作模式", "success");
      }
    } catch(e) {
      console.error("[ERR] lockOutline:", e.message, e.stack);
      this._toast("[锁定失败] " + (e.message || String(e)), "error");
    }
    var _owLock = document.getElementById("outline-workspace");
    _owLock.classList.remove("visible"); _owLock.classList.add("ow-hidden");
   document.getElementById("app-main").classList.add("visible");
   this.setSidebarActive(null);
   this.renderChapterTree();
    try { this._syncTreeToPipeline(); } catch(eSync) { console.warn("[WARN] sync after lockOutline:", eSync); }
    try { var plOL = this._plData(); if (plOL) { plOL.outlineText = document.getElementById("outline-editor").value.trim(); this._plPersist(plOL); } } catch(ePL) { console.warn("[WARN] store outline in pipeline:", ePL); }
    var outlineText3 = document.getElementById("outline-editor").value.trim();
    if (outlineText3 && !this.isConfigured) { if (window.showToast) window.showToast("info", "大纲已锁定，但API未配置，设定拆解已跳过。请在设置中配置API后使用自动拆解。"); else this._toast("大纲已锁定，API未配置，设定拆解已跳过"); } else if (window.showToast) window.showToast("info", "大纲已锁定，正在拆解设定...");
    var self2 = this;
   var outlineText2 = document.getElementById("outline-editor").value.trim();
   if (outlineText2 && this.isConfigured) {
     // Build context matching pipeline _plGenSettings (Agent + SKILL + bound settings + dynamic categories)
     var _plForSettings = self2._plData();
     var _boundText = self2._getBoundSettingsText ? self2._getBoundSettingsText() : "";
     var _params = "大纲：\n" + outlineText2 + "\n\n请根据大纲内容自行决定需要哪些分类（如角色、世界观、势力、地理、物种、物品、魔法体系等），不要限定在固定分类里。\n每条设定格式：{name, category, attrs: {描述, 特点, 关系}}\n只返回JSON数组，不要返回报告或说明文字。";
     if (_boundText) _params += "\n\n[约束设定]\n" + _boundText;
     var _opts = { agentId: (_plForSettings && _plForSettings.agentId) || null, skillIds: (_plForSettings && _plForSettings.s2Skills) || [] };
     self2.apiGenerate("settings", _params, null, _opts).then(function(result) {
       if (!result) return;
        try {
          var items = JSON.parse(result.match(/\[[\s\S]*\]/)?.[0] || "[]");
          if (items.length > 0) {
            items.forEach(function(item) {
              var rawCat = (item.category || "其他").toString();
              var projData = self2._getProjectData();
              if (!projData.settingsCollection) projData.settingsCollection = { categories: [], items: {} };
              var scData = projData.settingsCollection;
              if (!scData.items) scData.items = {};
              if (!scData.categories) scData.categories = [];
              if (scData.categories.indexOf(rawCat) < 0) scData.categories.push(rawCat);
              if (!scData.items[rawCat]) scData.items[rawCat] = [];
              scData.items[rawCat].push({ id: 'set_' + Date.now() + '_' + Math.random().toString(36).substr(2,6), name: item.name || "未命名", content: item.description || "", attrs: item.attrs || {}, createdAt: Date.now(), updatedAt: Date.now() });
              self2._saveProjectData(projData);
            });
            if (window.showToast) window.showToast("success", "已从大纲拆解 " + items.length + " 个设定条目");
          }
        } catch(e) { if (window.showToast) window.showToast("error", "大纲设定拆解解析失败: " + e.message); else console.warn("[WARN] settings parse failed:", e); }
      }).catch(function(e) { if (window.showToast) window.showToast("error", "大纲设定拆解失败: " + e.message); else console.warn("[WARN] outline settings failed:", e); });
    }
    var self3 = this;
    if (outlineText3 && this.isConfigured) {
      self3.decomposeOutline(outlineText3).then(function() {
        return self3.extractForeshadowing(outlineText3);
      }).catch(function(e) {
        if (window.showToast) window.showToast("error", "大纲拆解链路失败: " + e.message);
      });
    }
  }

  App.prototype.hideContextMenu = function() {
    document.getElementById("ctx-menu").classList.remove("visible");
  }

  App.prototype.showContextMenu = function(e) {
    e.preventDefault();
    var target = e.target.closest("[data-cid]") || e.target.closest("[data-vid]");
    if (!target) return;
    var menu = document.getElementById("ctx-menu");
    if (target.hasAttribute("data-cid")) {
      this._ctxNodeType = "chapter";
      this._ctxNodeId = target.getAttribute("data-cid");
      this._ctxVolumeId = target.getAttribute("data-vid");
    } else {
      this._ctxNodeType = "volume";
      this._ctxNodeId = target.getAttribute("data-vid");
      this._ctxVolumeId = null;
    }
    menu.style.left = e.clientX + "px";
    menu.style.top = e.clientY + "px";
    menu.style.display = "block";
    menu.classList.add("visible");
  }

  App.prototype.showSkillBindingModal = function() {
    var nodeType = this._ctxNodeType;
    var nodeId = this._ctxNodeId;
    var node = null;
    if (nodeType === "volume") {
      node = ChapterManager.getVolume(this.currentProjectId, nodeId);
    } else {
      node = ChapterManager.getChapter(this.currentProjectId, this._ctxVolumeId, nodeId);
    }
    var nodeName = node ? (node.name || node.title || "") : "";
    document.getElementById("sbm-title").textContent = "绑定 Skill - " + nodeName;

    var allSkills = SkillManager.getAll();
    var boundIds = (node && node.skillIds) || [];
    var html = "";
    var self = this;
    allSkills.forEach(function(s) {
      var checked = boundIds.indexOf(s.id) >= 0 ? " checked" : "";
      html += "<label><input type='checkbox' value='" + s.id + "'" + checked + "> " + self._escHtml(s.name) + " <span style='color:#888;font-size:11px'>(" + (s.category||"未分类") + ")</span></label>";
    });
    if (html === "") html = "<p class='empty-hint'>暂无可用技能，请先在设置中添加</p>";
    document.getElementById("sbm-skill-list").innerHTML = html;
    document.getElementById("skill-bind-modal").classList.add("visible");
    document.getElementById("skill-bind-modal").style.display = "flex";
  }

  App.prototype.saveNodeSkillBinding = function() {
    var selectedIds = [];
    document.querySelectorAll("#sbm-skill-list input:checked").forEach(function(cb) { selectedIds.push(cb.value); });
    if (this._ctxNodeType === "volume") {
      ChapterManager.updateVolume(this.currentProjectId, this._ctxNodeId, { skillIds: selectedIds });
    } else {
      ChapterManager.updateChapter(this.currentProjectId, this._ctxVolumeId, this._ctxNodeId, { skillIds: selectedIds });
    }
    document.getElementById("skill-bind-modal").classList.remove("visible");
    this.renderChapterTree();
    this.renderSkillArea();
  }
  // Gather skills for current context (project > volume > chapter)
  App.prototype.getContextSkills = function() {
    var skills = [];
    var seen = {};
    var addSkill = function(s) {
      if (s && !seen[s.id]) { seen[s.id] = true; skills.push(s); }
    };

    // Use getActiveForChapter which checks both bindTarget and bindTargets
    if (this.currentProjectId) {
      var activeSkills = SkillManager.getActiveForChapter(this.currentProjectId, this.currentVolumeId || "", this.currentChapterId || "");
      activeSkills.forEach(addSkill);
    }

    // Volume-level skills
    if (this.currentVolumeId && this.currentProjectId) {
      var vol = ChapterManager.getVolume(this.currentProjectId, this.currentVolumeId);
      if (vol && vol.skillIds) {
        vol.skillIds.forEach(function(id) { addSkill(SkillManager.get(id)); });
      }
    }

    // Chapter-level skills
    if (this.currentChapterId && this.currentProjectId && this.currentVolumeId) {
      var ch = ChapterManager.getChapter(this.currentProjectId, this.currentVolumeId, this.currentChapterId);
      if (ch && ch.skillIds) {
        ch.skillIds.forEach(function(id) { addSkill(SkillManager.get(id)); });
      }
    }

    // Filter by injectFrequency based on message count
    var userMsgCount = 0;
    for (var i = 0; i < this.messages.length; i++) {
      if (this.messages[i].role === "user") userMsgCount++;
    }
    var filtered = [];
    for (var j = 0; j < skills.length; j++) {
      var sk = skills[j];
      var freq = sk.injectFrequency || "every";
      if (freq === "every" || (freq === "every3" && userMsgCount % 3 === 0) || (freq === "every5" && userMsgCount % 5 === 0)) {
        filtered.push(sk);
      }
    }
    return filtered;
  }
  App.prototype._scData = function() {
    var self = this;
  if (!this.currentProjectId) return null;
  var p = this._getProjectData();
 if (!p.settingsCollection) p.settingsCollection = { categories: [], items: {} }; // items是动态key对象，不固定分类
   this._saveProjectData(p);
  return p.settingsCollection;
}
  App.prototype._getProjectData = function() {
    return StorageManager.get("project-" + this.currentProjectId) || {};
  }
  App.prototype._saveProjectData = function(data) {
    StorageManager.set("project-" + this.currentProjectId, data);
  }
  App.prototype._initDefaultCategories = function(sc) {
    if (sc.categories.length === 0) {
      // 不预设固定分类，由用户操作或设定数据驱动
      // items保持空对象，由动态分类填充
    }
  }
 App.prototype.showSettingsCollection = function() {
   this._closeAllPanels();
    var scEl = document.getElementById("settings-collection-panel");
    scEl.classList.remove("sc-hidden"); scEl.classList.add("visible");
   this.setSidebarActive("btn-settings-collection");
    var sc = this._scData(); if (!sc) { document.getElementById("sc-categories").innerHTML = "<button class=\"sc-cat-btn sc-cat-add\" id=\"btn-add-category\">+ 新增分类</button>"; document.getElementById("sc-items-list").innerHTML = "<p class=\"empty-hint\">请先创建项目后使用设定合集</p>"; return; }
    if (!sc) {
      document.getElementById("sc-categories").innerHTML = "<p style=\"color:#888;padding:12px\">请先创建项目后使用设定合集</p>";
      document.getElementById("sc-items-list").innerHTML = "<p class=\"empty-hint\">需要项目才能使用设定合集</p>";
      return;
    }
   this._initDefaultCategories(sc);
   var pdata = this._getProjectData();
   pdata.settingsCollection = sc;
   this._saveProjectData(pdata);
   this.renderSettingsCategories();
    var firstCat = (sc.categories && sc.categories.length > 0) ? sc.categories[0] : Object.keys(sc.items || {})[0];
    if (firstCat) { this.renderSettingsItems(firstCat); } else { document.getElementById("sc-items-list").innerHTML = "<p class=\"empty-hint\">暂无分类，请点击上方新增分类</p>"; }
  }
 App.prototype.closeSettingsCollection = function() {
   var scClose = document.getElementById("settings-collection-panel");
   scClose.classList.remove("visible"); scClose.classList.add("sc-hidden");
  document.getElementById("app-main").classList.add("visible");
  this.setSidebarActive(null);
  this._updateBreadcrumb();
}
  App.prototype.renderSettingsCategories = function() {
    var sc = this._scData(); if (!sc) { document.getElementById("sc-categories").innerHTML = "<button class=\"sc-cat-btn sc-cat-add\" id=\"btn-add-category\">+ 新增分类</button>"; document.getElementById("sc-items-list").innerHTML = "<p class=\"empty-hint\">请先创建项目后使用设定合集</p>"; return; } if (!sc) return;
    var container = document.getElementById("sc-categories");
    var self = this;
    // 分类由 sc.categories 或 Object.keys(sc.items) 动态驱动
    var allCats = sc.categories && sc.categories.length > 0 ? sc.categories : Object.keys(sc.items || {});
    var html = "";
    for (var i = 0; i < allCats.length; i++) {
      var cat = allCats[i];
      var label = this._scCatMap[cat] || cat;
      html += "<button class=\"sc-cat-btn\" data-cat=\"" + cat + "\">" + this._escHtml(label) + "</button>";
    }
    html += "<button class=\"sc-cat-btn sc-cat-add\" id=\"btn-add-category\">+ 新增分类</button>";
     container.innerHTML = html;
     container.onclick = function(e) {
        var catBtn = e.target.closest(".sc-cat-btn[data-cat]");
        if (catBtn) {
          var cat = catBtn.dataset.cat;
          var all = container.querySelectorAll(".sc-cat-btn");
          for (var k = 0; k < all.length; k++) all[k].classList.remove("active");
          catBtn.classList.add("active");
          self.renderSettingsItems(cat);
          return;
        }
      };
      document.getElementById("btn-add-category").addEventListener("click", async function() {
      var name = await showPromptModal("\u8f93\u5165\u65b0\u5206\u7c7b\u540d\u79f0:", "");
      if (!name) return;
      var key = name.replace(/\s+/g, "_").toLowerCase();
      sc.categories.push(key);
      if (!sc.items[key]) sc.items[key] = [];
      self._saveProjectData(self._getProjectData());
      self.renderSettingsCategories();
      self.renderSettingsItems(key);
    });
  }
  App.prototype.renderSettingsItems = function(cat) {
    var sc = this._scData(); if (!sc) { document.getElementById("sc-categories").innerHTML = "<button class=\"sc-cat-btn sc-cat-add\" id=\"btn-add-category\">+ 新增分类</button>"; document.getElementById("sc-items-list").innerHTML = "<p class=\"empty-hint\">请先创建项目后使用设定合集</p>"; return; } if (!sc) return;
    if (!sc.items[cat]) sc.items[cat] = [];
    document.getElementById("sc-current-cat").textContent = this._scCatMap[cat] || cat;
    var container = document.getElementById("sc-items-list");
    var self = this;
    var items = sc.items[cat];
    if (items.length === 0) {
      container.innerHTML = "<p class=\"empty-hint\">暂无设定条目，点击 + 添加</p>";
    } else {
      var html = "";
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var attrsHtml = "";
        var keys = Object.keys(item.attrs || {});
        for (var k = 0; k < keys.length; k++) {
          var key = keys[k];
          attrsHtml += "<div class=\"sc-item-attr\"><span class=\"sc-item-attr-key\">" + this._escHtml(key) + ":</span> " + this._escHtml(item.attrs[key]) + "</div>";
        }
        var bindTargets = item.bindTargets || []; var triggerKw = item.triggerKeywords || []; var kwSummary = ""; if (triggerKw.length > 0) kwSummary = "<div class=\"sc-item-kw-summary\" style=\"font-size:11px;color:#e67e22;margin-top:2px\">触发词: " + triggerKw.join(", ") + "</div>";
        // 方案A: 绑定即同步 — summary 读 item.isBound 与按钮状态保持一致（修复 8 处 mismatch）
        var bindSummary = "<div class=\"sc-item-bind-summary\" style=\"font-size:11px;color:var(--text-secondary);margin-top:4px\">未绑定</div>";
        if (item.isBound) {
          bindSummary = "<div class=\"sc-item-bind-summary\" style=\"font-size:11px;color:var(--accent);margin-top:4px\">已全局绑定</div>";
        } else if (bindTargets.length > 0) {
          bindSummary = "<div class=\"sc-item-bind-summary\" style=\"font-size:11px;color:var(--accent);margin-top:4px\">已绑定: " + bindTargets.length + " 个目标</div>";
        }
        html += "<div class=\"sc-item\" data-idx=\"" + i + "\"><div class=\"sc-item-header\"><span class=\"sc-item-name\">" + this._escHtml(item.name) + "</span><div class=\"sc-item-actions\"><button class=\"btn-sm btn-secondary sc-edit-btn\" data-idx=\"" + i + "\">编辑</button><button class=\"btn-sm btn-secondary sc-bind-btn\" data-idx=\"" + i + "\">绑定</button><button class=\"btn-sm btn-danger sc-del-btn\" data-idx=\"" + i + "\">删除</button></div></div><div class=\"sc-item-attrs\">" + attrsHtml + "</div>" + bindSummary + kwSummary + "</div>";
      }
      container.innerHTML = html;
      var bindBtns = container.querySelectorAll(".sc-bind-btn");
      for (var bi = 0; bi < bindBtns.length; bi++) {
        var scItem = sc.items[cat][parseInt(bindBtns[bi].dataset.idx)];
        if (scItem && scItem.isBound) {
          bindBtns[bi].textContent = "已绑定";
          bindBtns[bi].classList.add("bound");
        }
      }
      container.onclick = function(e) {
        var editBtn = e.target.closest(".sc-edit-btn");
        if (editBtn) { self._editSettingsItem(cat, parseInt(editBtn.dataset.idx)); return; }
        var bindBtn = e.target.closest(".sc-bind-btn");
        if (bindBtn) { self._toggleScBind(cat, parseInt(bindBtn.dataset.idx)); return; }
        var delBtn = e.target.closest(".sc-del-btn");
        if (delBtn) { self._deleteSettingsItem(cat, parseInt(delBtn.dataset.idx)); return; }
        var card = e.target.closest(".sc-item");
        if (card && !e.target.closest(".sc-item-actions")) {
          self._showScDetail(cat, parseInt(card.dataset.idx));
        }
      };
      var closeDetail = document.getElementById("btn-close-sc-detail");
     if (closeDetail) closeDetail.onclick = function() { self._hideScDetail(); };
   }
   document.getElementById("btn-add-item").disabled = false;
    document.getElementById("btn-add-item").onclick = function() { self._addSettingsItem(cat); };
    var aiBtn = document.getElementById('btn-ai-gen-item');
   if (aiBtn) aiBtn.onclick = function() { self._aiGenSettingsItem(cat); };
 }
 App.prototype._showScDetail = function(cat, idx) {
   var sc = this._scData(); if (!sc) return;
   var items = sc.items[cat]; if (!items || !items[idx]) return;
   var item = items[idx];
   document.querySelectorAll(".sc-item").forEach(function(el) { el.classList.remove("selected"); });
   var card = document.querySelector('.sc-item[data-idx="' + idx + '"]');
   if (card) card.classList.add("selected");
   var area = document.getElementById("sc-detail-area");
   var title = document.getElementById("sc-detail-title");
   var content = document.getElementById("sc-detail-content");
   if (!area || !content) return;
   title.textContent = item.name || "条目详情";
   var attrsHtml = "";
   var keys = Object.keys(item.attrs || {});
   for (var k = 0; k < keys.length; k++) {
     attrsHtml += '<div class="sc-detail-attr"><span class="sc-detail-attr-key">' + this._escHtml(keys[k]) + '</span><span>' + this._escHtml(item.attrs[keys[k]]) + '</span></div>';
   }
   var bindTargets = item.bindTargets || [];
   var bindHtml = bindTargets.length > 0 ? bindTargets.map(function(t) { return (t.type||"") + "/" + (t.name||t.id||""); }).join(", ") : "未绑定";
   var triggerKw = item.triggerKeywords || [];
   var kwHtml = triggerKw.length > 0 ? triggerKw.join(", ") : "无";
   content.innerHTML = '<div class="sc-detail-name">' + this._escHtml(item.name) + '</div>' +
     '<div class="sc-detail-section"><div class="sc-detail-section-title">触发关键词</div><div class="sc-detail-section-body">' + this._escHtml(kwHtml) + '</div></div>' +
     '<div class="sc-detail-section"><div class="sc-detail-section-title">属性</div><div class="sc-detail-attrs">' + (attrsHtml || "无属性") + '</div></div>' +
     '<div class="sc-detail-section"><div class="sc-detail-section-title">绑定目标</div><div class="sc-detail-section-body">' + this._escHtml(bindHtml) + '</div></div>' +
     '<div class="sc-detail-actions"><button class="btn-sm btn-secondary" onclick="app._editSettingsItem(\'' + cat + '\',' + idx + ')">编辑</button><button class="btn-sm btn-secondary" onclick="app._openScBindModal(\'' + cat + '\',' + idx + ')">绑定</button></div>';
   area.classList.add("visible");
   area.style.display = "flex";
 };
 App.prototype._hideScDetail = function() {
   var area = document.getElementById("sc-detail-area");
   if (area) { area.classList.remove("visible"); area.style.display = "none"; }
   document.querySelectorAll(".sc-item").forEach(function(el) { el.classList.remove("selected"); });
 };
 App.prototype._aiGenSettingsItem = function(cat) {
    var self = this;
    if (!this.isConfigured) { this._toast("请先配置API", "error"); return; }
    var sc = this._scData();
    if (!sc) { this._toast("请先创建项目", "error"); return; }
    if (!sc.items[cat]) sc.items[cat] = [];
    var catLabel = this._scCatMap[cat] || cat;
    var existingText = sc.items[cat].map(function(i) { return i.name; }).join(", ");
   var prompt = "请生成一个" + catLabel + "类型的设定条目。\n" +
     "已有条目: " + (existingText || "无") + "\n" +
     "返回JSON: " + String.fromCharCode(123) + String.fromCharCode(34) + "name" + String.fromCharCode(34) + ":" + String.fromCharCode(34) + "名称" + String.fromCharCode(34) + "," + String.fromCharCode(34) + "attrs" + String.fromCharCode(34) + ":" + String.fromCharCode(123) + String.fromCharCode(125) + "," + String.fromCharCode(34) + "triggerKeywords" + String.fromCharCode(34) + ":[]" + String.fromCharCode(125) + "\n" +
     "只返回JSON。";
   // Inject outline context + Agent + SKILL (matching pipeline _plGenSettings)
   var _plForSc = this._plData();
   if (_plForSc && _plForSc.outlineText) {
     prompt = "[大纲摘要]\n" + _plForSc.outlineText.substring(0, 2000) + "\n\n" + prompt;
   }
   var _optsSc = { agentId: (_plForSc && _plForSc.agentId) || null, skillIds: (_plForSc && _plForSc.s2Skills) || [] };
   this._showLoading("AI生成" + catLabel + "中...");
   this.apiGenerate("settings", prompt, null, _optsSc).then(function(result) {
      self._hideLoading();
      if (!result) { self._toast("生成失败", "error"); return; }
      try {
        var m = result.match(/\{[\s\S]*?\}/);
        var item = m ? JSON.parse(m[0]) : null;
        if (item && item.name) {
          sc.items[cat].push({ name: item.name, attrs: item.attrs || {}, bindTargets: [], triggerKeywords: item.triggerKeywords || [] });
          self._saveProjectData(self._getProjectData());
          self.renderSettingsItems(cat);
          self._toast("已生成: " + item.name, "success");
        } else { self._toast("解析失败，请重试", "warning"); }
      } catch(e) { self._toast("解析失败: " + e.message, "error"); }
    }).catch(function(e) { self._hideLoading(); self._toast("生成失败: " + e.message, "error"); });
  }
App.prototype._addSettingsItem = function(cat) {
    var self = this;
    var container = document.getElementById("sc-items-list");
    var html = "<div class=\"sc-item-form\"><h4>新增条目</h4><div class=\"form-group\"><label>名称</label><input id=\"sci-name\" placeholder=\"条目名称\"></div><div class=\"form-group\"><label>触发关键词（逗号分隔）</label><input id=\"sci-trigger-keys\" placeholder=\"如: 张三, 张三出场\"></div><div id=\"sci-attrs\"><div class=\"sc-attr-row\"><input placeholder=\"属性名\" class=\"sci-attr-key\"><input placeholder=\"属性值\" class=\"sci-attr-val\"><button class=\"btn-sm btn-secondary sc-attr-rm\" style=\"display:none\">-</button></div></div><button class=\"btn-sm btn-secondary\" id=\"btn-add-attr\">+ 添加属性</button><div class=\"form-actions\"><button class=\"btn-primary\" id=\"btn-save-item\">保存</button><button class=\"btn-secondary\" id=\"btn-cancel-item\">取消</button></div></div>";
    container.insertAdjacentHTML("afterbegin", html);
    container.querySelector(".sc-attr-row:first-child .sc-attr-rm").classList.remove("visible");
    document.getElementById("btn-add-item").disabled = true;
    document.getElementById("btn-add-attr").addEventListener("click", function() {
      var row = document.createElement("div");
      row.className = "sc-attr-row";
      row.innerHTML = "<input placeholder=\"属性名\" class=\"sci-attr-key\"><input placeholder=\"属性值\" class=\"sci-attr-val\"><button class=\"btn-sm btn-secondary sc-attr-rm\">-</button>";
      document.getElementById("sci-attrs").appendChild(row);
      row.querySelector(".sc-attr-rm").addEventListener("click", function() { row.remove(); });
    });
    document.getElementById("btn-save-item").addEventListener("click", function() { self._saveSettingsItem(cat, -1); });
    document.getElementById("btn-cancel-item").addEventListener("click", function() { self.renderSettingsItems(cat); });
  }
  App.prototype._editSettingsItem = function(cat, idx) {
    var sc = this._scData(); if (!sc) { document.getElementById("sc-categories").innerHTML = "<button class=\"sc-cat-btn sc-cat-add\" id=\"btn-add-category\">+ 新增分类</button>"; document.getElementById("sc-items-list").innerHTML = "<p class=\"empty-hint\">请先创建项目后使用设定合集</p>"; return; } if (!sc) return;
    var item = sc.items[cat][idx];
    var self = this;
    var container = document.getElementById("sc-items-list");
    var attrRows = "";
    var keys = Object.keys(item.attrs || {});
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      attrRows += "<div class=\"sc-attr-row\"><input placeholder=\"属性名\" class=\"sci-attr-key\" value=\"" + this._escHtml(key) + "\"><input placeholder=\"属性值\" class=\"sci-attr-val\" value=\"" + this._escHtml(item.attrs[key]) + "\"><button class=\"btn-sm btn-secondary sc-attr-rm\">-</button></div>";
    }
    if (attrRows === "") attrRows = "<div class=\"sc-attr-row\"><input placeholder=\"属性名\" class=\"sci-attr-key\"><input placeholder=\"属性值\" class=\"sci-attr-val\"><button class=\"btn-sm btn-secondary sc-attr-rm\" style=\"display:none\">-</button></div>";
    var html = "<div class=\"sc-item-form\"><h4>编辑: " + this._escHtml(item.name) + "</h4><div class=\"form-group\"><label>名称</label><input id=\"sci-name\" value=\"" + this._escHtml(item.name) + "\"></div><div class=\"form-group\"><label>触发关键词（逗号分隔）</label><input id=\"sci-trigger-keys\" value=\"" + this._escHtml((item.triggerKeywords || []).join(", ")) + "\" placeholder=\"如: 张三, 张三出场\"></div><div id=\"sci-attrs\">" + attrRows + "</div><button class=\"btn-sm btn-secondary\" id=\"btn-add-attr\">+ 添加属性</button><div class=\"form-actions\"><button class=\"btn-primary\" id=\"btn-save-item\">保存</button><button class=\"btn-secondary\" id=\"btn-cancel-item\">取消</button></div></div>";
    container.innerHTML = html;
    document.getElementById("btn-add-item").disabled = true;
    document.getElementById("btn-add-attr").addEventListener("click", function() {
      var row = document.createElement("div");
      row.className = "sc-attr-row";
      row.innerHTML = "<input placeholder=\"属性名\" class=\"sci-attr-key\"><input placeholder=\"属性值\" class=\"sci-attr-val\"><button class=\"btn-sm btn-secondary sc-attr-rm\">-</button>";
      document.getElementById("sci-attrs").appendChild(row);
      row.querySelector(".sc-attr-rm").addEventListener("click", function() { row.remove(); });
    });
    var rmBtns = document.querySelectorAll(".sc-attr-rm");
    for (var r = 0; r < rmBtns.length; r++) {
      rmBtns[r].addEventListener("click", function() { this.parentElement.remove(); });
    }
    document.getElementById("btn-save-item").addEventListener("click", function() { self._saveSettingsItem(cat, idx); });
    document.getElementById("btn-cancel-item").addEventListener("click", function() { self.renderSettingsItems(cat); });
  }
  App.prototype._saveSettingsItem = function(cat, idx) {
    var p = this._getProjectData(); if (!p) { document.getElementById("sc-categories").innerHTML = "<button class=\"sc-cat-btn sc-cat-add\" id=\"btn-add-category\">+ 新增分类</button>"; document.getElementById("sc-items-list").innerHTML = "<p class=\"empty-hint\">请先创建项目后使用设定合集</p>"; return; } if (!p.settingsCollection) p.settingsCollection = { categories: [], items: {} }; var sc = p.settingsCollection; if (!sc) return;
    var name = document.getElementById("sci-name").value.trim();
    if (!name) { this._toast("名称不能为空", "info"); return; }
    var attrs = {};
    var rows = document.querySelectorAll("#sci-attrs .sc-attr-row");
    for (var i = 0; i < rows.length; i++) {
      var keyInput = rows[i].querySelector(".sci-attr-key");
      var valInput = rows[i].querySelector(".sci-attr-val");
      if (keyInput && keyInput.value.trim()) {
        attrs[keyInput.value.trim()] = valInput ? valInput.value.trim() : "";
      }
    }
    var existingItem = (idx >= 0) ? sc.items[cat][idx] : null;
    var triggerKeysStr = "", tkInput = document.getElementById("sci-trigger-keys"); if (tkInput) triggerKeysStr = tkInput.value.trim(); var triggerKeywords = triggerKeysStr ? triggerKeysStr.split(/[,，]/).map(function(s){ return s.trim(); }).filter(function(s){ return s; }) : []; var item = { name: name, attrs: attrs, bindTargets: (existingItem && existingItem.bindTargets) ? existingItem.bindTargets : [], triggerKeywords: triggerKeywords };
    if (idx >= 0) { sc.items[cat][idx] = item; }
    else { sc.items[cat].push(item); }
    this._saveProjectData(p);
    this.renderSettingsItems(cat);
  }
  App.prototype._deleteSettingsItem = async function(cat, idx) {
    if (!(await this._confirm("确定删除此设定条目？"))) return;
    var p = this._getProjectData(); if (!p) { document.getElementById("sc-categories").innerHTML = "<button class=\"sc-cat-btn sc-cat-add\" id=\"btn-add-category\">+ 新增分类</button>"; document.getElementById("sc-items-list").innerHTML = "<p class=\"empty-hint\">请先创建项目后使用设定合集</p>"; return; } if (!p.settingsCollection) return; var sc = p.settingsCollection; if (!sc) return;
    sc.items[cat].splice(idx, 1);
    this._saveProjectData(p);
    this.renderSettingsItems(cat);
  }
  // Scan recent user messages for trigger keyword matches
  App.prototype._scanTriggerKeywords = function() {
    if (!this.currentProjectId) return [];
    var sc = this._scData(); if (!sc) { document.getElementById("sc-categories").innerHTML = "<button class=\"sc-cat-btn sc-cat-add\" id=\"btn-add-category\">+ 新增分类</button>"; document.getElementById("sc-items-list").innerHTML = "<p class=\"empty-hint\">请先创建项目后使用设定合集</p>"; return; } if (!sc || !sc.items) return [];
    var recentMsgs = [];
    for (var i = this.messages.length - 1; i >= 0 && recentMsgs.length < 3; i--) {
      if (this.messages[i].role === "user") recentMsgs.push(this.messages[i].text.toLowerCase());
    }
    if (recentMsgs.length === 0) return [];
    var combined = recentMsgs.join(" ");
    var matched = [];
    var cats = Object.keys(sc.items);
    for (var c = 0; c < cats.length; c++) {
      var cat = cats[c];
      var items = sc.items[cat] || [];
      for (var j = 0; j < items.length; j++) {
        var item = items[j];
        var tkw = item.triggerKeywords || [];
        for (var k = 0; k < tkw.length; k++) {
          if (tkw[k] && combined.indexOf(tkw[k].toLowerCase()) >= 0) {
            matched.push({ name: item.name, attrs: item.attrs || {}, catName: this._scCatMap[cat] || cat, triggerKeywords: tkw });
            break;
          }
        }
      }
    }
    return matched;
  }
  // ===== 设定绑定 =====
  App.prototype._toggleScBind = function(cat, idx) {
    var p = this._getProjectData(); if (!p) return;
    if (!p.settingsCollection) p.settingsCollection = { categories: [], items: {} };
    var sc = p.settingsCollection;
    if (!sc || !sc.items[cat]) return;
    var item = sc.items[cat][idx];
    if (!item) return;
    item.isBound = !item.isBound;
    this._saveProjectData(p);
    this._syncBoundSettingsToPipeline();
    this.renderSettingsItems(cat);
    if (typeof this._toast === "function") {
      this._toast(item.isBound ? "设定已全局绑定" : "设定已取消绑定", item.isBound ? "success" : "info");
    }
  }

  App.prototype._openScBindModal = function(cat, idx) {
    var sc = this._scData(); if (!sc) { return; }
    var item = sc.items[cat][idx];
    if (!item) return;
    var self = this;
    var modal = document.getElementById("sc-bind-modal");
    var isBound = !!item.isBound;
    document.getElementById("sc-bind-item-name").textContent = item.name + (isBound ? " - \u5df2\u5168\u5c40\u7ed1\u5b9a" : " - \u5168\u5c40\u7ed1\u5b9a\u786e\u8ba4");
    var treeHtml = "<div style='padding:16px;color:var(--text-secondary,#aaa);font-size:14px;line-height:1.8'>"
      + "<p style='margin-bottom:8px'>\u6b64\u8bbe\u5b9a\u5c06<span style='color:var(--accent,#6cf)'>\u5168\u5c40\u7ed1\u5b9a</span>\u5230\u6574\u4e2a\u751f\u6210\u6d41\u6c34\u7ebf\u3002</p>"
      + "<p style='margin-bottom:8px'>\u7ed1\u5b9a\u540e\uff0c\u5728\u751f\u6210<span style='color:var(--text-primary,#e0e0e0)'>\u5377\u7eb2\u3001\u7ae0\u8282\u3001\u6b63\u6587</span>\u65f6\uff0c"
      + "\u6b64\u8bbe\u5b9a\u7684\u5185\u5bb9\u4f1a\u4f5c\u4e3a\u7ea6\u675f\u63d0\u793a\u8bcd\u6ce8\u5165API\u8bf7\u6c42\uff0c\u9632\u6b62AI\u8dd1\u504f\u3002</p>"
      + "<p style='margin-bottom:8px'>\u5f53\u524d\u72b6\u6001\uff1a<strong style='color:" + (isBound ? "#4a9" : "#888") + "'>"
      + (isBound ? "\u5df2\u7ed1\u5b9a" : "\u672a\u7ed1\u5b9a") + "</strong></p>"
      + "<p style='font-size:12px;color:var(--text-dim,#666)'>\u53ef\u5728\u751f\u6210\u6d41\u6c34\u7ebf\u7684\u8bbe\u5b9a\u6b65\u9aa4\u4e2d\u542f\u7528/\u7981\u7528\u3002</p>"
      + "</div>";
    document.getElementById("sc-bind-tree").innerHTML = treeHtml;
    modal.classList.remove("modal-hidden");
    modal.classList.add("visible");
    modal.style.display = "flex";
    var saveBtn = document.getElementById("btn-save-bind");
    saveBtn.textContent = isBound ? "\u53d6\u6d88\u7ed1\u5b9a" : "\u786e\u8ba4\u5168\u5c40\u7ed1\u5b9a";
    saveBtn.onclick = function() { self._saveScBind(cat, idx); };
    var closeBtns = modal.querySelectorAll(".sc-bind-close");
    for (var i = 0; i < closeBtns.length; i++) {
      closeBtns[i].onclick = function() { modal.classList.remove("visible"); modal.style.display = "none"; };
    }
    modal.querySelector(".modal-backdrop").onclick = function() { modal.classList.remove("visible"); modal.style.display = "none"; };
    modal._scCat = cat; modal._scIdx = idx;
  }
 App.prototype._saveScBind = function(cat, idx) {
    var p = this._getProjectData(); if (!p) return;
    if (!p.settingsCollection) p.settingsCollection = { categories: [], items: {} };
    var sc = p.settingsCollection;
    if (!sc || !sc.items[cat]) return;
    var item = sc.items[cat][idx];
    if (!item) return;
    item.isBound = !item.isBound;
    this._saveProjectData(p);
    this._syncBoundSettingsToPipeline();
    var _sm = document.getElementById("sc-bind-modal");
    if (_sm) { _sm.classList.remove("visible"); _sm.style.display = "none"; }
    this.renderSettingsItems(cat);
 }
 App.prototype._syncBoundSettingsToPipeline = function() {
    var p = this._getProjectData();
    if (!p || !p.settingsCollection) return;
    var sc = p.settingsCollection;
    if (!p._pipeline) p._pipeline = { step: 1, outlineConfirmed: false, settingsGenerated: false, volumesGenerated: false, chaptersGenerated: false, agentId: null, s1Skills: [], s2Skills: [], s3Skills: [], s4Skills: [], s5Skills: [], outlineText: "", settingsText: "", volumesText: "", chaptersText: "", bodyText: "", volumeCount: 3, chapterWordCount: 2000, volumes: [], chapters: {}, settingsConfirmed: false, volumesConfirmed: false, chaptersConfirmed: false, currentVolumeIndex: -1 };
    var pl = p._pipeline;
    var oldEnabled = {};
    if (pl.boundSettings) {
      for (var oe = 0; oe < pl.boundSettings.length; oe++) {
        oldEnabled[pl.boundSettings[oe].cat + ":" + pl.boundSettings[oe].name] = pl.boundSettings[oe].enabled;
      }
    }
    var bound = [];
    var cats = sc.categories || Object.keys(sc.items || {});
    for (var c = 0; c < cats.length; c++) {
      var items = (sc.items && sc.items[cats[c]]) || [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].isBound) {
          var key = cats[c] + ":" + items[i].name;
          bound.push({
            cat: cats[c],
            name: items[i].name,
            attrs: items[i].attrs || {},
            enabled: oldEnabled[key] !== undefined ? oldEnabled[key] : true
          });
        }
      }
    }
    pl.boundSettings = bound;
    this._saveProjectData(p);
 }

 App.prototype._getBoundSettingsText = function() {
    var p = this._getProjectData();
    if (!p || !p._pipeline || !p._pipeline.boundSettings) return "";
    var bound = p._pipeline.boundSettings;
    var lines = [];
    for (var i = 0; i < bound.length; i++) {
      if (bound[i].enabled) {
        var desc = "";
        if (bound[i].attrs) {
          var keys = Object.keys(bound[i].attrs);
          for (var k = 0; k < keys.length; k++) {
            desc += keys[k] + ": " + bound[i].attrs[keys[k]] + "; ";
          }
        }
        lines.push(bound[i].cat + " - " + bound[i].name + (desc ? " (" + desc + ")" : ""));
      }
    }
    return lines.join("\n");
 }
 App.prototype.getContextSettings = function() {
    // Returns all globally bound settings items (isBound=true)
    var sc = this._scData(); if (!sc) return [];
    var results = [];
    var cats = sc.categories || Object.keys(sc.items || {});
    for (var c = 0; c < cats.length; c++) {
      var items = (sc.items && sc.items[cats[c]]) || [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].isBound) {
          results.push({ category: cats[c], name: items[i].name, attrs: items[i].attrs || {} });
        }
      }
    }
    return results;
  }
  // ===== 生成流水线 =====
    // Tree quick-action: generate chapters for a volume
  App.prototype._treeGenChapters = function(volId) {
    if (!this.currentProjectId) { this._toast("请先打开项目", "error"); return; }
    this._syncTreeToPipeline();
    var pl = this._plData();
    if (!pl) { this._toast("流水线数据不存在", "error"); return; }
    var cmVol = ChapterManager.getVolume(this.currentProjectId, volId);
    if (!cmVol) { this._toast("卷不存在", "error"); return; }
    var volIdx = -1;
    for (var i = 0; i < pl.volumes.length; i++) {
      if (pl.volumes[i].name === cmVol.name) { volIdx = i; break; }
    }
    if (volIdx < 0) {
      pl.volumes.push({ id: volId, name: cmVol.name, outline: cmVol.outline || "", summary: cmVol.outline || "", confirmed: true, chapters: [] });
      volIdx = pl.volumes.length - 1;
      this._plPersist(pl);
    }
    pl.currentVolumeIndex = volIdx;
    this._plPersist(pl);
    this._plGenChaptersDirect(volIdx);
  };

  // Tree quick-action: generate body for a chapter
  App.prototype._treeGenBody = function(volId, chId) {
    if (!this.currentProjectId) { this._toast("请先打开项目", "error"); return; }
    this._syncTreeToPipeline();
    var pl = this._plData();
    if (!pl) { this._toast("流水线数据不存在", "error"); return; }
    // Match by ID directly in pipeline data (primary), fallback to ChapterManager
    var volIdx = -1, chIdx = -1;
    for (var i = 0; i < pl.volumes.length; i++) {
      if (pl.volumes[i].id === volId) {
        volIdx = i;
        for (var j = 0; j < pl.volumes[i].chapters.length; j++) {
          if (pl.volumes[i].chapters[j].id === chId) { chIdx = j; break; }
        }
        break;
      }
    }
    // Fallback: try ChapterManager if ID match fails
    if (volIdx < 0) {
      var cmVol = ChapterManager.getVolume(this.currentProjectId, volId);
      if (cmVol) {
        for (var i = 0; i < pl.volumes.length; i++) {
          if (pl.volumes[i].name === cmVol.name) { volIdx = i; break; }
        }
        if (volIdx < 0) {
          pl.volumes.push({ id: volId, name: cmVol.name, outline: cmVol.outline || "", summary: cmVol.outline || "", confirmed: true, chapters: [] });
          volIdx = pl.volumes.length - 1;
        }
      }
    }
    if (volIdx < 0) { this._toast("卷不存在", "error"); return; }
    if (chIdx < 0) {
      var cmCh = ChapterManager.getChapter(this.currentProjectId, volId, chId);
      if (cmCh) {
        for (var j = 0; j < pl.volumes[volIdx].chapters.length; j++) {
          if (pl.volumes[volIdx].chapters[j].title === cmCh.title) { chIdx = j; break; }
        }
        if (chIdx < 0) {
          pl.volumes[volIdx].chapters.push({ id: chId, title: cmCh.title, plot: "", summary: "", body: cmCh.content || "", bodyGenerated: (cmCh.content && cmCh.content.length > 0) || false, wordCount: pl.chapterWordCount || 2000, confirmed: true });
          chIdx = pl.volumes[volIdx].chapters.length - 1;
        }
      }
    }
    if (chIdx < 0) { this._toast("章节不存在", "error"); return; }
    this._plPersist(pl);
    this._plGenBodyForChapter(volIdx, chIdx);
  };
  // Direct body generation: pass indices directly, no pl-chapter-select dependency
  

  // ===== Tree <-> Pipeline Bidirectional Sync =====
  App.prototype._syncTreeToPipeline = function() {
    if (!this.currentProjectId) return;
    var pl = this._plData();
    if (!pl) return;
    var cmVols = ChapterManager.getVolumes(this.currentProjectId) || [];
    var changed = false;
    var self = this;
    if (pl.volumes.length > 0) {
      // PL has volumes - PL is source of truth for volume/chapter existence
      pl.volumes.forEach(function(plVol) {
        var cmVol = cmVols.find(function(v) { return v.name === plVol.name; });
        if (cmVol) {
          // Sync content from CM to PL (outlines)
          if (cmVol.outline && cmVol.outline !== plVol.outline) {
            plVol.outline = cmVol.outline;
            plVol.summary = cmVol.outline;
            changed = true;
          }
          // Sync chapters: only add CM chapters to PL if PL has none
          if (plVol.chapters.length === 0 && cmVol.chapters && cmVol.chapters.length > 0) {
            cmVol.chapters.forEach(function(cmCh) {
              plVol.chapters.push({
                id: cmCh.id, title: cmCh.title, plot: "", summary: "",
                body: cmCh.content || "", bodyGenerated: (cmCh.content && cmCh.content.length > 0) || false,
                wordCount: 2000, confirmed: true
              });
            });
            changed = true;
          } else if (plVol.chapters.length > 0 && cmVol.chapters) {
            // Both have chapters - sync content only, do not add/remove
            cmVol.chapters.forEach(function(cmCh) {
              var plCh = plVol.chapters.find(function(c) { return c.title === cmCh.title; });
              if (plCh && cmCh.content && cmCh.content !== plCh.body) {
                plCh.body = cmCh.content;
                plCh.bodyGenerated = cmCh.content.length > 0;
                changed = true;
              }
            });
          }
        } else {
          // PL volume not in CM - create it in CM so tree buttons work
          var newCmVol = ChapterManager.createVolume(self.currentProjectId, {
            name: plVol.name, outline: plVol.outline || plVol.summary || ""
         });
         if (plVol.chapters && plVol.chapters.length > 0 && newCmVol) {
          if (newCmVol) plVol.cmId = newCmVol.id;
            plVol.chapters.forEach(function(plCh) {
              ChapterManager.createChapter(self.currentProjectId, newCmVol.id, {
                title: plCh.title, content: plCh.body || ""
              });
            });
          }
        }
      });
      // Delete stale CM volumes not in PL (prevents old volumes persisting)
      cmVols.forEach(function(cmVol) {
        var plVol = pl.volumes.find(function(v) { return v.name === cmVol.name; });
        if (!plVol) {
          ChapterManager.deleteVolume(self.currentProjectId, cmVol.id);
        }
      });
      // Delete stale CM chapters not in PL (for volumes in both)
      cmVols.forEach(function(cmVol) {
        var plVol = pl.volumes.find(function(v) { return v.name === cmVol.name; });
        if (plVol && cmVol.chapters) {
          cmVol.chapters.forEach(function(cmCh) {
            var plCh = plVol.chapters.find(function(c) { return c.title === cmCh.title; });
            if (!plCh) {
              ChapterManager.deleteChapter(self.currentProjectId, cmVol.id, cmCh.id);
            }
          });
        }
      });
    } else {
      // PL has no volumes - use CM as source (backward compat)
      cmVols.forEach(function(cmVol) {
        var newVol = {
          id: cmVol.id, name: cmVol.name,
          outline: cmVol.outline || "", summary: cmVol.outline || "",
          confirmed: true, chapters: []
        };
        if (cmVol.chapters) {
          cmVol.chapters.forEach(function(cmCh) {
            newVol.chapters.push({
              id: cmCh.id, title: cmCh.title, plot: "", summary: "",
              body: cmCh.content || "", bodyGenerated: (cmCh.content && cmCh.content.length > 0) || false,
              wordCount: 2000, confirmed: true
            });
          });
        }
        pl.volumes.push(newVol);
        changed = true;
      });
    }
    if (changed) {
      this._plPersist(pl);
    }
  };
  // Sync a single volume edit to pipeline
  App.prototype._syncVolumeEdit = function(volId, fields) {
    if (!this.currentProjectId) return;
    var pl = this._plData();
    if (!pl) return;
    var plVol = null;
    for (var vi = 0; vi < pl.volumes.length; vi++) {
      if (pl.volumes[vi].id === volId || pl.volumes[vi].cmId === volId) { plVol = pl.volumes[vi]; break; }
    }
    if (!plVol) {
      var cmV = ChapterManager.getVolume(this.currentProjectId, volId);
      if (cmV) { plVol = pl.volumes.find(function(v) { return v.name === cmV.name; }); }
      if (!plVol) { plVol = { id: volId, name: (cmV ? cmV.name : fields.name || ""), outline: "", summary: "", confirmed: true, chapters: [] }; pl.volumes.push(plVol); }
    }
    if (fields.name) plVol.name = fields.name;
    if (fields.outline !== undefined) { plVol.outline = fields.outline; plVol.summary = fields.outline; }
    this._plPersist(pl);
  };

App.prototype.showPluginMarket = function() {
  var pm = document.getElementById("plugin-market-modal");
  pm.classList.remove("modal-hidden");
  pm.classList.add("visible");
  var sm = document.getElementById("settings-modal");
  if (sm) { sm.classList.remove("visible"); }
  this.setSidebarActive("btn-plugin-market");
  document.getElementById("market-search-input").focus();
  this._updateGitHubStatus();
}

  App.prototype.closePluginMarket = function() {
    document.getElementById("plugin-market-modal").classList.remove("visible");
    this.setSidebarActive(null);
  }
  App.prototype._renderMarketResults = function(items, totalCount) {
    var self = this;
    var resultsEl = document.getElementById("market-results");
    resultsEl.innerHTML = "";

    items.forEach(function(repo) {
      var div = document.createElement("div");
      div.className = "market-result";
      div.innerHTML =
        '<div class="market-result-info">' +
        '<div class="market-result-name">' + self._escHtml(repo.full_name) + '</div>' +
        '<div class="market-result-desc">' + self._escHtml((repo.description || "无描述").substring(0, 120)) + '</div>' +
        '<div class="market-result-meta">? ' + repo.stargazers_count + ' | ' + (repo.language || "N/A") + ' | ' + new Date(repo.updated_at).toLocaleDateString() + '</div>' +
        '</div>' +
        '<button class="market-install-btn" data-repo="' + self._escHtml(repo.full_name) + '" data-url="' + self._escHtml(repo.html_url) + '">安装</button>';

      resultsEl.appendChild(div);
    });

    // 绑定安装按钮事件
    resultsEl.querySelectorAll(".market-install-btn").forEach(function(btn) {
      btn.addEventListener("click", function() {
        if (btn.classList.contains("installed")) return;
        self._installFromMarket(btn.dataset.repo, btn.dataset.url, btn);
      });
    });
  }
  App.prototype._parseRepoReadme = function(readme, fullName) {
    var name = fullName.split("/").pop() || fullName;
    var description = "";
    var template = "";

    // 尝试从 README 提取名称（# 标题）
    var titleMatch = readme.match(/^#\s+(.+)/m);
    if (titleMatch) name = titleMatch[1].trim();

    // 提取描述（第一个非空段落，排除标题和徽章）
    var descMatch = readme.match(/^[^#\n!\[\]`<][^\n]{20,200}/m);
    if (descMatch) description = descMatch[0].trim();

    // 提取模板内容（代码块中的内容）
    var codeMatch = readme.match(/```(?:markdown|md|text|yaml|json)?\s*\n([\s\S]*?)\n```/);
    if (codeMatch) {
      template = codeMatch[1].trim();
    } else {
      // 如果没有代码块，用整个 README 作为模板
      template = readme.substring(0, 2000);
    }

    return { name: name, description: description, template: template };
  }
  App.prototype._toggleTokenInput = function() {
    var area = document.getElementById("token-input-area");
    if (area) {
      area.style.display = area.style.display === "none" ? "block" : "none";
    }
  }

  App.prototype._toggleTokenHelp = function() {
    var area = document.getElementById("token-help-area");
    if (area) {
      area.style.display = area.style.display === "none" ? "block" : "none";
    }
  }

  App.prototype._prevPage = function() {
    if (!this._currentPage || this._currentPage <= 1) return;
    this._currentPage--;
    this._goToPage(this._currentPage);
  }

  App.prototype._nextPage = function() {
    if (!this._currentPage) return;
    this._currentPage++;
    this._goToPage(this._currentPage);
  }
  App.prototype._saveGitHubToken = function() {
    var tokenInput = document.getElementById("github-token-input");
    var token = tokenInput ? tokenInput.value.trim() : "";
    if (!token) {
      this._toast("请输入 GitHub Token", "error");
      return;
    }
    var statusEl = document.getElementById("github-status-text");
    if (statusEl) statusEl.textContent = "GitHub: 验证中...";
    var self = this;
    fetch("https://api.github.com/user", {
      headers: { "Authorization": "Bearer " + token, "Accept": "application/vnd.github.v3+json" }
    })
    .then(function(resp) {
      if (resp.ok) {
        StorageManager.set("githubToken", token);
        if (statusEl) statusEl.textContent = "GitHub: 已登录";
      } else {
        if (statusEl) statusEl.textContent = "GitHub: Token 无效";
        self._toast("Token 验证失败 (" + resp.status + ")");
      }
    })
    .catch(function(err) {
      if (statusEl) statusEl.textContent = "GitHub: 连接失败";
      self._toast("GitHub 连接失败: " + err.message, "error");
    });
  }
  App.prototype._updateGitHubStatus = function() {
    var token = StorageManager.get("githubToken");
    var statusEl = document.getElementById("github-status-text");
    if (!token) {
      if (statusEl) statusEl.textContent = "GitHub: 未登录";
      return;
    }
    if (statusEl) statusEl.textContent = "GitHub: 已登录";
  }
