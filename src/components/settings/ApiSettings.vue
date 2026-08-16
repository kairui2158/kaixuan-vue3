<template>
  <div class="api-settings">
    <h3>API供应商配置</h3>
    <!-- View 1: Provider List -->
    <div v-if="!editingProvider" class="provider-list-view">
      <div id="provider-list-view" class="provider-list">
        <div id="provider-card-list"
          v-for="p in providerStore.providers"
          :key="p.id"
          class="provider-card"
          :class="{ 'is-active': isProviderActive(p.id) }"
          @click="enterProviderEdit(p.id)"
        >
          <div class="provider-card-header">
            <span class="provider-card-name">{{ p.name }}</span>
            <span class="provider-card-status" :class="isProviderActive(p.id) ? 'provider-badge-on' : 'provider-badge-off'">
              {{ isProviderActive(p.id) ? 'ON' : 'OFF' }}
            </span>
          </div>
          <div class="provider-card-info">
            <span class="provider-card-url">{{ p.baseUrl }}</span>
            <span class="provider-card-model" v-if="p.selectedModel">{{ p.selectedModel }}</span>
          </div>
          <div class="provider-card-actions" @click.stop>
            <select
              class="purpose-select"
              :value="getPurpose(p.id)"
              @change="setPurpose(p.id, ($event.target as HTMLSelectElement).value)"
            >
              <option value="generate">生成</option>
              <option value="verify">验证</option>
            </select>
            <button class="btn-sm btn-secondary" @click="enterProviderEdit(p.id)">编辑</button>
            <button class="btn-danger btn-sm" @click="providerStore.removeProvider(p.id)">删除</button>
          </div>
          <div class="provider-card-models" v-if="p.models && p.models.length > 0">
            <span v-for="m in p.models.slice(0, 5)" :key="m" class="model-tag">{{ m }}</span>
          </div>
        </div>
      </div>
      <div class="provider-card-add" @click="addProvider">
        <span class="provider-card-add-icon">+</span>
        <span class="provider-card-add-text">添加供应商</span>
      </div>
      <div class="config-actions">
        <button class="btn-sm btn-secondary" @click="exportConfig">导出配置</button>
        <button class="btn-sm btn-secondary" @click="importConfig">导入配置</button>
      </div>
    </div>
    <!-- View 2: Provider Edit -->
    <div v-else id="provider-edit-view" class="provider-edit-view">
      <div class="provider-edit-header">
        <button id="btn-provider-back" class="btn-sm btn-secondary btn-back" @click="exitProviderEdit">← 返回</button>
        <span id="provider-edit-title" class="provider-edit-title-text">{{ editingProvider.name || '新供应商' }}</span>
        <span id="provider-conn-status" class="provider-conn-status" :class="connStatusClass" v-if="connStatus">{{ connStatus }}</span>
      </div>
      <div class="form-group">
        <label>供应商名称</label>
        <input id="cfg-provider-name" v-model="editingProvider.name" class="input-field" placeholder="例如: CloudAI" />
      </div>
      <div class="form-group">
        <label>接口地址</label>
        <input id="cfg-base-url" v-model="editingProvider.baseUrl" class="input-field" placeholder="例如: https://api.openai.com/v1" />
        <small class="form-hint">填写API服务商提供的接口URL</small>
      </div>
      <div class="form-group">
        <label>API密钥</label>
        <div class="password-row">
          <input id="cfg-api-key" v-model="editingProvider.apiKey" :type="showKey ? 'text' : 'password'" class="input-field" placeholder="输入你的API密钥" />
          <button id="btn-toggle-key" class="btn-toggle" @click="showKey = !showKey">{{ showKey ? '隐藏' : '显示' }}</button>
        </div>
        <small class="form-hint">从API服务商获取，通常以 sk- 开头</small>
      </div>
      <div class="form-group">
        <label>模型列表</label>
        <div class="model-fetch-row">
          <button id="btn-fetch-models" class="btn-sm btn-secondary" @click="fetchModels" :disabled="fetchingModels">
            {{ fetchingModels ? '获取中...' : '获取模型列表' }}
          </button>
          <button class="btn-sm btn-test" @click="testConnection" :disabled="testingConn">
            {{ testingConn ? '测试中...' : '测试连接' }}
          </button>
        </div>
        <div class="fetch-feedback" v-if="fetchMsg" :class="fetchMsgClass">{{ fetchMsg }}</div>
        <div class="model-select-row" v-if="editingProvider.models && editingProvider.models.length > 0">
          <select v-model="editingProvider.selectedModel" class="input-field">
            <option value="">自动</option>
            <option v-for="m in editingProvider.models" :key="m" :value="m">{{ m }}</option>
          </select>
        </div>
        <div id="provider-model-list" class="provider-model-list-box" v-if="editingProvider.models && editingProvider.models.length > 0">
          <span v-for="m in editingProvider.models" :key="m" class="model-tag">{{ m }}</span>
        </div>
      </div>
      <div class="form-group">
        <label class="checkbox-label">
          <input id="cfg-stream-mode" type="checkbox" v-model="editingProvider.streamMode" />
          <span>流式传输（打字机逐字显示效果）</span>
        </label>
      </div>
      <div class="form-group">
        <label>温度 ({{ editingProvider.temperature }})</label>
        <div class="temp-row">
          <input id="cfg-temperature" type="range" min="0" max="2" step="0.1" v-model.number="editingProvider.temperature" class="range-flex" />
          <span id="cfg-temperature-val" class="range-val">{{ editingProvider.temperature }}</span>
        </div>
      </div>
      <div class="form-group">
        <label>MaxTokens (0=不限)</label>
        <input id="cfg-max-tokens" type="number" v-model.number="editingProvider.maxTokens" min="0" class="input-field input-w-120" />
      </div>
      <div class="form-group">
        <label>用途</label>
        <select id="cfg-provider-purpose" v-model="editingProvider.purpose" class="input-field input-w-120">
          <option value="generate">生成（写小说）</option>
          <option value="verify">验证（去AI味检测）</option>
        </select>
      </div>
      <div class="form-group">
        <label>系统提示词</label>
        <textarea id="cfg-system-prompt" v-model="editingProvider.systemPrompt" class="input-field" rows="3" placeholder="可选"></textarea>
      </div>
      <div class="form-actions">
        <button class="btn-primary" @click="saveAndExit">保存</button>
        <button class="btn-secondary" @click="exitProviderEdit">取消</button>
      </div>
    </div>
  </div>

