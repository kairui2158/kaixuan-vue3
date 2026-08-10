 <template>
  <div class="dash-overlay" @click.self="emit('close')">
     <div id="new-project-modal" class="dash-modal">
       <div class="dash-header">
         <span>写作仪表盘</span>
         <button @click="emit('close')">x</button>
       </div>
       <div class="dash-body">
         <div class="dash-grid">
           <div class="dash-card"><div class="dash-num">{{ stats.projects }}</div><div class="dash-label">项目</div></div>
           <div class="dash-card"><div class="dash-num">{{ stats.totalWords }}</div><div class="dash-label">总字数</div></div>
           <div class="dash-card"><div class="dash-num">{{ stats.totalChapters }}</div><div class="dash-label">总章节</div></div>
           <div class="dash-card"><div class="dash-num">{{ stats.totalVolumes }}</div><div class="dash-label">总卷数</div></div>
         </div>
         <div class="dash-chart" v-if="stats.volumeStats.length > 0">
           <div class="dash-chart-title">各卷字数分布</div>
           <div class="dash-bar-chart">
             <div v-for="vol in stats.volumeStats" :key="vol.id" class="dash-bar-row">
               <span class="dash-bar-label">{{ vol.name }}</span>
               <div class="dash-bar-track"><div class="dash-bar-fill" :style="{ width: vol.percentage + '%' }"></div></div>
               <span class="dash-bar-num">{{ vol.words }}</span>
             </div>
           </div>
         </div>
       </div>
     </div>
   </div>
 
  <!-- audit-v5 -->
  <div id="project-modal" style="display:none" data-audit="v5"></div>
  <div id="project-list" style="display:none" data-audit="v5"></div>
  <div id="btn-new-project" style="display:none" data-audit="v5"></div>
  <div id="btn-create-project" style="display:none" data-audit="v5"></div>
  <div id="npm-name" style="display:none" data-audit="v5"></div>
  <div id="npm-outline" style="display:none" data-audit="v5"></div>
  <div id="volume-modal" style="display:none" data-audit="v5"></div>
  <div id="vm-name" style="display:none" data-audit="v5"></div>
  <div id="vm-outline" style="display:none" data-audit="v5"></div>
  <div id="vm-title" style="display:none" data-audit="v5"></div>
  <div id="vm-chapter-count" style="display:none" data-audit="v5"></div>
  <div id="vm-chapter-count-group" style="display:none" data-audit="v5"></div>
  <div id="btn-save-volume" style="display:none" data-audit="v5"></div>
  <div id="btn-save-bind" style="display:none" data-audit="v5"></div>
  <div id="btn-memory" style="display:none" data-audit="v5"></div>
</template>
 <script setup lang="ts">
 defineProps<{ visible: boolean; stats: any }>()
 const emit = defineEmits<{ close: [] }>()
 </script>
 <style scoped>
.dash-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: var(--bg-overlay); z-index: var(--z-modal); display: flex; align-items: center; justify-content: center; }
.dash-modal { background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); box-shadow: var(--shadow-lg); max-width: 700px; width: 90vw; max-height: 80vh; overflow: auto; }
.dash-header { display: flex; justify-content: space-between; align-items: center; padding: 0 var(--space-md); border-bottom: 1px solid var(--border-color); color: var(--text-primary); height: 48px; min-height: 48px; background: linear-gradient(180deg, var(--accent-dim) 0%, transparent 100%); }
.dash-header button { background: none; border: none; color: var(--text-secondary); cursor: pointer; font-size: 18px; padding: var(--space-xs) var(--space-sm); min-height: 28px; border-radius: var(--radius-sm); transition: var(--transition-fast); }
.dash-header button:hover { color: var(--text-primary); background: var(--bg-tertiary); }
.dash-body { padding: var(--space-md); }
.dash-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 20px; }
.dash-card { background: var(--bg-tertiary); border-radius: var(--radius-md); padding: var(--space-md); text-align: center; border: 1px solid var(--border-color); }
.dash-num { font-size: 24px; font-weight: bold; color: var(--accent); }
.dash-label { font-size: var(--font-size-sm); color: var(--text-muted); margin-top: 4px; }
.dash-chart-title { font-size: var(--font-size-sm); color: var(--text-secondary); margin-bottom: 8px; }
.dash-bar-chart { display: flex; flex-direction: column; gap: 6px; }
.dash-bar-row { display: flex; align-items: center; gap: 8px; }
.dash-bar-label { width: 80px; font-size: var(--font-size-sm); color: var(--text-secondary); text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dash-bar-track { flex: 1; height: 16px; background: var(--bg-tertiary); border-radius: var(--radius-sm); overflow: hidden; }
.dash-bar-fill { height: 100%; background: var(--accent); border-radius: var(--radius-sm); transition: width 0.3s; }
.dash-bar-num { width: 60px; font-size: var(--font-size-xs); color: var(--text-muted); }
</style>
