<template>
  <div id="pl-style-card" data-modal-id="pl-style-card" class="pl-style-card">
    <div
      class="pl-style-card-header"
      role="button"
      tabindex="0"
      :aria-expanded="styleCardExpanded"
      @click="toggleExpanded"
      @keydown.enter.prevent="toggleExpanded"
      @keydown.space.prevent="toggleExpanded"
    >
      <span class="pl-style-card-title">创作风格</span>
      <span class="pl-style-card-summary" v-if="profile.styleTags || profile.pacingParams">
        {{ profile.styleTags }} | {{ profile.pacingParams }}
      </span>
      <span class="pl-style-card-summary" v-else>待 AI 分析</span>
      <span class="pl-style-card-state">{{ profile.locked ? '已锁定' : '未锁定' }}</span>
      <span class="pl-style-card-toggle">{{ styleCardExpanded ? '收起高级设置' : '展开高级设置' }}</span>
    </div>
    <div class="pl-style-card-body" v-show="styleCardExpanded">
      <div class="pl-style-tags-section">
        <span class="pl-style-section-label">叙事风格</span>
        <div class="pl-style-tag-pool">
          <label
            v-for="chip in styleTagChips"
            :key="chip.label"
            class="pl-style-tag-chip"
            :class="{ active: chip.active, locked: profile.locked }"
          >
            <input
              type="checkbox"
              :checked="chip.active"
              :disabled="profile.locked"
              @change="toggleStyleTag(chip.label, ($event.target as HTMLInputElement).checked)"
            />
            <span>{{ chip.label }}</span>
          </label>
        </div>
        <div class="pl-style-tag-add">
          <input
            v-model="newCustomTag"
            class="pl-input-sm"
            placeholder="添加自定义标签"
            :disabled="profile.locked"
            @keyup.enter="addCustomTag"
          />
          <button class="btn-sm btn-secondary" :disabled="profile.locked" @click="addCustomTag">+</button>
        </div>
      </div>
      <div class="pl-style-pacing-section">
        <span class="pl-style-section-label">剧情节奏</span>
        <div class="pl-pacing-grid">
          <div class="pl-pacing-item">
            <label>叙事速度</label>
            <select v-model="pacingDraft.speed" class="pl-input-sm" :disabled="profile.locked" @change="syncPacingToString">
              <option v-for="o in pacingSpeedOptions" :key="o" :value="o">{{ o }}</option>
            </select>
          </div>
          <div class="pl-pacing-item">
            <label>紧张度</label>
            <div class="pl-pacing-slider">
              <input
                type="range"
                min="1"
                max="5"
                v-model.number="pacingDraft.tension"
                :disabled="profile.locked"
                @input="syncPacingToString"
              />
              <span>{{ pacingDraft.tension }}/5</span>
            </div>
          </div>
          <div class="pl-pacing-item">
            <label>信息密度</label>
            <select v-model="pacingDraft.density" class="pl-input-sm" :disabled="profile.locked" @change="syncPacingToString">
              <option v-for="o in pacingDensityOptions" :key="o" :value="o">{{ o }}</option>
            </select>
          </div>
          <div class="pl-pacing-item">
            <label>视角风格</label>
            <select v-model="pacingDraft.perspective" class="pl-input-sm" :disabled="profile.locked" @change="syncPacingToString">
              <option v-for="o in pacingPerspectiveOptions" :key="o" :value="o">{{ o }}</option>
            </select>
          </div>
          <div class="pl-pacing-item">
            <label>情感基调</label>
            <select v-model="pacingDraft.tone" class="pl-input-sm" :disabled="profile.locked" @change="syncPacingToString">
              <option v-for="o in pacingToneOptions" :key="o" :value="o">{{ o }}</option>
            </select>
          </div>
        </div>
        <button
          class="btn-sm btn-secondary pl-pacing-restore"
          :disabled="profile.locked || !canRestoreAiPacing"
          @click="restoreAiPacing"
        >恢复AI建议</button>
      </div>
      <div class="pl-style-actions">
        <button
          v-if="!profile.locked"
          id="btn-lock-style-profile"
          class="btn-sm btn-primary"
          :disabled="!hasStyleContent"
          @click="lockStyleProfile"
        >锁定风格</button>
        <button
          v-else
          id="btn-unlock-style-profile"
          class="btn-sm btn-secondary"
          @click="unlockStyleProfile"
        >解锁风格</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useProjectStore } from '../../stores/project'
