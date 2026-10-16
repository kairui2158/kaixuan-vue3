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
      <span class="pl-style-card-summary" v-if="hasAnyStyleContent">{{ collapsedSummary }}</span>
      <span class="pl-style-card-summary" v-else>待设定</span>
      <span class="pl-style-card-state">{{ profile.locked ? '已锁定' : '未锁定' }}</span>
      <span class="pl-style-card-toggle">{{ styleCardExpanded ? '收起高级设置' : '展开高级设置' }}</span>
    </div>
    <div class="pl-style-card-body" v-show="styleCardExpanded">
      <div class="pl-style-tabs" role="tablist" aria-label="创作风格设置">
        <button
          v-for="tab in styleTabs"
          :key="tab.id"
          :id="'pl-style-tab-' + tab.id"
          class="pl-style-tab"
          :class="{ active: activeStyleTab === tab.id }"
          role="tab"
          type="button"
          :aria-selected="activeStyleTab === tab.id"
          :tabindex="activeStyleTab === tab.id ? 0 : -1"
          @click="selectTab(tab.id)"
          @keydown.enter.prevent="selectTab(tab.id)"
        >{{ tab.label }}</button>
      </div>

      <div class="pl-style-tab-panel" v-show="activeStyleTab === 'overview'" role="tabpanel">
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
      </div>

      <div class="pl-style-tab-panel" v-show="activeStyleTab === 'voice'" role="tabpanel">
        <div class="pl-style-text-grid">
          <div class="pl-style-text-item">
            <label>主角声口</label>
            <textarea :value="profile.voice?.protagonistSpeech || ''" rows="2" disabled></textarea>
          </div>
          <div class="pl-style-text-item">
            <label>对话标签</label>
            <textarea :value="profile.voice?.dialogueTags || ''" rows="2" disabled></textarea>
          </div>
          <div class="pl-style-text-item">
            <label>潜台词密度</label>
            <textarea :value="profile.voice?.subtextDensity || ''" rows="2" disabled></textarea>
          </div>
        </div>
        <div class="pl-style-rule-list">
          <div class="pl-style-rule-header">
            <span>标志性句式</span>
            <span>{{ enabledCount(profile.sentencePatterns) }}/{{ ruleCount(profile.sentencePatterns) }} 启用</span>
          </div>
          <label
            v-for="rule in profile.sentencePatterns || []"
            :key="rule.id"
            class="pl-style-rule"
            :class="{ disabled: !rule.enabled }"
          >
            <input
              type="checkbox"
              :checked="rule.enabled"
              :disabled="profile.locked"
              @change="toggleStyleRule('sentencePatterns', rule.id, ($event.target as HTMLInputElement).checked)"
            />
            <span>{{ rule.text }}</span>
          </label>
          <div class="pl-style-rule-empty" v-if="!ruleCount(profile.sentencePatterns)">暂无句式档案，请导入拆书档案。</div>
        </div>
      </div>

      <div class="pl-style-tab-panel" v-show="activeStyleTab === 'scene'" role="tabpanel">
        <div class="pl-style-rule-list">
          <div class="pl-style-rule-header">
            <span>场景写法</span>
            <span>{{ enabledCount(profile.sceneTemplates) }}/{{ ruleCount(profile.sceneTemplates) }} 启用</span>
          </div>
          <label
            v-for="rule in profile.sceneTemplates || []"
            :key="rule.id"
            class="pl-style-rule"
            :class="{ disabled: !rule.enabled }"
          >
            <input
              type="checkbox"
              :checked="rule.enabled"
              :disabled="profile.locked"
              @change="toggleStyleRule('sceneTemplates', rule.id, ($event.target as HTMLInputElement).checked)"
            />
            <span>{{ rule.text }}</span>
          </label>
          <div class="pl-style-rule-empty" v-if="!ruleCount(profile.sceneTemplates)">暂无场景档案，请导入拆书档案。</div>
        </div>
        <div class="pl-style-rule-list">
          <div class="pl-style-rule-header">
            <span>正向规则</span>
            <span>{{ enabledCount(profile.positiveRules) }}/{{ ruleCount(profile.positiveRules) }} 启用</span>
          </div>
          <label
            v-for="rule in profile.positiveRules || []"
            :key="rule.id"
            class="pl-style-rule"
            :class="{ disabled: !rule.enabled }"
          >
            <input
              type="checkbox"
              :checked="rule.enabled"
              :disabled="profile.locked"
              @change="toggleStyleRule('positiveRules', rule.id, ($event.target as HTMLInputElement).checked)"
            />
            <span>{{ rule.text }}</span>
          </label>
          <div class="pl-style-rule-empty" v-if="!ruleCount(profile.positiveRules)">暂无正向规则。</div>
        </div>
        <div class="pl-style-rule-list">
          <div class="pl-style-rule-header">
            <span>日更规则</span>
            <span>{{ enabledCount(profile.dailyRules) }}/{{ ruleCount(profile.dailyRules) }} 启用</span>
          </div>
          <label
            v-for="rule in profile.dailyRules || []"
            :key="rule.id"
            class="pl-style-rule"
            :class="{ disabled: !rule.enabled }"
          >
            <input
              type="checkbox"
              :checked="rule.enabled"
              :disabled="profile.locked"
              @change="toggleStyleRule('dailyRules', rule.id, ($event.target as HTMLInputElement).checked)"
            />
            <span>{{ rule.text }}</span>
          </label>
          <div class="pl-style-rule-empty" v-if="!ruleCount(profile.dailyRules)">暂无日更规则，请导入拆书档案。</div>
        </div>
      </div>

      <div class="pl-style-tab-panel" v-show="activeStyleTab === 'warning'" role="tabpanel">
        <div class="pl-style-rule-list">
          <div class="pl-style-rule-header">
            <span>警戒线</span>
            <span>{{ enabledCount(profile.prohibitions) }}/{{ ruleCount(profile.prohibitions) }} 启用</span>
          </div>
          <label
            v-for="rule in profile.prohibitions || []"
            :key="rule.id"
            class="pl-style-rule warning"
            :class="{ disabled: !rule.enabled }"
          >
            <input
              type="checkbox"
              :checked="rule.enabled"
              :disabled="profile.locked"
              @change="toggleStyleRule('prohibitions', rule.id, ($event.target as HTMLInputElement).checked)"
            />
            <span>{{ rule.text }}</span>
          </label>
          <div class="pl-style-rule-empty" v-if="!ruleCount(profile.prohibitions)">暂无警戒线，请导入拆书档案。</div>
        </div>
      </div>

      <div class="pl-style-actions">
        <button
          id="btn-style-import"
          class="btn-sm btn-secondary"
          :disabled="importRunning || profile.locked"
          @click="importBenchmark"
        >导入拆书档案</button>
        <button
          id="btn-style-ai-analysis"
          class="btn-sm btn-secondary"
          :disabled="analysisRunning || profile.locked"
          @click="requestAiAnalysis"
        >AI 分析大纲风格</button>
        <button
          v-if="!profile.locked"
          id="btn-lock-style-profile"
          class="btn-sm btn-primary"
          :disabled="!hasAnyStyleContent"
          @click="lockStyleProfile"
        >锁定风格</button>
        <button
          v-else
          id="btn-unlock-style-profile"
          class="btn-sm btn-secondary"
          @click="unlockStyleProfile"
        >解锁风格</button>
      </div>
      <div class="pl-style-message" v-if="styleCardMessage" :class="{ error: styleCardMessageKind === 'error' }">
        {{ styleCardMessage }}
      </div>
    </div>

    <div
      v-if="previewState"
      id="style-import-preview"
      data-modal-id="style-import-preview"
      class="pl-style-preview-modal"
      role="dialog"
      aria-modal="true"
      :style="{ zIndex: modalQueue.getZIndex('style-import-preview') }"
    >
      <div class="pl-style-preview-content">
        <div class="pl-style-preview-header">
          <strong>{{ previewState.title }}</strong>
          <button class="btn-sm btn-secondary" @click="closePreview(false)">关闭</button>
        </div>
        <div class="pl-style-preview-summary">
          <div><span>风格标签</span><strong>{{ previewState.draft.styleTags || '无变化' }}</strong></div>
          <div><span>节奏参数</span><strong>{{ previewState.draft.pacingParams || '无变化' }}</strong></div>
          <div><span>一句话定位</span><strong>{{ previewState.draft.positioning?.oneLinePositioning || '无变化' }}</strong></div>
        </div>
        <div class="pl-style-preview-diff">
          <div class="pl-style-rule-header">
            <span>应用差异</span>
            <span>{{ previewState.mode === 'import' ? '导入' : 'AI 分析' }}</span>
          </div>
          <div
            v-for="line in previewState.diff"
            :key="line.field"
            class="pl-style-preview-diff-row"
            :class="{ changed: line.changed }"
          >
            <span>{{ line.label }}</span>
            <span>{{ line.before }}</span>
            <span>{{ line.after }}</span>
          </div>
        </div>
        <div class="pl-style-preview-insufficient" v-if="previewState.mode === 'analysis'">
          {{ previewState.insufficientEvidenceText }}
        </div>
        <div class="pl-style-preview-footer">
          <button id="btn-style-preview-cancel" class="btn-sm btn-secondary" @click="closePreview(false)">取消</button>
          <button id="btn-style-preview-apply" class="btn-sm btn-primary" @click="applyPreview">应用为草稿</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useProjectStore } from '../../stores/project'
