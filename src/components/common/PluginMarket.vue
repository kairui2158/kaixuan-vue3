<template>
  <div id="plugin-market-modal" data-modal-id="plugin-market" class="modal-overlay" :style="{ zIndex: modalQueue.getZIndex('plugin-market') }" @click.self="$emit('close')">
    <div class="pm-content">
      <div class="pm-header">
        <h3>技能市场</h3>
        <button id="btn-close-market" class="pm-close" type="button" aria-label="关闭技能市场" @click="$emit('close')"><AppIcon name="x" /></button>
      </div>
      <div class="pm-body">
        <div class="market-tabs" role="tablist">
          <button id="btn-market-local" :class="{ active: activeTab === 'local' }" type="button" @click="activeTab = 'local'">本地技能</button>
          <button id="btn-market-github" :class="{ active: activeTab === 'github' }" type="button" @click="activeTab = 'github'">GitHub 搜索</button>
        </div>
        <div v-if="activeTab === 'local'" id="local-skill-list" class="market-results-container market-results-scroll">
          <EmptyState
            v-if="localSkills.length === 0"
            icon="market"
            title="本机还没有安装技能"
            description="切换到 GitHub 搜索并安装，或从设置中导入本地技能"
          />
          <div v-for="skill in localSkills" :key="skill.id" class="market-item">
            <div class="market-item-header">
              <span class="market-item-name">{{ skillStore.displaySkillName(skill) }}</span>
              <span class="market-item-stars">{{ skill.version || '未标注版本' }}</span>
            </div>
            <p class="market-item-desc">{{ skill.description || '暂无描述' }}</p>
            <div class="market-item-meta">
              <span class="market-item-lang">{{ sourceLabel(skill.source) }}</span>
              <span class="market-item-updated">{{ skill.updatedAt ? '更新: ' + formatDate(skill.updatedAt) : '未记录更新时间' }}</span>
            </div>
          </div>
        </div>
        <template v-else>
        <div id="github-status-bar" class="github-status-bar">
          <span class="github-status-text">GitHub: {{ hasToken ? '已登录' : '未登录' }}</span>
          <span class="github-status-actions">
            <button id="btn-set-token" class="btn-sm btn-mr-4" @click="showTokenInput = !showTokenInput">设置 Token</button>
            <button id="btn-token-help" class="btn-sm btn-outline" @click="showTokenHelp = !showTokenHelp">如何获取?</button>
          </span>
        </div>
        <div v-if="showTokenInput" id="token-input-area" class="token-input-area">
          <div class="token-help-text">请输入 GitHub Personal Access Token（需要 public_repo 权限）</div>
          <div class="token-input-row">
            <input type="password" v-model="tokenInput" placeholder="ghp_xxxxxxxxxxxx" id="github-token-input" class="token-input-field">
            <button id="btn-save-token" class="btn-primary btn-sm" @click="saveToken">保存并验证</button>
          </div>
        </div>
        <div v-if="showTokenHelp" id="token-help-area" class="token-help-area">
          <strong>如何获取 GitHub Token？</strong><br>
          1. 打开 github.com/settings/tokens<br>
          2. 点击 Generate new token (classic)<br>
          3. 勾选 public_repo 权限<br>
          4. 点击生成，复制 ghp_ 开头的字符串<br>
          5. 粘贴到上方输入框
        </div>
        <div class="market-search">
          <input type="text" v-model="searchQuery" placeholder="搜索 GitHub 仓库（例如：小说创作智能体）" id="market-search-input" class="market-search-input" @keydown.enter="searchGitHub">
          <select v-model="searchCategory" id="market-category" data-cat="all" class="select-standard">
            <option value="">全部</option>
            <option value="agent">智能体</option>
            <option value="skill">技能</option>
          </select>
          <button id="btn-market-search" class="btn-primary" @click="searchGitHub">搜索</button>
          <select v-model="searchSort" id="market-sort" class="market-sort-select">
            <option value="stars">按星标</option>
            <option value="updated">按更新</option>
            <option value="">最佳匹配</option>
          </select>
        </div>
        <div id="market-status" class="market-status-text">{{ statusText }}</div>
        <div id="market-results" class="market-results-container market-results-scroll">
          <div id="market-results-paginated">
            <div v-if="loading" class="market-loading">搜索中...</div>
            <EmptyState
              v-else-if="results.length === 0"
              icon="search"
              :title="hasSearched ? '未找到结果' : '还没有搜索'"
              :description="hasSearched ? '换一个关键词或分类，再搜索一次' : '输入关键词搜索 GitHub 上的智能体和技能'"
            />
            <div v-else>
              <div v-for="item in results" :key="item.id" class="market-item">
                <div class="market-item-header">
                  <a :href="item.html_url" target="_blank" class="market-item-name">{{ item.full_name }}</a>
                  <span class="market-item-stars">★ {{ item.stargazers_count }}</span>
                </div>
                <p class="market-item-desc">{{ item.description || '暂无描述' }}</p>
                <div class="market-item-meta">
                  <span v-if="item.language" class="market-item-lang">{{ item.language }}</span>
                  <span class="market-item-updated">更新: {{ formatDate(item.updated_at) }}</span>
                  <button class="btn-sm btn-primary" @click="openRepository(item)">打开仓库</button>
                </div>
              </div>
            </div>
          </div>
        </div>
        </template>
        <div v-if="totalPages > 1" id="market-pagination" class="market-pagination">
          <button id="btn-prev-page" class="btn-sm" :disabled="currentPage <= 1" @click="goToPage(currentPage - 1)">上一页</button>
          <span id="page-info" class="page-info-text">第 {{ currentPage }} 页</span>
          <button id="btn-next-page" class="btn-sm" :disabled="currentPage >= totalPages" @click="goToPage(currentPage + 1)">下一页</button>
        </div>
      </div>
    </div>
  </div>

