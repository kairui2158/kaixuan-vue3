var StorageManager = (function() {
  var PREFIX = "wa_";
  var _hasElectron = (typeof window !== "undefined" && window.electronAPI && typeof window.electronAPI.storageRead === "function");
  var _migrated = false;

  function key(name) {
    return PREFIX + name;
  }

  function migrate() {
    if (_migrated || !_hasElectron) return;
    _migrated = true;
    try {
      var lsKeys = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(PREFIX) === 0) lsKeys.push(k);
      }
      var migrated = 0;
      for (var j = 0; j < lsKeys.length; j++) {
        var lsKey = lsKeys[j];
        var raw = localStorage.getItem(lsKey);
        if (raw) {
          window.electronAPI.storageWrite(lsKey, raw);
          migrated++;
        }
      }
      if (migrated > 0) console.log("[OK] StorageManager migrated " + migrated + " keys from localStorage to file storage");
    } catch(e) {
      console.error("[ERR] StorageManager migration failed:", e.message);
    }
  }

  return {
    init: function() { migrate(); },

    get: function(name) {
      try {
        var k = key(name);
        var raw = null;
       if (_hasElectron) {
         raw = window.electronAPI.storageRead(k);
       } else {
         raw = localStorage.getItem(k);
       }
       if (!raw) return null;
       try { return JSON.parse(raw); } catch(e) { return raw; }
     } catch (e) {
       console.error("[ERR] StorageManager.get:", name, e.message);
       return null;
     }
    },

    set: function(name, data) {
      try {
        var k = key(name);
        var raw = JSON.stringify(data);
        if (_hasElectron) {
          return window.electronAPI.storageWrite(k, raw);
        } else {
          localStorage.setItem(k, raw);
          return true;
        }
      } catch (e) {
        console.error("[ERR] StorageManager.set:", name, e.message);
        return false;
      }
    },

    remove: function(name) {
      try {
        var k = key(name);
        if (_hasElectron) {
          return window.electronAPI.storageRemove(k);
        } else {
          localStorage.removeItem(k);
          return true;
        }
      } catch (e) {
        console.error("[ERR] StorageManager.remove:", name, e.message);
        return false;
      }
    },

    list: function() {
      try {
        if (_hasElectron) {
          var keys = window.electronAPI.storageList();
          var result = [];
          for (var i = 0; i < keys.length; i++) {
            if (keys[i].indexOf(PREFIX) === 0) {
              result.push(keys[i].slice(PREFIX.length));
            }
          }
          return result;
        } else {
          var lsKeys = [];
          for (var i = 0; i < localStorage.length; i++) {
            var k = localStorage.key(i);
            if (k && k.indexOf(PREFIX) === 0) lsKeys.push(k.slice(PREFIX.length));
          }
          return lsKeys;
        }
      } catch (e) {
        console.error("[ERR] StorageManager.list:", e.message);
        return [];
      }
    },

    clearAll: function() {
      var self = this;
      this.list().forEach(function(k) {
        self.remove(k);
      });
    },

    exportAll: function() {
      var data = {};
      var self = this;
      this.list().forEach(function(k) {
        data[k] = self.get(k);
      });
      return data;
    },

    importAll: function(data) {
      var self = this;
      Object.keys(data).forEach(function(k) {
        self.set(k, data[k]);
      });
    }
  };
})();

console.log("[OK] StorageManager loaded");
