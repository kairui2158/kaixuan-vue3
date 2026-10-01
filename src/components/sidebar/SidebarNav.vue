<template>
<aside id="app-sidebar" class="sidebar-nav">
    <template v-for="item in navItems" :key="item.type === 'divider' ? 'divider' : item.id">
      <div v-if="item.type === 'divider'" class="sidebar-divider"></div>
      <button
        v-else
        :id="`btn-${item.id}`" class="sidebar-btn"
        :data-panel="item.id"
        :class="{ active: activePanel === item.id }"
        :data-tooltip="item.label"
        :aria-label="item.label"
        tabindex="0"
        @click="$emit('navigate', item.id)"
      >
        <AppIcon :name="item.icon" />
      </button>
    </template>
    <button id="theme-toggle-btn"
      class="sidebar-btn theme-toggle"
      data-tooltip="主题切换"
      aria-label="主题切换"
      tabindex="0"
      @click="toggleTheme"
    >
      <AppIcon :name="isDark ? 'sun' : 'moon'" />
    </button>
  </aside>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useThemeStore } from '../../stores/theme'
import AppIcon, { type AppIconName } from '../common/AppIcon.vue'

defineProps<{ activePanel: string }>()
defineEmits<{ navigate: [string] }>()

const themeStore = useThemeStore()
const isDark = computed(() => themeStore.theme === 'dark')

function toggleTheme() {
  themeStore.toggle()
}

type NavItem = { type: 'item'; id: string; label: string; icon: AppIconName } | { type: 'divider' }

const navItems: NavItem[] = [
  { type: 'item', id: 'outline-workspace', label: '大纲工作台', icon: 'outline' },
  { type: 'item', id: 'pipeline', label: '生成流水线', icon: 'pipeline' },
  { type: 'item', id: 'memory', label: '记忆', icon: 'memory' },
  { type: 'divider' },
  { type: 'item', id: 'plugin-market', label: '插件市场', icon: 'market' },
  { type: 'item', id: 'settings', label: '设置', icon: 'settings' },
  { type: 'divider' },
  { type: 'item', id: 'dashboard', label: '写作仪表盘', icon: 'dashboard' },
]

// Stable probe contract: every navigable panel is discoverable from rendered DOM.
defineExpose({
  navItems: navItems.flatMap(item => item.type === 'item' ? [{ id: item.id, label: item.label }] : [])
})
</script>

<style scoped>
.sidebar-nav {
  width: 48px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-4) 0;
  background: var(--surface-chrome);
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
  color: var(--text-mid);
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
  border-radius: 0 var(--radius-2xs) var(--radius-2xs) 0;
}
.sidebar-divider {
  width: 32px;
  height: 1px;
  background: var(--border-color);
  margin: var(--space-2) 0;
}
</style>
