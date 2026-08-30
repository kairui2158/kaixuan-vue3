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

        <div v-if="transitionConfirmVisible" class="project-transition-confirm" role="dialog" aria-modal="true">
          <div class="project-transition-confirm__title">{{ transitionConfirmTitle }}</div>
          <div class="project-transition-confirm__text">当前项目还有内容，继续前请选择如何处理当前项目。</div>
          <div class="project-transition-confirm__actions">
            <button class="btn-primary" @click="continueTransition('save')">保存并继续</button>
            <button class="btn-danger" @click="continueTransition('delete')">删除并继续</button>
            <button class="btn-secondary" @click="cancelTransition">取消</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useProjectStore } from '../../stores/project'
import { useAppConfirm } from '../../composables/useAppConfirm'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ close: [] }>()

const projectStore = useProjectStore()
const appConfirm = useAppConfirm()

const showNewForm = ref(false)
const newName = ref('')
const newOutline = ref('')
const transitionConfirmVisible = ref(false)
const transitionConfirmTitle = ref('')
const pendingTransition = ref<{ type: 'load' | 'create'; id?: string } | null>(null)

const projectList = computed(() => projectStore.projectList || [])

onMounted(async () => {
  await projectStore.loadProjectList()
})

function loadProject(id: string) {
  const currentId = projectStore.currentProjectId
  if (currentId && projectStore.projectName) {
    transitionConfirmTitle.value = '切换项目'
    pendingTransition.value = { type: 'load', id }
    transitionConfirmVisible.value = true
    return
  }
  finishLoad(id)
}

async function deleteProject(id: string) {
  const ok = await appConfirm.confirm({
    title: '删除项目',
    message: '确定删除该项目？此操作不可恢复。',
    confirmText: '删除',
    danger: true,
  })
  if (!ok) return
  await projectStore.deleteProject(id)
}

function createNewProject() {
  const currentId = projectStore.currentProjectId
  if (currentId && projectStore.projectName) {
    transitionConfirmTitle.value = '新建项目'
    pendingTransition.value = { type: 'create' }
    transitionConfirmVisible.value = true
    return
  }
  finishCreate()
}

async function continueTransition(action: 'save' | 'delete') {
  const pending = pendingTransition.value
  if (!pending) return
  const currentId = projectStore.currentProjectId
  if (action === 'save') await projectStore.saveProject()
  if (action === 'delete' && currentId) await projectStore.deleteProject(currentId)
  transitionConfirmVisible.value = false
  pendingTransition.value = null
  if (pending.type === 'load' && pending.id) finishLoad(pending.id)
  else finishCreate()
}

function cancelTransition() {
  transitionConfirmVisible.value = false
  pendingTransition.value = null
}

function finishLoad(id: string) {
  projectStore.selectProject(id)
  emit('close')
}

function finishCreate() {
  const name = newName.value.trim()
  const outline = newOutline.value.trim()
  if (!name && !outline) {
    void appConfirm.alert({ title: '新建项目', message: '请输入项目名称或大纲内容' })
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
.modal-content.project-modal-content { position: relative; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-md); width: min(560px, 100%); max-width: 100%; max-height: var(--modal-max-height); min-height: 0; display: flex; flex-direction: column; z-index: var(--z-modal-content); }
.project-list { margin-bottom: 12px; }
.project-item { display: flex; align-items: center; justify-content: space-between; padding: var(--space-4) var(--space-6); border-radius: var(--radius-sm); margin-bottom: 4px; background: var(--bg-secondary); }
.project-item.active { border: 1px solid var(--accent); }
.project-item-name { flex: 1; font-size: var(--font-size-md); color: var(--text-primary); }
.project-item-actions { display: flex; gap: 6px; }
.empty-hint { text-align: center; color: var(--text-muted); font-size: var(--font-size-md); padding: 24px 0; }
.new-project-section { border-top: 1px solid var(--border-color); padding-top: 12px; }
.new-project-btn { width: 100%; padding: 8px; font-size: var(--font-size-md); border-radius: var(--radius-sm); border: none; cursor: pointer; }
.new-project-form { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
.form-input { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--radius-xs); padding: 8px 10px; font-size: var(--font-size-md); outline: none; }
.form-textarea { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--radius-xs); padding: 8px 10px; font-size: var(--font-size-md); outline: none; resize: vertical; font-family: inherit; }
.form-actions { display: flex; gap: 8px; justify-content: flex-end; }
.project-transition-confirm { margin-top: 12px; padding: 14px; border: 1px solid var(--accent); border-radius: var(--radius-sm); background: var(--bg-tertiary); position: relative; z-index: 1; }
.project-transition-confirm__title { color: var(--text-primary); font-size: var(--font-size-md); font-weight: 600; }
.project-transition-confirm__text { margin-top: 6px; color: var(--text-secondary); font-size: var(--font-size-sm); line-height: 1.5; }
.project-transition-confirm__actions { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; margin-top: 12px; }
</style>

