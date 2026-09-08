import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    copyPublicDir: false,
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/services/providerProtocols.ts'),
      formats: ['cjs'],
      name: 'providerProtocols',
      fileName: () => 'providerProtocols.cjs',
    },
    outDir: 'dist-renderer',
  },
})
