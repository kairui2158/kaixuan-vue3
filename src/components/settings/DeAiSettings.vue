<template>
  <div id="deai-progress-modal" class="deai-settings">
    <h3>去AI味设置</h3>

    <!-- 通用参数 -->
    <div class="deai-step-group">
      <div class="deai-step-title">通用参数</div>
      <div class="deai-common-params">
     <div class="deai-param-row">
        <div class="deai-param-item">
          <span class="deai-param-label">硬规则总开关</span>
          <button
            class="toggle-btn"
            :class="{ on: deAiStore.hardruleEnabled }"
            @click="deAiStore.hardruleEnabled = !deAiStore.hardruleEnabled; deAiStore.saveConfig()"
          >{{ deAiStore.hardruleEnabled ? 'ON' : 'OFF' }}</button>
        </div>
       <div class="deai-param-item">
         <span class="deai-param-label">处理强度</span>
          <div class="deai-radio-group">
            <label class="deai-radio-option">
              <input type="radio" value="light" v-model="deAiStore.level" @change="deAiStore.saveConfig()"> 轻度
            </label>
            <label class="deai-radio-option">
              <input type="radio" value="medium" v-model="deAiStore.level" @change="deAiStore.saveConfig()"> 中度 (推荐)
            </label>
            <label class="deai-radio-option">
              <input type="radio" value="heavy" v-model="deAiStore.level" @change="deAiStore.saveConfig()"> 重度
            </label>
          </div>
       </div>
       <div class="deai-param-item">
         <span class="deai-param-label">版本</span>
         <div class="deai-radio-group">
           <label class="deai-radio-option">
             <input type="radio" value="v2" v-model="deAiStore.version" @change="deAiStore.saveConfig()"> V2
           </label>
           <label class="deai-radio-option">
             <input type="radio" value="v3" v-model="deAiStore.version" @change="deAiStore.saveConfig()"> V3
           </label>
         </div>
       </div>
        <div class="deai-param-item">
          <span class="deai-param-label">文本类型</span>
          <div id="deai-text-type" class="deai-radio-group">
            <label class="deai-radio-option">
              <input type="radio" value="novel" v-model="deAiStore.textType" @change="deAiStore.saveConfig()"> 小说
            </label>
            <label class="deai-radio-option">
              <input type="radio" value="script" v-model="deAiStore.textType" @change="deAiStore.saveConfig()"> 剧本
            </label>
            <label class="deai-radio-option">
              <input type="radio" value="media" v-model="deAiStore.textType" @change="deAiStore.saveConfig()"> 新媒体
            </label>
          </div>
       </div>
      </div>
   </div>
   </div>

    <!-- 流程预览 -->
   <div class="deai-flow-section">
      <div class="flow-label">当前流程预览</div>
      <DeAiFlowPreview />
    </div>

    <!-- 模式卡片 -->
    <div id="deai-mode-select" class="deai-mode-cards">
      <div
        v-for="m in modes"
        :key="m.id"
        class="deai-mode-card"
        :class="{ active: deAiStore.mode === m.id }"
        @click="selectMode(m.id)"
      >
        <div class="deai-mode-card-header">
          <span class="deai-mode-card-icon">[{{ m.idx }}]</span>
          <span class="deai-mode-card-title">{{ m.name }}</span>
          <span class="deai-mode-card-desc">{{ m.shortDesc }}</span>
        </div>
        <p class="mode-full-desc">{{ m.desc }}</p>
        <div class="mode-flow" v-if="deAiStore.mode === m.id">
          <span v-for="(step, i) in m.flow" :key="i" class="deai-flow-step">{{ step }}</span>
        </div>
        <!-- 只有激活的卡片显示 body -->
        <div v-if="deAiStore.mode === m.id" :id="`deai-card-${m.id}`" class="deai-mode-card-body">
          <!-- chain 模式配置 -->
          <template v-if="m.id === 'chain'">
            <div class="form-group">
              <label>SKILL链式顺序</label>
              <div class="deai-skill-bar">
                <select v-model="selectedChainSkill" id="deai-skill-select" class="deai-param-select" @change="addDeAiSkill('chain')">
                  <option value="">选择技能...</option>
                  <option v-for="s in skillStore.skills" :key="s.id" :value="s.id">{{ s.name }}</option>
                </select>
                <button id="btn-save-deai" class="btn-primary btn-sm" @click="addDeAiSkill('chain')">添加</button>
              </div>
              <div id="deai-skills-list" class="deai-skills-list">
                <span v-for="(id, i) in deAiStore.skillIds" :key="id" class="deai-skill-chip">
                  <span>[{{ i + 1 }}] {{ getSkillName(id) }}</span>
                  <button class="deai-skill-remove" @click="removeDeAiSkill(i)">&times;</button>
                </span>
              </div>
            </div>
            <div class="form-group">
              <label>智能体（可选）</label><select id="deai-agent-select" v-model="deAiStore.agentId" class="deai-param-select" @change="deAiStore.saveConfig()">
                <option value="">不使用智能体</option>
                <option v-for="a in agentStore.agents" :key="a.id" :value="a.id">{{ a.name }}</option>
              </select>
            </div>
          </template>

          <!-- split-merge 模式配置 -->
          <template v-if="m.id === 'split-merge'">
            <div class="form-group">
              <label>切分字数（500-3000，浮动10%）</label><input id="deai-split-size" type="number" v-model.number="deAiStore.splitSize" min="500" max="3000" class="deai-split-input" @change="deAiStore.saveConfig()">
            </div>
            <div class="form-group">
              <label>输出技能（1个，所有段共用）</label>
              <div class="deai-skill-bar">
                <select v-model="selectedSplitSkill" id="deai-skill-select-sm" class="deai-param-select" @change="addDeAiSkill('split-merge')">
                  <option value="">选择技能...</option>
                  <option v-for="s in skillStore.skills" :key="s.id" :value="s.id">{{ s.name }}</option>
                </select>
              </div>
              <div id="deai-skills-list-sm" class="deai-skills-list">
                <span v-for="(id, i) in deAiStore.skillIds" :key="id" class="deai-skill-chip">
                  <span>{{ getSkillName(id) }}</span>
                  <button class="deai-skill-remove" @click="removeDeAiSkill(i)">&times;</button>
                </span>
              </div>
            </div>
            <div class="form-group">
              <label>智能体（用于切分和调度）</label><select id="deai-agent-select-sm" v-model="deAiStore.agentId" class="deai-param-select" @change="deAiStore.saveConfig()">
                <option value="">不使用智能体</option>
                <option v-for="a in agentStore.agents" :key="a.id" :value="a.id">{{ a.name }}</option>
              </select>
            </div>
          </template>

          <!-- multi-step 模式配置 -->
          <template v-if="m.id === 'multi-step'">
            <div class="form-group">
              <label>切分字数（500-3000，浮动10%）</label>
              <input id="deai-split-size-ms" type="number" v-model.number="deAiStore.splitSize" min="500" max="3000" class="deai-split-input" @change="deAiStore.saveConfig()">
            </div>
            <div class="form-group">
              <label>技能（需3个：S1A+S1B+S1C或S1+S2）</label>
              <div class="deai-skill-bar">
                <select v-model="selectedMultiSkill" id="deai-skill-select-ms" class="deai-param-select" @change="addDeAiSkill('multi-step')">
                  <option value="">选择技能...</option>
                  <option v-for="s in skillStore.skills" :key="s.id" :value="s.id">{{ s.name }}</option>
                </select>
                <button id="btn-deai-add-skill-ms" class="btn-primary btn-sm" @click="addDeAiSkill('multi-step')">添加</button>
              </div>
              <div id="deai-skills-list-ms" class="deai-skills-list">
                <span v-for="(id, i) in deAiStore.skillIds" :key="id" class="deai-skill-chip">
                  <span>[{{ i + 1 }}] {{ getSkillName(id) }}</span>
                  <button class="deai-skill-remove" @click="removeDeAiSkill(i)">&times;</button>
                </span>
              </div>
            </div>
            <div class="form-group">
              <label>智能体（用于多步调度）</label>
              <select id="deai-agent-select-ms" v-model="deAiStore.agentId" class="deai-param-select" @change="deAiStore.saveConfig()">
                <option value="">不使用智能体</option>
                <option v-for="a in agentStore.agents" :key="a.id" :value="a.id">{{ a.name }}</option>
              </select>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- 硬规则细项 -->
    <div class="deai-step-group" v-if="deAiStore.hardruleEnabled">
      <div class="deai-step-title">硬规则</div>
      <div class="deai-hardrule-toggle">
        <div id="deai-hardrule-enabled" class="toggle-label">硬规则细项（可单独开关）</div>
        <div id="deai-hardrules-list" class="deai-hardrules-list">
          <label v-for="rule in hardRulesList" :key="rule.id" class="deai-hardrule-item">
            <input
              type="checkbox"
              :checked="deAiStore.hardRules[rule.id] !== false"
              @change="toggleHardRule(rule.id)"
            >
            <span>{{ rule.name }}</span>
          </label>
        </div>
      </div>
    </div>

    <!-- 验证供应商状态 -->
    <div class="deai-step-group">
      <div class="deai-step-title">AI验证AI（跨模型审核）</div>
      <div class="config-section">
        <div id="deai-verify-provider-status" class="deai-verify-status" :class="verifyProvider ? 'configured' : 'not-configured'">
          <span class="deai-verify-icon">{{ verifyProvider ? '✓' : '○' }}</span>
          <span id="deai-verify-provider-name" class="deai-verify-name">{{ verifyProvider ? verifyProvider.name : '未配置' }}</span>
          <span id="deai-verify-provider-hint" class="deai-verify-hint">{{ verifyProvider ? (verifyProvider.selectedModel || 'auto') : '请在供应商设置中添加验证用途的供应商' }}</span>
        </div>
      </div>
    </div>

    <div class="form-actions">
      <button id="btn-deai-cancel" class="btn-secondary" @click="resetConfig">取消</button>
      <button class="btn-primary" @click="saveAllConfig">保存设置</button>
    </div>
  </div>

