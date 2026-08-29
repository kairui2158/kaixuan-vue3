<template>
  <div v-if="props.visible" id="skill-bind-modal" class="skill-bind-overlay" @click.self="closeModal">
    <div class="skill-bind-content">
      <div class="skill-bind-header">
        <h3 id="sbm-title">绑定 Skill</h3>
        <button class="sbm-close" @click="closeModal">&times;</button>
      </div>
      <div class="sbm-step-select">
        <label>绑定到流水线步骤：</label>
        <select v-model.number="selectedStep" class="sbm-step-selector">
          <option :value="1">Step 1 大纲</option>
          <option :value="2">Step 2 设定</option>
          <option :value="3">Step 3 卷纲</option>
          <option :value="4">Step 4 章节</option>
          <option :value="5">Step 5 正文</option>
        </select>
      </div>
      <div id="sbm-skill-list" class="sbm-skill-list">
        <div v-if="skillStore.skills.length === 0" class="empty-hint">暂无可用技能，请先在设置中添加</div>
        <label v-for="s in skillStore.skills" :key="s.id" class="sbm-skill-item">
          <input type="checkbox" :value="s.id" v-model="selectedIds" />
          <span>{{ s.name }}</span>
          <span class="sbm-skill-cat">({{ s.category || '未分类' }})</span>
        </label>
      </div>
      <div class="sbm-actions">
        <button id="btn-save-skill-binding" class="btn-primary" @click="saveBinding">保存</button>
        <button class="btn-secondary sbm-close" @click="closeModal">取消</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useSkillStore } from '../../stores/skill'
import { useProjectStore } from '../../stores/project'
import { usePipelineStore } from '../../stores/pipeline'

const props = defineProps<{ visible: boolean; type: string; id: string }>()
const emit = defineEmits<{ close: [] }>()

const skillStore = useSkillStore()
const projectStore = useProjectStore()
const pipelineStore = usePipelineStore()
const selectedIds = ref<string[]>([])
const selectedStep = ref<number>(1)

watch(() => props.visible, (v) => {
  if (v) loadCurrentBinding()
})

function loadCurrentBinding() {
  const node = findNode()
  selectedIds.value = [...(node?.skillIds || [])]
  selectedStep.value = 1
}

function findNode(): any | null {
  if (props.type === 'volume') {
    return projectStore.volumes.find((v: any) => (v.id || v.name) === props.id) || null
  }
  for (const volId of Object.keys(projectStore.chapters)) {
    const ch = projectStore.chapters[volId].find((c: any) => c.id === props.id)
    if (ch) return ch
  }
  return null
}

function saveBinding() {
  // 写入真实消费方: 将绑定技能注入对应流水线步骤的 stepSkills 槽位
  const step = selectedStep.value
  if (step >= 1 && step <= 5) {
    pipelineStore.setStepSkills(step, selectedIds.value)
  }
  // 同时写入 pipelineSkills 全局消费方 (ChatPanel 消费)
  if (skillStore && selectedIds.value.length > 0) {
    const current = skillStore.pipelineSkills
    const merged = [...current]
    selectedIds.value.forEach((id: string) => {
      if (!merged.includes(id)) merged.push(id)
    })
    skillStore.pipelineSkills = [...merged]
    skillStore.saveSkills()
  }
  // 兼容旧字段: 保持向后兼容
  if (props.type === 'volume') {
    const idx = projectStore.volumes.findIndex((v: any) => (v.id || v.name) === props.id)
    if (idx >= 0) projectStore.updateVolume(idx, { skillIds: [...selectedIds.value] })
  } else {
    for (const volId of Object.keys(projectStore.chapters)) {
      const arr = projectStore.chapters[volId]
      const idx = arr.findIndex((c: any) => c.id === props.id)
      if (idx >= 0) {
        const next = [...arr]
        next[idx] = { ...next[idx], skillIds: [...selectedIds.value] }
        projectStore.setChapters(volId, next)
        break
      }
    }
  }
  emit('close')
}

function closeModal() {
  emit('close')
}
</script>

<style scoped>
.skill-bind-overlay {
  position: fixed;
  inset: 0;
  z-index: 2200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-overlay);
}
.skill-bind-content {
  width: min(520px, 90vw);
  max-height: 75vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-glass, var(--bg-secondary));
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: 16px;
}
.skill-bind-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-color);
}
.skill-bind-header h3 {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: 600;
}
.sbm-close {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: var(--font-size-xl);
  line-height: 1;
  cursor: pointer;
  padding: 2px 6px;
}
.sbm-close:hover {
  color: var(--text-primary);
}
.sbm-step-select {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  font-size: var(--font-size-md);
  color: var(--text-primary);
  border-bottom: 1px solid var(--border-color);
}
.sbm-step-selector {
  flex: 1;
  padding: var(--space-2) var(--space-4);
  background: var(--bg-input);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xs);
  font-size: var(--font-size-sm);
}
.sbm-skill-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 300px;
  overflow-y: auto;
  padding: 12px 0;
}
.sbm-skill-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-size-md);
  color: var(--text-primary);
  cursor: pointer;
}
.sbm-skill-item input[type=checkbox] {
  margin: 0;
  cursor: pointer;
}
.sbm-skill-cat {
  color: var(--text-muted);
  font-size: var(--font-size-xs);
}
.empty-hint {
  padding: 20px 0;
  text-align: center;
  color: var(--text-secondary);
  font-size: var(--font-size-md);
}
.sbm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--border-color);
}
</style>
