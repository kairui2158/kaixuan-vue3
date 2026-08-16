import re

# Read file
c = open('src/components/pipeline/PipelinePanel.vue', 'r', encoding='utf-8').read()

# --- Step 1: Replace runStepSkills with wrapper + _runStepSkillsInner ---
idx = c.find('async function runStepSkills')
endIdx = c.find('async function', idx + 50)
if idx < 0:
    print('ERROR: runStepSkills not found')
    exit(1)

oldFunc = c[idx:endIdx]
oldBody = oldFunc[oldFunc.index('{')+1:oldFunc.rindex('}')]

newFunc = (
    'async function runStepSkills(step, prompt, timeoutMs, fallbackTemplate) {\n'
    '  const startTime = Date.now();\n'
    '  const stepName = "step-" + step;\n'
    '  const templates = getStepSkillTemplates(step)\n'
    '  const mode = getStepSkillMode(step)\n'
    '  const skillNames = templates.map((t) => t.name).filter(Boolean);\n'
    '  try {\n'
    '    const result = await _runStepSkillsInner(step, prompt, timeoutMs, fallbackTemplate);\n'
    '    execLogStore.addLog({step,stepName,mode,skillNames,prompt:(prompt||"").substring(0,500),result:(result||"").substring(0,500),duration:Date.now()-startTime,status:"success"});\n'
    '    return result;\n'
    '  } catch (e) {\n'
    '    execLogStore.addLog({step,stepName,mode,skillNames,prompt:(prompt||"").substring(0,500),result:e.message || "unknown error",duration:Date.now()-startTime,status:"failed"});\n'
    '    throw e;\n'
    '  }\n'
    '}\n'
    '\n'
    'async function _runStepSkillsInner(step, prompt, timeoutMs, fallbackTemplate) {'
    + oldBody + '}'
)

c = c[:idx] + newFunc + c[endIdx:]

# --- Step 2: Add exec log UI before </template> ---
tplIdx = c.rindex('</template>')
execLogHtml = '''
  <!-- 执行日志面板 -->
  <div class="pl-exec-log" v-if="showExecLog">
    <div class="pl-exec-log-header">
      <span>执行日志</span>
      <button class="btn-icon" @click="showExecLog = false">&times;</button>
    </div>
    <div class="pl-exec-log-body">
      <div v-for="(log, i) in execLogStore.logs" :key="log.id" class="pl-exec-log-item" :class="'pl-exec-' + log.status">
        <div class="pl-exec-log-top">
          <span class="pl-exec-step">{{ log.stepName }}</span>
          <span class="pl-exec-mode">{{ log.mode }}</span>
          <span class="pl-exec-skills">{{ log.skillNames.join(', ') }}</span>
          <span class="pl-exec-status" :class="'pl-exec-' + log.status">{{ log.status }}</span>
          <span class="pl-exec-duration">{{ log.duration }}ms</span>
          <button class="btn-icon" @click="execLogStore.removeLog(log.id)">&times;</button>
        </div>
        <div class="pl-exec-log-detail" v-if="expandedLog === log.id" @click="expandedLog = null">
          <div class="pl-exec-section"><strong>Prompt:</strong><pre>{{ log.prompt }}</pre></div>
          <div class="pl-exec-section"><strong>Result:</strong><pre>{{ log.result }}</pre></div>
          <div class="pl-exec-feedback" v-if="log.status === 'success'">
            <button class="btn-sm" @click.stop="execLogStore.setFeedback(log.id, 'up')" :class="{active: log.feedback === 'up'}">点赞</button>
            <button class="btn-sm" @click.stop="execLogStore.setFeedback(log.id, 'down')" :class="{active: log.feedback === 'down'}">点踩</button>
          </div>
        </div>
      </div>
      <div v-if="execLogStore.logs.length === 0" class="pl-exec-empty">暂无执行日志</div>
      <div class="pl-exec-actions" v-if="execLogStore.logs.length > 0">
        <button class="btn-sm btn-secondary" @click="execLogStore.clearLogs()">清空日志</button>
        <button class="btn-sm btn-secondary" @click="showSuggestions = !showSuggestions">优化建议 ({{ execLogStore.getSuggestions().length }})</button>
      </div>
      <div class="pl-exec-suggestions" v-if="showSuggestions && execLogStore.getSuggestions().length > 0">
        <div v-for="(sg, si) in execLogStore.getSuggestions()" :key="si" class="pl-exec-suggestion">
          {{ sg }}
        </div>
      </div>
    </div>
  </div>
'''
c = c[:tplIdx] + execLogHtml + c[tplIdx:]

# --- Step 3: Add exec log button to header ---
c = c.replace(
    '<button id="btn-close-pl" class="modal-close" @click="$emit(\'close\')">&times;</button>',
    '<button id="btn-close-pl" class="modal-close" @click="$emit(\'close\')">&times;</button>\n        <button class="btn-sm btn-secondary" id="btn-exec-log" @click="showExecLog = !showExecLog">执行日志</button>'
)

# --- Step 4: Add refs to script setup ---
scriptIdx = c.rindex('</script>')
setupMarker = 'const pipelineStore'
setupEnd = c.rindex(setupMarker, 0, scriptIdx)
refsBlock = (
    '\n'
    'const showExecLog = ref(false)\n'
    'const showSuggestions = ref(false)\n'
    'const expandedLog = ref<string | null>(null)\n'
)
c = c[:setupEnd] + refsBlock + c[setupEnd:]

open('src/components/pipeline/PipelinePanel.vue', 'w', encoding='utf-8').write(c)
print('OK: Phase D all changes applied')
