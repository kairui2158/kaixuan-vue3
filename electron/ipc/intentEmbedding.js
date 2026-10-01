const path = require('node:path');
const fs = require('node:fs');
const log = require('electron-log/main');

const MODEL_ID = 'Xenova/bge-small-zh-v1.5';
const MODEL_DIR_NAME = 'bge-small-zh-v1.5';
const MAX_INPUT_LENGTH = 10000;
const MAX_BATCH_SIZE = 16;

let embeddingPipeline = null;
let loadingPromise = null;

function resolveModelPath() {
  const packagedPath = process.resourcesPath
    ? path.join(process.resourcesPath, 'models', MODEL_DIR_NAME)
    : null;
  const sourcePath = path.join(__dirname, '..', '..', 'resources', 'models', MODEL_DIR_NAME);
  const candidates = [packagedPath, sourcePath].filter(Boolean);
  const modelFile = 'tokenizer.json';
  const validPath = candidates.find((candidate) => fs.existsSync(path.join(candidate, modelFile)));
  if (validPath) return validPath;
  return candidates[0] || sourcePath;
}

function toFloatArray(input) {
  if (Array.isArray(input) && input.every((item) => typeof item === 'number')) {
    return Float32Array.from(input);
  }
  if (input instanceof Float32Array) {
    return input;
  }
  return null;
}

async function loadPipeline() {
  if (embeddingPipeline) {
    return embeddingPipeline;
  }
  if (!loadingPromise) {
    loadingPromise = (async () => {
      const transformers = await import('@huggingface/transformers');
      Object.assign(transformers.env, {
        allowRemoteModels: false,
        localModelPath: resolveModelPath(),
        cacheDir: resolveModelPath(),
      });
      const pipeline = await transformers.pipeline('feature-extraction', resolveModelPath(), {
        dtype: 'q8',
      });
      embeddingPipeline = pipeline;
      log.info('[intent-embedding] local model loaded', { model: MODEL_ID, dir: resolveModelPath() });
      return pipeline;
    })().catch((error) => {
      loadingPromise = null;
      log.error('[intent-embedding] model load failed', error);
      throw error;
    });
  }
  return loadingPromise;
}

async function embedTexts(texts) {
  if (!Array.isArray(texts) || texts.length === 0) {
    return { vectors: [], dims: 0 };
  }
  if (texts.length > MAX_BATCH_SIZE) {
    throw new Error(`embedding batch exceeds limit: ${texts.length}/${MAX_BATCH_SIZE}`);
  }
  if (texts.some((text) => typeof text !== 'string' || text.length > MAX_INPUT_LENGTH)) {
    throw new Error(`embedding input invalid: max length ${MAX_INPUT_LENGTH}`);
  }

  const pipeline = await loadPipeline();
  const outputs = [];
  for (const text of texts) {
    const output = await pipeline(text, { pooling: 'cls', normalize: true });
    const vector = toFloatArray(output.data);
    if (!vector || vector.length !== 512) {
      throw new Error(`embedding output invalid: ${vector ? vector.length : 'none'}`);
    }
    outputs.push(Array.from(vector));
  }
  return { vectors: outputs, dims: 512 };
}

function registerIntentEmbeddingHandlers() {
  const { ipcMain } = require('electron');

  ipcMain.handle('intent:embed', async function(_event, texts) {
    try {
      return await embedTexts(texts);
    } catch (error) {
      log.error('[intent-embedding] embed failed', error);
      return {
        error: error && error.message ? error.message : String(error),
        vectors: [],
        dims: 0,
      };
    }
  });

  ipcMain.handle('intent:embeddingStatus', function() {
    return {
      model: MODEL_ID,
      state: embeddingPipeline ? 'ready' : loadingPromise ? 'loading' : 'idle',
      maxBatchSize: MAX_BATCH_SIZE,
      maxInputLength: MAX_INPUT_LENGTH,
    };
  });

  ipcMain.handle('intent:embeddingWarmup', async function() {
    try {
      await loadPipeline();
      return { ok: true, state: embeddingPipeline ? 'ready' : 'unknown' };
    } catch (error) {
      return { ok: false, error: error && error.message ? error.message : String(error) };
    }
  });
}

module.exports = {
  MODEL_ID,
  MAX_BATCH_SIZE,
  MAX_INPUT_LENGTH,
  embedTexts,
  registerIntentEmbeddingHandlers,
  resolveModelPath,
};
