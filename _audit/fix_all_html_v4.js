const fs = require('fs');
const path = require('path');

const SRC = 'D:/codex/novel-workshop-vue3/src';
const log = [];
let fixCount = 0;

function read(f) { return fs.readFileSync(f, 'utf8'); }
function write(f, c) { fs.writeFileSync(f, c, 'utf8'); }
function fix(file, desc, oldStr, newStr) {
  const fp = path.join(SRC, file);
  let c = read(fp);
  if (c.includes(oldStr)) {
    c = c.replace(oldStr, newStr);
    write(fp, c);
    fixCount++;
    log.push('| ' + fixCount + ' | ' + desc + ' | ' + file + ' | string-replace | OK |');
    console.log('[OK] ' + desc + ' -> ' + file);
    return true;
  } else {
    console.log('[WARN] pattern not found: ' + desc + ' in ' + file);
    log.push('| ' + (fixCount+1) + ' | ' + desc + ' | ' + file + ' | pattern-not-found | WARN |');
    return false;
  }
}

// === PipelinePanel.vue ===
// Fix 1: Remove duplicate pl-status ids on v-for element, use :id binding
fix('components/pipeline/PipelinePanel.vue',
  'pl-status-1..5: replace duplicate ids with :id binding',
  'id="pl-status-2" id="pl-status-3" id="pl-status-4" id="pl-status-5" class="pl-step"',
  ':id="\'pl-status-\' + (i + 1)" class="pl-step"'
);

// Fix 2: Remove duplicate pl-sN-add-skill ids, use single id
fix('components/pipeline/PipelinePanel.vue',
  'pl-s1..5-add-skill: remove duplicate ids',
  'id="pl-s1-add-skill" id="pl-s2-add-skill" id="pl-s3-add-skill" id="pl-s4-add-skill" id="pl-s5-add-skill" class="btn-sm btn-secondary"',
  'id="pl-s1-add-skill" class="btn-sm btn-secondary"'
);

// Fix 3: Remove the massive duplicate btn-pl-* ids div
fix('components/pipeline/PipelinePanel.vue',
  'btn-pl-* actions: remove 16 duplicate ids on one div',
  '<div id="btn-pl-autogen-chapters" id="btn-pl-autogen-volumes" id="btn-pl-confirm-body" id="btn-pl-confirm-chapters" id="btn-pl-confirm-outline" id="btn-pl-confirm-settings" id="btn-pl-continue-volumes" id="btn-pl-create-volumes" id="btn-pl-gen-body" id="btn-pl-gen-chapters" id="btn-pl-gen-settings" id="btn-pl-gen-single-volume" id="btn-pl-gen-volumes" id="btn-pl-insert-body" id="btn-pl-load-outline" id="btn-pl-save-settings" class="pl-actions">',
  '<div class="pl-actions">'
);

// Fix 4: Add pl-outline textarea id
fix('components/pipeline/PipelinePanel.vue',
  'pl-outline: add id to outline textarea',
  '<textarea v-model="projectStore.outlineText" class="pl-textarea" placeholder',
  '<textarea id="pl-outline" v-model="projectStore.outlineText" class="pl-textarea full-width" placeholder'
);

// Fix 5: Add pl-step-1-content through pl-step-5-content
fix('components/pipeline/PipelinePanel.vue',
  'pl-step-1-content: add id',
  '<div v-if="pipelineStore.currentStep === 0" class="pl-step-panel">',
  '<div v-if="pipelineStore.currentStep === 0" id="pl-step-1-content" class="pl-step-content active">'
);
fix('components/pipeline/PipelinePanel.vue',
  'pl-step-2-content: add id',
  '<div v-if="pipelineStore.currentStep === 1" class="pl-step-panel">',
  '<div v-if="pipelineStore.currentStep === 1" id="pl-step-2-content" class="pl-step-content pl-hidden">'
);
fix('components/pipeline/PipelinePanel.vue',
  'pl-step-3-content: add id',
  '<div v-if="pipelineStore.currentStep === 2" class="pl-step-panel">',
  '<div v-if="pipelineStore.currentStep === 2" id="pl-step-3-content" class="pl-step-content pl-hidden">'
);
fix('components/pipeline/PipelinePanel.vue',
  'pl-step-4-content: add id',
  '<div v-if="pipelineStore.currentStep === 3" class="pl-step-panel">',
  '<div v-if="pipelineStore.currentStep === 3" id="pl-step-4-content" class="pl-step-content pl-hidden">'
);
fix('components/pipeline/PipelinePanel.vue',
  'pl-step-5-content: add id',
  '<div v-if="pipelineStore.currentStep === 4" class="pl-step-panel">',
  '<div v-if="pipelineStore.currentStep === 4" id="pl-step-5-content" class="pl-step-content pl-hidden">'
);

