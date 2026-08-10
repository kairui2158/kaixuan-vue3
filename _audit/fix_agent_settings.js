const fs = require('fs');
const f = 'D:/codex/novel-workshop-vue3/src/components/settings/AgentSettings.vue';
let c = fs.readFileSync(f, 'utf8');
const log = [];
let applied = 0;
let skipped = 0;

const fixes = [
  {
    id: 'agent-list',
    find: '<div class="agent-list">',
    replace: '<div id="agent-list" class="agent-list item-list card-grid">'
  },
  {
    id: 'agent-form',
    find: '<div v-if="editingId === a.id" class="agent-card-body">',
    replace: '<div v-if="editingId === a.id" id="agent-form" class="agent-card-body">'
  },
  {
    id: 'agent-form-title',
    find: '<div class="agent-fields">',
    replace: '<h4 id="agent-form-title">\u667a\u80fd\u4f53\u8bbe\u7f6e</h4>\n          <div class="agent-fields">'
  },
  {
    id: 'af-name',
    find: '<input v-model="a.name" class="input-field" @change="agentStore.saveAgents()" />',
    replace: '<input id="af-name" v-model="a.name" class="input-field full-width" placeholder="\u4f8b\u5982: \u5927\u7eb2\u67b6\u6784\u5e08" @change="agentStore.saveAgents()" />'
  },
  {
    id: 'af-desc',
    find: '<input v-model="a.description" class="input-field" placeholder="\u63cf\u8ff0\u8be5\u667a\u80fd\u4f53\u7684\u7528\u9014" @change="agentStore.saveAgents()" />',
    replace: '<input id="af-desc" v-model="a.description" class="input-field full-width" placeholder="\u7b80\u8981\u63cf\u8ff0\u667a\u80fd\u4f53\u7684\u7528\u9014..." @change="agentStore.saveAgents()" />'
  },
  {
    id: 'af-model',
    find: '<input v-model="a.model" class="input-field" @change="agentStore.saveAgents()" />',
    replace: '<input id="af-model" v-model="a.model" class="input-field full-width" placeholder="\u4f8b\u5982: gpt-4o" list="model-datalist" @change="agentStore.saveAgents()" />'
  },
  {
    id: 'af-provider',
    find: '<select v-model="a.provider" class="input-field" @change="agentStore.saveAgents()">',
    replace: '<select id="af-provider" v-model="a.provider" class="input-field full-width" @change="agentStore.saveAgents()">'
  },
  {
    id: 'af-temp-val',
    find: '<label>\u6e29\u5ea6 ({{ a.temperature }})</label>',
    replace: '<label>\u6e29\u5ea6: <span id="af-temp-val">{{ a.temperature }}</span></label>'
  },
  {
    id: 'af-temperature',
    find: '<input type="range" min="0" max="2" step="0.1" v-model.number="a.temperature" @change="agentStore.saveAgents()" />',
    replace: '<input type="range" id="af-temperature" min="0" max="2" step="0.1" v-model.number="a.temperature" class="range-full" @change="agentStore.saveAgents()" />'
  },
  {
    id: 'af-max-tokens',
    find: '<input type="number" v-model.number="a.maxTokens" class="input-field" @change="agentStore.saveAgents()" />',
    replace: '<input id="af-max-tokens" type="number" v-model.number="a.maxTokens" class="input-field full-width" @change="agentStore.saveAgents()" />'
  },
  {
    id: 'af-prompt',
    find: '<textarea v-model="a.systemPrompt" class="textarea-field" rows="4" @change="agentStore.saveAgents()"></textarea>',
    replace: '<textarea id="af-prompt" v-model="a.systemPrompt" class="textarea-field full-width" rows="6" placeholder="\u8bbe\u5b9aAI\u7684\u89d2\u8272\u3001\u884c\u4e3a\u3001\u8bed\u6c14..." @change="agentStore.saveAgents()"></textarea>'
  },
  {
    id: 'fix-duplicate-id-bug',
    find: '<div id="btn-cancel-agent" id="btn-save-agent" class="form-actions">',
    replace: '<div class="form-actions">'
  },
  {
    id: 'btn-cancel-agent',
    find: '<button class="btn-secondary" @click="cancelEdit">\u53d6\u6d88</button>',
    replace: '<button id="btn-cancel-agent" class="btn-secondary" @click="cancelEdit">\u53d6\u6d88</button>'
  },
  {
    id: 'btn-save-agent',
    find: '<button class="btn-primary" @click="saveAgent(a.id)">\u4fdd\u5b58</button>',
    replace: '<button id="btn-save-agent" class="btn-primary" @click="saveAgent(a.id)">\u4fdd\u5b58</button>'
  },
  {
    id: 'btn-add-agent',
    find: '<button class="btn-add" @click="addAgent">+ \u65b0\u5efa\u667a\u80fd\u4f53</button>',
    replace: '<button id="btn-add-agent" class="btn-add btn-primary btn-sm" @click="addAgent">+ \u6dfb\u52a0\u667a\u80fd\u4f53</button>'
  }
];

fixes.forEach(fx => {
  if (c.includes(fx.find)) {
    c = c.replace(fx.find, fx.replace);
    applied++;
    console.log('[OK] ' + fx.id);
    log.push('| ' + applied + ' | ' + fx.id + ' | AgentSettings.vue | fix | DONE |');
  } else {
    skipped++;
    console.log('[SKIP] ' + fx.id + ' - context not found');
    log.push('| - | ' + fx.id + ' | AgentSettings.vue | - | SKIP-not-found |');
  }
});

fs.writeFileSync(f, c, 'utf8');
console.log('Applied: ' + applied + '/' + fixes.length + ' | Skipped: ' + skipped);

const report = 'D:/codex/novel-workshop-vue3/_audit/HTML_RECONCILIATION_FINAL.md';
const header = '\n## AgentSettings.vue\n| # | ID | Component | Method | Status |\n|---|---|---|---|---|\n';
fs.appendFileSync(report, header + log.join('\n') + '\n', 'utf8');
console.log('Report appended to HTML_RECONCILIATION_FINAL.md');
