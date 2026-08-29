<template>
  <div id="dashboard-modal" class="dash-overlay" @click.self="emit('close')">
    <div class="dash-modal">
      <div class="dash-header">
        <h3>写作仪表盘</h3>
        <button class="btn-close" @click="emit('close')">&times;</button>
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
defineProps<{ stats: any }>()
const emit = defineEmits<{ close: [] }>()
</script>

<style scoped>
.dash-overlay {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: var(--bg-overlay-strong); z-index: var(--z-modal);
  display: flex; align-items: center; justify-content: center;
}
.dash-modal {
  background: var(--bg-secondary); border: 1px solid var(--border-color);
  border-radius: var(--radius-md); box-shadow: var(--shadow-lg);
  width: 92vw; max-width: 680px; max-height: 86vh; overflow: auto;
}
.dash-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0 var(--space-md); border-bottom: 1px solid var(--border-color);
  color: var(--text-primary); height: 48px; min-height: 48px;
}
.dash-header h3 { margin: 0; color: var(--text-primary); }
.dash-header .btn-close {
  background: none; border: none; color: var(--text-secondary);
  cursor: pointer; font-size: 24px; line-height: 1; padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-sm); transition: var(--transition-fast);
}
.dash-header .btn-close:hover { color: var(--text-primary); background: var(--bg-tertiary); }
.dash-body { padding: var(--space-md); }
.dash-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-md); margin-bottom: var(--space-md);
}
.dash-card {
  background: var(--bg-tertiary); border: 1px solid var(--border-color);
  border-radius: var(--radius-md); padding: var(--space-md); text-align: center;
}
.dash-card-title { font-size: var(--font-size-sm); color: var(--text-secondary); margin-bottom: var(--space-sm); }
.dash-card-value { font-size: var(--font-size-lg); font-weight: 600; color: var(--text-primary); }
.dash-chart-title { margin: 0 0 var(--space-sm); font-size: var(--font-size-md); color: var(--text-primary); }
.dash-bar-chart { display: flex; flex-direction: column; gap: var(--space-sm); }
.dash-bar-row { display: flex; align-items: center; gap: var(--space-sm); }
.dash-bar-label { width: 80px; font-size: var(--font-size-sm); color: var(--text-secondary); flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dash-bar-track { flex: 1; height: 20px; background: var(--bg-input); border-radius: var(--radius-sm); overflow: hidden; }
.dash-bar-fill { height: 100%; border-radius: var(--radius-sm); transition: width 0.3s ease; }
.dash-bar-fill.accent { background: var(--accent); }
.dash-bar-fill.success { background: var(--success); }
.dash-bar-fill.warning { background: var(--warning); }
.dash-bar-value { width: 40px; text-align: right; font-size: var(--font-size-sm); color: var(--text-primary); flex-shrink: 0; }
</style>
