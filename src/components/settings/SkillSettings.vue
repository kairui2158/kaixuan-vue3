<template>
  <div id="sbm-skill-list" class="skill-settings">
    <h3>技能管理</h3>
    <div class="skill-toolbar">
      <button id="btn-import-skills" class="btn-sm btn-secondary" @click="importSkills">导入 JSON</button>
      <button id="btn-export-all-skills" class="btn-sm btn-secondary" @click="exportAll">导出全部</button>
    </div>
    <div v-if="uiMessage" id="skill-ui-message" class="skill-ui-message">{{ uiMessage }}</div>
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
      <div id="skill-list" class="skill-all-list">
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
            <button class="btn-sm btn-secondary" @click="exportSkill(s.id)">导出</button>
            <button class="btn-sm btn-secondary" @click="openTest(s.id)">测试</button>
            <button class="btn-danger btn-sm" @click="skillStore.removeSkill(s.id)">删除</button>
          </div>
      </div>
      </div>
    </div>
    <button id="btn-add-skill" class="btn-add" @click="addSkill">+ 新建技能</button>
   <div v-if="editingSkillId" class="skill-edit-overlay" @click.self="cancelEdit">
     <div id="skill-form" class="skill-edit-modal">
       <div class="sem-header"><h4 id="skill-form-title">编辑技能</h4><button @click="cancelEdit">x</button></div>
       <label>名称</label><input id="sf-name" v-model="editingName" class="sem-input" />
       <label>分类</label>
       <input id="sf-category" v-model="editingCategory" class="sem-input" />
        <label>描述</label><input id="sf-desc" v-model="editingDescription" class="sem-input" placeholder="技能用途简述" />
        <label>注入模式</label><select id="sf-inject-mode" v-model="editingInjectMode" class="sem-input">
          <option value="system_prefix">系统前缀 - 追加到系统提示词之后</option>
          <option value="user_prefix">用户前缀 - 添加到用户消息之前</option>
          <option value="user_suffix">用户后缀 - 添加到用户消息之后</option>
        </select>
        <label>注入频率</label>
        <select id="sf-frequency" v-model="editingInjectFrequency" class="sem-input">
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
        <div id="sf-bind-id-group" class="sf-bind-id-group">
          <label>绑定到</label>
          <select id="sf-bind-id" v-model="editingBindId" class="sem-input">
            <option value="">选择目标...</option>
            <option v-if="editingBindTarget !== 'project'" v-for="t in bindTargetOptions" :key="t.id" :value="t.id">{{ t.name }}</option>
            <option v-else value="project">全书</option>
          </select>
        </div>
        <label>联动技能</label>
        <div id="sf-linked-list" class="sf-linked-list">
          <label v-for="s in skillStore.skills.filter(s => s.id !== editingSkillId)" :key="s.id" class="sf-linked-item">
            <input type="checkbox" :value="s.id" v-model="editingLinkedSkillIds" />
            <span>{{ s.name }}</span>
          </label>
        </div>
        <label>自定义变量</label>
        <div id="sf-custom-vars" class="sf-custom-vars">
          <div v-for="(v, i) in editingCustomVars" :key="i" class="sf-custom-var-row">
            <input :id="'sf-cv-key-' + i" v-model="v.key" class="sem-input sf-cv-key" placeholder="变量名，如 tone" />
            <input :id="'sf-cv-value-' + i" v-model="v.value" class="sem-input sf-cv-value" placeholder="变量值，如 悬疑冷峻" />
            <button class="btn-danger btn-sm" @click="removeCustomVar(i)">x</button>
          </div>
          <button id="btn-add-custom-var" class="btn-sm btn-secondary" @click="addCustomVar">+ 添加变量</button>
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
        <label>模板解析预览 (示例值)</label>
        <div id="sf-resolved-preview" class="sf-resolved-preview"><pre>{{ resolvedPreviewText || '(输入模板后点击刷新预览)' }}</pre></div>
        <button id="btn-refresh-preview" class="btn-sm btn-secondary" @click="refreshPreview">刷新解析预览</button>
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
        <div id="btn-secondary-skill" class="form-actions">
          <button class="btn-secondary" @click="cancelEdit">取消</button>
          <button id="btn-save-skill" class="btn-primary" @click="saveEdit">保存</button>
        </div>
     </div>
   </div>
   <div v-if="testSkillId" class="skill-edit-overlay" @click.self="closeTest">
     <div id="skill-test-modal" class="skill-edit-modal">
       <div class="sem-header"><h4 id="skill-test-title">技能测试: {{ getSkillName(testSkillId) }}</h4><button @click="closeTest">x</button></div>
       <label>测试文本</label>
       <textarea id="st-test-input" v-model="testText" class="sem-textarea" style="min-height: 120px;" placeholder="输入示例文本，用于验证技能输出"></textarea>
       <div class="form-actions">
         <button id="btn-run-skill-test" class="btn-primary" @click="runTest" :disabled="isTesting">{{ isTesting ? '测试中...' : '运行测试' }}</button>
         <button class="btn-secondary" @click="closeTest">关闭</button>
       </div>
       <div v-if="testError" id="st-test-error" class="st-test-error">{{ testError }}</div>
       <div v-if="testResult" id="st-test-result" class="st-test-result">{{ testResult }}</div>
     </div>
   </div>
  </div>

