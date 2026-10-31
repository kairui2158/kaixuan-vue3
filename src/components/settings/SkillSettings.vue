<template>
  <div id="sbm-skill-list" class="skill-settings">
    <h3>技能管理</h3>
    <div class="skill-toolbar">
      <button id="btn-import-skills" class="btn-sm btn-secondary" :disabled="exchangeLoading" @click="importSkills">{{ exchangeLoading ? '读取中...' : '导入配置' }}</button>
      <button id="btn-import-folder-skill" class="btn-sm btn-secondary" :disabled="folderImporting" @click="importFolderSkill">{{ folderImporting ? '读取中...' : '导入文件夹技能' }}</button>
      <button id="btn-batch-import-folder-skills" class="btn-sm btn-secondary" :disabled="folderBatchImporting" @click="importFolderSkillBatch">{{ folderBatchImporting ? '读取中...' : '批量导入文件夹技能' }}</button>
      <button id="btn-import-skill-package" class="btn-sm btn-secondary" :disabled="packageLoading" @click="importSkillPackage">{{ packageLoading ? '读取中...' : '导入技能包' }}</button>
      <button id="btn-export-all-skills" class="btn-sm btn-secondary" :disabled="exchangeLoading || skillStore.skills.length === 0" @click="exportAll">导出 JSON</button>
      <span class="skill-toolbar-hint">支持 JSON / Markdown / 文件夹 / ZIP 技能包</span>
    </div>
    <div v-if="uiMessage" id="skill-ui-message" class="skill-ui-message">{{ uiMessage }}</div>
    <div class="skill-section">
      <h4>流水线技能 (按顺序执行)</h4>
      <div class="skill-pipeline-list">
        <div v-for="(id, i) in skillStore.pipelineSkills" :key="id" class="skill-pipeline-item">
          <span class="skill-idx">[{{ i + 1 }}]</span>
          <span class="skill-name">{{ getSkillName(id) }}</span>
          <button class="btn-sm btn-secondary" @click="skillStore.movePipelineSkillUp(i)" :disabled="i === 0">上移</button>
          <button class="btn-sm btn-secondary" @click="skillStore.movePipelineSkillDown(i)" :disabled="i === skillStore.pipelineSkills.length - 1">下移</button>
          <button class="btn-danger btn-sm" type="button" aria-label="移出流水线" @click="removeFromPipeline(i)"><AppIcon name="x" /></button>
        </div>
      </div>
    </div>
    <div class="skill-section">
      <h4>所有技能</h4>
      <div id="skill-list" class="skill-all-list">
       <div v-for="s in skillStore.skills" :key="s.id" class="skill-card">
          <div class="skill-card-header">
            <span class="skill-card-name">{{ s.name }}</span>
            <span class="skill-card-badge">{{ s.category === 'general' ? '通用' : s.category }}</span>
            <span v-if="s.format !== 'folder'" class="skill-card-badge">文本</span>
            <span v-if="s.format === 'folder'" class="skill-card-badge is-folder">文件夹</span>
            <span v-if="s.format === 'folder' && s.sourceId" class="skill-card-info">来源 ID：{{ s.sourceId }}</span>
            <span v-if="s.format === 'folder' && s.resourceSummary" class="skill-card-info">资源 {{ s.resourceSummary.resourceCount }} 个 / 警告 {{ s.resourceSummary.warningCount }} 条</span>
          </div>
          <div v-if="s.format === 'folder'" class="skill-folder-status" :class="{ 'is-invalid': !folderStatusMap[s.id]?.valid }">
            <span class="skill-folder-path" :data-tooltip="s.folderPath">{{ s.folderPath || '未记录路径' }}</span>
            <span class="skill-folder-state">{{ folderStatusMap[s.id]?.valid ? '路径有效' : '路径失效' }}</span>
            <button v-if="!folderStatusMap[s.id]?.valid" class="btn-sm btn-secondary" @click="reselectFolderSkill(s.id)">重新选择文件夹</button>
          </div>
          <div class="skill-card-body">
            <span class="skill-card-desc" v-if="s.format === 'folder'">{{ getFolderTemplatePreview(s.id) }}</span>
            <span class="skill-card-desc" v-else-if="s.template">{{ s.template.substring(0, 60) }}...</span>
            <span class="skill-card-desc" v-else>无模板内容</span>
          </div>
          <div class="skill-card-meta">
            <span class="skill-card-info">模式: {{ s.executionMode || 'chain' }}</span>
            <span class="skill-card-info">输出: {{ s.outputFormat || 'text' }}</span>
            <span
              v-for="capability in folderStatusMap[s.id]?.capabilities || []"
              :key="capability"
              class="skill-card-badge is-capability"
            >{{ capability }}</span>
          </div>
          <div v-if="s.format === 'folder'" class="skill-folder-boundary" :data-tooltip="getFolderBoundaryText(s)">
            <span class="skill-folder-boundary-label">执行边界：</span>
            <span>{{ getFolderBoundarySummary(s) }}</span>
          </div>
          <div class="skill-card-actions">
            <button v-if="s.format === 'folder'" class="btn-sm btn-secondary" @click="openFolderSkill(s.id)">打开文件夹</button>
            <button v-else class="btn-sm btn-secondary" @click="editSkill(s.id)">编辑</button>
            <button class="btn-sm btn-secondary" @click="openHealthReport(s.id)">体检</button>
            <button class="btn-sm btn-secondary" @click="addToPipeline(s.id)">加入流水线</button>
            <button v-if="s.format !== 'folder'" class="btn-sm btn-secondary" @click="exportSkill(s.id)">导出 MD</button>
            <button class="btn-sm btn-secondary" @click="exportSkillPackage(s.id)">导出 ZIP</button>
            <button class="btn-sm btn-secondary" @click="openVersionRollback(s.id)">版本回退</button>
            <button class="btn-sm btn-secondary" @click="openTest(s.id)">测试</button>
            <button class="btn-danger btn-sm" @click="skillStore.removeSkill(s.id)">删除</button>
          </div>
      </div>
      </div>
   </div>
   <div v-if="healthReportSkillId" data-modal-id="skill-health-report" class="modal-overlay modal-nested" :style="{ zIndex: modalQueue.getZIndex('skill-health-report') }" @click.self="closeHealthReport">
     <div class="skill-import-modal" role="dialog" aria-modal="true" aria-labelledby="skill-health-title">
       <div class="sem-header"><h4 id="skill-health-title">技能体检报告</h4><button type="button" aria-label="关闭技能体检报告" @click="closeHealthReport"><AppIcon name="x" /></button></div>
       <div class="sem-scroll">
         <div class="skill-import-summary">{{ getSkillName(healthReportSkillId) }}</div>
         <div class="skill-import-plan">
           <div v-if="!healthReport">正在读取技能文件...</div>
           <div v-else-if="healthReport.issues.length === 0" class="skill-import-diagnostic is-success">
             <strong>通过</strong><span>未发现异常。</span>
           </div>
           <div v-else v-for="issue in healthReport.issues" :key="issue.field + issue.message" class="skill-import-plan-item">
             <span :class="'is-' + issue.level">{{ levelLabel(issue.level) }}</span>
             <span class="skill-import-id">{{ issue.field }}</span>
             <span>{{ issue.message }}</span>
           </div>
         </div>
       </div>
       <div class="form-actions"><button class="btn-secondary" type="button" @click="closeHealthReport">关闭</button></div>
     </div>
   </div>
  <div v-if="versionRollbackSkillId" data-modal-id="skill-version-rollback" class="modal-overlay modal-nested" :style="{ zIndex: modalQueue.getZIndex('skill-version-rollback') }" @click.self="closeVersionRollback">
     <div class="skill-import-modal" role="dialog" aria-modal="true" aria-labelledby="skill-version-title">
       <div class="sem-header"><h4 id="skill-version-title">技能版本回退</h4><button type="button" aria-label="关闭技能版本回退" @click="closeVersionRollback"><AppIcon name="x" /></button></div>
       <div class="sem-scroll">
         <div class="skill-import-summary">{{ getSkillName(versionRollbackSkillId) }}</div>
         <div class="skill-import-plan">
           <div v-if="versionRollbackLoading">正在读取技能版本...</div>
           <div v-else-if="versionRollbackVersions.length === 0" class="skill-import-diagnostic is-warning">
             <strong>提示</strong><span>当前技能库中没有可回退的本地版本。</span>
           </div>
           <div v-else v-for="version in versionRollbackVersions" :key="version" class="skill-import-plan-item">
             <span :class="{ 'is-success': version === versionRollbackCurrent }">{{ version }}</span>
             <span>{{ version === versionRollbackCurrent ? '当前版本' : '本地版本' }}</span>
             <button v-if="version !== versionRollbackCurrent" class="btn-sm btn-primary" @click="applyVersionRollback(version)">回退到此版本</button>
           </div>
         </div>
        <div class="form-actions"><button class="btn-secondary" type="button" @click="closeVersionRollback">关闭</button></div>
       </div>
      </div>
    </div>
   <button id="btn-add-skill" class="btn-add" @click="addSkill">+ 新建技能</button>
  <div v-if="editingSkillId" data-modal-id="skill-edit" class="modal-overlay modal-nested" :style="{ zIndex: modalQueue.getZIndex('skill-edit') }" @click.self="cancelEdit">
     <div id="skill-form" class="skill-edit-modal">
       <div class="sem-header"><h4 id="skill-form-title">编辑技能</h4><button type="button" aria-label="关闭编辑技能" @click="cancelEdit"><AppIcon name="x" /></button></div>
       <div class="sem-scroll">
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
          <label>上下文策略</label>
          <div class="sf-context-policy">
            <select id="sf-context-history" v-model="editingContextHistory" class="sem-input">
              <option value="recent">最近对话</option>
              <option value="none">关闭历史</option>
              <option value="summary">摘要模式</option>
              <option value="full">完整历史</option>
            </select>
            <label class="sf-context-toggle"><input id="sf-context-outline" type="checkbox" v-model="editingContextOutline" />包含大纲</label>
            <label class="sf-context-toggle"><input id="sf-context-memory" type="checkbox" v-model="editingContextMemory" />包含记忆</label>
          </div>
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
              <button class="btn-danger btn-sm" type="button" aria-label="删除变量" @click="removeCustomVar(i)"><AppIcon name="x" /></button>
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
            <div id="sf-template-preview" ref="previewRef" class="sf-template-preview" v-html="renderMarkdown(editingTemplate)"></div>
          </div>
          <label>模板解析预览 (示例值)</label>
          <div id="sf-resolved-preview" class="sf-resolved-preview"><pre>{{ resolvedPreviewText || '(输入模板后点击刷新预览)' }}</pre></div>
          <button id="btn-refresh-preview" class="btn-sm btn-secondary" @click="refreshPreview">刷新解析预览</button>
         <label>执行模式</label>
         <select v-model="editingExecutionMode" class="sem-input">
           <option value="chain">串行链式</option>
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
   </div>
  <div v-if="importPreviewVisible" data-modal-id="skill-import-preview" class="modal-overlay modal-nested" :style="{ zIndex: modalQueue.getZIndex('skill-import-preview') }" @click.self="cancelImport">
     <div class="skill-import-modal" role="dialog" aria-modal="true" aria-labelledby="skill-import-title">
       <div class="sem-header"><h4 id="skill-import-title">导入预览</h4><button type="button" aria-label="关闭导入预览" @click="cancelImport"><AppIcon name="x" /></button></div>
       <div class="sem-scroll">
         <p class="skill-import-source" :data-tooltip="importSource">{{ importSource || '配置文件' }}</p>
         <div v-if="importSourceInfo" class="skill-import-origin" aria-label="导入来源与协议状态">
           <span class="skill-import-chip">来源：{{ formatSource(importSourceInfo) }}</span>
           <span class="skill-import-chip" :class="protocolClass(importSourceInfo)">
             {{ formatProtocol(importSourceInfo) }}
           </span>
         </div>
         <div v-if="importFieldTrace.length" class="skill-import-fields">
           <div class="skill-import-section-title">字段读取</div>
           <div v-for="trace in importFieldTrace" :key="trace.field" class="skill-import-field">
             <span class="skill-import-field-name">{{ trace.field }}</span>
             <span class="skill-import-field-origin">{{ formatOrigin(trace.origin) }}</span>
             <span v-if="trace.sourceField" class="skill-import-field-source">来自 {{ trace.sourceField }}</span>
           </div>
         </div>
         <div v-if="importDiagnostics.length" class="skill-import-diagnostics">
           <div class="skill-import-section-title">解析诊断</div>
           <div v-for="(diagnostic, index) in importDiagnostics" :key="diagnostic.code + '-' + index" class="skill-import-diagnostic" :class="'is-' + diagnostic.level">
             <strong>{{ formatDiagnosticLevel(diagnostic.level) }}</strong>
             <span>{{ diagnostic.message }}</span>
           </div>
         </div>
         <div v-if="importUnknownFields.length" class="skill-import-unknown">未识别字段：{{ importUnknownFields.join('、') }}</div>
         <div v-if="importIssues.length" class="skill-import-issues">
           <div v-for="(issue, index) in importIssues" :key="issue.field + '-' + index">{{ issue.field }}：{{ issue.message }}</div>
         </div>
         <div class="skill-import-summary">共 {{ importPlan.length }} 个配置，新增 {{ importAddCount }} 个，重复 {{ importConflictCount }} 个</div>
         <div class="skill-import-plan">
           <div v-for="item in importPlan" :key="item.id" class="skill-import-plan-item">
             <span>{{ item.name }}</span><span class="skill-import-id">{{ item.id }}</span><span :class="'is-' + item.action">{{ item.reason }}</span>
           </div>
           <p v-if="importPlan.length === 0">没有可导入的有效配置。</p>
         </div>
         <label class="skill-import-strategy"><span>重复配置处理</span><select v-model="importStrategy" class="sem-input" @change="refreshImportPlan"><option value="skip">跳过重复（推荐）</option><option value="overwrite">覆盖已有配置</option></select></label>
       </div>
       <div class="form-actions"><button class="btn-secondary" type="button" @click="cancelImport">取消</button><button class="btn-primary" type="button" :disabled="importPlan.length === 0 || exchangeLoading" @click="confirmImport">确认导入</button></div>
     </div>
   </div>
  <div v-if="folderBatchPreviewVisible" data-modal-id="skill-folder-batch-preview" class="modal-overlay modal-nested" :style="{ zIndex: modalQueue.getZIndex('skill-folder-batch-preview') }" @click.self="closeFolderBatchPreview">
     <div class="skill-import-modal" role="dialog" aria-modal="true" aria-labelledby="folder-batch-title">
       <div class="sem-header"><h4 id="folder-batch-title">批量导入文件夹技能</h4><button type="button" aria-label="关闭批量导入预览" @click="closeFolderBatchPreview"><AppIcon name="x" /></button></div>
       <div class="sem-scroll">
         <p class="skill-import-source" :data-tooltip="folderBatchRoot">{{ folderBatchRoot || '未选择根目录' }}</p>
         <div class="skill-import-summary">
           共扫描 {{ folderBatchItems.length }} 个候选文件夹，可导入 {{ folderBatchItems.filter(item => item.action === 'add' || item.action === 'overwrite').length }} 个
         </div>
         <div class="skill-import-plan">
           <div v-for="item in folderBatchItems" :key="item.folderPath" class="skill-import-plan-item">
             <span>{{ item.name }}</span>
             <span class="skill-import-id" :data-tooltip="item.folderPath">{{ item.id || item.folderName }}</span>
             <span v-if="item.valid">资源 {{ item.resourceCount || 0 }} 个 / 警告 {{ item.warnings?.length || 0 }} 条</span>
             <span :class="'is-' + item.action">{{ folderBatchActionText(item.action) }}</span>
           </div>
           <p v-if="folderBatchItems.length === 0">根目录下没有包含 SKILL.md 的一级子文件夹。</p>
         </div>
         <label class="skill-import-strategy">
           <span>重复技能处理</span>
           <select v-model="folderBatchStrategy" class="sem-input" @change="refreshFolderBatchPlan">
             <option value="skip">跳过重复（推荐）</option>
             <option value="overwrite">覆盖已有技能</option>
           </select>
         </label>
       </div>
       <div class="form-actions">
         <button class="btn-secondary" type="button" @click="closeFolderBatchPreview">取消</button>
         <button id="btn-confirm-folder-batch" class="btn-primary" type="button" :disabled="folderBatchImporting || folderBatchItems.length === 0" @click="confirmFolderBatchImport">
           {{ folderBatchImporting ? '导入中...' : '确认导入' }}
         </button>
       </div>
     </div>
   </div>
  <div v-if="folderImportPreviewVisible" data-modal-id="skill-folder-import-preview" class="modal-overlay modal-nested" :style="{ zIndex: modalQueue.getZIndex('skill-folder-import-preview') }" @click.self="closeFolderImportPreview">
     <div class="skill-import-modal" role="dialog" aria-modal="true" aria-labelledby="folder-import-title">
       <div class="sem-header"><h4 id="folder-import-title">导入文件夹技能</h4><button type="button" aria-label="关闭导入预览" @click="closeFolderImportPreview"><AppIcon name="x" /></button></div>
       <div class="sem-scroll">
         <p class="skill-import-source" :data-tooltip="folderImportPreview?.folderPath">{{ folderImportPreview?.folderPath || '未选择文件夹' }}</p>
         <div v-if="folderImportPreview" class="skill-import-summary">
           {{ folderImportPreview.name }} 将{{ folderImportPreview.action === 'add' ? '新增到技能库' : folderImportPreview.action === 'overwrite' ? '覆盖已有文件夹技能' : '按策略跳过' }}
         </div>
         <div v-if="folderImportPreview" class="skill-import-summary">
           资源 {{ folderImportPreview.resourceCount || 0 }} 个 / 警告 {{ folderImportPreview.warnings?.length || 0 }} 条
         </div>
         <div v-if="folderImportPreview" class="skill-import-plan">
           <div class="skill-import-plan-item">
             <span>{{ folderImportPreview.name }}</span>
             <span class="skill-import-id">{{ folderImportPreview.id }}</span>
             <span :class="'is-' + folderImportPreview.action">{{ folderImportPreview.message }}</span>
           </div>
         </div>
         <label class="skill-import-strategy">
           <span>重复技能处理</span>
           <select v-model="folderImportStrategy" class="sem-input" @change="refreshFolderImportPlan">
             <option value="skip">跳过重复（推荐）</option>
             <option value="overwrite">覆盖已有技能</option>
           </select>
         </label>
       </div>
       <div class="form-actions">
         <button class="btn-secondary" type="button" @click="closeFolderImportPreview">取消</button>
         <button id="btn-confirm-folder-import" class="btn-primary" type="button" :disabled="folderImporting || !folderImportPreview || folderImportPreview.action === 'skip'" @click="confirmFolderImport">
           {{ folderImporting ? '导入中...' : '确认导入' }}
         </button>
       </div>
     </div>
   </div>
  <div v-if="packagePreview" data-modal-id="skill-package-preview" class="modal-overlay modal-nested" :style="{ zIndex: modalQueue.getZIndex('skill-package-preview') }" @click.self="closePackagePreview">
     <div class="skill-import-modal" role="dialog" aria-modal="true" aria-labelledby="skill-package-title">
       <div class="sem-header"><h4 id="skill-package-title">技能包预览</h4><button type="button" aria-label="关闭技能包预览" @click="closePackagePreview"><AppIcon name="x" /></button></div>
       <div class="sem-scroll">
         <p class="skill-import-source" :data-tooltip="packagePreview.zipPath">{{ packagePreview.zipPath }}</p>
         <div class="skill-import-origin">
           <span class="skill-import-chip" :class="packagePreview.compatible ? 'is-compatible' : 'is-standard'">
             {{ packagePreview.compatible ? '兼容包：缺少 skill-package.json' : '标准技能包' }}
           </span>
           <span class="skill-import-chip">文件 {{ packagePreview.entries.length }} 个</span>
           <span class="skill-import-chip">大小 {{ formatPackageSize(packagePreview.totalBytes) }}</span>
         </div>
         <div v-if="packagePreview.compatible" class="skill-import-diagnostics">
           <div class="skill-import-diagnostic is-warning"><strong>警告</strong><span>该包没有版本声明和完整性清单，安装后无法参与版本管理与回滚。</span></div>
         </div>
         <div v-if="packageIssues.length" class="skill-import-issues">
           <div v-for="(issue, index) in packageIssues" :key="issue.field + '-' + index">{{ issue.field }}：{{ issue.message }}</div>
         </div>
         <div v-if="packageWarnings.length" class="skill-import-diagnostics">
           <div v-for="(warning, index) in packageWarnings" :key="warning.field + '-' + index" class="skill-import-diagnostic is-warning">
             <strong>警告</strong><span>{{ warning.field }}：{{ warning.message }}</span>
           </div>
         </div>
         <div class="skill-import-summary">
           {{ packagePreview.manifest ? `将安装：${packageInstallName} v${packageInstallVersion}` : '将按兼容包安装，版本记为 0.0.0' }}
         </div>
         <div class="skill-import-summary">安装策略：{{ packageActionLabel }}</div>
         <label v-if="packageInstallAction === 'downgrade' || packageInstallAction === 'same'" class="skill-import-strategy">
           <input v-model="packageInstallApproved" type="checkbox">
           <span>{{ packageInstallAction === 'downgrade' ? '我确认降级覆盖当前版本' : '我确认覆盖相同版本' }}</span>
         </label>
         <div class="skill-import-plan">
           <div v-for="file in packagePreview.entries" :key="file.path" class="skill-import-plan-item">
             <span>{{ file.path }}</span><span class="skill-import-id">{{ formatPackageSize(file.size) }}</span>
           </div>
           <p v-if="packagePreview.entries.length === 0">压缩包内没有可安装文件。</p>
         </div>
       </div>
       <div class="form-actions">
         <button class="btn-secondary" type="button" @click="closePackagePreview">取消</button>
         <button id="btn-confirm-skill-package" class="btn-primary" type="button" :disabled="packageInstalling || packagePreview.entries.length === 0 || packageIssues.length > 0" @click="confirmSkillPackage">
           {{ packageInstalling ? '安装中...' : '安装到技能库' }}
         </button>
       </div>
     </div>
   </div>
  <div v-if="testSkillId" data-modal-id="skill-test" class="modal-overlay modal-nested" :style="{ zIndex: modalQueue.getZIndex('skill-test') }" @click.self="closeTest">
     <div id="skill-test-modal" class="skill-edit-modal">
       <div class="sem-header"><h4 id="skill-test-title">技能测试: {{ getSkillName(testSkillId) }}</h4><button type="button" aria-label="关闭技能测试" @click="closeTest"><AppIcon name="x" /></button></div>
       <div class="sem-scroll">
         <label>测试文本</label>
         <textarea id="st-test-input" v-model="testText" class="sem-textarea sem-textarea-sm" placeholder="输入示例文本，用于验证技能输出"></textarea>
         <div v-if="testError" id="st-test-error" class="st-test-error">{{ testError }}</div>
         <div v-if="testResult" id="st-test-result" class="st-test-result">{{ testResult }}</div>
         <div v-if="folderTestReport" id="st-folder-report" class="st-folder-report">
           <RealSkillDiagnosticsPanel
             :status="folderTestReport.status"
             :diagnostics="folderTestReport.diagnostics"
             :request-messages="folderTestReport.requestMessages"
             :budget="folderTestReport.budget"
             :folder-package-cache="folderTestReport.folderPackageCache"
           />
           <div class="st-folder-report-row">
             <span class="st-folder-status" :class="`is-${folderTestReport.status}`">状态：{{ folderStatusText }}</span>
             <span>磁盘加载：{{ folderTestReport.folderPackageCache ? '使用 5 秒缓存' : '实时读取' }}</span>
             <span>API 预算：{{ folderTestReport.budget.used }}/{{ folderTestReport.budget.limit }}</span>
           </div>
           <div v-if="folderDiagnostics.length > 0" class="st-folder-diagnostics">
             <div v-for="(item, index) in folderDiagnostics" :key="`${item.code}-${index}`" class="st-folder-diagnostic" :class="`is-${item.type}`">
               {{ item.message }}
             </div>
           </div>
           <details class="st-folder-request">
             <summary>查看最终请求内容</summary>
             <div v-for="(message, index) in folderTestReport.requestMessages" :key="`request-${index}`" class="st-folder-request-message">
               <span>{{ message.role }}</span>
               <pre>{{ message.content }}</pre>
             </div>
             <p v-if="folderTestReport.requestMessages.length === 0">本次没有可展示的请求内容。</p>
           </details>
         </div>
         <div v-if="evalError" id="st-eval-error" class="st-test-error">{{ evalError }}</div>
         <div v-if="evalReport" id="st-eval-report" class="st-eval-report">
           <div class="st-eval-summary">
             <strong>{{ evalReport.skillName }} with/baseline 评测</strong>
             <span :class="evalReport.benchmark && evalReport.benchmark.withPassed >= evalReport.benchmark.baselinePassed ? 'is-pass' : 'is-fail'">
               技能 {{ evalReport.benchmark?.withPassed ?? 0 }}/{{ evalReport.benchmark?.total ?? 0 }} · 基线 {{ evalReport.benchmark?.baselinePassed ?? 0 }}/{{ evalReport.benchmark?.total ?? 0 }}
             </span>
             <span>通过率 {{ evalReport.benchmark?.withPassRate ?? 0 }}% / {{ evalReport.benchmark?.baselinePassRate ?? 0 }}%</span>
             <span>提升 {{ evalReport.benchmark?.improved ?? 0 }} · 持平 {{ evalReport.benchmark?.same ?? 0 }} · 退化 {{ evalReport.benchmark?.degraded ?? 0 }}</span>
           </div>
           <div v-for="item in evalReport.grading" :key="item.caseId" class="st-eval-case" :class="{ 'is-pass': item.withSkill.passed }">
             <div class="st-eval-case-head">
               <strong>{{ item.caseName }}</strong>
               <span>with：{{ item.withSkill.passed ? '通过' : '未通过' }}</span>
               <span>baseline：{{ item.baseline.passed ? '通过' : '未通过' }}</span>
               <span>{{ skillEffectText(item.skillEffect) }}</span>
             </div>
             <details>
               <summary>断言结果</summary>
               <div v-for="(assertion, index) in item.withSkill.assertions" :key="`${item.caseId}-assertion-${index}`" class="st-eval-assertion" :class="{ 'is-pass': assertion.pass }">
                 <span>{{ assertion.pass ? '通过' : '失败' }}</span>
                 <span>{{ assertion.type }}</span>
                 <span>{{ assertion.message }}</span>
               </div>
             </details>
             <details>
               <summary>with 输出</summary>
               <pre>{{ item.withSkill.output || '本次没有输出。' }}</pre>
             </details>
             <details>
               <summary>baseline 输出</summary>
               <pre>{{ item.baseline.output || '本次没有输出。' }}</pre>
             </details>
           </div>
         </div>
         <div class="form-actions">
           <button id="btn-run-skill-test" class="btn-primary" @click="runTest" :disabled="isTesting">{{ isTesting ? '测试中...' : '运行测试' }}</button>
         <button
           v-if="testSkill?.format === 'folder' && testSkill?.folderPath"
           id="btn-run-skill-eval"
           class="btn-secondary"
           type="button"
           :disabled="isEvaluating || isTesting"
           @click="runEval"
         >
           {{ isEvaluating ? '评测中...' : '运行评测' }}
         </button>
         <button class="btn-secondary" @click="closeTest">关闭</button>
         </div>
       </div>
     </div>
   </div>
  </div>

