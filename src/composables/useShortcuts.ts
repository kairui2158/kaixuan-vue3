 import { onMounted, onUnmounted } from 'vue'
 
 interface ShortcutCallbacks {
   onOpenOutline?: () => void
   onOpenSettingsCollection?: () => void
   onOpenPipeline?: () => void
   onOpenMemory?: () => void
   onOpenPluginMarket?: () => void
   onOpenSettings?: () => void
   onUndo?: () => void
   onRedo?: () => void
   onSave?: () => void
   onCloseAllPanels?: () => void
   onChatSend?: () => void
   onFindNext?: () => void
   onFindPrev?: () => void
 }
 
 /**
  * 快捷键系统 — 从旧架构renderer_v2.js keydown监听迁移
  * Ctrl+1~5: 面板切换
  * Ctrl+,: 设置
  * Ctrl+Z/Y: 撤销/重做
  * Ctrl+S: 保存
  * Escape: 关闭面板
  */
 export function useShortcuts(cb: ShortcutCallbacks) {
   function _handler(e: KeyboardEvent) {
     const ctrl = e.ctrlKey || e.metaKey
     const target = e.target as HTMLElement
     const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'
 
     // Ctrl+1~5: panel shortcuts
     if (ctrl && !e.shiftKey && !e.altKey) {
       if (e.key === '1') { e.preventDefault(); cb.onOpenOutline?.(); return }
       if (e.key === '2') { e.preventDefault(); cb.onOpenSettingsCollection?.(); return }
       if (e.key === '3') { e.preventDefault(); cb.onOpenPipeline?.(); return }
       if (e.key === '4') { e.preventDefault(); cb.onOpenMemory?.(); return }
       if (e.key === '5') { e.preventDefault(); cb.onOpenPluginMarket?.(); return }
       if (e.key === ',') { e.preventDefault(); cb.onOpenSettings?.(); return }
       if (e.key === 's' || e.key === 'S') { e.preventDefault(); cb.onSave?.(); return }
       if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); cb.onUndo?.(); return }
       if (e.key === 'y' || e.key === 'Y') { e.preventDefault(); cb.onRedo?.(); return }
     }
 
     // Escape: close all panels
     if (e.key === 'Escape' && !ctrl) {
       cb.onCloseAllPanels?.();
       return
     }
 
     // Enter/Shift+Enter in chat input
     if (isInput && target.id === 'chat-input') {
       if (e.key === 'Enter' && !e.shiftKey) {
         e.preventDefault()
         cb.onChatSend?.()
         return
       }
     }
 
     // Enter/Shift+Enter in find bar
     if (isInput && (target.id === 'find-input' || target.id === 'find-query')) {
       if (e.key === 'Enter' && !e.shiftKey) {
         e.preventDefault()
         cb.onFindNext?.()
         return
       }
       if (e.key === 'Enter' && e.shiftKey) {
         e.preventDefault()
         cb.onFindPrev?.()
         return
       }
     }
   }
 
   onMounted(() => {
     window.addEventListener('keydown', _handler)
   })
 
   onUnmounted(() => {
     window.removeEventListener('keydown', _handler)
   })
 }