import type { StyleProfile } from '../../stores/project'

const projectStore = useProjectStore()

const profile = computed<StyleProfile>(() => projectStore.styleProfile)
const hasStyleContent = computed(() => Boolean(profile.value.styleTags.trim() || profile.value.pacingParams.trim()))
const canRestoreAiPacing = computed(() => Boolean(profile.value.aiPacingSnapshot?.pacingParams))

const styleCardExpanded = ref(false)
const newCustomTag = ref('')

defineExpose({
  expand: () => {
    styleCardExpanded.value = true
  },
})

function toggleExpanded() {
  styleCardExpanded.value = !styleCardExpanded.value
}

const styleTagChips = computed(() => {
  const raw = splitStyleTags(profile.value.styleTags)
  const all = [...new Set([...raw, ...profile.value.customStyleTags])]
  return all.map(tag => ({ label: tag, active: raw.includes(tag) }))
})

function splitStyleTags(value: string) {
  return (value || '').split(/[,，、]/).map(tag => tag.trim()).filter(Boolean)
}

function toggleStyleTag(tag: string, on: boolean) {
  if (profile.value.locked) return
  const tags = splitStyleTags(profile.value.styleTags)
  const index = tags.indexOf(tag)
  if (on && index === -1) tags.push(tag)
  if (!on && index >= 0) tags.splice(index, 1)
  projectStore.updateStyleProfileDraft({ styleTags: tags.join(', ') })
}

function addCustomTag() {
  if (profile.value.locked) return
  const tag = newCustomTag.value.trim()
  if (!tag) return
  const customStyleTags = [...profile.value.customStyleTags]
  if (!customStyleTags.includes(tag)) customStyleTags.push(tag)
  const tags = splitStyleTags(profile.value.styleTags)
  if (!tags.includes(tag)) tags.push(tag)
  projectStore.updateStyleProfileDraft({
    styleTags: tags.join(', '),
    customStyleTags,
  })
  newCustomTag.value = ''
}

const pacingSpeedOptions = ['慢热', '均衡', '快节奏']
const pacingDensityOptions = ['稀疏', '均衡', '密集']
const pacingPerspectiveOptions = ['第一人称', '第三人称限知', '第三人称全知']
const pacingToneOptions = ['暗黑', '温暖', '苦涩', '热血', '悲壮']

const pacingDraft = ref({ ...profile.value.pacingParamsObj })

watch(
  () => profile.value.pacingParamsObj,
  value => {
    pacingDraft.value = { ...value }
  },
  { deep: true, immediate: true },
)

function syncPacingToString() {
  if (profile.value.locked) return
  const p = pacingDraft.value
  projectStore.updateStyleProfileDraft({
    pacingParamsObj: { ...p },
    pacingParams: '速度:' + p.speed + ', 紧张度:' + p.tension + ', 密度:' + p.density + ', 视角:' + p.perspective + ', 基调:' + p.tone,
  })
}

function restoreAiPacing() {
  if (profile.value.locked) return
  const snapshot = profile.value.aiPacingSnapshot?.pacingParams || ''
  if (!snapshot) return
  projectStore.updateStyleProfileDraft({ pacingParams: snapshot })
  pacingDraft.value = parsePacingParams(snapshot)
  projectStore.updateStyleProfileDraft({ pacingParamsObj: { ...pacingDraft.value } })
}

