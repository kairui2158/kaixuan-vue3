<template>
  <div id="pipeline-panel" class="pl-overlay pl-fullscreen" @click.self="$emit('close')">
    <div class="pl-content pl-content-fullscreen">
      <div class="pl-header">
        <span class="pl-header-title">生成流水线</span>
        <div class="pl-header-actions">
          <button class="btn-sm btn-secondary" id="btn-pl-minimize" title="缩小到顶栏" @click="$emit('minimize')">缩小</button>
          <button class="btn-sm btn-secondary" id="btn-exec-log" @click="showExecLog = !showExecLog">执行日志</button>
          <button class="btn-sm btn-secondary" id="btn-export-pipeline-bindings" @click="exportPipelineBindings">导出绑定</button>
          <button class="btn-sm btn-secondary" id="btn-import-pipeline-bindings" @click="importPipelineBindings">导入绑定</button>
          <button class="btn-sm btn-secondary" id="btn-flow-toggle" @click="showFlowView = !showFlowView">{{ showFlowView ? '步骤视图' : '流程视图' }}</button>
          <button v-if="pipelineStore.isGenerating" id="btn-pl-cancel-generation" class="btn-sm btn-danger" @click="pipelineStore.cancelGeneration()">取消生成</button>
          <button id="btn-close-pl" class="modal-close" @click="$emit('close')">&times;</button>
        </div>
      </div>
      <div class="pl-body">
        <div v-if="bindingImportPreview" id="pl-binding-import-preview" class="pl-binding-import-preview" role="dialog" aria-modal="true">
          <div class="pl-binding-import-card">
            <h3>确认导入流水线绑定</h3>
            <p class="pl-binding-import-source">来源：{{ bindingImportPreview.source || '未知文件' }}</p>
            <p>层级智能体 {{ Object.keys(bindingImportPreview.bindings.agents).length }} 项，Skill {{ Object.values(bindingImportPreview.bindings.skills).flat().length }} 项，Skill-Agent {{ Object.keys(bindingImportPreview.bindings.skillAgents).length }} 项，模式 {{ Object.keys(bindingImportPreview.bindings.modes).length }} 项。</p>
            <p v-if="bindingImportPreview.issues.length" class="pl-binding-import-warnings">解析提示：{{ bindingImportPreview.issues.map(issue => issue.message).join('；') }}</p>
            <div class="pl-actions">
              <button id="btn-confirm-import-pipeline-bindings" class="btn-primary" :disabled="!bindingImportPreview.ok" @click="applyPipelineBindings">确认应用</button>
              <button id="btn-cancel-import-pipeline-bindings" class="btn-secondary" @click="bindingImportPreview = null">取消</button>
            </div>
          </div>
        </div>
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
          <div v-show="!showFlowView" class="pl-step-view">
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
                <option value="compose">并行</option>
                <option value="chain">串行</option>
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
            <template v-for="(sid, si) in stepSkills[0]" :key="'0-' + sid">
              <span v-if="sid" class="pl-skill-chip">
                <span class="pl-chip-seq">{{ si + 1 }}</span>
                <span>{{ getSkillName(sid) }}</span>
                <select v-if="stepSkillModes[0] === 'chain'" v-model="stepSkillAgents[getSkillAgentKey(0, sid)]" class="pl-select pl-chip-agent" @change="saveStepConfig">
                  <option value="">默认</option>
                  <option v-for="a in agentStore.agents" :key="a.id" :value="a.id">{{ a.name }}</option>
                </select>
                <button class="btn-icon pl-chip-close" title="移除" @click="removeStepSkill(1, si)">&times;</button>
              </span>
            </template>
          </div>
            <textarea id="pl-outline" :value="projectStore.pipelineOutlineText" class="pl-textarea" placeholder="输入或粘贴大纲全文..." :readonly="projectStore.outlineLocked" :class="{ 'pl-readonly': projectStore.outlineLocked }" @input="projectStore.setOutline(($event.target as HTMLTextAreaElement).value)"></textarea>
            <div class="pl-gen-options">
              <label>全书字数（万字）：</label>
              <input id="pl-book-word-count" type="number" v-model.number="bookWordCount" min="0" max="1000" class="input-w-60" @change="saveBookWordCount" />
            </div>
            <div class="pl-actions">
              <button id="btn-pl-confirm-outline" class="btn-primary" @click="confirmStep(0)" :disabled="!projectStore.hasOutline || bookWordCount <= 0">确认字数并进入下一步</button>
            </div>
          </div>
          <div v-show="pipelineStore.currentStep === 1" id="pl-step-2-content" class="pl-step-panel">
            <div v-if="projectStore.bookWordCountChars > 0" id="pl-settings-linked-book-words" class="pl-gen-hint">全书已确认字数：{{ projectStore.bookWordCountChars / 10000 }} 万字</div>
          <div class="pl-step-tools pl-settings-tools">
            <div id="pl-settings-control-row" class="pl-settings-control-row">
              <span class="pl-label">本层智能体:</span>
              <select id="pl-s2-agent" v-model="stepAgents[1]" class="pl-select pl-agent-select" @change="saveStepConfig">
                <option value="">不使用智能体</option>
                <option v-for="a in agentStore.agents" :key="a.id" :value="a.id">{{ a.name }}</option>
              </select>
              <span class="pl-label">Skill:</span>
              <select id="pl-s2-skill" v-model="stepSkillSelect[2]" class="pl-select pl-skill-select" @change="addStepSkill(2)">
                <option value="">无</option>
                <option v-for="s in skillStore.skills" :key="s.id" :value="s.id">{{ s.name }}</option>
              </select>
              <button class="btn-icon" id="pl-s2-add-skill" title="添加Skill" @click="addStepSkill(2)">+</button>
              <span class="pl-mode-label">Skill模式:</span>
              <select id="pl-s2-mode" v-model="stepSkillModes[1]" class="pl-select pl-mode-select" @change="saveStepConfig">
                <option value="compose">并行</option>
                <option value="chain">串行</option>
              </select>
            </div>
            <div id="pl-s2-skills-list" class="pl-skills-list pl-selected-skills-row">
              <template v-for="(sid, si) in stepSkills[1]" :key="'1-' + sid">
                <span v-if="sid" class="pl-skill-chip">
                  <span class="pl-chip-seq">{{ si + 1 }}</span>
                  <span>{{ getSkillName(sid) }}</span>
                  <select v-if="stepSkillModes[1] === 'chain'" v-model="stepSkillAgents[getSkillAgentKey(1, sid)]" class="pl-select pl-chip-agent" @change="saveStepConfig">
                    <option value="">默认</option>
                    <option v-for="a in agentStore.agents" :key="a.id" :value="a.id">{{ a.name }}</option>
                  </select>
                  <button class="btn-icon pl-chip-close" title="移除" @click="removeStepSkill(2, si)">&times;</button>
                </span>
              </template>
            </div>
          </div>
            <div id="pl-style-card" class="pl-style-card" v-if="true">
              <div class="pl-style-card-header" @click="styleCardExpanded = !styleCardExpanded">
                <span class="pl-style-card-title">创作风格</span>
                <span class="pl-style-card-summary" v-if="styleTags || pacingParams">{{ styleTags }} | {{ pacingParams }}</span>
                <span class="pl-style-card-summary" v-else>待 AI 分析</span>
                <span class="pl-style-card-toggle">{{ styleCardExpanded ? '收起高级设置' : '展开高级设置' }}</span>
              </div>
              <div class="pl-style-card-body" v-show="styleCardExpanded">
                <div class="pl-style-tags-section">
                  <span class="pl-style-section-label">叙事风格</span>
                  <div class="pl-style-tag-pool">
                    <label v-for="chip in styleTagChips" :key="chip.label" class="pl-style-tag-chip" :class="{active: chip.active}">
                      <input type="checkbox" :checked="chip.active" @change="toggleStyleTag(chip.label, ($event.target as HTMLInputElement).checked)" />
                      <span>{{ chip.label }}</span>
                    </label>
                  </div>
                  <div class="pl-style-tag-add">
                    <input v-model="newCustomTag" class="pl-input-sm" placeholder="添加自定义标签" @keyup.enter="addCustomTag" />
                    <button class="btn-sm btn-secondary" @click="addCustomTag">+</button>
                  </div>
                </div>
                <div class="pl-style-pacing-section">
                  <span class="pl-style-section-label">剧情节奏</span>
                  <div class="pl-pacing-grid">
                    <div class="pl-pacing-item">
                      <label>叙事速度</label>
                      <select v-model="pacingParamsObj.speed" class="pl-input-sm" @change="syncPacingToString">
                        <option v-for="o in pacingSpeedOptions" :key="o" :value="o">{{ o }}</option>
                      </select>
                    </div>
                    <div class="pl-pacing-item">
                      <label>紧张度</label>
                      <div class="pl-pacing-slider">
                        <input type="range" min="1" max="5" v-model.number="pacingParamsObj.tension" @input="syncPacingToString" />
                        <span>{{ pacingParamsObj.tension }}/5</span>
                      </div>
                    </div>
                    <div class="pl-pacing-item">
                      <label>信息密度</label>
                      <select v-model="pacingParamsObj.density" class="pl-input-sm" @change="syncPacingToString">
                        <option v-for="o in pacingDensityOptions" :key="o" :value="o">{{ o }}</option>
                      </select>
                    </div>
                    <div class="pl-pacing-item">
                      <label>视角风格</label>
                      <select v-model="pacingParamsObj.perspective" class="pl-input-sm" @change="syncPacingToString">
                        <option v-for="o in pacingPerspectiveOptions" :key="o" :value="o">{{ o }}</option>
                      </select>
                    </div>
                    <div class="pl-pacing-item">
                      <label>情感基调</label>
                      <select v-model="pacingParamsObj.tone" class="pl-input-sm" @change="syncPacingToString">
                        <option v-for="o in pacingToneOptions" :key="o" :value="o">{{ o }}</option>
                      </select>
                    </div>
                  </div>
                  <button class="btn-sm btn-secondary pl-pacing-restore" @click="restoreAiPacing">恢复AI建议</button>
                </div>
              </div>
            </div>
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

              <div v-if="selectedSettingCategory && projectStore.hasOutline" class="pl-sc-content-frame">
                <section class="pl-sc-editor" aria-live="polite">
                  <div class="pl-sc-editor-heading">
                    <div>
                      <span class="pl-sc-editor-kicker">当前分类</span>
                      <h4>{{ selectedSettingCategory }}</h4>
                    </div>
                    <span class="pl-sc-editor-count">{{ filteredSettings.length }} 项设定</span>
                  </div>

                  <div id="pl-bound-settings-list" class="pl-settings-list">
                    <article
                      v-for="(s, i) in filteredSettings"
                      :key="s.id || i"
                      class="pl-setting-card"
                      :class="{ active: selectedSettingId === s.id }"
                      @click="selectedSettingId = s.id"
                    >
                      <span class="pl-setting-item-name">{{ s.name || '未命名设定' }}</span>
                      <span class="pl-setting-item-summary">{{ s.content || '暂无属性内容' }}</span>
                      <div class="pl-setting-card-actions">
                        <button
                          type="button"
                          class="btn-sm"
                          :class="s.isBound ? 'btn-primary' : 'btn-secondary'"
                          @click.stop="toggleItemBinding(s)"
                        >
                          {{ s.isBound ? '解除绑定' : '绑定' }}
                        </button>
                        <button
                          type="button"
                          class="btn-sm btn-secondary pl-setting-info-btn"
                          :aria-label="`查看${s.name || '未命名设定'}信息`"
                          title="查看信息"
                          @click.stop="openSettingDetailModal(s)"
                        >
                          信息
                        </button>
                      </div>
                      <span class="pl-setting-item-index" aria-hidden="true">{{ i + 1 }}</span>
                    </article>
                    <p v-if="filteredSettings.length === 0" class="empty-hint">该分类还没有设定内容</p>
                  </div>

                  <div v-if="selectedSettingItem" class="pl-setting-detail" aria-label="当前设定编辑区">
                    <div class="pl-setting-detail-heading">
                      <span>当前设定</span>
                      <span class="pl-setting-detail-status">{{ selectedSettingItem.isBound ? '已绑定到流水线' : '未绑定' }}</span>
                    </div>
                    <div class="pl-setting-detail-fields">
                      <input v-model="selectedSettingItem.name" class="pl-input" placeholder="设定名称" @change="saveSettingItem(selectedSettingItem)" />
                      <textarea v-model="selectedSettingItem.content" class="pl-attrs-input" placeholder="输入该设定的属性内容" @change="saveSettingItem(selectedSettingItem)"></textarea>
                    </div>
                    <div class="pl-setting-detail-actions">
                      <button type="button" class="btn-sm" :class="selectedSettingItem.isBound ? 'btn-primary' : 'btn-secondary'" @click="toggleItemBinding(selectedSettingItem)">{{ selectedSettingItem.isBound ? '解除绑定' : '绑定到流水线' }}</button>
                      <button type="button" class="btn-danger btn-sm" @click="removeSetting(filteredSettings.findIndex((item) => item.id === selectedSettingItem?.id))">删除当前设定</button>
                      <button type="button" class="btn-primary btn-sm" @click="saveSettingItem(selectedSettingItem)">保存当前设定</button>
                    </div>
                  </div>

                  <div class="pl-sc-category-actions">
                    <button type="button" class="btn-secondary" @click="openAddSettingModalForCategory">+ 该类新增</button>
                    <button type="button" class="btn-secondary" @click="bindCategorySettings">一键绑定到全局</button>
                    <button type="button" class="btn-primary" @click="confirmSettingCategory">{{ isCategoryConfirmed(selectedSettingCategory) ? '已完成' : '确认该类' }}</button>
                  </div>
                </section>
              </div>
              <p v-else class="empty-hint">解析大纲后，分类和设定内容会显示在这里</p>
            </div>
            <div class="pl-actions pl-settings-footer-actions">
              <button id="btn-pl-gen-settings" class="btn-primary" @click="genSettings" :disabled="pipelineStore.isGenerating || !projectStore.hasOutline || !projectStore.outlineLocked">
                {{ pipelineStore.isGenerating ? 'AI生成中...' : 'AI设定生成 / 解析大纲' }}
              </button>
              <button id="btn-pl-confirm-settings" class="btn-primary" @click="confirmSettingsLayer" :disabled="currentSettings.length === 0">确认/保存设定层</button>
            </div>
            <div
              v-if="settingsGenerationFeedbackVisible"
              id="pl-settings-generation-overlay"
              class="pl-generation-feedback-overlay"
              @click.self="closeSettingsGenerationFeedback"
            >
              <section
                id="pl-settings-generation-feedback"
                class="pl-generation-feedback-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="pl-settings-generation-title"
              >
                <div class="pl-generation-feedback-header">
                  <strong id="pl-settings-generation-title">设定层 AI 生成进度</strong>
                  <span>{{ pipelineStore.generationProgress }}%</span>
                </div>
                <div class="pl-generation-progress-track" aria-label="设定生成进度">
                  <div class="pl-generation-progress-value" :style="{ width: pipelineStore.generationProgress + '%' }"></div>
                </div>
                <div id="pl-settings-api-log" class="pl-generation-log" aria-label="API工作信息">
                  <div v-for="(line, index) in settingsGenerationLogs" :key="index" class="pl-generation-log-line">
                    <span class="pl-generation-log-dot" aria-hidden="true"></span>
                    <span>{{ line }}</span>
                  </div>
                </div>
                <div class="pl-generation-modal-footer">
                  <div class="pl-generation-status">{{ pipelineStore.generationStatus || '准备开始' }}</div>
                  <div class="pl-generation-modal-actions">
                    <button
                      v-if="pipelineStore.isGenerating"
                      id="pl-settings-cancel-generation"
                      class="btn-danger"
                      @click="pipelineStore.cancelGeneration()"
                    >
                      取消生成
                    </button>
                    <button v-else class="btn-secondary" @click="closeSettingsGenerationFeedback">关闭</button>
                  </div>
                </div>
              </section>
            </div>
          </div>
          <div v-show="pipelineStore.currentStep === 2" id="pl-step-3-content" class="pl-step-panel">
          <div class="pl-step-tools pl-settings-tools">
            <div id="pl-volume-control-row" class="pl-settings-control-row">
              <span class="pl-label">本层智能体:</span>
              <select id="pl-s3-agent" v-model="stepAgents[2]" class="pl-select pl-agent-select" @change="saveStepConfig">
                <option value="">不使用智能体</option>
                <option v-for="a in agentStore.agents" :key="a.id" :value="a.id">{{ a.name }}</option>
              </select>
              <span class="pl-label">Skill:</span>
              <select id="pl-s3-skill" v-model="stepSkillSelect[3]" class="pl-select pl-skill-select" @change="addStepSkill(3)">
                <option value="">无</option>
                <option v-for="s in skillStore.skills" :key="s.id" :value="s.id">{{ s.name }}</option>
              </select>
              <button class="btn-icon" id="pl-s3-add-skill" title="添加Skill" @click="addStepSkill(3)">+</button>
              <span class="pl-mode-label">Skill模式:</span>
              <select id="pl-s3-mode" v-model="stepSkillModes[2]" class="pl-select pl-mode-select" @change="saveStepConfig">
                <option value="compose">并行</option>
                <option value="chain">串行</option>
              </select>
            </div>
            <div id="pl-s3-skills-list" class="pl-skills-list pl-selected-skills-row">
            <template v-for="(sid, si) in stepSkills[2]" :key="'2-' + sid">
              <span v-if="sid" class="pl-skill-chip">
                <span class="pl-chip-seq">{{ si + 1 }}</span>
                <span>{{ getSkillName(sid) }}</span>
                <select v-if="stepSkillModes[2] === 'chain'" v-model="stepSkillAgents[getSkillAgentKey(2, sid)]" class="pl-select pl-chip-agent" @change="saveStepConfig">
                  <option value="">默认</option>
                  <option v-for="a in agentStore.agents" :key="a.id" :value="a.id">{{ a.name }}</option>
                </select>
                <button class="btn-icon pl-chip-close" title="移除" @click="removeStepSkill(3, si)">&times;</button>
              </span>
            </template>
          </div>
          </div>
             <div id="pl-volume-config" class="pl-vol-config">
               <div v-if="bookWordCount > 0" id="pl-volume-linked-book-words" class="pl-volume-linked-book-words" role="status" aria-live="polite">
                 <span class="pl-volume-linked-book-words-label">大纲已锁定全书字数</span>
                 <strong>{{ bookWordCount }} 万字</strong>
               </div>
               <label>卷数</label>
               <input id="pl-volume-count" type="number" :value="volumeCount" class="input-w-60" min="1" max="20" @change="syncVolumeCount($event)" />
               <span v-if="volumeCountHint" id="pl-volume-count-hint" class="pl-gen-hint" role="alert">{{ volumeCountHint }}</span>
            </div>
            <div id="pl-vol-list" class="pl-vol-list">
              <div v-if="projectStore.volumes.length > 0" id="pl-volume-select-list" class="pl-volume-table" role="table" aria-label="卷纲列表">
                <div class="pl-volume-table-head" role="row">
                  <span class="pl-volume-col pl-volume-col-index">序号</span>
                  <span class="pl-volume-col pl-volume-col-name">卷名</span>
                  <span class="pl-volume-col pl-volume-col-outline">纲要摘要</span>
                  <span class="pl-volume-col pl-volume-col-words">AI分配字数</span>
                  <span class="pl-volume-col pl-volume-col-status">状态</span>
                  <span class="pl-volume-col pl-volume-col-actions">操作</span>
                </div>
                <template v-for="(vol, i) in projectStore.volumes" :key="vol.id || i">
                  <div
                    :id="'pl-volume-select-' + i"
                    class="pl-volume-row"
                    :class="{ active: selectedVolumeIndex === i, expanded: expandedVolumeIndex === i }"
                    role="row"
                    @click="selectedVolumeIndex = i"
                  >
                    <span class="pl-volume-col pl-volume-col-index">{{ i + 1 }}</span>
                    <span class="pl-volume-col pl-volume-col-name" :title="vol.name">{{ vol.name || '未命名卷' }}</span>
                    <span class="pl-volume-col pl-volume-col-outline" :title="vol.outline || ''">{{ volumeOutlineExcerpt(vol.outline) }}</span>
                    <span class="pl-volume-col pl-volume-col-words">{{ formatVolumeWords(vol) }}</span>
                    <span class="pl-volume-col pl-volume-col-status" :class="volumeStatusClass(vol)">{{ volumeStatusText(vol) }}</span>
                    <span class="pl-volume-col pl-volume-col-actions" @click.stop>
                      <button
                        :id="'btn-pl-bind-volume-' + i"
                        class="btn-sm"
                        :class="vol.isBound ? 'btn-secondary' : 'btn-primary'"
                        :disabled="!vol.confirmed"
                        :title="vol.confirmed ? '' : '请先保存并锁定本卷'"
                        @click="toggleVolumeBinding(i)"
                      >
                        {{ vol.isBound ? '解除绑定' : '绑定到章节层' }}
                      </button>
                      <button :id="'btn-pl-edit-volume-' + i" class="btn-sm" @click="toggleVolumeExpand(i)">
                        {{ expandedVolumeIndex === i ? '收起' : '编辑' }}
                      </button>
                      <button :id="'btn-pl-delete-volume-' + i" class="btn-sm btn-danger" @click="deleteVolume(i)">删除</button>
                    </span>
                  </div>
                  <section v-if="expandedVolumeIndex === i" :id="'pl-volume-editor-' + i" class="pl-volume-row-editor" :aria-label="(vol.name || '未命名卷') + ' 编辑区'">
                    <div class="pl-volume-editor-grid">
                      <input v-model="vol.name" class="pl-input" placeholder="卷名" :readonly="vol.confirmed" @change="projectStore.saveProject()" />
                      <input v-model="vol.summary" class="pl-input" placeholder="摘要" :readonly="vol.confirmed" @change="projectStore.saveProject()" />
                    </div>
                    <textarea v-model="vol.outline" class="pl-vol-outline" placeholder="卷纲要" :readonly="vol.confirmed" @change="projectStore.saveProject()"></textarea>
                    <div class="pl-volume-card-actions">
                      <button
                        :id="'btn-pl-save-volume-' + i"
                        class="btn-sm btn-primary"
                        :disabled="vol.confirmed || !vol.name.trim()"
                        @click="saveVolume(i)"
                      >
                        {{ vol.confirmed ? '已锁定' : '保存并锁定本卷' }}
                      </button>
                      <span class="pl-volume-editor-words">{{ formatVolumeWords(vol) }}</span>
                    </div>
                  </section>
                </template>
              </div>
              <p v-else class="empty-hint">暂无卷纲，请先生成或确认大纲字数</p>
            </div>
            <div
              v-if="volumeGenerationFeedbackVisible"
              id="pl-volume-generation-overlay"
              class="pl-generation-feedback-overlay"
              @click.self="closeVolumeGenerationFeedback"
            >
              <section
                id="pl-volume-generation-feedback"
                class="pl-generation-feedback-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="pl-volume-generation-title"
              >
                <div class="pl-generation-feedback-header">
                  <strong id="pl-volume-generation-title">卷纲层 AI 生成进度</strong>
                  <span>{{ pipelineStore.generationProgress }}%</span>
                </div>
                <div class="pl-generation-progress-track" aria-label="卷纲生成进度">
                  <div class="pl-generation-progress-value" :style="{ width: pipelineStore.generationProgress + '%' }"></div>
                </div>
                <div id="pl-volume-api-log" class="pl-generation-log" aria-label="卷纲 API 工作信息">
                  <div v-for="(line, index) in volumeGenerationLogs" :key="index" class="pl-generation-log-line">
                    <span class="pl-generation-log-dot" aria-hidden="true"></span>
                    <span>{{ line }}</span>
                  </div>
                </div>
                <div class="pl-generation-modal-footer">
                  <div class="pl-generation-status">{{ pipelineStore.generationStatus || '准备开始' }}</div>
                  <div class="pl-generation-modal-actions">
                    <button
                      v-if="pipelineStore.isGenerating"
                      id="pl-volume-cancel-generation"
                      class="btn-danger"
                      @click="pipelineStore.cancelGeneration()"
                    >
                      取消生成
                    </button>
                    <button v-else class="btn-secondary" @click="closeVolumeGenerationFeedback">关闭</button>
                  </div>
                </div>
              </section>
            </div>
            <div class="pl-actions">
              <button id="btn-pl-gen-volumes" class="btn-primary" @click="genVolumes('auto')" :disabled="pipelineStore.isGenerating">AI生成全卷</button>
              <button id="btn-pl-gen-single-volume" class="btn-secondary" @click="genVolumes('single')" :disabled="pipelineStore.isGenerating">逐卷生成</button>
              <button id="btn-pl-confirm-volumes" class="btn-secondary" @click="confirmStep(2)" :disabled="projectStore.volumes.length === 0">确认完成下一步</button>
            </div>
          </div>
         <div v-show="pipelineStore.currentStep === 3" id="pl-step-4-content" class="pl-step-panel">
           <h3 class="pl-sr-only">章节</h3>
          <div class="pl-step-tools pl-settings-tools">
            <div id="pl-chapter-control-row" class="pl-settings-control-row">
              <span class="pl-label">本层智能体:</span>
              <select id="pl-s4-agent" v-model="stepAgents[3]" class="pl-select pl-agent-select" @change="saveStepConfig">
                <option value="">不使用智能体</option>
                <option v-for="a in agentStore.agents" :key="a.id" :value="a.id">{{ a.name }}</option>
              </select>
              <span class="pl-label">Skill:</span>
              <select id="pl-s4-skill" v-model="stepSkillSelect[4]" class="pl-select pl-skill-select" @change="addStepSkill(4)">
                <option value="">无</option>
                <option v-for="s in skillStore.skills" :key="s.id" :value="s.id">{{ s.name }}</option>
              </select>
              <button class="btn-icon" id="pl-s4-add-skill" title="添加Skill" @click="addStepSkill(4)">+</button>
              <span class="pl-mode-label">Skill模式:</span>
              <select id="pl-s4-mode" v-model="stepSkillModes[3]" class="pl-select pl-mode-select" @change="saveStepConfig">
                <option value="compose">并行</option>
                <option value="chain">串行</option>
              </select>
            </div>
          </div>
          <div id="pl-s4-skills-list" class="pl-skills-list">
            <template v-for="(sid, si) in stepSkills[3]" :key="'3-' + sid">
              <span v-if="sid" class="pl-skill-chip">
                <span class="pl-chip-seq">{{ si + 1 }}</span>
                <span>{{ getSkillName(sid) }}</span>
                <select v-if="stepSkillModes[3] === 'chain'" v-model="stepSkillAgents[getSkillAgentKey(3, sid)]" class="pl-select pl-chip-agent" @change="saveStepConfig">
                  <option value="">默认</option>
                  <option v-for="a in agentStore.agents" :key="a.id" :value="a.id">{{ a.name }}</option>
                </select>
                <button class="btn-icon pl-chip-close" title="移除" @click="removeStepSkill(4, si)">&times;</button>
              </span>
            </template>
          </div>
           <div id="pl-ch-gen-bar" class="pl-ch-config">
              <label>每章字数</label>
              <input id="pl-chapter-wordcount" type="number" class="input-w-80" v-model.number="selectedVolumeChapterWords" min="1000" step="500" @change="lockChapterConfig" :readonly="selectedVolumeChapterLocked" />
              <span id="pl-chapter-config-status" class="pl-gen-hint">{{ selectedVolumeChapterLocked ? '本卷字数已锁定' : '填写后自动锁定' }}</span>
              <label>选择卷</label>
              <select id="pl-ch-volume-select" v-model.number="selectedVolumeIndex" class="pl-input-sm" :disabled="boundVolumes.length === 0">
                <template v-for="(vol, i) in projectStore.volumes" :key="vol.id || i">
                  <option v-if="vol.isBound" :value="i">{{ vol.name }}</option>
                </template>
              </select>
              <label>预计章数</label>
              <span id="pl-ch-est-count" class="pl-gen-hint">{{ estimatedChapters }}</span>
            </div>
            <p id="pl-ch-empty-no-volume" v-if="boundVolumes.length === 0" class="empty-hint">暂无已绑定卷纲，请先在卷纲层保存并锁定本卷，再点击「绑定到章节层」</p>
            <p id="pl-ch-empty-no-chapters" v-else-if="currentVolumeChapters.length === 0" class="empty-hint">暂无章节，请先生成</p>
            <div v-if="currentVolumeChapters.length > 0" id="pl-ch-cards-area" class="pl-ch-workspace">
              <div class="pl-ch-table-wrap">
                <div class="pl-ch-thead">
                  <span class="pl-ch-col-idx">序号</span>
                  <span class="pl-ch-col-title">章节标题</span>
                  <span class="pl-ch-col-plot">剧情点摘要</span>
                  <span class="pl-ch-col-state">状态</span>
                  <span class="pl-ch-col-ops">操作</span>
                </div>
                <div class="pl-ch-tbody">
                  <div
                    v-for="(ch, i) in currentVolumeChapters"
                    :key="ch.id || i"
                    :id="'pl-ch-row-' + i"
                    class="pl-ch-tr"
                    :class="{ active: selectedChapterIndex === i, confirmed: ch.confirmed }"
                    @click="selectedChapterIndex = i"
                  >
                    <span class="pl-ch-col-idx pl-ch-cell-idx">{{ i + 1 }}</span>
                    <span class="pl-ch-col-title pl-ch-cell-title">{{ ch.title || '未命名章节' }}</span>
                    <span class="pl-ch-col-plot pl-ch-cell-plot">{{ ch.plot || '—' }}</span>
                    <span class="pl-ch-col-state">
                      <span class="pl-ch-state-tag" :class="ch.confirmed ? 'locked' : 'editing'">
                        {{ ch.confirmed ? '已锁定' : '编辑中' }}
                      </span>
                    </span>
                    <span class="pl-ch-col-ops pl-ch-cell-ops">
                      <button class="btn-sm btn-secondary" :id="'pl-ch-edit-' + i" title="编辑" @click.stop="openChapterDetail(i)">编辑</button>
                      <button class="btn-sm btn-secondary" :id="'pl-ch-body-' + i" title="生成正文" :disabled="pipelineStore.isGenerating" @click.stop="genBody(selectedVolumeIndex, i)">正文</button>
                      <button class="btn-sm btn-danger" :id="'pl-ch-del-' + i" title="删除此章" @click.stop="deleteChapterCard(selectedVolumeIndex, i)">删除</button>
                    </span>
                  </div>
                </div>
              </div>
           </div>
           <div class="pl-actions">
              <button id="btn-pl-gen-chapters" class="btn-primary" @click="genChapters" :disabled="pipelineStore.isGenerating || !selectedVolumeChapterLocked">AI生成章节</button>
              <button id="btn-pl-autogen-chapters" class="btn-secondary" @click="genChapters" :disabled="pipelineStore.isGenerating || !selectedVolumeChapterLocked">自动生成章节</button>
             <button id="btn-pl-confirm-chapters" class="btn-secondary" @click="confirmStep(3)" :disabled="currentVolumeChapters.length === 0">确认完成</button>
           </div>
            <div v-if="chapterDetailVisible" id="pl-chapter-detail-overlay" class="pl-ch-detail-overlay" @click.self="closeChapterDetail">
              <section id="pl-chapter-detail-modal" class="pl-ch-detail-modal" role="dialog" aria-modal="true" aria-labelledby="pl-chapter-detail-title">
                <div class="pl-ch-detail-header">
                  <strong id="pl-chapter-detail-title">{{ chapterDetailEditTitle || '未命名章节' }}</strong>
                  <button type="button" class="modal-close" title="关闭" @click="closeChapterDetail">&times;</button>
                </div>
                <div class="pl-ch-detail-content">
                  <div class="pl-ch-detail-meta">
                    <span>状态：{{ selectedChapter?.confirmed ? '已锁定' : '编辑中' }}</span>
                    <span>所属卷：{{ selectedVolume?.name || '—' }}</span>
                  </div>
                  <label class="pl-ch-detail-label">章节标题</label>
                  <input v-model="chapterDetailEditTitle" class="pl-input pl-ch-detail-input" placeholder="章节标题" />
                  <label class="pl-ch-detail-label">剧情点概要</label>
                  <textarea v-model="chapterDetailEditPlot" class="pl-ch-detail-plot" placeholder="本章剧情点概要"></textarea>
                </div>
                <div class="pl-ch-detail-footer">
                  <span class="pl-ch-detail-hint">编辑只修改当前章节；保存后写入项目 JSON</span>
                  <div class="pl-ch-detail-actions">
                    <button class="btn-secondary btn-sm" @click="closeChapterDetail">取消</button>
                    <button class="btn-primary btn-sm" @click="saveChapterDetail">保存章节</button>
                  </div>
                </div>
              </section>
            </div>
         </div>
            <div
              v-if="chapterGenerationFeedbackVisible"
              id="pl-chapter-generation-overlay"
              class="pl-generation-feedback-overlay"
              @click.self="closeChapterGenerationFeedback"
            >
              <section
                id="pl-chapter-generation-feedback"
                class="pl-generation-feedback-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="pl-chapter-generation-title"
              >
                <div class="pl-generation-feedback-header">
                  <strong id="pl-chapter-generation-title">章节 AI 生成进度</strong>
                  <span>{{ pipelineStore.generationProgress }}%</span>
                </div>
                <div class="pl-generation-progress-track" aria-label="章节生成进度">
                  <div class="pl-generation-progress-value" :style="{ width: pipelineStore.generationProgress + '%' }"></div>
                </div>
                <div id="pl-ch-api-log" class="pl-generation-log" aria-label="章节 API 工作信息">
                  <div v-for="(line, index) in chapterGenerationLogs" :key="index" class="pl-generation-log-line">
                    <span class="pl-generation-log-dot" aria-hidden="true"></span>
                    <span>{{ line }}</span>
                  </div>
                </div>
                <div class="pl-generation-modal-footer">
                  <div class="pl-generation-status">{{ pipelineStore.generationStatus || '准备开始' }}</div>
                  <div class="pl-generation-modal-actions">
                    <button
                      v-if="pipelineStore.isGenerating"
                      id="pl-chapter-cancel-generation"
                      class="btn-danger"
                      @click="pipelineStore.cancelGeneration()"
                    >
                      取消生成
                    </button>
                    <button v-else class="btn-secondary" @click="closeChapterGenerationFeedback">关闭</button>
                  </div>
                </div>
              </section>
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
                <option value="compose">并行</option>
                <option value="chain">串行</option>
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
            <template v-for="(sid, si) in stepSkills[4]" :key="'4-' + sid">
              <span v-if="sid" class="pl-skill-chip">
                <span class="pl-chip-seq">{{ si + 1 }}</span>
                <span>{{ getSkillName(sid) }}</span>
                <select v-if="stepSkillModes[4] === 'chain'" v-model="stepSkillAgents[getSkillAgentKey(4, sid)]" class="pl-select pl-chip-agent" @change="saveStepConfig">
                  <option value="">默认</option>
                  <option v-for="a in agentStore.agents" :key="a.id" :value="a.id">{{ a.name }}</option>
                </select>
                <button class="btn-icon pl-chip-close" title="移除" @click="removeStepSkill(5, si)">&times;</button>
              </span>
            </template>
          </div>
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
              <button id="btn-pl-confirm-body" class="btn-secondary" @click="confirmBodyWithMemory" :disabled="!(currentBodyContent || bodyResult) || memoryPreviewLoading">确认完成</button>
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

  <div
    v-if="showSettingDetailModal && editingSettingItem"
    id="pl-setting-detail-overlay"
    class="pl-add-setting-overlay"
    @click.self="closeSettingDetailModal"
  >
    <section id="pl-setting-detail-modal" class="pl-add-setting-modal" role="dialog" aria-modal="true" aria-labelledby="pl-setting-detail-title">
      <div class="pl-add-setting-header">
        <span id="pl-setting-detail-title">{{ editingSettingItem.name || '未命名设定' }}</span>
        <button type="button" class="modal-close" title="关闭" @click="closeSettingDetailModal">&times;</button>
      </div>
      <div class="pl-add-setting-body">
        <label for="pl-setting-detail-name-input">名称</label>
        <input id="pl-setting-detail-name-input" v-model="editingSettingName" class="pl-input" placeholder="设定名称" />
        <label for="pl-setting-detail-content-input">属性内容</label>
        <textarea id="pl-setting-detail-content-input" v-model="editingSettingContent" class="pl-attrs-input" placeholder="输入该设定的属性内容"></textarea>
      </div>
      <div class="pl-add-setting-footer pl-setting-detail-modal-footer">
        <button type="button" class="btn-danger btn-sm" @click="removeSettingDetailModal">删除</button>
        <div class="pl-setting-detail-modal-actions">
          <button type="button" class="btn-secondary" @click="closeSettingDetailModal">关闭</button>
          <button type="button" class="btn-primary" @click="saveSettingDetailModal">保存</button>
        </div>
      </div>
    </section>
  </div>

  <div v-if="memoryPreviewVisible" class="pl-memory-preview-overlay" @click.self="closeMemoryPreview">
    <section class="pl-memory-preview-modal" role="dialog" aria-modal="true" aria-labelledby="pl-memory-preview-title">
      <header class="pl-memory-preview-header">
        <div>
          <strong id="pl-memory-preview-title">记忆变更预览</strong>
          <span class="pl-memory-preview-subtitle">正文已保存，确认后才写入记忆库</span>
        </div>
        <button type="button" class="modal-close" title="关闭" @click="closeMemoryPreview">&times;</button>
      </header>
      <div class="pl-memory-preview-body">
        <p v-if="memoryPreviewChanges.length === 0" class="empty-hint">本章没有检测到新的记忆变更。</p>
        <ul v-else class="pl-memory-change-list">
          <li v-for="(change, index) in memoryPreviewChanges" :key="index" class="pl-memory-change-item">
            <span class="pl-memory-change-kind">{{ change.kind }}</span>
            <strong>{{ change.name || change.id || '未命名条目' }}</strong>
            <span>{{ change.action === 'added' ? '新增' : change.action === 'updated' ? '更新' : '跳过' }}</span>
            <small v-if="change.reason">{{ change.reason }}</small>
            <div class="pl-memory-change-actions">
              <button type="button" class="btn-sm btn-secondary" @click="rejectMemoryPreviewItem(index)" :disabled="change.review === 'rejected'">拒绝</button>
              <button type="button" class="btn-sm btn-secondary" @click="toggleMemoryPreviewLock(index)">{{ change.review === 'locked' ? '取消锁定' : '锁定' }}</button>
            </div>
          </li>
        </ul>
        <p v-if="memoryPreviewError" class="pl-memory-preview-error">{{ memoryPreviewError }}</p>
      </div>
      <footer class="pl-memory-preview-footer">
        <button type="button" class="btn-secondary" @click="closeMemoryPreview">关闭，不写入</button>
        <button type="button" class="btn-primary" @click="confirmMemoryPreview" :disabled="memoryPreviewSaving">{{ memoryPreviewSaving ? '写入中...' : '确认写入记忆' }}</button>
      </footer>
    </section>
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
import { getAiService } from "../../services/aiService"
import { getSkillAgentKey, migrateSkillAgentBindings, normalizeSkillAgentBindings } from "../../services/skillAgentBinding"
import { useConfigExchange } from "../../composables/useConfigExchange"
import type { PipelineBindingRecord } from "../../services/configExchange"
import { storageKey } from "../../utils/storage-key"
import PipelineFlow from "./PipelineFlow.vue"
import { extractMemory } from "../../services/memoryExtractor"
import { mergeMemory } from "../../services/memoryMerger"
import type { ExtractedMemoryData } from "../../services/memoryExtractor"
import { retrieveContext } from "../../services/memoryRetriever"
import { parseGenerationResult } from "../../services/generationResult"
import { buildChapterExecutionPrompt, createChapterExecutionPackage } from "../../services/chapterExecutionPackage"
import { buildChainSkillPrompt } from "../../services/chainExecution"
import { getSkillMaxAttempts, validateSkillInput, validateSkillOutput, validateSkillRules } from "../../services/skillValidation"
import { createChainFailureBreakpoint, createChainSuccessBreakpoint, getChainResumePoint } from "../../services/chainBreakpoint"
import { selectCompleteChapters, validateChapterNarrative, validateVolumeNarrative } from "../../services/narrativeValidation"