</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useProviderStore, type Provider } from '../../stores/provider'

const providerStore = useProviderStore()

const editingProvider = ref<Provider | null>(null)
const showKey = ref(false)
const fetchingModels = ref(false)
const testingConn = ref(false)
const connStatus = ref('')
const fetchMsg = ref('')

const connStatusClass = computed(() => {
  if (connStatus.value.includes('成功') || connStatus.value.includes('OK')) return 'conn-ok'
  if (connStatus.value.includes('失败') || connStatus.value.includes('error')) return 'conn-fail'
  return ''
})

const fetchMsgClass = computed(() => {
  if (fetchMsg.value.includes('成功') || fetchMsg.value.includes('OK')) return 'fetch-ok'
  if (fetchMsg.value.includes('失败') || fetchMsg.value.includes('error')) return 'fetch-fail'
  return ''
})

function isProviderActive(id: string): boolean {
  return providerStore.generateProvider === id || providerStore.verifyProvider === id
}

function getPurpose(id: string): string {
  if (providerStore.generateProvider === id) return 'generate'
  if (providerStore.verifyProvider === id) return 'verify'
  return 'generate'
}

function setPurpose(id: string, purpose: string) {
  if (purpose === 'generate') {
    if (providerStore.verifyProvider === id) {
      providerStore.setVerifyProvider('')
    }
    const prevGen = providerStore.generateProvider
    providerStore.setGenerateProvider(id)
    if (prevGen && prevGen !== id && !providerStore.verifyProvider) {
      providerStore.setVerifyProvider(prevGen)
    }
  } else {
    if (providerStore.generateProvider === id) {
      providerStore.setGenerateProvider('')
    }
    const prevVer = providerStore.verifyProvider
    providerStore.setVerifyProvider(id)
    if (prevVer && prevVer !== id && !providerStore.generateProvider) {
      providerStore.setGenerateProvider(prevVer)
    }
  }
}

function addProvider() {
  enterProviderEdit(null)
}

function enterProviderEdit(id: string | null) {
  if (id) {
    const p = providerStore.providers.find(item => item.id === id)
    if (p) {
      editingProvider.value = { ...p }
    }
  } else {
    editingProvider.value = {
      id: 'prov-' + Date.now(),
      name: '新供应商',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      models: [],
      selectedModel: '',
      temperature: 0.7,
      maxTokens: 0,
      streamMode: false,
      systemPrompt: '',
      purpose: 'generate'
    }
  }
  showKey.value = false
  connStatus.value = ''
  fetchMsg.value = ''
}

function exitProviderEdit() {
  editingProvider.value = null
  showKey.value = false
  connStatus.value = ''
  fetchMsg.value = ''
}

