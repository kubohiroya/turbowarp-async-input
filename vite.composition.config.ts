import {defineConfig} from 'vite';

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: 'src/composition.ts',
      formats: ['es'],
      fileName: () => 'composition.js'
    },
    minify: false,
    sourcemap: false,
    target: 'es2022'
  }
});
