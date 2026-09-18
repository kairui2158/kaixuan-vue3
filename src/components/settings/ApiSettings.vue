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
            <span class="provider-type-badge">{{ providerTypeLabel(p.providerType) }}</span>
            <span class="provider-card-status" :class="isProviderActive(p.id) ? 'provider-badge-on' : 'provider-badge-off'">
              {{ isProviderActive(p.id) ? '启用' : '停用' }}
            </span>
          </div>
          <div class="provider-card-info">
            <span class="provider-card-url">{{ p.baseUrl }}</span>
            <span class="provider-card-model" v-if="p.selectedModel">{{ p.selectedModel }}</span>
          </div>
          <div class="provider-card-actions" @click.stop>
            <div class="purpose-toggle-group">
              <button
                v-for="pu in purposeOptions"
                :key="pu.value"
                class="purpose-toggle-btn"
                :class="{ 'is-on': hasPurpose(p.id, pu.value) }"
                @click="togglePurpose(p.id, pu.value)"
              >{{ pu.label }}</button>
            </div>
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
        <div id="cfg-provider-purpose" class="purpose-checkbox-group">
          <label v-for="pu in purposeOptions" :key="pu.value" class="purpose-checkbox-label">
            <input
              type="checkbox"
              :value="pu.value"
              :checked="editingProviderPurposeArray.includes(pu.value)"
              @change="toggleEditingPurpose(pu.value)"
            />
            <span>{{ pu.label }}</span>
          </label>
        </div>
      </div>
      <div class="form-group">
        <label>供应商类型</label>
        <select id="cfg-provider-type" v-model="editingProvider.providerType" class="input-field">
          <option v-for="type in providerTypeOptions" :key="type.value" :value="type.value">{{ type.label }}</option>
        </select>
        <small class="form-hint">选择 API 服务商的协议类型；旧配置默认为 OpenAI 兼容</small>
      </div>
      <details class="provider-advanced">
        <summary>高级接口设置</summary>
        <div class="advanced-grid">
          <div class="form-group">
            <label>地址模式</label>
            <select id="cfg-endpoint-mode" v-model="editingProvider.endpointMode" class="input-field">
              <option value="auto">自动识别</option>
              <option value="base">基础地址</option>
              <option value="full">完整接口地址</option>
            </select>
          </div>
          <div class="form-group">
            <label>对话接口路径</label>
            <input id="cfg-chat-path" v-model="editingProvider.chatPath" class="input-field" placeholder="默认自动" />
          </div>
          <div class="form-group">
            <label>模型接口路径</label>
            <input id="cfg-models-path" v-model="editingProvider.modelsPath" class="input-field" placeholder="默认自动" />
          </div>
          <div class="form-group" v-if="editingProvider.providerType === 'azure-openai'">
            <label>部署名称</label>
            <input id="cfg-deployment" v-model="editingProvider.deployment" class="input-field" placeholder="Azure 部署名" />
          </div>
          <div class="form-group" v-if="editingProvider.providerType === 'azure-openai'">
            <label>API 版本</label>
            <input id="cfg-api-version" v-model="editingProvider.apiVersion" class="input-field" placeholder="2024-02-01" />
          </div>
        </div>
      </details>
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
import { getAiService } from '../../services/aiService'
import { useAiCallTrace } from '../../composables/useAiCallTrace'

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

const purposeOptions: { value: Provider['purpose'][number]; label: string }[] = [
  { value: 'generate', label: '生成' },
  { value: 'verify', label: '验证' },
  { value: 'detect', label: '检测' },
  { value: 'image', label: '图片' },
  { value: 'video', label: '视频' },
]

const providerTypeOptions: { value: Provider['providerType']; label: string }[] = [
  { value: 'openai-compatible', label: 'OpenAI 兼容' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'azure-openai', label: 'Azure OpenAI' },
]

function providerTypeLabel(value?: string): string {
  const found = providerTypeOptions.find(type => type.value === value)
  return found ? found.label : 'OpenAI 兼容'
}

