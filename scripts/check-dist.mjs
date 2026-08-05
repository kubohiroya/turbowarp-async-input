import {spawnSync} from 'node:child_process';
const build = spawnSync('npm', ['run', 'build'], {stdio: 'inherit'});

if (build.status !== 0) {
  throw new Error(`Distribution build failed with status ${build.status ?? 'unknown'}.`);
}

const diff = spawnSync('git', ['diff', '--exit-code', '--', 'dist'], {stdio: 'inherit'});
if (diff.status !== 0) {
  throw new Error('dist outputs were out of date and have been regenerated.');
}

console.log('dist outputs are up to date.');
