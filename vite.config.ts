import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // /api → service watchlist-api (Spring Boot, 127.0.0.1), en dev comme en `npm run preview`.
  // Même variable que le service (WATCHLIST_API_PORT dans .env), pour que les deux restent alignés.
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = `http://127.0.0.1:${env.WATCHLIST_API_PORT || '8080'}`

  return {
    plugins: [react()],
    server: { proxy: { '/api': apiTarget } },
    preview: { proxy: { '/api': apiTarget } },
  }
})
