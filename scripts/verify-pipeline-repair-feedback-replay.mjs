#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
if (args.length === 0) {
  console.error('Usage: node scripts/verify-pipeline-repair-feedback-replay.mjs <run-trace.json>')
  process.exit(2)
}

function readTrace(tracePath) {
  const raw = JSON.parse(fs.readFileSync(tracePath, 'utf8'))
  if (!raw || typeof raw !== 'object') throw new Error('run trace is not an object')
  return raw
}

function payloadId(value) {
  return value?.__payload?.id || null
}

function messageText(message) {
  if (!message) return ''
  if (typeof message.content === 'string') return message.content
  if (Array.isArray(message.content)) {
    return message.content.map(part => part?.text || '').join('\n')
  }
  return ''
}

function messagesOf(tracePath, value) {
  const ref = payloadId(value)
  if (ref) {
    const number = ref.replace(/^payload-/, '')
    const flatFile = path.join(path.dirname(tracePath), `${number}-request.json`)
    const payloadFile = path.join(path.dirname(tracePath), 'payloads', `${number}-request.json`)
    const file = fs.existsSync(flatFile) ? flatFile : payloadFile
    if (!fs.existsSync(file)) {
      const fixture = JSON.parse(fs.readFileSync(tracePath, 'utf8'))
      const strings = fixture.testRequestMessages?.[ref] || []
      return strings.map(content => ({ role: 'user', content }))
    }
    let parsed
    try {
      parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch {
      parsed = null
    }
    if (!parsed) {
      const fixture = JSON.parse(fs.readFileSync(path.join(path.dirname(tracePath), 'run-trace.json'), 'utf8'))
      const strings = fixture.testRequestMessages?.[ref] || []
      return strings.map(content => ({ role: 'user', content }))
    }
    return Array.isArray(parsed) ? parsed : parsed?.messages || []
  }
  return Array.isArray(value) ? value : value?.messages || []
}

function userText(messages) {
  return messages
    .filter(item => item?.role === 'user')
    .map(messageText)
    .join('\n')
}

function systemText(messages) {
  return messages
    .filter(item => item?.role === 'system')
    .map(messageText)
    .join('\n')
}

function messageLengths(tracePath, requestMessages) {
  return messagesOf(tracePath, requestMessages)
    .map(messageText)
    .filter(Boolean)
    .map(text => text.length)
}

function messageTexts(tracePath, requestMessages) {
  return messagesOf(tracePath, requestMessages).map(messageText).filter(Boolean)
}

function requestDigest(tracePath, requestMessages) {
  const messages = messagesOf(tracePath, requestMessages)
  const text = userText(messages)
  const system = systemText(messages)
  const userLength = messages
    .filter(item => item?.role === 'user')
    .map(messageText)
    .join('').length
  return {
    length: userLength,
    hasFeedback: text.includes('上一轮校验失败原因')
      || text.includes('请修正以下问题')
      || system.includes('上一次输出未通过校验')
      || system.includes('上一步输出与本步输出高度重复'),
    prefix: text.slice(0, 80)
  }
}

function eventsByType(trace, type) {
  return (trace.events || []).filter(event => event.type === type)
}

function parseDetail(detail) {
  if (typeof detail !== 'string') return detail || {}
  try {
    return JSON.parse(detail)
  } catch {
    return {}
  }
}

function analyze(tracePath, trace) {
  const findings = []
  const apiCalls = trace.apiCalls || []
  const folderDiagnostics = trace.folderDiagnostics || []

  apiCalls.forEach((call, index) => {
    const folder = folderDiagnostics[index]
    const diagnostics = folder?.diagnostics || []
    const schemaFailures = diagnostics.filter(item => item.code === 'schema-validation-failed')
    if (schemaFailures.length === 0) return

  const attempts = (call.physicalCalls || []).map(physical => requestDigest(tracePath, physical.requestMessages))
    const missingFeedbackAttempts = attempts.filter(item => !item.hasFeedback).length
    const repairableAttempts = attempts.slice(1)
    const missingRepairableFeedback = repairableAttempts.filter(item => !item.hasFeedback).length
    findings.push({
      key: 'schema-retry-feedback',
      status: missingRepairableFeedback === 0 ? 'PASS' : 'FAIL',
      detail: `${schemaFailures.length} schema failures, ${missingRepairableFeedback}/${repairableAttempts.length} retry requests lack feedback`
    })

    if (attempts.length > 1) {
      const lengths = attempts.map(item => item.length)
      const identicalBareRetry = new Set(lengths).size === 1 && missingFeedbackAttempts === attempts.length
      findings.push({
        key: 'repair-feedback',
        status: identicalBareRetry ? 'FAIL' : 'PASS',
        detail: identicalBareRetry
          ? `retry requests are identical bare retries (${lengths.join(', ')})`
          : 'retry requests vary or contain feedback'
      })
    }
  })

  const passInputs = eventsByType(trace, 'folder-pass-input')
    .map(event => ({ ...parseDetail(event.detail), ts: event.ts, seq: event.seq }))
  const slimEvents = eventsByType(trace, 'chain-context-slim')
  slimEvents.forEach(event => {
    const detail = parseDetail(event.detail)
    const step = Number(detail.stepIndex || String(event.label || '').match(/步骤\s*(\d+)\s*\//)?.[1] || 0)
    const call = apiCalls[step - 1]
    if (!call) return
    const callStart = Number(call.startedAt || 0)
    const callEnd = Number(call.endedAt || Number.MAX_SAFE_INTEGER)
    const pass = passInputs
      .filter(item => item.isRetry !== true && item.passIndex === 0)
      .find(item => {
        const passStart = Number(item.ts || 0)
        return passStart >= event.ts && passStart >= callStart && passStart <= callEnd
      })
    if (!pass) return
    const actual = Number(pass?.userPromptLength || 0)
    const actualSystem = Number(pass?.systemPromptLength || 0)
    const actualTotal = actual + actualSystem
    const attempts = (call.physicalCalls || []).map(item => requestDigest(tracePath, item.requestMessages))
    const physicalUser = attempts.length > 0 ? attempts[0].length : 0
    const physicalUserMatches = physicalUser > 0 && physicalUser === actual
    const physicalMessagesExported = attempts.every(item => item.length > 0)
    const declared = Number(detail.finalPromptLength || 0)
    const passInputLength = Number(pass.inputLength || 0)
    const upstreamMatches = Number.isFinite(declared) && declared >= 0
      && passInputLength >= declared
    const retryPasses = passInputs
      .filter(item => item.isRetry === true
        && Number(item.ts || 0) >= callStart && Number(item.ts || 0) <= callEnd)
    const retryFeedbackIsVisible = retryPasses
      .every(item => Number(item.systemPromptLength || 0) > 0)
    if (retryPasses.length === 0) {
      findings.push({
        key: 'retry-request-capture',
        status: 'PASS',
        detail: `step ${step} has no retry pass, first payload exported=${physicalMessagesExported}`
      })
    }
    const mismatch = !upstreamMatches
      || !physicalUserMatches
      || actualTotal <= 0
      || !physicalMessagesExported
      || !retryFeedbackIsVisible
    findings.push({
      key: 'request-caliber',
      status: mismatch ? 'FAIL' : 'PASS',
      detail: `step ${step} upstream ${declared} vs pass ${pass.inputLength}, user ${physicalUser} vs pass ${actual}, system ${actualSystem}, payloads exported=${physicalMessagesExported}, retry capture=${retryFeedbackIsVisible}`
    })
  })

  const echoEvents = eventsByType(trace, 'chain-output-echo')
  const repairEvents = eventsByType(trace, 'chain-output-echo-repair')
  echoEvents.forEach(event => {
    const detail = parseDetail(event.detail)
    const textRatio = Number(String(event.detail || '').match(/约\s*(\d+)%\s*重叠/)?.[1] || 0)
    const ratio = Number(detail.echoRatio || textRatio / 100 || 0)
    const needsRepair = ratio >= 0.85
    findings.push({
      key: 'echo-repair',
      status: needsRepair && repairEvents.length === 0 ? 'FAIL' : 'PASS',
      detail: `echo ratio ${ratio}, repair events ${repairEvents.length}`
    })
  })

  const passInputEvents = eventsByType(trace, 'folder-pass-input')
  passInputEvents.forEach(event => {
    const detail = parseDetail(event.detail)
    const required = ['inputMode', 'inputLength', 'userPromptLength', 'systemPromptLength']
    const missing = required.filter(key => detail[key] === undefined)
    if (missing.length > 0) {
      findings.push({
        key: 'pass-input-fields',
        status: 'FAIL',
        detail: `event ${event.seq || event.ts || '?'} misses ${missing.join(', ')}`
      })
    }
  })
  if (slimEvents.length > 0) {
    findings.push({
      key: 'pass-input-visibility',
      status: passInputEvents.length > 0 ? 'PASS' : 'FAIL',
      detail: `folder-pass-input events ${passInputEvents.length}`
    })
  }

  return findings
}

for (const tracePath of args) {
  const trace = readTrace(tracePath)
  const findings = analyze(tracePath, trace)
  const failures = findings.filter(item => item.status === 'FAIL')
  console.log(`${path.basename(path.dirname(tracePath))}:`)
  if (findings.length === 0) {
    console.log('  RESULT: SKIPPED (no repair-feedback-sensitive events)')
    continue
  }
  for (const item of findings) {
    console.log(`  ${item.key}: ${item.status} (${item.detail})`)
  }
  console.log(`  RESULT: ${failures.length === 0 ? 'ACCEPTED' : 'EXPECTED-FAIL'}`)
  if (failures.length > 0) process.exitCode = 1
}
