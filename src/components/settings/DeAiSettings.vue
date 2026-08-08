<template>
  <div class="deai-settings">
    <h3>去AI味设置</h3>

    <div class="deai-general">
      <div class="settings-row">
        <label>硬规则</label>
        <button
          class="toggle-btn"
          :class="{ on: deAiStore.hardruleEnabled }"
          @click="deAiStore.hardruleEnabled = !deAiStore.hardruleEnabled; deAiStore.saveConfig()"
        >{{ deAiStore.hardruleEnabled ? 'ON' : 'OFF' }}</button>
      </div>
      <div class="settings-row">
        <label>处理强度</label>
        <select v-model="deAiStore.level" @change="deAiStore.saveConfig()">
          <option value="light">轻度</option>
          <option value="medium">中度</option>
          <option value="heavy">重度</option>
        </select>
      </div>
      <div class="settings-row" v-if="deAiStore.mode === 'split-merge'">
        <label>切分大小</label>
        <select v-model.number="deAiStore.splitSize" @change="deAiStore.saveConfig()">
          <option :value="500">500字</option>
          <option :value="800">800字</option>
          <option :value="1000">1000字</option>
          <option :value="1500">1500字</option>
          <option :value="2000">2000字</option>
        </select>
      </div>
    </div>

    <div class="mode-cards">
      <div
        v-for="m in modes"
        :key="m.id"
        class="mode-card"
        :class="{ active: deAiStore.mode === m.id }"
        @click="selectMode(m.id)"
      >
        <div class="mode-card-header">
          <span class="mode-name">{{ m.name }}</span>
          <span class="mode-badge" v-if="m.recommended">推荐</span>
        </div>
        <p class="mode-desc">{{ m.desc }}</p>
        <div class="mode-flow">
          <span v-for="(step, i) in m.flow" :key="i" class="flow-tag">{{ step }}</span>
        </div>
      </div>
    </div>

    <div class="deai-config">
      <div class="config-section">
        <h4>去AI味技能 (按顺序执行)</h4>
        <div class="skill-list">
          <div v-for="(id, i) in deAiStore.skillIds" :key="id" class="skill-item">
            <span class="skill-idx">[{{ i + 1 }}]</span>
            <span class="skill-name">{{ getSkillName(id) }}</span>
            <button class="btn-sm btn-secondary" @click="moveDeAiSkillUp(i)" :disabled="i === 0">up</button>
            <button class="btn-sm btn-secondary" @click="moveDeAiSkillDown(i)" :disabled="i === deAiStore.skillIds.length - 1">down</button>
            <button class="btn-danger-sm" @click="removeDeAiSkill(i)">x</button>
          </div>
        </div>
        <select v-model="selectedNewSkill" class="input-field" @change="addDeAiSkill">
          <option value="">+ 添加技能</option>
          <option v-for="s in skillStore.skills" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
      </div>

      <div class="config-section">
        <h4>智能体</h4>
        <select v-model="deAiStore.agentId" class="input-field" @change="deAiStore.saveConfig()">
          <option value="">无</option>
          <option v-for="a in agentStore.agents" :key="a.id" :value="a.id">{{ a.name }}</option>
        </select>
      </div>

      <div class="config-section">
        <h4>验证供应商状态</h4>
        <div class="verify-status" :class="{ connected: !!verifyProvider }">
          {{ verifyProvider ? verifyProvider.name + ' (' + (verifyProvider.selectedModel || 'auto') + ')' : '未配置验证供应商' }}
        </div>
      </div>
    </div>

    <button class="btn-save" @click="deAiStore.saveConfig()">保存设置</button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useDeAiStore } from '../../stores/deai'
import { useSkillStore } from '../../stores/skill'
import { useAgentStore } from '../../stores/agent'
import { useProviderStore } from '../../stores/provider'

const deAiStore = useDeAiStore()
const skillStore = useSkillStore()
const agentStore = useAgentStore()
const providerStore = useProviderStore()

const selectedNewSkill = ref('')

const verifyProvider = computed(() => providerStore.activeVerifyProvider)

const modes = [
  {
    id: 'chain' as const,
    name: '串行链式',
    desc: 'S1改写 -> 硬规则清洗 -> S2验证 -> 硬规则安全网。适合精度优先的场景。',
    flow: ['S1', 'hardrule', 'S2', 'safety', 'done'],
    recommended: true
  },
  {
    id: 'split-merge' as const,
    name: 'Agent调度',
    desc: '本地切分 -> Promise.all并行重述 -> 拼接。适合速度优先的长文本。',
    flow: ['split', 'parallel', 'join', 'done'],
    recommended: false
  },
  {
    id: 'multi-step' as const,
    name: 'Multi-step',
    desc: '事件核提取 -> 视角偏转 -> 重组输出 -> 验证。代码控制每步，模型无法跳步。',
    flow: ['extract', 'perspective', 'reconstruct', 'verify', 'done'],
    recommended: false
  }
]

