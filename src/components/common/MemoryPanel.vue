<template>
  <div id="memory-panel" class="memory-panel">
    <div class="mem-header">
      <h4>记忆管理</h4>
       <div class="mem-header-actions">
        <div class="mem-view-tabs">
          <button class="mem-tab-btn" :class="{active: showRelationGraph === false}" @click="showRelationGraph = false">记忆列表</button>
          <button class="mem-tab-btn" :class="{active: showRelationGraph === 'graph'}" @click="showRelationGraph = 'graph'">关系图</button>
          <button class="mem-tab-btn" :class="{active: showRelationGraph === 'analysis'}" @click="showRelationGraph = 'analysis'">图谱分析</button>
          <button class="mem-tab-btn" :class="{active: showRelationGraph === 'mind'}" @click="showRelationGraph = 'mind'">思维导图</button>
          <button class="mem-tab-btn" :class="{active: showRelationGraph === 'timeline'}" @click="showRelationGraph = 'timeline'">时间线</button>
        </div>
        <span class="mem-header-divider"></span>
        <div class="mem-more-menu">
          <button class="mem-more-btn" @click="showMoreMenu = !showMoreMenu">更多 ▾</button>
          <div class="mem-more-dropdown" v-if="showMoreMenu">
            <button id="btn-export-memory" @click="showMoreMenu=false; exportMemory()">导出 JSON</button>
            <button id="btn-import-memory" @click="showMoreMenu=false; importMemory('merge')">导入 JSON（合并）</button>
            <button id="btn-import-memory-overwrite" @click="showMoreMenu=false; importMemory('replace')">覆盖导入 JSON</button>
            <button id="btn-import-character-card" @click="showMoreMenu=false; importCharacterCard()">导入角色卡</button>
          </div>
        </div>
        <button id="btn-close-mem" class="btn-close" @click="$emit('close')">&times;</button>
       </div>
    </div>
    <div class="mem-body">
      <div v-if="!showRelationGraph" class="mem-sidebar">
        <div id="mem-cat-list" class="mem-cat-list">
          <button class="mem-cat-btn" :class="{active: selectedCat==='all'}" @click="selectedCat='all'">全部</button>
          <button v-for="cat in memoryCategories" :key="cat" class="mem-cat-btn" :class="{active: selectedCat===cat}" @click="selectedCat=cat">{{ cat }}</button>
        </div>
        <button id="btn-add-mem-cat" class="btn-sm btn-secondary full-width" @click="showCatInput = true">+ 新增分类</button>
      </div>
      <div v-if="!showRelationGraph" class="mem-content">
        <div class="mem-content-header">
          <span id="mem-current-cat">{{ selectedCat==='all' ? '全部记忆' : selectedCat }}</span>
          <button id="btn-add-mem" class="btn-primary btn-sm" @click="showForm(-1)">+ 添加记忆</button>
        </div>
        <div id="mem-list" class="mem-list card-grid">
          <div v-if="filteredItems.length===0 && !showingForm" class="empty-hint">暂无记忆条目</div>
          <div v-if="showingForm" class="mem-form">
            <h4>{{ editingIdx>=0 ? '编辑记忆' : '新增记忆' }}</h4>
            <div class="form-group">
              <label>键名</label>
              <input v-model="formData.key" placeholder="例如: 主角性格" />
            </div>
            <div class="form-group">
              <label>分类</label>
              <select v-model="formData.category">
                <option v-for="cat in memoryCategories" :key="cat" :value="cat">{{ cat }}</option>
              </select>
            </div>
            <div class="form-group">
              <label>内容</label>
              <textarea v-model="formData.content" rows="4" placeholder="记忆内容..."></textarea>
            </div>
            <div class="form-actions">
              <button class="btn-primary" @click="saveForm">保存</button>
              <button class="btn-secondary" @click="cancelForm">取消</button>
            </div>
          </div>
          <div v-for="(item, idx) in filteredItems" :key="idx" class="mem-item-card">
            <CharacterCard
              v-if="item.source === 'entity' && item.entity"
              :entity="item.entity"
              @open-source="openMemorySource"
              @export="exportEntityCard(item)"
            />
            <template v-if="item.source !== 'entity'">
            <div class="mem-item-header">
              <span class="mem-item-key">{{ item.key }}</span>
              <span class="mem-item-cat">{{ item.category }}</span>
              <div class="mem-item-actions">
                <template v-if="item.source === 'legacy'">
                  <button class="btn-sm btn-secondary" @click="showForm(item.legacyIndex)">编辑</button>
                  <button class="btn-sm btn-danger" @click="deleteItem(item.legacyIndex)">删除</button>
                </template>
                <template v-else-if="item.source === 'entity'">
                  <button class="btn-sm btn-secondary" @click="exportEntityCard(item)">导出角色卡</button>
                </template>
              </div>
            </div>
            <div class="mem-item-content">{{ item.content }}</div>
            <div class="mem-item-date">{{ item.created || '' }}</div>
            </template>
          </div>
        </div>
      </div>
      <div v-else class="mem-graph-content">
        <RelationGraph v-if="showRelationGraph === 'graph'" :memories="projectStore.memories" @open-source="openMemorySource" />
        <GraphAnalysis v-else-if="showRelationGraph === 'analysis'" :memories="projectStore.memories" @open-source="openMemorySource" />
        <MindMap v-else-if="showRelationGraph === 'mind'" :memories="projectStore.memories" :volumes="projectStore.volumes" :chapters="projectStore.chapters" @open-source="openMemorySource" />
        <TimelineView v-else :memories="projectStore.memories" @open-source="openMemorySource" />
      </div>
    </div>
    <!-- 内联输入框弹窗替代 prompt -->
    <div v-if="showCatInput" class="mem-overlay" @click.self="showCatInput = false">
      <div class="mem-inline-box">
        <h3>新增分类</h3>
        <input ref="catInputRef" v-model="newCatName" class="mem-input" placeholder="输入新分类名称" @keyup.enter="confirmAddCat" />
        <div class="mem-inline-actions">
          <button class="btn-secondary" @click="showCatInput = false">取消</button>
          <button class="btn-primary" @click="confirmAddCat">确认</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { useProjectStore } from '../../stores/project'
