<template>
  <section id="memory-mind-map" class="memory-mind-map" aria-label="记忆思维导图">
    <div class="mind-toolbar">
      <strong>思维导图</strong>
      <span>卷 {{ tree.length }} · 事件 {{ eventCount }}</span>
      <button class="btn-sm btn-secondary" type="button" @click="expandAll">全部展开</button>
      <button class="btn-sm btn-secondary" type="button" @click="collapseAll">全部收起</button>
    </div>
    <div v-if="tree.length === 0" class="mind-empty">暂无卷纲和事件数据</div>
    <div v-else class="mind-tree">
      <div v-for="volume in tree" :key="volume.id" class="mind-volume">
        <button class="mind-node mind-volume-node" type="button" @click="toggle(volume.id)">
          <span>{{ isOpen(volume.id) ? '−' : '+' }}</span><strong>{{ volume.name }}</strong>
        </button>
        <div v-if="isOpen(volume.id)" class="mind-children">
          <div v-for="chapter in volume.chapters" :key="chapter.id" class="mind-chapter">
            <button class="mind-node mind-chapter-node" type="button" @click="toggle(chapter.id)">
              <span>{{ isOpen(chapter.id) ? '−' : '+' }}</span>{{ chapter.title }}
            </button>
            <div v-if="isOpen(chapter.id)" class="mind-events">
                <button v-for="event in chapter.events" :key="event.id" class="mind-event" type="button" @click="selectEvent(event.id)">
                <span class="event-dot"></span>{{ event.title }}<small v-if="event.summary">：{{ event.summary }}</small>
              </button>
              <span v-if="chapter.events.length === 0" class="mind-no-event">暂无事件</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div v-if="selectedEvent" class="mind-selection">
      <span>已选事件：{{ selectedEvent.title }}{{ selectedEvent.summary ? `：${selectedEvent.summary}` : '' }}</span>
      <button class="btn-sm btn-secondary" type="button" @click="openSource">打开章节</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { MemoryData } from '../../types/memory'
import { useMemoryGraph } from '../../composables/useMemoryGraph'

const props = defineProps<{ memories: MemoryData; volumes?: Array<{ id?: string; name?: string }>; chapters?: Record<string, Array<{ id?: string; title?: string }>> }>()
const emit = defineEmits<{ openSource: [payload: { kind: 'event'; id: string }] }>()
const { buildMemoryTree } = useMemoryGraph()
const openIds = ref<Set<string>>(new Set())
const selectedEventId = ref('')
const tree = computed(() => buildMemoryTree(props.volumes || [], props.chapters || {}, props.memories.events))
const eventCount = computed(() => tree.value.reduce((total, volume) => total + volume.chapters.reduce((sum, chapter) => sum + chapter.events.length, 0), 0))
const selectedEvent = computed(() => props.memories.events.find(event => event.id === selectedEventId.value) || null)
function isOpen(id: string) { return openIds.value.has(id) }
function toggle(id: string) { const next = new Set(openIds.value); next.has(id) ? next.delete(id) : next.add(id); openIds.value = next }
function expandAll() { openIds.value = new Set(tree.value.flatMap(volume => [volume.id, ...volume.chapters.map(chapter => chapter.id)])) }
function collapseAll() { openIds.value = new Set() }
function selectEvent(id: string) { selectedEventId.value = id }
function openSource() {
  if (selectedEvent.value) emit('openSource', { kind: 'event', id: selectedEvent.value.id })
}
</script>

<style scoped>
.memory-mind-map { height: 100%; overflow: auto; color: var(--text-primary); }
.mind-toolbar { display: flex; align-items: center; gap: 8px; min-height: 38px; border-bottom: 1px solid var(--border-color); }
.mind-toolbar span { flex: 1; color: var(--text-secondary); font-size: var(--font-size-sm); }
.mind-tree { padding: 14px 8px; }
.mind-node, .mind-event { display: flex; align-items: center; gap: 8px; width: 100%; border: 0; background: transparent; color: var(--text-primary); text-align: left; cursor: pointer; }
.mind-node { padding: 7px 8px; border-radius: var(--radius-xs); }
.mind-node:hover, .mind-event:hover { background: var(--bg-hover); }
.mind-volume-node { font-size: var(--font-size-md); }
.mind-children { margin-left: 20px; border-left: 1px solid var(--border-color); padding-left: 10px; }
.mind-chapter-node { color: var(--text-secondary); }
.mind-events { margin-left: 22px; padding: 3px 0 7px 12px; border-left: 1px dashed var(--border-color); }
.mind-event { padding: 5px 8px; color: var(--text-primary); }
.event-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); flex-shrink: 0; }
.mind-event small { color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mind-no-event, .mind-empty { display: block; padding: 20px; color: var(--memory-empty-text); }
.mind-selection { border-top: 1px solid var(--border-color); padding-top: 10px; color: var(--accent); }
</style>
