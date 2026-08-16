const WebSocket = require('ws')
const http = require('http')
const fs = require('fs')

const OUT = '_audit/e2e/pipeline_chain_compose_verify.json'

http.get('http://127.0.0.1:9227/json/list', (res) => {
  let d = ''
  res.on('data', (c) => (d += c))
  res.on('end', () => {
    const t = JSON.parse(d).find((x) => x.type === 'page')
    if (!t) { console.error('No page'); process.exit(1) }
    const ws = new WebSocket(t.webSocketDebuggerUrl)
    ws.on('open', () => {
      let nextId = 1
      function ev(exp, awaitP) {
        const id = nextId++
        return new Promise((resolve, reject) => {
          const cb = (raw) => {
            const m = JSON.parse(raw.toString())
            if (m.id !== id) return
            ws.off('message', cb)
            if (m.error) reject(m.error)
            else resolve(m.result)
          }
          ws.on('message', cb)
          ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: exp, awaitPromise: !!awaitP, returnByValue: true } }))
        })
      }
      ;(async () => {
        const log = []
        log.push({ step: 'start', action: 'verify chain/compose execution' })
        // Step 1: 打开 pipeline 面板
        await ev("document.querySelector('#btn-pipeline')?.click()")
        await ev("new Promise(r => setTimeout(r, 500))", true)
        log.push({ step: 'pipeline_opened' })
        // Step 2: 给卷纲层(step 3)绑定 2 个 Skill, 设置 mode=chain
        // 先切换到卷纲层
        await ev("(function(){ const s = document.querySelectorAll('.pl-step'); if(s[2]) s[2].click(); })()")
        await ev("new Promise(r => setTimeout(r, 300))", true)
        log.push({ step: 'switched_to_step3_volumes' })
        // 绑定两个 Skill 到 step 3 (UI 显示 step 3, 内部 stepSkills 是 2)
        // 先用 skill dropdown 添加
        const skillIds = ["sk_ms4v1agw_jm2xl4", "sk_ms4v1r5k_im2adh"]  // 卷纲SKILL 1, 卷纲SKILL 2
        for (let si = 0; si < skillIds.length; si++) {
          await ev("document.getElementById('pl-s3-skill').value = '" + skillIds[si] + "'; document.getElementById('pl-s3-skill').dispatchEvent(new Event('change'))")
          await ev("document.getElementById('pl-s3-add-skill').click()")
          await ev("new Promise(r => setTimeout(r, 200))", true)
        }
        log.push({ step: 'bound_skills_to_step3', count: skillIds.length, ids: skillIds })
        // 确保 mode=chain
        await ev("document.getElementById('pl-s3-mode').value = 'chain'; document.getElementById('pl-s3-mode').dispatchEvent(new Event('change'))")
        await ev("new Promise(r => setTimeout(r, 200))", true)
        log.push({ step: 'set_mode_chain_for_step3' })
        // Step 3: 拦截 providerStore.callApi 计数
        await ev("(function() { if (window.__callCount) return; window.__callCount = 0; window.__callLog = []; var orig = window.__pinia._s.get('provider').callApi; window.__pinia._s.get('provider').callApi = async function(pid, model, messages) { window.__callCount++; window.__callLog.push({ pid: pid, model: model, msgCount: messages.length, systemContent: (messages[0]?.content || '').slice(0, 100) }); return '[' + window.__callCount + '] 模拟输出'; }; })()")
        log.push({ step: 'intercepted_provider_callApi' })
        // Step 4: 触发卷纲生成（需要已有大纲文本）
        // 先检查是否有大纲文本
        const hasOutline = await ev("(function(){ try { return !!(window.__pinia && window.__pinia._s.get('project') && window.__pinia._s.get('project').outlineText); } catch(e) { return false; } })()")
        log.push({ step: 'has_outline', result: hasOutline.result.value })
        let outlineSet = false
        if (!hasOutline.result.value) {
          await ev("window.__pinia._s.get('project').outlineText = '测试大纲：一个少年在海边发现神秘漩涡，唤醒了沉睡千年的龙族记忆。'")
          await ev("window.__pinia._s.get('project').setOutline(window.__pinia._s.get('project').outlineText)")
          outlineSet = true
          log.push({ step: 'set_outline_for_test' })
        }
        // Step 5: 点击 "AI生成全卷" 按钮
        await ev("document.getElementById('btn-pl-gen-volumes')?.click()")
        await ev("new Promise(r => setTimeout(r, 2000))", true)  // wait for generation
        log.push({ step: 'clicked_generate_volumes' })
        // Step 6: 读取调用计数
        const callCount = await ev("window.__callCount || 0")
        const callLog = await ev("JSON.stringify(window.__callLog || [])")
        log.push({ step: 'chain_call_count', count: callCount.result.value })
        log.push({ step: 'chain_call_log', entries: JSON.parse(callLog.result.value) })
        // Step 7: 重置, 切换 mode=compose, 再触发一次
        await ev("window.__callCount = 0; window.__callLog = []")
        await ev("document.getElementById('pl-s3-mode').value = 'compose'; document.getElementById('pl-s3-mode').dispatchEvent(new Event('change'))")
        await ev("new Promise(r => setTimeout(r, 200))", true)
        log.push({ step: 'switched_to_compose' })
        await ev("document.getElementById('btn-pl-gen-volumes')?.click()")
        await ev("new Promise(r => setTimeout(r, 2000))", true)
        log.push({ step: 'clicked_generate_volumes_compose' })
        const callCount2 = await ev("window.__callCount || 0")
        const callLog2 = await ev("JSON.stringify(window.__callLog || [])")
        log.push({ step: 'compose_call_count', count: callCount2.result.value })
        log.push({ step: 'compose_call_log', entries: JSON.parse(callLog2.result.value) })
        // Step 8: 恢复原始 callApi
        // (skip restore to avoid interference)
        const result = { log, chainCallCount: callCount.result.value, composeCallCount: callCount2.result.value, capturedAt: new Date().toISOString() }
        fs.mkdirSync('_audit/e2e', { recursive: true })
        fs.writeFileSync(OUT, JSON.stringify(result, null, 2), 'utf8')
        console.log('VERIFY_CHAIN_COMPOSE=' + OUT)
        console.log('CHAIN_CALL_COUNT=' + callCount.result.value)
        console.log('COMPOSE_CALL_COUNT=' + callCount2.result.value)
        ws.close()
      })()
    })
    ws.on('error', (e) => { console.error('WS_ERROR=' + e.message); process.exit(1) })
  })
})
