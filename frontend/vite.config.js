import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const isGitHubPages = process.env.GITHUB_PAGES === 'true'

export default defineConfig({
  plugins: [react()],
  base: isGitHubPages ? '/ai-news-digest/' : '/',
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
