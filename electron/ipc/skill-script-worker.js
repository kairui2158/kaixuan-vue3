// Runs third-party folder SKILL scripts in a dedicated utility process.
// Even if a script escapes its VM sandbox, it cannot take down the main process.
const vm = require('vm')
const { parentPort } = process

const REQUEST_TIMEOUT_MS = 5000
const TEMPLATE_LIMIT = 20000

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function serializeResult(value) {
  if (value === undefined) return undefined
  try {
    return JSON.parse(JSON.stringify(value))
  } catch (_) {
    return String(value)
  }
}

async function runHook(hook, payload, timeoutMs) {
  if (!hook || typeof hook !== 'function') return undefined
  return await Promise.race([
    Promise.resolve(hook(payload)),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('脚本钩子执行超时')), timeoutMs)
    })
  ])
}

async function executeRequest(request) {
  const state = { templateOverride: '', logs: [] }
  const module = { exports: {} }
  const sandbox = {
    module,
    exports: module.exports,
    payload: request.payload || {},
    require: undefined,
    process: undefined,
    __dirname: undefined,
    console: {
      log: function() { state.logs.push(Array.from(arguments).map(String).join(' ')) },
      error: function() { state.logs.push(Array.from(arguments).map(String).join(' ')) }
    },
    api: {
      setTemplate: function(text) {
        if (typeof text !== 'string') return
        state.templateOverride = text.slice(0, TEMPLATE_LIMIT)
      },
      log: function(message) { state.logs.push(String(message)) }
    }
  }
  sandbox.global = sandbox

  const compiled = new vm.Script(request.script, { filename: 'real-skill-script.js' })
  compiled.runInNewContext(sandbox, {
    timeout: REQUEST_TIMEOUT_MS,
    breakOnSigint: true,
    microtaskMode: 'afterEvaluate'
  })

  const exported = isPlainObject(module.exports) ? module.exports : {}
  const availableHooks = Object.keys(exported).filter(function(name) {
    return typeof exported[name] === 'function'
  })
  if (availableHooks.length === 0) {
    const error = new Error('脚本没有导出 preProcess/postProcess/plan 等函数')
    error.code = 'script-empty-exports'
    throw error
  }

  const hookName = request.payload && typeof request.payload.hook === 'string'
    ? request.payload.hook
    : ''
  const hookResult = await runHook(
    hookName ? exported[hookName] : undefined,
    request.payload && request.payload.payload,
    REQUEST_TIMEOUT_MS
  )

  return {
    exports: {},
    availableHooks,
    hook: hookName,
    results: hookName ? { [hookName]: serializeResult(hookResult) } : {},
    templateOverride: state.templateOverride,
    logs: state.logs
  }
}

parentPort.on('message', async function(event) {
  const request = event.data || {}
  try {
    const result = await executeRequest(request)
    parentPort.postMessage({ id: request.id, ok: true, result })
  } catch (error) {
    parentPort.postMessage({
      id: request.id,
      ok: false,
      code: error && error.code ? error.code : 'script-failed',
      message: error && error.message ? error.message : String(error)
    })
  }
})
