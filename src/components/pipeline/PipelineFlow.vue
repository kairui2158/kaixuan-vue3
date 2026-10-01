<template>
  <div class="pf-flow">
    <div class="pf-flow-header">
      <span class="pf-flow-title">流水线可视化</span>
      <div class="pf-flow-actions">
        <button class="btn-sm btn-secondary" id="btn-pf-save" @click="showSaveDialog = true">保存配置</button>
        <button class="btn-sm btn-secondary" id="btn-pf-load" @click="showLoadDialog = true">加载配置</button>
        <button class="btn-sm btn-secondary" id="btn-pf-list-toggle" @click="$emit('toggle-view')">列表视图</button>
      </div>
    </div>
    
    <!-- Version Save Dialog -->
    <div v-if="showSaveDialog" data-modal-id="pipeline-flow-save" class="modal-overlay modal-nested" :style="{ zIndex: modalQueue.getZIndex('pipeline-flow-save') }" @click.self="showSaveDialog = false">
      <div class="pf-dialog">
        <div class="pf-dialog-header">
          <span>保存流水线配置</span>
          <button class="modal-close" type="button" aria-label="关闭保存配置" @click="showSaveDialog = false"><AppIcon name="x" /></button>
        </div>
        <div class="pf-dialog-body">
          <label>配置名称</label>
          <input v-model="saveVersionName" class="pl-input" placeholder="例：v2.1 奇幻设定" />
        </div>
        <div class="pf-dialog-footer">
          <button class="btn-secondary" @click="showSaveDialog = false">取消</button>
          <button class="btn-primary" @click="saveVersion" :disabled="!saveVersionName.trim()">保存</button>
        </div>
      </div>
    </div>
    
    <!-- Version Load Dialog -->
    <div v-if="showLoadDialog" data-modal-id="pipeline-flow-load" class="modal-overlay modal-nested" :style="{ zIndex: modalQueue.getZIndex('pipeline-flow-load') }" @click.self="showLoadDialog = false">
      <div class="pf-dialog pf-dialog-wide">
        <div class="pf-dialog-header">
          <span>加载流水线配置</span>
          <button class="modal-close" type="button" aria-label="关闭加载配置" @click="showLoadDialog = false"><AppIcon name="x" /></button>
        </div>
        <div class="pf-dialog-body">
          <EmptyState
            v-if="versions.length === 0"
            variant="compact"
            icon="history"
            title="暂无保存的配置"
            description="保存当前流水线配置后，可以在这里快速载入"
          />
          <div v-for="(v, i) in versions" :key="i" class="pf-version-row">
            <div class="pf-version-info">
              <span class="pf-version-name">{{ v.name }}</span>
              <span class="pf-version-time">{{ v.savedAt }}</span>
            </div>
            <div class="pf-version-actions">
              <button class="btn-sm btn-primary" @click="loadVersion(i)">加载</button>
              <button class="btn-sm btn-danger" @click="deleteVersion(i)">删除</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Flow Graph -->
    <div class="pf-graph">
      <div
        v-for="(step, si) in pipelineSteps"
        :key="si"
        class="pf-node"
        :class="{ 'pf-node-active': pipelineStore.currentStep === si, 'pf-node-completed': step.completed }"
        @click="pipelineStore.setStep(si)"
      >
        <div class="pf-node-head">
          <span class="pf-node-num">{{ si + 1 }}</span>
          <span class="pf-node-label">{{ step.name }}</span>
          <AppIcon v-if="step.completed" name="check" class="pf-node-check" />
        </div>
        <div class="pf-node-body">
          <div class="pf-node-mode">
            <span class="pf-node-tag">模式</span>
            <span class="pf-node-value">{{ modeLabels[stepSkillModes[si] || 'compose'] }}</span>
          </div>
          <div class="pf-node-agent" v-if="stepAgents[si]">
            <span class="pf-node-tag">智能体</span>
            <span class="pf-node-value">{{ getAgentName(stepAgents[si]) }}</span>
          </div>
          <div class="pf-node-skills">
            <span class="pf-node-tag">技能</span>
            <div class="pf-node-skill-chips">
              <template v-for="(sid, ski) in stepSkills[si]" :key="ski">
                <span v-if="sid" class="pf-skill-chip">{{ getSkillName(sid) }}</span>
              </template>
              <span v-if="!stepSkills[si] || stepSkills[si].filter(Boolean).length === 0" class="pf-node-empty">未配置</span>
            </div>
          </div>
        </div>
        <!-- Arrow to next step -->
        <div v-if="si < pipelineSteps.length - 1" class="pf-arrow">
          <AppIcon name="arrow-up" :size="24" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { usePipelineStore } from '../../stores/pipeline'
