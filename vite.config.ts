import {defineConfig} from 'vite';
import {turboWarpExtension} from '@kubohiroya/vite-plugin-turbowarp-extension';
import {extensionConfig} from './src/config.js';

export default defineConfig({
  plugins: [
    turboWarpExtension({
      id: extensionConfig.id,
      name: extensionConfig.name,
      description: extensionConfig.description,
      author: extensionConfig.author,
      license: extensionConfig.license,
      fileName: `${extensionConfig.slug}.js`
    })
  ]
});
