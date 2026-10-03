import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // <--- THIS FIXES THE ASSET PATHS
  server: {
    port: 3000,
    open: true
  }
});