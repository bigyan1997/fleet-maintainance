import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/static/' : '/',
  build: {
    outDir: 'dist',
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8011',
        changeOrigin: true,
      },
    },
  },
}))
