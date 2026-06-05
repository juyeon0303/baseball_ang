import { defineConfig } from 'vite';

const stockSubpath = process.env.STOCK_BASE === 'stock';

export default defineConfig({
  base: stockSubpath ? '/stock/' : '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/amm': 'http://localhost:3000',
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
      },
    },
  },
});