<template>
  <div class="pipeline-overlay" @click.self="$emit('close')">
    <div class="pipeline-content">
      <div class="pipeline-header">
        <span>生成流水线</span>
        <button class="modal-close" @click="$emit('close')">x</button>
      </div>
      <div class="pipeline-body">
        <div class="pipeline-steps">
          <div
            v-for="(step, i) in steps"
            :key="i"
            class="step"
            :class="{ active: pipelineStore.currentStep === i, done: pipelineStore.currentStep > i }"
            @click="pipelineStore.setStep(i)"
          >
            <span class="step-num">{{ i + 1 }}</span>
            <span class="step-name">{{ step.name }}</span>
          </div>
        </div>

        <div class="step-content">
          <div v-if="pipelineStore.currentStep === 0" class="step-panel">
            <h3>大纲</h3>
            <textarea v-model="projectStore.outlineText" class="outline-input" placeholder="输入或粘贴你的小说大纲..."></textarea>
            <div class="step-actions">
              <button class="btn-primary" @click="projectStore.saveProject()">保存大纲</button>
              <button class="btn-secondary" @click="projectStore.lockOutline()" :disabled="!projectStore.hasOutline">锁定大纲</button>
            </div>
          </div>

          <div v-if="pipelineStore.currentStep === 1" class="step-panel">
            <h3>设定生成</h3>
            <p class="step-desc">基于大纲自动生成世界观、角色、势力等设定。</p>
            <div class="step-actions">
              <button class="btn-primary" @click="genSettings" :disabled="pipelineStore.isGenerating">AI生成设定</button>
            </div>
            <div v-if="projectStore.settings.length > 0" class="settings-preview">
              <div v-for="s in projectStore.settings" :key="s.name" class="setting-item">
                <span class="setting-name">{{ s.name }}</span>
                <span class="setting-cat">{{ s.category }}</span>
              </div>
            </div>
          </div>

          <div v-if="pipelineStore.currentStep === 2" class="step-panel">
            <h3>卷纲生成</h3>
            <p class="step-desc">根据大纲和设定生成分卷纲要。</p>
            <div class="step-actions">
              <button class="btn-primary" @click="genVolumes('ai')" :disabled="pipelineStore.isGenerating">AI生成</button>
              <button class="btn-primary" @click="genVolumes('auto')" :disabled="pipelineStore.isGenerating">自动生成</button>
              <button class="btn-primary" @click="genVolumes('continue')" :disabled="pipelineStore.isGenerating">逐卷生成</button>
            </div>
            <div v-if="projectStore.volumes.length > 0" class="volumes-preview">
              <div v-for="(v, i) in projectStore.volumes" :key="i" class="volume-card">
                <span class="vol-title">{{ v.name }}</span>
                <span class="vol-words">{{ v.suggestedWords || 0 }}字</span>
              </div>
            </div>
          </div>

          <div v-if="pipelineStore.currentStep === 3" class="step-panel">
            <h3>章节生成</h3>
            <p class="step-desc">根据卷纲拆分章节，每章生成剧情梗概。</p>
            <div class="step-actions">
              <button class="btn-primary" @click="genChapters('ai')" :disabled="pipelineStore.isGenerating">AI生成章节</button>
              <button class="btn-primary" @click="genChapters('auto')" :disabled="pipelineStore.isGenerating">自动生成</button>
            </div>
          </div>

          <div v-if="pipelineStore.currentStep === 4" class="step-panel">
            <h3>正文生成</h3>
            <p class="step-desc">根据章节剧情梗概生成正文。</p>
            <div class="step-actions">
              <button class="btn-primary" @click="genBody" :disabled="pipelineStore.isGenerating">AI生成正文</button>
            </div>
          </div>
        </div>

        <div v-if="pipelineStore.isGenerating" class="gen-progress">
          <div class="gen-progress-bar">
            <div class="gen-progress-fill" :style="{ width: pipelineStore.generationProgress + '%' }"></div>
          </div>
          <span class="gen-status">{{ pipelineStore.generationStatus }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { usePipelineStore } from '../../stores/pipeline'
import { useProjectStore } from '../../stores/project'
import { useProviderStore } from '../../stores/provider'
import { useSkillStore } from '../../stores/skill'

defineEmits<{ close: [] }>()

const pipelineStore = usePipelineStore()
const projectStore = useProjectStore()
const providerStore = useProviderStore()
const skillStore = useSkillStore()

const steps = [
  { name: '大纲' },
  { name: '设定' },
  { name: '卷纲' },
  { name: '章节' },
  { name: '正文' },
]

async function callApi(systemPrompt: string, userText: string): Promise<string> {
  const provider = providerStore.activeGenerateProvider
  if (!provider) throw new Error('未配置生成供应商')
  const url = provider.baseUrl.replace(/\/$/, '') + '/v1/chat/completions'
  const model = provider.selectedModel || 'gpt-4o'
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + provider.apiKey },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userText }], stream: false })
  })
  if (!resp.ok) throw new Error('API error: ' + resp.status)
  const data = await resp.json()
  return data.choices?.[0]?.message?.content || ''
}

