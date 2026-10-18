const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const model = require('../js/program-model');
const runtime = require('../js/program-runtime');
globalThis.LPGProgram = model;

const html = '<!doctype html><html><head></head><body><header class="site-header">Original Brand</header><main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8"><p>Original consumer card</p></main><footer>Original footer</footer></body></html>';
function program(overrides = {}) {
  return model.normalize({ mode: 'b2b', name: 'Business rewards', providerName: 'Example Provider',
    member: { name: 'Demo Member', organization: 'Example Business', role: 'purchaser' },
    opening: { qualifying: 1000, redeemable: 500 }, approvalRequired: true, ...overrides });
}
function session(overrides) { return runtime.createSession(program(overrides), model); }

test('legacy projects retain their exact original HTML', () => {
  assert.equal(runtime.enhance(html, {}), html);
  assert.equal(runtime.enhance(html, { program: program() }), html);
  assert.equal(runtime.enhance(html, { programEnabled: false, program: program() }), html);
});

test('program replaces consumer main and exports private requirements separately from rules', () => {
  const output = runtime.enhance(html, { programEnabled: true, program: program({
    assumptions: ['PRIVATE_ASSUMPTION'], futureFeatures: ['PRIVATE_FUTURE'],
    requirements: [{ id: 'secret', text: 'PRIVATE_REQUIREMENT', source: 'PRIVATE_SOURCE', status: 'question' }]
  }) });
  assert.ok(!output.includes('Original consumer card'));
  assert.match(output, /id="lpg-program-root"/);
  assert.match(output, /Business rewards/);
  assert.doesNotMatch(output, /PRIVATE_(ASSUMPTION|FUTURE|REQUIREMENT|SOURCE)/);
  assert.doesNotMatch(output, /<script[^>]*src=/);
});

