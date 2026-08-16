c = open('src/components/pipeline/PipelinePanel.vue', 'r', encoding='utf-8').read()

# Add import
c = c.replace(
    'import { useEditorStore } from "../../stores/editor"',
    'import { useEditorStore } from "../../stores/editor"\nimport { useExecutionLogStore } from "../../stores/executionLog"'
)

# Add execLogStore after editorStore
c = c.replace(
    'const editorStore = useEditorStore()',
    'const editorStore = useEditorStore()\nconst execLogStore = useExecutionLogStore()'
)

open('src/components/pipeline/PipelinePanel.vue', 'w', encoding='utf-8').write(c)
print('OK: added imports')