import type { StyleProfile, StyleImportPreview, StyleAnalysisPreview, StyleRule } from '../../stores/project'
import { parseStyleBenchmark, type StyleBenchmarkImportReport } from '../../services/styleBenchmarkImport'
import {
  parseStyleAnalysis,
  type StyleAnalysisReport,
  type StyleAnalysisRequestPayload,
  type StyleAnalysisResultPayload,
} from '../../services/styleAnalysis'
import { useModalQueue } from '../../composables/useModalQueue'
import { useRunTraceStore } from '../../stores/runTrace'

const projectStore = useProjectStore()
const modalQueue = useModalQueue()
const runTraceStore = useRunTraceStore()
const props = withDefaults(defineProps<{ host?: 'outline' | 'pipeline' }>(), {
  host: 'outline',
})

const profile = computed<StyleProfile>(() => projectStore.styleProfile)
const hasV1StyleContent = computed(() => Boolean(profile.value.styleTags.trim() || profile.value.pacingParams.trim()))
const hasAnyStyleContent = computed(() => hasV1StyleContent.value || hasV2StyleContent())
const canRestoreAiPacing = computed(() => Boolean(profile.value.aiPacingSnapshot?.pacingParams))

const styleCardExpanded = ref(false)
const newCustomTag = ref('')
const activeStyleTab = ref<'overview' | 'voice' | 'scene' | 'warning'>('overview')
const importRunning = ref(false)
const analysisRunning = ref(false)
const styleCardMessage = ref('')
const styleCardMessageKind = ref<'info' | 'error'>('info')
const analysisRequestSeq = ref(0)
const activeAnalysisSourceId = ref<string | null>(null)
let isolatedImportRunId: string | null = null

