import {execFile} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {promisify} from 'node:util';

interface PackageMetadata {
  name: string;
  version: string;
  description?: string;
  author?: string;
  license?: string;
  homepage?: string;
  packageManager?: string;
  engines?: {node?: string};
  repository?: {url?: string};
  bugs?: {url?: string};
  files?: string[];
  bin?: string | Record<string, string>;
  main?: string;
  types?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

interface RepoPolicy {
  schemaVersion: number;
  productName: string;
  packageType: string;
  licensePolicy: string;
  packageManager: string;
  homepage: string;
  node: {
    minimum: string;
  };
  extension: {
    id: string;
    standaloneBundle: string;
    compositionBundle: string;
    compositionTypes: string;
  };
  integrations: {
    turboWarpTMExtensionId: string;
    accumulatedPoseEvent: string;
  };
  exceptions: {
    compositionApi: boolean;
    optionalPeerExtensions: boolean;
    defaultOffPoseInput: boolean;
    legacyOpcodeCompatibility: boolean;
  };
}

interface PackResult {
  version: string;
  files: {path: string}[];
}

const execFileAsync = promisify(execFile);
const errors: string[] = [];

const packageMetadata = JSON.parse(await readFile('package.json', 'utf8')) as PackageMetadata;
const policy = JSON.parse(await readFile('repo-policy.json', 'utf8')) as RepoPolicy;
const readme = await readFile('README.md', 'utf8');
const license = await readFile('LICENSE', 'utf8');
const source = await readFile('src/extension.ts', 'utf8');
const globals = await readFile('src/globals.d.ts', 'utf8');
const bundle = await readFile(policy.extension.standaloneBundle, 'utf8');
const compositionBundle = await readFile(policy.extension.compositionBundle, 'utf8');
const compositionTypes = await readFile(policy.extension.compositionTypes, 'utf8');
const pages = [
  await readFile('docs/index.html', 'utf8'),
  await readFile('docs/ja/index.html', 'utf8')
];

checkPolicy();
checkPackageMetadata();
checkReadme();
checkLicense();
checkTMIntegration();
await checkPackContents();

if (errors.length > 0) {
  throw new Error(`Repository policy check failed:\n- ${errors.join('\n- ')}`);
}

process.stdout.write('Repository policy is aligned.\n');

function checkPolicy() {
  if (policy.schemaVersion !== 1) errors.push('repo-policy.json schemaVersion must be 1');
  if (policy.productName !== 'TurboWarp-Async-Input') {
    errors.push('repo-policy.json productName must be TurboWarp-Async-Input');
  }
  if (policy.packageType !== 'extension-composition') {
    errors.push('repo-policy.json packageType must be extension-composition');
  }
  if (policy.licensePolicy !== 'mpl-2.0') errors.push('repo-policy.json licensePolicy must be mpl-2.0');
  if (policy.packageManager !== 'pnpm') errors.push('repo-policy.json packageManager must be pnpm');
  if (policy.homepage !== 'pages') errors.push('repo-policy.json homepage must record Pages as the user entrypoint');
  if (policy.node?.minimum !== '22') errors.push('repo-policy.json node.minimum must be 22');
  if (policy.integrations?.turboWarpTMExtensionId !== 'kubohiroyatm') {
    errors.push('repo-policy.json must record TurboWarp TM extension ID kubohiroyatm');
  }
  if (policy.integrations?.accumulatedPoseEvent !== 'TM_ACCUMULATED_POSE_CHANGED') {
    errors.push('repo-policy.json must record TM_ACCUMULATED_POSE_CHANGED');
  }
}

function checkPackageMetadata() {
  for (const key of ['description', 'author', 'license', 'homepage', 'packageManager'] as const) {
    const value = packageMetadata[key];
    if (typeof value !== 'string' || value.trim().length === 0) {
      errors.push(`package.json ${key} must be a non-empty string`);
    }
  }
  if (packageMetadata.license !== 'MPL-2.0') errors.push('package.json license must be MPL-2.0');
  if (packageMetadata.homepage !== 'https://kubohiroya.github.io/turbowarp-async-input/') {
    errors.push('package.json homepage must point to the Pages user guide');
  }
  if (packageMetadata.engines?.node !== '>=22.18.0') errors.push('package.json engines.node must be >=22.18.0');
  if (packageMetadata.packageManager !== 'pnpm@11.11.0') {
    errors.push('package.json packageManager must pin pnpm@11.11.0');
  }
  if (packageMetadata.devDependencies?.['@kubohiroya/vite-plugin-turbowarp-extension'] !== '0.4.0') {
    errors.push('package.json must depend on @kubohiroya/vite-plugin-turbowarp-extension 0.4.0');
  }
  for (const command of ['build', 'check', 'prepack']) {
    if (/\bnpm run\b/u.test(packageMetadata.scripts?.[command] ?? '')) {
      errors.push(`package.json ${command} must use pnpm commands`);
    }
  }
}

function checkReadme() {
  if (!readme.startsWith(`# ${policy.productName}\n`)) {
    errors.push('README.md H1 must match repo-policy.json productName');
  }
  const installLine = `pnpm add --save-exact ${packageMetadata.name}@${packageMetadata.version}`;
  const cdnUrl = `https://cdn.jsdelivr.net/npm/${packageMetadata.name}@${packageMetadata.version}/dist/async-input.js`;
  if (!readme.includes(installLine)) errors.push('README.md install example must match package version');
  if (!readme.includes(cdnUrl)) errors.push('README.md CDN URL must match package version');
  if (!readme.includes('TurboWarp TM')) errors.push('README.md must use TurboWarp TM naming');
  if (!readme.includes('TM_ACCUMULATED_POSE_CHANGED')) {
    errors.push('README.md must document the current accumulated pose event');
  }
}

function checkLicense() {
  if (!license.startsWith('Mozilla Public License Version 2.0\n==================================')) {
    errors.push('LICENSE must contain the Mozilla Public License Version 2.0 full text');
  }
  if (!license.includes('Exhibit A - Source Code Form License Notice')) {
    errors.push('LICENSE must include the MPL-2.0 Exhibit A text');
  }
}

function checkTMIntegration() {
  if (!source.includes("ACCUMULATED_POSE_CHANGED_EVENT = 'TM_ACCUMULATED_POSE_CHANGED'")) {
    errors.push('src/extension.ts must use TM_ACCUMULATED_POSE_CHANGED');
  }
  if (!source.includes('this.runtime.ext_kubohiroyatm')) {
    errors.push('src/extension.ts must look up runtime.ext_kubohiroyatm');
  }
  if (!globals.includes('ext_kubohiroyatm?: TurboWarpTMExtension')) {
    errors.push('src/globals.d.ts must expose ext_kubohiroyatm');
  }
  if (!bundle.includes('TM_ACCUMULATED_POSE_CHANGED') || !bundle.includes('ext_kubohiroyatm')) {
    errors.push('dist/async-input.js must contain the current TurboWarp TM integration');
  }
  if (!bundle.includes('// ID: kubohiroyaasyncinput')) {
    errors.push('dist/async-input.js must retain Async Input extension ID');
  }
  if (!compositionBundle.includes('createAsyncInputComposition')) {
    errors.push('dist/composition.js must retain the Composition API');
  }
  if (!compositionTypes.includes('createAsyncInputComposition')) {
    errors.push('dist/types/composition.d.ts must retain Composition API types');
  }
  const legacyPoseNamePattern = new RegExp([
    ['tm', 'pose'].join(''),
    ['TM', 'Pose'].join(''),
    ['TM', 'POSE'].join('')
  ].join('|'), 'u');
  const checkedText = [
    readme,
    source,
    globals,
    bundle,
    ...pages
  ].join('\n');
  if (legacyPoseNamePattern.test(checkedText)) {
    errors.push('normal source, dist, README, and Pages must not retain legacy pose-era naming');
  }
}

async function checkPackContents() {
  const {stdout} = await execFileAsync('npm', ['pack', '--dry-run', '--ignore-scripts', '--json']);
  const [pack] = JSON.parse(stdout) as PackResult[];
  if (!pack) {
    errors.push('npm pack must report a package');
    return;
  }
  const files = new Set(pack.files.map((file) => file.path));
  for (const file of [
    'README.md',
    'LICENSE',
    'CHANGELOG.md',
    policy.extension.standaloneBundle,
    policy.extension.compositionBundle,
    policy.extension.compositionTypes
  ]) {
    if (!files.has(file)) errors.push(`npm pack must include ${file}`);
  }
  if (pack.version !== packageMetadata.version) {
    errors.push('npm pack version must match package.json version');
  }
}
