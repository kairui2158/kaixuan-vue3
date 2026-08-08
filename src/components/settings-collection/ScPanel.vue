<template>
  <div class="sc-overlay" @click.self="$emit('close')">
    <div class="sc-content">
      <div class="sc-header">
        <span>设定合集</span>
        <button class="modal-close" @click="$emit('close')">x</button>
      </div>
      <div class="sc-body">
        <div class="sc-sidebar">
          <button class="btn-add" @click="addCategory">+ 新建分类</button>
          <div v-for="cat in categories" :key="cat" class="sc-cat-item" :class="{ active: selectedCategory === cat }" @click="selectedCategory = cat">
            {{ cat }}
          </div>
        </div>
        <div class="sc-main">
          <div class="sc-toolbar">
            <button class="btn-primary" @click="addEntry">+ 新建条目</button>
            <button class="btn-secondary" @click="bindEntry" v-if="selectedEntry">绑定章节</button>
          </div>
          <div class="sc-entries">
            <div v-for="entry in filteredEntries" :key="entry.name" class="sc-card" :class="{ active: selectedEntry?.name === entry.name }" @click="selectedEntry = entry">
              <div class="sc-card-name">{{ entry.name }}</div>
              <div class="sc-card-cat">{{ entry.category }}</div>
            </div>
          </div>
          <div v-if="selectedEntry" class="sc-editor">
            <input v-model="selectedEntry.name" class="sc-input" placeholder="名称" />
            <select v-model="selectedEntry.category" class="sc-input">
              <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
            </select>
            <textarea v-model="attrsText" class="sc-textarea" placeholder="属性 (JSON格式)" rows="8"></textarea>
          </div>
        </div>
      </div>
      <div v-if="showBindModal" class="bind-modal" @click.self="showBindModal = false">
        <div class="bind-content">
          <h3>绑定到章节</h3>
          <div class="bind-list">
            <label v-for="ch in allChapters" :key="ch.id">
              <input type="checkbox" :value="ch.id" v-model="bindTargets" /> {{ ch.title }}
            </label>
          </div>
          <button class="btn-primary" @click="confirmBind">确认绑定</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useProjectStore } from '../../stores/project'

defineEmits<{ close: [] }>()

const projectStore = useProjectStore()
const selectedCategory = ref('')
const selectedEntry = ref<any>(null)
const showBindModal = ref(false)
const bindTargets = ref<string[]>([])

const categories = computed(() => {
  const cats = new Set<string>()
  projectStore.settings.forEach(s => cats.add(s.category || '其他'))
  return Array.from(cats)
})

const filteredEntries = computed(() => {
  if (!selectedCategory.value) return projectStore.settings
  return projectStore.settings.filter(s => s.category === selectedCategory.value)
})

const allChapters = computed(() => {
  const result: any[] = []
  for (const vol of projectStore.volumes) {
    const chs = projectStore.chapters[vol.id || vol.name] || []
    result.push(...chs)
  }
  return result
})

const attrsText = computed({
  get() {
    try { return JSON.stringify(selectedEntry.value?.attrs || {}, null, 2) } catch { return '{}' }
  },
  set(v: string) {
    if (selectedEntry.value) {
      try { selectedEntry.value.attrs = JSON.parse(v) } catch {}
    }
  }
})

function addCategory() {
  const name = prompt('分类名称')
  if (name) {
    projectStore.settings.push({ name: '新条目', category: name, attrs: {} })
    projectStore.saveProject()
    selectedCategory.value = name
  }
}

function addEntry() {
  const cat = selectedCategory.value || '其他'
  projectStore.settings.push({ name: '新条目', category: cat, attrs: {} })
  projectStore.saveProject()
}

function bindEntry() {
  showBindModal.value = true
}

function confirmBind() {
  showBindModal.value = false
  projectStore.saveProject()
}
</script>

<style scoped>
.sc-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: var(--bg-overlay); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.sc-content { width: 900px; height: 600px; background: var(--bg-glass); border: 1px solid var(--border-color); border-radius: 12px; box-shadow: var(--shadow-lg); display: flex; flex-direction: column; }
.sc-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 24px; border-bottom: 1px solid var(--border-color); font-size: 16px; font-weight: 600; }
.modal-close { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 18px; }
.modal-close:hover { color: var(--danger); }
.sc-body { flex: 1; display: flex; overflow: hidden; }
.sc-sidebar { width: 180px; padding: 12px 8px; border-right: 1px solid var(--border-color); overflow-y: auto; }
.btn-add { width: 100%; background: var(--accent-gradient); color: var(--text-on-accent); border: none; border-radius: 6px; padding: 6px; cursor: pointer; font-size: 12px; margin-bottom: 8px; }
.sc-cat-item { padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; color: var(--text-secondary); }
.sc-cat-item:hover { background: var(--bg-hover); }
.sc-cat-item.active { background: var(--bg-hover); color: var(--accent); }
.sc-main { flex: 1; display: flex; flex-direction: column; padding: 12px; overflow: hidden; }
.sc-toolbar { display: flex; gap: 8px; margin-bottom: 12px; }
.btn-primary { background: var(--accent-gradient); color: var(--text-on-accent); border: none; border-radius: 6px; padding: 6px 12px; cursor: pointer; font-size: 12px; }
.btn-secondary { background: transparent; color: var(--text-secondary); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 12px; cursor: pointer; font-size: 12px; }
.sc-entries { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; overflow-y: auto; }
.sc-card { width: 140px; padding: 10px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 8px; cursor: pointer; }
.sc-card:hover { border-color: var(--border-light); }
.sc-card.active { border-color: var(--accent); }
.sc-card-name { font-size: 13px; font-weight: 500; }
.sc-card-cat { font-size: 10px; color: var(--text-muted); margin-top: 2px; }
.sc-editor { flex: 1; display: flex; flex-direction: column; gap: 8px; }
.sc-input { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; padding: 6px 10px; font-size: 13px; height: 32px; outline: none; }
.sc-textarea { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; padding: 8px; font-size: 12px; resize: vertical; outline: none; flex: 1; }
.bind-modal { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: var(--bg-overlay); display: flex; align-items: center; justify-content: center; }
.bind-content { background: var(--bg-tertiary); border-radius: 12px; padding: 24px; width: 400px; }
.bind-list { display: flex; flex-direction: column; gap: 4px; max-height: 300px; overflow-y: auto; margin: 16px 0; }
.bind-list label { font-size: 13px; color: var(--text-secondary); }
</style>
