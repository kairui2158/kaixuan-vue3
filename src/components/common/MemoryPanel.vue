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
            <button id="btn-export-character-profile" @click="showMoreMenu=false; exportCharacterProfileUI()">导出角色档案</button>
            <button id="btn-export-storyline" @click="showMoreMenu=false; exportStorylineUI()">导出故事线</button>
            <button id="btn-export-timeline" @click="showMoreMenu=false; exportTimelineUI()">导出时间线</button>
            <button id="btn-export-scene" @click="showMoreMenu=false; exportSceneUI()">导出场景包</button>
            <button id="btn-memory-history" @click="showMoreMenu=false; openHistory()">版本历史</button>
            <button id="btn-memory-blacklist" @click="showMoreMenu=false; blacklistVisible = true">黑名单管理</button>
            <button id="btn-memory-merge" @click="showMoreMenu=false; mergeVisible = true">合并建议</button>
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
        <div class="mem-toolbar">
          <input id="mem-search-input" v-model="searchText" placeholder="搜索名称、别名、内容……" />
          <select id="mem-status-filter" v-model="statusFilter">
            <option value="all">全部状态</option>
            <option value="pending">待确认</option>
            <option value="confirmed">已确认</option>
            <option value="conflicted">有冲突</option>
            <option value="stale">已过时</option>
            <option value="rejected">已拒绝</option>
          </select>
          <button class="btn-sm btn-secondary" @click="batchConfirmSelected">批量确认</button>
          <button class="btn-sm btn-danger" @click="batchRejectSelected">批量拒绝</button>
        </div>
        <div class="mem-stats">
          <button v-for="stat in memoryStats" :key="stat.label" class="mem-stat" type="button" @click="applyStatFilter(stat)">
            <span>{{ stat.label }}</span><strong>{{ stat.value }}</strong>
          </button>
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
             :blacklisted="projectStore.isBlacklisted(item.entity.id)"
             @open-source="openMemorySource"
             @edit="editEntity(item.entity.id)"
             @export="exportEntityCard(item)"
             @blacklist="toggleBlacklist(item.entity.id)"
             @merge="openMergeFor(item.entity.id)"
           />
            <template v-if="item.source !== 'entity'">
            <div class="mem-item-header">
              <label v-if="item.record?.id" class="mem-select">
                <input type="checkbox" :value="item.record.id" v-model="selectedIds" :aria-label="`选择 ${item.key}`" />
                <span>选择</span>
              </label>
              <span class="mem-item-key">{{ item.key }}</span>
              <span v-if="factStatusOf(item)" :class="['mem-status', factStatusOf(item)]">{{ factStatusLabel(factStatusOf(item)) }}</span>
              <span class="mem-item-cat">{{ item.category }}</span>
             <div class="mem-item-actions">
               <template v-if="item.source === 'legacy'">
                 <button class="btn-sm btn-secondary" @click="showForm(item.legacyIndex)">编辑</button>
                 <button class="btn-sm btn-danger" @click="deleteItem(item.legacyIndex)">删除</button>
               </template>
               <template v-else-if="item.source === 'event' && item.event">
                 <button class="btn-sm btn-secondary" @click="editEvent(item.event.id)">编辑</button>
                 <button class="btn-sm btn-danger" @click="deleteEvent(item.event.id)">删除</button>
               </template>
               <template v-else-if="item.source === 'world' && item.world">
                 <button class="btn-sm btn-secondary" @click="editWorld(item.world.id)">编辑</button>
                 <button class="btn-sm btn-danger" @click="deleteWorld(item.world.id)">删除</button>
               </template>
               <template v-else-if="item.source === 'relation' && item.relation">
                 <button class="btn-sm btn-secondary" @click="editRelation(item.relation.id)">编辑</button>
                 <button class="btn-sm btn-danger" @click="deleteRelation(item.relation.id)">删除</button>
               </template>
               <template v-else-if="item.source === 'foreshadowing' && item.foreshadowing">
                 <button class="btn-sm btn-secondary" @click="editForeshadowing(item.foreshadowing.id)">编辑</button>
                 <button class="btn-sm btn-danger" @click="deleteForeshadowing(item.foreshadowing.id)">删除</button>
               </template>
             </div>
            </div>
            <div v-if="factStatusOf(item) === 'conflicted' && recordOf(item)?.conflictsData" class="mem-conflict-inline">
              <button class="btn-sm btn-danger" @click="openConflict(item)">查看冲突</button>
            </div>
            <div class="mem-item-content">{{ item.content }}</div>
            <div class="mem-item-date">{{ item.created || '' }}</div>
            </template>
          </div>
        </div>
      </div>
      <div v-else class="mem-graph-content">
        <RelationGraph v-if="showRelationGraph === 'graph'" :memories="projectStore.memories" @open-source="openMemorySource" @edit-entity="editEntity" @create-relation="createRelation" />
        <GraphAnalysis v-else-if="showRelationGraph === 'analysis'" :memories="projectStore.memories" @open-source="openMemorySource" />
        <MindMap v-else-if="showRelationGraph === 'mind'" :memories="projectStore.memories" :volumes="projectStore.volumes" :chapters="projectStore.chapters" @open-source="openMemorySource" />
        <TimelineView v-else :memories="projectStore.memories" @open-source="openMemorySource" />
      </div>
    </div>
    <div v-if="blacklistVisible" class="mem-overlay" @click.self="blacklistVisible = false">
      <div class="mem-inline-box mem-blacklist-box">
        <h3>黑名单管理</h3>
        <button class="btn-close" type="button" aria-label="关闭黑名单管理" @click="blacklistVisible = false">&times;</button>
        <div v-if="blacklistedEntities.length === 0" class="empty-hint">暂无黑名单实体</div>
        <div v-for="entity in blacklistedEntities" :key="entity.id" class="mem-blacklist-row">
          <span>{{ entity.name }}</span>
          <button class="btn-sm btn-secondary" @click="toggleBlacklist(entity.id)">移除</button>
        </div>
      </div>
    </div>
    <div v-if="mergeVisible" class="mem-overlay" @click.self="mergeVisible = false">
      <div class="mem-inline-box mem-merge-box">
        <h3>实体合并建议</h3>
        <button class="btn-close" type="button" aria-label="关闭实体合并建议" @click="mergeVisible = false">&times;</button>
        <div v-if="mergeSuggestions.length === 0" class="empty-hint">暂无合并建议</div>
        <div v-for="pair in mergeSuggestions" :key="pair.source.id + pair.target.id" class="mem-merge-row">
          <span>{{ pair.source.name }} → {{ pair.target.name }}</span>
          <button class="btn-sm btn-primary" @click="mergeEntityPair(pair.source.id, pair.target.id)">合并</button>
        </div>
      </div>
    </div>
    <div v-if="conflictItem" class="mem-overlay" @click.self="conflictItem = null">
      <div class="mem-inline-box mem-conflict-box">
        <h3>冲突审查</h3>
        <div class="mem-conflict-list">
          <div v-for="value in conflictValues" :key="value.field" class="mem-conflict-value">
            <span>{{ value.field }}</span>
            <div><label>旧值</label><p>{{ value.oldValue || '（空）' }}</p></div>
            <div><label>新值</label><p>{{ value.newValue || '（空）' }}</p></div>
          </div>
        </div>
        <div class="mem-inline-actions">
          <button class="btn-secondary" @click="resolveConflict(false)">保留旧值</button>
          <button class="btn-primary" @click="resolveConflict(true)">采用新值</button>
        </div>
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
    <div v-if="editDialogVisible" class="mem-overlay" @click.self="closeEditDialog">
      <div class="mem-edit-dialog">
        <h3>{{ editDialogTitle }}</h3>
        <div class="mem-edit-scroll">
          <div v-for="field in editDialog.fields" :key="field.name" class="form-group">
            <label>{{ field.label }}</label>
            <select v-if="field.options" v-model="editDialog.values[field.name]">
              <option v-for="option in field.options" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
            <textarea v-else-if="field.multiline" v-model="editDialog.values[field.name]" rows="3"></textarea>
            <input v-else v-model="editDialog.values[field.name]" />
          </div>
        </div>
        <div class="mem-inline-actions">
          <button class="btn-secondary" @click="closeEditDialog">取消</button>
          <button class="btn-primary" @click="saveEditDialog">保存</button>
        </div>
      </div>
    </div>
    <div v-if="profileExportVisible" class="mem-overlay" @click.self="profileExportVisible = false">
      <div class="mem-inline-box">
        <h3>选择要导出的角色</h3>
        <div class="mem-profile-export-list">
          <button v-for="entity in profileExportEntities" :key="entity.id" @click="exportCharacterProfileEntity(entity.id)">
            {{ entity.name }}
          </button>
        </div>
        <div class="mem-inline-actions">
          <button class="btn-secondary" @click="profileExportVisible = false">取消</button>
        </div>
      </div>
    </div>