function parsePacingParams(value: string): StyleProfile['pacingParamsObj'] {
  const fallback = { ...profile.value.pacingParamsObj }
  if (!value) return fallback
  const speed = pacingSpeedOptions.find(option => value.includes(option)) || fallback.speed
  const tensionMatch = value.match(/紧张[度:]?(\d)/)
  const tension = tensionMatch ? Number(tensionMatch[1]) : fallback.tension
  const density = pacingDensityOptions.find(option => value.includes(option)) || fallback.density
  const perspective = pacingPerspectiveOptions.find(option => value.includes(option)) || fallback.perspective
  const tone = pacingToneOptions.find(option => value.includes(option)) || fallback.tone
  return { speed, tension, density, perspective, tone }
}

function lockStyleProfile() {
  if (!hasStyleContent.value) return
  projectStore.lockStyleProfile()
}

function unlockStyleProfile() {
  projectStore.unlockStyleProfile()
}
</script>

<style scoped>
.pl-style-card { margin-bottom: var(--space-4); border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-input); overflow: visible; }
.pl-style-card-header { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-4); cursor: pointer; user-select: none; }
.pl-style-card-title { font-weight: 600; font-size: var(--font-size-sm); white-space: nowrap; }
.pl-style-card-summary { flex: 1; min-width: 0; font-size: var(--font-size-xs); color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pl-style-card-state { font-size: var(--font-size-xs); color: var(--text-secondary); white-space: nowrap; flex-shrink: 0; }
.pl-style-card-state:has(+ .pl-style-card-toggle) { color: var(--text-secondary); }
.pl-style-card-toggle { font-size: var(--font-size-xs); color: var(--text-secondary); white-space: nowrap; flex-shrink: 0; }
.pl-style-card-body { display: flex; gap: var(--space-4); padding: var(--space-3) var(--space-4); border-top: 1px solid var(--border-color); max-height: min(46vh, 420px); overflow-y: auto; }
.pl-style-tags-section { flex: 1; min-width: 0; }
.pl-style-pacing-section { flex: 1; min-width: 0; }
.pl-style-section-label { display: block; font-size: var(--font-size-xs); font-weight: 600; color: var(--text-secondary); margin-bottom: var(--space-2); }
.pl-style-tag-pool { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-2); }
.pl-style-tag-chip { display: inline-flex; align-items: center; gap: var(--space-2); padding: var(--space-1) var(--space-5); border-radius: var(--radius-sm); border: 1px solid var(--border-color); font-size: var(--font-size-xs); cursor: pointer; user-select: none; }
.pl-style-tag-chip.active { background: var(--accent); color: white; border-color: var(--accent); }
.pl-style-tag-chip.locked { cursor: not-allowed; opacity: 0.65; }
.pl-style-tag-chip input { width: 12px; height: 12px; margin: 0; }
.pl-style-tag-add { display: flex; gap: var(--space-1); }
.pl-style-tag-add input { flex: 1; min-width: 0; }
.pl-style-actions { display: flex; justify-content: flex-end; gap: var(--space-2); }
.pl-pacing-grid { display: flex; flex-direction: column; gap: var(--space-2); }
.pl-pacing-item { display: flex; align-items: center; gap: var(--space-2); }
.pl-pacing-item label { font-size: var(--font-size-xs); white-space: nowrap; min-width: 70px; }
.pl-pacing-item select { flex: 1; min-width: 0; }
.pl-pacing-slider { display: flex; align-items: center; gap: var(--space-2); flex: 1; }
.pl-pacing-slider input[type=range] { flex: 1; }
.pl-pacing-slider span { font-size: var(--font-size-xs); white-space: nowrap; }
.pl-pacing-restore { margin-top: var(--space-2); }
@media (max-width: 767px) {
  .pl-style-card-body { flex-direction: column; }
}
</style>
