<template>
  <div id="pipeline-panel" class="pl-overlay" @click.self="$emit('close')">
    <div class="pl-content">
      <div class="pl-header">
        <span>生成流水线</span>
        <button id="btn-close-pl" class="modal-close" @click="$emit('close')">&times;</button>
        <button class="btn-sm btn-secondary" id="btn-exec-log" @click="showExecLog = !showExecLog">执行日志</button>
      </div>
      <div class="pl-body">
        <div class="pl-steps" id="pl-steps">
          <div
            v-for="(step, i) in stepsWithIds"
            :key="i"
            class="pl-step"
            :class="{ active: pipelineStore.currentStep === i, completed: step.completed }"
            @click="pipelineStore.setStep(i)"
          >
            <span class="pl-step-num">{{ i + 1 }}</span>
            <span class="pl-step-label">{{ step.name }}</span>
            <span v-if="step.completed" class="pl-step-check">&#10003;</span>
          </div>
        </div>
        
        
        

        <div class="pl-content-right">

        <div class="pl-tools-section" style="padding: 8px 0; margin-bottom: 12px; border-bottom: 1px solid var(--border-color);">
          <div class="pl-tools-grid" style="display: flex; flex-wrap: wrap; gap: 6px; align-items: center;">
            <span class="pl-label pl-tools-label">AI工具:</span>
            <button id="btn-ai-names" class="btn-sm btn-secondary" @click="toolAction('names')" :disabled="aiLoading">AI起名</button>
            <button id="btn-writing-rules" class="btn-sm btn-secondary" @click="toolAction('rules')" :disabled="aiLoading">写作规则</button>
            <button id="btn-timeline" class="btn-sm btn-secondary" @click="toolAction('timeline')" :disabled="aiLoading">时间线</button>
            <button id="btn-batch-review" class="btn-sm btn-secondary" @click="toolAction('review')" :disabled="aiLoading">批量审阅</button>
            <button id="btn-revise" class="btn-sm btn-secondary" @click="toolAction('revise')" :disabled="aiLoading">章节修订</button>
            <button id="btn-translate" class="btn-sm btn-secondary" @click="toolAction('translate')" :disabled="aiLoading">翻译</button>
            <button id="btn-style-convert" class="btn-sm btn-secondary" @click="toolAction('style')" :disabled="aiLoading">风格转换</button>
            <button id="btn-regenerate" class="btn-sm btn-secondary" @click="toolAction('regenerate')" :disabled="aiLoading">重新生成</button>
            <button id="btn-modify" class="btn-sm btn-secondary" @click="toolAction('modify')" :disabled="aiLoading">按指令修改</button>
          </div>
          <div class="pl-tool-result" v-if="toolResult" style="margin-top: 6px; padding: 6px 10px; background: var(--bg-input); border: 1px solid var(--border-color); border-radius: 6px; font-size: 12px; color: var(--text-primary); max-height: 60px; overflow-y: auto;">{{ toolResult }}</div>
          <div class="pl-tool-loading" v-if="aiLoading" style="margin-top: 4px; font-size: 12px; color: var(--accent);">{{ aiLoadingText }}</div>
        </div>
          <div v-show="pipelineStore.currentStep === 0" id="pl-step-1-content" class="pl-step-panel">
            <h3>大纲</h3>
          <div class="pl-step-tools">
            <div class="pl-agent-mode-bar">
              <span class="pl-label">本层智能体:</span>
              <select id="pl-s1-agent" v-model="stepAgents[0]" class="pl-select pl-agent-select" @change="saveStepConfig">
                <option value="">不使用智能体</option>
                <option v-for="a in agentStore.agents" :key="a.id" :value="a.id">{{ a.name }}</option>
              </select>
              <span class="pl-mode-label">Skill模式:</span>
              <select id="pl-s1-mode" v-model="stepSkillModes[0]" class="pl-select pl-mode-select" @change="saveStepConfig">
                <option value="compose">组合（一次调用）</option>
                <option value="chain">串行（多次调用）</option>
                <option value="split-merge">拆分合并（分块处理）</option>
                <option value="multi-step">多步（3-4步多阶段）</option>
              </select>
            </div>
            <div class="pl-skill-bar">
              <span class="pl-label">Skill:</span>
              <select id="pl-s1-skill" v-model="stepSkillSelect[1]" class="pl-select" @change="addStepSkill(1)">
                <option value="">无</option>
                <option v-for="s in skillStore.skills" :key="s.id" :value="s.id">{{ s.name }}</option>
              </select>
              <button class="btn-icon" id="pl-s1-add-skill" title="添加Skill" @click="addStepSkill(1)">+</button>
            </div>
          </div>
          <div id="pl-s1-skills-list" class="pl-skills-list">
            <template v-for="(sid, si) in stepSkills[0]" :key="si">
              <span v-if="sid" class="pl-skill-chip">
                <span>{{ getSkillName(sid) }}</span>
                <button class="btn-icon pl-chip-close" title="移除" @click="removeStepSkill(1, si)">&times;</button>
              </span>
            </template>
          </div>
            <p class="pl-desc">第一步：输入或粘贴小说大纲全文。AI将基于此生成后续内容。</p>
            <textarea id="pl-outline" v-model="projectStore.outlineText" class="pl-textarea" placeholder="输入或粘贴大纲全文..." :readonly="projectStore.outlineLocked" :class="{ &apos;pl-readonly&apos;: projectStore.outlineLocked }"></textarea>
            <div class="pl-gen-options">
              <label>全书字数（万字）：</label>
              <input id="pl-book-word-count" type="number" v-model.number="bookWordCount" min="0" max="1000" class="input-w-60" @change="saveBookWordCount" />
            </div>
            <div class="pl-actions">
              <button class="btn-secondary" @click="saveOutline" :disabled="projectStore.outlineLocked">保存大纲</button>
              <button class="btn-primary" @click="lockOutline" :disabled="!projectStore.hasOutline">锁定大纲</button>
              <button id="btn-pl-confirm-outline" class="btn-secondary" @click="confirmStep(0)" :disabled="!projectStore.hasOutline">确认完成</button>
            </div>
          </div>
          <div v-show="pipelineStore.currentStep === 1" id="pl-step-2-content" class="pl-step-panel">
            <h3>设定</h3>
          <div class="pl-step-tools">
            <div class="pl-agent-mode-bar">
              <span class="pl-label">本层智能体:</span>
              <select id="pl-s2-agent" v-model="stepAgents[1]" class="pl-select pl-agent-select" @change="saveStepConfig">
                <option value="">不使用智能体</option>
                <option v-for="a in agentStore.agents" :key="a.id" :value="a.id">{{ a.name }}</option>
              </select>
              <span class="pl-mode-label">Skill模式:</span>
              <select id="pl-s2-mode" v-model="stepSkillModes[1]" class="pl-select pl-mode-select" @change="saveStepConfig">
                <option value="compose">组合（一次调用）</option>
                <option value="chain">串行（多次调用）</option>
                <option value="split-merge">拆分合并（分块处理）</option>
                <option value="multi-step">多步（3-4步多阶段）</option>
              </select>
            </div>
            <div class="pl-skill-bar">
              <span class="pl-label">Skill:</span>
              <select id="pl-s2-skill" v-model="stepSkillSelect[2]" class="pl-select" @change="addStepSkill(2)">
                <option value="">无</option>
                <option v-for="s in skillStore.skills" :key="s.id" :value="s.id">{{ s.name }}</option>
              </select>
              <button class="btn-icon" id="pl-s2-add-skill" title="添加Skill" @click="addStepSkill(2)">+</button>
            </div>
          </div>
          <div id="pl-s2-skills-list" class="pl-skills-list">
            <template v-for="(sid, si) in stepSkills[1]" :key="si">
              <span v-if="sid" class="pl-skill-chip">
                <span>{{ getSkillName(sid) }}</span>
                <button class="btn-icon pl-chip-close" title="移除" @click="removeStepSkill(2, si)">&times;</button>
              </span>
            </template>
          </div>
            <p class="pl-desc">第二步：基于大纲，AI自动生成设定。设定可编辑和新增。</p>
            <div id="pl-bound-settings-list" class="pl-settings-list">
              <div v-for="(s, i) in projectStore.settings" :key="i" class="pl-setting-item">
                <input v-model="s.name" class="pl-input" placeholder="名称" />
                <select v-model="s.category" class="pl-input-sm">
                  <option>世界观规则</option><option>地理环境</option><option>势力阵营</option>
                  <option>技术体系</option><option>魔法体系</option><option>社会结构</option>
                  <option>物品道具</option><option>历史事件</option><option>其他</option>
                </select>
                <textarea v-model="s.attrsText" class="pl-attrs-input" placeholder="属性内容"></textarea>
                <button class="btn-danger btn-sm" @click="removeSetting(i)">删除</button>
              </div>
            </div>
    <div class="pl-actions">
      <button class="btn-secondary" @click="openAddSettingModal">+ 新增设定</button>
      <button id="btn-pl-gen-settings" class="btn-primary" @click="genSettings" :disabled="pipelineStore.isGenerating || !projectStore.hasOutline">
        {{ pipelineStore.isGenerating ? 'AI生成中...' : 'AI生成设定' }}
      </button>
              <button id="btn-pl-save-settings" class="btn-secondary" @click="projectStore.saveProject()">保存设定到合集</button>
              <button id="btn-pl-confirm-settings" class="btn-secondary" @click="confirmStep(1)" :disabled="projectStore.settings.length === 0">确认完成</button>
            </div>
          </div>
          <div v-show="pipelineStore.currentStep === 2" id="pl-step-3-content" class="pl-step-panel">
            <h3>卷纲</h3>
          <div class="pl-step-tools">
            <div class="pl-agent-mode-bar">
              <span class="pl-label">本层智能体:</span>
              <select id="pl-s3-agent" v-model="stepAgents[2]" class="pl-select pl-agent-select" @change="saveStepConfig">
                <option value="">不使用智能体</option>
                <option v-for="a in agentStore.agents" :key="a.id" :value="a.id">{{ a.name }}</option>
              </select>
              <span class="pl-mode-label">Skill模式:</span>
              <select id="pl-s3-mode" v-model="stepSkillModes[2]" class="pl-select pl-mode-select" @change="saveStepConfig">
                <option value="chain">串行（多次调用）</option>
                <option value="split-merge">拆分合并（分块处理）</option>
                <option value="multi-step">多步（3-4步多阶段）</option>
                <option value="compose">组合（一次调用）</option>
              </select>
            </div>
            <div class="pl-skill-bar">
              <span class="pl-label">Skill:</span>
              <select id="pl-s3-skill" v-model="stepSkillSelect[3]" class="pl-select" @change="addStepSkill(3)">
                <option value="">无</option>
                <option v-for="s in skillStore.skills" :key="s.id" :value="s.id">{{ s.name }}</option>
              </select>
              <button class="btn-icon" id="pl-s3-add-skill" title="添加Skill" @click="addStepSkill(3)">+</button>
            </div>
          </div>
          <div id="pl-s3-skills-list" class="pl-skills-list">
            <template v-for="(sid, si) in stepSkills[2]" :key="si">
              <span v-if="sid" class="pl-skill-chip">
                <span>{{ getSkillName(sid) }}</span>
                <button class="btn-icon pl-chip-close" title="移除" @click="removeStepSkill(3, si)">&times;</button>
              </span>
            </template>
          </div>
            <p class="pl-desc">第三步：基于大纲和设定，AI自动生成卷纲。每卷的概要可编辑。</p>
            <div id="pl-volume-config" class="pl-vol-config">
              <label>每卷字数</label>
              <input type="number" v-model.number="volumeWords" class="pl-input-sm" min="10000" step="10000" @change="saveVolumeConfig" />
              <label>卷数</label>
              <input id="pl-volume-count" type="number" :value="linkedVolumeCount" class="input-w-60" min="1" max="20" :readonly="bookWordCount > 0" @change="syncVolumeCount($event)" />
              <span v-if="bookWordCount > 0" class="pl-gen-hint">全书 {{ bookWordCount }} 万字自动分配</span>
            </div>
            <div id="pl-vol-list" class="pl-vol-list">
              <div v-for="(vol, i) in projectStore.volumes" :key="i" class="pl-vol-card" :class="{ confirmed: vol.confirmed }">
                <div class="pl-vol-header">
                  <input v-model="vol.name" class="pl-input" placeholder="卷名" @change="projectStore.saveProject()" />
                  <span class="vol-words">{{ vol.suggestedWords || '?' }} 字</span>
                </div>
                <textarea v-model="vol.outline" class="pl-vol-outline" placeholder="卷纲要" @change="projectStore.saveProject()"></textarea>
                <input v-model="vol.summary" class="pl-input" placeholder="摘要" @change="projectStore.saveProject()" />
              </div>
            </div>
            <div class="pl-actions">
              <button id="btn-pl-gen-volumes" class="btn-primary" @click="genVolumes('auto')" :disabled="pipelineStore.isGenerating">AI生成全卷</button>
              <button id="btn-pl-gen-single-volume" class="btn-secondary" @click="genVolumes('single')" :disabled="pipelineStore.isGenerating">逐卷生成</button>
              <button id="btn-pl-create-volumes" class="btn-secondary" @click="genVolumes('auto')" :disabled="pipelineStore.isGenerating">自动生成卷纲</button>
              <button id="btn-pl-continue-volumes" class="btn-secondary" @click="genVolumes('continue')" :disabled="pipelineStore.isGenerating">批量续生成</button>
              <button id="btn-pl-confirm-volumes" class="btn-secondary" @click="confirmStep(2)" :disabled="projectStore.volumes.length === 0">确认完成</button>
            </div>
          </div>
          <div v-show="pipelineStore.currentStep === 3" id="pl-step-4-content" class="pl-step-panel">
            <h3>章节</h3>
          <div class="pl-step-tools">
            <div class="pl-agent-mode-bar">
              <span class="pl-label">本层智能体:</span>
              <select id="pl-s4-agent" v-model="stepAgents[3]" class="pl-select pl-agent-select" @change="saveStepConfig">
                <option value="">不使用智能体</option>
                <option v-for="a in agentStore.agents" :key="a.id" :value="a.id">{{ a.name }}</option>
              </select>
              <span class="pl-mode-label">Skill模式:</span>
              <select id="pl-s4-mode" v-model="stepSkillModes[3]" class="pl-select pl-mode-select" @change="saveStepConfig">
                <option value="chain">串行（多次调用）</option>
                <option value="split-merge">拆分合并（分块处理）</option>
                <option value="multi-step">多步（3-4步多阶段）</option>
                <option value="compose">组合（一次调用）</option>
              </select>
            </div>
            <div class="pl-skill-bar">
              <span class="pl-label">Skill:</span>
              <select id="pl-s4-skill" v-model="stepSkillSelect[4]" class="pl-select" @change="addStepSkill(4)">
                <option value="">无</option>
                <option v-for="s in skillStore.skills" :key="s.id" :value="s.id">{{ s.name }}</option>
              </select>
              <button class="btn-icon" id="pl-s4-add-skill" title="添加Skill" @click="addStepSkill(4)">+</button>
            </div>
          </div>
          <div id="pl-s4-skills-list" class="pl-skills-list">
            <template v-for="(sid, si) in stepSkills[3]" :key="si">
              <span v-if="sid" class="pl-skill-chip">
                <span>{{ getSkillName(sid) }}</span>
                <button class="btn-icon pl-chip-close" title="移除" @click="removeStepSkill(4, si)">&times;</button>
              </span>
            </template>
          </div>
            <p class="pl-desc">第四步：为每个章节生成剧情点。剧情点可编辑。</p>
            <div id="pl-ch-gen-bar" class="pl-ch-config">
              <label>每章字数</label>
              <input id="pl-chapter-wordcount" type="number" class="input-w-80" v-model.number="chapterWords" min="1000" step="500" @change="saveVolumeConfig" />
              <label>选择卷</label>
              <select v-model.number="selectedVolumeIndex" class="pl-input-sm">
                <option v-for="(vol, i) in projectStore.volumes" :key="i" :value="i">{{ vol.name }}</option>
              </select>
              <label>预计章数</label>
              <span id="pl-ch-est-count" class="pl-gen-hint">{{ estimatedChapters }}</span>
            </div>
            <div id="pl-ch-cards-area" class="pl-ch-list">
              <div v-for="(ch, i) in currentVolumeChapters" :key="i" class="pl-ch-card">
                <div class="pl-ch-card-main">
                  <div class="pl-ch-card-head">
                    <span class="ch-title">{{ ch.title }}</span>
                    <button class="btn-sm btn-secondary" @click="genBody(selectedVolumeIndex, i)" :disabled="pipelineStore.isGenerating">生成正文</button>
                  </div>
                  <textarea v-model="ch.plot" class="pl-ch-plot" placeholder="本章剧情点概要"></textarea>
                </div>
              </div>
              <p id="pl-ch-empty-hint" v-if="currentVolumeChapters.length === 0" class="empty-hint">暂无章节，请先生成</p>
            </div>
            <div class="pl-actions">
              <button id="btn-pl-gen-chapters" class="btn-primary" @click="genChapters" :disabled="pipelineStore.isGenerating">AI生成章节</button>
              <button id="btn-pl-autogen-chapters" class="btn-secondary" @click="genChapters" :disabled="pipelineStore.isGenerating">自动生成章节</button>
              <button id="btn-pl-confirm-chapters" class="btn-secondary" @click="confirmStep(3)" :disabled="currentVolumeChapters.length === 0">确认完成</button>
            </div>
          </div>
          <div v-show="pipelineStore.currentStep === 4" id="pl-step-5-content" class="pl-step-panel">
            <h3>正文</h3>
          <div class="pl-step-tools">
            <div class="pl-agent-mode-bar">
              <span class="pl-label">本层智能体:</span>
              <select id="pl-s5-agent" v-model="stepAgents[4]" class="pl-select pl-agent-select" @change="saveStepConfig">
                <option value="">不使用智能体</option>
                <option v-for="a in agentStore.agents" :key="a.id" :value="a.id">{{ a.name }}</option>
              </select>
              <span class="pl-mode-label">Skill模式:</span>
              <select id="pl-s5-mode" v-model="stepSkillModes[4]" class="pl-select pl-mode-select" @change="saveStepConfig">
                <option value="compose">组合（一次调用）</option>
                <option value="chain">串行（多次调用）</option>
                <option value="split-merge">拆分合并（分块处理）</option>
                <option value="multi-step">多步（3-4步多阶段）</option>
              </select>
            </div>
            <div class="pl-skill-bar">
              <span class="pl-label">Skill:</span>
              <select id="pl-s5-skill" v-model="stepSkillSelect[5]" class="pl-select" @change="addStepSkill(5)">
                <option value="">无</option>
                <option v-for="s in skillStore.skills" :key="s.id" :value="s.id">{{ s.name }}</option>
              </select>
              <button class="btn-icon" id="pl-s5-add-skill" title="添加Skill" @click="addStepSkill(5)">+</button>
            </div>
          </div>
          <div id="pl-s5-skills-list" class="pl-skills-list">
            <template v-for="(sid, si) in stepSkills[4]" :key="si">
              <span v-if="sid" class="pl-skill-chip">
                <span>{{ getSkillName(sid) }}</span>
                <button class="btn-icon pl-chip-close" title="移除" @click="removeStepSkill(5, si)">&times;</button>
              </span>
            </template>
          </div>
            <p class="pl-desc">第五步：选择章节，AI自动生成正文。</p>
            <div id="pl-context-summary" class="pl-body-config">
              <label>选择卷</label>
                <select v-model.number="bodyVolumeIndex" class="pl-input-sm" @change="bodyChapterIndex = 0">
                <option v-for="(vol, i) in projectStore.volumes" :key="i" :value="i">{{ vol.name }}</option>
              </select>
              <label>选择章节</label>
              <select v-model.number="bodyChapterIndex" class="pl-input-sm">
                <option v-for="(ch, i) in bodyVolumeChapters" :key="i" :value="i">{{ ch.title }}</option>
              </select>
            </div>
            <div id="pl-body-result" class="pl-body-result" v-if="currentBodyContent || bodyResult">
              <div class="pl-body-text">{{ currentBodyContent || bodyResult }}</div>
            </div>
            <div class="pl-actions">
              <button id="btn-pl-gen-body" class="btn-primary" @click="genBodyForSelected" :disabled="pipelineStore.isGenerating">
                {{ pipelineStore.isGenerating ? '生成中...' : 'AI生成正文' }}
              </button>
              <button id="btn-pl-insert-body" class="btn-secondary" @click="insertToEditor" :disabled="!(currentBodyContent || bodyResult)">插入到编辑器</button>
              <button id="btn-pl-confirm-body" class="btn-secondary" @click="confirmStep(4)" :disabled="!(currentBodyContent || bodyResult)">确认完成</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div v-if="showAddSettingModal" class="pl-add-setting-overlay" >
    <div class="pl-add-setting-modal">
      <div class="pl-add-setting-header">
        <span>新增设定</span>
        <button class="modal-close" @click="cancelAddSetting">&times;</button>
      </div>
      <div class="pl-add-setting-body">
        <label>名称</label>
        <input v-model="newSettingName" class="pl-input" placeholder="设定名称" />
        <label>分类</label>
        <select v-model="newSettingCategory" class="pl-input-sm">
          <option>世界观规则</option><option>地理环境</option><option>势力阵营</option>
          <option>技术体系</option><option>魔法体系</option><option>社会结构</option>
          <option>物品道具</option><option>历史事件</option><option>其他</option>
        </select>
        <label>属性内容</label>
        <textarea v-model="newSettingAttrs" class="pl-attrs-input" placeholder="输入设定属性内容"></textarea>
      </div>
      <div class="pl-add-setting-footer">
        <button class="btn-secondary" @click="cancelAddSetting">取消</button>
        <button class="btn-primary" @click="confirmAddSetting" :disabled="!newSettingName.trim()">保存</button>
      </div>
    </div>
  </div>

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
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue"
import { usePipelineStore } from "../../stores/pipeline"
import { useProjectStore } from "../../stores/project"
import { useProviderStore } from "../../stores/provider"
import { useSkillStore } from "../../stores/skill"
import { useAgentStore } from "../../stores/agent"
import { useEditorStore } from "../../stores/editor"
import { useExecutionLogStore } from "../../stores/executionLog"
import { useAiTools } from "../../composables/useAiTools"
import { storageKey } from "../../utils/storage-key"

