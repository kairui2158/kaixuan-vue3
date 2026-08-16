<template>
  <div id="outline-workspace" class="ow-overlay" @click.self="$emit('close')">
    <div class="ow-content">
      <div class="ow-header">
        <span>大纲工作台</span>
        <div class="ow-header-right">
          <button id="btn-ai-co-create" class="ow-chat-toggle" @click="chatAreaOpen = !chatAreaOpen">AI 共创大纲</button>
          <button id="btn-close-outline-workspace" class="modal-close" @click="$emit('close')">x</button>
        </div>
      </div>
      <div class="ow-body">
        <div class="ow-editor">
          <div class="ow-editor-header">
            <span>大纲编辑器</span>
            <div class="editor-toolbar">
              <div class="editor-toolbar-group">
                <button id="btn-export-outline-md" class="btn-sm btn-secondary ow-export-btn" @click="exportMd">.md</button>
                <button id="btn-export-outline-txt" class="btn-sm btn-secondary ow-export-btn" @click="exportTxt">.txt</button>
              </div>
            </div>
            <span id="ow-word-count" class="word-count">{{ (projectStore.outlineText || "").length }} 字</span>
          </div>
          <textarea
            id="outline-editor"
            v-model="projectStore.outlineText"
            class="ow-textarea" :readonly="projectStore.outlineLocked"
            placeholder="在此输入或编辑你的小说大纲..."
          ></textarea>
        </div>
        <div class="ow-chat" v-show="chatAreaOpen">
          <div id="ow-chat-messages" class="ow-messages" ref="msgContainer">
            <div v-for="(msg, i) in messages" :key="i" class="ow-msg" :class="msg.role">
              <div class="ow-msg-bubble" v-html="renderMarkdown(msg.content)"></div>
            </div>
          </div>
          <div class="ow-input-row">
            <input id="ow-chat-input" v-model="inputText" class="ow-input" placeholder="和AI讨论大纲..." @keydown.enter="sendMessage" />
            <button id="btn-ow-send" class="btn-send" @click="sendMessage">send</button>
          </div>
        </div>
      </div>
        <div class="ow-sidebar">
          <div class="ow-section">
            <h4>Skill 功能区</h4>
            <button id="btn-generate-outline-skills" class="btn-secondary full-width" @click="generateOutlineSkills">自动生成大纲 Skill</button>
            <div id="ow-skill-suggestions" class="">
              <div v-for="(s, i) in skillSuggestionsList" :key="i" class="ow-skill-item" @click="bindSkill(s)">
                {{ s.name }}
              </div>
              <p v-if="skillSuggestionsList.length === 0" class="ow-empty-hint">点击上方按钮生成建议</p>
            </div>
            <h5>已绑定的大纲 Skill</h5>
            <div id="ow-bound-list" class="">
              <div v-for="(id, i) in boundSkills" :key="i" class="ow-bound-item">
                <span>{{ getSkillName(id) }}</span>
                <button class="btn-sm" @click="unbindSkill(i)">x</button>
              </div>
              <p v-if="boundSkills.length === 0" class="ow-empty-hint">暂无绑定的 Skill</p>
            </div>
          </div>
        </div>
      <div class="ow-footer">
        <button id="btn-import-outline" class="btn-secondary btn-import" @click="triggerImport">从文件导入(.txt/.md/.doc/.docx)</button>
        <input ref="fileInput" type="file" accept=".txt,.md,.text,.rtf,.docx" style="display:none" @change="handleImport" />
        <button id="btn-save-outline" class="btn-primary" @click="saveOutline">保存大纲</button>
        <span v-if="saveFeedback" class="save-feedback">{{ saveFeedback }}</span>
        <button id="btn-lock-outline" class="btn-primary" @click="handleLockOutline()" :disabled="!projectStore.hasOutline">确认大纲，锁定并进入创作</button>
      </div>
      <div class="ow-resize-handle"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { marked } from 'marked'
import { useProjectStore } from '../../stores/project'
import { useSkillStore } from '../../stores/skill'
import { useProviderStore } from '../../stores/provider'
import { usePipelineStore } from '../../stores/pipeline'
import { importFile } from '../../services/file-import'
import { useAiTools } from '../../composables/useAiTools'

const emit = defineEmits<{ close: []; navigate: [target: string] }>()