</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useDeAiStore } from '../../stores/deai'
import { useSkillStore } from '../../stores/skill'
import { useAgentStore } from '../../stores/agent'
import { useProviderStore } from '../../stores/provider'
import DeAiFlowPreview from '../deai/DeAiFlowPreview.vue'

const deAiStore = useDeAiStore()
const skillStore = useSkillStore()
const agentStore = useAgentStore()
const providerStore = useProviderStore()

const selectedChainSkill = ref('')
const selectedSplitSkill = ref('')
const selectedMultiSkill = ref('')

const verifyProvider = computed(() => providerStore.activeVerifyProvider)

// 20条硬规则定义，对应 de-ai.js 的 HARD_RULES
const hardRulesList = [
  { id: 'cliches', name: 'AI套话替换' },
  { id: 'connectors', name: '连接词替换' },
  { id: 'dropNames', name: '去掉句首人名' },
  { id: 'dropPronouns', name: '去掉句首他/她' },
  { id: 'mergeShort', name: '合并短句' },
  { id: 'narratorIntermediary', name: '中转词删除' },
  { id: 'causalInversion', name: '因果倒装' },
  { id: 'frameStripping', name: '框架剥离' },
  { id: 'reduceSensory', name: '压缩感官描写' },
  { id: 'templateOpening', name: '替换模板化开头' },
  { id: 'mergeShortPara', name: '合并短段落' },
  { id: 'shuffleListing', name: '打散列举模式' },
  { id: 'breakUniformity', name: '修复段落趋同' },
  { id: 'fixUniformLen', name: '修复句长趋同' },
  { id: 'rhythmVariation', name: '段落节奏变化' },
  { id: 'fixPeriods', name: '段首句号修复' },
  { id: 'breakConnectors', name: '打断连接词序列' },
  { id: 'deDiReplace', name: '的/地替换' },
  { id: 'dunhaoToComma', name: '顿号转逗号' },
  { id: 'aiFreqDetect', name: 'AI高频词检测' }
]