defineEmits<{ close: [] }>()


const showExecLog = ref(false)
const showSuggestions = ref(false)
const expandedLog = ref<string | null>(null)
const pipelineStore = usePipelineStore()
const projectStore = useProjectStore()
const providerStore = useProviderStore()
const skillStore = useSkillStore()
const agentStore = useAgentStore()
const editorStore = useEditorStore()
const execLogStore = useExecutionLogStore()

const { generateNames, generateWritingRules, extractTimeline, batchReviewChapters, reviseChapter, translateText, convertStyle, regenerateContent, modifyContent, isLoading: aiLoading, loadingText: aiLoadingText } = useAiTools()

const toolResult = ref("")
const showAddSettingModal = ref(false)
const newSettingName = ref("")
const newSettingCategory = ref("其他")
const newSettingAttrs = ref("")
const volumeWords = ref(100000)
const chapterWords = ref(3500)
const bookWordCount = ref(0)
const volumeCount = ref(3)
const chapterBatchSize = ref(5)
const selectedVolumeIndex = ref(0)
const bodyVolumeIndex = ref(0)
const bodyChapterIndex = ref(0)
const bodyResult = ref("")
const styleTags = ref("")
const pacingParams = ref("")
const outlineAnalyzed = ref(false)
const stepAgents = ref<Record<number, string>>({ 0: "", 1: "", 2: "", 3: "", 4: "" })
const stepSkills = ref<Record<number, string[]>>({ 0: ["", "", "", "", ""], 1: ["", "", "", "", ""], 2: ["", "", "", "", ""], 3: ["", "", "", "", ""], 4: ["", "", "", "", ""] })
const stepSkillSelect = ref<Record<number, string>>({ 1: "", 2: "", 3: "", 4: "", 5: "" })
const stepSkillModes = ref<Record<number, string>>({ 0: "compose", 1: "compose", 2: "chain", 3: "chain", 4: "compose" })