defineEmits<{ close: [], minimize: [] }>()


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
const { importBindingsFromFile, exportBindingsJSON } = useConfigExchange()
const bindingImportPreview = ref<{
  ok: boolean
  issues: Array<{ message: string }>
  bindings: PipelineBindingRecord
  source: string
} | null>(null)

const { generateNames, generateWritingRules, extractTimeline, batchReviewChapters, reviseChapter, translateText, convertStyle, regenerateContent, modifyContent, isLoading: aiLoading, loadingText: aiLoadingText } = useAiTools()

const toolResult = ref("")
const showAddSettingModal = ref(false)
const newSettingName = ref("")
const newSettingCategory = ref("其他")
const newSettingAttrs = ref("")
const showSettingDetailModal = ref(false)
const editingSettingId = ref("")
const editingSettingName = ref("")
const editingSettingContent = ref("")
const showAddCategory = ref(false)
const newCategoryName = ref("")
const selectedSettingCategory = ref("")
const selectedSettingId = ref("")
const confirmedSettingCategories = ref<string[]>([])
const settingsGenerationLogs = ref<string[]>([])
const settingsGenerationFeedbackVisible = computed(() => pipelineStore.isGenerating || settingsGenerationLogs.value.length > 0)

function closeSettingsGenerationFeedback() {
  settingsGenerationLogs.value = []
}
function closeVolumeGenerationFeedback() {
  volumeGenerationLogs.value = []
}