function saveAndExit() {
  if (!editingProvider.value) return
  const p = editingProvider.value
  const existing = providerStore.providers.find(item => item.id === p.id)
  if (existing) {
    providerStore.updateProvider(p.id, { ...p })
  } else {
    providerStore.addProvider({ ...p })
  }
  providerStore.saveProviders()
  exitProviderEdit()
}

async function fetchModels() {
  if (!editingProvider.value) return
  if (!editingProvider.value.baseUrl || !editingProvider.value.apiKey) {
    fetchMsg.value = '请先填写接口地址和API密钥'
    return
  }
  fetchingModels.value = true
  fetchMsg.value = ''
  try {
    const models = await window.electronAPI.fetchModels(
      editingProvider.value.baseUrl,
      editingProvider.value.apiKey
    )
    if (models && models.length > 0) {
      editingProvider.value.models = [...models]
      fetchMsg.value = '成功获取 ' + models.length + ' 个模型'
    } else {
      fetchMsg.value = '未获取到模型，请检查接口地址和密钥'
    }
  } catch (e: any) {
    fetchMsg.value = '获取失败: ' + (e?.message || String(e))
  } finally {
    fetchingModels.value = false
  }
}

async function testConnection() {
  if (!editingProvider.value) return
  if (!editingProvider.value.baseUrl || !editingProvider.value.apiKey) {
    connStatus.value = '请先填写接口地址和API密钥'
    return
  }
  testingConn.value = true
  connStatus.value = ''
  try {
    const result = await window.electronAPI.providerTestConnection(
      editingProvider.value.baseUrl,
      editingProvider.value.apiKey
    )
    if (result && result.connected) {
      connStatus.value = '连接成功'
    } else {
      connStatus.value = '连接失败: ' + (result?.error || '未知错误')
    }
  } catch (e: any) {
    connStatus.value = '连接失败: ' + (e?.message || String(e))
  } finally {
    testingConn.value = false
  }
}

function exportConfig() {
  const data = JSON.stringify(providerStore.providers, null, 2)
  const blob = new Blob([data], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "api-config.json"
  a.click()
  URL.revokeObjectURL(url)
}

function importConfig() {
  const input = document.createElement("input")
  input.type = "file"
  input.accept = ".json"
  input.onchange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const text = await file.text()
    try {
      const data = JSON.parse(text)
      data.forEach((p: Provider) => providerStore.addProvider(p))
    } catch (err) {
      console.error("import failed", err)
    }
  }
  input.click()
}
</script>

<style scoped>
/* === provider card: hover lift + active accent border (old arch L3064-3074) === */
.api-settings h3 { font-size: var(--font-size-lg); margin-bottom: 16px; }
.api-settings { display: flex; flex-direction: column; gap: 12px; }
.section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.section-title { font-size: var(--font-size-lg, 16px); font-weight: 600; color: var(--text-primary); }
.provider-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: var(--space-md); align-items: stretch; }
.provider-card {
  min-width: 0;
  max-width: none;
  background: var(--bg-card, var(--bg-elevated));
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg, 8px);
  padding: var(--space-md, 12px);
  box-shadow: var(--shadow-sm, 0 1px 4px rgba(0,0,0,0.08));
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}
.provider-card:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-md, 0 4px 16px rgba(0,0,0,0.15));
  border-color: var(--accent);
}
.provider-card.is-active,
.provider-card:focus-within {
  border-color: var(--accent);
  box-shadow: var(--shadow-accent-sm, 0 2px 8px var(--accent-glow, rgba(90,125,154,0.2)));
}
.provider-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.provider-card-name { font-weight: 600; font-size: var(--font-size-lg); flex: 1; color: var(--text-primary); }

/* status badge - pill shape (old arch L3102-3120) */
.provider-card-status {
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  border-radius: 99px;
  font-size: var(--font-size-xs, 12px);
  font-weight: var(--fw-medium, 500);
  line-height: 1.4;
}
/* card actions row */
.provider-card-actions { display: flex; gap: 4px; align-items: center; }
.provider-badge-on {
  background: var(--success-dim, rgba(76,175,80,0.15));
  color: var(--success);
}
.provider-badge-off {
  background: var(--bg-input);
  color: var(--text-muted);
}

