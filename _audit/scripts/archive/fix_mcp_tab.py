c = open('src/components/settings/SettingsModal.vue', 'r', encoding='utf-8').read()

# Fix tabs array - add mcp tab
old_tabs = "  { id: 'diag' as const, label: '诊断日志' },\n]"
new_tabs = "  { id: 'diag' as const, label: '诊断日志' },\n  { id: 'mcp' as const, label: 'MCP' },\n]"
c = c.replace(old_tabs, new_tabs)

# Verify mcp tab was added
if 'mcp' in c:
    print('OK: mcp tab added')
else:
    print('FAIL: mcp tab not found, trying alternative')
    # Try with different encoding
    old_tabs2 = "  { id: 'diag' as const, label: '"
    idx = c.find(old_tabs2)
    if idx >= 0:
        end_idx = c.find(']', idx)
        c = c[:end_idx-1] + ",\n  { id: 'mcp' as const, label: 'MCP' },\n" + c[end_idx-1:]
        print('Added via alternative method')

open('src/components/settings/SettingsModal.vue', 'w', encoding='utf-8').write(c)
print('Done')