</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useModalQueue } from '../../composables/useModalQueue'
import { useSkillStore } from '../../stores/skill'
import { useSkillTest } from '../../composables/useSkillTest'
import { useConfigExchange } from '../../composables/useConfigExchange'
import { useSkillPackageInstall } from '../../composables/useSkillPackageInstall'
import { buildImportPlan } from '../../services/configExchange'
import { enhanceCodeBlocks, renderMarkdown as renderMarkdownService } from '../../utils/markdownService'
import { onMounted } from 'vue'
import type { ConfigDiagnostic, ConfigFieldTrace, ConfigIssue, ConfigSourceInfo, ImportPlanItem, ImportStrategy, SkillRecord } from '../../services/configExchange'
import type { FolderSkillStatus } from '../../services/realSkillLoader'
import { loadRealSkill } from '../../services/realSkillLoader'
import { formatFolderSkillBoundary, type FolderSkillBoundaryMode } from '../../services/folderSkillBoundary'
import { analyzeSkillHealth, type SkillHealthReport, type SkillHealthLevel } from '../../services/skillHealth'
import RealSkillDiagnosticsPanel from '../common/RealSkillDiagnosticsPanel.vue'
import {
  previewFolderSkill,
  refreshFolderSkillPlan,
  previewFolderSkillBatch,
  refreshFolderSkillBatchPlan,
  summarizeFolderSkillBatch,
  type FolderSkillBatchItem,
  type FolderSkillBatchResultItem,
  type FolderSkillBatchStrategy
} from '../../services/folderSkillBatchImport'
import {
  buildFolderSkillRecord,
  parseFolderSkillId
} from '../../services/folderSkillRecordFactory'