function closeChapterGenerationFeedback() {
  chapterGenerationLogs.value = []
}

const expandedVolumeIndex = ref(-1)

function toggleVolumeExpand(index: number) {
  expandedVolumeIndex.value = expandedVolumeIndex.value === index ? -1 : index
}

function volumeOutlineExcerpt(outline: unknown) {
  const text = String(outline || '').replace(/\s+/g, ' ').trim()
  if (!text) return '暂无纲要'
  return text.length > 42 ? text.slice(0, 42) + '…' : text
}

function formatVolumeWords(vol: any) {
  const words = Math.max(0, Math.round(Number(vol?.allocatedWords || vol?.suggestedWords) || 0))
  if (!words) return '—'
  if (words >= 10000) {
    const wan = Math.round((words / 10000) * 10) / 10
    return wan + ' 万字'
  }
  return words + ' 字'
}

function volumeStatusText(vol: any) {
  if (vol?.isBound) return '已绑定 ✓'
  if (vol?.confirmed) return '已锁定'
  return '编辑中'
}

function volumeStatusClass(vol: any) {
  if (vol?.isBound) return 'bound'
  if (vol?.confirmed) return 'locked'
  return 'editing'
}
const volumeGenerationLogs = ref<string[]>([])
const chapterGenerationLogs = ref<string[]>([])
const activeVolumeGenerationIndex = ref(-1)
const volumeGenerationFeedbackVisible = computed(() => pipelineStore.isGenerating || volumeGenerationLogs.value.length > 0)
const chapterGenerationFeedbackVisible = computed(() => pipelineStore.isGenerating || chapterGenerationLogs.value.length > 0)

function appendPipelineStream(step: number, text: string) {
  const logs = step === 1 ? settingsGenerationLogs : step === 2 ? volumeGenerationLogs : chapterGenerationLogs
  const clean = (text || '').trim()
  if (!clean) return
  const preview = clean.length > 500 ? clean.slice(-500) : clean
  const marker = 'API实时输出：'
  const index = logs.value.findIndex(line => line.startsWith(marker))
  const line = marker + preview
  if (index >= 0) logs.value[index] = line
  else logs.value.push(line)
}

type MemoryPreviewItem = {
  key: string
  kind: string
  name?: string
  id?: string
  action: "pending" | "rejected" | "locked"
  value: any
}

const memoryPreviewVisible = ref(false)
const memoryPreviewLoading = ref(false)
const memoryPreviewSaving = ref(false)
const memoryPreviewError = ref("")
const memoryPreviewChanges = ref<any[]>([])
const memoryPreviewItems = ref<MemoryPreviewItem[]>([])
const memoryPreviewExtracted = ref<ExtractedMemoryData | null>(null)
const memoryPreviewChapter = ref<{ id: string; index: number; title: string; content: string } | null>(null)

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

const selectedSettingItem = computed(() =>
  filteredSettings.value.find((item: any) => item.id === selectedSettingId.value) || null
)

const editingSettingItem = computed(() =>
  filteredSettings.value.find((item: any) => item.id === editingSettingId.value) || null
)

function firstCategoryWithSettings(categories = settingNavigationCategories.value) {
  const sc = projectStore.getSettingsCollection()
  return categories.find((category) => (sc.items[category] || []).length > 0) || categories[0] || ""
}

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

function openSettingDetailModal(item: any) {
  if (!item) return
  selectedSettingId.value = item.id
  editingSettingId.value = item.id
  editingSettingName.value = item.name || ""
  editingSettingContent.value = item.content || ""
  showSettingDetailModal.value = true
}

function saveSettingDetailModal() {
  const item = editingSettingItem.value
  if (!item) return
  const nextName = editingSettingName.value.trim()
  if (nextName) item.name = nextName
  item.content = editingSettingContent.value
  saveSettingItem(item)
  showSettingDetailModal.value = false
}

function removeSettingDetailModal() {
  const item = editingSettingItem.value
  if (!item) return
  const index = filteredSettings.value.findIndex((entry: any) => entry.id === item.id)
  showSettingDetailModal.value = false
  removeSetting(index)
}