</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { useSettingsStore } from '../../stores/settings'
import { useSkillStore } from '../../stores/skill'
import { useModalQueue } from '../../composables/useModalQueue'
import EmptyState from './EmptyState.vue'

defineEmits<{ close: [] }>()

const settingsStore = useSettingsStore()
const modalQueue = useModalQueue()
const tokenInput = ref('')
const hasToken = ref(false)
const showTokenInput = ref(false)
const showTokenHelp = ref(false)
const searchQuery = ref('')
const searchCategory = ref('')
const searchSort = ref('stars')
const statusText = ref('输入关键词搜索 GitHub 仓库')
const results = ref<any[]>([])
const loading = ref(false)
const hasSearched = ref(false)
const currentPage = ref(1)
const totalPages = ref(1)
const perPage = 10
const activeTab = ref<'local' | 'github'>('local')
const skillStore = useSkillStore()
const localSkills = computed(() => skillStore.skills)

function sourceLabel(source?: string) {
  if (source === 'package') return '技能包'
  if (source === 'external') return '外部文件夹'
  return '本机导入'
}

onMounted(() => {
  modalQueue.open('plugin-market')
  const saved = settingsStore.githubToken || ''
  if (saved) {
    tokenInput.value = saved
    hasToken.value = true
  }
})

onBeforeUnmount(() => {
  modalQueue.close('plugin-market')
})

function saveToken() {
  const token = tokenInput.value.trim()
  if (!token) return
  settingsStore.updateSettings({ githubToken: token })
  hasToken.value = true
  showTokenInput.value = false
  statusText.value = '[OK] Token 已保存'
}

async function searchGitHub() {
  const q = searchQuery.value.trim()
  if (!q) return
  if (!hasToken.value) {
    statusText.value = '[WARN] 请先设置 GitHub Token'
    showTokenInput.value = true
    return
  }
  loading.value = true
  hasSearched.value = true
  statusText.value = '搜索中...'
  try {
    let query = q
    if (searchCategory.value === 'agent') query += ' agent'
    else if (searchCategory.value === 'skill') query += ' skill'
    const sortParam = searchSort.value ? `&sort=${searchSort.value}` : ''
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&page=${currentPage.value}&per_page=${perPage}${sortParam}`
    const resp = await fetch(url, {
      headers: {
        'Authorization': `token ${settingsStore.githubToken || ''}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    })
    if (resp.status === 429) {
      statusText.value = '[WARN] API 限流，请稍后重试'
      loading.value = false
      return
    }
    if (!resp.ok) throw new Error('API 请求失败: ' + resp.status)
    const data = await resp.json()
    results.value = data.items || []
    totalPages.value = Math.min(Math.ceil((data.total_count || 0) / perPage), 10)
    statusText.value = `找到 ${data.total_count || 0} 个结果`
  } catch (e: any) {
    statusText.value = '[ERR] ' + (e.message || String(e))
  }
  loading.value = false
}

function goToPage(page: number) {
  if (page < 1 || page > totalPages.value) return
  currentPage.value = page
  searchGitHub()
}