type PreviewMode = 'import' | 'analysis'
interface PreviewState {
  mode: PreviewMode
  title: string
  report: StyleBenchmarkImportReport | StyleAnalysisReport
  draft: StyleImportPreview | StyleAnalysisPreview
  diff: Array<{ field: string; label: string; before: string; after: string; changed: boolean }>
  insufficientEvidenceText: string
}

const previewState = ref<PreviewState | null>(null)

const styleTabs = [
  { id: 'overview', label: '概览' },
  { id: 'voice', label: '声口与句式' },
  { id: 'scene', label: '场景与规则' },
  { id: 'warning', label: '警戒线' },
] as const

const ruleFields = [
  ['sceneTemplates', '场景写法'],
  ['sentencePatterns', '标志性句式'],
  ['positiveRules', '正向规则'],
  ['dailyRules', '日更规则'],
  ['prohibitions', '警戒线'],
] as const

const collapsedSummary = computed(() => {
  if (profile.value.profileVersion !== 2) {
    return `${profile.value.styleTags || '未设定'} | ${profile.value.pacingParams || '未设定'}`
  }
  const tags = profile.value.styleTags || '未命名风格'
  return [
    tags,
    `${ruleCount(profile.value.sentencePatterns)} 条句式`,
    `${ruleCount(profile.value.dailyRules)} 条日则`,
    `${ruleCount(profile.value.prohibitions)} 条警戒线`,
  ].join(' · ')
})

