<template>
  <div class="mcp-settings">
    <div class="mcp-header">
      <h4>MCP 服务器配置</h4>
      <button class="btn-sm btn-primary" @click="showAddForm = !showAddForm">添加服务器</button>
    </div>

    <div v-if="showAddForm" class="mcp-form">
      <div class="mcp-form-row">
        <label>名称</label>
        <input v-model="newServer.name" placeholder="例如: 知识库服务器" />
      </div>
      <div class="mcp-form-row">
        <label>URL</label>
        <input v-model="newServer.url" placeholder="http://localhost:3000/mcp" />
      </div>
      <div class="mcp-form-row">
        <label>API Key</label>
        <input v-model="newServer.apiKey" type="password" placeholder="可选" />
      </div>
      <div class="mcp-form-actions">
        <button class="btn-sm btn-secondary" @click="testNewConnection">测试连接</button>
        <span v-if="testResult" :class="testResult.ok ? 'mcp-test-ok' : 'mcp-test-fail'">
          {{ testResult.ok ? '连接成功 - ' + testResult.tools.length + ' 个工具' : '连接失败: ' + testResult.error }}
        </span>
      </div>
      <div class="mcp-form-actions">
        <button class="btn-sm btn-secondary" @click="showAddForm = false">取消</button>
        <button class="btn-sm btn-primary" @click="confirmAdd" :disabled="!newServer.name || !newServer.url">确认添加</button>
      </div>
    </div>

    <div class="mcp-server-list">
      <div v-for="server in mcpStore.servers" :key="server.id" class="mcp-server-item">
        <div class="mcp-server-header">
          <span class="mcp-server-name">{{ server.name }}</span>
          <span class="mcp-server-url">{{ server.url }}</span>
          <label class="mcp-toggle">
            <input type="checkbox" :checked="server.enabled" @change="toggleServer(server.id)" />
            启用
          </label>
          <button class="btn-sm btn-danger" @click="removeServer(server.id)">删除</button>
        </div>
        <div class="mcp-server-tools" v-if="server.tools.length > 0">
          <span class="mcp-tool-tag" v-for="t in server.tools" :key="t">{{ t }}</span>
        </div>
      </div>
      <div v-if="mcpStore.servers.length === 0" class="mcp-empty">
        暂无 MCP 服务器配置，点击上方"添加服务器"开始配置。
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useMcpStore } from '../../stores/mcp'

const mcpStore = useMcpStore()

const showAddForm = ref(false)
const newServer = ref({ name: '', url: '', apiKey: '' })
const testResult = ref<{ ok: boolean; tools: string[]; error?: string } | null>(null)

onMounted(() => {
  mcpStore.loadServers()
})

async function testNewConnection() {
  if (!newServer.value.url) return
  testResult.value = await mcpStore.testConnection(newServer.value.url, newServer.value.apiKey)
  if (testResult.value.ok) {
    newServer.value.name = newServer.value.name || 'MCP Server'
  }
}

function confirmAdd() {
  if (!newServer.value.name || !newServer.value.url) return
  mcpStore.addServer({
    id: 'mcp-' + Date.now(),
    name: newServer.value.name,
    url: newServer.value.url,
    apiKey: newServer.value.apiKey,
    tools: testResult.value?.tools || [],
    enabled: true,
    createdAt: new Date().toISOString(),
  })
  newServer.value = { name: '', url: '', apiKey: '' }
  testResult.value = null
  showAddForm.value = false
}

function toggleServer(id: string) {
  const server = mcpStore.getServer(id)
  if (server) mcpStore.updateServer(id, { enabled: !server.enabled })
}

function removeServer(id: string) {
  mcpStore.removeServer(id)
}
</script>

<style scoped>
.mcp-settings { padding: 12px; }
.mcp-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.mcp-header h4 { margin: 0; font-size: 14px; }
.mcp-form { background: var(--bg-input); border: 1px solid var(--border-color); border-radius: 6px; padding: 12px; margin-bottom: 12px; }
.mcp-form-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.mcp-form-row label { width: 80px; font-size: 13px; flex-shrink: 0; }
.mcp-form-row input { flex: 1; padding: 6px 8px; border: 1px solid var(--border-color); border-radius: 4px; font-size: 13px; }
.mcp-form-actions { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.mcp-test-ok { color: #22c55e; font-size: 12px; }
.mcp-test-fail { color: #ef4444; font-size: 12px; }
.mcp-server-list { display: flex; flex-direction: column; gap: 8px; }
.mcp-server-item { background: var(--bg-input); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; }
.mcp-server-header { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.mcp-server-name { font-weight: 600; font-size: 13px; }
.mcp-server-url { font-size: 12px; color: var(--text-secondary); }
.mcp-toggle { font-size: 12px; display: flex; align-items: center; gap: 4px; }
.mcp-server-tools { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.mcp-tool-tag { background: var(--accent); color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 11px; }
.mcp-empty { text-align: center; color: var(--text-secondary); font-size: 13px; padding: 24px; }
</style>
