import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export async function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith('.') && !specifier.startsWith('file:')) {
    return nextResolve(specifier, context)
  }
  try {
    return await nextResolve(specifier, context)
  } catch (error) {
    const parentPath = context.parentURL ? fileURLToPath(context.parentURL) : process.cwd()
    const target = path.resolve(path.dirname(parentPath), specifier)
    for (const suffix of ['.ts', '/index.ts']) {
      const candidate = target + suffix
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return { url: pathToFileURL(candidate).href, shortCircuit: true, format: 'module-typescript' }
      }
    }
    throw error
  }
}