const steps = ref([
  { name: "大纲", completed: false },
  { name: "设定", completed: false },
  { name: "卷纲", completed: false },
  { name: "章节", completed: false },
  { name: "正文", completed: false }
])

// 为 steps 添加 ID 属性
const stepsWithIds = computed(() => {
  return steps.value.map((s, i) => ({
    ...s,
    id: "pl-status-" + (i + 1)
  }))
})

const estimatedChapters = computed(() => {
  const vol = projectStore.volumes[selectedVolumeIndex.value]
  if (!vol) return 0
  const words = vol.suggestedWords || volumeWords.value
  return Math.ceil(words / chapterWords.value)
})

const currentVolumeChapters = computed(() => {
  const vol = projectStore.volumes[selectedVolumeIndex.value]
  if (!vol) return []
  const volId = vol.id || vol.name
  return projectStore.chapters[volId] || []
})

// Book word count (wan) x 10000 / per-volume words => volume count, auto-linked
const linkedVolumeCount = computed(() => {
  const totalWords = Math.max(bookWordCount.value * 10000, 0)
  const perVol = Math.max(volumeWords.value, 10000)
  if (totalWords <= 0) return volumeCount.value
  const result = Math.ceil(totalWords / perVol)
  return Math.max(1, Math.min(20, result))
})

function syncVolumeCount(e: any) {
  const val = Number(e.target.value)
  if (!isNaN(val) && val >= 1 && val <= 20) {
    volumeCount.value = val
  } else {
    e.target.value = linkedVolumeCount.value
  }
}

// Auto-sync volume count whenever book word count or per-volume words change.
watch(
  () => [bookWordCount.value, volumeWords.value],
  () => {
    if (bookWordCount.value > 0) {
      volumeCount.value = linkedVolumeCount.value
    }
  }
)

