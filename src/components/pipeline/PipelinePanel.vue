<template>
  <div id="pipeline-panel" data-modal-id="pipeline-panel" class="modal-overlay pl-fullscreen" :style="{ zIndex: modalQueue.getZIndex('pipeline-panel') }" @click.self="$emit('close')">
    <div class="pl-content pl-content-fullscreen">
      <div class="pl-header">
        <span class="pl-header-title">生成流水线</span>
        <div class="pl-header-actions">
          <button class="btn-sm btn-secondary" id="btn-pl-minimize" data-tooltip="缩小到顶栏" @click="$emit('minimize')">缩小</button>
          <button class="btn-sm btn-secondary" id="btn-run-trace" @click="openRunTracePanel">运行记录</button>
          <button class="btn-sm btn-secondary" id="btn-export-pipeline-bindings" @click="exportPipelineBindings">导出绑定</button>
          <button class="btn-sm btn-secondary" id="btn-import-pipeline-bindings" @click="importPipelineBindings">导入绑定</button>
          <button class="btn-sm btn-secondary" id="btn-flow-toggle" @click="showFlowView = !showFlowView">{{ showFlowView ? '步骤视图' : '流程视图' }}</button>
          <button v-if="pipelineStore.isGenerating" id="btn-pl-cancel-generation" class="btn-sm btn-danger" @click="pipelineStore.cancelGeneration()">取消生成</button>
          <button id="btn-close-pl" class="modal-close" type="button" aria-label="关闭流水线" @click="$emit('close')"><AppIcon name="x" /></button>
        </div>
      </div>
      <div class="pl-body">
        <div v-if="bindingImportPreview" id="pl-binding-import-preview" data-modal-id="pl-binding-import-preview" class="modal-overlay modal-nested" :style="{ zIndex: modalQueue.getZIndex('pl-binding-import-preview') }" role="dialog" aria-modal="true">
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
            <AppIcon v-if="step.completed" name="check" class="pl-step-check" />
          </div>
        </div>
        
        
        

        <div class="pl-content-right">

        <div class="pl-tools-section">
          <div class="pl-tools-grid">
            <span class="pl-label pl-tools-label">AI工具:</span>
            <button id="btn-ai-names" class="btn-sm btn-secondary" @click="openNaming">AI起名</button>
          </div>
        </div>
          <PipelineFlow v-if="showFlowView" :steps-with-ids="stepsWithIds" :step-agents="stepAgents" :step-skills="stepSkills" :step-skill-modes="stepSkillModes" @toggle-view="showFlowView = false" />
          <div v-show="!showFlowView" class="pl-step-view">
          <div v-show="pipelineStore.currentStep === 0" id="pl-step-1-content" class="pl-step-panel">
            <h3>大纲</h3>
            <div id="pl-outline-info" class="pl-outline-info">
              <div class="pl-outline-info-main">
                <div class="pl-outline-info-title">智能体/技能配置已迁移到大纲工作台</div>
                <div class="pl-outline-info-meta">
                  <span>智能体：{{ getStepAgentName(0) || '不使用' }}</span>
                  <span>Skill：{{ (stepSkills[0] || []).length }} 个</span>
                  <span>模式：{{ stepSkillModes[0] === 'chain' ? '串行' : '并行' }}</span>
                  <span>大纲：{{ projectStore.outlineLocked ? '已锁定' : '编辑中' }}</span>
                </div>
              </div>
              <button id="btn-open-outline-workspace" class="btn-sm btn-secondary" @click="$emit('openOutline')">前往工作台配置</button>
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
              <select id="pl-s2-agent" v-model="stepAgents[1]" class="select-standard pl-agent-select" @change="saveStepConfig">
                <option value="">不使用智能体</option>
                <option v-for="a in agentStore.agents" :key="a.id" :value="a.id">{{ a.name }}</option>
              </select>
              <span class="pl-label">技能:</span>
              <select id="pl-s2-skill" v-model="stepSkillSelect[2]" class="select-standard pl-skill-select" @change="addStepSkill(2)">
                <option value="">无</option>
                <option v-for="s in skillStore.skills" :key="s.id" :value="s.id">{{ skillStore.displaySkillName(s) }}</option>
              </select>
              <button class="btn-icon" id="pl-s2-add-skill" data-tooltip="添加技能" @click="addStepSkill(2)">+</button>
              <span class="pl-mode-label">技能模式:</span>
              <select id="pl-s2-mode" v-model="stepSkillModes[1]" class="select-standard pl-mode-select" @change="saveStepConfig">
                <option value="compose">并行</option>
                <option value="chain">串行</option>
              </select>
            </div>
            <div id="pl-s2-skills-list" class="pl-skills-list pl-selected-skills-row">
              <template v-for="(sid, si) in stepSkills[1]" :key="'1-' + sid">
                <span v-if="sid" class="pl-skill-chip" draggable="true" @dragstart="onSkillDragStart($event, si)" @dragover.prevent="onSkillDragOver($event, si)" @drop="onSkillDrop($event, si, 1)" @dragend="onSkillDragEnd">
                  <span class="pl-chip-seq">{{ si + 1 }}</span>
                  <span>{{ getSkillName(sid) }}</span>
                  <select v-if="stepSkillModes[1] === 'chain'" v-model="stepSkillAgents[getSkillAgentKey(1, sid)]" class="select-standard pl-chip-agent" @change="saveStepConfig">
                    <option value="">默认</option>
                    <option v-for="a in agentStore.agents" :key="a.id" :value="a.id">{{ a.name }}</option>
                  </select>
                  <button class="btn-icon pl-chip-close" type="button" aria-label="移除技能" @click="removeStepSkill(2, si)"><AppIcon name="x" /></button>
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
                    <AppIcon v-if="isCategoryConfirmed(cat)" name="check" class="pl-sc-cat-check" aria-hidden="true" />
                    <button v-else-if="cat !== '设定类'" type="button" class="pl-sc-cat-delete" aria-label="删除分类" @click.stop="deleteCategory(cat)"><AppIcon name="x" /></button>
                  </button>
                  <button id="btn-pl-add-cat" type="button" class="pl-sc-add-cat" data-tooltip="新增分类" @click="showAddCategory = true">+ 新增分类</button>
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
                          data-tooltip="查看信息"
                          @click.stop="openSettingDetailModal(s)"
                        >
                          信息
                        </button>
                      </div>
                      <span class="pl-setting-item-index" aria-hidden="true">{{ i + 1 }}</span>
                    </article>
                    <EmptyState
                      v-if="filteredSettings.length === 0"
                      variant="compact"
                      icon="inbox"
                      title="该分类还没有设定内容"
                      description="点击生成设定，或直接新增该分类条目"
                    />
                  </div>

                  <div class="pl-sc-category-actions">
                    <button type="button" class="btn-secondary" @click="openAddSettingModalForCategory">+ 该类新增</button>
                    <button type="button" class="btn-secondary" @click="bindCategorySettings">一键绑定到全局</button>
                    <button type="button" class="btn-primary" @click="confirmSettingCategory">{{ isCategoryConfirmed(selectedSettingCategory) ? '已完成' : '确认该类' }}</button>
                  </div>
                </section>
              </div>
              <EmptyState
                v-else
                icon="outline"
                title="还没有设定分类"
                description="解析大纲后，分类和设定内容会显示在这里"
              />
            </div>
            <div class="pl-actions pl-settings-footer-actions">
              <button id="btn-pl-gen-settings" class="btn-primary" @click="genSettings" :disabled="pipelineStore.isGenerating || !projectStore.hasOutline || !projectStore.outlineLocked">
                {{ pipelineStore.isGenerating ? 'AI生成中...' : 'AI设定生成 / 解析大纲' }}
              </button>
              <button id="btn-pl-confirm-settings" class="btn-primary" @click="confirmSettingsLayer" :disabled="currentSettings.length === 0">确认/保存设定层</button>
            </div>
<GenerationProgressBar
  v-if="settingsGenerationFeedbackVisible"
  :step="1"
  :visible="settingsGenerationFeedbackVisible"
  :progress="pipelineStore.generationProgress"
  :status="pipelineStore.generationStatus"
  :logs="settingsGenerationLogs"
  :skill-steps="activeGenerationFeedbackStep === 1 ? skillStepStates : []"
  :isGenerating="pipelineStore.isGenerating"
  logContainerId="pl-settings-api-log"
  @cancel="pipelineStore.cancelGeneration()"
  @close="closeSettingsGenerationFeedback"
/>
          </div>
          <div v-show="pipelineStore.currentStep === 2" id="pl-step-3-content" class="pl-step-panel">
          <div class="pl-step-tools pl-settings-tools">
            <div id="pl-volume-control-row" class="pl-settings-control-row">
              <span class="pl-label">本层智能体:</span>
              <select id="pl-s3-agent" v-model="stepAgents[2]" class="select-standard pl-agent-select" @change="saveStepConfig">
                <option value="">不使用智能体</option>
                <option v-for="a in agentStore.agents" :key="a.id" :value="a.id">{{ a.name }}</option>
              </select>
              <span class="pl-label">技能:</span>
              <select id="pl-s3-skill" v-model="stepSkillSelect[3]" class="select-standard pl-skill-select" @change="addStepSkill(3)">
                <option value="">无</option>
                <option v-for="s in skillStore.skills" :key="s.id" :value="s.id">{{ skillStore.displaySkillName(s) }}</option>
              </select>
              <button class="btn-icon" id="pl-s3-add-skill" data-tooltip="添加技能" @click="addStepSkill(3)">+</button>
              <span class="pl-mode-label">技能模式:</span>
              <select id="pl-s3-mode" v-model="stepSkillModes[2]" class="select-standard pl-mode-select" @change="saveStepConfig">
                <option value="compose">并行</option>
                <option value="chain">串行</option>
              </select>
            </div>
            <div id="pl-s3-skills-list" class="pl-skills-list pl-selected-skills-row">
            <template v-for="(sid, si) in stepSkills[2]" :key="'2-' + sid">
              <span v-if="sid" class="pl-skill-chip" draggable="true" @dragstart="onSkillDragStart($event, si)" @dragover.prevent="onSkillDragOver($event, si)" @drop="onSkillDrop($event, si, 2)" @dragend="onSkillDragEnd">
                <span class="pl-chip-seq">{{ si + 1 }}</span>
                <span>{{ getSkillName(sid) }}</span>
                <select v-if="stepSkillModes[2] === 'chain'" v-model="stepSkillAgents[getSkillAgentKey(2, sid)]" class="select-standard pl-chip-agent" @change="saveStepConfig">
                  <option value="">默认</option>
                  <option v-for="a in agentStore.agents" :key="a.id" :value="a.id">{{ a.name }}</option>
                </select>
                <button class="btn-icon pl-chip-close" type="button" aria-label="移除技能" @click="removeStepSkill(3, si)"><AppIcon name="x" /></button>
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
                    <span class="pl-volume-col pl-volume-col-index">{{ volumeCount }}/{{ i + 1 }}</span>
                    <span class="pl-volume-col pl-volume-col-name" :data-tooltip="vol.name">{{ vol.name || '未命名卷' }}</span>
                    <span class="pl-volume-col pl-volume-col-outline" :data-tooltip="vol.outline || ''">{{ volumeOutlineExcerpt(vol.outline) }}</span>
                    <span class="pl-volume-col pl-volume-col-words">{{ formatVolumeWords(vol) }}</span>
                    <span class="pl-volume-col pl-volume-col-status" :class="volumeStatusClass(vol)">{{ volumeStatusText(vol) }}</span>
                    <span class="pl-volume-col pl-volume-col-actions" @click.stop>
                      <button
                        :id="'btn-pl-bind-volume-' + i"
                        class="btn-sm"
                        :class="vol.isBound ? 'btn-secondary' : 'btn-primary'"
                        :disabled="!vol.confirmed"
                        :data-tooltip="vol.confirmed ? '' : '请先保存并锁定本卷'"
                        @click="toggleVolumeBinding(i)"
                      >
                        {{ vol.isBound ? '解除绑定' : '绑定到章节层' }}
                      </button>
                      <button :id="'btn-pl-edit-volume-' + i" class="btn-sm" @click="toggleVolumeExpand(i)">
                        {{ expandedVolumeIndex === i ? '收起' : '编辑' }}
                      </button>
                      <button
                        v-if="i === projectStore.volumes.length - 1 && projectStore.volumes.length < Math.max(1, volumeCount)"
                        :id="'btn-pl-continue-volume-' + i"
                        class="btn-sm btn-secondary"
                        :disabled="pipelineStore.isGenerating"
                        data-tooltip="以上一卷为记忆基准，本次只生成下一卷"
                        @click="genVolumes('continue')"
                      >
                        续生成
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
              <EmptyState
                v-else
                icon="pipeline"
                title="暂无卷纲"
                description="请先生成或确认大纲字数，再进入卷纲层"
              />
            </div>
<GenerationProgressBar
  v-if="volumeGenerationFeedbackVisible"
  :step="2"
  :visible="volumeGenerationFeedbackVisible"
  :progress="pipelineStore.generationProgress"
  :status="pipelineStore.generationStatus"
  :logs="volumeGenerationLogs"
  :skill-steps="activeGenerationFeedbackStep === 2 ? skillStepStates : []"
  :isGenerating="pipelineStore.isGenerating"
  logContainerId="pl-volume-api-log"
  @cancel="pipelineStore.cancelGeneration()"
  @close="closeVolumeGenerationFeedback"
/>
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
              <select id="pl-s4-agent" v-model="stepAgents[3]" class="select-standard pl-agent-select" @change="saveStepConfig">
                <option value="">不使用智能体</option>
                <option v-for="a in agentStore.agents" :key="a.id" :value="a.id">{{ a.name }}</option>
              </select>
              <span class="pl-label">技能:</span>
              <select id="pl-s4-skill" v-model="stepSkillSelect[4]" class="select-standard pl-skill-select" @change="addStepSkill(4)">
                <option value="">无</option>
                <option v-for="s in skillStore.skills" :key="s.id" :value="s.id">{{ skillStore.displaySkillName(s) }}</option>
              </select>
              <button class="btn-icon" id="pl-s4-add-skill" data-tooltip="添加技能" @click="addStepSkill(4)">+</button>
              <span class="pl-mode-label">技能模式:</span>
              <select id="pl-s4-mode" v-model="stepSkillModes[3]" class="select-standard pl-mode-select" @change="saveStepConfig">
                <option value="compose">并行</option>
                <option value="chain">串行</option>
              </select>
            </div>
          </div>
          <div id="pl-s4-skills-list" class="pl-skills-list">
            <template v-for="(sid, si) in stepSkills[3]" :key="'3-' + sid">
              <span v-if="sid" class="pl-skill-chip" draggable="true" @dragstart="onSkillDragStart($event, si)" @dragover.prevent="onSkillDragOver($event, si)" @drop="onSkillDrop($event, si, 3)" @dragend="onSkillDragEnd">
                <span class="pl-chip-seq">{{ si + 1 }}</span>
                <span>{{ getSkillName(sid) }}</span>
                <select v-if="stepSkillModes[3] === 'chain'" v-model="stepSkillAgents[getSkillAgentKey(3, sid)]" class="select-standard pl-chip-agent" @change="saveStepConfig">
                  <option value="">默认</option>
                  <option v-for="a in agentStore.agents" :key="a.id" :value="a.id">{{ a.name }}</option>
                </select>
                <button class="btn-icon pl-chip-close" type="button" aria-label="移除技能" @click="removeStepSkill(4, si)"><AppIcon name="x" /></button>
              </span>
            </template>
          </div>
           <div id="pl-ch-gen-bar" class="pl-ch-config">
              <label>每章字数</label>
              <input id="pl-chapter-wordcount" type="number" class="input-w-80" v-model.number="selectedVolumeChapterWords" min="1000" step="500" @change="saveChapterConfig" />
              <span id="pl-chapter-config-status" class="pl-gen-hint">每章字数</span>
              <label>选择卷</label>
              <select id="pl-ch-volume-select" v-model.number="selectedVolumeIndex" class="pl-input-sm" :disabled="boundVolumes.length === 0">
                <template v-for="(vol, i) in projectStore.volumes" :key="vol.id || i">
                  <option v-if="vol.isBound" :value="i">{{ vol.name }}</option>
                </template>
              </select>
              <label>预计章数</label>
              <span id="pl-ch-est-count" class="pl-gen-hint">{{ estimatedChapters }}</span>
            </div>
            <EmptyState
              v-if="boundVolumes.length === 0"
              icon="pipeline"
              title="暂无已绑定卷纲"
              description="请先在卷纲层保存并锁定本卷，再点击「绑定到章节层」"
            />
            <EmptyState
              v-else-if="currentVolumeChapters.length === 0"
              variant="compact"
              icon="pipeline"
              title="暂无章节"
              description="生成章节后，这里会显示章节工作区"
            />
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
                      <button class="btn-sm btn-secondary" :id="'pl-ch-edit-' + i" data-tooltip="编辑" @click.stop="openChapterDetail(i)">编辑</button>
                      <button class="btn-sm btn-secondary" :id="'pl-ch-body-' + i" data-tooltip="生成正文" :disabled="pipelineStore.isGenerating" @click.stop="genBody(selectedVolumeIndex, i)">正文</button>
                      <button class="btn-sm btn-danger" :id="'pl-ch-del-' + i" type="button" aria-label="删除此章" @click.stop="deleteChapterCard(selectedVolumeIndex, i)">删除</button>
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
            <div v-if="chapterDetailVisible" id="pl-chapter-detail-overlay" data-modal-id="pl-chapter-detail" class="modal-overlay modal-nested" :style="{ zIndex: modalQueue.getZIndex('pl-chapter-detail') }" @click.self="closeChapterDetail">
              <section id="pl-chapter-detail-modal" class="pl-ch-detail-modal" role="dialog" aria-modal="true" aria-labelledby="pl-chapter-detail-title">
                <div class="pl-ch-detail-header">
                  <strong id="pl-chapter-detail-title">{{ chapterDetailEditTitle || '未命名章节' }}</strong>
                  <button type="button" class="modal-close" aria-label="关闭章节详情" @click="closeChapterDetail"><AppIcon name="x" /></button>
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
<GenerationProgressBar
  v-if="chapterGenerationFeedbackVisible"
  :step="3"
  :visible="chapterGenerationFeedbackVisible"
  :progress="pipelineStore.generationProgress"
  :status="pipelineStore.generationStatus"
  :logs="chapterGenerationLogs"
  :skill-steps="activeGenerationFeedbackStep === 3 ? skillStepStates : []"
  :isGenerating="pipelineStore.isGenerating"
  logContainerId="pl-ch-api-log"
  @cancel="pipelineStore.cancelGeneration()"
  @close="closeChapterGenerationFeedback"
/>
          <div v-show="pipelineStore.currentStep === 4" id="pl-step-5-content" class="pl-step-panel">
            <h3>正文</h3>
          <div class="pl-step-tools">
            <div class="pl-agent-mode-bar">
              <span class="pl-label">本层智能体:</span>
              <select id="pl-s5-agent" v-model="stepAgents[4]" class="select-standard pl-agent-select" @change="saveStepConfig">
                <option value="">不使用智能体</option>
                <option v-for="a in agentStore.agents" :key="a.id" :value="a.id">{{ a.name }}</option>
              </select>
              <span class="pl-mode-label">技能模式:</span>
              <select id="pl-s5-mode" v-model="stepSkillModes[4]" class="select-standard pl-mode-select" @change="saveStepConfig">
                <option value="compose">并行</option>
                <option value="chain">串行</option>
              </select>
            </div>
            <div class="pl-skill-bar">
              <span class="pl-label">技能:</span>
              <select id="pl-s5-skill" v-model="stepSkillSelect[5]" class="select-standard" @change="addStepSkill(5)">
                <option value="">无</option>
                <option v-for="s in skillStore.skills" :key="s.id" :value="s.id">{{ skillStore.displaySkillName(s) }}</option>
              </select>
              <button class="btn-icon" id="pl-s5-add-skill" data-tooltip="添加技能" @click="addStepSkill(5)">+</button>
            </div>
          </div>
          <div id="pl-s5-skills-list" class="pl-skills-list">
            <template v-for="(sid, si) in stepSkills[4]" :key="'4-' + sid">
              <span v-if="sid" class="pl-skill-chip" draggable="true" @dragstart="onSkillDragStart($event, si)" @dragover.prevent="onSkillDragOver($event, si)" @drop="onSkillDrop($event, si, 4)" @dragend="onSkillDragEnd">
                <span class="pl-chip-seq">{{ si + 1 }}</span>
                <span>{{ getSkillName(sid) }}</span>
                <select v-if="stepSkillModes[4] === 'chain'" v-model="stepSkillAgents[getSkillAgentKey(4, sid)]" class="select-standard pl-chip-agent" @change="saveStepConfig">
                  <option value="">默认</option>
                  <option v-for="a in agentStore.agents" :key="a.id" :value="a.id">{{ a.name }}</option>
                </select>
                <button class="btn-icon pl-chip-close" type="button" aria-label="移除技能" @click="removeStepSkill(5, si)"><AppIcon name="x" /></button>
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
              <span class="pl-deai-badge" data-tooltip="本层已内嵌降AI方法论（17条前置约束 + 硬规则后处理），生成时自动执行">已内嵌降AI</span>
              <button id="btn-pl-insert-body" class="btn-secondary" @click="insertToEditor" :disabled="!(currentBodyContent || bodyResult)">插入到编辑器</button>
              <button id="btn-pl-confirm-body" class="btn-secondary" @click="confirmBodyWithMemory" :disabled="!(currentBodyContent || bodyResult) || memoryPreviewLoading">确认完成</button>
            </div>
          </div>
<GenerationProgressBar
  v-if="bodyGenerationFeedbackVisible"
  :step="4"
  :visible="bodyGenerationFeedbackVisible"
  :progress="pipelineStore.generationProgress"
  :status="pipelineStore.generationStatus"
  :logs="bodyGenerationLogs"
  :skill-steps="activeGenerationFeedbackStep === 4 ? skillStepStates : []"
  :isGenerating="pipelineStore.isGenerating"
  logContainerId="pl-body-api-log"
  @cancel="pipelineStore.cancelGeneration()"
  @close="closeBodyGenerationFeedback"