function hasV2StyleContent() {
  return Boolean(
    profile.value.positioning?.oneLinePositioning
      || profile.value.voice?.protagonistSpeech
      || profile.value.sceneTemplates?.length
      || profile.value.sentencePatterns?.length
      || profile.value.positiveRules?.length
      || profile.value.prohibitions?.length
      || profile.value.dailyRules?.length,
  )
}

function ruleCount(rules: StyleRule[] | undefined) {
  return rules?.length || 0
}

function enabledCount(rules: StyleRule[] | undefined) {
  return (rules || []).filter(rule => rule.enabled).length
}

defineExpose({
  expand: () => {
    styleCardExpanded.value = true
  },
  recordStyleCardTraceEvent,
})

function toggleExpanded() {
  styleCardExpanded.value = !styleCardExpanded.value
}

function selectTab(tab: 'overview' | 'voice' | 'scene' | 'warning') {
  activeStyleTab.value = tab
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

function toggleStyleRule(
  field: 'sceneTemplates' | 'sentencePatterns' | 'positiveRules' | 'prohibitions' | 'dailyRules',
  ruleId: string,
  enabled: boolean,
) {
  const result = projectStore.updateStyleRuleEnabled(field, ruleId, enabled)
  if (!result.ok && result.reason === 'style_locked') {
    showCardMessage('档案已锁定，不能修改规则启停。', 'error')
  }
}

function lockStyleProfile() {
  if (!hasAnyStyleContent.value) return
  projectStore.lockStyleProfile()
}

function unlockStyleProfile() {
  projectStore.unlockStyleProfile()
}

function showCardMessage(message: string, kind: 'info' | 'error' = 'info') {
  styleCardMessage.value = message
  styleCardMessageKind.value = kind
  window.setTimeout(() => {
    if (styleCardMessage.value === message) styleCardMessage.value = ''
  }, 5000)
}

function recordStyleCardTraceEvent(event: {
  type: string
  label: string
  detail: Record<string, unknown>
  level?: 'info' | 'warn' | 'error'
}) {
  const activeRun = runTraceStore.currentRunIdBySource[props.host]
    ? runTraceStore.getRun(runTraceStore.currentRunIdBySource[props.host]!)
    : null
  if (activeRun?.status === 'running') {
    isolatedImportRunId = null
    runTraceStore.addEvent(activeRun.id, {
      type: event.type,
      level: event.level || 'info',
      label: event.label,
      detail: JSON.stringify(event.detail),
      payload: event.detail,
    })
    return
  }
  if (!isolatedImportRunId) {
    isolatedImportRunId = runTraceStore.startRun({
      source: props.host,
      step: 0,
      stepName: '创作风格档案',
      mode: 'style-benchmark-import',
      sessionKind: 'task',
    })
  }
  runTraceStore.addEvent(isolatedImportRunId, {
    type: event.type,
    level: event.level || 'info',
    label: event.label,
    detail: JSON.stringify(event.detail),
    payload: event.detail,
  })
  runTraceStore.finishRun(isolatedImportRunId, 'success')
  isolatedImportRunId = null
}

const publishStyleCardEvent = recordStyleCardTraceEvent

async function importBenchmark() {
  if (profile.value.locked) {
    showCardMessage('档案已锁定，导入被拒绝。', 'error')
    publishStyleCardEvent({
      type: 'style-benchmark-import',
      level: 'warn',
      label: '拆书档案导入被拒绝',
      detail: { action: 'rejected', reason: 'style_locked', fileName: null },
    })
    return
  }
  if (importRunning.value) return
  importRunning.value = true
  try {
    const filePath = await window.electronAPI.dialogOpenFileAsync()
    if (!filePath) return
    const read = await window.electronAPI.dialogReadFileAsync(filePath)
    const content = typeof read === 'string' ? read : String(read?.content || '')
    const fileName = String(filePath).split(/[\\/]/).pop() || String(filePath)
    const report = parseStyleBenchmark(fileName, content)
    publishStyleCardEvent({
      type: 'style-benchmark-import',
      label: report.ok ? '拆书档案解析成功' : '拆书档案解析失败',
      level: report.ok ? 'info' : 'warn',
      detail: {
        action: 'parsed',
        ok: report.ok,
        fileName,
        recognizedSections: report.recognizedSections,
        ignoredSections: report.ignoredSections,
        truncations: report.truncations,
        errors: report.errors,
        ruleCounts: report.draft
          ? {
            sceneTemplates: report.draft.sceneTemplates.length,
            sentencePatterns: report.draft.sentencePatterns.length,
            positiveRules: report.draft.positiveRules.length,
            prohibitions: report.draft.prohibitions.length,
            dailyRules: report.draft.dailyRules.length,
          }
          : null,
      },
    })
    if (!report.ok || !report.draft) {
      showCardMessage('导入失败：' + report.errors.join('；'), 'error')
      return
    }
    openImportPreview(report)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    showCardMessage('导入失败：' + message, 'error')
    publishStyleCardEvent({
      type: 'style-benchmark-import',
      level: 'error',
      label: '拆书档案导入异常',
      detail: { action: 'error', reason: message },
    })
  } finally {
    importRunning.value = false
  }
}

function buildDiff(draft: StyleImportPreview | StyleAnalysisPreview) {
  const lines: PreviewState['diff'] = []
  const addScalar = (field: string, label: string, before: string, after: string) => {
    lines.push({
      field,
      label,
      before: before || '空',
      after: after || '空',
      changed: before !== after,
    })
  }
  addScalar('styleTags', '风格标签', profile.value.styleTags, draft.styleTags)
  addScalar('pacingParams', '节奏参数', profile.value.pacingParams, draft.pacingParams)
  addScalar(
    'oneLinePositioning',
    '一句话定位',
    profile.value.positioning?.oneLinePositioning || '',
    draft.positioning?.oneLinePositioning || '',
  )
  for (const [field, label] of ruleFields) {
    const before = enabledCount(profile.value[field])
    const after = (draft as StyleImportPreview)[field]?.filter(rule => rule.enabled).length || 0
    lines.push({
      field,
      label,
      before: `${before} 条`,
      after: `${after} 条`,
      changed: before !== after,
    })
  }
  return lines
}

function openImportPreview(report: StyleBenchmarkImportReport) {
  const draft = report.draft as StyleImportPreview
  previewState.value = {
    mode: 'import',
    title: '导入拆书档案预览',
    report,
    draft,
    diff: buildDiff(draft),
    insufficientEvidenceText: '',
  }
  modalQueue.open('style-import-preview')
}

function openAnalysisPreview(report: StyleAnalysisReport) {
  const draft = report.draft as StyleAnalysisPreview
  previewState.value = {
    mode: 'analysis',
    title: 'AI 分析结果预览',
    report,
    draft,
    diff: buildDiff(draft),
    insufficientEvidenceText: '证据不足，未填充：'
      + report.insufficientEvidenceFields.join('、')
      + (report.ignoredFields.length ? '；已忽略模型越权返回：' + report.ignoredFields.join('、') : ''),
  }
  modalQueue.open('style-import-preview')
}

function closePreview(applied: boolean) {
  if (!previewState.value) return
  const state = previewState.value
  previewState.value = null
  modalQueue.close('style-import-preview')
  if (!applied) {
    publishStyleCardEvent({
      type: 'style-benchmark-import',
      label: state.mode === 'import' ? '导入预览已取消' : 'AI 分析预览已取消',
      detail: { action: 'cancelled', mode: state.mode },
    })
  }
}

function applyPreview() {
  const state = previewState.value
  if (!state) return
  const result = state.mode === 'import'
    ? projectStore.applyStyleImportPreview(state.draft as StyleImportPreview)
    : projectStore.applyStyleAnalysisPreview(state.draft as StyleAnalysisPreview)
  if (!result.ok) {
    showCardMessage('档案已锁定，应用被拒绝。', 'error')
    publishStyleCardEvent({
      type: 'style-benchmark-import',
      level: 'warn',
      label: '风格预览应用被拒绝',
      detail: { action: 'rejected', reason: result.reason, mode: state.mode },
    })
    closePreview(false)
    return
  }
  publishStyleCardEvent({
    type: 'style-benchmark-import',
    label: state.mode === 'import' ? '拆书档案已应用为草稿' : 'AI 分析已应用为草稿',
    detail: {
      action: 'applied',
      mode: state.mode,
      profileVersion: 2,
      diff: state.diff,
    },
  })
  showCardMessage(state.mode === 'import' ? '已应用为草稿，可继续逐条调整后锁定。' : 'AI 分析已应用为草稿。')
  closePreview(true)
}

function requestAiAnalysis() {
  if (profile.value.locked) {
    showCardMessage('档案已锁定，AI 分析被拒绝。', 'error')
    publishStyleCardEvent({
      type: 'style-benchmark-import',
      level: 'warn',
      label: 'AI 分析被拒绝',
      detail: { action: 'rejected', reason: 'style_locked', mode: 'analysis' },
    })
    return
  }
  if (analysisRunning.value) return
  analysisRequestSeq.value += 1
  analysisRunning.value = true
  const payload: StyleAnalysisRequestPayload = {
    sourceId: `style-card-${analysisRequestSeq.value}-${Date.now()}`,
    host: props.host,
    mode: 'analysis',
  }
  activeAnalysisSourceId.value = payload.sourceId
  window.dispatchEvent(new CustomEvent('style-analysis-request', { detail: payload }))
}

function handleStyleAnalysisResult(event: Event) {
  const detail = (event as CustomEvent).detail as StyleAnalysisResultPayload
  if (!detail?.sourceId || detail.host !== props.host || detail.sourceId !== activeAnalysisSourceId.value) return
  analysisRunning.value = false
  activeAnalysisSourceId.value = null
  if (!detail.report?.ok || !detail.report?.draft) {
    showCardMessage('AI 分析失败：' + (detail.report?.errors?.join('；') || '未知错误'), 'error')
    return
  }
  openAnalysisPreview(detail.report)
}

onMounted(() => {
  window.addEventListener('style-analysis-result', handleStyleAnalysisResult)
})

onBeforeUnmount(() => {
  window.removeEventListener('style-analysis-result', handleStyleAnalysisResult)
})
</script>

<style scoped>
.pl-style-card { position: relative; margin-bottom: var(--space-4); border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-input); overflow: visible; }
.pl-style-card-header { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-4); cursor: pointer; user-select: none; }
.pl-style-card-title { font-weight: 600; font-size: var(--font-size-sm); white-space: nowrap; }
.pl-style-card-summary { flex: 1; min-width: 0; font-size: var(--font-size-xs); color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pl-style-card-state { font-size: var(--font-size-xs); color: var(--text-secondary); white-space: nowrap; flex-shrink: 0; }
.pl-style-card-toggle { font-size: var(--font-size-xs); color: var(--text-secondary); white-space: nowrap; flex-shrink: 0; }
.pl-style-card-body { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-3) var(--space-4); border-top: 1px solid var(--border-color); max-height: min(46vh, 420px); overflow-y: auto; }
.pl-style-tabs { display: flex; gap: var(--space-2); overflow-x: auto; border-bottom: 1px solid var(--border-color); padding-bottom: var(--space-2); }
.pl-style-tab { border: 1px solid transparent; border-radius: var(--radius-sm); background: transparent; color: var(--text-secondary); font-size: var(--font-size-xs); padding: var(--space-1) var(--space-3); white-space: nowrap; cursor: pointer; }
.pl-style-tab.active { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
.pl-style-tab:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.pl-style-tab-panel { display: flex; gap: var(--space-4); min-width: 0; }
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
.pl-style-actions { display: flex; justify-content: flex-end; gap: var(--space-2); flex-wrap: wrap; }
.pl-style-message { font-size: var(--font-size-xs); color: var(--text-secondary); }
.pl-style-message.error { color: var(--danger, #c0392b); }
.pl-pacing-grid { display: flex; flex-direction: column; gap: var(--space-2); }
.pl-pacing-item { display: flex; align-items: center; gap: var(--space-2); }
.pl-pacing-item label { font-size: var(--font-size-xs); white-space: nowrap; min-width: 70px; }
.pl-pacing-item select { flex: 1; min-width: 0; }
.pl-pacing-slider { display: flex; align-items: center; gap: var(--space-2); flex: 1; }
.pl-pacing-slider input[type=range] { flex: 1; }
.pl-pacing-slider span { font-size: var(--font-size-xs); white-space: nowrap; }
.pl-pacing-restore { margin-top: var(--space-2); }
.pl-style-text-grid { display: flex; flex-direction: column; gap: var(--space-2); flex: 1; min-width: 0; }
.pl-style-text-item { display: flex; flex-direction: column; gap: var(--space-1); }
.pl-style-text-item label { font-size: var(--font-size-xs); color: var(--text-secondary); }
.pl-style-text-item textarea { resize: none; font-size: var(--font-size-xs); padding: var(--space-2); border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-panel, transparent); color: var(--text-primary); }
.pl-style-rule-list { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.pl-style-rule-header { display: flex; justify-content: space-between; align-items: center; font-size: var(--font-size-xs); font-weight: 600; color: var(--text-secondary); }
.pl-style-rule { display: flex; align-items: flex-start; gap: var(--space-2); font-size: var(--font-size-xs); line-height: 1.5; }
.pl-style-rule input { margin-top: 3px; }
.pl-style-rule.disabled span { opacity: 0.55; }
.pl-style-rule.warning span { color: var(--warning, #b7791f); }
.pl-style-rule-empty { font-size: var(--font-size-xs); color: var(--text-secondary); }
.pl-style-preview-modal { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; padding: var(--space-4); background: rgba(15, 18, 24, 0.45); }
.pl-style-preview-content { width: min(720px, 96vw); max-height: min(72vh, 640px); overflow-y: auto; padding: var(--space-4); border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-panel); box-shadow: 0 18px 48px rgba(0, 0, 0, .25); }
.pl-style-preview-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-3); }
.pl-style-preview-summary { display: grid; gap: var(--space-2); margin-bottom: var(--space-3); }
.pl-style-preview-summary div { display: flex; justify-content: space-between; gap: var(--space-3); font-size: var(--font-size-xs); }
.pl-style-preview-summary span { color: var(--text-secondary); white-space: nowrap; }
.pl-style-preview-summary strong { min-width: 0; overflow-wrap: anywhere; text-align: right; font-weight: 500; }
.pl-style-preview-diff { display: flex; flex-direction: column; gap: var(--space-1); margin-bottom: var(--space-3); }
.pl-style-preview-diff-row { display: grid; grid-template-columns: minmax(90px, 1fr) minmax(0, 1fr) minmax(0, 1fr); gap: var(--space-2); padding: var(--space-1) 0; font-size: var(--font-size-xs); border-bottom: 1px dashed var(--border-color); }
.pl-style-preview-diff-row.changed { color: var(--accent); }
.pl-style-preview-insufficient { margin-bottom: var(--space-3); padding: var(--space-2); border: 1px solid var(--border-color); border-radius: var(--radius-sm); font-size: var(--font-size-xs); color: var(--text-secondary); }
.pl-style-preview-footer { display: flex; justify-content: flex-end; gap: var(--space-2); }
@media (max-width: 767px) {
  .pl-style-tab-panel { flex-direction: column; }
}
</style>