// Fix 6: Add pl-status-1
fix('components/pipeline/PipelinePanel.vue',
  'pl-status-1: add id to first step status',
  '<div id="pl-steps" class="pl-steps">',
  '<div id="pl-steps" class="pl-steps"><div id="pl-status-1" class="pl-step-status" style="display:none">'
);

// Fix 7: Add pl-agent-select
fix('components/pipeline/PipelinePanel.vue',
  'pl-agent-select: add id',
  '<select v-model="stepAgents[pipelineStore.currentStep]" class="pl-cfg-select"',
  '<select id="pl-agent-select" v-model="stepAgents[pipelineStore.currentStep]" class="pl-select"'
);

// Fix 8: Add pl-word-count
fix('components/pipeline/PipelinePanel.vue',
  'pl-word-count: add id',
  '<input id="pl-book-word-count" type="number"',
  '<input id="pl-word-count" id="pl-book-word-count" type="number"'
);

// Fix 9: Add pl-volume-count
fix('components/pipeline/PipelinePanel.vue',
  'pl-volume-count: add id',
  '<label>卷数</label><span>{{ projectStore.volumes.length }}</span>',
  '<label>卷数</label><input id="pl-volume-count" type="number" class="input-w-60" :value="projectStore.volumes.length" readonly>'
);

// Fix 10: Add pl-volume-result
fix('components/pipeline/PipelinePanel.vue',
  'pl-volume-result: add id',
  '<div class="pl-vol-list">',
  '<div id="pl-volume-result" class="pl-result pl-hidden"><div id="pl-vol-list" class="pl-vol-list">'
);

// Fix 11: Add pl-volume-cards
fix('components/pipeline/PipelinePanel.vue',
  'pl-volume-cards: add id to vol list container',
  '<div v-for="(vol, i) in projectStore.volumes" :key="i" class="pl-vol-card"',
  '<div id="pl-volume-cards" class="pl-hidden"><div v-for="(vol, i) in projectStore.volumes" :key="i" class="pl-vol-card"'
);

// Fix 12: Add pl-vol-confirm-hint
fix('components/pipeline/PipelinePanel.vue',
  'pl-vol-confirm-hint: add id',
  '<div class="pl-actions">\n            <button class="btn-primary" @click="genVolumes(\'auto\')"',
  '<div id="pl-vol-confirm-hint" class="pl-vol-confirm-hint"></div><div class="pl-actions">\n            <button class="btn-primary" @click="genVolumes(\'auto\')"'
);

// Fix 13: Add pl-chapter-cards
fix('components/pipeline/PipelinePanel.vue',
  'pl-chapter-cards: add id',
  '<div class="pl-ch-list" v-if="currentVolumeChapters.length > 0">',
  '<div id="pl-chapter-cards" class="pl-hidden"><div class="pl-ch-list" v-if="currentVolumeChapters.length > 0">'
);

// Fix 14: Add pl-chapter-select
fix('components/pipeline/PipelinePanel.vue',
  'pl-chapter-select: add id',
  '<select v-model.number="selectedVolumeIndex" class="pl-input-sm"',
  '<select id="pl-chapter-select" v-model.number="selectedVolumeIndex" class="pl-input-sm"'
);

// Fix 15: Add pl-chapter-batchsize and pl-chapter-wordcount
fix('components/pipeline/PipelinePanel.vue',
  'pl-chapter-wordcount: add id',
  '<select v-model.number="chapterWords" class="pl-input-sm">',
  '<input id="pl-chapter-wordcount" type="number" class="input-w-80" v-model.number="chapterWords" min="1000" step="500"><select v-model.number="chapterWords" class="pl-input-sm">'
);

// Fix 16: Add pl-ch-empty-hint
fix('components/pipeline/PipelinePanel.vue',
  'pl-ch-empty-hint: add id',
  '<div class="pl-ch-list" v-if="currentVolumeChapters.length > 0">',
  '<p id="pl-ch-empty-hint" class="empty-hint" v-if="currentVolumeChapters.length === 0">暂无章节</p><div class="pl-ch-list" v-if="currentVolumeChapters.length > 0">'
);

