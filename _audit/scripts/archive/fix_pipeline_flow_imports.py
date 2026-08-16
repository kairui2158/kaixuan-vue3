import sys
with open("D:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue", "r", encoding="utf-8") as f:
    content = f.read()
content = content.replace(
    'import { storageKey } from "../../utils/storage-key"',
    'import { storageKey } from "../../utils/storage-key"\nimport PipelineFlow from "./PipelineFlow.vue"'
)
content = content.replace(
    "const showExecLog = ref(false)",
    "const showExecLog = ref(false)\nconst showFlowView = ref(false)"
)
with open("D:/codex/novel-workshop-vue3/src/components/pipeline/PipelinePanel.vue", "w", encoding="utf-8") as f:
    f.write(content)
print("OK")
