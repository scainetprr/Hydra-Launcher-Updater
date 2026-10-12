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
  build: {
    minify: 'terser',
    terserOptions: { compress: { passes: 2 }, mangle: true },
    cssCodeSplit: true,
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      input: path.resolve(__dirname, 'app.html'),
      output: {
        manualChunks: { vendor: ['react', 'react-dom', 'zustand'] }
      }
    }
  },
  clearScreen: false,
  server: { port: 5173, strictPort: true }
})