const bodyVolumeChapters = computed(() => {
  const vol = projectStore.volumes[bodyVolumeIndex.value]
  if (!vol || !vol.name) return []
  const volId = vol.id || vol.name
  return (projectStore.chapters && projectStore.chapters[volId]) || []
})

// Persistent body text for the currently selected chapter in the body stage.
const currentBodyContent = computed(() => {
  const vol = projectStore.volumes[bodyVolumeIndex.value]
  if (!vol) return ''
  const volId = vol.id || vol.name
  const chs = projectStore.chapters[volId] || []
  const ch = chs[bodyChapterIndex.value]
  return ch?.body || ''
})

function saveStepConfig() {
  window.electronAPI.storageWrite(storageKey("pipeline_step_config"), {
    agents: JSON.parse(JSON.stringify(stepAgents.value)),
    skills: JSON.parse(JSON.stringify(stepSkills.value)),
    modes: JSON.parse(JSON.stringify(stepSkillModes.value))
  })
}

function saveBookWordCount() {
  const wan = Number(bookWordCount.value)
  if (!isNaN(wan) && wan > 0) {
    window.electronAPI.storageWrite(
      storageKey("pipeline_step_config"),
      Object.assign(
        window.electronAPI.storageRead(storageKey("pipeline_step_config")) || {},
        { bookWordCount: Math.round(wan * 10000) }
      )
    )
  }
}

function saveVolumeConfig() {
  window.electronAPI.storageWrite(
    storageKey("pipeline_step_config"),
    Object.assign(
      window.electronAPI.storageRead(storageKey("pipeline_step_config")) || {},
      {
        volumeWords: Number(volumeWords.value) || 0,
        chapterWords: Number(chapterWords.value) || 0
      }
    )
  )
}

function getStepSkillIds(step: number): string[] {
  const stepSlot = stepSkills.value[step]
  if (stepSlot && stepSlot.length > 0) {
    const ids = stepSlot.filter(Boolean)
    if (ids.length > 0) return ids
  }
  const stored = pipelineStore.getStepSkills(step)
  if (stored && stored.length > 0) return [...stored]
  const fallback = skillStore.orderedPipelineSkills
  const idx = step
  if (fallback.length > 0 && idx >= 0 && idx < fallback.length && fallback[idx]) {
    return [fallback[idx].id]
  }
  return []
}

function getStepSkillTemplates(step: number): Array<{ id: string; name: string; template: string; customVars?: Record<string, string> }> {
  const ids = getStepSkillIds(step)
  const templates: Array<{ id: string; name: string; template: string; customVars?: Record<string, string> }> = []
  for (const sid of ids) {
    const s = skillStore.getSkill(sid)
    if (s && s.template) templates.push({ id: s.id, name: s.name, template: s.template, customVars: s.customVars || {} })
  }
  return templates
}

function getStepSkillTemplate(step: number): string {
  const templates = getStepSkillTemplates(step)
  return templates.map((t) => t.template).join("\n\n")
}

function getStepAgentId(step: number): string {
  return stepAgents.value[step] || ""
}

function getStepSkillMode(step: number): string {
  return stepSkillModes.value[step] || "compose"
}

function buildTemplateContext(step: number, prompt: string, prevResponse?: string): Record<string, any> {
  const vol = projectStore.volumes[selectedVolumeIndex.value] || null
  const volId = vol ? (vol.id || vol.name) : ""
  const chs = volId ? (projectStore.chapters[volId] || []) : []
  const selectedCh = chs[bodyChapterIndex.value] || chs[0] || null
  const chIdx = selectedCh ? Math.max(0, chs.indexOf(selectedCh)) : -1
  const prevCh = chIdx > 0 ? chs[chIdx - 1] : null
  const characterSettings = projectStore.settings.filter((s: any) => String(s.category || "").includes("人物"))
  const characters = characterSettings.map((s: any) => {
    const attrs = s.attrs && typeof s.attrs === "object"
      ? Object.keys(s.attrs).map((k: string) => k + ": " + String(s.attrs[k] ?? "")).join("; ")
      : String(s.attrsText || "")
    return (s.name || "") + (attrs ? "（" + attrs + "）" : "")
  }).join("；")
  return {
    selectedText: prompt,
    userPrompt: prompt,
    outlineContent: projectStore.outlineText || "",
    novelTitle: projectStore.projectName || "",
    volumeCount: projectStore.volumes.length || volumeCount.value,
    wordsPerVolume: volumeWords.value || "",
    chapterCount: chs.length,
    wordsPerChapter: chapterWords.value || "",
    styleTags: styleTags.value || "",
    pacingParams: pacingParams.value || "",
    volumeOutline: vol ? (vol.outline || vol.summary || "") : "",
    chapterTitle: selectedCh ? (selectedCh.title || "") : "",
    chapterSummary: selectedCh ? (selectedCh.summary || selectedCh.plot || "") : "",
    prevChapterSummary: prevCh ? (prevCh.summary || prevCh.plot || "") : "",
    chapterPlot: selectedCh ? (selectedCh.plot || "") : "",
    characters: characters,
    prevResponse: prevResponse || ""
  }
}

function resolveSkillTemplate(template: string, context: Record<string, any>): string {
  const engine = (window as any).SkillExecutionEngine
  if (engine && typeof engine.resolveTemplate === "function" && template && /\{\{/.test(template)) {
    try {
      return engine.resolveTemplate(template, context, { keepMissing: false })
    } catch (e) {
      console.warn("[PIPELINE] resolveTemplate failed, using raw template", e)
    }
  }
  return template
}

function getBoundSettingsText(): string {
  const bindings = projectStore.settingBindings || {}
  const lines: string[] = []
  const seen = new Set<string>()
  for (const bKey of Object.keys(bindings)) {
    if (seen.has(bKey)) continue
    seen.add(bKey)
    const s = projectStore.settings.find((x: any) => x.name === bKey)
    if (!s) continue
    const attrs =
      s.attrs && typeof s.attrs === "object"
        ? Object.keys(s.attrs)
            .map((k) => k + ": " + String(s.attrs[k] ?? ""))
            .join("; ")
        : String(s.attrsText || "")
    lines.push((s.category || "其他") + " - " + s.name + (attrs ? " (" + attrs + ")" : ""))
  }
  return lines.join("\n")
}

function getStyleContext(): string {
  return styleTags.value || ""
}

function getStepAgentConfig(step: number) {
  const agentId = getStepAgentId(step)
  if (!agentId) return null
  return agentStore.getAgent(agentId) || null
}

function extractJsonArray(text: string): any[] {
  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      if (Array.isArray(parsed)) return parsed
    }
  } catch {}
  return []
}

function extractJsonObject(text: string): any {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
  } catch {}
  return null
}

function validateVolumes(vols: any[]): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  for (const v of vols) {
    if (!v.name) errors.push("卷缺少名称")
    if (!v.outline && !v.summary) errors.push("卷 '" + (v.name || "?") + "' 缺少内容")
  }
  return { valid: errors.length === 0, errors }
}

function validateChapters(chs: any[]): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  for (const c of chs) {
    if (!c.title) errors.push("章节缺少标题")
  }
  return { valid: errors.length === 0, errors }
}

function clearChapterGenerationFlags() {
  for (const volId of Object.keys(projectStore.chapters)) {
    const chs = projectStore.chapters[volId]
    if (chs) {
      chs.forEach((c: any) => {
        c.bodyGenerated = false
        c.confirmed = false
      })
    }
  }
}

function syncChapterManager(volId: string, ch: any, text: string) {
  try {
    const cm: any = (window as any).ChapterManager
    if (cm && typeof cm.updateChapter === "function" && projectStore.currentProjectId) {
      const pid = String(projectStore.currentProjectId).replace(/^(proj[-_])?/, "")
      cm.updateChapter(pid, volId, ch.id, { title: ch.title, content: text, summary: ch.plot || "" })
    }
  } catch (e: any) {
    console.warn("[WARN] ChapterManager sync failed:", e)
  }
}