const projectStore = useProjectStore()
const providerStore = useProviderStore()
const pipelineStore = usePipelineStore()
const { callAi } = useAiTools()
const messages = ref<any[]>([])
const inputText = ref('')
const msgContainer = ref<HTMLElement | null>(null)
const fileInput = ref<HTMLElement | null>(null)
const chatAreaOpen = ref(false)
const saveFeedback = ref('')
const skillStore = useSkillStore()
const skillSuggestionsList = ref<any[]>([])
const boundSkills = computed({
  get: () => skillStore.pipelineSkills,
  set: (v: string[]) => { skillStore.pipelineSkills = [...v]; skillStore.saveSkills() }
})

function generateOutlineSkills() {
  const outlineSkills = skillStore.skills.filter(function(s: any) { return s.category === 'outline' || s.category === '大纲' })
  if (outlineSkills.length > 0) {
    skillSuggestionsList.value = outlineSkills.map(function(s: any) { return { id: s.id, name: s.name } })
  } else {
    skillSuggestionsList.value = [{ name: '暂无大纲类 Skill，请先在设置中创建' }]
  }
}

function bindSkill(skill: any) {
  if (skill.id && !boundSkills.value.includes(skill.id)) {
    boundSkills.value = [...boundSkills.value, skill.id]
  }
}

function unbindSkill(index: number) {
  const arr = [...boundSkills.value]
  arr.splice(index, 1)
  boundSkills.value = arr
}

function getSkillName(id: string): string {
  var s = skillStore.skills.find(function(sk: any) { return sk.id === id })
  return s ? s.name : id
}

function triggerImport() {
  fileInput.value?.click()
}

async function handleImport(e: Event) {
  const target = e.target as HTMLInputElement
  if (!target.files || target.files.length === 0) return
  try {
    const text = await importFile(target.files[0])
    if (text && text.length > 0) {
      if (!projectStore.currentProjectId) {
        projectStore.currentProjectId = 'proj-' + Date.now()
      }
      projectStore.projectName = target.files[0].name.replace(/\.(txt|md|rtf|docx)$/i, '').substring(0, 20) || projectStore.projectName || '新小说'
      projectStore.outlineText = text
      projectStore.setOutline(text)
    }
  } catch (err: any) {
    alert('导入失败: ' + (err.message || String(err)))
  }
  target.value = ''
}

function renderMarkdown(text: string): string {
  return marked.parse(text || '', { breaks: true }) as string
}

async function handleLockOutline() {
  const outline = projectStore.outlineText.trim()
  if (!outline) {
    saveFeedback.value = '[WARN] 大纲为空，请先输入内容'
    setTimeout(function() { saveFeedback.value = '' }, 3000)
    return
  }

  try {
    if (!projectStore.currentProjectId) {
      projectStore.currentProjectId = 'proj-' + Date.now()
    }
    projectStore.projectName = projectStore.projectName
      || outline.split('\n')[0].replace(/^#+\s*/, '').replace(/\s+/g, ' ').trim().substring(0, 20)
      || '新小说'

    projectStore.setOutline(outline)
    projectStore.lockOutline()
    projectStore.syncTreeToPipeline()
    pipelineStore.setStep(0)

    saveFeedback.value = '[OK] 大纲已锁定，正在同步到流水线...'
    setTimeout(function() { saveFeedback.value = '' }, 3000)

    emit('navigate', 'pipeline')

    // 旧架构锁定后的自动拆解链路：设定 + 伏笔（异步执行，不阻塞导航）
    autoDecompose(outline)
  } catch (e: any) {
    saveFeedback.value = '[锁定失败] ' + (e.message || String(e))
    setTimeout(function() { saveFeedback.value = '' }, 3000)
  }
}

async function autoDecompose(outline: string) {
  if (!outline || outline.trim().length < 50) return
  const provider = providerStore.activeGenerateProvider
  if (!provider || !provider.apiKey) return

  try {
    const decomposePrompt = '请从以下小说大纲中提取设定信息，根据大纲内容自行决定需要哪些分类（如角色、世界观、物种、物品、势力、地理、魔法体系、技术、组织等），不要限定在固定分类里。\n返回JSON数组，每项包含 category、name、content 字段。只返回JSON数组，不要其他文字。\n\n大纲：\n' + outline
    const decomposeResult = await callAi(decomposePrompt, '你是专业的小说设定编辑，擅长从大纲中提取各类设定信息，能根据大纲内容灵活判断需要哪些分类。')
    parseDecomposedSettings(decomposeResult)
  } catch (e) {
    console.warn('[OutlineWorkspace] 设定自动拆解失败:', e)
  }

  try {
    const foreshadowPrompt = '请从以下小说大纲中识别所有的伏笔（铺垫、暗示、悬念、未解之谜等）。\n返回JSON数组，每项包含 name、content 字段。只返回JSON数组，不要其他文字。\n\n大纲：\n' + outline
    const foreshadowResult = await callAi(foreshadowPrompt, '你是专业的小说结构分析师，擅长识别伏笔和铺垫。')
    parseForeshadows(foreshadowResult)
  } catch (e) {
    console.warn('[OutlineWorkspace] 伏笔提取失败:', e)
  }
}

function parseDecomposedSettings(raw: string | null) {
  if (!raw) return
  const items = extractJsonArray(raw)
  if (!items || items.length === 0) return

  const newSettings = [...(projectStore.settings || [])]
  let count = 0
  for (const item of items) {
    if (!item.name) continue
    newSettings.push({
      id: 'set_' + Date.now() + '_' + count,
      name: item.name,
      category: (item.category || '其他').toString(),
      content: item.content || '',
      attrs: item.attrs || { 描述: item.content || '' },
      attrsText: JSON.stringify(item.attrs || { 描述: item.content || '' })
    })
    count++
  }
  if (count > 0) {
    projectStore.setSettings(newSettings)
  }
}

function parseForeshadows(raw: string | null) {
  if (!raw) return
  const items = extractJsonArray(raw)
  if (!items || items.length === 0) return

  const category = '伏笔'
  const currentCats = projectStore.memories.categories.includes(category)
    ? projectStore.memories.categories
    : [...projectStore.memories.categories, category]
  const currentItems = [...projectStore.memories.items]
  for (const item of items) {
    if (!item.name) continue
    currentItems.push({
      key: item.name,
      category,
      content: item.content || ''
    })
  }
  projectStore.memories.categories = currentCats
  projectStore.memories.items = currentItems
  projectStore.saveProject()
}

function extractJsonArray(text: string): any[] | null {
  if (!text) return null
  let cleaned = text.trim()
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) cleaned = fenceMatch[1].trim()
  try {
    const d = JSON.parse(cleaned)
    if (Array.isArray(d)) return d
    if (d && typeof d === 'object') return [d]
  } catch {}
  const firstBracket = cleaned.indexOf('[')
  const lastBracket = cleaned.lastIndexOf(']')
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    const sub = cleaned.substring(firstBracket, lastBracket + 1)
    try {
      const v = JSON.parse(sub)
      if (Array.isArray(v)) return v
    } catch {}
  }
  return null
}

