import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  
  // CDN configuration for production
  base: process.env.NODE_ENV === 'production' 
    ? process.env.CDN_BASE_URL || 'https://cdn.wata-board.com'
    : '/',
  server: {
    port: 5173,
    host: true,
    proxy: {
      // Proxy API requests to the backend server during development
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Sending Request to the Target:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
          });
        },
      }
    }
  },
  build: {
    // Ensure proper CORS handling in production builds
    rollupOptions: {
      output: {
        // Add content hash to filenames for cache busting
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash].[ext]',
        manualChunks: {
          vendor: ['react', 'react-dom'],
          stellar: ['@stellar/stellar-sdk', '@stellar/freighter-api'],
          router: ['react-router-dom'],
          ui: ['@tailwindcss/vite', 'tailwindcss'],
          utils: ['react-i18next', 'i18next', 'i18next-browser-languagedetector']
        }
      }
    },
    // Optimize for low-end devices
    chunkSizeWarningLimit: 1000,
    assetsInlineLimit: 4096,
    minify: 'terser',
    sourcemap: false,
    // Enable tree shaking
    target: 'es2015',
    // Optimize for mobile
    cssCodeSplit: true,
    // CDN optimization settings
    cssTarget: 'chrome61',
    // Enable asset optimization
    assetsDir: 'assets',
    // Generate manifest for CDN
    manifest: true
  },
})
