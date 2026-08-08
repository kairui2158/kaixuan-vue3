<template>
  <aside class="chapter-tree">
    <div class="tree-header">
      <span class="project-name">{{ projectStore.projectName || '未打开项目' }}</span>
      <button class="btn-sm btn-secondary" @click="$emit('navigate', 'pipeline')">生成</button>
      <button class="btn-sm btn-secondary" @click="openProjectList">项目</button>
    </div>
    <div class="tree-body">
      <div v-if="volumes.length === 0" class="empty-hint">
        点击右上角"项目"按钮<br>创建或打开你的小说项目
      </div>
      <div v-else class="tree-list" ref="treeList">
        <div v-for="vol in volumes" :key="vol.id || vol.name" class="volume-group">
          <div class="volume-item" @click="toggleVolume(vol)">
            <span class="vol-arrow" :class="{ expanded: expandedVolumes.has(vol.id || vol.name) }">&gt;</span>
            <span class="vol-name">{{ vol.name }}</span>
            <span class="vol-count">{{ getVolChapters(vol).length }}章</span>
          </div>
          <div v-if="expandedVolumes.has(vol.id || vol.name)" class="chapter-list">
            <div
              v-for="ch in getVolChapters(vol)"
              :key="ch.id"
              class="chapter-item"
              :class="{ active: ch.id === activeChapterId }"
              @click="selectChapter(ch)"
            >{{ ch.title }}</div>
          </div>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useProjectStore } from '../../stores/project'
import { useEditorStore } from '../../stores/editor'

const projectStore = useProjectStore()
const editorStore = useEditorStore()

const expandedVolumes = ref(new Set<string>())
const activeChapterId = ref<string | null>(null)
const treeList = ref<HTMLElement | null>(null)

const volumes = computed(() => projectStore.volumes || [])

function getVolChapters(vol: any) {
  const volId = vol.id || vol.name
  return projectStore.chapters[volId] || []
}

function toggleVolume(vol: any) {
  const id = vol.id || vol.name
  if (expandedVolumes.value.has(id)) {
    expandedVolumes.value.delete(id)
  } else {
    expandedVolumes.value.add(id)
  }
}

function selectChapter(ch: any) {
  activeChapterId.value = ch.id
  editorStore.openTab({
    id: 'tab-' + ch.id,
    title: ch.title,
    content: ch.body || '',
    chapterId: ch.id,
    isDirty: false
  })
}

function openProjectList() {
  // will open project management modal
}

defineEmits<{ navigate: [string] }>()
</script>

<style scoped>
.chapter-tree {
  width: 200px;
  min-width: 140px;
  max-width: 300px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow: hidden;
}
.tree-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-color);
  font-size: 12px;
}
.project-name {
  flex: 1;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.btn-sm {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  height: 22px;
  cursor: pointer;
}
.btn-secondary {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
}
.btn-secondary:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.tree-body {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}
.empty-hint {
  padding: 24px 12px;
  text-align: center;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.8;
}
.tree-list {
  padding: 0 4px;
}
.volume-group {
  margin-bottom: 2px;
}
.volume-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  cursor: pointer;
  border-radius: 4px;
  font-size: 12px;
  color: var(--text-primary);
}
.volume-item:hover {
  background: var(--bg-hover);
}
.vol-arrow {
  font-size: 10px;
  color: var(--text-muted);
  transition: transform 0.2s;
  display: inline-block;
}
.vol-arrow.expanded {
  transform: rotate(90deg);
}
.vol-name {
  flex: 1;
}
.vol-count {
  font-size: 10px;
  color: var(--text-muted);
}
.chapter-list {
  padding-left: 20px;
}
.chapter-item {
  padding: 3px 8px;
  cursor: pointer;
  border-radius: 4px;
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.chapter-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.chapter-item.active {
  background: var(--bg-hover);
  color: var(--accent);
}
</style>
