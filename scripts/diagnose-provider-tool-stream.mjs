import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const profilePath = path.join(ROOT, '_data', 'outline-deletion-live-replay-profile', 'documents-data', 'wa_providers.json')
const stored = JSON.parse(fs.readFileSync(profilePath, 'utf8'))
const provider = stored.providers.find(item => item.baseUrl === 'https://openapi.cloud-ai.cn/v1')
if (!provider?.apiKey) throw new Error('live provider credentials unavailable')

const response = await fetch(`${provider.baseUrl}/chat/completions`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${provider.apiKey}`,
  },
  body: JSON.stringify({
    model: provider.selectedModel || provider.models?.[0],
    stream: true,
    messages: [
      { role: 'system', content: 'You must call the echo tool exactly once.' },
      { role: 'user', content: 'Call echo with text "ok".' },
    ],
    tools: [{
      type: 'function',
      function: {
        name: 'echo',
        description: 'Echo the supplied text.',
        parameters: {
          type: 'object',
          properties: { text: { type: 'string' } },
          required: ['text'],
        },
      },
    }],
  }),
})

console.log(`HTTP ${response.status} ${response.headers.get('content-type') || ''}`)
if (!response.ok) {
  console.log(await response.text())
  process.exit(1)
}

const body = await response.text()
for (const line of body.split('\n')) {
  if (line.trim()) console.log(line)
}
