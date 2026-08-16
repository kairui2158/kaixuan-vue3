<template>
  <div id="settings-collection-panel" class="sc-overlay" @click.self="$emit('close')">
    <div class="sc-content">
      <div class="sc-header">
        <span>设定合集</span>
        <button id="btn-close-sc" class="modal-close" @click="$emit('close')">x</button>
      </div>
     <div class="sc-body">
       <div id="sc-categories" class="sc-sidebar">
         <button id="btn-add-category" class="btn-add" @click="showCategoryInput = true">+ 新建分类</button>
         <div v-for="cat in categories" :key="cat" class="sc-cat-item" :class="{ active: selectedCategory === cat }" @click="selectedCategory = cat">
           {{ cat }}
         </div>
       </div>
       <div class="sc-main">
         <div class="sc-items-area">
          <div class="sc-items-header">
            <span id="sc-current-cat" class="">{{ selectedCategory || '全部' }}</span>
            <button id="btn-add-item" class="btn-primary btn-sm" @click="addEntry">+ 添加条目</button>
            <button id="btn-ai-gen-item" class="btn-secondary btn-sm btn-ml-4" @click="aiGenerateEntry">AI 生成</button>
          </div>
           <div id="sc-items-list" class="sc-entries">
             <div v-for="entry in filteredEntries" :key="entry.name" class="sc-item-card" :class="{ active: selectedEntry?.name === entry.name }" @click="selectedEntry = entry">
               <div class="sc-card-name">{{ entry.name }}</div>
               <div class="sc-card-cat">{{ entry.category }}</div>
             </div>
             <p v-if="filteredEntries.length === 0" class="empty-hint">选择分类后添加设定条目</p>
           </div>
         </div>
         <div id="sc-detail-area" v-if="selectedEntry" class="sc-detail-area">
           <div class="sc-detail-header">
             <span id="sc-detail-title" class="sc-detail-title">条目详情</span>
             <button class="btn-secondary btn-sm" @click="bindEntry">绑定章节</button>
             <button class="btn-danger btn-sm" @click="deleteEntry">删除</button>
             <button id="btn-close-sc-detail" class="modal-close" @click="selectedEntry = null">x</button>
           </div>
           <div id="sc-detail-content" class="sc-detail-content">
             <div class="form-group">
               <label>名称</label>
               <input v-model="selectedEntry.name" class="sc-input" placeholder="名称" />
             </div>
             <div class="form-group">
               <label>分类</label>
               <select v-model="selectedEntry.category" class="sc-input">
                 <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
               </select>
             </div>
             <div class="form-group">
               <label>属性 (JSON格式)</label>
               <textarea v-model="attrsText" class="sc-textarea" placeholder="属性 (JSON格式)" rows="8"></textarea>
             </div>
             <div class="form-actions">
               <button class="btn-primary" @click="saveEntry">保存</button>
             </div>
           </div>
         </div>
        </div>
      </div>
      <!-- 内联输入框弹窗替代 prompt -->
      <div v-if="showCategoryInput" class="sc-inline-input-overlay" @click.self="showCategoryInput = false">
        <div class="sc-inline-input-box">
          <h3>新建分类</h3>
          <input ref="catInputRef" v-model="newCategoryName" class="sc-input" placeholder="输入分类名称" @keyup.enter="confirmAddCategory" />
          <div class="sc-inline-actions">
            <button class="btn-secondary" @click="showCategoryInput = false">取消</button>
            <button class="btn-primary" @click="confirmAddCategory">确认</button>
          </div>
        </div>
      </div>
      <!-- 加载提示 -->
      <div v-if="aiLoading" class="sc-inline-input-overlay">
        <div class="sc-inline-input-box">
          <p>AI 生成中...</p>
        </div>
      </div>
      <div id="sc-bind-modal" v-if="showBindModal" class="bind-modal" @click.self="showBindModal = false">
        <div class="bind-content">
          <h3>绑定到章节</h3>
          <div id="sc-bind-tree" class="bind-list">
            <div id="sc-bind-item-name" class="bind-entry-name">{{ currentBindEntryName }}</div>
            <label v-for="ch in allChapters" :key="ch.id">
              <input type="checkbox" :value="ch.id" v-model="bindTargets" /> {{ ch.title }}
            </label>
          </div>
          <button id="btn-save-bind" class="btn-primary" @click="confirmBind">确认绑定</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { useProjectStore } from '../../stores/project'