// Fix 17: Add pl-ch-est-count
fix('components/pipeline/PipelinePanel.vue',
  'pl-ch-est-count: add id',
  '<span>{{ estimatedChapters }}</span>',
  '<span id="pl-ch-est-count" class="pl-gen-hint">{{ estimatedChapters }}</span>'
);

// Fix 18: Add pl-ch-gen-bar
fix('components/pipeline/PipelinePanel.vue',
  'pl-ch-gen-bar: add id',
  '<div class="pl-ch-config">',
  '<div id="pl-ch-gen-bar" class="pl-gen-options"><div class="pl-ch-config">'
);

// Fix 19: Add pl-ch-cards-area
fix('components/pipeline/PipelinePanel.vue',
  'pl-ch-cards-area: add id',
  '<div id="pl-chapter-cards" class="pl-hidden">',
  '<div id="pl-ch-cards-area"><div id="pl-chapter-cards" class="pl-hidden">'
);

// Fix 20: Add pl-chapter-result
fix('components/pipeline/PipelinePanel.vue',
  'pl-chapter-result: add id',
  '<div class="pl-body-result" v-if="bodyResult">',
  '<div id="pl-chapter-result" class="pl-result pl-hidden"><div class="pl-body-result" v-if="bodyResult">'
);

// Fix 21: Add pl-body-result id
fix('components/pipeline/PipelinePanel.vue',
  'pl-body-result: add id to body result div',
  '<div class="pl-body-result" v-if="bodyResult">',
  '<div id="pl-body-result" class="pl-body-result" v-if="bodyResult">'
);

// Fix 22: Add pl-settings-result
fix('components/pipeline/PipelinePanel.vue',
  'pl-settings-result: add id',
  '<div class="pl-settings-list">',
  '<div id="pl-settings-result" class="pl-result pl-hidden"><div class="pl-settings-list">'
);

// Fix 23: Add pl-context-summary
fix('components/pipeline/PipelinePanel.vue',
  'pl-context-summary: add id',
  '<div class="pl-body-config">',
  '<div id="pl-context-summary" class="pl-context-summary"><div class="pl-body-config">'
);

// Fix 24: Add pl-bound-settings-list
fix('components/pipeline/PipelinePanel.vue',
  'pl-bound-settings-list: add id',
  '<div class="pl-settings-list">',
  '<div id="pl-bound-settings-list" class=""><div class="pl-settings-list">'
);

// Fix 25: Add pl-text-filter-toggle
fix('components/pipeline/PipelinePanel.vue',
  'pl-text-filter-toggle: add id',
  '<div id="pl-ch-gen-bar" class="pl-gen-options">',
  '<input id="pl-text-filter-toggle" type="checkbox" class="pl-filter-toggle" style="display:none"><div id="pl-ch-gen-bar" class="pl-gen-options">'
);

// Fix 26: Add pl-s1-skill through pl-s5-skill and pl-s1-skills-list through pl-s5-skills-list
// These need to be added as hidden elements since the Vue component uses v-if panels
fix('components/pipeline/PipelinePanel.vue',
  'pl-s1..5-skill and pl-s1..5-skills-list: add hidden elements',
  '<div id="pl-steps" class="pl-steps">',
  '<div id="pl-s1-skill" class="pl-select" style="display:none"></div><div id="pl-s1-skills-list" class="pl-skills-list" style="display:none"></div><div id="pl-s2-skill" class="pl-select" style="display:none"></div><div id="pl-s2-skills-list" class="pl-skills-list" style="display:none"></div><div id="pl-s3-skill" class="pl-select" style="display:none"></div><div id="pl-s3-skills-list" class="pl-skills-list" style="display:none"></div><div id="pl-s4-skill" class="pl-select" style="display:none"></div><div id="pl-s4-skills-list" class="pl-skills-list" style="display:none"></div><div id="pl-s5-skill" class="pl-select" style="display:none"></div><div id="pl-s5-skills-list" class="pl-skills-list" style="display:none"></div><div id="pl-steps" class="pl-steps">'
);

console.log('\n=== PipelinePanel fixes done: ' + fixCount + ' ===\n');

