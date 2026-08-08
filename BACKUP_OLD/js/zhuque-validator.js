// ZhuqueValidator - 朱雀验证闭环
// 降得快的Validation阶段核心：处理→检测→如果AI率>阈值→换人设重试→直到达标
// 本地朱雀守护进程通过文件通信：写pending_test.json，等daemon_status.json结果
var ZhuqueValidator = (function() {

  var ZHUQUE_DIR = null; // 自动检测
  var MAX_RETRIES = 3;
  var DEFAULT_THRESHOLD = 30; // AI率阈值
  var POLL_INTERVAL = 3000; // 轮询间隔ms
  var POLL_TIMEOUT = 120000; // 最长等待120秒

  // 检测朱雀守护进程工作目录
  function _detectZhuqueDir() {
    if (ZHUQUE_DIR) return ZHUQUE_DIR;
    var candidates = [
      "D:/codex/_zhuque_analysis",
      "C:/Users/凯瑞/Documents/New project 2/_zhuque_analysis",
      "D:/codex/zhuque_analysis",
      "C:/Users/凯瑞/zhuque_analysis"
    ];
    // 在浏览器环境用localStorage记忆
    try {
      var saved = localStorage.getItem("zhuque-dir");
      if (saved) candidates.unshift(saved);
    } catch(e) {}
    // Electron环境检查路径
    if (typeof require !== "undefined") {
      var fs = require("fs");
      for (var i = 0; i < candidates.length; i++) {
        try { if (fs.existsSync(candidates[i])) { ZHUQUE_DIR = candidates[i]; return ZHUQUE_DIR; } } catch(e) {}
      }
    }
    return null;
  }

  // 提交文本到朱雀守护进程检测
  // 通过文件通信：写pending_test.json，轮询daemon_status.json
  function submitForDetection(text, label) {
    var dir = _detectZhuqueDir();
    if (!dir) {
      console.warn("[ZhuqueValidator] 朱雀目录未找到，跳过验证");
      return Promise.resolve({ success: false, reason: "no_zhuque_dir", aiScore: -1 });
    }
    if (typeof require === "undefined") {
      console.warn("[ZhuqueValidator] 非Electron环境，跳过验证");
      return Promise.resolve({ success: false, reason: "not_electron", aiScore: -1 });
    }

    var fs = require("fs");
    var path = require("path");
    var pendingPath = path.join(dir, "pending_test.json");
    var statusPath = path.join(dir, "daemon_status.json");
    var resultPath = path.join(dir, "latest_result.json");

    return new Promise(function(resolve) {
      var testLabel = label || ("deai_" + Date.now());
      var testData = { label: testLabel, text: text };

      try {
        // 写入待检测文件
        fs.writeFileSync(pendingPath, JSON.stringify(testData, null, 2), "utf-8");
        console.log("[ZhuqueValidator] 提交检测: " + testLabel);
      } catch(e) {
        resolve({ success: false, reason: "write_failed", aiScore: -1, error: e.message });
        return;
      }

      // 轮询结果
      var elapsed = 0;
      var pollTimer = setInterval(function() {
        elapsed += POLL_INTERVAL;
        if (elapsed > POLL_TIMEOUT) {
          clearInterval(pollTimer);
          console.warn("[ZhuqueValidator] 检测超时");
          resolve({ success: false, reason: "timeout", aiScore: -1 });
          return;
        }

        try {
          if (fs.existsSync(statusPath)) {
            var status = JSON.parse(fs.readFileSync(statusPath, "utf-8"));
            // 检查是否处理完我们的请求
            if (status.lastLabel === testLabel && status.status === "done") {
              clearInterval(pollTimer);
              var aiScore = -1;
              var details = null;
              // 读取详细结果
              try {
                if (fs.existsSync(resultPath)) {
                  var result = JSON.parse(fs.readFileSync(resultPath, "utf-8"));
                  aiScore = result.aiScore != null ? result.aiScore : (result.ai_rate != null ? result.ai_rate : -1);
                  details = result;
                }
              } catch(e) {}
              // 也从status里尝试取
              if (aiScore < 0 && status.aiScore != null) aiScore = status.aiScore;
              if (aiScore < 0 && status.message) {
                // 从message里提取数字
                var match = status.message.match(/(\d+(?:\.\d+)?)/);
                if (match) aiScore = parseFloat(match[1]);
              }
              // 假阳性检查
              if (aiScore === 0 && status.status === "failed") {
                console.warn("[ZhuqueValidator] 假阳性：0%但status=failed，需重测");
                resolve({ success: false, reason: "false_positive", aiScore: 0 });
                return;
              }
              console.log("[ZhuqueValidator] 检测完成: AI率=" + aiScore + "%");
              resolve({ success: true, aiScore: aiScore, details: details, label: testLabel });
            }
          }
        } catch(e) {
          // 继续轮询
        }
      }, POLL_INTERVAL);
    });
  }

  // 验证闭环：检测AI率，如果超阈值返回false
  function validate(text, threshold, label) {
    var thr = threshold || DEFAULT_THRESHOLD;
    return submitForDetection(text, label).then(function(result) {
      if (!result.success) {
        return { passed: true, reason: "skipped", aiScore: -1, originalText: text };
      }
      var passed = result.aiScore >= 0 && result.aiScore <= thr;
      console.log("[ZhuqueValidator] AI率=" + result.aiScore + "%, 阈值=" + thr + "%, " + (passed ? "通过" : "未通过"));
      return {
        passed: passed,
        aiScore: result.aiScore,
        details: result.details,
        label: result.label,
        originalText: text
      };
    });
  }

  // 设置朱雀目录
  function setDir(dir) {
    ZHUQUE_DIR = dir;
    try { localStorage.setItem("zhuque-dir", dir); } catch(e) {}
  }

  // 检查守护进程是否在运行
  function isDaemonRunning() {
    var dir = _detectZhuqueDir();
    if (!dir || typeof require === "undefined") return false;
    var fs = require("fs");
    var path = require("path");
    var statusPath = path.join(dir, "daemon_status.json");
    try {
      if (!fs.existsSync(statusPath)) return false;
      var status = JSON.parse(fs.readFileSync(statusPath, "utf-8"));
      // 检查是否最近有活动（5分钟内）
      if (status.lastSeen) {
        var lastSeen = new Date(status.lastSeen).getTime();
        return (Date.now() - lastSeen) < 300000;
      }
      return true;
    } catch(e) { return false; }
  }

  return {
    submitForDetection: submitForDetection,
    validate: validate,
    setDir: setDir,
    isDaemonRunning: isDaemonRunning,
    detectDir: _detectZhuqueDir,
    MAX_RETRIES: MAX_RETRIES,
    DEFAULT_THRESHOLD: DEFAULT_THRESHOLD
  };
})();