<MemoryHistoryModal
  :visible="historyVisible"
  :records="memoryHistory"
  @close="historyVisible = false"
  @rollback="rollbackHistory"
  @rollback-by-chapter="rollbackHistoryByChapter"
/>
  </div>
</template>

<script setup lang="ts">
import { defineAsyncComponent, ref, computed, nextTick } from 'vue'
import { useProjectStore } from '../../stores/project'
import { useEditorStore } from '../../stores/editor'
const RelationGraph = defineAsyncComponent(() => import('../memory/RelationGraph.vue'))
const GraphAnalysis = defineAsyncComponent(() => import('../memory/GraphAnalysis.vue'))
const MindMap = defineAsyncComponent(() => import('../memory/MindMap.vue'))
const TimelineView = defineAsyncComponent(() => import('../memory/TimelineView.vue'))
import CharacterCard from '../memory/CharacterCard.vue'
import MemoryHistoryModal from '../memory/MemoryHistoryModal.vue'
import type { MemoryEntity, MemoryRelation, MemoryEvent, WorldEntry, Foreshadowing, MemoryChangeRecord } from '../../types/memory'
import { useAppConfirm } from '../../composables/useAppConfirm'
import { storageKey } from '../../utils/storage-key'
import { exportFullJSON, importFullJSON, mergeImportedMemory, createMemoryBackup, exportCharacterCardV3, importCharacterCardV3 } from '../../services/memoryIO'
import { exportCharacterProfile, exportStoryline, exportTimeline, exportScene, type MemoryExportContext } from '../../services/memoryExport'

const projectStore = useProjectStore()
const editorStore = useEditorStore()
const appConfirm = useAppConfirm()
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
const profileExportVisible = ref(false)
const historyVisible = ref(false)
const blacklistVisible = ref(false)
const mergeVisible = ref(false)
const searchText = ref('')
const statusFilter = ref<'all' | 'pending' | 'confirmed' | 'conflicted' | 'stale' | 'rejected'>('all')
const selectedIds = ref<string[]>([])
const conflictItem = ref<MemoryDisplayItem | null>(null)

