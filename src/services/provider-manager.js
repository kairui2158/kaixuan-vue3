var ProviderManager = (function() {
  var STORE_KEY = "providers";

  // uid extracted to js/utils.js (window.Utils), P1 dedup 2026-07-19
  var makeUid = (window.Utils && window.Utils.makeUid) ? window.Utils.makeUid : function(p) { return p + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8); };
  function uid() { return makeUid("prv_"); }

 function loadAll() {
   // One-time migration from old localStorage to StorageManager
   try {
     if (typeof StorageManager !== "undefined" && !StorageManager.get("providers")) {
       var oldRaw = localStorage.getItem(STORE_KEY);
       if (oldRaw) { var oldList = JSON.parse(oldRaw); if (Array.isArray(oldList)) StorageManager.set("providers", oldList); }
       var oldActive = localStorage.getItem("active-profile");
       if (oldActive) StorageManager.set("active-profile", oldActive);
     }
   } catch(e) {}
   try {
     var data = (typeof StorageManager !== "undefined") ? StorageManager.get("providers") : null;
     var list = Array.isArray(data) ? data : [];
     // P1-1: Decrypt API keys on load
     if (window.electronAPI && typeof window.electronAPI.decrypt === "function") {
       list.forEach(function(p) {
         if (p.apiKey && typeof p.apiKey === "string" && p.apiKey.startsWith("enc:")) {
           try { p.apiKey = window.electronAPI.decrypt(p.apiKey); } catch(e) { /* keep encrypted form */ }
         }
       });
     }
     return list;
   } catch (e) { return []; }
 }

  function saveAll(list) {
    // P1-1: Encrypt API keys on save (deep copy to avoid mutating in-memory objects)
    var copy = JSON.parse(JSON.stringify(list));
    if (window.electronAPI && typeof window.electronAPI.encrypt === "function") {
      copy.forEach(function(p) {
        if (p.apiKey && typeof p.apiKey === "string" && !p.apiKey.startsWith("enc:")) {
          try { p.apiKey = window.electronAPI.encrypt(p.apiKey); } catch(e) { /* keep plaintext */ }
        }
      });
    }
   if (typeof StorageManager !== "undefined") {
     StorageManager.set("providers", copy);
   } else {
     localStorage.setItem(STORE_KEY, JSON.stringify(copy));
   }
 }

  return {
    getAll: function() {
      return loadAll();
    },

    get: function(id) {
      return loadAll().find(function(p) { return p.id === id; }) || null;
    },

    add: function(provider) {
      var list = loadAll();
      var item = {
        id: uid(),
        name: provider.name || "新供应商",
        baseUrl: provider.baseUrl || "",
        apiKey: provider.apiKey || "",
        models: provider.models || [],
        purpose: provider.purpose || "generate",
        streamMode: provider.streamMode !== undefined ? provider.streamMode : true,
        temperature: provider.temperature || 0.7,
        maxTokens: provider.maxTokens || 128000,
        systemPrompt: provider.systemPrompt || "",
        createdAt: Date.now()
      };
      list.push(item);
      saveAll(list);
      console.log("[OK] Provider added:", item.name);
      return item;
    },

    update: function(id, changes) {
      var list = loadAll();
      var found = false;
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) {
          Object.keys(changes).forEach(function(k) {
            if (k !== "id" && k !== "createdAt") list[i][k] = changes[k];
          });
          list[i].updatedAt = Date.now();
          found = true;
          break;
        }
      }
      if (found) { saveAll(list); console.log("[OK] Provider updated:", id); }
      return found;
    },

    delete: function(id) {
      var list = loadAll();
      var len = list.length;
      list = list.filter(function(p) { return p.id !== id; });
      if (list.length < len) {
        saveAll(list);
        console.log("[OK] Provider deleted:", id);
        return true;
      }
      return false;
    },

    getDefault: function() {
      var list = loadAll();
      return list.length > 0 ? list[0] : null;
    },

    // P2-30: Multi AI Profile
   getActiveProfile: function() {
     if (typeof StorageManager !== "undefined") {
       return StorageManager.get("active-profile") || null;
     }
     return localStorage.getItem("active-profile");
   },

   setActiveProfile: function(providerId) {
     if (typeof StorageManager !== "undefined") {
       StorageManager.set("active-profile", providerId);
     } else {
       localStorage.setItem("active-profile", providerId);
     }
     var p = this.get(providerId);
     if (p) console.log("[OK] Active profile:", p.name);
     return p;
   },

    getProfileModel: function(providerId, modelId) {
      var p = this.get(providerId);
      if (!p || !p.models || p.models.length === 0) return null;
      if (!modelId) return p.models[0];
      var found = p.models.find(function(m) { return m === modelId || (m.id && m.id === modelId); });
      return found || p.models[0];
    },

    saveProfile: function(name, baseUrl, apiKey, models, id) {
      if (id) {
        return this.update(id, { name: name, baseUrl: baseUrl, apiKey: apiKey, models: models });
      }
      return this.add({ name: name, baseUrl: baseUrl, apiKey: apiKey, models: models });
    },

    listProfiles: function() {
      var list = loadAll();
      var active = this.getActiveProfile();
      return list.map(function(p) {
        return { id: p.id, name: p.name, baseUrl: p.baseUrl, modelCount: (p.models || []).length, active: p.id === active, purpose: p.purpose || 'generate' };
      });
    },

    quickSwitch: function(providerId, modelId) {
      var p = this.setActiveProfile(providerId);
      if (!p) return null;
      var model = this.getProfileModel(providerId, modelId);
      return { provider: p, model: model };
    },

    // === Verification Provider Support (multi-supplier validation) ===
    // purpose field: "generate" (default) | "verify" | "detect"
    // generate = used for SKILL execution
    // verify = used for cross-model semantic validation
    // detect = used for AI detection (e.g. Zhuque)

    getVerifyProviders: function() {
      var list = loadAll();
      return list.filter(function(p) { return p.purpose === "verify" || (p.purposes && p.purposes.indexOf("verify") >= 0); });
    },

    getVerifyProvider: function() {
      var list = loadAll();
      var vp = list.find(function(p) { return p.purpose === "verify" || (p.purposes && p.purposes.indexOf("verify") >= 0); });
      if (!vp) return null;
      var model = (vp.models && vp.models.length > 0) ? (typeof vp.models[0] === "string" ? vp.models[0] : (vp.models[0].id || vp.models[0].name || vp.models[0])) : null;
      return { baseUrl: vp.baseUrl, apiKey: vp.apiKey, model: model, name: vp.name, id: vp.id };
    },

    getDetectProvider: function() {
      var list = loadAll();
      var dp = list.find(function(p) { return p.purpose === "detect" || (p.purposes && p.purposes.indexOf("detect") >= 0); });
      if (!dp) return null;
      return { baseUrl: dp.baseUrl, apiKey: dp.apiKey, name: dp.name, id: dp.id };
    },

    setProviderPurpose: function(providerId, purpose) {
      var list = loadAll();
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === providerId) {
          list[i].purpose = purpose;
          list[i].updatedAt = Date.now();
          saveAll(list);
          console.log("[OK] Provider " + list[i].name + " purpose set to: " + purpose);
          return true;
        }
      }
      return false;
    }
  };
})();

console.log("[OK] ProviderManager loaded");
