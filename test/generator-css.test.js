const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const postcss = require('postcss');
const { JSDOM } = require('jsdom');
function output(template = 'classic') {
  const context = vm.createContext({}); context.window = context;
  for (const file of ['defaults','portal-templates','generator']) vm.runInContext(fs.readFileSync('js/' + file + '.js','utf8'),context);
  return vm.runInContext(`generatePortalHTML({...INDUSTRY_DEFAULTS.generic, brand:{name:'Test Brand',programName:'Member Rewards'},member:{name:'Alex',points:450},sections:{vouchers:true,offers:true,earnMore:true,badges:true,clubs:true,upsell:true},colors:{primary:'#123456',accent:'#abc',secondary:'#f7f7f7',dark:'#142332',menu:'#234567'},outputTemplate:${JSON.stringify(template)}})`,context);
}
test('all exported templates render with embedded ordinary CSS and no blocking head network dependency', () => {
  for (const template of ['classic','dashboard','showcase','editorial','cinematic']) {
    const dom = new JSDOM(output(template), {runScripts:'dangerously'}); const doc = dom.window.document;
    assert.equal(doc.querySelector('head script[src],head link[rel="stylesheet"],head link[rel="preconnect"]'),null,template);
    assert.equal(doc.querySelector('style[type="text/tailwindcss"]'),null);
    const utilities = doc.querySelector('#lpg-portal-utilities');
    assert.ok(utilities.textContent.length > 10000);
    assert.doesNotMatch(utilities.textContent,/@tailwind|@import/);
    assert.doesNotMatch(doc.querySelector('#lpg-portal-theme').textContent,/@theme/);
    assert.match(doc.querySelector('#lpg-portal-theme').textContent,/--portal-primary-rgb: 18 52 86;/);
    assert.match(doc.querySelector('#lpg-portal-theme').textContent,/--portal-accent-rgb: 170 187 204;/);
    assert.equal(dom.window.getComputedStyle(doc.querySelector('main')).maxWidth,template==='classic'?'1280px':template==='dashboard'?'1440px':template==='showcase'?'1520px':template==='cinematic'?'none':'1560px');
    assert.ok(doc.querySelector('.voucher-card'));
    dom.window.close();
  }
});
test('compiled styles include numeric font weights, responsive grids, palette gradients, and theme opacity utilities', () => {
  const dom = new JSDOM(output());
  const root = postcss.parse(dom.window.document.querySelector('#lpg-portal-utilities').textContent);
  const rules = new Map(); root.walkRules(rule=>rules.set(rule.selector,rule));
  assert.equal(rules.get('.font-800').nodes.find(x=>x.prop==='font-weight').value,'800');
  assert.equal(rules.get('.w-4\\.5').nodes.find(x=>x.prop==='width').value,'1.125rem');
  for (const selector of ['.grid','.hidden','.sm\\:grid-cols-2','.lg\\:grid-cols-3','.from-rose-400','.to-emerald-600','.text-dark','.bg-page-bg','.focus\\:ring-primary\\/30:focus']) assert.ok(rules.has(selector),selector);
  assert.match(rules.get('.focus\\:ring-primary\\/30:focus').toString(),/var\(--portal-primary-rgb\) \/ 0\.3/);
  assert.equal(rules.get('.lg\\:grid-cols-3').parent.params,'(min-width: 1024px)');
  dom.window.close();
});
