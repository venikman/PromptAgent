import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/PromptAgent/',  // GitHub Pages base path
  plugins: [react()],
  server: {
    proxy: {
      '/api/lmstudio': {
        target: 'http://localhost:1234',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/lmstudio/, '/v1'),
      },
    },
  },
})