const modes = [
  {
    idx: 1,
    id: 'chain' as const,
    name: '串行链式',
    shortDesc: '推荐新手',
    desc: 'S1改写 -> 硬规则清洗 -> S2验证 -> 硬规则安全网。适合精度优先的场景。',
    flow: ['S1', 'hardrule', 'S2', 'safety', 'done']
  },
  {
    idx: 2,
    id: 'split-merge' as const,
    name: 'Agent调度',
    shortDesc: '速度快',
    desc: '本地切分 -> Promise.all并行重述 -> 拼接。适合速度优先的长文本。',
    flow: ['split', 'parallel', 'join', 'done']
  },
  {
    idx: 3,
    id: 'multi-step' as const,
    name: 'Multi-step',
    shortDesc: '代码控制',
    desc: '事件核提取 -> 视角偏转 -> 重组输出 -> 验证。代码控制每步，模型无法跳步。',
    flow: ['extract', 'perspective', 'reconstruct', 'verify', 'done']
  }
]

function selectMode(mode: 'chain' | 'split-merge' | 'multi-step') {
  deAiStore.setMode(mode)
}

function getSkillName(id: string) {
  return skillStore.skills.find(s => s.id === id)?.name || id
}

function addDeAiSkill(mode: 'chain' | 'split-merge' | 'multi-step') {
  const refMap = { 'chain': selectedChainSkill, 'split-merge': selectedSplitSkill, 'multi-step': selectedMultiSkill }
  const sel = refMap[mode]
  if (sel.value && !deAiStore.skillIds.includes(sel.value)) {
    deAiStore.skillIds.push(sel.value)
    deAiStore.saveConfig()
  }
  sel.value = ''
}