const editingProviderPurposeArray = computed(() => {
  if (!editingProvider.value) return []
  const pu = editingProvider.value.purpose
  if (typeof pu === 'string') return [pu]
  if (Array.isArray(pu)) return pu
  return []
})

function toggleEditingPurpose(value: Provider['purpose'][number]) {
  if (!editingProvider.value) return
  const cur = editingProviderPurposeArray.value
  const idx = cur.indexOf(value)
  if (idx >= 0) {
    editingProvider.value.purpose = cur.filter(v => v !== value) as any
  } else {
    editingProvider.value.purpose = [...cur, value] as any
  }
}

function isProviderActive(id: string): boolean {
  return providerStore.generateProvider === id ||
         providerStore.verifyProvider === id ||
         providerStore.detectProvider === id
}

function hasPurpose(id: string, purpose: Provider['purpose'][number]): boolean {
  if (purpose === 'generate') return providerStore.generateProvider === id
  if (purpose === 'verify') return providerStore.verifyProvider === id
  if (purpose === 'detect') return providerStore.detectProvider === id
  return false
}

function togglePurpose(id: string, purpose: Provider['purpose'][number]) {
  if (purpose === 'generate') {
    providerStore.setGenerateProvider(providerStore.generateProvider === id ? '' : id)
  } else if (purpose === 'verify') {
    providerStore.setVerifyProvider(providerStore.verifyProvider === id ? '' : id)
  } else if (purpose === 'detect') {
    providerStore.setDetectProvider(providerStore.detectProvider === id ? '' : id)
  } else {
    const p = providerStore.providers.find(item => item.id === id)
    if (p) {
      const arr = Array.isArray(p.purpose) ? [...p.purpose] : []
      const idx = arr.indexOf(purpose)
      if (idx >= 0) arr.splice(idx, 1)
      else arr.push(purpose as any)
      providerStore.updateProvider(id, { purpose: arr as any })
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
      providerType: 'openai-compatible',
      endpointMode: 'auto',
      purpose: ['generate'] as any
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
  const trace = useAiCallTrace({
    source: 'infra',
    stepName: '获取模型列表',
    mode: 'provider',
    providerId: editingProvider.value.id,
    providerName: editingProvider.value.name,
    model: editingProvider.value.selectedModel
  })
  trace.begin()
  try {
    const service = await getAiService()
    const models = await service.fetchModelsForProvider(editingProvider.value)
    if (models && models.length > 0) {
      editingProvider.value.models = [...models]
      fetchMsg.value = '成功获取 ' + models.length + ' 个模型'
    } else {
      fetchMsg.value = '未获取到模型，请检查接口地址和密钥'
    }
    trace.finish(models && models.length > 0 ? 'success' : 'degraded')
  } catch (e: any) {
    fetchMsg.value = '获取失败: ' + (e?.message || String(e))
    trace.fail(e)
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
  const trace = useAiCallTrace({
    source: 'infra',
    stepName: '连接测试',
    mode: 'provider',
    providerId: editingProvider.value.id,
    providerName: editingProvider.value.name,
    model: editingProvider.value.selectedModel
  })
  trace.begin()
  try {
    const service = await getAiService()
    const result = await service.testConnectionForProvider(editingProvider.value)
    if (result && result.connected) {
      connStatus.value = result.note ? '连接成功（' + result.note + '）' : '连接成功'
    } else {
      connStatus.value = '连接失败: ' + (result?.error || '未知错误')
    }
    trace.finish(result?.connected ? 'success' : 'failed', result?.error)
  } catch (e: any) {
    connStatus.value = '连接失败: ' + (e?.message || String(e))
    trace.fail(e)
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
    const file = (e.target as HTMLInputElement | null)?.files?.[0]
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
.api-settings { display: flex; flex-direction: column; gap: var(--space-5); }
.section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.section-title { font-size: var(--font-size-lg, 16px); font-weight: 600; color: var(--text-primary); }
.provider-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: var(--space-md); align-items: stretch; }
.provider-card {
  min-width: 0;
  max-width: none;
  background: var(--settings-card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg, 8px);
  padding: var(--space-md, var(--space-5));
  box-shadow: var(--shadow-);
  transition: transform var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard);
}
.provider-card:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-);
  border-color: var(--settings-card-hover-border);
}
.provider-card.is-active,
.provider-card:focus-within {
  border-color: var(--settings-card-active-border);
  box-shadow: var(--shadow-accent-sm);
}
.provider-card-header {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  margin-bottom: 8px;
}
.provider-card-name { font-weight: 600; font-size: var(--font-size-lg); flex: 1; color: var(--text-primary); }
.provider-type-badge {
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-sm, 4px);
  background: var(--bg-input);
  color: var(--text-muted);
  font-size: var(--font-size-xs, 12px);
  white-space: nowrap;
}