function closeSettingDetailModal() {
  showSettingDetailModal.value = false
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
const volumeCountHint = ref("")
const chapterBatchSize = ref(5)
const selectedVolumeIndex = ref(0)
const selectedChapterIndex = ref(0)
const bodyVolumeIndex = ref(0)
const bodyChapterIndex = ref(0)
const bodyResult = ref("")
const styleTags = ref("")
const pacingParams = ref("")
const outlineAnalyzed = ref(false)
const stepAgents = ref<Record<number, string>>({ 0: "", 1: "", 2: "", 3: "", 4: "" })
const stepSkills = ref<Record<number, string[]>>({ 0: ["", "", "", "", ""], 1: ["", "", "", "", ""], 2: ["", "", "", "", ""], 3: ["", "", "", "", ""], 4: ["", "", "", "", ""] })
const stepSkillSelect = ref<Record<number, string>>({ 1: "", 2: "", 3: "", 4: "", 5: "" })
const stepSkillModes = ref<Record<number, string>>({ 0: "compose", 1: "compose", 2: "chain", 3: "chain", 4: "chain" })
const stepSkillAgents = ref<Record<string, string>>({})

const selectedVolume = computed(() => projectStore.volumes[selectedVolumeIndex.value] || null)
const selectedVolumeChapterWords = computed({
  get: () => Number(selectedVolume.value?.wordsPerChapter || chapterWords.value || 3500),
  set: (value: number) => {
    const normalized = Math.max(1000, Number(value) || 3500)
    chapterWords.value = normalized
    if (selectedVolume.value) selectedVolume.value.wordsPerChapter = normalized
  }
})
const selectedVolumeChapterLocked = computed(() => Boolean(selectedVolume.value?.chapterConfigLocked))

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
  const vol = selectedVolume.value
  if (!vol) return 0
  const words = vol.allocatedWords || vol.suggestedWords || volumeWords.value
  const wordsPerChapter = Number(vol.wordsPerChapter || chapterWords.value || 3500)
  return Math.ceil(words / wordsPerChapter)
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

const boundVolumes = computed(() => projectStore.volumes.filter((vol: any) => vol.isBound))

// The volume editor may select both draft and locked volumes. Only the
// chapter workspace is gated by `isBound`, so do not force the editor back
// to the first locked volume when a draft volume is selected.
watch(
  () => projectStore.volumes.length,
  () => {
    if (selectedVolumeIndex.value >= projectStore.volumes.length) {
      selectedVolumeIndex.value = Math.max(0, projectStore.volumes.length - 1)
    }
  },
  { immediate: true }
)

const currentVolumeChapters = computed(() => {
    const vol = projectStore.volumes[selectedVolumeIndex.value]
  if (!vol || !vol.isBound) return []
  const volId = vol.id || vol.name
  return (projectStore.chapters[volId] || []).filter((chapter: any) => chapter.pipelineGenerated === true)
})

function syncVolumeCount(e: any) {
  const val = Math.floor(Number(e.target.value))
  if (!isNaN(val) && val >= 1 && val <= 20) {
    volumeCount.value = val
    volumeCountHint.value = ""
  } else {
    e.target.value = volumeCount.value
    volumeCountHint.value = "卷数需在 1-20 之间，已恢复为 " + volumeCount.value
  }
  saveVolumeConfig()
}

watch(settingNavigationCategories, (categories) => {
  const selectedItems = projectStore.getSettingsCollection().items[selectedSettingCategory.value] || []
  if (categories.length > 0 && (!categories.includes(selectedSettingCategory.value) || selectedItems.length === 0)) {
    selectedSettingCategory.value = firstCategoryWithSettings(categories)
  } else if (categories.length === 0) {
    selectedSettingCategory.value = ""
  }
}, { immediate: true })

watch([selectedSettingCategory, filteredSettings], () => {
  if (!filteredSettings.value.some((item: any) => item.id === selectedSettingId.value)) {
    selectedSettingId.value = filteredSettings.value[0]?.id || ""
  }
}, { immediate: true })

const bodyVolumeChapters = computed(() => {
  const vol = projectStore.volumes[bodyVolumeIndex.value]
  if (!vol || !vol.name) return []
  const volId = vol.id || vol.name
  return ((projectStore.chapters && projectStore.chapters[volId]) || [])
    .filter((chapter: any) => chapter.pipelineGenerated === true)
})

function getVisibleChaptersForVolume(volumeIndex: number) {
  const vol = projectStore.volumes[volumeIndex]
  const volId = vol?.id || vol?.name
  const chapters = volId ? (projectStore.chapters[volId] || []) : []
  return chapters.filter((chapter: any) => chapter.pipelineGenerated === true)
}

function getBodyChapterByVisibleIndex(volumeIndex: number, chapterIndex: number) {
  const vol = projectStore.volumes[volumeIndex]
  const volId = vol?.id || vol?.name
  const chapters = volId ? (projectStore.chapters[volId] || []) : []
  const visible = getVisibleChaptersForVolume(volumeIndex)
  const candidate = visible[chapterIndex]
  if (!candidate) return { vol, volId, chapters, chapter: null }
  const chapter = candidate.id
    ? chapters.find((item: any) => item.id === candidate.id)
    : candidate
  return { vol, volId, chapters, chapter: chapter || null }
}

// Persistent body text for the currently selected chapter in the body stage.
const currentBodyContent = computed(() => {
  return getBodyChapterByVisibleIndex(bodyVolumeIndex.value, bodyChapterIndex.value).chapter?.body || ''
})

async function saveStepConfig() {
  await window.electronAPI.storageWrite(storageKey("pipeline_step_config"), {
    agents: JSON.parse(JSON.stringify(stepAgents.value)),
    skills: JSON.parse(JSON.stringify(stepSkills.value)),
    modes: JSON.parse(JSON.stringify(stepSkillModes.value)),
    skillAgents: JSON.parse(JSON.stringify(stepSkillAgents.value))
  })
}

function getCurrentPipelineBindings(): PipelineBindingRecord {
  return {
    agents: JSON.parse(JSON.stringify(stepAgents.value)),
    skills: JSON.parse(JSON.stringify(stepSkills.value)),
    modes: JSON.parse(JSON.stringify(stepSkillModes.value)),
    skillAgents: normalizeSkillAgentBindings(
      JSON.parse(JSON.stringify(stepSkillAgents.value)),
      JSON.parse(JSON.stringify(stepSkills.value)),
    ),
  }
}

async function exportPipelineBindings() {
  try {
    const written = await exportBindingsJSON(getCurrentPipelineBindings())
    if (!written) return
    execLogStore.addLog({ step: 0, stepName: "配置交换", mode: "binding-export", skillNames: [], prompt: "", result: "流水线绑定已导出", duration: 0, status: "success" })
  } catch (error: any) {
    execLogStore.addLog({ step: 0, stepName: "配置交换", mode: "binding-export", skillNames: [], prompt: "", result: error?.message || "绑定导出失败", duration: 0, status: "failed" })
  }
}

async function importPipelineBindings() {
  const result = await importBindingsFromFile()
  if (result) bindingImportPreview.value = result
}

async function applyPipelineBindings() {
  const preview = bindingImportPreview.value
  if (!preview?.ok) return
  const current = await window.electronAPI.storageRead(storageKey("pipeline_step_config")) || {}
  const next = {
    ...current,
    agents: JSON.parse(JSON.stringify(preview.bindings.agents)),
    skills: JSON.parse(JSON.stringify(preview.bindings.skills)),
    modes: JSON.parse(JSON.stringify(preview.bindings.modes)),
    skillAgents: JSON.parse(JSON.stringify(preview.bindings.skillAgents)),
  }
  await window.electronAPI.storageWrite(storageKey("pipeline_step_config"), next)
  stepAgents.value = { 0: "", 1: "", 2: "", 3: "", 4: "", ...preview.bindings.agents } as Record<number, string>
  stepSkills.value = { 0: [], 1: [], 2: [], 3: [], 4: [], ...preview.bindings.skills } as Record<number, string[]>
  stepSkillModes.value = { 0: "compose", 1: "compose", 2: "chain", 3: "chain", 4: "chain", ...preview.bindings.modes }
  stepSkillAgents.value = { ...preview.bindings.skillAgents }
  bindingImportPreview.value = null
}

async function saveBookWordCount() {
  const wan = Number(bookWordCount.value)
  if (!isNaN(wan) && wan > 0) {
    await window.electronAPI.storageWrite(
      storageKey("pipeline_step_config"),
      Object.assign(
        await window.electronAPI.storageRead(storageKey("pipeline_step_config")) || {},
        { bookWordCount: Math.round(wan * 10000) }
      )
    )
  }
}

async function saveVolumeConfig() {
  await window.electronAPI.storageWrite(
    storageKey("pipeline_step_config"),
    Object.assign(
      await window.electronAPI.storageRead(storageKey("pipeline_step_config")) || {},
      {
        volumeWords: Number(volumeWords.value) || 0,
        volumeCount: Number(volumeCount.value) || 0,
        chapterWords: Number(chapterWords.value) || 0
      }
    )
  )
}

function lockChapterConfig() {
  const vol = selectedVolume.value
  if (!vol) return
  const wordsPerChapter = Math.max(1000, Number(vol.wordsPerChapter || chapterWords.value) || 3500)
  const words = Math.max(0, Number(vol.allocatedWords || vol.suggestedWords || volumeWords.value) || 0)
  vol.wordsPerChapter = wordsPerChapter
  vol.chapterCount = words > 0 ? Math.ceil(words / wordsPerChapter) : 0
  vol.chapterConfigLocked = true
  chapterWords.value = wordsPerChapter
  saveVolumeConfig()
  projectStore.saveProject()
}

function saveChapterPlot() {
  projectStore.saveProject()
  projectStore.refreshTree()
}

function getStepSkillIds(step: number): string[] {
  const stepSlot = stepSkills.value[step]
  if (stepSlot && stepSlot.length > 0) {
    const ids = stepSlot.filter(Boolean)
    if (ids.length > 0) return ids
  }
  const stored = pipelineStore.getStepSkills(step) as unknown as string[]
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
  outputFormat?: 'json' | 'text'
  validationRules?: string[]
  inputSchema?: any
  outputSchema?: any
  retryPolicy?: any
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
      outputFormat: s.outputFormat || "text",
      validationRules: s.validationRules || [],
      inputSchema: s.inputSchema,
      outputSchema: s.outputSchema,
      retryPolicy: s.retryPolicy
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

function getStepSkillAgentId(step: number, skillId: string): string {
  return stepSkillAgents.value[getSkillAgentKey(step, skillId)] || ""
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

function validateSkillInputOrThrow(template: PipelineSkillTemplate, input: unknown) {
  if (!template.inputSchema) return
  const result = validateSkillInput(input, template)
  if (!result.valid) throw new Error("「" + template.name + "」输入校验失败：" + result.errors.join("；"))
}

function validateSkillOutputOrThrow(template: PipelineSkillTemplate, output: string) {
  const structured = validateSkillOutput(output, template)
  if (!structured.valid) throw new Error("「" + template.name + "」输出校验失败：" + structured.errors.join("；"))
  const rules = validateSkillRules(structured.value ?? output, template.validationRules)
  if (!rules.valid) throw new Error("「" + template.name + "」规则校验失败：" + rules.errors.join("；"))
}

async function callValidatedSkill(
  step: number,
  template: PipelineSkillTemplate,
  injection: PromptParts,
  prompt: string,
  inputContext: unknown,
  timeoutMs: number | undefined,
  skillAgentId: string | undefined
): Promise<string> {
  validateSkillInputOrThrow(template, inputContext)
  // Preserve the legacy outputFormat contract: malformed JSON gets one repair attempt.
  const maxAttempts = template.retryPolicy
    ? getSkillMaxAttempts(template.retryPolicy)
    : template.outputFormat === "json" ? 2 : 1
  let currentError: unknown = null
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const attemptPrompt = attempt === 1 ? prompt : prompt + "\n\n[校验重试] 上次输出未满足 Skill 的结构化约束，请只返回符合要求的结果。"
    const output = timeoutMs
      ? await callApiWithAgentTimeout(step, injection.systemSkill || "", attemptPrompt, timeoutMs, skillAgentId, injection)
      : await callApiWithAgent(step, injection.systemSkill || "", attemptPrompt, skillAgentId, injection)
    try {
      validateSkillOutputOrThrow(template, output)
      return output
    } catch (error) {
      currentError = error
      if (attempt === maxAttempts) throw error
    }
  }
  throw currentError instanceof Error ? currentError : new Error("Skill 输出校验失败")
}

function getStepSkillMode(step: number): string {
  const mode = stepSkillModes.value[step]
  return mode === "chain" ? "chain" : "compose"
}

function buildTemplateContext(step: number, prompt: string, prevResponse?: string): Record<string, any> {
  const contextVolumeIndex = bodyVolumeIndex.value
  const vol = projectStore.volumes[contextVolumeIndex] || null
  const volId = vol ? (vol.id || vol.name) : ""
  const chs = volId ? (projectStore.chapters[volId] || []) : []
  const selectedCh = getBodyChapterByVisibleIndex(contextVolumeIndex, bodyChapterIndex.value).chapter || getVisibleChaptersForVolume(contextVolumeIndex)[0] || null
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
    outlineContent: projectStore.pipelineOutlineText || "",
    novelTitle: projectStore.projectName || "",
    volumeCount: projectStore.volumes.length || volumeCount.value,
    wordsPerVolume: (vol ? Number(vol.allocatedWords || vol.suggestedWords) || 0 : 0) || volumeWords.value || "",
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
    prevResponse: prevResponse || "",
    memoryContext: retrieveContext(projectStore.memories, {
      chapterId: selectedCh ? String(selectedCh.id || "") : undefined,
      chapterIndex: chIdx >= 0 ? chIdx : undefined,
      query: `${prompt} ${selectedCh?.title || ""} ${selectedCh?.plot || ""}`,
      previousChapterSummary: prevCh ? (prevCh.summary || prevCh.plot || "") : "",
      maxChars: 2000
    }).text
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

// Analyze outline for narrative style and pacing parameters.
// Equivalent to old architecture _plAnalyzeOutline: independent API call,
// empty skillIds, returns {styleTags, pacingParams} JSON.
async function analyzeOutline() {
  if (!projectStore.pipelineOutlineText) return
  if (outlineAnalyzed.value && styleTags.value) return
  const provider = providerStore.preferredGenerateProvider
  if (!provider?.id) {
    console.warn("[WARN] No provider configured, skipping outline analysis")
    return
  }
  const model = provider.selectedModel || provider.models?.[0] || ""
  if (!model) {
    console.warn("[WARN] No model selected, skipping outline analysis")
    return
  }
  const prompt = "请分析以下小说大纲的写作风格和节奏特征。返回JSON对象：{styleTags:\"风格标签以逗号分隔\", pacingParams:\"节奏参数描述\"}\n\n大纲：\n" + projectStore.pipelineOutlineText
  try {
    const aiService = await getAiService()
    const callResult = await aiService.callAi({
      purpose: 'generate',
      messages: [
        { role: "system", content: "你是小说风格分析专家。分析大纲的写作风格和节奏特征，返回JSON。" },
        { role: "user", content: prompt }
      ],
      model,
      retry: true,
      meta: { source: 'PipelinePanel.outline-analysis' }
    })
    const text = callResult.text || ''
    if (!text) { console.warn("[WARN] Outline analysis returned empty"); return }
    let data: any = null
    try {
      const m = text.match(/\{[\s\S]*\}/)
      if (m) data = JSON.parse(m[0])
    } catch(e) { console.warn("[WARN] Outline analysis parse failed:", e) }
    if (data) {
      styleTags.value = data.styleTags || data.style || ""
      pacingParams.value = data.pacingParams || data.pacing || ""
      outlineAnalyzed.value = true
      await new Promise(r => setTimeout(r, 100))
      saveAiPacingSnapshot()
      console.log("[OK] Outline analyzed: styleTags=" + (styleTags.value||"").substring(0,50) + ", pacing=" + (pacingParams.value||"").substring(0,50))
    } else {
      styleTags.value = text.substring(0, 200)
      outlineAnalyzed.value = true
      console.log("[OK] Outline analyzed (raw text fallback)")
    }
  } catch(e: any) {
    console.warn("[WARN] Outline analysis failed (non-blocking):", e.message)
  }
}

function getStyleTagsValue(): string {
  if (!styleTags.value) return ""
  const tags = (styleTags.value || "").split(/[,，、]/).map(t => t.trim()).filter(Boolean)
  return tags.join(", ")
}

function getPacingParamsValue(): string {
  return pacingParams.value || ""
}

// Toggle a style tag on/off
function toggleStyleTag(tag: string, on: boolean) {
  const tags = (styleTags.value || "").split(/[,，、]/).map(t => t.trim()).filter(Boolean)
  const idx = tags.indexOf(tag)
  if (on && idx === -1) tags.push(tag)
  if (!on && idx >= 0) tags.splice(idx, 1)
  styleTags.value = tags.join(", ")
}

// Compute the style tags as toggleable chips
const styleTagChips = computed(() => {
  const raw = (styleTags.value || "").split(/[,，、]/).map(t => t.trim()).filter(Boolean)
  const custom = customStyleTags.value
  const all = [...new Set([...raw, ...custom])]
  return all.map(tag => ({
    label: tag,
    active: raw.includes(tag)
  }))
})

// Pacing params as structured object
const pacingParamsObj = ref({
  speed: "均衡",
  tension: 3,
  density: "均衡",
  perspective: "第一人称",
  tone: "暗黑"
})

const pacingSpeedOptions = ["慢热", "均衡", "快节奏"]
const pacingDensityOptions = ["稀疏", "均衡", "密集"]
const pacingPerspectiveOptions = ["第一人称", "第三人称限知", "第三人称全知"]
const pacingToneOptions = ["暗黑", "温暖", "苦涩", "热血", "悲壮"]

// Sync pacingParamsObj from raw string when analysis completes
watch(outlineAnalyzed, (val) => {
  if (val && pacingParams.value) {
    const lower = pacingParams.value.toLowerCase()
    if (/慢热/.test(pacingParams.value)) pacingParamsObj.value.speed = "慢热"
    else if (/快/.test(pacingParams.value)) pacingParamsObj.value.speed = "快节奏"
    else pacingParamsObj.value.speed = "均衡"
    const tMatch = pacingParams.value.match(/紧张[度:]?(\d)/)
    if (tMatch) pacingParamsObj.value.tension = parseInt(tMatch[1])
    if (/稀疏/.test(pacingParams.value)) pacingParamsObj.value.density = "稀疏"
    else if (/密集/.test(pacingParams.value)) pacingParamsObj.value.density = "密集"
    else pacingParamsObj.value.density = "均衡"
    if (/第三人称全知/.test(pacingParams.value)) pacingParamsObj.value.perspective = "第三人称全知"
    else if (/第三人称限知|第三人称/.test(pacingParams.value)) pacingParamsObj.value.perspective = "第三人称限知"
    else if (/第一人称/.test(pacingParams.value)) pacingParamsObj.value.perspective = "第一人称"
    for (const tone of pacingToneOptions) {
      if (pacingParams.value.includes(tone)) { pacingParamsObj.value.tone = tone; break }
    }
    syncPacingToString()
  }
})

function syncPacingToString() {
  const p = pacingParamsObj.value
  pacingParams.value = "速度:" + p.speed + ", 紧张度:" + p.tension + ", 密度:" + p.density + ", 视角:" + p.perspective + ", 基调:" + p.tone
}

// Save AI-suggested pacing values for restore
const aiPacingSnapshot = ref<Record<string, any>>({})

function saveAiPacingSnapshot() {
  aiPacingSnapshot.value = JSON.parse(JSON.stringify(pacingParamsObj.value))
}

function restoreAiPacing() {
  if (Object.keys(aiPacingSnapshot.value).length > 0) {
    pacingParamsObj.value = JSON.parse(JSON.stringify(aiPacingSnapshot.value))
    syncPacingToString()
  }
}

// Custom style tags added by user
const customStyleTags = ref<string[]>([])
const newCustomTag = ref("")

function addCustomTag() {
  const tag = newCustomTag.value.trim()
  if (!tag) return
  if (!customStyleTags.value.includes(tag)) customStyleTags.value.push(tag)
  const tags = (styleTags.value || "").split(/[,，、]/).map(t => t.trim()).filter(Boolean)
  if (!tags.includes(tag)) {
    tags.push(tag)
    styleTags.value = tags.join(", ")
  }
  newCustomTag.value = ""
}

// Style card expand/collapse state
const styleCardExpanded = ref(false)

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
  const result = validateVolumeNarrative(vols)
  return { valid: result.valid, errors: result.errors }
}

function validateChapters(chs: any[], expectedCount?: number): { valid: boolean; errors: string[] } {
  const result = validateChapterNarrative(chs, expectedCount)
  return { valid: result.valid, errors: result.errors }
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
    projectStore.volumes.forEach((v: any) => { v.confirmed = false; v.isBound = false; v.boundTo = []; v.bodyGenerated = false })
    clearChapterGenerationFlags()
    styleTags.value = ""
    pacingParams.value = ""
    pacingParamsObj.value = { speed: "均衡", tension: 3, density: "均衡", perspective: "第一人称", tone: "暗黑" }
    outlineAnalyzed.value = false
    for (let i = 1; i < 5; i++) steps.value[i].completed = false
  }
  if (fromStep <= 1) {
    projectStore.volumesConfirmed = false
    projectStore.chaptersConfirmed = false
    projectStore.volumes.forEach((v: any) => { v.confirmed = false; v.isBound = false; v.boundTo = []; v.bodyGenerated = false })
    clearChapterGenerationFlags()
    for (let i = 2; i < 5; i++) steps.value[i].completed = false
  }
  if (fromStep <= 2) {
    projectStore.chaptersConfirmed = false
    projectStore.volumes.forEach((v: any) => { v.confirmed = false; v.isBound = false; v.boundTo = []; v.bodyGenerated = false })
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
    projectStore.bookWordCountChars = Math.round(bookWordCount.value * 10000)
    projectStore.saveProject()
    saveBookWordCount()
    saveVolumeConfig()
  }
  steps.value[stepIndex].completed = true
  if (stepIndex === 0 && !projectStore.outlineLocked) {
    projectStore.setOutline(projectStore.outlineText)
    projectStore.lockOutline()
    window.dispatchEvent(new CustomEvent("outline-locked", { detail: { text: projectStore.outlineText } }))
    analyzeOutline()
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

function saveVolume(index: number) {
  const vol = projectStore.volumes[index]
  if (!vol || !vol.name.trim()) return
  vol.confirmed = true
  vol.locked = true
  // 锁卷时回填字数预算（AI 分配 > 旧建议字数 > 全局兜底），保证章节层章数计算可用
  const budget = Math.max(0, Math.round(Number(vol.allocatedWords) || 0))
    || Math.max(0, Math.round(Number(vol.suggestedWords) || 0))
    || Math.max(0, Math.round(Number(volumeWords.value) || 0))
  if (budget > 0) vol.allocatedWords = budget
  projectStore.volumesConfirmed = false
  if (!projectStore.chapters[vol.id || vol.name]) projectStore.chapters[vol.id || vol.name] = []
  if (!projectStore.volumes[selectedVolumeIndex.value]?.confirmed) selectedVolumeIndex.value = index
  expandedVolumeIndex.value = -1
  projectStore.saveProject()
}

function toggleVolumeBinding(index: number) {
  const vol = projectStore.volumes[index]
  if (!vol || !vol.confirmed) return
  vol.isBound = !vol.isBound
  if (vol.isBound && (!Array.isArray(vol.boundTo) || vol.boundTo.length === 0)) {
    vol.boundTo = ['chapter-layer']
  } else if (!vol.isBound) {
    vol.boundTo = []
  }
  projectStore.saveProject()
}

function deleteVolume(index: number) {
  const vol = projectStore.volumes[index]
  if (!vol) return
  const volId = vol.id || vol.name
  delete projectStore.chapters[volId]
  projectStore.volumes.splice(index, 1)
  if (selectedVolumeIndex.value >= projectStore.volumes.length) selectedVolumeIndex.value = Math.max(0, projectStore.volumes.length - 1)
  if (expandedVolumeIndex.value === index) expandedVolumeIndex.value = -1
  else if (expandedVolumeIndex.value > index) expandedVolumeIndex.value -= 1
  projectStore.volumesConfirmed = false
  projectStore.chaptersConfirmed = false
  projectStore.saveProject()
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

async function callApiWithAgent(step: number, skillTemplate: string, prompt: string, skillAgentOverride?: string, promptParts?: PromptParts, signal?: AbortSignal, timeoutMs?: number): Promise<string> {
  const agentId = skillAgentOverride || getStepAgentId(step)
  const agentConfig = agentId ? (agentStore.getAgent(agentId) || null) : getStepAgentConfig(step)
  const provider = providerStore.getProvider(agentConfig?.provider || "")
  const preferredProvider = providerStore.preferredGenerateProvider
  const activeProvider = provider || preferredProvider
  const model = agentConfig?.model || activeProvider?.selectedModel || activeProvider?.models?.[0] || ""
  const temperature = agentConfig?.temperature ?? activeProvider?.temperature ?? 0.7
  const maxTokens = agentConfig?.maxTokens || activeProvider?.maxTokens || 8192
  const skillPart = promptParts?.systemSkill ?? skillTemplate ?? ""
  const agentPart = agentConfig?.systemPrompt || ""
  const systemPrompt = [skillPart, agentPart].filter(Boolean).join("\n\n") || "你是专业小说创作助手。"
  const userPrompt = [promptParts?.userPrefix, prompt, promptParts?.userSuffix].filter(Boolean).join("\n\n")
  const messages = [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }]
  const aiService = await getAiService()
  const result = await aiService.callAi({
    purpose: 'generate',
    messages,
    model,
    temperature,
    maxTokens,
    onChunk: (text: string) => appendPipelineStream(step, text),
    signal: signal || pipelineStore.getGenerationSignal(),
    timeoutMs,
    retry: true,
    meta: { source: 'PipelinePanel.callApiWithAgent', step, skillId: skillAgentOverride }
  })
  return result.text || ""
}

async function callApiWithAgentTimeout(step: number, skillTemplate: string, prompt: string, timeoutMs: number, skillAgentOverride?: string, promptParts?: PromptParts): Promise<string> {
  const parentSignal = pipelineStore.getGenerationSignal()
  return await callApiWithAgent(step, skillTemplate, prompt, skillAgentOverride, promptParts, parentSignal, timeoutMs)
}

async function runStepSkills(step: number, prompt: string, timeoutMs: number | undefined, fallbackTemplate: string) {
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
    const message = e instanceof Error ? e.message : String(e)
    execLogStore.addLog({step,stepName,mode,skillNames,prompt:(prompt||"").substring(0,500),result:message || "unknown error",duration:Date.now()-startTime,status:"failed"});
    throw e;
  }
}

async function _runStepSkillsInner(step: number, prompt: string, timeoutMs: number | undefined, fallbackTemplate: string) {
  const templates = getStepSkillTemplates(step)
  const mode = getStepSkillMode(step)
  const baseCtx = buildTemplateContext(step, prompt)
  const memoryPrompt = baseCtx.memoryContext
    ? "\n\n[相关记忆]\n" + baseCtx.memoryContext
    : ""
  const generationPrompt = prompt + memoryPrompt
  // Use SkillExecutionEngine for split-merge / multi-step
  if ((mode === "split-merge" || mode === "multi-step") && templates.length > 0) {
    const engine = (window as any).SkillExecutionEngine
    if (engine) {
      const _engineAiRequest = async (opts: any) => {
        const aiSvc = await getAiService()
        const result = await aiSvc.callAi({
          purpose: 'generate',
          messages: opts.messages || [],
          model: opts.model || undefined,
          temperature: opts.temperature != null ? opts.temperature : undefined,
          maxTokens: opts.maxTokens || 128000,
          stream: opts.stream !== false,
          retry: true,
          signal: pipelineStore.getGenerationSignal(),
          meta: { source: 'PipelinePanel.engine' },
          onChunk: opts.onChunk
        })
        return { text: result.text, reasoning: result.reasoning }
      }
      const engineSkills = templates.map((t: any) => ({ name: t.name, template: t.template, customVars: t.customVars || {} }))
      let result: any
      if (mode === "split-merge") {
        console.log("[PIPELINE] split-merge mode, step=" + step + " skills=" + engineSkills.length)
          result = await engine.splitMerge(generationPrompt, engineSkills, { aiRequest: _engineAiRequest, splitSize: 1000, stream: true, templateContext: baseCtx })
      } else {
        console.log("[PIPELINE] multi-step mode, step=" + step + " skills=" + engineSkills.length)
        result = await engine.multiStep(generationPrompt, engineSkills.slice(0, 4), { aiRequest: _engineAiRequest, splitSize: 1500, stream: true, templateContext: baseCtx })
      }
      return result?.text || prompt
    }
  }
  if (mode === "chain" && templates.length > 1) {
    const chainCtx = { ...baseCtx }
    const checkpointProjectId = String(projectStore.currentProjectId || "")
    const fallbackAgentId = (skillAgentId: string) => skillAgentId || getStepAgentId(step) || ""
    // Need 2: chain breakpoint resume
    const bp = await pipelineStore.refreshBreakpoint()
    const skillSequence = templates.map((t) => t.id)
    const resumePoint = getChainResumePoint({
      breakpoint: bp,
      step,
      projectId: checkpointProjectId,
      skillSequence
    })
    let startSi = resumePoint.startIndex
    let current = resumePoint.previousOutput || prompt
    if (resumePoint.resumed) {
      chainCtx.prevResponse = current
      if (step === 2) {
        volumeGenerationLogs.value.push(
          "检测到卷纲断点：将从第" + (startSi + 1) + "步继续（失败步骤会重试）"
        )
      }
      console.log("[PIPELINE] chain resumed from step " + (startSi + 1) + "/" + templates.length)
    }
    for (let si = startSi; si < templates.length; si++) {
      const t = templates[si]
      const ctxForSkill = { ...chainCtx, ...(t.customVars || {}) }
      const resolvedTemplate = resolveSkillTemplate(t.template, ctxForSkill)
      const useOriginal = si === 0 && startSi === 0
      const nextPrompt = buildChainSkillPrompt({
        initialPrompt: generationPrompt,
        previousOutput: current,
        memoryPrompt,
        isFirst: useOriginal
      })
      console.log("[PIPELINE] chain step " + (si + 1) + "/" + templates.length + " = " + t.name)
      if (step === 2) {
        volumeGenerationLogs.value.push("卷纲链式步骤 " + (si + 1) + "/" + templates.length + "：正在执行「" + (t.name || "未命名Skill") + "」")
      }
      if (step >= 2 && step <= 3) {
        pipelineStore.updateProgress(
          Math.min(65, 15 + Math.round(((si + 1) / templates.length) * 50)),
          "链式生成中：" + (si + 1) + "/" + templates.length
        )
      }
      // Need 1: per-skill agent override
      const skillAgentId = getStepSkillAgentId(step, t.id)
      const injection = getPromptParts(resolvedTemplate, t.injectMode || "system_prefix")
      try {
        const previousOutput = si === 0 ? "" : current
        current = await callValidatedSkill(
          step,
          t,
          injection,
          nextPrompt,
          { ...ctxForSkill, previousOutput },
          timeoutMs,
          skillAgentId
        )
        chainCtx.prevResponse = current
        // Persist a complete success checkpoint immediately after each Skill.
        await pipelineStore.saveBreakpoint(createChainSuccessBreakpoint({
          step,
          projectId: checkpointProjectId,
          skillIndex: si,
          skillId: t.id,
          skillSequence,
          lastSuccessChainIndex: si,
          lastOutput: current,
          inputPrompt: nextPrompt,
          agentId: fallbackAgentId(skillAgentId),
          retryCount: 0,
          volumeIndex: selectedVolumeIndex.value
        }))
      } catch (error) {
        // A failed Skill is a terminal chain state for this run; never pass stale output onward.
        await pipelineStore.saveBreakpoint(createChainFailureBreakpoint({
          step,
          projectId: checkpointProjectId,
          skillIndex: si,
          skillId: t.id,
          skillSequence,
          lastSuccessChainIndex: si - 1,
          lastOutput: si === 0 ? "" : current,
          inputPrompt: nextPrompt,
          agentId: fallbackAgentId(skillAgentId),
          retryCount: Number(bp?.skillId === t.id ? bp.retryCount || 0 : 0) + 1,
          volumeIndex: selectedVolumeIndex.value,
          error: error instanceof Error ? error.message : String(error)
        }))
        throw error
      }
    }
    await pipelineStore.clearBreakpoint()
    return current
  }
  const resolvedParts = templates.map((t) => {
    const ctxForSkill = { ...baseCtx, ...(t.customVars || {}) }
    return getPromptParts(resolveSkillTemplate(t.template, ctxForSkill), t.injectMode || "system_prefix")
  })
  const merged = mergePromptParts(resolvedParts)
  templates.forEach((template) => validateSkillInputOrThrow(template, baseCtx))
  const combined = merged.systemSkill || resolveSkillTemplate(fallbackTemplate || "", baseCtx)
  const composePrompt = generationPrompt
  let result: string
  const composeTemplate: PipelineSkillTemplate = {
    id: "compose",
    name: templates.map(t => t.name).filter(Boolean).join(" + ") || "Compose",
    template: combined,
    outputFormat: templates.some(t => t.outputFormat === "json") ? "json" : "text",
    outputSchema: templates.find(t => t.outputSchema)?.outputSchema,
    validationRules: templates.flatMap(t => t.validationRules || []),
    retryPolicy: templates.reduce((max, t) => Math.max(max, getSkillMaxAttempts(t.retryPolicy)), 1)
  }
  result = await callValidatedSkill(step, composeTemplate, merged, composePrompt, baseCtx, timeoutMs, undefined)
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
    const removedId = arr[index]?.id
    arr.splice(index, 1)
    if (selectedSettingId.value === removedId) {
      selectedSettingId.value = arr[index]?.id || arr[index - 1]?.id || ""
    }
    projectStore.saveProject()
  }
}

async function genSettings() {
  if (!projectStore.hasOutline || !projectStore.outlineLocked) return
  settingsGenerationLogs.value = ["已读取大纲锁定状态，准备构造设定生成请求"]
  pipelineStore.startGeneration()
  pipelineStore.updateProgress(10, "正在读取已确认大纲并生成设定")
  try {
    const prompt = "[已确认大纲]\n" + projectStore.pipelineOutlineText + "\n\n请基于这份已确认的大纲，提取并生成设定项。根据内容自动分配category；没有合适分类时使用设定类。输出JSON数组，每项含name/category/attrsText字段。"
    settingsGenerationLogs.value.push("请求已发送：正在等待 API 返回设定内容")
    const result = await runStepSkills(1, prompt, undefined, "你是设定生成专家。基于小说大纲生成详细设定。")
    settingsGenerationLogs.value.push("API 已返回：正在解析设定 JSON 并检查设定名称")
    pipelineStore.updateProgress(70, "正在解析设定内容")
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
        if (sc2.categories.length > 0) {
          selectedSettingCategory.value = firstCategoryWithSettings(["设定类", ...sc2.categories])
        }
        settingsGenerationLogs.value.push("设定已写入分类并保存到当前项目")
        pipelineStore.updateProgress(100, "设定生成完成")
        styleCardExpanded.value = true
      } else {
        settingsGenerationLogs.value.push("API 返回内容缺少有效设定名称")
        pipelineStore.failGeneration("未能解析设定内容")
      }
    } else {
      settingsGenerationLogs.value.push("API 返回内容不是可用的设定数组")
      pipelineStore.failGeneration("未能解析设定JSON")
    }
    pipelineStore.finishGeneration()
  } catch (e: any) {
    settingsGenerationLogs.value.push("API 调用失败：" + (e.message || "未知错误"))
    pipelineStore.failGeneration(e.message)
  }
}

