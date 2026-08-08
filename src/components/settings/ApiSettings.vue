<template>
  <div class="api-settings">
    <h3>API供应商配置</h3>
    <div class="provider-list">
      <div v-for="p in providerStore.providers" :key="p.id" class="provider-card">
        <div class="provider-header">
          <span class="provider-name">{{ p.name }}</span>
          <select
            class="purpose-select"
            :value="getPurpose(p.id)"
            @change="setPurpose(p.id, ($event.target as HTMLSelectElement).value)"
          >
            <option value="generate">生成（写小说）</option>
            <option value="verify">验证（去AI味检测）</option>
          </select>
          <button class="btn-danger-sm" @click="providerStore.removeProvider(p.id)">删除</button>
        </div>
        <div class="provider-fields">
          <label>名称</label>
          <input v-model="p.name" class="input-field" @change="providerStore.saveProviders()" />
          <label>Base URL</label>
          <input v-model="p.baseUrl" class="input-field" @change="providerStore.saveProviders()" />
          <label>API Key</label>
          <input v-model="p.apiKey" type="password" class="input-field" @change="providerStore.saveProviders()" />
          <label>模型</label>
          <div class="model-row">
            <select v-model="p.selectedModel" class="input-field" @change="providerStore.saveProviders()">
              <option value="">自动</option>
              <option v-for="m in p.models" :key="m" :value="m">{{ m }}</option>
            </select>
            <button class="btn-sm btn-secondary" @click="fetchModels(p.id)">获取模型</button>
          </div>
          <label>温度 ({{ p.temperature }})</label>
          <input type="range" min="0" max="2" step="0.1" v-model.number="p.temperature" @change="providerStore.saveProviders()" />
        </div>
      </div>
    </div>
    <button class="btn-add" @click="addProvider">+ 添加供应商</button>
  </div>
</template>

<script setup lang="ts">
import { useProviderStore } from '../../stores/provider'

const providerStore = useProviderStore()

function getPurpose(id: string): string {
  if (providerStore.generateProvider === id) return 'generate'
  if (providerStore.verifyProvider === id) return 'verify'
  return 'generate'
}

function setPurpose(id: string, purpose: string) {
  if (purpose === 'generate') {
    providerStore.setGenerateProvider(id)
  } else {
    providerStore.setVerifyProvider(id)
  }
}

function addProvider() {
  providerStore.addProvider({
    id: 'prov-' + Date.now(),
    name: '新供应商',
    baseUrl: 'https://api.openai.com',
    apiKey: '',
    models: [],
    selectedModel: '',
    temperature: 0.7,
    maxTokens: 0,
    purpose: 'generate'
  })
}

async function fetchModels(id: string) {
  try {
    await providerStore.fetchModels(id)
  } catch (e) {
    console.error('fetch models failed', e)
  }
}
</script>

<style scoped>
.api-settings h3 { font-size: 16px; margin-bottom: 16px; }
.provider-list { display: flex; flex-direction: column; gap: 12px; }
.provider-card {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 12px;
}
.provider-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.provider-name { font-weight: 600; font-size: 14px; flex: 1; }
.purpose-select {
  background: var(--bg-input);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 11px;
  height: 26px;
}
.btn-danger-sm {
  background: var(--danger);
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 11px;
  cursor: pointer;
}
.provider-fields { display: grid; grid-template-columns: 80px 1fr; gap: 4px 8px; align-items: center; }
.provider-fields label { font-size: 12px; color: var(--text-secondary); }
.input-field {
  background: var(--bg-input);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 12px;
  height: 28px;
  outline: none;
}
.model-row { display: flex; gap: 4px; }
.btn-sm { font-size: 11px; padding: 2px 8px; border-radius: 4px; height: 28px; cursor: pointer; }
.btn-secondary { background: transparent; color: var(--text-secondary); border: 1px solid var(--border-color); }
.btn-add {
  margin-top: 12px;
  background: var(--accent-gradient);
  color: var(--text-on-accent);
  border: none;
  border-radius: 6px;
  padding: 8px 16px;
  cursor: pointer;
  font-size: 13px;
}
</style>
