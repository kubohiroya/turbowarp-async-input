import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';

const distributionUrls = [
  new URL('../dist/async-input.js', import.meta.url),
  new URL('../dist/composition.js', import.meta.url),
  new URL('../dist/types/composition.d.ts', import.meta.url)
];
const before = await Promise.all(distributionUrls.map((url) => readFile(url, 'utf8')));
const build = spawnSync('npm', ['run', 'build'], {stdio: 'inherit'});

if (build.status !== 0) {
  throw new Error(`Distribution build failed with status ${build.status ?? 'unknown'}.`);
}

const after = await Promise.all(distributionUrls.map((url) => readFile(url, 'utf8')));
if (after.some((contents, index) => contents !== before[index])) {
  throw new Error('dist outputs were out of date and have been regenerated.');
}

console.log('dist outputs are up to date.');
