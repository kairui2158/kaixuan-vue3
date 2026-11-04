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
              <template v-if="providerSupportsGenerate(p)">
                <button
                  class="purpose-toggle-btn"
                  :class="{ 'is-on': hasPipelineLayer(p.id) }"
                  :title="pipelinePurposeTitle(p)"
                  @click="togglePipelinePurpose(p)"
                >生成流水线</button>
                <div
                  v-if="pipelinePurposeExpanded(p.id)"
                  class="pipeline-layer-select"
                  data-test="pipeline-layer-select"
                  :data-provider-id="p.id"
                >
                  <button
                    v-for="channel in pipelineChannelOptions"
                    :key="channel.layer"
                    class="pipeline-layer-option"
                    :class="{ 'is-on': providerHasPipelineLayer(p.id, channel.layer) }"
                    :data-layer="channel.layer"
                    :title="pipelinePurposeTitle(p)"
                    @click="togglePipelineLayer(p, channel.layer)"
                  >{{ channel.label }}</button>
                </div>
              </template>
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
      <div v-if="importMessage" class="config-import-feedback" :class="importMessageClass">{{ importMessage }}</div>
      <ul v-if="missingPipelineLayerMessages.length > 0" class="pipeline-channel-warning-list">
        <li
          v-for="message in missingPipelineLayerMessages"
          :key="message"
          class="pipeline-channel-warning"
        >{{ message }}</li>
      </ul>
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
          <button id="btn-test-generation" class="btn-sm btn-test" @click="testGeneration" :disabled="testingGeneration">
            {{ testingGeneration ? '生成探针中...' : '测试生成' }}
          </button>
        </div>
        <div class="fetch-feedback" v-if="fetchMsg" :class="fetchMsgClass">{{ fetchMsg }}</div>
        <div class="fetch-feedback" v-if="generationStatus" :class="generationStatusClass">{{ generationStatus }}</div>
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
        <label>上下文窗口 Tokens (0=未声明)</label>
        <input id="cfg-context-window" type="number" v-model.number="editingProvider.contextWindowTokens" min="0" class="input-field input-w-120" />
        <small class="form-hint">{{ contextWindowHint }}</small>
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
          <div class="form-group">
            <label>输出上限覆盖 (0=不传)</label>
            <input id="cfg-max-tokens" type="number" v-model.number="editingProvider.maxTokens" min="0" class="input-field input-w-120" />
            <small class="form-hint">默认不发送输出上限；仅供应商协议要求或实测 400 降级时使用</small>
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
const testingGeneration = ref(false)
const generationStatus = ref('')
const fetchMsg = ref('')
const importMessage = ref('')
const expandedPipelineProviders = ref(new Set<string>())

const pipelineChannelOptions: Array<{ layer: 'settings' | 'volumes' | 'chapters' | 'body'; label: string }> = [
  { layer: 'settings', label: '设定层' },
  { layer: 'volumes', label: '卷纲层' },
  { layer: 'chapters', label: '章节层' },
  { layer: 'body', label: '正文层' },
]

function pipelineLayerProviderId(layer: 'settings' | 'volumes' | 'chapters' | 'body'): string {
  return providerStore.pipelineLayerProviders[layer] || ''
}

function pipelineLayerProviderMissing(layer: 'settings' | 'volumes' | 'chapters' | 'body'): boolean {
  const id = pipelineLayerProviderId(layer)
  return Boolean(id) && !providerStore.providers.some(provider => provider.id === id)
}

function setPipelineLayerProvider(layer: 'settings' | 'volumes' | 'chapters' | 'body', providerId: string): void {
  providerStore.setPipelineLayerProvider(layer, providerId || null)
}

function pipelineLayersForProvider(providerId: string): Array<'settings' | 'volumes' | 'chapters' | 'body'> {
  return pipelineChannelOptions
    .filter(channel => pipelineLayerProviderId(channel.layer) === providerId)
    .map(channel => channel.layer)
}

function hasPipelineLayer(providerId: string): boolean {
  return pipelineLayersForProvider(providerId).length > 0
}

function pipelinePurposeExpanded(providerId: string): boolean {
  return hasPipelineLayer(providerId) || expandedPipelineProviders.value.has(providerId)
}

