import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './styles/tokens.css'
import './styles/global.css'
import './styles/base-components.css'
import './styles/modal.css'
import VueVirtualScroller from 'vue-virtual-scroller'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'

// electron-log: renderer process logging + console全覆盖
import log from './services/logger-shim.js'
Object.assign(console, log.functions)

// 诊断日志：重建 window.DiagLogger（写盘 + 实时订阅 + 全局错误捕获）
import { DiagLogger } from './services/diag.js'
DiagLogger.init()

// MCP protocol adapter: enable tool execution from renderer/window scope
import { MCPProtocol } from './services/mcp-protocol'
import { ToolRegistry } from './services/tool-registry'
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
        const str = typeof val === 'string' ? val : JSON.stringify(val)
        localStorage.setItem(key, str)
        return true
      } catch { return false }
    },
    storageRemove: (key: string) => { try { localStorage.removeItem(key); return true } catch { return false } },
    storageList: () => { try { const keys: string[] = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k) keys.push(k) } return keys } catch { return [] } },
    clipboardWrite: () => {},
    clipboardRead: () => '',
    showItemInFolder: () => {},
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
        const url = baseUrl.endsWith('/v1') ? baseUrl + '/models' : baseUrl + '/v1/models'
        const resp = await fetch(url, { headers: { 'Authorization': 'Bearer ' + apiKey } })
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
        const url = baseUrl.endsWith('/v1') ? baseUrl + '/models' : baseUrl + '/v1/models'
        const resp = await fetch(url, { headers: { 'Authorization': 'Bearer ' + apiKey } })
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
    agentStatus: async (_target: string) => {
      // Dev mode: return idle status
      return { status: 'idle', message: 'No agents running in dev mode' }
    }
  }
}

const app = createApp(App)
const pinia = createPinia()

// Expose pinia for CDP debugging
;(globalThis as any).__pinia = pinia

app.use(pinia)
app.use(VueVirtualScroller)

// Expose app instance for debugging/testing
;(globalThis as any).__app = app

app.mount('#app')
