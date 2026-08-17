<template>
  <div id="pipeline-panel" class="pl-overlay" @click.self="$emit('close')">
    <div class="pl-content">
      <div class="pl-header">
        <span class="pl-header-title">生成流水线</span>
        <div class="pl-header-actions">
          <button class="btn-sm btn-secondary" id="btn-exec-log" @click="showExecLog = !showExecLog">执行日志</button>
          <button class="btn-sm btn-secondary" id="btn-flow-toggle" @click="showFlowView = !showFlowView">{{ showFlowView ? '步骤视图' : '流程视图' }}</button>
          <button id="btn-close-pl" class="modal-close" @click="$emit('close')">&times;</button>
        </div>
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

        <div class="pl-tools-section">
          <div class="pl-tools-grid">
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
          <div class="pl-tool-result" v-if="toolResult">{{ toolResult }}</div>
          <div class="pl-tool-loading" v-if="aiLoading">{{ aiLoadingText }}</div>
        </div>
          <PipelineFlow v-if="showFlowView" :steps-with-ids="stepsWithIds" :step-agents="stepAgents" :step-skills="stepSkills" :step-skill-modes="stepSkillModes" @toggle-view="showFlowView = false" />
          <div v-show="!showFlowView">
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
                <select v-if="stepSkillModes[0] === 'chain'" v-model="stepSkillAgents['0-' + si]" class="pl-select pl-chip-agent" @change="saveStepConfig">
                  <option value="">默认</option>
                  <option v-for="a in agentStore.agents" :key="a.id" :value="a.id">{{ a.name }}</option>
                </select>
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
                <select v-if="stepSkillModes[1] === 'chain'" v-model="stepSkillAgents['1-' + si]" class="pl-select pl-chip-agent" @change="saveStepConfig">
                  <option value="">默认</option>
                  <option v-for="a in agentStore.agents" :key="a.id" :value="a.id">{{ a.name }}</option>
                </select>
                <button class="btn-icon pl-chip-close" title="移除" @click="removeStepSkill(2, si)">&times;</button>
              </span>
            </template>
          </div>
            <p class="pl-desc">第二步：基于大纲，AI自动生成设定。设定可编辑和新增。</p>
            <div class="pl-settings-workspace" id="pl-settings-workspace">
              <div class="pl-settings-navigation">
                <div class="pl-settings-navigation-label">设定分类</div>
                <div id="pl-sc-categories" class="pl-sc-categories" role="tablist" aria-label="设定分类">
                  <button
                    v-for="cat in settingNavigationCategories"
                    :key="cat"
                    type="button"
                    class="pl-sc-cat-item"
                    :class="{ active: selectedSettingCategory === cat, confirmed: isCategoryConfirmed(cat) }"
                    role="tab"
                    :aria-selected="selectedSettingCategory === cat"
                    @click="selectedSettingCategory = cat"
                  >
                    <span class="pl-sc-cat-label">{{ cat }}</span>
                    <span v-if="isCategoryConfirmed(cat)" class="pl-sc-cat-check" aria-label="已确认">✓</span>
                    <span v-else-if="cat !== '设定类'" class="pl-sc-cat-delete" title="删除分类" @click.stop="deleteCategory(cat)">&times;</span>
                  </button>
                  <button id="btn-pl-add-cat" type="button" class="pl-sc-add-cat" title="新增分类" @click="showAddCategory = true">+ 新增分类</button>
                </div>
              </div>

              <div v-if="showAddCategory" class="pl-sc-add-cat-row">
                <input v-model="newCategoryName" class="pl-input-sm" placeholder="分类名称" @keyup.enter="addCategory" />
                <button type="button" class="btn-sm btn-primary" @click="addCategory">确定</button>
                <button type="button" class="btn-sm btn-secondary" @click="showAddCategory = false; newCategoryName = ''">取消</button>
              </div>

              <section v-if="selectedSettingCategory && projectStore.hasOutline" class="pl-sc-editor" aria-live="polite">
                <div class="pl-sc-editor-heading">
                  <div>
                    <span class="pl-sc-editor-kicker">当前分类</span>
                    <h4>{{ selectedSettingCategory }}</h4>
                  </div>
                  <span class="pl-sc-editor-count">{{ filteredSettings.length }} 项设定</span>
                </div>

                <div id="pl-bound-settings-list" class="pl-settings-list">
                  <article v-for="(s, i) in filteredSettings" :key="s.id || i" class="pl-setting-item">
                    <div class="pl-setting-item-main">
                      <input v-model="s.name" class="pl-input" placeholder="设定名称" @change="saveSettingItem(s)" />
                      <button type="button" class="btn-sm" :class="s.isBound ? 'btn-primary' : 'btn-secondary'" @click="toggleItemBinding(s)" :title="s.isBound ? '已绑定到流水线' : '绑定到流水线'">{{ s.isBound ? '已绑定' : '绑定' }}</button>
                      <button type="button" class="btn-danger btn-sm" @click="removeSetting(i)">删除</button>
                    </div>
                    <textarea v-model="s.content" class="pl-attrs-input" placeholder="输入该设定的属性内容" @change="saveSettingItem(s)"></textarea>
                  </article>
                  <p v-if="filteredSettings.length === 0" class="empty-hint">该分类还没有设定内容</p>
                </div>

                <div class="pl-sc-category-actions">
                  <button type="button" class="btn-secondary" @click="openAddSettingModalForCategory">+ 该类新增</button>
                  <button type="button" class="btn-secondary" @click="bindCategorySettings">一键绑定到全局</button>
                  <button type="button" class="btn-primary" @click="confirmSettingCategory">{{ isCategoryConfirmed(selectedSettingCategory) ? '已完成' : '确认该类' }}</button>
                </div>
              </section>
              <p v-else class="empty-hint">解析大纲后，分类和设定内容会显示在这里</p>
            </div>
            <div class="pl-actions pl-settings-footer-actions">
              <button id="btn-pl-gen-settings" class="btn-primary" @click="genSettings" :disabled="pipelineStore.isGenerating || !projectStore.hasOutline || !projectStore.outlineLocked">
                {{ pipelineStore.isGenerating ? 'AI生成中...' : 'AI设定生成 / 解析大纲' }}
              </button>
              <button id="btn-pl-confirm-settings" class="btn-primary" @click="confirmSettingsLayer" :disabled="currentSettings.length === 0">确认/保存设定层</button>
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
                <select v-if="stepSkillModes[2] === 'chain'" v-model="stepSkillAgents['2-' + si]" class="pl-select pl-chip-agent" @change="saveStepConfig">
                  <option value="">默认</option>
                  <option v-for="a in agentStore.agents" :key="a.id" :value="a.id">{{ a.name }}</option>
                </select>
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
                <select v-if="stepSkillModes[3] === 'chain'" v-model="stepSkillAgents['3-' + si]" class="pl-select pl-chip-agent" @change="saveStepConfig">
                  <option value="">默认</option>
                  <option v-for="a in agentStore.agents" :key="a.id" :value="a.id">{{ a.name }}</option>
                </select>
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
                <select v-if="stepSkillModes[4] === 'chain'" v-model="stepSkillAgents['4-' + si]" class="pl-select pl-chip-agent" @change="saveStepConfig">
                  <option value="">默认</option>
                  <option v-for="a in agentStore.agents" :key="a.id" :value="a.id">{{ a.name }}</option>
                </select>
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
          <option v-for="cat in settingCategoryOptions" :key="cat" :value="cat">{{ cat }}</option>
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
import PipelineFlow from "./PipelineFlow.vue"

