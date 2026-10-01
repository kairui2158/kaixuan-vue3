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
        <optgroup label="打包字体">
          <option value="lxgw-wenkai">霞鹜文楷</option>
          <option value="source-han-serif">思源宋体</option>
          <option value="source-han-sans">思源黑体</option>
        </optgroup>
        <optgroup label="系统字体">
          <option value="kaiti">楷体</option>
          <option value="simsun">宋体</option>
          <option value="simhei">黑体</option>
          <option value="fangsong">仿宋</option>
          <option value="microsoft-yahei">微软雅黑</option>
        </optgroup>
        <optgroup label="通用类别">
          <option value="serif">衬线</option>
          <option value="sans-serif">无衬线</option>
          <option value="monospace">等宽</option>
        </optgroup>
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
    <div class="settings-row">
      <label>记忆抽取超时</label>
      <input id="cfg-memory-extraction-timeout" type="number" min="60" max="600" step="10" v-model.number="settingsStore.memoryExtractionTimeoutSeconds" @change="saveMemoryTimeout" />
      <span id="cfg-memory-extraction-timeout-val">{{ settingsStore.memoryExtractionTimeoutSeconds }}秒</span>
    </div>
    <div class="settings-row">
      <label>正文确认后自动抽取记忆</label>
      <input id="cfg-auto-extract-memory" type="checkbox" v-model="settingsStore.autoExtractMemory" @change="settingsStore.saveSettings()" />
    </div>
    <div class="settings-section">
      <h4>主题</h4>
      <div class="settings-row">
        <select id="cfg-theme" class="full-width" v-model="themeMode" @change="onThemeChange">
          <option value="light">亮色模式</option>
          <option value="dark">深色模式</option>
        </select>
        <button class="btn-toggle" :class="{ active: isDark }" @click="toggleTheme">{{ isDark ? '开' : '关' }}</button>
      </div>
    </div>
    <div class="settings-section">
      <h4>界面密度</h4>
      <div class="settings-row">
        <label>密度模式</label>
       <select id="cfg-density" class="full-width" v-model="densityMode" @change="onDensityChange">
          <option value="default">默认</option>
          <option value="comfortable">舒适</option>
          <option value="compact">紧凑</option>
        </select>
      </div>
    </div>
    <div class="settings-section">
      <h4>布局</h4>
      <div class="settings-row layout-preset-row">
        <label>三栏预设</label>
        <div class="layout-preset-actions">
          <button
            v-for="preset in layoutPresetOptions"
            :key="preset.id"
            class="btn-toggle"
            :class="{ active: layoutPreset === preset.id }"
            @click="applyLayoutPreset(preset.id)"
          >{{ preset.label }}</button>
          <button class="btn-secondary" @click="resetLayout">恢复默认布局</button>
        </div>
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
      <label>快捷键</label>
      <div class="kbd-shortcuts">
        <div class="kbd-row"><span class="kbd">Ctrl+1</span> 大纲工作台</div>
        <div class="kbd-row"><span class="kbd">Ctrl+2</span> 设定层</div>
        <div class="kbd-row"><span class="kbd">Ctrl+3</span> 生成流水线</div>
        <div class="kbd-row"><span class="kbd">Ctrl+4</span> 记忆面板</div>
        <div class="kbd-row"><span class="kbd">Ctrl+5</span> 插件市场</div>
        <div class="kbd-row"><span class="kbd">Ctrl+,</span> 设置</div>
        <div class="kbd-row"><span class="kbd">Esc</span> 关闭面板</div>
        <div class="kbd-row"><span class="kbd">Ctrl+K</span> 清空对话</div>
        <div class="kbd-row"><span class="kbd">Ctrl+Shift+P</span> 项目管理器</div>
      </div>
    </div>
    <div class="form-actions">
      <button id="btn-save-appearance" class="btn-primary" @click="saveAll">保存外观设置</button>
    </div>
  </div>

</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAppConfirm } from '../../composables/useAppConfirm'
import { getSavedLayoutPreset, requestLayoutPreset, type LayoutPreset } from '../../composables/useResizers'
import { useThemeStore } from '../../stores/theme'

