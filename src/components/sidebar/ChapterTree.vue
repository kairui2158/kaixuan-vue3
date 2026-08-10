<template>
  <aside id="chapter-tree" class="chapter-tree">
    <div id="current-project-name" class="tree-header">
      <span class="project-name">{{ projectStore.projectName || '未打开项目' }}</span>
      <button class="btn-sm btn-secondary" @click="$emit('navigate', 'pipeline')">生成</button>
      <button class="btn-sm btn-secondary" @click="openProjectList">项目</button>
      <button class="btn-sm btn-secondary" title="生成章节树" @click="treeGen">树生成</button>
      <button class="btn-sm btn-secondary" title="添加卷" @click="showVolumeForm()">+卷</button>
    </div>
    <div id="tree-body" class="tree-body" @click="closeCtxMenu">
      <div v-if="volumes.length === 0" class="empty-hint">
        点击右上角项目按钮创建或打开你的小说项目
      </div>
      <div v-else class="tree-list" ref="treeList">
        <RecycleScroller
          v-if="flatItems.length > 50"
          :items="flatItems"
          :item-size="28"
          key-field="key"
          v-slot="{ item }"
          class="virtual-tree"
        >
          <div v-if="item.type === 'volume'" class="volume-item"
            draggable="true"
            @dragstart="onVolDragStart($event, item.vol)"
            @dragover.prevent="onVolDragOver($event, item.vol)"
            @drop="onVolDrop($event, item.vol)"
            @click="toggleVolume(item.vol)"
            @dblclick="startRenameVol(item.vol)"
            @contextmenu.prevent="showCtxMenu($event, 'volume', item.vol)"
          >
            <span class="vol-arrow" :class="{ expanded: expandedVolumes.has(item.vol.id || item.vol.name) }">&gt;</span>
            <input v-if="renamingVolId === (item.vol.id || item.vol.name)" ref="volRenameInput"
              v-model="renameValue" @blur="commitRenameVol(item.vol)" @keydown.enter="commitRenameVol(item.vol)" @keydown.esc="cancelRename"
              class="rename-input" />
            <span v-else class="vol-name">{{ item.vol.name }}</span>
            <span class="vol-count">{{ getVolChapters(item.vol).length }}章</span>
          </div>
          <div v-else class="chapter-item" :class="{ active: item.ch.id === activeChapterId, 'drag-over': dragOverChId === item.ch.id }"
            draggable="true"
            @dragstart="onChDragStart($event, item.ch)"
            @dragover.prevent="onChDragOver($event, item.ch)"
            @drop="onChDrop($event, item.ch)"
            @click="selectChapter(item.ch)"
            @dblclick="startRenameCh(item.ch)"
            @contextmenu.prevent="showCtxMenu($event, 'chapter', item.ch)"
          >
            <input v-if="renamingChId === item.ch.id" ref="chRenameInput"
              v-model="renameValue" @blur="commitRenameCh(item.ch)" @keydown.enter="commitRenameCh(item.ch)" @keydown.esc="cancelRename"
              class="rename-input" />
            <span v-else>{{ item.ch.title }}</span>
          </div>
        </RecycleScroller>
        <template v-else>
          <div v-for="(vol, vi) in volumes" :key="vol.id || vol.name" class="volume-group">
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
              <div
                v-for="(ch, ci) in getVolChapters(vol)"
                :key="ch.id"
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
              <button class="btn-add-ch" @click="addChapter(vol)">+ 添加章节</button>
            </div>
          </div>
        </template>
      </div>
    </div>
    <div v-if="showVolModal" class="project-modal-overlay" @click.self="showVolModal = false">
      <div class="modal-content">
        <div class="modal-header"><h3>{{ editingVolIdx >= 0 ? '编辑卷' : '新建卷' }}</h3><button class="btn-close" @click="showVolModal = false">&times;</button></div>
        <div class="modal-body vol-modal-body">
          <input v-model="volFormName" placeholder="卷名" class="modal-input" />
          <input v-model="volFormOutline" placeholder="卷纲概要(可选)" class="modal-input" />
          <input type="number" v-model.number="volFormWords" placeholder="建议字数" class="modal-input" min="10000" step="10000" />
        </div>
        <div class="modal-footer"><div class="footer-right"><button class="btn-primary" @click="saveVolume">保存</button></div></div>
      </div>
    </div>
    <div v-if="showProjectModal" class="project-modal-overlay" @click.self="showProjectModal = false">
      <div class="modal-content">
        <div class="modal-header"><h3>新建项目</h3><button class="btn-close" @click="showProjectModal = false">&times;</button></div>
        <div class="modal-body vol-modal-body">
          <button class="btn-secondary" @click="showProjectModal = false; showProjectList = true">查看已有项目</button>
          <input v-model="newProjectName" placeholder="书名" class="modal-input" />
          <textarea v-model="newOutlineText" placeholder="输入大纲..." class="pm-textarea"></textarea>
        </div>
        <div class="modal-footer"><div class="footer-right"><button class="btn-primary" @click="createNewProject">创建</button></div></div>
      </div>
    </div>
    <div v-if="showProjectList" class="project-modal-overlay" @click.self="showProjectList = false">
      <div class="modal-content">
        <div class="modal-header"><h3>项目列表</h3><button class="btn-close" @click="showProjectList = false">&times;</button></div>
        <div class="modal-body vol-modal-body">
          <div v-if="projectStore.projectList.length === 0" class="pm-empty">暂无项目</div>
          <div v-for="p in projectStore.projectList" :key="p.id" class="pm-project-item" @click="selectProject(p.id)">
            <span class="pm-project-name">{{ p.name }}</span>
            <button class="pm-del-btn" @click.stop="deleteProject(p.id)">删除</button>
          </div>
        </div>
        <div class="modal-footer"><div class="footer-right"><button class="btn-secondary" @click="showProjectList = false; showProjectModal = true">+ 新建项目</button></div></div>
      </div>
    </div>
    <div v-if="ctxMenu.visible" class="ctx-menu" :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }" @click.stop>
      <template v-if="ctxMenu.type === 'volume'">
        <button class="ctx-item" @click="ctxAction('gen-chapters')">AI生成章节</button>
        <button class="ctx-item" @click="ctxAction('view-outline')">查看卷纲</button>
        <button class="ctx-item" @click="ctxAction('edit-vol')">编辑卷</button>
        <button class="ctx-item" @click="ctxAction('bind-skill')">绑定技能</button>
        <button class="ctx-item danger" @click="ctxAction('del-vol')">删除卷</button>
      </template>
      <template v-else>
        <button class="ctx-item" @click="ctxAction('gen-body')">AI生成正文</button>
        <button class="ctx-item" @click="ctxAction('view-plot')">查看章节剧情</button>
        <button class="ctx-item" @click="ctxAction('view-body')">查看正文</button>
        <button class="ctx-item" @click="ctxAction('rename')">重命名</button>
        <button class="ctx-item" @click="ctxAction('bind-skill')">绑定技能</button>
        <button class="ctx-item danger" @click="ctxAction('del-ch')">删除章节</button>
      </template>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { RecycleScroller } from 'vue-virtual-scroller'