const skillStore = useSkillStore()
const modalQueue = useModalQueue()
const { testResult, isTesting, testError, folderTestReport, runSkillTest, evalReport, isEvaluating, evalError, runSkillEval } = useSkillTest()
const { exchangeLoading, importSkillsFromFile, applySkillImport, exportAllSkillsJSON, exportSkillMarkdown } = useConfigExchange()
const {
  packageLoading,
  packageInstalling,
  packagePreview,
   packageIssues,
   packageWarnings,
  packageMessage,
  packageInstallAction,
  packageInstallApproved,
  openPackagePreview,
  confirmPackageInstall,
  closePackagePreview,
} = useSkillPackageInstall()
const uiMessage = ref('')
const importPreviewVisible = ref(false)
const importPlan = ref<ImportPlanItem[]>([])
const pendingSkillRecords = ref<SkillRecord[]>([])
const importIssues = ref<ConfigIssue[]>([])
const importSource = ref('')
const importDiagnostics = ref<ConfigDiagnostic[]>([])
const importFieldTrace = ref<ConfigFieldTrace[]>([])
const importSourceInfo = ref<ConfigSourceInfo>()
const importUnknownFields = ref<string[]>([])
const importPipelineSkills = ref<string[]>([])
const importDeAiSkills = ref<string[]>([])
const importStrategy = ref<ImportStrategy>('skip')
const importAddCount = computed(() => importPlan.value.filter(item => item.action === 'add').length)
const importConflictCount = computed(() => importPlan.value.filter(item => item.action !== 'add').length)
const testSkillId = ref('')
const testText = ref('')
const testSkill = computed(() => testSkillId.value ? skillStore.getSkill(testSkillId.value) : null)
const folderDiagnostics = computed(() => folderTestReport.value?.diagnostics || [])
const folderStatusText = computed(() => {
  const status = folderTestReport.value?.status
  if (status === 'success') return '成功'
  if (status === 'degraded') return '降级完成'
  if (status === 'blocked') return '预算阻断'
  if (status === 'load-failed') return '磁盘加载失败'
  return '失败'
})
const folderImporting = ref(false)
const folderStatusMap = ref<Record<string, FolderSkillStatus>>({})
const folderImportPreviewVisible = ref(false)
const folderImportPreview = ref<FolderSkillBatchItem | null>(null)
const folderImportStrategy = ref<FolderSkillBatchStrategy>('skip')
const folderBatchImporting = ref(false)
const folderBatchPreviewVisible = ref(false)
const folderBatchRoot = ref('')
const folderBatchItems = ref<FolderSkillBatchItem[]>([])
const folderBatchStrategy = ref<FolderSkillBatchStrategy>('skip')
const healthReportSkillId = ref('')
const healthReport = ref<SkillHealthReport | null>(null)

