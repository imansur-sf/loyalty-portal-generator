const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/portal-templates.js'), 'utf8'), context);
const templates = context.PortalTemplates;
const sections = ['hero','tiers','benefits','vouchers','offers','earn','profile','profile-tasks','badges','clubs','upsell','activity','team','account','future-section'];
const html = `<!doctype html><html><head><title>A &amp; B</title></head><body class="original"><header>Brand</header><main><h1>A &amp; B Loyalty</h1><div class="old-layout">${sections.map(id => `<section data-lpg-section="${id}" id="section-${id}"><h2>${id}</h2>${id === 'vouchers' ? '<div class="grid"><article class="voucher-card"><img src="https://example.com/reward.jpg" alt="Exam voucher"><button onclick="window.redemptions=(window.redemptions||0)+1">Redeem certification voucher</button></article></div>' : id === 'offers' ? '<article class="offer-card"><img src="https://example.com/event.jpg" alt="Conference"><p>Annual chapter conference &amp; networking</p></article>' : id === 'benefits' ? '<div id="benefits-content" class="toggle-content">Professional training</div>' : '<p>Customer-specific ' + id + ' content</p>'}</section>`).join('')}</div><p id="unmarked">Unmarked content survives</p><section hidden>Private view</section></main><script>window.originalScriptRan=true;</script></body></html>`;
function render(id, input = html) {
  return new JSDOM(templates.apply(input, { outputTemplate: id, colors: { primary: '#123456', accent: '#abc' } }), { runScripts: 'dangerously' });
}

test('classic and unknown templates preserve the original export byte for byte', () => {
  for (const state of [undefined, {}, { outputTemplate: 'classic' }, { outputTemplate: 'future-template' }]) assert.equal(templates.apply(html, state), html);
  assert.deepEqual(Array.from(templates.list, item => item.id), ['classic','dashboard','showcase','editorial']);
});

test('every layout retains all shared sections, images, copy, and working actions', () => {
  for (const id of ['dashboard','showcase','editorial','modern']) {
    const dom = render(id); const doc = dom.window.document;
    assert.equal(doc.querySelectorAll('[data-lpg-section]').length, sections.length, id);
    for (const section of sections) assert.equal(doc.querySelectorAll(`[data-lpg-section="${section}"]`).length, 1, section);
    for (const image of ['https://example.com/reward.jpg','https://example.com/event.jpg']) assert.ok(doc.querySelector(`img[src="${image}"]`), image);
    assert.match(doc.body.textContent, /Annual chapter conference & networking/);
    assert.match(doc.querySelector('#unmarked').textContent, /Unmarked content survives/);
    assert.ok(doc.querySelector('section[hidden]'));
    assert.ok(dom.window.originalScriptRan);
    doc.querySelector('.voucher-card button').click();
    assert.equal(dom.window.redemptions, 1, 'existing action remains attached after moving cards');
    assert.ok(doc.querySelector('#benefits-content').classList.contains('open'));
    assert.match(doc.querySelector('#lpg-layout-template').textContent, /prefers-reduced-motion/);
    assert.match(doc.querySelector('#lpg-layout-template').textContent, /:focus-visible/);
    dom.window.close();
  }
});

test('layouts compose content differently, and old Modern projects use the dashboard', () => {
  const dashboard = render('dashboard');
  assert.ok(dashboard.window.document.querySelector('.lpg-overview > [data-lpg-section="hero"]'));
  assert.ok(dashboard.window.document.querySelector('.lpg-dashboard-columns > .lpg-secondary > [data-lpg-section="activity"]'));
  const showcase = render('showcase');
  assert.ok(showcase.window.document.querySelector('.lpg-catalogue > [data-lpg-section="vouchers"]'));
  assert.ok(showcase.window.document.querySelector('.lpg-promotions > [data-lpg-section="offers"]'));
  assert.equal(showcase.window.document.querySelector('.lpg-dashboard-columns'), null);
  const editorial = render('editorial');
  assert.ok(editorial.window.document.querySelector('.lpg-brand-opening > .lpg-brand-photo'));
  assert.ok(editorial.window.document.querySelector('.lpg-brand-stories > [data-lpg-section="offers"]'));
  const modern = render('modern');
  assert.equal(modern.window.document.body.dataset.lpgTemplate, 'dashboard');
  for (const dom of [dashboard,showcase,editorial,modern]) dom.window.close();
});