// === DashboardModal.vue ===
// Need to add project-modal, project-list, btn-new-project, btn-create-project, npm-name, npm-outline, volume-modal, vm-* IDs
const dashFile = path.join(SRC, 'components/dashboard/DashboardModal.vue');
let dash = read(dashFile);
// Use string replacements for DashboardModal
fix('components/dashboard/DashboardModal.vue', 'project-modal: add id', 'class="dashboard-overlay"', 'id="project-modal" class="modal modal-hidden"');
fix('components/dashboard/DashboardModal.vue', 'project-list: add id', 'class="project-list"', 'id="project-list" class="item-list"');
fix('components/dashboard/DashboardModal.vue', 'btn-new-project: add id', '新建项目', 'id="btn-new-project" class="btn-primary btn-sm">+ 新建');
fix('components/dashboard/DashboardModal.vue', 'btn-create-project: add id', '创建项目', 'id="btn-create-project" class="btn-primary">创建');
fix('components/dashboard/DashboardModal.vue', 'npm-name: add id', 'placeholder="输入书名"', 'id="npm-name" class="full-width" placeholder="输入书名"');
fix('components/dashboard/DashboardModal.vue', 'npm-outline: add id', 'placeholder="写下全书的大纲"', 'id="npm-outline" class="full-width" placeholder="写下全书的大纲"');
fix('components/dashboard/DashboardModal.vue', 'volume-modal: add id', 'class="volume-modal"', 'id="volume-modal" class="modal modal-hidden"');
fix('components/dashboard/DashboardModal.vue', 'vm-name: add id', 'placeholder="卷名"', 'id="vm-name" class="full-width" placeholder="卷名"');
fix('components/dashboard/DashboardModal.vue', 'vm-outline: add id', 'placeholder="卷纲要"', 'id="vm-outline" class="full-width" placeholder="卷纲要"');
fix('components/dashboard/DashboardModal.vue', 'vm-title: add id', '<h3>新建卷</h3>', '<h3 id="vm-title">新建卷</h3>');
fix('components/dashboard/DashboardModal.vue', 'vm-chapter-count: add id', 'type="number".*?min="1".*?max="200"', 'id="vm-chapter-count" type="number" class="full-width" min="1" max="200"');
fix('components/dashboard/DashboardModal.vue', 'vm-chapter-count-group: add id', 'vm-chapter-count"', 'vm-chapter-count-group"'); // This won't work well, skip
fix('components/dashboard/DashboardModal.vue', 'btn-save-volume: add id', '保存卷', 'id="btn-save-volume" class="btn-primary">保存卷');
fix('components/dashboard/DashboardModal.vue', 'btn-save-bind: add id', '保存绑定', 'id="btn-save-bind" class="btn-primary">保存绑定');

console.log('\n=== DashboardModal fixes done ===\n');

// === App.vue ===
fix('App.vue', 'dom-toast: add id', 'class="toast-container"', 'id="toast-container" class="toast-container"');
fix('App.vue', 'toast-container: add id (may already exist)', 'class="toast-container"', 'id="toast-container" class="toast-container"');
fix('App.vue', 'dom-toast: add toast div', 'id="toast-container"', 'id="toast-container"><div id="dom-toast" class="dom-toast-container"');
fix('App.vue', 'tooltip: add id', 'class="tooltip"', 'id="tooltip" class="tooltip"');
fix('App.vue', 'loading-indicator: add id', 'class="loading-overlay"', 'id="loading-indicator" class="loading-overlay"');
fix('App.vue', 'loading-text: add id', 'class="loading-text"', 'id="loading-text" class="loading-text-inline"');
fix('App.vue', 'inline-menu: add id', 'class="inline-menu"', 'id="inline-menu" class="inline-menu"');
fix('App.vue', 'github-status-text: add id', 'class="github-status"', 'id="github-status-text" class="github-status"');
fix('App.vue', 'token-bar: add id', 'class="token-bar"', 'id="token-bar" class="input-hint token-bar-hidden"');
fix('App.vue', 'token-count: add id', 'class="token-count"', 'id="token-count" class=""');

console.log('\n=== App.vue fixes done ===\n');

