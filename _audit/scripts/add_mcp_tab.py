c = open('src/components/settings/SettingsModal.vue', 'r', encoding='utf-8').read()

# Add MCP to tabs
c = c.replace(
    "const tabs = [\n    { id: 'api', label: 'API' },\n    { id: 'skill', label: 'Skill' },\n    { id: 'agent', label: 'Agent' },\n    { id: 'appearance', label: '外观' },\n    { id: 'deai', label: '去AI味' },\n    { id: 'diag', label: '诊断' },\n  ]",
    "const tabs = [\n    { id: 'api', label: 'API' },\n    { id: 'skill', label: 'Skill' },\n    { id: 'agent', label: 'Agent' },\n    { id: 'mcp', label: 'MCP' },\n    { id: 'appearance', label: '外观' },\n    { id: 'deai', label: '去AI味' },\n    { id: 'diag', label: '诊断' },\n  ]"
)

# Add MCP component import
c = c.replace(
    "import DiagLogPanel from './DiagLogPanel.vue'",
    "import DiagLogPanel from './DiagLogPanel.vue'\nimport McpSettings from './McpSettings.vue'"
)

# Add MCP panel in template
c = c.replace(
    '<DiagLogPanel v-else-if="settingsStore.activeTab === \'diag\'" />',
    '<DiagLogPanel v-else-if="settingsStore.activeTab === \'diag\'" />\n          <McpSettings v-else-if="settingsStore.activeTab === \'mcp\'" />'
)

open('src/components/settings/SettingsModal.vue', 'w', encoding='utf-8').write(c)
print('OK: added MCP tab')
