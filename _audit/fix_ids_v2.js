const fs = require('fs');
const path = require('path');
const R = 'D:/codex/novel-workshop-vue3';
const D = JSON.parse(fs.readFileSync(R + '/_audit/html_diff.json', 'utf8'));
const C = JSON.parse(fs.readFileSync(R + '/_audit/missing_id_context.json', 'utf8'));
const P = {
  'App.vue':'src/App.vue','SidebarNav.vue':'src/components/sidebar/SidebarNav.vue',
  'ChapterTree.vue':'src/components/sidebar/ChapterTree.vue','EditorPanel.vue':'src/components/editor/EditorPanel.vue',
  'ChatPanel.vue':'src/components/chat/ChatPanel.vue','SettingsModal.vue':'src/components/settings/SettingsModal.vue',
  'AgentSettings.vue':'src/components/settings/AgentSettings.vue','SkillSettings.vue':'src/components/settings/SkillSettings.vue',
  'ApiSettings.vue':'src/components/settings/ApiSettings.vue','AppearanceSettings.vue':'src/components/settings/AppearanceSettings.vue',
  'DeAiSettings.vue':'src/components/settings/DeAiSettings.vue','DiagLogPanel.vue':'src/components/settings/DiagLogPanel.vue',
  'PipelinePanel.vue':'src/components/pipeline/PipelinePanel.vue','OutlineWorkspace.vue':'src/components/common/OutlineWorkspace.vue',
  'ScPanel.vue':'src/components/settings-collection/ScPanel.vue','PluginMarket.vue':'src/components/common/PluginMarket.vue',
  'DiffModal.vue':'src/components/common/DiffModal.vue','MemoryPanel.vue':'src/components/common/MemoryPanel.vue',
  'ExitConfirmModal.vue':'src/components/common/ExitConfirmModal.vue','DashboardModal.vue':'src/components/dashboard/DashboardModal.vue',
  'BreadcrumbBar.vue':'src/components/common/BreadcrumbBar.vue','ContextMenu.vue':'src/components/common/ContextMenu.vue',
  'AgentProgressPanel.vue':'src/components/sidebar/AgentProgressPanel.vue'
};
function mc(id) {
  if(id.startsWith('tab-')||id==='settings-modal'||id.startsWith('btn-save-settings')||id.startsWith('btn-close-settings')||id.startsWith('btn-test')||id.startsWith('btn-fetch')||id==='model-datalist'||id==='model-select')return'SettingsModal.vue';
  if(id.startsWith('af-')||id.startsWith('agent-form')||id.startsWith('agent-list')||id==='agent-select'||id.startsWith('btn-add-agent')||id.startsWith('btn-save-agent')||id.startsWith('btn-cancel-agent'))return'AgentSettings.vue';
  if(id.startsWith('sf-')||id.startsWith('skill-form')||id.startsWith('skill-list')||id.startsWith('skill-bind')||id.startsWith('sbm-')||id.startsWith('btn-add-skill')||id.startsWith('btn-save-skill')||id.startsWith('btn-cancel-skill')||id.startsWith('btn-save-bind')||id.startsWith('btn-save-skill-binding')||id==='btn-generate-outline-skills')return'SkillSettings.vue';
  if(id.startsWith('provider-'))return'ApiSettings.vue';
  if(id.startsWith('appearance')||id==='cfg-theme'||id==='cfg-font-size'||id==='cfg-font-size-val'||id==='btn-save-appearance')return'AppearanceSettings.vue';
  if(id.startsWith('deai-'))return'DeAiSettings.vue';
  if(id.startsWith('diag-')||id.startsWith('btn-diag'))return'DiagLogPanel.vue';
  if(id.startsWith('pl-')||id.startsWith('btn-pl-')||id==='pipeline-panel')return'PipelinePanel.vue';
  if(id.startsWith('ow-')||id.startsWith('btn-ow-')||id.startsWith('outline')||id.startsWith('npm-outline')||id==='btn-ai-co-create'||id==='btn-export-outline-md'||id==='btn-export-outline-txt'||id==='btn-import-outline'||id==='btn-lock-outline')return'OutlineWorkspace.vue';
  if(id.startsWith('sc-')||id.startsWith('btn-add-category')||id.startsWith('btn-add-item')||id.startsWith('btn-ai-gen-item')||id==='btn-close-sc'||id==='btn-close-sc-detail')return'ScPanel.vue';
  if(id.startsWith('market-')||id.startsWith('btn-market')||id.startsWith('btn-close-market')||id.startsWith('github-')||id.startsWith('btn-set-token')||id.startsWith('btn-token')||id.startsWith('btn-save-token')||id.startsWith('btn-toggle-key')||id.startsWith('token-')||id==='page-info'||id==='btn-prev-page'||id==='btn-next-page'||id==='plugin-market-modal')return'PluginMarket.vue';
  if(id.startsWith('diff')||id.startsWith('btn-diff')||id.startsWith('btn-close-diff'))return'DiffModal.vue';
  if(id.startsWith('mem-')||id.startsWith('btn-add-mem')||id==='btn-close-mem'||id==='btn-memory'||id==='memory-panel')return'MemoryPanel.vue';
  if(id.startsWith('btn-exit')||id==='exit-confirm-modal')return'ExitConfirmModal.vue';
  if(id==='dashboard-modal'||id==='btn-close-pl'||id==='btn-dashboard')return'DashboardModal.vue';
  if(id==='breadcrumb-bar')return'BreadcrumbBar.vue';
  if(id==='ctx-menu'||id==='inline-menu')return'ContextMenu.vue';
  if(id.startsWith('loading-'))return'AgentProgressPanel.vue';
  if(id==='app-sidebar'||id==='theme-toggle-btn'||id==='btn-outline-workspace'||id==='btn-settings-collection'||id==='btn-pipeline'||id==='btn-memory'||id==='btn-plugin-market'||id==='btn-settings'||id==='btn-dashboard')return'SidebarNav.vue';
  if(id==='chapter-tree'||id==='tree-body'||id==='current-project-name'||id.startsWith('btn-tree-')||id.startsWith('btn-open-')||id.startsWith('btn-create-')||id.startsWith('btn-new-')||id.startsWith('btn-save-volume')||id==='project-list'||id==='resizer-chapter'||id.startsWith('vm-'))return'ChapterTree.vue';
  if(id==='editor-panel'||id==='editor-title'||id==='editor-mode-badge'||id==='editor-content'||id==='find-replace-bar'||id.startsWith('find-')||id.startsWith('replace-')||id.startsWith('btn-find')||id.startsWith('btn-replace')||id==='btn-save-editor'||id==='btn-undo'||id==='btn-redo'||id==='btn-generate-content'||id==='btn-export'||id==='export-dropdown'||id==='btn-ai-names'||id==='btn-writing-rules'||id==='btn-timeline'||id==='btn-batch-review'||id==='btn-revise'||id==='word-count'||id.startsWith('cfg-editor-')||id==='resizer-editor-chat')return'EditorPanel.vue';
  if(id==='chat-panel'||id==='chat-context-bar'||id==='messages-container'||id==='messages-list'||id==='chat-empty-state'||id==='btn-send'||id.startsWith('skill-area')||id==='agent-info-bar'||id==='agent-info-name'||id==='agent-info-model'||id==='agent-select-chat'||id==='model-select-chat'||id.startsWith('skill-list')||id==='char-count'||id==='config-status'||id.startsWith('token-bar')||id.startsWith('token-count')||id.startsWith('token-input'))return'ChatPanel.vue';
  if(id.startsWith('app-')||id==='panel-backdrop'||id==='toast-container'||id==='dom-toast'||id==='tooltip'||id==='statusbar')return'App.vue';
  if(id.startsWith('cfg-'))return'SettingsModal.vue';
  return null;
}
const fc = {};
function gf(c) { if(!(c in fc)){const p=path.join(R,P[c]); fc[c]=fs.existsSync(p)?{c:fs.readFileSync(p,'utf8'),p}:null;} return fc[c]; }
const res = [];
for (var i = 0; i < D.missingIds.length; i++) {
  var id = D.missingIds[i];
  var ctx = C[i];
  if (!ctx) { res.push({id:id,s:'NO_CTX'}); continue; }
  var comp = mc(id);
  if (!comp) { res.push({id:id,s:'NO_COMP',t:ctx.tag,cl:ctx.cls}); continue; }
  var f = gf(comp);
  if (!f) { res.push({id:id,s:'NO_FILE',c:comp}); continue; }
  var idAttr = 'id="' + id + '"';
  if (f.c.indexOf(idAttr) !== -1) { res.push({id:id,s:'EXISTS',c:comp}); continue; }
  var cls = ctx.cls;
  if (cls) {
    var exact = 'class="' + cls + '"';
    var idx = f.c.indexOf(exact);
    if (idx !== -1) { f.c = f.c.substring(0,idx) + idAttr + ' ' + f.c.substring(idx); res.push({id:id,s:'FIXED',c:comp,m:'cls_exact'}); continue; }
    var sp = 0;
    var fixed = false;
    while (true) {
      var ci = f.c.indexOf('class="', sp);
      if (ci === -1) break;
      var eq = f.c.indexOf('"', ci + 7);
      if (eq === -1) break;
      var cv = f.c.substring(ci + 7, eq);
      if (cv.split(' ').indexOf(cls) !== -1) {
        f.c = f.c.substring(0,ci) + idAttr + ' ' + f.c.substring(ci);
        res.push({id:id,s:'FIXED',c:comp,m:'cls_list'});
        fixed = true;
        break;
      }
      sp = eq + 1;
    }
    if (fixed) continue;
  }
  res.push({id:id,s:'NOT_FOUND',c:comp,t:ctx.tag,cl:ctx.cls,tx:(ctx.text||'').substring(0,80)});
}
Object.keys(fc).forEach(function(k){var f=fc[k];if(f&&f.c!==fs.readFileSync(f.p,'utf8'))fs.writeFileSync(f.p,f.c,'utf8');});
var fx=res.filter(function(r){return r.s==='FIXED';});
var ex=res.filter(function(r){return r.s==='EXISTS';});
var nf=res.filter(function(r){return r.s==='NOT_FOUND';});
var nc=res.filter(function(r){return r.s==='NO_COMP';});
var md='# HTML Fix Reconciliation Table\n\n## Summary\n- Total: '+res.length+'\n- Fixed: '+fx.length+'\n- Already exists: '+ex.length+'\n- Not found: '+nf.length+'\n- No component mapping: '+nc.length+'\n\n## Fix Records\n\n| # | ID | Component | Tag | Class | Method | Status |\n|---|----|------|------|------|------|------|\n';
res.forEach(function(r,i){md+='| '+(i+1)+' | '+r.id+' | '+(r.c||'-')+' | '+(r.t||'-')+' | '+(r.cl||'-')+' | '+(r.m||'-')+' | '+r.s+' |\n';});
fs.writeFileSync(R+'/_audit/HTML_RECONCILIATION_TABLE.md',md,'utf8');
console.log('=== SUMMARY ===');
console.log('Total:',res.length,'Fixed:',fx.length,'Exists:',ex.length,'NotFound:',nf.length,'NoComp:',nc.length);
if(nf.length>0){console.log('\nNOT_FOUND ('+nf.length+')');nf.slice(0,30).forEach(function(r){console.log(r.id+' | '+r.c+' | tag='+r.t+' | cls='+r.cl);});}
if(nc.length>0){console.log('\nNO_COMP ('+nc.length+')');nc.forEach(function(r){console.log(r.id+' | tag='+r.t+' | cls='+r.cl);});}
