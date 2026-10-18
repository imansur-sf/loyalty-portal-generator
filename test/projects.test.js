const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

function editor() {
  const nodes = new Map();
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, { value: '', textContent: '', hidden: false, disabled: false, src: '',
      classList: { add() {}, remove() {}, toggle() {}, contains() { return true; } },
      querySelectorAll() { return []; }, addEventListener() {}, reportValidity() { return true; },
      showModal() { this.open = true; }, close() { this.open = false; } });
    return nodes.get(id);
  }
  let email = 'owner@salesforce.com';
  const calls = [];
  const widget = {
    isSignedIn: () => !!email, getEmail: () => email,
    signIn: async () => {}, signOut: () => { email = ''; },
    saveProject: async options => { calls.push(structuredClone(options)); return { id: '1', name: options.name, revision: '1' }; }
  };
  const context = vm.createContext({ console, crypto: webcrypto, TextEncoder, URLSearchParams, location: { search: '' },
    setTimeout: () => 1, clearTimeout() {}, alert() {}, confirm: () => true,
    document: { addEventListener() {}, getElementById: node },
    window: { SaasyAuth: widget, saasyAuthReady: Promise.resolve(widget), addEventListener() {} }, SaasyAuth: widget });
  vm.runInContext(fs.readFileSync('js/app.js', 'utf8') + '\n' + fs.readFileSync('js/projects.js', 'utf8'), context);
  vm.runInContext(`
    editorDefaults = cloneProject(state); draftReady = true;
    var records = [];
    draftStorage = async (method, value) => { if (method === 'put') records.push(cloneProject(value)); };
    populateFormFromState = () => {}; renderDynamicSections = () => {};
    applyIndustryDefaults = () => {}; goToStep = step => { currentStep = step; };
    schedulePreview = () => {}; closeMyProjects = () => {};
  `, context);
  node('save-project-name').value = 'My portal';
  return { context, node, widget, calls, run: code => vm.runInContext(code, context), setEmail: value => { email = value; } };
}
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }

