import fs from 'fs'
const p = 'src/components/chat/ChatPanel.vue'
let c = fs.readFileSync(p, 'utf8')

function rep(pattern, repl) {
  const before = c
  c = c.replace(pattern, repl)
  if (c === before) {
    console.error('NO MATCH:', pattern)
    process.exitCode = 1
  } else {
    console.log('OK:', pattern)
  }
}

// 1. projectId computed
rep(/const messages = ref<any\[\]>\(\)/, "const projectId = computed(() => projectStore.currentProjectId || 'default')\nconst messages = computed(() => chatStore.activeMessages)")

// 2. ensure active session before load
rep(/chatStore\.loadSessions\(projectId\.value\)\s*\n\s*chatStore\.ensureSession\('', '', 'default'\)/, "chatStore.currentProjectId = projectId.value\n  chatStore.loadSessions(projectId.value)\n  chatStore.ensureSession('', '', 'default', projectId.value)")

// 3. provider missing case
rep(/const provider = providerStore\.activeGenerateProvider\n    if \(!provider\) \{\n      chatStore\.addMessage\(\{ role: "assistant", content: response, tabId: chatStore\.currentContext\?\.tabId \|\| "" \}\)\n      return\n    \}/, "const provider = providerStore.activeGenerateProvider\n    if (!provider) {\n      chatStore.addMessage({ role: 'assistant', content: '请先配置API供应商' }, projId)\n      return\n    }")

// 4. addMessage calls pass projId
const calls = c.match(/chatStore\.addMessage\([^;]+\);?/g) || []
for (const call of calls) {
  const withProj = call.replace(/}\)\s*;?$/, '}, projId)\n')
  c = c.split(call).join(withProj.replace(/\n$/, ''))
}

// 5. fix assistant tracking for streaming: add empty assistant once inside callApi
rep(/chatStore\.addMessage\(\{ role: "assistant", content: "", tabId: chatStore\.currentContext\?\.tabId \|\| "" \}\)/, "chatStore.addMessage({ role: 'assistant', content: '', tabId: chatStore.currentContext?.tabId || '' }, projId)")

// 6. aiIdx mutation -> update streamed message via chatStore
rep(/messages\[aiIdx\]\.content = result/, "chatStore.updateLastMessage(result)")
rep(/messages\[aiIdx\]\.content = result/, "chatStore.updateLastMessage(result)")

// 7. regenerateMessage repair
rep(/(function regenerateMessage\(index: number\) \{[\s\S]*?\n\})/, `function regenerateMessage(index: number) {
  const msgs = chatStore.activeSession?.messages
  if (!msgs) return
  const msg = msgs[index]
  if (!msg || msg.role !== 'assistant') return
  msgs.splice(index, 1)
  const prevUser = msgs[index - 1]
  if (prevUser && prevUser.role === 'user') {
    inputText.value = prevUser.content
    msgs.splice(index - 1, 1)
    sendMessage()
  }
}`)

fs.writeFileSync(p, c, 'utf8')
console.log('DONE')