function invalidateDownstream(fromStep: number) {
  if (fromStep <= 0) {
    projectStore.settings = []
    projectStore.settingsGenerated = false
    projectStore.volumesConfirmed = false
    projectStore.chaptersConfirmed = false
    projectStore.volumes.forEach((v: any) => { v.confirmed = false; v.bodyGenerated = false })
    clearChapterGenerationFlags()
    styleTags.value = ""
    pacingParams.value = ""
    outlineAnalyzed.value = false
    for (let i = 1; i < 5; i++) steps.value[i].completed = false
  }
  if (fromStep <= 1) {
    projectStore.volumesConfirmed = false
    projectStore.chaptersConfirmed = false
    projectStore.volumes.forEach((v: any) => { v.confirmed = false; v.bodyGenerated = false })
    clearChapterGenerationFlags()
    for (let i = 2; i < 5; i++) steps.value[i].completed = false
  }
  if (fromStep <= 2) {
    projectStore.chaptersConfirmed = false
    projectStore.volumes.forEach((v: any) => { v.confirmed = false; v.bodyGenerated = false })
    for (const volId of Object.keys(projectStore.chapters)) {
      const chs = projectStore.chapters[volId]
      if (chs) chs.forEach((c: any) => { c.bodyGenerated = false; c.confirmed = false })
    }
    for (let i = 3; i < 5; i++) steps.value[i].completed = false
  }
  if (fromStep <= 3) {
    const vol = projectStore.volumes[bodyVolumeIndex.value] || projectStore.volumes[selectedVolumeIndex.value]
    if (vol) {
      const volId = vol.id || vol.name
      const chs = projectStore.chapters[volId] || []
      chs.forEach((c: any) => { c.bodyGenerated = false; c.confirmed = false })
    }
    steps.value[4].completed = false
  }
}

function confirmStep(stepIndex: number) {
  if (stepIndex === 0) {
    saveBookWordCount()
    saveVolumeConfig()
  }
  steps.value[stepIndex].completed = true
  if (stepIndex === 0 && !projectStore.outlineLocked) {
    projectStore.setOutline(projectStore.outlineText)
    projectStore.lockOutline()
    window.dispatchEvent(new CustomEvent("outline-locked", { detail: { text: projectStore.outlineText } }))
  }
  if (stepIndex >= 1) {
    projectStore.settingsGenerated = true
    projectStore.saveProject()
  }
  if (stepIndex >= 2) {
    projectStore.volumesConfirmed = true
    projectStore.saveProject()
  }
  if (stepIndex >= 3) {
    projectStore.chaptersConfirmed = true
    projectStore.saveProject()
  }
  if (stepIndex < 4) {
    pipelineStore.setStep(stepIndex + 1)
  }
}

function nextStep() {
  if (pipelineStore.currentStep < 4) {
    pipelineStore.setStep(pipelineStore.currentStep + 1)
  }
}

function prevStep() {
  if (pipelineStore.currentStep > 0) {
    pipelineStore.setStep(pipelineStore.currentStep - 1)
  }
}

function saveOutline() {
  projectStore.setOutline(projectStore.outlineText)
  invalidateDownstream(0)
}

function lockOutline() {
  if (!projectStore.hasOutline) return
  projectStore.setOutline(projectStore.outlineText)
  projectStore.lockOutline()
  steps.value[0].completed = true
  window.dispatchEvent(new CustomEvent("outline-locked", { detail: { text: projectStore.outlineText } }))
  pipelineStore.setStep(1)
  invalidateDownstream(0)
  analyzeOutline()
}

async function analyzeOutline() {
  if (!projectStore.outlineText || projectStore.outlineText.length < 50) return
  try {
    const prompt = "[大纲]\n" + projectStore.outlineText.slice(0, 2000) + "\n\n请分析这篇文章的风格标签和节奏参数。输出JSON格式：{ \"styleTags\": \"string\", \"pacingParams\": \"string\" }"
    const result = await runStepSkills(0, prompt, undefined, "你是小说分析专家。分析大纲并提取风格标签、节奏参数。")
    const parsed = extractJsonObject(result)
    if (parsed) {
      styleTags.value = parsed.styleTags || ""
      pacingParams.value = parsed.pacingParams || ""
      outlineAnalyzed.value = true
    }
  } catch (e: any) {
    console.warn("Outline analysis failed:", e)
  }
}

async function callApiWithAgent(step: number, skillTemplate: string, prompt: string): Promise<string> {
  const agentConfig = getStepAgentConfig(step)
  const provider = providerStore.getProvider(agentConfig?.provider || "")
  const preferredProvider = providerStore.preferredGenerateProvider
  const activeProvider = provider || preferredProvider
  const model = agentConfig?.model || activeProvider?.selectedModel || activeProvider?.models?.[0] || ""
  const skillPart = skillTemplate || ""
  const agentPart = agentConfig?.systemPrompt || ""
  const systemPrompt = [skillPart, agentPart].filter(Boolean).join("\n\n") || "你是专业小说创作助手。"
  const messages = [{ role: "system", content: systemPrompt }, { role: "user", content: prompt }]
  return await providerStore.callApi(activeProvider?.id || "", model, messages)
}

async function callApiWithAgentTimeout(step: number, skillTemplate: string, prompt: string, timeoutMs: number): Promise<string> {
  const result = await Promise.race([
    callApiWithAgent(step, skillTemplate, prompt),
    new Promise<string>((_, reject) => setTimeout(() => reject(new Error("API超时")), timeoutMs))
  ])
  return result
}

async function runStepSkills(step, prompt, timeoutMs, fallbackTemplate) {
  const startTime = Date.now();
  const stepName = "step-" + step;
  const templates = getStepSkillTemplates(step)
  const mode = getStepSkillMode(step)
  const skillNames = templates.map((t) => t.name).filter(Boolean);
  try {
    const result = await _runStepSkillsInner(step, prompt, timeoutMs, fallbackTemplate);
    execLogStore.addLog({step,stepName,mode,skillNames,prompt:(prompt||"").substring(0,500),result:(result||"").substring(0,500),duration:Date.now()-startTime,status:"success"});
    return result;
  } catch (e) {
    execLogStore.addLog({step,stepName,mode,skillNames,prompt:(prompt||"").substring(0,500),result:e.message || "unknown error",duration:Date.now()-startTime,status:"failed"});
    throw e;
  }
}

async function _runStepSkillsInner(step, prompt, timeoutMs, fallbackTemplate) {
  const templates = getStepSkillTemplates(step)
  const mode = getStepSkillMode(step)
  const baseCtx = buildTemplateContext(step, prompt)
  // Use SkillExecutionEngine for split-merge / multi-step
  if ((mode === "split-merge" || mode === "multi-step") && templates.length > 0) {
    const engine = (window as any).SkillExecutionEngine
    if (engine) {
      const aiRequest = async (opts: any) => {
        const provider = providerStore.getProvider("")
        const preferredProvider = providerStore.preferredGenerateProvider
        const activeProvider = provider || preferredProvider
        const model = activeProvider?.selectedModel || activeProvider?.models?.[0] || ""
        const sysMsg = opts.messages?.find((m: any) => m.role === "system")?.content || ""
        const userMsg = opts.messages?.find((m: any) => m.role === "user")?.content || ""
        const result = await providerStore.callApi(activeProvider?.id || "", model, [{ role: "system", content: sysMsg }, { role: "user", content: userMsg }])
        return { text: result }
      }
      const engineSkills = templates.map((t: any) => ({ name: t.name, template: t.template, customVars: t.customVars || {} }))
      let result: any
      if (mode === "split-merge") {
        console.log("[PIPELINE] split-merge mode, step=" + step + " skills=" + engineSkills.length)
        result = await engine.splitMerge(prompt, engineSkills, { aiRequest, splitSize: 1000, stream: false, templateContext: baseCtx })
      } else {
        console.log("[PIPELINE] multi-step mode, step=" + step + " skills=" + engineSkills.length)
        result = await engine.multiStep(prompt, engineSkills.slice(0, 4), { aiRequest, splitSize: 1500, stream: false, templateContext: baseCtx })
      }
      return result?.text || prompt
    }
  }
  if (mode === "chain" && templates.length > 1) {
    let current = prompt
    const chainCtx = { ...baseCtx }
    for (let si = 0; si < templates.length; si++) {
      const t = templates[si]
      const ctxForSkill = { ...chainCtx, ...(t.customVars || {}) }
      const resolvedTemplate = resolveSkillTemplate(t.template, ctxForSkill)
      const useOriginal = si === 0
      const nextPrompt = useOriginal
        ? prompt
        : "以下是上一个Skill的输出结果，请根据当前Skill继续处理：\n\n【" + t.name + "】" + resolvedTemplate + "\n\n--- 上一步输出 ---\n" + current
      console.log("[PIPELINE] chain step " + (si + 1) + "/" + templates.length + " = " + t.name)
      if (timeoutMs) {
        current = await callApiWithAgentTimeout(step, resolvedTemplate, nextPrompt, timeoutMs)
      } else {
        current = await callApiWithAgent(step, resolvedTemplate, nextPrompt)
      }
      chainCtx.prevResponse = current
    }
    return current
  }
  const combined = templates.map((t) => {
    const ctxForSkill = { ...baseCtx, ...(t.customVars || {}) }
    return resolveSkillTemplate(t.template, ctxForSkill)
  }).filter(Boolean).join("\n\n") || resolveSkillTemplate(fallbackTemplate || "", baseCtx)
  if (timeoutMs) {
    return await callApiWithAgentTimeout(step, combined, prompt, timeoutMs)
  }
  return await callApiWithAgent(step, combined, prompt)
}