import { useEditorStore } from '../../stores/editor'
import RelationGraph from '../memory/RelationGraph.vue'
import GraphAnalysis from '../memory/GraphAnalysis.vue'
import MindMap from '../memory/MindMap.vue'
import TimelineView from '../memory/TimelineView.vue'
import CharacterCard from '../memory/CharacterCard.vue'
import { exportFullJSON, importFullJSON, mergeImportedMemory, importCharacterCardV3 } from '../../services/memoryIO'

const projectStore = useProjectStore()
const editorStore = useEditorStore()
const emit = defineEmits<{ close: [] }>()

const selectedCat = ref('all')
const showingForm = ref(false)
const editingIdx = ref(-1)
const formData = ref({ key: '', category: '', content: '' })
const showCatInput = ref(false)
const newCatName = ref('')
const catInputRef = ref<HTMLInputElement | null>(null)
const showRelationGraph = ref<false | 'graph' | 'analysis' | 'mind' | 'timeline'>(false)
const showMoreMenu = ref(false)

type MemoryDisplayItem = {
  key: string
  category: string
  content: string
  created?: string
  source: 'legacy' | 'entity' | 'relation' | 'event' | 'world' | 'foreshadowing'
  legacyIndex: number
  entity?: import('../../types/memory').MemoryEntity
}

const memoryCategories = computed(() => {
  const categories = [...projectStore.memories.categories]
  const modelCategories = projectStore.memories.entities.length > 0 ? ['实体'] : []
  if (projectStore.memories.relations.length > 0) modelCategories.push('关系')
  if (projectStore.memories.events.length > 0) modelCategories.push('事件')
  if (projectStore.memories.world.length > 0) modelCategories.push('世界观')
  if (projectStore.memories.foreshadowing.length > 0) modelCategories.push('伏笔')
  return [...new Set([...categories, ...modelCategories])]
})

