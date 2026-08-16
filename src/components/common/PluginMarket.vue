<template>
  <div id="plugin-market-modal" class="pm-overlay" @click.self="$emit('close')">
    <div class="pm-content">
      <div class="pm-header">
        <h3>插件市场</h3>
        <button id="btn-close-market" class="pm-close" @click="$emit('close')">&times;</button>
      </div>
      <div class="pm-body">
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
          <input type="text" v-model="searchQuery" placeholder="搜索 GitHub 仓库 (例如: novel writing agent)" id="market-search-input" class="market-search-input" @keydown.enter="searchGitHub">
          <select v-model="searchCategory" id="market-category" data-cat="all" class="market-category-select">
            <option value="">全部</option>
            <option value="agent">Agent</option>
            <option value="skill">Skill</option>
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
            <div v-else-if="results.length === 0" class="market-empty">{{ hasSearched ? '未找到结果' : '输入关键词搜索 GitHub 上的 Agent 和 Skill' }}</div>
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
                  <button class="btn-sm btn-primary" @click="installFromMarket(item)">安装</button>
                </div>
              </div>
            </div>
          </div>
        </div>
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
import { ref, onMounted } from 'vue'
import { useSettingsStore } from '../../stores/settings'

defineEmits<{ close: [] }>()

const settingsStore = useSettingsStore()
const tokenInput = ref('')
const hasToken = ref(false)
const showTokenInput = ref(false)
const showTokenHelp = ref(false)
const searchQuery = ref('')
const searchCategory = ref('')
const searchSort = ref('stars')
const statusText = ref('输入关键词搜索 GitHub 上的 Agent 和 Skill')
const results = ref<any[]>([])
const loading = ref(false)
const hasSearched = ref(false)
const currentPage = ref(1)
const totalPages = ref(1)
const perPage = 10

onMounted(() => {
  const saved = settingsStore.settings?.githubToken || ''
  if (saved) {
    tokenInput.value = saved
    hasToken.value = true
  }
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
        'Authorization': `token ${settingsStore.settings?.githubToken || ''}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    })
    if (resp.status === 429) {
      statusText.value = '[WARN] API 限流，请稍后重试'
      loading.value = false
      return
    }
    if (!resp.ok) throw new Error('API error: ' + resp.status)
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

function installFromMarket(item: any) {
  const name = item.full_name || item.name || 'unknown'
  statusText.value = `[OK] 开始安装: ${name}`
  window.dispatchEvent(new CustomEvent('plugin-install', { detail: { url: item.html_url, name } }))
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
</script>

<style scoped>
.pm-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: var(--bg-overlay, rgba(0,0,0,0.4)); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.pm-content { width: min(720px, 90vw); max-height: 80vh; background: var(--bg-glass, var(--bg-secondary)); border: 1px solid var(--border-color); border-radius: 12px; box-shadow: var(--shadow-lg, 0 8px 32px rgba(0,0,0,0.3)); display: flex; flex-direction: column; }
.pm-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 24px; border-bottom: 1px solid var(--border-color); }
.pm-header h3 { font-size: 16px; font-weight: 600; margin: 0; }
.pm-close { background: none; border: none; color: var(--text-secondary); cursor: pointer; font-size: 20px; padding: 4px; }
.pm-close:hover { color: var(--text-primary); }
.pm-body { flex: 1; overflow-y: auto; padding: 16px 24px; }
.github-status-bar { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: var(--bg-input, var(--bg-tertiary)); border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 12px; }
.github-status-text { font-size: 13px; color: var(--text-secondary); }
.github-status-actions { display: flex; gap: 8px; }
.token-input-area { padding: 12px; background: var(--bg-input, var(--bg-tertiary)); border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 12px; }
.token-help-text { font-size: 12px; color: var(--text-secondary); margin-bottom: 8px; }
.token-input-row { display: flex; gap: 8px; }
.token-input-field { flex: 1; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 4px 10px; font-size: 13px; height: 28px; outline: none; }
.token-help-area { padding: 12px; background: var(--bg-input, var(--bg-tertiary)); border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 12px; font-size: 12px; color: var(--text-secondary); line-height: 1.8; }
.market-search { display: flex; gap: 8px; margin-bottom: 12px; }
.market-search-input { flex: 1; background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 4px 10px; font-size: 13px; height: 28px; outline: none; }
.market-category-select, .market-sort-select { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 0 8px; font-size: 12px; height: 28px; outline: none; }
.market-status-text { font-size: 12px; color: var(--text-secondary); margin-bottom: 8px; }
.market-results-container { min-height: 200px; }
.market-results-scroll { max-height: 400px; overflow-y: auto; }
.market-loading, .market-empty { text-align: center; padding: 40px; color: var(--text-secondary); font-size: 13px; }
.market-item { padding: 12px; border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 8px; }
.market-item-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.market-item-name { font-size: 13px; font-weight: 600; color: var(--accent); text-decoration: none; }
.market-item-name:hover { text-decoration: underline; }
.market-item-stars { font-size: 12px; color: var(--text-secondary); }
.market-item-desc { font-size: 12px; color: var(--text-secondary); margin: 4px 0; line-height: 1.5; }
.market-item-meta { display: flex; align-items: center; gap: 12px; font-size: 11px; color: var(--text-tertiary); }
.market-item-lang { background: var(--bg-input); padding: 2px 6px; border-radius: 4px; }
.market-pagination { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 12px 0; }
.page-info-text { font-size: 12px; color: var(--text-secondary); }
.btn-outline { background: transparent; color: var(--accent); border: 1px solid var(--accent); border-radius: 6px; padding: 4px 12px; font-size: 12px; cursor: pointer; }
.btn-mr-4 { margin-right: 4px; }
</style>