function openAddSettingModal() {
  showAddSettingModal.value = true
  newSettingName.value = ""
  newSettingCategory.value = "其他"
  newSettingAttrs.value = ""
}

function confirmAddSetting() {
  if (!newSettingName.value.trim()) return
  projectStore.settings.push({
    name: newSettingName.value.trim(),
    category: newSettingCategory.value,
    attrs: {},
    attrsText: newSettingAttrs.value
  })
  projectStore.saveProject()
  showAddSettingModal.value = false
}

function cancelAddSetting() {
  showAddSettingModal.value = false
}

function removeSetting(index: number) {
  projectStore.settings.splice(index, 1)
  projectStore.saveProject()
}async function genSettings() {
  if (!projectStore.outlineText) return
  pipelineStore.startGeneration()
  pipelineStore.updateProgress(10, "AI生成设定中")
  try {
    const prompt = "[大纲]\n" + projectStore.outlineText + "\n\n请基于此大纲，生成世界观设定。输出JSON数组，每项含name/category/attrsText字段。"
    const result = await runStepSkills(1, prompt, undefined, "你是设定生成专家。基于小说大纲生成详细设定。")
    const settings = extractJsonArray(result)
    if (settings.length > 0) {
      const valid = settings.filter((s: any) => s.name)
      if (valid.length > 0) {
        projectStore.settings = valid.map((s: any) => ({
          name: s.name,
          category: s.category || "其他",
          attrs: s.attrs || {},
          attrsText: s.attrsText || JSON.stringify(s.attrs || {})
        }))
        projectStore.saveProject()
        pipelineStore.updateProgress(100, "设定生成完成")
      } else {
        pipelineStore.failGeneration("未能解析设定内容")
      }
    } else {
      pipelineStore.failGeneration("未能解析设定JSON")
    }
    pipelineStore.finishGeneration()
  } catch (e: any) {
    pipelineStore.failGeneration(e.message)
  }
}

async function genVolumes(mode: string) {
  if (!projectStore.outlineText) return
  pipelineStore.startGeneration()
  pipelineStore.updateProgress(10, "AI生成卷纲中")
  try {
    const settingsText = projectStore.settings.map((s: any) => s.name + " - " + JSON.stringify(s.attrs)).join("\n")
    const boundText = getBoundSettingsText()
    const distanceFromWords = bookWordCount.value > 0 ? Math.floor(linkedVolumeCount.value / Math.max(volumeCount.value, 1)) : 1
    const effectiveVolumes = Math.max(1, volumeCount.value)
    const existingCount = projectStore.volumes.length
    let prompt: string
    if (mode === "continue" && existingCount > 0) {
      const lastVol = projectStore.volumes[existingCount - 1]
      prompt = "[大纲]\n" + projectStore.outlineText + "\n\n[设定]\n" + settingsText + (boundText ? "\n\n[绑定设定]\n" + boundText : "") + "\n\n[卷数]\n" + effectiveVolumes + "\n\n[每卷字数]\n" + volumeWords.value + "\n\n已生成" + existingCount + "卷，上一卷为：" + lastVol.name + " - " + (lastVol.outline || lastVol.summary || "") + "。请继续生成第" + (existingCount + 1) + "卷到第" + effectiveVolumes + "卷的卷纲。输出JSON数组，每项含name/outline/summary/suggestedWords字段。"
    } else if (mode === "single" && existingCount > 0) {
      const lastVol = projectStore.volumes[existingCount - 1]
      prompt = "[大纲]\n" + projectStore.outlineText + "\n\n[设定]\n" + settingsText + (boundText ? "\n\n[绑定设定]\n" + boundText : "") + "\n\n[卷数]\n" + effectiveVolumes + "\n\n[每卷字数]\n" + volumeWords.value + "\n\n已生成" + existingCount + "卷，上一卷为：" + lastVol.name + " - " + (lastVol.outline || lastVol.summary || "") + "。请只生成第" + (existingCount + 1) + "卷的卷纲。输出JSON数组（正好1项），每项含name/outline/summary/suggestedWords字段。"
    } else {
      prompt = "[大纲]\n" + projectStore.outlineText + "\n\n[设定]\n" + settingsText + (boundText ? "\n\n[绑定设定]\n" + boundText : "") + "\n\n[卷数]\n" + effectiveVolumes + "\n\n[每卷字数]\n" + volumeWords.value + "\n\n全书计划字数：" + (bookWordCount.value * 10000) + "字。请生成" + effectiveVolumes + "卷的卷纲。输出JSON数组，每项含name/outline/summary/suggestedWords字段。"
    }
    const result = await runStepSkills(2, prompt, undefined, "你是卷纲生成专家。基于大纲和设定生成卷纲。")
    const volumes = extractJsonArray(result)
    if (volumes.length > 0) {
      const vr = validateVolumes(volumes)
      if (!vr.valid) {
        pipelineStore.failGeneration(vr.errors.join("; "))
        pipelineStore.finishGeneration()
        return
      }
      if ((mode === "continue" || mode === "single") && existingCount > 0) {
        projectStore.volumes = [
          ...projectStore.volumes,
          ...volumes.map((v: any) => ({
            ...v,
            confirmed: false,
            bodyGenerated: false
          }))
        ]
      } else {
        projectStore.volumes = volumes.map((v: any) => ({
          ...v,
          confirmed: false,
          bodyGenerated: false
        }))
      }
      projectStore.saveProject()
      pipelineStore.updateProgress(100, "卷纲生成完成")
    } else {
      pipelineStore.failGeneration("未能解析卷纲JSON")
    }
    pipelineStore.finishGeneration()
  } catch (e: any) {
    pipelineStore.failGeneration(e.message)
  }
}

async function loadOutline() {
  projectStore.setOutline(projectStore.outlineText)
  projectStore.saveProject()
}

async function genChapters() {
  const vol = projectStore.volumes[selectedVolumeIndex.value]
  if (!vol) return
  const volId = vol.id || vol.name
  const totalChapters = Math.ceil((vol.suggestedWords || volumeWords.value) / chapterWords.value)
  pipelineStore.startGeneration()
  pipelineStore.saveBreakpoint({ volumeIndex: selectedVolumeIndex.value, chapterCount: 0, total: totalChapters })
  const collected: any[] = []
  try {
    const volOutline = vol.outline || vol.summary || ""
    const batch = Math.max(1, Math.min(chapterBatchSize.value || 5, 20))
    for (let start = 0; start < totalChapters; start += batch) {
      const end = Math.min(start + batch, totalChapters)
      pipelineStore.updateProgress(Math.round((start / totalChapters) * 100), "生成 " + (start + 1) + "-" + end + "/" + totalChapters)
      const prompt = "[卷纲]\n" + vol.name + " - " + volOutline + "\n\n[本卷总章数]\n" + totalChapters + "\n\n[单章字数]\n" + chapterWords.value + "\n\n请生成第" + (start + 1) + "章到第" + end + "章的章节列表。输出JSON数组，每项含title/plot字段。数组长度必须恰好等于" + (end - start) + "。"
      let batchResult: any[] = []
      let batchSuccess = false
      for (let retry = 0; retry < 5 && !batchSuccess; retry++) {
        try {
          const result = await runStepSkills(3, prompt, 120000, "你是章节规划师。将卷纲拆解为逐章剧情梗概。")
          const chapters = extractJsonArray(result)
          if (chapters.length > 0) {
            batchResult = chapters
            batchSuccess = true
          } else if (retry < 4) {
            await new Promise((r) => setTimeout(r, 5000))
          }
        } catch (retryErr: any) {
          if (retry < 4) {
            pipelineStore.saveBreakpoint({ volumeIndex: selectedVolumeIndex.value, chapterCount: collected.length, total: totalChapters })
            await new Promise((r) => setTimeout(r, 10000))
          } else {
            throw retryErr
          }
        }
      }
      if (batchSuccess && batchResult.length > 0) {
        batchResult.forEach((c: any, idx: number) => {
          if (!c.id) c.id = "ch-" + String(volId).replace(/[^a-zA-Z0-9_-]/g, "-") + "-" + String(collected.length + idx + 1).padStart(3, "0")
        })
        collected.push(...batchResult)
        projectStore.setChapters(volId, [...collected])
        pipelineStore.saveBreakpoint({ volumeIndex: selectedVolumeIndex.value, chapterCount: collected.length, total: totalChapters })
      }
    }
    if (collected.length > 0) {
      const vr = validateChapters(collected)
      if (!vr.valid) {
        pipelineStore.failGeneration(vr.errors.join("; "))
        pipelineStore.finishGeneration()
        return
      }
      pipelineStore.updateProgress(100, "章节生成完成")
    } else {
      pipelineStore.failGeneration("未能解析章节JSON")
    }
    pipelineStore.finishGeneration()
  } catch (e: any) {
    pipelineStore.saveBreakpoint({ volumeIndex: selectedVolumeIndex.value, chapterCount: collected.length, total: totalChapters })
    pipelineStore.failGeneration(e.message)
  }
}

