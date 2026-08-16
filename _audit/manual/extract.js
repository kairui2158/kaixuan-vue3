const fs = require('fs');
const srcDir = 'C:/Users/凯瑞/Documents/New project 2/';
const outDir = 'D:/codex/novel-workshop-vue3/_audit/manual/';

function readLines(file, start, end) {
  var lines = fs.readFileSync(srcDir + file, 'utf8').split('\n');
  return lines.slice(start, end).join('\n');
}

var segments = {
  '_src_airequest.txt': ['renderer_v2.js', 2310, 2520],
  '_src_deai.txt': ['renderer_v2.js', 580, 810],
  '_src_apigen.txt': ['renderer_v2.js', 2180, 2310],
  '_src_streamchat.txt': ['renderer_v2.js', 2590, 2720],
  '_src_callaiapi.txt': ['renderer_v2.js', 4910, 5060],
  '_src_events.txt': ['renderer_v2.js', 54, 535],
  '_src_init.txt': ['renderer_v2.js', 1, 200],
  '_src_settings.txt': ['renderer_v2.js', 1980, 2080],
  '_src_pipeline.txt': ['js/pipeline-manager.js', 1, 100],
  '_src_pipeline2.txt': ['js/pipeline-manager.js', 1390, 1760],
  '_src_deai_js.txt': ['js/de-ai.js', 1, 80],
  '_src_deai_js2.txt': ['js/de-ai.js', 1980, 2070],
  '_src_main_full.txt': ['main.js', 1, 430],
  '_src_preload_full.txt': ['preload.js', 1, 40],
  '_src_storage_full.txt': ['js/storage.js', 1, 120],
  '_src_provider.txt': ['js/provider-manager.js', 1, 200],
  '_src_skill_engine.txt': ['js/skill-engine.js', 1, 200],
  '_src_skill_validators.txt': ['js/skill-validators.js', 1, 200],
  '_src_html_head.txt': ['renderer.html', 1, 100]
};

var report = [];
for (var name in segments) {
  var s = segments[name];
  try {
    var content = readLines(s[0], s[1], s[2]);
    fs.writeFileSync(outDir + name, content);
    report.push('[OK] ' + name + ': ' + content.length + ' bytes from ' + s[0] + ':' + s[1] + '-' + s[2]);
  } catch(e) {
    report.push('[ERR] ' + name + ': ' + e.message);
  }
}
console.log(report.join('\n'));
