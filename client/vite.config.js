import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true
      }
    },
    // 確保能正確處理中文文件名
    fs: {
      strict: false
    }
  },
  // 確保 public 目錄的文件能正確訪問
  publicDir: 'public'
});