async function genVolumes(mode: string) {
  if (!projectStore.pipelineOutlineText) return
  const existingCountBeforeGeneration = projectStore.volumes.length
  activeVolumeGenerationIndex.value = mode === "auto" ? 0 : existingCountBeforeGeneration
  volumeGenerationLogs.value = [
    mode === "single" ? "已选择逐卷生成，准备生成下一卷" : mode === "continue" ? "已选择续生成，准备补齐后续卷纲" : "已选择 AI 生成全卷，准备分析大纲和字数"
  ]
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
    const effectiveVolumes = Math.max(1, volumeCount.value)
    const existingCount = projectStore.volumes.length
    volumeGenerationLogs.value.push("已读取大纲、设定和全书字数，正在构造卷纲请求")
    const totalWords = Math.max(0, Math.round(bookWordCount.value * 10000))
    const allocatedSum = projectStore.volumes.reduce(
      (sum: number, v: any) => sum + Math.max(0, Math.round(Number(v.allocatedWords || v.suggestedWords) || 0)),
      0
    )
    const remainingWords = Math.max(0, totalWords - allocatedSum)
    let prompt: string
    if (mode === "continue" && existingCount > 0) {
      const lastVol = projectStore.volumes[existingCount - 1]
      prompt = "[大纲]\n" + projectStore.pipelineOutlineText + "\n\n[设定]\n" + settingsText + (boundText ? "\n\n[绑定设定]\n" + boundText : "") + "\n\n[卷数]\n" + effectiveVolumes + "\n\n[全书总字数]\n" + totalWords + "字\n\n[剩余待分配字数]\n" + remainingWords + "字\n\n已生成" + existingCount + "卷，上一卷为：" + lastVol.name + " - " + (lastVol.outline || lastVol.summary || "") + "。请继续生成第" + (existingCount + 1) + "卷到第" + effectiveVolumes + "卷的卷纲。输出JSON数组，每项含name/outline/summary/allocatedWords字段，allocatedWords为该卷分配字数（整数），本次生成各卷的allocatedWords之和应约等于剩余待分配字数。"
    } else if (mode === "single" && existingCount > 0) {
      const lastVol = projectStore.volumes[existingCount - 1]
      prompt = "[大纲]\n" + projectStore.pipelineOutlineText + "\n\n[设定]\n" + settingsText + (boundText ? "\n\n[绑定设定]\n" + boundText : "") + "\n\n[卷数]\n" + effectiveVolumes + "\n\n[全书总字数]\n" + totalWords + "字\n\n[剩余待分配字数]\n" + remainingWords + "字\n\n已生成" + existingCount + "卷，上一卷为：" + lastVol.name + " - " + (lastVol.outline || lastVol.summary || "") + "。请只生成第" + (existingCount + 1) + "卷的卷纲。输出JSON数组（正好1项），每项含name/outline/summary/allocatedWords字段，allocatedWords为该卷分配字数（整数）。"
    } else {
      prompt = "[大纲]\n" + projectStore.pipelineOutlineText + "\n\n[设定]\n" + settingsText + (boundText ? "\n\n[绑定设定]\n" + boundText : "") + "\n\n[卷数]\n" + effectiveVolumes + "\n\n[全书总字数]\n" + totalWords + "字\n\n请生成" + effectiveVolumes + "卷的卷纲。输出JSON数组，每项含name/outline/summary/allocatedWords字段，allocatedWords为该卷分配字数（整数），各卷allocatedWords之和应等于全书总字数。"
    }
    volumeGenerationLogs.value.push("请求已发送：正在等待 API 返回卷纲内容")
    const result = await runStepSkills(2, prompt, 600000, "你是卷纲生成专家。基于大纲和设定生成卷纲。")
    volumeGenerationLogs.value.push("API 已返回：正在解析卷纲 JSON 并校验卷数")
    pipelineStore.updateProgress(70, "正在解析卷纲内容")
    let volumes = extractJsonArray(result)
    if (volumes.length === 0) {
      volumeGenerationLogs.value.push("卷纲解析失败，正在重试一次")
      pipelineStore.updateProgress(75, "卷纲解析失败，重试中")
      const retryResult = await runStepSkills(2, prompt + "\n\n注意：上一次输出无法解析为JSON数组。请严格只输出JSON数组，每项含name/outline/summary/allocatedWords字段，不要输出解释文字。", 600000, "你是卷纲生成专家。基于大纲和设定生成卷纲。")
      volumes = extractJsonArray(retryResult)
    }
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
            allocatedWords: Math.max(0, Math.round(Number(v.allocatedWords) || 0)),
            confirmed: false,
            isBound: false,
            boundTo: [],
            bodyGenerated: false
          }))
        ]
      } else {
        projectStore.volumes = volumes.map((v: any) => ({
          ...v,
          allocatedWords: Math.max(0, Math.round(Number(v.allocatedWords) || 0)),
          confirmed: false,
          isBound: false,
          boundTo: [],
          bodyGenerated: false
        }))
      }
      projectStore.saveProject()
      volumeGenerationLogs.value.push("卷纲已写入卷框并保存到当前项目")
      pipelineStore.updateProgress(100, "卷纲生成完成")
    } else {
      volumeGenerationLogs.value.push("API 返回内容不是可用的卷纲数组")
      pipelineStore.failGeneration("未能解析卷纲JSON")
    }
    pipelineStore.finishGeneration()
  } catch (e: any) {
    const bp = pipelineStore.breakpoint
    if (bp && bp.step === 2 && bp.lastSuccessChainIndex !== undefined) {
      volumeGenerationLogs.value.push(
        "API 调用失败：" + (e.message || "未知错误") + "；已保留断点，下次将从第" + (bp.lastSuccessChainIndex + 2) + "步继续"
      )
    } else {
      volumeGenerationLogs.value.push("API 调用失败：" + (e.message || "未知错误"))
    }
    pipelineStore.failGeneration(e.message)
  }
}

