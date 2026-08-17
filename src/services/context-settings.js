// context-settings.js - Settings collection context binding logic
// Ported from renderer_v2.js:4033 and panels.js:1015,1066
// Uses App.prototype pattern (same as pipeline-manager.js)

// Ported from renderer_v2.js:4033 - Get bound settings text for a specific context (volId/chId)
App.prototype._getBoundSettingsForContext = function(volId, chId) {
  var _p = this._getProjectData();
  if (!_p || !_p.settingsCollection) return "";
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
  if (genResult) result = "\n[\u901a\u7528\u7ea6\u675f]" + genResult + result;
  return result;
}

// Ported from panels.js:1015 - Sync bound settings items to pipeline.boundSettings array
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

// Ported from panels.js:1066 - Returns all globally bound settings items (isBound=true)
App.prototype.getContextSettings = function() {
  var sc = this._scData();
  if (!sc) return [];
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

// Ported from panels.js:645 - Get settingsCollection data, init if missing
App.prototype._scData = function() {
  var self = this;
  if (!this.currentProjectId) return null;
  var p = this._getProjectData();
  if (!p.settingsCollection) p.settingsCollection = { categories: [], items: {} };
  this._saveProjectData(p);
  return p.settingsCollection;
}

// Ported from panels.js:1047 - Get text of all enabled bound settings for prompt injection
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