/>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div v-if="showAddSettingModal" data-modal-id="pl-add-setting" class="modal-overlay modal-nested" :style="{ zIndex: modalQueue.getZIndex('pl-add-setting') }">
    <div class="pl-add-setting-modal">
      <div class="pl-add-setting-header">
        <span>新增设定</span>
        <button class="modal-close" type="button" aria-label="关闭新增设定" @click="cancelAddSetting"><AppIcon name="x" /></button>
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
    data-modal-id="pl-setting-detail"
    class="modal-overlay modal-nested"
    :style="{ zIndex: modalQueue.getZIndex('pl-setting-detail') }"
    @click.self="closeSettingDetailModal"
  >
    <section id="pl-setting-detail-modal" class="pl-add-setting-modal" role="dialog" aria-modal="true" aria-labelledby="pl-setting-detail-title">
      <div class="pl-add-setting-header">
        <span id="pl-setting-detail-title">{{ editingSettingItem.name || '未命名设定' }}</span>
                <button type="button" class="modal-close" aria-label="关闭设定详情" @click="closeSettingDetailModal"><AppIcon name="x" /></button>
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

  <div v-if="memoryPreviewVisible" data-modal-id="pl-memory-preview" class="modal-overlay modal-nested" :style="{ zIndex: modalQueue.getZIndex('pl-memory-preview') }" @click.self="closeMemoryPreview">
    <section class="pl-memory-preview-modal" role="dialog" aria-modal="true" aria-labelledby="pl-memory-preview-title">
      <header class="pl-memory-preview-header">
        <div>
          <strong id="pl-memory-preview-title">记忆变更预览</strong>
          <span class="pl-memory-preview-subtitle">正文已保存，确认后才写入记忆库</span>
        </div>
                <button type="button" class="modal-close" aria-label="关闭记忆预览" @click="closeMemoryPreview"><AppIcon name="x" /></button>
      </header>
      <div class="pl-memory-preview-body">
        <EmptyState
          v-if="memoryPreviewChanges.length === 0"
          variant="compact"
          icon="memory"
          title="本章没有检测到新的记忆变更"
          description="内容与现有记忆一致，无需写入新条目"
        />
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

  <RunTracePanel
    :visible="showRunTracePanel"
    default-source="pipeline"
    @close="closeRunTracePanel"
  >
    <template #folder-diagnostics="{ diagnostics }">
      <RealSkillDiagnosticsPanel
        v-for="(item, index) in folderDiagnosticsFor(diagnostics)"
        :key="index"
        :status="item.status"
        :diagnostics="item.diagnostics"
        :request-messages="item.apiMeta?.requestMessages || []"
        :folder-package-cache="item.folderPackageCache"
      />
    </template>
    <template #skill-extra="{ run }">
      <div class="pl-run-trace-legacy">
        <div class="pl-run-trace-legacy-head">
          <strong>技能执行摘要</strong>
          <button type="button" class="btn-sm btn-secondary" @click="showSuggestions = !showSuggestions">优化建议</button>
        </div>
        <div v-for="log in legacyLogsFor(run)" :key="log.id" class="pl-run-trace-legacy-item" :class="'is-' + log.status">
          <div class="pl-run-trace-legacy-top">
            <span>{{ log.stepName }}</span>
            <span>{{ log.mode }}</span>
            <span>{{ log.skillNames.join('、') }}</span>
            <span>{{ log.duration }}ms</span>
            <button type="button" class="btn-icon" aria-label="删除摘要" @click="execLogStore.removeLog(log.id)"><AppIcon name="x" /></button>
          </div>
          <details>
            <summary>查看提示词与结果</summary>
            <pre>提示词：{{ log.prompt }}</pre>
            <pre>结果：{{ log.result }}</pre>
          </details>
          <div v-if="log.status === 'success'" class="pl-run-trace-feedback">
            <button type="button" class="btn-sm btn-secondary" @click="execLogStore.setFeedback(log.id, 'up')" :class="{ active: log.feedback === 'up' }">点赞</button>
            <button type="button" class="btn-sm btn-secondary" @click="execLogStore.setFeedback(log.id, 'down')" :class="{ active: log.feedback === 'down' }">点踩</button>
          </div>
        </div>
        <div v-if="legacyLogsFor(run).length === 0" class="pl-run-trace-legacy-empty">本层级暂无技能执行摘要。</div>
        <div v-if="showSuggestions" class="pl-run-trace-suggestions">
          <p v-for="(sg, si) in execLogStore.getSuggestions()" :key="si">{{ sg }}</p>
        </div>
      </div>
    </template>
  </RunTracePanel>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount, nextTick } from "vue"
import { usePipelineStore } from "../../stores/pipeline"
import { useProjectStore } from "../../stores/project"
import { useProviderStore } from "../../stores/provider"
import { useSkillStore, type Skill } from "../../stores/skill"
import { useAgentStore } from "../../stores/agent"
import { useEditorStore } from "../../stores/editor"
import { useExecutionLogStore } from "../../stores/executionLog"
import { folderDiagnosticsStatus, useRunTraceStore } from "../../stores/runTrace"
import { useAiCallTrace, type AiCallContext } from "../../composables/useAiCallTrace"
import { useModalQueue } from "../../composables/useModalQueue"
import { useSettingsStore } from "../../stores/settings"
import { useDeAiStore } from "../../stores/deai"
import { getAiService } from "../../services/aiService"
import { routeSkill } from "../../services/skillRouter"
import { createApiCallBudget } from "../../services/apiCallBudget"
import { formatFolderSkillBoundary } from "../../services/folderSkillBoundary"
import { getSkillAgentKey, migrateSkillAgentBindings, normalizeSkillAgentBindings } from "../../services/skillAgentBinding"
import { loadRealSkill } from "../../services/realSkillLoader"
import { useConfigExchange } from "../../composables/useConfigExchange"
import type { PipelineBindingRecord } from "../../services/configExchange"
import { storageKey } from "../../utils/storage-key"
import PipelineFlow from "./PipelineFlow.vue"
import GenerationProgressBar from "./GenerationProgressBar.vue"
import EmptyState from "../common/EmptyState.vue"
import AppIcon from "../common/AppIcon.vue"
import { useDragSort } from "../../composables/useDragSort"
import { extractMemory, unifiedMemoryAiCall, type UnifiedMemoryAiCallTrace } from "../../services/memoryExtractor"
import { previewTransactionChanges } from "../../services/trackingStateService"
import { createTrackingTransaction, type TrackingTransaction } from "../../services/trackingStateService"
import type { ExtractedMemoryData } from "../../services/memoryExtractor"
import { conversationContextService } from "../../services/conversationContextService"
import { retrieveContext } from "../../services/memoryRetriever"
import { classifyRunOutcome, type RunOutcomeStatus } from "../../services/generationValidity"
import { extractJsonArray, extractJsonObject } from "../../services/jsonExtraction"
import type { RunTraceStatus } from "../../stores/runTrace"
import { buildChapterExecutionPrompt, createChapterExecutionPackage } from "../../services/chapterExecutionPackage"
import { buildOutlineUnitClosure, validateOutlineContextScope } from "../../services/outlineContextScope"
import { appendMemoryPromptOnce, buildChainSkillPrompt, dedupeChainIntermediateOutput, detectChainOutputEcho, formatMemoryPrompt, shouldRepairChainEcho, slimChainUpstreamPrompt, templateReferencesPreviousOutput } from "../../services/chainExecution"
import { getSkillMaxAttempts, validateSkillInput, validateSkillOutput, validateSkillRules } from "../../services/skillValidation"
import { createChainFailureBreakpoint, createChainSuccessBreakpoint, getChainResumePoint } from "../../services/chainBreakpoint"
import { describeChainHandoffEvent, makeChainHandoffArtifact, resolveChainPreviousOutput } from "../../services/chainHandoff"
import type { ChainHandoffTemplateMeta } from "../../services/chainHandoff"
import { selectCompleteChapters, validateChapterNarrative, validateVolumeNarrative } from "../../services/narrativeValidation"
import { buildVolumePrompt, hasVolumeContent } from "../../services/volumeGeneration"
import { buildVolumePlanIntegrity, clampVolumeWordsToPlan } from "../../services/volumePlanIntegrity"
import type { VolumeGenerateMode } from "../../services/volumeGeneration"
import { buildChapterHistoryFacts, renderChapterHistoryContext, validateChapterGenerationLedger, type ChapterBatchContract } from "../../services/chapterGenerationContract"
import { generateChapterBatch } from "../../services/chapterBatchOrchestrator"
import { buildVolumeHistoryFacts, extractVolumeContractSemantics, renderVolumeHistoryContext, validateVolumeGenerationLedger, type VolumeGenerationContract } from "../../services/volumeGenerationContract"
import { reviewVolumeContractSemantics } from "../../services/contractReview"
import { generateVolumeBatch } from "../../services/volumeBatchOrchestrator"
import { generateSettingsArtifact } from "../../services/settingsArtifactOrchestrator"
import { normalizeSettingsCategory } from "../../services/settingsArtifactContract"
import { generateBodyArtifact } from "../../services/bodyArtifactOrchestrator"
import { countBodyWords } from "../../services/bodyArtifactContract"
import { scanProseHardSignals, type ProseHardSignalScan } from "../../services/proseHardSignalNet"
import {
  applyHardSignalRepairWindow,
  buildHardSignalRepairPrompt,
  buildHardSignalRepairWindow,
  passesHardSignalRepairIntegrity
} from "../../services/proseHardSignalRepair"
import { resolvePipelineRunOutcome } from "../../services/pipelineRunOutcome"
import { buildPipelineChainWarningLine, coalescePipelineStepWarning } from "../../services/pipelineStepLog"
import { DeAiProcessor, resolveDeaiPromptForChainStep } from "../../services/de-ai"
import type { RealSkillExecutionResult } from "../../services/realSkillTypes"
import RealSkillDiagnosticsPanel from "../common/RealSkillDiagnosticsPanel.vue"
import RunTracePanel from "../common/RunTracePanel.vue"
import type { RunTrace } from "../../stores/runTrace"

defineEmits<{ close: [], minimize: [], openOutline: [] }>()

const showFlowView = ref(false)
const showSuggestions = ref(false)
const expandedLog = ref<string | null>(null)
const showRunTracePanel = ref(false)
const lastFolderSkillDiagnostics = ref<RealSkillExecutionResult | null>(null)
const modalQueue = useModalQueue()
const pipelineStore = usePipelineStore()
const projectStore = useProjectStore()
const providerStore = useProviderStore()
const skillStore = useSkillStore()
const agentStore = useAgentStore()
const editorStore = useEditorStore()
const execLogStore = useExecutionLogStore()
const runTraceStore = useRunTraceStore()
function startStepTrace(step: number, stepName: string, mode: string): AiCallContext {
  return useAiCallTrace({
    source: "pipeline",
    step,
    stepName,
    mode,
    projectId: projectStore.currentProjectId || undefined,
    projectName: projectStore.projectName,
    skillNames: getStepSkillTemplates(step).map(t => t.name).filter(Boolean),
    skillMode: getStepSkillMode(step)
  })
}
function readChainHandoffMeta(skill: Skill | undefined): ChainHandoffTemplateMeta | null {
  const meta = (skill as { meta?: unknown }).meta
  return meta && typeof meta === 'object' ? (meta as ChainHandoffTemplateMeta) : null
}
const settingsStore = useSettingsStore()
const deAiStore = useDeAiStore()
const { importBindingsFromFile, exportBindingsJSON } = useConfigExchange()
const bindingImportPreview = ref<{
  ok: boolean
  issues: Array<{ message: string }>
  bindings: PipelineBindingRecord
  source: string
} | null>(null)


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
const activeGenerationFeedbackStep = ref<1 | 2 | 3 | 4 | null>(null)
const settingsGenerationFeedbackVisible = computed(() =>
  pipelineStore.isGenerating
    ? activeGenerationFeedbackStep.value === 1
    : settingsGenerationLogs.value.length > 0
)

function openRunTracePanel() {
  showRunTracePanel.value = true
}

function closeRunTracePanel() {
  showRunTracePanel.value = false
}

function folderDiagnosticsFor(diagnostics: unknown) {
  return (Array.isArray(diagnostics) ? diagnostics : []) as RealSkillExecutionResult[]
}

function logPipelineChainHandoff(level: 'info' | 'warn', summary: string, detail: unknown) {
  const diag = typeof window !== 'undefined' ? (window as any).DiagLogger : null
  if (!diag || typeof diag.log !== 'function') return
  let payload = ''
  try {
    payload = JSON.stringify(detail)
  } catch {
    payload = String(detail)
  }
  diag.log(level, 'pipeline/chain-handoff', summary, { detail: payload })
}

function legacyLogsFor(run: RunTrace) {
  return run.step === undefined ? [] : execLogStore.logs.filter(item => item.step === run.step)
}

function closeSettingsGenerationFeedback() {
  settingsGenerationLogs.value = []
  resetPipelineStepWarningCounts()
  if (activeGenerationFeedbackStep.value === 1) activeGenerationFeedbackStep.value = null
}
function closeVolumeGenerationFeedback() {
  volumeGenerationLogs.value = []
  resetPipelineStepWarningCounts()
  if (activeGenerationFeedbackStep.value === 2) activeGenerationFeedbackStep.value = null
}

