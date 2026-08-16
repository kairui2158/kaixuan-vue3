with open("D:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue", "r", encoding="utf-8") as f:
    content = f.read()

# Need to close the v-show div before pl-content-right closes
# Find:          </div> (step 5 close) followed by         </div> (pl-content-right close)
# Insert:          </div> (v-show close) in between
old = '          </div>\n        </div>\n      </div>\n    </div>\n  </div>\n\n  <div v-if="showAddSettingModal"'
new = '          </div>\n          </div>\n        </div>\n      </div>\n    </div>\n  </div>\n\n  <div v-if="showAddSettingModal"'
content = content.replace(old, new)

with open("D:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue", "w", encoding="utf-8") as f:
    f.write(content)
print("OK")
