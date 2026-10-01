<template>
  <div class="agent-settings">
    <h3>智能体管理</h3>
    <div class="agent-toolbar" role="toolbar" aria-label="智能体配置交换">
      <button id="btn-import-agents" class="btn-sm btn-secondary" type="button" :disabled="exchangeLoading" @click="openAgentImport">
        {{ exchangeLoading ? '读取中...' : '导入配置' }}
      </button>
      <button id="btn-export-agents-json" class="btn-sm btn-secondary" type="button" :disabled="exchangeLoading || agentStore.agents.length === 0" @click="exportAgentsJson">
        导出 JSON
      </button>
      <span class="agent-toolbar-hint">支持 JSON / Markdown</span>
    </div>
    <div v-if="uiMessage" id="agent-ui-message" class="agent-ui-message" role="status">{{ uiMessage }}</div>
    <div id="agent-list" class="agent-list item-list card-grid">
      <div v-for="a in agentStore.agents" :key="a.id" class="agent-card" :class="{ 'is-editing': editingId === a.id }">
        <div class="agent-card-header">
          <span class="agent-card-name">{{ a.name || '未命名' }}</span>
          <span class="agent-card-model" v-if="a.model">{{ a.model }}</span>
          <div class="agent-card-actions">
           <button class="btn-sm btn-secondary" @click="toggleEdit(a.id)">{{ editingId === a.id ? '收起' : '编辑' }}</button>
          <button class="btn-sm btn-secondary" type="button" @click="exportAgentMarkdown(a.id)">导出 MD</button>
          <button class="btn-danger btn-sm" @click="agentStore.removeAgent(a.id)">删除</button>
         </div>
        </div>
        <div v-if="editingId !== a.id" class="agent-card-summary">
          <span class="agent-card-meta">温度: {{ a.temperature }}</span>
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
            <label>系统提示词</label>
            <textarea id="af-prompt" v-model="a.systemPrompt" class="textarea-field full-width" rows="6" placeholder="设定AI的角色、行为、语气..." @change="agentStore.saveAgents()"></textarea>
          </div>
          <div class="form-actions">
          <button id="btn-secondary-agent" class="btn-secondary" @click="cancelEdit">取消</button>
          <button id="btn-save-agent" class="btn-primary" @click="saveAgent(a.id)">保存</button>
          </div>
        </div>
      </div>
    </div>
    <button id="btn-add-agent" class="btn-add btn-primary btn-sm" @click="addAgent">+ 添加智能体</button>
    <datalist id="model-datalist">
      <option v-for="m in allModelOptions" :key="m" :value="m"></option>
    </datalist>

    <div v-if="importPreviewVisible" data-modal-id="agent-import-preview" class="modal-overlay modal-nested" :style="{ zIndex: modalQueue.getZIndex('agent-import-preview') }" @click.self="cancelImport">
      <div class="agent-import-modal" role="dialog" aria-modal="true" aria-labelledby="agent-import-title">
        <div class="agent-import-header">
          <h4 id="agent-import-title">导入预览</h4>
          <button class="icon-close" type="button" aria-label="关闭导入预览" @click="cancelImport"><AppIcon name="x" /></button>
        </div>
        <div class="agent-import-scroll">
          <p class="agent-import-source" :data-tooltip="importSource">{{ importSource || '配置文件' }}</p>
          <div v-if="importSourceInfo" class="agent-import-origin" aria-label="导入来源与协议状态">
            <span class="agent-import-chip">来源：{{ formatSource(importSourceInfo) }}</span>
            <span class="agent-import-chip" :class="protocolClass(importSourceInfo)">
              {{ formatProtocol(importSourceInfo) }}
            </span>
          </div>
          <div v-if="importFieldTrace.length" class="agent-import-fields">
            <div class="agent-import-section-title">字段读取</div>
            <div v-for="trace in importFieldTrace" :key="trace.field" class="agent-import-field">
              <span class="agent-import-field-name">{{ trace.field }}</span>
              <span class="agent-import-field-origin">{{ formatOrigin(trace.origin) }}</span>
              <span v-if="trace.sourceField" class="agent-import-field-source">来自 {{ trace.sourceField }}</span>
            </div>
          </div>
          <div v-if="importDiagnostics.length" class="agent-import-diagnostics">
            <div class="agent-import-section-title">解析诊断</div>
            <div v-for="(diagnostic, index) in importDiagnostics" :key="diagnostic.code + '-' + index" class="agent-import-diagnostic" :class="'is-' + diagnostic.level">
              <strong>{{ formatDiagnosticLevel(diagnostic.level) }}</strong>
              <span>{{ diagnostic.message }}</span>
            </div>
          </div>
          <div v-if="importUnknownFields.length" class="agent-import-unknown">
            未识别字段：{{ importUnknownFields.join('、') }}
          </div>
          <div v-if="importIssues.length" class="agent-import-issues">
            <div v-for="(issue, index) in importIssues" :key="issue.field + '-' + index" class="agent-import-issue">
              {{ issue.field }}：{{ issue.message }}
            </div>
          </div>
          <div class="agent-import-summary">共 {{ importPlan.length }} 个配置，新增 {{ importAddCount }} 个，重复 {{ importConflictCount }} 个</div>
          <div class="agent-import-plan">
            <div v-for="item in importPlan" :key="item.id" class="agent-import-plan-item">
              <span class="agent-import-name">{{ item.name }}</span>
              <span class="agent-import-id">{{ item.id }}</span>
              <span class="agent-import-action" :class="'is-' + item.action">{{ item.reason }}</span>
            </div>
            <p v-if="importPlan.length === 0" class="agent-import-empty">没有可导入的有效配置。</p>
          </div>
          <label class="agent-import-strategy">
            <span>重复配置处理</span>
            <select v-model="importStrategy" class="input-field" @change="refreshImportPlan">
              <option value="skip">跳过重复（推荐）</option>
              <option value="overwrite">覆盖已有配置</option>
            </select>
          </label>
        </div>
        <div class="agent-import-actions">
          <button class="btn-secondary" type="button" @click="cancelImport">取消</button>
          <button class="btn-primary" type="button" :disabled="importPlan.length === 0 || exchangeLoading" @click="confirmImport">确认导入</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useAgentStore } from '../../stores/agent'
