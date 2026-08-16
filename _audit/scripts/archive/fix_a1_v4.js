const fs = require("fs");
const file = "D:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue";
let c = fs.readFileSync(file, "utf8");

const oldBlock = `      <div class="pl-header">
        <span class="pl-header-title">生成流水线</span>
        <div class="pl-header-actions">
        <button id="btn-close-pl" class="modal-close" @click="$emit('close')">&times;</button>
        </div>
        <button class="btn-sm btn-secondary" id="btn-exec-log" @click="showExecLog = !showExecLog">执行日志</button>
        <button class="btn-sm btn-secondary" id="btn-flow-toggle" @click="showFlowView = !showFlowView">{{ showFlowView ? '步骤视图' : '流程视图' }}</button>
      </div>`;

const newBlock = `      <div class="pl-header">
        <span class="pl-header-title">生成流水线</span>
        <div class="pl-header-actions">
          <button class="btn-sm btn-secondary" id="btn-exec-log" @click="showExecLog = !showExecLog">执行日志</button>
          <button class="btn-sm btn-secondary" id="btn-flow-toggle" @click="showFlowView = !showFlowView">{{ showFlowView ? '步骤视图' : '流程视图' }}</button>
          <button id="btn-close-pl" class="modal-close" @click="$emit('close')">&times;</button>
        </div>
      </div>`;

if (c.includes(oldBlock)) {
  c = c.replace(oldBlock, newBlock);
  fs.writeFileSync(file, c, "utf8");
  console.log("A1 FIXED v4");
} else {
  console.log("OLD BLOCK NOT FOUND");
  const idx = c.indexOf("pl-header");
  console.log(JSON.stringify(c.substring(idx - 10, idx + 500)));
}