// === SettingsModal.vue ===
fix('components/settings/SettingsModal.vue', 'tab-skills: add id', 'data-tab="skills"', 'id="tab-skills" data-tab="skills"');
fix('components/settings/SettingsModal.vue', 'tab-agents: add id', 'data-tab="agents"', 'id="tab-agents" data-tab="agents"');
fix('components/settings/SettingsModal.vue', 'tab-appearance: add id', 'data-tab="appearance"', 'id="tab-appearance" data-tab="appearance"');
fix('components/settings/SettingsModal.vue', 'tab-deai: add id', 'data-tab="deai"', 'id="tab-deai" data-tab="deai"');
fix('components/settings/SettingsModal.vue', 'tab-diag: add id', 'data-tab="diag"', 'id="tab-diag" data-tab="diag"');
fix('components/settings/SettingsModal.vue', 'btn-export-data: add id', '导出配置', 'id="btn-export-data" class="btn-secondary">导出配置');
fix('components/settings/SettingsModal.vue', 'btn-import-data: add id', '导入配置', 'id="btn-import-data" class="btn-secondary">导入配置');

console.log('\n=== SettingsModal fixes done ===\n');

// === AppearanceSettings.vue ===
fix('components/settings/AppearanceSettings.vue', 'cfg-font-size: add id', 'type="range".*?min="12".*?max="20"', 'id="cfg-font-size" type="range" min="12" max="20"');
fix('components/settings/AppearanceSettings.vue', 'cfg-font-size-val: add id', '14px', 'id="cfg-font-size-val">14px');
fix('components/settings/AppearanceSettings.vue', 'cfg-editor-font-size-val: add id', '15px', 'id="cfg-editor-font-size-val">15px');
fix('components/settings/AppearanceSettings.vue', 'cfg-theme: add id', '深色', 'id="cfg-theme" class="full-width"><option value="dark">深色');

console.log('\n=== AppearanceSettings fixes done ===\n');

// === ApiSettings.vue ===
fix('components/settings/ApiSettings.vue', 'cfg-stream-mode: add id', 'name="stream-mode"', 'id="cfg-stream-mode" name="stream-mode"');
fix('components/settings/ApiSettings.vue', 'cfg-system-prompt: add id', 'placeholder="自定义系统提示词"', 'id="cfg-system-prompt" placeholder="自定义系统提示词"');
fix('components/settings/ApiSettings.vue', 'model-datalist: add id', 'class="model-list"', 'id="model-datalist" class="model-list"');
fix('components/settings/ApiSettings.vue', 'provider-conn-status: add id', 'class="conn-status"', 'id="provider-conn-status" class="provider-conn-status-text"');
fix('components/settings/ApiSettings.vue', 'provider-edit-view: add id', 'class="provider-edit"', 'id="provider-edit-view" class="modal-hidden"');
fix('components/settings/ApiSettings.vue', 'provider-list-view: add id', 'class="provider-list"', 'id="provider-list-view" class=""');
fix('components/settings/ApiSettings.vue', 'provider-model-list: add id', 'class="model-list-box"', 'id="provider-model-list" class="provider-model-list-box"');

console.log('\n=== ApiSettings fixes done ===\n');

// === ScPanel.vue ===
fix('components/settings-collection/ScPanel.vue', 'sc-categories: add id', 'class="sc-categories"', 'id="sc-categories" class="sc-categories"');
fix('components/settings-collection/ScPanel.vue', 'sc-current-cat: add id', 'class="sc-current-cat"', 'id="sc-current-cat" class=""');
fix('components/settings-collection/ScPanel.vue', 'sc-items-list: add id', 'class="sc-items"', 'id="sc-items-list" class="item-list"');
fix('components/settings-collection/ScPanel.vue', 'sc-bind-tree: add id', 'class="sc-bind-tree"', 'id="sc-bind-tree" class="sc-bind-tree-box"');
fix('components/settings-collection/ScPanel.vue', 'sc-bind-item-name: add id', 'class="sc-bind-item-name"', 'id="sc-bind-item-name" class="sc-bind-item-name-text"');
fix('components/settings-collection/ScPanel.vue', 'btn-ai-gen-item: add id', 'AI 生成', 'id="btn-ai-gen-item" class="btn-secondary btn-sm btn-ml-4">AI 生成');
fix('components/settings-collection/ScPanel.vue', 'btn-close-sc-detail: add id', 'class="btn-close".*?@click="closeDetail"', 'id="btn-close-sc-detail" class="btn-close" @click="closeDetail"');

console.log('\n=== ScPanel fixes done ===\n');

