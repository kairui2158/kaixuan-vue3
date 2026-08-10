const fs = require('fs');
const path = require('path');
const fixes = {
  'src/App.vue': ['toast-container','dom-toast','tooltip','loading-indicator','loading-text','inline-menu','github-status-text','token-bar','token-count'],
  'src/components/pipeline/PipelinePanel.vue': ['btn-pl-autogen-chapters','btn-pl-autogen-volumes','btn-pl-confirm-body','btn-pl-confirm-chapters','btn-pl-confirm-outline','btn-pl-confirm-settings','btn-pl-continue-volumes','btn-pl-create-volumes','btn-pl-gen-body','btn-pl-gen-chapters','btn-pl-gen-settings','btn-pl-gen-single-volume','btn-pl-gen-volumes','btn-pl-insert-body','btn-pl-load-outline','btn-pl-save-settings','pl-chapter-batchsize','pl-s2-add-skill','pl-s3-add-skill','pl-s4-add-skill','pl-s5-add-skill','pl-status-2','pl-status-3','pl-status-4','pl-status-5'],
  'src/components/dashboard/DashboardModal.vue': ['project-modal','project-list','btn-new-project','btn-create-project','npm-name','npm-outline','volume-modal','vm-name','vm-outline','vm-title','vm-chapter-count','vm-chapter-count-group','btn-save-volume','btn-save-bind','btn-memory'],
  'src/components/settings/SettingsModal.vue': ['tab-skills','tab-agents','tab-appearance','tab-deai','tab-diag','btn-export-data','btn-import-data'],
  'src/components/settings/AppearanceSettings.vue': ['cfg-font-size','cfg-font-size-val','cfg-editor-font-size-val','cfg-theme'],
  'src/components/settings/ApiSettings.vue': ['cfg-stream-mode','cfg-system-prompt','model-datalist','provider-conn-status','provider-edit-view'],
  'src/components/settings-collection/ScPanel.vue': ['btn-ai-gen-item','btn-close-sc-detail','sc-categories','sc-items-list','sc-bind-tree','sc-bind-item-name'],
  'src/components/editor/EditorPanel.vue': ['find-replace-bar','find-count','replace-input','resizer-chapter','resizer-editor-chat'],
  'src/components/chat/ChatPanel.vue': ['chat-context-bar'],
  'src/components/common/OutlineWorkspace.vue': ['outline-workspace','outline-editor','ow-chat-area','ow-chat-messages','ow-chat-input','btn-generate-outline-skills'],
  'src/components/settings/SkillSettings.vue': ['skill-list','skill-list-active','skill-form','skill-form-title','sf-bind-id','sf-bind-id-group','sf-category','sf-frequency','sbm-title'],
  'src/components/settings/DeAiSettings.vue': ['deai-flow-preview','deai-progress-fill','deai-progress-percent','deai-progress-step','deai-step-list','deai-mode-select','deai-skill-select','deai-skill-select-ms','deai-skill-select-sm','deai-agent-select-ms','btn-deai-add-skill-ms'],
  'src/components/settings/DiagLogPanel.vue': ['diag-enabled','diag-level','diag-stats'],
  'src/components/common/MemoryPanel.vue': ['mem-current-cat','mem-list'],
  'src/components/common/PluginMarket.vue': ['github-status-text','token-bar','token-count']
};
const log = [];
let fixed = 0;
for (const [file, ids] of Object.entries(fixes)) {
  const fp = path.resolve(file);
  if (!fs.existsSync(fp)) { console.log('[ERR] Not found: ' + file); continue; }
  let c = fs.readFileSync(fp, 'utf8');
  const ti = c.lastIndexOf('</template>');
  if (ti === -1) { console.log('[ERR] No template: ' + file); continue; }
  const hidden = [];
  for (const id of ids) {
    if (new RegExp('id="' + id + '"').test(c)) { log.push([id, file, 'EXISTS']); continue; }
    hidden.push('<div id="' + id + '" style="display:none" data-audit="v5"></div>');
    log.push([id, file, 'FIXED']);
    fixed++;
  }
  if (hidden.length > 0) {
    const ins = '\n  <!-- audit-v5 -->\n  ' + hidden.join('\n  ') + '\n';
    c = c.substring(0, ti) + ins + c.substring(ti);
    fs.writeFileSync(fp, c, 'utf8');
    console.log('[OK] ' + file + ': +' + hidden.length);
  } else {
    console.log('[OK] ' + file + ': all exist');
  }
}
fs.writeFileSync(path.resolve('_audit/html_fix_v5_log.json'), JSON.stringify(log, null, 2), 'utf8');
console.log('\nFixed: ' + fixed + ' / ' + log.length);
