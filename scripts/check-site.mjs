import {access, readFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const pages = [
  {path: 'docs/index.html', language: 'en'},
  {path: 'docs/ja/index.html', language: 'ja'}
];
const errors = [];

await checkAppBar();
await checkAppBarCss();

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

async function checkAppBar() {
  const sources = await Promise.all(pages.map((page) => readFile(resolve(repositoryRoot, page.path), 'utf8')));
  const appBars = sources.map((source, index) => {
    const match = source.match(/<header class="app-bar">[\s\S]*?<\/header>/);
    if (!match) {
      errors.push(`${pages[index].path}: missing app-bar`);
      return '';
    }
    return match[0];
  });

  const signatures = appBars.map((appBar) => [...appBar.matchAll(/<(\/)?([a-z0-9-]+)([^>]*)>/gi)]
    .map((match) => {
      if (match[1]) return `/${match[2]}`;
      const className = match[3].match(/\bclass="([^"]+)"/)?.[1] ?? '';
      return `${match[2]}.${className}`;
    })
    .join('|'));
  if (signatures[0] !== signatures[1]) errors.push('localized app bars must share the same DOM/class structure');

  const sectionTargets = appBars.map((appBar) => {
    const nav = appBar.match(/<nav class="app-bar-sections"[\s\S]*?<\/nav>/)?.[0] ?? '';
    return [...nav.matchAll(/href="(#[^"]+)"/g)].map((match) => match[1]);
  });
  if (JSON.stringify(sectionTargets[0]) !== JSON.stringify(sectionTargets[1])) {
    errors.push('localized app bars must use the same section order');
  }

  for (const [index, appBar] of appBars.entries()) {
    for (const className of ['app-bar-brand', 'app-bar-sections', 'app-bar-actions', 'app-bar-github', 'app-bar-languages']) {
      if (!appBar.includes(`class="${className}"`)) errors.push(`${pages[index].path}: missing ${className}`);
    }
    if (!appBar.includes('>English</a>') || !appBar.includes('>日本語</a>')) {
      errors.push(`${pages[index].path}: language names must be English / 日本語`);
    }
    if ((appBar.match(/aria-current="page"/g) ?? []).length !== 1) {
      errors.push(`${pages[index].path}: exactly one language must have aria-current=page`);
    }
    for (const language of ['en', 'ja']) {
      if (!new RegExp(`hreflang="${language}"[^>]*lang="${language}"|lang="${language}"[^>]*hreflang="${language}"`).test(appBar)) {
        errors.push(`${pages[index].path}: language switch is missing lang/hreflang=${language}`);
      }
    }
  }
}

async function checkAppBarCss() {
  const cssPath = resolve(repositoryRoot, 'docs/assets/styles.css');
  const css = await readFile(cssPath, 'utf8');
  const requirements = [
    [/\.app-bar\s*{[\s\S]*?position:\s*sticky/, 'sticky app bar'],
    [/\.app-bar-inner\s*{[\s\S]*?min-height:\s*4rem/, '64px app bar height'],
    [/backdrop-filter:\s*blur\(/, 'backdrop blur'],
    [/border-bottom:/, 'bottom border'],
    [/focus-visible/, 'keyboard focus style'],
    [/overflow-x:\s*clip/, 'horizontal overflow protection'],
    [/@media\s*\(max-width:[^)]+\)[\s\S]*?\.app-bar-sections\s*{\s*display:\s*none/, 'responsive section navigation']
  ];
  for (const [pattern, label] of requirements) {
    if (!pattern.test(css)) errors.push(`docs/assets/styles.css: missing ${label}`);
  }
}