async function genBody(volumeIndex: number, chapterIndex: number) {
  const vol = projectStore.volumes[volumeIndex]
  if (!vol) return
  const volId = vol.id || vol.name
  const chs = projectStore.chapters[volId] || []
  const ch = chs[chapterIndex]
  if (!ch) return

  // Sync the body-stage selectors to the chapter we are generating from.
  bodyVolumeIndex.value = volumeIndex
  bodyChapterIndex.value = chapterIndex

  pipelineStore.startGeneration()
  pipelineStore.updateProgress(10, "AI生成正文中")
  try {
    const settingsText = projectStore.settings.map((s: any) => s.name + " - " + JSON.stringify(s.attrs)).join("\n")
    const boundText = getBoundSettingsText()
    const volOutline = vol.outline || vol.summary || ""
    const styleCtx = getStyleContext()
    const prompt = "[全书大纲]\n" + projectStore.outlineText + "\n\n[设定摘要]\n" + settingsText + (boundText ? "\n\n[绑定设定]\n" + boundText : "") + (styleCtx ? "\n\n[风格与节奏分析]\n" + styleCtx + "\n" : "") + "\n\n[当前卷概要]\n" + vol.name + " - " + volOutline + "\n\n[当前章节剧情点]\n" + ch.title + " - " + (ch.plot || "") + "\n\n请为本章节生成约" + chapterWords.value + "字的正文内容。"
    const result = await runStepSkills(4, prompt, undefined, "你是小说写作专家。请基于章节剧情点生成正文。")
    bodyResult.value = result
    ch.body = result
    ch.bodyGenerated = true
    projectStore.saveProject()
    projectStore.refreshTree()
    syncChapterManager(volId, ch, result)
    // Insert into the editor automatically (same link as old architecture).
    window.dispatchEvent(new CustomEvent("insert-text", {
      detail: {
        text: result,
        chapterId: ch.id || '',
        title: ch.title || '章节'
      }
    }))
    pipelineStore.updateProgress(100, "正文生成完成")
    pipelineStore.finishGeneration()
  } catch (e: any) {
    pipelineStore.failGeneration(e.message)
  }
}

async function genBodyForSelected() {
  await genBody(bodyVolumeIndex.value, bodyChapterIndex.value)
}

function insertToEditor() {
  const content = currentBodyContent.value || bodyResult.value
  if (!content) return
  const vol = projectStore.volumes[bodyVolumeIndex.value]
  const volId = vol?.id || vol?.name
  const chs = projectStore.chapters[volId] || []
  const ch = chs[bodyChapterIndex.value]
  window.dispatchEvent(new CustomEvent("insert-text", {
    detail: {
      text: content,
      chapterId: ch?.id || '',
      title: ch?.title || '章节'
    }
  }))
}

onMounted(() => {
  const saved = window.electronAPI.storageRead(storageKey("pipeline_step_config"))
  if (saved) {
    if (saved.agents) {
      stepAgents.value = { 0: "", 1: "", 2: "", 3: "", 4: "" }
      let a = saved.agents
      for (let i = 0; i < 5; i++) {
        if (a[i] !== undefined) stepAgents.value[i] = a[i]
        else if (a[i + 1] !== undefined) stepAgents.value[i] = a[i + 1]
      }
    }
    if (saved.skills) {
      stepSkills.value = { 0: [], 1: [], 2: [], 3: [], 4: [] }
      let s = saved.skills
      for (let i = 0; i < 5; i++) {
        if (Array.isArray(s[i])) stepSkills.value[i] = s[i].filter(Boolean)
        else if (Array.isArray(s[i + 1])) stepSkills.value[i] = s[i + 1].filter(Boolean)
      }
    }
    if (saved.modes) {
      stepSkillModes.value = { 0: "compose", 1: "compose", 2: "chain", 3: "chain", 4: "compose" }
      let m = saved.modes
      for (let i = 0; i < 5; i++) {
        if (m[i] !== undefined) stepSkillModes.value[i] = m[i]
        else if (m[i + 1] !== undefined) stepSkillModes.value[i] = m[i + 1]
      }
    }
    if (saved.bookWordCount) bookWordCount.value = Math.round(saved.bookWordCount / 10000)
    if (saved.volumeWords) volumeWords.value = saved.volumeWords
    if (saved.chapterWords) chapterWords.value = saved.chapterWords
  }
  // 从 store 恢复步骤状态
  if (projectStore.outlineLocked) {
    steps.value[0].completed = true
    if (pipelineStore.currentStep === 0) pipelineStore.setStep(1)
  }
  if (projectStore.settingsGenerated) steps.value[1].completed = true
  if (projectStore.volumesConfirmed) steps.value[2].completed = true
  if (projectStore.chaptersConfirmed) steps.value[3].completed = true
})

function getSkillName(id: string): string {
  const s = skillStore.getSkill(id);
  return s ? s.name : id;
}


function addStepSkill(step: number) {
  const sid = stepSkillSelect.value[step];
  if (!sid) return;
  const internalStep = step - 1
  const arr = stepSkills.value[internalStep] || [""]
  if (!arr.includes(sid)) {
    const emptyIdx = arr.findIndex(x => !x);
    if (emptyIdx !== -1) {
      arr[emptyIdx] = sid;
    } else {
      arr.push(sid);
    }
    stepSkills.value[internalStep] = arr;
    stepSkillSelect.value[step] = "";
    saveStepConfig();
  }
}

function removeStepSkill(step: number, index: number) {
  const internalStep = step - 1
  const arr = stepSkills.value[internalStep] || []
  if (index >= 0 && index < arr.length) {
    arr[index] = "";
    stepSkills.value[internalStep] = arr;
    saveStepConfig();
  }
}

function insertBody() {
  if (bodyResult.value) {
    const vol = projectStore.volumes[bodyVolumeIndex.value];
    const volId = vol?.id || vol?.name;
    const chs = projectStore.chapters[volId] || [];
    const ch = chs[bodyChapterIndex.value];
    window.dispatchEvent(new CustomEvent("insert-text", {
      detail: {
        text: bodyResult.value,
        chapterId: ch?.id || "",
        title: ch?.title || "章节"
      }
    }));
    toolResult.value = "正文已插入到编辑器";
  }
}

function toolAction(action: string) {
  toolResult.value = "";
  try {
    if (action === "names") {
      generateNames("character", projectStore.outlineText.slice(0, 500)).then(r => {
        if (r.success) toolResult.value = r.data.map((n: any) => n.name + " - " + (n.meaning || "")).join("; ");
      });
    } else if (action === "rules") {
      generateWritingRules(projectStore.outlineText).then(r => {
        if (r.success) toolResult.value = r.data.map((r: any) => "[" + r.category + "] " + r.rule).join("; ");
      });
    } else if (action === "timeline") {
      extractTimeline(projectStore.outlineText).then(r => {
        if (r.success) toolResult.value = r.data.map((t: any) => t.time + ": " + t.event).join("; ");
      });
    } else if (action === "review") {
      batchReviewChapters(projectStore.volumes).then(r => {
        if (r.success) toolResult.value = r.data.map((rv: any) => rv.title + ": " + rv.review.score + "分").join("; ");
      });
    } else if (action === "revise") {
      const vol = projectStore.volumes[selectedVolumeIndex.value];
      if (vol) {
        const volId = vol.id || vol.name;
        const chs = projectStore.chapters[volId] || [];
        const ch = chs[0];
        if (ch && ch.body) {
          reviseChapter(ch.title, ch.body).then(r => { if (r.success) toolResult.value = r.data; });
        }
      }
    } else if (action === "translate") {
      const text = window.getSelection()?.toString() || projectStore.outlineText.slice(0, 1000);
      translateText(text, "英文").then(r => { if (r.success) toolResult.value = r.data; });
    } else if (action === "style") {
      const text = window.getSelection()?.toString() || projectStore.outlineText.slice(0, 1000);
      convertStyle(text, "古风").then(r => { if (r.success) toolResult.value = r.data; });
    } else if (action === "regenerate") {
      regenerateContent(projectStore.outlineText.slice(0, 500), "你是专业小说创作助手。").then(r => { if (r.success) toolResult.value = r.data; });
    } else if (action === "modify") {
      const text = window.getSelection()?.toString() || projectStore.outlineText.slice(0, 1000);
      const instruction = window.prompt("请输入修改指令：");
      if (instruction) {
        modifyContent(text, instruction).then(r => { if (r.success) toolResult.value = r.data; });
      }
    }
  } catch (e: any) {
    toolResult.value = "错误: " + e.message;
  }
}