import { useProjectStore } from '../../stores/project'
import { useEditorStore } from '../../stores/editor'

const projectStore = useProjectStore()
const editorStore = useEditorStore()

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
const showVolModal = ref(false)
const editingVolIdx = ref(-1)
const volFormName = ref('')
const volFormOutline = ref('')
const volFormWords = ref(500000)
const showProjectModal = ref(false)
const newProjectName = ref('')
const newOutlineText = ref('')
const showProjectList = ref(false)

const volumes = computed(() => projectStore.volumes || [])

const flatItems = computed(() => {
  const items: any[] = []
  for (const vol of volumes.value) {
    items.push({ type: 'volume', vol, key: 'vol-' + (vol.id || vol.name) })
    if (expandedVolumes.value.has(vol.id || vol.name)) {
      const chs = getVolChapters(vol)
      for (const ch of chs) {
        items.push({ type: 'chapter', ch, key: 'ch-' + ch.id })
      }
    }
  }
  return items
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
    chapterId: ch.id, isDirty: false
  })
}

function openVolumeOutline(vol: any) {
  editorStore.openTab({
    id: 'vol-outline-' + (vol.id || vol.name),
    title: vol.name + ' - 卷纲',
    content: vol.outline || '', chapterId: '', isDirty: false
  })
}