defineEmits<{ close: [] }>()


const showExecLog = ref(false)
const showFlowView = ref(false)
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
const showAddCategory = ref(false)
const newCategoryName = ref("")
const selectedSettingCategory = ref("")
const confirmedSettingCategories = ref<string[]>([])

const settingCategories = computed(() => {
  const sc = projectStore.getSettingsCollection()
  return sc.categories || []
})

const settingNavigationCategories = computed(() => {
  if (!projectStore.hasOutline) return ["设定类"]
  const categories = settingCategories.value.filter((cat: string) => cat && cat !== "设定类")
  return categories.length > 0 ? ["设定类", ...categories] : ["设定类"]
})

const settingCategoryOptions = computed(() => {
  const defaults = ["世界观规则", "地理环境", "势力阵营", "技术体系", "魔法体系", "社会结构", "物品道具", "历史事件", "其他"]
  const cats = projectStore.getSettingsCollection().categories || []
  return Array.from(new Set([...defaults, ...cats]))
})

const filteredSettings = computed(() => {
  const sc = projectStore.getSettingsCollection()
  const cat = selectedSettingCategory.value
  if (!cat) return []
  return sc.items[cat] || []
})

function addCategory() {
  const name = newCategoryName.value.trim()
  if (!name) return
  const sc = projectStore.getSettingsCollection()
  if (!sc.categories.includes(name)) {
    sc.categories.push(name)
    if (!sc.items[name]) sc.items[name] = []
    projectStore.saveProject()
  }
  showAddCategory.value = false
  newCategoryName.value = ""
  selectedSettingCategory.value = name
}

function isCategoryConfirmed(category: string) {
  return confirmedSettingCategories.value.includes(category)
}

function saveSettingItem(item: any) {
  if (!item) return
  const sc = projectStore.getSettingsCollection()
  const category = item.category || selectedSettingCategory.value || "设定类"
  if (!sc.categories.includes(category)) sc.categories.push(category)
  if (!sc.items[category]) sc.items[category] = []
  item.category = category
  item.attrs = item.attrs && typeof item.attrs === "object" ? item.attrs : {}
  item.attrs.desc = item.content || ""
  item.updatedAt = Date.now()
  projectStore.saveProject()
}

function openAddSettingModalForCategory() {
  const category = selectedSettingCategory.value || "设定类"
  const sc = projectStore.getSettingsCollection()
  if (!sc.categories.includes(category)) sc.categories.push(category)
  if (!sc.items[category]) sc.items[category] = []
  openAddSettingModal()
  newSettingCategory.value = category
}

