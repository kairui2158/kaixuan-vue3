var SkillManager = (function() {
  var STORE = "skills";

  // uid/now extracted to js/utils.js (window.Utils), P1 dedup 2026-07-19
  var makeUid = (window.Utils && window.Utils.makeUid) ? window.Utils.makeUid : function(p) { return p + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8); };
  var now = (window.Utils && window.Utils.now) ? window.Utils.now : function() { return new Date().toISOString(); };
  function uid() { return makeUid("sk_"); }

  return {
    getAll: function() {
      return StorageManager.get(STORE) || [];
    },

    get: function(id) {
      var all = this.getAll();
      for (var i = 0; i < all.length; i++) {
        if (all[i].id === id) return all[i];
      }
      return null;
    },

    create: function(skill) {
      var all = this.getAll();
      var s = {
        id: uid(),
        name: (skill && skill.name) || "新技能",
        description: (skill && skill.description) || "",
        template: (skill && skill.template) || "",
        category: (skill && skill.category) || "通用",
        injectMode: (skill && skill.injectMode) || "system_prefix",
        bindTarget: (skill && skill.bindTarget) || { type: "project", id: "" },
        linkedSkillIds: (skill && skill.linkedSkillIds) || [],
        createdAt: now(),
        updatedAt: now()
      };
      all.push(s);
      StorageManager.set(STORE, all);
      console.log("[OK] Skill created:", s.name);
      return s;
    },

    update: function(id, updates) {
      var all = this.getAll();
      for (var i = 0; i < all.length; i++) {
        if (all[i].id === id) {
          Object.keys(updates).forEach(function(k) {
            all[i][k] = updates[k];
          });
          all[i].updatedAt = now();
          StorageManager.set(STORE, all);
          console.log("[OK] Skill updated:", all[i].name);
          return all[i];
        }
      }
      console.warn("[WARN] Skill not found:", id);
      return null;
    },

    delete: function(id) {
      var all = this.getAll();
      var idx = -1;
      for (var i = 0; i < all.length; i++) {
        if (all[i].id === id) { idx = i; break; }
      }
      if (idx === -1) { console.warn("[WARN] Skill not found for delete:", id); return false; }
      var name = all[idx].name;
      all.splice(idx, 1);
      StorageManager.set(STORE, all);
      console.log("[OK] Skill deleted:", name);
      return true;
    },

    getByBindTarget: function(type, id) {
      var all = this.getAll();
      return all.filter(function(s) {
        return s.bindTarget && s.bindTarget.type === type && s.bindTarget.id === id;
      });
    },

    getByProjectId: function(projectId) {
      return this.getByBindTarget("project", projectId);
    },

    // P2-31: Unified multi-target binding
    bindToTargets: function(skillId, targets) {
      var all = this.getAll();
      for (var i = 0; i < all.length; i++) {
        if (all[i].id === skillId) {
          all[i].bindTargets = targets || [];
          all[i].updatedAt = now();
          StorageManager.set(STORE, all);
          console.log("[OK] Skill bound to", (targets || []).length, "targets");
          return all[i];
        }
      }
      return null;
    },

    getByTargetType: function(type) {
      var all = this.getAll();
      return all.filter(function(s) {
        var bt = s.bindTarget || {};
        if (bt.type === type) return true;
        var bts = s.bindTargets || [];
        return bts.some(function(t) { return t.type === type; });
      });
    },

    getActiveForChapter: function(projectId, volumeId, chapterId) {
      var all = this.getAll();
      return all.filter(function(s) {
       var bt = s.bindTarget || {};
       var bts = s.bindTargets || [];
       var matchProject = bt.type === "project" && bt.id === projectId;
       var matchVolume = (bt.type === "volume" && bt.id === volumeId) || bts.some(function(t) { return t.type === "volume" && t.id === volumeId; });
       var matchChapter = (bt.type === "chapter" && bt.id === chapterId) || bts.some(function(t) { return t.type === "chapter" && t.id === chapterId; });
       var matchBody = bt.type === "body" || bts.some(function(t) { return t.type === "body"; });
        return matchProject || matchVolume || matchChapter || matchBody;
      });
    },

    nameExists: function(name, excludeId) {
      var all = this.getAll();
      for (var i = 0; i < all.length; i++) {
        if (all[i].name === name && all[i].id !== excludeId) return true;
      }
      return false;
    }
  };
})();

console.log("[OK] SkillManager loaded");