function saveOutline() {
  projectStore.setOutline(projectStore.outlineText)
  saveFeedback.value = '[OK] 已保存'
  setTimeout(function() { saveFeedback.value = '' }, 3000)
}

function exportMd() {
  const text = projectStore.outlineText || "";
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = (projectStore.projectName || "大纲") + ".md";
  a.click();
}
function exportTxt() {
  const text = projectStore.outlineText || "";
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = (projectStore.projectName || "大纲") + ".txt";
  a.click();
}
async function sendMessage() {
  const text = inputText.value.trim()
  if (!text) return
  messages.value.push({ role: 'user', content: text })
  inputText.value = ''
  await nextTick()
  if (msgContainer.value) msgContainer.value.scrollTop = msgContainer.value.scrollHeight

  try {
    const provider = providerStore.activeGenerateProvider
    if (!provider) {
      messages.value.push({ role: 'assistant', content: '请先配置API供应商' })
      return
    }
    const baseUrl = provider.baseUrl.replace(/\/$/, '')
    const url = baseUrl.match(/\/v\d+$/) ? baseUrl + '/chat/completions' : baseUrl + '/v1/chat/completions'
    const model = provider.selectedModel || 'gpt-4o'
    const systemPrompt = '你是小说大纲创作助手。用户正在编辑大纲，请给出建议和修改意见。'
    let resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + provider.apiKey },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, ...messages.value.filter(m => m.content).map(m => ({ role: m.role, content: m.content })), { role: 'user', content: '当前大纲:\n' + projectStore.outlineText + '\n\n用户请求: ' + text }], stream: false, max_tokens: 128000 })
    })
    if (resp.status === 429) {
      for (let attempt = 0; attempt < 8; attempt++) {
        const waitMs = [30000, 60000, 90000, 120000, 150000, 180000, 210000, 240000][attempt]
        await new Promise(r => setTimeout(r, waitMs))
        resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + provider.apiKey }, body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, ...messages.value.filter(m => m.content).map(m => ({ role: m.role, content: m.content })), { role: 'user', content: '当前大纲:\n' + projectStore.outlineText + '\n\n用户请求: ' + text }], stream: false, max_tokens: 128000 }) })
        if (resp.ok) break
        if (resp.status !== 429) throw new Error('API error: ' + resp.status)
      }
    }
    if (!resp.ok) throw new Error('API error: ' + resp.status)
    const data = await resp.json()
    messages.value.push({ role: 'assistant', content: data.choices?.[0]?.message?.content || data.choices?.[0]?.message?.reasoning_content || '' })
  } catch (e: any) {
    messages.value.push({ role: 'assistant', content: 'Error: ' + e.message })
  }
  await nextTick()
  if (msgContainer.value) msgContainer.value.scrollTop = msgContainer.value.scrollHeight
}
</script>

