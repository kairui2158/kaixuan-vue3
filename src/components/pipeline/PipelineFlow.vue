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
    <div v-if="showSaveDialog" class="pf-dialog-overlay" @click.self="showSaveDialog = false">
      <div class="pf-dialog">
        <div class="pf-dialog-header">
          <span>保存流水线配置</span>
          <button class="modal-close" @click="showSaveDialog = false">&times;</button>
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
    <div v-if="showLoadDialog" class="pf-dialog-overlay" @click.self="showLoadDialog = false">
      <div class="pf-dialog pf-dialog-wide">
        <div class="pf-dialog-header">
          <span>加载流水线配置</span>
          <button class="modal-close" @click="showLoadDialog = false">&times;</button>
        </div>
        <div class="pf-dialog-body">
          <div v-if="versions.length === 0" class="pf-empty-hint">暂无保存的配置</div>
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
          <span v-if="step.completed" class="pf-node-check">&#10003;</span>
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
            <span class="pf-node-tag">Skill</span>
            <div class="pf-node-skill-chips">
              <span v-for="(sid, ski) in stepSkills[si]" :key="ski" v-if="sid" class="pf-skill-chip">{{ getSkillName(sid) }}</span>
              <span v-if="!stepSkills[si] || stepSkills[si].filter(Boolean).length === 0" class="pf-node-empty">未配置</span>
            </div>
          </div>
        </div>
        <!-- Arrow to next step -->
        <div v-if="si < pipelineSteps.length - 1" class="pf-arrow">
          <svg width="24" height="24" viewBox="0 0 24 24"><path d="M12 5v14M5 12l7-7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { usePipelineStore } from '../../stores/pipeline'
import { useSkillStore } from '../../stores/skill'
import { useAgentStore } from '../../stores/agent'
import { storageKey } from '../../utils/storage-key'

const emit = defineEmits<{ (e: 'toggle-view'): void }>()

const pipelineStore = usePipelineStore()
const skillStore = useSkillStore()
const agentStore = useAgentStore()

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
const saveVersionName = ref('')
const versions = ref<{ name: string; savedAt: string; config: any }[]>([])

function loadVersions() {
  try {
    const data = window.electronAPI.storageRead(storageKey('pipeline_versions'))
    if (Array.isArray(data)) versions.value = data
  } catch(e) { versions.value = [] }
}

function saveVersions() {
  window.electronAPI.storageWrite(storageKey('pipeline_versions'), versions.value)
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
  return s ? s.name : id
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
.pf-flow-actions { display: flex; gap: 8px; }
.pf-graph { display: flex; flex-direction: column; gap: 0; align-items: center; }
.pf-node { width: 100%; max-width: 480px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 16px; cursor: pointer; transition: border-color 0.15s, box-shadow 0.15s; }
.pf-node:hover { border-color: var(--accent-dim); }
.pf-node-active { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-dim); }
.pf-node-completed { border-color: var(--success); }
.pf-node-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.pf-node-num { width: 28px; height: 28px; border-radius: 50%; background: var(--bg-tertiary); display: flex; align-items: center; justify-content: center; font-size: var(--font-size-md); font-weight: bold; color: var(--text-primary); flex-shrink: 0; }
.pf-node-active .pf-node-num { background: var(--accent); color: var(--text-on-accent); }
.pf-node-completed .pf-node-num { background: var(--success); color: var(--text-on-accent); }
.pf-node-label { font-size: var(--font-size-lg); font-weight: 500; color: var(--text-primary); }
.pf-node-check { margin-left: auto; color: var(--success); font-size: var(--font-size-lg); }
.pf-node-body { display: flex; flex-direction: column; gap: 8px; padding-left: 38px; }
.pf-node-mode, .pf-node-agent, .pf-node-skills { display: flex; align-items: center; gap: 6px; }
.pf-node-tag { font-size: var(--font-size-xs); color: var(--text-muted); background: var(--bg-tertiary); padding: 1px 6px; border-radius: var(--radius-xs); flex-shrink: 0; }
.pf-node-value { font-size: var(--font-size-md); color: var(--text-primary); }
.pf-node-skill-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.pf-skill-chip { padding: 1px 8px; border-radius: var(--radius-lg); font-size: var(--font-size-xs); background: var(--accent-dim); color: var(--accent); border: 1px solid var(--accent-glow, transparent); }
.pf-node-empty { font-size: var(--font-size-sm); color: var(--text-muted); font-style: italic; }
.pf-arrow { display: flex; justify-content: center; padding: 2px 0; color: var(--text-muted); }
.pf-dialog-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1200; }
.pf-dialog { background: var(--bg-glass); border: 1px solid var(--border-color); border-radius: var(--radius-lg); width: min(400px, 92vw); box-shadow: var(--shadow-lg); }
.pf-dialog-wide { width: min(500px, 92vw); }
.pf-dialog-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 20px; border-bottom: 1px solid var(--border-color); font-size: var(--font-size-lg); font-weight: 600; }
.pf-dialog-body { padding: 20px; }
.pf-dialog-body label { display: block; font-size: var(--font-size-md); color: var(--text-secondary); margin-bottom: 6px; }
.pf-dialog-footer { display: flex; justify-content: flex-end; gap: 10px; padding: 14px 20px; border-top: 1px solid var(--border-color); }
.pf-empty-hint { text-align: center; color: var(--text-muted); font-size: var(--font-size-md); padding: 20px; }
.pf-version-row { display: flex; align-items: center; justify-content: space-between; padding: 10px; border-bottom: 1px solid var(--border-color); }
.pf-version-row:last-child { border-bottom: none; }
.pf-version-info { display: flex; flex-direction: column; gap: 2px; }
.pf-version-name { font-size: var(--font-size-md); color: var(--text-primary); font-weight: 500; }
.pf-version-time { font-size: var(--font-size-xs); color: var(--text-muted); }
.pf-version-actions { display: flex; gap: 6px; }
</style>
