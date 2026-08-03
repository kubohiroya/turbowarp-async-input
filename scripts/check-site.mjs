import {access, readFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const pages = [
  {path: 'docs/index.html', language: 'en'},
  {path: 'docs/ja/index.html', language: 'ja'}
];
const errors = [];

await access(resolve(repositoryRoot, 'docs/.nojekyll'));

for (const page of pages) {
  const absolutePath = resolve(repositoryRoot, page.path);
  const html = await readFile(absolutePath, 'utf8');

  expectPattern(
    html,
    new RegExp(`<html\\s+lang=["']${page.language}["']`),
    `${page.path} must declare lang=${page.language}`
  );
  expectPattern(html, /rel=["']canonical["']/, `${page.path} must include a canonical URL`);
  expectPattern(html, /hreflang=["']en["']/, `${page.path} must link to the English guide`);
  expectPattern(html, /hreflang=["']ja["']/, `${page.path} must link to the Japanese guide`);

  const ids = new Set([...html.matchAll(/\sid=["']([^"']+)["']/g)].map((match) => match[1]));
  const links = [...html.matchAll(/\shref=["']([^"']+)["']/g)].map((match) => match[1]);

  for (const link of links) {
    if (link.startsWith('#')) {
      if (!ids.has(link.slice(1))) errors.push(`${page.path}: missing target ${link}`);
      continue;
    }
    if (/^(?:https?:|mailto:)/.test(link)) continue;

    const localPath = link.split(/[?#]/, 1)[0];
    if (!localPath) continue;
    const target = resolve(dirname(absolutePath), localPath);
    const resolvedTarget = localPath.endsWith('/') ? resolve(target, 'index.html') : target;
    try {
      await access(resolvedTarget);
    } catch {
      errors.push(`${page.path}: missing local link target ${link}`);
    }
  }
}

if (errors.length > 0) {
  throw new Error(`Documentation site check failed:\n- ${errors.join('\n- ')}`);
}

console.log(`Checked ${pages.length} localized documentation pages.`);

function expectPattern(content, pattern, message) {
  if (!pattern.test(content)) errors.push(message);
}