/* status badge - pill shape (old arch L3102-3120) */
.provider-card-status {
  display: inline-flex;
  align-items: center;
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-pill);
  font-size: var(--font-size-xs, 12px);
  font-weight: var(--fw-medium, 500);
  line-height: 1.4;
}
/* card actions row */
.provider-card-actions { display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap; min-width: 0; }
.provider-badge-on {
  background: var(--settings-card-badge-on-bg);
  color: var(--settings-card-badge-on-text);
}
.provider-badge-off {
  background: var(--settings-card-badge-bg);
  color: var(--settings-card-badge-off-text);
}

.purpose-toggle-group {
  display: inline-flex;
  gap: var(--space-1);
  flex-wrap: wrap;
  min-width: 0;
  max-width: 100%;
}
.purpose-toggle-btn {
  background: var(--bg-input);
  color: var(--text-muted);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm, 4px);
  padding: var(--space-1) var(--space-4);
  font-size: var(--font-size-xs, 12px);
  cursor: pointer;
  box-sizing: border-box;
  line-height: 18px;
  min-height: 23px;
  white-space: nowrap;
  transition: all var(--duration-fast) var(--ease-standard);
}
.purpose-toggle-btn:hover {
  border-color: var(--accent);
  color: var(--text-primary);
}
.purpose-toggle-btn.is-on {
  background: var(--settings-card-active-bg);
  color: var(--accent);
  border-color: var(--accent);
  font-weight: 500;
}
.purpose-checkbox-group {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
}
.purpose-checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-sm);
  cursor: pointer;
  color: var(--text-secondary);
}
.purpose-checkbox-label input[type="checkbox"] {
  margin: 0;
}
.provider-advanced {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm, 4px);
  padding: var(--space-4) var(--space-5);
  background: var(--bg-input);
}
.provider-advanced summary {
  cursor: pointer;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  user-select: none;
}
.advanced-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-5);
  margin-top: 8px;
}
.provider-fields { display: grid; grid-template-columns: 80px 1fr; gap: var(--space-2) var(--space-4); align-items: center; }
.provider-fields label { font-size: var(--font-size-sm); color: var(--text-secondary); }
.input-field {
  background: var(--bg-input);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm, 4px);
  padding: var(--space-3) var(--space-5);
  font-size: var(--font-size-md);
  height: 34px;
  outline: none;
}
.provider-card-url:hover { color: var(--accent-hover, var(--accent)); }
.provider-card-url-input { font-size: var(--font-size-sm); color: var(--text-muted); }
.model-row { display: flex; gap: var(--space-2); }
.btn-test { background: transparent; color: var(--accent); border: 1px solid var(--accent); }
.btn-test:hover { background: var(--accent-dim); }

