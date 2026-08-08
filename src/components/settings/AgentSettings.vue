<template>
  <div class="agent-settings">
    <h3>智能体管理</h3>
    <div class="agent-list">
      <div v-for="a in agentStore.agents" :key="a.id" class="agent-card">
        <div class="agent-header">
          <input v-model="a.name" class="input-field" @change="agentStore.saveAgents()" />
          <button class="btn-danger-sm" @click="agentStore.removeAgent(a.id)">删除</button>
        </div>
        <div class="agent-fields">
          <label>模型</label>
          <input v-model="a.model" class="input-field" @change="agentStore.saveAgents()" />
          <label>温度 ({{ a.temperature }})</label>
          <input type="range" min="0" max="2" step="0.1" v-model.number="a.temperature" @change="agentStore.saveAgents()" />
          <label>maxTokens</label>
          <input type="number" v-model.number="a.maxTokens" class="input-field" @change="agentStore.saveAgents()" />
          <label>系统提示词</label>
          <textarea v-model="a.systemPrompt" class="textarea-field" rows="4" @change="agentStore.saveAgents()"></textarea>
        </div>
      </div>
    </div>
    <button class="btn-add" @click="addAgent">+ 新建智能体</button>
  </div>
</template>

<script setup lang="ts">
import { useAgentStore } from '../../stores/agent'

const agentStore = useAgentStore()

function addAgent() {
  agentStore.addAgent({
    id: 'agent-' + Date.now(),
    name: '新智能体',
    model: '',
    temperature: 0.7,
    maxTokens: 0,
    systemPrompt: ''
  })
}
</script>

<style scoped>
.agent-settings h3 { font-size: 16px; margin-bottom: 16px; }
.agent-list { display: flex; flex-direction: column; gap: 12px; }
.agent-card {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 12px;
}
.agent-header { display: flex; gap: 8px; margin-bottom: 8px; }
.agent-fields { display: grid; grid-template-columns: 80px 1fr; gap: 4px 8px; align-items: center; }
.agent-fields label { font-size: 12px; color: var(--text-secondary); }
.input-field {
  background: var(--bg-input); color: var(--text-primary);
  border: 1px solid var(--border-color); border-radius: 4px;
  padding: 4px 8px; font-size: 12px; height: 28px; outline: none;
}
.textarea-field {
  background: var(--bg-input); color: var(--text-primary);
  border: 1px solid var(--border-color); border-radius: 4px;
  padding: 6px 8px; font-size: 12px; outline: none; resize: vertical;
  grid-column: 2;
}
.btn-danger-sm { background: var(--danger); color: #fff; border: none; border-radius: 4px; padding: 2px 8px; font-size: 11px; cursor: pointer; }
.btn-add { background: var(--accent-gradient); color: var(--text-on-accent); border: none; border-radius: 6px; padding: 8px 16px; cursor: pointer; font-size: 13px; margin-top: 12px; }
</style>
