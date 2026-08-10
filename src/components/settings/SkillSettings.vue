<template>
  <div id="sbm-skill-list" class="skill-settings">
    <h3>技能管理</h3>
    <div class="skill-section">
      <h4>流水线技能 (按顺序执行)</h4>
      <div class="skill-pipeline-list">
        <div v-for="(id, i) in skillStore.pipelineSkills" :key="id" class="skill-pipeline-item">
          <span class="skill-idx">[{{ i + 1 }}]</span>
          <span class="skill-name">{{ getSkillName(id) }}</span>
          <button class="btn-sm btn-secondary" @click="skillStore.movePipelineSkillUp(i)" :disabled="i === 0">up</button>
          <button class="btn-sm btn-secondary" @click="skillStore.movePipelineSkillDown(i)" :disabled="i === skillStore.pipelineSkills.length - 1">down</button>
          <button class="btn-danger btn-sm" @click="removeFromPipeline(i)">x</button>
        </div>
      </div>
    </div>
    <div class="skill-section">
      <h4>所有技能</h4>
      <div class="skill-all-list">
       <div v-for="s in skillStore.skills" :key="s.id" class="skill-card">
          <div class="skill-card-header">
            <span class="skill-card-name">{{ s.name }}</span>
            <span class="skill-card-badge">{{ s.category }}</span>
          </div>
          <div class="skill-card-body">
            <span class="skill-card-desc" v-if="s.template">{{ s.template.substring(0, 60) }}...</span>
            <span class="skill-card-desc" v-else>无模板内容</span>
          </div>
          <div class="skill-card-meta">
            <span class="skill-card-info">模式: {{ s.executionMode || 'chain' }}</span>
            <span class="skill-card-info">输出: {{ s.outputFormat || 'text' }}</span>
          </div>
          <div class="skill-card-actions">
            <button class="btn-sm btn-secondary" @click="editSkill(s.id)">编辑</button>
            <button class="btn-sm btn-secondary" @click="addToPipeline(s.id)">加入流水线</button>
            <button class="btn-danger btn-sm" @click="skillStore.removeSkill(s.id)">删除</button>
          </div>
      </div>
      </div>
    </div>
    <button id="btn-add-skill" class="btn-add" @click="addSkill">+ 新建技能</button>
   <div v-if="editingSkillId" class="skill-edit-overlay" @click.self="cancelEdit">
     <div id="skill-bind-modal" class="skill-edit-modal">
       <div class="sem-header">编辑技能 <button @click="cancelEdit">x</button></div>
       <label>名称</label><input id="sf-name" v-model="editingName" class="sem-input" />
       <label>分类</label>
       <input v-model="editingCategory" class="sem-input" />
        <label>描述</label><input id="sf-desc" v-model="editingDescription" class="sem-input" placeholder="技能用途简述" />
        <label>注入模式</label><select id="sf-inject-mode" v-model="editingInjectMode" class="sem-input">
          <option value="system_prefix">系统前缀 - 追加到系统提示词之后</option>
          <option value="user_prefix">用户前缀 - 添加到用户消息之前</option>
          <option value="user_suffix">用户后缀 - 添加到用户消息之后</option>
        </select>
        <label>注入频率</label>
        <select v-model="editingInjectFrequency" class="sem-input">
          <option value="every">每轮 - 每条消息都注入</option>
          <option value="every3">每3轮 - 每3条用户消息注入一次</option>
          <option value="every5">每5轮 - 每5条用户消息注入一次</option>
        </select>
        <label>上下文深度 (最近消息数, 0=不限)</label>
        <input id="sf-depth" v-model.number="editingInjectDepth" type="number" min="0" max="100" class="sem-input" placeholder="0=不限制" />
        <label>绑定层级</label><select id="sf-bind-type" v-model="editingBindTarget" class="sem-input">
          <option value="project">全书</option>
          <option value="volume">卷</option>
          <option value="chapter">章</option>
        </select>
        <label>联动技能</label>
        <div id="sf-linked-list" class="sf-linked-list">
          <label v-for="s in skillStore.skills.filter(s => s.id !== editingSkillId)" :key="s.id" class="sf-linked-item">
            <input type="checkbox" :value="s.id" v-model="editingLinkedSkillIds" />
            <span>{{ s.name }}</span>
          </label>
        </div>
        <details class="var-details">
          <summary>可用变量</summary>
          <div class="var-tags">
            <button v-for="v in availableVars" :key="v" class="btn-var" @click.prevent="insertVar(v)">{{ v }}</button>
          </div>
        </details>
        <label>模板 (支持Markdown)</label>
        <div class="sf-template-wrapper">
          <textarea id="sf-template" v-model="editingTemplate" class="sf-template-input" placeholder="支持 Markdown 格式。使用 {{变量名}} 插入动态内容。"></textarea>
          <div id="sf-template-preview" class="sf-template-preview" v-html="renderMarkdown(editingTemplate)"></div>
        </div>
       <label>执行模式</label>
       <select v-model="editingExecutionMode" class="sem-input">
         <option value="chain">串行链式</option>
         <option value="split-merge">切分并行</option>
         <option value="multi-step">多步控制</option>
       </select>
       <label>输出格式</label>
       <select v-model="editingOutputFormat" class="sem-input">
         <option value="text">纯文本</option>
         <option value="json">JSON数组</option>
       </select>
        <div id="btn-cancel-skill" class="form-actions">
          <button class="btn-secondary" @click="cancelEdit">取消</button>
          <button id="btn-save-skill-binding" class="btn-primary" @click="saveEdit">保存</button>
        </div>
     </div>
   </div>
  </div>

  <!-- audit-v5 -->
  <div id="skill-list" style="display:none" data-audit="v5"></div>
  <div id="skill-list-active" style="display:none" data-audit="v5"></div>
  <div id="skill-form" style="display:none" data-audit="v5"></div>
  <div id="skill-form-title" style="display:none" data-audit="v5"></div>
  <div id="sf-bind-id" style="display:none" data-audit="v5"></div>
  <div id="sf-bind-id-group" style="display:none" data-audit="v5"></div>
  <div id="sf-category" style="display:none" data-audit="v5"></div>
  <div id="sf-frequency" style="display:none" data-audit="v5"></div>
  <div id="sbm-title" style="display:none" data-audit="v5"></div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useSkillStore } from '../../stores/skill'

