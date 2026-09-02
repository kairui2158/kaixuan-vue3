const http = require('http');
const fs = require('fs');
const path = require('path');

const port = Number(process.env.L3_MOCK_PORT || 19098);
const logPath = path.resolve(__dirname, 'l3-mock-requests.log');
let phase = 0;

function appendLog(entry) {
  fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
}

const server = http.createServer((req, res) => {
  let raw = '';
  req.on('data', chunk => { raw += chunk; });
  req.on('end', () => {
    let body = null;
    try { body = raw ? JSON.parse(raw) : null; } catch (_) { body = { parseError: true, raw }; }
    phase += 1;
    appendLog({
      phase,
      method: req.method,
      url: req.url,
      hasTools: Array.isArray(body?.tools) && body.tools.length > 0,
      toolNames: Array.isArray(body?.tools) ? body.tools.map(tool => tool.function?.name).filter(Boolean) : [],
      messageCount: Array.isArray(body?.messages) ? body.messages.length : 0,
      stream: body?.stream === true
    });

    const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { ...headers, 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' });
      res.end();
      return;
    }

    const hasToolResult = Array.isArray(body?.messages)
      && body.messages.some(message => message.role === 'tool');
    const shouldCallTool = !hasToolResult;
    const lastMessages = Array.isArray(body?.messages) ? body.messages.slice(-2) : [];
    appendLog({
      phase,
      wireTail: lastMessages.map(message => ({
        role: message.role,
        hasToolCalls: Array.isArray(message.tool_calls) && message.tool_calls.length > 0,
        toolCallIds: Array.isArray(message.tool_calls) ? message.tool_calls.map(call => call.id) : [],
        toolCallId: message.tool_call_id || null,
        contentType: typeof message.content
      }))
    });
    let payload;
    if (shouldCallTool) {
      payload = {
        id: 'chatcmpl-l3-' + phase,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: 'mock-model',
        choices: [{
          index: 0,
          finish_reason: 'tool_calls',
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [{
              id: 'call_l3_' + phase,
              type: 'function',
              function: {
                name: 'editor.propose_edits',
                arguments: JSON.stringify({
                  reason: '按用户请求插入测试批次',
                  commands: [
                    { operation: 'replace_match', target: '主编辑底稿', content: '主编辑底稿（已更新）' },
                    { operation: 'append', content: '\n[测试] 第二条插入内容。' }
                  ]
                })
              }
            }]
          }
        }],
        usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 }
      };
    } else {
      payload = {
        id: 'chatcmpl-l3-' + phase,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: 'mock-model',
        choices: [{
          index: 0,
          finish_reason: 'stop',
          message: { role: 'assistant', content: '已生成 2 条编辑建议，请确认后应用。' }
        }],
        usage: { prompt_tokens: 30, completion_tokens: 8, total_tokens: 38 }
      };
    }
    res.writeHead(200, headers);
    res.end(JSON.stringify(payload));
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log('L3_MOCK_READY http://127.0.0.1:' + port);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
