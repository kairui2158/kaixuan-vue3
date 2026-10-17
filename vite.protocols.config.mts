import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  build: {
    copyPublicDir: false,
    emptyOutDir: false,
    lib: {
      entry: fileURLToPath(new URL('./src/services/providerProtocols.ts', import.meta.url)),
      formats: ['cjs'],
      name: 'providerProtocols',
      fileName: () => 'providerProtocols.cjs',
    },
    outDir: 'dist-renderer',
  },
})
