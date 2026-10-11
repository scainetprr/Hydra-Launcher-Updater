import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import renderer from 'vite-plugin-electron-renderer'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            rollupOptions: {
              external: ['minecraft-launcher-core','axios','uuid','msmc','adm-zip','checksum','request']
            }
          }
        }
      },
      preload: { input: 'electron/preload.ts' },
      renderer: {}
    }),
    renderer()
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') }
  },
  clearScreen: false,
  server: { port: 5173, strictPort: true }
})