async function loadOutline() {
  projectStore.setOutline(projectStore.outlineText)
  projectStore.saveProject()
}

async function callChapterApi(prompt: string): Promise<string> {
  const provider = providerStore.preferredGenerateProvider
  if (!provider?.id) throw new Error("未配置生成 API")
  const model = provider.selectedModel || provider.models?.[0] || ""
  if (!model) throw new Error("生成 API 未选择模型")
  chapterGenerationLogs.value.push("已连接生成 API：" + (provider.name || provider.id) + " / " + model)
  const aiService = await getAiService()
  const callResult = await aiService.callAi({
    purpose: 'generate',
    messages: [
      { role: "system", content: "你是章节规划师。请严格按照用户要求输出合法 JSON 数组，每项必须包含 title 和 plot 字段。不要输出 Markdown 或解释文字。" },
      { role: "user", content: prompt }
    ],
    model,
    signal: pipelineStore.getGenerationSignal(),
    onChunk: (text: string) => appendPipelineStream(3, text),
    retry: true,
    meta: { source: 'PipelinePanel.callChapterApi' }
  })
  return callResult.text || ""
}

async function genChapters() {
  const vol = selectedVolume.value
  if (!vol) return
  const volId = vol.id || vol.name
  const wordsPerChapter = Number(vol.wordsPerChapter || chapterWords.value || 3500)
  const totalChapters = Number(vol.chapterCount) || Math.ceil((Number(vol.allocatedWords) || Number(vol.suggestedWords) || Number(volumeWords.value) || 0) / wordsPerChapter)
  const projectId = projectStore.currentProjectId
  const savedBreakpoint = await pipelineStore.refreshBreakpoint()
  const matchingBreakpoint = savedBreakpoint && savedBreakpoint.kind === 'chapters'
    && savedBreakpoint.projectId === projectId
    && savedBreakpoint.volumeId === volId
    && Number(savedBreakpoint.total) === totalChapters
    ? savedBreakpoint
    : null
  const persistedChapters = (projectStore.chapters[volId] || [])
    .filter((chapter: any) => chapter.pipelineGenerated === true)
  const untouchedChapters = (projectStore.chapters[volId] || [])
    .filter((chapter: any) => chapter.pipelineGenerated !== true)
  // Existing generated chapters are never discarded merely because the
  // breakpoint is missing or belongs to another run. A fresh run starts
  // after the existing chapter list and only appends new, de-duplicated data.
  const existingChapters = persistedChapters.slice()
  chapterGenerationLogs.value = ["已选择卷「" + vol.name + "」，目标章数：" + totalChapters + "，单章字数：" + wordsPerChapter]
  if (matchingBreakpoint && persistedChapters.length > 0 && persistedChapters.length < totalChapters) {
    chapterGenerationLogs.value.push(
      "检测到章节断点：已保存 " + persistedChapters.length + "/" + totalChapters + " 章，将从第" + (persistedChapters.length + 1) + "章继续"
    )
  }
  pipelineStore.startGeneration()
  const resumeCount = matchingBreakpoint
    ? Math.min(Math.max(Number(matchingBreakpoint.chapterCount) || 0, existingChapters.length), totalChapters)
    : Math.min(existingChapters.length, totalChapters)
  const collected: any[] = existingChapters.slice(0, resumeCount)
  const saveChapterBreakpoint = async (phase: string) => {
    await pipelineStore.saveBreakpoint({
      kind: 'chapters',
      step: 3,
      projectId,
      volumeId: volId,
      volumeIndex: selectedVolumeIndex.value,
      chapterCount: collected.length,
      nextChapterIndex: collected.length,
      total: totalChapters,
      phase
    })
  }
  await saveChapterBreakpoint(collected.length > 0 ? 'resume-ready' : 'started')
  try {
    const volOutline = vol.outline || vol.summary || ""
    const batch = Math.max(1, Math.min(chapterBatchSize.value || 5, 20))
    while (collected.length < totalChapters) {
      const start = collected.length
      const requested = Math.min(batch, totalChapters - start)
      const end = start + requested
      const phase = start > 0 ? 'supplement' : 'batch'
      pipelineStore.updateProgress(Math.round((start / totalChapters) * 100), "生成 " + (start + 1) + "-" + end + "/" + totalChapters)
      chapterGenerationLogs.value.push(
        (phase === 'supplement' ? "补充生成" : "正在生成") + "第" + (start + 1) + "章到第" + end + "章（共" + totalChapters + "章）"
      )
      const prompt = "[卷纲]\n" + vol.name + " - " + volOutline + "\n\n[本卷总章数]\n" + totalChapters + "\n\n[单章字数]\n" + wordsPerChapter + "\n\n已有" + start + "章，" + (phase === 'supplement' ? "继续" : "请") + "生成第" + (start + 1) + "章到第" + end + "章的章节列表。不要重复已有章节。输出JSON数组，每项含title/plot字段。数组长度应为" + requested + "。"
      let added: any[] = []
      let lastError: any = null
      for (let retry = 0; retry < 5 && added.length === 0; retry++) {
        try {
          const result = await callChapterApi(prompt)
          const existingTitles = new Set(collected.map(c => c.title))
          const chapters = selectCompleteChapters(extractJsonArray(result).slice(0, requested * 2))
          added = chapters.filter((c: any) => !existingTitles.has(String(c.title).trim())).slice(0, requested)
          if (added.length === 0) {
            lastError = new Error("API 返回空章节或重复章节")
            if (retry < 4) await new Promise((r) => setTimeout(r, 5000))
          }
        } catch (retryErr: any) {
          if (pipelineStore.isGenerationCanceled()) throw retryErr
          lastError = retryErr
          await saveChapterBreakpoint('retry-wait')
          if (retry < 4) await new Promise((r) => setTimeout(r, 10000))
        }
      }
      if (added.length === 0) throw lastError || new Error("未能生成新的章节")
      added.forEach((c: any, idx: number) => {
        if (!c.id) c.id = "ch-" + String(volId).replace(/[^a-zA-Z0-9_-]/g, "-") + "-" + String(collected.length + idx + 1).padStart(3, "0")
        c.pipelineGenerated = true
        if (c.body === undefined) c.body = ""
        if (c.bodyGenerated === undefined) c.bodyGenerated = false
        if (c.wordCount === undefined) c.wordCount = 0
      })
      collected.push(...added)
      projectStore.setChapters(volId, [...untouchedChapters, ...collected])
      projectStore.refreshTree()
      await saveChapterBreakpoint('progress')
      chapterGenerationLogs.value.push("已生成 " + collected.length + "/" + totalChapters + " 章")
    }
    if (collected.length > 0) {
      const vr = validateChapters(collected, totalChapters)
      if (!vr.valid) {
        await saveChapterBreakpoint('failed-validation')
        pipelineStore.failGeneration(vr.errors.join("; "))
        chapterGenerationLogs.value.push("章节校验失败：" + vr.errors.join("; "))
        return
      }
      pipelineStore.updateProgress(100, "章节生成完成")
      chapterGenerationLogs.value.push("章节生成完成，共 " + collected.length + " 章")
    } else {
      pipelineStore.failGeneration("未能解析章节JSON")
      chapterGenerationLogs.value.push("AI 返回内容不是可用的章节 JSON")
    }
    await pipelineStore.clearBreakpoint()
    pipelineStore.finishGeneration()
  } catch (e: any) {
    await saveChapterBreakpoint('failed')
    pipelineStore.failGeneration(e.message)
    chapterGenerationLogs.value.push("API 调用失败：" + (e.message || "未知错误"))
  }
}

