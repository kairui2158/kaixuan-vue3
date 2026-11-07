import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import type { Plugin } from 'vite'
import { dirname } from 'node:path'

function readGitCommit(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

function readAppVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(
      fileURLToPath(new URL('./package.json', import.meta.url)),
      'utf8'
    )) as { version?: unknown }
    return typeof pkg.version === 'string' && pkg.version.trim() ? pkg.version.trim() : 'unknown'
  } catch {
    return 'unknown'
  }
}

function createBuildManifest(): { schemaVersion: number; commit: string; buildTime: string; appVersion: string } {
  const manifest = {
    schemaVersion: 1,
    commit: readGitCommit(),
    buildTime: new Date().toISOString(),
    appVersion: readAppVersion(),
  }
  return manifest
}

function buildManifestPlugin(manifest: { schemaVersion: number; commit: string; buildTime: string; appVersion: string }): Plugin {
  const manifestPath = fileURLToPath(new URL('./dist-renderer/build-manifest.json', import.meta.url))
  return {
    name: 'shenyi-build-manifest',
    closeBundle() {
      mkdirSync(dirname(manifestPath), { recursive: true })
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
    }
  }
}

export default defineConfig(({ mode }) => {
  const manifest = createBuildManifest()
  const buildManifest = mode === 'test' ? '' : JSON.stringify(manifest)
  return {
    plugins: mode === 'test' ? [vue()] : [vue(), buildManifestPlugin(manifest)],
    base: './',
    define: {
      __SHENYI_BUILD_MANIFEST__: JSON.stringify(buildManifest),
      'import.meta.env.VITE_ENABLE_TEST_HOOKS': mode === 'test' ? JSON.stringify('1') : 'undefined',
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    optimizeDeps: {
      exclude: ['electron-log']
    },
    build: {
      rollupOptions: {
        external: ['electron-log']
      },
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: 'g6',
                test: /[\\/]node_modules[\\/]@antv[\\/]g6[\\/]/,
                priority: 10,
                minSize: 20000
              }
            ]
          }
        }
      },
      outDir: 'dist-renderer'
    },
    server: {
      port: 5173,
      strictPort: true
    },
    test: {
      include: [
        'src/**/*.{test,spec}.{js,ts,jsx,tsx}',
        'electron/**/*.spec.js'
      ],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/dist-renderer/**',
        '**/cypress/**',
        '**/.{idea,git,cache,output,temp}/**',
        '_audit/**',
        'scripts/tests/**'
      ]
    }
  }
})
