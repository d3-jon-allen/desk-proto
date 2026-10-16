import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages serves from https://d3-jon-allen.github.io/desk-proto/
  base: process.env.GITHUB_PAGES === 'true' ? '/desk-proto/' : '/',
  server: { port: 5177, open: true },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        gallery: resolve(__dirname, 'gallery.html'),
      },
    },
  },
});