function selectMode(mode: 'chain' | 'split-merge' | 'multi-step') {
  deAiStore.setMode(mode)
}

function getSkillName(id: string) {
  return skillStore.skills.find(s => s.id === id)?.name || id
}

function addDeAiSkill() {
  if (selectedNewSkill.value && !deAiStore.skillIds.includes(selectedNewSkill.value)) {
    deAiStore.skillIds.push(selectedNewSkill.value)
    deAiStore.saveConfig()
  }
  selectedNewSkill.value = ''
}

function removeDeAiSkill(index: number) {
  deAiStore.skillIds.splice(index, 1)
  deAiStore.saveConfig()
}

function moveDeAiSkillUp(index: number) {
  if (index > 0) {
    const arr = deAiStore.skillIds
    ;[arr[index - 1], arr[index]] = [arr[index], arr[index - 1]]
    deAiStore.saveConfig()
  }
}

function moveDeAiSkillDown(index: number) {
  if (index < deAiStore.skillIds.length - 1) {
    const arr = deAiStore.skillIds
    ;[arr[index], arr[index + 1]] = [arr[index + 1], arr[index]]
    deAiStore.saveConfig()
  }
}
</script>

<style scoped>
.deai-settings h3 { font-size: 16px; margin-bottom: 16px; }
.deai-general { margin-bottom: 20px; }
.settings-row { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.settings-row label { width: 100px; font-size: 13px; color: var(--text-secondary); }
.toggle-btn {
  padding: 4px 16px; border-radius: 6px; border: 1px solid var(--border-color);
  background: var(--bg-input); color: var(--text-muted); cursor: pointer; font-size: 12px;
}
.toggle-btn.on { background: var(--success); color: var(--text-on-accent); border-color: var(--success); }
.settings-row select {
  background: var(--bg-input); color: var(--text-primary);
  border: 1px solid var(--border-color); border-radius: 4px;
  padding: 4px 8px; font-size: 12px; height: 28px;
}
.mode-cards { display: flex; gap: 12px; margin-bottom: 20px; }
.mode-card {
  flex: 1; padding: 16px; background: var(--bg-tertiary);
  border: 2px solid var(--border-color); border-radius: 12px;
  cursor: pointer; transition: var(--transition);
}
.mode-card:hover { border-color: var(--border-light); }
.mode-card.active { border-color: var(--accent); background: var(--bg-hover); }
.mode-card-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.mode-name { font-size: 14px; font-weight: 600; }
.mode-badge { background: var(--accent); color: var(--text-on-accent); font-size: 10px; padding: 1px 6px; border-radius: 3px; }
.mode-desc { font-size: 12px; color: var(--text-secondary); margin-bottom: 8px; line-height: 1.5; }
.mode-flow { display: flex; flex-wrap: wrap; gap: 4px; }
.flow-tag { padding: 2px 8px; background: var(--bg-input); border-radius: 3px; font-size: 10px; color: var(--text-muted); }
.deai-config { display: flex; flex-direction: column; gap: 16px; }
.config-section h4 { font-size: 13px; color: var(--text-secondary); margin-bottom: 8px; }
.skill-list { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
.skill-item { display: flex; align-items: center; gap: 4px; padding: 4px 8px; background: var(--bg-tertiary); border-radius: 4px; font-size: 12px; }
.skill-idx { color: var(--accent); font-weight: 600; min-width: 24px; }
.skill-name { flex: 1; color: var(--text-primary); }
.btn-sm { font-size: 10px; padding: 2px 6px; border-radius: 4px; height: 22px; cursor: pointer; }
.btn-secondary { background: transparent; color: var(--text-secondary); border: 1px solid var(--border-color); }
.btn-secondary:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-danger-sm { background: var(--danger); color: #fff; border: none; border-radius: 4px; padding: 2px 6px; font-size: 10px; cursor: pointer; }
.input-field { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; padding: 4px 8px; font-size: 12px; height: 28px; }
.verify-status { padding: 8px 12px; background: var(--bg-tertiary); border-radius: 6px; font-size: 12px; color: var(--text-muted); }
.verify-status.connected { color: var(--success); }
.btn-save { background: var(--accent-gradient); color: var(--text-on-accent); border: none; border-radius: 6px; padding: 8px 24px; cursor: pointer; font-size: 13px; margin-top: 16px; }
</style>
