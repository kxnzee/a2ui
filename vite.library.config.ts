import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist/lib',
    lib: {
      entry: { index: 'src/a2ui/index.ts', cards: 'src/a2ui/cards.tsx' },
      formats: ['es'],
      fileName: (_format, name) => `${name}.js`,
    },
    rolldownOptions: {
      external: id => /^(react|react-dom|antd|zod|zod-a2ui|@a2ui\/react|@a2ui\/web_core)(\/|$)/.test(id),
    },
  },
});
