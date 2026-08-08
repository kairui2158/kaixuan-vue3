<template>
  <div class="skill-settings">
    <h3>技能管理</h3>
    <div class="skill-section">
      <h4>流水线技能 (按顺序执行)</h4>
      <div class="skill-pipeline-list">
        <div v-for="(id, i) in skillStore.pipelineSkills" :key="id" class="skill-pipeline-item">
          <span class="skill-idx">[{{ i + 1 }}]</span>
          <span class="skill-name">{{ getSkillName(id) }}</span>
          <button class="btn-sm btn-secondary" @click="skillStore.movePipelineSkillUp(i)" :disabled="i === 0">up</button>
          <button class="btn-sm btn-secondary" @click="skillStore.movePipelineSkillDown(i)" :disabled="i === skillStore.pipelineSkills.length - 1">down</button>
          <button class="btn-danger-sm" @click="removeFromPipeline(i)">x</button>
        </div>
      </div>
    </div>
    <div class="skill-section">
      <h4>所有技能</h4>
      <div class="skill-all-list">
        <div v-for="s in skillStore.skills" :key="s.id" class="skill-card">
          <span class="skill-name">{{ s.name }}</span>
          <span class="skill-cat">{{ s.category }}</span>
          <button class="btn-sm btn-secondary" @click="editSkill(s.id)">编辑</button>
          <button class="btn-sm btn-secondary" @click="addToPipeline(s.id)">加入流水线</button>
          <button class="btn-danger-sm" @click="skillStore.removeSkill(s.id)">删除</button>
        </div>
      </div>
    </div>
    <button class="btn-add" @click="addSkill">+ 新建技能</button>
  </div>
</template>

<script setup lang="ts">
import { useSkillStore } from '../../stores/skill'

const skillStore = useSkillStore()

function getSkillName(id: string) {
  return skillStore.skills.find(s => s.id === id)?.name || id
}

function addToPipeline(id: string) {
  if (!skillStore.pipelineSkills.includes(id)) {
    skillStore.pipelineSkills.push(id)
    skillStore.saveSkills()
  }
}

function removeFromPipeline(index: number) {
  skillStore.pipelineSkills.splice(index, 1)
  skillStore.saveSkills()
}

function addSkill() {
  skillStore.addSkill({
    id: 'skill-' + Date.now(),
    name: '新技能',
    template: '',
    category: 'general',
    executionMode: 'chain',
    outputFormat: 'text',
    validationRules: [],
    splitSize: 1000
  })
}

function editSkill(id: string) {
  // will open skill editor modal
}
</script>

<style scoped>
.skill-settings h3 { font-size: 16px; margin-bottom: 16px; }
.skill-section { margin-bottom: 20px; }
.skill-section h4 { font-size: 13px; color: var(--text-secondary); margin-bottom: 8px; }
.skill-pipeline-list, .skill-all-list { display: flex; flex-direction: column; gap: 6px; }
.skill-pipeline-item, .skill-card {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 12px;
}
.skill-idx { color: var(--accent); font-weight: 600; min-width: 24px; }
.skill-name { flex: 1; color: var(--text-primary); }
.skill-cat { color: var(--text-muted); font-size: 11px; }
.btn-sm { font-size: 10px; padding: 2px 6px; border-radius: 4px; height: 22px; cursor: pointer; }
.btn-secondary { background: transparent; color: var(--text-secondary); border: 1px solid var(--border-color); }
.btn-secondary:hover { background: var(--bg-hover); color: var(--text-primary); }
.btn-secondary:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-danger-sm { background: var(--danger); color: #fff; border: none; border-radius: 4px; padding: 2px 6px; font-size: 10px; cursor: pointer; }
.btn-add { background: var(--accent-gradient); color: var(--text-on-accent); border: none; border-radius: 6px; padding: 8px 16px; cursor: pointer; font-size: 13px; }
</style>
