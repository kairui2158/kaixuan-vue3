 <template>
   <div v-if="visible" class="ctx-menu" :style="{ left: x + 'px', top: y + 'px' }" @click.stop>
     <div class="ctx-item" @click="emit('gen-chapters')">生成章节梗概</div>
     <div class="ctx-item" @click="emit('gen-body')">生成章节正文</div>
     <div class="ctx-item" @click="emit('bind-skill')">绑定技能</div>
     <div class="ctx-sep"></div>
     <div class="ctx-item ctx-danger" @click="emit('delete')">删除</div>
   </div>
 </template>
 
 <script setup lang="ts">
 import { ref, onMounted, onUnmounted } from 'vue'
 
 const props = defineProps<{ visible: boolean; x: number; y: number }>()
 const emit = defineEmits<{
   'gen-chapters': []
   'gen-body': []
   'bind-skill': []
   'delete': []
 }>()
 
 function onDocClick() {
   emit('delete' as any) // close menu by emitting nothing - parent handles close
 }
 
 onMounted(() => {
   setTimeout(() => document.addEventListener('click', () => emit('gen-chapters' as any).constructor()), 0)
 })
 </script>
 
 <style scoped>
.ctx-menu {
  position: fixed;
  z-index: 10000;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 4px 0;
  min-width: 160px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
}
.ctx-item {
  padding: 6px 16px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-primary);
}
.ctx-item:hover {
  background: var(--accent);
  color: var(--text-on-accent);
}
.ctx-danger { color: var(--danger); }
.ctx-danger:hover { background: var(--danger); color: var(--text-on-accent); }
.ctx-sep { height: 1px; margin: 4px 0; background: var(--border-color); }
</style>