const appConfirm = useAppConfirm()
const themeStore = useThemeStore()
const isDark = ref(false)
const themeMode = ref<'light' | 'dark'>('light')
const densityMode = ref<'default' | 'comfortable' | 'compact'>('default')
const githubToken = ref('')
const layoutPreset = ref<LayoutPreset | 'custom'>(getSavedLayoutPreset())
const layoutPresetOptions: Array<{ id: LayoutPreset; label: string }> = [
  { id: 'focus-writing', label: '专注写作' },
  { id: 'balanced', label: '平衡' },
  { id: 'chat-first', label: '对话优先' },
]
onMounted(() => {
  themeMode.value = themeStore.theme
  isDark.value = themeMode.value === 'dark'
 const savedDensity = localStorage.getItem('wa-density')
  if (savedDensity === 'default' || savedDensity === 'compact' || savedDensity === 'comfortable') {
    densityMode.value = savedDensity
    document.documentElement.setAttribute('data-density', savedDensity)
  } else {
    densityMode.value = 'default'
    document.documentElement.setAttribute('data-density', 'default')
  }
  void (async () => {
    try {
      const t = await window.electronAPI?.storageRead?.('github_token')
      if (typeof t === 'string' && t) githubToken.value = t
    } catch(e) {}
  })()
})
function onThemeChange() {
  isDark.value = themeMode.value === 'dark'
  void themeStore.setTheme(themeMode.value)
}
function onDensityChange() {
  document.documentElement.setAttribute('data-density', densityMode.value)
  localStorage.setItem('wa-density', densityMode.value)
}
function toggleTheme() {
  themeMode.value = isDark.value ? 'light' : 'dark'
  onThemeChange()
}
async function exportData() {
  try {
    const listed = await window.electronAPI?.storageList?.()
    const keys = Array.isArray(listed) ? listed : []
    const data: Record<string, any> = {}
    for (const k of keys) { data[k] = await window.electronAPI.storageRead(k) }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'novel-workshop-backup.json'
    a.click()
  } catch(e) { void appConfirm.alert('导出失败: ' + e) }
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
      const failedKeys: string[] = []
      for (const k of Object.keys(data)) {
        const ok = await window.electronAPI?.storageWrite?.(k, data[k])
        if (ok !== true) failedKeys.push(k)
      }
      const total = Object.keys(data).length
      if (failedKeys.length === 0) {
        await appConfirm.alert('导入成功（' + total + ' 项全部写入）。请重启应用使全部设置生效。')
      } else {
        await appConfirm.alert('导入完成：成功 ' + (total - failedKeys.length) + ' 项，失败 ' + failedKeys.length + ' 项（' + failedKeys.join('、') + '）。失败项未写入磁盘，请重启应用后重试。')
      }
    } catch(err) { await appConfirm.alert('导入失败: ' + err) }
  }
  input.click()
}
async function saveGithubToken() {
  const token = typeof githubToken.value === 'string' ? githubToken.value.trim() : ''
  const ok = await window.electronAPI?.storageWrite?.('github_token', token)
  if (ok === true) { await appConfirm.alert('Token已保存') } else { await appConfirm.alert('Token保存失败：磁盘写入未成功，请检查磁盘空间或权限后重试。') }
}
import { useSettingsStore } from '../../stores/settings'
const settingsStore = useSettingsStore()
const uiFontSize = settingsStore.uiFontSize
function saveUiFontSize() { settingsStore.saveSettings() }
function saveMemoryTimeout() {
  settingsStore.memoryExtractionTimeoutSeconds = Math.min(600, Math.max(60, Math.round(settingsStore.memoryExtractionTimeoutSeconds) || 300))
  settingsStore.saveSettings()
}
function applyLayoutPreset(preset: LayoutPreset) {
  requestLayoutPreset(preset)
  layoutPreset.value = preset
}
function resetLayout() {
  requestLayoutPreset('balanced')
  layoutPreset.value = 'balanced'
}
const dataDirPath = ref('')

onMounted(() => {
  dataDirPath.value = window.electronAPI?.storageGetDataDir?.() || ''
})

function openDataDir() {
  const ok = window.electronAPI?.storageOpenDataDir?.()
  if (!ok) void appConfirm.alert('无法打开数据目录')
}

async function saveAll() {
  settingsStore.saveSettings()
  await appConfirm.alert('外观设置已保存')
}
</script>

<style scoped>
.appearance-settings h3 { font-size: var(--font-size-lg); margin-bottom: 16px; }
.settings-row { display: flex; align-items: center; gap: var(--space-5); margin-bottom: 16px; }
.settings-row label { width: 120px; font-size: var(--font-size-md); color: var(--text-secondary); }
.settings-row input[type="number"], .settings-row select {
  background: var(--bg-input); color: var(--text-primary);
  border: 1px solid var(--border-color); border-radius: var(--radius-xs);
  padding: var(--space-3) var(--space-5); font-size: var(--font-size-md); height: var(--density-form-height); width: 84px;
}
.settings-row input[type="range"] { flex: 1; max-width: 200px; }
.settings-row span { font-size: var(--font-size-md); color: var(--text-muted); }
.data-dir-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-family-mono);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xs);
  padding: var(--space-2) var(--space-4);
}
.settings-section { border-top: 1px solid var(--border-color); padding-top: 12px; margin-top: 12px; }
.settings-section h4 { font-size: var(--font-size-md); margin-bottom: 8px; color: var(--text-secondary); }
.btn-toggle { padding: var(--space-2) var(--space-6); border-radius: var(--radius-xs); border: 1px solid var(--border-color); background: var(--bg-input); color: var(--text-secondary); cursor: pointer; font-size: var(--font-size-md); }
.btn-toggle.active { background: var(--accent); color: var(--text-on-accent); border-color: var(--accent); }
.layout-preset-row { align-items: flex-start; }
.layout-preset-actions { display: flex; flex-wrap: wrap; gap: var(--space-3); }
.layout-preset-actions .btn-toggle { padding: var(--space-3) var(--space-5); }
.gh-input { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--radius-xs); padding: var(--space-3) var(--space-5); font-size: var(--font-size-md); height: var(--density-form-height); width: 220px; }

.appearance-divider { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border-color); }
.appearance-divider > label { display: block; margin-bottom: 8px; font-size: var(--font-size-md); color: var(--text-secondary); font-weight: 500; }
.kbd-shortcuts { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-4) var(--space-8); width: 100%; }
.kbd-row { display: flex; align-items: center; gap: var(--space-4); padding: var(--space-2) var(--space-4); border-radius: var(--radius-xs); background: var(--bg-hover); font-size: var(--font-size-md); color: var(--text-secondary); }
.kbd { display: inline-block; padding: var(--space-3) var(--space-3); background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: var(--radius-xs); font-size: var(--font-size-sm); font-family: var(--font-family-mono); color: var(--text-primary); min-width: 20px; text-align: center; }
</style>

