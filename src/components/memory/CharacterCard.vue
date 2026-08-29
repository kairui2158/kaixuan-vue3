<template>
  <article class="character-card" :data-entity-id="entity.id">
    <header class="character-card-header">
      <div class="character-card-title">
        <h3>{{ entity.name || '未命名实体' }}</h3>
        <span class="character-card-type">{{ typeLabel }}</span>
      </div>
      <span class="character-card-status">{{ entity.status || '未记录状态' }}</span>
    </header>
    <dl class="character-card-fields">
      <div v-for="field in fields" :key="field.label" class="character-card-field">
        <dt>{{ field.label }}</dt>
        <dd>
          <span>{{ field.value || '未记录' }}</span>
          <button v-if="entity.evidence.length" class="character-card-source" type="button" @click="openSource">来源</button>
        </dd>
      </div>
    </dl>
    <div v-if="entity.aliases.length" class="character-card-row">
      <span class="character-card-label">别名</span><span>{{ entity.aliases.join('、') }}</span>
    </div>
    <div v-if="entity.possessions.length" class="character-card-row">
      <span class="character-card-label">持有物</span><span>{{ entity.possessions.join('、') }}</span>
    </div>
    <div v-if="entity.skills.length" class="character-card-row">
      <span class="character-card-label">能力</span><span>{{ entity.skills.join('、') }}</span>
    </div>
    <footer class="character-card-footer">
      <span class="character-card-source-count">来源 {{ entity.evidence.length }} 条</span>
      <button v-if="entity.evidence.length" class="btn-sm btn-secondary" type="button" @click="openSource">打开首个来源</button>
      <button class="btn-sm btn-secondary" type="button" @click="$emit('export')">导出角色卡</button>
    </footer>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { MemoryEntity } from '../../types/memory'

const props = defineProps<{ entity: MemoryEntity }>()
const emit = defineEmits<{
  openSource: [payload: { kind: 'entity'; id: string }]
  export: []
}>()
const typeLabels: Record<MemoryEntity['type'], string> = {
  character: '人物', organization: '组织', location: '地点', item: '物品', concept: '概念', other: '其他'
}
const typeLabel = computed(() => typeLabels[props.entity.type] || '其他')
const fields = computed(() => [
  { label: '描述', value: props.entity.description },
  { label: '性格', value: props.entity.personality },
  { label: '外貌', value: props.entity.appearance },
  { label: '身世', value: props.entity.background },
  { label: '出场章节', value: props.entity.appearances.join('、') }
])
function openSource() {
  if (props.entity.evidence[0]?.chapterId) emit('openSource', { kind: 'entity', id: props.entity.id })
}
</script>

<style scoped>
.character-card { display:flex; flex-direction:column; gap:10px; padding:14px; border:1px solid var(--memory-card-border); border-radius:var(--radius-sm); background:var(--memory-card-bg); }
.character-card-header,.character-card-title,.character-card-footer,.character-card-row { display:flex; align-items:center; gap:8px; }
.character-card-header { justify-content:space-between; align-items:flex-start; }
.character-card-title { min-width:0; }
.character-card-title h3 { margin:0; font-size:var(--font-size-lg); overflow-wrap:anywhere; }
.character-card-type,.character-card-status,.character-card-source-count { color:var(--text-secondary); font-size:var(--font-size-sm); }
.character-card-type { padding:2px 6px; border-radius:var(--radius-xs); background:var(--bg-hover); }
.character-card-status { max-width:35%; overflow-wrap:anywhere; text-align:right; }
.character-card-fields { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px 14px; margin:0; }
.character-card-field { min-width:0; }
.character-card-field dt,.character-card-label { color:var(--text-secondary); font-size:var(--font-size-sm); }
.character-card-field dd { display:flex; align-items:flex-start; gap:6px; margin:3px 0 0; line-height:1.45; white-space:pre-wrap; overflow-wrap:anywhere; }
.character-card-field dd span { min-width:0; flex:1; }
.character-card-source { flex:0 0 auto; padding:0 4px; border:0; background:transparent; color:var(--accent); cursor:pointer; font-size:var(--font-size-xs); }
.character-card-row { align-items:flex-start; line-height:1.45; }
.character-card-label { flex:0 0 52px; }
.character-card-footer { flex-wrap:wrap; border-top:1px solid var(--border-color); padding-top:8px; }
.character-card-source-count { flex:1; }
@media (max-width:700px) { .character-card-fields { grid-template-columns:1fr; } }
</style>