import { useProviderStore } from '../../stores/provider'
import { useConfigExchange } from '../../composables/useConfigExchange'
import type { Agent } from '../../stores/agent'
import { buildImportPlan } from '../../services/configExchange'
import type { ConfigDiagnostic, ConfigFieldTrace, ConfigIssue, ConfigSourceInfo, ImportPlanItem, ImportStrategy } from '../../services/configExchange'
import { useModalQueue } from '../../composables/useModalQueue'

const agentStore = useAgentStore()
const providerStore = useProviderStore()
const modalQueue = useModalQueue()
const {
  exchangeLoading,
  importAgentsFromFile,
  applyAgentImport,
  exportAllAgentsJSON,
  exportAgentMarkdown: writeAgentMarkdown,
} = useConfigExchange()
const editingId = ref('')
const allModelOptions = ref<string[]>(['gpt-4o', 'gpt-4o-mini', 'claude-3-5-sonnet', 'claude-3-5-haiku', 'deepseek-chat', 'deepseek-reasoner', 'qwen-max', 'qwen-plus'])
const uiMessage = ref('')
const importPreviewVisible = ref(false)
const importPlan = ref<ImportPlanItem[]>([])
const pendingAgentRecords = ref<import('../../services/configExchange').AgentRecord[]>([])
const importIssues = ref<ConfigIssue[]>([])
const importSource = ref('')
const importDiagnostics = ref<ConfigDiagnostic[]>([])
const importFieldTrace = ref<ConfigFieldTrace[]>([])
const importSourceInfo = ref<ConfigSourceInfo>()
const importUnknownFields = ref<string[]>([])
const importStrategy = ref<ImportStrategy>('skip')

watch(() => importPreviewVisible.value, visible => {
  if (visible) modalQueue.open('agent-import-preview')
  else modalQueue.close('agent-import-preview')
}, { immediate: true })

