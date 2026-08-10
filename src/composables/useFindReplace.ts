 import { ref, computed } from 'vue'
 
 /**
  * 查找替换 — 从旧架构_doFind/_findNext/_findPrev/_replaceOne/_replaceAll/_selectMatch 迁移
  * 完整查找替换功能
  */
 export function useFindReplace() {
   const findQuery = ref('')
   const replaceQuery = ref('')
   const matches = ref<number[]>([])
   const currentMatch = ref(-1)
   const isVisible = ref(false)
   let editorEl: HTMLTextAreaElement | null = null
 
   const totalMatches = computed(() => matches.value.length)
 
   function bindEditor(el: HTMLTextAreaElement) {
     editorEl = el
   }
 
   function doFind() {
     if (!editorEl || !findQuery.value) {
       matches.value = []
       currentMatch.value = -1
       return
     }
     const text = editorEl.value
     const query = findQuery.value
     const indices: number[] = []
     let pos = 0
     while (true) {
       const idx = text.indexOf(query, pos)
       if (idx === -1) break
       indices.push(idx)
       pos = idx + query.length
     }
     matches.value = indices
     if (indices.length > 0 && currentMatch.value === -1) {
       currentMatch.value = 0
       selectMatch(0)
     } else if (indices.length > 0) {
       selectMatch(currentMatch.value)
     } else {
       currentMatch.value = -1
     }
   }
 
   function findNext() {
     if (matches.value.length === 0) { doFind(); return }
     currentMatch.value = (currentMatch.value + 1) % matches.value.length
     selectMatch(currentMatch.value)
   }
 
   function findPrev() {
     if (matches.value.length === 0) { doFind(); return }
     currentMatch.value = currentMatch.value <= 0 ? matches.value.length - 1 : currentMatch.value - 1
     selectMatch(currentMatch.value)
   }
 
   function selectMatch(idx: number) {
     if (!editorEl || idx < 0 || idx >= matches.value.length) return
     const start = matches.value[idx]
     const end = start + findQuery.value.length
     editorEl.focus()
     editorEl.setSelectionRange(start, end)
   }
 
   function replaceOne(): string | null {
     if (!editorEl || currentMatch.value < 0 || matches.value.length === 0) return null
     const text = editorEl.value
     const start = matches.value[currentMatch.value]
     const end = start + findQuery.value.length
     const newText = text.substring(0, start) + replaceQuery.value + text.substring(end)
     editorEl.value = newText
     doFind()
     return newText
   }
 
   function replaceAll(): string | null {
     if (!editorEl || !findQuery.value) return null
     const text = editorEl.value
     const newText = text.split(findQuery.value).join(replaceQuery.value)
     editorEl.value = newText
     matches.value = []
     currentMatch.value = -1
     return newText
   }
 
   function toggle() {
     isVisible.value = !isVisible.value
     if (isVisible.value && editorEl) {
       editorEl.focus()
     }
   }
 
   function close() {
     isVisible.value = false
   }
 
   return {
     findQuery, replaceQuery, matches, currentMatch, isVisible, totalMatches,
     bindEditor, doFind, findNext, findPrev, selectMatch, replaceOne, replaceAll, toggle, close
   }
 }