// Verification bridge for responsive E2E; no runtime behavior depends on it.
;(globalThis as any).__skillSettingsState = {
  get skills() { return skillStore.skills },
  get healthReportSkillId() { return healthReportSkillId.value },
  set healthReportSkillId(value: string) { healthReportSkillId.value = value },
  get healthReport() { return healthReport.value },
  set healthReport(value: SkillHealthReport | null) { healthReport.value = value },
  get versionRollbackSkillId() { return versionRollbackSkillId.value },
  set versionRollbackSkillId(value: string) { versionRollbackSkillId.value = value },
  get versionRollbackLoading() { return versionRollbackLoading.value },
  set versionRollbackLoading(value: boolean) { versionRollbackLoading.value = value },
  get versionRollbackCurrent() { return versionRollbackCurrent.value },
  set versionRollbackCurrent(value: string) { versionRollbackCurrent.value = value },
  get versionRollbackVersions() { return versionRollbackVersions.value },
  set versionRollbackVersions(value: string[]) { versionRollbackVersions.value = value },
  get testSkillId() { return testSkillId.value },
  set testSkillId(value: string) { testSkillId.value = value },
  get testText() { return testText.value },
  set testText(value: string) { testText.value = value },
  get testError() { return testError.value },
  set testError(value: string) { testError.value = value },
  get testResult() { return testResult.value },
  set testResult(value: string) { testResult.value = value },
  get evalError() { return evalError.value },
  set evalError(value: string) { evalError.value = value },
  get evalReport() { return evalReport.value },
  set evalReport(value: any) { evalReport.value = value },
  get importSource() { return importSource.value },
  set importSource(value: string) { importSource.value = value },
  get importSourceInfo() { return importSourceInfo.value },
  set importSourceInfo(value: ConfigSourceInfo | undefined) { importSourceInfo.value = value },
  get importFieldTrace() { return importFieldTrace.value },
  set importFieldTrace(value: ConfigFieldTrace[]) { importFieldTrace.value = value },
  get importDiagnostics() { return importDiagnostics.value },
  set importDiagnostics(value: ConfigDiagnostic[]) { importDiagnostics.value = value },
  get importUnknownFields() { return importUnknownFields.value },
  set importUnknownFields(value: string[]) { importUnknownFields.value = value },
  get importIssues() { return importIssues.value },
  set importIssues(value: ConfigIssue[]) { importIssues.value = value },
  get importPlan() { return importPlan.value },
  set importPlan(value: ImportPlanItem[]) { importPlan.value = value },
  get importPreviewVisible() { return importPreviewVisible.value },
  set importPreviewVisible(value: boolean) { importPreviewVisible.value = value },
  get folderBatchRoot() { return folderBatchRoot.value },
  set folderBatchRoot(value: string) { folderBatchRoot.value = value },
  get folderBatchItems() { return folderBatchItems.value },
  set folderBatchItems(value: any[]) { folderBatchItems.value = value as any },
  get folderBatchPreviewVisible() { return folderBatchPreviewVisible.value },
  set folderBatchPreviewVisible(value: boolean) { folderBatchPreviewVisible.value = value },
  get folderImportPreview() { return folderImportPreview.value },
  set folderImportPreview(value: any) { folderImportPreview.value = value },
  get folderImportPreviewVisible() { return folderImportPreviewVisible.value },
  set folderImportPreviewVisible(value: boolean) { folderImportPreviewVisible.value = value },
  get packagePreview() { return packagePreview.value },
  set packagePreview(value: any) { packagePreview.value = value },
  get skillStore() { return skillStore }
}
const versionRollbackSkillId = ref('')
const versionRollbackVersions = ref<string[]>([])
const versionRollbackCurrent = ref('')
const versionRollbackLoading = ref(false)
const editingSkillId = ref('')
const editingName = ref('')
;(globalThis as any).__skillEditState = {
  get editingSkillId() { return editingSkillId.value },
  set editingSkillId(value: string) { editingSkillId.value = value },
  get editingName() { return editingName.value },
  set editingName(value: string) { editingName.value = value }
}

const modalVisibility = computed(() => ({
  'skill-health-report': Boolean(healthReportSkillId.value),
  'skill-version-rollback': Boolean(versionRollbackSkillId.value),
  'skill-edit': Boolean(editingSkillId.value),
  'skill-import-preview': importPreviewVisible.value,
  'skill-folder-batch-preview': folderBatchPreviewVisible.value,
  'skill-folder-import-preview': folderImportPreviewVisible.value,
  'skill-package-preview': Boolean(packagePreview.value),
  'skill-test': Boolean(testSkillId.value)
}))

watch(modalVisibility, visible => {
  for (const [id, isOpen] of Object.entries(visible)) {
    if (isOpen) modalQueue.open(id)
    else modalQueue.close(id)
  }
}, { immediate: true, deep: true })

