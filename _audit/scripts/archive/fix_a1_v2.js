const fs = require('fs');
const file = 'D:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue';
let c = fs.readFileSync(file, 'utf8');

// Fix template: replace the 4 children with title + actions div
// Use 
 aware matching
const oldTpl = '<span>生成流水线</span>\r\n        <button id="btn-close-pl" class="modal-close" @click="$emit(\'close\')">&times;</button>\r\n        <button class="btn-sm btn-secondary" id="btn-exec-log" @click="showExecLog = !showExecLog">执行日志</button>\r\n        <button class="btn-sm btn-secondary" id="btn-flow-toggle" @click="showFlowView = !showFlowView">{{ showFlowView ? \'步骤视图\' : \'流程视图\' }}</button>';

const newTpl = '<span class="pl-header-title">生成流水线</span>\r\n        <div class="pl-header-actions">\r\n          <button class="btn-sm btn-secondary" id="btn-exec-log" @click="showExecLog = !showExecLog">执行日志</button>\r\n          <button class="btn-sm btn-secondary" id="btn-flow-toggle" @click="showFlowView = !showFlowView">{{ showFlowView ? \'步骤视图\' : \'流程视图\' }}</button>\r\n          <button id="btn-close-pl" class="modal-close" @click="$emit(\'close\')">&times;</button>\r\n        </div>';

if (c.includes(oldTpl)) {
  c = c.replace(oldTpl, newTpl);
  fs.writeFileSync(file, c, 'utf8');
  console.log('A1 TEMPLATE FIXED');
} else {
  console.log('OLD TPL NOT FOUND, trying line-by-line');
  // Try with 
 instead of 

  const oldTpl2 = oldTpl.replace(/\r\n/g, '\n');
  if (c.includes(oldTpl2)) {
    c = c.replace(oldTpl2, newTpl.replace(/\r\n/g, '\n'));
    fs.writeFileSync(file, c, 'utf8');
    console.log('A1 TEMPLATE FIXED (lf)');
  } else {
    console.log('STILL NOT FOUND - dumping context');
    const idx = c.indexOf('<span>生成流水线</span>');
    console.log('span idx:', idx);
    if (idx > 0) console.log('context:', JSON.stringify(c.substring(idx, idx + 300)));
  }
}
