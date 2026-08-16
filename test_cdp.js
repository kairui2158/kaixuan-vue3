const CDP = require('cdp-promise');
const wsUrl = 'http://127.0.0.1:9227/json';
const https = require('http');

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

async function main() {
  const targets = await httpGet(wsUrl);
  const page = targets.find(t => t.title && (t.title.includes('神意') || t.title.includes('novel') || t.title.includes('小说')));
  if (!page) {
    console.log('TARGETS:', targets.map(t => t.title + ' ' + t.url).join('\\n'));
    return;
  }
  console.log('Using page:', page.title, page.webSocketDebuggerUrl);
  const cdp = new CDP(page.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  
  // 测试1: 先打开大纲工作台
  // 点击侧边栏大纲按钮
  console.log('\\n=== 测试1: 打开大纲工作台 ===');
  const outlineBtn = await cdp.send('Runtime.evaluate', {
    expression: "document.querySelector('[title=\"大纲工作台\"]') || document.querySelector('.sidebar-nav-btn:nth-child(3)') || document.querySelector('button:has(span:contains(\"大纲\"))')",
    returnByValue: true
  });
  console.log('大纲按钮:', JSON.stringify(outlineBtn.result));
  
  // 测试2: 检查 PipelinePanel 渲染状态
  console.log('\\n=== 测试2: 检查 PipelinePanel ===');
  const pipelinePanel = await cdp.send('Runtime.evaluate', {
    expression: "document.querySelector('#pipeline-panel') !== null",
    returnByValue: true
  });
  console.log('PipelinePanel 已渲染:', pipelinePanel.result.value);
  
  // 测试3: 检查 currentStep
  console.log('\\n=== 测试3: 检查 currentStep ===');
  const step = await cdp.send('Runtime.evaluate', {
    expression: "document.querySelector('#pipeline-panel') ? (window.__vue_app__ ? window.__vue_app__.config.globalProperties..state.value.pipeline.currentStep : 'no vue') : 'no panel'",
    returnByValue: true
  });
  console.log('currentStep:', step.result.value);
  
  await cdp.send('Page.captureScreenshot', { format: 'png' }).then(r => {
    require('fs').writeFileSync('D:\\codex\\novel-workshop-vue3\\test_screenshot.png', Buffer.from(r.data, 'base64'));
    console.log('Screenshot saved');
  });
  
  await cdp.close();
  console.log('\\nDone');
}

main().catch(e => { console.error(e); process.exit(1); });
