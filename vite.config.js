import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
    proxy: {
      // All /api-gw/* requests are proxied to Spring Boot at 8080
      // Vite strips the /api-gw prefix and forwards the rest
      // This completely bypasses CORS — the browser never sees cross-origin requests
      '/api-gw': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-gw/, ''),
        secure: false,
      }
    }
  }
})