function openRepository(item: any) {
  window.open(item.html_url, '_blank', 'noopener')
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
</script>

<style scoped>
.pm-content { width: min(800px, 92vw); max-height: 84vh; background: var(--bg-glass); border: 1px solid var(--border-color); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); display: flex; flex-direction: column; }
.pm-header { display: flex; align-items: center; justify-content: space-between; padding: var(--space-6) var(--space-8); border-bottom: 1px solid var(--border-color); }
.pm-header h3 { font-size: var(--font-size-lg); font-weight: 600; margin: 0; }
.pm-close { background: none; border: none; color: var(--text-secondary); cursor: pointer; font-size: var(--font-size-xxl); padding: var(--space-2); }
.pm-close:hover { color: var(--text-primary); }
.pm-body { flex: 1; overflow-y: auto; padding: var(--space-6) var(--space-8); }
.github-status-bar { display: flex; align-items: center; justify-content: space-between; padding: var(--space-4) var(--space-6); background: var(--bg-input); border: 1px solid var(--border-color); border-radius: var(--radius-md); margin-bottom: 12px; }
.market-tabs { display: flex; gap: var(--space-3); margin-bottom: 12px; }
.market-tabs button { border: 1px solid var(--border-color); background: var(--bg-input); color: var(--text-secondary); border-radius: var(--radius-sm); padding: var(--space-2) var(--space-5); cursor: pointer; }
.market-tabs button.active { color: var(--accent); border-color: var(--accent); font-weight: 600; }
.github-status-text { font-size: var(--font-size-md); color: var(--text-secondary); }
.github-status-actions { display: flex; gap: var(--space-4); }
.token-input-area { padding: var(--space-5); background: var(--bg-input); border: 1px solid var(--border-color); border-radius: var(--radius-md); margin-bottom: 12px; }
.token-help-text { font-size: var(--font-size-sm); color: var(--text-secondary); margin-bottom: 8px; }
.token-input-row { display: flex; gap: var(--space-4); }
.token-input-field { flex: 1; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: var(--space-2) var(--space-5); font-size: var(--font-size-md); height: var(--density-form-height); }
.token-help-area { padding: var(--space-5); background: var(--bg-input); border: 1px solid var(--border-color); border-radius: var(--radius-md); margin-bottom: 12px; font-size: var(--font-size-sm); color: var(--text-secondary); line-height: 1.8; }
.market-search { display: flex; gap: var(--space-4); margin-bottom: 12px; }
.market-search-input { flex: 1; background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: var(--space-2) var(--space-5); font-size: var(--font-size-md); height: var(--density-form-height); }
.select-standard, .market-sort-select { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 0 var(--space-4); font-size: var(--font-size-sm); height: var(--density-form-height); }
.market-status-text { font-size: var(--font-size-sm); color: var(--text-secondary); margin-bottom: 8px; }
.market-results-container { min-height: 200px; }
.market-results-scroll { max-height: 400px; overflow-y: auto; }
.market-loading { text-align: center; padding: var(--space-10); color: var(--text-secondary); font-size: var(--font-size-md); }
.market-item { padding: var(--space-5); border: 1px solid var(--border-color); border-radius: var(--radius-md); margin-bottom: 8px; }
.market-item-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.market-item-name { font-size: var(--font-size-md); font-weight: 600; color: var(--accent); text-decoration: none; }
.market-item-name:hover { text-decoration: underline; }
.market-item-stars { font-size: var(--font-size-sm); color: var(--text-secondary); }
.market-item-desc { font-size: var(--font-size-sm); color: var(--text-secondary); margin: var(--space-2) 0; line-height: 1.5; }
.market-item-meta { display: flex; align-items: center; gap: var(--space-5); font-size: var(--font-size-xs); color: var(--text-muted); }
.market-item-lang { background: var(--bg-input); padding: var(--space-1) var(--space-3); border-radius: var(--radius-xs); }
.market-pagination { display: flex; align-items: center; justify-content: center; gap: var(--space-5); padding: var(--space-5) 0; }
.page-info-text { font-size: var(--font-size-sm); color: var(--text-secondary); }
.btn-outline { background: transparent; color: var(--accent); border: 1px solid var(--accent); border-radius: var(--radius-sm); padding: var(--space-2) var(--space-5); font-size: var(--font-size-sm); cursor: pointer; }
.btn-mr-4 { margin-right: 4px; }
</style>
