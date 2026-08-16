const fs = require('fs');
const file = 'D:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue';
let c = fs.readFileSync(file, 'utf8');

// A1: Fix header layout - wrap buttons in a right-aligned div
const oldHeader = `        <span>生成流水线</span>
        <button id="btn-close-pl" class="modal-close" @click="$emit('close')">&times;</button>
        <button class="btn-sm btn-secondary" id="btn-exec-log" @click="showExecLog = !showExecLog">执行日志</button>
        <button class="btn-sm btn-secondary" id="btn-flow-toggle" @click="showFlowView = !showFlowView">{{ showFlowView ? '步骤视图' : '流程视图' }}</button>`;

const newHeader = `        <span class="pl-header-title">生成流水线</span>
        <div class="pl-header-actions">
          <button class="btn-sm btn-secondary" id="btn-exec-log" @click="showExecLog = !showExecLog">执行日志</button>
          <button class="btn-sm btn-secondary" id="btn-flow-toggle" @click="showFlowView = !showFlowView">{{ showFlowView ? '步骤视图' : '流程视图' }}</button>
          <button id="btn-close-pl" class="modal-close" @click="$emit('close')">&times;</button>
        </div>`;

c = c.replace(oldHeader, newHeader);

// Fix the CSS for header
const oldCSS = `.pl-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 32px; border-bottom: 1px solid var(--border-color); font-size: var(--font-size-xl); font-weight: 600; }`;
const newCSS = `.pl-header { display: flex; align-items: center; justify-content: space-between; padding: var(--space-5) var(--space-8); border-bottom: 1px solid var(--border-color); font-size: var(--font-size-xl); font-weight: 600; }
.pl-header-title { }
.pl-header-actions { display: flex; align-items: center; gap: var(--space-2); }`;

c = c.replace(oldCSS, newCSS);

fs.writeFileSync(file, c, 'utf8');
console.log('A1 DONE');
