import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/cs2-stats-overlay/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        widget: resolve(__dirname, 'widget/index.html'),
      },
    },
  },
});
