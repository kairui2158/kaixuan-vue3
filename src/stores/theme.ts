 import { defineStore } from 'pinia'
 import { ref } from 'vue'
 
 /**
  * 主题管理 — 从旧架构_toggleTheme迁移
  * dark/light切换，持久化到localStorage
  */
 export const useThemeStore = defineStore('theme', () => {
   const theme = ref<'dark' | 'light'>('dark')
 
   function init() {
     const saved = localStorage.getItem('wa-theme') as 'dark' | 'light' | null
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
 
   function toggle() {
     theme.value = theme.value === 'dark' ? 'light' : 'dark'
     localStorage.setItem('wa-theme', theme.value)
     applyTheme()
   }
 
   function setTheme(t: 'dark' | 'light') {
     theme.value = t
     localStorage.setItem('wa-theme', t)
     applyTheme()
   }
 
   return { theme, init, toggle, setTheme }
 })
