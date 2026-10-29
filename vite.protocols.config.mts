import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  build: {
    copyPublicDir: false,
    emptyOutDir: false,
    lib: {
      entry: {
        providerProtocols: fileURLToPath(new URL('./src/services/providerProtocols.ts', import.meta.url)),
        skillDeaiContractValidation: fileURLToPath(new URL('./src/services/skillDeaiContractValidation.ts', import.meta.url)),
      },
      formats: ['cjs'],
      name: 'providerProtocols',
      fileName: (format, entryName) => `${entryName}.cjs`,
    },
    outDir: 'dist-renderer',
  },
})
