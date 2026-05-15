import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Explicitly type the manual chunks to satisfy TypeScript
        manualChunks: (id) => {
          if (id.includes('node_modules/plotly.js-dist-min') || id.includes('node_modules/react-plotly.js')) {
            return 'plotly';
          }
        }
      }
    }
  }
})