const packageActionLabel = computed(() => {
  const labels: Record<typeof packageInstallAction.value, string> = {
    add: '新增技能',
    upgrade: '升级技能',
    downgrade: '降级技能，需要确认',
    same: '版本相同，需要确认',
    unknown: '当前记录未标注版本，导入时可选择覆盖',
  }
  return labels[packageInstallAction.value]
})

const packageInstallName = computed(() => String((packagePreview.value?.manifest as any)?.name || ''))
const packageInstallVersion = computed(() => String((packagePreview.value?.manifest as any)?.version || ''))

async function importSkillPackage() {
  const opened = await openPackagePreview()
  if (!opened) {
    showMessage(packageMessage.value || '技能包读取失败')
  }
}

async function confirmSkillPackage() {
  const message = await confirmPackageInstall()
  showMessage(message || packageMessage.value || '技能包安装失败')
  if (message) {
    closePackagePreview()
    await refreshFolderStatuses()
  }
}

function formatPackageSize(size: number) {
  if (size >= 1024 * 1024) return (size / 1024 / 1024).toFixed(1) + ' MB'
  if (size >= 1024) return (size / 1024).toFixed(1) + ' KB'
  return size + ' B'
}

function levelLabel(level: SkillHealthLevel) {
  if (level === 'error') return '错误'
  if (level === 'warning') return '警告'
  return '提示'
}

async function openHealthReport(id: string) {
  healthReportSkillId.value = id
  healthReport.value = null
  const skill = skillStore.getSkill(id)
  if (!skill) {
    healthReport.value = { skillId: id, healthy: false, issues: [{ level: 'error', field: 'skill', message: '技能记录不存在' }] }
    return
  }
  if (skill.format !== 'folder') {
    healthReport.value = analyzeSkillHealth({
      skillId: id,
      format: 'text',
      template: skill.template,
    })
    return
  }
  const loaded = await loadRealSkill(skill.folderPath || '')
  healthReport.value = analyzeSkillHealth({
    skillId: id,
    format: 'folder',
    folderPath: skill.folderPath,
    loadError: loaded.error || undefined,
    package: loaded.package,
    sourceId: skill.sourceId,
    version: skill.version,
  })
}

function closeHealthReport() {
  healthReportSkillId.value = ''
  healthReport.value = null
}

async function openVersionRollback(id: string) {
  const api = window.electronAPI as any
  if (!api?.skillPackageListVersions) {
    showMessage('当前运行环境不支持技能版本回退')
    return
  }
  const skill = skillStore.getSkill(id)
  if (!skill) {
    showMessage('技能记录不存在')
    return
  }
  versionRollbackSkillId.value = id
  versionRollbackVersions.value = []
  versionRollbackCurrent.value = skill.version || ''
  versionRollbackLoading.value = true
  try {
    const result = await api.skillPackageListVersions(parseFolderSkillId(id))
    if (!result?.ok) {
      showMessage(result?.message || '技能版本读取失败')
      return
    }
    versionRollbackVersions.value = (result.versions || []).slice().sort(compareVersions)
  } catch (error: any) {
    showMessage(error?.message || '技能版本读取异常')
  } finally {
    versionRollbackLoading.value = false
  }
}

function compareVersions(a: string, b: string) {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let index = 0; index < 3; index++) {
    if (pa[index] !== pb[index]) return (pb[index] || 0) - (pa[index] || 0)
  }
  return 0
}

function closeVersionRollback() {
  versionRollbackSkillId.value = ''
  versionRollbackVersions.value = []
  versionRollbackCurrent.value = ''
}

async function applyVersionRollback(version: string) {
  const id = versionRollbackSkillId.value
  if (!id || !version) return
  const api = window.electronAPI as any
  const skill = skillStore.getSkill(id)
  if (!skill) {
    showMessage('该技能不是本地包技能，无法回退')
    return
  }
  if (!api?.skillPackageResolveVersion) {
    showMessage('当前运行环境不支持技能版本定位')
    return
  }
  const resolved = await api.skillPackageResolveVersion(parseFolderSkillId(id), version)
  if (!resolved?.ok || !resolved.folderPath) {
    showMessage(resolved?.message || '目标版本定位失败')
    return
  }
  const loaded = await window.electronAPI.skillLoadFolder(resolved.folderPath)
  if (!loaded?.ok || !loaded.skill) {
    showMessage(loaded?.message || '目标版本读取失败')
    return
  }
  const record = buildFolderSkillRecord({ loaded })
  await skillStore.updateSkill(id, record)
  await refreshFolderStatuses()
  showMessage(`已回退到版本 ${version}`)
  closeVersionRollback()
}

async function exportSkillPackage(id: string) {
  const api = window.electronAPI as any
  if (!api?.skillPackageExport || !api?.dialogSaveFileAsync) {
    showMessage('当前运行环境不支持技能包导出')
    return
  }
  const skill = skillStore.getSkill(id)
  if (!skill) {
    showMessage('技能记录不存在')
    return
  }
  const targetPath = await api.dialogSaveFileAsync(`${skill.id || 'skill'}.zip`)
  if (!targetPath) return
  const result = await api.skillPackageExport(parseFolderSkillId(id), targetPath, skill.version || undefined)
  showMessage(result?.ok ? `技能包已导出：${targetPath}` : (result?.message || '技能包导出失败'))
}

function folderCapabilities(meta: Record<string, unknown> | undefined): FolderSkillStatus['capabilities'] {
  if (!meta) return []
  return [
    meta.executionMode === 'multi-pass' ? 'multi-pass' : null,
    meta.retryPolicy ? 'retry' : null,
    meta.dynamicTemplate ? 'dynamic template' : null,
    meta.smartSamples === true ? 'smart samples' : null
  ].filter(Boolean) as NonNullable<FolderSkillStatus['capabilities']>
}

function getFolderBoundaryMode(skill: SkillRecord): FolderSkillBoundaryMode {
  return (skill as any).meta?.executionMode === 'composite' ? 'composite' : 'chain'
}

function getFolderBoundaryText(skill: SkillRecord): string {
  return formatFolderSkillBoundary(getFolderBoundaryMode(skill))
}

function getFolderBoundarySummary(skill: SkillRecord): string {
  return formatFolderSkillBoundary(getFolderBoundaryMode(skill)).split('\n')[0]
}

function templatePreview(template: string | undefined): string {
  const text = (template || '').trim()
  if (!text) return '无模板内容'
  return text.length > 60 ? text.substring(0, 60) + '...' : text
}

function getFolderTemplatePreview(id: string): string {
  const skill = skillStore.getSkill(id)
  if (!skill) return '无模板内容'
  const preview = folderStatusMap.value[id]?.templatePreview
  if (preview === undefined) return '正在读取模板...'
  return preview
}

function showMessage(msg: string) {
  uiMessage.value = msg
  window.setTimeout(() => {
    if (uiMessage.value === msg) uiMessage.value = ''
  }, 5000)
}

async function importSkills() {
  const result = await importSkillsFromFile()
  if (!result) return
  importIssues.value = result.issues
  importSource.value = result.source
  importDiagnostics.value = result.diagnostics
  importFieldTrace.value = result.fieldTrace
  importSourceInfo.value = result.sourceInfo
  importUnknownFields.value = result.unknownFields
  if (!result.ok) {
    showMessage(result.issues.map(issue => issue.message).join('；') || '配置导入失败')
    return
  }
  pendingSkillRecords.value = result.records
  importPipelineSkills.value = result.pipelineSkills
  importDeAiSkills.value = result.deAiSkills
  importPlan.value = result.plan
  importStrategy.value = 'skip'
  importPreviewVisible.value = true
}

async function loadFolderSkill(folderPath: string, overwrite = false) {
  const loaded = await window.electronAPI.skillLoadFolder(folderPath)
  if (!loaded?.ok || !loaded.skill) {
    showMessage(loaded?.message || '文件夹技能读取失败')
    return false
  }

  const skill = loaded.skill
  const record = buildFolderSkillRecord({ loaded, folderPath })

  const result = await skillStore.importSkills([record], { strategy: overwrite ? 'overwrite' : 'skip' })
  const normalizedFolderId = skillStore.normalizeSkillId(record.id, 'folder')
  folderStatusMap.value[normalizedFolderId] = {
    valid: true,
    message: '路径有效',
    capabilities: folderCapabilities(skill.meta),
    templatePreview: templatePreview(skill.template)
  }
  showMessage(`文件夹技能导入完成：新增 ${result.added} 个，更新 ${result.updated} 个，跳过 ${result.skipped} 个`)
  return true
}

async function importFolderSkill() {
  folderImporting.value = true
  try {
    const folderPath = await window.electronAPI.dialogOpenDirectoryAsync?.()
    if (!folderPath) return
    const preview = await previewFolderSkill(
      folderPath,
      skillStore.skills.map(skill => skill.id),
      undefined,
      skillStore.skills
        .filter(skill => skill.format === 'folder')
        .map(skill => ({ id: skill.id, folderPath: skill.folderPath || '' }))
    )
    if (!preview.ok || !preview.item) {
      showMessage(preview.message)
      return
    }
    folderImportPreview.value = preview.item
    folderImportStrategy.value = 'skip'
    folderImportPreviewVisible.value = true
  } finally {
    folderImporting.value = false
  }
}

function refreshFolderImportPlan() {
  folderImportPreview.value = refreshFolderSkillPlan(folderImportPreview.value, folderImportStrategy.value)
}

