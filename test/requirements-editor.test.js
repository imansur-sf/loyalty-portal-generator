const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

async function editor() {
  // Pure DOM integration; no browser navigation, external scripts or network.
  const html = fs.readFileSync('index.html', 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://lpg.test/' });
  const w = dom.window;
  await new Promise(resolve => w.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.confirm = () => true;
  const run = code => vm.runInContext(code, dom.getInternalVMContext());
  for (const file of ['defaults', 'images', 'program-model', 'program-runtime', 'portal-templates', 'generator', 'requirements', 'requirements-editor', 'app', 'projects']) run(fs.readFileSync(`js/${file}.js`, 'utf8'));
  run(`applyIndustryDefaults('generic'); editorDefaults = cloneProject(state); scheduleDraftRecovery = () => {}; schedulePreview = () => {}; populateFormFromState(); LPGRequirementsEditor.init();`);
  const field = (id, value) => { const node = w.document.getElementById(id); node.value = value; node.dispatchEvent(new w.Event('input', { bubbles: true })); };
  return { w, run, field, close: () => w.close() };
}
test('B2B sample review applies rules and template choice without a conflicting snapshot', async () => {
  const e = await editor();
  try {
    e.field('brief-mode', 'b2b'); e.w.LPGRequirementsEditor.sample();
    assert.equal(e.run('state.program'), null);
    e.run("state.outputTemplate = 'modern'"); e.w.LPGRequirementsEditor.apply();
    assert.equal(e.run('state.program.mode'), 'b2b'); assert.equal(e.run('state.program.approvalRequired'), true);
    assert.equal(e.run('state.programEnabled'), true); assert.equal(e.run('state.outputTemplate'), 'modern');
  } finally { e.close(); }
});
test('review inputs update validated rules and invalid tiers never replace the active program', async () => {
  const e = await editor();
  try {
    e.w.LPGRequirementsEditor.sample();
    const input = e.w.document.querySelector('[data-program-path="tiers.1.threshold"]'); input.value = '-1'; input.dispatchEvent(new e.w.Event('input', { bubbles: true }));
    e.w.LPGRequirementsEditor.apply(); assert.equal(e.run('state.program'), null);
    assert.match(e.w.document.getElementById('program-review-error').textContent, /threshold/);
    input.value = '1500'; input.dispatchEvent(new e.w.Event('input', { bubbles: true })); e.w.LPGRequirementsEditor.apply();
    assert.equal(e.run('state.program.tiers[1].threshold'), 1500);
  } finally { e.close(); }
});
test('pending review and source references survive a saved project reload', async () => {
  const e = await editor();
  try {
    e.run(`state.brief.sources=[{name:'brief.pdf',pageCount:1,warning:'',pages:[{text:'Source requirements'}]}]`);
    e.w.LPGRequirementsEditor.sample();
    assert.ok(e.run('state.programReview.snapshot.length') < 80);
    e.run('hydratePortal(buildProjectPayload())'); e.w.LPGRequirementsEditor.apply();
    assert.equal(e.run('state.programEnabled'), true);
    assert.equal(e.run('state.brief.sources[0].pages[0].text'), 'Source requirements');
  } finally { e.close(); }
});
test('late AI response cannot replace changed website or author edits', async () => {
  const e = await editor();
  try {
    e.field('brief-text', 'Create a member program');
    let resolve; const response = new Promise(r => { resolve = r; });
    const request = e.w.LPGRequirementsEditor.analyze({ callLLM: () => response }, '');
    e.field('quickstart-url', 'https://changed.example');
    resolve({ text: JSON.stringify({ program: e.w.LPGProgram.normalize({ mode: 'b2c' }) }) });
    await assert.rejects(request, /editor changed/); assert.equal(e.run('state.programReview'), null);
  } finally { e.close(); }
});
test('incomplete proposal edits can be saved and reopened without losing the active portal', async () => {
  const e = await editor();
  try {
    e.w.LPGRequirementsEditor.sample(); e.w.LPGRequirementsEditor.apply(); e.w.LPGRequirementsEditor.editProgram();
    const input = e.w.document.querySelector('[data-program-path="tiers.1.threshold"]');
    input.value = ''; input.dispatchEvent(new e.w.Event('input', { bubbles: true }));
    e.run('hydratePortal(buildProjectPayload())');
    assert.equal(e.run('state.programEnabled'), true); assert.equal(e.run('state.programReview.program.tiers[1].threshold'), null);
    e.w.LPGRequirementsEditor.apply(); assert.match(e.w.document.getElementById('program-review-error').textContent, /threshold/);
    assert.equal(e.run('state.program.tiers[1].threshold'), 1000);
  } finally { e.close(); }
});
test('every selected AI client gets the same brief and strict review contract', async () => {
  const e = await editor();
  try {
    for (const provider of ['default', 'anthropic', 'sfgateway', 'pagehost']) {
      e.field('brief-text', `Program for ${provider}`);
      let call;
      await e.w.LPGRequirementsEditor.analyze({ callLLM: async args => { call = args; return { text: JSON.stringify({ program: e.w.LPGProgram.normalize({ mode: 'b2c' }) }) }; } }, '');
      assert.match(call.system, /UNTRUSTED SOURCE DATA/); assert.match(call.prompt, new RegExp(provider));
      assert.ok(e.run('state.programReview')); assert.equal(e.run('state.program'), null);
    }
  } finally { e.close(); }
});
test('late AI cannot overwrite edits made to a pending proposal', async () => {
  const e = await editor();
  try {
    e.field('brief-text', 'Update this program'); e.w.LPGRequirementsEditor.sample();
    let resolve; const response = new Promise(r => { resolve = r; });
    const request = e.w.LPGRequirementsEditor.analyze({ callLLM: () => response }, '');
    const input = e.w.document.querySelector('[data-program-path="tiers.1.threshold"]');
    input.value = '1800'; input.dispatchEvent(new e.w.Event('input', { bubbles: true }));
    resolve({ text: JSON.stringify({ program: e.w.LPGProgram.normalize({ mode: 'b2c' }) }) });
    await assert.rejects(request, /editor changed/);
    assert.equal(e.run('state.programReview.program.tiers[1].threshold'), 1800);
  } finally { e.close(); }
});
test('invalid AI rules get one correction attempt and remain unapplied until reviewed', async () => {
  const e = await editor();
  try {
    e.field('brief-text', 'A sample purchase program');
    const valid = JSON.parse(JSON.stringify(e.w.LPGProgram.normalize({ mode: 'b2c' })));
    const invalid = JSON.parse(JSON.stringify(valid)); invalid.earnRules[0].amount = 0;
    const calls = [];
    await e.w.LPGRequirementsEditor.analyze({ callLLM: async args => { calls.push(args); return { text: JSON.stringify({ program: calls.length === 1 ? invalid : valid }) }; } }, '');
    assert.equal(calls.length, 2); assert.match(calls[1].prompt, /earnRules\[0\].amount/);
    assert.equal(e.run('state.program'), null); assert.equal(e.run('state.programReview.program.earnRules[0].amount'), 100);
  } finally { e.close(); }
});
test('reset clears requirements, candidate, program and template', async () => {
  const e = await editor();
  try {
    e.field('brief-mode', 'b2b'); e.field('brief-text', 'Customer text'); e.w.LPGRequirementsEditor.sample();
    e.w.LPGRequirementsEditor.apply(); e.run('startOver()');
    assert.equal(e.run('state.program'), null); assert.equal(e.run('state.brief.text'), '');
    assert.equal(e.run('state.outputTemplate'), 'classic'); assert.equal(e.run('state.programReview'), null);
  } finally { e.close(); }
});
test('program refinements preserve the accepted palette and untrusted source metadata stays text', async () => {
  const e = await editor();
  try {
    e.w.LPGRequirementsEditor.sample(); e.w.LPGRequirementsEditor.apply();
    e.run("state.colors.primary='#123456'; state.colors.accent='#654321'");
    e.field('brief-text', 'Change only the earning activity label');
    await e.w.LPGRequirementsEditor.analyze({ callLLM: async () => ({ text: JSON.stringify({ program: e.run('state.program'), brand: { primary: '#FF0000', accent: '#00FF00' } }) }) }, '');
    e.w.LPGRequirementsEditor.apply(); assert.equal(e.run('state.colors.primary'), '#123456'); assert.equal(e.run('state.colors.accent'), '#654321');
    e.run(`state.brief.sources=[{name:'notes.pdf',pageCount:'<img src=x onerror=alert(1)>',pages:[{text:'Source'}]}];hydratePortal(buildProjectPayload())`);
    assert.equal(e.w.document.querySelector('#brief-sources img'), null);
    assert.match(e.w.document.getElementById('brief-sources').textContent, /1 page/);
  } finally { e.close(); }
});
