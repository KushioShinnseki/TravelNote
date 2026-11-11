import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
export default defineConfig({
  root: fileURLToPath(new URL('./web', import.meta.url)),
  base: './', plugins: [vue()],
  cacheDir: fileURLToPath(new URL('../../../node_modules/.vite-local', import.meta.url)),
  build: { target: 'es2020', outDir: '../app/src/main/assets', emptyOutDir: true }
})
