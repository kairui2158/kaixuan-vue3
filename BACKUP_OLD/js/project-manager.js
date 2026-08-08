var ProjectManager = (function() {
  var STORE = "projects";

  // uid/now extracted to js/utils.js (window.Utils), P1 dedup 2026-07-19
  var makeUid = (window.Utils && window.Utils.makeUid) ? window.Utils.makeUid : function(p) { return p + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8); };
  var now = (window.Utils && window.Utils.now) ? window.Utils.now : function() { return new Date().toISOString(); };
  function uid() { return makeUid("prj_"); }

  return {
   getAll: function() {
     var data = StorageManager.get(STORE);
     var all = data || [];
     // Recovery: if index is empty but project files exist on disk, rebuild index
     if (all.length === 0) {
       all = this._recoverOrphanedProjects();
     }
     return all;
   },

   // Scan disk for orphaned project files and rebuild the index
   _recoverOrphanedProjects: function() {
     try {
       var keys = StorageManager.list();
       var recovered = [];
       for (var i = 0; i < keys.length; i++) {
        if (keys[i].indexOf("project-") === 0) {
          var projData = StorageManager.get(keys[i]);
           if (projData) {
             var projId = projData.id || keys[i].slice("project-".length);
             var projName = projData.name || (projData.outline ? projData.outline.substring(0, 20) : "恢复项目_" + projId.slice(-6));
             recovered.push({
               id: projId,
               name: projName,
               outline: projData.outline || "",
               createdAt: projData.createdAt || now(),
               updatedAt: projData.updatedAt || now()
             });
           }
        }
       }
       if (recovered.length > 0) {
         StorageManager.set(STORE, recovered);
         console.log("[OK] ProjectManager recovered " + recovered.length + " orphaned project(s) from disk");
       }
       return recovered;
     } catch(e) {
       console.error("[ERR] ProjectManager recovery failed:", e.message);
       return [];
     }
   },

    get: function(id) {
      var all = this.getAll();
      for (var i = 0; i < all.length; i++) {
        if (all[i].id === id) return all[i];
      }
      return null;
    },

    create: function(project) {
      var all = this.getAll();
      var p = {
        id: uid(),
        name: (project && project.name) || "未命名项目",
        outline: (project && project.outline) || "",
        createdAt: now(),
        updatedAt: now()
      };
      all.push(p);
      StorageManager.set(STORE, all);
      console.log("[OK] Project created:", p.name);
      return p;
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
          console.log("[OK] Project updated:", all[i].name);
          return all[i];
        }
      }
      console.warn("[WARN] Project not found:", id);
      return null;
    },

    delete: function(id) {
      var all = this.getAll();
      var idx = -1;
      for (var i = 0; i < all.length; i++) {
        if (all[i].id === id) { idx = i; break; }
      }
      if (idx === -1) { console.warn("[WARN] Project not found for delete:", id); return false; }
      var name = all[idx].name;
    all.splice(idx, 1);
    StorageManager.set(STORE, all);
    // 级联删除章节数据
    StorageManager.remove("chapters_" + id);
    // 级联删除项目数据文件（防止恢复机制把已删除项目找回来）
    StorageManager.remove("project-" + id);
    console.log("[OK] Project deleted:", name);
     return true;
    }
  };
})();

console.log("[OK] ProjectManager loaded");
