'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const SCHEMA_VERSION = 1;
const MAX_SAMPLES = 10000;
const MAX_INPUT_CHARS = 2000;

let dataDir = '';
let corpusDir = '';
let writeLock = Promise.resolve();

function setDataDir(dir) {
  dataDir = dir || '';
  corpusDir = dataDir ? path.join(dataDir, 'intent-corpus') : '';
}

function safeWorkspace(value) {
  return ['outline-workbench', 'home-editor', 'pipeline'].indexOf(value) >= 0 ? value : 'unknown';
}

function safeAnnotation(value) {
  return ['confirmed', 'inferred', 'observed'].indexOf(value) >= 0 ? value : 'observed';
}

function clampText(value, max) {
  if (typeof value !== 'string') return '';
  return value.length > max ? value.slice(0, max) : value;
}

function normalizeInput(value) {
  return clampText(String(value || ''), MAX_INPUT_CHARS).replace(/\s+/g, ' ').trim();
}

function inputHash(normalized, workspace, projectId) {
  return crypto.createHash('sha256')
    .update([safeWorkspace(workspace), String(projectId || ''), normalized].join('\n'))
    .digest('hex');
}

function sanitizeSample(input) {
  const normalized = normalizeInput(input && input.requestText);
  return {
    id: String((input && input.id) || crypto.randomUUID()),
    schemaVersion: SCHEMA_VERSION,
    capturedAt: Number((input && input.capturedAt) || Date.now()),
    projectId: clampText(input && input.projectId, 128),
    projectName: clampText(input && input.projectName, 160),
    workspace: safeWorkspace(input && input.workspace),
    runId: clampText(input && input.runId, 128),
    turnId: clampText(input && input.turnId, 128),
    requestText: normalized,
    routing: input && input.routing,
    annotation: safeAnnotation(input && input.annotation),
    annotationBasis: clampText(input && input.annotationBasis, 300),
    relatedTurnId: clampText(input && input.relatedTurnId, 128),
  };
}

function readJsonFile(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch (error) {
    return fallback;
  }
}

function readSamples(filePath) {
  const samples = [];
  const invalid = [];
  try {
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        const sample = sanitizeSample(JSON.parse(line));
        samples.push(sample);
      } catch (error) {
        invalid.push({ line: i + 1, message: String(error && error.message ? error.message : error) });
      }
    }
  } catch (error) {
    return { samples, invalid };
  }
  return { samples, invalid };
}

function loadCorpus() {
  if (!corpusDir) return null;
  fs.mkdirSync(corpusDir, { recursive: true });
  return readSamples(path.join(corpusDir, 'samples.jsonl'));
}

function writeAtomic(filePath, contents) {
  const tempPath = filePath + '.tmp';
  fs.writeFileSync(tempPath, contents, 'utf8');
  fs.renameSync(tempPath, filePath);
}

function persistCorpus(samples, invalidCount) {
  fs.mkdirSync(corpusDir, { recursive: true });
  const lines = samples.map((sample) => JSON.stringify(sample));
  writeAtomic(path.join(corpusDir, 'samples.jsonl'), lines.length ? lines.join('\n') + '\n' : '');

  const index = {};
  for (const sample of samples) {
    index[inputHash(sample.requestText, sample.workspace, sample.projectId)] = sample.id;
  }
  writeAtomic(path.join(corpusDir, 'index.json'), JSON.stringify(index, null, 2));

  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    kind: 'intent-corpus',
    sampleCount: samples.length,
    maxSamples: MAX_SAMPLES,
    invalidLinesIgnored: invalidCount,
    lastWrittenAt: Date.now(),
  };
  writeAtomic(path.join(corpusDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

async function appendSamples(inputs) {
  if (!Array.isArray(inputs) || inputs.length === 0) return { success: true, appended: 0 };
  if (!corpusDir) return { success: false, reason: '数据目录未初始化' };
  const write = writeLock.catch(() => undefined).then(() => {
    const loaded = loadCorpus();
    const invalidCount = loaded.invalid.length;
    const byId = new Map(loaded.samples.map((sample) => [sample.id, sample]));
    const byHash = new Map();
    for (const sample of loaded.samples) {
      byHash.set(inputHash(sample.requestText, sample.workspace, sample.projectId), sample);
    }
    for (const rawInput of inputs) {
      const sample = sanitizeSample(rawInput);
      if (!sample.requestText) continue;
      byId.delete(sample.id);
      const hash = inputHash(sample.requestText, sample.workspace, sample.projectId);
      const previous = byHash.get(hash);
      if (previous) byId.delete(previous.id);
      byId.set(sample.id, sample);
      byHash.set(hash, sample);
    }
    let samples = Array.from(byId.values()).sort((a, b) => a.capturedAt - b.capturedAt);
    if (samples.length > MAX_SAMPLES) samples = samples.slice(samples.length - MAX_SAMPLES);
    const manifest = persistCorpus(samples, invalidCount);
    return {
      success: true,
      appended: inputs.length,
      sampleCount: manifest.sampleCount,
      deduplicated: loaded.samples.length + inputs.length - samples.length,
    };
  });
  writeLock = write.catch(() => undefined);
  return write;
}

async function status() {
  if (!corpusDir) return { success: false, reason: '数据目录未初始化' };
  const loaded = loadCorpus();
  const manifest = readJsonFile(path.join(corpusDir, 'manifest.json'), null);
  return {
    success: true,
    dir: corpusDir,
    sampleCount: loaded.samples.length,
    maxSamples: MAX_SAMPLES,
    schemaVersion: SCHEMA_VERSION,
    manifest,
    invalidLines: loaded.invalid.length,
  };
}

function exportPackage(options) {
  if (!corpusDir) return { success: false, reason: '数据目录未初始化' };
  const loaded = loadCorpus();
  const includeGlobal = Boolean(options && options.includeGlobal);
  const projectId = options && options.projectId ? String(options.projectId) : '';
  const samples = loaded.samples.filter(function(sample) {
    if (includeGlobal) return true;
    return Boolean(projectId) && sample.projectId === projectId;
  });
  return {
    success: true,
    package: {
      schema: 'shenyi.intent-corpus-package',
      version: 1,
      generatedAt: Date.now(),
      scope: includeGlobal ? 'global' : 'project',
      projectId: projectId || undefined,
      sampleCount: samples.length,
      samples: samples,
    },
  };
}

function registerIntentCorpusHandlers() {
  const { ipcMain } = require('electron');
  ipcMain.handle('intentCorpus:append', async function(_event, payload) {
    try {
      return await appendSamples(payload && payload.samples);
    } catch (error) {
      return { success: false, reason: String(error && error.message ? error.message : error) };
    }
  });
  ipcMain.handle('intentCorpus:status', async function() {
    try {
      return await status();
    } catch (error) {
      return { success: false, reason: String(error && error.message ? error.message : error) };
    }
  });
  ipcMain.handle('intentCorpus:exportPackage', async function(_event, payload) {
    try {
      return exportPackage(payload || {});
    } catch (error) {
      return { success: false, reason: String(error && error.message ? error.message : error) };
    }
  });
}

module.exports = {
  SCHEMA_VERSION,
  MAX_SAMPLES,
  MAX_INPUT_CHARS,
  setDataDir,
  appendSamples,
  status,
  registerIntentCorpusHandlers,
};
