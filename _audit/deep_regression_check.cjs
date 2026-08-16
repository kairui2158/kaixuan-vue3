const CDP = require('node:http');
const CDP_WS = require('node:net');
const URL = require('node:url');

const CDP_PORT = 9227;
const BASE = 'http://localhost:' + CDP_PORT;

async function httpGet(url) {
  return new Promise((resolve, reject) => {
    CDP.get(url, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

async function wsSend(wsUrl, msg) {
  return new Promise((resolve, reject) => {
    const u = new URL.URL(wsUrl);
    const sock = new CDP_WS.Socket();
    sock.connect(u.port, u.hostname, () => {
      sock.write(JSON.stringify(msg) + '\0');
    });
    let buf = '';
    sock.on('data', d => {
      buf += d.toString();
      try {
        const resp = JSON.parse(buf.replace(/\0$/, ''));
        sock.destroy();
        resolve(resp);
      } catch(e) {}
    });
    sock.on('error', reject);
    setTimeout(() => { sock.destroy(); reject(new Error('timeout')); }, 5000);
  });
}

async function getPage() {
  const pages = await httpGet(BASE + '/json');
  return pages[0];
}

async function evalJS(page, code) {
  const msg = { id: 1, method: 'Runtime.evaluate', params: { expression: code, returnByValue: true } };
  const resp = await wsSend(page.webSocketDebuggerUrl, msg);
  return resp.result;
}

async function main() {
  const results = [];
  function add(id, title, expected, actual, pass, extra) {
    results.push({ id, title, expected, actual: typeof actual === 'string' ? actual : JSON.stringify(actual), pass, extra: extra || null });
  }

  console.log('=== 神意助手深度回归检查 ===\n');

  const page = await getPage();
  add('G01', '页面标题', '神意助手', page.title, page.title === '神意助手', page.url);
  console.log('[G01] 页面标题:', page.title, page.title === '神意助手' ? '✅' : '❌');

  const domCheck = await evalJS(page, '(function(){ return {app:!!document.querySelector("#app"),sidebar:!!document.querySelector(".sidebar"),tree:!!document.querySelector(".chapter-tree"),editor:!!document.querySelector(".editor-panel")||!!document.querySelector("#editor"),chat:!!document.querySelector(".chat-panel")||!!document.querySelector("#chat-panel")}; })()');
  add('G02', 'App根节点', '存在', domCheck.value.app, domCheck.value.app);
  add('G03', '侧边栏', '存在', domCheck.value.sidebar, domCheck.value.sidebar);
  add('G04', '章节树', '存在', domCheck.value.tree, domCheck.value.tree);
  add('G05', '编辑器', '存在', domCheck.value.editor, domCheck.value.editor);
  add('G06', '聊天面板', '存在', domCheck.value.chat, domCheck.value.chat);
  console.log('[G02-G06] 基础DOM:', domCheck.value.app?'✅':'❌', 'sidebar:', domCheck.value.sidebar?'✅':'❌', 'tree:', domCheck.value.tree?'✅':'❌', 'editor:', domCheck.value.editor?'✅':'❌', 'chat:', domCheck.value.chat?'✅':'❌');

  const piniaCheck = await evalJS(page, '(function(){ var app=document.querySelector("#app").__vue_app__; var pinia=app.config.globalProperties.; if(!pinia) return {count:0,stores:[]}; var ids=Object.keys(pinia._s); return {count:ids.length,stores:ids}; })()');
  const storeCount = piniaCheck.value ? piniaCheck.value.count : 0;
  add('G07', 'Pinia stores', '>=10', storeCount, storeCount >= 10, piniaCheck.value ? piniaCheck.value.stores : []);
  console.log('[G07] Pinia stores:', storeCount, storeCount >= 10 ? '✅' : '❌');

  const apiCheck = await evalJS(page, '(function(){ return Object.keys(window.electronAPI||{}); })()');
  const apiKeys = apiCheck.value || [];
  add('G08', 'electronAPI', '>=20', apiKeys.length, apiKeys.length >= 20, apiKeys);
  console.log('[G08] electronAPI:', apiKeys.length, 'methods', apiKeys.length >= 20 ? '✅' : '❌');

  // Outline workspace
  const outlineCheck = await evalJS(page, '(function(){ return new Promise(function(r){ setTimeout(function(){ var btn=document.querySelector("[data-panel=\"outline-workspace\"],#btn-outline-workspace,.sidebar-btn-outline"); if(btn) btn.click(); setTimeout(function(){ var ow=document.querySelector(".ow-overlay,[class*=\"outline-workspace\"]"); var btns=ow?Array.from(ow.querySelectorAll("button,.btn,[role=\"button\"]")).map(function(b){ return {text:(b.textContent||"").trim().substring(0,30),id:b.id||"",visible:b.offsetParent!==null}; }):[]; r({found:!!ow,btnCount:btns.length,buttons:btns}); },500); },200); }); })()');
  const ow = outlineCheck.value || {};
  add('G09', '大纲工作台打开', '可见', ow.found, ow.found, ow);
  add('G10', '大纲工作台按钮数', '>=8', ow.btnCount || 0, (ow.btnCount || 0) >= 8, ow.buttons);
  console.log('[G09-G10] 大纲工作台:', ow.found?'✅':'❌', '按钮:', ow.btnCount||0, (ow.btnCount||0)>=8?'✅':'❌');
  if (ow.buttons && ow.buttons.length > 0) {
    const texts = ow.buttons.map(b => b.text);
    add('G11', '大纲-AI共创', '存在', texts.some(t => t.includes('AI')), texts.some(t => t.includes('AI')), texts);
    add('G12', '大纲-导入', '存在', texts.some(t => t.includes('导入')), texts.some(t => t.includes('导入')), null);
    add('G13', '大纲-保存', '存在', texts.some(t => t.includes('保存')), texts.some(t => t.includes('保存')), null);
    add('G14', '大纲-锁定', '存在', texts.some(t => t.includes('锁定')||t.includes('确认')), texts.some(t => t.includes('锁定')||t.includes('确认')), null);
  }

  // Close outline, open pipeline
  const pipelineCheck = await evalJS(page, '(function(){ return new Promise(function(r){ setTimeout(function(){ var closeBtn=document.querySelector(".ow-overlay .btn-close,.ow-overlay [class*=\"close\"]"); if(closeBtn) closeBtn.click(); setTimeout(function(){ var plBtn=document.querySelector("[data-panel=\"pipeline\"],#btn-pipeline,.sidebar-btn-pipeline"); if(plBtn) plBtn.click(); setTimeout(function(){ var pl=document.querySelector(".pl-overlay,[class*=\"pipeline-panel\"]"); var btns=pl?Array.from(pl.querySelectorAll("button,.btn,[role=\"button\"]")).map(function(b){ return {text:(b.textContent||"").trim().substring(0,35),id:b.id||"",visible:b.offsetParent!==null}; }):[]; r({found:!!pl,btnCount:btns.length,buttons:btns}); },500); },300); },200); }); })()');
  const pl = pipelineCheck.value || {};
  add('G15', '生成流水线打开', '可见', pl.found, pl.found, pl);
  add('G16', '生成流水线按钮数', '>=30', pl.btnCount || 0, (pl.btnCount || 0) >= 30, pl.buttons);
  console.log('[G15-G16] 生成流水线:', pl.found?'✅':'❌', '按钮:', pl.btnCount||0, (pl.btnCount||0)>=30?'✅':'❌');
  if (pl.buttons && pl.buttons.length > 0) {
    const texts = pl.buttons.map(b => b.text);
    add('G17', '流水线-大纲层', '存在', texts.some(t => t.includes('大纲')||t.includes('outline')), texts.some(t => t.includes('大纲')||t.includes('outline')), null);
    add('G18', '流水线-设定层', '存在', texts.some(t => t.includes('设定')||t.includes('setting')), texts.some(t => t.includes('设定')||t.includes('setting')), null);
    add('G19', '流水线-卷纲层', '存在', texts.some(t => t.includes('卷')||t.includes('volume')), texts.some(t => t.includes('卷')||t.includes('volume')), null);
    add('G20', '流水线-章节层', '存在', texts.some(t => t.includes('章节')||t.includes('chapter')), texts.some(t => t.includes('章节')||t.includes('chapter')), null);
    add('G21', '流水线-正文层', '存在', texts.some(t => t.includes('正文')||t.includes('body')||t.includes('生成')), texts.some(t => t.includes('正文')||t.includes('body')||t.includes('生成')), null);
    add('G22', '流水线-新增设定', '存在', texts.some(t => t.includes('新增')), texts.some(t => t.includes('新增')), null);
    add('G23', '流水线-确认完成', '存在', texts.some(t => t.includes('确认')||t.includes('完成')), texts.some(t => t.includes('确认')||t.includes('完成')), null);
  }

  // Settings collection
  const scCheck = await evalJS(page, '(function(){ return new Promise(function(r){ setTimeout(function(){ var closePl=document.querySelector(".pl-overlay [class*=\"close\"],.pl-overlay .btn-close"); if(closePl) closePl.click(); setTimeout(function(){ var scBtn=document.querySelector("[data-panel=\"settings-collection\"],#btn-sc,.sidebar-btn-sc"); if(scBtn) scBtn.click(); setTimeout(function(){ var sc=document.querySelector(".sc-overlay,[class*=\"settings-collection\"],#settings-collection-panel"); var btns=sc?Array.from(sc.querySelectorAll("button,.btn,[role=\"button\"]")).map(function(b){ return {text:(b.textContent||"").trim().substring(0,30),visible:b.offsetParent!==null}; }):[]; r({found:!!sc,btnCount:btns.length,buttons:btns}); },500); },300); },200); }); })()');
  const sc = scCheck.value || {};
  add('G24', '设定合集打开', '可见', sc.found, sc.found, sc);
  add('G25', '设定合集按钮数', '>=4', sc.btnCount || 0, (sc.btnCount || 0) >= 4, sc.buttons);
  console.log('[G24-G25] 设定合集:', sc.found?'✅':'❌', '按钮:', sc.btnCount||0, (sc.btnCount||0)>=4?'✅':'❌');

  console.log('\n=== 检查完成 ===');
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log('通过:', passed, '/', results.length, '失败:', failed);
  console.log(JSON.stringify({timestamp:new Date().toISOString(),total:results.length,passed,failed,items:results}, null, 2));
}

main().catch(function(e){ console.error("FATAL:", e.message); process.exit(1); });
