<template>
  <div id="dashboard-modal" data-modal-id="dashboard-modal" class="modal-overlay" :style="{ zIndex: modalQueue.getZIndex('dashboard-modal') }" @click.self="emit('close')">
    <div class="dash-modal">
      <div class="dash-header">
        <h3>写作仪表盘</h3>
        <button class="btn-close" type="button" aria-label="关闭写作仪表盘" @click="emit('close')"><AppIcon name="x" /></button>
      </div>
      <div class="dash-body">
        <div class="dash-grid">
          <div class="dash-card">
            <div class="dash-card-title">总卷数</div>
            <div class="dash-card-value">{{ stats.totalVolumes }}</div>
          </div>
          <div class="dash-card">
            <div class="dash-card-title">总章节</div>
            <div class="dash-card-value">{{ stats.totalChapters }}</div>
          </div>
          <div class="dash-card">
            <div class="dash-card-title">总字数</div>
            <div class="dash-card-value">{{ stats.totalWords.toLocaleString() }}</div>
          </div>
          <div class="dash-card">
            <div class="dash-card-title">平均每章</div>
            <div class="dash-card-value">{{ stats.avgWords.toLocaleString() }}</div>
          </div>
          <div class="dash-card">
            <div class="dash-card-title">完成度</div>
            <div class="dash-card-value">{{ stats.completionRate }}%</div>
          </div>
          <div class="dash-card">
            <div class="dash-card-title">已完成章节</div>
            <div class="dash-card-value">{{ stats.completedChapters }}/{{ stats.totalChapters }}</div>
          </div>
        </div>
        <div class="dash-chart" v-if="stats.volumeStats.length > 0">
          <h4 class="dash-chart-title">各卷字数分布</h4>
          <div class="dash-bar-chart">
            <div v-for="vol in stats.volumeStats" :key="vol.id" class="dash-bar-row">
              <span class="dash-bar-label">{{ vol.name }}</span>
              <div class="dash-bar-track">
                <div
                  class="dash-bar-fill"
                  :class="vol.barClass"
                  :style="{ width: vol.percentage + '%' }"
                ></div>
              </div>
              <span class="dash-bar-value">{{ vol.words.toLocaleString() }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue'
import { useModalQueue } from '../../composables/useModalQueue'

defineProps<{ stats: any }>()
const emit = defineEmits<{ close: [] }>()
const modalQueue = useModalQueue()

onMounted(() => modalQueue.open('dashboard-modal'))
onBeforeUnmount(() => modalQueue.close('dashboard-modal'))
</script>

<style scoped>
.dash-modal {
  background: var(--bg-secondary); border: 1px solid var(--border-color);
  border-radius: var(--radius-md); box-shadow: var(--shadow-lg);
  width: 92vw; max-width: 680px; max-height: 86vh;
  display: flex; flex-direction: column; overflow: hidden;
}
.dash-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0 var(--space-6); border-bottom: 1px solid var(--border-color);
  color: var(--text-primary); height: 48px; min-height: 48px;
}
.dash-header h3 { margin: 0; color: var(--text-primary); }
.dash-header .btn-close {
  background: none; border: none; color: var(--text-secondary);
  cursor: pointer; font-size: var(--text-display); line-height: 1; padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-sm); transition: var(--transition-fast);
}
.dash-header .btn-close:hover { color: var(--text-primary); background: var(--bg-tertiary); }
.dash-body { padding: var(--space-6); overflow-y: auto; min-height: 0; }
.dash-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-6); margin-bottom: var(--space-6);
}
.dash-card {
  background: var(--bg-tertiary); border: 1px solid var(--border-color);
  border-radius: var(--radius-md); padding: var(--space-6); text-align: center;
}
.dash-card-title { font-size: var(--font-size-sm); color: var(--text-secondary); margin-bottom: var(--space-4); }
.dash-card-value { font-size: var(--font-size-lg); font-weight: 600; color: var(--text-primary); }
.dash-chart-title { margin: 0 0 var(--space-4); font-size: var(--font-size-md); color: var(--text-primary); }
.dash-bar-chart { display: flex; flex-direction: column; gap: var(--space-4); }
.dash-bar-row { display: flex; align-items: center; gap: var(--space-4); }
.dash-bar-label { width: 80px; max-width: 32%; font-size: var(--font-size-sm); color: var(--text-secondary); flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dash-bar-track { flex: 1; height: 20px; background: var(--bg-input); border-radius: var(--radius-sm); overflow: hidden; }
.dash-bar-fill { height: 100%; border-radius: var(--radius-sm); transition: width var(--duration-normal) var(--ease-standard); }
.dash-bar-fill.accent { background: var(--accent); }
.dash-bar-fill.success { background: var(--success); }
.dash-bar-fill.warning { background: var(--warning); }
.dash-bar-value { width: 40px; text-align: right; font-size: var(--font-size-sm); color: var(--text-primary); flex-shrink: 0; }
</style>
