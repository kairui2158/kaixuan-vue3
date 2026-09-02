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
    const lastUserMessage = Array.isArray(body?.messages)
      ? [...body.messages].reverse().find(message => message.role === 'user')
      : null;
    appendLog({
      phase,
      method: req.method,
      url: req.url,
      hasTools: Array.isArray(body?.tools) && body.tools.length > 0,
      toolNames: Array.isArray(body?.tools) ? body.tools.map(tool => tool.function?.name).filter(Boolean) : [],
      messageCount: Array.isArray(body?.messages) ? body.messages.length : 0,
      lastUserPreview: typeof lastUserMessage?.content === 'string'
        ? lastUserMessage.content.slice(-180)
        : null,
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
    const outlineMode = typeof lastUserMessage?.content === 'string'
      && lastUserMessage.content.includes('L3_OUTLINE');
    const compatibleMode = typeof lastUserMessage?.content === 'string'
      && lastUserMessage.content.includes('L3_P7_COMPATIBLE');
    const compatibleRejectTools = typeof lastUserMessage?.content === 'string'
      && lastUserMessage.content.includes('L3_P7_REJECT_TOOLS');
    const targetText = outlineMode ? '测试底稿' : '主编辑底稿';
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
    if (compatibleRejectTools && Array.isArray(body?.tools) && body.tools.length > 0) {
      payload = {
        error: { message: 'tools unsupported' }
      };
      res.writeHead(400, headers);
      res.end(JSON.stringify(payload));
      return;
    } else if (
      compatibleRejectTools
      && !Array.isArray(body?.tools)
      && body?.stream === true
    ) {
      const content = '```json\n{"type":"editor_edit_batch","version":1,"commands":[{"operation":"replace_match","target":"' + targetText + '","content":"' + targetText + '（兼容模式）"},{"operation":"append","content":"\\n[测试] 兼容模式第二条插入内容。"}],"reason":"兼容模式批次"}\n```';
      const sseHeaders = {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      };
      res.writeHead(200, sseHeaders);
      res.write(`data: ${JSON.stringify({
        id: 'chatcmpl-l3-' + phase,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: 'mock-model',
        choices: [{
          index: 0,
          delta: { role: 'assistant', content }
        }]
      })}\n\n`);
      res.write(`data: ${JSON.stringify({
        id: 'chatcmpl-l3-' + phase,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: 'mock-model',
        choices: [{
          index: 0,
          delta: {},
          finish_reason: 'stop'
        }]
      })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    } else if (compatibleMode || compatibleRejectTools) {
      payload = {
        id: 'chatcmpl-l3-' + phase,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: 'mock-model',
        choices: [{
          index: 0,
          finish_reason: 'stop',
          message: {
            role: 'assistant',
            content: '```json\n{"type":"editor_edit_batch","version":1,"commands":[{"operation":"replace_match","target":"' + targetText + '","content":"' + targetText + '（兼容模式）"},{"operation":"append","content":"\\n[测试] 兼容模式第二条插入内容。"}],"reason":"兼容模式批次"}\n```'
          }
        }],
        usage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 }
      };
    } else if (shouldCallTool) {
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
                    { operation: 'replace_match', target: targetText, content: targetText + '（已更新）' },
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
