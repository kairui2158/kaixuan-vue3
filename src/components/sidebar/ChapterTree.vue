<template>
  <aside id="chapter-tree" class="chapter-tree">
    <div id="current-project-name" class="tree-header">
      <span class="project-name">{{ projectStore.projectName || '未打开项目' }}</span>
      <div class="tree-header-actions">
        <button id="btn-tree-gen" class="btn-sm btn-secondary" title="生成流水线" @click="$emit('navigate', 'pipeline')">生成</button>
        <button id="btn-open-project" class="btn-sm btn-secondary" title="项目管理" @click="projectModalVisible=true">项目</button>
      </div>
    </div>
    <div id="tree-body" class="tree-body" @click="closeCtxMenu">
      <div v-if="volumes.length === 0" class="empty-hint">
        请先通过大纲工作台导入小说项目
      </div>
      <div v-else class="tree-list" ref="treeList">
        <template v-for="(vol, vi) in volumes" :key="vol.id || vol.name">
          <div class="volume-group">
            <div class="volume-item"
              draggable="true"
              @dragstart="onVolDragStart($event, vol)"
              @dragover.prevent="onVolDragOver($event, vol)"
              @drop="onVolDrop($event, vol)"
              @click="toggleVolume(vol)"
              @dblclick="startRenameVol(vol)"
              @contextmenu.prevent="showCtxMenu($event, 'volume', vol)"
              :class="{ 'drag-over': dragOverVolId === (vol.id || vol.name) }"
            >
              <span class="vol-arrow" :class="{ expanded: expandedVolumes.has(vol.id || vol.name) }">&gt;</span>
              <input v-if="renamingVolId === (vol.id || vol.name)" ref="volRenameInput"
                v-model="renameValue" @blur="commitRenameVol(vol)" @keydown.enter="commitRenameVol(vol)" @keydown.esc="cancelRename"
                class="rename-input" />
              <span v-else class="vol-name">{{ vol.name }}</span>
              <span class="vol-count">{{ getVolChapters(vol).length }}章</span>
            </div>
            <div v-if="expandedVolumes.has(vol.id || vol.name)" class="chapter-list">
              <div v-for="(ch, ci) in getVolChapters(vol)" :key="ch.id"
                class="chapter-item"
                :class="{ active: ch.id === activeChapterId, 'drag-over': dragOverChId === ch.id }"
                draggable="true"
                @dragstart="onChDragStart($event, ch)"
                @dragover.prevent="onChDragOver($event, ch)"
                @drop="onChDrop($event, ch)"
                @click="selectChapter(ch)"
                @dblclick="startRenameCh(ch)"
                @contextmenu.prevent="showCtxMenu($event, 'chapter', ch)"
              >
                <input v-if="renamingChId === ch.id" ref="chRenameInput"
                  v-model="renameValue" @blur="commitRenameCh(ch)" @keydown.enter="commitRenameCh(ch)" @keydown.esc="cancelRename"
                  class="rename-input" />
                <span v-else>{{ ch.title }}</span>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
    <div v-if="ctxMenu.visible" class="ctx-menu" :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }" @click.stop>
      <template v-if="ctxMenu.type === 'volume'">
        <button class="ctx-item" @click="ctxAction('view-outline')">查看卷纲</button>
        <button class="ctx-item" @click="ctxAction('edit-vol')">编辑卷</button>
        <button class="ctx-item" @click="ctxAction('bind-skill')">绑定技能</button>
        <button class="ctx-item danger" @click="ctxAction('del-vol')">删除卷</button>
      </template>
      <template v-else>
        <button class="ctx-item" @click="ctxAction('view-plot')">查看章节剧情</button>
        <button class="ctx-item" @click="ctxAction('view-body')">查看正文</button>
        <button class="ctx-item" @click="ctxAction('rename')">重命名</button>
        <button class="ctx-item" @click="ctxAction('bind-skill')">绑定技能</button>
        <button class="ctx-item danger" @click="ctxAction('del-ch')">删除章节</button>
      </template>
    </div>
    <ProjectModal :visible="projectModalVisible" @close="projectModalVisible=false" />
  </aside>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { useProjectStore } from '../../stores/project'
import { useEditorStore } from '../../stores/editor'
import ProjectModal from '../common/ProjectModal.vue'

const projectStore = useProjectStore()
const editorStore = useEditorStore()
const emit = defineEmits<{ navigate: [string] }>()

const projectModalVisible = ref(false)
const expandedVolumes = ref(new Set<string>())
const activeChapterId = ref<string | null>(null)
const treeList = ref<HTMLElement | null>(null)
const dragVolId = ref<string | null>(null)
const dragChId = ref<string | null>(null)
const dragOverVolId = ref<string | null>(null)
const dragOverChId = ref<string | null>(null)
const renamingVolId = ref<string | null>(null)
const renamingChId = ref<string | null>(null)
const renameValue = ref('')
const volRenameInput = ref<HTMLInputElement | null>(null)
const chRenameInput = ref<HTMLInputElement | null>(null)
const ctxMenu = ref({ visible: false, x: 0, y: 0, type: '', vol: null as any, ch: null as any })

