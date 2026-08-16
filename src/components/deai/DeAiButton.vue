<template>
  <button
    class="deai-btn"
    :class="{ processing: deAiStore.isProcessing }"
    :disabled="deAiStore.isProcessing"
    @click="triggerDeAi"
  >
    <span v-if="!deAiStore.isProcessing" class="deai-btn-label">去AI味</span>
    <span v-else class="deai-btn-label">处理中... {{ deAiStore.progress }}%</span>
  </button>
</template>

<script setup lang="ts">
import { useDeAiStore } from '../../stores/deai'
import { useEditorStore } from '../../stores/editor'
import { useDeAi } from '../../composables/useDeAi'

const deAiStore = useDeAiStore()
const editorStore = useEditorStore()
const { process: deAiProcess } = useDeAi()

async function triggerDeAi() {
  if (!editorStore.activeTab) return
  if (deAiStore.skillIds.length === 0) {
    alert('请先在设置中去AI味页面配置技能')
    return
  }
  try {
    const text = editorStore.activeTab.content
    const result = await deAiProcess(text)
    if (result) {
      editorStore.updateContent(editorStore.activeTab.id, result)
    }
  } catch (e: any) {
    alert('去AI味处理失败: ' + (e.message || String(e)))
  }
}
</script>

<style scoped>
.deai-btn {
  background: var(--accent);
  color: var(--text-on-accent);
  border: none;
  border-radius: var(--radius-sm);
  padding: 4px 12px;
  height: 28px;
  font-size: var(--font-size-xs);
  cursor: pointer;
  transition: var(--transition-fast);
}
.deai-btn:hover {
  opacity: 0.9;
}
.deai-btn.processing {
  background: var(--bg-hover);
  color: var(--text-muted);
  cursor: not-allowed;
}
.deai-btn:disabled {
  opacity: 0.5;
}
</style>
