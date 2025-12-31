const { defineConfig } = require('vite');

module.exports = defineConfig({
  root: 'public',
  base: '/',
  // Our project already uses "public/" as the source root.
  // Disable Vite's publicDir copy behavior to avoid looking for public/public.
  publicDir: false,
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