function closeChapterGenerationFeedback() {
  chapterGenerationLogs.value = []
  resetPipelineStepWarningCounts()
  if (activeGenerationFeedbackStep.value === 3) activeGenerationFeedbackStep.value = null
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
const bodyGenerationLogs = ref<string[]>([])

interface SkillStepState {
  skillId: string
  index: number
  status: 'running' | 'done' | 'failed' | 'skipped'
  attempts?: number
}
const skillStepStates = ref<SkillStepState[]>([])

function handleRealSkillPass(event: Event) {
  const detail = (event as CustomEvent<{
    skillId: string
    index: number
    total: number
    name: string
    status: 'running' | 'done' | 'failed' | 'skipped'
  }>).detail
  if (!detail?.skillId) return
  const stepId = `${detail.skillId} · ${detail.name || `第 ${detail.index + 1} 步`}（第 ${detail.index + 1}/${detail.total} 步）`
  const existing = skillStepStates.value.find(item => item.skillId === stepId)
  if (existing) {
    existing.status = detail.status
    return
  }
  skillStepStates.value.push({
    skillId: stepId,
    index: detail.index,
    status: detail.status
  })
}

function handleRealSkillStep(event: Event) {
  const detail = (event as CustomEvent<SkillStepState>).detail
  if (!detail?.skillId) return
  const existing = skillStepStates.value.find(item => item.skillId === detail.skillId)
  if (existing) {
    Object.assign(existing, detail)
    return
  }
  skillStepStates.value.push({ ...detail })
}

function handleRealSkillFolderPassInput(event: Event) {
  const detail = (event as CustomEvent<{
    passIndex: number
    inputMode: 'original' | 'previous'
    inputLength: number
    userPromptLength: number
    systemPromptLength: number
    sampleCount: number
    isRetry: boolean
  }>).detail
  if (!detail || typeof detail.passIndex !== 'number') return
  const runId = runTraceStore.currentRunId
  if (!runId) return
  runTraceStore.addEvent(runId, {
    type: 'folder-pass-input',
    level: 'info',
    label: `Folder pass 输入口径 ${detail.passIndex + 1}${detail.isRetry ? '（重试）' : ''}`,
    detail: JSON.stringify(detail)
  })
}

onMounted(() => {
  window.addEventListener('real-skill:step', handleRealSkillStep)
  window.addEventListener('real-skill:pass', handleRealSkillPass)
  window.addEventListener('real-skill:folder-pass-input', handleRealSkillFolderPassInput)
})
onBeforeUnmount(() => {
  window.removeEventListener('real-skill:step', handleRealSkillStep)
  window.removeEventListener('real-skill:pass', handleRealSkillPass)
  window.removeEventListener('real-skill:folder-pass-input', handleRealSkillFolderPassInput)
})
const activeVolumeGenerationIndex = ref(-1)
// The volume that owns the generation currently being executed. Skills use it
// to resolve layer-accurate template variables instead of reading the body
// layer's current selectors.
const currentGenerationVolume = ref<any>(null)
const volumeGenerationFeedbackVisible = computed(() =>
  pipelineStore.isGenerating
    ? activeGenerationFeedbackStep.value === 2
    : volumeGenerationLogs.value.length > 0
)
const chapterGenerationFeedbackVisible = computed(() =>
  pipelineStore.isGenerating
    ? activeGenerationFeedbackStep.value === 3
    : chapterGenerationLogs.value.length > 0
)

const bodyGenerationFeedbackVisible = computed(() =>
  pipelineStore.isGenerating
    ? activeGenerationFeedbackStep.value === 4
    : bodyGenerationLogs.value.length > 0
)

function closeBodyGenerationFeedback() {
  bodyGenerationLogs.value = []
  resetPipelineStepWarningCounts()
  if (activeGenerationFeedbackStep.value === 4) activeGenerationFeedbackStep.value = null
}

function appendPipelineStream(step: number, text: string) {
  const logs = step === 1 ? settingsGenerationLogs : step === 2 ? volumeGenerationLogs : step === 3 ? chapterGenerationLogs : bodyGenerationLogs
  const clean = (text || '').trim()
  if (!clean) return
  const waitingMarker = '模型思考中，尚未输出正文'
  const waitingIndex = logs.value.findIndex(item => item === waitingMarker)
  if (waitingIndex >= 0) logs.value.splice(waitingIndex, 1)
  const runId = runTraceStore.currentRunId
  const callId = runTraceStore.currentApiCallId
  if (runId && callId) {
    runTraceStore.appendCumulativeStream(runId, callId, clean)
  }
  const preview = clean.length > 500 ? clean.slice(-500) : clean
  const marker = 'API实时输出：'
  const index = logs.value.findIndex(line => line.startsWith(marker))
  const line = marker + preview
  if (index >= 0) logs.value[index] = line
  else logs.value.push(line)
  autoScrollLog(step)
}

function appendPipelineReasoning(step: number, text: string) {
  const logs = step === 1 ? settingsGenerationLogs : step === 2 ? volumeGenerationLogs : step === 3 ? chapterGenerationLogs : bodyGenerationLogs
  const clean = (text || '').trim()
  if (!clean) return
  const preview = clean.length > 500 ? clean.slice(-500) : clean
  const marker = '模型思考：'
  const line = marker + preview
  const index = logs.value.findIndex(item => item.startsWith(marker))
  if (index >= 0) logs.value[index] = line
  else logs.value.push(line)
  const bodyMarker = 'API实时输出：'
  if (!logs.value.some(item => item.startsWith(bodyMarker))) {
    logs.value.push('模型思考中，尚未输出正文')
  }
  autoScrollLog(step)
}

type PipelineStreamState = {
  text: string
  reasoning: string
  traceText: string
  traceReasoning: string
  frameId: number | null
  dirty: boolean
}

const pipelineStreamStates = new Map<number, PipelineStreamState>()

function getPipelineStreamState(step: number) {
  let state = pipelineStreamStates.get(step)
  if (!state) {
    state = { text: '', reasoning: '', traceText: '', traceReasoning: '', frameId: null, dirty: false }
    pipelineStreamStates.set(step, state)
  }
  return state
}

function renderPipelineStreamState(step: number, state: PipelineStreamState) {
  appendPipelineStream(step, state.text)
  appendPipelineReasoning(step, state.reasoning)
  const runId = runTraceStore.currentRunId
  const callId = runTraceStore.currentApiCallId
  if (runId && callId) {
    if (state.traceText) runTraceStore.appendStream(runId, callId, state.traceText)
    if (state.traceReasoning) runTraceStore.appendReasoning(runId, callId, state.traceReasoning)
  }
  state.traceText = ''
  state.traceReasoning = ''
}

function schedulePipelineStreamRender(step: number) {
  const state = getPipelineStreamState(step)
  if (state.frameId !== null) return
  state.frameId = window.requestAnimationFrame(() => {
    state.frameId = null
    if (!state.dirty) return
    state.dirty = false
    renderPipelineStreamState(step, state)
  })
}

function resetPipelineStreamState(step: number) {
  const state = getPipelineStreamState(step)
  if (state.frameId !== null) window.cancelAnimationFrame(state.frameId)
  state.text = ''
  state.reasoning = ''
  state.traceText = ''
  state.traceReasoning = ''
  state.frameId = null
  state.dirty = false
}

function appendPipelineDelta(step: number, kind: 'text' | 'reasoning', delta: string) {
  const value = delta || ''
  if (!value) return
  const state = getPipelineStreamState(step)
  if (kind === 'text') {
    state.text += value
    state.traceText += value
  } else {
    state.reasoning += value
    state.traceReasoning += value
  }
  state.dirty = true
  schedulePipelineStreamRender(step)
}

function flushPipelineStreamState(step: number) {
  const state = getPipelineStreamState(step)
  if (state.frameId !== null) {
    window.cancelAnimationFrame(state.frameId)
    state.frameId = null
  }
  if (!state.dirty) return
  state.dirty = false
  renderPipelineStreamState(step, state)
}

function traceStatusFromAiResult(result: {
  text?: string | null
  reasoning?: string | null
  finishReason?: string | null
  usage?: Record<string, unknown> | null
}, maxTokens?: number | null): {
  status: RunOutcomeStatus
  error?: string
} {
  return classifyRunOutcome({
    text: result.text,
    reasoning: result.reasoning,
    finishReason: result.finishReason,
    usage: result.usage,
    maxTokens
  })
}

function traceOutcomeFromRun(runId: string, finalArtifactAccepted = false) {
  const run = runTraceStore.runs.find(item => item.id === runId)
  if (!run) {
    return { status: 'success' as RunTraceStatus, recoveredFromDegraded: false, degradedApiCalls: 0 }
  }
  return resolvePipelineRunOutcome({
    generationStatus: pipelineStore.generationStatus,
    apiCalls: run.apiCalls,
    folderStatus: folderDiagnosticsStatus(run.folderDiagnostics || []),
    finalArtifactAccepted,
    hardSignalUnresolved: hardSignalUnresolvedRuns.has(runId)
  })
}

function traceStatusFromRun(runId: string, finalArtifactAccepted = false): RunTraceStatus {
  return traceOutcomeFromRun(runId, finalArtifactAccepted).status
}

function appendStepLog(step: number, line: string) {
  const logs = step === 1 ? settingsGenerationLogs : step === 2 ? volumeGenerationLogs : step === 3 ? chapterGenerationLogs : bodyGenerationLogs
  const clean = (line || '').trim()
  if (!clean) return
  logs.value.push(clean)
  autoScrollLog(step)
}

const pipelineStepWarningCounts = new Map<string, { count: number; lastLine: string }>()
const hardSignalUnresolvedRuns = new Set<string>()

function latestBodyFinishReason(traceRunId: string): string | undefined {
  const calls = runTraceStore.getRun(traceRunId)?.apiCalls || []
  for (let index = calls.length - 1; index >= 0; index -= 1) {
    const call = calls[index]
    if (
      call.step === 4 &&
      (call.status === 'success' || call.status === 'degraded') &&
      call.finishReason
    ) {
      return call.finishReason
    }
  }
  return undefined
}

function resetPipelineStepWarningCounts() {
  pipelineStepWarningCounts.clear()
}

function appendPipelineChainWarning(input: {
  step: number
  skillIndex: number
  code: string
  summary: string
}) {
  const key = `${input.step}:${input.code}`
  const existing = pipelineStepWarningCounts.get(key)
  if (!existing) {
    const line = buildPipelineChainWarningLine({
      step: input.step,
      skillIndex: input.skillIndex,
      code: input.code as any,
      summary: input.summary
    })
    pipelineStepWarningCounts.set(key, { count: 1, lastLine: line })
    appendStepLog(input.step, line)
    return
  }
  const next = coalescePipelineStepWarning({
    line: existing.lastLine,
    code: input.code,
    state: existing
  })
  const logs = input.step === 1 ? settingsGenerationLogs : input.step === 2 ? volumeGenerationLogs : input.step === 3 ? chapterGenerationLogs : bodyGenerationLogs
  const index = logs.value.findIndex(item => item === existing.lastLine)
  if (index >= 0) {
    logs.value.splice(index, 1, next.line)
    autoScrollLog(input.step)
  } else {
    appendStepLog(input.step, next.line)
  }
  pipelineStepWarningCounts.set(key, { count: next.count, lastLine: next.line })
}

const LOG_CONTAINER_IDS: Record<number, string> = {
  1: 'pl-settings-api-log',
  2: 'pl-volume-api-log',
  3: 'pl-ch-api-log',
  4: 'pl-body-api-log',
}

function autoScrollLog(step: number) {
  nextTick(() => {
    const el = document.getElementById(LOG_CONTAINER_IDS[step])
    if (el) el.scrollTop = el.scrollHeight
  })
}

watch(() => settingsGenerationLogs.value.length, () => autoScrollLog(1))
watch(() => volumeGenerationLogs.value.length, () => autoScrollLog(2))
watch(() => chapterGenerationLogs.value.length, () => autoScrollLog(3))
watch(() => bodyGenerationLogs.value.length, () => autoScrollLog(4))
type MemoryPreviewItem = {
  key: string
  kind: string
  name?: string
  id?: string
  action: "pending" | "rejected" | "locked"
  value: any
}

const memoryPreviewVisible = ref(false)

watch(() => ({
  container: true,
  bindingImport: Boolean(bindingImportPreview.value),
  addSetting: showAddSettingModal.value,
  settingDetail: showSettingDetailModal.value,
  memoryPreview: memoryPreviewVisible.value
}), visible => {
  const ids: Record<string, string> = {
    container: 'pipeline-panel',
    bindingImport: 'pl-binding-import-preview',
    addSetting: 'pl-add-setting',
    settingDetail: 'pl-setting-detail',
    memoryPreview: 'pl-memory-preview'
  }
  for (const key of Object.keys(ids)) {
    if (visible[key as keyof typeof visible]) modalQueue.open(ids[key])
    else modalQueue.close(ids[key])
  }
}, { immediate: true })

// Verification bridge for responsive E2E; no runtime behavior depends on it.
;(globalThis as any).__pipelinePanelState = {
  get bindingImportPreview() { return bindingImportPreview.value },
  set bindingImportPreview(value: any) { bindingImportPreview.value = value },
  get showAddSettingModal() { return showAddSettingModal.value },
  set showAddSettingModal(value: boolean) { showAddSettingModal.value = value },
  get showSettingDetailModal() { return showSettingDetailModal.value },
  set showSettingDetailModal(value: boolean) { showSettingDetailModal.value = value },
  get selectedSettingCategory() { return selectedSettingCategory.value },
  set selectedSettingCategory(value: string) { selectedSettingCategory.value = value },
  get editingSettingId() { return editingSettingId.value },
  set editingSettingId(value: string) { editingSettingId.value = value },
  get settingCategories() { return settingCategories.value },
  get filteredSettings() { return filteredSettings.value },
  get editingSettingItem() { return editingSettingItem.value },
  get memoryPreviewVisible() { return memoryPreviewVisible.value },
  set memoryPreviewVisible(value: boolean) { memoryPreviewVisible.value = value },
  get memoryPreviewChanges() { return memoryPreviewChanges.value },
  set memoryPreviewChanges(value: any[]) { memoryPreviewChanges.value = value },
  get memoryPreviewLoading() { return memoryPreviewLoading.value },
  get memoryPreviewSaving() { return memoryPreviewSaving.value },
  get memoryPreviewError() { return memoryPreviewError.value },
  get steps() { return steps.value },
  get projectStore() { return projectStore },
  get pipelineStore() { return pipelineStore },
  get currentBodyChapter() {
    return getBodyChapterByVisibleIndex(bodyVolumeIndex.value, bodyChapterIndex.value).chapter
  },
  get chapterDetailVisible() { return chapterDetailVisible.value },
  set chapterDetailVisible(value: boolean) { chapterDetailVisible.value = value },
  get chapterDetailEditTitle() { return chapterDetailEditTitle.value },
  set chapterDetailEditTitle(value: string) { chapterDetailEditTitle.value = value },
  get chapterDetailEditPlot() { return chapterDetailEditPlot.value },
  set chapterDetailEditPlot(value: string) { chapterDetailEditPlot.value = value },
  get currentVolumeChapters() { return currentVolumeChapters.value },
  get selectedVolume() { return selectedVolume.value }
}

const memoryPreviewLoading = ref(false)
const memoryPreviewSaving = ref(false)
const memoryPreviewError = ref("")
const memoryPreviewLogs = ref<Array<{
  timestamp: string
  durationMs: number
  projectId: string
  chapterId: string
  phase: "start" | "request" | "parse" | "complete" | "failed"
  status: "started" | "success" | "failed"
  errorKind?: "timeout" | "network" | "invalid_json" | "canceled" | "unknown"
}>>([])
const MEMORY_LOG_STEP_NAME = "记忆抽取"

function addMemoryExecutionLog(entry: {
  phase: "start" | "complete" | "failed"
  status: "started" | "success" | "failed"
  durationMs: number
  projectId: string
  chapterId: string
  errorKind?: string
  message?: string
}) {
  execLogStore.addLog({
    step: 0,
    stepName: MEMORY_LOG_STEP_NAME,
    mode: `memory-extraction:${entry.phase}`,
    skillNames: [],
    prompt: "",
    result: entry.message || "",
    duration: entry.durationMs,
    status: entry.status === "success" ? "success" : "failed",
    providerId: providerStore.preferredGenerateProvider?.id,
    usage: {
      projectId: entry.projectId,
      chapterId: entry.chapterId,
      errorKind: entry.errorKind
    }
  })
}
const memoryPreviewChanges = ref<any[]>([])
const memoryPreviewItems = ref<MemoryPreviewItem[]>([])
const memoryPreviewExtracted = ref<ExtractedMemoryData | null>(null)
const memoryPreviewChapter = ref<{ id: string; index: number; title: string; content: string } | null>(null)
const memoryPreviewDraft = ref<TrackingTransaction | null>(null)
const memoryPreviewCommitError = ref("")

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
  get: () => {
    const v = Number(selectedVolume.value?.wordsPerChapter || chapterWords.value || 0)
    return v > 0 ? v : 3500
  },
  set: (value: number) => {
    const v = Number(value) || 0
    if (v >= 500) {
      chapterWords.value = v
      if (selectedVolume.value) selectedVolume.value.wordsPerChapter = v
    }
  }
})
const selectedVolumeChapterLocked = computed(() => true)

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
  const existing = await window.electronAPI.storageRead(storageKey("pipeline_step_config")) || {}
  await window.electronAPI.storageWrite(storageKey("pipeline_step_config"), {
    ...existing,
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
    projectStore.bookWordCountChars = Math.round(wan * 10000)
    projectStore.saveProject()
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
  projectStore.pipelineConfig = {
    volumeCount: Number(volumeCount.value) || 3,
    volumeWords: Number(volumeWords.value) || 100000,
    chapterWords: Number(selectedVolume.value?.wordsPerChapter || chapterWords.value) || 3500
  }
  projectStore.saveProject()
  await window.electronAPI.storageWrite(
    storageKey("pipeline_step_config"),
    Object.assign(
      await window.electronAPI.storageRead(storageKey("pipeline_step_config")) || {},
      {
        volumeWords: Number(volumeWords.value) || 0,
        volumeCount: Number(volumeCount.value) || 0,
        chapterWords: Number(selectedVolume.value?.wordsPerChapter || chapterWords.value) || 0
      }
    )
  )
}

function saveChapterConfig() {
  const vol = selectedVolume.value
  if (!vol) return
  const wpc = Number(vol.wordsPerChapter || chapterWords.value || 3500)
  const words = Math.max(0, Number(vol.allocatedWords || vol.suggestedWords || volumeWords.value) || 0)
  if (wpc > 0) chapterWords.value = wpc
  vol.chapterCount = (wpc > 0 && words > 0) ? Math.ceil(words / wpc) : 0
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
  // A layer without an explicit binding must stay empty. The old index-based
  // fallback could silently attach another layer's skill to this step.
  return []
}

type PipelineSkillTemplate = {
  id: string
  name: string
  template: string
  skill?: Skill
  customVars?: Record<string, string>
  injectMode?: string
  outputFormat?: 'json' | 'text'
  validationRules?: string[]
  inputSchema?: any
  outputSchema?: any
  retryPolicy?: any
}

type HydratedFolderMeta = { meta?: unknown }

function getStepSkillTemplates(step: number): PipelineSkillTemplate[] {
  const ids = getStepSkillIds(step)
  const templates: PipelineSkillTemplate[] = []
  for (const sid of ids) {
    const s = skillStore.getSkill(sid)
    if (s && (s.template || (s.format === "folder" && s.folderPath))) templates.push({
      id: s.id,
      name: skillStore.displaySkillName(s),
      template: s.template,
      skill: s,
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

async function hydrateFolderTemplates(templates: PipelineSkillTemplate[]) {
  for (const t of templates) {
    if (t.skill?.format !== 'folder' || !t.skill.folderPath) continue
    const loaded = await loadRealSkill(t.skill.folderPath)
    if (loaded.package?.template) t.template = loaded.package.template
    const loadedMeta = (loaded.package as { meta?: unknown } | null)?.meta
    if (loadedMeta && typeof loadedMeta === 'object') {
      ;(t as HydratedFolderMeta).meta = loadedMeta
    }
  }
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

function getStepAgentName(step: number): string {
  const id = stepAgents.value[step]
  return id ? agentStore.getAgent(id)?.name || '' : ''
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
  skillAgentId: string | undefined,
  baseTemplateOverride: string | undefined = undefined,
  resolvedTemplate: string | undefined = undefined,
  templateVariables: Record<string, unknown> | undefined = undefined,
  validateOutputSchema: boolean = false,
  chainUpstreamContext: string | undefined = undefined
): Promise<string> {
  validateSkillInputOrThrow(template, inputContext)
  if (template.skill && template.skill.format === "folder" && template.skill.folderPath) {
    const agentId = skillAgentId || getStepAgentId(step)
    const agentConfig = agentId ? (agentStore.getAgent(agentId) || null) : getStepAgentConfig(step)
    const agentSource = skillAgentId ? "user-binding" : agentId ? "step-default" : "none"
    const traceRunId = runTraceStore.currentRunId
    const fallbackProviderId = activeProviderId()
    const systemPromptSuffix = resolveDeaiPromptForChainStep(step)
    const traceCallId = traceRunId
      ? runTraceStore.startApiCall(traceRunId, {
        step,
        skillId: template.id,
        skillName: template.name,
        agentId: agentId || undefined,
        agentName: agentConfig?.name || agentId || undefined,
        providerId: fallbackProviderId || undefined,
        providerName: providerStore.getProvider(fallbackProviderId)?.name,
        model: agentConfig?.model || activeProviderModel(),
        requestMessages: [{ role: 'user', content: prompt }]
      })
      : ''
    const startedAt = Date.now()
    const finishFolderTrace = (status: 'success' | 'degraded' | 'failed' | 'canceled', error?: string, output = '') => {
      if (!traceRunId || !traceCallId) return
      flushPipelineStreamState(step)
      runTraceStore.finishApiCall(traceRunId, traceCallId, {
        status,
        responseText: output,
        durationMs: Date.now() - startedAt,
        error
      })
    }
    const finishFolderTraceFromResult = (result: typeof route.folderResult) => {
      if (!traceRunId || !traceCallId) return
      flushPipelineStreamState(step)
      const apiMeta = result?.apiMeta
      const hasOutput = Boolean(result?.output?.trim())
      const traceStatus = result?.status === 'failed'
        ? 'failed'
        : result?.status === 'blocked'
          ? 'blocked'
        : result?.status === 'degraded' && !hasOutput
          ? 'failed'
          : result?.status === 'degraded'
            ? 'degraded'
            : 'success'
      runTraceStore.finishApiCall(traceRunId, traceCallId, {
        status: traceStatus,
        responseText: result?.output || '',
        error: traceStatus === 'failed' ? (result?.errors?.[0] || 'folder SKILL 未生成有效输出') : traceStatus === 'blocked' ? 'folder SKILL 已阻断，等待恢复条件' : traceStatus === 'degraded' ? 'folder SKILL 降级完成，已保留可用输出' : undefined,
        durationMs: Date.now() - startedAt,
        finishReason: apiMeta?.finishReason,
        reasoningText: apiMeta?.reasoningText,
        usage: apiMeta?.usage,
        providerContextWindowTokens: apiMeta?.contextBudget?.providerContextWindowTokens,
        estimatedInputTokens: apiMeta?.contextBudget?.estimatedInputTokens,
        contextBudgetDecision: apiMeta?.contextBudget?.decision,
        contextBudgetReason: apiMeta?.contextBudget?.reason,
        usageReconciliation: apiMeta?.usageReconciliation,
        timingLedger: apiMeta?.timingLedger
      })
    }
    let route: Awaited<ReturnType<typeof routeSkill>>
    try {
      route = await routeSkill(template.skill, {
        input: prompt,
        agent: agentConfig ? {
          id: agentId,
          model: agentConfig.model,
          temperature: agentConfig.temperature,
          maxTokens: agentConfig.maxTokens,
          systemPrompt: agentConfig.systemPrompt
        } : null,
        agentSource,
        systemPromptSuffix,
        chainUpstreamContext,
        baseTemplateOverride,
        resolvedTemplate,
        templateVariables,
        validateOutputSchema,
        purpose: "generate",
        budget: createApiCallBudget(8),
        skillId: template.id,
        aiService: await getAiService(),
        stream: true,
        signal: pipelineStore.getGenerationSignal(),
        timeoutMs,
      onChunk: (text: string) => {
        appendPipelineDelta(step, 'text', text)
      },
       onReasoning: (text: string) => {
         appendPipelineDelta(step, 'reasoning', text)
       },
        onGenerationEvent: (event) => {
          if (!traceRunId) return
          runTraceStore.addEvent(traceRunId, {
            type: event.type,
            level: event.type === 'generation-invalid' ? 'warn' : 'info',
            label: `SKILL「${template.name || template.id}」${
              event.type === 'generation-invalid'
                ? '生成无效'
                : event.type === 'direct-retry-start'
                  ? '切换直出重试'
                  : `直出重试${event.success ? '成功' : '失败'}`
            }`,
            detail: JSON.stringify(event)
          })
          appendStepLog(step, event.message || '模型输出无效，正在切换直出重试')
        },
        onRequestBuilt: (messages: Array<{ role: string; content: string }>) => {
          if (traceRunId && traceCallId) {
            runTraceStore.setApiCallRequest(traceRunId, traceCallId, messages)
          }
        },
        onPhysicalCall: (event) => {
          if (traceRunId && traceCallId) runTraceStore.appendPhysicalCall(traceRunId, traceCallId, {
            physicalCallId: event.physicalCallId,
            phase: event.phase,
            status: event.status,
            requestMessages: (event.requestMessages || []).map(m => ({ role: m.role, content: String(m.content || '') })),
            responseText: event.responseText || '',
            streamText: event.streamText || '',
            reasoningText: event.reasoningText || '',
            finishReason: event.finishReason,
            usage: event.usage,
            durationMs: event.durationMs,
            error: event.error,
      toolsEnabled: event.toolsEnabled,
      toolsDowngraded: event.toolsDowngraded,
      downgradeReason: event.downgradeReason,
      retryStrategy: event.retryStrategy,
      maxTokens: event.maxTokens,
      providerContextWindowTokens: event.contextBudget?.providerContextWindowTokens,
      estimatedInputTokens: event.contextBudget?.estimatedInputTokens,
      contextBudgetDecision: event.contextBudget?.decision,
            contextBudgetReason: event.contextBudget?.reason,
            usageReconciliation: event.usageReconciliation,
            interruptionCode: event.interruptionCode,
            heartbeat: event.heartbeat,
            firstTokenMs: event.firstTokenMs,
            outputMs: event.outputMs
          })
        }
      })
    } catch (error) {
      const folderResult = (error as Error & { folderResult?: RealSkillExecutionResult }).folderResult
      if (folderResult) {
        lastFolderSkillDiagnostics.value = folderResult
        if (traceRunId) {
          runTraceStore.appendFolderDiagnostics(traceRunId, {
            ...folderResult,
            output: folderResult.output
          })
        const apiMeta = folderResult.apiMeta
        if (apiMeta?.requestMessages?.length && traceCallId) {
          runTraceStore.setApiCallRequest(traceRunId, traceCallId, apiMeta.requestMessages)
        }
        if (apiMeta?.toolRequestDeltas?.length && traceCallId) {
          runTraceStore.setApiCallToolRequestDeltas(traceRunId, traceCallId, apiMeta.toolRequestDeltas)
        }
        }
        finishFolderTraceFromResult(folderResult)
      } else {
        finishFolderTrace('failed', error instanceof Error ? error.message : String(error))
      }
      throw error
    }
    if (route.mode === "folder" && route.folderResult) {
      const folderStatus = route.folderResult.status
      lastFolderSkillDiagnostics.value = route.folderResult
      if (traceRunId) {
        runTraceStore.appendFolderDiagnostics(traceRunId, {
          ...route.folderResult,
          output: route.folderResult.output
        })
        const apiMeta = route.folderResult.apiMeta
        if (apiMeta?.requestMessages?.length) {
          runTraceStore.setApiCallRequest(traceRunId, traceCallId, apiMeta.requestMessages)
        }
        if (apiMeta?.toolRequestDeltas?.length) {
          runTraceStore.setApiCallToolRequestDeltas(traceRunId, traceCallId, apiMeta.toolRequestDeltas)
        }
      }
      finishFolderTraceFromResult(route.folderResult)
      if (folderStatus === "degraded") {
        const warnings = route.folderResult.diagnostics
          .filter(item => item.type === "warning")
          .map(item => item.message)
          .filter(Boolean)
          .join("；")
        appendStepLog(step, `「${template.name}」降级完成：${warnings || '已保留可用输出，详情见运行记录'}`)
      }
      return route.folderResult.output
    }
    if (route.fallbackReason) throw new Error(route.fallbackReason)
    throw new Error("folder SKILL 执行失败")
  }
  // Preserve the legacy outputFormat contract: malformed JSON gets one repair attempt.
  const maxAttempts = template.retryPolicy
    ? getSkillMaxAttempts(template.retryPolicy)
    : template.outputFormat === "json" ? 2 : 1
  let currentError: unknown = null
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const attemptPrompt = attempt === 1 ? prompt : prompt + "\n\n[校验重试] 上次输出未满足技能的结构化约束，请只返回符合要求的结果。"
    const output = timeoutMs
      ? await callApiWithAgentTimeout(step, injection.systemSkill || "", attemptPrompt, timeoutMs, skillAgentId, injection, template.id)
      : await callApiWithAgent(step, injection.systemSkill || "", attemptPrompt, skillAgentId, injection, undefined, undefined, template.id)
    try {
      validateSkillOutputOrThrow(template, output)
      return output
    } catch (error) {
      currentError = error
      if (attempt === maxAttempts) throw error
    }
  }
  throw currentError instanceof Error ? currentError : new Error("技能输出校验失败")
}

function activeProviderId(): string {
  const agentConfig = getStepAgentConfig(0)
  return agentConfig?.provider || providerStore.preferredGenerateProvider?.id || ''
}

function activeProviderModel(): string {
  const agentConfig = getStepAgentConfig(0)
  const provider = providerStore.getProvider(agentConfig?.provider || "") || providerStore.preferredGenerateProvider
  return agentConfig?.model || provider?.selectedModel || provider?.models?.[0] || ''
}

function getStepSkillMode(step: number): string {
  const mode = stepSkillModes.value[step]
  return mode === "chain" ? "chain" : "compose"
}

function buildTemplateContext(step: number, prompt: string, prevResponse?: string, contextVolumeOverride?: any): Record<string, any> {
  const contextVolumeIndex = contextVolumeOverride
    ? Math.max(0, projectStore.volumes.indexOf(contextVolumeOverride))
    : bodyVolumeIndex.value
  const vol = projectStore.volumes[contextVolumeIndex] || null
  const volId = vol ? (vol.id || vol.name) : ""
  const chs = volId ? (projectStore.chapters[volId] || []) : []
  const selectedCh = contextVolumeOverride
    ? (getVisibleChaptersForVolume(contextVolumeIndex).slice(-1)[0] || null)
    : (getBodyChapterByVisibleIndex(contextVolumeIndex, bodyChapterIndex.value).chapter || getVisibleChaptersForVolume(contextVolumeIndex)[0] || null)
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
  const volumePlan = buildVolumePlanIntegrity({
    plannedVolumeCount: Math.max(1, Number(volumeCount.value) || 1),
    totalWords: Math.max(0, Math.round(bookWordCount.value * 10000)),
    existingVolumes: projectStore.volumes
  })
  return {
    selectedText: prompt,
    userPrompt: prompt,
    outlineContent: projectStore.pipelineOutlineText || "",
    novelTitle: projectStore.projectName || "",
    volumeCount: volumePlan.generatedVolumeCount,
    wordsPerVolume: volumePlan.currentVolumeBudget || "",
    chapterCount: chs.length,
    wordsPerChapter: Number(vol?.wordsPerChapter || chapterWords.value || 3500) || "",
    styleTags: styleTags.value || "",
    pacingParams: pacingParams.value || "",
    volumeOutline: vol ? (vol.outline || vol.summary || "") : "",
    chapterTitle: selectedCh ? (selectedCh.title || "") : "",
    chapterSummary: selectedCh ? (selectedCh.summary || selectedCh.plot || "") : "",
    prevChapterSummary: prevCh ? (prevCh.summary || prevCh.plot || "") : "",
    chapterPlot: selectedCh ? (selectedCh.plot || "") : "",
    characters: characters,
    prevResponse: prevResponse || "",
    memoryContext: memoryTextForPipeline({
      chapterId: selectedCh ? String(selectedCh.id || "") : undefined,
      chapterIndex: chIdx >= 0 ? chIdx : undefined,
      query: `${prompt} ${selectedCh?.title || ""} ${selectedCh?.plot || ""}`,
      previousChapterSummary: prevCh ? (prevCh.summary || prevCh.plot || "") : "",
      maxChars: 2000
    })
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
  const trace = startStepTrace(0, "大纲风格分析", "outline-analysis")
  try {
    const aiService = await getAiService()
    trace.begin()
    const messages = await trace.measurePhase('promptBuild', () => [
      { role: "system", content: "你是小说风格分析专家。分析大纲的写作风格和节奏特征，返回JSON。" },
      { role: "user", content: "请分析以下小说大纲的写作风格和节奏特征。返回JSON对象：{styleTags:\"风格标签以逗号分隔\", pacingParams:\"节奏参数描述\"}\n\n大纲：\n" + projectStore.pipelineOutlineText }
    ])
    const messagesForTrace = messages.map(m => ({ role: m.role, content: m.content }))
    const callId = trace.beginApiCall({
      providerId: provider.id,
      providerName: provider.name,
      model,
      requestMessages: messagesForTrace
    })
    const callResult = await aiService.callAi({
      purpose: 'generate',
      messages,
      model,
      retry: true,
      meta: { source: 'PipelinePanel.outline-analysis' },
      onPhysicalCall: (event) => {
        runTraceStore.appendPhysicalCall(trace.runId!, callId, {
          physicalCallId: event.physicalCallId,
          phase: event.phase,
          status: event.status,
          requestMessages: (event.requestMessages || []).map(m => ({ role: m.role, content: String(m.content || '') })),
          responseText: event.responseText || '',
          streamText: event.streamText || '',
          reasoningText: event.reasoningText || '',
          finishReason: event.finishReason,
          usage: event.usage,
          durationMs: event.durationMs,
          error: event.error,
          toolsEnabled: event.toolsEnabled,
          toolsDowngraded: event.toolsDowngraded,
          downgradeReason: event.downgradeReason,
          retryStrategy: event.retryStrategy,
          maxTokens: event.maxTokens,
          providerContextWindowTokens: event.contextBudget?.providerContextWindowTokens,
          estimatedInputTokens: event.contextBudget?.estimatedInputTokens,
          contextBudgetDecision: event.contextBudget?.decision,
          contextBudgetReason: event.contextBudget?.reason,
          usageReconciliation: event.usageReconciliation,
          interruptionCode: event.interruptionCode,
          heartbeat: event.heartbeat,
          firstTokenMs: event.firstTokenMs,
          outputMs: event.outputMs
        })
      }
    })
    trace.finishApiCall(callId, {
      status: callResult.text ? 'success' : 'degraded',
      responseText: callResult.text || '',
      reasoningText: callResult.reasoning || '',
      finishReason: callResult.finishReason,
      usage: callResult.usage
    })
    const text = callResult.text || ''
    if (!text) {
      console.warn("[WARN] Outline analysis returned empty")
      trace.finish('degraded', '大纲风格分析返回为空')
      return
    }
    let data: any = null
    data = extractJsonObject(text)
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
      trace.finish('degraded', '大纲风格分析未返回JSON，已使用原文截断兜底')
      return
    }
  } catch(e: any) {
    console.warn("[WARN] Outline analysis failed (non-blocking):", e.message)
    trace.fail(e)
    return
  }
  trace.finish('success')
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

async function callApiWithAgent(step: number, skillTemplate: string, prompt: string, skillAgentOverride?: string, promptParts?: PromptParts, signal?: AbortSignal, timeoutMs?: number, skillId?: string): Promise<string> {
  const agentId = skillAgentOverride || getStepAgentId(step)
  const agentConfig = agentId ? (agentStore.getAgent(agentId) || null) : getStepAgentConfig(step)
  const provider = providerStore.getProvider(agentConfig?.provider || "")
  const preferredProvider = providerStore.preferredGenerateProvider
  const activeProvider = provider || preferredProvider
  const model = agentConfig?.model || activeProvider?.selectedModel || activeProvider?.models?.[0] || ""
  const temperature = agentConfig?.temperature ?? activeProvider?.temperature ?? 0.7
  const maxTokens = agentConfig?.maxTokens || activeProvider?.maxTokens || null
 const skillPart = promptParts?.systemSkill ?? skillTemplate ?? ""
 const agentPart = agentConfig?.systemPrompt || ""
 // P1: 正文层注入降AI方法论（17条生成阶段约束）
 const deaiPrompt = resolveDeaiPromptForChainStep(step)
 const systemPrompt = [skillPart, agentPart, deaiPrompt].filter(Boolean).join("\n\n") || "你是专业小说创作助手。"
  const userPrompt = [promptParts?.userPrefix, prompt, promptParts?.userSuffix].filter(Boolean).join("\n\n")
  const messages = [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }]
  const aiService = await getAiService()
  const runId = runTraceStore.currentRunId
  const apiCallId = runId ? runTraceStore.startApiCall(runId, {
    step,
    skillId: skillId || undefined,
    skillName: skillId ? (skillStore.skills.find(s => s.id === skillId)?.name || skillId) : undefined,
    agentId: agentId || undefined,
    agentName: agentId ? (agentStore.getAgent(agentId)?.name || agentId) : undefined,
    providerId: activeProvider?.id,
    providerName: activeProvider?.name,
    model,
    temperature,
    maxTokens,
    requestMessages: messages
  }) : ""
  try {
      const result = await aiService.callAi({
    purpose: 'generate',
    messages,
    model,
    temperature,
    maxTokens,
    onChunk: (text: string) => {
      appendPipelineDelta(step, 'text', text)
    },
    onReasoning: (text: string) => {
      appendPipelineDelta(step, 'reasoning', text)
    },
    onPhysicalCall: (event) => {
      if (runId && apiCallId) runTraceStore.appendPhysicalCall(runId, apiCallId, {
        physicalCallId: event.physicalCallId,
        phase: event.phase,
        status: event.status,
        requestMessages: (event.requestMessages || []).map(m => ({ role: m.role, content: String(m.content || '') })),
            responseText: event.responseText || '',
            streamText: event.streamText || '',
            reasoningText: event.reasoningText || '',
        finishReason: event.finishReason,
        usage: event.usage,
        durationMs: event.durationMs,
        error: event.error,
            toolsEnabled: event.toolsEnabled,
            toolsDowngraded: event.toolsDowngraded,
            downgradeReason: event.downgradeReason,
            retryStrategy: event.retryStrategy,
            maxTokens: event.maxTokens,
            providerContextWindowTokens: event.contextBudget?.providerContextWindowTokens,
            estimatedInputTokens: event.contextBudget?.estimatedInputTokens,
            contextBudgetDecision: event.contextBudget?.decision,
            contextBudgetReason: event.contextBudget?.reason,
            usageReconciliation: event.usageReconciliation,
            interruptionCode: event.interruptionCode,
            heartbeat: event.heartbeat
      })
    },
    signal: signal || pipelineStore.getGenerationSignal(),
    timeoutMs,
    retry: true,
    meta: { source: 'PipelinePanel.callApiWithAgent', step, agentId: agentId || undefined, skillId: skillId || undefined }
    })
    if (runId && apiCallId) {
      flushPipelineStreamState(step)
      const traceStatus = traceStatusFromAiResult(result, result.maxTokens ?? maxTokens)
      runTraceStore.finishApiCall(runId, apiCallId, {
        status: traceStatus.status,
        responseText: result.text || "",
        reasoningText: result.reasoning || "",
        finishReason: result.finishReason,
        usage: result.usage,
        durationMs: result.durationMs,
        error: traceStatus.error,
        maxTokens: result.maxTokens
      })
      if (traceStatus.status === 'failed') {
        throw new Error(traceStatus.error || '模型没有返回正文')
      }
    }
    return result.text || ""
  } catch (e) {
    if (runId && apiCallId) {
      flushPipelineStreamState(step)
      const canceled = signal?.aborted || pipelineStore.isGenerationCanceled()
      runTraceStore.finishApiCall(runId, apiCallId, {
        status: canceled ? "canceled" : "failed",
        error: e instanceof Error ? e.message : String(e)
      })
    }
    throw e
  }
}

async function callApiWithAgentTimeout(step: number, skillTemplate: string, prompt: string, timeoutMs: number, skillAgentOverride?: string, promptParts?: PromptParts, skillId?: string): Promise<string> {
  const parentSignal = pipelineStore.getGenerationSignal()
  return await callApiWithAgent(step, skillTemplate, prompt, skillAgentOverride, promptParts, parentSignal, timeoutMs, skillId)
}

async function runStepSkills(step: number, prompt: string, timeoutMs: number | undefined, fallbackTemplate: string) {
  const startTime = Date.now();
  const stepName = "step-" + step;
  const templates = getStepSkillTemplates(step)
  await hydrateFolderTemplates(templates)
  const mode = getStepSkillMode(step)
  const skillNames = templates.map((t) => t.name).filter(Boolean);
  try {
    const result = await _runStepSkillsInner(step, prompt, timeoutMs, fallbackTemplate, templates);
    execLogStore.addLog({step,stepName,mode,skillNames,prompt:(prompt||"").substring(0,500),result:(result||"").substring(0,500),duration:Date.now()-startTime,status:"success"});
    return result;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    execLogStore.addLog({step,stepName,mode,skillNames,prompt:(prompt||"").substring(0,500),result:message || "unknown error",duration:Date.now()-startTime,status:"failed"});
    throw e;
  }
}

async function _runStepSkillsInner(step: number, prompt: string, timeoutMs: number | undefined, fallbackTemplate: string, hydratedTemplates: PipelineSkillTemplate[]) {
  const templates = hydratedTemplates
  const mode = getStepSkillMode(step)
  const baseCtx = buildTemplateContext(step, prompt, undefined, currentGenerationVolume.value)
  const memoryPrompt = formatMemoryPrompt(baseCtx.memoryContext)
  const generationPrompt = appendMemoryPromptOnce(prompt, baseCtx.memoryContext)
  // Use SkillExecutionEngine for split-merge / multi-step
  if ((mode === "split-merge" || mode === "multi-step") && templates.length > 0) {
    const engine = (window as any).SkillExecutionEngine
    if (engine) {
      if (runTraceStore.currentRunId) {
        runTraceStore.addEvent(runTraceStore.currentRunId, {
          type: "engine-start",
          level: "info",
          label: mode === "split-merge" ? "分合执行引擎开始" : "多步执行引擎开始",
          detail: templates.map(t => t.name || t.id).join("、")
        })
      }
      const _engineAiRequest = async (opts: any) => {
        const traceRunId = runTraceStore.currentRunId
        const traceCallId = traceRunId ? runTraceStore.startApiCall(traceRunId, {
          step,
          skillId: opts.skillId || templates[0]?.id,
          skillName: opts.skillName || templates[0]?.name,
          agentName: getStepAgentName(step) || undefined,
          providerId: activeProviderId() || undefined,
          providerName: providerStore.getProvider(activeProviderId())?.name,
          model: opts.model || activeProviderModel(),
          temperature: opts.temperature,
          maxTokens: opts.maxTokens,
          requestMessages: opts.messages || []
        }) : ''
        const startedAt = Date.now()
        const aiSvc = await getAiService()
        let result: Awaited<ReturnType<typeof aiSvc.callAi>>
        try {
          result = await aiSvc.callAi({
          purpose: 'generate',
          messages: opts.messages || [],
          model: opts.model || undefined,
          temperature: opts.temperature != null ? opts.temperature : undefined,
          maxTokens: opts.maxTokens || null,
          stream: opts.stream !== false,
          retry: true,
          signal: pipelineStore.getGenerationSignal(),
          meta: { source: 'PipelinePanel.engine' },
          onChunk: (text: string) => {
            opts.onChunk?.(text)
            appendPipelineDelta(step, 'text', text)
          },
          onReasoning: (text: string) => {
            opts.onReasoning?.(text)
            appendPipelineDelta(step, 'reasoning', text)
          },
          onPhysicalCall: (event) => {
            if (traceRunId && traceCallId) runTraceStore.appendPhysicalCall(traceRunId, traceCallId, {
              physicalCallId: event.physicalCallId,
              phase: event.phase,
              status: event.status,
              requestMessages: (event.requestMessages || []).map(m => ({ role: m.role, content: String(m.content || '') })),
              responseText: event.responseText || '',
              streamText: event.streamText || '',
              reasoningText: event.reasoningText || '',
              finishReason: event.finishReason,
              usage: event.usage,
              durationMs: event.durationMs,
              error: event.error,
            toolsEnabled: event.toolsEnabled,
            toolsDowngraded: event.toolsDowngraded,
              downgradeReason: event.downgradeReason,
              retryStrategy: event.retryStrategy,
              maxTokens: event.maxTokens,
              providerContextWindowTokens: event.contextBudget?.providerContextWindowTokens,
              estimatedInputTokens: event.contextBudget?.estimatedInputTokens,
              contextBudgetDecision: event.contextBudget?.decision,
              contextBudgetReason: event.contextBudget?.reason,
              usageReconciliation: event.usageReconciliation,
              interruptionCode: event.interruptionCode,
              heartbeat: event.heartbeat
            })
          }
          })
        } catch (error) {
          if (traceRunId && traceCallId) {
            flushPipelineStreamState(step)
            const canceled = pipelineStore.isGenerationCanceled()
            runTraceStore.finishApiCall(traceRunId, traceCallId, {
              status: canceled ? 'canceled' : 'failed',
              error: error instanceof Error ? error.message : String(error)
            })
          }
          throw error
        }
        if (traceRunId && traceCallId) {
          flushPipelineStreamState(step)
          const traceStatus = traceStatusFromAiResult(result, result.maxTokens ?? opts.maxTokens)
          runTraceStore.finishApiCall(traceRunId, traceCallId, {
            status: traceStatus.status,
            responseText: result.text || '',
            reasoningText: result.reasoning || '',
            finishReason: result.finishReason,
            usage: result.usage,
            durationMs: result.durationMs ?? (Date.now() - startedAt),
            error: traceStatus.error
          })
          if (traceStatus.status === 'failed') {
            throw new Error(traceStatus.error || '模型没有返回正文')
          }
        }
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
      if (runTraceStore.currentRunId) {
        runTraceStore.addEvent(runTraceStore.currentRunId, {
          type: "engine-finished",
          level: "info",
          label: "执行引擎完成",
          detail: "返回 " + String(result?.text || '').length + " 字"
        })
      }
      return result?.text || prompt
    }
  }
  if (mode === "chain" && templates.length > 1) {
    const chainCtx = { ...baseCtx, prevResponse: "" }
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
    const seenHandoffHashes = new Set<string>(resumePoint.handoffHashes)
    if (resumePoint.lastHandoff?.outputHash) {
      seenHandoffHashes.add(resumePoint.lastHandoff.outputHash)
      if (runTraceStore.currentRunId) {
        runTraceStore.addEvent(runTraceStore.currentRunId, {
          type: "chain-handoff-resume",
          level: "info",
          label: `链式断点恢复 Handoff`,
          detail: `恢复 ${resumePoint.lastHandoff.sourceSkillId} 的产物 ${resumePoint.lastHandoff.outputHash}`
        })
      }
    }
    if (resumePoint.resumed) {
      if (step === 2) {
        volumeGenerationLogs.value.push(
          "检测到卷纲断点：将从第" + (startSi + 1) + "步继续（失败步骤会重试）"
        )
      }
      console.log("[PIPELINE] chain resumed from step " + (startSi + 1) + "/" + templates.length)
    }
    for (let si = startSi; si < templates.length; si++) {
      const t = templates[si]
      const useOriginal = si === 0 && startSi === 0
      const isPrimaryConsumer = si === startSi
      const templateMeta = readChainHandoffMeta(t.skill) ||
        ((t as HydratedFolderMeta).meta && typeof (t as HydratedFolderMeta).meta === 'object'
          ? (t as HydratedFolderMeta).meta as ChainHandoffTemplateMeta
          : null)
      const isFolderSkill = t.skill?.format === "folder" && Boolean(t.skill?.folderPath)
      // Detect the raw catalog template: with keepMissing:false, resolved placeholders
      // would otherwise disappear and hide ownership from the delivery resolver.
      const templateOwnsPreviousOutput = si === 0
        ? false
        : !isFolderSkill && templateReferencesPreviousOutput(t.template)
      const requiresFullUpstream =
        templateMeta?.chainHandoff?.requiresFullPreviousOutput === true ||
        templateMeta?.chainHandoff?.requiresFullUpstreamContext === true
      const upstreamPrompt = slimChainUpstreamPrompt({
        prompt: generationPrompt,
        isPrimaryConsumer,
        requiresFullUpstream
      })
      if (runTraceStore.currentRunId) {
        runTraceStore.addEvent(runTraceStore.currentRunId, {
          type: "chain-context-slim",
          level: upstreamPrompt.slimmed ? "info" : "info",
          label: `链式步骤 ${si + 1}/${templates.length} 上下文决策`,
          detail: JSON.stringify({
            decision: upstreamPrompt.slimmed ? "slim" : "full",
            measurement: "upstream_prompt_only",
            reason: upstreamPrompt.reason,
            isPrimaryConsumer,
            requiresFullUpstream,
            declarationSource: templateMeta ? "folder-meta" : "default",
            declaredFullUpstream: templateMeta?.chainHandoff?.requiresFullUpstreamContext === true,
            originalPromptLength: upstreamPrompt.originalLength,
            finalPromptLength: upstreamPrompt.prompt.length,
            outlineOriginalLength: upstreamPrompt.outlineLength
          })
        })
      }
      const previousResolution = si === 0
        ? { delivery: 'full_text' as const, output: '' }
        : resolveChainPreviousOutput({
          previousOutput: current,
          templateMeta,
          textSkillTemplateReferencesPreviousOutput: templateOwnsPreviousOutput
        })
      const handoffDelivery = previousResolution.delivery
      // Folder executor keeps its own template.md and does not resolve pipeline
      // template variables, so the previous output must be delivered inline once.
      const delivery = si === 0
        ? "context_block"
        : isFolderSkill
          ? "inline_block"
          : templateOwnsPreviousOutput
            ? "template_variable"
            : "inline_block"
      const nextPrompt = buildChainSkillPrompt({
        initialPrompt: upstreamPrompt.prompt,
        previousOutput: previousResolution.output,
        memoryPrompt,
        isFirst: useOriginal,
        templateOwnsPreviousOutput,
        delivery
      })
      const previousOutput = si === 0 ? "" : previousResolution.output
      const ctxForSkill = {
        ...chainCtx,
        ...(t.customVars || {}),
        previousOutput,
        previousSkillOutput: previousOutput,
        prevResponse: previousOutput
      }
      const resolvedTemplate = resolveSkillTemplate(t.template, ctxForSkill)
      if (si > 0 && runTraceStore.currentRunId) {
        const fullReason = templateMeta?.chainHandoff?.reason?.trim() || ""
        const fullReasonMissing =
          (templateMeta?.chainHandoff?.previousOutput === "full" ||
            templateMeta?.chainHandoff?.requiresFullPreviousOutput === true) &&
          !fullReason
        const deliveryDetail = JSON.stringify({
          delivery: handoffDelivery,
          fullTextLength: current.length,
          deliveredLength: previousResolution.output.length,
          declaredMode: templateMeta?.chainHandoff?.previousOutput || "default",
          requires: templateMeta?.chainHandoff?.requires || [],
          skillId: t.id,
          skillName: t.name || "",
          fullReason,
          fullReasonMissing
        })
        runTraceStore.addEvent(runTraceStore.currentRunId, {
          type: "chain-handoff-delivery",
          level: fullReasonMissing ? "warn" : "info",
          label: `链式步骤 ${si + 1}/${templates.length} 上游交付决策`,
          detail: deliveryDetail
        })
        logPipelineChainHandoff(
          'info',
          `Chain handoff delivery: step=${si + 1}/${templates.length} delivery=${handoffDelivery}`,
          deliveryDetail
        )
        if (fullReasonMissing) {
          appendPipelineChainWarning({
            step,
            skillIndex: si,
            code: 'chain-full-reason-missing',
            summary: `full 交付缺少 reason（skill: ${t.name || t.id}），已按兼容策略继续 full 交付`
          })
        }
        const contractMiss = previousResolution.contractMiss
        if (contractMiss) {
          const contractMissDetail = JSON.stringify(contractMiss)
          appendPipelineChainWarning({
            step,
            skillIndex: si,
            code: 'chain-handoff-contract-miss',
            summary: `Handoff 契约未命中：${contractMiss.reason}`
          })
          runTraceStore.addEvent(runTraceStore.currentRunId, {
            type: "chain-handoff-contract-miss",
            level: "warn",
            label: `链式步骤 ${si + 1}/${templates.length} Handoff 契约未命中`,
            detail: contractMissDetail
          })
          logPipelineChainHandoff(
            'warn',
            `Chain handoff contract miss: step=${si + 1}/${templates.length}`,
            contractMissDetail
          )
        }
      }
      console.log("[PIPELINE] chain step " + (si + 1) + "/" + templates.length + " = " + t.name)
      if (step === 2) {
        volumeGenerationLogs.value.push("卷纲链式步骤 " + (si + 1) + "/" + templates.length + "：正在执行「" + (t.name || "未命名技能") + "」")
      }
  if (step >= 2 && step <= 3) {
        pipelineStore.updateProgress(
          Math.min(65, 15 + Math.round(((si + 1) / templates.length) * 50)),
          "链式生成中：" + (si + 1) + "/" + templates.length
      )
    }
    if (runTraceStore.currentRunId) {
      runTraceStore.addEvent(runTraceStore.currentRunId, {
      type: "chain-step",
      level: "info",
      label: `链式步骤 ${si + 1}/${templates.length}`,
      detail: `${t.name || t.id}${resumePoint.resumed ? '（断点续跑）' : ''}`
      })
    }
      // Need 1: per-skill agent override
      const skillAgentId = getStepSkillAgentId(step, t.id)
      const injection = getPromptParts(resolvedTemplate, t.injectMode || "system_prefix")
      try {
        let stepOutput = await callValidatedSkill(
          step,
          t,
          injection,
          nextPrompt,
          { ...ctxForSkill, previousOutput },
          timeoutMs,
          skillAgentId,
          undefined,
          resolvedTemplate,
          ctxForSkill,
          si < templates.length - 1,
          upstreamPrompt.prompt
        )
        if (si > 0 && handoffDelivery !== 'full_text') {
          validateSkillOutputOrThrow(t, stepOutput)
        }
        if (si < templates.length - 1) {
          const dedupedOutput = dedupeChainIntermediateOutput(stepOutput)
          if (dedupedOutput !== stepOutput) {
            const removedChars = stepOutput.length - dedupedOutput.length
            stepOutput = dedupedOutput
            appendPipelineChainWarning({
              step,
              skillIndex: si,
              code: 'chain-dedupe',
              summary: `中间产物去重：剔除 ${removedChars} 字符`
            })
            if (runTraceStore.currentRunId) {
              runTraceStore.addEvent(runTraceStore.currentRunId, {
                type: "chain-dedupe",
                level: "warn",
                label: `链式步骤 ${si + 1}/${templates.length} 中间产物去重`,
                detail: `剔除上一步回显的记忆块/上一步标题，共 ${removedChars} 字符`
              })
            }
          }
        }
        const echoDiagnostic = detectChainOutputEcho(
          si === 0 ? undefined : previousResolution.output,
          stepOutput
        )
        if (
          echoDiagnostic &&
          shouldRepairChainEcho(si, templates.length, echoDiagnostic.echoRatio)
        ) {
          appendPipelineChainWarning({
            step,
            skillIndex: si,
            code: 'chain-output-echo-repair',
            summary: '终步输出与上一步高度重复，已带反馈重试一次'
          })
          if (runTraceStore.currentRunId) {
            runTraceStore.addEvent(runTraceStore.currentRunId, {
              type: 'chain-output-echo-repair',
              level: 'warn',
              label: `链式步骤 ${si + 1}/${templates.length} 终步回显修复重试`,
              detail: JSON.stringify({ echoRatio: echoDiagnostic.echoRatio })
            })
          }
          stepOutput = await callValidatedSkill(
            step,
            t,
            injection,
            `${nextPrompt}\n\n[修复反馈] 上一步输出与本步输出高度重复。请只输出本步骤定稿产物，不要复述上一步内容。`,
            { ...ctxForSkill, previousOutput },
            timeoutMs,
            skillAgentId,
            undefined,
            resolvedTemplate,
            ctxForSkill,
            si < templates.length - 1,
            upstreamPrompt.prompt
          )
        }
        const repairedEchoDiagnostic = detectChainOutputEcho(
          si === 0 ? undefined : previousResolution.output,
          stepOutput
        )
        if (runTraceStore.currentRunId && repairedEchoDiagnostic) {
          appendPipelineChainWarning({
            step,
            skillIndex: si,
            code: 'chain-output-echo',
            summary: `输出回显警告：${repairedEchoDiagnostic.message}`
          })
          runTraceStore.addEvent(runTraceStore.currentRunId, {
            type: repairedEchoDiagnostic.code,
            level: "warn",
            label: `链式步骤 ${si + 1}/${templates.length} 输出回显警告`,
            detail: `${repairedEchoDiagnostic.message}（前序长度 ${repairedEchoDiagnostic.previousLength}，当前长度 ${stepOutput.length}）`
          })
        }
        current = stepOutput
        chainCtx.prevResponse = current
        if (si < templates.length - 1 && runTraceStore.currentRunId) {
          const reportStartedAt = Date.now()
          runTraceStore.attachProcessingReport(runTraceStore.currentRunId, {
            stage: 'post',
            processor: 'chain-handoff',
            status: 'success',
            inputPreview: upstreamPrompt.prompt.slice(0, 500),
            outputPreview: current.slice(0, 500),
            output: current,
            startedAt: reportStartedAt,
            endedAt: reportStartedAt,
            durationMs: 0
          })
        }
        const handoffArtifact = makeChainHandoffArtifact({
          sourceStep: si,
          sourceSkillId: t.id,
          output: current,
          delivery: handoffDelivery,
          templateMeta,
          previousSeenHashes: seenHandoffHashes
        })
        seenHandoffHashes.add(handoffArtifact.outputHash)
        if (runTraceStore.currentRunId) {
          runTraceStore.addEvent(runTraceStore.currentRunId, {
            type: "chain-handoff",
            level: handoffArtifact.repeatedHashCount ? "warn" : "info",
            label: `链式步骤 ${si + 1}/${templates.length} Handoff`,
            detail: JSON.stringify(describeChainHandoffEvent(handoffArtifact))
          })
        }
        // Persist a complete success checkpoint immediately after each Skill.
        const handoffHashes = Array.from(seenHandoffHashes)
        await pipelineStore.saveBreakpoint(createChainSuccessBreakpoint({
          step,
          projectId: checkpointProjectId,
          skillIndex: si,
          skillId: t.id,
          skillSequence,
          lastSuccessChainIndex: si,
          lastOutput: current,
          lastHandoff: {
            artifactId: handoffArtifact.artifactId,
            sourceStep: handoffArtifact.sourceStep,
            sourceSkillId: handoffArtifact.sourceSkillId,
            outputHash: handoffArtifact.outputHash,
            fullTextLength: handoffArtifact.fullTextLength,
            delivery: handoffArtifact.delivery,
            canonicalExcerpt: handoffArtifact.canonicalExcerpt
          },
          handoffHashes,
          inputPrompt: nextPrompt,
          agentId: fallbackAgentId(skillAgentId),
          retryCount: 0,
          volumeIndex: selectedVolumeIndex.value
        }))
      } catch (error) {
        if (si > 0 && handoffDelivery !== 'full_text') {
          try {
            if (runTraceStore.currentRunId) {
              const escalationDetail = JSON.stringify({
                fromDelivery: handoffDelivery,
                reason: error instanceof Error ? error.message : String(error)
              })
              appendPipelineChainWarning({
                step,
                skillIndex: si,
                code: 'chain-handoff-escalation',
                summary: `Handoff 契约未命中升级全文重试：${handoffDelivery}`
              })
              runTraceStore.addEvent(runTraceStore.currentRunId, {
                type: "chain-handoff-escalation",
                level: "warn",
                label: `链式步骤 ${si + 1}/${templates.length} Handoff 升级全文重试`,
                detail: escalationDetail
              })
              logPipelineChainHandoff(
                'warn',
                `Chain handoff escalation: step=${si + 1}/${templates.length} from=${handoffDelivery}`,
                escalationDetail
              )
            }
            const fullRetryPrompt = buildChainSkillPrompt({
              initialPrompt: upstreamPrompt.prompt,
              previousOutput: current,
              memoryPrompt,
              isFirst: useOriginal,
              templateOwnsPreviousOutput,
              delivery
            })
            const fullRetryContext = { ...ctxForSkill, previousOutput: current }
            const fullRetryResolvedTemplate = resolveSkillTemplate(t.template, {
              ...ctxForSkill,
              prevResponse: current,
              previousOutput: current,
              previousSkillOutput: current
            })
            let stepOutput = await callValidatedSkill(
              step,
              t,
              injection,
              fullRetryPrompt,
              fullRetryContext,
              timeoutMs,
              skillAgentId,
              undefined,
              fullRetryResolvedTemplate,
              ctxForSkill,
              si < templates.length - 1,
              upstreamPrompt.prompt
            )
            validateSkillOutputOrThrow(t, stepOutput)
            if (si < templates.length - 1) {
              const dedupedOutput = dedupeChainIntermediateOutput(stepOutput)
              if (dedupedOutput !== stepOutput) {
                const removedChars = stepOutput.length - dedupedOutput.length
                stepOutput = dedupedOutput
                appendPipelineChainWarning({
                  step,
                  skillIndex: si,
                  code: 'chain-dedupe',
                  summary: `升级重试中间产物去重：剔除 ${removedChars} 字符`
                })
                if (runTraceStore.currentRunId) {
                  runTraceStore.addEvent(runTraceStore.currentRunId, {
                    type: "chain-dedupe",
                    level: "warn",
                    label: `链式步骤 ${si + 1}/${templates.length} 中间产物去重`,
                    detail: `剔除上一步回显的记忆块/上一步标题，共 ${removedChars} 字符`
                  })
                }
              }
            }
            const echoDiagnostic = detectChainOutputEcho(current, stepOutput)
            if (runTraceStore.currentRunId && echoDiagnostic) {
              appendPipelineChainWarning({
                step,
                skillIndex: si,
                code: 'chain-output-echo',
                summary: `升级重试输出回显警告：${echoDiagnostic.message}`
              })
              runTraceStore.addEvent(runTraceStore.currentRunId, {
                type: echoDiagnostic.code,
                level: "warn",
                label: `链式步骤 ${si + 1}/${templates.length} 输出回显警告`,
                detail: `${echoDiagnostic.message}（前序长度 ${echoDiagnostic.previousLength}，当前长度 ${stepOutput.length}）`
              })
            }
            current = stepOutput
            chainCtx.prevResponse = current
            const reportStartedAt = Date.now()
            if (runTraceStore.currentRunId) {
              runTraceStore.attachProcessingReport(runTraceStore.currentRunId, {
                stage: 'post',
                processor: 'chain-handoff',
                status: 'warning',
                inputPreview: upstreamPrompt.prompt.slice(0, 500),
                outputPreview: current.slice(0, 500),
                output: current,
                issues: [{
                  level: 'warning',
                  code: 'chain-handoff-escalation',
                  message: `已从 ${handoffDelivery} 升级为全文重试并成功`,
                  blocking: false,
                  retried: true
                }],
                startedAt: reportStartedAt,
                endedAt: reportStartedAt,
                durationMs: 0
              })
            }
            const handoffArtifact = makeChainHandoffArtifact({
              sourceStep: si,
              sourceSkillId: t.id,
              output: current,
              delivery: 'full_text',
              templateMeta: { chainHandoff: { requiresFullPreviousOutput: true } },
              previousSeenHashes: seenHandoffHashes
            })
            seenHandoffHashes.add(handoffArtifact.outputHash)
            if (runTraceStore.currentRunId) {
              runTraceStore.addEvent(runTraceStore.currentRunId, {
                type: "chain-handoff",
                level: handoffArtifact.repeatedHashCount ? "warn" : "info",
                label: `链式步骤 ${si + 1}/${templates.length} Handoff（全文重试）`,
                detail: JSON.stringify(describeChainHandoffEvent(handoffArtifact))
              })
            }
            const handoffHashes = Array.from(seenHandoffHashes)
            await pipelineStore.saveBreakpoint(createChainSuccessBreakpoint({
              step,
              projectId: checkpointProjectId,
              skillIndex: si,
              skillId: t.id,
              skillSequence,
              lastSuccessChainIndex: si,
              lastOutput: current,
              lastHandoff: {
                artifactId: handoffArtifact.artifactId,
                sourceStep: handoffArtifact.sourceStep,
                sourceSkillId: handoffArtifact.sourceSkillId,
                outputHash: handoffArtifact.outputHash,
                fullTextLength: handoffArtifact.fullTextLength,
                delivery: handoffArtifact.delivery,
                canonicalExcerpt: handoffArtifact.canonicalExcerpt
              },
              handoffHashes,
              inputPrompt: fullRetryPrompt,
              agentId: fallbackAgentId(skillAgentId),
              retryCount: 0,
              volumeIndex: selectedVolumeIndex.value
            }))
            continue
          } catch (escalationError) {
            error = escalationError instanceof Error ? escalationError : new Error(String(escalationError))
          }
        }
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
  const folderSkills = templates.filter((t) => t.skill?.format === "folder" && t.skill.folderPath)
  if (folderSkills.length > 1) {
    appendStepLog(step, `compose 提示：${formatFolderSkillBoundary('compose-multi')}`)
  } else if (folderSkills.length === 1 && templates.some((t) => getStepSkillAgentId(step, t.id))) {
    appendStepLog(step, "compose 提示：并行模式下技能级智能体不会生效，本层将使用智能体配置执行文件夹技能")
  }
  const composePrompt = generationPrompt
  let result: string
  const composeTemplate: PipelineSkillTemplate = {
    id: "compose",
    name: templates.map(t => t.name).filter(Boolean).join(" + ") || "Compose",
    template: combined,
    // Keep the folder skill reference so compose cannot silently discard real-skill execution.
    skill: templates.find(t => t.skill?.format === "folder" && t.skill.folderPath)?.skill,
    outputFormat: templates.some(t => t.outputFormat === "json") ? "json" : "text",
    outputSchema: templates.find(t => t.outputSchema)?.outputSchema,
    validationRules: templates.flatMap(t => t.validationRules || []),
    retryPolicy: templates.reduce((max, t) => Math.max(max, getSkillMaxAttempts(t.retryPolicy)), 1)
  }
  result = await callValidatedSkill(step, composeTemplate, merged, composePrompt, baseCtx, timeoutMs, undefined, combined)
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
  const trace = startStepTrace(1, "设定层", "settings")
  trace.begin()
  activeGenerationFeedbackStep.value = 1
  skillStepStates.value = []
  resetPipelineStreamState(1)
  settingsGenerationLogs.value = ["已读取大纲锁定状态，准备构造设定生成请求"]
  pipelineStore.startGeneration()
  pipelineStore.updateProgress(10, "正在读取已确认大纲并生成设定")
  try {
    trace.addEvent({ type: "prompt-built", level: "info", label: "设定层提示词已构建" })
    const prompt = "[已确认大纲]\n" + projectStore.pipelineOutlineText + "\n\n请基于这份已确认的大纲，提取并生成设定项。根据内容自动分配category；没有合适分类时使用设定类。输出JSON数组，每项含name/category/attrsText字段。"
    settingsGenerationLogs.value.push("请求已发送：正在等待 API 返回设定内容")
    const settingsCollection = projectStore.getSettingsCollection()
    const existingSettings = settingsCollection.categories.flatMap(category => {
      const items = settingsCollection.items[category] || []
      return items.map((item: any) => ({ category: item.category || category, name: item.name }))
    })
    const artifact = await generateSettingsArtifact({
      basePrompt: prompt,
      existing: existingSettings,
      callSettingsApi: (requestPrompt) => runStepSkills(1, requestPrompt, undefined, "你是设定生成专家。基于小说大纲生成详细设定。"),
      shouldContinue: () => !pipelineStore.isGenerationCanceled(),
      onAttempt: (attempt) => {
        trace.recordStepObservation('validation', attempt.validationMs)
        trace.addEvent({
          type: "settings-artifact-attempt",
          level: attempt.status === 'complete' ? 'info' : attempt.status === 'error' ? 'error' : 'warn',
          label: "设定批次验收",
          detail: JSON.stringify(attempt)
        })
      }
    })
    settingsGenerationLogs.value.push("API 已返回：正在解析设定 JSON 并执行应用层契约验收")
    pipelineStore.updateProgress(70, "正在解析设定内容")
    if (artifact.status !== 'complete') {
      const failure = artifact.errors.join("; ") || "设定项没有可接受输出"
      pipelineStore.failGeneration(failure)
      settingsGenerationLogs.value.push("设定契约校验失败：" + failure)
      return
    }
    if (artifact.accepted.length > 0) {
      const sc2 = projectStore.getSettingsCollection()
      const repairAttempts = artifact.attempts.filter(attempt => attempt.repairAttempt > 0).length
      for (const item of artifact.accepted) {
        const cat = normalizeSettingsCategory(item.category)
        const name = item.name
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
      await trace.measurePhase('persistence', () => projectStore.saveProject())
      if (sc2.categories.length > 0) {
        selectedSettingCategory.value = firstCategoryWithSettings(["设定类", ...sc2.categories])
      }
      settingsGenerationLogs.value.push("设定已写入分类并保存到当前项目")
      trace.addEvent({
        type: "settings-artifact-validated",
        level: "info",
        label: "设定批次验收通过",
        detail: JSON.stringify({
          acceptedCount: artifact.accepted.length,
          rejectedCount: artifact.rejected.length,
          reasons: [...new Set(artifact.rejected.map(item => item.reason))],
          repairAttempts
        })
      })
      trace.addEvent({ type: "write", level: "info", label: "设定已写入项目", detail: "新增 " + artifact.accepted.length + " 项" })
      pipelineStore.updateProgress(100, "设定生成完成")
      styleCardExpanded.value = true
    }
    pipelineStore.finishGeneration()
  } catch (e: any) {
    settingsGenerationLogs.value.push("API 调用失败：" + (e.message || "未知错误"))
    pipelineStore.failGeneration(e.message)
  } finally {
    const traceStatus = traceStatusFromRun(trace.runId!)
    trace.finish(traceStatus, undefined, traceStatus === 'success' ? 'settings_generation_complete' : 'generation_failed')
  }
}

async function genVolumes(mode: string) {
  if (!projectStore.pipelineOutlineText) return
  const trace = startStepTrace(2, "卷纲层", mode)
  trace.begin()
  activeGenerationFeedbackStep.value = 2
  skillStepStates.value = []
  // 新项目会从大纲自动生成占位卷；占位卷没有纲要/摘要，不能作为上一卷记忆。
  const previousVolumes = projectStore.volumes.filter(hasVolumeContent)
  const existingCountBeforeGeneration = previousVolumes.length
  resetPipelineStreamState(2)
  activeVolumeGenerationIndex.value = mode === "auto" ? 0 : existingCountBeforeGeneration
  volumeGenerationLogs.value = [
    mode === "single" ? "已选择逐卷生成，准备生成下一卷" : mode === "continue" ? "已选择续生成，本次只生成下一卷" : "已选择 AI 生成全卷，准备分析大纲和字数"
  ]
  pipelineStore.startGeneration()
  pipelineStore.updateProgress(10, "AI生成卷纲中")
  let volumeArtifactDelivered = false
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
    const existingCount = previousVolumes.length
    const totalWords = Math.max(0, Math.round(bookWordCount.value * 10000))
    const volumeHistoryFacts = buildVolumeHistoryFacts(previousVolumes)
    const volumeHistoryContext = renderVolumeHistoryContext(volumeHistoryFacts)
    const expectedVolumeCount = mode === "auto"
      ? Math.max(0, effectiveVolumes - existingCount)
      : 1
    const volumeContract: VolumeGenerationContract = {
      mode: mode as VolumeGenerationContract["mode"],
      expectedCount: expectedVolumeCount,
      existingCount,
      totalPlannedVolumes: effectiveVolumes
    }
    const volumePlan = buildVolumePlanIntegrity({
      plannedVolumeCount: effectiveVolumes,
      totalWords,
      existingVolumes: previousVolumes
    })
    volumeGenerationLogs.value.push("已读取大纲、设定和全书字数，正在构造卷纲请求")
    trace.addEvent({
      type: "prompt-built",
      level: "info",
      label: "卷纲层提示词已构建",
      detail: JSON.stringify({ ...volumePlan, mode })
    })
    const prompt = buildVolumePrompt({
      mode: mode as VolumeGenerateMode,
      outlineText: projectStore.pipelineOutlineText,
      settingsText,
      boundText,
      effectiveVolumes,
      totalWords,
      allocatedSum: volumePlan.allocatedWords,
      existingVolumes: previousVolumes
    })
    const basePrompt = prompt
    volumeGenerationLogs.value.push("请求已发送：正在等待 API 返回卷纲内容")
    const batchResult = await generateVolumeBatch({
      contract: volumeContract,
      historyVolumes: previousVolumes,
      basePrompt,
      historyContext: volumeHistoryContext,
      callVolumeApi: (requestPrompt) => runStepSkills(2, requestPrompt, undefined, "你是卷纲生成专家。基于大纲和设定生成卷纲。"),
      requestPolicy: getStepSkillTemplates(2).some(t => t.skill?.format === "folder" && t.skill.folderPath) ? "single-volume" : "batch",
      shouldContinue: () => !pipelineStore.isGenerationCanceled(),
      onPromptBuilt: (requestPrompt, promptAudit) => {
        if (!promptAudit.duplicateHistoryContextSuppressed) return
        trace.addEvent({
          type: "duplicate-history-context-suppressed",
          level: "warn",
          label: "卷纲历史块重复注入已抑制",
          detail: JSON.stringify({
            promptLength: requestPrompt.length,
            ...promptAudit
          })
        })
      },
      onAttempt: (attempt) => {
        trace.recordStepObservation('validation', attempt.validationMs)
        trace.addEvent({
          type: "volume-batch-attempt",
          level: attempt.status === 'complete' ? 'info' : attempt.status === 'error' ? 'error' : 'warn',
          label: "卷纲批次验收",
          detail: JSON.stringify(attempt)
        })
      }
    })
    volumeGenerationLogs.value.push("API 已返回：正在解析卷纲 JSON 并校验卷数")
    pipelineStore.updateProgress(70, "正在解析卷纲内容")
    if (batchResult.status !== 'complete') {
      const failure = batchResult.errors.join("; ") || "卷纲批次未能补齐"
      pipelineStore.failGeneration(failure)
      volumeGenerationLogs.value.push("卷纲契约校验失败：" + failure)
      return
    }
    const volumes = batchResult.volumes
    if (volumes.length > 0) {
      const vr = validateVolumes(volumes)
      if (!vr.valid) {
        pipelineStore.failGeneration(vr.errors.join("; "))
        pipelineStore.finishGeneration()
        return
      }
      if (mode === "continue" || mode === "single") {
        const normalizedVolumes = volumes.map((v: any) => {
          const requestedWords = Math.max(0, Math.round(Number(v.allocatedWords || v.suggestedWords) || 0))
          const clamped = clampVolumeWordsToPlan(requestedWords, volumePlan)
          if (clamped.clamped) {
            volumeGenerationLogs.value.push(
              `第${previousVolumes.length + 1}卷字数 ${requestedWords} 超出剩余预算，已调整为 ${clamped.words}`
            )
            trace.addEvent({
              type: "volume-budget-clamped",
              level: "warn",
              label: "卷纲字数已按全书预算钳制",
              detail: `requested=${requestedWords}; allowed=${clamped.words}; remaining=${volumePlan.remainingWords}`
            })
          }
          return {
            ...v,
            ...extractVolumeContractSemantics(v),
            id: v.id || ('vol_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)),
            allocatedWords: clamped.words,
            confirmed: false,
            isBound: false,
            boundTo: [],
            bodyGenerated: false
          }
        })
        projectStore.volumes = [...previousVolumes, ...normalizedVolumes]
      } else {
        const plannedWords = buildVolumePlanIntegrity({
          plannedVolumeCount: effectiveVolumes,
          totalWords,
          existingVolumes: []
        })
        projectStore.volumes = [...previousVolumes, ...volumes.map((v: any) => {
          const requestedWords = Math.max(0, Math.round(Number(v.allocatedWords || v.suggestedWords) || 0))
          const clamped = clampVolumeWordsToPlan(requestedWords, plannedWords)
          if (clamped.clamped) {
            trace.addEvent({
              type: "volume-budget-clamped",
              level: "warn",
              label: "全卷生成字数已按全书预算钳制",
              detail: `requested=${requestedWords}; allowed=${clamped.words}; remaining=${plannedWords.remainingWords}`
            })
          }
          return {
            ...v,
            ...extractVolumeContractSemantics(v),
            id: v.id || ('vol_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)),
            allocatedWords: clamped.words,
            confirmed: false,
            isBound: false,
            boundTo: [],
            bodyGenerated: false
          }
        })]
      }
      await trace.measurePhase('persistence', () => projectStore.saveProject())
      volumeGenerationLogs.value.push("卷纲已写入卷框并保存到当前项目")
      const ledger = validateVolumeGenerationLedger(projectStore.volumes.length, effectiveVolumes, mode as VolumeGenerationContract["mode"])
      if (!ledger.valid) {
        pipelineStore.failGeneration(ledger.errors.join("; "))
        volumeGenerationLogs.value.push("卷纲台账校验失败：" + ledger.errors.join("; "))
        return
      }
      trace.addEvent({
        type: "volume-batch-validated",
        level: "info",
        label: "卷纲批次验收通过",
        detail: JSON.stringify({
          mode,
          expectedCount: volumeContract.expectedCount,
          actualCount: volumes.length,
          repairAttempts: batchResult.attempts.filter(attempt => attempt.repairAttempt > 0).length,
          status: batchResult.status
        })
      })
      trace.addEvent({ type: "write", level: "info", label: "卷纲已写入项目", detail: "写入 " + volumes.length + " 卷" })
      pipelineStore.updateProgress(100, "卷纲生成完成")
      volumeArtifactDelivered = true
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
    trace.addEvent({ type: "failed", level: "error", label: "卷纲运行失败", detail: e.message || "未知错误" })
  } finally {
    const outcome = traceOutcomeFromRun(trace.runId!, volumeArtifactDelivered)
    if (volumeArtifactDelivered && outcome.recoveredFromDegraded) {
      trace.addEvent({
        type: "volume-artifact-recovered",
        level: "warn",
        label: "卷纲中间尝试曾降级，最终产物已通过契约验收",
        detail: JSON.stringify({
          degradedApiCalls: outcome.degradedApiCalls,
          finalStatus: 'complete'
        })
      })
    }
    const successReason = mode === 'single' ? 'single_volume_generation_complete' : mode === 'continue' ? 'next_volume_generation_complete' : 'all_volumes_generation_complete'
    trace.finish(outcome.status, undefined, outcome.status === 'success' ? successReason : 'generation_failed')
  }
}

async function loadOutline() {
  projectStore.setOutline(projectStore.outlineText)
  projectStore.saveProject()
}

async function callChapterApi(prompt: string): Promise<string> {
  const result = await runStepSkills(3, prompt, undefined, "你是章节规划师。请基于大纲、设定和卷纲规划本卷章节。")
  return result
}

async function genChapters() {
  const vol = selectedVolume.value
  if (!vol) return
  currentGenerationVolume.value = vol
  const trace = startStepTrace(3, "章节层", "chapters")
  trace.begin()
  activeGenerationFeedbackStep.value = 3
  skillStepStates.value = []
  resetPipelineStreamState(3)
  const volumeAgentId = getStepAgentId(3)
  const volumeSkillNames = getStepSkillTemplates(3).map(t => t.name).filter(Boolean)
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
  chapterGenerationLogs.value.push("智能体：" + (volumeAgentId ? (agentStore.getAgent(volumeAgentId)?.name || volumeAgentId) : "未配置，使用默认生成模型"))
  chapterGenerationLogs.value.push("Skill：" + (volumeSkillNames.length ? volumeSkillNames.join("、") : "未配置，仅使用章节规划师提示词"))
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
    trace.addEvent({
      type: "prompt-built",
      level: "info",
      label: "章节层执行参数已构建",
      detail: JSON.stringify({ volume: vol.name, totalChapters, wordsPerChapter, resumeCount })
    })
    const volOutline = vol.outline || vol.summary || ""
    if (!volOutline.trim()) {
      chapterGenerationLogs.value.push("警告：本卷没有卷纲要，章节将只能依据卷名和上游大纲、设定生成")
    }
    const styleCtxForChapters = getStyleContext()
    if (styleCtxForChapters) {
      chapterGenerationLogs.value.push("已注入风格与节奏上下文")
    }
    const scForChapters = projectStore.getSettingsCollection()
    const allSettings: any[] = []
    for (const cat of scForChapters.categories) {
      const items = scForChapters.items[cat] || []
      allSettings.push(...items)
    }
    const settingsTextForChapters = allSettings.map((s: any) => s.name + " - " + JSON.stringify(s.attrs)).join("\n")
    const boundSettingsTextForChapters = getBoundSettingsText()
    const batch = Math.max(1, Math.min(chapterBatchSize.value || 5, 20))
    const batchContracts: ChapterBatchContract[] = collected.length > 0
      ? [{
          volumeId: String(volId),
          batchIndex: 0,
          expectedStart: 1,
          expectedEnd: collected.length,
          requestedCount: collected.length,
          totalChapters
        }]
      : []
    while (collected.length < totalChapters) {
      const start = collected.length
      const requested = Math.min(batch, totalChapters - start)
      const end = start + requested
      const phase = start > 0 ? 'supplement' : 'batch'
      const contract: ChapterBatchContract = {
        volumeId: String(volId),
        batchIndex: batchContracts.length,
        expectedStart: start + 1,
        expectedEnd: end,
        requestedCount: requested,
        totalChapters
      }
      const historyFacts = buildChapterHistoryFacts(collected)
      const historyContext = renderChapterHistoryContext(historyFacts)
      const basePrompt = "[全书大纲]\n" + projectStore.pipelineOutlineText
        + "\n\n[设定]\n" + (settingsTextForChapters || "（暂无设定）")
        + (boundSettingsTextForChapters ? "\n\n[绑定设定]\n" + boundSettingsTextForChapters : "")
        + "\n\n[卷纲]\n" + vol.name + " - " + volOutline
        + (styleCtxForChapters ? "\n\n[风格与节奏]\n" + styleCtxForChapters : "")
        + "\n\n[本卷总章数]\n" + totalChapters
        + "\n\n[单章字数]\n" + wordsPerChapter
      pipelineStore.updateProgress(Math.round((start / totalChapters) * 100), "生成 " + (start + 1) + "-" + end + "/" + totalChapters)
      chapterGenerationLogs.value.push(
        (phase === 'supplement' ? "补充生成" : "正在生成") + "第" + (start + 1) + "章到第" + end + "章（共" + totalChapters + "章）"
      )
      const batchResult = await generateChapterBatch({
        contract,
        historyTitles: new Set(collected.map(c => String(c.title || '').trim())),
        basePrompt,
        historyContext,
        callChapterApi,
        shouldContinue: () => !pipelineStore.isGenerationCanceled(),
        onAttempt: (attempt) => {
          trace.recordStepObservation('validation', attempt.validationMs)
          trace.addEvent({
            type: "chapter-batch-attempt",
            level: attempt.status === 'complete' ? 'info' : attempt.status === 'error' ? 'error' : 'warn',
            label: "章节批次验收",
            detail: JSON.stringify(attempt)
          })
        }
      })
      if (batchResult.status !== 'complete') {
        await saveChapterBreakpoint('batch-incomplete')
        throw new Error(batchResult.errors.join("; ") || `批次未能补齐：第${contract.expectedStart}章到第${contract.expectedEnd}章`)
      }
      const added = batchResult.chapters
      added.forEach((c: any, idx: number) => {
        if (!c.id) c.id = "ch-" + String(volId).replace(/[^a-zA-Z0-9_-]/g, "-") + "-" + String(collected.length + idx + 1).padStart(3, "0")
        c.pipelineGenerated = true
        if (c.body === undefined) c.body = ""
        if (c.bodyGenerated === undefined) c.bodyGenerated = false
        if (c.wordCount === undefined) c.wordCount = 0
      })
      batchContracts.push(contract)
      collected.push(...added)
      projectStore.setChapters(volId, [...untouchedChapters, ...collected])
      projectStore.refreshTree()
      await trace.measurePhase('persistence', () => saveChapterBreakpoint('progress'))
      chapterGenerationLogs.value.push("已生成 " + collected.length + "/" + totalChapters + " 章")
      trace.addEvent({
        type: "chapter-batch-validated",
        level: "info",
        label: "章节批次验收通过",
        detail: JSON.stringify({
          batchIndex: contract.batchIndex,
          expectedStart: contract.expectedStart,
          expectedEnd: contract.expectedEnd,
          requestedCount: contract.requestedCount,
          actualCount: added.length,
          repairAttempts: batchResult.attempts.filter(attempt => attempt.repairAttempt > 0).length,
          status: batchResult.status
        })
      })
    }
    if (collected.length > 0) {
      const vr = validateChapters(collected, totalChapters)
      if (!vr.valid) {
        await saveChapterBreakpoint('failed-validation')
        pipelineStore.failGeneration(vr.errors.join("; "))
        chapterGenerationLogs.value.push("章节校验失败：" + vr.errors.join("; "))
        return
      }
      const ledger = validateChapterGenerationLedger(batchContracts, totalChapters)
      if (!ledger.valid) {
        await saveChapterBreakpoint('failed-validation')
        pipelineStore.failGeneration(ledger.errors.join("; "))
        chapterGenerationLogs.value.push("章节台账校验失败：" + ledger.errors.join("; "))
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
    trace.addEvent({ type: "failed", level: "error", label: "章节运行失败", detail: e.message || "未知错误" })
  } finally {
    currentGenerationVolume.value = null
    const traceStatus = traceStatusFromRun(trace.runId!)
    trace.finish(traceStatus, undefined, traceStatus === 'success' ? 'chapters_generation_complete' : 'generation_failed')
  }
}

async function genBody(volumeIndex: number, chapterIndex: number) {
  const { vol, volId, chapter: ch } = getBodyChapterByVisibleIndex(volumeIndex, chapterIndex)
  if (!ch) return
  const trace = startStepTrace(4, "正文层", "body")
  trace.begin()

  // Sync the body-stage selectors to the chapter we are generating from.
  bodyVolumeIndex.value = volumeIndex
  bodyChapterIndex.value = chapterIndex

  pipelineStore.startGeneration()
  pipelineStore.updateProgress(10, "AI生成正文中")
  activeGenerationFeedbackStep.value = 4
  skillStepStates.value = []
  resetPipelineStreamState(4)
  const _bodyWordsPerChapter = Number(vol.wordsPerChapter || chapterWords.value || 3500)
    bodyGenerationLogs.value = ["已选择卷「" + (vol.name || "未命名") + "」，章节：「" + (ch.title || "未命名") + "」，目标字数：" + _bodyWordsPerChapter]
  let bodyArtifactDelivered = false
  try {
    bodyGenerationLogs.value.push("正在构建章节执行包…")
    const sc = projectStore.getSettingsCollection()
    const allItems: any[] = []
    for (const cat of sc.categories) {
      const items = sc.items[cat] || []
      allItems.push(...items)
    }
    bodyGenerationLogs.value.push("已加载设定 " + allItems.length + " 项，准备调用 API")
    bodyGenerationLogs.value.push("降AI方法论已注入（17条生成约束，仅正文层生效）")
    pipelineStore.updateProgress(20, "API 生成正文中（已注入降AI约束）")
    const settingsText = allItems.map((s: any) => s.name + " - " + JSON.stringify(s.attrs)).join("\n")
    const boundText = getBoundSettingsText()
    const styleCtx = getStyleContext()
    const bodyVolId = volId ?? (vol.id || vol.name)
    const bodyChs = bodyVolId ? (projectStore.chapters[bodyVolId] || []) : []
    const currentBodyChapterIndex = bodyChs.indexOf(ch)
    const prevChapter = currentBodyChapterIndex > 0 ? bodyChs[currentBodyChapterIndex - 1] : null
    const prevChapterSummary = prevChapter ? (prevChapter.summary || prevChapter.plot || "") : ""
    const volumeOutlineText = vol.outline || vol.summary || ""
    const resolvedUnitId = ch.unitId || ch.plot?.match(/(?:^|[^A-Za-z0-9_-])([A-Za-z][A-Za-z0-9_-]*\d+(?:-\d+)?|U\d+)(?![A-Za-z0-9_-])/)?.[1]
    const volumeScopeValidation = validateOutlineContextScope(volumeOutlineText)
    const contextFailureDetail = volumeScopeValidation.errors.map(error => `${error.code}:${error.message}`).join(';')
    const outlineClosure = volumeScopeValidation.ok
      ? buildOutlineUnitClosure({
        outline: volumeOutlineText,
        unitId: resolvedUnitId,
        volumeSummary: vol.summary || vol.outline || "",
        chapterDetail: `${ch.title || ""}\n${ch.plot || ""}`,
        contractForbiddenFinalCards: extractVolumeContractSemantics(vol).forbiddenFinalCards,
        includeUnitDraft: false
      })
      : null
    if (!outlineClosure || !outlineClosure.ok) {
      const closureErrors = outlineClosure?.errors?.length
        ? outlineClosure.errors
        : volumeScopeValidation.errors
      throw new Error(`正文上下文闭包构建失败：${contextFailureDetail || closureErrors.map(error => `${error.code}:${error.message}`).join(';')}`)
    }
    const contextScope = {
      unitId: ch.unitId || null,
      closure: outlineClosure.closure,
      permanentCount: outlineClosure.permanentCount,
      unitCount: outlineClosure.unitCount,
      undeclaredCount: outlineClosure.undeclaredCount,
      closureBytes: outlineClosure.closureBytes,
      targetBytes: outlineClosure.targetBytes,
      maxBytes: outlineClosure.maxBytes,
      trimmed: outlineClosure.trimmed,
      warnings: outlineClosure.warnings,
      degradedReason: outlineClosure.degradedReason,
      contractForbiddenFinalCards: outlineClosure.contractForbiddenFinalCards
    }
    trace.addEvent({
      type: 'context_scope',
      level: contextScope.degradedReason ? 'warn' : 'info',
      label: '正文层上下文闭包',
      detail: JSON.stringify({
        volume: vol.name,
        chapter: ch.title,
        unitId: contextScope.unitId,
        mode: contextScope.degradedReason ? 'legacy_outline_no_scope' : 'unit_closure',
        permanentCount: contextScope.permanentCount,
        unitCount: contextScope.unitCount,
        undeclaredCount: contextScope.undeclaredCount,
        closureBytes: contextScope.closureBytes,
        targetBytes: contextScope.targetBytes,
        maxBytes: contextScope.maxBytes,
        trimmed: contextScope.trimmed,
        warnings: contextScope.warnings,
        degradedReason: contextScope.degradedReason
      })
    })
    const memoryRetrieval = memoryRetrievalForPipeline({
      chapterId: String(ch.id || ""),
      chapterIndex,
      unitId: resolvedUnitId || undefined,
      query: `${ch.title || ""} ${ch.plot || ""}`,
      maxChars: 2000
    })
    trace.addEvent({
      type: 'memory_context',
      level: memoryRetrieval.trimmed.length > 0 ? 'warn' : 'info',
      label: '正文层记忆上下文',
      detail: JSON.stringify({
        chapterId: ch.id || "",
        unitId: resolvedUnitId || null,
        charCount: memoryRetrieval.charCount,
        priority: memoryRetrieval.priority,
        trimmed: memoryRetrieval.trimmed
      })
    })
    const executionPackage = createChapterExecutionPackage({
      projectId: projectStore.currentProjectId,
      volume: vol,
      volumeIndex,
      chapter: ch,
      chapterIndex,
      outlineContent: projectStore.pipelineOutlineText,
      contextScope,
      settings: allItems.map((s: any) => s.name + " - " + JSON.stringify(s.attrs)),
      boundSettings: boundText,
      styleContext: styleCtx,
      pacingContext: pacingParams.value,
      memoryContext: memoryTextFromRetrieval(memoryRetrieval, 2000),
      prevChapterSummary,
      sourceRefs: [
        projectStore.outlineLocked ? "outline:locked" : "outline:working",
        "volume:" + String(vol.id || vol.name),
        "chapter:" + String(ch.id || "")
      ]
    })
    ch.chapterExecutionPackage = executionPackage
    const prompt = buildChapterExecutionPrompt(executionPackage, _bodyWordsPerChapter)
    trace.addEvent({
      type: "prompt-built",
      level: "info",
      label: "正文层执行包已构建",
      detail: JSON.stringify({ volume: vol.name, chapter: ch.title, targetWords: _bodyWordsPerChapter })
    })
    const bodyArtifact = await generateBodyArtifact({
      contract: {
        chapterId: String(ch.id || `${volId}-chapter-${chapterIndex + 1}`),
        targetWords: _bodyWordsPerChapter
      },
      basePrompt: prompt,
      callBodyApi: (requestPrompt) => runStepSkills(4, requestPrompt, undefined, "你是小说写作专家。请基于章节剧情点生成正文。"),
      shouldContinue: () => !pipelineStore.isGenerationCanceled(),
      onAttempt: (attempt) => {
        trace.recordStepObservation('validation', attempt.validationMs)
        trace.addEvent({
          type: "body-artifact-attempt",
          level: attempt.status === 'complete' ? 'info' : attempt.status === 'error' ? 'error' : 'warn',
          label: "正文批次验收",
          detail: JSON.stringify(attempt)
        })
      }
    })
    pipelineStore.updateProgress(80, "API 返回完成，正在执行正文契约验收")
    bodyGenerationLogs.value.push("API 已返回，正在执行正文契约验收")
    if (bodyArtifact.status !== 'complete') {
      const failure = bodyArtifact.errors.join("; ") || "正文未通过验收"
      pipelineStore.failGeneration(failure)
      bodyGenerationLogs.value.push("正文契约校验失败：" + failure)
      return
    }
    const generationResult = {
      body: bodyArtifact.body,
      metadata: bodyArtifact.metadata
    }
    let finalBody = generationResult.body || ""
    finalBody = await runProseHardSignalNet(finalBody, trace.runId!, {
      finishReason: latestBodyFinishReason(trace.runId!)
    })
    const contractReview = reviewVolumeContractSemantics({
      prose: finalBody,
      forbiddenFinalCards: outlineClosure.contractForbiddenFinalCards
    })
    trace.addEvent({
      type: 'contract_review',
      level: contractReview.status === 'contract_broken' ? 'error' : contractReview.detected ? 'warn' : 'info',
      label: '卷契约语义审查',
      detail: JSON.stringify(contractReview)
    })
    // P2: 后处理层 — 自动降AI清洗
    if (finalBody.length > 0 && deAiStore.hardruleEnabled) {
      bodyGenerationLogs.value.push(
        deAiStore.hardRuleMode === 'legacy-auto'
          ? "开始降AI硬规则清洗（兼容自动替换模式）…"
          : "开始降AI硬规则检测（只报告，不改写正文）…"
      )
      pipelineStore.updateProgress(90, "降AI后处理中")
    }
    if (finalBody.length > 0 && deAiStore.hardruleEnabled) {
      try {
        const deaiStartedAt = Date.now()
        const deaiInputPreview = finalBody.slice(0, 200)
        if (deAiStore.hardRuleMode === 'legacy-auto') {
          // V55: 兼容模式保留 processBody（只做字符级替换，不重组段落/句子结构）
          const deaiResult = DeAiProcessor.processBody(finalBody, { hardRules: deAiStore.hardRules })
          if (deaiResult && deaiResult.text && deaiResult.text.length > 0) {
            bodyGenerationLogs.value.push(
              "降AI后处理完成：" +
              (deaiResult.stats?.total || 0) + " 处修正" +
              (deaiResult.detections?.length ? "，" + deaiResult.detections.length + " 项检测" : "")
            )
            finalBody = deaiResult.text
          }
          runTraceStore.attachProcessingReport(trace.runId!, {
            stage: 'post',
            processor: 'hard-rules',
            status: 'success',
            inputPreview: deaiInputPreview,
            outputPreview: finalBody.slice(0, 200),
            ruleHits: Object.entries(deaiResult.stats || {}).map(([rule, count]) => ({
              rule,
              count: typeof count === 'number' ? count : 0
            })),
            startedAt: deaiStartedAt,
            endedAt: Date.now(),
            durationMs: Date.now() - deaiStartedAt
          })
          trace.addEvent({
            type: 'deai-post-processed',
            level: 'info',
            label: '降AI兼容清洗完成',
            detail: JSON.stringify({
              beforeWords: bodyArtifact.attempts[bodyArtifact.attempts.length - 1]?.wordCount ?? 0,
              afterWords: countBodyWords(finalBody)
            })
          })
        } else {
          // V2：检测报告/深度修复都先出报告；检测模式不改写正文。
          const report = DeAiProcessor.detectBody(finalBody, { hardRules: deAiStore.hardRules })
          deAiStore.setLastDetectReport(report)
          const blocking = report.findings.filter((item: any) => item.severity === 'blocking').length
          const advisory = report.findings.length - blocking
          bodyGenerationLogs.value.push(
            "降AI检测完成：需处理 " + blocking + " 项，建议 " + advisory + " 项；正文保持原始生成结果"
          )
          trace.addEvent({
            type: "deai-detect",
            level: blocking > 0 ? "warn" : "info",
            label: "降AI检测报告",
            detail: JSON.stringify(report)
          })
          runTraceStore.attachProcessingReport(trace.runId!, {
            stage: 'post',
            processor: 'deai',
            status: blocking > 0 ? 'warning' : 'success',
            inputPreview: deaiInputPreview,
            outputPreview: finalBody.slice(0, 200),
            ruleHits: report.findings.map((item: any) => ({
              rule: item.type || item.code || 'unknown',
              count: item.count || 1
            })),
            issues: report.findings.map((item: any) => ({
              level: item.severity === 'blocking' ? 'error' : 'warning',
              code: item.type || item.code || 'unknown',
              message: item.message || item.summary || '',
              blocking: item.severity === 'blocking'
            })),
            startedAt: deaiStartedAt,
            endedAt: Date.now(),
            durationMs: Date.now() - deaiStartedAt
          })
          if (deAiStore.hardRuleMode === 'deep-fix') {
            bodyGenerationLogs.value.push("降AI深度修复执行中（最小编辑 + 保护片段回对 + 完整性门禁）…")
            pipelineStore.updateProgress(94, "降AI深度修复中")
            finalBody = await runBodyMinimalEdit(finalBody, report, trace.runId!)
            bodyGenerationLogs.value.push(
              "降AI深度修复结束；未通过门禁或 API 失败时保留原始正文"
            )
          }
        }
      } catch (deaiErr: any) {
        if (pipelineStore.isGenerationCanceled()) throw deaiErr
        console.warn("[DEAI] post-process failed, using raw body:", deaiErr)
        bodyGenerationLogs.value.push("降AI后处理跳过：" + (deaiErr?.message || "未知错误"))
        runTraceStore.attachProcessingReport(trace.runId!, {
          stage: 'post',
          processor: 'deai',
          status: 'failed',
          inputPreview: finalBody.slice(0, 200),
          outputPreview: finalBody.slice(0, 200),
          issues: [{
            level: 'error',
            code: 'deai-post-process-failed',
            message: deaiErr?.message || String(deaiErr),
            blocking: false
          }],
          startedAt: Date.now(),
          endedAt: Date.now(),
          durationMs: 0
        })
      }
    }
    bodyResult.value = finalBody
    ch.body = finalBody
    ch.generationMetadata = generationResult.metadata
    ch.bodyGenerated = true
    const validatedAttempt = bodyArtifact.attempts[bodyArtifact.attempts.length - 1]
    trace.addEvent({
      type: "body-artifact-validated",
      level: "info",
      label: "正文批次验收通过",
      detail: JSON.stringify({
        chapterId: String(ch.id || ''),
        targetWords: _bodyWordsPerChapter,
        wordCount: validatedAttempt?.wordCount ?? (finalBody || '').length,
        ratio: validatedAttempt?.ratio ?? 0,
        status: bodyArtifact.status,
        repairAttempts: bodyArtifact.attempts.filter(attempt => attempt.repairAttempt > 0).length
      })
    })
    await trace.measurePhase('persistence', () => projectStore.saveProject())
    bodyArtifactDelivered = true
    projectStore.refreshTree()
    syncChapterManager(volId, ch, finalBody)
    bodyGenerationLogs.value.push("正文生成完成，字数：" + (finalBody || "").length)
    trace.addEvent({ type: "write", level: "info", label: "正文已写入项目", detail: "字数 " + (finalBody || "").length })
    // Insert into the editor automatically (same link as old architecture).
    window.dispatchEvent(new CustomEvent("insert-text", {
      detail: {
        text: finalBody,
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
    bodyGenerationLogs.value.push("API 调用失败：" + (e.message || "未知错误"))
    trace.addEvent({ type: "failed", level: "error", label: "正文运行失败", detail: e.message || "未知错误" })
  } finally {
    const outcome = traceOutcomeFromRun(trace.runId!, bodyArtifactDelivered)
    if (bodyArtifactDelivered && outcome.recoveredFromDegraded) {
      trace.addEvent({
        type: "body-artifact-recovered",
        level: "warn",
        label: "正文中间尝试曾降级，最终产物已通过契约验收",
        detail: JSON.stringify({
          degradedApiCalls: outcome.degradedApiCalls,
          finalStatus: 'complete'
        })
      })
    }
    trace.finish(outcome.status, undefined, outcome.status === 'success' ? 'body_generation_complete' : 'generation_failed')
  }
}

async function runBodyMinimalEdit(
  text: string,
  report: any,
  traceRunId: string
): Promise<string> {
  if (!report?.findings?.length) return text

  const spans = DeAiProcessor.extractProtectedSpans(text, {})
  const reportText = report.findings.map((item: any) =>
    `${item.type}（${item.count} 处，每千字 ${item.perKilo}）：${item.samples.join('；')}`
  ).join('\n')
  const systemPrompt = [
    DeAiProcessor.getMinimalEditPrompt(),
    '',
    '【检测报告】',
    reportText,
    '',
    '【必须保留的人名/设定/对白】',
    spans.map((span: any) => span.value).join('\n') || '无'
  ].join('\n')
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: text }
  ]
  const provider = providerStore.getProvider(activeProviderId()) || providerStore.preferredGenerateProvider
  const model = provider?.selectedModel || provider?.models?.[0] || ''
  const aiService = await getAiService()
  const callId = runTraceStore.startApiCall(traceRunId, {
    step: 4,
    skillName: '降AI深度修复',
    providerId: provider?.id,
    providerName: provider?.name,
    model,
    requestMessages: messages
  })
  try {
    const result = await aiService.callAi({
      purpose: 'generate',
      messages,
      model: model || undefined,
      stream: false,
      retry: true,
      signal: pipelineStore.getGenerationSignal(),
      meta: { source: 'PipelinePanel.runBodyMinimalEdit' }
    })
    const edited = result.text || ''
    const traceStatus = traceStatusFromAiResult(result)
    runTraceStore.finishApiCall(traceRunId, callId, {
      status: traceStatus.status,
      responseText: edited,
      reasoningText: result.reasoning || '',
      finishReason: result.finishReason,
      usage: result.usage,
      durationMs: result.durationMs,
      error: traceStatus.error
    })
    if (traceStatus.status === 'failed') {
      appendStepLog(4, traceStatus.error || '降AI深度修复未生成正文，保留原文')
      return text
    }
    if (!edited.trim()) {
      runTraceStore.addEvent(traceRunId, {
        type: 'deai-minimal-edit',
        level: 'warn',
        label: '降AI深度修复结果为空，保留原文'
      })
      return text
    }

    const spanCheck = DeAiProcessor.verifyProtectedSpans(text, edited, spans)
    const integrityOk = DeAiProcessor.passesBodyIntegrityCheck(text, edited)
    if (spanCheck.mustMissing > 0 || !integrityOk) {
      runTraceStore.addEvent(traceRunId, {
        type: 'deai-minimal-edit',
        level: 'warn',
        label: '降AI深度修复未通过门禁，保留原文',
        detail: JSON.stringify({
          mustMissing: spanCheck.mustMissing,
          shouldMissing: spanCheck.shouldMissing,
          integrityOk
        })
      })
      return text
    }

    runTraceStore.addEvent(traceRunId, {
      type: 'deai-minimal-edit',
      level: 'info',
      label: '降AI深度修复完成',
      detail: JSON.stringify({
        mustMissing: spanCheck.mustMissing,
        shouldMissing: spanCheck.shouldMissing,
        integrityOk,
        originalLength: text.length,
        editedLength: edited.length
      })
    })
    return edited
  } catch (error) {
    const canceled = pipelineStore.isGenerationCanceled()
    runTraceStore.finishApiCall(traceRunId, callId, {
      status: canceled ? 'canceled' : 'failed',
      error: error instanceof Error ? error.message : String(error)
    })
    throw error
  }
}

async function runHardSignalRepair(
  text: string,
  scan: ProseHardSignalScan,
  traceRunId: string,
  attempt: number
): Promise<{ text: string; scan: ProseHardSignalScan; repaired: boolean }> {
  const finding = scan.findings[0]
  if (!finding) return { text, scan, repaired: false }
  if (finding.origin === 'provider') return { text, scan, repaired: false }

  const repairWindow = buildHardSignalRepairWindow(text, finding)
  const repairPrompt = buildHardSignalRepairPrompt(repairWindow.text, finding)
  const systemPrompt = [
    '你是小说正文的定点修复器。',
    '你的唯一任务是返回清除硬信号后的局部窗口。',
    '禁止输出元数据、协议说明、拒绝语或任何工程语言。'
  ].join('\n')
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: repairPrompt }
  ]
  const provider = providerStore.getProvider(activeProviderId()) || providerStore.preferredGenerateProvider
  const model = provider?.selectedModel || provider?.models?.[0] || ''
  const aiService = await getAiService()
  const callId = runTraceStore.startApiCall(traceRunId, {
    step: 4,
    skillName: '正文硬信号修复',
    providerId: provider?.id,
    providerName: provider?.name,
    model,
    requestMessages: messages
  })
  try {
    const result = await aiService.callAi({
      purpose: 'generate',
      messages,
      model: model || undefined,
      stream: false,
      retry: true,
      signal: pipelineStore.getGenerationSignal(),
      meta: { source: `PipelinePanel.runHardSignalRepair.attempt-${attempt}` }
    })
    const repairedWindow = (result.text || '').trim()
    const traceStatus = traceStatusFromAiResult(result)
    runTraceStore.finishApiCall(traceRunId, callId, {
      status: traceStatus.status,
      responseText: repairedWindow,
      reasoningText: result.reasoning || '',
      finishReason: result.finishReason,
      usage: result.usage,
      durationMs: result.durationMs,
      error: traceStatus.error
    })
    if (traceStatus.status !== 'success' || !repairedWindow) {
      runTraceStore.addEvent(traceRunId, {
        type: 'hard_signal_scan',
        level: 'warn',
        label: `正文硬信号修复第 ${attempt} 次未产出可用文本`,
        detail: JSON.stringify({ type: finding.type, traceStatus: traceStatus.status })
      })
      return { text, scan, repaired: false }
    }

    const integrityOk = passesHardSignalRepairIntegrity(repairWindow.text, repairedWindow)
    if (!integrityOk) {
      runTraceStore.addEvent(traceRunId, {
        type: 'hard_signal_scan',
        level: 'warn',
        label: `正文硬信号修复第 ${attempt} 次未通过完整性门禁`,
        detail: JSON.stringify({ type: finding.type })
      })
      return { text, scan, repaired: false }
    }

    const nextText = applyHardSignalRepairWindow(text, repairWindow, repairedWindow)
    const nextScan = scanProseHardSignals(nextText)
    runTraceStore.addEvent(traceRunId, {
      type: 'hard_signal_scan',
      level: nextScan.detected ? 'warn' : 'info',
      label: `正文硬信号修复第 ${attempt} 次复扫完成`,
      detail: JSON.stringify({
        detected: nextScan.detected,
        status: nextScan.status,
        counts: nextScan.counts,
        findings: nextScan.findings,
        before: scan.counts,
        after: nextScan.counts,
        repairedType: finding.type
      })
    })
    return { text: nextText, scan: nextScan, repaired: true }
  } catch (error) {
    const canceled = pipelineStore.isGenerationCanceled()
    runTraceStore.finishApiCall(traceRunId, callId, {
      status: canceled ? 'canceled' : 'failed',
      error: error instanceof Error ? error.message : String(error)
    })
    throw error
  }
}

async function runProseHardSignalNet(
  text: string,
  traceRunId: string,
  input: { finishReason?: string } = {}
): Promise<string> {
  let current = String(text || '')
  let scan = scanProseHardSignals(current, input)
  runTraceStore.addEvent(traceRunId, {
    type: 'hard_signal_scan',
    level: scan.detected ? 'error' : 'info',
    label: scan.detected ? '正文硬信号扫描命中' : '正文硬信号扫描通过',
    detail: JSON.stringify(scan)
  })
  if (!scan.detected) return current

  bodyGenerationLogs.value.push(`正文硬信号扫描命中：${Object.entries(scan.counts).filter(([, count]) => count > 0).map(([type, count]) => `${type}=${count}`).join(', ')}`)
  pipelineStore.updateProgress(88, '正文硬信号定点修复中')
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const repaired = await runHardSignalRepair(current, scan, traceRunId, attempt)
    current = repaired.text
    scan = repaired.scan
    if (!scan.detected) {
      bodyGenerationLogs.value.push(`正文硬信号修复完成，复扫通过（第 ${attempt} 次）`)
      return current
    }
  }

  runTraceStore.addEvent(traceRunId, {
    type: 'hard_signal_scan',
    level: 'error',
    label: '正文硬信号连续两次修复后仍未清空',
    detail: JSON.stringify({ status: 'hard_signal_unresolved', counts: scan.counts })
  })
  bodyGenerationLogs.value.push('正文硬信号终态：hard_signal_unresolved，已停止继续润色')
  hardSignalUnresolvedRuns.add(traceRunId)
  return current
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
      mode: 'ch-body',
      openEditor: true
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

async function callMemoryApi(
  prompt: string,
  systemPrompt: string,
  trace?: Parameters<typeof unifiedMemoryAiCall>[2]
): Promise<string | null> {
  const traceRunIdForMemory = () => (trace as { runId?: string } | undefined)?.runId || null
  const memoryTrace = trace as (UnifiedMemoryAiCallTrace & { runId?: string }) | undefined
  const traceCallIdForMemory = () => (
    memoryTrace && typeof memoryTrace.beginApiCall === 'function' && memoryTrace.runId
      ? runTraceStore.getApiCallId('pipeline')
      : null
  )
  try {
    return await unifiedMemoryAiCall(prompt, systemPrompt, trace ? {
      ...trace,
      onPhysicalCall: (event) => {
        const runId = traceRunIdForMemory()
        const callId = traceCallIdForMemory()
        if (!runId) return
        if (!callId) return
        runTraceStore.appendPhysicalCall(runId, callId, {
          physicalCallId: event.physicalCallId,
          phase: event.phase,
          status: event.status,
          requestMessages: (event.requestMessages || []).map(m => ({ role: m.role, content: String(m.content || '') })),
          responseText: event.responseText || '',
          streamText: event.streamText || '',
          reasoningText: event.reasoningText || '',
          finishReason: event.finishReason,
          usage: event.usage,
          durationMs: event.durationMs,
          error: event.error,
          toolsEnabled: event.toolsEnabled,
          toolsDowngraded: event.toolsDowngraded,
          downgradeReason: event.downgradeReason,
          retryStrategy: event.retryStrategy,
          maxTokens: event.maxTokens,
          providerContextWindowTokens: event.contextBudget?.providerContextWindowTokens,
          estimatedInputTokens: event.contextBudget?.estimatedInputTokens,
          contextBudgetDecision: event.contextBudget?.decision,
          contextBudgetReason: event.contextBudget?.reason,
          usageReconciliation: event.usageReconciliation,
          interruptionCode: event.interruptionCode,
          heartbeat: event.heartbeat,
          firstTokenMs: event.firstTokenMs,
          outputMs: event.outputMs
        })
      }
    } : undefined)
  } catch (error) {
    if ((error as any)?.message === "记忆抽取超时" || (error as any)?.kind === "timeout") throw error
    console.warn("[PIPELINE] memory extraction API failed:", error)
    return null
  }
}

async function confirmBodyWithMemory() {
  const projectIdAtCall = projectStore.currentProjectId
  const chapter = currentBodyChapter()
  if (!chapter || !chapter.content.trim()) return

  // 正文先落盘；记忆抽取失败不能回滚正文。
  const { volId, chapter: ch } = getBodyChapterByVisibleIndex(bodyVolumeIndex.value, bodyChapterIndex.value)
  const sourceVersionId = await projectStore.recordSourceVersion(chapter.id, chapter.index, chapter.content)
  if (projectStore.currentProjectId !== projectIdAtCall) return
  if (ch) {
    ch.body = chapter.content
    ch.bodyGenerated = true
    projectStore.saveProject()
    projectStore.refreshTree()
  }

  if (!settingsStore.autoExtractMemory) return

  const memoryTrace = startStepTrace(4, "记忆抽取", "memory-extraction")
  memoryTrace.begin()
  memoryPreviewLoading.value = true
  memoryPreviewError.value = ""
  memoryPreviewVisible.value = true
  const startedAt = Date.now()
  const log = (phase: "start" | "request" | "parse" | "complete" | "failed", status: "started" | "success" | "failed", errorKind?: "timeout" | "network" | "invalid_json" | "canceled" | "unknown") => {
    const structured = {
      phase,
      status,
      errorKind,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      projectId: projectStore.currentProjectId || "",
      chapterId: chapter.id
    }
    memoryPreviewLogs.value.push(structured)
    if (phase === "start" || phase === "complete" || phase === "failed") {
      addMemoryExecutionLog({
        phase,
        status,
        durationMs: structured.durationMs,
        projectId: structured.projectId,
        chapterId: structured.chapterId,
        errorKind,
        message: phase === "start"
          ? `开始记忆抽取：${structured.projectId}/${structured.chapterId}`
          : phase === "complete"
            ? `记忆抽取完成：${structured.projectId}/${structured.chapterId}`
            : `记忆抽取失败：${structured.projectId}/${structured.chapterId}${errorKind ? ` (${errorKind})` : ""}`
      })
    }
  }
  log("start", "started")
  memoryPreviewChanges.value = []
  memoryPreviewExtracted.value = null
  memoryPreviewChapter.value = chapter
  try {
    const result = await extractMemory({
      chapterId: chapter.id,
      chapterIndex: chapter.index,
      sourceVersionId,
      chapterTitle: chapter.title,
      content: chapter.content
    }, (prompt, systemPrompt) => callMemoryApi(prompt, systemPrompt, memoryTrace), settingsStore.memoryExtractionTimeoutSeconds * 1000)
    if (projectStore.currentProjectId !== projectIdAtCall) {
      log("failed", "failed", "canceled")
      memoryPreviewError.value = "项目已切换，记忆抽取结果已丢弃。"
      memoryTrace.finish("canceled", "项目已切换，记忆抽取结果已丢弃")
      return
    }
    if (!result.success) {
      log("failed", "failed", result.error?.includes("超时") ? "timeout" : "invalid_json")
      memoryPreviewError.value = `记忆抽取失败：${result.error || "未知错误"}。正文已保存。`
      memoryTrace.finish("failed", result.error || "记忆抽取失败")
      return
    }
    log("complete", "success")
    memoryPreviewExtracted.value = result.data
    memoryPreviewDraft.value = createTrackingTransaction({
      projectId: projectStore.currentProjectId || "",
      currentMemory: projectStore.memories,
      extracted: result.data,
      chapterId: chapter.id,
      chapterIndex: chapter.index,
      blacklist: projectStore.memoryBlacklist
    })
    const changes = previewTransactionChanges(projectStore.memories, result.data, {
      chapterId: chapter.id,
      chapterIndex: chapter.index,
      blacklist: projectStore.memoryBlacklist
    })
    memoryPreviewChanges.value = changes.map((change: any) => ({ ...change, review: "pending" }))
  } catch (error: any) {
    log("failed", "failed", "unknown")
    memoryPreviewError.value = `记忆抽取失败：${error?.message || "未知错误"}。正文已保存。`
    memoryTrace.fail(error)
    return
  } finally {
    memoryPreviewLoading.value = false
  }
  if (memoryTrace.isRunning()) memoryTrace.finish('success')
}

function closeMemoryPreview() {
  if (memoryPreviewSaving.value) return
  memoryPreviewVisible.value = false
  memoryPreviewLoading.value = false
  memoryPreviewError.value = ""
  memoryPreviewChanges.value = []
  memoryPreviewExtracted.value = null
  memoryPreviewChapter.value = null
  memoryPreviewDraft.value = null
  memoryPreviewCommitError.value = ""
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
  const memoryTrace = startStepTrace(4, "记忆事务", "memory-transaction")
  memoryTrace.begin()
  try {
    const reviewed = filterReviewedMemory(extracted)
    const confirmed = Object.fromEntries(Object.entries(reviewed).map(([kind, values]) => [kind, (values as any[]).map(item => ({ ...item, factStatus: 'confirmed' }))])) as any
    const currentDraft = memoryPreviewDraft.value
      ? { ...memoryPreviewDraft.value, extracted: confirmed }
      : createTrackingTransaction({
        projectId: projectStore.currentProjectId || "",
        currentMemory: projectStore.memories,
        extracted: confirmed,
        chapterId: chapter.id,
        chapterIndex: chapter.index,
        blacklist: projectStore.memoryBlacklist
      })
    const committed = await projectStore.recordMemoryTransaction({
      transaction: currentDraft,
      chapterId: chapter.id,
      chapterIndex: chapter.index,
      reason: `确认正文后写入记忆：${chapter.title}`
    })
    if (!committed.ok) {
      memoryPreviewCommitError.value = committed.message
      memoryPreviewError.value = `记忆写入失败：${committed.message}`
      memoryTrace.addEvent({
        type: "tracking_commit",
        level: "error",
        label: "记忆事务提交被拒绝",
        detail: JSON.stringify({ chapterId: chapter.id, code: committed.code, message: committed.message })
      })
      if (committed.code === "stale_state") {
        memoryPreviewDraft.value = createTrackingTransaction({
          projectId: projectStore.currentProjectId || "",
          currentMemory: projectStore.memories,
          extracted: confirmed,
          chapterId: chapter.id,
          chapterIndex: chapter.index,
          blacklist: projectStore.memoryBlacklist
        })
      }
      return
    }
    memoryTrace.addEvent({
      type: "tracking_commit",
      level: "info",
      label: "记忆事务已提交",
      detail: JSON.stringify({
        chapterId: chapter.id,
        revision: committed.revision,
        recordId: committed.recordId
      })
    })
    confirmStep(4)
    written = true
  } catch (error: any) {
    memoryPreviewError.value = `记忆写入失败：${error?.message || "未知错误"}`
    memoryTrace.fail(error)
  } finally {
    memoryPreviewSaving.value = false
    if (memoryTrace.isRunning()) {
      memoryTrace.finish(written ? 'success' : 'failed')
    }
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
    if (projectStore.pipelineConfig) {
      volumeCount.value = projectStore.pipelineConfig.volumeCount || volumeCount.value
      volumeWords.value = projectStore.pipelineConfig.volumeWords || volumeWords.value
      chapterWords.value = projectStore.pipelineConfig.chapterWords || chapterWords.value
    }
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

// 切换项目时恢复 pipeline 配置
watch(() => projectStore.currentProjectId, (newId, oldId) => {
  if (newId && newId !== oldId) {
    if (projectStore.pipelineConfig) {
      volumeCount.value = projectStore.pipelineConfig.volumeCount || volumeCount.value
      volumeWords.value = projectStore.pipelineConfig.volumeWords || volumeWords.value
      chapterWords.value = projectStore.pipelineConfig.chapterWords || chapterWords.value
    }
    if (projectStore.bookWordCountChars > 0) {
      bookWordCount.value = Math.round(projectStore.bookWordCountChars / 10000)
    }
    selectedVolumeIndex.value = 0
    selectedChapterIndex.value = 0
    bodyVolumeIndex.value = 0
    bodyChapterIndex.value = 0
  }
}, { immediate: false })


const selectedChapter = computed(() => currentVolumeChapters.value[selectedChapterIndex.value] || null)

const chapterDetailVisible = ref(false)
const chapterDetailEditTitle = ref('')
const chapterDetailEditPlot = ref('')

watch(chapterDetailVisible, visible => {
  if (visible) modalQueue.open('pl-chapter-detail')
  else modalQueue.close('pl-chapter-detail')
}, { immediate: true })

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
  return s ? skillStore.displaySkillName(s) : id;
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
// === SKILL drag sort handlers ===
function onSkillDragStart(e: DragEvent, index: number) {
  skillDragState.dragIndex = index
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}
function onSkillDragOver(e: DragEvent, index: number) {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  if (skillDragState.dragIndex !== index) skillDragState.overIndex = index
}
function onSkillDrop(e: DragEvent, index: number, internalStep: number) {
  e.preventDefault()
  const from = skillDragState.dragIndex
  const to = index
  if (from < 0 || from === to) { skillDragState.dragIndex = -1; skillDragState.overIndex = -1; return }
  const arr = [...(stepSkills.value[internalStep] || [])]
  if (from < arr.length && to < arr.length) {
    const [moved] = arr.splice(from, 1)
    arr.splice(to, 0, moved)
    stepSkills.value[internalStep] = arr
    saveStepConfig()
  }
  skillDragState.dragIndex = -1
  skillDragState.overIndex = -1
}
function onSkillDragEnd() {
  skillDragState.dragIndex = -1
  skillDragState.overIndex = -1
}
const skillDragState = reactive({ dragIndex: -1, overIndex: -1 })

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
  }
}

function openNaming() {
  window.dispatchEvent(new CustomEvent('open-ai-naming', {
    detail: { source: 'pipeline', pipelineContext: projectStore.outlineText.slice(0, 500) }
  }))
}

function memoryTextForPipeline(options: {
  chapterId?: string
  chapterIndex?: number
  unitId?: string
  query: string
  previousChapterSummary?: string
  maxChars?: number
}): string {
  return memoryTextFromRetrieval(memoryRetrievalForPipeline(options), options.maxChars || 2000)
}

function memoryRetrievalForPipeline(options: {
  chapterId?: string
  chapterIndex?: number
  unitId?: string
  query: string
  previousChapterSummary?: string
  maxChars?: number
}) {
  return retrieveContext(projectStore.memories, options)
}

function memoryTextFromRetrieval(retrieval: ReturnType<typeof retrieveContext>, maxChars: number): string {
  const memory = retrieval.text
  const messages = conversationContextService.assembleMessages(
    {
      session: { id: 'pipeline-memory-context', projectId: String(projectStore.currentProjectId || ""), recentMessages: [] },
      workspace: { memories: memory },
      execution: { purpose: "generate" }
    },
    { chatHistory: "none", recentTurns: 0, includeOutline: false, includeSettings: false, includeMemory: true },
    []
  )
  return messages.length > 0
    ? messages[messages.length - 1].content.replace(/^\[工作区上下文\]\n相关记忆：\n/, "").slice(0, maxChars)
    : ""
}


</script>

<style scoped>
.pl-run-trace-legacy { display: flex; flex-direction: column; gap: var(--space-3); }
.pl-run-trace-legacy-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); color: var(--text-primary); }
.pl-run-trace-legacy-item { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3); border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-secondary); }
.pl-run-trace-legacy-top { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); color: var(--text-secondary); font-size: var(--font-size-sm); }
.pl-run-trace-legacy-item details { color: var(--text-secondary); font-size: var(--font-size-sm); }
.pl-run-trace-legacy-item summary { cursor: pointer; }
.pl-run-trace-legacy-item pre { margin: var(--space-2) 0 0; padding: var(--space-3); max-height: 260px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; border-radius: var(--radius-sm); background: var(--bg-tertiary); color: var(--text-primary); font-size: var(--font-size-xs); line-height: 1.6; user-select: text; }
.pl-run-trace-feedback { display: flex; gap: var(--space-2); }
.pl-run-trace-feedback .active { border-color: var(--accent); color: var(--accent); }
.pl-run-trace-suggestions { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3); border-radius: var(--radius-sm); background: var(--bg-secondary); color: var(--text-secondary); font-size: var(--font-size-sm); }
.pl-run-trace-suggestions p { margin: 0; }
.pl-run-trace-legacy-empty { padding: var(--space-4); border-radius: var(--radius-sm); background: var(--bg-secondary); color: var(--text-secondary); font-size: var(--font-size-sm); line-height: 1.6; }
.pl-deai-badge { display: inline-flex; align-items: center; padding: var(--space-1) var(--space-4); font-size: var(--font-size-xs); color: var(--success); background: var(--success-dim); border-radius: var(--radius-sm); white-space: nowrap; }
.pl-style-card { margin-bottom: var(--space-4); border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-input); overflow: visible; }
.pl-style-card-header { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-4); cursor: pointer; user-select: none; }
.pl-style-card-title { font-weight: 600; font-size: var(--font-size-sm); white-space: nowrap; }
.pl-style-card-summary { flex: 1; min-width: 0; font-size: var(--font-size-xs); color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pl-style-card-toggle { font-size: var(--font-size-xs); color: var(--text-secondary); white-space: nowrap; flex-shrink: 0; }
.pl-style-card-body { display: flex; gap: var(--space-4); padding: var(--space-3) var(--space-4); border-top: 1px solid var(--border-color); max-height: min(46vh, 420px); overflow-y: auto; }
.pl-style-tags-section { flex: 1; min-width: 0; }
.pl-style-pacing-section { flex: 1; min-width: 0; }
.pl-style-section-label { display: block; font-size: var(--font-size-xs); font-weight: 600; color: var(--text-secondary); margin-bottom: var(--space-2); }
.pl-style-tag-pool { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-2); }
.pl-style-tag-chip { display: inline-flex; align-items: center; gap: var(--space-2); padding: var(--space-1) var(--space-5); border-radius: var(--radius-sm); border: 1px solid var(--border-color); font-size: var(--font-size-xs); cursor: pointer; user-select: none; }
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
.pl-fullscreen { align-items: stretch; justify-content: stretch; }
.pl-content-fullscreen { width: 100% !important; height: 100% !important; max-width: 100% !important; max-height: 100% !important; border-radius: 0 !important; border: none !important; }
.pl-memory-preview-modal { position: relative; z-index: var(--z-modal-nested-content); width: min(var(--modal-width-lg), 100%); max-height: var(--modal-max-height); min-height: 0; display: flex; flex-direction: column; overflow: hidden; background: var(--bg-elevated); border: 1px solid var(--border-color); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); pointer-events: auto; }
.pl-memory-preview-header, .pl-memory-preview-footer { display: flex; align-items: center; justify-content: space-between; gap: var(--space-6); padding: var(--space-6) var(--space-7); }
.pl-memory-preview-header { border-bottom: 1px solid var(--border-color); }
.pl-memory-preview-subtitle { display: block; margin-top: 4px; color: var(--text-secondary); font-size: var(--font-size-xs); }
.pl-memory-preview-body { min-height: 120px; overflow: auto; padding: var(--space-6) var(--space-7); }
.pl-memory-preview-footer { justify-content: flex-end; border-top: 1px solid var(--border-color); }
.pl-memory-change-list { display: grid; gap: var(--space-5); margin: 0; padding: 0; list-style: none; }
.pl-memory-change-item { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: var(--space-4) var(--space-5); padding: var(--space-5); border: 1px solid var(--border-color); border-radius: var(--radius-sm); }
.pl-memory-change-kind { color: var(--text-secondary); font-size: var(--font-size-xs); }
.pl-memory-change-item small { grid-column: 1 / -1; color: var(--text-secondary); }
.pl-memory-change-actions { grid-column: 1 / -1; display: flex; justify-content: flex-end; gap: var(--space-4); }
.pl-memory-preview-error { color: var(--danger); }
.pl-content { width: min(1400px, 96vw); height: min(920px, 96vh); max-width: 1400px; max-height: 96vh; background: var(--bg-glass); border: 1px solid var(--border-color); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); display: flex; flex-direction: column; }
.pl-header { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); min-width: 0; padding: var(--space-5) var(--space-8); border-bottom: 1px solid var(--border-color); font-size: var(--font-size-xl); font-weight: 600; }
.pl-header-title { min-width: 0; }
.pl-header-actions { display: flex; align-items: center; gap: var(--space-2); }
@media (max-width: 479px) {
  .pl-header { flex-wrap: wrap; padding: var(--space-4) var(--space-5); }
  .pl-header-title { flex: 1 0 100%; }
  .pl-header-actions { flex: 1 1 100%; justify-content: flex-start; flex-wrap: wrap; }
}
.pl-body { display: flex; flex: 1; overflow: hidden; }
/* 左侧五层步骤导航 - 竖排 */
.pl-steps { width: clamp(200px, 18vw, 280px); background: var(--pipeline-step-bg); border-right: 1px solid var(--border-color); padding: var(--space-6) var(--space-4); display: flex; flex-direction: column; gap: var(--space-3); flex-shrink: 0; }
.pl-step { display: flex; align-items: center; gap: var(--space-5); padding: var(--space-6) var(--space-4); cursor: pointer; border-radius: var(--radius-lg); opacity: 0.5; transition: opacity var(--duration-fast) var(--ease-standard), background var(--duration-fast) var(--ease-standard); }
.pl-step:hover { opacity: 0.8; background: var(--bg-hover); }
.pl-step.active { opacity: 1; background: var(--pipeline-step-active-bg); border: 1px solid var(--pipeline-step-active-border); }
.pl-step.completed { opacity: 1; }
.pl-step-num { width: 34px; height: 34px; border-radius: 50%; background: var(--bg-tertiary); color: var(--text-primary); display: flex; align-items: center; justify-content: center; font-size: var(--font-size-lg); font-weight: bold; flex-shrink: 0; transition: background var(--duration-fast) var(--ease-standard); }
.pl-step.active .pl-step-num { background: var(--accent); color: var(--text-on-accent); }
.pl-step.completed { background: var(--pipeline-step-complete-bg); border-color: var(--pipeline-step-complete-border); }
.pl-step.completed .pl-step-num { background: var(--pipeline-step-complete-border); color: var(--text-on-accent); }
.pl-step-label { font-size: var(--font-size-lg); color: var(--text-primary); font-weight: 500; }
.pl-step-check { margin-left: auto; color: var(--success); font-size: var(--font-size-xl); }
/* 右侧内容区 */
.pl-content-right { display: flex; flex-direction: column; flex: 1; padding: var(--space-8) var(--space-8) var(--space-10); overflow-y: auto; min-width: 0; }
#pl-step-2-content {
  min-width: 0;
  overflow-y: auto;
  overflow-x: hidden;
}
.pl-step-panel h3 { font-size: var(--font-size-xxl); margin-bottom: 20px; }
.pl-textarea { width: 100%; min-height: 400px; background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: var(--space-6); font-size: var(--font-size-lg); line-height: 1.8; resize: vertical; }
.pl-input { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: var(--space-3) var(--space-5); font-size: var(--font-size-md); height: var(--density-form-height); flex: 1; }
.pl-input-sm { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: var(--space-3) var(--space-5); font-size: var(--font-size-md); height: var(--density-form-height); }
.pl-attrs-input { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: var(--space-4) var(--space-6); font-size: var(--font-size-md); min-height: 80px; flex: 1; resize: vertical; }
.pl-vol-config { display: flex; align-items: center; gap: var(--space-5); margin-bottom: 20px; font-size: var(--font-size-lg); flex-wrap: wrap; }
.pl-vol-config label { color: var(--text-secondary); }
.pl-volume-linked-book-words { display: inline-flex; align-items: baseline; gap: var(--space-4); width: 100%; padding: var(--space-4) var(--space-5); border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-secondary); color: var(--text-secondary); }
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
  gap: var(--space-1);
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
  margin: var(--space-1) 0 0;
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
.pl-vol-header { display: flex; align-items: center; gap: var(--space-4); margin-bottom: 8px; }
.vol-words { font-size: var(--font-size-md); color: var(--text-muted); flex-shrink: 0; }
.pl-vol-outline { width: 100%; min-height: 100px; background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: var(--space-5); font-size: var(--font-size-md); resize: vertical; margin-bottom: 10px; }
.pl-volume-card-actions { display: flex; align-items: center; justify-content: flex-end; gap: var(--space-4); padding-top: 4px; }
.pl-ch-config { display: flex; align-items: center; gap: var(--space-5); margin-bottom: 20px; font-size: var(--font-size-lg); flex-wrap: wrap; }
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
  background: var(--bg-elevated);
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
  padding: 0 var(--space-4);
  border-radius: var(--radius-lg);
  font-size: var(--font-size-sm);
  white-space: nowrap;
}
.pl-ch-state-tag.locked { color: var(--success); background: var(--success-dim); }
.pl-ch-state-tag.editing { color: var(--text-muted); background: var(--hover-veil); }
.pl-ch-cell-ops {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
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
  background: var(--bg-elevated);
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
  height: var(--density-form-height);
  padding: 0 var(--space-5);
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: var(--font-size-md);
}
.pl-ch-detail-plot {
  width: 100%;
  min-height: 180px;
  padding: var(--space-5);
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: var(--font-size-md);
  line-height: 1.7;
  resize: vertical;
  font-family: var(--font-family-editor);
}
.pl-ch-detail-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--border-color);
  background: var(--bg-elevated);
}
.pl-ch-detail-hint { color: var(--text-muted); font-size: var(--font-size-sm); }
.pl-ch-detail-actions { display: flex; gap: var(--space-2); }
.ch-title { flex: 1; font-size: var(--font-size-md); color: var(--text-primary); }
.pl-body-config { display: flex; align-items: center; gap: var(--space-5); margin-bottom: 20px; font-size: var(--font-size-lg); flex-wrap: wrap; }
.pl-body-config label { color: var(--text-secondary); }
.pl-body-result { background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: var(--space-6); margin-bottom: 12px; max-height: 400px; overflow-y: auto; }
.pl-body-text { font-size: var(--font-size-lg); line-height: 1.8; white-space: pre-wrap; color: var(--text-primary); user-select: text; cursor: text; }
.pl-gen-options { display: flex; align-items: center; gap: var(--space-5); margin-bottom: 20px; font-size: var(--font-size-lg); color: var(--text-secondary); flex-wrap: wrap; }
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
.pl-result { background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: var(--space-7); margin: var(--space-7) 0; max-height: 450px; overflow-y: auto; white-space: pre-wrap; font-size: var(--font-size-lg); color: var(--text-primary); user-select: text; cursor: text; }
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
.input-w-60 { width: 60px; }
.input-w-80 { width: 80px; }