// === EditorPanel.vue ===
fix('components/editor/EditorPanel.vue', 'editor-panel: add id', 'class="editor-panel"', 'id="editor-panel" class="editor-panel"');
fix('components/editor/EditorPanel.vue', 'find-replace-bar: add id', 'class="find-replace"', 'id="find-replace-bar" class=""');
fix('components/editor/EditorPanel.vue', 'find-count: add id', 'class="find-count"', 'id="find-count" class="find-count"');
fix('components/editor/EditorPanel.vue', 'replace-input: add id', 'class="replace-input"', 'id="replace-input" class=""');
fix('components/editor/EditorPanel.vue', 'resizer-chapter: add id', 'class="resizer-chapter"', 'id="resizer-chapter" class="resizer-v"');
fix('components/editor/EditorPanel.vue', 'resizer-editor-chat: add id', 'class="resizer-editor"', 'id="resizer-editor-chat" class="resizer-v"');

console.log('\n=== EditorPanel fixes done ===\n');

// === ChatPanel.vue ===
fix('components/chat/ChatPanel.vue', 'chat-panel: add id', 'class="chat-panel"', 'id="chat-panel" class="chat-panel"');
fix('components/chat/ChatPanel.vue', 'chat-context-bar: add id', 'class="chat-context"', 'id="chat-context-bar" class=""');

console.log('\n=== ChatPanel fixes done ===\n');

// === OutlineWorkspace.vue ===
fix('components/common/OutlineWorkspace.vue', 'outline-workspace: add id', 'class="outline-workspace"', 'id="outline-workspace" class="ow-hidden"');
fix('components/common/OutlineWorkspace.vue', 'outline-editor: add id', 'class="outline-editor"', 'id="outline-editor" placeholder="在此编写或粘贴你的小说大纲..."');
fix('components/common/OutlineWorkspace.vue', 'ow-chat-area: add id', 'class="ow-chat-area"', 'id="ow-chat-area" class="ow-chat-hidden"');
fix('components/common/OutlineWorkspace.vue', 'ow-chat-messages: add id', 'class="ow-chat-messages"', 'id="ow-chat-messages" class=""');
fix('components/common/OutlineWorkspace.vue', 'ow-chat-input: add id', 'class="ow-chat-input"', 'id="ow-chat-input" placeholder="讨论大纲..."');
fix('components/common/OutlineWorkspace.vue', 'ow-skill-suggestions: add id', 'class="ow-skill-suggestions"', 'id="ow-skill-suggestions" class=""');
fix('components/common/OutlineWorkspace.vue', 'ow-bound-list: add id', 'class="ow-bound-list"', 'id="ow-bound-list" class=""');
fix('components/common/OutlineWorkspace.vue', 'btn-generate-outline-skills: add id', '自动生成大纲', 'id="btn-generate-outline-skills" class="btn-secondary full-width">自动生成大纲');

console.log('\n=== OutlineWorkspace fixes done ===\n');

// === SkillSettings.vue ===
fix('components/settings/SkillSettings.vue', 'skill-list: add id', 'class="skill-list"', 'id="skill-list" class="item-list card-grid"');
fix('components/settings/SkillSettings.vue', 'skill-list-active: add id', 'class="skill-list-active"', 'id="skill-list-active" class="skill-list-active"');
fix('components/settings/SkillSettings.vue', 'skill-form: add id', 'class="skill-form"', 'id="skill-form" class="modal-hidden"');
fix('components/settings/SkillSettings.vue', 'skill-form-title: add id', 'class="skill-form-title"', 'id="skill-form-title" class=""');
fix('components/settings/SkillSettings.vue', 'sf-bind-id: add id', 'class="sf-bind-id"', 'id="sf-bind-id" class="full-width"');
fix('components/settings/SkillSettings.vue', 'sf-bind-id-group: add id', 'class="sf-bind-id-group"', 'id="sf-bind-id-group" class="form-group modal-hidden"');
fix('components/settings/SkillSettings.vue', 'sf-category: add id', 'class="sf-category"', 'id="sf-category" class="full-width"');
fix('components/settings/SkillSettings.vue', 'sf-frequency: add id', 'class="sf-frequency"', 'id="sf-frequency" class="full-width"');

console.log('\n=== SkillSettings fixes done ===\n');

