with open("D:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Add toggle button in the header, after the execute log button
old_header = '<button class="btn-sm btn-secondary" id="btn-exec-log" @click="showExecLog = !showExecLog">执行日志</button>'
new_header = old_header + '\n        <button class="btn-sm btn-secondary" id="btn-flow-toggle" @click="showFlowView = !showFlowView">{{ showFlowView ? \'步骤视图\' : \'流程视图\' }}</button>'
content = content.replace(old_header, new_header)

# 2. Wrap step panels in v-if, and add PipelineFlow as the else
# Find the step panel divs and wrap them
old_step_panels_start = '          <div v-show="pipelineStore.currentStep === 0" id="pl-step-1-content" class="pl-step-panel">'
# Find the closing of pl-content-right (line 326)
closing_marker = '        </div>\n      </div>\n    </div>\n'
pl_content_end = '        </div>\n      </div>\n    </div>\n    <div class="pl-result"'

# Find the position of the first step panel
idx = content.find(old_step_panels_start)
if idx > 0:
    # Insert PipelineFlow before the step panels
    flow_template = '          <PipelineFlow v-if="showFlowView" :steps-with-ids="stepsWithIds" :step-agents="stepAgents" :step-skills="stepSkills" :step-skill-modes="stepSkillModes" @toggle-view="showFlowView = false" />\n'
    # Add v-else to the first step panel
    content = content[:idx] + flow_template + '          <template v-else>\n' + content[idx:]
    # Now find the closing div of pl-content-right and add </template> before it
    # The closing of pl-content-right is at the end of the step panels section
    close_idx = content.find('        </div>\n      </div>\n    </div>\n    <div class="pl-result"')
    if close_idx > 0:
        # Insert </template> before the closing div of pl-content-right
        content = content[:close_idx] + '          </template>\n' + content[close_idx:]

with open("D:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue", "w", encoding="utf-8") as f:
    f.write(content)
print("OK")
