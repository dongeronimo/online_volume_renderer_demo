import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // or true, or '0.0.0.0'
    port: 5173,      // optional: specify port
  }
})