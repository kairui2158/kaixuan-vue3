import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  base: './',
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
})
