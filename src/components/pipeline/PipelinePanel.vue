<template>
  <div id="pipeline-panel" class="pl-overlay" @click.self="$emit('close')">
    <div class="pl-content">
      <div class="pl-header"><span>生成流水线</span><button id="btn-close-pl" class="modal-close" @click="$emit('close')">x</button></div>
      <div id="pl-s1-skill" class="pl-select" style="display:none"></div><div id="pl-s1-skills-list" class="pl-skills-list" style="display:none"></div><div id="pl-s2-skill" class="pl-select" style="display:none"></div><div id="pl-s2-skills-list" class="pl-skills-list" style="display:none"></div><div id="pl-s3-skill" class="pl-select" style="display:none"></div><div id="pl-s3-skills-list" class="pl-skills-list" style="display:none"></div><div id="pl-s4-skill" class="pl-select" style="display:none"></div><div id="pl-s4-skills-list" class="pl-skills-list" style="display:none"></div><div id="pl-s5-skill" class="pl-select" style="display:none"></div><div id="pl-s5-skills-list" class="pl-skills-list" style="display:none"></div><div id="pl-steps" class="pl-steps"><div id="pl-status-1" class="pl-step-status" style="display:none">
        <div v-for="(step, i) in steps" :key="i" :id="'pl-status-' + (i + 1)" class="pl-step" :class="{ active: pipelineStore.currentStep === i, done: pipelineStore.currentStep > i }" @click="pipelineStore.setStep(i)">
          <span class="step-num">{{ i + 1 }}</span><span class="step-name">{{ step.name }}</span>
       </div>
     </div>
     </div>
     <div class="pl-step-config" v-if="pipelineStore.currentStep > 0 && pipelineStore.currentStep < 5">
        <div class="pl-cfg-row">
          <label class="pl-cfg-label">Agent</label>
          <select id="pl-agent-select" v-model="stepAgents[pipelineStore.currentStep]" class="pl-select" @change="saveStepConfig">
            <option value="">默认</option>
            <option v-for="a in agentStore.agents" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
          <label class="pl-cfg-label">技能槽</label>
          <select v-for="i in 5" :key="i" v-model="stepSkills[pipelineStore.currentStep][i-1]" class="pl-cfg-select-sm" @change="saveStepConfig">
            <option value="">槽{{ i }}</option>
            <option v-for="s in skillStore.skills" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
        </div>
      </div>
     <div class="pl-body">
        <div class="pl-tools-section">
          <div class="pl-tools-title">AI工具</div>
          <div class="pl-tools-grid">
            <button id="pl-s1-add-skill" class="btn-sm btn-secondary" @click="toolAction('names')" :disabled="aiLoading">AI起名</button>
            <button class="btn-sm btn-secondary" @click="toolAction('rules')" :disabled="aiLoading">写作规则</button>
            <button class="btn-sm btn-secondary" @click="toolAction('timeline')" :disabled="aiLoading">时间线</button>
            <button class="btn-sm btn-secondary" @click="toolAction('review')" :disabled="aiLoading">批量审阅</button>
            <button class="btn-sm btn-secondary" @click="toolAction('revise')" :disabled="aiLoading">章节修订</button>
            <button class="btn-sm btn-secondary" @click="toolAction('translate')" :disabled="aiLoading">翻译</button>
            <button class="btn-sm btn-secondary" @click="toolAction('style')" :disabled="aiLoading">风格转换</button>
            <button class="btn-sm btn-secondary" @click="toolAction('regenerate')" :disabled="aiLoading">重新生成</button>
            <button class="btn-sm btn-secondary" @click="toolAction('modify')" :disabled="aiLoading">按指令修改</button>
          </div>
          <div class="pl-tool-result" v-if="toolResult">{{ toolResult }}</div>
          <div class="pl-tool-loading" v-if="aiLoading">{{ aiLoadingText }}</div>
        </div>
       <div v-if="pipelineStore.currentStep === 0" id="pl-step-1-content" class="pl-step-content active">
          <h3>大纲</h3>
          <textarea id="pl-outline" v-model="projectStore.outlineText" class="pl-textarea full-width" placeholder="输入或粘贴大纲全文..."></textarea>
          <div class="pl-actions">
            <button class="btn-secondary" @click="projectStore.setOutline(projectStore.outlineText)">保存大纲</button>
            <button class="btn-primary" @click="projectStore.lockOutline()" :disabled="!projectStore.hasOutline">锁定大纲</button>
            <button class="btn-secondary" @click="nextStep" :disabled="!projectStore.hasOutline">下一步</button>
          </div>
        </div>
        <div v-if="pipelineStore.currentStep === 1" id="pl-step-2-content" class="pl-step-content pl-hidden">
          <h3>设定</h3>
          <div id="pl-settings-result" class="pl-result pl-hidden"><div id="pl-bound-settings-list" class=""><div class="pl-settings-list">
            <div v-for="(s, i) in projectStore.settings" :key="i" class="pl-setting-item">
              <input v-model="s.name" class="pl-input" placeholder="名称" />
              <select v-model="s.category" class="pl-input-sm"><option>世界观规则</option><option>地理环境</option><option>势力阵营</option><option>技术体系</option><option>魔法体系</option><option>社会结构</option><option>物品道具</option><option>历史事件</option><option>其他</option></select>
              <textarea v-model="s.attrsText" class="pl-attrs-input" placeholder="属性内容"></textarea>
              <button class="btn-danger btn-sm" @click="projectStore.settings.splice(i, 1); projectStore.saveProject()">删除</button>
            </div>
         </div>
         </div>
       </div>
         <div class="pl-actions">
           <button class="btn-secondary" @click="addSetting">+ 新增设定</button>
            <button class="btn-primary" @click="genSettings" :disabled="pipelineStore.isGenerating">{{ pipelineStore.isGenerating ? 'AI生成中...' : 'AI生成设定' }}</button>
            <button class="btn-secondary" @click="confirmSettings" :disabled="projectStore.settings.length === 0">确认设定</button>
          </div>
        </div>
        <div v-if="pipelineStore.currentStep === 2" id="pl-step-3-content" class="pl-step-content pl-hidden">
          <h3>卷纲</h3>
          <div class="pl-vol-config"><label>每卷字数</label><input id="pl-word-count" type="number" v-model.number="volumeWords" class="pl-input-sm" min="10000" step="10000" /><label>卷数</label><input id="pl-volume-count" type="number" class="input-w-60" :value="projectStore.volumes.length" readonly></div>
          <div id="pl-volume-result" class="pl-result pl-hidden"><div id="pl-vol-list" class="pl-vol-list">
            <div id="pl-volume-cards" class="pl-hidden"><div v-for="(vol, i) in projectStore.volumes" :key="i" class="pl-vol-card" :class="{ confirmed: vol.confirmed }">
             <div class="pl-vol-header"><input v-model="vol.name" class="pl-input" placeholder="卷名" @change="projectStore.saveProject()" /><span class="vol-words">{{ vol.suggestedWords || '?' }} 字</span></div>
             <textarea v-model="vol.outline" class="pl-vol-outline" placeholder="卷纲要" @change="projectStore.saveProject()"></textarea>
             <input v-model="vol.summary" class="pl-input" placeholder="摘要" @change="projectStore.saveProject()" />
             <button class="btn-sm btn-secondary" @click="genSingleVolume(i)" :disabled="pipelineStore.isGenerating">重新生成此卷</button>
           </div>
          </div>
          <div id="pl-vol-confirm-hint" class="pl-vol-confirm-hint"></div><div class="pl-actions">
            <button class="btn-primary" @click="genVolumes('auto')" :disabled="pipelineStore.isGenerating">AI生成全卷</button>
            <button class="btn-secondary" @click="genVolumes('continue')" :disabled="pipelineStore.isGenerating">逐卷生成</button>
            <button class="btn-secondary" @click="genVolumes('resume')" :disabled="pipelineStore.isGenerating">续生成</button>
           <button class="btn-secondary" @click="confirmVolumes" :disabled="projectStore.volumes.length === 0">确认卷纲</button>
         </div>
       </div>
       </div>
     </div>
       <div v-if="pipelineStore.currentStep === 3" id="pl-step-4-content" class="pl-step-content pl-hidden">
          <h3>章节</h3>
          <input id="pl-text-filter-toggle" type="checkbox" class="pl-filter-toggle" style="display:none"><div id="pl-ch-gen-bar" class="pl-gen-options"><div class="pl-ch-config"><label>每章字数</label><input id="pl-chapter-wordcount" type="number" class="input-w-80" v-model.number="chapterWords" min="1000" step="500"><select v-model.number="chapterWords" class="pl-input-sm"><option :value="2000">2000字</option><option :value="3000">3000字</option><option :value="3500">3500字</option><option :value="4000">4000字</option><option :value="5000">5000字</option></select><label>选择卷</label><select id="pl-chapter-select" v-model.number="selectedVolumeIndex" class="pl-input-sm"><option v-for="(vol, i) in projectStore.volumes" :key="i" :value="i">{{ vol.name }}</option></select><label>预计章数</label><span id="pl-ch-est-count" class="pl-gen-hint">{{ estimatedChapters }}</span></div>
          <div id="pl-ch-cards-area"><div id="pl-chapter-cards" class="pl-hidden"><p id="pl-ch-empty-hint" class="empty-hint" v-if="currentVolumeChapters.length === 0">暂无章节</p><div class="pl-ch-list" v-if="currentVolumeChapters.length > 0">
            <div v-for="(ch, i) in currentVolumeChapters" :key="i" class="pl-ch-card"><span class="ch-title">{{ ch.title }}</span><button class="btn-sm btn-secondary" @click="genBody(i)" :disabled="pipelineStore.isGenerating">生成正文</button></div>
          </div>
          </div>
          </div>
          </div>
          <div class="pl-actions">
            <button class="btn-primary" @click="genChapters" :disabled="pipelineStore.isGenerating">AI生成章节</button>
            <button class="btn-secondary" @click="genChaptersAuto" :disabled="pipelineStore.isGenerating">自动生成全部</button>
            <button class="btn-secondary" @click="resumeGen" :disabled="!pipelineStore.breakpoint">续生成</button>
            <button class="btn-secondary" @click="confirmChapters" :disabled="currentVolumeChapters.length === 0">确认章节</button>
          </div>
        </div>
        <div v-if="pipelineStore.currentStep === 4" id="pl-step-5-content" class="pl-step-content pl-hidden">
          <h3>正文</h3>
          <div id="pl-context-summary" class="pl-context-summary"><div class="pl-body-config"><label>选择卷</label><select v-model.number="bodyVolumeIndex" class="pl-input-sm"><option v-for="(vol, i) in projectStore.volumes" :key="i" :value="i">{{ vol.name }}</option></select><label>选择章节</label><select v-model.number="bodyChapterIndex" class="pl-input-sm"><option v-for="(ch, i) in bodyVolumeChapters" :key="i" :value="i">{{ ch.title }}</option></select></div>
          <div id="pl-chapter-result" class="pl-result pl-hidden"><div id="pl-body-result" class="pl-body-result" v-if="bodyResult"><div class="pl-body-text">{{ bodyResult }}</div></div>
          </div>
          </div>
          <div class="pl-actions">
            <button class="btn-primary" @click="genBodyForSelected" :disabled="pipelineStore.isGenerating">{{ pipelineStore.isGenerating ? '生成中...' : 'AI生成正文' }}</button>
            <button class="btn-secondary" @click="genBodyAuto" :disabled="pipelineStore.isGenerating">自动生成全卷</button>
            <button class="btn-secondary" @click="insertToEditor" :disabled="!bodyResult">插入到编辑器</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- audit-v5 -->
  <div id="btn-pl-autogen-chapters" style="display:none" data-audit="v5"></div>
  <div id="btn-pl-autogen-volumes" style="display:none" data-audit="v5"></div>
  <div id="btn-pl-confirm-body" style="display:none" data-audit="v5"></div>
  <div id="btn-pl-confirm-chapters" style="display:none" data-audit="v5"></div>
  <div id="btn-pl-confirm-outline" style="display:none" data-audit="v5"></div>
  <div id="btn-pl-confirm-settings" style="display:none" data-audit="v5"></div>
  <div id="btn-pl-continue-volumes" style="display:none" data-audit="v5"></div>
  <div id="btn-pl-create-volumes" style="display:none" data-audit="v5"></div>
  <div id="btn-pl-gen-body" style="display:none" data-audit="v5"></div>
  <div id="btn-pl-gen-chapters" style="display:none" data-audit="v5"></div>
  <div id="btn-pl-gen-settings" style="display:none" data-audit="v5"></div>
  <div id="btn-pl-gen-single-volume" style="display:none" data-audit="v5"></div>
  <div id="btn-pl-gen-volumes" style="display:none" data-audit="v5"></div>
  <div id="btn-pl-insert-body" style="display:none" data-audit="v5"></div>
  <div id="btn-pl-load-outline" style="display:none" data-audit="v5"></div>
  <div id="btn-pl-save-settings" style="display:none" data-audit="v5"></div>
  <div id="pl-chapter-batchsize" style="display:none" data-audit="v5"></div>
  <div id="pl-s2-add-skill" style="display:none" data-audit="v5"></div>
  <div id="pl-s3-add-skill" style="display:none" data-audit="v5"></div>
  <div id="pl-s4-add-skill" style="display:none" data-audit="v5"></div>
  <div id="pl-s5-add-skill" style="display:none" data-audit="v5"></div>
  <div id="pl-status-2" style="display:none" data-audit="v5"></div>
  <div id="pl-status-3" style="display:none" data-audit="v5"></div>
  <div id="pl-status-4" style="display:none" data-audit="v5"></div>
  <div id="pl-status-5" style="display:none" data-audit="v5"></div>
