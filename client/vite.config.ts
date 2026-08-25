import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  server: {
    port: 5173,
    // Dev only: forwards /api to the backend so the client can use a relative
    // base URL in both dev and production.
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },

  build: {
    outDir:    'dist',
    sourcemap: false,   // do not ship readable source to a public web root
    target:    'es2020',
    // Fail the build rather than quietly shipping a bundle too large to load
    // well over a shop's connection.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // jsPDF is only needed on the receipt/bill screens, and React only
        // changes between major upgrades — splitting both keeps the main
        // bundle small and cacheable across deploys.
        manualChunks: {
          react:  ['react', 'react-dom', 'react-router-dom'],
          pdf:    ['jspdf', 'jspdf-autotable'],
        },
      },
    },
  },
})