import EmptyState from '../common/EmptyState.vue'
import AppIcon from '../common/AppIcon.vue'
import { useSkillStore } from '../../stores/skill'
import { useAgentStore } from '../../stores/agent'
import { storageKey } from '../../utils/storage-key'
import { useModalQueue } from '../../composables/useModalQueue'

const emit = defineEmits<{ (e: 'toggle-view'): void }>()

const pipelineStore = usePipelineStore()
const skillStore = useSkillStore()
const agentStore = useAgentStore()
const modalQueue = useModalQueue()

const props = defineProps<{
  stepsWithIds: { id: string; name: string; completed: boolean }[]
  stepAgents: Record<number, string>
  stepSkills: Record<number, string[]>
  stepSkillModes: Record<number, string>
}>()

const pipelineSteps = computed(() => props.stepsWithIds)
const stepAgents = computed(() => props.stepAgents)
const stepSkills = computed(() => props.stepSkills)
const stepSkillModes = computed(() => props.stepSkillModes)

const modeLabels: Record<string, string> = {
  compose: '并行',
  chain: '串行',
}

// Version management
const showSaveDialog = ref(false)
const showLoadDialog = ref(false)

watch(() => ({ save: showSaveDialog.value, load: showLoadDialog.value }), visible => {
  if (visible.save) modalQueue.open('pipeline-flow-save')
  else modalQueue.close('pipeline-flow-save')
  if (visible.load) modalQueue.open('pipeline-flow-load')
  else modalQueue.close('pipeline-flow-load')
}, { immediate: true })

// Verification bridge for responsive E2E; no runtime behavior depends on it.
;(globalThis as any).__pipelineFlowState = {
  get showSaveDialog() { return showSaveDialog.value },
  set showSaveDialog(value: boolean) { showSaveDialog.value = value },
  get showLoadDialog() { return showLoadDialog.value },
  set showLoadDialog(value: boolean) { showLoadDialog.value = value },
  get versions() { return versions.value },
  set versions(value: Array<{ name: string; savedAt: string; config: any }>) { versions.value = value }
}
const saveVersionName = ref('')
const versions = ref<{ name: string; savedAt: string; config: any }[]>([])

  async function loadVersions() {
  try {
    const data = await window.electronAPI.storageRead(storageKey('pipeline_versions'))
    if (Array.isArray(data)) versions.value = data
  } catch(e) { versions.value = [] }
}

  async function saveVersions() {
  await window.electronAPI.storageWrite(storageKey('pipeline_versions'), versions.value)
}

function saveVersion() {
  const name = saveVersionName.value.trim()
  if (!name) return
  const config = {
    agents: { ...props.stepAgents },
    skills: JSON.parse(JSON.stringify(props.stepSkills)),
    modes: { ...props.stepSkillModes },
  }
  versions.value.push({ name, savedAt: new Date().toLocaleString('zh-CN'), config })
  saveVersions()
  saveVersionName.value = ''
  showSaveDialog.value = false
}

function loadVersion(index: number) {
  const v = versions.value[index]
  if (!v || !v.config) return
  const { agents, skills, modes } = v.config
  if (agents) {
    for (const k of Object.keys(agents)) {
      const i = parseInt(k)
      if (!isNaN(i)) props.stepAgents[i] = agents[k]
    }
  }
  if (skills) {
    for (const k of Object.keys(skills)) {
      const i = parseInt(k)
      if (!isNaN(i)) props.stepSkills[i] = skills[k]
    }
  }
  if (modes) {
    for (const k of Object.keys(modes)) {
      const i = parseInt(k)
      if (!isNaN(i)) props.stepSkillModes[i] = modes[k] === 'chain' ? 'chain' : 'compose'
    }
  }
  showLoadDialog.value = false
}

function deleteVersion(index: number) {
  versions.value.splice(index, 1)
  saveVersions()
}

function getSkillName(id: string): string {
  const s = skillStore.getSkill(id)
  return s ? skillStore.displaySkillName(s) : id
}

