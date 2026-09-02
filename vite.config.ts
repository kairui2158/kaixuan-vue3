import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  base: './',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
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
  }
})