function removeDeAiSkill(index: number) {
  deAiStore.skillIds.splice(index, 1)
  deAiStore.saveConfig()
}

function toggleHardRule(id: string) {
  const current = deAiStore.hardRules[id]
  deAiStore.hardRules[id] = current === false ? true : false
  deAiStore.saveConfig()
}

function resetConfig() {
  deAiStore.loadConfig()
}

function saveAllConfig() {
  deAiStore.saveConfig()
}
</script>

<style scoped>
/* === 通用参数区 === */
.deai-settings h3 { font-size: 16px; margin-bottom: 16px; }
.deai-common-params {
  background: var(--bg-tertiary);
  border-radius: var(--radius-sm);
  padding: var(--space-sm) var(--space-md);
  margin-bottom: var(--space-md);
}
.deai-param-row { display: flex; flex-wrap: wrap; gap: var(--space-md); align-items: flex-end; }
.deai-param-item { display: flex; flex-direction: column; gap: 4px; }
.deai-param-label { font-size: var(--font-size-xs, 12px); color: var(--text-muted); font-weight: 500; }
.deai-param-select {
  min-width: 100px;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  background: var(--bg-elevated);
  color: var(--text-primary);
  font-size: var(--font-size-sm);
}

/* === 流程预览 === */
.deai-flow-section { margin-bottom: 16px; }
.flow-label { font-size: 12px; color: var(--text-secondary); margin-bottom: 6px; }