function closeFolderImportPreview() {
  if (folderImporting.value) return
  folderImportPreviewVisible.value = false
  folderImportPreview.value = null
}

async function confirmFolderImport() {
  const preview = folderImportPreview.value
  if (!preview || !preview.valid) return
  folderImporting.value = true
  try {
    const imported = await loadFolderSkill(preview.folderPath, folderImportStrategy.value === 'overwrite')
    if (imported) {
      folderImportPreviewVisible.value = false
      folderImportPreview.value = null
    }
  } finally {
    folderImporting.value = false
  }
}

function folderBatchActionText(action: FolderSkillBatchItem['action']) {
  if (action === 'add') return '新增'
  if (action === 'overwrite') return '覆盖'
  if (action === 'skip') return '跳过重复'
  return `无效：${folderBatchItems.value.find(item => item.action === 'invalid')?.message || '结构不完整'}`
}

function refreshFolderBatchPlan() {
  folderBatchItems.value = refreshFolderSkillBatchPlan(folderBatchItems.value, folderBatchStrategy.value)
}

function closeFolderBatchPreview() {
  if (folderBatchImporting.value) return
  folderBatchPreviewVisible.value = false
  folderBatchItems.value = []
  folderBatchRoot.value = ''
}

async function importFolderSkillBatch() {
  folderBatchImporting.value = true
  try {
    const rootPath = await window.electronAPI.dialogOpenDirectoryAsync?.()
    if (!rootPath) return
    const preview = await previewFolderSkillBatch(
      rootPath,
      skillStore.skills.map(skill => skill.id),
      undefined,
      skillStore.skills
        .filter(skill => skill.format === 'folder')
        .map(skill => ({ id: skill.id, folderPath: skill.folderPath || '' }))
    )
    if (!preview.ok) {
      showMessage(preview.message)
      return
    }
    folderBatchRoot.value = rootPath
    folderBatchItems.value = preview.items
    folderBatchStrategy.value = 'skip'
    folderBatchPreviewVisible.value = true
  } finally {
    folderBatchImporting.value = false
  }
}

async function confirmFolderBatchImport() {
  folderBatchImporting.value = true
  const results: FolderSkillBatchResultItem[] = []
  try {
    for (const item of folderBatchItems.value) {
      if (!item.valid) {
        results.push({ ...item, status: 'failed', message: item.message })
        continue
      }
      if (item.action === 'skip') {
        results.push({ ...item, status: 'skipped', message: '已存在，按策略跳过' })
        continue
      }
      const loaded = await window.electronAPI.skillLoadFolder(item.folderPath)
      if (!loaded?.ok || !loaded.skill) {
        results.push({ ...item, status: 'failed', message: loaded?.message || '读取失败' })
        continue
      }
      const skill = loaded.skill
      const record = buildFolderSkillRecord({ loaded, folderPath: item.folderPath })
      const result = await skillStore.importSkills([record], { strategy: item.action === 'overwrite' ? 'overwrite' : 'skip' })
      folderStatusMap.value[skillStore.normalizeSkillId(record.id, 'folder')] = {
        valid: true,
        message: '路径有效',
        capabilities: folderCapabilities(skill.meta),
        templatePreview: templatePreview(skill.template)
      }
      results.push({
        ...item,
        status: 'success',
        message: result.updated > 0 ? '已存在并覆盖' : '新增成功'
      })
    }
    const summary = summarizeFolderSkillBatch(results)
    const failureText = results
      .filter(result => result.status === 'failed')
      .map(result => `${result.name}：${result.message}`)
      .join('；')
    showMessage(`批量导入完成：新增 ${summary.added} 个，覆盖 ${summary.updated} 个，跳过 ${summary.skipped} 个，失败 ${summary.failed} 个${failureText ? `。失败项：${failureText}` : ''}`)
    folderBatchPreviewVisible.value = false
    folderBatchItems.value = []
    folderBatchRoot.value = ''
  } finally {
    folderBatchImporting.value = false
  }
}

async function reselectFolderSkill(id: string) {
  const current = skillStore.getSkill(id)
  if (!current) return
  folderImporting.value = true
  try {
    const folderPath = await window.electronAPI.dialogOpenDirectoryAsync?.()
    if (!folderPath) return
    const loaded = await window.electronAPI.skillLoadFolder(folderPath)
    if (!loaded?.ok) {
      showMessage(loaded?.message || '重新选择的路径无效')
      return
    }
    const record = buildFolderSkillRecord({ loaded, folderPath })
    await skillStore.updateSkill(id, record)
    folderStatusMap.value[id] = {
      valid: true,
      message: '路径有效',
      capabilities: folderCapabilities(loaded.skill.meta),
      templatePreview: templatePreview(loaded.skill.template)
    }
    showMessage('文件夹路径已恢复')
  } finally {
    folderImporting.value = false
  }
}

async function openFolderSkill(id: string) {
  const api = window.electronAPI as any
  if (!api?.skillOpenFolder) {
    showMessage('当前运行环境不支持打开文件夹')
    return
  }
  const skill = skillStore.getSkill(id)
  if (!skill) {
    showMessage('技能记录不存在')
    return
  }
  if (!skill.folderPath) {
    showMessage('该技能未记录文件夹路径')
    return
  }
  const result = await api.skillOpenFolder(skill.folderPath)
  if (!result?.ok) {
    showMessage(result?.message || '打开文件夹失败')
  }
}

async function confirmImport() {
  const result = await applySkillImport(pendingSkillRecords.value, importPipelineSkills.value, importDeAiSkills.value, importStrategy.value)
  importPreviewVisible.value = false
  showMessage(`导入完成：新增 ${result.added} 个，更新 ${result.updated} 个，跳过 ${result.skipped} 个`)
  pendingSkillRecords.value = []
  importPlan.value = []
}

function cancelImport() {
  importPreviewVisible.value = false
  pendingSkillRecords.value = []
  importPlan.value = []
  importIssues.value = []
  importSource.value = ''
  importDiagnostics.value = []
  importFieldTrace.value = []
  importSourceInfo.value = undefined
  importUnknownFields.value = []
}

function formatSource(source: ConfigSourceInfo) {
  if (source.format === 'json') return 'JSON'
  return source.fileName ? `Markdown（${source.fileName}）` : 'Markdown'
}

function formatProtocol(source: ConfigSourceInfo) {
  if (source.format === 'json') return '标准 JSON'
  return source.markdownKind === 'front-matter' ? '标准协议 Markdown' : '兼容解析 Markdown'
}

function protocolClass(source: ConfigSourceInfo) {
  if (source.format === 'json') return 'is-standard'
  return source.markdownKind === 'front-matter' ? 'is-standard' : 'is-compatible'
}

function formatOrigin(origin: ConfigFieldTrace['origin']) {
  return { source: '原字段', mapped: '别名映射', inferred: '规则推导', defaulted: '默认值' }[origin]
}

function formatDiagnosticLevel(level: ConfigDiagnostic['level']) {
  return { info: '提示', warning: '警告', error: '错误' }[level]
}

function refreshImportPlan() {
  importPlan.value = buildImportPlan(skillStore.skills.map(s => s.id), pendingSkillRecords.value, importStrategy.value)
}

async function exportSkill(id: string) {
  const s = skillStore.getSkill(id)
  if (!s) return
  const ok = await exportSkillMarkdown(id)
  showMessage(ok ? '导出成功' : '导出失败或已取消')
}

async function exportAll() {
  if (skillStore.skills.length === 0) {
    showMessage('暂无技能可导出')
    return
  }
  const ok = await exportAllSkillsJSON()
  showMessage(ok ? '导出成功' : '导出失败或已取消')
}

function openTest(id: string) {
  testSkillId.value = id
  testText.value = '这是一段测试文本，用于验证技能的输出效果。'
  testResult.value = ''
  testError.value = ''
  evalReport.value = null
  evalError.value = ''
}

function runTest() {
  if (!testSkillId.value) return
  runSkillTest(testSkillId.value, testText.value).then(() => {})
}

function runEval() {
  if (!testSkillId.value) return
  runSkillEval(testSkillId.value).then(() => {})
}

function skillEffectText(effect: string) {
  const labels: Record<string, string> = {
    improved: '技能提升',
    same: '结果持平',
    degraded: '技能退化',
    indeterminate: '无法判定'
  }
  return labels[effect] || effect
}

function closeTest() {
  testSkillId.value = ''
}