const memoryDisplayItems = computed<MemoryDisplayItem[]>(() => {
  const legacy = projectStore.memories.items.map((item: any, legacyIndex: number) => ({
    key: item.key,
    category: item.category,
    content: item.content,
    created: item.created,
    source: 'legacy' as const,
    legacyIndex
  }))
  const entities = projectStore.memories.entities.map((item: any) => ({
    key: item.name || item.id,
    category: '实体',
    content: [item.description, item.status && `状态：${item.status}`, item.notes].filter(Boolean).join('\n'),
    created: item.updatedAt || item.createdAt,
    source: 'entity' as const,
    legacyIndex: -1,
    entity: item
  }))
  const relations = projectStore.memories.relations.map((item: any) => ({
    key: item.id,
    category: '关系',
    content: [item.type, item.detail].filter(Boolean).join('：'),
    created: item.updatedAt || item.createdAt,
    source: 'relation' as const,
    legacyIndex: -1
  }))
  const events = projectStore.memories.events.map((item: any) => ({
    key: item.title || item.id,
    category: '事件',
    content: item.summary || '',
    created: item.createdAt,
    source: 'event' as const,
    legacyIndex: -1
  }))
  const world = projectStore.memories.world.map((item: any) => ({
    key: item.name || item.id,
    category: '世界观',
    content: item.description || '',
    created: item.createdAt,
    source: 'world' as const,
    legacyIndex: -1
  }))
  const foreshadowing = projectStore.memories.foreshadowing.map((item: any) => ({
    key: item.title || item.id,
    category: '伏笔',
    content: item.description || '',
    created: item.createdAt,
    source: 'foreshadowing' as const,
    legacyIndex: -1
  }))
  return [...legacy, ...entities, ...relations, ...events, ...world, ...foreshadowing]
})

const filteredItems = computed(() => {
  if (selectedCat.value === 'all') return memoryDisplayItems.value
  return memoryDisplayItems.value.filter(item => item.category === selectedCat.value)
})

function showForm(idx: number) {
  editingIdx.value = idx
  if (idx >= 0) {
    const item = projectStore.memories.items[idx]
    formData.value = { key: item.key, category: item.category, content: item.content }
  } else {
    formData.value = { key: '', category: memoryCategories.value[0] || '', content: '' }
  }
  showingForm.value = true
}

function cancelForm() {
  showingForm.value = false
  editingIdx.value = -1
}

function saveForm() {
  if (!formData.value.key.trim() || !formData.value.content.trim()) {
    alert('键名和内容不能为空')
    return
  }
  const item = { key: formData.value.key.trim(), category: formData.value.category, content: formData.value.content.trim() }
  if (editingIdx.value >= 0) {
    projectStore.updateMemory(editingIdx.value, item)
  } else {
    projectStore.addMemory(item)
  }
  showingForm.value = false
  editingIdx.value = -1
}

function deleteItem(idx: number) {
  if (confirm('确定删除此记忆？')) {
    projectStore.deleteMemory(idx)
  }
}

function confirmAddCat() {
  const name = newCatName.value.trim()
  if (name) {
    projectStore.addMemoryCategory(name)
  }
  showCatInput.value = false
  newCatName.value = ''
}

function exportMemory() {
  const json = exportFullJSON(projectStore.memories, '神意助手记忆导出')
  const filePath = window.electronAPI.dialogSaveFile('memory-export.json')
  if (!filePath) return
  const ok = window.electronAPI.dialogWriteFile(filePath, json)
  alert(ok ? '记忆导出成功：' + filePath : '记忆导出失败')
}

function importMemory(mode: 'merge' | 'replace' = 'merge') {
  const path = window.electronAPI.dialogOpenFile()
  if (!path) return
  const read = window.electronAPI.dialogReadFile(path)
  if (!read || !read.content) {
    alert('读取文件失败')
    return
  }
  const result = importFullJSON(read.content)
  if (!result.success || !result.memory) {
    alert('导入失败：' + (result.error || '未知错误'))
    return
  }
  if (mode === 'replace') {
    if (!confirm('覆盖导入会删除当前项目已有记忆，只保留文件内容。确认覆盖？')) return
    projectStore.recordMemoryChange(result.memory, {
      chapterId: 'memory-import-replace',
      reason: '用户主动选择覆盖导入记忆'
    })
    alert('记忆覆盖导入成功')
    return
  }
  if (!confirm('导入将合并到当前记忆，已有条目不会被覆盖。确认继续？')) return
  const merged = mergeImportedMemory(projectStore.memories, result.memory)
  projectStore.recordMemoryChange(merged.memory, {
    chapterId: 'memory-import-merge',
    reason: `合并导入记忆：新增 ${merged.added} 项，跳过 ${merged.skipped} 项`
  })
  alert(`记忆合并导入成功：新增 ${merged.added} 项，跳过 ${merged.skipped} 项`)
}