const volumes = computed(() => {
  const vols = projectStore.volumes || []
  if (vols.length > 0 && expandedVolumes.value.size === 0) {
    expandedVolumes.value.add(vols[0].id || vols[0].name)
  }
  return vols
})

function getVolChapters(vol: any) {
  const volId = vol.id || vol.name
  return projectStore.chapters[volId] || []
}

function toggleVolume(vol: any) {
  const id = vol.id || vol.name
  if (expandedVolumes.value.has(id)) expandedVolumes.value.delete(id)
  else expandedVolumes.value.add(id)
}

function selectChapter(ch: any) {
  activeChapterId.value = ch.id
  editorStore.openTab({
    id: 'tab-' + ch.id, title: ch.title, content: ch.body || '',
    chapterId: ch.id, isDirty: false, mode: 'ch-body'
  })
}

function openVolumeOutline(vol: any) {
  editorStore.openTab({
    id: 'vol-outline-' + (vol.id || vol.name),
    title: vol.name + ' - 卷纲',
    content: vol.outline || '', chapterId: '', isDirty: false, mode: 'vol-outline'
  })
}

function openChapterPlot(ch: any) {
  editorStore.openTab({
    id: 'ch-plot-' + ch.id, title: ch.title + ' - 剧情',
    content: ch.plot || '', chapterId: ch.id, isDirty: false, mode: 'ch-plot'
  })
}

function onVolDragStart(e: DragEvent, vol: any) {
  dragVolId.value = vol.id || vol.name
  e.dataTransfer?.setData('text/plain', 'vol:' + dragVolId.value)
}
function onVolDragOver(e: DragEvent, vol: any) {
  dragOverVolId.value = vol.id || vol.name
}
function onVolDrop(e: DragEvent, targetVol: any) {
  const srcId = dragVolId.value
  const tgtId = targetVol.id || targetVol.name
  if (!srcId || srcId === tgtId) return
  const vols = volumes.value
  const fromIdx = vols.findIndex((v: any) => (v.id || v.name) === srcId)
  const toIdx = vols.findIndex((v: any) => (v.id || v.name) === tgtId)
  if (fromIdx < 0 || toIdx < 0) return
  const [moved] = vols.splice(fromIdx, 1)
  vols.splice(toIdx, 0, moved)
  projectStore.saveProject()
  dragVolId.value = null
  dragOverVolId.value = null
}

function onChDragStart(e: DragEvent, ch: any) {
  dragChId.value = ch.id
  e.dataTransfer?.setData('text/plain', 'ch:' + ch.id)
}
function onChDragOver(e: DragEvent, ch: any) {
  dragOverChId.value = ch.id
}
function onChDrop(e: DragEvent, targetCh: any) {
  const srcId = dragChId.value
  const tgtId = targetCh.id
  if (!srcId || srcId === tgtId) return
  for (const volId of Object.keys(projectStore.chapters)) {
    const chs = projectStore.chapters[volId]
    const fromIdx = chs.findIndex((c: any) => c.id === srcId)
    const toIdx = chs.findIndex((c: any) => c.id === tgtId)
    if (fromIdx >= 0 && toIdx >= 0) {
      const [moved] = chs.splice(fromIdx, 1)
      chs.splice(toIdx, 0, moved)
      projectStore.saveProject()
      break
    }
  }
  dragChId.value = null
  dragOverChId.value = null
}

function startRenameVol(vol: any) {
  renamingVolId.value = vol.id || vol.name
  renameValue.value = vol.name
  nextTick(() => {
    const el = document.querySelector('.rename-input') as HTMLInputElement | null
    el?.focus()
  })
}
function commitRenameVol(vol: any) {
  if (renameValue.value.trim()) { vol.name = renameValue.value.trim(); projectStore.saveProject() }
  renamingVolId.value = null
}
function startRenameCh(ch: any) {
  renamingChId.value = ch.id
  renameValue.value = ch.title
  nextTick(() => {
    const el = document.querySelector('.rename-input') as HTMLInputElement | null
    el?.focus()
  })
}
function commitRenameCh(ch: any) {
  if (renameValue.value.trim()) { ch.title = renameValue.value.trim(); projectStore.saveProject() }
  renamingChId.value = null
}
function cancelRename() { renamingVolId.value = null; renamingChId.value = null }