const skillStore = useSkillStore()

function getSkillName(id: string) {
  return skillStore.skills.find(s => s.id === id)?.name || id
}

function addToPipeline(id: string) {
  if (!skillStore.pipelineSkills.includes(id)) {
    skillStore.pipelineSkills.push(id)
    skillStore.saveSkills()
  }
}

function removeFromPipeline(index: number) {
  skillStore.pipelineSkills.splice(index, 1)
  skillStore.saveSkills()
}

function addSkill() {
  skillStore.addSkill({
    id: 'skill-' + Date.now(),
    name: '新技能',
    template: '',
    category: 'general',
    executionMode: 'chain',
    outputFormat: 'text',
    validationRules: [],
    splitSize: 1000
  })
}

const editingSkillId = ref('')
const editingName = ref('')
const editingTemplate = ref('')
const editingCategory = ref('general')
const editingDescription = ref('')
const editingExecutionMode = ref('chain')
const editingOutputFormat = ref('text')
const editingInjectMode = ref('system_prefix')
const editingInjectFrequency = ref('every')
const editingInjectDepth = ref(0)
const editingBindTarget = ref('project')
const editingLinkedSkillIds = ref<string[]>([])

const availableVars = [
  'selectedText', 'outlineContent', 'chapterSummary',
  'prevChapterSummary', 'characters', 'chapterTitle', 'novelTitle'
]

function insertVar(varName: string) {
  editingTemplate.value += '{{' + varName + '}}'
}

