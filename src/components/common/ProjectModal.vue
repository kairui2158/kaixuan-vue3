<template>
  <div class="modal-overlay" :class="{ 'modal-hidden': !visible }" @click.self="$emit('close')">
    <div class="modal-content project-modal-content">
      <div class="modal-header">
        <h3>项目管理</h3>
        <button class="btn-close" @click="$emit('close')">&times;</button>
      </div>
      <div class="modal-body">
        <div class="project-list" v-if="projectList.length > 0">
          <div class="project-item" v-for="proj in projectList" :key="proj.id"
            :class="{ active: proj.id === projectStore.currentProjectId }">
            <span class="project-item-name">{{ proj.name }}</span>
            <div class="project-item-actions">
              <button class="btn-sm btn-primary" @click="loadProject(proj.id)">加载</button>
              <button class="btn-sm btn-danger" @click="deleteProject(proj.id)">删除</button>
            </div>
          </div>
        </div>
        <div v-else class="empty-hint">暂无项目</div>

        <div class="new-project-section">
          <button class="btn-primary new-project-btn" @click="showNewForm = !showNewForm">
            {{ showNewForm ? '取消' : '+ 新建项目' }}
          </button>
          <div v-if="showNewForm" class="new-project-form">
            <input v-model="newName" placeholder="项目名称（可选）" class="form-input" />
            <textarea v-model="newOutline" placeholder="大纲内容（可选）" class="form-textarea" rows="6"></textarea>
            <div class="form-actions">
              <button class="btn-primary" @click="createNewProject">创建</button>
              <button class="btn-secondary" @click="showNewForm = false">取消</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useProjectStore } from '../../stores/project'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ close: [] }>()

const projectStore = useProjectStore()

const showNewForm = ref(false)
const newName = ref('')
const newOutline = ref('')

const projectList = computed(() => projectStore.projectList || [])

onMounted(() => {
  projectStore.loadProjectList()
})

function loadProject(id: string) {
  const currentId = projectStore.currentProjectId
  if (currentId && projectStore.projectName) {
    const ok = confirm('切换项目前是否保存当前项目？')
    if (ok) projectStore.saveProject()
  }
  projectStore.selectProject(id)
  emit('close')
}

function deleteProject(id: string) {
  if (!confirm('确定删除该项目？此操作不可恢复')) return
  projectStore.deleteProject(id)
}

function createNewProject() {
  const currentId = projectStore.currentProjectId
  if (currentId && projectStore.projectName) {
    const ok = confirm('新建前是否保存当前项目？')
    if (ok) projectStore.saveProject()
  }
  const name = newName.value.trim()
  const outline = newOutline.value.trim()
  if (!name && !outline) {
    alert('请输入项目名称或大纲内容')
    return
  }
  projectStore.createProject(name, outline)
  showNewForm.value = false
  newName.value = ''
  newOutline.value = ''
  emit('close')
}
</script>

<style scoped>
.modal-content.project-modal-content { position: relative; background: var(--bg-primary, #1e1e2e); border: 1px solid var(--border-color, #2d2d3f); border-radius: 8px; width: 560px; max-width: 92vw; max-height: 82vh; display: flex; flex-direction: column; z-index: 1001; }
.project-list { margin-bottom: 12px; }
.project-item { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-radius: 6px; margin-bottom: 4px; background: var(--bg-secondary, #2d2d3f); }
.project-item.active { border: 1px solid var(--accent, #6c5ce7); }
.project-item-name { flex: 1; font-size: 13px; color: var(--text-primary, #eee); }
.project-item-actions { display: flex; gap: 6px; }
.empty-hint { text-align: center; color: var(--text-muted, #888); font-size: 13px; padding: 24px 0; }
.new-project-section { border-top: 1px solid var(--border-color, #2d2d3f); padding-top: 12px; }
.new-project-btn { width: 100%; padding: 8px; font-size: 13px; border-radius: 6px; border: none; cursor: pointer; }
.new-project-form { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
.form-input { background: var(--bg-input, #1a1a2e); color: var(--text-primary, #eee); border: 1px solid var(--border-color, #3d3d4f); border-radius: 4px; padding: 8px 10px; font-size: 13px; outline: none; }
.form-textarea { background: var(--bg-input, #1a1a2e); color: var(--text-primary, #eee); border: 1px solid var(--border-color, #3d3d4f); border-radius: 4px; padding: 8px 10px; font-size: 13px; outline: none; resize: vertical; font-family: inherit; }
.form-actions { display: flex; gap: 8px; justify-content: flex-end; }
</style>
