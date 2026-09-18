<template>
  <Teleport to="body">
    <div v-if="naming.visible.value" class="naming-overlay" :style="{ zIndex: modalQueue.getZIndex('ai-naming') }" @click.self="handleOverlayClick">
      <section
        class="naming-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="naming-modal-title"
        @keydown.esc="handleEsc"
      >
        <header class="naming-modal-header">
          <div class="naming-modal-title-row">
            <span class="naming-sigil">✦</span>
            <h3 id="naming-modal-title" class="naming-modal-title">AI 命名工作台</h3>
            <span class="naming-modal-sub">为你的世界，找到恰到好处的名字</span>
          </div>
          <button class="btn-close naming-close" aria-label="关闭" @click="handleClose">×</button>
        </header>

        <nav class="naming-tabs" aria-label="命名类别">
          <button
            v-for="t in allTypes"
            :key="t.value"
            class="naming-tab"
            :class="{ active: naming.currentType.value === t.value }"
            @click="naming.currentType.value = t.value"
          >{{ t.label }}</button>
        </nav>

        <div v-if="naming.currentType.value === 'custom'" class="naming-custom-type-row">
          <label class="naming-field-label">自定义类别名称</label>
          <input
            v-model="naming.customType.value"
            class="naming-input naming-custom-type-input"
            placeholder="如：阵法、丹药、妖兽…"
          />
        </div>

        <div class="naming-body">
          <aside class="naming-controls">
            <p class="naming-section-label">命名条件</p>

            <label class="naming-field-label">背景与上下文</label>
            <textarea
              v-model="naming.context.value"
              class="naming-input naming-context"
              placeholder="描述命名场景、世界观、角色特征…"
              rows="4"
            ></textarea>

            <label class="naming-field-label">命名风格</label>
            <input
              v-model="naming.style.value"
              class="naming-input"
              placeholder="如：东方奇幻 · 克制 · 有余韵"
            />

            <div class="naming-control-row">
              <div class="naming-control-cell">
                <label class="naming-field-label">数量</label>
                <div class="naming-stepper">
                  <button class="naming-step-btn" @click="naming.count.value = Math.max(1, naming.count.value - 1)">−</button>
                  <input
                    v-model.number="naming.count.value"
                    class="naming-step-input"
                    type="number"
                    min="1"
                    max="20"
                  />
                  <button class="naming-step-btn" @click="naming.count.value = Math.min(20, naming.count.value + 1)">＋</button>
                </div>
              </div>
              <div class="naming-control-cell">
                <label class="naming-field-label">字数</label>
                <input
                  v-model="naming.length.value"
                  class="naming-input naming-length-input"
                  placeholder="如 2-3"
                />
              </div>
            </div>

            <template v-if="naming.currentType.value === 'character'">
              <label class="naming-field-label">性别</label>
              <input v-model="naming.gender.value" class="naming-input" placeholder="男性 / 女性 / 无性别" />
              <label class="naming-field-label">种族</label>
              <input v-model="naming.species.value" class="naming-input" placeholder="人族 / 妖族 / 灵族…" />
            </template>

            <p class="naming-hint">将结合当前章节正文、项目大纲与已存在的人物名，尽量避免重名。</p>
          </aside>

          <section class="naming-results-area">
            <!-- 子标签页：生成 / 收藏 / 历史 -->
            <div class="naming-sub-tabs">
              <button class="naming-sub-tab" :class="{ active: subTab === 'generate' }" @click="subTab = 'generate'">生成</button>
              <button class="naming-sub-tab" :class="{ active: subTab === 'favorites' }" @click="subTab = 'favorites'">
                收藏 <span v-if="naming.favoritesCount.value" class="naming-badge">{{ naming.favoritesCount.value }}</span>
              </button>
              <button class="naming-sub-tab" :class="{ active: subTab === 'history' }" @click="subTab = 'history'">
                历史 <span v-if="naming.historyCount.value" class="naming-badge">{{ naming.historyCount.value }}</span>
              </button>
            </div>

            <!-- 生成子标签 -->
            <div v-show="subTab === 'generate'" class="naming-results-scroll">
              <div class="naming-results-head">
                <span class="naming-results-title">
                  生成结果
                  <span v-if="naming.currentResults.value.length" class="naming-results-count">· {{ naming.currentResults.value.length }} 个</span>
                </span>
                <span v-if="naming.status.value === 'success' || naming.status.value === 'partial'" class="naming-status naming-status-ok">
                  <span class="naming-dot"></span>{{ naming.statusMessage.value }}
                </span>
                <span v-else-if="naming.status.value === 'canceled'" class="naming-status naming-status-muted">{{ naming.statusMessage.value }}</span>
                <span v-else-if="naming.status.value === 'error'" class="naming-status naming-status-err">{{ naming.statusMessage.value }}</span>
                <span v-else-if="naming.status.value === 'loading'" class="naming-status naming-status-loading">{{ naming.progressLabel.value || naming.statusMessage.value }}</span>
              </div>

              <!-- 错误重试 -->
              <div v-if="naming.hasError.value" class="naming-error-box">
                <span class="naming-error-text">{{ naming.currentError.value?.message }}</span>
                <button class="btn-sm btn-primary" @click="naming.retry()">重试</button>
              </div>

              <!-- 加载骨架 -->
              <div v-if="naming.isLoading.value" class="naming-loading-area">
                <div v-for="i in naming.count.value" :key="i" class="naming-skeleton-card">
                  <div class="naming-skeleton-name"></div>
                  <div class="naming-skeleton-line"></div>
                </div>
              </div>

              <!-- 空状态 -->
              <div v-if="!naming.isLoading.value && !naming.hasResults.value && !naming.hasError.value" class="naming-empty">
                <div class="naming-empty-icon">✦</div>
                <div class="naming-empty-text">填写命名条件后，点击下方按钮开始生成</div>
              </div>

              <!-- 结果卡片 -->
              <article
                v-for="(item, idx) in naming.currentResults.value"
                :key="item.id"
                class="naming-result-card"
              >
                <div class="naming-result-main">
                  <input
                    :value="item.name"
                    class="naming-result-name-input"
                    @input="naming.updateResult(idx, { name: ($event.target as HTMLInputElement).value })"
                  />
                  <input
                    :value="item.meaning"
                    class="naming-result-meaning-input"
                    placeholder="含义说明"
                    @input="naming.updateResult(idx, { meaning: ($event.target as HTMLInputElement).value })"
                  />
                  <input
                    v-if="item.usage !== undefined"
                    :value="item.usage"
                    class="naming-result-usage-input"
                    placeholder="适用场景"
                    @input="naming.updateResult(idx, { usage: ($event.target as HTMLInputElement).value })"
                  />
                </div>
                <div class="naming-result-actions">
                  <button
                    class="naming-icon-btn"
                    :class="{ fav: naming.isFavorited(item) }"
                    :title="naming.isFavorited(item) ? '取消收藏' : '收藏'"
                    @click="naming.toggleFavorite(item)"
                  >{{ naming.isFavorited(item) ? '★' : '☆' }}</button>
                  <button class="naming-icon-btn" title="复制" @click="handleCopy(item)">⧉</button>
                  <button class="naming-icon-btn" title="重新生成" :disabled="naming.isLoading.value" @click="naming.doRegenerateSingle(idx)">↻</button>
                  <button class="naming-icon-btn naming-insert-btn" title="插入编辑器光标处" @click="naming.insertToEditor(item)">↥</button>
                  <button
                    v-if="naming.openOptions.value?.target && naming.openOptions.value.target.selectionStart !== naming.openOptions.value.target.selectionEnd"
                    class="naming-icon-btn naming-insert-btn"
                    title="替换选中文本"
                    @click="naming.replaceSelection(item)"
                  >⇄</button>
                </div>
              </article>
            </div>

            <!-- 收藏子标签 -->
            <div v-show="subTab === 'favorites'" class="naming-results-scroll">
              <div v-if="!naming.favorites.value.length" class="naming-empty">
                <div class="naming-empty-icon">☆</div>
                <div class="naming-empty-text">还没有收藏的名字</div>
              </div>
              <article
                v-for="item in naming.favorites.value"
                :key="item.id"
                class="naming-result-card"
              >
                <div class="naming-result-main">
                  <div class="naming-result-name">{{ item.name }}</div>
                  <div class="naming-result-meaning">{{ item.meaning }}</div>
                  <div v-if="item.usage" class="naming-result-usage">适用场景：{{ item.usage }}</div>
                </div>
                <div class="naming-result-actions">
                  <button class="naming-icon-btn fav" title="取消收藏" @click="naming.toggleFavorite(item)">★</button>
                  <button class="naming-icon-btn" title="复制" @click="handleCopy(item)">⧉</button>
                  <button class="naming-icon-btn naming-insert-btn" title="插入编辑器" @click="naming.insertToEditor(item)">↥</button>
                </div>
              </article>
            </div>

            <!-- 历史子标签 -->
            <div v-show="subTab === 'history'" class="naming-results-scroll">
              <div v-if="!naming.history.value.length" class="naming-empty">
                <div class="naming-empty-icon">⌚</div>
                <div class="naming-empty-text">还没有历史记录</div>
              </div>
              <div class="naming-history-toolbar">
                <button v-if="naming.history.value.length" class="btn-sm btn-danger" @click="confirmClearHistory">清空历史</button>
              </div>
              <article
                v-for="rec in naming.history.value"
                :key="rec.id"
                class="naming-history-card"
              >
                <div class="naming-history-head">
                  <span class="naming-history-type">{{ getTypeLabel(rec.request.type) }}</span>
                  <span class="naming-hist-results">{{ rec.results.length }} 个结果</span>
                  <span class="naming-history-time">{{ formatTime(rec.createdAt) }}</span>
                  <button class="naming-icon-btn" title="恢复" @click="restoreHistory(rec.id)">↻</button>
                </div>
                <div class="naming-hist-names">
                  <span v-for="r in rec.results" :key="r.id" class="naming-hist-name-tag" :title="r.meaning">{{ r.name }}</span>
                </div>
              </article>
            </div>
          </section>
        </div>

        <footer class="naming-modal-footer">
          <span class="naming-footer-note">点击名字可编辑 · 选中后可插入或替换编辑器文本</span>
          <div class="naming-footer-actions">
            <button v-if="naming.isLoading.value" class="btn btn-danger" @click="naming.cancelGeneration()">取消</button>
            <button v-else-if="naming.hasError.value" class="btn btn-primary" @click="naming.retry()">重试</button>
            <button v-else class="btn btn-primary" @click="naming.doGenerate()">生成名字</button>
            <button v-if="naming.hasResults.value && !naming.isLoading.value" class="btn" @click="naming.doGenerate()">全部重新生成</button>
            <button class="btn" @click="handleClose">关闭</button>
          </div>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useAiNaming } from '../../composables/useAiNaming'
