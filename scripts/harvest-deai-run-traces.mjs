#!/usr/bin/env node
// Harvest raw model responses from historical body-layer run traces.
// Read-only against trace sources; writes only to the external DEAI corpus.

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import process from 'node:process'

const DEFAULT_TRACE_ROOT = 'C:/Users/凯瑞/Desktop/SKILL调试文件'
const DEFAULT_CORPUS_ROOT = 'D:/codex/deai-corpus'
const DEFAULT_REPORT_PATH = 'D:/codex/deai-corpus/calibration/reports/model-positive-harvest.json'
const START = Date.now()

const args = process.argv.slice(2)
const options = {
  traceRoot: path.resolve(args.find(a => a.startsWith('--trace-root='))?.slice(13) || DEFAULT_TRACE_ROOT),
  corpusRoot: path.resolve(args.find(a => a.startsWith('--corpus-root='))?.slice(14) || DEFAULT_CORPUS_ROOT),
  reportPath: path.resolve(args.find(a => a.startsWith('--report='))?.slice(9) || DEFAULT_REPORT_PATH),
  dryRun: args.includes('--dry-run')
}

const BODY_SKILLS = new Set(['KAI-S2', 'KAI-S3'])
const stats = {
  scannedTraceDirs: 0,
  bodyTraceDirs: 0,
  nonBodyTraceDirs: 0,
  apiCalls: 0,
  bodyApiCalls: 0,
  eligiblePhysicalCalls: 0,
  skipped: {},
  accepted: 0,
  duplicates: 0
}
const records = []
const seenIds = new Set()
const mergeStats = {
  preservedLabelCount: 0,
  preservedSampleCount: 0
}

function log(phase, data = {}) {
  console.log(JSON.stringify({ phase, elapsedMs: Date.now() - START, ...data }))
}

function fail(message, detail) {
  console.error(JSON.stringify({ phase: 'failed', message, detail: detail ? String(detail) : undefined }, null, 2))
  process.exitCode = 1
}

function skip(reason) {
  stats.skipped[reason] = (stats.skipped[reason] || 0) + 1
}

function normalizeId(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '-')
}

function providerId(trace, apiCall) {
  const candidate = trace.providerId || apiCall?.providerId || trace.providerName || apiCall?.providerName
  return normalizeId(candidate || 'unknown-provider').toLowerCase()
}

function modelId(value) {
  return String(value || 'unknown-model')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .toLowerCase()
}

