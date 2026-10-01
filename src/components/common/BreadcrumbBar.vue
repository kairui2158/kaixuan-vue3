 <template>
<div class="breadcrumb-bar">
     <template v-for="(item, i) in items" :key="i">
       <span class="breadcrumb-sep">/</span>
       <span class="breadcrumb-item" @click="emit('navigate', i)">
         {{ item }}
         <button class="breadcrumb-close" type="button" aria-label="关闭此层级" @click.stop="emit('close', i)"><AppIcon name="x" /></button>
       </span>
     </template>
   </div>
 </template>
 
 <script setup lang="ts">
 defineProps<{ items: string[] }>()
 const emit = defineEmits<{
   home: []
   navigate: [index: number]
   close: [index: number]
 }>()
 </script>
 
 <style scoped>
.breadcrumb-bar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-6);
  font-size: var(--font-size-md);
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
  overflow: hidden;
 white-space: nowrap;
}
.breadcrumb-sep { opacity: 0.5; }
.breadcrumb-item {
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--text-secondary);
}
.breadcrumb-item:hover { color: var(--accent); }
.breadcrumb-close {
  display: inline-flex;
  align-items: center;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: var(--font-size-xxs);
  opacity: 0.5;
  padding: 0 var(--space-1);
}
.breadcrumb-close:hover { opacity: 1; color: var(--danger); }
</style>