.pl-tools-title { font-size: var(--font-size-sm); font-weight: 600; color: var(--text-primary); margin-bottom: 6px; }
.pl-readonly { opacity: 0.7; cursor: default; }
.pl-step-tools { display: flex; flex-direction: column; gap: var(--space-4); margin-bottom: 14px; }
.pl-settings-tools { flex: 0 0 auto; }
.pl-settings-control-row {
  display: grid;
  grid-template-columns: auto minmax(170px, 1.1fr) auto minmax(130px, 0.9fr) 28px auto minmax(120px, 0.7fr);
  align-items: center;
  gap: var(--space-5);
  padding: var(--space-3) var(--space-4);
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
}
.pl-settings-control-row .pl-label,
.pl-settings-control-row .pl-mode-label { font-size: var(--font-size-md); color: var(--text-secondary); white-space: normal; overflow-wrap: anywhere; }
.pl-settings-control-row .select-standard { min-width: 0; height: var(--density-form-height); padding: 0 var(--space-5); background: var(--bg-input); border: 1px solid var(--border-color); border-radius: var(--radius-sm); color: var(--text-primary); font-size: var(--font-size-md); cursor: pointer; }
.pl-selected-skills-row {
  align-items: center;
  min-height: var(--density-form-height);
  padding: var(--space-2) var(--space-2);
  margin-bottom: 0;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
}
.pl-agent-mode-bar { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-4); padding: var(--space-4) var(--space-6); background: var(--bg-elevated); border: 1px solid var(--border-color); border-radius: var(--radius-md); }
.pl-agent-mode-bar .pl-label, .pl-agent-mode-bar .pl-mode-label { font-size: var(--font-size-md); color: var(--text-secondary); white-space: nowrap; }
.pl-agent-mode-bar .select-standard { height: var(--density-form-height); padding: 0 var(--space-5); background: var(--bg-input); border: 1px solid var(--border-color); border-radius: var(--radius-sm); color: var(--text-primary); font-size: var(--font-size-md); cursor: pointer; }
.pl-agent-select { flex: 1 1 160px; min-width: 160px; }
.pl-mode-select { flex: 1 1 150px; min-width: 150px; }
.pl-skill-bar { display: flex; align-items: center; gap: var(--space-4); padding: var(--space-4) var(--space-6); margin-bottom: 12px; background: var(--bg-elevated); border: 1px solid var(--border-color); border-radius: var(--radius-md); font-size: var(--font-size-md); color: var(--text-primary); }
.pl-skill-bar .pl-label { font-size: var(--font-size-md); color: var(--text-secondary); white-space: nowrap; }
.pl-skill-bar .select-standard { flex: 1; height: var(--density-form-height); padding: 0 var(--space-4); background: var(--bg-input); border: 1px solid var(--border-color); border-radius: var(--radius-sm); color: var(--text-primary); font-size: var(--font-size-md); cursor: pointer; min-width: 100px; }
.pl-skill-bar .btn-icon { height: var(--density-btn-xs-height); width: var(--density-btn-xs-height); padding: 0; font-size: var(--font-size-lg); line-height: 1; display: flex; align-items: center; justify-content: center; border: 1px solid var(--border-color); border-radius: var(--radius-xs); background: var(--bg-input); color: var(--text-primary); cursor: pointer; }
.pl-skill-bar .btn-icon:hover { background: var(--accent-dim); color: var(--accent); }
.pl-chip-close { height: var(--density-btn-xs-height); width: var(--density-btn-xs-height); padding: 0; font-size: var(--font-size-lg); line-height: 1; display: flex; align-items: center; justify-content: center; border: 1px solid var(--border-color); border-radius: var(--radius-xs); background: var(--bg-input); color: var(--text-primary); cursor: pointer; }
.pl-chip-close:hover { background: var(--accent-dim); color: var(--accent); }
.pl-tools-label { font-size: var(--font-size-sm); color: var(--text-muted); white-space: nowrap; }
.pl-skills-list { display: flex; flex-wrap: wrap; gap: var(--space-3); margin-bottom: 10px; min-height: 24px; }
.pl-skill-chip { padding: var(--space-1) var(--space-4); border-radius: var(--radius-lg); font-size: var(--font-size-xs); background: var(--accent-dim); color: var(--accent); border: 1px solid var(--accent-glow); display: inline-flex; align-items: center; gap: var(--space-2); }
.pl-skill-chip[draggable="true"] { cursor: grab; position: relative; }
.pl-skill-chip[draggable="true"]:active { cursor: grabbing; }
.pl-skill-chip.drag-over::before { content: ''; position: absolute; left: 0; top: -2px; width: 100%; height: 2px; background: var(--accent); border-radius: var(--radius-hairline); }
.pl-chip-seq { width: 18px; height: 18px; border-radius: 50%; background: var(--accent); color: var(--text-on-accent); font-size: var(--font-size-micro); font-weight: 700; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.pl-tools-section { padding: var(--space-3) 0; margin-bottom: 10px; border-bottom: 1px solid var(--border-color); }
.pl-tools-grid { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: center; }
.pl-tool-result { margin-top: 6px; padding: var(--space-3) var(--space-5); background: var(--bg-input); border: 1px solid var(--border-color); border-radius: var(--radius-sm); font-size: var(--font-size-sm); color: var(--text-primary); max-height: 180px; overflow-y: auto; user-select: text; cursor: text; }
.pl-tool-result .message-content { font-size: inherit; }
.pl-tool-loading { margin-top: 4px; font-size: var(--font-size-sm); color: var(--accent); }

.pl-chip-agent { height: 22px; padding: 0 var(--space-3); font-size: var(--font-size-micro); min-width: 60px; width: auto; border-radius: var(--radius-sm); background: var(--bg-input); border: 1px solid var(--border-color); color: var(--text-primary); cursor: pointer; }
.pl-add-setting-modal { width: min(var(--modal-width), 100%); max-height: var(--modal-max-height); min-height: 0; background: var(--bg-glass); border: 1px solid var(--border-color); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); overflow: hidden; }
.pl-add-setting-header { display: flex; align-items: center; justify-content: space-between; padding: var(--space-6) var(--space-7); border-bottom: 1px solid var(--border-color); font-size: var(--font-size-lg); font-weight: 600; }
.pl-add-setting-body { display: flex; flex-direction: column; gap: var(--space-4); padding: var(--space-7); }
.pl-add-setting-body label { font-size: var(--font-size-md); color: var(--text-secondary); }
.pl-add-setting-body .pl-input-sm { width: 100%; }
.pl-add-setting-body .pl-attrs-input { min-height: 140px; }
.pl-add-setting-footer { display: flex; justify-content: flex-end; gap: var(--space-5); padding: var(--space-5) var(--space-7); border-top: 1px solid var(--border-color); }
.pl-setting-detail-modal-footer { justify-content: space-between; }
.pl-setting-detail-modal-actions { display: flex; align-items: center; gap: var(--space-5); }
.pl-binding-import-card { width: min(520px, 100%); background: var(--bg-glass); border: 1px solid var(--border-color); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); padding: var(--space-7); display: flex; flex-direction: column; gap: var(--space-4); }
.pl-binding-import-card h3 { margin: 0; color: var(--text-primary); font-size: var(--font-size-lg); font-weight: 600; }
.pl-binding-import-card p { margin: 0; color: var(--text-secondary); font-size: var(--font-size-sm); line-height: 1.6; }
.pl-binding-import-source { color: var(--text-primary); font-weight: 600; word-break: break-all; }
.pl-binding-import-warnings { color: var(--danger); }
.pl-binding-import-card .pl-actions { justify-content: flex-end; display: flex; gap: var(--space-4); }


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
.pl-outline-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  min-width: 0;
  margin-bottom: var(--space-4);
  padding: var(--space-4) var(--space-6);
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
}
.pl-outline-info-main {
  flex: 1 1 auto;
  min-width: 0;
}
.pl-outline-info-title {
  margin-bottom: 4px;
  color: var(--text-primary);
  font-size: var(--font-size-md);
  font-weight: 600;
}
.pl-outline-info-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-5);
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
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
  min-height: var(--density-btn-sm-height);
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
.pl-sc-cat-delete { display: inline-flex; align-items: center; border: 0; background: transparent; color: var(--text-muted); cursor: pointer; flex-shrink: 0; }
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
  padding: var(--space-1) var(--space-2);
}
.pl-setting-info-btn { flex-shrink: 0; }
.pl-setting-item-index { position: absolute; left: 4px; top: 2px; color: var(--text-muted); font-size: var(--font-size-micro); }
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

@media (max-width: 1023px) {
  .pl-settings-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .pl-outline-info {
    align-items: stretch;
    flex-direction: column;
  }
  .pl-outline-info-main {
    flex: 0 0 auto;
  }
  .pl-outline-info .btn-sm {
    padding-inline: var(--space-1);
  }
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

