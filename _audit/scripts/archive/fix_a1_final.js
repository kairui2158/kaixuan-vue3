const fs = require("fs");
const file = "D:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue";
let lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
let result = [];
let inHeader = false;
let headerActionsStarted = false;
for (let i = 0; i < lines.length; i++) {
  let line = lines[i];
  let trimmed = line.trim();
  if (trimmed === '<div class="pl-header">') {
    inHeader = true;
    result.push(line);
    continue;
  }
  if (inHeader && trimmed === '</div>' && headerActionsStarted) {
    headerActionsStarted = false;
    result.push(line);
    continue;
  }
  if (inHeader && trimmed === '</div>' && !headerActionsStarted) {
    inHeader = false;
    result.push(line);
    continue;
  }
  if (inHeader && trimmed.includes('pl-header-title')) {
    result.push(line);
    continue;
  }
  if (inHeader && trimmed === '<div class="pl-header-actions">') {
    headerActionsStarted = true;
    result.push(line);
    continue;
  }
  if (inHeader && trimmed.includes('btn-close-pl')) {
    continue;
  }
  if (inHeader && trimmed.includes('btn-exec-log')) {
    if (!headerActionsStarted) {
      result.push('        <div class="pl-header-actions">');
      headerActionsStarted = true;
    }
    result.push('          <button class="btn-sm btn-secondary" id="btn-exec-log" @click="showExecLog = !showExecLog">执行日志</button>');
    continue;
  }
  if (inHeader && trimmed.includes('btn-flow-toggle')) {
    result.push('          <button class="btn-sm btn-secondary" id="btn-flow-toggle" @click="showFlowView = !showFlowView">{{ showFlowView ? ' + String.fromCharCode(39) + '步骤视图' + String.fromCharCode(39) + ' : ' + String.fromCharCode(39) + '流程视图' + String.fromCharCode(39) + ' }}</button>');
    result.push('          <button id="btn-close-pl" class="modal-close" @click="$emit(' + String.fromCharCode(39) + 'close' + String.fromCharCode(39) + ')">&times;</button>');
    result.push('        </div>');
    inHeader = false;
    continue;
  }
  result.push(line);
}
fs.writeFileSync(file, result.join("\n"), "utf8");
console.log("A1 FINAL DONE");
