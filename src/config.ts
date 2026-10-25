export const extensionConfig = {
  id: 'kubohiroyaasyncinput',
  slug: 'async-input',
  name: 'Async Input',
  description:
    'Bind keyboard and current-sprite pointer input to Temporary Variables runtime variables.',
  author: 'Hiroya Kubo',
  license: 'MPL-2.0',
  unsandboxed: true,
  docsURI: 'https://kubohiroya.github.io/turbowarp-async-input/',
  color1: '#2f9d8f',
  color2: '#247c72',
  color3: '#185b54',
  blockIconURI: `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect x="7" y="13" width="22" height="18" rx="4" fill="#E6533C"/><g fill="#fff"><rect x="12" y="18" width="4" height="4" rx="1"/><rect x="20" y="18" width="4" height="4" rx="1"/><rect x="12" y="25" width="12" height="3" rx="1.5"/></g><path d="M30 25l11 11-5 1 3 5-3 2-3-5-3 4z" fill="#FFAB19"/></svg>'
  )}`
} as const;
