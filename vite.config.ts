import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist/demo',
    rolldownOptions: {
      onwarn(warning, defaultHandler) {
        // Это обычное клиентское SPA; директивы React Server Components не нужны.
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE' && warning.message.includes('use client')) return;
        defaultHandler(warning);
      },
    },
  },
});
