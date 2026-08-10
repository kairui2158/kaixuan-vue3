 <template>
   <div class="panel-resizer" @mousedown="onMouseDown"></div>
 </template>
 
 <script setup lang="ts">
 const props = defineProps<{
   direction: 'vertical' | 'horizontal'
   minLeft?: number
   maxLeft?: number
 }>()
 
 const emit = defineEmits<{
   resize: [delta: number]
 }>()
 
 let startPos = 0
 let isDragging = false
 
 function onMouseDown(e: MouseEvent) {
   e.preventDefault()
   isDragging = true
   startPos = props.direction === 'vertical' ? e.clientX : e.clientY
   document.addEventListener('mousemove', onMouseMove)
   document.addEventListener('mouseup', onMouseUp)
   document.body.style.cursor = props.direction === 'vertical' ? 'col-resize' : 'row-resize'
   document.body.style.userSelect = 'none'
 }
 
 function onMouseMove(e: MouseEvent) {
   if (!isDragging) return
   const currentPos = props.direction === 'vertical' ? e.clientX : e.clientY
   const delta = currentPos - startPos
   startPos = currentPos
   emit('resize', delta)
 }
 
 function onMouseUp() {
   isDragging = false
   document.removeEventListener('mousemove', onMouseMove)
   document.removeEventListener('mouseup', onMouseUp)
   document.body.style.cursor = ''
   document.body.style.userSelect = ''
 }
 </script>
 
 <style scoped>
.panel-resizer {
  flex-shrink: 0;
  background: var(--border-color);
  transition: background 0.15s;
}
.panel-resizer:hover {
  background: var(--accent);
}
</style>
 
 <style>
 .panel-resizer.vertical {
   width: 4px;
   cursor: col-resize;
 }
 .panel-resizer.horizontal {
   height: 4px;
   cursor: row-resize;
 }
 </style>