function pipelinePurposeTitle(provider: Provider): string {
  const layers = pipelineLayersForProvider(provider.id).map(layer =>
    pipelineChannelOptions.find(channel => channel.layer === layer)?.label || layer,
  )
  return layers.length > 0
    ? `${provider.name} · 生成流水线：${layers.join('、')}`
    : `${provider.name} · 点击启用生成流水线通道`
}

function togglePipelinePurpose(provider: Provider): void {
  if (!providerSupportsGenerate(provider)) return
  const layers = pipelineLayersForProvider(provider.id)
  const next = new Set(expandedPipelineProviders.value)
  if (layers.length > 0) {
    for (const layer of layers) setPipelineLayerProvider(layer, '')
  } else if (next.has(provider.id)) {
    next.delete(provider.id)
  } else {
    next.add(provider.id)
  }
  expandedPipelineProviders.value = next
}

function providerHasPipelineLayer(
  providerId: string,
  layer: 'settings' | 'volumes' | 'chapters' | 'body',
): boolean {
  return pipelineLayerProviderId(layer) === providerId
}

function togglePipelineLayer(
  provider: Provider,
  layer: 'settings' | 'volumes' | 'chapters' | 'body',
): void {
  if (!providerSupportsGenerate(provider)) return
  const current = pipelineLayerProviderId(layer)
  setPipelineLayerProvider(layer, current === provider.id ? '' : provider.id)
}

const missingPipelineLayerMessages = computed(() => pipelineChannelOptions
  .filter(channel => pipelineLayerProviderMissing(channel.layer))
  .map(channel => `${channel.label}的供应商已不存在，请重新绑定。`))

function removedGenerateLayersMessage(removed: Array<'settings' | 'volumes' | 'chapters' | 'body'>): string {
  if (removed.length === 0) return ''
  const labels = removed.map(layer =>
    pipelineChannelOptions.find(channel => channel.layer === layer)?.label || layer,
  )
  return `已同步解除生成流水线绑定：${labels.join('、')}`
}

const contextWindowHint = computed(() => {
  const value = Number(editingProvider.value?.contextWindowTokens)
  if (!Number.isFinite(value) || value <= 0) return '未声明窗口：请求前按保守窗口预算，长文会进入分段链路'
  return `已声明 ${Math.floor(value).toLocaleString()} tokens 输入窗口`
})

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

const generationStatusClass = computed(() => {
  if (generationStatus.value.includes('通过')) return 'fetch-ok'
  if (generationStatus.value.includes('失败') || generationStatus.value.includes('error')) return 'fetch-fail'
  return ''
})