function bindCategorySettings() {
  const category = selectedSettingCategory.value
  if (!category) return
  const sc = projectStore.getSettingsCollection()
  const items = sc.items[category] || []
  for (const item of items) {
    item.isBound = true
    item.boundTo = Array.isArray(item.boundTo) && item.boundTo.length > 0 ? item.boundTo : ["pipeline"]
    item.updatedAt = Date.now()
  }
  projectStore.saveProject()
}

function confirmSettingCategory() {
  const category = selectedSettingCategory.value
  if (!category) return
  if (!confirmedSettingCategories.value.includes(category)) {
    confirmedSettingCategories.value.push(category)
  }
  projectStore.settingsGenerated = true
  projectStore.saveProject()
}

function deleteCategory(cat: string) {
  const sc = projectStore.getSettingsCollection()
  const idx = sc.categories.indexOf(cat)
  if (idx >= 0) {
    sc.categories.splice(idx, 1)
    delete sc.items[cat]
    projectStore.saveProject()
    if (selectedSettingCategory.value === cat) {
      selectedSettingCategory.value = sc.categories[0] || ""
    }
  }
}

function changeItemCategory(item: any, newCat: string) {
  if (!item || !newCat || item.category === newCat) return
  const sc = projectStore.getSettingsCollection()
  const oldCat = item.category
  if (!sc.categories.includes(newCat)) sc.categories.push(newCat)
  if (!sc.items[newCat]) sc.items[newCat] = []
  const oldArr = sc.items[oldCat] || []
  const idx = oldArr.findIndex((x: any) => x.id === item.id)
  if (idx >= 0) {
    const moved = oldArr.splice(idx, 1)[0]
    if (moved) {
      moved.category = newCat
      sc.items[newCat].push(moved)
      selectedSettingCategory.value = newCat
      projectStore.saveProject()
    }
  }
}
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
const stepSkillAgents = ref<Record<string, string>>({})

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