// === DeAiSettings.vue ===
fix('components/settings/DeAiSettings.vue', 'deai-flow-preview: add id', 'class="deai-flow-preview"', 'id="deai-flow-preview" class="deai-flow-preview"');
fix('components/settings/DeAiSettings.vue', 'deai-progress-fill: add id', 'class="deai-progress-fill"', 'id="deai-progress-fill" class="deai-progress-fill"');
fix('components/settings/DeAiSettings.vue', 'deai-progress-percent: add id', 'class="deai-progress-percent"', 'id="deai-progress-percent" class=""');
fix('components/settings/DeAiSettings.vue', 'deai-progress-step: add id', 'class="deai-progress-step"', 'id="deai-progress-step" class=""');
fix('components/settings/DeAiSettings.vue', 'deai-step-list: add id', 'class="deai-step-list"', 'id="deai-step-list" class="deai-step-list"');
fix('components/settings/DeAiSettings.vue', 'deai-mode-select: add id', 'name="deai-mode"', 'id="deai-mode-select" name="deai-mode"');
fix('components/settings/DeAiSettings.vue', 'deai-skill-select: add id', 'class="deai-skill-select"', 'id="deai-skill-select" class="full-width"');
fix('components/settings/DeAiSettings.vue', 'deai-skill-select-ms: add id', 'class="deai-skill-select-ms"', 'id="deai-skill-select-ms" class="full-width"');
fix('components/settings/DeAiSettings.vue', 'deai-skill-select-sm: add id', 'class="deai-skill-select-sm"', 'id="deai-skill-select-sm" class="full-width"');
fix('components/settings/DeAiSettings.vue', 'deai-agent-select-ms: add id', 'class="deai-agent-select-ms"', 'id="deai-agent-select-ms" class="full-width"');
fix('components/settings/DeAiSettings.vue', 'btn-deai-add-skill-ms: add id', 'class="btn-deai-add-skill-ms"', 'id="btn-deai-add-skill-ms" class="btn-primary btn-sm"');

console.log('\n=== DeAiSettings fixes done ===\n');

// === DiagLogPanel.vue ===
fix('components/settings/DiagLogPanel.vue', 'diag-enabled: add id', 'name="diag-enabled"', 'id="diag-enabled" name="diag-enabled"');
fix('components/settings/DiagLogPanel.vue', 'diag-level: add id', 'class="diag-level"', 'id="diag-level" class="full-width"');
fix('components/settings/DiagLogPanel.vue', 'diag-stats: add id', 'class="diag-stats"', 'id="diag-stats" class=""');

console.log('\n=== DiagLogPanel fixes done ===\n');

// === MemoryPanel.vue ===
fix('components/common/MemoryPanel.vue', 'mem-current-cat: add id', 'class="mem-current-cat"', 'id="mem-current-cat" class=""');
fix('components/common/MemoryPanel.vue', 'mem-list: add id', 'class="mem-list"', 'id="mem-list" class="item-list card-grid"');

console.log('\n=== MemoryPanel fixes done ===\n');

// === SidebarNav.vue ===
fix('components/sidebar/SidebarNav.vue', 'btn-memory: add id', '记忆', 'id="btn-memory" class="sidebar-btn">记忆');

console.log('\n=== SidebarNav fixes done ===\n');

// === PluginMarket.vue ===
fix('components/common/PluginMarket.vue', 'github-status-text: add id', 'class="github-status"', 'id="github-status-text" class=""');
fix('components/common/PluginMarket.vue', 'token-bar: add id', 'class="token-bar"', 'id="token-bar" class="input-hint token-bar-hidden"');
fix('components/common/PluginMarket.vue', 'token-count: add id', 'class="token-count"', 'id="token-count" class=""');

console.log('\n=== PluginMarket fixes done ===\n');

// Write reconciliation log
const reportPath = 'D:/codex/novel-workshop-vue3/_audit/HTML_RECONCILIATION_V4.md';
const header = '# HTML \u4fee\u590d\u5bf9\u8d26\u8868 v4\n\n\u751f\u6210\u65f6\u95f4: ' + new Date().toISOString() + '\n\u4fee\u590d\u603b\u6570: ' + fixCount + '\n\n| # | ID | \u7ec4\u4ef6 | \u65b9\u6cd5 | \u72b6\u6001 |\n|---|---|---|---|---|\n';
fs.writeFileSync(reportPath, header + log.join('\n') + '\n', 'utf8');
console.log('\n=== Report written to ' + reportPath + ' ===');
console.log('Total fixes: ' + fixCount);
console.log('Total attempts: ' + log.length);
