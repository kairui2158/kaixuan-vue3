<template>
  <div class="agent-settings">
    <h3>智能体管理</h3>
    <div id="agent-list" class="agent-list item-list card-grid">
      <div v-for="a in agentStore.agents" :key="a.id" class="agent-card" :class="{ 'is-editing': editingId === a.id }">
        <div class="agent-card-header">
          <span class="agent-card-name">{{ a.name || '未命名' }}</span>
          <span class="agent-card-model" v-if="a.model">{{ a.model }}</span>
          <div class="agent-card-actions">
           <button class="btn-sm btn-secondary" @click="toggleEdit(a.id)">{{ editingId === a.id ? '收起' : '编辑' }}</button>
          <button class="btn-danger btn-sm" @click="agentStore.removeAgent(a.id)">删除</button>
         </div>
        </div>
        <div v-if="editingId !== a.id" class="agent-card-summary">
          <span class="agent-card-meta">温度: {{ a.temperature }}</span>
          <span class="agent-card-meta" v-if="a.maxTokens > 0">maxTokens: {{ a.maxTokens }}</span>
          <span class="agent-card-meta" v-else>maxTokens: 无上限</span>
        </div>
        <div v-if="editingId === a.id" id="agent-form" class="agent-card-body">
          <h4 id="agent-form-title">智能体设置</h4>
          <div class="agent-fields">
           <label>名称</label>
           <input id="af-name" v-model="a.name" class="input-field full-width" placeholder="例如: 大纲架构师" @change="agentStore.saveAgents()" />
            <label>描述</label>
            <input id="af-desc" v-model="a.description" class="input-field full-width" placeholder="简要描述智能体的用途..." @change="agentStore.saveAgents()" />
           <label>模型</label>
           <input id="af-model" v-model="a.model" class="input-field full-width" placeholder="例如: gpt-4o" list="model-datalist" @change="agentStore.saveAgents()" />
            <label>绑定供应商</label>
           <select id="af-provider" v-model="a.provider" class="input-field full-width" @change="agentStore.saveAgents()">
              <option value="">使用全局默认</option>
             <option v-for="p in providerStore.providers" :key="p.id" :value="p.id">{{ p.name }}</option>
           </select>
            <label>温度: <span id="af-temp-val">{{ a.temperature }}</span></label>
            <input type="range" id="af-temperature" min="0" max="2" step="0.1" v-model.number="a.temperature" class="range-full" @change="agentStore.saveAgents()" />
            <label>maxTokens</label>
            <input id="af-max-tokens" type="number" v-model.number="a.maxTokens" class="input-field full-width" @change="agentStore.saveAgents()" />
            <label>系统提示词</label>
            <textarea id="af-prompt" v-model="a.systemPrompt" class="textarea-field full-width" rows="6" placeholder="设定AI的角色、行为、语气..." @change="agentStore.saveAgents()"></textarea>
          </div>
          <div class="form-actions">
          <button id="btn-cancel-agent" class="btn-secondary" @click="cancelEdit">取消</button>
          <button id="btn-save-agent" class="btn-primary" @click="saveAgent(a.id)">保存</button>
          </div>
        </div>
      </div>
    </div>
    <button id="btn-add-agent" class="btn-add btn-primary btn-sm" @click="addAgent">+ 添加智能体</button>
    <datalist id="model-datalist">
      <option v-for="m in allModelOptions" :key="m" :value="m"></option>
    </datalist>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useAgentStore } from '../../stores/agent'
import { useProviderStore } from '../../stores/provider'

const agentStore = useAgentStore()
const providerStore = useProviderStore()
const editingId = ref('')
const allModelOptions = ref<string[]>(['gpt-4o', 'gpt-4o-mini', 'claude-3-5-sonnet', 'claude-3-5-haiku', 'deepseek-chat', 'deepseek-reasoner', 'qwen-max', 'qwen-plus'])

function toggleEdit(id: string) {
  editingId.value = editingId.value === id ? '' : id
}

function cancelEdit() {
  editingId.value = ''
}

function saveAgent(id: string) {
  agentStore.saveAgents()
  editingId.value = ''
}

function addAgent() {
  const id = 'agent-' + Date.now();
  // 先设置 editingId，确保即使 storageWrite 异常也显示表单
  editingId.value = id;
  try {
    agentStore.addAgent({
      id: id,
      name: '新智能体',
      model: '',
      temperature: 0.7,
      maxTokens: 0,
      systemPrompt: '',
      description: '',
      provider: ''
    });
  } catch (e) {
    console.error('[AgentSettings] addAgent store error:', e);
  }
}
</script>

<style scoped>
.agent-settings h3 { font-size: 16px; margin-bottom: 16px; }
.agent-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
/* agent-card base (border/radius/bg/hover) from global.css L651-669 */
.agent-card { padding: 12px 14px; }
.agent-card.is-editing {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent), 0 4px 16px var(--accent-glow, rgba(90,125,154,0.15));
}
.agent-card-header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.agent-card-name { font-weight: 600; font-size: 14px; color: var(--text-primary); flex: 1; }
.agent-card-model { font-size: 11px; color: var(--text-muted); background: var(--bg-input); padding: 1px 6px; border-radius: 99px; }
.agent-card-actions { display: flex; gap: 4px; }
.agent-card-summary { display: flex; gap: 12px; padding: 2px 0; }
.agent-card-meta { font-size: 11px; color: var(--text-muted); }
.agent-card-body { margin-top: 8px; }
.agent-fields { display: grid; grid-template-columns: 80px 1fr; gap: 4px 8px; align-items: center; margin-bottom: 8px; }
.agent-fields label { font-size: 12px; color: var(--text-secondary); }
.input-field { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; padding: 4px 8px; font-size: 12px; height: 28px; outline: none; }
.textarea-field { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; padding: 6px 8px; font-size: 12px; outline: none; resize: vertical; grid-column: 2; }
.btn-add { background: var(--accent); color: var(--text-on-accent); border: none; border-radius: 6px; padding: 8px 16px; cursor: pointer; font-size: 13px; margin-top: 12px; }
</style>