function getSkillName(id: string) {
  const skill = skillStore.skills.find(s => s.id === id)
  return skill ? skillStore.displaySkillName(skill) : id
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
  editingContextHistory.value = 'recent';
  editingContextOutline.value = true;
  editingContextMemory.value = true;
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

const editingTemplate = ref('')
const editingCategory = ref('general')
const editingDescription = ref('')
const editingExecutionMode = ref('chain')
const editingOutputFormat = ref('text')
const editingInjectMode = ref('system_prefix')
const editingInjectFrequency = ref('every')
const editingInjectDepth = ref(0)
const editingContextHistory = ref<'none' | 'recent' | 'summary' | 'full'>('recent')
const editingContextOutline = ref(true)
const editingContextMemory = ref(true)
const editingBindTarget = ref('project')
const editingLinkedSkillIds = ref<string[]>([])
const editingBindId = ref('')
const bindTargetOptions = ref<{ id: string, name: string }[]>([])
const editingCustomVars = ref<{ key: string, value: string }[]>([])
const resolvedPreviewText = ref('')
const previewRef = ref<HTMLElement | null>(null)

watch(editingTemplate, async () => {
  await nextTick()
  await enhanceCodeBlocks(previewRef.value)
}, { immediate: true })

async function refreshFolderStatuses() {
  const folderSkills = skillStore.skills.filter(skill => skill.format === 'folder')
  for (const skill of folderSkills) {
    if (!skill.folderPath) {
      folderStatusMap.value[skill.id] = { valid: false, message: '未记录路径' }
      continue
    }
    const loaded = await window.electronAPI?.skillLoadFolder?.(skill.folderPath)
    folderStatusMap.value[skill.id] = loaded?.ok
      ? {
          valid: true,
          message: '路径有效',
          capabilities: folderCapabilities(loaded.skill?.meta),
          templatePreview: templatePreview(loaded.skill?.template)
        }
      : { valid: false, message: loaded?.message || '路径失效', templatePreview: '无模板内容' }
  }
}

onMounted(refreshFolderStatuses)

const availableVars = [
  'selectedText', 'outlineContent', 'chapterSummary',
  'prevChapterSummary', 'characters', 'chapterTitle', 'novelTitle'
]

function insertVar(varName: string) {
  editingTemplate.value += '{{' + varName + '}}'
}

function renderMarkdown(text: string): string {
  return renderMarkdownService(text)
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
  editingContextHistory.value = s.contextPolicy?.chatHistory || 'recent'
  editingContextOutline.value = s.contextPolicy?.includeOutline ?? true
  editingContextMemory.value = s.contextPolicy?.includeMemory ?? true
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
    contextPolicy: {
      chatHistory: editingContextHistory.value,
      includeOutline: editingContextOutline.value,
      includeMemory: editingContextMemory.value
    },
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
.skill-pipeline-list { display: flex; flex-direction: column; gap: var(--space-3); }
.skill-all-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: var(--space-5); }
.skill-pipeline-item, .skill-card {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-5);
  background: var(--bg-tertiary);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
}
.skill-card {
  flex-direction: column;
  align-items: stretch;
  padding: var(--space-6);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  transition: transform var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard);
}
.skill-card:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
  border-color: var(--accent);
}
.skill-card-header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-4);
  margin-bottom: 4px;
  min-width: 0;
}
.skill-card-name { min-width: 0; max-width: 100%; font-weight: 600; font-size: var(--font-size-lg); color: var(--text-primary); flex: 1 1 180px; overflow-wrap: anywhere; word-break: break-word; }
.skill-card-badge {
  font-size: var(--font-size-sm);
  color: var(--accent-lighter);
  background: var(--accent-dim);
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-pill);
  font-weight: 500;
}
.skill-card-badge.is-folder { color: var(--accent); border-color: var(--accent); }
.skill-folder-status {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: var(--space-3);
  align-items: center;
  margin-bottom: var(--space-3);
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xs);
  background: var(--bg-tertiary);
  font-size: var(--font-size-sm);
}
.skill-folder-status.is-invalid { border-color: var(--danger); }
.skill-folder-path { min-width: 0; color: var(--text-secondary); overflow-wrap: anywhere; word-break: break-word; }
.skill-folder-state { color: var(--text-muted); white-space: nowrap; }
.skill-folder-boundary {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  overflow-wrap: anywhere;
}
.skill-folder-boundary-label { color: var(--text-muted); white-space: nowrap; }
.skill-card-body { margin-bottom: 4px; min-width: 0; }
.skill-card-desc { min-width: 0; max-width: 100%; font-size: var(--font-size-md); color: var(--text-muted); line-height: 1.5; overflow-wrap: anywhere; word-break: break-word; }
.skill-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-5);
  margin-bottom: 6px;
  min-width: 0;
}
.skill-card-info { min-width: 0; max-width: 100%; font-size: var(--font-size-sm); color: var(--text-muted); overflow-wrap: anywhere; word-break: break-word; }
.skill-card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
  min-width: 0;
}
.skill-idx { color: var(--accent); font-weight: 600; min-width: 24px; }
.skill-name { flex: 1 1 160px; min-width: 0; color: var(--text-primary); overflow-wrap: anywhere; word-break: break-word; }
.skill-cat { min-width: 0; max-width: 100%; color: var(--text-muted); font-size: var(--font-size-md); overflow-wrap: anywhere; word-break: break-word; }
.btn-add { background: var(--accent); color: var(--text-on-accent); border: none; border-radius: var(--radius-sm); padding: var(--space-4); cursor: pointer; font-size: var(--font-size-md); }
.skill-toolbar { display: flex; gap: var(--space-4); margin-bottom: 12px; }
.skill-toolbar { align-items: center; flex-wrap: wrap; }
.skill-toolbar-hint { color: var(--text-muted); font-size: var(--font-size-sm); }
.skill-ui-message { margin-bottom: 12px; padding: var(--space-4) var(--space-5); border-radius: var(--radius-sm); background: var(--accent-dim); border: 1px solid var(--border-color); font-size: var(--font-size-md); color: var(--text-primary); }
.st-test-error { margin-top: 10px; padding: var(--space-4) var(--space-5); border-radius: var(--radius-sm); background: var(--diagnostic-error-bg); color: var(--danger); font-size: var(--font-size-md); }
.st-test-result { margin-top: 10px; padding: var(--space-5); border-radius: var(--radius-sm); background: var(--bg-tertiary); border: 1px solid var(--border-color); font-size: var(--font-size-md); line-height: 1.7; white-space: pre-wrap; color: var(--text-primary); max-height: 240px; overflow-y: auto; }
.st-folder-report { margin-top: 10px; padding: var(--space-4); border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-elevated); display: flex; flex-direction: column; gap: var(--space-3); }
.st-folder-report-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); font-size: var(--font-size-sm); color: var(--text-secondary); }
.st-folder-status { font-weight: 600; color: var(--text-primary); }
.st-folder-status.is-success { color: var(--success); }
.st-folder-status.is-degraded { color: var(--warning); }
.st-folder-status.is-blocked, .st-folder-status.is-failed, .st-folder-status.is-load-failed { color: var(--danger); }
.st-folder-diagnostics { display: flex; flex-direction: column; gap: var(--space-2); max-height: 150px; overflow-y: auto; }
.st-folder-diagnostic { padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm); background: var(--bg-tertiary); color: var(--text-secondary); font-size: var(--font-size-sm); line-height: 1.5; overflow-wrap: anywhere; }
.st-folder-diagnostic.is-warning { background: var(--warning-dim); color: var(--warning); }
.st-folder-diagnostic.is-error { background: var(--diagnostic-error-bg); color: var(--danger); }
.st-folder-request summary { cursor: pointer; color: var(--text-secondary); font-size: var(--font-size-sm); }
.st-folder-request-message { margin-top: var(--space-2); }
.st-folder-request-message span { display: block; margin-bottom: var(--space-1); color: var(--text-secondary); font-size: var(--font-size-sm); }
.st-folder-request-message pre { margin: 0; padding: var(--space-3); border-radius: var(--radius-sm); background: var(--bg-tertiary); color: var(--text-primary); font-size: var(--font-size-sm); line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 160px; overflow-y: auto; }
.st-eval-report { margin-top: 10px; padding: var(--space-4); border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-elevated); display: flex; flex-direction: column; gap: var(--space-3); }
.st-eval-summary { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); font-size: var(--font-size-sm); color: var(--text-secondary); }
.st-eval-summary strong { color: var(--text-primary); }
.st-eval-summary .is-pass { color: var(--success); font-weight: 600; }
.st-eval-summary .is-fail { color: var(--danger); font-weight: 600; }
.st-eval-case { padding: var(--space-3); border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-tertiary); display: flex; flex-direction: column; gap: var(--space-2); }
.st-eval-case.is-pass { border-color: var(--success); }
.st-eval-case-head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); font-size: var(--font-size-sm); color: var(--text-secondary); }
.st-eval-case-head strong { color: var(--text-primary); }
.st-eval-assertion { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); font-size: var(--font-size-sm); color: var(--text-secondary); }
.st-eval-assertion.is-pass span:first-child { color: var(--success); font-weight: 600; }
.st-eval-assertion:not(.is-pass) span:first-child { color: var(--danger); font-weight: 600; }
.st-eval-case pre { margin: 0; padding: var(--space-3); border-radius: var(--radius-sm); background: var(--bg-elevated); color: var(--text-primary); font-size: var(--font-size-sm); line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 180px; overflow-y: auto; }
.skill-edit-modal { position: relative; z-index: var(--z-modal-nested-content); width: min(var(--modal-width-lg), 100%); max-height: var(--modal-max-height); min-height: 0; background: var(--bg-glass); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: var(--modal-padding); display: flex; flex-direction: column; gap: var(--space-4); overflow: hidden; }
.sem-header { display: flex; justify-content: space-between; align-items: center; gap: var(--space-4); font-size: var(--font-size-lg); font-weight: 600; margin-bottom: 8px; flex-shrink: 0; min-width: 0; }
.sem-header h4 { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.sem-header button { flex-shrink: 0; }
.sem-scroll { flex: 1 1 auto; min-height: 0; min-width: 0; overflow-y: auto; padding-right: var(--space-2); display: flex; flex-direction: column; gap: var(--space-4); }
.sem-header button { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: var(--font-size-xl); }
.sem-input { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: var(--space-3) var(--space-5); font-size: var(--font-size-md); }
.sem-textarea { min-height: 300px; background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: var(--space-4) var(--space-5); font-size: var(--font-size-md); resize: vertical; font-family: var(--font-family-mono); }
.sem-textarea-sm { min-height: 120px; }
.sem-btn { background: var(--accent); color: var(--text-on-accent); border: none; border-radius: var(--radius-sm); padding: var(--space-4) var(--space-8); cursor: pointer; font-size: var(--font-size-md); margin-top: 8px; }
.skill-import-modal { width: min(680px, 100%); max-width: 100%; min-width: 0; max-height: var(--modal-max-height); overflow: hidden; background: var(--bg-glass); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: var(--modal-padding); color: var(--text-primary); box-shadow: var(--shadow-lg); display: flex; flex-direction: column; }
.skill-import-source { margin: 0 0 var(--space-5); color: var(--text-muted); font-size: var(--font-size-sm); overflow-wrap: anywhere; }
.skill-import-origin { display: flex; flex-wrap: wrap; gap: var(--space-3); margin: -var(--space-2) 0 var(--space-5); min-width: 0; }
.skill-import-chip { min-width: 0; max-width: 100%; padding: var(--space-2) var(--space-4); border: 1px solid var(--border-color); border-radius: var(--radius-xs); color: var(--text-secondary); background: var(--bg-tertiary); font-size: var(--font-size-sm); overflow-wrap: anywhere; }
.skill-import-chip.is-standard { border-color: var(--success); color: var(--success); }
.skill-import-chip.is-compatible { border-color: var(--warning); color: var(--warning); }
.skill-import-section-title { margin-bottom: 6px; color: var(--text-secondary); font-size: var(--font-size-sm); font-weight: 600; }
.skill-import-fields { display: grid; gap: var(--space-2); margin-bottom: 12px; padding: var(--space-4) var(--space-5); border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-tertiary); }
.skill-import-field { display: grid; grid-template-columns: minmax(90px, 0.8fr) minmax(70px, 0.55fr) minmax(0, 1.4fr); gap: var(--space-4); min-width: 0; font-size: var(--font-size-sm); }
.skill-import-field > * { min-width: 0; overflow-wrap: anywhere; word-break: break-word; }
.skill-import-field-name { color: var(--text-primary); }
.skill-import-field-origin { color: var(--accent); }
.skill-import-field-source { color: var(--text-muted); }
.skill-import-diagnostics { display: grid; gap: var(--space-2); margin-bottom: 12px; }
.skill-import-diagnostic { display: flex; gap: var(--space-3); min-width: 0; padding: var(--space-3) var(--space-4); border-left: 3px solid var(--border-color); background: var(--bg-tertiary); font-size: var(--font-size-sm); overflow-wrap: anywhere; }
.skill-import-diagnostic span { min-width: 0; overflow-wrap: anywhere; word-break: break-word; }
.skill-import-diagnostic.is-info { border-color: var(--accent); }
.skill-import-diagnostic.is-warning { border-color: var(--warning); }
.skill-import-diagnostic.is-error { border-color: var(--danger); }
.skill-import-unknown { margin-bottom: 12px; padding: var(--space-4) var(--space-5); border: 1px solid var(--warning); border-radius: var(--radius-sm); color: var(--warning); background: var(--bg-tertiary); font-size: var(--font-size-sm); overflow-wrap: anywhere; }
.skill-import-issues { display: grid; gap: var(--space-3); margin-bottom: 12px; padding: var(--space-4) var(--space-5); border: 1px solid var(--danger); border-radius: var(--radius-sm); background: var(--diagnostic-error-bg); }
.skill-import-summary { margin-bottom: 8px; color: var(--text-secondary); font-size: var(--font-size-md); }
.skill-import-plan { display: grid; gap: var(--space-3); max-height: 260px; overflow-y: auto; padding: var(--space-4); border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-input); }
.skill-import-plan-item { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 0.8fr) minmax(0, auto); align-items: center; gap: var(--space-4); min-width: 0; padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--border-color); }
.skill-import-plan-item:last-child { border-bottom: 0; }
.skill-import-plan-item > * { min-width: 0; overflow-wrap: anywhere; }
.skill-import-id { color: var(--text-muted); font-family: var(--font-family-mono); font-size: var(--font-size-sm); }
.skill-import-plan-item .is-add { color: var(--success); }
.skill-import-plan-item .is-update { color: var(--warning); }
.skill-import-plan-item .is-skip { color: var(--text-muted); }
.skill-import-strategy { display: grid; grid-template-columns: minmax(0, 120px) minmax(0, 1fr); align-items: center; gap: var(--space-4); margin-top: 12px; min-width: 0; }
.skill-import-strategy select { width: 100%; min-width: 0; }
@media (max-width: 600px) {
  .skill-import-plan-item { grid-template-columns: 1fr; gap: var(--space-3); }
  .skill-import-strategy { grid-template-columns: 1fr; }
  .skill-import-field { grid-template-columns: 1fr; gap: var(--space-1); }
}