// Verification bridge for responsive E2E; no runtime behavior depends on it.
;(globalThis as any).__agentSettingsState = {
  get agentStore() { return agentStore },
  get importPreviewVisible() { return importPreviewVisible.value },
  set importPreviewVisible(value: boolean) { importPreviewVisible.value = value },
  get importSource() { return importSource.value },
  set importSource(value: string) { importSource.value = value },
  get importSourceInfo() { return importSourceInfo.value },
  set importSourceInfo(value: ConfigSourceInfo | undefined) { importSourceInfo.value = value },
  get importFieldTrace() { return importFieldTrace.value },
  set importFieldTrace(value: ConfigFieldTrace[]) { importFieldTrace.value = value },
  get importDiagnostics() { return importDiagnostics.value },
  set importDiagnostics(value: ConfigDiagnostic[]) { importDiagnostics.value = value },
  get importUnknownFields() { return importUnknownFields.value },
  set importUnknownFields(value: string[]) { importUnknownFields.value = value },
  get importIssues() { return importIssues.value },
  set importIssues(value: ConfigIssue[]) { importIssues.value = value },
  get importPlan() { return importPlan.value },
  set importPlan(value: ImportPlanItem[]) { importPlan.value = value }
}
const importAddCount = computed(() => importPlan.value.filter(item => item.action === 'add').length)
const importConflictCount = computed(() => importPlan.value.filter(item => item.action !== 'add').length)

function showMessage(message: string) {
  uiMessage.value = message
  window.setTimeout(() => {
    if (uiMessage.value === message) uiMessage.value = ''
  }, 6000)
}

async function openAgentImport() {
  const result = await importAgentsFromFile()
  if (!result) return
  importIssues.value = result.issues
  importSource.value = result.source
  importDiagnostics.value = result.diagnostics
  importFieldTrace.value = result.fieldTrace
  importSourceInfo.value = result.sourceInfo
  importUnknownFields.value = result.unknownFields
  if (!result.ok) {
    showMessage(result.issues.map(issue => issue.message).join('；') || '配置导入失败')
    return
  }
  pendingAgentRecords.value = result.records
  importPlan.value = result.plan
  importStrategy.value = 'skip'
  importPreviewVisible.value = true
}

async function confirmImport() {
  const result = await applyAgentImport(pendingAgentRecords.value, importStrategy.value)
  importPreviewVisible.value = false
  showMessage(`导入完成：新增 ${result.added} 个，更新 ${result.updated} 个，跳过 ${result.skipped} 个`)
  pendingAgentRecords.value = []
  importPlan.value = []
}

function cancelImport() {
  importPreviewVisible.value = false
  pendingAgentRecords.value = []
  importPlan.value = []
  importIssues.value = []
  importSource.value = ''
  importDiagnostics.value = []
  importFieldTrace.value = []
  importSourceInfo.value = undefined
  importUnknownFields.value = []
}

function formatSource(source: ConfigSourceInfo) {
  if (source.format === 'json') return 'JSON'
  return source.fileName ? `Markdown（${source.fileName}）` : 'Markdown'
}

function formatProtocol(source: ConfigSourceInfo) {
  if (source.format === 'json') return '标准 JSON'
  return source.markdownKind === 'front-matter' ? '标准协议 Markdown' : '兼容解析 Markdown'
}

function protocolClass(source: ConfigSourceInfo) {
  if (source.format === 'json') return 'is-standard'
  return source.markdownKind === 'front-matter' ? 'is-standard' : 'is-compatible'
}

function formatOrigin(origin: ConfigFieldTrace['origin']) {
  return { source: '原字段', mapped: '别名映射', inferred: '规则推导', defaulted: '默认值' }[origin]
}

function formatDiagnosticLevel(level: ConfigDiagnostic['level']) {
  return { info: '提示', warning: '警告', error: '错误' }[level]
}

function refreshImportPlan() {
  importPlan.value = buildImportPlan(agentStore.agents.map(a => a.id), pendingAgentRecords.value, importStrategy.value)
}

async function exportAgentsJson() {
  const ok = await exportAllAgentsJSON()
  showMessage(ok ? 'Agent JSON 导出成功' : 'Agent JSON 导出失败或已取消')
}

