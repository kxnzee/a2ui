import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist/lib',
    lib: { entry: 'src/a2ui/index.ts', formats: ['es'], fileName: 'index' },
    rolldownOptions: {
      external: id => /^(react|react-dom|antd|zod|zod-a2ui|@a2ui\/react|@a2ui\/web_core)(\/|$)/.test(id),
    },
  },
});