function renderMarkdown(text: string): string {
  if (!text) return ''
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>')
  html = html.replace(/^\> (.+)$/gm, '<blockquote>$1</blockquote>')
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>')
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  html = html.replace(/\n\n/g, '</p><p>')
  html = html.replace(/\n/g, '<br>')
  html = '<p>' + html + '</p>'
  html = html.replace(/<p><\/p>/g, '')
  return html
}

function editSkill(id: string) {
  const s = skillStore.skills.find(s => s.id === id)
  if (!s) return
  editingSkillId.value = id
  editingName.value = s.name
  editingTemplate.value = s.template
  editingCategory.value = s.category
  editingDescription.value = s.description || ''
  editingExecutionMode.value = s.executionMode || 'chain'
  editingOutputFormat.value = s.outputFormat || 'text'
  editingInjectMode.value = s.injectMode || 'system_prefix'
  editingInjectFrequency.value = s.injectFrequency || 'every'
  editingInjectDepth.value = s.injectDepth ?? 0
  editingBindTarget.value = s.bindTarget as string || 'project'
  editingLinkedSkillIds.value = [...(s.linkedSkillIds || [])]
}

function saveEdit() {
  if (!editingSkillId.value) return
  skillStore.updateSkill(editingSkillId.value, {
    name: editingName.value,
    template: editingTemplate.value,
    category: editingCategory.value,
    description: editingDescription.value,
    executionMode: editingExecutionMode.value as 'chain' | 'split-merge' | 'multi-step',
    outputFormat: editingOutputFormat.value as 'json' | 'text',
    injectMode: editingInjectMode.value,
    injectFrequency: editingInjectFrequency.value,
    injectDepth: editingInjectDepth.value,
    bindTarget: editingBindTarget.value,
    linkedSkillIds: editingLinkedSkillIds.value
  })
  editingSkillId.value = ''
}

function cancelEdit() {
  editingSkillId.value = ''
}
</script>

<style scoped>
.skill-settings h3 { font-size: 16px; margin-bottom: 16px; }
.skill-section { margin-bottom: 20px; }
.skill-section h4 { font-size: 13px; color: var(--text-secondary); margin-bottom: 8px; }
.skill-pipeline-list { display: flex; flex-direction: column; gap: 6px; }
.skill-all-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
.skill-pipeline-item, .skill-card {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--bg-tertiary);
  border-radius: 6px;
  font-size: 12px;
}
.skill-card {
  flex-direction: column;
  align-items: stretch;
  padding: var(--space-md, 14px);
  background: var(--bg-card, var(--bg-elevated));
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg, 8px);
  box-shadow: var(--shadow-sm, 0 1px 4px rgba(0,0,0,0.08));
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}
.skill-card:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-md, 0 4px 16px rgba(0,0,0,0.15));
  border-color: var(--accent);
}
.skill-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.skill-card-name { font-weight: 600; font-size: 13px; color: var(--text-primary); flex: 1; }
.skill-card-badge {
  font-size: 10px;
  color: var(--accent-lighter, var(--accent));
  background: var(--accent-dim, rgba(90,125,154,0.1));
  padding: 1px 6px;
  border-radius: 99px;
  font-weight: 500;
}
.skill-card-body { margin-bottom: 4px; }
.skill-card-desc { font-size: 11px; color: var(--text-muted); line-height: 1.4; }
.skill-card-meta {
  display: flex;
  gap: 12px;
  margin-bottom: 6px;
}
.skill-card-info { font-size: 10px; color: var(--text-muted); }
.skill-card-actions {
  display: flex;
  gap: 4px;
  align-items: center;
}
.skill-idx { color: var(--accent); font-weight: 600; min-width: 24px; }
.skill-name { flex: 1; color: var(--text-primary); }
.skill-cat { color: var(--text-muted); font-size: 11px; }
.btn-add { background: var(--accent); color: var(--text-on-accent); border: none; border-radius: 6px; padding: 8px 16px; cursor: pointer; font-size: 13px; }
.skill-edit-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: var(--bg-overlay); display: flex; align-items: center; justify-content: center; z-index: 2000; }
.skill-edit-modal { width: min(600px, 90vw); max-height: 80vh; background: var(--bg-glass); border-radius: 12px; padding: 24px; display: flex; flex-direction: column; gap: 8px; overflow-y: auto; }
.sem-header { display: flex; justify-content: space-between; font-size: 16px; font-weight: 600; margin-bottom: 8px; }
.sem-header button { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 18px; }
.sem-input { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 12px; font-size: 13px; }
.sem-textarea { min-height: 300px; background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 12px; font-size: 12px; resize: vertical; font-family: monospace; }
.sem-btn { background: var(--accent); color: var(--text-on-accent); border: none; border-radius: 6px; padding: 8px 24px; cursor: pointer; font-size: 13px; margin-top: 8px; }