test('Start Over clears loaded project identity before another save', async () => {
  const e = editor();
  e.run("currentProjectId = '99'; workspaceOwner = 'owner@salesforce.com'; startOver();");
  await e.run('confirmSaveProject()');
  assert.equal(e.calls[0].id, null);
  assert.equal(e.run('currentProjectId'), '1');
});
test('named update includes the expected revision and editor metadata', async () => {
  const e = editor();
  e.run("currentProjectId = '5'; currentProjectRevision = '7'; currentStep = 3;");
  e.node('quickstart-url').value = 'https://example.com/';
  await e.run('confirmSaveProject()');
  assert.equal(e.calls[0].expectedRevision, '7');
  assert.equal(e.calls[0].payload._lpgEditor.step, 3);
  assert.equal(e.calls[0].sourceUrl, 'https://example.com/');
});
test('Save as New never updates the original project', async () => {
  const e = editor(); e.run("currentProjectId = '5'; currentProjectRevision = '7';");
  await e.run('confirmSaveProject(true)');
  assert.equal(e.calls[0].id, null); assert.equal(e.calls[0].expectedRevision, undefined);
});
test('rapid duplicate clicks create only one cloud request', async () => {
  const e = editor(), pending = deferred();
  e.widget.saveProject = async () => { e.calls.push(1); return pending.promise; };
  const first = e.run('confirmSaveProject()');
  await e.run('confirmSaveProject()');
  pending.resolve({ id: '1', name: 'My portal', revision: '1' }); await first;
  assert.equal(e.calls.length, 1);
});
test('retry after a lost response reuses the same idempotency key', async () => {
  const e = editor();
  e.widget.saveProject = async options => {
    e.calls.push(structuredClone(options));
    if (e.calls.length === 1) throw new Error('Network error');
    return { id: '1', name: options.name, revision: '1' };
  };
  await e.run('confirmSaveProject()'); await e.run('confirmSaveProject()');
  assert.equal(e.calls.length, 2); assert.equal(e.calls[0].idempotencyKey, e.calls[1].idempotencyKey);
});
test('expired token is renewed for the same account and the same save retried once', async () => {
  const e = editor(); let renewals = 0;
  e.widget.signIn = async options => { assert.equal(options.expectedEmail, 'owner@salesforce.com'); renewals++; };
  e.widget.saveProject = async options => {
    e.calls.push(structuredClone(options));
    if (e.calls.length === 1) throw new Error('invalid_token');
    return { id: '1', name: options.name, revision: '1' };
  };
  await e.run('confirmSaveProject()');
  assert.equal(renewals, 1); assert.equal(e.calls[0].idempotencyKey, e.calls[1].idempotencyKey);
});
test('account change during a request cannot attach the project to the new editor account', async () => {
  const e = editor(), pending = deferred();
  e.widget.saveProject = () => pending.promise;
  const save = e.run('confirmSaveProject()'); await new Promise(resolve => setImmediate(resolve));
  e.setEmail('other@salesforce.com'); pending.resolve({ id: '1', name: 'Old account', revision: '1' }); await save;
  assert.equal(e.run('currentProjectId'), null);
  assert.match(e.node('save-project-error').textContent, /account changed/i);
});
test('revision conflict preserves the local draft without overwriting another tab', async () => {
  const e = editor(); e.run("currentProjectId = '5'; currentProjectRevision = '1'; state.brand.name = 'My draft';");
  e.widget.saveProject = async () => { throw new Error('revision_conflict'); };
  e.widget.loadProject = async () => ({ tool: 'lpg', name: 'Changed elsewhere', payload: {} });
  await e.run('confirmSaveProject()');
  assert.equal(e.run('state.brand.name'), 'My draft');
  assert.match(e.node('save-project-error').textContent, /another tab/);
});
test('a lost update response is recognized without another write', async () => {
  const e = editor(); e.run("currentProjectId = '5'; currentProjectRevision = '1';");
  let options;
  e.widget.saveProject = async value => { options = value; throw new Error('revision_conflict'); };
  e.widget.loadProject = async () => ({ tool: 'lpg', id: '5', revision: '2', name: options.name, source_url: null, payload: options.payload });
  await e.run('confirmSaveProject()');
  assert.equal(e.run('currentProjectRevision'), '2');
});
test('load rejects a project belonging to a different app', async () => {
  const e = editor();
  e.widget.loadProject = async () => ({ id: '1', tool: 'upg', payload: {} });
  assert.equal(await e.run("loadProjectAndHydrate('1')"), false);
  assert.equal(e.run('currentProjectId'), null);
});
test('late load response cannot replace newer edits', async () => {
  const e = editor(), pending = deferred(), payload = e.run('cloneProject(state)');
  e.widget.loadProject = () => pending.promise;
  const load = e.run("loadProjectAndHydrate('1')"); await new Promise(resolve => setImmediate(resolve));
  e.run("state.brand.name = 'Newer edits';");
  pending.resolve({ id: '1', name: 'Saved portal', tool: 'lpg', payload });
  assert.equal(await load, false); assert.equal(e.run('state.brand.name'), 'Newer edits');
});
test('old saved payloads load and new payloads restore step and website', async () => {
  const e = editor(), payload = e.run('cloneProject(state)');
  e.widget.loadProject = async () => ({ id: '1', name: 'Old portal', tool: 'lpg', revision: '2', payload });
  assert.equal(await e.run("loadProjectAndHydrate('1')"), true); assert.equal(e.run('currentStep'), 0);
  payload._lpgEditor = { step: 4, sourceUrl: 'https://example.com/' };
  assert.equal(await e.run("loadProjectAndHydrate('1')"), true);
  assert.equal(e.run('currentStep'), 4); assert.equal(e.node('quickstart-url').value, 'https://example.com/');
});
test('draft write queue preserves the latest A → B → A edit', async () => {
  const e = editor();
  await e.run(`Promise.all([persistDraftRecovery(), (state.brand.name = 'B', persistDraftRecovery()), (state.brand.name = '', persistDraftRecovery())])`);
  assert.equal(e.run('records.at(-1).payload.brand.name'), '');
});
test('draft backups contain state and project metadata but no auth token', async () => {
  const e = editor();
  await e.run('persistDraftRecovery()');
  const record = e.run('records[0]');
  assert.equal(record.owner, 'owner@salesforce.com'); assert.ok(record.payload.brand);
  assert.equal(record.token, undefined);
});
test('oversized image payload is rejected before sending a cloud request', async () => {
  const e = editor(); e.run("state.brand.logoData = 'x'.repeat(20 * 1024 * 1024);");
  await e.run('confirmSaveProject()');
  assert.equal(e.calls.length, 0); assert.match(e.node('save-project-error').textContent, /too much image data/);
});
