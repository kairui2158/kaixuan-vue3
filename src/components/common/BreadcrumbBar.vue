 <template>
<div class="breadcrumb-bar">
    <span id="breadcrumb-bar" class="breadcrumb-home" @click="emit('home')">小说工坊</span>
     <template v-for="(item, i) in items" :key="i">
       <span class="breadcrumb-sep">/</span>
       <span class="breadcrumb-item" @click="emit('navigate', i)">
         {{ item }}
         <span class="breadcrumb-close" @click.stop="emit('close', i)">x</span>
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
   gap: 4px;
  padding: 4px 12px;
  font-size: 12px;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.breadcrumb-home {
  cursor: pointer;
  color: var(--accent);
}
.breadcrumb-home:hover { text-decoration: underline; }
.breadcrumb-sep { opacity: 0.5; }
.breadcrumb-item {
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--text-secondary);
}
.breadcrumb-item:hover { color: var(--accent); }
.breadcrumb-close {
  font-size: 10px;
  opacity: 0.5;
  padding: 0 2px;
}
.breadcrumb-close:hover { opacity: 1; color: var(--danger); }
</style>