test('untrusted program text and brand fields cannot close scripts or inject markup', () => {
  const attack = '</script><img src=x onerror=alert(1)>';
  const output = runtime.enhance(html, { programEnabled: true, program: program({ name: attack }),
    brand: { name: attack, logoUrl: 'javascript:alert(1)' }, colors: { primary: 'red;content:"evil"' } });
  assert.ok(!output.includes(attack));
  assert.match(output, /\\u003c\/script\\u003e/);
  assert.match(output, /&lt;\/script&gt;/);
  assert.doesNotMatch(output, /src="javascript:/);
  assert.doesNotMatch(output, /content:"evil"/);
});

test('B2B request and approval share a ledger and deduct exactly once', () => {
  const demo = session(); assert.equal(demo.role().id, 'purchaser');
  const request = demo.request('credit');
  assert.equal(request.status, 'pending'); assert.equal(demo.summary().redeemable, 500);
  demo.switchRole('approver'); demo.decide(request.id, true);
  assert.equal(demo.summary().redeemable, 400); assert.equal(demo.summary().qualifying, 1000);
  assert.equal(demo.events.length, 1);
  assert.throws(() => demo.decide(request.id, true), /no longer pending/);
  assert.equal(demo.summary().redeemable, 400);
});

test('demo handlers enforce permissions even when buttons are bypassed', () => {
  const demo = session(); const request = demo.request('credit');
  assert.throws(() => demo.decide(request.id, true), /does not permit/);
  demo.switchRole('approver');
  assert.throws(() => demo.request('credit'), /does not permit/);
  assert.throws(() => demo.earn('purchase', 20), /does not permit/);
  assert.throws(() => demo.switchRole('invented'), /Unknown demo role/);
  demo.switchRole('administrator'); const own = demo.request('credit');
  assert.throws(() => demo.decide(own.id, true), /different approver/);
});

test('duplicate pending requests are rejected; decline does not deduct points', () => {
  const demo = session(); const request = demo.request('credit');
  assert.throws(() => demo.request('credit'), /already has a pending request/);
  demo.switchRole('approver'); demo.decide(request.id, false);
  assert.equal(demo.summary().redeemable, 500); assert.equal(demo.events.length, 0);
});

test('approval checks the current balance and leaves unfunded requests pending', () => {
  const demo = session({ opening: { qualifying: 0, redeemable: 100 }, rewards: [{ id: 'one', name: 'One', cost: 100 }, { id: 'two', name: 'Two', cost: 100 }] });
  const one = demo.request('one'), two = demo.request('two');
  demo.switchRole('approver'); demo.decide(one.id, true);
  assert.throws(() => demo.decide(two.id, true), /Not enough/);
  assert.equal(two.status, 'pending'); assert.equal(demo.events.length, 1); assert.equal(demo.summary().redeemable, 0);
});

test('direct redemption and B2C do not create approval requests', () => {
  for (const settings of [{ approvalRequired: false }, { mode: 'b2c', member: { name: 'Demo Member', role: 'member' }, approvalRequired: false }]) {
    const demo = session(settings); demo.request('credit');
    assert.equal(demo.requests.length, 0); assert.equal(demo.summary().redeemable, 400);
  }
});

test('earning and reset preserve consistent tier balances', () => {
  const demo = session(); demo.earn('purchase', 100, '2026-10-01');
  assert.equal(demo.summary().qualifying, 1100); assert.equal(demo.summary().redeemable, 625);
  demo.request('credit'); demo.reset();
  assert.equal(demo.events.length, 0); assert.equal(demo.requests.length, 0);
  assert.equal(demo.summary().qualifying, 1000); assert.equal(demo.summary().redeemable, 500);
});

// Small DOM surface to run the exported code without a network or third-party browser library.
function documentFixture() {
  class Node {
    constructor(tag) { this.tagName = tag; this.children = []; this.dataset = {}; this.attributes = {}; this.events = {}; this.classList = { add() {} }; this.textContent = ''; }
    append(...children) { children.forEach(child => { child.parent = this; this.children.push(child); }); }
    replaceChildren(...children) { this.children = []; this.append(...children); }
    setAttribute(key, value) { this.attributes[key] = value; }
    addEventListener(name, fn) { this.events[name] = fn; }
    focus() { document.activeElement = this; }
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    closest() { return this.dataset.action ? this : this.parent && this.parent.closest(); }
    querySelectorAll() { const result = []; function walk(node) { if (node.dataset.action) result.push(node); node.children.forEach(walk); } walk(this); return result; }
    get text() { return this.textContent + this.children.map(child => child.text).join(' '); }
  }
  const root = new Node('main'); root.id = 'lpg-program-root';
  const document = { body: new Node('body'), createElement: tag => new Node(tag),
    getElementById(id) { let result; function walk(node) { if (node.id === id) result = node; node.children.forEach(walk); } walk(root); return result; } };
  return { document, root, click(type, id) { const target = root.querySelectorAll().find(node => node.dataset.action === type && (id === undefined || node.dataset.id === id)); assert.ok(target, 'Missing ' + type + ':' + id); root.events.click({ target }); } };
}

test('export runs without editor globals and supports earning, requests, role changes and approval', () => {
  const fixture = documentFixture();
  const output = runtime.enhance(html, { programEnabled: true, program: program() });
  const script = output.match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.runInNewContext(script, { document: fixture.document });
  assert.match(fixture.root.text, /Example Business/);
  fixture.click('page', 'earn'); assert.match(fixture.root.text, /Eligible business order/);
  const amount = fixture.document.getElementById('lpg-amount-purchase'); amount.value = '100';
  fixture.click('earn', 'purchase'); assert.match(fixture.root.text, /Activity added/);
  fixture.click('page', 'rewards'); fixture.click('request', 'credit');
  const select = fixture.document.getElementById('lpg-p-role'); select.value = 'approver'; fixture.root.events.change({ target: select });
  fixture.click('page', 'approvals'); fixture.click('approve', 'request-1');
  assert.match(fixture.root.text, /Request approved/);
  fixture.click('page', 'overview'); assert.match(fixture.root.text, /525/);
  fixture.click('reset'); assert.match(fixture.root.text, /500/);
});

test('custom role names and document-derived names render as text', () => {
  const fixture = documentFixture();
  const demo = runtime.mount(program({ roles: [{ id: 'custom', name: '<img src=x>', canRequest: true, canApprove: true }, { id: 'review', name: 'Review', canRequest: false, canApprove: true }], member: { name: 'Demo Member', organization: '<script>Company</script>', role: 'custom' } }), model, fixture.document);
  assert.equal(demo.role().id, 'custom'); assert.match(fixture.root.text, /<script>Company<\/script>/);
  assert.equal(fixture.root.children.some(node => node.tagName === 'script'), false);
});

 test('replacement-pattern text remains literal during export assembly', () => {
  const name = "$` Customer $' $&";
  const output = runtime.enhance(html, { programEnabled: true, program: program({ name }), brand: { name } });
  assert.equal((output.match(/<!doctype html>/g) || []).length, 1);
  const fixture = documentFixture();
  vm.runInNewContext(output.match(/<script>([\s\S]*?)<\/script>/)[1], { document: fixture.document });
  assert.ok(fixture.root.text.includes(name));
});


test('program removes legacy Tailwind and font dependencies but retains customer imagery', () => {
  const resources = '<script src="https://cdn.tailwindcss.com/3.4.16"></script><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter&amp;display=swap" rel="stylesheet">';
  const original = html.replace('</head>', () => resources + '</head>');
  const state = { programEnabled: true, program: program(), brand: { name: 'Customer', logoUrl: 'https://brand.example/logo.png' } };
  const output = runtime.enhance(original, state);
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM(output);
  try {
    assert.equal(dom.window.document.querySelectorAll('script[src*="cdn.tailwindcss.com"],link[href*="fonts.googleapis.com"],link[href*="fonts.gstatic.com"]').length, 0);
    assert.equal(dom.window.document.querySelector('.site-header img').src, 'https://brand.example/logo.png');
    assert.match(output, /font-family:system-ui/);
  } finally { dom.window.close(); }
  assert.equal(runtime.enhance(original, { ...state, programEnabled: false }), original);
});