function getAgentName(id: string): string {
  const a = agentStore.agents.find((a: any) => a.id === id)
  return a ? a.name : id
}

loadVersions()
</script>

<style scoped>
.pf-flow { padding: 0; }
.pf-flow-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 1px solid var(--border-color); }
.pf-flow-title { font-size: var(--font-size-lg); font-weight: 600; color: var(--text-primary); }
.pf-flow-actions { display: flex; gap: var(--space-4); }
.pf-graph { display: flex; flex-direction: column; gap: 0; align-items: center; }
.pf-node { width: 100%; max-width: 480px; background: var(--pipeline-step-bg); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: var(--space-6); cursor: pointer; transition: border-color var(--duration-fast), box-shadow var(--duration-fast); }
.pf-node:hover { border-color: var(--pipeline-step-active-border); }
.pf-node-active { border-color: var(--pipeline-step-active-border); background: var(--pipeline-step-active-bg); box-shadow: var(--shadow-focus-ring); }
.pf-node-completed { border-color: var(--pipeline-step-complete-border); background: var(--pipeline-step-complete-bg); }
.pf-node-head { display: flex; align-items: center; gap: var(--space-5); margin-bottom: 12px; }
.pf-node-num { width: 28px; height: 28px; border-radius: 50%; background: var(--bg-tertiary); display: flex; align-items: center; justify-content: center; font-size: var(--font-size-md); font-weight: bold; color: var(--text-primary); flex-shrink: 0; }
.pf-node-active .pf-node-num { background: var(--pipeline-step-active-border); color: var(--text-on-accent); }
.pf-node-completed .pf-node-num { background: var(--pipeline-step-complete-border); color: var(--text-on-accent); }
.pf-node-label { font-size: var(--font-size-lg); font-weight: 500; color: var(--text-primary); }
.pf-node-check { margin-left: auto; color: var(--success); font-size: var(--font-size-lg); }
.pf-node-body { display: flex; flex-direction: column; gap: var(--space-4); padding-left: 38px; }
.pf-node-mode, .pf-node-agent, .pf-node-skills { display: flex; align-items: center; gap: var(--space-3); }
.pf-node-tag { font-size: var(--font-size-xs); color: var(--text-muted); background: var(--bg-tertiary); padding: var(--space-1) var(--space-3); border-radius: var(--radius-xs); flex-shrink: 0; }
.pf-node-value { font-size: var(--font-size-md); color: var(--text-primary); }
.pf-node-skill-chips { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.pf-skill-chip { padding: var(--space-1) var(--space-4); border-radius: var(--radius-lg); font-size: var(--font-size-xs); background: var(--accent-dim); color: var(--accent); border: 1px solid var(--accent-glow); }
.pf-node-empty { font-size: var(--font-size-sm); color: var(--text-muted); font-style: italic; }
.pf-arrow { display: flex; justify-content: center; padding: var(--space-1) 0; color: var(--text-muted); }
.pf-dialog { background: var(--bg-glass); border: 1px solid var(--border-color); border-radius: var(--radius-lg); width: min(400px, 92vw); max-height: min(82vh, 720px); overflow: hidden; display: flex; flex-direction: column; box-shadow: var(--shadow-lg); }
.pf-dialog-wide { width: min(500px, 92vw); }
.pf-dialog-header { display: flex; align-items: center; justify-content: space-between; padding: var(--space-5) var(--space-7); border-bottom: 1px solid var(--border-color); font-size: var(--font-size-lg); font-weight: 600; }
.pf-dialog-body { padding: var(--space-7); overflow-y: auto; min-height: 0; }
.pf-dialog-body label { display: block; font-size: var(--font-size-md); color: var(--text-secondary); margin-bottom: 6px; }
.pf-dialog-footer { display: flex; justify-content: flex-end; gap: var(--space-5); padding: var(--space-5) var(--space-7); border-top: 1px solid var(--border-color); }
.pf-version-row { display: flex; align-items: center; justify-content: space-between; padding: var(--space-5); border-bottom: 1px solid var(--border-color); }
.pf-version-row:last-child { border-bottom: none; }
.pf-version-info { display: flex; flex-direction: column; gap: var(--space-1); }
.pf-version-name { font-size: var(--font-size-md); color: var(--text-primary); font-weight: 500; }
.pf-version-time { font-size: var(--font-size-xs); color: var(--text-muted); }
.pf-version-actions { display: flex; gap: var(--space-3); }
</style>

