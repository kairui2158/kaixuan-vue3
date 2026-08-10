import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './styles/tokens.css'
import './styles/global.css'

import VueVirtualScroller from 'vue-virtual-scroller'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'

// Browser polyfill: when not running in Electron, shim electronAPI with localStorage
if (!(window as any).electronAPI) {
  ;(window as any).electronAPI = {
    storageRead: (key: string) => { try { return localStorage.getItem(key) } catch { return null } },
    storageWrite: (key: string, val: string) => { try { localStorage.setItem(key, val); return true } catch { return false } },
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
    onChannelMessage: () => {}
  }
}

const app = createApp(App)
const pinia = createPinia()

// Expose pinia for CDP debugging
;(globalThis as any).__pinia = pinia

app.use(pinia)
app.use(VueVirtualScroller)
app.mount('#app')
