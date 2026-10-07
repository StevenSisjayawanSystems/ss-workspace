import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // host: true exposes the dev server on the LAN for testing on a phone
  server: { host: true, port: 5273, strictPort: true },
})
