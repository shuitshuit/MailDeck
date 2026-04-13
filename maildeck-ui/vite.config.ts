import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const isTauri = process.env.TAURI_ENV_TARGET_TRIPLE !== undefined

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    outDir: isTauri ? 'dist' : '/var/www/html',
    emptyOutDir: true,
  },
  server: {
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
})
