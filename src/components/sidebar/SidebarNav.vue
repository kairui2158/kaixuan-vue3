<template>
<aside id="app-sidebar" class="sidebar-nav">
    <template v-for="item in navItems" :key="item.id || item.type">
      <div v-if="item.type === 'divider'" class="sidebar-divider"></div>
      <button
        v-else
        :id="item.id === 'outline' ? 'btn-outline-workspace' : 'btn-' + (item.id || '')" class="sidebar-btn"
        :class="{ active: activePanel === item.id }"
        :data-tooltip="item.label"
        :aria-label="item.label"
        tabindex="0"
        @click="$emit('navigate', item.id || '')"
      >
        <span class="sidebar-icon" v-html="item.icon"></span>
      </button>
    </template>
    <button id="theme-toggle-btn"
      class="sidebar-btn theme-toggle"
      data-tooltip="主题切换"
      aria-label="主题切换"
      tabindex="0"
      @click="toggleTheme"
    >
      <span class="sidebar-icon" v-html="isDark ? sunIcon : moonIcon"></span>
    </button>
  </aside>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useThemeStore } from '../../stores/theme'

defineProps<{ activePanel: string }>()
defineEmits<{ navigate: [string] }>()

const themeStore = useThemeStore()
const isDark = computed(() => themeStore.theme === 'dark')

function toggleTheme() {
  themeStore.toggle()
}

const sunIcon = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>'
const moonIcon = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'

const navItems = [
  { id: 'outline', label: '大纲工作台', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>' },
  { id: 'pipeline', label: '生成流水线', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="8" x="3" y="3" rx="2"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/><rect width="8" height="8" x="13" y="13" rx="2"/></svg>' },
  { id: 'memory', label: '记忆', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg>' },
  { type: 'divider' },
  { id: 'plugin-market', label: '插件市场', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>' },
  { id: 'settings', label: '设置', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>' },
  { type: 'divider' },
  { id: 'dashboard', label: '写作仪表盘', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>' },
]
</script>

<style scoped>
.sidebar-nav {
  width: 48px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 0;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  flex-shrink: 0;
}
.sidebar-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: var(--transition-fast);
  position: relative;
}
.sidebar-btn:hover {
  background: var(--bg-hover);
  color: var(--accent);
  transform: none;
}
.sidebar-btn.active {
  background: var(--accent-dim);
  color: var(--accent);
}
.sidebar-btn.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 6px;
  bottom: 6px;
  width: 3px;
  background: var(--accent);
  border-radius: 0 3px 3px 0;
}
.sidebar-btn:hover::after {
  content: attr(data-tooltip);
  position: absolute;
  left: 100%;
  margin-left: 8px;
  padding: var(--space-2) var(--space-4);
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-size: var(--font-size-sm);
  border-radius: var(--radius-xs);
  white-space: nowrap;
  z-index: 3000;
  pointer-events: none;
}
.sidebar-divider {
  width: 32px;
  height: 1px;
  background: var(--border-color);
  margin: 4px 0;
}
</style>