type EditableKind = 'entity' | 'relation' | 'event' | 'world' | 'foreshadowing'
type EditableRecord = MemoryEntity | MemoryRelation | MemoryEvent | WorldEntry | Foreshadowing
type EditDialogField = {
  name: string
  label: string
  multiline?: boolean
  options?: Array<{ label: string; value: string }>
}
type EditDialog = {
  kind: EditableKind
  id: string
  title: string
  fields: EditDialogField[]
  values: Record<string, string>
}
const emptyEditDialog: EditDialog = { kind: 'entity', id: '', title: '', fields: [], values: {} }
const editDialog = ref<EditDialog>(emptyEditDialog)
const editDialogVisible = ref(false)

type MemoryDisplayItem = {
  key: string
  category: string
  content: string
  created?: string
  source: 'legacy' | 'entity' | 'relation' | 'event' | 'world' | 'foreshadowing'
  legacyIndex: number
  entity?: import('../../types/memory').MemoryEntity
  relation?: import('../../types/memory').MemoryRelation
  event?: import('../../types/memory').MemoryEvent
  world?: import('../../types/memory').WorldEntry
  foreshadowing?: import('../../types/memory').Foreshadowing
  record?: import('../../types/memory').MemoryEntity | import('../../types/memory').MemoryRelation | import('../../types/memory').MemoryEvent | import('../../types/memory').WorldEntry | import('../../types/memory').Foreshadowing
}

type FactStatusValue = NonNullable<import('../../types/memory').MemoryEntity['factStatus']>

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
    entity: item,
    record: item
  }))
  const relations = projectStore.memories.relations.map((item: any) => ({
    key: item.id,
    category: '关系',
    content: [item.type, item.detail].filter(Boolean).join('：'),
    created: item.updatedAt || item.createdAt,
    source: 'relation' as const,
    legacyIndex: -1,
    relation: item,
    record: item
  }))
  const events = projectStore.memories.events.map((item: any) => ({
    key: item.title || item.id,
    category: '事件',
    content: item.summary || '',
    created: item.createdAt,
    source: 'event' as const,
    legacyIndex: -1,
    event: item,
    record: item
  }))
  const world = projectStore.memories.world.map((item: any) => ({
    key: item.name || item.id,
    category: '世界观',
    content: item.description || '',
    created: item.createdAt,
    source: 'world' as const,
    legacyIndex: -1,
    world: item,
    record: item
  }))
  const foreshadowing = projectStore.memories.foreshadowing.map((item: any) => ({
    key: item.title || item.id,
    category: '伏笔',
    content: item.description || '',
    created: item.createdAt,
    source: 'foreshadowing' as const,
    legacyIndex: -1,
    foreshadowing: item,
    record: item
  }))
  return [...legacy, ...entities, ...relations, ...events, ...world, ...foreshadowing]
})

const filteredItems = computed(() => {
  const keyword = searchText.value.trim().toLocaleLowerCase()
  return memoryDisplayItems.value.filter(item => {
    if (selectedCat.value !== 'all' && item.category !== selectedCat.value) return false
    if (statusFilter.value !== 'all') {
      if (factStatusOf(item) !== statusFilter.value) return false
    }
    if (!keyword) return true
    const haystack = [item.key, item.category, item.content, ...(item.entity?.aliases || []), item.entity?.description]
      .filter(Boolean).join('\n').toLocaleLowerCase()
    return haystack.includes(keyword)
  })
})

const factStatusLabels: Record<FactStatusValue, string> = {
  pending: '待确认', confirmed: '已确认', stale: '已过时', conflicted: '有冲突', rejected: '已拒绝'
}

function factStatusOf(item: MemoryDisplayItem): FactStatusValue | '' {
  return (item.record as { factStatus?: FactStatusValue } | undefined)?.factStatus || ''
}

function factStatusLabel(value: FactStatusValue | '') {
  return value ? factStatusLabels[value] || value : ''
}

function recordOf(item: MemoryDisplayItem) {
  return item.record
}

const memoryStats = computed(() => {
  const memories = projectStore.memories
  const pending = [memories.entities, memories.relations, memories.events, memories.world, memories.foreshadowing]
    .flat().filter((item: any) => item.factStatus === 'pending').length
  return [
    { label: '实体', value: memories.entities.length, category: '实体', status: 'all' as const },
    { label: '关系', value: memories.relations.length, category: '关系', status: 'all' as const },
    { label: '事件', value: memories.events.length, category: '事件', status: 'all' as const },
    { label: '世界观', value: memories.world.length, category: '世界观', status: 'all' as const },
    { label: '伏笔', value: memories.foreshadowing.length, category: '伏笔', status: 'all' as const },
    { label: '待确认', value: pending, category: 'all', status: 'pending' as const },
    { label: '抽取次数', value: memories.meta.extractionCount, category: 'all', status: 'all' as const }
  ]
})

function applyStatFilter(stat: { category: string; status: string }) {
  selectedCat.value = stat.category
  statusFilter.value = stat.status as typeof statusFilter.value
}

const blacklistedEntities = computed(() => projectStore.memories.entities.filter(entity => projectStore.isBlacklisted(entity.id)))

function toggleBlacklist(entityId: string) {
  if (projectStore.isBlacklisted(entityId)) projectStore.removeFromBlacklist(entityId)
  else projectStore.addToBlacklist(entityId)
}

