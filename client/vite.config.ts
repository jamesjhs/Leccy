import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const { version } = JSON.parse(
  readFileSync(resolve(__dirname, 'package.json'), 'utf-8')
) as { version: string }

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:2030',
        changeOrigin: true,
      }
    }
  },
  build: {
    target: 'es2020',
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          'router': ['react-router-dom'],
        },
      },
    },
  },
})