import { useAppConfirm } from '../../composables/useAppConfirm'
import { NAMING_TYPE_LABELS, type NamingType } from '../../types/aiNaming'
import { useModalQueue } from '../../composables/useModalQueue'

const naming = useAiNaming()
const appConfirm = useAppConfirm()
const modalQueue = useModalQueue()

const subTab = ref<'generate' | 'favorites' | 'history'>('generate')

watch(() => naming.visible.value, visible => {
  if (visible) modalQueue.open('ai-naming')
  else modalQueue.close('ai-naming')
}, { immediate: true })

const allTypes = (Object.keys(NAMING_TYPE_LABELS) as NamingType[]).map(v => ({
  value: v,
  label: NAMING_TYPE_LABELS[v],
}))

function getTypeLabel(t: NamingType): string {
  return NAMING_TYPE_LABELS[t] || t
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`
}

async function handleCopy(item: { name: string; meaning: string }) {
  const text = `${item.name} — ${item.meaning}`
  const ok = await naming.copyToClipboard(text)
  if (ok) {
    // 简单 toast 提示
    const el = document.createElement('div')
    el.textContent = '已复制'
    el.style.cssText = 'position:fixed;bottom:60px;left:50%;transform:translateX(-50%);background:var(--success);color:#fff;padding: var(--space-3) var(--space-6);border-radius:var(--radius-sm);z-index:9999;font-size:13px;pointer-events:none;opacity:1;transition:opacity .3s'
    document.body.appendChild(el)
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300) }, 1200)
  }
}

function restoreHistory(id: string) {
  naming.restoreFromHistory(id)
  subTab.value = 'generate'
}

async function confirmClearHistory() {
  if (await appConfirm.confirm({ title: '清空历史', message: '确定清空所有历史记录？此操作不可恢复。', confirmText: '清空', danger: true })) {
    naming.clearHistory()
  }
}

async function handleOverlayClick() {
  if (naming.hasUnsavedChanges.value && naming.isLoading.value) return
  if (naming.hasUnsavedChanges.value) {
    if (!await appConfirm.confirm({ title: '关闭起名器', message: '有未使用的结果，确定关闭？', confirmText: '关闭', danger: true })) return
  }
  naming.closeNaming()
}

async function handleClose() {
  if (naming.hasUnsavedChanges.value && !await appConfirm.confirm({ title: '关闭起名器', message: '有未使用的结果，确定关闭？', confirmText: '关闭', danger: true })) return
  naming.closeNaming()
}

function handleEsc(e: KeyboardEvent) {
  if (e.key === 'Escape') handleClose()
}

function handleOpenNaming(e: Event) {
  const detail = (e as CustomEvent).detail
  naming.openNaming({
    source: detail?.source || 'editor',
    target: detail?.target,
    pipelineContext: detail?.pipelineContext,
    defaultType: detail?.defaultType,
  })
  subTab.value = 'generate'
}

onMounted(() => {
  window.addEventListener('open-ai-naming', handleOpenNaming)
})

onBeforeUnmount(() => {
  window.removeEventListener('open-ai-naming', handleOpenNaming)
})
</script>

<style scoped>
.naming-overlay {
  position: fixed; inset: 0;
  background: rgba(3, 4, 6, 0.72);
  backdrop-filter: var(--glass-blur) var(--glass-saturate); -webkit-backdrop-filter: var(--glass-blur) var(--glass-saturate);
  z-index: var(--z-modal-high, 1500);
  display: flex; align-items: center; justify-content: center;
}

.naming-modal {
  position: relative;
  width: min(900px, calc(100vw - 72px));
  height: min(684px, calc(100vh - 48px));
  display: flex; flex-direction: column;
  background: var(--bg-primary);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg, 12px);
  box-shadow: var(--shadow-);
  overflow: hidden;
}

.naming-modal-header {
  min-height: 60px;
  display: flex; align-items: center; gap: var(--space-5);
  padding: 0 var(--space-7);
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
  flex-shrink: 0;
}
.naming-modal-title-row { display: flex; align-items: center; gap: var(--space-5); }
.naming-sigil {
  width: 28px; height: 28px;
  display: grid; place-items: center;
  color: var(--accent);
  border: 1px solid var(--accent-dim);
  border-radius: var(--radius-sm, 6px);
  background: var(--accent-soft);
  font-size: 15px;
}
.naming-modal-title { margin: 0; font-size: var(--font-size-lg, 16px); font-weight: 600; color: var(--text-primary); }
.naming-modal-sub { margin-left: 4px; color: var(--text-muted); font-size: var(--font-size-xs, 12px); }
.naming-close { margin-left: auto; }

.naming-tabs {
  display: flex; gap: var(--space-1);
  padding: var(--space-5) var(--space-7) 0;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.naming-tab {
  padding: var(--space-4) var(--space-5) var(--space-5);
  color: var(--text-muted);
  border: 0; border-bottom: 2px solid transparent;
  background: transparent;
  cursor: pointer;
  font-size: var(--font-size-sm, 13px);
  transition: color var(--transition-fast, var(--duration-fast) var(--ease-standard)), border-color var(--transition-fast, var(--duration-fast) var(--ease-standard));
}
.naming-tab:hover { color: var(--text-secondary); }
.naming-tab.active { color: var(--text-primary); border-bottom-color: var(--accent); }

.naming-custom-type-row { padding: var(--space-5) var(--space-7) 0; display: flex; align-items: center; gap: var(--space-5); flex-shrink: 0; }

.naming-body {
  display: grid;
  grid-template-columns: 260px 1fr;
  flex: 1; min-height: 0;
}

.naming-controls {
  padding: var(--space-6) var(--space-6) var(--space-5) var(--space-7);
  border-right: 1px solid var(--border-color);
  overflow-y: auto;
}
.naming-section-label { margin: 0 0 var(--space-3); color: var(--text-primary); font-size: var(--font-size-sm, 13px); font-weight: 600; }
.naming-field-label { display: block; margin: var(--space-5) 0 var(--space-2); color: var(--text-muted); font-size: var(--font-size-xs, 12px); }

.naming-input {
  width: 100%;
  resize: none;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-xs, 4px);
  outline: none;
  color: var(--text-primary);
  background: var(--bg-input);
  padding: var(--space-4) var(--space-4);
  font-size: var(--font-size-sm, 13px);
  font-family: inherit;
}
.naming-input:focus { border-color: var(--accent); box-shadow: var(--shadow-focus-ring); }
.naming-context { height: 76px; }

.naming-control-row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); }
.naming-control-cell { display: flex; flex-direction: column; }
.naming-stepper { display: flex; height: 32px; }
.naming-step-btn { width: 30px; color: var(--text-muted); background: var(--bg-tertiary); border: 1px solid var(--border-light); cursor: pointer; font-size: 16px; }
.naming-step-input { flex: 1; border: 0; border-top: 1px solid var(--border-light); border-bottom: 1px solid var(--border-light); text-align: center; background: var(--bg-input); color: var(--text-primary); outline: none; font-size: var(--font-size-sm, 13px); min-width: 0; padding: 0; }
.naming-length-input { text-align: center; }

.naming-hint { margin-top: 12px; color: var(--text-muted); font-size: var(--font-size-xxs, 11px); line-height: 1.65; }

.naming-results-area { display: flex; flex-direction: column; min-height: 0; }

.naming-sub-tabs { display: flex; gap: var(--space-1); padding: var(--space-5) var(--space-6) 0; border-bottom: 1px solid var(--border-color); flex-shrink: 0; }
.naming-sub-tab { padding: var(--space-3) var(--space-5) var(--space-4); color: var(--text-muted); border: 0; border-bottom: 2px solid transparent; background: transparent; cursor: pointer; font-size: var(--font-size-xs, 12px); }
.naming-sub-tab.active { color: var(--text-primary); border-bottom-color: var(--accent); }
.naming-badge { display: inline-block; margin-left: 4px; min-width: 16px; height: 14px; line-height: 14px; text-align: center; font-size: 10px; color: var(--accent); }

.naming-results-scroll { flex: 1; overflow-y: auto; padding: var(--space-5) var(--space-6); overscroll-behavior: contain; }

.naming-results-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.naming-results-title { font-size: var(--font-size-sm, 13px); font-weight: 600; color: var(--text-primary); }
.naming-results-count { color: var(--text-muted); font-weight: 400; }
.naming-status { display: flex; align-items: center; gap: var(--space-2); font-size: var(--font-size-xxs, 11px); }
.naming-status-ok { color: var(--success); }
.naming-status-err { color: var(--danger); }
.naming-status-muted { color: var(--text-muted); }
.naming-status-loading { color: var(--accent); }
.naming-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--success); box-shadow: 0 0 8px var(--success); }

.naming-error-box { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); padding: var(--space-5) var(--space-5); margin-bottom: 10px; background: var(--danger-dim); border: 1px solid var(--danger); border-radius: var(--radius-sm, 6px); }
.naming-error-text { color: var(--danger); font-size: var(--font-size-sm, 13px); }

.naming-loading-area { }
.naming-skeleton-card { padding: var(--space-5) var(--space-5); margin-bottom: 8px; background: var(--bg-elevated); border: 1px solid var(--border-color); border-radius: var(--radius-sm, 6px); }
.naming-skeleton-name { height: 20px; width: 60%; background: var(--bg-tertiary); border-radius: var(--radius-xs); margin-bottom: 8px; }
.naming-skeleton-line { height: 12px; width: 90%; background: var(--bg-tertiary); border-radius: var(--radius-xs); }

.naming-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--space-4); padding: var(--space-10) 0; color: var(--text-muted); }
.naming-empty-icon { font-size: 28px; opacity: 0.4; }
.naming-empty-text { font-size: var(--font-size-sm, 13px); }

.naming-result-card {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: var(--space-3) var(--space-5);
  margin-bottom: 8px;
  padding: var(--space-5) var(--space-5);
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm, 6px);
}
.naming-result-card:hover { border-color: var(--accent-dim); }

.naming-result-main { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; }
.naming-result-name-input {
  width: 100%; border: 0; background: transparent; outline: none;
  font: 20px var(--font-family-editor, serif); color: var(--text-primary);
  letter-spacing: 0.04em; padding: 0; user-select: text; cursor: text;
}
.naming-result-meaning-input {
  width: 100%; border: 0; background: transparent; outline: none;
  color: var(--text-secondary); font-size: var(--font-size-xs, 12px); padding: 0; user-select: text; cursor: text;
}
.naming-result-usage-input {
  width: 100%; border: 0; background: transparent; outline: none;
  color: var(--text-muted); font-size: var(--font-size-xxs, 11px); padding: 0; user-select: text; cursor: text;
}

.naming-result-name { font: 20px var(--font-family-editor, serif); color: var(--text-primary); letter-spacing: 0.04em; user-select: text; cursor: text; }
.naming-result-meaning { color: var(--text-secondary); font-size: var(--font-size-xs, 12px); user-select: text; cursor: text; }
.naming-result-usage { color: var(--text-muted); font-size: var(--font-size-xxs, 11px); padding-top: 2px; user-select: text; cursor: text; }

.naming-result-actions { display: flex; align-items: flex-start; gap: var(--space-3); flex-shrink: 0; }
.naming-icon-btn {
  width: 26px; height: 26px;
  border: 0; border-radius: var(--radius-xs, 4px);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 14px;
  display: grid; place-items: center;
  transition: color var(--transition-fast, var(--duration-fast) var(--ease-standard)), background var(--transition-fast, var(--duration-fast) var(--ease-standard));
}
.naming-icon-btn:hover { color: var(--text-primary); background: var(--bg-hover); }
.naming-icon-btn.fav { color: var(--warning); background: rgba(240,160,80,0.1); }
.naming-icon-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.naming-insert-btn { color: var(--accent); }

.naming-history-toolbar { margin-bottom: 8px; display: flex; justify-content: flex-end; }
.naming-history-card { padding: var(--space-5) var(--space-5); margin-bottom: 8px; background: var(--bg-elevated); border: 1px solid var(--border-color); border-radius: var(--radius-sm, 6px); }
.naming-history-head { display: flex; align-items: center; gap: var(--space-4); margin-bottom: 6px; }
.naming-history-type { font-size: var(--font-size-xs, 12px); font-weight: 600; color: var(--accent); }
.naming-hist-results { font-size: var(--font-size-xxs, 11px); color: var(--text-muted); }
.naming-history-time { font-size: var(--font-size-xxs, 11px); color: var(--text-muted); margin-left: auto; }
.naming-hist-names { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.naming-hist-name-tag { display: inline-block; padding: var(--space-1) var(--space-4); background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: var(--radius-xs, 4px); font-size: var(--font-size-xxs, 11px); color: var(--text-secondary); cursor: default; user-select: text; }

.naming-modal-footer {
  min-height: 56px;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 var(--space-7);
  border-top: 1px solid var(--border-color);
  background: var(--bg-secondary);
  flex-shrink: 0;
}
.naming-footer-note { color: var(--text-muted); font-size: var(--font-size-xxs, 11px); }
.naming-footer-actions { display: flex; gap: var(--space-4); }

.btn { height: 32px; padding: 0 var(--space-5); border-radius: var(--radius-sm, 6px); border: 1px solid var(--border-light); color: var(--text-secondary); background: var(--bg-tertiary); cursor: pointer; font-size: var(--font-size-sm, 13px); }
.btn:hover { border-color: var(--accent-dim); color: var(--text-primary); }
.btn-primary { background: var(--accent); border-color: var(--accent); color: var(--text-on-accent); font-weight: 600; }
.btn-primary:hover { background: var(--accent-hover); }
.btn-danger { background: var(--danger); border-color: var(--danger); color: #fff; }

@media (max-width: 760px) {
  .naming-body { grid-template-columns: 1fr; }
  .naming-controls { display: none; }
}
</style>