const mergeSuggestions = computed(() => {
  const entities = projectStore.memories.entities.filter(entity => !projectStore.isBlacklisted(entity.id))
  const result: Array<{ source: import('../../types/memory').MemoryEntity; target: import('../../types/memory').MemoryEntity; reason: string }> = []
  for (let index = 0; index < entities.length; index++) {
    for (let next = index + 1; next < entities.length; next++) {
      const source = entities[index]
      const target = entities[next]
      const sourceNames = [source.name, ...source.aliases].map(value => value.trim().toLocaleLowerCase()).filter(Boolean)
      const targetNames = [target.name, ...target.aliases].map(value => value.trim().toLocaleLowerCase()).filter(Boolean)
      const reason = sourceNames.find(value => targetNames.includes(value)) ? '名称或别名一致' : ''
      if (reason) result.push({ source, target, reason })
    }
  }
  return result
})

function openMergeFor(entityId: string) {
  const suggestion = mergeSuggestions.value.find(pair => pair.source.id === entityId || pair.target.id === entityId)
  if (suggestion) {
    mergeEntityPair(suggestion.source.id, suggestion.target.id)
    return
  }
  void appConfirm.alert('暂无自动合并建议')
}

async function mergeEntityPair(sourceId: string, targetId: string) {
  if (!await appConfirm.confirm({ title: '合并实体', message: '合并后源实体将被删除，其关系会迁移到目标实体。确认合并？', confirmText: '合并', danger: true })) return
  const ok = projectStore.mergeEntities(sourceId, targetId)
  void appConfirm.alert(ok ? '实体合并成功' : '实体合并失败')
}

const conflictValues = computed(() => conflictItem.value?.record?.conflictsData?.values || [])

function openConflict(item: MemoryDisplayItem) {
  conflictItem.value = item
}

function resolveConflict(useNew: boolean) {
  const item = conflictItem.value
  if (!item?.record) return
  const record = item.record as import('../../types/memory').MemoryEntity
  if (useNew && record.conflictsData) {
    for (const value of record.conflictsData.values) {
      if (value.field in record) (record as any)[value.field] = value.newValue
    }
  }
  record.conflictsData = undefined
  record.factStatus = 'confirmed'
  conflictItem.value = null
  projectStore.saveProject()
}

function batchConfirmSelected() {
  for (const id of selectedIds.value) {
    const item = memoryDisplayItems.value.find(candidate => candidate.record?.id === id)
    if (item?.record) (item.record as any).factStatus = 'confirmed'
  }
  selectedIds.value = []
  projectStore.saveProject()
}

function batchRejectSelected() {
  for (const id of selectedIds.value) {
    const item = memoryDisplayItems.value.find(candidate => candidate.record?.id === id)
    if (item?.record) (item.record as any).factStatus = 'rejected'
  }
  selectedIds.value = []
  projectStore.saveProject()
}

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
    void appConfirm.alert('键名和内容不能为空')
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

async function deleteItem(idx: number) {
  if (await appConfirm.confirm({ title: '删除记忆', message: '确定删除此记忆？', confirmText: '删除', danger: true })) {
    projectStore.deleteMemory(idx)
  }
}


// D3: CRUD functions for new memory model
const entityFields: EditDialogField[] = [
  { name: 'name', label: '名称' },
  { name: 'type', label: '类型', options: [
    { label: '人物', value: 'character' }, { label: '组织', value: 'organization' },
    { label: '地点', value: 'location' }, { label: '物品', value: 'item' },
    { label: '概念', value: 'concept' }, { label: '其他', value: 'other' }
  ] },
  { name: 'status', label: '状态' },
  { name: 'description', label: '描述', multiline: true },
  { name: 'personality', label: '性格', multiline: true },
  { name: 'appearance', label: '外貌', multiline: true },
  { name: 'background', label: '身世', multiline: true },
  { name: 'notes', label: '备注', multiline: true }
]
const relationFields: EditDialogField[] = [
  { name: 'type', label: '关系类型' },
  { name: 'strength', label: '强度（0-10）' },
  { name: 'detail', label: '详情', multiline: true }
]
const eventFields: EditDialogField[] = [
  { name: 'title', label: '标题' },
  { name: 'type', label: '类型' },
  { name: 'chapterId', label: '章节 ID' },
  { name: 'chapterIndex', label: '章节序号' },
  { name: 'summary', label: '摘要', multiline: true }
]
const worldFields: EditDialogField[] = [
  { name: 'name', label: '名称' },
  { name: 'category', label: '分类', options: [
    { label: '地理', value: '地理' }, { label: '政治', value: '政治' }, { label: '经济', value: '经济' },
    { label: '文化', value: '文化' }, { label: '魔法', value: '魔法' }, { label: '科技', value: '科技' },
    { label: '历史', value: '历史' }, { label: '其他', value: '其他' }
  ] },
  { name: 'description', label: '描述', multiline: true }
]
const foreshadowingFields: EditDialogField[] = [
  { name: 'title', label: '标题' },
  { name: 'description', label: '描述', multiline: true },
  { name: 'plantedChapterId', label: '埋设章节 ID' },
  { name: 'plantedChapterIndex', label: '埋设章节序号' },
  { name: 'revealChapterId', label: '回收章节 ID' },
  { name: 'revealChapterIndex', label: '回收章节序号' },
  { name: 'status', label: '状态', options: [
    { label: '已埋设', value: 'planted' }, { label: '推进中', value: 'active' },
    { label: '已回收', value: 'resolved' }, { label: '已放弃', value: 'abandoned' }
  ] }
]
const editDialogTitles: Record<EditableKind, string> = {
  entity: '编辑实体', relation: '编辑关系', event: '编辑事件',
  world: '编辑世界观', foreshadowing: '编辑伏笔'
}
const editDialogFieldSets: Record<EditableKind, EditDialogField[]> = {
  entity: entityFields, relation: relationFields, event: eventFields,
  world: worldFields, foreshadowing: foreshadowingFields
}