async function exportAgentMarkdown(id: string) {
  const ok = await writeAgentMarkdown(id)
  showMessage(ok ? 'Agent Markdown 导出成功' : 'Agent Markdown 导出失败或已取消')
}

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
.agent-settings h3 { font-size: var(--font-size-lg); margin-bottom: 16px; }
.agent-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-4); margin-bottom: 12px; }
.agent-toolbar-hint { color: var(--text-muted); font-size: var(--font-size-sm); }
.agent-ui-message { margin-bottom: 12px; padding: var(--space-4) var(--space-5); border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--accent-dim); color: var(--text-primary); font-size: var(--font-size-md); overflow-wrap: anywhere; }
.agent-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: var(--space-5); }
/* agent-card base (border/radius/bg/hover) from global.css L651-669 */
.agent-card {
  padding: var(--space-5) var(--space-5);
  min-width: 0;
  background: var(--settings-card-bg);
  border: 1px solid var(--settings-card-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  transition: border-color var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard);
}
.agent-card:hover { border-color: var(--settings-card-hover-border); }
.agent-card.is-editing {
  border-color: var(--settings-card-active-border);
  box-shadow: var(--shadow-border-accent), var(--shadow-md);
}
.agent-card-header { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-4); margin-bottom: 4px; min-width: 0; }
.agent-card-name { min-width: 0; max-width: 100%; font-weight: 600; font-size: var(--font-size-lg); color: var(--text-primary); flex: 1 1 180px; overflow-wrap: anywhere; word-break: break-word; }
.agent-card-model { min-width: 0; max-width: 100%; font-size: var(--font-size-sm); color: var(--settings-card-model-text); background: var(--settings-card-model-bg); padding: var(--space-1) var(--space-4); border-radius: var(--radius-pill); overflow-wrap: anywhere; word-break: break-word; white-space: normal; }
.agent-card-actions { display: flex; flex: 0 1 auto; flex-wrap: wrap; gap: var(--space-2); min-width: 0; margin-left: auto; }
.agent-card-summary { display: flex; flex-wrap: wrap; gap: var(--space-5); padding: var(--space-1) 0; min-width: 0; }
.agent-card-meta { font-size: var(--font-size-sm); color: var(--text-muted); }
.agent-card-body { margin-top: 8px; min-width: 0; }
.agent-fields { display: grid; grid-template-columns: minmax(0, 80px) minmax(0, 1fr); gap: var(--space-2) var(--space-4); align-items: center; margin-bottom: 8px; min-width: 0; }
.agent-fields label { min-width: 0; max-width: 100%; font-size: var(--font-size-md); color: var(--text-secondary); overflow-wrap: anywhere; word-break: break-word; }
.input-field { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--radius-xs); padding: var(--space-3) var(--space-5); font-size: var(--font-size-md); height: var(--density-form-height); }
.textarea-field { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--radius-xs); padding: var(--space-4) var(--space-6); font-size: var(--font-size-md); resize: vertical; grid-column: 2; }
.btn-add { background: var(--accent); color: var(--text-on-accent); border: none; border-radius: var(--radius-sm); padding: var(--space-4); cursor: pointer; font-size: var(--font-size-md); margin-top: 12px; }
.agent-import-modal { width: min(680px, 100%); max-width: 100%; min-width: 0; max-height: var(--modal-max-height); overflow: hidden; background: var(--bg-glass); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: var(--modal-padding); color: var(--text-primary); box-shadow: var(--shadow-lg); display: flex; flex-direction: column; }
.agent-import-header { display: flex; align-items: center; justify-content: space-between; gap: var(--space-5); margin-bottom: 8px; flex-shrink: 0; }
.agent-import-header h4 { margin: 0; font-size: var(--font-size-lg); }
.icon-close { flex: 0 0 auto; border: 0; background: transparent; color: var(--text-muted); cursor: pointer; font-size: var(--font-size-xl); line-height: 1; }
.agent-import-source { margin: 0 0 var(--space-5); color: var(--text-muted); font-size: var(--font-size-sm); overflow-wrap: anywhere; }
.agent-import-origin { display: flex; flex-wrap: wrap; gap: var(--space-3); margin: -var(--space-2) 0 var(--space-5); min-width: 0; }
.agent-import-chip { min-width: 0; max-width: 100%; padding: var(--space-2) var(--space-4); border: 1px solid var(--border-color); border-radius: var(--radius-xs); color: var(--text-secondary); background: var(--bg-tertiary); font-size: var(--font-size-sm); overflow-wrap: anywhere; }
.agent-import-chip.is-standard { border-color: var(--success); color: var(--success); }
.agent-import-chip.is-compatible { border-color: var(--warning); color: var(--warning); }
.agent-import-section-title { margin-bottom: 6px; color: var(--text-secondary); font-size: var(--font-size-sm); font-weight: 600; }
.agent-import-fields { display: grid; gap: var(--space-2); margin-bottom: 12px; padding: var(--space-4) var(--space-5); border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-tertiary); }
.agent-import-field { display: grid; grid-template-columns: minmax(90px, 0.8fr) minmax(70px, 0.55fr) minmax(0, 1.4fr); gap: var(--space-4); min-width: 0; font-size: var(--font-size-sm); }
.agent-import-field > * { min-width: 0; overflow-wrap: anywhere; word-break: break-word; }
.agent-import-field-name { color: var(--text-primary); }
.agent-import-field-origin { color: var(--accent); }
.agent-import-field-source { color: var(--text-muted); }
.agent-import-diagnostics { display: grid; gap: var(--space-2); margin-bottom: 12px; }
.agent-import-diagnostic { display: flex; gap: var(--space-3); min-width: 0; padding: var(--space-3) var(--space-4); border-left: 3px solid var(--border-color); background: var(--bg-tertiary); font-size: var(--font-size-sm); overflow-wrap: anywhere; }
.agent-import-diagnostic span { min-width: 0; overflow-wrap: anywhere; word-break: break-word; }
.agent-import-diagnostic.is-info { border-color: var(--accent); }
.agent-import-diagnostic.is-warning { border-color: var(--warning); }
.agent-import-diagnostic.is-error { border-color: var(--danger); }
.agent-import-unknown { margin-bottom: 12px; padding: var(--space-4) var(--space-5); border: 1px solid var(--warning); border-radius: var(--radius-sm); color: var(--warning); background: var(--bg-tertiary); font-size: var(--font-size-sm); overflow-wrap: anywhere; }
.agent-import-issues { display: grid; gap: var(--space-3); margin-bottom: 12px; padding: var(--space-4) var(--space-5); border: 1px solid var(--danger); border-radius: var(--radius-sm); background: var(--diagnostic-error-bg); color: var(--text-primary); }
.agent-import-issue { overflow-wrap: anywhere; }
.agent-import-summary { margin-bottom: 8px; color: var(--text-secondary); font-size: var(--font-size-md); }
.agent-import-plan { display: grid; gap: var(--space-3); max-height: 260px; overflow-y: auto; padding: var(--space-4); border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-input); }
.agent-import-plan-item { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 0.8fr) minmax(0, auto); align-items: center; gap: var(--space-4); min-width: 0; padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--border-color); }
.agent-import-plan-item:last-child { border-bottom: 0; }
.agent-import-name, .agent-import-id, .agent-import-action { min-width: 0; overflow-wrap: anywhere; }
.agent-import-id { color: var(--text-muted); font-family: var(--font-family-mono); font-size: var(--font-size-sm); }
.agent-import-action { color: var(--text-secondary); font-size: var(--font-size-sm); text-align: right; }
.agent-import-action.is-add { color: var(--success); }
.agent-import-action.is-update { color: var(--warning); }
.agent-import-action.is-skip { color: var(--text-muted); }
.agent-import-empty { margin: var(--space-4); color: var(--text-muted); }
.agent-import-strategy { display: grid; grid-template-columns: minmax(0, 120px) minmax(0, 1fr); align-items: center; gap: var(--space-4); margin-top: 12px; min-width: 0; }
.agent-import-strategy .input-field { width: 100%; min-width: 0; }
.agent-import-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: var(--space-4); margin-top: 16px; flex-shrink: 0; }
.agent-import-scroll { min-height: 0; overflow-y: auto; padding-right: var(--space-2); }
@media (max-width: 600px) {
  .agent-fields { grid-template-columns: minmax(0, 1fr); }
  .textarea-field { grid-column: 1; }
  .agent-import-plan-item { grid-template-columns: 1fr; gap: var(--space-3); }
  .agent-import-action { text-align: left; }
  .agent-import-strategy { grid-template-columns: 1fr; }
  .agent-import-field { grid-template-columns: 1fr; gap: var(--space-1); }
}
</style>