async function genSettings() {
  pipelineStore.startGeneration()
  try {
    const skill = skillStore.orderedPipelineSkills[0]
    const prompt = skill?.template || '你是设定生成师。基于大纲生成设定JSON。'
    const result = await callApi(prompt, projectStore.outlineText)
    try { projectStore.setSettings(JSON.parse(result)) } catch { projectStore.setSettings([]) }
    pipelineStore.finishGeneration()
  } catch (e: any) {
    pipelineStore.failGeneration(e.message)
  }
}

async function genVolumes(mode: string) {
  pipelineStore.startGeneration()
  try {
    const skill = skillStore.orderedPipelineSkills[1] || skillStore.orderedPipelineSkills[0]
    const prompt = skill?.template || '你是卷纲规划师。基于大纲生成卷纲JSON数组。'
    const input = projectStore.outlineText + '\n\n设定:\n' + JSON.stringify(projectStore.settings)
    const result = await callApi(prompt, input)
    try { projectStore.setVolumes(JSON.parse(result)) } catch { projectStore.setVolumes([]) }
    pipelineStore.finishGeneration()
  } catch (e: any) {
    pipelineStore.failGeneration(e.message)
  }
}

async function genChapters(mode: string) {
  pipelineStore.startGeneration()
  try {
    const skill = skillStore.orderedPipelineSkills[2] || skillStore.orderedPipelineSkills[0]
    const prompt = skill?.template || '你是章节规划师。基于卷纲生成章节JSON数组。'
    for (const vol of projectStore.volumes) {
      const result = await callApi(prompt, JSON.stringify(vol))
      try { projectStore.setChapters(vol.id || vol.name, JSON.parse(result)) } catch {}
      pipelineStore.updateProgress(Math.round((projectStore.volumes.indexOf(vol) + 1) / projectStore.volumes.length * 100))
    }
    pipelineStore.finishGeneration()
  } catch (e: any) {
    pipelineStore.failGeneration(e.message)
  }
}

async function genBody() {
  pipelineStore.startGeneration()
  try {
    const skill = skillStore.orderedPipelineSkills[3] || skillStore.orderedPipelineSkills[0]
    const prompt = skill?.template || '你是小说写作师。基于章节梗概生成正文。'
    pipelineStore.finishGeneration()
  } catch (e: any) {
    pipelineStore.failGeneration(e.message)
  }
}
</script>

<style scoped>
.pipeline-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: var(--bg-overlay); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.pipeline-content { width: 900px; max-height: 85vh; background: var(--bg-glass); border: 1px solid var(--border-color); border-radius: 12px; box-shadow: var(--shadow-lg); display: flex; flex-direction: column; }
.pipeline-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 24px; border-bottom: 1px solid var(--border-color); font-size: 16px; font-weight: 600; }
.modal-close { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 18px; }
.modal-close:hover { color: var(--danger); }
.pipeline-body { padding: 24px; overflow-y: auto; }
.pipeline-steps { display: flex; gap: 4px; margin-bottom: 24px; }
.step { display: flex; align-items: center; gap: 6px; padding: 8px 16px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 6px; cursor: pointer; font-size: 13px; color: var(--text-secondary); }
.step.active { background: var(--accent); color: var(--text-on-accent); border-color: var(--accent); }
.step.done { background: var(--success); color: var(--text-on-accent); border-color: var(--success); }
.step-num { font-weight: 600; }
.step-content { min-height: 300px; }
.step-panel h3 { font-size: 16px; margin-bottom: 12px; }
.step-desc { font-size: 13px; color: var(--text-secondary); margin-bottom: 16px; }
.outline-input { width: 100%; min-height: 200px; background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; font-size: 14px; resize: vertical; outline: none; }
.step-actions { display: flex; gap: 8px; margin-top: 16px; }
.btn-primary { background: var(--accent-gradient); color: var(--text-on-accent); border: none; border-radius: 6px; padding: 8px 16px; cursor: pointer; font-size: 13px; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-secondary { background: transparent; color: var(--text-secondary); border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 16px; cursor: pointer; font-size: 13px; }
.btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }
.settings-preview, .volumes-preview { display: flex; flex-direction: column; gap: 6px; margin-top: 16px; }
.setting-item, .volume-card { display: flex; justify-content: space-between; padding: 8px 12px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 6px; font-size: 12px; }
.gen-progress { margin-top: 16px; }
.gen-progress-bar { width: 100%; height: 6px; background: var(--bg-input); border-radius: 3px; overflow: hidden; }
.gen-progress-fill { height: 100%; background: var(--accent-gradient); transition: width 0.3s; }
.gen-status { font-size: 12px; color: var(--text-secondary); margin-top: 4px; display: block; }
</style>