async function genBody(volumeIndex: number, chapterIndex: number) {
  const { vol, volId, chapter: ch } = getBodyChapterByVisibleIndex(volumeIndex, chapterIndex)
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
    const styleCtx = getStyleContext()
    const executionPackage = createChapterExecutionPackage({
      projectId: projectStore.currentProjectId,
      volume: vol,
      volumeIndex,
      chapter: ch,
      chapterIndex,
      outlineContent: projectStore.pipelineOutlineText,
      settings: allItems.map((s: any) => s.name + " - " + JSON.stringify(s.attrs)),
      boundSettings: boundText,
      styleContext: styleCtx,
      pacingContext: pacingParams.value,
      memoryContext: retrieveContext(projectStore.memories, {
        chapterId: String(ch.id || ""),
        chapterIndex,
        query: `${ch.title || ""} ${ch.plot || ""}`,
        maxChars: 2000
      }).text,
      sourceRefs: [
        projectStore.outlineLocked ? "outline:locked" : "outline:working",
        "volume:" + String(vol.id || vol.name),
        "chapter:" + String(ch.id || "")
      ]
    })
    ch.chapterExecutionPackage = executionPackage
    const prompt = buildChapterExecutionPrompt(executionPackage, chapterWords.value)
    const rawResult = await runStepSkills(4, prompt, undefined, "你是小说写作专家。请基于章节剧情点生成正文。")
    const generationResult = parseGenerationResult(rawResult)
    bodyResult.value = generationResult.body
    ch.body = generationResult.body
    ch.generationMetadata = generationResult.metadata
    ch.bodyGenerated = true
    projectStore.saveProject()
    projectStore.refreshTree()
    syncChapterManager(volId, ch, generationResult.body)
    // Insert into the editor automatically (same link as old architecture).
    window.dispatchEvent(new CustomEvent("insert-text", {
      detail: {
        text: generationResult.body,
        chapterId: ch.id || '',
        title: ch.title || '章节',
        mode: 'ch-body',
        openEditor: true
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

function deleteChapterCard(volumeIndex: number, chapterIndex: number) {
  const vol = projectStore.volumes[volumeIndex]
  const volId = vol?.id || vol?.name
  if (!volId) return
  const chs = projectStore.chapters[volId]
  const visibleChapters = (chs || []).filter((chapter: any) => chapter.pipelineGenerated === true)
  const target = visibleChapters[chapterIndex]
  const targetIndex = target?.id
    ? chs.findIndex((chapter: any) => chapter.id === target.id)
    : chapterIndex
  if (!chs || targetIndex < 0 || targetIndex >= chs.length) return
  chs.splice(targetIndex, 1)
  if (selectedChapterIndex.value >= visibleChapters.length - 1) {
    selectedChapterIndex.value = Math.max(0, visibleChapters.length - 2)
  }
  if (bodyVolumeIndex.value === volumeIndex) {
    const nextVisibleLength = visibleChapters.length - 1
    if (bodyChapterIndex.value >= nextVisibleLength) {
      bodyChapterIndex.value = Math.max(0, nextVisibleLength - 1)
    }
    bodyResult.value = ""
  }
  projectStore.refreshTree()
  projectStore.saveProject()
}

function insertToEditor() {
  const content = currentBodyContent.value || bodyResult.value
  if (!content) return
  const { chapter: ch } = getBodyChapterByVisibleIndex(bodyVolumeIndex.value, bodyChapterIndex.value)
  window.dispatchEvent(new CustomEvent("insert-text", {
    detail: {
      text: content,
      chapterId: ch?.id || '',
      title: ch?.title || '章节',
      mode: 'ch-body'
    }
  }))
}

function currentBodyChapter() {
  const { volId, chapter: ch } = getBodyChapterByVisibleIndex(bodyVolumeIndex.value, bodyChapterIndex.value)
  if (!ch || !volId) return null
  return {
    id: String(ch.id || `${volId}-chapter-${bodyChapterIndex.value + 1}`),
    index: bodyChapterIndex.value,
    title: String(ch.title || "未命名章节"),
    content: String(ch.body || currentBodyContent.value || bodyResult.value || "")
  }
}

function memoryChangeKey(change: any): string {
  return [change.kind || "", change.id || "", change.name || ""].join("\u0000")
}

function memoryEntryMatches(change: any, value: any): boolean {
  if (!value || typeof value !== "object") return false
  if (change.id && value.id === change.id) return true
  if (change.name && value.name === change.name) return true
  if (change.kind === "event" && change.name && value.title === change.name) return true
  return false
}

function markMemoryReview(change: any, review: "rejected" | "locked" | "pending") {
  const key = memoryChangeKey(change)
  const current = memoryPreviewChanges.value.find((item: any) => memoryChangeKey(item) === key)
  if (current) current.review = review
}

function rejectMemoryPreviewItem(index: number) {
  const change = memoryPreviewChanges.value[index]
  if (!change) return
  markMemoryReview(change, "rejected")
}

function toggleMemoryPreviewLock(index: number) {
  const change = memoryPreviewChanges.value[index]
  if (!change || change.review === "rejected") return
  markMemoryReview(change, change.review === "locked" ? "pending" : "locked")
}

function filterReviewedMemory(extracted: ExtractedMemoryData): ExtractedMemoryData {
  const rejected = new Set(
    memoryPreviewChanges.value
      .filter((change: any) => change.review === "rejected")
      .map((change: any) => memoryChangeKey(change))
  )
  const locked = memoryPreviewChanges.value.filter((change: any) => change.review === "locked")
  const filterList = (kind: string, values: any[]) => values.filter((value: any) => {
    const change = memoryPreviewChanges.value.find((item: any) => item.kind === kind && memoryEntryMatches(item, value))
    return !change || !rejected.has(memoryChangeKey(change))
  })
  const lockList = (kind: string, values: any[]) => values.map((value: any) => {
    const change = locked.find((item: any) => item.kind === kind && memoryEntryMatches(item, value))
    if (!change) return value
    const next = JSON.parse(JSON.stringify(value))
    if (kind === "entity") {
      next.lockedFields = Array.from(new Set([
        ...(Array.isArray(next.lockedFields) ? next.lockedFields : []),
        "description", "status", "notes"
      ]))
    } else {
      next.locked = true
    }
    return next
  })
  return {
    entities: lockList("entity", filterList("entity", extracted.entities || [])),
    relations: lockList("relation", filterList("relation", extracted.relations || [])),
    events: lockList("event", filterList("event", extracted.events || [])),
    world: lockList("world", filterList("world", extracted.world || [])),
    foreshadowing: lockList("foreshadowing", filterList("foreshadowing", extracted.foreshadowing || []))
  }
}

async function callMemoryApi(prompt: string, systemPrompt: string): Promise<string | null> {
  try {
    return await callApiWithAgent(4, systemPrompt, prompt)
  } catch (error) {
    console.warn("[PIPELINE] memory extraction API failed:", error)
    return null
  }
}

async function confirmBodyWithMemory() {
  const chapter = currentBodyChapter()
  if (!chapter || !chapter.content.trim()) return

  // 正文先落盘；记忆抽取失败不能回滚正文。
  const { volId, chapter: ch } = getBodyChapterByVisibleIndex(bodyVolumeIndex.value, bodyChapterIndex.value)
  if (ch) {
    ch.body = chapter.content
    ch.bodyGenerated = true
    projectStore.saveProject()
    projectStore.refreshTree()
  }

  memoryPreviewLoading.value = true
  memoryPreviewError.value = ""
  memoryPreviewVisible.value = true
  memoryPreviewChanges.value = []
  memoryPreviewExtracted.value = null
  memoryPreviewChapter.value = chapter
  try {
    const result = await extractMemory({
      chapterId: chapter.id,
      chapterIndex: chapter.index,
      chapterTitle: chapter.title,
      content: chapter.content
    }, callMemoryApi, 30000)
    if (!result.success) {
      memoryPreviewError.value = `记忆抽取失败：${result.error || "未知错误"}。正文已保存。`
      return
    }
    memoryPreviewExtracted.value = result.data
    const merged = mergeMemory(projectStore.memories, result.data, {
      chapterId: chapter.id,
      chapterIndex: chapter.index,
      blacklist: projectStore.memoryBlacklist
    })
    memoryPreviewChanges.value = merged.changes.map((change: any) => ({ ...change, review: "pending" }))
  } catch (error: any) {
    memoryPreviewError.value = `记忆抽取失败：${error?.message || "未知错误"}。正文已保存。`
  } finally {
    memoryPreviewLoading.value = false
  }
}

function closeMemoryPreview() {
  if (memoryPreviewSaving.value) return
  memoryPreviewVisible.value = false
  memoryPreviewError.value = ""
  memoryPreviewChanges.value = []
  memoryPreviewExtracted.value = null
  memoryPreviewChapter.value = null
}

async function confirmMemoryPreview() {
  const chapter = memoryPreviewChapter.value
  const extracted = memoryPreviewExtracted.value
  if (!chapter || !extracted) {
    closeMemoryPreview()
    return
  }
  memoryPreviewSaving.value = true
  let written = false
  try {
    const reviewed = filterReviewedMemory(extracted)
    const merged = mergeMemory(projectStore.memories, reviewed, {
      chapterId: chapter.id,
      chapterIndex: chapter.index,
      blacklist: projectStore.memoryBlacklist
    })
    await projectStore.recordMemoryChange(merged.data, {
      chapterId: chapter.id,
      chapterIndex: chapter.index,
      reason: `确认正文后写入记忆：${chapter.title}`
    })
    confirmStep(4)
    written = true
  } catch (error: any) {
    memoryPreviewError.value = `记忆写入失败：${error?.message || "未知错误"}`
  } finally {
    memoryPreviewSaving.value = false
  }
  if (written) closeMemoryPreview()
}

  onMounted(async () => {
  const saved = await window.electronAPI.storageRead(storageKey("pipeline_step_config"))
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
      stepSkillAgents.value = migrateSkillAgentBindings(saved.skillAgents, stepSkills.value)
    }
    if (saved.modes) {
      stepSkillModes.value = { 0: "compose", 1: "compose", 2: "chain", 3: "chain", 4: "chain" }
      let m = saved.modes
      for (let i = 0; i < 5; i++) {
        const savedMode = m[i] !== undefined ? m[i] : m[i + 1]
        if (savedMode !== undefined) {
          stepSkillModes.value[i] = savedMode === "chain" ? "chain" : "compose"
        }
      }
    }
     if (saved.bookWordCount) bookWordCount.value = Math.round(saved.bookWordCount / 10000)
     if (saved.volumeWords) volumeWords.value = saved.volumeWords
     if (saved.volumeCount) volumeCount.value = saved.volumeCount
     if (saved.chapterWords) chapterWords.value = saved.chapterWords
   }
   if (projectStore.bookWordCountChars > 0 && bookWordCount.value <= 0) {
     bookWordCount.value = Math.round(projectStore.bookWordCountChars / 10000)
   } else if (projectStore.bookWordCountChars <= 0 && bookWordCount.value > 0) {
     projectStore.bookWordCountChars = Math.round(bookWordCount.value * 10000)
     projectStore.saveProject()
   }
   // 当大纲已锁定但字数未设置时，自动填入默认值
   if (bookWordCount.value <= 0 && projectStore.outlineLocked && projectStore.outlineText) {
     bookWordCount.value = 10
   }
   // 恢复已完成标记，但保留大纲层作为进入流水线后的首个确认入口。
   if (projectStore.outlineLocked) {
     steps.value[0].completed = true
  }
  if (projectStore.settingsGenerated) steps.value[1].completed = true
  if (projectStore.volumesConfirmed) steps.value[2].completed = true
  if (projectStore.chaptersConfirmed) steps.value[3].completed = true
  if (settingNavigationCategories.value.length > 0) {
    selectedSettingCategory.value = firstCategoryWithSettings()
  }
})

const selectedChapter = computed(() => currentVolumeChapters.value[selectedChapterIndex.value] || null)

const chapterDetailVisible = ref(false)
const chapterDetailEditTitle = ref('')
const chapterDetailEditPlot = ref('')

function openChapterDetail(index: number) {
  const ch = currentVolumeChapters.value[index]
  if (!ch) return
  selectedChapterIndex.value = index
  chapterDetailEditTitle.value = ch.title || ''
  chapterDetailEditPlot.value = ch.plot || ''
  chapterDetailVisible.value = true
}

function closeChapterDetail() {
  chapterDetailVisible.value = false
}

function saveChapterDetail() {
  const ch = selectedChapter.value
  if (!ch) return
  ch.title = chapterDetailEditTitle.value
  ch.plot = chapterDetailEditPlot.value
  chapterDetailVisible.value = false
  saveChapterPlot()
}

watch(
  () => [selectedVolumeIndex.value, currentVolumeChapters.value.length],
  () => {
    if (selectedChapterIndex.value >= currentVolumeChapters.value.length) {
      selectedChapterIndex.value = Math.max(0, currentVolumeChapters.value.length - 1)
    }
  },
  { immediate: true }
)

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
    const { chapter: ch } = getBodyChapterByVisibleIndex(bodyVolumeIndex.value, bodyChapterIndex.value)
    window.dispatchEvent(new CustomEvent("insert-text", {
      detail: {
        text: bodyResult.value,
        chapterId: ch?.id || "",
        title: ch?.title || "章节",
        mode: 'ch-body'
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
.pl-style-card { margin-bottom: var(--space-4); border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-input); overflow: hidden; }
.pl-style-card-header { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-4); cursor: pointer; user-select: none; }
.pl-style-card-title { font-weight: 600; font-size: var(--font-size-sm); white-space: nowrap; }
.pl-style-card-summary { flex: 1; min-width: 0; font-size: var(--font-size-xs); color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pl-style-card-toggle { font-size: var(--font-size-xs); color: var(--text-secondary); white-space: nowrap; flex-shrink: 0; }
.pl-style-card-body { display: flex; gap: var(--space-4); padding: var(--space-3) var(--space-4); border-top: 1px solid var(--border-color); max-height: min(46vh, 420px); overflow-y: auto; }
.pl-style-tags-section { flex: 1; min-width: 0; }
.pl-style-pacing-section { flex: 1; min-width: 0; }
.pl-style-section-label { display: block; font-size: var(--font-size-xs); font-weight: 600; color: var(--text-secondary); margin-bottom: var(--space-2); }
.pl-style-tag-pool { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-2); }
.pl-style-tag-chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); font-size: var(--font-size-xs); cursor: pointer; user-select: none; }
.pl-style-tag-chip.active { background: var(--accent); color: white; border-color: var(--accent); }
.pl-style-tag-chip input { width: 12px; height: 12px; margin: 0; }
.pl-style-tag-add { display: flex; gap: var(--space-1); }
.pl-style-tag-add input { flex: 1; min-width: 0; }
.pl-pacing-grid { display: flex; flex-direction: column; gap: var(--space-2); }
.pl-pacing-item { display: flex; align-items: center; gap: var(--space-2); }
.pl-pacing-item label { font-size: var(--font-size-xs); white-space: nowrap; min-width: 70px; }
.pl-pacing-item select { flex: 1; min-width: 0; }
.pl-pacing-slider { display: flex; align-items: center; gap: var(--space-2); flex: 1; }
.pl-pacing-slider input[type=range] { flex: 1; }
.pl-pacing-slider span { font-size: var(--font-size-xs); white-space: nowrap; }
.pl-pacing-restore { margin-top: var(--space-2); }
.pl-overlay.pl-fullscreen { align-items: stretch; justify-content: stretch; }
.pl-content-fullscreen { width: 100% !important; height: 100% !important; max-width: 100% !important; max-height: 100% !important; border-radius: 0 !important; border: none !important; }
.pl-memory-preview-overlay { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; padding: var(--modal-gutter); background: var(--bg-overlay); z-index: var(--z-modal-nested); pointer-events: auto; }
.pl-memory-preview-modal { position: relative; z-index: var(--z-modal-nested-content); width: min(var(--modal-width-lg), 100%); max-height: var(--modal-max-height); min-height: 0; display: flex; flex-direction: column; overflow: hidden; background: var(--bg-panel); border: 1px solid var(--border-color); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); pointer-events: auto; }
.pl-memory-preview-header, .pl-memory-preview-footer { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 20px; }
.pl-memory-preview-header { border-bottom: 1px solid var(--border-color); }
.pl-memory-preview-subtitle { display: block; margin-top: 4px; color: var(--text-secondary); font-size: 12px; }
.pl-memory-preview-body { min-height: 120px; overflow: auto; padding: 16px 20px; }
.pl-memory-preview-footer { justify-content: flex-end; border-top: 1px solid var(--border-color); }
.pl-memory-change-list { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }
.pl-memory-change-item { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 8px 12px; padding: 12px; border: 1px solid var(--border-color); border-radius: 6px; }
.pl-memory-change-kind { color: var(--text-secondary); font-size: 12px; }
.pl-memory-change-item small { grid-column: 1 / -1; color: var(--text-secondary); }
.pl-memory-change-actions { grid-column: 1 / -1; display: flex; justify-content: flex-end; gap: 8px; }
.pl-memory-preview-error { color: var(--danger); }
.pl-content { width: min(1400px, 96vw); height: min(920px, 96vh); max-width: 1400px; max-height: 96vh; background: var(--bg-glass); border: 1px solid var(--border-color); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); display: flex; flex-direction: column; }
.pl-header { display: flex; align-items: center; justify-content: space-between; padding: var(--space-5) var(--space-8); border-bottom: 1px solid var(--border-color); font-size: var(--font-size-xl); font-weight: 600; }
.pl-header-title { }
.pl-header-actions { display: flex; align-items: center; gap: var(--space-2); }
.pl-body { display: flex; flex: 1; overflow: hidden; }
/* 左侧五层步骤导航 - 竖排 */
.pl-steps { width: clamp(200px, 18vw, 280px); background: var(--pipeline-step-bg); border-right: 1px solid var(--border-color); padding: 16px 8px; display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; }
.pl-step { display: flex; align-items: center; gap: 12px; padding: 16px 18px; cursor: pointer; border-radius: var(--radius-lg); opacity: 0.5; transition: opacity 0.15s ease, background 0.15s ease; }
.pl-step:hover { opacity: 0.8; background: var(--bg-hover); }
.pl-step.active { opacity: 1; background: var(--pipeline-step-active-bg); border: 1px solid var(--pipeline-step-active-border); }
.pl-step.completed { opacity: 1; }
.pl-step-num { width: 34px; height: 34px; border-radius: 50%; background: var(--bg-tertiary); color: var(--text-primary); display: flex; align-items: center; justify-content: center; font-size: var(--font-size-lg); font-weight: bold; flex-shrink: 0; transition: background 0.15s ease; }
.pl-step.active .pl-step-num { background: var(--accent); color: var(--text-on-accent); }
.pl-step.completed { background: var(--pipeline-step-complete-bg); border-color: var(--pipeline-step-complete-border); }
.pl-step.completed .pl-step-num { background: var(--pipeline-step-complete-border); color: var(--text-on-accent); }
.pl-step-label { font-size: var(--font-size-lg); color: var(--text-primary); font-weight: 500; }
.pl-step-check { margin-left: auto; color: var(--success); font-size: var(--font-size-xl); }
/* 右侧内容区 */
.pl-content-right { display: flex; flex-direction: column; flex: 1; padding: 24px 24px 32px; overflow-y: auto; min-width: 0; }
#pl-step-2-content {
  min-width: 0;
  overflow-y: auto;
  overflow-x: hidden;
}
.pl-step-panel h3 { font-size: var(--font-size-xxl); margin-bottom: 20px; }
.pl-textarea { width: 100%; min-height: 400px; background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 16px; font-size: var(--font-size-lg); line-height: 1.8; resize: vertical; outline: none; }
.pl-input { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 6px 12px; font-size: var(--font-size-md); height: 36px; outline: none; flex: 1; }
.pl-input-sm { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 6px 10px; font-size: var(--font-size-md); height: var(--input-height, 34px); outline: none; }
.pl-attrs-input { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: var(--space-4) var(--space-6); font-size: var(--font-size-md); min-height: 80px; flex: 1; resize: vertical; outline: none; }
.pl-vol-config { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; font-size: var(--font-size-lg); flex-wrap: wrap; }
.pl-vol-config label { color: var(--text-secondary); }
.pl-volume-linked-book-words { display: inline-flex; align-items: baseline; gap: 8px; width: 100%; padding: 8px 12px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-secondary); color: var(--text-secondary); }
.pl-volume-linked-book-words strong { color: var(--text-primary); font-size: var(--font-size-lg); }
.pl-vol-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
  min-height: 0;
  margin-bottom: var(--space-4);
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.pl-vol-list { max-height: min(56vh, 620px); }
.pl-volume-table {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.pl-volume-table-head,
.pl-volume-row {
  display: grid;
  grid-template-columns: 44px minmax(120px, 0.8fr) minmax(0, 2.2fr) 96px 84px minmax(220px, auto);
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}
.pl-volume-table-head {
  padding: var(--space-2) var(--space-3);
  color: var(--text-muted);
  font-size: var(--font-size-xs);
  border-bottom: 1px solid var(--border-color);
}
.pl-volume-row {
  padding: var(--space-2) var(--space-3);
  min-height: 48px;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-primary);
  font-size: var(--font-size-sm);
  cursor: pointer;
}
.pl-volume-row:hover { background: var(--bg-secondary); }
.pl-volume-row.active,
.pl-volume-row.expanded { background: var(--accent-dim); }
.pl-volume-col { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pl-volume-col-index { text-align: center; color: var(--text-secondary); }
.pl-volume-col-name { font-weight: 600; }
.pl-volume-col-outline { color: var(--text-secondary); }
.pl-volume-col-words { text-align: right; white-space: nowrap; }
.pl-volume-col-status { text-align: center; font-weight: 600; white-space: nowrap; }
.pl-volume-col-status.bound { color: var(--success); }
.pl-volume-col-status.locked { color: var(--warning); }
.pl-volume-col-status.editing { color: var(--text-muted); font-weight: 400; }
.pl-volume-col-actions { display: flex; align-items: center; justify-content: flex-end; gap: var(--space-1); overflow: visible; }
.pl-volume-row-editor {
  padding: var(--space-3) var(--space-3) var(--space-4);
  margin: 0 0 var(--space-2);
  border: 1px solid var(--border-color);
  border-top: none;
  border-radius: 0 0 var(--radius-md) var(--radius-md);
  background: var(--bg-secondary);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.pl-volume-editor-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
  gap: var(--space-2);
}
.pl-volume-editor-words { color: var(--text-secondary); font-size: var(--font-size-sm); }
.pl-volume-workspace {
  display: grid;
  grid-template-columns: minmax(190px, 0.28fr) minmax(0, 1fr);
  gap: var(--space-4);
  min-width: 0;
  min-height: 0;
}
.pl-ch-workspace {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.pl-object-select-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
  min-height: 0;
  max-height: min(56vh, 620px);
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.pl-object-select-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-width: 0;
  min-height: 54px;
  padding: var(--space-3);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-secondary);
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
}
.pl-object-select-item:hover { background: var(--bg-hover); }
.pl-object-select-item.active {
  border-color: var(--accent);
  background: var(--accent-dim);
}
.pl-object-select-item.confirmed { border-left: 3px solid var(--success); }
.pl-object-select-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  border-radius: 50%;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  font-weight: 700;
}
.pl-object-select-copy {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  gap: 2px;
}
.pl-object-select-copy strong,
.pl-object-select-copy small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pl-object-select-copy strong { font-size: var(--font-size-md); }
.pl-object-select-copy small { color: var(--text-muted); font-size: var(--font-size-sm); }
.pl-object-select-state { flex: 0 0 auto; color: var(--success); font-weight: 700; }
.pl-object-editor {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 260px;
  padding: var(--space-4);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--pipeline-feedback-bg);
  overflow: hidden;
}
.pl-object-editor-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  min-width: 0;
  margin-bottom: var(--space-3);
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--border-color);
}
.pl-editor-kicker { color: var(--text-muted); font-size: var(--font-size-sm); }
.pl-object-editor-heading h4 {
  min-width: 0;
  margin: 2px 0 0;
  overflow-wrap: anywhere;
  color: var(--text-primary);
  font-size: var(--font-size-lg);
}
.pl-object-editor-status {
  flex: 0 0 auto;
  color: var(--accent);
  font-size: var(--font-size-sm);
}
.pl-object-editor-status.locked { color: var(--success); }
.pl-vol-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.vol-words { font-size: var(--font-size-md); color: var(--text-muted); flex-shrink: 0; }
.pl-vol-outline { width: 100%; min-height: 100px; background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 10px; font-size: var(--font-size-md); resize: vertical; outline: none; margin-bottom: 10px; }
.pl-volume-card-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding-top: 4px; }
.pl-ch-config { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; font-size: var(--font-size-lg); flex-wrap: wrap; }
.pl-ch-config label { color: var(--text-secondary); }
.pl-ch-table-wrap {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-secondary);
  overflow: hidden;
}
.pl-ch-thead,
.pl-ch-tr {
  display: grid;
  grid-template-columns: 48px minmax(120px, 0.9fr) minmax(0, 2fr) 72px minmax(160px, auto);
  align-items: center;
  gap: var(--space-2);
  padding: 0 var(--space-3);
}
.pl-ch-thead {
  height: 38px;
  color: var(--text-muted);
  font-size: var(--font-size-sm);
  background: var(--bg-elevated, var(--bg-tertiary));
  border-bottom: 1px solid var(--border-color);
}
.pl-ch-tbody {
  display: flex;
  flex-direction: column;
  min-width: 0;
  max-height: min(52vh, 520px);
  overflow-y: auto;
  overscroll-behavior: contain;
}
.pl-ch-tr {
  min-height: 46px;
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
}
.pl-ch-tr:hover { background: var(--bg-hover); }
.pl-ch-tr.active { background: var(--accent-dim); }
.pl-ch-tr.confirmed { border-left: 3px solid var(--success); }
.pl-ch-tr:last-child { border-bottom: 0; }
.pl-ch-cell-idx { color: var(--text-muted); text-align: center; }
.pl-ch-cell-title {
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pl-ch-cell-plot {
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pl-ch-state-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 22px;
  padding: 0 8px;
  border-radius: 11px;
  font-size: var(--font-size-sm);
  white-space: nowrap;
}
.pl-ch-state-tag.locked { color: var(--success); background: rgba(76,175,136,.1); }
.pl-ch-state-tag.editing { color: var(--text-muted); background: rgba(255,255,255,.04); }
.pl-ch-cell-ops {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
}
.pl-ch-detail-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal-nested);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--modal-gutter);
  background: var(--bg-overlay);
}
.pl-ch-detail-modal {
  display: flex;
  flex-direction: column;
  width: min(680px, 100%);
  max-height: min(76vh, 640px);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--bg-glass);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}
