import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import AppIcon from './components/common/AppIcon.vue'
import './styles/tokens.css'
import './styles/global.css'
import './styles/base-components.css'
import './styles/modal.css'
import './styles/ai-content.css'
import VueVirtualScroller from 'vue-virtual-scroller'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'

// electron-log: renderer process logging + console全覆盖
import log from './services/logger-shim.js'
Object.assign(console, log.functions)

// 诊断日志：重建 window.DiagLogger（写盘 + 实时订阅 + 全局错误捕获）
import { DiagLogger } from './services/diag.js'
DiagLogger.init()

// Tooltip boundary controller: keeps CSS pseudo-element labels inside the viewport.
import { initTooltipController } from './services/tooltipController'
import { toCloneableSnapshot } from './utils/cloneableSnapshot'
initTooltipController()

// MCP protocol adapter: enable tool execution from renderer/window scope
import { MCPProtocol } from './services/mcp-protocol'
import { ToolRegistry } from './services/tool-registry'
import { buildProviderModelsUrl, buildProviderHeaders } from './services/providerProtocols'
// Intent router: jieba + TF-IDF + cosine for chain mode intent classification
import { initIntentRouter, isIntentRouterDegraded, warmupIntentRoutingEmbedding } from './services/chainIntentRouter'
import { useDeAiStore } from './stores/deai'
;(globalThis as any).MCPProtocol = MCPProtocol
;(globalThis as any).ToolRegistry = ToolRegistry

// Browser polyfill: when not running in Electron, shim electronAPI with localStorage
if (!(window as any).electronAPI) {
  ;(window as any).electronAPI = {
    storageRead: (key: string) => {
      try {
        const raw = localStorage.getItem(key)
        if (raw === null) return null
        try { return JSON.parse(raw) } catch { return raw }
      } catch { return null }
    },
    storageWrite: (key: string, val: any) => {
      try {
        const snapshot = toCloneableSnapshot(val)
        const str = typeof val === 'string' ? val : JSON.stringify(snapshot)
        localStorage.setItem(key, str)
        return true
      } catch { return false }
    },
    storageRemove: (key: string) => { try { localStorage.removeItem(key); return true } catch { return false } },
    storageList: () => { try { const keys: string[] = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k) keys.push(k) } return keys } catch { return [] } },
    clipboardWrite: () => {},
    clipboardRead: () => '',
    showItemInFolder: () => {},
    skillOpenFolder: async () => ({ ok: false, code: 'browser-unsupported', message: '当前环境不支持打开文件夹' }),
    openFileDialog: async () => null,
    saveFileDialog: async () => null,
    windowMinimize: () => {},
    windowMaximize: () => {},
    windowClose: () => {},
    onDeepLink: () => {},
    sendToChannel: () => {},
    onChannelMessage: () => {},
    // API mocks for dev mode
    fetchModels: async (baseUrl: string, apiKey: string) => {
      try {
        const url = buildProviderModelsUrl({ baseUrl, providerType: 'openai-compatible' })
        const resp = await fetch(url, { headers: buildProviderHeaders('openai-compatible', apiKey) })
        if (!resp.ok) throw new Error('HTTP ' + resp.status)
        const json = await resp.json()
        const models = (json.data || []).map((m: any) => m.id)
        return models
      } catch (e) {
        throw new Error('Failed to fetch models: ' + (e as Error).message)
      }
    },
    diagWrite: () => {},
    diagRead: async () => [],
    diagExport: async () => ({ success: false, reason: 'browser' }),
    diagClear: async () => false,
    providerTestConnection: async (baseUrl: string, apiKey: string) => {
      try {
        const url = buildProviderModelsUrl({ baseUrl, providerType: 'openai-compatible' })
        const resp = await fetch(url, { headers: buildProviderHeaders('openai-compatible', apiKey) })
        if (!resp.ok) return { connected: false, error: 'HTTP ' + resp.status }
        return { connected: true, error: null }
      } catch (e) {
        return { connected: false, error: (e as Error).message }
      }
    },
    encrypt: (text: string) => {
      // Simple Base64 encoding for dev mode (production uses Electron safeStorage)
      try { return btoa(unescape(encodeURIComponent(text))) } catch { return text }
    },
    decrypt: (val: string) => {
      try { return decodeURIComponent(escape(atob(val))) } catch { return val }
    },
    agentStatus: async (_target: string) => [],
    agentStateSave: async () => ({ ok: false, reason: 'browser' }),
    agentCancel: async () => ({ ok: false, reason: 'browser' }),
    agentCancelToken: async () => ({ ok: false, reason: 'browser' }),
    agentCheckpointSave: async () => ({ ok: false, reason: 'browser' }),
    agentCheckpointLoad: async () => ({ ok: false, reason: 'browser' }),
    agentCheckpointList: async () => [],
    agentRecover: async () => ({ ok: false, reason: 'browser', recovered: [] })
  }
}

const app = createApp(App)
const pinia = createPinia()

// Expose pinia for CDP debugging
;(globalThis as any).__pinia = pinia

app.use(pinia)
app.use(VueVirtualScroller)
app.component('AppIcon', AppIcon)

;(globalThis as any).__deAiStore = useDeAiStore(pinia)

// Expose app instance for debugging/testing
;(globalThis as any).__app = app

// Initialize intent router (jieba + TF-IDF engine). Routing still falls back
// read-only if init fails, so this must never block app startup.
initIntentRouter()
  .then(() => {
    if (isIntentRouterDegraded()) {
      console.warn('[chainIntentRouter] degraded: falling back to readonly routing')
    }
  })
  .catch((e) => console.error('[chainIntentRouter] init failed:', e))

// Warm the local embedding model after first paint. Low-confidence routing
// still degrades safely while this runs; it must never block app startup.
queueMicrotask(() => {
  void warmupIntentRoutingEmbedding().catch((e) =>
    console.warn('[chainIntentRouter] embedding warmup failed:', e),
  )
})

app.mount('#app')