/* === 模式卡片 === */
.deai-mode-cards { display: flex; gap: var(--space-sm); margin-bottom: var(--space-md); }
.deai-mode-card {
  flex: 1;
  border: 2px solid var(--border-color);
  border-radius: var(--radius-sm);
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s;
  background: var(--bg-elevated);
}
.deai-mode-card:hover { border-color: var(--accent-color, var(--accent)); }
.deai-mode-card.active {
  border-color: var(--accent-color, var(--accent));
  box-shadow: 0 0 0 1px var(--accent-color, var(--accent));
}
.deai-mode-card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: var(--space-sm) var(--space-md);
  border-bottom: 1px solid var(--border-color);
}
.deai-mode-card.active .deai-mode-card-header { background: var(--bg-tertiary); }
.deai-mode-card-icon { font-weight: 700; color: var(--text-muted); font-size: var(--font-size-sm); }
.deai-mode-card.active .deai-mode-card-icon { color: var(--accent-color, var(--accent)); }
.deai-mode-card-title { font-weight: 600; color: var(--text-primary); font-size: var(--font-size-sm); }
.deai-mode-card-desc { font-size: var(--font-size-xs, 12px); color: var(--text-muted); margin-left: auto; }
.mode-full-desc { font-size: 12px; color: var(--text-secondary); margin: 8px; line-height: 1.5; }
.mode-flow { display: flex; flex-wrap: wrap; gap: 4px; padding: 0 8px 8px; }
.deai-flow-step {
  display: inline-block;
  padding: 2px 8px;
  margin: 2px;
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  color: var(--text-primary);
  font-size: 10px;
}
.deai-mode-card-body { padding: var(--space-sm) var(--space-md); }

/* === 表单组 === */
.form-group { margin-bottom: 12px; }
.form-group label { display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 4px; }
.deai-skill-bar { display: flex; gap: 8px; margin-bottom: 8px; }
.deai-split-input {
  width: 100%;
  padding: 4px 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: var(--font-size-sm);
}

/* === 技能 chip === */
.deai-skills-list { margin-bottom: 12px; }
.deai-skill-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--accent-dim);
  border: 1px solid var(--accent-glow);
  border-radius: var(--radius-lg);
  padding: var(--btn-xs-padding, 2px 8px);
  margin: 2px;
  font-size: var(--font-size-sm);
  color: var(--accent-lighter);
}
.deai-skill-chip span { color: var(--accent-lighter); font-weight: var(--fw-medium, 500); }
.deai-skill-remove {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 16px;
  padding: 0 2px;
  line-height: 1;
}
.deai-skill-remove:hover { color: var(--danger-hover); }

/* === 开关按钮 === */
.toggle-btn {
  padding: 4px 16px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  background: var(--bg-input);
  color: var(--text-muted);
  cursor: pointer;
  font-size: 12px;
}
.toggle-btn.on { background: var(--accent); color: var(--text-on-accent); border-color: var(--accent); }

/* === 硬规则细项 === */
.deai-hardrule-toggle { margin: 8px 0; }
.deai-hardrule-toggle .toggle-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
  margin-bottom: 8px;
}
.deai-hardrules-list { margin-top: 8px; padding-left: 16px; }
.deai-hardrule-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  font-size: 13px;
  color: var(--text-primary);
  cursor: pointer;
}
.deai-hardrule-item input[type=checkbox] { margin: 0; cursor: pointer; }
.deai-hardrule-item span { user-select: none; }

/* === V2/V3 单选 === */
.deai-radio-group { display: flex; flex-wrap: wrap; gap: var(--space-sm); }
.deai-radio-option {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}
.deai-radio-option input[type=radio] { cursor: pointer; }

/* === 验证供应商状态 === */
.deai-verify-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: var(--space-sm);
  border-radius: var(--radius-sm);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  font-size: var(--font-size-sm);
}
.deai-verify-icon { font-weight: 700; color: var(--text-muted); }
.deai-verify-status.configured .deai-verify-icon { color: var(--success); }
.deai-verify-status.not-configured .deai-verify-icon { color: var(--text-muted); }
.deai-verify-name { color: var(--text-primary); font-weight: 500; }
.deai-verify-hint { color: var(--text-muted); font-size: var(--font-size-xs, 12px); }

/* === 配置区 === */
.config-section { margin-bottom: 16px; }
.config-section h4 { font-size: 13px; color: var(--text-secondary); margin-bottom: 8px; }

/* === step group: border-left accent (old arch L7390-7391) === */
.deai-step-group {
  border-left: 3px solid var(--border-color);
  padding-left: var(--space-md);
  margin-bottom: var(--space-md);
}
.deai-step-title {
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: var(--space-sm);
  font-size: var(--font-size-md);
}

</style>
