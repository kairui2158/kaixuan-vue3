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
  build: {
    outDir: 'dist-renderer',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'src/main.ts')
    }
  },
  server: {
    port: 5173,
    strictPort: true
  }
})