.purpose-select {
  background: var(--bg-input);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm, 4px);
  padding: var(--space-2) var(--space-4);
  font-size: var(--font-size-md);
  height: var(--input-height, 34px);
}
.provider-fields { display: grid; grid-template-columns: 80px 1fr; gap: 4px 8px; align-items: center; }
.provider-fields label { font-size: var(--font-size-sm); color: var(--text-secondary); }
.input-field {
  background: var(--bg-input);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm, 4px);
  padding: 6px 12px;
  font-size: var(--font-size-md);
  height: 34px;
  outline: none;
}
.provider-card-url:hover { color: var(--accent-hover, var(--accent)); }
.provider-card-url-input { font-size: var(--font-size-xs, 12px); color: var(--text-muted); }
.model-row { display: flex; gap: 4px; }
.btn-test { background: transparent; color: var(--accent); border: 1px solid var(--accent); }
.btn-test:hover { background: var(--accent-dim); }

/* model tags (old arch L3083-3088) */
.provider-card-models {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}
.model-tag {
  padding: 2px 8px;
  border-radius: var(--radius-sm, 4px);
  background: var(--bg-input);
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}

.btn-add {
  margin-top: 12px;
  background: var(--accent);
  color: var(--text-on-accent);
  border: none;
  border-radius: var(--radius-sm, 6px);
  padding: 9px 18px;
  cursor: pointer;
  font-size: var(--font-size-md);
}
.btn-add:hover { transform: translateY(-1px); }
/* dashed add card (old arch L6600) */
.provider-card-add {
  flex: 1 1 300px;
  min-width: 300px;
  max-width: 460px;
  border: 2px dashed var(--border-color);
  border-radius: var(--radius-md, 8px);
  padding: 24px 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  color: var(--text-muted);
  background: transparent;
  transition: border-color 0.2s, color 0.2s;
}
.provider-card-add:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.provider-card-add-icon { font-size: var(--font-size-xxl); font-weight: 300; }
.provider-card-add-text { font-size: var(--font-size-md); }
.stream-toggle { display: flex; align-items: center; gap: 6px; font-size: var(--font-size-md); color: var(--text-secondary); cursor: pointer; }
.stream-toggle input { cursor: pointer; }
.config-actions { display: flex; gap: 8px; margin-bottom: 12px; }

/* === Edit View === */
.provider-edit-view { display: flex; flex-direction: column; gap: 16px; padding: 20px; background: var(--bg-card, var(--bg-elevated)); border: 1px solid var(--border-color); border-radius: var(--radius-md); }
.provider-edit-header { display: flex; align-items: center; gap: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--border-color); }
.btn-back { padding: 5px 12px; font-size: var(--font-size-md); }
.provider-edit-title-text { font-size: var(--font-size-lg); font-weight: 600; color: var(--text-primary); flex: 1; }
.provider-conn-status { font-size: var(--font-size-md); padding: 3px 10px; border-radius: 99px; }
.conn-ok { background: var(--success-dim, rgba(76,175,80,0.15)); color: var(--success); }
.conn-fail { background: var(--danger-dim, rgba(244,67,54,0.15)); color: var(--danger); }
.form-group { display: flex; flex-direction: column; gap: 4px; }
.form-group label { font-size: var(--font-size-md); color: var(--text-secondary); font-weight: 500; }
.form-hint { font-size: var(--font-size-md); color: var(--text-muted); }
.password-row { display: flex; gap: 4px; }
.btn-toggle { background: var(--bg-input); color: var(--text-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-sm, 4px); padding: 5px 12px; font-size: var(--font-size-md); cursor: pointer; white-space: nowrap; }
.btn-toggle:hover { border-color: var(--accent); color: var(--accent); }
.model-fetch-row { display: flex; gap: 8px; margin-bottom: 4px; }
.fetch-feedback { font-size: var(--font-size-md); padding: 4px 0; }
.fetch-ok { color: var(--success); }
.fetch-fail { color: var(--danger); }
.model-select-row { margin-top: 8px; }
.model-list-box { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; padding: 8px; background: var(--bg-input); border-radius: var(--radius-sm, 4px); max-height: 120px; overflow-y: auto; }
.checkbox-label { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: var(--font-size-md); color: var(--text-primary); }
.checkbox-label input { cursor: pointer; }
.temp-row { display: flex; align-items: center; gap: 8px; }
.range-flex { flex: 1; }
.range-val { font-size: var(--font-size-sm); color: var(--text-secondary); min-width: 30px; text-align: right; }
.input-w-120 { width: 120px; }
.form-actions { display: flex; gap: 8px; margin-top: 8px; }
.provider-card-info { display: flex; flex-direction: column; gap: 2px; margin-bottom: 8px; }
.provider-card-url { font-size: var(--font-size-xs); color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.provider-card-model { font-size: var(--font-size-xs); color: var(--accent); }
</style>