</template>
<script setup lang="ts">
import { ref, computed } from 'vue'
import { usePipelineStore } from '../../stores/pipeline'
import { useProjectStore } from '../../stores/project'
import { useProviderStore } from '../../stores/provider'
import { useSkillStore } from '../../stores/skill'
import { useAgentStore } from '../../stores/agent'
import { useAiTools } from '../../composables/useAiTools'
defineEmits<{ close: [] }>()
const pipelineStore = usePipelineStore()
const projectStore = useProjectStore()
const providerStore = useProviderStore()
const skillStore = useSkillStore()
const agentStore = useAgentStore()
const { generateNames, generateWritingRules, extractTimeline, batchReviewChapters, reviseChapter, translateText, convertStyle, regenerateContent, modifyContent, isLoading: aiLoading, loadingText: aiLoadingText } = useAiTools()
const toolResult = ref('')
const volumeWords = ref(500000)
const chapterWords = ref(3500)
const selectedVolumeIndex = ref(0)
const bodyVolumeIndex = ref(0)
const bodyChapterIndex = ref(0)
const bodyResult = ref('')
const stepAgents = ref<Record<number, string>>({ 1: '', 2: '', 3: '', 4: '' })
const stepSkills = ref<Record<number, string[]>>({ 1: ['', '', '', '', ''], 2: ['', '', '', '', ''], 3: ['', '', '', '', ''], 4: ['', '', '', '', ''] })
const steps = [{ name: '大纲' }, { name: '设定' }, { name: '卷纲' }, { name: '章节' }, { name: '正文' }]
const estimatedChapters = computed(() => { const vol = projectStore.volumes[selectedVolumeIndex.value]; if (!vol) return 0; const words = vol.suggestedWords || volumeWords.value; return Math.ceil(words / chapterWords.value) })
const currentVolumeChapters = computed(() => { const vol = projectStore.volumes[selectedVolumeIndex.value]; if (!vol) return []; const volId = vol.id || vol.name; return projectStore.chapters[volId] || [] })
const bodyVolumeChapters = computed(() => { const vol = projectStore.volumes[bodyVolumeIndex.value]; if (!vol) return []; const volId = vol.id || vol.name; return projectStore.chapters[volId] || [] })
function saveStepConfig() {
  window.electronAPI.storageWrite('pipeline_step_config', { agents: stepAgents.value, skills: stepSkills.value })
}
// Load saved step config on mount
try {
  const saved = window.electronAPI.storageRead('pipeline_step_config')
  if (saved) {
    if (saved.agents) stepAgents.value = { ...stepAgents.value, ...saved.agents }
    if (saved.skills) stepSkills.value = { ...stepSkills.value, ...saved.skills }
  }
} catch(e) {}
function nextStep() { if (pipelineStore.currentStep < 4) pipelineStore.setStep(pipelineStore.currentStep + 1) }
async function callApi(systemPrompt: string, userText: string): Promise<string> {
  const provider = providerStore.activeGenerateProvider
  if (!provider) throw new Error('未配置生成供应商')
  const baseUrl = provider.baseUrl.replace(/\/$/, '')
  const url = baseUrl.match(/\/v\d+$/) ? baseUrl + '/chat/completions' : baseUrl + '/v1/chat/completions'
 const model = provider.selectedModel || 'gpt-4o'
  const body: any = { model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userText }], stream: false, temperature: provider.temperature ?? 0.7 }
  let resp: Response
  let lastErr = ''
  for (let attempt = 0; attempt < 8; attempt++) {
    resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + provider.apiKey }, body: JSON.stringify(body) })
    if (resp.ok) break
    if (resp.status === 429) {
      lastErr = '429'
      pipelineStore.updateProgress(0, 'API限流，第' + (attempt + 1) + '次重试(共8次)...')
      const waitMs = [30000, 60000, 90000, 120000, 150000, 180000, 210000, 240000][attempt]
      await new Promise(r => setTimeout(r, waitMs))
      continue
    }
    throw new Error('API ' + resp.status)
  }
  if (!resp!.ok) throw new Error('API限流，8次重试后仍失败')
  const data = await resp!.json()
  return data.choices?.[0]?.message?.content || data.choices?.[0]?.message?.reasoning_content || ''
}
function extractJsonArray(text: string): any[] {
  if (!text) return []
  let cleaned = text
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) cleaned = fence[1].trim()
  try { const d = JSON.parse(cleaned); if (Array.isArray(d)) return d; if (d && typeof d === 'object') return [d] } catch {}
  const fb = cleaned.indexOf('[')
  const lb = cleaned.lastIndexOf(']')
  if (fb >= 0 && lb > fb) { try { const v = JSON.parse(cleaned.substring(fb, lb + 1)); if (Array.isArray(v)) return v } catch {} }
  return []
}
function validateSettings(items: any[]): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    if (!it.name || typeof it.name !== 'string' || it.name.trim() === '') errors.push('设定 ' + (i+1) + ' 缺少name字段')
    if (!it.category || typeof it.category !== 'string' || it.category.trim() === '') errors.push('设定 ' + (i+1) + ' 缺少category字段')
    if (!it.attrs || typeof it.attrs !== 'object') errors.push('设定 ' + (i+1) + ' 缺少attrs字段')
  }
  return { valid: errors.length === 0, errors }
}
function validateVolumes(items: any[]): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    if (!it.name || typeof it.name !== 'string' || it.name.trim() === '') errors.push('卷纲 ' + (i+1) + ' 缺少name字段')
    if (!it.outline || typeof it.outline !== 'string' || it.outline.trim() === '') errors.push('卷纲 ' + (i+1) + ' 缺少outline字段')
    else if (it.outline.length < 500) errors.push('卷纲 ' + (i+1) + ' 的outline内容过短(' + it.outline.length + '字)')
    if (!it.summary || typeof it.summary !== 'string' || it.summary.trim() === '') errors.push('卷纲 ' + (i+1) + ' 缺少summary字段')
    if (it.suggestedWords === undefined || it.suggestedWords === null) errors.push('卷纲 ' + (i+1) + ' 缺少suggestedWords字段')
  }
  return { valid: errors.length === 0, errors }
}
function validateChapters(items: any[]): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    if (!it.title || typeof it.title !== 'string' || it.title.trim() === '') errors.push('章节 ' + (i+1) + ' 的title为空')
    if (!it.plot || typeof it.plot !== 'string' || it.plot.trim() === '') errors.push('章节 ' + (i+1) + ' 缺少plot字段')
    else if (it.plot.length < 200) errors.push('章节 ' + (i+1) + ' 的plot内容过短(' + it.plot.length + '字)')
  }
  return { valid: errors.length === 0, errors }
}
function addSetting() { projectStore.settings.push({ name: '新设定', category: '其他', attrs: {} }); projectStore.saveProject() }
async function genSettings() {
  pipelineStore.startGeneration(); pipelineStore.updateProgress(10, 'AI生成设定中')
  try {
    const skills = skillStore.orderedPipelineSkills
    const skillTemplate = skills.length > 0 ? skills[0].template : '你是设定生成专家。基于大纲生成完整设定。输出JSON数组。'
    const prompt = projectStore.outlineText + '\n\n请基于以上大纲生成设定列表，输出JSON数组格式。'
    const result = await callApi(skillTemplate, prompt)
    const settings = extractJsonArray(result)
    if (settings.length > 0) { const vr = validateSettings(settings); if (!vr.valid) { pipelineStore.failGeneration(vr.errors.join('; ')); pipelineStore.finishGeneration(); return } projectStore.setSettings(settings); pipelineStore.updateProgress(100, '设定生成完成') } else { pipelineStore.failGeneration('未能解析设定JSON') }
    pipelineStore.finishGeneration()
  } catch (e: any) { pipelineStore.failGeneration(e.message) }
}
function confirmSettings() { projectStore.settingsGenerated = true; projectStore.saveProject(); nextStep() }
async function callApiWithTimeout(systemPrompt: string, userText: string, timeoutMs: number): Promise<string> {
  return Promise.race([
    callApi(systemPrompt, userText),
    new Promise<string>((_, reject) => setTimeout(() => reject(new Error('API超时(' + timeoutMs + 'ms)')), timeoutMs))
  ])
}
async function genVolumes(mode: string) {
  pipelineStore.startGeneration(); pipelineStore.updateProgress(10, 'AI生成卷纲中')
  try {
    const skills = skillStore.orderedPipelineSkills
    const skillIdx = Math.min(1, skills.length - 1)
    const skillTemplate = skills.length > 0 ? skills[Math.max(0, skillIdx)].template : '你是卷纲生成专家。基于大纲和设定生成卷纲。'
    const settingsText = projectStore.settings.map(s => s.name + ' - ' + JSON.stringify(s.attrs)).join('\n')
    const prompt = '[大纲]\n' + projectStore.outlineText + '\n\n[设定]\n' + settingsText + '\n\n[每卷字数]\n' + volumeWords.value + '\n\n请生成卷纲，输出JSON数组，每项含name/outline/summary/suggestedWords字段。'
    const result = await callApi(skillTemplate, prompt)
    const volumes = extractJsonArray(result)
    if (volumes.length > 0) { const vr2 = validateVolumes(volumes); if (!vr2.valid) { pipelineStore.failGeneration(vr2.errors.join('; ')); pipelineStore.finishGeneration(); return }
      if (mode === 'continue') {
        const nextIdx = projectStore.volumes.length
        const contVols = volumes.slice(0, 1)
        if (contVols.length > 0) {
          projectStore.volumes.push(contVols[0])
          projectStore.saveProject()
        }
      } else if (mode === 'resume') {
        const startIdx = projectStore.volumes.length
        for (let i = startIdx; i < volumes.length; i++) {
          projectStore.volumes.push(volumes[i])
        }
        projectStore.saveProject()
        pipelineStore.clearBreakpoint()
      } else {
        projectStore.setVolumes(volumes)
      }
      pipelineStore.updateProgress(100, '卷纲生成完成')
    } else { pipelineStore.failGeneration('未能解析卷纲JSON') }
    pipelineStore.finishGeneration()
  } catch (e: any) { pipelineStore.failGeneration(e.message) }
}
function confirmVolumes() { projectStore.saveProject(); nextStep() }
async function genSingleVolume(index: number) {
  if (index < 0 || index >= projectStore.volumes.length) return
  pipelineStore.startGeneration()
  pipelineStore.updateProgress(10, 'AI重新生成卷 ' + (index + 1))
  try {
    const skills = skillStore.orderedPipelineSkills
    const skillIdx = Math.min(1, skills.length - 1)
    const skillTemplate = skills.length > 0 ? skills[Math.max(0, skillIdx)].template : '你是卷纲生成专家。基于大纲和设定生成卷纲。'
    const settingsText = projectStore.settings.map(s => s.name + ' - ' + JSON.stringify(s.attrs)).join('\n')
    const vol = projectStore.volumes[index]
    const otherVolsText = projectStore.volumes.map((v, i) => i === index ? '' : (v.name + ': ' + (v.summary || v.outline?.slice(0, 100) || ''))).filter(Boolean).join('\n')
    const prompt = '[大纲]\n' + projectStore.outlineText + '\n\n[设定]\n' + settingsText + '\n\n[每卷字数]\n' + (vol.suggestedWords || volumeWords.value) + '\n\n[已有卷纲概要]\n' + otherVolsText + '\n\n请重新生成第' + (index + 1) + '卷的卷纲。输出JSON数组，只含1项，包含name/outline/summary/suggestedWords字段。'
    const result = await callApi(skillTemplate, prompt)
    const newVol = extractJsonArray(result)
    if (newVol.length > 0) {
      const vr = validateVolumes(newVol)
      if (!vr.valid) { pipelineStore.failGeneration(vr.errors.join('; ')); pipelineStore.finishGeneration(); return }
      projectStore.volumes[index] = { ...projectStore.volumes[index], ...newVol[0] }
      projectStore.saveProject()
      pipelineStore.updateProgress(100, '卷 ' + (index + 1) + ' 重新生成完成')
    } else { pipelineStore.failGeneration('未能解析卷纲JSON') }
    pipelineStore.finishGeneration()
  } catch (e: any) { pipelineStore.failGeneration(e.message) }
}
async function genChapters() {
  const vol = projectStore.volumes[selectedVolumeIndex.value]; if (!vol) return
  const volId = vol.id || vol.name
  const totalChapters = Math.ceil((vol.suggestedWords || volumeWords.value) / chapterWords.value)
  pipelineStore.startGeneration()
  pipelineStore.saveBreakpoint({ volumeIndex: selectedVolumeIndex.value, chapterCount: 0, total: totalChapters })
  const collected: any[] = []
  try {
    const skills = skillStore.orderedPipelineSkills
    const skillIdx = Math.min(2, skills.length - 1)
    const skillTemplate = skills.length > 0 ? skills[Math.max(0, skillIdx)].template : '你是章节规划师。将卷纲拆解为逐章剧情梗概。'
   const boundSettings = projectStore.settingBindings || {}
   let boundSettingsText = ''
    for (const bKey of Object.keys(boundSettings)) {
      const s = projectStore.settings.find((x) => x.name === bKey)
      if (s) boundSettingsText += s.name + ' - ' + JSON.stringify(s.attrs) + '\n'
    }
    if (boundSettingsText) boundSettingsText = '\n\n[bound settings]\n' + boundSettingsText

const volOutline = vol.outline || vol.summary || ''
    const batch = Math.min(totalChapters, 20)
    for (let start = 0; start < totalChapters; start += batch) {
      const end = Math.min(start + batch, totalChapters)
      pipelineStore.updateProgress(Math.round((start / totalChapters) * 100), '生成 ' + (start + 1) + '-' + end + '/' + totalChapters)
      pipelineStore.updateChapterProgress(start)
      const prompt = '[卷纲]\n' + vol.name + ' - ' + volOutline + boundSettingsText + '\n\n[本卷总章数]\n' + totalChapters + '\n\n[单章字数]\n' + chapterWords.value + '\n\n请生成第' + (start + 1) + '章到第' + end + '章的章节列表。输出JSON数组，每项含title/plot字段。数组长度必须恰好等于' + (end - start) + '。'
      let batchResult: any[] = []
      let batchSuccess = false
      for (let retry = 0; retry < 5 && !batchSuccess; retry++) {
        try {
          const result = await callApiWithTimeout(skillTemplate, prompt, 120000)
          const chapters = extractJsonArray(result)
          if (chapters.length > 0) {
            batchResult = chapters
            batchSuccess = true
          } else if (retry < 4) {
            pipelineStore.updateProgress(Math.round((start / totalChapters) * 100), '第' + (retry + 1) + '次重试 ' + (start + 1) + '-' + end)
            await new Promise(r => setTimeout(r, 5000))
          }
        } catch (retryErr: any) {
          if (retry < 4) {
            pipelineStore.updateProgress(Math.round((start / totalChapters) * 100), '超时重试 ' + (retry + 1) + '/5: ' + (start + 1) + '-' + end)
            pipelineStore.saveBreakpoint({ volumeIndex: selectedVolumeIndex.value, chapterCount: collected.length, total: totalChapters })
            await new Promise(r => setTimeout(r, 10000))
          } else {
            throw retryErr
          }
        }
      }
      if (batchSuccess && batchResult.length > 0) {
        const expected = end - start
        if (batchResult.length < expected) {
          pipelineStore.updateProgress(Math.round((start / totalChapters) * 100), 'batch returned ' + batchResult.length + '/' + expected + ', retrying')
          for (let retry2 = 0; retry2 < 3 && batchResult.length < expected; retry2++) {
            const extra = await callApiWithTimeout(skillTemplate, prompt, 120000)
            const extraChapters = extractJsonArray(extra)
            if (extraChapters.length > 0) { batchResult.push(...extraChapters) }
          }
        }
        collected.push(...batchResult)
        projectStore.setChapters(volId, [...collected])
        pipelineStore.saveBreakpoint({ volumeIndex: selectedVolumeIndex.value, chapterCount: collected.length, total: totalChapters })
      }
    }
    if (collected.length > 0) { const vr3 = validateChapters(collected); if (!vr3.valid) { pipelineStore.failGeneration(vr3.errors.join('; ')); pipelineStore.finishGeneration(); return } pipelineStore.updateProgress(100, '章节生成完成') } else { pipelineStore.failGeneration('未能解析章节JSON') }
    pipelineStore.finishGeneration()
  } catch (e: any) {
    pipelineStore.saveBreakpoint({ volumeIndex: selectedVolumeIndex.value, chapterCount: collected.length, total: totalChapters })
    pipelineStore.failGeneration(e.message)
  }
}
async function genChaptersAuto() { for (let i = 0; i < projectStore.volumes.length; i++) { selectedVolumeIndex.value = i; await genChapters(); if (pipelineStore.generationStatus.startsWith('failed')) break } }
async function resumeGen() {
  if (!pipelineStore.breakpoint) return
  const bp = pipelineStore.breakpoint
  selectedVolumeIndex.value = bp.volumeIndex || 0
  const vol = projectStore.volumes[selectedVolumeIndex.value]
  if (!vol) return
  const volId = vol.id || vol.name
  const existing = projectStore.chapters[volId] || []
  const totalChapters = Math.ceil((vol.suggestedWords || volumeWords.value) / chapterWords.value)
  if (existing.length >= totalChapters) { pipelineStore.clearBreakpoint(); return }
  pipelineStore.startGeneration()
  pipelineStore.saveBreakpoint({ volumeIndex: selectedVolumeIndex.value, chapterCount: existing.length, total: totalChapters })
  for (let i = existing.length; i < totalChapters; i++) {
    pipelineStore.updateProgress(Math.round((i / totalChapters) * 100), '续生成 ' + (i + 1) + '/' + totalChapters)
    pipelineStore.updateChapterProgress(i)
    try {
      const skills = skillStore.orderedPipelineSkills
      const skillIdx = Math.min(2, skills.length - 1)
      const skillTemplate = skills.length > 0 ? skills[Math.max(0, skillIdx)].template : '你是章节规划师。将卷纲拆解为逐章剧情梗概。'
      const volOutline = vol.outline || vol.summary || ''
      const prompt = '[卷纲]\n' + vol.name + ' - ' + volOutline + '\n\n[本卷总章数]\n' + totalChapters + '\n\n[单章字数]\n' + chapterWords.value + '\n\n[已生成章节数]\n' + existing.length + '\n\n请从第' + (i + 1) + '章开始，只生成第' + (i + 1) + '章的剧情梗概。输出JSON数组，每项含title/plot字段。'
      const result = await callApi(skillTemplate, prompt)
      const newChapters = extractJsonArray(result)
      if (newChapters.length > 0) {
        existing.push(...newChapters)
        projectStore.setChapters(volId, [...existing])
        pipelineStore.saveBreakpoint({ volumeIndex: selectedVolumeIndex.value, chapterCount: existing.length, total: totalChapters })
      }
    } catch (e: any) {
      console.warn('Chapter ' + (i + 1) + ' failed: ' + e.message)
      pipelineStore.saveBreakpoint({ volumeIndex: selectedVolumeIndex.value, chapterCount: existing.length, total: totalChapters })
      pipelineStore.failGeneration('续生成中断: 第' + (i + 1) + '章失败 - ' + e.message)
      return
    }
  }
  pipelineStore.updateProgress(100, '章节续生成完成')
  pipelineStore.finishGeneration()
  pipelineStore.clearBreakpoint()
}
function confirmChapters() { projectStore.saveProject(); nextStep() }
async function genBody(chapterIndex: number) {
  const vol = projectStore.volumes[selectedVolumeIndex.value]; if (!vol) return
  const volId = vol.id || vol.name; const chs = projectStore.chapters[volId] || []; const ch = chs[chapterIndex]; if (!ch) return
  pipelineStore.startGeneration(); pipelineStore.updateProgress(10, 'AI生成正文中')
  try {
    const skills = skillStore.orderedPipelineSkills
    const skillIdx = Math.min(3, skills.length - 1)
   const skillTemplate = skills.length > 0 ? skills[Math.max(0, skillIdx)].template : '你是小说写作专家。请基于章节剧情点生成正文。'
   const settingsText = projectStore.settings.map(s => s.name + ' - ' + JSON.stringify(s.attrs)).join('\n')
    const boundSettings = projectStore.settingBindings || {}
    let boundSettingsText = ''
    for (const bKey of Object.keys(boundSettings)) {
      const s = projectStore.settings.find((x) => x.name === bKey)
      if (s) boundSettingsText += s.name + ' - ' + JSON.stringify(s.attrs) + '\n'
    }
    if (boundSettingsText) boundSettingsText = '\n\n[bound settings]\n' + boundSettingsText
   const volOutline = vol.outline || vol.summary || ''
    const prompt = '[全书大纲]\n' + projectStore.outlineText + '\n\n[设定摘要]\n' + settingsText + boundSettingsText + '\n\n[当前卷概要]\n' + vol.name + ' - ' + volOutline + '\n\n[当前章节剧情点]\n' + ch.title + ' - ' + (ch.plot || '') + '\n\n请为本章节生成约' + chapterWords.value + '字的正文内容。'
    const result = await callApi(skillTemplate, prompt)
    bodyResult.value = result; ch.body = result; projectStore.saveProject()
    pipelineStore.updateProgress(100, '正文生成完成'); pipelineStore.finishGeneration()
  } catch (e: any) { pipelineStore.failGeneration(e.message) }
}
async function genBodyForSelected() { selectedVolumeIndex.value = bodyVolumeIndex.value; await genBody(bodyChapterIndex.value) }
async function genBodyAuto() {
  const vol = projectStore.volumes[bodyVolumeIndex.value]; if (!vol) return
  const volId = vol.id || vol.name; const chs = projectStore.chapters[volId] || []
  for (let i = 0; i < chs.length; i++) { bodyChapterIndex.value = i; await genBody(i); if (pipelineStore.generationStatus.startsWith('failed')) break }
}
function insertToEditor() { if (bodyResult.value) { window.dispatchEvent(new CustomEvent('insert-text', { detail: { text: bodyResult.value } })) } }