test('reapplying a template replaces palette and layout script without duplication', () => {
  const once = templates.apply(html, { outputTemplate: 'dashboard' });
  const twice = templates.apply(once, { outputTemplate: 'showcase', colors: { primary: '#006644' } });
  assert.equal((twice.match(/<style id="lpg-layout-template">/g) || []).length, 1);
  assert.equal((twice.match(/<script id="lpg-template-layout">/g) || []).length, 1);
  assert.match(twice, /--lpg-brand: #006644;/);
  assert.doesNotMatch(twice, /--lpg-brand: #245c4f;/);
  const dom = new JSDOM(twice, { runScripts: 'dangerously' });
  assert.equal(dom.window.document.querySelectorAll('[data-lpg-layout]').length, 1);
  assert.equal(dom.window.document.body.dataset.lpgTemplate, 'showcase');
  dom.window.close();
});

test('untrusted project colors cannot inject CSS, markup, resources, or scripts', () => {
  const hostile = '</style><script>alert(1)</script><style>';
  const result = templates.apply(html, { outputTemplate: 'dashboard', colors: { primary: hostile, menu: 'url(https://evil.test/track)', accent: '#fff; } body { display:none' } });
  assert.doesNotMatch(result, /alert\(1\)|evil\.test|display:none/);
  assert.match(result, /--lpg-brand: #245c4f;/);
  assert.match(result, /--lpg-accent: #b9e7cb;/);
});

test('light brand colors receive readable hero and button surfaces', () => {
  const result = templates.apply(html, { outputTemplate: 'editorial', colors: { primary: '#ffff00' } });
  const hex = result.match(/--lpg-brand-deep: (#[a-f\d]{6})/i)[1];
  const luminance = [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)/255).map(c => c <= .04045 ? c / 12.92 : Math.pow((c+.055)/1.055,2.4)).reduce((s,c,i) => s+c*[.2126,.7152,.0722][i],0);
  assert.ok(1.05/(luminance+.05) >= 7);
  assert.match(result, /--lpg-brand: #ffff00;/);
});

test('missing images and optional sections leave a complete usable editorial layout', () => {
  const dom = render('editorial', '<html><head></head><body><main><h1>Membership</h1><section data-lpg-section="hero">Alex</section><section data-lpg-section="vouchers"><button>Redeem</button></section></main></body></html>');
  assert.equal(dom.window.document.querySelector('.lpg-brand-photo'), null);
  assert.equal(dom.window.document.querySelector('.lpg-brand-opening').textContent, 'Alex');
  assert.equal(dom.window.document.querySelector('.lpg-catalogue button').textContent, 'Redeem');
  dom.window.close();
});

test('editorial image enhancement does not promote unsafe source URLs', () => {
  const dom = render('editorial', html.replace('https://example.com/event.jpg','javascript:alert(1)'));
  assert.equal(dom.window.document.querySelector('.lpg-brand-photo'), null);
  dom.window.close();
});

test('incomplete documents fall back without corrupting content', () => {
  for (const partial of ['<div>Preview unavailable</div>','<head></head>',null]) assert.equal(templates.apply(partial,{outputTemplate:'dashboard'}),partial);
});

test('literal closing-body strings inside runtime code cannot swallow template injection', () => {
  const source = html.replace('window.originalScriptRan=true;', 'window.literal="</body>";window.originalScriptRan=true;');
  const dom = render('dashboard', source);
  assert.equal(dom.window.literal, '</body>');
  assert.equal(dom.window.originalScriptRan, true);
  assert.ok(dom.window.document.querySelector('.lpg-layout-dashboard'));
  assert.equal(dom.window.document.querySelectorAll('#lpg-template-layout').length, 1);
  dom.window.close();
});

test('real benefit and earn grids size to their section and keep descriptive text wrapping normally', () => {
  const context=vm.createContext({});context.window=context;
  for(const file of ['defaults','generator','portal-templates']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',file+'.js'),'utf8'),context);
  for (const outputTemplate of ['classic','dashboard','showcase','editorial']) {
    context.layoutFixture={outputTemplate};
    const output=vm.runInContext(`generatePortalHTML({...INDUSTRY_DEFAULTS.generic,...layoutFixture,brand:{name:'Northstar',programName:'Partner Benefits'},member:{name:'Summit Manufacturing',points:750},sections:{vouchers:true,offers:true,earnMore:true,badges:true,clubs:true,upsell:true},colors:{primary:'#123456',accent:'#abcdef',secondary:'#fafafa',dark:'#142332'},benefits:[{name:'Complimentary Technical Certification and Professional Development',emoji:'✦'},{name:'Priority Partner Support',emoji:'✦'}],earnMore:[{title:'Explore professional learning opportunities',description:'Develop practical skills with curated member resources.'},{title:'Connect with your community',description:'Discover local chapter events and share your expertise.'}]})`,context);
    const dom=new JSDOM(output,{runScripts:'dangerously'});const doc=dom.window.document;
    const style=node=>dom.window.getComputedStyle(node);
    if (outputTemplate === 'classic') {
      assert.equal(doc.querySelector('.lpg-layout'),null);
      assert.ok(doc.querySelector('.benefits-grid').classList.contains('lg:grid-cols-4'));
      assert.ok(doc.querySelector('.earn-grid').classList.contains('sm:grid-cols-2'));
      assert.doesNotMatch(style(doc.querySelector('.benefits-grid')).gridTemplateColumns,/auto-fit/);
    } else {
      assert.match(style(doc.querySelector('.benefits-grid')).gridTemplateColumns,/auto-fit.*220px/);
      assert.match(style(doc.querySelector('.earn-grid')).gridTemplateColumns,/auto-fit.*280px/);
      assert.equal(style(doc.querySelector('.benefit-copy p')).overflowWrap,'break-word');
      assert.equal(style(doc.querySelector('.benefit-copy p')).wordBreak,'normal');
      assert.equal(style(doc.querySelector('.earn-card h3')).overflowWrap,'break-word');
    }
    assert.equal(doc.querySelectorAll('.benefit-card').length,2);
    assert.equal(doc.querySelectorAll('.earn-card').length,2);
    if(outputTemplate==='showcase') {
      assert.ok(doc.querySelector('.lpg-community > .lpg-community-main > [data-lpg-section="benefits"]'));
      assert.ok(doc.querySelector('.lpg-community > .lpg-community-main > [data-lpg-section="earn"]'));
      assert.ok(doc.querySelector('.lpg-community > .lpg-community-support > [data-lpg-section="upsell"]'));
      assert.equal(doc.querySelector('.lpg-community > [data-lpg-section]'),null,'Sections must not become three equal-width columns');
    }
    dom.window.close();
  }
});
