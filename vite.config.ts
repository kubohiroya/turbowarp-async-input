import {defineConfig} from 'vite';
import {turboWarpExtension} from '@kubohiroya/vite-plugin-turbowarp-extension';

export default defineConfig({
  plugins: [
    turboWarpExtension({
      id: 'twAsyncInput',
      name: 'Async Input',
      description: 'Bind keyboard and current-sprite pointer input to Temporary Variables runtime variables.',
      author: 'Hiroya Kubo',
      license: 'MPL-2.0',
      fileName: 'async-input.js'
    })
  ]
});