</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useSkillStore } from '../../stores/skill'
import { useSkillTest } from '../../composables/useSkillTest'

const skillStore = useSkillStore()
const { testResult, isTesting, testError, runSkillTest } = useSkillTest()
const uiMessage = ref('')
const testSkillId = ref('')
const testText = ref('')

function showMessage(msg: string) {
  uiMessage.value = msg
  window.setTimeout(() => {
    if (uiMessage.value === msg) uiMessage.value = ''
  }, 5000)
}

function importSkills() {
  const path = window.electronAPI.dialogOpenFile()
  if (!path) return
  const read = window.electronAPI.dialogReadFile(path)
  if (!read || !read.content) {
    showMessage('读取文件失败')
    return
  }
  const result = skillStore.importFromJSON(read.content)
  if (result.added > 0) {
    showMessage('导入成功 ' + result.added + ' 个，跳过 ' + result.skipped + ' 个')
  } else if (result.skipped > 0) {
    showMessage('全部跳过，已存在 ' + result.skipped + ' 个同名技能')
  } else {
    showMessage('未找到有效技能数据')
  }
}

function exportSkill(id: string) {
  const s = skillStore.getSkill(id)
  if (!s) return
  const md = skillStore.exportSkillToMD(id)
  const safeName = (s.name || 'skill').replace(/[\\/:*?"<>|]/g, '_')
  const filePath = window.electronAPI.dialogSaveFile(safeName + '.skill.md')
  if (!filePath) return
  const ok = window.electronAPI.dialogWriteFile(filePath, md)
  showMessage(ok ? '导出成功: ' + filePath : '导出失败')
}

function exportAll() {
  if (skillStore.skills.length === 0) {
    showMessage('暂无技能可导出')
    return
  }
  const json = skillStore.exportAllToJSON()
  const filePath = window.electronAPI.dialogSaveFile('skills-export.json')
  if (!filePath) return
  const ok = window.electronAPI.dialogWriteFile(filePath, json)
  showMessage(ok ? '导出成功: ' + filePath : '导出失败')
}

function openTest(id: string) {
  testSkillId.value = id
  testText.value = '这是一段测试文本，用于验证技能的输出效果。'
  testResult.value = ''
  testError.value = ''
}

function runTest() {
  if (!testSkillId.value) return
  runSkillTest(testSkillId.value, testText.value).then(() => {})
}

function closeTest() {
  testSkillId.value = ''
}

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
  const id = 'skill-' + Date.now();
  // 先设置 editingSkillId，确保即使 storageWrite 异常也显示表单
  editingSkillId.value = id;
  editingName.value = '新技能';
  editingTemplate.value = '';
  editingCategory.value = 'general';
  editingDescription.value = '';
  editingExecutionMode.value = 'chain';
  editingOutputFormat.value = 'text';
  editingInjectMode.value = 'system_prefix';
  editingInjectFrequency.value = 'every';
  editingInjectDepth.value = 0;
  editingBindTarget.value = 'project';
  editingLinkedSkillIds.value = [];
  editingCustomVars.value = [];
  resolvedPreviewText.value = '';
  try {
    skillStore.addSkill({
      id: id,
      name: '新技能',
      template: '',
      category: 'general',
      executionMode: 'chain',
      outputFormat: 'text',
      validationRules: [],
      splitSize: 1000
    });
  } catch (e) {
    console.error('[SkillSettings] addSkill store error:', e);
  }
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
const editingBindId = ref('')
const bindTargetOptions = ref<{ id: string, name: string }[]>([])
const editingCustomVars = ref<{ key: string, value: string }[]>([])
const resolvedPreviewText = ref('')

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
  const vars = (s.customVars || {}) as Record<string, string>
  editingCustomVars.value = Object.keys(vars).map(k => ({ key: k, value: vars[k] || '' }))
  refreshPreview()
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
    linkedSkillIds: editingLinkedSkillIds.value,
    customVars: customVarsToRecord()
  })
  editingSkillId.value = ''
}

