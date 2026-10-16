import { register } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Register before importing the sampler: static imports resolve before module evaluation.
const scriptDir = dirname(fileURLToPath(import.meta.url))
register(pathToFileURL(resolve(scriptDir, './style-profile-p0-ts-loader.mjs')).href, pathToFileURL(import.meta.url).href)
await import('./style-profile-p0-budget-account.mjs')
