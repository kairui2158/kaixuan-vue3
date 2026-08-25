 import { defineStore } from 'pinia'
 import { ref } from 'vue'
import { storageKey } from '../utils/storage-key'
 
 /**
  * 主题管理 — 从旧架构_toggleTheme迁移
  * dark/light切换，持久化到localStorage
  */
 export const useThemeStore = defineStore('theme', () => {
   const theme = ref<'dark' | 'light'>('dark')
 
   async function init() {
     const saved = window.electronAPI ? await window.electronAPI.storageRead(storageKey('app-theme')) : localStorage.getItem('wa-theme') as 'dark' | 'light' | null
     if (saved) theme.value = saved
     applyTheme()
   }
 
   function applyTheme() {
     if (theme.value === 'light') {
       document.body.classList.add('light-theme')
     } else {
       document.body.classList.remove('light-theme')
     }
   }
 
   async function toggle() {
     theme.value = theme.value === 'dark' ? 'light' : 'dark'
     if (window.electronAPI) { await window.electronAPI.storageWrite(storageKey('app-theme'), theme.value) } else { localStorage.setItem('wa-theme', theme.value) }
     applyTheme()
   }
 
   async function setTheme(t: 'dark' | 'light') {
     theme.value = t
     if (window.electronAPI) { await window.electronAPI.storageWrite(storageKey('app-theme'), t) } else { localStorage.setItem('wa-theme', t) }
     applyTheme()
   }
 
   return { theme, init, toggle, setTheme }
 })


