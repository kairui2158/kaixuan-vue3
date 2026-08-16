with open("D:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue", "r", encoding="utf-8") as f:
    content = f.read()
content = content.replace("<template v-else>", "<div v-show=\"!showFlowView\">")
old_close = '          </template>\n        </div>\n      </div>\n    </div>\n    <div class="pl-result"'
new_close = '        </div>\n      </div>\n    </div>\n    <div class="pl-result"'
content = content.replace(old_close, new_close)
with open("D:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue", "w", encoding="utf-8") as f:
    f.write(content)
print("OK")
