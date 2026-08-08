<template>
  <div class="appearance-settings">
    <h3>外观设置</h3>
    <div class="settings-row">
      <label>字体大小</label>
      <input type="range" min="12" max="20" v-model.number="settingsStore.fontSize" @change="settingsStore.saveSettings()" />
      <span>{{ settingsStore.fontSize }}px</span>
    </div>
    <div class="settings-row">
      <label>编辑器字体</label>
      <select v-model="settingsStore.editorFont" @change="settingsStore.saveSettings()">
        <option value="serif">衬线 (Serif)</option>
        <option value="sans-serif">无衬线 (Sans-serif)</option>
        <option value="monospace">等宽 (Monospace)</option>
      </select>
    </div>
    <div class="settings-row">
      <label>自动保存间隔</label>
      <input type="number" min="5" max="300" v-model.number="settingsStore.autoSaveInterval" @change="settingsStore.saveSettings()" />
      <span>秒</span>
    </div>
    <div class="settings-row">
      <label>最大标签页数</label>
      <input type="number" min="5" max="50" v-model.number="settingsStore.maxTabs" @change="settingsStore.saveSettings()" />
    </div>
    <div class="settings-row">
      <label>CDP调试端口</label>
      <input type="number" v-model.number="settingsStore.cdpPort" @change="settingsStore.saveSettings()" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSettingsStore } from '../../stores/settings'
const settingsStore = useSettingsStore()
</script>

<style scoped>
.appearance-settings h3 { font-size: 16px; margin-bottom: 16px; }
.settings-row { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.settings-row label { width: 120px; font-size: 13px; color: var(--text-secondary); }
.settings-row input[type="number"], .settings-row select {
  background: var(--bg-input); color: var(--text-primary);
  border: 1px solid var(--border-color); border-radius: 4px;
  padding: 4px 8px; font-size: 13px; height: 28px; outline: none; width: 80px;
}
.settings-row input[type="range"] { flex: 1; max-width: 200px; }
.settings-row span { font-size: 12px; color: var(--text-muted); }
</style>