const importMessageClass = computed(() => {
  if (importMessage.value.includes('失败')) return 'fetch-fail'
  if (importMessage.value.includes('未导入')) return 'fetch-fail'
  return 'fetch-ok'
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
         providerStore.detectProvider === id ||
         pipelineChannelOptions.some(channel => pipelineLayerProviderId(channel.layer) === id)
}

function hasPurpose(id: string, purpose: Provider['purpose'][number]): boolean {
  if (purpose === 'generate') return providerStore.generateProvider === id
  if (purpose === 'verify') return providerStore.verifyProvider === id
  if (purpose === 'detect') return providerStore.detectProvider === id
  return false
}

function providerSupportsGenerate(provider: Provider): boolean {
  const purposes = Array.isArray(provider.purpose) ? provider.purpose : [provider.purpose]
  return purposes.includes('generate')
}

function togglePurpose(id: string, purpose: Provider['purpose'][number]) {
  if (purpose === 'generate') {
    providerStore.setGenerateProvider(providerStore.generateProvider === id ? null : id)
  } else if (purpose === 'verify') {
    providerStore.setVerifyProvider(providerStore.verifyProvider === id ? null : id)
  } else if (purpose === 'detect') {
    providerStore.setDetectProvider(providerStore.detectProvider === id ? null : id)
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
      contextWindowTokens: 0,
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
  let purposeWarning = ''
  if (!providerSupportsGenerate(p)) {
    const removed = providerStore.clearPipelineLayersForProvider(p.id)
    purposeWarning = removedGenerateLayersMessage(removed)
  }
  providerStore.saveProviders()
  exitProviderEdit()
  if (purposeWarning) importMessage.value = purposeWarning
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
    model: editingProvider.value.selectedModel,
    providerSource: 'none'
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
    model: editingProvider.value.selectedModel,
    providerSource: 'none'
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

async function testGeneration() {
  if (!editingProvider.value) return
  if (!editingProvider.value.baseUrl || !editingProvider.value.apiKey) {
    generationStatus.value = '生成探针失败: 请先填写接口地址和API密钥'
    return
  }
  testingGeneration.value = true
  generationStatus.value = ''
  const trace = useAiCallTrace({
    source: 'infra',
    stepName: '生成探针',
    mode: 'provider',
    providerId: editingProvider.value.id,
    providerName: editingProvider.value.name,
    model: editingProvider.value.selectedModel,
    providerSource: 'none'
  })
  trace.begin()
  try {
    const service = await getAiService()
    const result = await service.testGenerationProbe(editingProvider.value)
    if (result && result.connected) {
      generationStatus.value = `生成探针通过（${result.durationMs}ms，模型：${result.model}）`
    } else {
      generationStatus.value = '生成探针失败: ' + (result?.error || '未知错误')
    }
    trace.finish(result?.connected ? 'success' : 'failed', result?.error)
  } catch (e: any) {
    generationStatus.value = '生成探针失败: ' + (e?.message || String(e))
    trace.fail(e)
  } finally {
    testingGeneration.value = false
  }
}

function exportConfig() {
  const data = JSON.stringify({
    providers: providerStore.providers,
    generateProvider: providerStore.generateProvider,
    pipelineLayerProviders: providerStore.pipelineLayerProviders,
  }, null, 2)
  const blob = new Blob([data], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "api-config.json"
  a.click()
  URL.revokeObjectURL(url)
}

function normalizeImportedLayerProviders(value: unknown): Partial<Record<'settings' | 'volumes' | 'chapters' | 'body', string | null>> {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const result: Partial<Record<'settings' | 'volumes' | 'chapters' | 'body', string | null>> = {}
  for (const layer of pipelineChannelOptions.map(option => option.layer)) {
    const raw = source[layer]
    if (typeof raw !== 'string') continue
    const trimmed = raw.trim()
    result[layer] = trimmed || null
  }
  return result
}

function importProviderBindings(value: unknown, providers: Provider[]): void {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const generateProvider = typeof data.generateProvider === 'string' ? data.generateProvider.trim() : ''
  if (generateProvider) {
    providerStore.setGenerateProvider(generateProvider)
  }

  const importedLayers = normalizeImportedLayerProviders(data.pipelineLayerProviders)
    const missingLayers: string[] = []
    const unsupportedLayers: string[] = []
    for (const option of pipelineChannelOptions) {
      const providerId = importedLayers[option.layer]
      if (providerId === undefined) continue
      const provider = providerId
        ? providers.find(item => item.id === providerId)
        : undefined
      if (providerId && !provider) {
        missingLayers.push(`${option.label}绑定 ${providerId} 未导入到现有供应商，请重新选择`)
      }
      if (providerId && provider && !providerSupportsGenerate(provider)) {
        unsupportedLayers.push(`${option.label}绑定的供应商不支持生成用途，已自动解绑`)
        providerStore.setPipelineLayerProvider(option.layer, null)
        continue
      }
      providerStore.setPipelineLayerProvider(option.layer, providerId)
    }
    const issues = [...missingLayers, ...unsupportedLayers]
    if (issues.length > 0) {
      importMessage.value = `导入完成，但有绑定需要处理：${issues.join('；')}。`
    }
  }

function importConfig() {
  importMessage.value = ''
  const input = document.createElement("input")
  input.type = "file"
  input.accept = ".json"
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement | null)?.files?.[0]
    if (!file) return
    const text = await file.text()
    try {
      const data = JSON.parse(text)
      const providers = Array.isArray(data) ? data : data.providers
      if (!Array.isArray(providers)) throw new Error('导入内容不是供应商数组')
      providers.forEach((p: Provider) => providerStore.upsertProvider({ ...p, contextWindowTokens: Number(p.contextWindowTokens) > 0 ? Math.floor(Number(p.contextWindowTokens)) : 0 }, { preserveRuntimeState: true }))
      importProviderBindings(data, providers)
    } catch (err) {
      importMessage.value = `导入失败: ${(err as Error)?.message || String(err)}`
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
.section-title { font-size: var(--font-size-lg); font-weight: 600; color: var(--text-primary); }
.provider-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: var(--space-6); align-items: stretch; }
.provider-card {
  min-width: 0;
  max-width: none;
  background: var(--settings-card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  box-shadow: var(--shadow-sm);
  transition: transform var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard);
}
.provider-card:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
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
  border-radius: var(--radius-sm);
  background: var(--bg-input);
  color: var(--text-muted);
  font-size: var(--font-size-xs);
  white-space: nowrap;
}

/* status badge - pill shape (old arch L3102-3120) */
.provider-card-status {
  display: inline-flex;
  align-items: center;
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-pill);
  font-size: var(--font-size-xs);
  font-weight: var(--fw-medium);
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
  border-radius: var(--radius-sm);
  padding: var(--space-1) var(--space-4);
  font-size: var(--font-size-xs);
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
  border-radius: var(--radius-sm);
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
  border-radius: var(--radius-sm);
  padding: var(--space-3) var(--space-5);
  font-size: var(--font-size-md);
  height: var(--density-form-height);
}
.provider-card-url:hover { color: var(--accent-hover); }
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
  border-radius: var(--radius-sm);
  background: var(--bg-input);
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}

.btn-add {
  margin-top: 12px;
  background: var(--accent);
  color: var(--text-on-accent);
  border: none;
  border-radius: var(--radius-sm);
  padding: var(--space-4);
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
  border-radius: var(--radius-md);
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
.config-actions { display: flex; flex-wrap: wrap; gap: var(--space-4); margin-bottom: 12px; }

.pipeline-layer-select {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 1px;
  border: 1px solid var(--accent);
  border-radius: var(--radius-sm);
  background: var(--accent-dim);
}
.pipeline-layer-option {
  background: transparent;
  color: var(--text-muted);
  border: none;
  border-radius: calc(var(--radius-sm) - 1px);
  padding: var(--space-1) var(--space-3);
  font-size: var(--font-size-xs);
  cursor: pointer;
  line-height: 18px;
  min-height: 21px;
  white-space: nowrap;
}
.pipeline-layer-option:hover { color: var(--text-primary); }
.pipeline-layer-option.is-on {
  background: var(--settings-card-active-bg);
  color: var(--accent);
  font-weight: 500;
}
.pipeline-channel-warning-list {
  margin: 8px 0 0;
  padding-left: 18px;
}
.pipeline-channel-warning { color: var(--danger); font-size: var(--font-size-xs); margin: 0; }

/* === Edit View === */
.provider-edit-view { display: flex; flex-direction: column; gap: var(--space-6); padding: var(--space-7); background: var(--settings-card-bg); border: 1px solid var(--settings-card-border); border-radius: var(--radius-md); }
.provider-edit-header { display: flex; align-items: center; gap: var(--space-5); padding-bottom: 12px; border-bottom: 1px solid var(--border-color); }
.btn-back { padding: var(--space-2) var(--space-5); font-size: var(--font-size-md); }
.provider-edit-title-text { font-size: var(--font-size-lg); font-weight: 600; color: var(--text-primary); flex: 1; }
.provider-conn-status { font-size: var(--font-size-md); padding: var(--space-3) var(--space-5); border-radius: var(--radius-pill); }
.conn-ok { background: var(--success-dim); color: var(--success); }
.conn-fail { background: var(--danger-dim); color: var(--danger); }
.form-group { display: flex; flex-direction: column; gap: var(--space-2); }
.form-group label { font-size: var(--font-size-md); color: var(--text-secondary); font-weight: 500; }
.form-hint { font-size: var(--font-size-md); color: var(--text-muted); }
.password-row { display: flex; gap: var(--space-2); }
.btn-toggle { background: var(--bg-input); color: var(--text-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: var(--space-2) var(--space-5); font-size: var(--font-size-md); cursor: pointer; white-space: nowrap; }
.btn-toggle:hover { border-color: var(--accent); color: var(--accent); }
.model-fetch-row { display: flex; gap: var(--space-4); margin-bottom: 4px; }
.fetch-feedback { font-size: var(--font-size-md); padding: var(--space-2) 0; }
.fetch-ok { color: var(--success); }
.fetch-fail { color: var(--danger); }
.model-select-row { margin-top: 8px; }
.model-list-box { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: 8px; padding: var(--space-4); background: var(--bg-input); border-radius: var(--radius-sm); max-height: 120px; overflow-y: auto; }
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
.provider-card-actions .btn-sm { box-sizing: border-box; line-height: 18px; min-height: var(--density-btn-sm-height); height: var(--density-btn-sm-height); white-space: nowrap; }
.provider-card-add { box-sizing: border-box; min-width: 0; max-width: 100%; }
</style>
