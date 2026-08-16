const fs = require("fs");
const file = "D:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue";
let lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
let result = [];
let skipEmptyActions = false;
for (let i = 0; i < lines.length; i++) {
  let trimmed = lines[i].trim();
  if (trimmed === '<div class="pl-header-actions">' && lines[i+1] && lines[i+1].trim() === '</div>') {
    i++;
    continue;
  }
  result.push(lines[i]);
}
fs.writeFileSync(file, result.join("\n"), "utf8");
console.log("CLEANED");