/* model tags (old arch L3083-3088) */
.provider-card-models {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: 8px;
}
.model-tag {
  padding: var(--space-1) var(--space-4);
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
  padding: var(--space-4) 1var(--space-4);
  cursor: pointer;
  font-size: var(--font-size-md);
}
.btn-add:hover { transform: translateY(-1px); }
/* dashed add card (old arch L6600) */
.provider-card-add {
  flex: 1 1 300px;
  min-width: 300px;
  max-width: 460px;
  border: 2px dashed var(--settings-card-add-border);
  border-radius: var(--radius-md, 8px);
  padding: var(--space-8) var(--space-5);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  cursor: pointer;
  color: var(--text-muted);
  background: var(--settings-card-add-bg);
  transition: border-color var(--duration-fast), color var(--duration-fast);
}
.provider-card-add:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.provider-card-add-icon { font-size: var(--font-size-xxl); font-weight: 300; }
.provider-card-add-text { font-size: var(--font-size-md); }
.stream-toggle { display: flex; align-items: center; gap: var(--space-3); font-size: var(--font-size-md); color: var(--text-secondary); cursor: pointer; }
.stream-toggle input { cursor: pointer; }
.config-actions { display: flex; gap: var(--space-4); margin-bottom: 12px; }

/* === Edit View === */
.provider-edit-view { display: flex; flex-direction: column; gap: var(--space-6); padding: var(--space-7); background: var(--settings-card-bg); border: 1px solid var(--settings-card-border); border-radius: var(--radius-md); }
.provider-edit-header { display: flex; align-items: center; gap: var(--space-5); padding-bottom: 12px; border-bottom: 1px solid var(--border-color); }
.btn-back { padding: var(--space-2) var(--space-5); font-size: var(--font-size-md); }
.provider-edit-title-text { font-size: var(--font-size-lg); font-weight: 600; color: var(--text-primary); flex: 1; }
.provider-conn-status { font-size: var(--font-size-md); padding: var(--space-3) var(--space-5); border-radius: var(--radius-pill); }
.conn-ok { background: var(--success-dim, rgba(76,175,80,0.15)); color: var(--success); }
.conn-fail { background: var(--danger-dim, rgba(244,67,54,0.15)); color: var(--danger); }
.form-group { display: flex; flex-direction: column; gap: var(--space-2); }
.form-group label { font-size: var(--font-size-md); color: var(--text-secondary); font-weight: 500; }
.form-hint { font-size: var(--font-size-md); color: var(--text-muted); }
.password-row { display: flex; gap: var(--space-2); }
.btn-toggle { background: var(--bg-input); color: var(--text-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-sm, 4px); padding: var(--space-2) var(--space-5); font-size: var(--font-size-md); cursor: pointer; white-space: nowrap; }
.btn-toggle:hover { border-color: var(--accent); color: var(--accent); }
.model-fetch-row { display: flex; gap: var(--space-4); margin-bottom: 4px; }
.fetch-feedback { font-size: var(--font-size-md); padding: var(--space-2) 0; }
.fetch-ok { color: var(--success); }
.fetch-fail { color: var(--danger); }
.model-select-row { margin-top: 8px; }
.model-list-box { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: 8px; padding: var(--space-4); background: var(--bg-input); border-radius: var(--radius-sm, 4px); max-height: 120px; overflow-y: auto; }
.checkbox-label { display: flex; align-items: center; gap: var(--space-4); cursor: pointer; font-size: var(--font-size-md); color: var(--text-primary); }
.checkbox-label input { cursor: pointer; }
.temp-row { display: flex; align-items: center; gap: var(--space-4); }
.range-flex { flex: 1; }
.range-val { font-size: var(--font-size-sm); color: var(--text-secondary); min-width: 30px; text-align: right; }
.input-w-120 { width: 120px; }
.form-actions { display: flex; gap: var(--space-4); margin-top: 8px; }
.provider-card-info { display: flex; flex-direction: column; gap: var(--space-1); margin-bottom: 8px; }
.provider-card-url { font-size: var(--font-size-sm); color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.provider-card-model { font-size: var(--font-size-sm); color: var(--accent); overflow-wrap: anywhere; }
.provider-card-actions :deep(.btn-sm),
.provider-card-actions .btn-sm { box-sizing: border-box; line-height: 18px; min-height: 30px; height: 30px; white-space: nowrap; }
.provider-card-add { box-sizing: border-box; min-width: 0; max-width: 100%; }
</style>
