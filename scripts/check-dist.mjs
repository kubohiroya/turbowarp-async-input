import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';

const distributionUrl = new URL('../dist/async-input.js', import.meta.url);
const before = await readFile(distributionUrl, 'utf8');
const build = spawnSync('npm', ['run', 'build'], {stdio: 'inherit'});

if (build.status !== 0) {
  throw new Error(`Distribution build failed with status ${build.status ?? 'unknown'}.`);
}

const after = await readFile(distributionUrl, 'utf8');
if (after !== before) {
  throw new Error('dist/async-input.js was out of date and has been regenerated.');
}

console.log('dist/async-input.js is up to date.');
