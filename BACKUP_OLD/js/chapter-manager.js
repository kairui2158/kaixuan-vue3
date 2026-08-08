var ChapterManager = (function() {
  // uid/now extracted to js/utils.js (window.Utils), P1 dedup 2026-07-19
  var makeUid = (window.Utils && window.Utils.makeUid) ? window.Utils.makeUid : function(p) { return p + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8); };
  var now = (window.Utils && window.Utils.now) ? window.Utils.now : function() { return new Date().toISOString(); };
  function uid() { return makeUid("ch_"); }

  function storeKey(projectId) {
    if (projectId && typeof projectId === 'object') {
      projectId = projectId.id || String(projectId);
    }
    return "chapters_" + projectId;
  }

  function load(projectId) {
    var data = StorageManager.get(storeKey(projectId));
    if (!data) { data = { volumes: [] }; }
    return data;
  }

  function save(projectId, data) {
    StorageManager.set(storeKey(projectId), data);
  }

  return {
    getVolumes: function(projectId) {
      return load(projectId).volumes;
    },

    getVolume: function(projectId, volumeId) {
      var vols = this.getVolumes(projectId);
      for (var i = 0; i < vols.length; i++) {
        if (vols[i].id === volumeId) return vols[i];
      }
      return null;
    },

    createVolume: function(projectId, data) {
      var store = load(projectId);
      var vol = {
        id: uid(),
        projectId: projectId,
        name: (data && data.name) || "新卷",
        outline: (data && data.outline) || "",
        skillIds: [],
        chapterCount: (data && data.chapterCount) || 0,
        order: store.volumes.length,
        chapters: [],
        createdAt: now(),
        updatedAt: now()
      };
      store.volumes.push(vol);
      save(projectId, store);
      console.log("[OK] Volume created:", vol.name);
      return vol;
    },

    updateVolume: function(projectId, volumeId, updates) {
      var store = load(projectId);
      for (var i = 0; i < store.volumes.length; i++) {
        if (store.volumes[i].id === volumeId) {
          Object.keys(updates).forEach(function(k) {
            store.volumes[i][k] = updates[k];
          });
          store.volumes[i].updatedAt = now();
          save(projectId, store);
          console.log("[OK] Volume updated:", store.volumes[i].name);
          return store.volumes[i];
        }
      }
      console.warn("[WARN] Volume not found:", volumeId);
      return null;
    },

    deleteVolume: function(projectId, volumeId) {
      var store = load(projectId);
      var idx = -1;
      for (var i = 0; i < store.volumes.length; i++) {
        if (store.volumes[i].id === volumeId) { idx = i; break; }
      }
      if (idx === -1) { console.warn("[WARN] Volume not found for delete:", volumeId); return false; }
      var name = store.volumes[idx].name;
      store.volumes.splice(idx, 1);
      save(projectId, store);
      console.log("[OK] Volume deleted:", name);
      return true;
    },

    getChapters: function(projectId, volumeId) {
      var vol = this.getVolume(projectId, volumeId);
      return vol ? vol.chapters : [];
    },

    getChapter: function(projectId, volumeId, chapterId) {
      var chapters = this.getChapters(projectId, volumeId);
      for (var i = 0; i < chapters.length; i++) {
        if (chapters[i].id === chapterId) return chapters[i];
      }
      return null;
    },

    createChapter: function(projectId, volumeId, data) {
      var store = load(projectId);
      for (var i = 0; i < store.volumes.length; i++) {
        if (store.volumes[i].id === volumeId) {
          var ch = {
            id: uid(),
            projectId: projectId,
            volumeId: volumeId,
            title: (data && data.title) || ("第" + (store.volumes[i].chapters.length + 1) + "章"),
            outline: (data && data.outline) || "",
            content: (data && data.content) || "",
            order: store.volumes[i].chapters.length,
            summary: "",
            skillIds: [],
            conversations: [],
            createdAt: now(),
            updatedAt: now()
          };
          store.volumes[i].chapters.push(ch);
          save(projectId, store);
          console.log("[OK] Chapter created:", ch.title);
          return ch;
        }
      }
      console.warn("[WARN] Volume not found for chapter create:", volumeId);
      return null;
    },

    updateChapter: function(projectId, volumeId, chapterId, updates) {
      var store = load(projectId);
      for (var i = 0; i < store.volumes.length; i++) {
        if (store.volumes[i].id !== volumeId) continue;
        for (var j = 0; j < store.volumes[i].chapters.length; j++) {
          if (store.volumes[i].chapters[j].id === chapterId) {
            Object.keys(updates).forEach(function(k) {
              store.volumes[i].chapters[j][k] = updates[k];
            });
            store.volumes[i].chapters[j].updatedAt = now();
            save(projectId, store);
            console.log("[OK] Chapter updated:", store.volumes[i].chapters[j].title);
            return store.volumes[i].chapters[j];
          }
        }
      }
      console.warn("[WARN] Chapter not found:", chapterId);
      return null;
    },

    deleteChapter: function(projectId, volumeId, chapterId) {
      var store = load(projectId);
      for (var i = 0; i < store.volumes.length; i++) {
        if (store.volumes[i].id !== volumeId) continue;
        for (var j = 0; j < store.volumes[i].chapters.length; j++) {
          if (store.volumes[i].chapters[j].id === chapterId) {
            var title = store.volumes[i].chapters[j].title;
            store.volumes[i].chapters.splice(j, 1);
            save(projectId, store);
            console.log("[OK] Chapter deleted:", title);
            return true;
          }
        }
      }
      console.warn("[WARN] Chapter not found for delete:", chapterId);
      return false;
    },

    generateChapters: function(projectId, volumeId, count) {
      for (var i = 0; i < count; i++) {
      this.createChapter(projectId, volumeId, { title: "第" + (i + 1) + "章" });
      }
      console.log("[OK] Generated " + count + " chapters for volume:", volumeId);
    },

    reorderChapters: function(projectId, volumeId, orderedIds) {
      var store = load(projectId);
      for (var i = 0; i < store.volumes.length; i++) {
        if (store.volumes[i].id !== volumeId) continue;
        var chapterMap = {};
        for (var j = 0; j < store.volumes[i].chapters.length; j++) {
          chapterMap[store.volumes[i].chapters[j].id] = store.volumes[i].chapters[j];
        }
        var reordered = [];
        for (var k = 0; k < orderedIds.length; k++) {
          var ch = chapterMap[orderedIds[k]];
          if (ch) {
            ch.order = k;
            reordered.push(ch);
          }
        }
        store.volumes[i].chapters = reordered;
        save(projectId, store);
        console.log("[OK] Chapters reordered in volume:", store.volumes[i].name);
        return true;
      }
      return false;
    }
  };
})();

console.log("[OK] ChapterManager loaded");