import { useProviderStore } from '../../stores/provider'

defineEmits<{ close: [] }>()

const projectStore = useProjectStore()
const providerStore = useProviderStore()
const selectedCategory = ref('')
const selectedEntry = ref<any>(null)
const showBindModal = ref(false)
const bindTargets = ref<string[]>([])
const currentBindEntryName = ref('')
const showCategoryInput = ref(false)
const newCategoryName = ref('')
const catInputRef = ref<HTMLInputElement | null>(null)
const aiLoading = ref(false)

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

function confirmAddCategory() {
  const name = newCategoryName.value.trim()
  if (name) {
    projectStore.settings.push({ name: '新条目', category: name, attrs: {} })
    projectStore.saveProject()
    selectedCategory.value = name
  }
  showCategoryInput.value = false
  newCategoryName.value = ''
}

function addEntry() {
  const cat = selectedCategory.value || '其他'
  projectStore.settings.push({ name: '新条目', category: cat, attrs: {} })
  projectStore.saveProject()
}

function bindEntry() {
  if (selectedEntry.value) {
    currentBindEntryName.value = selectedEntry.value.name
    const existing = projectStore.settingBindings[currentBindEntryName.value]
    bindTargets.value = existing || []
  }
  showBindModal.value = true
}

function confirmBind() {
  showBindModal.value = false
  if (currentBindEntryName.value) {
    projectStore.settingBindings[currentBindEntryName.value] = [...bindTargets.value]
  }
  projectStore.saveProject()
}

function saveEntry() {
  if (selectedEntry.value) {
    projectStore.saveProject()
  }
}

function deleteEntry() {
  if (!selectedEntry.value) return
  const idx = projectStore.settings.findIndex(s => s.name === selectedEntry.value.name)
  if (idx >= 0) {
    projectStore.settings.splice(idx, 1)
    projectStore.saveProject()
    selectedEntry.value = null
  }
}

async function aiGenerateEntry() {
  const provider = providerStore.activeGenerateProvider
  if (!provider) {
    alert('请先配置API供应商')
    return
  }
  aiLoading.value = true
  const cat = selectedCategory.value || '其他'
  try {
    const baseUrl = provider.baseUrl.replace(/\/$/, '')
    const url = baseUrl.match(/\/v\d+$/) ? baseUrl + '/chat/completions' : baseUrl + '/v1/chat/completions'
    const model = provider.selectedModel || 'gpt-4o'
    const systemPrompt = '你是小说设定生成助手。请根据用户的要求生成设定条目，返回JSON格式：[{"name":"名称","category":"分类","attrs":{}}]'
    const userPrompt = `请为分类"${cat}"生成3个设定条目，包含名称、分类和属性。当前大纲：${projectStore.outlineText || '无'}`
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + provider.apiKey },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], stream: false, max_tokens: 128000 })
    })
    if (!resp.ok) throw new Error('API error: ' + resp.status)
    const data = await resp.json()
    const content = data.choices?.[0]?.message?.content || '[]'
    const entries = JSON.parse(content.match(/\[.*\]/s)?.[0] || '[]')
    entries.forEach((e: any) => {
      if (e.name && e.category) projectStore.settings.push({ name: e.name, category: e.category, attrs: e.attrs || {} })
    })
    projectStore.saveProject()
  } catch (e: any) {
    alert('AI生成失败: ' + e.message)
  } finally {
    aiLoading.value = false
  }
}
</script>

