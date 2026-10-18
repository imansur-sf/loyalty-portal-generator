const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/portal-templates.js'), 'utf8'), context);
const templates = context.PortalTemplates;
const html = '<!doctype html><html><head><title>A &amp; B</title></head><body class="original"><main><button onclick="redeem()">Redeem</button><section hidden>Private view</section></main><script>function redeem(){return 42}</script></body></html>';

test('classic and unknown templates preserve the original export byte for byte', () => {
  for (const state of [undefined, {}, { outputTemplate: 'classic' }, { outputTemplate: 'future-template' }]) assert.equal(templates.apply(html, state), html);
  assert.deepEqual(Array.from(templates.list, item => item.id), ['classic', 'modern']);
});

test('modern retains document content and interactions while adding scoped presentation', () => {
  const result = templates.apply(html, { outputTemplate: 'modern', colors: { primary: '#123456', accent: '#abc', menu: '#143825' } });
  assert.match(result, /<body class="original" data-lpg-template="modern">/);
  assert.match(result, /--lpg-brand: #123456;/);
  assert.match(result, /--lpg-accent: #aabbcc;/);
  assert.match(result, /<button onclick="redeem\(\)">Redeem<\/button>/);
  assert.match(result, /<script>function redeem\(\)\{return 42\}<\/script>/);
  assert.match(result, /<section hidden>Private view<\/section>/);
  assert.match(result, /\[hidden\] \{ display: none !important; \}/);
  assert.match(result, /prefers-reduced-motion/);
  assert.match(result, /:focus-visible/);
  assert.equal((result.match(/<style /g) || []).length, 1);
});

test('reapplying the modern template replaces its palette without duplicating markup', () => {
  const once = templates.apply(html, { outputTemplate: 'modern' });
  const twice = templates.apply(once, { outputTemplate: 'modern', colors: { primary: '#006644' } });
  assert.equal((twice.match(/<style id="lpg-modern-template">/g) || []).length, 1);
  assert.equal((twice.match(/data-lpg-template="modern">/g) || []).length, 1);
  assert.match(twice, /--lpg-brand: #006644;/);
  assert.doesNotMatch(twice, /--lpg-brand: #245c4f;/);
});

test('untrusted project colors cannot inject CSS, markup, remote resources, or scripts', () => {
  const hostile = '</style><script>alert(1)</script><style>';
  const result = templates.apply(html, { outputTemplate: 'modern', colors: { primary: hostile, menu: 'url(https://example.com/track)', accent: '#fff; } body { display:none' } });
  assert.doesNotMatch(result, /alert\(1\)|example\.com|display:none/);
  assert.match(result, /--lpg-brand: #245c4f;/);
  assert.match(result, /--lpg-accent: #b9e7cb;/);
  assert.equal((result.match(/<script>/g) || []).length, 1);
});

test('light brand colors get a dark readable hero and button surface', () => {
  const result = templates.apply(html, { outputTemplate: 'modern', colors: { primary: '#ffff00' } });
  const hex = result.match(/--lpg-brand-deep: (#[a-f\d]{6})/i)[1];
  const luminance = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => c <= 0.04045 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4))
    .reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
  assert.ok(1.05 / (luminance + .05) >= 7, 'white primary text should exceed 7:1 contrast');
  assert.match(result, /--lpg-brand: #ffff00;/);
});

test('incomplete document input falls back without corrupting content', () => {
  for (const partial of ['<div>Preview unavailable</div>', '<head></head>', null]) assert.equal(templates.apply(partial, { outputTemplate: 'modern' }), partial);
});

test('modern supports runtime exports whose ID-based stylesheet is emitted after the head', () => {
  const runtimeContext = vm.createContext({});
  runtimeContext.window = runtimeContext;
  for (const name of ['program-model.js', 'program-runtime.js', 'portal-templates.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', name), 'utf8'), runtimeContext);
  }
  const state = { programEnabled: true, outputTemplate: 'modern', colors: { primary: '#ddeeff' }, brand: { name: 'Demo Co' }, program: { mode: 'b2b' } };
  const base = '<html><head></head><body><header>Old header</header><main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">Old cards</main><footer>Old footer</footer></body></html>';
  const programHTML = runtimeContext.LPGProgramRuntime.enhance(base, state);
  const result = runtimeContext.PortalTemplates.apply(programHTML, state);
  assert.match(result, /id="lpg-program-root" class="lpg-program"/);
  assert.match(result, /body\[data-lpg-template="modern"\] #lpg-program-root \.lpg-p-intro/);
  assert.match(result, /body\[data-lpg-template="modern"\] #lpg-program-root \.lpg-p-primary/);
  assert.match(result, /body\[data-lpg-template="modern"\] #lpg-program-root \.lpg-p-nav \[aria-current="page"\]/);
  assert.ok(result.indexOf('<style id="lpg-modern-template">') < result.indexOf('</head>'));
  assert.match(result, /runtime.mount\(/);
  assert.equal(runtimeContext.PortalTemplates.apply(programHTML, { outputTemplate: 'classic' }), programHTML);
});