</script>

<style scoped>
.pl-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: var(--bg-overlay); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.pl-content { width: min(1200px, 95vw); height: min(850px, 92vh); max-width: 1200px; max-height: 92vh; background: var(--bg-glass); border: 1px solid var(--border-color); border-radius: 12px; box-shadow: var(--shadow-lg); display: flex; flex-direction: column; }
.pl-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 32px; border-bottom: 1px solid var(--border-color); font-size: 18px; font-weight: 600; }
.pl-body { display: flex; flex: 1; overflow: hidden; }
/* 左侧五层步骤导航 - 竖排 */
.pl-steps { width: clamp(180px, 16vw, 240px); background: var(--bg-secondary); border-right: 1px solid var(--border-color); padding: 16px 8px; display: flex; flex-direction: column; gap: 4px; flex-shrink: 0; }
.pl-step { display: flex; align-items: center; gap: 10px; padding: 14px 16px; cursor: pointer; border-radius: 10px; opacity: 0.5; transition: opacity 0.15s ease, background 0.15s ease; }
.pl-step:hover { opacity: 0.8; background: var(--bg-hover); }
.pl-step.active { opacity: 1; background: var(--accent-dim); }
.pl-step.completed { opacity: 1; }
.pl-step-num { width: 34px; height: 34px; border-radius: 50%; background: var(--bg-tertiary); color: var(--text-primary); display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: bold; flex-shrink: 0; transition: background 0.15s ease; }
.pl-step.active .pl-step-num { background: var(--accent); color: var(--text-on-accent); }
.pl-step.completed .pl-step-num { background: var(--success); color: var(--text-on-accent); }
.pl-step-label { font-size: 16px; color: var(--text-primary); font-weight: 500; }
.pl-step-check { margin-left: auto; color: var(--success); font-size: 18px; }
/* 右侧内容区 */
.pl-content-right { flex: 1; padding: 32px; overflow-y: auto; min-width: 0; }
.pl-step-panel h3 { font-size: 20px; margin-bottom: 20px; }
.pl-desc { font-size: 15px; color: var(--text-secondary); margin-bottom: 20px; padding: 14px; background: var(--bg-secondary); border-radius: 10px; line-height: 1.6; }
.pl-textarea { width: 100%; min-height: 400px; background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 10px; padding: 16px; font-size: 15px; line-height: 1.8; resize: vertical; outline: none; }
.pl-input { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 12px; font-size: 14px; height: 36px; outline: none; flex: 1; }
.pl-input-sm { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 10px; font-size: 14px; height: 32px; outline: none; }
.pl-settings-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
.pl-setting-item { display: flex; align-items: center; gap: 10px; padding: 12px; background: var(--bg-tertiary); border-radius: 8px; flex-wrap: wrap; }
.pl-attrs-input { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 12px; font-size: 14px; min-height: 80px; flex: 1; resize: vertical; outline: none; }
.pl-vol-config { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; font-size: 15px; flex-wrap: wrap; }
.pl-vol-config label { color: var(--text-secondary); }
.pl-vol-list { display: flex; flex-direction: column; gap: 14px; margin-bottom: 16px; }
.pl-vol-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.vol-words { font-size: 13px; color: var(--text-muted); flex-shrink: 0; }
.pl-vol-outline { width: 100%; min-height: 100px; background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; font-size: 14px; resize: vertical; outline: none; margin-bottom: 10px; }
.pl-ch-config { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; font-size: 15px; flex-wrap: wrap; }
.pl-ch-config label { color: var(--text-secondary); }
.pl-ch-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; max-height: 350px; overflow-y: auto; }
.ch-title { flex: 1; font-size: 14px; color: var(--text-primary); }
.pl-body-config { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; font-size: 15px; flex-wrap: wrap; }
.pl-body-config label { color: var(--text-secondary); }
.pl-body-result { background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 8px; padding: 16px; margin-bottom: 12px; max-height: 400px; overflow-y: auto; }
.pl-body-text { font-size: 15px; line-height: 1.8; white-space: pre-wrap; color: var(--text-primary); }
.pl-gen-options { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; font-size: 15px; color: var(--text-secondary); flex-wrap: wrap; }
.pl-actions { display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap; }
.pl-result { background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 10px; padding: 20px; margin: 20px 0; max-height: 450px; overflow-y: auto; white-space: pre-wrap; font-size: 15px; color: var(--text-primary); }
.pl-gen-hint { color: var(--text-muted); font-size: 14px; }
.pl-vol-card.confirmed { border-color: var(--success); }
.pl-ch-card { display: flex; align-items: center; padding: 12px 16px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 8px; }
.pl-ch-card-main { width: 100%; }
.pl-ch-card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.pl-ch-plot { width: 100%; min-height: 54px; background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 10px; font-size: 13px; line-height: 1.6; resize: vertical; outline: none; }
.empty-hint { color: var(--text-muted); font-size: 15px; text-align: center; padding: 30px; }
.input-w-60 { width: 60px; }
.input-w-80 { width: 80px; }

.pl-tools-title { font-size: 12px; font-weight: 600; color: var(--text-primary); margin-bottom: 6px; }
.pl-readonly { opacity: 0.7; cursor: default; }
.pl-step-tools { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
.pl-agent-mode-bar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 8px 12px; background: var(--bg-elevated, var(--bg-secondary)); border: 1px solid var(--border-color); border-radius: 8px; }
.pl-agent-mode-bar .pl-label, .pl-agent-mode-bar .pl-mode-label { font-size: 13px; color: var(--text-secondary); white-space: nowrap; }
.pl-agent-mode-bar .pl-select { height: 30px; padding: 0 10px; background: var(--bg-input); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); font-size: 13px; cursor: pointer; }
.pl-agent-select { flex: 1 1 160px; min-width: 160px; }
.pl-mode-select { flex: 1 1 150px; min-width: 150px; }
.pl-skill-bar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; margin-bottom: 12px; background: var(--bg-elevated, var(--bg-secondary)); border: 1px solid var(--border-color); border-radius: 8px; font-size: 13px; color: var(--text-primary); }
.pl-skill-bar .pl-label { font-size: 13px; color: var(--text-secondary); white-space: nowrap; }
.pl-skill-bar .pl-select { flex: 1; height: 30px; padding: 0 8px; background: var(--bg-input); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); font-size: 13px; cursor: pointer; min-width: 100px; }
.pl-skill-bar .btn-icon { height: 28px; width: 28px; padding: 0; font-size: 16px; line-height: 1; display: flex; align-items: center; justify-content: center; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-input); color: var(--text-primary); cursor: pointer; }
.pl-skill-bar .btn-icon:hover { background: var(--accent-dim); color: var(--accent); }
.pl-chip-close { height: 28px; width: 28px; padding: 0; font-size: 16px; line-height: 1; display: flex; align-items: center; justify-content: center; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-input); color: var(--text-primary); cursor: pointer; }
.pl-chip-close:hover { background: var(--accent-dim); color: var(--accent); }
.pl-tools-label { font-size: var(--font-size-sm); color: var(--text-muted); white-space: nowrap; }
.pl-skills-list { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; min-height: 24px; }
.pl-skill-chip { padding: 2px 8px; border-radius: 12px; font-size: 11px; background: var(--accent-dim); color: var(--accent); border: 1px solid var(--accent-glow, transparent); display: inline-flex; align-items: center; gap: 4px; }
.pl-tools-section { padding: 6px 0; margin-bottom: 10px; border-bottom: 1px solid var(--border-color); }
.pl-tools-grid { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.pl-tool-result { margin-top: 6px; padding: 6px 10px; background: var(--bg-input); border: 1px solid var(--border-color); border-radius: 6px; font-size: 12px; color: var(--text-primary); max-height: 60px; overflow-y: auto; }
.pl-tool-loading { margin-top: 4px; font-size: 12px; color: var(--accent); }

.pl-add-setting-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.55); display: flex; align-items: center; justify-content: center; z-index: 1100; }
.pl-add-setting-modal { width: min(560px, 92vw); background: var(--bg-glass); border: 1px solid var(--border-color); border-radius: 10px; box-shadow: var(--shadow-lg); overflow: hidden; }
.pl-add-setting-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border-color); font-size: 16px; font-weight: 600; }
.pl-add-setting-body { display: flex; flex-direction: column; gap: 8px; padding: 20px; }
.pl-add-setting-body label { font-size: 13px; color: var(--text-secondary); }
.pl-add-setting-body .pl-input-sm { width: 100%; }
.pl-add-setting-body .pl-attrs-input { min-height: 140px; }
.pl-add-setting-footer { display: flex; justify-content: flex-end; gap: 10px; padding: 14px 20px; border-top: 1px solid var(--border-color); }

</style>
