 import { ref } from 'vue'
 
 /**
  * 防断网6层机制 — 从旧架构renderer_v2.js _aiRequest (L2317-2513) 完整迁移
  * 1. API重试: 8次递增 2s→4s→6s→8s→10s→12s→15s→20s
  * 2. 429/502/503自动重试
  * 3. 400自适应: max_tokens自动减半重试
  * 4. 流式空闲检测: 15秒无数据触发idle_timeout, 3次后降到10秒
  * 5. 心跳恢复: 所有重试耗尽后, 每60秒探测API恢复, 恢复后重建reader
  * 6. 暂停/恢复 + 超时控制: AbortSignal.timeout(600s) + AbortSignal.any
  */
 
 interface AiRequestConfig {
   baseUrl: string
   apiKey: string
   model: string
   messages: Array<{ role: string; content: string }>
   temperature?: number
   maxTokens?: number
   stream?: boolean
   signal?: AbortSignal
   timeoutMs?: number
   retry?: boolean
   onChunk?: (text: string) => void
   onReasoning?: (text: string) => void
   onUsage?: (usage: any) => void
   onPause?: () => Promise<void>
 }
 
 interface AiRequestResult {
   text: string
   reasoning: string
 }
 
 const RETRY_DELAYS = [2000, 4000, 6000, 8000, 10000, 12000, 15000, 20000, 25000, 30000, 35000, 40000, 45000, 50000, 55000, 60000, 65000, 70000, 75000, 80000]
 const MAX_RETRIES = 8
 const DEFAULT_TIMEOUT = 600000
 const IDLE_THRESHOLD = 15000
 const IDLE_THRESHOLD_LOW = 10000
 const HEARTBEAT_INTERVAL = 60000
 
 export function useAiRequest() {
   const isPaused = ref(false)
   const isLoading = ref(false)
   let _resumeResolver: (() => void) | null = null
   let _cancelController: AbortController | null = null
 
   function pause() {
     isPaused.value = true
   }
 
   function resume() {
     isPaused.value = false
     if (_resumeResolver) {
       _resumeResolver()
       _resumeResolver = null
     }
   }
 
   async function _waitIfPaused() {
     if (!isPaused.value) return
     await new Promise<void>(resolve => { _resumeResolver = resolve })
   }
 
   function cancel() {
     if (_cancelController) {
       _cancelController.abort()
       _cancelController = null
     }
   }
 
   async function aiRequest(cfg: AiRequestConfig): Promise<AiRequestResult> {
     isLoading.value = true
     _cancelController = new AbortController()
 
     const reqBody: any = {
       model: cfg.model,
       messages: cfg.messages,
       stream: cfg.stream !== false
     }
let _mt = cfg.maxTokens && cfg.maxTokens > 0 ? cfg.maxTokens : 128000
reqBody.max_tokens = _mt
     if (cfg.temperature != null) reqBody.temperature = cfg.temperature
 
     const timeoutMs = cfg.timeoutMs || DEFAULT_TIMEOUT
     const doRetry = cfg.retry !== false
     const maxRetries = doRetry ? MAX_RETRIES : 0
     let lastErr: Error | null = null
     let _reqBaseUrl = cfg.baseUrl
     let _reqApiKey = cfg.apiKey
 
     for (let attempt = 0; attempt <= maxRetries; attempt++) {
       try {
         const signal = cfg.signal
           ? AbortSignal.any([cfg.signal, _cancelController!.signal, AbortSignal.timeout(timeoutMs)])
           : AbortSignal.any([_cancelController!.signal, AbortSignal.timeout(timeoutMs)])
 
         const resp = await fetch(_reqBaseUrl + '/chat/completions', {
           method: 'POST',
           headers: { 'Authorization': 'Bearer ' + _reqApiKey, 'Content-Type': 'application/json' },
           body: JSON.stringify(reqBody),
           signal
         })
 
         if (!resp.ok) {
           // Layer 2: 429/502/503 auto-retry
           if (doRetry && (resp.status === 429 || resp.status === 502 || resp.status === 503) && attempt < maxRetries) {
             console.warn('[WARN] aiRequest got ' + resp.status + ', retry ' + (attempt + 1) + '/' + maxRetries)
             await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]))
             lastErr = new Error('HTTP ' + resp.status)
             continue
           }
           // Layer 3: 400 adaptive max_tokens halving
           if (resp.status === 400 && reqBody.max_tokens && reqBody.max_tokens > 1024 && attempt < maxRetries) {
             try {
               const errBody = await resp.clone().json()
               const errStr = JSON.stringify(errBody).toLowerCase()
               if (errStr.includes('max_tokens') || errStr.includes('max output') || errStr.includes('maximum') || errStr.includes('too large') || errStr.includes('token')) {
                 reqBody.max_tokens = Math.floor(reqBody.max_tokens / 2)
                 console.warn('[WARN] 400 max_tokens halved to ' + reqBody.max_tokens + ', retry ' + (attempt + 1) + '/' + maxRetries)
                 await new Promise(r => setTimeout(r, 1000))
                 continue
               }
             } catch { /* body not JSON, try halving anyway */ }
             reqBody.max_tokens = Math.floor(reqBody.max_tokens / 2)
             console.warn('[WARN] 400 error, halving max_tokens to ' + reqBody.max_tokens + ', retry ' + (attempt + 1) + '/' + maxRetries)
             await new Promise(r => setTimeout(r, 1000))
             continue
           }
           const errMap: Record<number, string> = { 400: '请求参数错误', 401: 'API Key 无效', 403: '访问被禁止', 404: '接口不存在', 429: '请求太频繁', 500: '服务器内部错误' }
           throw new Error(errMap[resp.status] || 'HTTP ' + resp.status)
         }
 
         // Non-stream response
         if (cfg.stream === false) {
           const data = await resp.json()
           const msg = data.choices?.[0]?.message || {}
           let text = msg.content || ''
           const reasoning = msg.reasoning_content || ''
           if (!text && reasoning) text = reasoning
           if (data.usage && cfg.onUsage) cfg.onUsage(data.usage)
           if (cfg.onChunk) cfg.onChunk(text)
           isLoading.value = false
           return { text, reasoning }
         }
 
         // Stream response with Layer 4: idle detection
         const reader = resp.body!.getReader()
         const decoder = new TextDecoder()
         let fullText = ''
         let reasoningText = ''
         let buffer = ''
         let _idleCount = 0
         let _idleThreshold = IDLE_THRESHOLD
 
         while (true) {
           let _idleTimer: any = null
           const _idlePromise = new Promise(resolve => { _idleTimer = setTimeout(() => resolve('idle'), _idleThreshold) })
           const _chunkPromise = reader.read().then(c => ({ type: 'chunk', data: c }))
           const _raceResult: any = await Promise.race([_chunkPromise, _idlePromise])
           if (_idleTimer) clearTimeout(_idleTimer)
 
           if (_raceResult === 'idle') {
             _idleCount++
             console.warn('[WARN] Stream idle ' + _idleCount + ' times (' + _idleThreshold + 'ms)')
             if (_idleCount >= 3) _idleThreshold = IDLE_THRESHOLD_LOW
             try { await reader.cancel() } catch {}
             throw new Error('stream_idle_timeout: no data for ' + _idleThreshold + 'ms (idle: ' + _idleCount + ')')
           }
 
           const chunk = _raceResult.data
           if (chunk.done) break
 
           // Layer 6: pause/resume
           if (cfg.onPause) await cfg.onPause()
           await _waitIfPaused()
 
           buffer += decoder.decode(chunk.value, { stream: true })
           const lines = buffer.split('\n')
           buffer = lines.pop() || ''
           for (const line of lines) {
             const trimmed = line.trim()
             if (!trimmed || !trimmed.startsWith('data: ')) continue
             const d = trimmed.slice(6)
             if (d === '[DONE]') continue
             try {
               const json = JSON.parse(d)
               const delta = json.choices?.[0]?.delta || {}
               const contentDelta = delta.content || null
               const reasoningDelta = delta.reasoning_content || null
               if (reasoningDelta) { reasoningText += reasoningDelta; if (cfg.onReasoning) cfg.onReasoning(reasoningText) }
               if (contentDelta) { fullText += contentDelta; if (cfg.onChunk) cfg.onChunk(fullText) }
             } catch {}
           }
         }
 
         if (!fullText && reasoningText) fullText = reasoningText
         isLoading.value = false
         return { text: fullText, reasoning: reasoningText }
 
       } catch (e: any) {
         if (cfg.signal?.aborted || _cancelController?.signal.aborted) { isLoading.value = false; throw e }
         if (e.name === 'TimeoutError' || e.name === 'AbortError') {
           lastErr = e
           if (doRetry && attempt < maxRetries) {
             console.warn('[WARN] aiRequest retry ' + (attempt + 1) + '/' + maxRetries)
             await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]))
             continue
           }
           isLoading.value = false
           throw e
         }
         lastErr = e
         const _noRetry = e.message.includes('API Key') || e.message.includes('访问被禁止') || e.message.includes('接口不存在')
         if (doRetry && attempt < maxRetries && !_noRetry) {
           console.warn('[WARN] aiRequest ' + e.message + ', retry ' + (attempt + 1) + '/' + maxRetries)
           await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]))
           continue
         }
         break
       }
     }
 
     // Layer 5: Heartbeat reconnection
     if (doRetry && lastErr) {
       console.warn('[WARN] All ' + maxRetries + ' retries exhausted, entering heartbeat mode (60s intervals)')
       let hbAttempt = 0
       while (true) {
         hbAttempt++
         await new Promise(r => setTimeout(r, HEARTBEAT_INTERVAL))
         console.log('[HEARTBEAT] Probe attempt ' + hbAttempt + '...')
         try {
           const hbSignal = AbortSignal.timeout(timeoutMs)
           const hbResp = await fetch(_reqBaseUrl + '/chat/completions', {
             method: 'POST',
             headers: { 'Authorization': 'Bearer ' + _reqApiKey, 'Content-Type': 'application/json' },
             body: JSON.stringify(reqBody),
             signal: hbSignal
           })
           if (hbResp.ok) {
             console.log('[HEARTBEAT] API recovered on attempt ' + hbAttempt)
             if (cfg.stream !== false) {
               const hbReader = hbResp.body!.getReader()
               const hbDecoder = new TextDecoder()
               let hbFullText = ''
               let hbReasoning = ''
               let hbBuffer = ''
               while (true) {
                 const hbChunk = await hbReader.read()
                 if (hbChunk.done) break
                 hbBuffer += hbDecoder.decode(hbChunk.value, { stream: true })
                 const hbLines = hbBuffer.split('\n')
                 hbBuffer = hbLines.pop() || ''
                 for (const hbLine of hbLines) {
                   const trimmed = hbLine.trim()
                   if (!trimmed || !trimmed.startsWith('data: ')) continue
                   const hbD = trimmed.slice(6)
                   if (hbD === '[DONE]') continue
                   try {
                     const hbJson = JSON.parse(hbD)
                     const hbDelta = hbJson.choices?.[0]?.delta || {}
                     if (hbDelta.reasoning_content) { hbReasoning += hbDelta.reasoning_content; if (cfg.onReasoning) cfg.onReasoning(hbReasoning) }
                     if (hbDelta.content) { hbFullText += hbDelta.content; if (cfg.onChunk) cfg.onChunk(hbFullText) }
                   } catch {}
                 }
               }
               if (!hbFullText && hbReasoning) hbFullText = hbReasoning
               isLoading.value = false
               return { text: hbFullText, reasoning: hbReasoning }
             }
           }
         } catch (hbErr: any) {
           console.warn('[HEARTBEAT] Probe ' + hbAttempt + ' failed: ' + hbErr.message)
         }
       }
     }
 
     isLoading.value = false
     throw lastErr || new Error('aiRequest failed')
   }
 
   return { aiRequest, isPaused, isLoading, pause, resume, cancel }
 }