.pl-ch-detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-elevated, var(--bg-secondary));
}
.pl-ch-detail-header strong { font-size: var(--font-size-md); color: var(--text-primary); }
.pl-ch-detail-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
  overflow-y: auto;
}
.pl-ch-detail-meta {
  display: flex;
  gap: var(--space-4);
  color: var(--text-muted);
  font-size: var(--font-size-sm);
  margin-bottom: var(--space-2);
}
.pl-ch-detail-label { color: var(--text-secondary); font-size: var(--font-size-sm); }
.pl-ch-detail-input {
  width: 100%;
  height: var(--input-height, 34px);
  padding: 0 10px;
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: var(--font-size-md);
  outline: none;
}
.pl-ch-detail-plot {
  width: 100%;
  min-height: 180px;
  padding: 10px;
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: var(--font-size-md);
  line-height: 1.7;
  resize: vertical;
  outline: none;
  font-family: inherit;
}
.pl-ch-detail-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--border-color);
  background: var(--bg-elevated, var(--bg-secondary));
}
.pl-ch-detail-hint { color: var(--text-muted); font-size: var(--font-size-sm); }
.pl-ch-detail-actions { display: flex; gap: var(--space-2); }
.ch-title { flex: 1; font-size: var(--font-size-md); color: var(--text-primary); }
.pl-body-config { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; font-size: var(--font-size-lg); flex-wrap: wrap; }
.pl-body-config label { color: var(--text-secondary); }
.pl-body-result { background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 16px; margin-bottom: 12px; max-height: 400px; overflow-y: auto; }
.pl-body-text { font-size: var(--font-size-lg); line-height: 1.8; white-space: pre-wrap; color: var(--text-primary); }
.pl-gen-options { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; font-size: var(--font-size-lg); color: var(--text-secondary); flex-wrap: wrap; }
.pl-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-3);
  flex-wrap: wrap;
  flex: 0 0 auto;
  margin-top: auto;
  padding-top: var(--space-4);
  border-top: 1px solid var(--border-color);
}
.pl-generation-feedback-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal-nested);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--modal-gutter);
  background: var(--bg-overlay);
}
.pl-generation-feedback-modal {
  display: flex;
  flex-direction: column;
  width: min(620px, 100%);
  max-height: min(76vh, 640px);
  padding: var(--space-4);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--bg-glass);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}
.pl-generation-feedback-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  color: var(--text-primary);
  font-size: var(--font-size-md);
}
.pl-generation-progress-track {
  width: 100%;
  height: 8px;
  margin-top: var(--space-3);
  overflow: hidden;
  border-radius: var(--radius-sm);
  background: var(--pipeline-progress-track);
}
.pl-generation-progress-value {
  height: 100%;
  min-width: 0;
  border-radius: inherit;
  background: var(--pipeline-progress-value);
  transition: width 180ms ease;
}
.pl-generation-log {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  max-height: 132px;
  margin-top: var(--space-3);
  overflow-y: auto;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  line-height: 1.5;
}
.pl-generation-feedback-modal .pl-generation-log {
  flex: 1 1 auto;
  min-height: 120px;
  max-height: min(40vh, 340px);
}
.pl-generation-log-line {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
}
.pl-generation-log-dot {
  width: 6px;
  height: 6px;
  flex: 0 0 6px;
  margin-top: 7px;
  border-radius: 50%;
  background: var(--accent);
}
.pl-generation-status {
  margin-top: var(--space-3);
  color: var(--text-muted);
  font-size: var(--font-size-sm);
}
.pl-generation-modal-footer {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-top: var(--space-3);
}
.pl-generation-modal-footer .pl-generation-status {
  margin-top: 0;
  min-width: 0;
}
.pl-generation-modal-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.pl-result { background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 20px; margin: 20px 0; max-height: 450px; overflow-y: auto; white-space: pre-wrap; font-size: var(--font-size-lg); color: var(--text-primary); }
.pl-gen-hint { color: var(--text-muted); font-size: var(--font-size-md); }
.pl-vol-card.confirmed { border-color: var(--success); }
.pl-vol-card,
.pl-vol-card input,
.pl-vol-card textarea,
.pl-vol-card input {
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
}
.pl-vol-generation-card,
.pl-vol-generation-feedback {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  border-color: var(--accent);
  background: var(--pipeline-feedback-bg);
}
.pl-vol-generation-card { padding: var(--space-4); }
.pl-vol-generation-feedback { margin-top: var(--space-3); padding: var(--space-3); }
.pl-vol-generation-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  color: var(--text-primary);
  font-size: var(--font-size-md);
}
.empty-hint { color: var(--text-muted); font-size: var(--font-size-lg); text-align: center; padding: 30px; }
.input-w-60 { width: 60px; }
.input-w-80 { width: 80px; }

.pl-tools-title { font-size: var(--font-size-sm); font-weight: 600; color: var(--text-primary); margin-bottom: 6px; }
.pl-readonly { opacity: 0.7; cursor: default; }
.pl-step-tools { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
.pl-settings-tools { flex: 0 0 auto; }
.pl-settings-control-row {
  display: grid;
  grid-template-columns: auto minmax(170px, 1.1fr) auto minmax(130px, 0.9fr) 28px auto minmax(120px, 0.7fr);
  align-items: center;
  gap: 10px;
  padding: var(--space-3) var(--space-4);
  background: var(--bg-elevated, var(--bg-secondary));
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
}
.pl-settings-control-row .pl-label,
.pl-settings-control-row .pl-mode-label { font-size: var(--font-size-md); color: var(--text-secondary); white-space: nowrap; }
.pl-settings-control-row .pl-select { min-width: 0; height: var(--input-height, 34px); padding: 0 10px; background: var(--bg-input); border: 1px solid var(--border-color); border-radius: var(--radius-sm); color: var(--text-primary); font-size: var(--font-size-md); cursor: pointer; }
.pl-selected-skills-row {
  align-items: center;
  min-height: 34px;
  padding: 4px var(--space-2);
  margin-bottom: 0;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-elevated, var(--bg-secondary));
}
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
.pl-chip-seq { width: 18px; height: 18px; border-radius: 50%; background: var(--accent); color: var(--text-on-accent); font-size: 10px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.pl-tools-section { padding: 6px 0; margin-bottom: 10px; border-bottom: 1px solid var(--border-color); }
.pl-tools-grid { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.pl-tool-result { margin-top: 6px; padding: 6px 10px; background: var(--bg-input); border: 1px solid var(--border-color); border-radius: var(--radius-sm); font-size: var(--font-size-sm); color: var(--text-primary); max-height: 60px; overflow-y: auto; }
.pl-tool-loading { margin-top: 4px; font-size: var(--font-size-sm); color: var(--accent); }

.pl-chip-agent { height: 22px; padding: 0 6px; font-size: 10px; min-width: 60px; width: auto; border-radius: var(--radius-sm); background: var(--bg-input); border: 1px solid var(--border-color); color: var(--text-primary); cursor: pointer; }
.pl-add-setting-overlay { position: fixed; inset: 0; padding: var(--modal-gutter); background: var(--bg-overlay); display: flex; align-items: center; justify-content: center; z-index: var(--z-modal-nested); }
.pl-add-setting-modal { width: min(var(--modal-width), 100%); max-height: var(--modal-max-height); min-height: 0; background: var(--bg-glass); border: 1px solid var(--border-color); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); overflow: hidden; }
.pl-add-setting-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border-color); font-size: var(--font-size-lg); font-weight: 600; }
.pl-add-setting-body { display: flex; flex-direction: column; gap: 8px; padding: 20px; }
.pl-add-setting-body label { font-size: var(--font-size-md); color: var(--text-secondary); }
.pl-add-setting-body .pl-input-sm { width: 100%; }
.pl-add-setting-body .pl-attrs-input { min-height: 140px; }
.pl-add-setting-footer { display: flex; justify-content: flex-end; gap: 10px; padding: 14px 20px; border-top: 1px solid var(--border-color); }
.pl-setting-detail-modal-footer { justify-content: space-between; }
.pl-setting-detail-modal-actions { display: flex; align-items: center; gap: 10px; }


.pl-step-view {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}
.pl-step-panel {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}
.pl-settings-workspace {
  display: flex;
  flex-direction: column;
  width: 100%;
  box-sizing: border-box;
  gap: var(--space-4);
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
}
.pl-settings-navigation {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-3);
  min-width: 0;
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--border-color);
}
.pl-settings-navigation-label {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  font-weight: 600;
  white-space: nowrap;
}
.pl-sc-categories {
  display: flex;
  flex: 1 1 auto;
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
}
.pl-sc-cat-item,
.pl-sc-add-cat {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  width: auto;
  max-width: 100%;
  flex-shrink: 0;
  min-height: var(--input-height);
  padding: 0 var(--space-3);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  background: transparent;
  font-size: var(--font-size-md);
  text-align: center;
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
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}
.pl-sc-add-cat-row .pl-input-sm { min-width: 0; flex: 1; }
.pl-sc-content-frame {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 220px;
  min-width: 0;
  padding: var(--space-4);
  max-height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--pipeline-feedback-bg);
}
.pl-sc-editor {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
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
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  align-content: start;
  gap: var(--space-3);
  min-width: 0;
  min-height: 0;
  flex: 0 1 auto;
  max-height: min(52vh, 360px);
  overflow-y: auto;
}
.pl-setting-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  width: 100%;
  min-width: 0;
  height: 100%;
  padding: var(--space-3);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-tertiary);
  cursor: pointer;
}
.pl-setting-card.active {
  border-color: var(--accent);
  background: var(--bg-secondary);
}
.pl-setting-item-name,
.pl-setting-item-summary {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pl-setting-item-name { color: var(--text-primary); font-weight: 600; }
.pl-setting-item-summary {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  line-height: 1.45;
  white-space: normal;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.pl-setting-card-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  margin-top: auto;
}
.pl-setting-card-actions .btn-sm {
  min-width: 62px;
  padding: 2px var(--space-2);
}
.pl-setting-info-btn { flex-shrink: 0; }
.pl-setting-item-index { position: absolute; left: 4px; top: 2px; color: var(--text-muted); font-size: 10px; }
.pl-setting-detail { display: flex; flex-direction: column; gap: var(--space-2); min-height: 0; padding-top: var(--space-3); }
.pl-setting-detail-heading, .pl-setting-detail-actions { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); flex-wrap: wrap; }
.pl-setting-detail-heading { color: var(--text-primary); font-weight: 600; }
.pl-setting-detail-status { color: var(--text-muted); font-size: var(--font-size-sm); font-weight: 400; }
.pl-setting-detail-fields { display: grid; grid-template-columns: minmax(160px, 0.4fr) minmax(0, 1fr); gap: var(--space-2); min-height: 0; }
.pl-setting-detail-fields .pl-attrs-input { min-height: 88px; resize: vertical; }
.pl-setting-detail-actions { justify-content: flex-end; }
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

@media (max-width: 1200px) {
  .pl-settings-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .pl-settings-workspace {
    gap: var(--space-3);
  }
  .pl-settings-control-row {
    grid-template-columns: auto minmax(0, 1fr) auto minmax(0, 1fr);
    grid-auto-rows: minmax(34px, auto);
  }
  .pl-settings-control-row .btn-icon { justify-self: start; }
  .pl-settings-control-row .pl-mode-label,
  .pl-settings-control-row .pl-mode-select { grid-column: auto / span 1; }
  .pl-settings-navigation {
    padding-right: 0;
    align-items: flex-start;
  }
  .pl-sc-categories { flex-basis: 100%; }
  .pl-settings-list { grid-template-columns: 1fr; }
  .pl-setting-detail-fields { grid-template-columns: 1fr; }
}

.pl-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>

