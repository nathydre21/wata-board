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
        // Reduce verbose logging in development to minimize console noise
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            if (process.env.NODE_ENV !== 'production') {
              console.warn('Proxy error:', err.message);
            }
          });
          // Only log errors and important requests, not every request
          proxy.on('proxyReq', (_proxyReq, req, _res) => {
            // Skip logging for health checks and frequent requests
            if (req.url?.includes('/health') || req.url?.includes('/status')) {
              return;
            }
            if (process.env.VITE_VERBOSE_PROXY === 'true') {
              console.debug('API Request:', req.method, req.url);
            }
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
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom')) {
              return 'vendor';
            }
            if (id.includes('stellar')) {
              return 'stellar';
            }
            if (id.includes('react-router-dom')) {
              return 'router';
            }
            if (id.includes('i18next')) {
              return 'i18n';
            }
            return 'deps';
          }
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
