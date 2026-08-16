const fs = require("fs");
const file = "D:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue";
let lines = fs.readFileSync(file, "utf8").split("\n");
let i = 0;
while (i < lines.length) {
  if (lines[i].includes("<span>生成流水线</span>")) {
    lines[i] = lines[i].replace("<span>生成流水线</span>", "<span class=\"pl-header-title\">生成流水线</span>");
    break;
  }
  i++;
}
let j = 0;
while (j < lines.length) {
  if (lines[j].includes('id="btn-close-pl"')) {
    let closeLine = lines[j];
    let indent = closeLine.match(/^(\s*)/)[1];
    lines[j] = indent + '<div class="pl-header-actions">';
    lines.splice(j + 1, 0, closeLine, indent + '</div>');
    break;
  }
  j++;
}
fs.writeFileSync(file, lines.join("\n"), "utf8");
console.log("A1 FIXED v3");
