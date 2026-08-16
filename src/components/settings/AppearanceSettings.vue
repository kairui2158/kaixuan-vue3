<template>
  <div class="appearance-settings">
    <h3>外观设置</h3>
    <div class="settings-row">
      <label>字体大小</label>
      <input id="cfg-editor-font-size" type="range" min="12" max="20" v-model.number="settingsStore.fontSize" @change="settingsStore.saveSettings()" />
      <span id="cfg-editor-font-size-val">{{ settingsStore.fontSize }}px</span>
    </div>
    <div class="settings-row">
      <label>界面字体</label>
      <input id="cfg-font-size" type="range" min="13" max="16" v-model.number="uiFontSize" @change="saveUiFontSize" />
      <span id="cfg-font-size-val">{{ uiFontSize }}px</span>
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
    <div class="settings-section">
      <h4>主题</h4>
      <div class="settings-row">
        <select id="cfg-theme" class="full-width"><option value="dark">深色模式</option></select>
        <button class="btn-toggle" :class="{ active: isDark }" @click="toggleTheme">{{ isDark ? 'ON' : 'OFF' }}</button>
      </div>
    </div>
    <div class="settings-section">
      <h4>数据管理</h4>
      <div class="settings-row">
        <label>数据目录</label>
        <span id="data-dir-path" class="data-dir-path">{{ dataDirPath || '正在读取...' }}</span>
        <button id="btn-open-data-dir" class="btn-secondary" @click="openDataDir">打开目录</button>
      </div>
      <div class="settings-row">
        <label>导出数据</label>
        <button id="btn-export-data" class="btn-secondary" @click="exportData">导出全部数据</button>
      </div>
      <div class="settings-row">
        <label>导入数据</label>
        <button id="btn-import-data" class="btn-secondary" @click="importData">导入数据</button>
      </div>
    </div>
    <div class="settings-section">
      <h4>GitHub备份</h4>
      <div class="settings-row">
        <label>Token</label>
        <input type="password" v-model="githubToken" placeholder="ghp_..." class="gh-input" @change="saveGithubToken" />
        <button class="btn-secondary" @click="saveGithubToken">保存</button>
      </div>
    </div>
    <div class="appearance-divider">
      <label>keyboard shortcuts</label>
      <div class="kbd-shortcuts">
        <div class="kbd-row"><span class="kbd">Ctrl+1</span> outline workspace</div>
        <div class="kbd-row"><span class="kbd">Ctrl+2</span> settings collection</div>
        <div class="kbd-row"><span class="kbd">Ctrl+3</span> pipeline</div>
        <div class="kbd-row"><span class="kbd">Ctrl+4</span> memory</div>
        <div class="kbd-row"><span class="kbd">Ctrl+5</span> plugin market</div>
        <div class="kbd-row"><span class="kbd">Ctrl+,</span> settings</div>
        <div class="kbd-row"><span class="kbd">Esc</span> close panels</div>
        <div class="kbd-row"><span class="kbd">Ctrl+K</span> clear chat</div>
        <div class="kbd-row"><span class="kbd">Ctrl+Shift+P</span> project manager</div>
      </div>
    </div>
    <div class="form-actions">
      <button id="btn-save-appearance" class="btn-primary" @click="saveAll">save appearance</button>
    </div>
  </div>

</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
const isDark = ref(false)
const githubToken = ref('')
onMounted(() => {
  isDark.value = document.body.classList.contains('dark-theme')
  try { const t = window.electronAPI?.storageRead?.('github_token'); if (t) githubToken.value = t } catch(e) {}
})
function toggleTheme() {
  isDark.value = !isDark.value
  if (isDark.value) {
    document.body.classList.remove('light-theme')
  } else {
    document.body.classList.add('light-theme')
  }
  window.electronAPI?.storageWrite?.('theme_dark', isDark.value)
}
function exportData() {
  try {
    const keys = window.electronAPI?.storageList?.() || []
    const data: Record<string, any> = {}
    for (const k of keys) { data[k] = window.electronAPI.storageRead(k) }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'novel-workshop-backup.json'
    a.click()
  } catch(e) { alert('导出失败: ' + e) }
}
function importData() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      for (const k of Object.keys(data)) { window.electronAPI?.storageWrite?.(k, data[k]) }
      alert('导入成功，请重启应用')
    } catch(err) { alert('导入失败: ' + err) }
  }
  input.click()
}
function saveGithubToken() {
  window.electronAPI?.storageWrite?.('github_token', githubToken.value)
  alert('Token已保存')
}
import { useSettingsStore } from '../../stores/settings'
const settingsStore = useSettingsStore()
const dataDirPath = ref('')

onMounted(() => {
  dataDirPath.value = window.electronAPI?.storageGetDataDir?.() || ''
})

function openDataDir() {
  const ok = window.electronAPI?.storageOpenDataDir?.()
  if (!ok) alert('无法打开数据目录')
}

function saveAll() {
  settingsStore.saveSettings()
  alert("appearance saved")
}
</script>

<style scoped>
.appearance-settings h3 { font-size: var(--font-size-lg); margin-bottom: 16px; }
.settings-row { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.settings-row label { width: 120px; font-size: var(--font-size-md); color: var(--text-secondary); }
.settings-row input[type="number"], .settings-row select {
  background: var(--bg-input); color: var(--text-primary);
  border: 1px solid var(--border-color); border-radius: var(--radius-xs);
  padding: 6px 10px; font-size: var(--font-size-md); height: 34px; outline: none; width: 84px;
}
.settings-row input[type="range"] { flex: 1; max-width: 200px; }
.settings-row span { font-size: var(--font-size-md); color: var(--text-muted); }
.data-dir-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: monospace;
  background: var(--bg-tertiary, #1a1a1e);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xs);
  padding: var(--space-2) var(--space-4);
}
.settings-section { border-top: 1px solid var(--border-color); padding-top: 12px; margin-top: 12px; }
.settings-section h4 { font-size: var(--font-size-md); margin-bottom: 8px; color: var(--text-secondary); }
.btn-toggle { padding: 5px 16px; border-radius: var(--radius-xs); border: 1px solid var(--border-color); background: var(--bg-input); color: var(--text-secondary); cursor: pointer; font-size: var(--font-size-md); }
.btn-toggle.active { background: var(--accent); color: var(--text-on-accent); border-color: var(--accent); }
.gh-input { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--radius-xs); padding: 6px 10px; font-size: var(--font-size-md); height: 34px; width: 220px; outline: none; }

.appearance-divider { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border-color); }
.appearance-divider > label { display: block; margin-bottom: 8px; font-size: var(--font-size-md); color: var(--text-secondary); font-weight: 500; }
.kbd-shortcuts { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 24px; width: 100%; }
.kbd-row { display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-radius: var(--radius-xs, 3px); background: var(--bg-hover); font-size: var(--font-size-md); color: var(--text-secondary); }
.kbd { display: inline-block; padding: 3px 6px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: var(--radius-xs); font-size: var(--font-size-sm); font-family: monospace; color: var(--text-primary); min-width: 20px; text-align: center; }
</style>