const currentSettings = computed(() => {
    const sc = projectStore.getSettingsCollection()
    const allItems: any[] = []
    for (const cat of sc.categories) {
      const items = sc.items[cat] || []
      allItems.push(...items.map((item: any) => ({ ...item, category: cat })))
    }
    return allItems
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
watch(settingNavigationCategories, (categories) => {
  if (categories.length > 0 && !categories.includes(selectedSettingCategory.value)) {
    selectedSettingCategory.value = categories[0]
  } else if (categories.length === 0) {
    selectedSettingCategory.value = ""
  }
}, { immediate: true })

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
    modes: JSON.parse(JSON.stringify(stepSkillModes.value)),
    skillAgents: JSON.parse(JSON.stringify(stepSkillAgents.value))
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

type PipelineSkillTemplate = {
  id: string
  name: string
  template: string
  customVars?: Record<string, string>
  injectMode?: string
  validationRules?: string[]
}

function getStepSkillTemplates(step: number): PipelineSkillTemplate[] {
  const ids = getStepSkillIds(step)
  const templates: PipelineSkillTemplate[] = []
  for (const sid of ids) {
    const s = skillStore.getSkill(sid)
    if (s && s.template) templates.push({
      id: s.id,
      name: s.name,
      template: s.template,
      customVars: s.customVars || {},
      injectMode: s.injectMode || "system_prefix",
      validationRules: s.validationRules || []
    })
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

function getStepSkillAgentId(step: number, si: number): string {
  return stepSkillAgents.value[step + "-" + si] || ""
}

function getStepSkillOutputFormat(step: number, si: number): string {
  const ids = getStepSkillIds(step)
  const sid = ids[si]
  if (!sid) return "text"
  const s = skillStore.getSkill(sid)
  return (s as any)?.outputFormat || "text"
}

type PromptParts = {
  systemSkill?: string
  userPrefix?: string
  userSuffix?: string
}

function getPromptParts(template: string, mode: string): PromptParts {
  if (mode === "user_prefix") return { userPrefix: template }
  if (mode === "user_suffix") return { userSuffix: template }
  return { systemSkill: template }
}

function mergePromptParts(parts: PromptParts[]): PromptParts {
  return {
    systemSkill: parts.map((p) => p.systemSkill).filter(Boolean).join("\n\n"),
    userPrefix: parts.map((p) => p.userPrefix).filter(Boolean).join("\n\n"),
    userSuffix: parts.map((p) => p.userSuffix).filter(Boolean).join("\n\n")
  }
}

function tryParseJson(text: string): { ok: boolean; data?: any } {
  try {
    const jsonMatch = text.match(/```json?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      return { ok: true, data: JSON.parse(jsonMatch[1].trim()) }
    }
    return { ok: true, data: JSON.parse(text.trim()) }
  } catch {
    return { ok: false }
  }
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
  const characterSettings: any[] = []
  const __sc = projectStore.getSettingsCollection()
  for (const __cat of __sc.categories) {
    const __items = __sc.items[__cat] || []
    characterSettings.push(...__items.filter((s: any) => String(__cat || "").includes("人物")))
  }
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
  const bindings: Record<string, string[]> = {}
  const __sc2 = projectStore.getSettingsCollection()
  for (const __cat of __sc2.categories) {
    const __items = __sc2.items[__cat] || []
    for (const __item of __items) {
      if (__item.isBound && __item.name) {
        bindings[__item.name] = __item.boundTo || []
      }
    }
  }
  const lines: string[] = []
  const seen = new Set<string>()
  for (const bKey of Object.keys(bindings)) {
    if (seen.has(bKey)) continue
    seen.add(bKey)
    const __sc3 = projectStore.getSettingsCollection()
      let s: any = null
      for (const __cat of __sc3.categories) {
        const __items = __sc3.items[__cat] || []
        s = __items.find((x: any) => x.name === bKey)
        if (s) break
      }
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
    projectStore.settingsCollection = { categories: [], items: {} }
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

function confirmSettingsLayer() {
  if (currentSettings.value.length === 0) return
  projectStore.saveProject()
  confirmStep(1)
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

async function callApiWithAgent(step: number, skillTemplate: string, prompt: string, skillAgentOverride?: string, promptParts?: PromptParts): Promise<string> {
  const agentId = skillAgentOverride || getStepAgentId(step)
  const agentConfig = agentId ? (agentStore.getAgent(agentId) || null) : getStepAgentConfig(step)
  const provider = providerStore.getProvider(agentConfig?.provider || "")
  const preferredProvider = providerStore.preferredGenerateProvider
  const activeProvider = provider || preferredProvider
  const model = agentConfig?.model || activeProvider?.selectedModel || activeProvider?.models?.[0] || ""
  const skillPart = promptParts?.systemSkill ?? skillTemplate ?? ""
  const agentPart = agentConfig?.systemPrompt || ""
  const systemPrompt = [skillPart, agentPart].filter(Boolean).join("\n\n") || "你是专业小说创作助手。"
  const userPrompt = [promptParts?.userPrefix, prompt, promptParts?.userSuffix].filter(Boolean).join("\n\n")
  const messages = [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }]
  return await providerStore.callApi(activeProvider?.id || "", model, messages)
}

async function callApiWithAgentTimeout(step: number, skillTemplate: string, prompt: string, timeoutMs: number, skillAgentOverride?: string, promptParts?: PromptParts): Promise<string> {
  const result = await Promise.race([
    callApiWithAgent(step, skillTemplate, prompt, skillAgentOverride, promptParts),
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
    const chainCtx = { ...baseCtx }
    // Need 2: chain breakpoint resume
    const bp = pipelineStore.breakpoint
    let startSi = 0
    let current = prompt
    if (bp && bp.step === step && bp.lastSuccessChainIndex !== undefined && bp.lastOutput) {
      startSi = bp.lastSuccessChainIndex + 1
      current = bp.lastOutput
      chainCtx.prevResponse = current
      console.log("[PIPELINE] chain resumed from step " + (startSi + 1) + "/" + templates.length)
    }
    for (let si = startSi; si < templates.length; si++) {
      const t = templates[si]
      const ctxForSkill = { ...chainCtx, ...(t.customVars || {}) }
      const resolvedTemplate = resolveSkillTemplate(t.template, ctxForSkill)
      const useOriginal = si === 0 && startSi === 0
      const nextPrompt = useOriginal
        ? prompt
        : "以下是上一个Skill的输出结果，请根据当前Skill继续处理：\n\n--- 上一步输出 ---\n" + current
      console.log("[PIPELINE] chain step " + (si + 1) + "/" + templates.length + " = " + t.name)
      // Need 1: per-skill agent override
      const skillAgentId = getStepSkillAgentId(step, si)
      const injection = getPromptParts(resolvedTemplate, t.injectMode || "system_prefix")
      if (timeoutMs) {
        current = await callApiWithAgentTimeout(step, injection.systemSkill || "", nextPrompt, timeoutMs, skillAgentId, injection)
      } else {
        current = await callApiWithAgent(step, injection.systemSkill || "", nextPrompt, skillAgentId, injection)
      }
      chainCtx.prevResponse = current
      // Need 2: save breakpoint after each successful step
      pipelineStore.saveBreakpoint({ step, lastSuccessChainIndex: si, lastOutput: current, volumeIndex: selectedVolumeIndex.value })
      // Need 4: outputFormat JSON validation
      const fmt = getStepSkillOutputFormat(step, si)
      if (fmt === "json") {
        const parsed = tryParseJson(current)
        if (!parsed.ok) {
          console.warn("[PIPELINE] JSON parse failed for chain step " + (si + 1) + ", retrying")
          const retryPrompt = nextPrompt + "\n\n[注意] 上次输出不是合法JSON，请严格返回JSON格式，不要包含markdown代码块标记。"
          if (timeoutMs) {
            current = await callApiWithAgentTimeout(step, injection.systemSkill || "", retryPrompt, timeoutMs, skillAgentId, injection)
          } else {
            current = await callApiWithAgent(step, injection.systemSkill || "", retryPrompt, skillAgentId, injection)
          }
          chainCtx.prevResponse = current
          pipelineStore.saveBreakpoint({ step, lastSuccessChainIndex: si, lastOutput: current, volumeIndex: selectedVolumeIndex.value })
        }
      }
    }
    pipelineStore.clearBreakpoint()
    return current
  }
  const resolvedParts = templates.map((t) => {
    const ctxForSkill = { ...baseCtx, ...(t.customVars || {}) }
    return getPromptParts(resolveSkillTemplate(t.template, ctxForSkill), t.injectMode || "system_prefix")
  })
  const merged = mergePromptParts(resolvedParts)
  const combined = merged.systemSkill || resolveSkillTemplate(fallbackTemplate || "", baseCtx)
  const composePrompt = prompt
  let result: string
  if (timeoutMs) {
    result = await callApiWithAgentTimeout(step, combined, composePrompt, timeoutMs, undefined, merged)
  } else {
    result = await callApiWithAgent(step, combined, composePrompt, undefined, merged)
  }
  // Need 4: outputFormat JSON validation for compose
  const firstFmt = getStepSkillOutputFormat(step, 0)
  if (firstFmt === "json") {
    const parsed = tryParseJson(result)
    if (!parsed.ok) {
      console.warn("[PIPELINE] JSON parse failed for compose step " + step + ", retrying")
      const retryPrompt = prompt + "\n\n[注意] 上次输出不是合法JSON，请严格返回JSON格式。"
      if (timeoutMs) {
        result = await callApiWithAgentTimeout(step, combined, retryPrompt, timeoutMs, undefined, merged)
      } else {
        result = await callApiWithAgent(step, combined, retryPrompt, undefined, merged)
      }
    }
  }
  return result
}

function openAddSettingModal() {
  showAddSettingModal.value = true
  const sc = projectStore.getSettingsCollection()
  const currentCat = selectedSettingCategory.value
  const validCat = currentCat && sc.categories.includes(currentCat) ? currentCat : "其他"
  newSettingName.value = ""
  newSettingCategory.value = validCat
  newSettingAttrs.value = ""
}

function confirmAddSetting() {
  if (!newSettingName.value.trim()) return
  const sc = projectStore.getSettingsCollection()
  const cat = newSettingCategory.value
  if (!sc.categories.includes(cat)) sc.categories.push(cat)
  if (!sc.items[cat]) sc.items[cat] = []
  sc.items[cat].push({
    id: "set_" + Date.now() + "_" + Math.random().toString(36).substr(2,6),
    name: newSettingName.value.trim(),
    category: cat,
    content: newSettingAttrs.value,
    attrs: { desc: newSettingAttrs.value },
    isBound: false,
    boundTo: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  })
  projectStore.saveProject()
  showAddSettingModal.value = false
}

function cancelAddSetting() {
  showAddSettingModal.value = false
}

function toggleItemBinding(item: any) {
  if (!item) return
  item.isBound = !item.isBound
  if (item.isBound && (!item.boundTo || item.boundTo.length === 0)) {
    item.boundTo = ['pipeline']
  } else if (!item.isBound) {
    item.boundTo = []
  }
  projectStore.saveProject()
}

function removeSetting(index: number) {
  const sc = projectStore.getSettingsCollection()
  const cat = selectedSettingCategory.value
  const arr = sc.items[cat] || []
  if (index >= 0 && index < arr.length) {
    arr.splice(index, 1)
    projectStore.saveProject()
  }
}

async function genSettings() {
  if (!projectStore.hasOutline || !projectStore.outlineLocked) return
  pipelineStore.startGeneration()
  pipelineStore.updateProgress(10, "正在读取已确认大纲并生成设定")
  try {
    const prompt = "[已确认大纲]\n" + projectStore.outlineText + "\n\n请基于这份已确认的大纲，提取并生成设定项。根据内容自动分配category；没有合适分类时使用设定类。输出JSON数组，每项含name/category/attrsText字段。"
    const result = await runStepSkills(1, prompt, undefined, "你是设定生成专家。基于小说大纲生成详细设定。")
    const settings = extractJsonArray(result)
    if (settings.length > 0) {
      const valid = settings.filter((s: any) => s.name)
      if (valid.length > 0) {
        const sc2 = projectStore.getSettingsCollection()
        for (const item of valid) {
          const cat = (item.category || "其他")
          const name = (item.name || "")
          const existingArr = sc2.items[cat] || []
          if (existingArr.some((e: any) => e.name === name)) continue
          if (!sc2.categories.includes(cat)) sc2.categories.push(cat)
          if (!sc2.items[cat]) sc2.items[cat] = []
          sc2.items[cat].push({
            id: "set_" + Date.now() + "_" + Math.random().toString(36).substr(2,6),
            name: name,
            category: cat,
            content: (item.attrsText || (item.attrs ? JSON.stringify(item.attrs) : "")),
            attrs: item.attrs || { desc: (item.attrsText || "") },
            isBound: false,
            boundTo: [],
            createdAt: Date.now(),
            updatedAt: Date.now()
          })
        }
        projectStore.saveProject()
        if (!selectedSettingCategory.value && sc2.categories.length > 0) {
          selectedSettingCategory.value = sc2.categories[0]
        }
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
    const sc = projectStore.getSettingsCollection()
    const allItems: any[] = []
    for (const cat of sc.categories) {
      const items = sc.items[cat] || []
      allItems.push(...items)
    }
    const settingsText = allItems.map((s: any) => s.name + " - " + JSON.stringify(s.attrs)).join("\n")
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
    // Need 3: supplement generation for insufficient chapters
    let supplementRetry = 0
    while (collected.length < totalChapters && supplementRetry < 3) {
      supplementRetry++
      const remain = totalChapters - collected.length
      const supplementPrompt = "[卷纲]\n" + vol.name + " - " + (vol.outline || vol.summary || "") + "\n\n[本卷总章数]\n" + totalChapters + "\n\n[单章字数]\n" + chapterWords.value + "\n\n已有" + collected.length + "章，继续从第" + (collected.length + 1) + "章生成到第" + totalChapters + "章。输出JSON数组，每项含title/plot字段。不要重复已有章节。数组长度必须恰好等于" + remain + "。"
      try {
        const result = await runStepSkills(3, supplementPrompt, 120000, "你是章节规划师。")
        const supplement = extractJsonArray(result)
        const existingTitles = new Set(collected.map(c => c.title))
        for (const c of supplement) {
          if (c.title && !existingTitles.has(c.title)) {
            c.id = "ch-" + String(volId).replace(/[^a-zA-Z0-9_-]/g, "-") + "-" + String(collected.length + 1).padStart(3, "0")
            collected.push(c)
            existingTitles.add(c.title)
          }
        }
        projectStore.setChapters(volId, [...collected])
        pipelineStore.saveBreakpoint({ volumeIndex: selectedVolumeIndex.value, chapterCount: collected.length, total: totalChapters })
      } catch (e: any) {
        console.warn("[PIPELINE] supplement generation " + supplementRetry + " failed:", e)
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
    const sc = projectStore.getSettingsCollection()
    const allItems: any[] = []
    for (const cat of sc.categories) {
      const items = sc.items[cat] || []
      allItems.push(...items)
    }
    const settingsText = allItems.map((s: any) => s.name + " - " + JSON.stringify(s.attrs)).join("\n")
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
      stepSkillAgents.value = {}
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
    if (saved.skillAgents) {
      stepSkillAgents.value = saved.skillAgents
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
.pl-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: var(--bg-overlay); display: flex; align-items: center; justify-content: center; z-index: var(--z-modal); }
.pl-content { width: min(1200px, 95vw); height: min(850px, 92vh); max-width: 1200px; max-height: 92vh; background: var(--bg-glass); border: 1px solid var(--border-color); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); display: flex; flex-direction: column; }
.pl-header { display: flex; align-items: center; justify-content: space-between; padding: var(--space-5) var(--space-8); border-bottom: 1px solid var(--border-color); font-size: var(--font-size-xl); font-weight: 600; }
.pl-header-title { }
.pl-header-actions { display: flex; align-items: center; gap: var(--space-2); }
.pl-body { display: flex; flex: 1; overflow: hidden; }
/* 左侧五层步骤导航 - 竖排 */
.pl-steps { width: clamp(180px, 16vw, 240px); background: var(--bg-secondary); border-right: 1px solid var(--border-color); padding: 16px 8px; display: flex; flex-direction: column; gap: 4px; flex-shrink: 0; }
.pl-step { display: flex; align-items: center; gap: 10px; padding: 14px 16px; cursor: pointer; border-radius: var(--radius-lg); opacity: 0.5; transition: opacity 0.15s ease, background 0.15s ease; }
.pl-step:hover { opacity: 0.8; background: var(--bg-hover); }
.pl-step.active { opacity: 1; background: var(--accent-dim); }
.pl-step.completed { opacity: 1; }
.pl-step-num { width: 34px; height: 34px; border-radius: 50%; background: var(--bg-tertiary); color: var(--text-primary); display: flex; align-items: center; justify-content: center; font-size: var(--font-size-lg); font-weight: bold; flex-shrink: 0; transition: background 0.15s ease; }
.pl-step.active .pl-step-num { background: var(--accent); color: var(--text-on-accent); }
.pl-step.completed .pl-step-num { background: var(--success); color: var(--text-on-accent); }
.pl-step-label { font-size: var(--font-size-lg); color: var(--text-primary); font-weight: 500; }
.pl-step-check { margin-left: auto; color: var(--success); font-size: var(--font-size-xl); }
/* 右侧内容区 */
.pl-content-right { flex: 1; padding: 32px; overflow-y: auto; min-width: 0; }
.pl-step-panel h3 { font-size: var(--font-size-xxl); margin-bottom: 20px; }
.pl-desc { font-size: var(--font-size-lg); color: var(--text-secondary); margin-bottom: 20px; padding: 14px; background: var(--bg-secondary); border-radius: var(--radius-lg); line-height: 1.6; }
.pl-textarea { width: 100%; min-height: 400px; background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 16px; font-size: var(--font-size-lg); line-height: 1.8; resize: vertical; outline: none; }
.pl-input { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 6px 12px; font-size: var(--font-size-md); height: 36px; outline: none; flex: 1; }
.pl-input-sm { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 6px 10px; font-size: var(--font-size-md); height: var(--input-height, 34px); outline: none; }
.pl-attrs-input { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: var(--space-4) var(--space-6); font-size: var(--font-size-md); min-height: 80px; flex: 1; resize: vertical; outline: none; }
.pl-vol-config { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; font-size: var(--font-size-lg); flex-wrap: wrap; }
.pl-vol-config label { color: var(--text-secondary); }
.pl-vol-list { display: flex; flex-direction: column; gap: 14px; margin-bottom: 16px; }
.pl-vol-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.vol-words { font-size: var(--font-size-md); color: var(--text-muted); flex-shrink: 0; }
.pl-vol-outline { width: 100%; min-height: 100px; background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 10px; font-size: var(--font-size-md); resize: vertical; outline: none; margin-bottom: 10px; }
.pl-ch-config { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; font-size: var(--font-size-lg); flex-wrap: wrap; }
.pl-ch-config label { color: var(--text-secondary); }
.pl-ch-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; max-height: 350px; overflow-y: auto; }
.ch-title { flex: 1; font-size: var(--font-size-md); color: var(--text-primary); }
.pl-body-config { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; font-size: var(--font-size-lg); flex-wrap: wrap; }
.pl-body-config label { color: var(--text-secondary); }
.pl-body-result { background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 16px; margin-bottom: 12px; max-height: 400px; overflow-y: auto; }
.pl-body-text { font-size: var(--font-size-lg); line-height: 1.8; white-space: pre-wrap; color: var(--text-primary); }
.pl-gen-options { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; font-size: var(--font-size-lg); color: var(--text-secondary); flex-wrap: wrap; }
.pl-actions { display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap; }
.pl-result { background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 20px; margin: 20px 0; max-height: 450px; overflow-y: auto; white-space: pre-wrap; font-size: var(--font-size-lg); color: var(--text-primary); }
.pl-gen-hint { color: var(--text-muted); font-size: var(--font-size-md); }
.pl-vol-card.confirmed { border-color: var(--success); }
.pl-ch-card { display: flex; align-items: center; padding: var(--space-5) var(--space-6); background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: var(--radius-md); }
.pl-ch-card-main { width: 100%; }
.pl-ch-card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.pl-ch-plot { width: 100%; min-height: 54px; background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 8px 10px; font-size: var(--font-size-md); line-height: 1.6; resize: vertical; outline: none; }
.empty-hint { color: var(--text-muted); font-size: var(--font-size-lg); text-align: center; padding: 30px; }
.input-w-60 { width: 60px; }
.input-w-80 { width: 80px; }

.pl-tools-title { font-size: var(--font-size-sm); font-weight: 600; color: var(--text-primary); margin-bottom: 6px; }
.pl-readonly { opacity: 0.7; cursor: default; }
.pl-step-tools { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
.pl-agent-mode-bar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: var(--space-4) var(--space-6); background: var(--bg-elevated, var(--bg-secondary)); border: 1px solid var(--border-color); border-radius: var(--radius-md); }
.pl-agent-mode-bar .pl-label, .pl-agent-mode-bar .pl-mode-label { font-size: var(--font-size-md); color: var(--text-secondary); white-space: nowrap; }
.pl-agent-mode-bar .pl-select { height: var(--input-height, 34px); padding: 0 10px; background: var(--bg-input); border: 1px solid var(--border-color); border-radius: var(--radius-sm); color: var(--text-primary); font-size: var(--font-size-md); cursor: pointer; }
.pl-agent-select { flex: 1 1 160px; min-width: 160px; }
.pl-mode-select { flex: 1 1 150px; min-width: 150px; }
.pl-skill-bar { display: flex; align-items: center; gap: 8px; padding: var(--space-4) var(--space-6); margin-bottom: 12px; background: var(--bg-elevated, var(--bg-secondary)); border: 1px solid var(--border-color); border-radius: var(--radius-md); font-size: var(--font-size-md); color: var(--text-primary); }
.pl-skill-bar .pl-label { font-size: var(--font-size-md); color: var(--text-secondary); white-space: nowrap; }
.pl-skill-bar .pl-select { flex: 1; height: var(--input-height, 34px); padding: 0 8px; background: var(--bg-input); border: 1px solid var(--border-color); border-radius: var(--radius-sm); color: var(--text-primary); font-size: var(--font-size-md); cursor: pointer; min-width: 100px; }
.pl-skill-bar .btn-icon { height: 28px; width: 28px; padding: 0; font-size: var(--font-size-lg); line-height: 1; display: flex; align-items: center; justify-content: center; border: 1px solid var(--border-color); border-radius: var(--radius-xs); background: var(--bg-input); color: var(--text-primary); cursor: pointer; }
.pl-skill-bar .btn-icon:hover { background: var(--accent-dim); color: var(--accent); }
.pl-chip-close { height: 28px; width: 28px; padding: 0; font-size: var(--font-size-lg); line-height: 1; display: flex; align-items: center; justify-content: center; border: 1px solid var(--border-color); border-radius: var(--radius-xs); background: var(--bg-input); color: var(--text-primary); cursor: pointer; }
.pl-chip-close:hover { background: var(--accent-dim); color: var(--accent); }
.pl-tools-label { font-size: var(--font-size-sm); color: var(--text-muted); white-space: nowrap; }
.pl-skills-list { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; min-height: 24px; }
.pl-skill-chip { padding: 2px 8px; border-radius: var(--radius-lg); font-size: var(--font-size-xs); background: var(--accent-dim); color: var(--accent); border: 1px solid var(--accent-glow, transparent); display: inline-flex; align-items: center; gap: 4px; }
.pl-tools-section { padding: 6px 0; margin-bottom: 10px; border-bottom: 1px solid var(--border-color); }
.pl-tools-grid { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.pl-tool-result { margin-top: 6px; padding: 6px 10px; background: var(--bg-input); border: 1px solid var(--border-color); border-radius: var(--radius-sm); font-size: var(--font-size-sm); color: var(--text-primary); max-height: 60px; overflow-y: auto; }
.pl-tool-loading { margin-top: 4px; font-size: var(--font-size-sm); color: var(--accent); }

.pl-chip-agent { height: 22px; padding: 0 6px; font-size: 10px; min-width: 60px; width: auto; border-radius: var(--radius-sm); background: var(--bg-input); border: 1px solid var(--border-color); color: var(--text-primary); cursor: pointer; }
.pl-add-setting-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: var(--bg-overlay); display: flex; align-items: center; justify-content: center; z-index: calc(var(--z-modal) + 100); }
.pl-add-setting-modal { width: min(640px, 94vw); background: var(--bg-glass); border: 1px solid var(--border-color); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); overflow: hidden; }
.pl-add-setting-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border-color); font-size: var(--font-size-lg); font-weight: 600; }
.pl-add-setting-body { display: flex; flex-direction: column; gap: 8px; padding: 20px; }
.pl-add-setting-body label { font-size: var(--font-size-md); color: var(--text-secondary); }
.pl-add-setting-body .pl-input-sm { width: 100%; }
.pl-add-setting-body .pl-attrs-input { min-height: 140px; }
.pl-add-setting-footer { display: flex; justify-content: flex-end; gap: 10px; padding: 14px 20px; border-top: 1px solid var(--border-color); }


.pl-settings-workspace {
  display: grid;
  grid-template-columns: minmax(180px, 220px) minmax(0, 1fr);
  grid-template-areas:
    "navigation add-category"
    "navigation editor";
  gap: var(--space-4);
  min-height: 260px;
  padding: var(--space-4);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-secondary);
}
.pl-settings-navigation {
  grid-area: navigation;
  min-width: 0;
  padding-right: var(--space-4);
  border-right: 1px solid var(--border-color);
}
.pl-settings-navigation-label {
  margin-bottom: var(--space-3);
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  font-weight: 600;
}
.pl-sc-categories {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
  max-height: 320px;
  overflow-y: auto;
}
.pl-sc-cat-item,
.pl-sc-add-cat {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  width: 100%;
  min-height: var(--input-height);
  padding: 0 var(--space-3);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  background: transparent;
  font-size: var(--font-size-md);
  text-align: left;
  cursor: pointer;
}
.pl-sc-cat-item:hover,
.pl-sc-add-cat:hover {
  background: var(--bg-hover);
}
.pl-sc-cat-item.active {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-dim);
  font-weight: 600;
}
.pl-sc-cat-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pl-sc-cat-check { color: var(--success); flex-shrink: 0; }
.pl-sc-cat-delete { color: var(--text-muted); flex-shrink: 0; }
.pl-sc-add-cat {
  border-color: var(--border-color);
  color: var(--text-secondary);
  background: var(--bg-input);
}
.pl-sc-add-cat-row {
  grid-area: add-category;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}
.pl-sc-add-cat-row .pl-input-sm { min-width: 0; flex: 1; }
.pl-sc-editor {
  grid-area: editor;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.pl-sc-editor-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}
.pl-sc-editor-kicker {
  display: block;
  margin-bottom: var(--space-1);
  color: var(--text-muted);
  font-size: var(--font-size-xs);
}
.pl-sc-editor-heading h4 {
  margin: 0;
  color: var(--text-primary);
  font-size: var(--font-size-lg);
}
.pl-sc-editor-count { color: var(--text-muted); font-size: var(--font-size-sm); white-space: nowrap; }
.pl-settings-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
  max-height: 360px;
  overflow-y: auto;
}
.pl-setting-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
  padding: var(--space-4);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-tertiary);
}
.pl-setting-item-main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}
.pl-setting-item-main .pl-input { min-width: 0; }
.pl-setting-item .pl-attrs-input {
  width: 100%;
  min-height: 86px;
  box-sizing: border-box;
  line-height: 1.55;
}
.pl-sc-category-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--border-color);
}
.pl-sc-category-actions button { min-width: 120px; }
.pl-settings-footer-actions { margin-top: var(--space-4); }

@media (max-width: 760px) {
  .pl-settings-workspace {
    grid-template-columns: 1fr;
    grid-template-areas:
      "navigation"
      "add-category"
      "editor";
  }
  .pl-settings-navigation {
    padding-right: 0;
    padding-bottom: var(--space-3);
    border-right: 0;
    border-bottom: 1px solid var(--border-color);
  }
  .pl-sc-categories { max-height: 180px; }
  .pl-setting-item-main { grid-template-columns: minmax(0, 1fr) auto; }
  .pl-setting-item-main .btn-danger { grid-column: 2; grid-row: 1; }
}

</style>