function readJson(filePath) {
  const stat = fs.statSync(filePath, { throwIfNoEntry: false })
  if (!stat?.isFile()) throw new Error(`missing JSON file: ${filePath}`)
  if (stat.size > 64 * 1024 * 1024) throw new Error(`trace too large for whole-read: ${filePath} (${stat.size} bytes)`)
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function readPayload(traceDir, payloadRef) {
  if (!payloadRef) return null
  const match = /^payload-(\d+)$/.exec(payloadRef)
  if (!match) return null
  const ordinal = Number(match[1])
  const candidates = fs.readdirSync(path.join(traceDir, 'payloads'), { withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
    .filter(name => /^(\d+)-(.+)\.json$/.test(name))
    .filter(name => Number(name.slice(0, name.indexOf('-'))) === ordinal)
  if (candidates.length !== 1) return null
  return fs.readFileSync(path.join(traceDir, 'payloads', candidates[0]), 'utf8')
}

function readJsonlLines(filePath) {
  if (!fs.existsSync(filePath)) return []
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean)
}

function writeJsonlLines(filePath, lines) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${lines.join('\n')}${lines.length ? '\n' : ''}`, 'utf8')
}

function extractBodySkillId(apiCall) {
  return String(apiCall?.skillId || '').replace(/^folder:/, '')
}

function processTrace(traceDir, trace) {
  const apiCalls = Array.isArray(trace.apiCalls) ? trace.apiCalls : []
  stats.apiCalls += apiCalls.length
  for (const apiCall of apiCalls) {
    const skillId = extractBodySkillId(apiCall)
    if (!BODY_SKILLS.has(skillId)) {
      skip(`api-call-skill-not-body:${skillId || 'unknown'}`)
      continue
    }
    stats.bodyApiCalls += 1
    const physicalCalls = Array.isArray(apiCall.physicalCalls) ? apiCall.physicalCalls : []
    for (const physical of physicalCalls) {
      if (physical?.status !== 'success') {
        skip('physical-call-not-success')
        continue
      }
      const text = readPayload(traceDir, physical.responseTextPayloadRef)
      if (!text || !text.trim()) {
        skip('empty-or-missing-response-payload')
        continue
      }
      const sampleId = crypto.createHash('sha256')
        .update(`${trace.id}|${apiCall.id}|${physical.id}|${physical.responseTextPayloadRef}`)
        .digest('hex')
      if (seenIds.has(sampleId)) {
        stats.duplicates += 1
        continue
      }
      seenIds.add(sampleId)
      stats.eligiblePhysicalCalls += 1
      stats.accepted += 1
      records.push({
        id: sampleId,
        provider: providerId(trace, apiCall),
        model: modelId(trace.model || apiCall.model),
        timestamp: physical.endedAt || apiCall.endedAt || trace.startedAt || null,
        pipelineLayer: 'body',
        generationStep: skillId,
        skillTemplateVersion: apiCall.skillId,
        deaiPromptVariant: apiCall.deaiPromptVariant || null,
        attemptId: physical.physicalCallId || physical.id,
        tracePath: path.join(traceDir, 'run-trace.json'),
        payloadRef: physical.responseTextPayloadRef,
        charCount: text.replace(/\s/g, '').length,
        text
      })
    }
  }
}

function writeOutputs() {
  const byModel = {}
  for (const record of records) {
    const key = `${record.provider}/${record.model}`
    byModel[key] = (byModel[key] || 0) + 1
  }
  const report = {
    reportVersion: 1,
    generatedAt: new Date().toISOString(),
    traceRoot: options.traceRoot,
    corpusRoot: options.corpusRoot,
    stats,
    byModel,
    records: records.map(({ text, ...record }) => record)
  }

  fs.mkdirSync(path.dirname(options.reportPath), { recursive: true })
  fs.writeFileSync(options.reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  const labelPath = path.join(options.corpusRoot, 'labels', 'model-positive.jsonl')
  const existingLabelLines = readJsonlLines(labelPath)
  const existingLabelIds = new Set(existingLabelLines.map(line => JSON.parse(line).id))
  const newLabelLines = records
    .filter(record => !existingLabelIds.has(record.id))
    .map(({ text, ...record }) => JSON.stringify({
    id: record.id,
    label: 'model-positive',
    labelSource: 'historical-run-trace',
    authorization: 'confirmed',
    provider: record.provider,
    model: record.model,
    generationStep: record.generationStep,
    tracePath: record.tracePath,
    payloadRef: record.payloadRef,
    charCount: record.charCount
  }))
  mergeStats.preservedLabelCount = existingLabelLines.length
  writeJsonlLines(labelPath, [...existingLabelLines, ...newLabelLines])

  if (!options.dryRun) {
    for (const record of records) {
      const sampleDir = path.join(options.corpusRoot, 'sources', 'model', record.provider, record.model)
      const samplePath = path.join(sampleDir, 'samples.jsonl')
      fs.mkdirSync(sampleDir, { recursive: true })
      const sampleLines = readJsonlLines(samplePath)
      const existingIds = new Set(sampleLines.map(line => JSON.parse(line).id))
      if (!existingIds.has(record.id)) sampleLines.push(JSON.stringify(record))
      else mergeStats.preservedSampleCount += 1
      writeJsonlLines(samplePath, sampleLines)
    }

    const finalLabelLines = readJsonlLines(labelPath)
    const uniqueLabelIds = new Set(finalLabelLines.map(line => JSON.parse(line).id))
    if (uniqueLabelIds.size !== finalLabelLines.length) {
      throw new Error(`duplicate ids in ${labelPath}: ${finalLabelLines.length - uniqueLabelIds.size}`)
    }
    for (const record of records) {
      const samplePath = path.join(options.corpusRoot, 'sources', 'model', record.provider, record.model, 'samples.jsonl')
      const lines = readJsonlLines(samplePath)
      const uniqueIds = new Set(lines.map(line => JSON.parse(line).id))
      if (uniqueIds.size !== lines.length) {
        throw new Error(`duplicate ids in ${samplePath}: ${lines.length - uniqueIds.size}`)
      }
      if (!uniqueIds.has(record.id)) throw new Error(`missing harvested id ${record.id} in ${samplePath}`)
    }
  }
}

try {
  log('start', options)
  if (!fs.statSync(options.traceRoot, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`trace root not found: ${options.traceRoot}`)
  }
  const traceDirs = fs.readdirSync(options.traceRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name.startsWith('run-trace-'))
    .map(entry => path.join(options.traceRoot, entry.name))
    .sort()

  for (const traceDir of traceDirs) {
    stats.scannedTraceDirs += 1
    const tracePath = path.join(traceDir, 'run-trace.json')
    try {
      const trace = readJson(tracePath)
      if (trace.mode !== 'body' && trace.stepName !== '正文层') {
        stats.nonBodyTraceDirs += 1
        skip('trace-not-body-layer')
        continue
      }
      stats.bodyTraceDirs += 1
      processTrace(traceDir, trace)
    } catch (error) {
      skip(`trace-read-failed:${path.basename(traceDir)}`)
      console.error(`[harvest-deai-run-traces] trace failed: ${traceDir}: ${error.message}`)
    }
  }

  if (!options.dryRun) writeOutputs()
  log('finished', {
    ...stats,
    byModel: records.reduce((acc, r) => { const k = `${r.provider}/${r.model}`; acc[k] = (acc[k] || 0) + 1; return acc }, {}),
    ...mergeStats
  })
} catch (error) {
  fail(error.message, error.stack)
} finally {
  if (process.exitCode) log('failed')
}