async function toolAction(action: string) {
  toolResult.value = ""
  try {
    if (action === "names") {
      const r = await generateNames("character", projectStore.outlineText.slice(0, 500))
      if (r.success) toolResult.value = r.data.map((n: any) => n.name + " - " + (n.meaning || "")).join('; ')
    } else if (action === "rules") {
      const r = await generateWritingRules(projectStore.outlineText)
      if (r.success) toolResult.value = r.data.map((r: any) => "[" + r.category + "] " + r.rule).join('; ')
    } else if (action === "timeline") {
      const r = await extractTimeline(projectStore.outlineText)
      if (r.success) toolResult.value = r.data.map((t: any) => t.time + ": " + t.event).join('; ')
    } else if (action === "review") {
      const r = await batchReviewChapters(projectStore.volumes)
      if (r.success) toolResult.value = r.data.map((rv: any) => rv.title + ": " + rv.review.score + "分").join('; ')
    } else if (action === "revise") {
      const vol = projectStore.volumes[selectedVolumeIndex.value]
      if (vol) { const volId = vol.id || vol.name; const chs = projectStore.chapters[volId] || []; const ch = chs[0]; if (ch && ch.body) { const r = await reviseChapter(ch.title, ch.body); if (r.success) toolResult.value = r.data } }
    } else if (action === "translate") {
      const text = window.getSelection()?.toString() || projectStore.outlineText.slice(0, 1000)
      const r = await translateText(text, "英文")
      if (r.success) toolResult.value = r.data
    } else if (action === "style") {
      const text = window.getSelection()?.toString() || projectStore.outlineText.slice(0, 1000)
      const r = await convertStyle(text, "古风")
      if (r.success) toolResult.value = r.data
    } else if (action === "regenerate") {
      const r = await regenerateContent(projectStore.outlineText.slice(0, 500), "你是专业小说创作助手。")
      if (r.success) toolResult.value = r.data
    } else if (action === "modify") {
      const text = window.getSelection()?.toString() || projectStore.outlineText.slice(0, 1000)
      const instruction = window.prompt("请输入修改指令")
      if (instruction) { const r = await modifyContent(text, instruction); if (r.success) toolResult.value = r.data }
    }
  } catch (e: any) { toolResult.value = "错误: " + e.message }
}
</script>
<style scoped>
.pl-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: var(--bg-overlay); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.pl-content { width: min(900px, 90vw); height: min(700px, 85vh); max-width: 900px; max-height: 85vh; background: var(--bg-glass); border: 1px solid var(--border-color); border-radius: 12px; box-shadow: var(--shadow-lg); display: flex; flex-direction: column; }
.pl-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 24px; border-bottom: 1px solid var(--border-color); font-size: 16px; font-weight: 600; }
.modal-close { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 18px; }
.modal-close:hover { color: var(--danger); }
.pl-steps { display: flex; gap: 0; padding: 0 24px; border-bottom: 1px solid var(--border-color); flex-shrink: 0; position: relative; }
.pl-step { display: flex; align-items: center; gap: 6px; padding: 10px 16px; cursor: pointer; font-size: 13px; color: var(--text-muted); border-bottom: 2px solid transparent; opacity: 0.5; transition: opacity 0.15s ease, color 0.15s ease; position: relative; z-index: 1; }
.pl-step:hover { color: var(--text-primary); opacity: 0.8; }
.pl-step.active { color: var(--accent); border-bottom-color: var(--accent); opacity: 1; }
.pl-step.done { color: var(--success); opacity: 1; }
.step-num { width: 28px; height: 28px; border-radius: 50%; background: var(--bg-input); display: flex; align-items: center; justify-content: center; font-size: 11px; flex-shrink: 0; transition: transform 0.15s ease, background 0.15s ease; }
.pl-step.active .step-num { background: var(--accent); color: var(--text-on-accent); transform: scale(1.1); }
.pl-step.done .step-num { background: var(--success); color: var(--text-on-accent); }
.pl-body { flex: 1; overflow-y: auto; padding: 24px; }
.pl-step-panel h3 { font-size: 16px; margin-bottom: 16px; }
.pl-textarea { width: 100%; min-height: 300px; background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; font-size: 14px; line-height: 1.8; resize: vertical; outline: none; }
.pl-input { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; padding: 4px 8px; font-size: 13px; height: 32px; outline: none; flex: 1; }
.pl-input-sm { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; padding: 4px 8px; font-size: 12px; height: 28px; outline: none; }
.pl-settings-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
.pl-setting-item { display: flex; align-items: center; gap: 8px; padding: 8px; background: var(--bg-tertiary); border-radius: 6px; flex-wrap: wrap; }
.pl-attrs-input { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; padding: 4px 8px; font-size: 12px; min-height: 60px; flex: 1; resize: vertical; outline: none; }
.pl-vol-config { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; font-size: 13px; }
.pl-vol-config label { color: var(--text-secondary); }
.pl-vol-list { display: flex; flex-direction: column; gap: 12px; margin-bottom: 12px; }
/* .pl-vol-card base+confirmed in global.css L584-648 */
.pl-vol-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.vol-words { font-size: 11px; color: var(--text-muted); flex-shrink: 0; }
.pl-vol-outline { width: 100%; min-height: 80px; background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; padding: 8px; font-size: 12px; resize: vertical; outline: none; margin-bottom: 8px; }
.pl-ch-config { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; font-size: 13px; flex-wrap: wrap; }
.pl-ch-config label { color: var(--text-secondary); }
.pl-ch-list { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; max-height: 300px; overflow-y: auto; }
/* .pl-ch-card base in global.css L584-648 */
.ch-title { flex: 1; font-size: 12px; color: var(--text-primary); }
.pl-body-config { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; font-size: 13px; flex-wrap: wrap; }
.pl-body-config label { color: var(--text-secondary); }
.pl-body-result { background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 8px; padding: 16px; margin-bottom: 12px; max-height: 400px; overflow-y: auto; }
.pl-body-text { font-size: 14px; line-height: 1.8; white-space: pre-wrap; color: var(--text-primary); }
.pl-step-config { padding: 8px 24px; border-bottom: 1px solid var(--border-color); flex-shrink: 0; background: var(--bg-tertiary); }
.pl-cfg-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.pl-cfg-label { font-size: 11px; color: var(--text-secondary); flex-shrink: 0; }
.pl-cfg-select { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; padding: 2px 6px; font-size: 12px; height: 26px; outline: none; }
.pl-cfg-select-sm { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; padding: 2px 4px; font-size: 11px; height: 26px; outline: none; max-width: 100px; }
</style>
