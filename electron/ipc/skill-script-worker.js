// Runs third-party folder SKILL scripts in a dedicated utility process.
// Even if a script escapes its VM sandbox, it cannot take down the main process.
const vm = require('vm')
const workerThreads = (() => {
  try {
    return require('worker_threads')
  } catch (_) {
    return {}
  }
})()
const parentPort = process.parentPort || workerThreads.parentPort

const REQUEST_TIMEOUT_MS = 5000
const TEMPLATE_LIMIT = 20000
const LOG_LIMIT = 1000
const STDIO_LIMIT = 256 * 1024

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

function makeLogSink(target) {
  return function() {
    target.push(Array.from(arguments).map(String).join(' '))
    if (target.length > LOG_LIMIT) target.shift()
  }
}

function makeStdioSink(target) {
  return function(text) {
    if (typeof text !== 'string') return
    target.push(text)
    if (target.length > LOG_LIMIT) target.shift()
  }
}

function makeConsoleSink(target) {
  return function() {
    target.push(Array.from(arguments).map(String).join(' ') + '\n')
    if (target.length > LOG_LIMIT) target.shift()
  }
}

function decodeStructuredOutput(text) {
  if (typeof text !== 'string' || !text.trim()) return null
  try {
    const parsed = JSON.parse(text)
    return isPlainObject(parsed) ? parsed : null
  } catch (_) {
    return null
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
  const state = { templateOverride: '', logs: [], stdout: [], stderr: [] }
  const module = { exports: {} }
  const sandbox = {
    module,
    exports: module.exports,
    payload: request.payload || {},
    require: undefined,
    process: undefined,
    __dirname: undefined,
    console: {
      log: makeLogSink(state.logs),
      info: makeLogSink(state.logs),
      warn: makeLogSink(state.logs),
      error: makeConsoleSink(state.stderr)
    },
    stdout: {
      write: function(text) {
        if (typeof text !== 'string') return true
        state.stdout.push(text)
        return true
      }
    },
    stderr: {
      write: function(text) {
        if (typeof text !== 'string') return true
        state.stderr.push(text)
        return true
      }
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
  const hookName = request.payload && typeof request.payload.hook === 'string'
    ? request.payload.hook
    : ''
  if (availableHooks.length === 0 && hookName !== 'postProcess') {
    const error = new Error('脚本没有导出 preProcess/postProcess/plan 等函数')
    error.code = 'script-empty-exports'
    throw error
  }
  const hookResult = await runHook(
    hookName ? exported[hookName] : undefined,
    request.payload && request.payload.payload,
    REQUEST_TIMEOUT_MS
  )

  const stdoutText = state.stdout.join('').slice(0, STDIO_LIMIT)
  const stderrText = state.stderr.join('').slice(0, STDIO_LIMIT)
  const structuredOutput = hookName === 'postProcess'
    ? decodeStructuredOutput(stdoutText)
    : null
  const result = {
    exports: {},
    availableHooks,
    hook: hookName,
    results: hookName
      ? { [hookName]: serializeResult(hookResult !== undefined ? hookResult : structuredOutput) }
      : {},
    templateOverride: state.templateOverride,
    logs: state.logs,
    stdout: stdoutText,
    stderr: stderrText,
    exitCode: 0,
    structuredOutput: structuredOutput !== null
  }
  if (hookName === 'postProcess' && structuredOutput !== null && hookResult === undefined) {
    result.consumedStructuredOutput = true
  }
  return result
}

parentPort.on('message', async function(event) {
  // Electron utilityProcess wraps payloads as event.data; worker_threads emits raw values.
  const request = event && typeof event === 'object' && event.data !== undefined && event.id === undefined
    ? event.data
    : event
  if (!request || typeof request !== 'object') return
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