/* === 联动技能列表 === */
.sf-linked-list { display: flex; flex-direction: column; gap: var(--space-2); max-height: 120px; overflow-y: auto; padding: var(--space-4); background: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-color); }
.sf-linked-item { display: flex; align-items: center; gap: var(--space-3); font-size: var(--font-size-md); color: var(--text-primary); cursor: pointer; }
.sf-linked-item input[type=checkbox] { margin: 0; cursor: pointer; }

/* === 自定义变量 === */
.sf-custom-vars { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-4); background: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-color); }
.sf-custom-var-row { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: center; min-width: 0; }
.sf-cv-key { flex: 1; min-width: 0; font-family: var(--font-family-mono); }
.sf-cv-value { flex: 2; min-width: 0; }

/* === 模板解析预览 === */
.sf-resolved-preview { padding: var(--space-4) var(--space-5); border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-input); color: var(--text-primary); font-size: var(--font-size-md); max-height: 220px; overflow-y: auto; margin-bottom: 4px; }
.sf-resolved-preview pre { margin: 0; white-space: pre-wrap; word-break: break-word; font-family: var(--font-family-mono); line-height: 1.6; }

/* === 变量详情 === */
.var-details { margin: var(--space-4) 0; padding: var(--space-4) var(--space-5); background: var(--accent-dim); border: 1px solid var(--border-color); border-radius: var(--radius-sm); font-size: var(--font-size-md); color: var(--text-secondary); }
.var-details summary { cursor: pointer; margin-bottom: 4px; font-weight: 500; }
.var-tags { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: 4px; }
.btn-var { display: inline-block; padding: var(--space-3) var(--space-4); background: var(--bg-elevated); border: 1px solid var(--border-color); border-radius: var(--radius-xs); font-size: var(--font-size-sm); color: var(--text-primary); cursor: pointer; font-family: var(--font-family-mono); }
.btn-var:hover { border-color: var(--accent); color: var(--accent); }

/* === 双栏模板编辑器 === */
.sf-template-wrapper { display: flex; gap: var(--space-4); min-height: 280px; }
.sf-template-input { flex: 1; min-width: 0; padding: var(--space-4) var(--space-5); border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-input); color: var(--text-primary); font-size: var(--font-size-md); font-family: var(--font-family-mono); resize: vertical; line-height: 1.6; }
.sf-template-preview { flex: 1; min-width: 0; padding: var(--space-4) var(--space-5); border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-tertiary); color: var(--text-primary); font-size: var(--font-size-md); overflow-y: auto; max-height: 350px; line-height: 1.6; }
.sf-template-preview:empty::before { content: 'Markdown 预览区（实时渲染）'; color: var(--text-muted); font-style: italic; }
.sf-template-preview :deep(h1) { font-size: 1.3em; margin: 0.5em 0 0.3em; border-bottom: 1px solid var(--border-color); padding-bottom: 2px; }
.sf-template-preview :deep(h2) { font-size: 1.15em; margin: 0.5em 0 0.3em; border-bottom: 1px solid var(--border-color); padding-bottom: 2px; }
.sf-template-preview :deep(h3) { font-size: 1.05em; margin: 0.5em 0 0.3em; }
.sf-template-preview :deep(code) { background: var(--bg-elevated); padding: var(--space-1) var(--space-2); border-radius: var(--radius-xs); font-family: var(--font-family-mono); font-size: 0.9em; }
.sf-template-preview :deep(pre) { background: var(--bg-elevated); padding: var(--space-4); border-radius: var(--radius-xs); overflow-x: auto; margin: 0.5em 0; }
.sf-template-preview :deep(pre code) { background: none; padding: 0; }
.sf-template-preview :deep(ul) { margin: 0.3em 0; padding-left: 1.5em; }
.sf-template-preview :deep(li) { margin: 0.15em 0; }
.sf-template-preview :deep(blockquote) { border-left: 3px solid var(--border-color); padding-left: 8px; margin: 0.5em 0; color: var(--text-secondary); }
.sf-template-preview :deep(p) { margin: 0.3em 0; }
@media (max-width: 760px) {
  .sf-template-wrapper { flex-direction: column; }
  .sf-template-preview { max-height: 200px; }
}

/* === 表单操作区 === */
</style>