function openChapterPlot(ch: any) {
  editorStore.openTab({
    id: 'ch-plot-' + ch.id, title: ch.title + ' - 剧情',
    content: ch.plot || '', chapterId: ch.id, isDirty: false
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
  nextTick(() => volRenameInput.value?.focus())
}
function commitRenameVol(vol: any) {
  if (renameValue.value.trim()) { vol.name = renameValue.value.trim(); projectStore.saveProject() }
  renamingVolId.value = null
}
function startRenameCh(ch: any) {
  renamingChId.value = ch.id
  renameValue.value = ch.title
  nextTick(() => chRenameInput.value?.focus())
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
    case 'gen-chapters':
      window.dispatchEvent(new CustomEvent('tree-gen-chapters', { detail: { volumeId: vol?.id || vol?.name } })); break
    case 'gen-body':
      window.dispatchEvent(new CustomEvent('tree-gen-body', { detail: { chapterId: ch?.id, volumeId: ch?.volumeId } })); break
    case 'view-outline': if (vol) openVolumeOutline(vol); break
    case 'view-plot': if (ch) openChapterPlot(ch); break
    case 'view-body': if (ch) selectChapter(ch); break
    case 'rename': if (ch) startRenameCh(ch); else if (vol) startRenameVol(vol); break
    case 'edit-vol': if (vol) showVolumeForm(vol); break
    case 'bind-skill':
      window.dispatchEvent(new CustomEvent('show-skill-binding', { detail: { type: ctxMenu.value.type, id: ch?.id || (vol?.id || vol?.name) } })); break
    case 'del-vol': if (vol && confirm('确认删除卷「' + vol.name + '」及其所有章节？')) deleteVolume(vol); break
    case 'del-ch': if (ch && confirm('确认删除章节「' + ch.title + '」？')) deleteChapter(ch); break
  }
}

function addChapter(vol: any) {
  const volId = vol.id || vol.name
  const chs = projectStore.chapters[volId] || []
  const newCh = { id: 'ch-' + Date.now(), title: '第' + (chs.length + 1) + '章', plot: '', body: '', volumeId: volId }
  if (!projectStore.chapters[volId]) projectStore.chapters[volId] = []
  projectStore.chapters[volId].push(newCh)
  projectStore.saveProject()
  expandedVolumes.value.add(volId)
}

function deleteChapter(ch: any) {
  for (const volId of Object.keys(projectStore.chapters)) {
    const chs = projectStore.chapters[volId]
    const idx = chs.findIndex((c: any) => c.id === ch.id)
    if (idx >= 0) { chs.splice(idx, 1); projectStore.saveProject(); break }
  }
}

function deleteVolume(vol: any) {
  const volId = vol.id || vol.name
  const idx = volumes.value.findIndex((v: any) => (v.id || v.name) === volId)
  if (idx >= 0) { volumes.value.splice(idx, 1); delete projectStore.chapters[volId]; projectStore.saveProject() }
}

function showVolumeForm(vol?: any) {
  if (vol) {
    editingVolIdx.value = volumes.value.findIndex((v: any) => (v.id || v.name) === (vol.id || vol.name))
    volFormName.value = vol.name
    volFormOutline.value = vol.outline || ''
    volFormWords.value = vol.suggestedWords || 500000
  } else {
    editingVolIdx.value = -1
    volFormName.value = '第' + (volumes.value.length + 1) + '卷'
    volFormOutline.value = ''
    volFormWords.value = 500000
  }
  showVolModal.value = true
}

function saveVolume() {
  if (!volFormName.value.trim()) return
  if (editingVolIdx.value >= 0) {
    volumes.value[editingVolIdx.value].name = volFormName.value.trim()
    volumes.value[editingVolIdx.value].outline = volFormOutline.value
    volumes.value[editingVolIdx.value].suggestedWords = volFormWords.value
  } else {
    volumes.value.push({ id: 'vol-' + Date.now(), name: volFormName.value.trim(),
      outline: volFormOutline.value, summary: '', suggestedWords: volFormWords.value })
  }
  projectStore.saveProject()
  showVolModal.value = false
}

function treeGen() {
  window.dispatchEvent(new CustomEvent('navigate', { detail: 'pipeline' }))
  if (projectStore.volumes.length === 0) { alert('请先在生成流水线中生成卷纲'); return }
  window.dispatchEvent(new CustomEvent('tree-gen-request'))
}

function openProjectList() { showProjectList.value = true; projectStore.loadProjectList() }
function selectProject(id: string) {
  projectStore.loadProject(id)
  window.electronAPI?.storageWrite?.('lastProjectId', id)
  showProjectList.value = false
}
function deleteProject(id: string) {
  if (!confirm('确认删除此项目？所有数据将丢失。')) return
  window.electronAPI?.storageRemove?.('project_' + id)
  projectStore.loadProjectList()
}
function createNewProject() {
  if (!newProjectName.value.trim()) return
  projectStore.currentProjectId = 'proj-' + Date.now()
  projectStore.projectName = newProjectName.value
  projectStore.outlineText = newOutlineText.value
  projectStore.saveProject()
  window.electronAPI?.storageWrite?.('lastProjectId', projectStore.currentProjectId)
  showProjectModal.value = false
  newProjectName.value = ''
  newOutlineText.value = ''
}

defineEmits<{ navigate: [string] }>()
</script>

<style scoped>
.chapter-tree { width: 200px; min-width: 140px; max-width: 300px; background: var(--bg-secondary); border-right: 1px solid var(--border-color); display: flex; flex-direction: column; flex-shrink: 0; overflow: hidden; }
.tree-header { display: flex; align-items: center; gap: 4px; padding: 8px 10px; border-bottom: 1px solid var(--border-color); font-size: 12px; }
.project-name { flex: 1 1 auto; min-width: 0; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tree-body { flex: 1; overflow-y: auto; padding: 4px 0; }
.empty-hint { padding: 24px 12px; text-align: center; color: var(--text-muted); font-size: 12px; line-height: 1.8; }
.tree-list { padding: 0 4px; }
.virtual-tree { height: 100%; }
.volume-group { margin-bottom: 2px; }
.volume-item { display: flex; align-items: center; gap: 4px; padding: 4px 8px; cursor: pointer; border-radius: 4px; font-size: 12px; color: var(--text-primary); }
.volume-item:hover { background: var(--bg-hover); }
.volume-item.drag-over { background: var(--accent); color: var(--text-on-accent); }
.vol-arrow { font-size: 10px; color: var(--text-muted); transition: transform 0.2s; display: inline-block; }
.vol-arrow.expanded { transform: rotate(90deg); }
.vol-name { flex: 1; }
.vol-count { font-size: 10px; color: var(--text-muted); }
.chapter-list { padding-left: 20px; }
.chapter-item { padding: 3px 8px; cursor: pointer; border-radius: 4px; font-size: 11px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.chapter-item:hover { background: var(--bg-hover); color: var(--text-primary); }
.chapter-item.active { background: var(--bg-hover); color: var(--accent); }
.chapter-item.drag-over { background: var(--accent); color: var(--text-on-accent); }
.rename-input { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--accent); border-radius: 3px; padding: 1px 4px; font-size: 11px; width: 100%; outline: none; }
.btn-add-ch { width: 100%; text-align: center; padding: 4px; background: none; border: 1px dashed var(--border-color); border-radius: 4px; color: var(--text-muted); font-size: 11px; cursor: pointer; margin-top: 2px; }
.btn-add-ch:hover { border-color: var(--accent); color: var(--accent); }
.ctx-menu { position: fixed; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 8px; padding: 4px; z-index: 3000; box-shadow: var(--shadow-lg); min-width: 140px; }
.ctx-item { display: block; width: 100%; text-align: left; background: none; border: none; color: var(--text-primary); padding: 6px 12px; font-size: 12px; border-radius: 4px; cursor: pointer; }
.ctx-item:hover { background: var(--bg-hover); }
.ctx-item.danger { color: var(--danger); }
.ctx-item.danger:hover { background: var(--danger); color: var(--text-on-accent); }
.project-modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: var(--bg-overlay); display: flex; align-items: center; justify-content: center; z-index: 2000; }
.vol-modal-body { display: flex; flex-direction: column; gap: 12px; }
.modal-input { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 8px 12px; font-size: var(--font-size-sm); }
.pm-textarea { min-height: 200px; background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 12px; font-size: 13px; resize: vertical; }
.pm-empty { padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px; }
.pm-project-item { padding: 10px 12px; border-radius: 6px; cursor: pointer; font-size: 13px; color: var(--text-primary); display: flex; justify-content: space-between; align-items: center; }
.pm-project-item:hover { background: var(--bg-hover); }
.pm-project-name { font-weight: 500; }
.pm-del-btn { background: none; border: 1px solid var(--danger); color: var(--danger); border-radius: 4px; padding: 2px 8px; font-size: 11px; cursor: pointer; }
.pm-del-btn:hover { background: var(--danger); color: var(--text-on-accent); }
</style>