function showCtxMenu(e: MouseEvent, type: string, item: any) {
  ctxMenu.value = { visible: true, x: e.clientX, y: e.clientY, type,
    vol: type === 'volume' ? item : null, ch: type === 'chapter' ? item : null }
}
function closeCtxMenu() { ctxMenu.value.visible = false }
function ctxAction(action: string) {
  const vol = ctxMenu.value.vol
  const ch = ctxMenu.value.ch
  ctxMenu.value.visible = false
  switch (action) {
    case 'view-outline': if (vol) openVolumeOutline(vol); break
    case 'view-plot': if (ch) openChapterPlot(ch); break
    case 'view-body': if (ch) selectChapter(ch); break
    case 'rename': if (ch) startRenameCh(ch); else if (vol) startRenameVol(vol); break
    case 'edit-vol':
      if (vol) {
        editorStore.openTab({
          id: 'vol-edit-' + (vol.id || vol.name),
          title: vol.name + ' - 编辑',
          content: vol.outline || '',
          chapterId: '', isDirty: false, mode: 'vol-outline'
        })
      }
      break
    case 'bind-skill':
      window.dispatchEvent(new CustomEvent('show-skill-binding', { detail: { type: ctxMenu.value.type, id: ch?.id || (vol?.id || vol?.name) } }))
      break
    case 'del-vol': if (vol && confirm('确认删除卷「' + vol.name + '」及其所有章节？')) deleteVolume(vol); break
    case 'del-ch': if (ch && confirm('确认删除章节「' + ch.title + '」？')) deleteChapter(ch); break
  }
}

function deleteChapter(ch: any) {
  for (const volId of Object.keys(projectStore.chapters)) {
    const chs = projectStore.chapters[volId]
    const idx = chs.findIndex((c: any) => c.id === ch.id)
    if (idx >= 0) {
      chs.splice(idx, 1)
      projectStore.saveProject()
      break
    }
  }
  for (const t of editorStore.tabs) {
    if (t.chapterId === ch.id) editorStore.closeTab(t.id)
  }
}

function deleteVolume(vol: any) {
  const volId = vol.id || vol.name
  const idx = volumes.value.findIndex((v: any) => (v.id || v.name) === volId)
  if (idx >= 0) {
    volumes.value.splice(idx, 1)
    delete projectStore.chapters[volId]
    projectStore.saveProject()
    for (const t of editorStore.tabs) {
      if (t.chapterId && t.chapterId.startsWith(volId)) editorStore.closeTab(t.id)
    }
  }
}
</script>

<style scoped>
.chapter-tree { width: 200px; min-width: 140px; max-width: 300px; background: var(--bg-secondary); border-right: 1px solid var(--border-color); display: flex; flex-direction: column; flex-shrink: 0; overflow: hidden; }
.tree-header { display: flex; align-items: center; gap: 4px; padding: 8px 10px; border-bottom: 1px solid var(--border-color); font-size: var(--font-size-sm); }
.project-name { flex: 1 1 auto; min-width: 0; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tree-header-actions { display: flex; gap: 4px; flex-shrink: 0; }
.tree-body { flex: 1; overflow-y: auto; padding: 4px 0; }
.empty-hint { padding: 24px 12px; text-align: center; color: var(--text-muted); font-size: var(--font-size-sm); line-height: 1.8; }
.tree-list { padding: 0 4px; }
.volume-group { margin-bottom: 2px; }
.volume-item { display: flex; align-items: center; gap: 4px; padding: var(--space-2) var(--space-4); cursor: pointer; border-radius: var(--radius-xs); font-size: var(--font-size-sm); color: var(--text-primary); }
.volume-item:hover { background: var(--bg-hover); }
.volume-item.drag-over { background: var(--accent); color: var(--text-on-accent); }
.vol-arrow { font-size: var(--font-size-xxs); color: var(--text-muted); transition: transform 0.2s; display: inline-block; }
.vol-arrow.expanded { transform: rotate(90deg); }
.vol-name { flex: 1; }
.vol-count { font-size: var(--font-size-xxs); color: var(--text-muted); }
.chapter-list { padding-left: 20px; }
.chapter-item { padding: 3px 8px; cursor: pointer; border-radius: var(--radius-xs); font-size: var(--font-size-xs); color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.chapter-item:hover { background: var(--bg-hover); color: var(--text-primary); }
.chapter-item.active { background: var(--accent-dim, rgba(99,102,241,0.15)); color: var(--accent); font-weight: 600; }
.chapter-item.drag-over { background: var(--accent); color: var(--text-on-accent); }
.rename-input { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--accent); border-radius: var(--radius-xs); padding: 1px 4px; font-size: var(--font-size-xs); width: 100%; outline: none; }
.ctx-menu { position: fixed; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 4px; z-index: 3000; box-shadow: var(--shadow-lg); min-width: 140px; }
.ctx-item { display: block; width: 100%; text-align: left; background: none; border: none; color: var(--text-primary); padding: 6px 12px; font-size: var(--font-size-sm); border-radius: var(--radius-xs); cursor: pointer; }
.ctx-item:hover { background: var(--bg-hover); }
.ctx-item.danger { color: var(--danger); }
.ctx-item.danger:hover { background: var(--danger); color: var(--text-on-accent); }
</style>
