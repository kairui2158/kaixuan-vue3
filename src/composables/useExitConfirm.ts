 import { ref } from 'vue'
 
 /**
  * 退出确认 — 从旧架构saveAndExit/directExit迁移
  * 窗口关闭前提示保存
  */
 export function useExitConfirm() {
   const showExitConfirm = ref(false)
   
   function onBeforeUnload(e: BeforeUnloadEvent) {
     e.preventDefault()
     e.returnValue = ''
     return ''
   }
   
   function enableExitGuard() {
     window.addEventListener('beforeunload', onBeforeUnload)
   }
   
   function disableExitGuard() {
     window.removeEventListener('beforeunload', onBeforeUnload)
   }
   
   /** 保存并退出 */
   async function saveAndExit(saveFn: () => Promise<void>) {
     try {
       await saveFn()
     } catch (e) {
       console.error('[ExitConfirm] save error:', e)
     }
     disableExitGuard()
     window.close()
   }
   
   /** 直接退出不保存 */
   function directExit() {
     disableExitGuard()
     window.close()
   }
   
   return {
     showExitConfirm,
     enableExitGuard,
     disableExitGuard,
     saveAndExit,
     directExit
   }
 }
