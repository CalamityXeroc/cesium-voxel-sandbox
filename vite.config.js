import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  // 相对路径产物: 可部署到任意子目录(线上为个人网站的 /voxel/)
  base: './',
  server: {
    port: 3100,
    open: true,
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
  },
  optimizeDeps: {
    include: ['cesium'],
    esbuildOptions: {
      target: 'es2020',
    },
  },
});
