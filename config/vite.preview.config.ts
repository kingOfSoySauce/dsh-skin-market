import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'src/preview',
  plugins: [react()],
  server: { host: '0.0.0.0', allowedHosts: ['terminal.local'] },
})
