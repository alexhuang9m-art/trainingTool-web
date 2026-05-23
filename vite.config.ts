import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const bridgeTarget = process.env.VITE_BRIDGE_URL ?? 'http://127.0.0.1:3921'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: bridgeTarget,
        changeOrigin: true,
      },
    },
  },
})
