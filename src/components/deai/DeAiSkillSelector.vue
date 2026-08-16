<template>
  <div class="skill-selector">
    <div class="ss-header">去AI味技能链</div>
    <div class="ss-list">
      <div v-for="(id, i) in deAiStore.skillIds" :key="id" class="ss-item">
        <span class="ss-idx">[{{ i + 1 }}]</span>
        <span class="ss-name">{{ getSkillName(id) }}</span>
        <div class="ss-actions">
          <button class="ss-btn" @click="moveUp(i)" :disabled="i === 0" title="上移">up</button>
          <button class="ss-btn" @click="moveDown(i)" :disabled="i === deAiStore.skillIds.length - 1" title="下移">down</button>
          <button class="ss-btn ss-remove" @click="remove(i)" title="移除">x</button>
        </div>
      </div>
      <div v-if="deAiStore.skillIds.length === 0" class="ss-empty">暂未配置技能</div>
    </div>
    <select v-model="newSkillId" class="ss-select" @change="add">
      <option value="">+ 添加技能</option>
      <option v-for="s in skillStore.skills" :key="s.id" :value="s.id">{{ s.name }}</option>
    </select>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useDeAiStore } from '../../stores/deai'
import { useSkillStore } from '../../stores/skill'

const deAiStore = useDeAiStore()
const skillStore = useSkillStore()
const newSkillId = ref('')

function getSkillName(id: string) {
  return skillStore.skills.find(s => s.id === id)?.name || id
}

function add() {
  if (newSkillId.value && !deAiStore.skillIds.includes(newSkillId.value)) {
    deAiStore.skillIds.push(newSkillId.value)
    deAiStore.saveConfig()
  }
  newSkillId.value = ''
}

function remove(index: number) {
  deAiStore.skillIds.splice(index, 1)
  deAiStore.saveConfig()
}

function moveUp(index: number) {
  if (index > 0) {
    const arr = deAiStore.skillIds
    ;[arr[index - 1], arr[index]] = [arr[index], arr[index - 1]]
    deAiStore.saveConfig()
  }
}

function moveDown(index: number) {
  if (index < deAiStore.skillIds.length - 1) {
    const arr = deAiStore.skillIds
    ;[arr[index], arr[index + 1]] = [arr[index + 1], arr[index]]
    deAiStore.saveConfig()
  }
}
</script>

<style scoped>
.skill-selector {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.ss-header {
  font-size: var(--font-size-md);
  font-weight: 600;
  color: var(--text-secondary);
}
.ss-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.ss-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
}
.ss-idx {
  color: var(--accent);
  font-weight: 600;
  min-width: 28px;
}
.ss-name {
  flex: 1;
  color: var(--text-primary);
}
.ss-actions {
  display: flex;
  gap: var(--space-1);
}
.ss-btn {
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  border-radius: var(--radius-xs);
  padding: 1px var(--space-2);
  font-size: var(--font-size-xxs);
  cursor: pointer;
}
.ss-btn:hover {
  background: var(--bg-hover);
}
.ss-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.ss-remove:hover {
  background: var(--danger);
  color: var(--text-on-accent);
}
.ss-empty {
  padding: var(--space-4);
  text-align: center;
  color: var(--text-muted);
  font-size: var(--font-size-sm);
}
.ss-select {
  background: var(--bg-input);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xs);
  padding: var(--space-2) var(--space-4);
  font-size: var(--font-size-sm);
  height: 28px;
  outline: none;
}
</style>
