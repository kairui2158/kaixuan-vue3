<template>
  <div id="memory-panel" class="memory-panel">
    <div class="mem-header">
      <h4>记忆管理</h4>
      <button id="btn-close-mem" class="btn-close" @click="$emit('close')">&times;</button>
    </div>
    <div class="mem-body">
      <div class="mem-sidebar">
        <div id="mem-cat-list" class="mem-cat-list">
          <button class="mem-cat-btn" :class="{active: selectedCat==='all'}" @click="selectedCat='all'">全部</button>
          <button v-for="cat in projectStore.memories.categories" :key="cat" class="mem-cat-btn" :class="{active: selectedCat===cat}" @click="selectedCat=cat">{{ cat }}</button>
        </div>
        <button id="btn-add-mem-cat" class="btn-sm btn-secondary full-width" @click="showCatInput = true">+ 新增分类</button>
      </div>
      <div class="mem-content">
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
                <option v-for="cat in projectStore.memories.categories" :key="cat" :value="cat">{{ cat }}</option>
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
            <div class="mem-item-header">
              <span class="mem-item-key">{{ item.key }}</span>
              <span class="mem-item-cat">{{ item.category }}</span>
              <div class="mem-item-actions">
                <button class="btn-sm btn-secondary" @click="showForm(getRealIndex(idx))">编辑</button>
                <button class="btn-sm btn-danger" @click="deleteItem(getRealIndex(idx))">删除</button>
              </div>
            </div>
            <div class="mem-item-content">{{ item.content }}</div>
            <div class="mem-item-date">{{ item.created || '' }}</div>
          </div>
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { useProjectStore } from '../../stores/project'

const projectStore = useProjectStore()
defineEmits<{ close: [] }>()

const selectedCat = ref('all')
const showingForm = ref(false)
const editingIdx = ref(-1)
const formData = ref({ key: '', category: '', content: '' })
const showCatInput = ref(false)
const newCatName = ref('')
const catInputRef = ref<HTMLInputElement | null>(null)

const filteredItems = computed(() => {
  const items = projectStore.memories.items
  if (selectedCat.value === 'all') return items
  return items.filter((it: any) => it.category === selectedCat.value)
})

function getRealIndex(filteredIdx: number): number {
  if (selectedCat.value === 'all') return filteredIdx
  const item = filteredItems.value[filteredIdx]
  return projectStore.memories.items.indexOf(item)
}

function showForm(idx: number) {
  editingIdx.value = idx
  if (idx >= 0) {
    const item = projectStore.memories.items[idx]
    formData.value = { key: item.key, category: item.category, content: item.content }
  } else {
    formData.value = { key: '', category: projectStore.memories.categories[0] || '', content: '' }
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
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.mem-header h3 { font-size: 14px; font-weight: 600; margin: 0; }
.mem-body { flex: 1; display: flex; overflow: hidden; }
.mem-sidebar {
  width: 160px; border-right: 1px solid var(--border-color);
  padding: 8px; display: flex; flex-direction: column; gap: 4px; overflow-y: auto;
}
.mem-cat-list { display: flex; flex-direction: column; gap: 2px; flex: 1; }
.mem-cat-btn {
  text-align: left; padding: 6px 12px; border: none; background: transparent;
  color: var(--text-secondary); cursor: pointer; border-radius: 4px; font-size: 13px;
}
.mem-cat-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.mem-cat-btn.active { background: var(--bg-hover); color: var(--accent); font-weight: 500; }
.full-width { width: 100%; }
.mem-content { flex: 1; overflow-y: auto; padding: 8px; }
.mem-content-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 8px; font-size: 13px; color: var(--text-secondary);
}
.mem-list { display: flex; flex-direction: column; gap: 8px; }
.empty-hint { color: var(--text-secondary); text-align: center; padding: 24px; font-size: 13px; }
.mem-item-header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.mem-item-key { font-weight: 600; font-size: 13px; }
.mem-item-cat {
  font-size: 11px; padding: 1px 6px; border-radius: 3px;
  background: var(--bg-hover); color: var(--text-secondary);
}
.mem-item-actions { margin-left: auto; display: flex; gap: 4px; }
.mem-item-content { font-size: 13px; color: var(--text-primary); line-height: 1.5; white-space: pre-wrap; }
.mem-item-date { font-size: 11px; color: var(--text-secondary); margin-top: 4px; }
.mem-form {
  border: 1px solid var(--accent); border-radius: 6px; padding: 12px;
  background: var(--bg-secondary); margin-bottom: 8px;
}
.mem-form h4 { margin: 0 0 8px 0; font-size: 14px; }
.form-group { margin-bottom: 8px; }
.form-group label { display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 2px; }
.form-group input, .form-group select, .form-group textarea {
  width: 100%; padding: 4px 8px; border: 1px solid var(--border-color);
  border-radius: 4px; background: var(--bg-primary);
  color: var(--text-primary); font-size: 13px; outline: none;
}
.form-group input:focus, .form-group select:focus, .form-group textarea:focus {
  border-color: var(--accent);
}
.mem-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: var(--bg-overlay); display: flex; align-items: center; justify-content: center; z-index: 2000; }
.mem-inline-box { background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 12px; padding: 24px; width: min(360px, 80vw); display: flex; flex-direction: column; gap: 12px; }
.mem-inline-box h3 { margin: 0; font-size: 16px; }
.mem-input { width: 100%; padding: 6px 10px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary); font-size: 13px; outline: none; box-sizing: border-box; }
.mem-input:focus { border-color: var(--accent); }
.mem-inline-actions { display: flex; gap: 8px; justify-content: flex-end; }
</style>
