import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Avoid CORS: browser talks to same origin, Vite forwards to Cloud Run
      '/api': {
        target: 'https://clipora-api-594534640965.us-east1.run.app',
        changeOrigin: true,
      },
    },
  },
})
