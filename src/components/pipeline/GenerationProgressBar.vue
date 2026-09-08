<template>
  <div class="pl-gen-bar" v-if="visible">
    <div class="pl-gen-bar-main">
      <div class="pl-gen-bar-track">
        <div class="pl-gen-bar-fill" :style="{ width: progress + '%' }"></div>
      </div>
      <span class="pl-gen-bar-percent">{{ progress }}%</span>
      <span class="pl-gen-bar-status">{{ status || '准备开始…' }}</span>
      <button v-if="isGenerating" class="pl-gen-bar-cancel" @click="$emit('cancel')">取消</button>
      <button v-else class="pl-gen-bar-close" @click="$emit('close')">关闭</button>
    </div>
    <div class="pl-gen-bar-stream" v-if="logs.length > 0">
      <div class="pl-gen-bar-stream-toggle" :class="{ 'pl-gen-bar-stream-toggle-active': streamExpanded }" @click="streamExpanded = !streamExpanded">
        <span class="pl-gen-bar-stream-toggle-icon">{{ streamExpanded ? '▾' : '▴' }}</span>
        <span class="pl-gen-bar-stream-toggle-text">{{ streamExpanded ? '收起 API 输出' : '展开 API 输出' }}</span>
        <span class="pl-gen-bar-stream-toggle-count">{{ logs.length }} 行</span>
      </div>
      <div v-if="streamExpanded" :id="logContainerId" class="pl-gen-bar-stream-body">
        <div v-for="(line, i) in logs" :key="i" class="pl-gen-bar-stream-line">
          <span class="pl-gen-bar-stream-dot"></span>
          <span>{{ line }}</span>
        </div>
      </div>
    </div>
    <div class="pl-gen-bar-steps" v-if="skillSteps?.length">
      <div class="pl-gen-bar-steps-header">组合步骤</div>
      <div
        v-for="step in skillSteps"
        :key="`${step.skillId}-${step.index}`"
        class="pl-gen-bar-step"
        :class="`pl-gen-bar-step-${step.status}`"
      >
        <span class="pl-gen-bar-step-name">{{ step.skillId }}</span>
        <span class="pl-gen-bar-step-state">{{ stepStatusLabel(step.status) }}</span>
        <span v-if="step.attempts !== undefined" class="pl-gen-bar-step-attempts">{{ step.attempts }} 次</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

interface Props {
  step: number
  visible: boolean
  progress: number
  status: string
  logs: string[]
  isGenerating: boolean
  logContainerId: string
  skillSteps?: Array<{ skillId: string; index: number; status: 'running' | 'done' | 'failed' | 'skipped'; attempts?: number }>
}

defineProps<Props>()
defineEmits<{
  cancel: []
  close: []
}>()

const streamExpanded = ref(false)

type SkillStepStatus = NonNullable<Props['skillSteps']>[number]['status']

function stepStatusLabel(status: SkillStepStatus) {
  if (status === 'done') return '完成'
  if (status === 'failed') return '失败'
  if (status === 'skipped') return '跳过'
  return '执行中'
}
</script>

<style scoped>
.pl-gen-bar {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4) var(--space-5);
  border-top: 1px solid var(--border-color);
  background: var(--bg-input);
}
.pl-gen-bar-main {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}
.pl-gen-bar-track {
  flex: 1 1 auto;
  height: 6px;
  border-radius: 3px;
  background: var(--bg-tertiary);
  overflow: hidden;
}
.pl-gen-bar-fill {
  height: 100%;
  border-radius: inherit;
  background: var(--accent, #4a9);
  transition: width 180ms ease;
}
.pl-gen-bar-percent {
  flex: 0 0 auto;
  font-size: var(--font-size-xs, 12px);
  color: var(--text-secondary);
}
.pl-gen-bar-status {
  flex: 1 1 auto;
  font-size: var(--font-size-sm, 13px);
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pl-gen-bar-cancel, .pl-gen-bar-close {
  flex: 0 0 auto;
  border: none;
  border-radius: var(--radius-xs, 4px);
  padding: var(--space-2) var(--space-5);
  font-size: var(--font-size-xs, 12px);
  cursor: pointer;
}
.pl-gen-bar-cancel {
  background: var(--danger, #e44);
  color: #fff;
}
.pl-gen-bar-close {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}
.pl-gen-bar-stream {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.pl-gen-bar-stream-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-5);
  margin: 0 auto;
  width: fit-content;
  font-size: var(--font-size-xs, 12px);
  color: var(--accent, #4a9);
  background: var(--accent-dim, rgba(74,169,153,0.12));
  border: 1px solid var(--accent, #4a9);
  border-radius: var(--radius-sm, 6px);
  cursor: pointer;
  user-select: none;
  transition: all 150ms ease;
}
.pl-gen-bar-stream-toggle:hover {
  filter: brightness(1.15);
}
.pl-gen-bar-stream-toggle-active {
  background: var(--accent, #4a9);
  color: var(--text-on-accent, #fff);
}
.pl-gen-bar-stream-toggle-icon {
  font-size: 11px;
  line-height: 1;
}
.pl-gen-bar-stream-toggle-text {
  font-weight: 600;
}
.pl-gen-bar-stream-toggle-count {
  font-size: 10px;
  opacity: 0.8;
  padding: var(--space-1) var(--space-2);
  border-radius: 8px;
  background: rgba(0,0,0,0.15);
}
.pl-gen-bar-stream-body {
  max-height: 120px;
  overflow-y: auto;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.pl-gen-bar-stream-line {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  font-size: var(--font-size-xs, 12px);
  color: var(--text-secondary);
  line-height: 1.5;
}
.pl-gen-bar-stream-dot {
  width: 6px;
  height: 6px;
  flex: 0 0 6px;
  margin-top: 6px;
  border-radius: 50%;
  background: var(--accent, #4a9);
}
.pl-gen-bar-steps {
  display: grid;
  gap: var(--space-1);
  padding-top: var(--space-1);
  border-top: 1px dashed var(--border-color);
}
.pl-gen-bar-steps-header {
  font-size: var(--font-size-xs, 12px);
  font-weight: 600;
  color: var(--text-primary);
}
.pl-gen-bar-step {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-xs, 4px);
  background: var(--bg-tertiary);
  font-size: var(--font-size-xs, 12px);
}
.pl-gen-bar-step-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary);
}
.pl-gen-bar-step-state {
  color: var(--text-secondary);
}
.pl-gen-bar-step-running .pl-gen-bar-step-state,
.pl-gen-bar-step-done .pl-gen-bar-step-state {
  color: var(--accent, #4a9);
}
.pl-gen-bar-step-failed .pl-gen-bar-step-state {
  color: var(--danger, #e44);
}
.pl-gen-bar-step-attempts {
  color: var(--text-secondary);
}
</style>