function cancelEdit() {
  editingSkillId.value = ''
}

function addCustomVar() {
  editingCustomVars.value.push({ key: '', value: '' })
}

function removeCustomVar(index: number) {
  editingCustomVars.value.splice(index, 1)
}

function customVarsToRecord(): Record<string, string> {
  const rec: Record<string, string> = {}
  for (const row of editingCustomVars.value) {
    if (row.key && row.key.trim()) rec[row.key.trim()] = row.value || ''
  }
  return rec
}

function getPreviewDemoContext(): Record<string, any> {
  return {
    selectedText: '【示例】她推开锈蚀的铁门，风里传来旧书页的气息。',
    outlineContent: '【示例】第一卷：少年在雨夜收到父亲失踪前的信。',
    chapterSummary: '【示例】主角拆信后决定离开村子上路。',
    prevChapterSummary: '【示例】主角与师父在村口告别。',
    prevResponse: '【示例】上一轮 AI 输出结果。',
    characters: '叶青：坚韧孤僻；林晚：温柔机敏',
    chapterTitle: '第一章 雨夜来信',
    novelTitle: '《神意》',
    chapterPlot: '【示例】主角发现信中有第二张发黄的纸条。',
    ...customVarsToRecord()
  }
}

function refreshPreview() {
  const engine = (window as any).SkillExecutionEngine
  if (!engine || typeof engine.resolveTemplate !== 'function') {
    resolvedPreviewText.value = '(引擎未加载，无法预览)'
    return
  }
  resolvedPreviewText.value = engine.resolveTemplate(editingTemplate.value || '', getPreviewDemoContext(), { keepMissing: true })
}
</script>

<style scoped>
.skill-settings h3 { font-size: var(--font-size-lg); margin-bottom: 16px; }
.skill-section { margin-bottom: 20px; }
.skill-section h4 { font-size: var(--font-size-md); color: var(--text-secondary); margin-bottom: 8px; }
.skill-pipeline-list { display: flex; flex-direction: column; gap: 6px; }
.skill-all-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
.skill-pipeline-item, .skill-card {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
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
.skill-card-name { font-weight: 600; font-size: var(--font-size-lg); color: var(--text-primary); flex: 1; }
.skill-card-badge {
  font-size: var(--font-size-sm);
  color: var(--accent-lighter, var(--accent));
  background: var(--accent-dim, rgba(90,125,154,0.1));
  padding: 1px 6px;
  border-radius: 99px;
  font-weight: 500;
}
.skill-card-body { margin-bottom: 4px; }
.skill-card-desc { font-size: var(--font-size-md); color: var(--text-muted); line-height: 1.5; }
.skill-card-meta {
  display: flex;
  gap: 12px;
  margin-bottom: 6px;
}
.skill-card-info { font-size: var(--font-size-sm); color: var(--text-muted); }
.skill-card-actions {
  display: flex;
  gap: 4px;
  align-items: center;
}
.skill-idx { color: var(--accent); font-weight: 600; min-width: 24px; }
.skill-name { flex: 1; color: var(--text-primary); }
.skill-cat { color: var(--text-muted); font-size: var(--font-size-md); }
.btn-add { background: var(--accent); color: var(--text-on-accent); border: none; border-radius: var(--radius-sm); padding: 9px 18px; cursor: pointer; font-size: var(--font-size-md); }
.skill-toolbar { display: flex; gap: 8px; margin-bottom: 12px; }
.skill-ui-message { margin-bottom: 12px; padding: 9px 12px; border-radius: var(--radius-sm); background: var(--accent-dim); border: 1px solid var(--border-color); font-size: var(--font-size-md); color: var(--text-primary); }
.st-test-error { margin-top: 10px; padding: 9px 12px; border-radius: var(--radius-sm); background: rgba(220, 53, 69, 0.12); color: var(--danger, #dc3545); font-size: var(--font-size-md); }
.st-test-result { margin-top: 10px; padding: 12px; border-radius: var(--radius-sm); background: var(--bg-tertiary); border: 1px solid var(--border-color); font-size: var(--font-size-md); line-height: 1.7; white-space: pre-wrap; color: var(--text-primary); max-height: 240px; overflow-y: auto; }
.skill-edit-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: var(--bg-overlay); display: flex; align-items: center; justify-content: center; z-index: var(--z-modal-high); }
.skill-edit-modal { width: min(720px, 92vw); max-height: 84vh; background: var(--bg-glass); border-radius: var(--radius-lg); padding: 24px; display: flex; flex-direction: column; gap: 8px; overflow-y: auto; }
.sem-header { display: flex; justify-content: space-between; font-size: var(--font-size-lg); font-weight: 600; margin-bottom: 8px; }
.sem-header button { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: var(--font-size-xl); }
.sem-input { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 7px 12px; font-size: var(--font-size-md); }
.sem-textarea { min-height: 300px; background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 9px 12px; font-size: var(--font-size-md); resize: vertical; font-family: monospace; }
.sem-btn { background: var(--accent); color: var(--text-on-accent); border: none; border-radius: var(--radius-sm); padding: 9px 24px; cursor: pointer; font-size: var(--font-size-md); margin-top: 8px; }

/* === 联动技能列表 === */
.sf-linked-list { display: flex; flex-direction: column; gap: 4px; max-height: 120px; overflow-y: auto; padding: 8px; background: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-color); }
.sf-linked-item { display: flex; align-items: center; gap: 6px; font-size: var(--font-size-md); color: var(--text-primary); cursor: pointer; }
.sf-linked-item input[type=checkbox] { margin: 0; cursor: pointer; }

/* === 自定义变量 === */
.sf-custom-vars { display: flex; flex-direction: column; gap: 6px; padding: 8px; background: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-color); }
.sf-custom-var-row { display: flex; gap: 6px; align-items: center; }
.sf-cv-key { flex: 1; min-width: 0; font-family: monospace; }
.sf-cv-value { flex: 2; min-width: 0; }