<style scoped>
.ow-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: var(--bg-overlay); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.ow-content { width: min(1000px, 92vw); height: min(700px, 88vh); max-width: 1000px; max-height: 88vh; background: var(--bg-glass); border: 1px solid var(--border-color); border-radius: 12px; box-shadow: var(--shadow-lg); display: flex; flex-direction: column; }
.ow-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 24px; border-bottom: 1px solid var(--border-color); font-size: 16px; font-weight: 600; }
.ow-body { flex: 1; display: flex; overflow: hidden; }
.ow-editor { flex: 1; padding: 16px; }
.ow-textarea { width: 100%; height: 100%; background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 8px; padding: 16px; font-size: 14px; line-height: 1.8; resize: none; outline: none; }
.ow-chat { width: 360px; border-left: 1px solid var(--border-color); display: flex; flex-direction: column; }
.ow-chat-header { padding: 8px 16px; border-bottom: 1px solid var(--border-color); font-size: 13px; font-weight: 600; color: var(--text-secondary); }
.ow-messages { flex: 1; overflow-y: auto; padding: 12px; }
.ow-msg { margin-bottom: 10px; }
.ow-msg.user { text-align: right; }
.ow-msg-bubble { display: inline-block; max-width: 85%; padding: 8px 12px; border-radius: 10px; font-size: 12px; line-height: 1.6; text-align: left; }
.ow-msg.user .ow-msg-bubble { background: var(--user-bubble); }
.ow-msg.assistant .ow-msg-bubble { background: var(--ai-bubble); border: 1px solid var(--border-color); }
.ow-input-row { display: flex; gap: 6px; padding: 8px 12px; border-top: 1px solid var(--border-color); }
.ow-input { flex: 1; background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 4px 10px; font-size: 12px; height: 28px; outline: none; }
.btn-send { background: var(--accent); color: var(--text-on-accent); border: none; border-radius: 6px; padding: 0 12px; height: 28px; cursor: pointer; font-size: 11px; }
.ow-footer { display: flex; gap: 8px; padding: 12px 24px; border-top: 1px solid var(--border-color); justify-content: flex-end; }
.save-feedback { font-size: 12px; color: var(--success); padding: 0 8px; }
.ow-editor-header { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--border-color); font-size: 13px; }
.ow-editor-header .word-count { margin-left: auto; font-size: 12px; color: var(--text-secondary); }
.ow-sidebar { width: 240px; border-left: 1px solid var(--border-color); padding: 12px; overflow-y: auto; flex-shrink: 0; }
.ow-section { margin-bottom: 16px; }
.ow-section h4 { font-size: 13px; font-weight: 600; margin-bottom: 8px; color: var(--text-primary); }
.ow-section h5 { font-size: 12px; font-weight: 600; margin: 12px 0 6px; color: var(--text-secondary); }
.ow-skill-suggestions { margin-top: 8px; }
.ow-skill-item { padding: 6px 10px; border: 1px solid var(--border-color); border-radius: 6px; margin-bottom: 4px; cursor: pointer; font-size: 12px; }
.ow-skill-item:hover { background: var(--bg-hover); }
.ow-bound-list { margin-top: 4px; }
.ow-bound-item { display: flex; align-items: center; justify-content: space-between; padding: 4px 8px; border: 1px solid var(--border-color); border-radius: 4px; margin-bottom: 4px; font-size: 12px; }
.ow-empty-hint { font-size: 12px; color: var(--text-muted); padding: 4px 0; }
.ow-resize-handle { height: 6px; cursor: ns-resize; background: var(--border-color); border-radius: 0 0 12px 12px; }
.full-width { width: 100%; }
</style>

.ow-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 24px; border-bottom: 1px solid var(--border-color); font-size: 16px; font-weight: 600; }
.ow-header-right { display: flex; align-items: center; gap: 8px; }
.ow-chat-toggle { padding: 6px 14px; font-size: 13px; font-weight: 500; border: 1px solid var(--accent-color); border-radius: 6px; background: transparent; color: var(--accent-color); cursor: pointer; white-space: nowrap; }
.ow-chat-toggle:hover { background: var(--accent-color); color: #fff; }
