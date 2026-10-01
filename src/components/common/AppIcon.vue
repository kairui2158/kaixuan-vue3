<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    class="app-icon"
  >
    <path v-for="(segment, index) in paths" :key="index" :d="segment" />
    <circle v-for="circle in circles" :key="circle.key" :cx="circle.cx" :cy="circle.cy" :r="circle.r" />
    <line
      v-for="line in lines"
      :key="line.key"
      :x1="line.x1" :y1="line.y1" :x2="line.x2" :y2="line.y2"
    />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue'

export type AppIconName =
  | 'outline'
  | 'pipeline'
  | 'memory'
  | 'market'
  | 'settings'
  | 'dashboard'
  | 'sun'
  | 'moon'
  | 'spark'
  | 'star'
  | 'history'
  | 'bookmark'
  | 'inbox'
  | 'search'
  | 'check'
  | 'x'
  | 'undo'
  | 'redo'
  | 'copy'
  | 'refresh'
  | 'insert'
  | 'replace'
  | 'expand'
  | 'shrink'
  | 'arrow-up'

interface CircleIcon { cx: number; cy: number; r: number }
interface LineIcon { x1: number; y1: number; x2: number; y2: number }

const icons: Record<AppIconName, { paths?: string[]; circles?: CircleIcon[]; lines?: LineIcon[] }> = {
  outline: {
    paths: ['M4 2h5l3 3v9H4z', 'M9 2v3h3', 'M6 8h4', 'M6 11h4'],
  },
  pipeline: {
    paths: ['M2 3.5h3v3H2z', 'M6.5 9.5h3v3h-3z', 'M3.5 6.5v3', 'M6.5 11H12'],
    lines: [{ x1: 11, y1: 2.5, x2: 14, y2: 2.5 }],
  },
  memory: {
    paths: ['M5.5 2.5c1 0 1.7.7 1.7 1.7v7.6c0 1-.7 1.7-1.7 1.7s-1.7-.7-1.7-1.7V4.2c0-1 .7-1.7 1.7-1.7z', 'M10.5 2.5c1 0 1.7.7 1.7 1.7v7.6c0 1-.7 1.7-1.7 1.7s-1.7-.7-1.7-1.7V4.2c0-1 .7-1.7 1.7-1.7z', 'M7.2 4.2h1.6', 'M7.2 8h1.6', 'M7.2 11.8h1.6'],
  },
  market: {
    paths: ['M2.5 2.5 8 6l5.5-3.5', 'M2.5 2.5v8L8 14l5.5-3.5v-8', 'M8 6v8'],
  },
  settings: {
    paths: ['M6.5 6.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0z', 'M8 1.5v1.8', 'M8 12.7v1.8', 'M1.5 8h1.8', 'M12.7 8h1.8', 'M3.4 3.4l1.3 1.3', 'M11.3 11.3l1.3 1.3', 'M3.4 12.6l1.3-1.3', 'M11.3 4.7l1.3-1.3'],
  },
  dashboard: {
    paths: ['M2.5 2.5h4v5h-4z', 'M9.5 2.5h4v3h-4z', 'M9.5 8.5h4v5h-4z', 'M2.5 10.5h4v3h-4z'],
  },
  sun: {
    circles: [{ cx: 8, cy: 8, r: 3 }],
    lines: [
      { x1: 8, y1: 1, x2: 8, y2: 2.5 },
      { x1: 8, y1: 13.5, x2: 8, y2: 15 },
      { x1: 1, y1: 8, x2: 2.5, y2: 8 },
      { x1: 13.5, y1: 8, x2: 15, y2: 8 },
      { x1: 3.05, y1: 3.05, x2: 4.1, y2: 4.1 },
      { x1: 11.9, y1: 11.9, x2: 12.95, y2: 12.95 },
      { x1: 3.05, y1: 12.95, x2: 4.1, y2: 11.9 },
      { x1: 11.9, y1: 4.1, x2: 12.95, y2: 3.05 },
    ],
  },
  moon: { paths: ['M13 8.2A5.2 5.2 0 1 1 7.8 3a4.1 4.1 0 0 0 5.2 5.2z'] },
  spark: { paths: ['M8 2v12', 'M2 8h12', 'M4 4l8 8', 'M12 4l-8 8'] },
  star: { paths: ['M8 2l1.9 3.9 4.1.6-3 2.9.7 4.1L8 11.5l-3.7 2 .7-4.1-3-2.9 4.1-.6z'] },
  history: { paths: ['M8 3v5l3.2 2', 'M2.5 8a5.5 5.5 0 1 0 1.9-4.2', 'M2.5 2.8v3h3'] },
  bookmark: { paths: ['M4 2.5h8v11l-4-2.5-4 2.5z'] },
  inbox: { paths: ['M2.5 8.5h3l1 2h3l1-2h3', 'M2.5 8.5 4 3h8l1.5 5.5v3.5h-11z'] },
  search: { circles: [{ cx: 7, cy: 7, r: 4 }], lines: [{ x1: 10.2, y1: 10.2, x2: 13.5, y2: 13.5 }] },
  check: { paths: ['M3.5 8.5l3 3 6-6.5'] },
  x: { paths: ['M4 4l8 8', 'M12 4l-8 8'] },
  undo: { paths: ['M3 5v4h4', 'M3.2 9a5.2 5.2 0 1 1 1.1 4.3'] },
  redo: { paths: ['M13 5v4H9', 'M12.8 9A5.2 5.2 0 1 0 11.7 13.3'] },
  copy: {
    paths: ['M5.5 5.5h6a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5h-6A1.5 1.5 0 0 1 4 13V7a1.5 1.5 0 0 1 1.5-1.5z'],
    lines: [{ x1: 8.5, y1: 3.5, x2: 12, y2: 3.5 }, { x1: 13.5, y1: 5, x2: 13.5, y2: 6 }],
  },
  refresh: { paths: ['M2.8 8a5.2 5.2 0 0 1 9-2.4', 'M11.7 2.8V5.6H8.9', 'M13.2 8a5.2 5.2 0 0 1-9 2.4', 'M4.3 13.2V10.4H7.1'] },
  insert: { paths: ['M8 2v12', 'M3 7l5-5 5 5'] },
  replace: {
    paths: ['M10.8 3.2h2.4a1.6 1.6 0 0 1 1.6 1.6v2.4', 'M10.8 12.8h2.4a1.6 1.6 0 0 0 1.6-1.6V8.8', 'M3.2 5.2V3.6A1.6 1.6 0 0 1 4.8 2h2.4', 'M3.2 12.8v1.6a1.6 1.6 0 0 0 1.6 1.6h2.4'],
    lines: [{ x1: 3.2, y1: 8, x2: 12.8, y2: 8 }],
  },
  expand: { paths: ['M6 2.5H3.5A1.5 1.5 0 0 0 2 4v2', 'M10 2.5h2.5A1.5 1.5 0 0 1 14 4v2', 'M6 13.5H3.5A1.5 1.5 0 0 1 2 12v-2', 'M12.5 6h1.5v1.5'] },
  shrink: { paths: ['M6 6H3.5A1.5 1.5 0 0 1 2 4.5V2', 'M10 6h2.5A1.5 1.5 0 0 0 14 4.5V2', 'M6 10H3.5A1.5 1.5 0 0 0 2 11.5V14', 'M8.5 7.5H14v5.5H8.5z'] },
  'arrow-up': { paths: ['M8 12.8V3.2', 'M4 7.2l4-4 4 4'] },
}

const props = withDefaults(defineProps<{ name: AppIconName; size?: number; strokeWidth?: number }>(), {
  size: 16,
  strokeWidth: 1.5,
})

const icon = computed(() => icons[props.name] ?? {})
const paths = computed(() => icon.value.paths ?? [])
const circles = computed(() => (icon.value.circles ?? []).map((circle, index) => ({ ...circle, key: `c-${index}` })))
const lines = computed(() => (icon.value.lines ?? []).map((line, index) => ({ ...line, key: `l-${index}` })))
</script>

<style scoped>
.app-icon {
  display: block;
  flex-shrink: 0;
}
</style>