<style scoped>
.sc-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: var(--bg-overlay); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.sc-content { width: min(900px, 90vw); height: min(600px, 85vh); max-width: 900px; max-height: 85vh; background: var(--bg-glass); border: 1px solid var(--border-color); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); display: flex; flex-direction: column; }
.sc-header { display: flex; align-items: center; justify-content: space-between; padding: var(--space-6) var(--space-8); border-bottom: 1px solid var(--border-color); font-size: var(--font-size-lg); font-weight: 600; }
.sc-body { flex: 1; display: flex; overflow: hidden; }
.sc-sidebar { width: 180px; padding: 12px 8px; border-right: 1px solid var(--border-color); overflow-y: auto; flex-shrink: 0; }
.btn-add { width: 100%; background: var(--accent); color: var(--text-on-accent); border: none; border-radius: var(--radius-sm); padding: 6px; cursor: pointer; font-size: var(--font-size-sm); margin-bottom: 8px; }
.sc-cat-item { padding: 6px 12px; border-radius: var(--radius-xs); cursor: pointer; font-size: var(--font-size-sm); color: var(--text-secondary); }
.sc-cat-item:hover { background: var(--bg-hover); }
.sc-cat-item.active { background: var(--bg-hover); color: var(--accent); }
.sc-main { flex: 1; display: flex; overflow: hidden; }
.sc-items-area { flex: 1; display: flex; flex-direction: column; padding: 12px; overflow: hidden; min-width: 0; }
.sc-items-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.sc-current-cat { font-size: var(--font-size-md); font-weight: 600; color: var(--text-primary); }
.sc-entries { display: flex; flex-direction: column; gap: 4px; overflow-y: auto; flex: 1; }
.sc-item-card { padding: var(--space-4) var(--space-6); border-radius: var(--radius-sm); cursor: pointer; border: 1px solid var(--border-color); background: var(--bg-card, var(--bg-elevated)); transition: border-color 0.15s, background 0.15s; }
.sc-card-name { font-size: var(--font-size-md); font-weight: 500; }
.sc-card-cat { font-size: var(--font-size-xxs); color: var(--text-muted); margin-top: 2px; }
.sc-item-card:hover { border-color: var(--accent); background: var(--bg-hover); }
.sc-item-card.active { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
.empty-hint { padding: 24px 12px; text-align: center; color: var(--text-muted); font-size: var(--font-size-sm); line-height: 1.8; }
.sc-detail-area { width: 320px; border-left: 1px solid var(--border-color); display: flex; flex-direction: column; flex-shrink: 0; overflow: hidden; }
.sc-detail-header { display: flex; align-items: center; gap: 8px; padding: var(--space-4) var(--space-6); border-bottom: 1px solid var(--border-color); font-size: var(--font-size-md); font-weight: 600; }
.sc-detail-title { flex: 1; color: var(--text-primary); }
.sc-detail-content { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.form-group { display: flex; flex-direction: column; gap: 4px; }
.form-group label { font-size: var(--font-size-sm); color: var(--text-secondary); font-weight: 500; }
.sc-editor { flex: 1; display: flex; flex-direction: column; gap: 8px; }
.sc-input { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--radius-xs); padding: 6px 10px; font-size: var(--font-size-md); height: var(--input-height, 34px); outline: none; }
.sc-input:focus { border-color: var(--accent); }
.sc-textarea { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--radius-xs); padding: 8px; font-size: var(--font-size-sm); resize: vertical; outline: none; flex: 1; }
.sc-textarea:focus { border-color: var(--accent); }
.form-actions { display: flex; gap: 8px; margin-top: 8px; }
.sc-inline-input-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: var(--bg-overlay); display: flex; align-items: center; justify-content: center; z-index: 3000; }
.sc-inline-input-box { background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 24px; width: min(360px, 80vw); display: flex; flex-direction: column; gap: 12px; }
.sc-inline-input-box h3 { margin: 0; font-size: var(--font-size-lg); }
.sc-inline-input-box p { margin: 0; font-size: var(--font-size-md); color: var(--text-secondary); text-align: center; }
.sc-inline-actions { display: flex; gap: 8px; justify-content: flex-end; }
.bind-modal { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: var(--bg-overlay); display: flex; align-items: center; justify-content: center; z-index: 2000; }
.bind-content { background: var(--bg-tertiary); border-radius: var(--radius-lg); padding: 24px; width: min(400px, 80vw); }
.bind-list { display: flex; flex-direction: column; gap: 4px; max-height: 300px; overflow-y: auto; margin: 16px 0; }
.bind-list label { font-size: var(--font-size-md); color: var(--text-secondary); }
</style>