function importCharacterCard() {
  const path = window.electronAPI.dialogOpenFile()
  if (!path) return
  const read = window.electronAPI.dialogReadFile(path)
  if (!read || !read.content) {
    alert('读取文件失败')
    return
  }
  const result = importCharacterCardV3(read.content)
  if (!result.success || !result.entity) {
    alert('角色卡导入失败：' + (result.error || '未知错误'))
    return
  }
  projectStore.addEntity(result.entity)
  alert('角色卡导入成功：' + result.entity.name)
}

function exportEntityCard(item: any) {
  const entity = projectStore.memories.entities.find((e: any) => e.name === item.key || e.id === item.key)
  if (!entity) {
    alert('未找到对应实体数据')
    return
  }
  const json = exportCharacterCardV3(entity)
  const safeName = (entity.name || '角色卡').replace(/[\\/:*?"<>|]/g, '_')
  const filePath = window.electronAPI.dialogSaveFile(safeName + '.chara-card-v3.json')
  if (!filePath) return
  const ok = window.electronAPI.dialogWriteFile(filePath, json)
  alert(ok ? '角色卡导出成功：' + filePath : '角色卡导出失败')
}

function findChapter(chapterId: string) {
  for (const volume of projectStore.volumes || []) {
    const volumeId = volume.id || volume.name
    const chapter = (projectStore.chapters[volumeId] || []).find((item: any) => item.id === chapterId)
    if (chapter) return chapter
  }
  return null
}

function openMemorySource(payload: { kind: 'entity' | 'event'; id: string }) {
  const chapterId = payload.kind === 'event'
    ? projectStore.memories.events.find(item => item.id === payload.id)?.chapterId
    : projectStore.memories.entities.find(item => item.id === payload.id)?.evidence?.[0]?.chapterId
  if (!chapterId) {
    alert('该记忆暂无对应正文来源')
    return
  }
  const chapter = findChapter(chapterId)
  if (!chapter) {
    alert('未找到该记忆对应的章节')
    return
  }
  editorStore.openTab({
    id: 'tab-' + chapter.id,
    title: chapter.title,
    content: chapter.body || '',
    chapterId: chapter.id,
    isDirty: false,
    mode: 'ch-body'
  })
  emit('close')
}
</script>

<style scoped>
.memory-panel {
  position: absolute;
  top: 0; left: 48px; right: 0; bottom: 0;
  background: var(--bg-primary);
  z-index: 100;
  display: flex;
  flex-direction: column;
}
.mem-header {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.mem-header h4 { font-size: var(--font-size-md); font-weight: 600; margin: 0; }
.mem-header h4 { white-space: nowrap; flex-shrink: 0; margin-right: 12px; }
.mem-header-actions { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }
.mem-view-tabs { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; }
.mem-tab-btn {
  padding: 10px 24px; border: none; background: transparent;
  flex: 1; text-align: center;
  color: var(--text-secondary); cursor: pointer; border-radius: var(--radius-sm);
  font-size: var(--font-size-md); white-space: nowrap; transition: all 0.15s;
}
.mem-tab-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.mem-tab-btn.active { background: var(--accent); color: #fff; font-weight: 500; }
.mem-tab-btn.active::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 8px;
  right: 8px;
  height: 2px;
  background: var(--accent);
  border-radius: 1px;
}
.mem-tab-btn { position: relative; }
.mem-header-divider { width: 1px; height: 20px; background: var(--border-color); flex-shrink: 0; }
.mem-more-menu { position: relative; flex-shrink: 0; }
.mem-more-btn {
  padding: 10px 18px; border: none; background: transparent;
  color: var(--text-secondary); cursor: pointer; border-radius: var(--radius-xs);
  font-size: var(--font-size-md); white-space: nowrap; transition: all 0.15s;
}
.mem-more-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.mem-more-dropdown {
  position: absolute; top: 100%; right: 0; margin-top: 4px;
  background: var(--bg-tertiary); border: 1px solid var(--border-color);
  border-radius: var(--radius-sm); box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  display: flex; flex-direction: column; gap: 2px; padding: 4px; z-index: 2000; min-width: 120px;
}
.mem-more-dropdown button {
  padding: 8px 14px; border: none; background: transparent;
  color: var(--text-primary); cursor: pointer; border-radius: var(--radius-xs);
  font-size: var(--font-size-md); text-align: left; white-space: nowrap;
}
.mem-more-dropdown button:hover { background: var(--bg-hover); color: var(--accent); }
.mem-body { flex: 1; display: flex; overflow: hidden; }
.mem-graph-content { flex: 1; min-width: 0; min-height: 0; padding: 12px 16px; overflow: hidden; }
.mem-sidebar {
  width: 160px; border-right: 1px solid var(--border-color);
  padding: 8px; display: flex; flex-direction: column; gap: 4px; overflow-y: auto;
}
.mem-cat-list { display: flex; flex-direction: column; gap: 2px; flex: 1; }
.mem-cat-btn {
  text-align: left; padding: 6px 12px; border: none; background: transparent;
  color: var(--text-secondary); cursor: pointer; border-radius: var(--radius-xs); font-size: var(--font-size-md);
}
.mem-cat-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.mem-cat-btn.active { background: var(--bg-hover); color: var(--accent); font-weight: 500; }
.full-width { width: 100%; }
.mem-content { flex: 1; overflow-y: auto; padding: 8px; }
.mem-content-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 8px; font-size: var(--font-size-md); color: var(--text-secondary);
}
.mem-list { display: flex; flex-direction: column; gap: 8px; }
.empty-hint { color: var(--text-secondary); text-align: center; padding: 24px; font-size: var(--font-size-md); }
.mem-item-header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.mem-item-key { font-weight: 600; font-size: var(--font-size-md); }
.mem-item-cat {
  font-size: var(--font-size-xs); padding: 1px 6px; border-radius: var(--radius-xs);
  background: var(--bg-hover); color: var(--text-secondary);
}
.mem-item-actions { margin-left: auto; display: flex; gap: 4px; }
.mem-item-content { font-size: var(--font-size-md); color: var(--text-primary); line-height: 1.5; white-space: pre-wrap; }
.mem-item-date { font-size: var(--font-size-xs); color: var(--text-secondary); margin-top: 4px; }
.mem-form {
  border: 1px solid var(--accent); border-radius: var(--radius-sm); padding: 12px;
  background: var(--bg-secondary); margin-bottom: 8px;
}
.mem-form h4 { margin: 0 0 8px 0; font-size: var(--font-size-md); }
.form-group { margin-bottom: 8px; }
.form-group label { display: block; font-size: var(--font-size-sm); color: var(--text-secondary); margin-bottom: 2px; }
.form-group input, .form-group select, .form-group textarea {
  width: 100%; padding: var(--space-2) var(--space-4); border: 1px solid var(--border-color);
  border-radius: var(--radius-xs); background: var(--bg-primary);
  color: var(--text-primary); font-size: var(--font-size-md); outline: none;
}
.form-group input:focus, .form-group select:focus, .form-group textarea:focus {
  border-color: var(--accent);
}
.mem-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: var(--bg-overlay); display: flex; align-items: center; justify-content: center; z-index: 2000; }
.mem-inline-box { background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 24px; width: min(360px, 80vw); display: flex; flex-direction: column; gap: 12px; }
.mem-inline-box h3 { margin: 0; font-size: var(--font-size-lg); }
.mem-input { width: 100%; padding: 6px 10px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-primary); color: var(--text-primary); font-size: var(--font-size-md); outline: none; box-sizing: border-box; }
.mem-input:focus { border-color: var(--accent); }
.mem-inline-actions { display: flex; gap: 8px; justify-content: flex-end; }
</style>