function findEditable(kind: EditableKind, id: string): EditableRecord | undefined {
  if (kind === 'entity') return projectStore.memories.entities.find(item => item.id === id)
  if (kind === 'relation') return projectStore.memories.relations.find(item => item.id === id)
  if (kind === 'event') return projectStore.memories.events.find(item => item.id === id)
  if (kind === 'world') return projectStore.memories.world.find(item => item.id === id)
  return projectStore.memories.foreshadowing.find(item => item.id === id)
}

function openEditDialog(kind: EditableKind, id: string) {
  const record = findEditable(kind, id)
  if (!record) return
  const fields = editDialogFieldSets[kind]
  editDialog.value = {
    kind,
    id,
    title: editDialogTitles[kind],
    fields,
    values: Object.fromEntries(fields.map(field => [field.name, String((record as any)[field.name] ?? '')]))
  }
  editDialogVisible.value = true
}

function closeEditDialog() {
  editDialogVisible.value = false
  editDialog.value = emptyEditDialog
}

const editDialogTitle = computed(() => editDialog.value.title)

function saveEditDialog() {
  const dialog = editDialog.value
  if (!dialog) return
  const record = findEditable(dialog.kind, dialog.id)
  if (!record) {
    closeEditDialog()
    return
  }
  const locked = dialog.kind === 'entity'
    ? (record as MemoryEntity).lockedFields
    : (record as MemoryRelation | MemoryEvent | WorldEntry | Foreshadowing).locked
      ? ['*']
      : []
  const patch: Record<string, string> = {}
  for (const field of dialog.fields) {
    if (locked.includes(field.name) || locked.includes('*')) continue
    const value = dialog.values[field.name]?.trim() ?? ''
    if (!value) continue
    if (field.name === 'strength' || field.name.endsWith('Index')) {
      const parsed = Number(value)
      if (!Number.isFinite(parsed)) continue
      patch[field.name] = String(parsed)
      continue
    }
    patch[field.name] = value
  }
  if (!Object.keys(patch).length) {
    void appConfirm.alert('没有可保存的更改')
    return
  }
  if (dialog.kind === 'entity') projectStore.updateEntity(dialog.id, patch as Partial<MemoryEntity>)
  else if (dialog.kind === 'relation') projectStore.updateRelation(dialog.id, patch as Partial<MemoryRelation>)
  else if (dialog.kind === 'event') projectStore.updateEvent(dialog.id, patch as Partial<MemoryEvent>)
  else if (dialog.kind === 'world') projectStore.updateWorldEntry(dialog.id, patch as Partial<WorldEntry>)
  else projectStore.updateForeshadowing(dialog.id, patch as Partial<Foreshadowing>)
  closeEditDialog()
}

function editEntity(id: string) {
  openEditDialog('entity', id)
}

function createRelation(payload: { sourceId: string; targetId: string }) {
  const source = projectStore.memories.entities.find(entity => entity.id === payload.sourceId)
  const target = projectStore.memories.entities.find(entity => entity.id === payload.targetId)
  if (!source || !target) return
  openEditDialog('relation', projectStore.addRelation({
    sourceId: source.id,
    targetId: target.id,
    type: '关联',
    strength: 5,
    detail: '',
    evidence: [],
    locked: false
  }))
}

async function deleteEntity(id: string) {
  if (await appConfirm.confirm({ title: '删除实体', message: '确定删除此实体？', confirmText: '删除', danger: true })) {
    projectStore.deleteEntity(id)
  }
}

function editEvent(id: string) {
  openEditDialog('event', id)
}

async function deleteEvent(id: string) {
  if (await appConfirm.confirm({ title: '删除事件', message: '确定删除此事件？', confirmText: '删除', danger: true })) {
    projectStore.deleteEvent(id)
  }
}

function editWorld(id: string) {
  openEditDialog('world', id)
}

async function deleteWorld(id: string) {
  if (await appConfirm.confirm({ title: '删除世界观', message: '确定删除此世界观条目？', confirmText: '删除', danger: true })) {
    projectStore.deleteWorldEntry(id)
  }
}

function editRelation(id: string) {
  openEditDialog('relation', id)
}

async function deleteRelation(id: string) {
  if (await appConfirm.confirm({ title: '删除关系', message: '确定删除此关系？', confirmText: '删除', danger: true })) {
    projectStore.deleteRelation(id)
  }
}

function editForeshadowing(id: string) {
  openEditDialog('foreshadowing', id)
}