/* === 模板解析预览 === */
.sf-resolved-preview { padding: 9px 12px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-input); color: var(--text-primary); font-size: var(--font-size-md); max-height: 220px; overflow-y: auto; margin-bottom: 4px; }
.sf-resolved-preview pre { margin: 0; white-space: pre-wrap; word-break: break-word; font-family: monospace; line-height: 1.6; }

/* === 变量详情 === */
.var-details { margin: 8px 0; padding: 9px 12px; background: var(--accent-dim, rgba(90,125,154,0.1)); border: 1px solid var(--border-color); border-radius: var(--radius-sm); font-size: var(--font-size-md); color: var(--text-secondary); }
.var-details summary { cursor: pointer; margin-bottom: 4px; font-weight: 500; }
.var-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.btn-var { display: inline-block; padding: 3px 8px; background: var(--bg-elevated); border: 1px solid var(--border-color); border-radius: var(--radius-xs); font-size: var(--font-size-sm); color: var(--text-primary); cursor: pointer; font-family: monospace; }
.btn-var:hover { border-color: var(--accent); color: var(--accent); }

/* === 双栏模板编辑器 === */
.sf-template-wrapper { display: flex; gap: 8px; min-height: 280px; }
.sf-template-input { flex: 1; min-width: 0; padding: 9px 12px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-input); color: var(--text-primary); font-size: var(--font-size-md); font-family: monospace; resize: vertical; line-height: 1.6; }
.sf-template-preview { flex: 1; min-width: 0; padding: 9px 12px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-tertiary); color: var(--text-primary); font-size: var(--font-size-md); overflow-y: auto; max-height: 350px; line-height: 1.6; }
.sf-template-preview:empty::before { content: 'Markdown 预览区（实时渲染）'; color: var(--text-muted); font-style: italic; }
.sf-template-preview :deep(h1) { font-size: 1.3em; margin: 0.5em 0 0.3em; border-bottom: 1px solid var(--border-color); padding-bottom: 2px; }
.sf-template-preview :deep(h2) { font-size: 1.15em; margin: 0.5em 0 0.3em; border-bottom: 1px solid var(--border-color); padding-bottom: 2px; }
.sf-template-preview :deep(h3) { font-size: 1.05em; margin: 0.5em 0 0.3em; }
.sf-template-preview :deep(code) { background: var(--bg-elevated); padding: 1px 4px; border-radius: var(--radius-xs); font-family: monospace; font-size: 0.9em; }
.sf-template-preview :deep(pre) { background: var(--bg-elevated); padding: 8px; border-radius: var(--radius-xs); overflow-x: auto; margin: 0.5em 0; }
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