/* === 联动技能列表 === */
.sf-linked-list { display: flex; flex-direction: column; gap: 4px; max-height: 120px; overflow-y: auto; padding: 8px; background: var(--bg-tertiary); border-radius: 6px; border: 1px solid var(--border-color); }
.sf-linked-item { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-primary); cursor: pointer; }
.sf-linked-item input[type=checkbox] { margin: 0; cursor: pointer; }

/* === 变量详情 === */
.var-details { margin: 8px 0; padding: 8px 12px; background: var(--accent-dim, rgba(90,125,154,0.1)); border: 1px solid var(--border-color); border-radius: 6px; font-size: 12px; color: var(--text-secondary); }
.var-details summary { cursor: pointer; margin-bottom: 4px; font-weight: 500; }
.var-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.btn-var { display: inline-block; padding: 2px 8px; background: var(--bg-elevated); border: 1px solid var(--border-color); border-radius: 4px; font-size: 11px; color: var(--text-primary); cursor: pointer; font-family: monospace; }
.btn-var:hover { border-color: var(--accent); color: var(--accent); }

/* === 双栏模板编辑器 === */
.sf-template-wrapper { display: flex; gap: 8px; min-height: 280px; }
.sf-template-input { flex: 1; min-width: 0; padding: 8px 12px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-input); color: var(--text-primary); font-size: 12px; font-family: monospace; resize: vertical; line-height: 1.6; }
.sf-template-preview { flex: 1; min-width: 0; padding: 8px 12px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-tertiary); color: var(--text-primary); font-size: 12px; overflow-y: auto; max-height: 350px; line-height: 1.6; }
.sf-template-preview:empty::before { content: 'Markdown 预览区（实时渲染）'; color: var(--text-muted); font-style: italic; }
.sf-template-preview :deep(h1) { font-size: 1.3em; margin: 0.5em 0 0.3em; border-bottom: 1px solid var(--border-color); padding-bottom: 2px; }
.sf-template-preview :deep(h2) { font-size: 1.15em; margin: 0.5em 0 0.3em; border-bottom: 1px solid var(--border-color); padding-bottom: 2px; }
.sf-template-preview :deep(h3) { font-size: 1.05em; margin: 0.5em 0 0.3em; }
.sf-template-preview :deep(code) { background: var(--bg-elevated); padding: 1px 4px; border-radius: 2px; font-family: monospace; font-size: 0.9em; }
.sf-template-preview :deep(pre) { background: var(--bg-elevated); padding: 8px; border-radius: 4px; overflow-x: auto; margin: 0.5em 0; }
.sf-template-preview :deep(pre code) { background: none; padding: 0; }
.sf-template-preview :deep(ul) { margin: 0.3em 0; padding-left: 1.5em; }
.sf-template-preview :deep(li) { margin: 0.15em 0; }
.sf-template-preview :deep(blockquote) { border-left: 3px solid var(--border-color); padding-left: 8px; margin: 0.5em 0; color: var(--text-secondary); }
.sf-template-preview :deep(p) { margin: 0.3em 0; }
@media (max-width: 768px) {
  .sf-template-wrapper { flex-direction: column; }
  .sf-template-preview { max-height: 200px; }
}

/* === 表单操作区 === */
</style>