async function deleteForeshadowing(id: string) {
  if (await appConfirm.confirm({ title: '删除伏笔', message: '确定删除此伏笔？', confirmText: '删除', danger: true })) {
    projectStore.deleteForeshadowing(id)
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

async function exportMemory() {
  const json = exportFullJSON(projectStore.memories, '神意助手记忆导出')
  const filePath = await (window.electronAPI.dialogSaveFileAsync?.('memory-export.json') ?? window.electronAPI.dialogSaveFile('memory-export.json'))
  if (!filePath) return
  const ok = await window.electronAPI.dialogWriteFile(filePath, json)
  void appConfirm.alert(ok ? '记忆导出成功：' + filePath : '记忆导出失败')
}

function openHistory() {
  historyVisible.value = true
}

async function rollbackHistory(record: MemoryChangeRecord) {
  if (!await appConfirm.confirm({ title: '回滚记忆', message: `确定回滚到 ${record.timestamp} 的版本？当前记忆将被该版本覆盖。`, confirmText: '回滚', danger: true })) return
  const ok = projectStore.rollbackMemoryTo(record.id, `用户回滚到版本 ${record.id}`)
  historyVisible.value = false
  void appConfirm.alert(ok ? '记忆已回滚' : '未找到可回滚版本')
}

async function rollbackHistoryByChapter(chapterId: string, chapterIndex?: number) {
  const chapterLabel = chapterIndex !== undefined ? `第${chapterIndex}章` : chapterId
  if (!await appConfirm.confirm({ title: '按章节回滚记忆', message: `确定回滚到 ${chapterLabel} 完成后的最新版本？当前记忆将被该版本覆盖。`, confirmText: '回滚', danger: true })) return
  const ok = projectStore.rollbackMemoryByChapter(chapterId, chapterIndex, `用户按章节回滚 ${chapterId}`)
  historyVisible.value = false
  void appConfirm.alert(ok ? '记忆已按章节回滚' : '未找到该章节的回滚版本')
}

const profileExportEntities = computed(() => projectStore.memories.entities)
const memoryHistory = computed(() => projectStore.getMemoryChangeHistory())

function memoryExportContext(): MemoryExportContext {
  const chapters: NonNullable<MemoryExportContext['chapters']> = {}
  for (const volume of projectStore.volumes || []) {
    const volumeId = volume.id || volume.name
    chapters[volumeId] = projectStore.chapters[volumeId] || []
  }
  return { volumes: projectStore.volumes || [], chapters }
}

function safeExportName(name: string) {
  return (name || 'memory-export').replace(/[\\/:*?"<>|]/g, '_')
}

async function saveExportFile(fileName: string, json: string, label: string) {
  const filePath = await (window.electronAPI.dialogSaveFileAsync?.(fileName) ?? window.electronAPI.dialogSaveFile(fileName))
  if (!filePath) return
  const ok = await window.electronAPI.dialogWriteFile(filePath, json)
  void appConfirm.alert(ok ? label + '导出成功：' + filePath : label + '导出失败')
}

function exportCharacterProfileUI() {
  if (projectStore.memories.entities.length === 0) {
    void appConfirm.alert('暂无可导出的实体')
    return
  }
  profileExportVisible.value = true
}

async function exportCharacterProfileEntity(entityId: string) {
  const entity = projectStore.memories.entities.find(item => item.id === entityId)
  if (!entity) {
    profileExportVisible.value = false
    void appConfirm.alert('未找到对应实体数据')
    return
  }
  const json = exportCharacterProfile(projectStore.memories, entityId)
  profileExportVisible.value = false
  if (!json) {
    void appConfirm.alert('角色档案导出失败')
    return
  }
  await saveExportFile(safeExportName(entity.name) + '.shenyi-character-profile.json', json, '角色档案')
}

async function exportStorylineUI() {
  await saveExportFile('shenyi-storyline.json', exportStoryline(projectStore.memories, memoryExportContext()), '故事线')
}

async function exportTimelineUI() {
  await saveExportFile('shenyi-timeline.json', exportTimeline(projectStore.memories), '时间线')
}

async function exportSceneUI() {
  await saveExportFile('shenyi-scene.json', exportScene(projectStore.memories, memoryExportContext()), '场景包')
}

async function importMemory(mode: 'merge' | 'replace' = 'merge') {
  const path = await (window.electronAPI.dialogOpenFileAsync?.() ?? window.electronAPI.dialogOpenFile())
  if (!path) return
  const read = await (window.electronAPI.dialogReadFileAsync?.(path) ?? window.electronAPI.dialogReadFile(path))
  if (!read || !read.content) {
    void appConfirm.alert('读取文件失败')
    return
  }
  const result = importFullJSON(read.content)
  if (!result.success || !result.memory) {
    void appConfirm.alert('导入失败：' + (result.error || '未知错误'))
    return
  }
  if (mode === 'replace') {
    const backupKey = storageKey('memoryBackup_' + projectStore.currentProjectId)
    await window.electronAPI.storageWrite(backupKey, createMemoryBackup(projectStore.memories))
    if (!await appConfirm.confirm({ title: '覆盖导入记忆', message: '覆盖导入会删除当前项目已有记忆，只保留文件内容。确认覆盖？', confirmText: '覆盖', danger: true })) return
    await projectStore.recordMemoryChange(result.memory, {
      chapterId: 'memory-import-replace',
      reason: '用户主动选择覆盖导入记忆'
    })
    void appConfirm.alert('记忆覆盖导入成功')
    return
  }
  if (!await appConfirm.confirm('导入将合并到当前记忆，已有条目不会被覆盖。确认继续？')) return
  const merged = mergeImportedMemory(projectStore.memories, result.memory)
  await projectStore.recordMemoryChange(merged.memory, {
    chapterId: 'memory-import-merge',
    reason: `合并导入记忆：新增 ${merged.added} 项，跳过 ${merged.skipped} 项`
  })
  void appConfirm.alert(`记忆合并导入成功：新增 ${merged.added} 项，跳过 ${merged.skipped} 项`)
}

async function importCharacterCard() {
  const path = await (window.electronAPI.dialogOpenFileAsync?.() ?? window.electronAPI.dialogOpenFile())
  if (!path) return
  const read = await (window.electronAPI.dialogReadFileAsync?.(path) ?? window.electronAPI.dialogReadFile(path))
  if (!read || !read.content) {
    void appConfirm.alert('读取文件失败')
    return
  }
  const result = importCharacterCardV3(read.content)
  if (!result.success || !result.entity) {
    void appConfirm.alert('角色卡导入失败：' + (result.error || '未知错误'))
    return
  }
  projectStore.addEntity(result.entity)
  void appConfirm.alert('角色卡导入成功：' + result.entity.name)
}

async function exportEntityCard(item: any) {
  const entity = projectStore.memories.entities.find((e: any) => e.name === item.key || e.id === item.key)
  if (!entity) {
    void appConfirm.alert('未找到对应实体数据')
    return
  }
  const json = exportCharacterCardV3(entity)
  const safeName = (entity.name || '角色卡').replace(/[\\/:*?"<>|]/g, '_')
  const filePath = await (window.electronAPI.dialogSaveFileAsync?.(safeName + '.chara-card-v3.json') ?? window.electronAPI.dialogSaveFile(safeName + '.chara-card-v3.json'))
  if (!filePath) return
  const ok = await window.electronAPI.dialogWriteFile(filePath, json)
  void appConfirm.alert(ok ? '角色卡导出成功：' + filePath : '角色卡导出失败')
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
    void appConfirm.alert('该记忆暂无对应正文来源')
    return
  }
  const chapter = findChapter(chapterId)
  if (!chapter) {
    void appConfirm.alert('未找到该记忆对应的章节')
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
  background: var(--memory-panel-bg);
  z-index: 100;
  display: flex;
  flex-direction: column;
}
.mem-header {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-6);
  background: var(--memory-panel-header-bg);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.mem-header h4 { font-size: var(--font-size-md); font-weight: 600; margin: 0; }
.mem-header h4 { white-space: nowrap; flex-shrink: 0; margin-right: 12px; }
.mem-header-actions { display: flex; align-items: center; gap: var(--space-4); flex: 1; min-width: 0; }
 .mem-view-tabs { display: flex; align-items: center; gap: var(--space-3); flex: 1; min-width: 0; }
.mem-tab-btn {
  padding: var(--space-5) var(--space-8); border: none; background: transparent;
  flex: 1; text-align: center;
  color: var(--text-secondary); cursor: pointer; border-radius: var(--radius-sm);
  font-size: var(--font-size-md); white-space: nowrap; transition: all var(--duration-fast);
}
.mem-tab-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.mem-tab-btn.active { background: var(--memory-card-active-bg); color: var(--memory-card-active-border); box-shadow: inset 0 -2px 0 var(--memory-card-active-border); font-weight: 600; }
.mem-tab-btn.active::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 8px;
  right: 8px;
  height: 2px;
  background: var(--memory-card-active-border);
  border-radius: var(--radius-xs);
}
.mem-tab-btn { position: relative; }
.mem-header-divider { width: 1px; height: 20px; background: var(--border-color); flex-shrink: 0; }
.mem-more-menu { position: relative; flex-shrink: 0; }
.mem-more-btn {
  padding: var(--space-5) 1var(--space-4); border: none; background: transparent;
  color: var(--text-secondary); cursor: pointer; border-radius: var(--radius-xs);
  font-size: var(--font-size-md); white-space: nowrap; transition: all var(--duration-fast);
}
.mem-more-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.mem-more-dropdown {
  position: absolute; top: 100%; right: 0; margin-top: 4px;
  background: var(--memory-card-bg); border: 1px solid var(--memory-card-border);
  border-radius: var(--radius-sm); box-shadow: var(--shadow-panel-sm);
  display: flex; flex-direction: column; gap: var(--space-1); padding: var(--space-2); z-index: 2000; min-width: 120px;
}
.mem-more-dropdown button {
  padding: var(--space-4) var(--space-5); border: none; background: transparent;
  color: var(--text-primary); cursor: pointer; border-radius: var(--radius-xs);
  font-size: var(--font-size-md); text-align: left; white-space: nowrap;
}
.mem-more-dropdown button:hover { background: var(--bg-hover); color: var(--accent); }
.mem-body { flex: 1; display: flex; overflow: hidden; }
.mem-graph-content { flex: 1; min-width: 0; min-height: 0; padding: var(--space-5) var(--space-6); overflow: hidden; }
.mem-sidebar {
  width: 160px; border-right: 1px solid var(--border-color);
  padding: var(--space-4); display: flex; flex-direction: column; gap: var(--space-2); overflow-y: auto;
}
.mem-cat-list { display: flex; flex-direction: column; gap: var(--space-1); flex: 1; }
.mem-cat-btn {
  text-align: left; padding: var(--space-3) var(--space-5); border: none; background: transparent;
  color: var(--text-secondary); cursor: pointer; border-radius: var(--radius-xs); font-size: var(--font-size-md);
}
.mem-cat-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.mem-cat-btn.active { background: var(--memory-card-active-bg); color: var(--memory-card-active-border); font-weight: 500; }
.full-width { width: 100%; }
.mem-content { flex: 1; overflow-y: auto; padding: var(--space-4); }
.mem-content-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 8px; font-size: var(--font-size-md); color: var(--text-secondary);
}
.mem-toolbar { display:flex; align-items:center; gap:var(--space-3); margin-bottom:var(--space-3); flex-wrap:wrap; }
.mem-toolbar input { flex:1; min-width:160px; padding:var(--space-2) var(--space-4); border:1px solid var(--border-color); border-radius:var(--radius-xs); background:var(--bg-input,var(--bg-primary)); color:var(--text-primary); }
.mem-toolbar select { padding:var(--space-2) var(--space-3); border:1px solid var(--border-color); border-radius:var(--radius-xs); background:var(--bg-input,var(--bg-primary)); color:var(--text-primary); }
.mem-stats { display:flex; flex-wrap:wrap; gap:var(--space-3); margin-bottom:var(--space-4); }
.mem-stat { display:flex; align-items:center; gap:var(--space-3); padding:var(--space-2) var(--space-4); border:1px solid var(--border-color); border-radius:var(--radius-sm); background:var(--bg-card,var(--bg-secondary)); color:var(--text-secondary); cursor:pointer; }
.mem-stat strong { color:var(--text-primary); }
.mem-status { font-size:var(--font-size-xs); padding:var(--space-1) var(--space-3); border-radius:var(--radius-xs); }
.mem-status.pending { background:rgba(245,158,11,.18); color:#f59e0b; }
.mem-status.confirmed { background:rgba(16,185,129,.18); color:#10b981; }
.mem-status.conflicted { background:rgba(239,68,68,.18); color:#ef4444; }
.mem-status.stale, .mem-status.rejected { background:var(--bg-hover); color:var(--text-secondary); }
.mem-conflict-inline { margin:var(--space-2) 0; }
.mem-blacklist-box, .mem-merge-box, .mem-conflict-box { position:relative; width:min(520px,88vw); }
.mem-blacklist-box > .btn-close, .mem-merge-box > .btn-close { position:absolute; top:var(--space-4); right:var(--space-4); }
.mem-blacklist-row, .mem-merge-row { display:flex; align-items:center; justify-content:space-between; gap:var(--space-4); }
.mem-conflict-list { display:flex; flex-direction:column; gap:var(--space-4); max-height:50vh; overflow:auto; }
.mem-conflict-value { border:1px solid var(--border-color); border-radius:var(--radius-sm); padding:var(--space-3); }
.mem-conflict-value > span { display:block; color:var(--text-primary); font-weight:600; }
.mem-conflict-value div { display:grid; grid-template-columns:1fr 1fr; gap:var(--space-3); margin-top:var(--space-2); }
.mem-conflict-value label { color:var(--text-secondary); font-size:var(--font-size-sm); }
.mem-conflict-value p { margin:0; white-space:pre-wrap; overflow-wrap:anywhere; }
.mem-list { display: flex; flex-direction: column; gap: var(--space-4); }
.empty-hint { color: var(--memory-empty-text); text-align: center; padding: var(--space-8); font-size: var(--font-size-md); }
.mem-item-header { display: flex; align-items: center; gap: var(--space-4); margin-bottom: 4px; }
.mem-select { display: inline-flex; align-items: center; gap: var(--space-2); font-size: var(--font-size-xs); color: var(--text-secondary); }
.mem-item-key { font-weight: 600; font-size: var(--font-size-md); }
.mem-item-cat {
  font-size: var(--font-size-xs); padding: var(--space-1) var(--space-3); border-radius: var(--radius-xs);
  background: var(--bg-hover); color: var(--text-secondary);
}
.mem-item-actions { margin-left: auto; display: flex; gap: var(--space-2); }
.mem-item-content { font-size: var(--font-size-md); color: var(--text-primary); line-height: 1.5; white-space: pre-wrap; }
.mem-item-date { font-size: var(--font-size-xs); color: var(--text-secondary); margin-top: 4px; }
.mem-form {
  border: 1px solid var(--accent); border-radius: var(--radius-sm); padding: var(--space-5);
  background: var(--bg-secondary); margin-bottom: 8px;
}
.mem-form h4 { margin: 0 0 var(--space-4) 0; font-size: var(--font-size-md); }
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
.mem-inline-box { background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: var(--space-8); width: min(360px, 80vw); display: flex; flex-direction: column; gap: var(--space-5); }
.mem-inline-box h3 { margin: 0; font-size: var(--font-size-lg); }
.mem-profile-export-list { display: flex; flex-direction: column; gap: var(--space-2); max-height: 320px; overflow-y: auto; margin: 4px 0; }
.mem-profile-export-list button { text-align: left; padding: var(--space-2) var(--space-3); border-radius: var(--radius-xs); background: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-primary); cursor: pointer; }
.mem-profile-export-list button:hover { background: var(--bg-hover); }
.mem-input { width: 100%; padding: var(--space-3) var(--space-5); border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-primary); color: var(--text-primary); font-size: var(--font-size-md); outline: none; box-sizing: border-box; }
.mem-input:focus { border-color: var(--accent); }
.mem-edit-dialog { display:flex; flex-direction:column; gap: var(--space-5); width:min(520px,88vw); max-height:82vh; padding: 2var(--space-1); background:var(--bg-tertiary); border:1px solid var(--border-color); border-radius:var(--radius-lg); }
.mem-edit-dialog h3 { margin: 0; font-size:var(--font-size-lg); }
.mem-edit-scroll { overflow:auto; min-height:0; }
.mem-inline-actions { display:flex; justify-content:flex-end; gap: var(--space-4); }
.mem-inline-actions { display: flex; gap: var(--space-4); justify-content: flex-end; }
.mem-view-tabs { overflow-x: auto; -webkit-overflow-scrolling: touch; white-space: nowrap; scrollbar-width: thin; }
.mem-view-tabs::-webkit-scrollbar { height: 2px; }
.mem-view-tabs::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: var(--radius-xs); }
.mem-tab-btn { white-space: nowrap; flex-shrink: 0; padding: var(--space-3) var(--space-5); font-size: var(--font-size-sm); }
.mem-header { overflow: visible; }
@media (max-width: 760px) {
  .mem-view-tabs { gap: var(--space-2); }
  .mem-tab-btn { padding: var(--space-2) var(--space-4); font-size: var(--font-size-xs); }
  .mem-header-actions { gap: var(--space-2); }
}
</style>

