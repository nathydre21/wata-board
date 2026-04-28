/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*',
        'dist/',
        'coverage/',
        'src/main.tsx',
        'src/vite-env.d.ts'
      ],
      thresholds: {
        global: {
          branches: 70,
          functions: 70,
          lines: 70,
          statements: 70
        },
        'src/components/': {
          branches: 75,
          functions: 75,
          lines: 75,
          statements: 75
        },
        'src/utils/': {
          branches: 85,
          functions: 85,
          lines: 85,
          statements: 85
        },
        'src/services/': {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        }
      },
      all: true,
      include: [
        'src/**/*.{ts,tsx}',
        '!src/**/*.d.ts',
        '!src/**/*.test.{ts,tsx}',
        '!src/**/*.spec.{ts,tsx}'
      ]
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../shared/src')
    }
  }
})
