var AgentManager = (function() {
  var STORE = "agents";

  // uid/now extracted to js/utils.js (window.Utils), P1 dedup 2026-07-19
  var makeUid = (window.Utils && window.Utils.makeUid) ? window.Utils.makeUid : function(p) { return p + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8); };
  var now = (window.Utils && window.Utils.now) ? window.Utils.now : function() { return new Date().toISOString(); };
  function uid() { return makeUid("ag_"); }

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

    create: function(agent) {
      var all = this.getAll();
     var a = {
       id: uid(),
       name: (agent && agent.name) || "新智能体",
       systemPrompt: (agent && agent.systemPrompt) || "",
        description: (agent && agent.description) || "",
       provider: (agent && agent.provider) || "",
       model: (agent && agent.model) || "",
        temperature: (agent && agent.temperature != null) ? agent.temperature : 0.7,
        maxTokens: (agent && agent.maxTokens) ? agent.maxTokens : 128000,
       createdAt: now(),
       updatedAt: now()
     };
      all.push(a);
      StorageManager.set(STORE, all);
      console.log("[OK] Agent created:", a.name);
      return a;
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
          console.log("[OK] Agent updated:", all[i].name);
          return all[i];
        }
      }
      console.warn("[WARN] Agent not found:", id);
      return null;
    },

    delete: function(id) {
      var all = this.getAll();
      var idx = -1;
      for (var i = 0; i < all.length; i++) {
        if (all[i].id === id) { idx = i; break; }
      }
      if (idx === -1) { console.warn("[WARN] Agent not found for delete:", id); return false; }
      var name = all[idx].name;
      all.splice(idx, 1);
      StorageManager.set(STORE, all);
      console.log("[OK] Agent deleted:", name);
      return true;
    }
  };
})();

console.log("[OK] AgentManager loaded");
