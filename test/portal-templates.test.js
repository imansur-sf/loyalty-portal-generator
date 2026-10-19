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
  assert.deepEqual(Array.from(templates.list, item => item.id), ['classic','dashboard','showcase','cinematic','editorial']);
});

test('every layout retains all shared sections, images, copy, and working actions', () => {
  for (const id of ['dashboard','showcase','editorial','cinematic','modern']) {
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
  for (const outputTemplate of ['classic','dashboard','showcase','cinematic','editorial']) {
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
      if (outputTemplate === 'cinematic') assert.equal(style(doc.querySelector('.benefits-grid')).gridTemplateColumns,'repeat(2,minmax(0,1fr))');
      else assert.match(style(doc.querySelector('.benefits-grid')).gridTemplateColumns,/auto-fit.*220px/);
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

test('real voucher actions wrap long points labels and reserve readable space for reward buttons', () => {
  const context=vm.createContext({});context.window=context;
  for(const file of ['defaults','generator','portal-templates']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',file+'.js'),'utf8'),context);
  for(const outputTemplate of ['dashboard','showcase','editorial']) {
    context.layoutFixture={outputTemplate};
    const output=vm.runInContext(`generatePortalHTML({...INDUSTRY_DEFAULTS.generic,...layoutFixture,brand:{name:'Partner Company',programName:'Partner Rewards'},member:{name:'Summit Manufacturing',points:750},sections:{vouchers:true},colors:{primary:'#123456',accent:'#abcdef',secondary:'#fafafa',dark:'#142332'},vouchers:[{title:'Professional certification workshop',description:'Build expertise across your team.',programRewardId:'workshop',actionValue:'125,000 Professional Development Reward Points',emoji:'🎓'}]})`,context);
    const dom=new JSDOM(output,{runScripts:'dangerously'});const doc=dom.window.document;
    const row=doc.querySelector('.voucher-actions'),button=row.querySelector('.btn-primary');
    button.textContent='Request reward'; // B2B runtime label uses the same control.
    const rowStyle=dom.window.getComputedStyle(row),buttonStyle=dom.window.getComputedStyle(button),labelStyle=dom.window.getComputedStyle(row.querySelector('span'));
    assert.equal(rowStyle.flexWrap,'wrap',outputTemplate);
    assert.equal(labelStyle.flexBasis,'100%',outputTemplate);
    assert.equal(buttonStyle.flexShrink,'0',outputTemplate);
    assert.equal(buttonStyle.wordBreak,'normal',outputTemplate);
    assert.equal(buttonStyle.overflowWrap,'normal',outputTemplate);
    assert.equal(buttonStyle.maxWidth,'100%',outputTemplate);
    assert.match(row.textContent,/125,000 Professional Development Reward Points/);
    assert.equal(button.textContent,'Request reward');
    if(outputTemplate!=='dashboard') assert.equal(buttonStyle.flexBasis,'100%','Catalogue actions span the card width');
    dom.window.close();
  }
});

test('cinematic scenes omit absent content and expose direct destinations without images', () => {
  const dom = render('cinematic', '<html><head></head><body><main><h1>Orbit Rewards</h1><div data-lpg-section="hero">Alex, 250 points</div><section data-lpg-section="vouchers"><button>Redeem</button></section></main></body></html>');
  const doc = dom.window.document;
  assert.deepEqual(Array.from(doc.querySelectorAll('.cj-scene'), node => node.id), ['cj-arrival','cj-possibility']);
  assert.equal(doc.querySelectorAll('h1').length, 1);
  assert.ok(doc.querySelector('.cj-arrival h1'));
  for (const a of doc.querySelectorAll('.cj-nav a,.cj-cta')) assert.ok(doc.querySelector(a.hash), a.hash);
  assert.match(doc.querySelector('.cj-arrival').textContent, /Alex, 250 points/);
  assert.ok(doc.querySelector('.cj-orbit[aria-hidden="true"]'));
  dom.window.close();
});

test('cinematic motion follows scroll geometry and disables on preference or compact viewport changes', () => {
  let frame, reduce = false, compact = false;
  const listeners = {};
  const dom = new JSDOM(templates.apply(html, { outputTemplate:'cinematic' }), {
    runScripts:'dangerously', beforeParse(win) {
      win.requestAnimationFrame = callback => { frame = callback; return 1; };
      win.matchMedia = query => ({ get matches() { return query.includes('reduced') ? reduce : compact; }, addEventListener: (_, cb) => { listeners[query.includes('reduced') ? 'motion' : 'compact'] = cb; } });
    }
  });
  const doc = dom.window.document, layout = doc.querySelector('.lpg-layout-cinematic');
  const progress = doc.querySelector('#cj-progress');
  for (const scene of doc.querySelectorAll('.cj-scene')) scene.getBoundingClientRect = () => ({ top:1000, height:1600 });
  progress.getBoundingClientRect = () => ({ top:-400, height:1600 });
  frame();
  assert.ok(layout.classList.contains('cj-motion'));
  assert.ok(Number(progress.style.getPropertyValue('--cj-scroll')) > .3);
  assert.equal(doc.querySelector('.cj-nav [aria-current]').hash, '#cj-progress');
  reduce = true; listeners.motion(); frame();
  assert.equal(layout.classList.contains('cj-motion'), false);
  assert.equal(progress.style.getPropertyValue('--cj-scroll'), '0');
  reduce = false; compact = true; listeners.compact(); frame();
  assert.equal(layout.classList.contains('cj-motion'), false);
  assert.ok(doc.querySelector('#cj-possibility button'), 'Rewards stay available throughout');
  dom.window.close();
});

test('cinematic palettes remain readable for pale and dark brands, with extensive content intact', () => {
  for (const primary of ['#ffffcc','#140933']) {
    const many = html.replace('<div class="grid"><article class="voucher-card">', '<div class="grid">' + Array.from({length:24}, (_,i) => `<article class="voucher-card"><h3>${'Long reward title '.repeat(8)}${i}</h3><button>Choose ${i}</button></article>`).join('') + '<article class="voucher-card">');
    const output = templates.apply(many, { outputTemplate:'cinematic', colors:{primary,accent:'#fff'} });
    const dom = new JSDOM(output, { runScripts:'dangerously' });
    assert.equal(dom.window.document.querySelectorAll('.voucher-card').length, 25);
    assert.equal(dom.window.document.querySelectorAll('.cj-scene').length, 6);
    assert.match(dom.window.document.querySelector('#lpg-layout-template').textContent, /max-width:600px/);
    const deep = output.match(/--lpg-brand-deep: (#[a-f\d]{6})/i)[1];
    const lum = [1,3,5].map(i=>parseInt(deep.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4)).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
    assert.ok(1.05/(lum+.05)>=7);
    dom.window.close();
  }
});

test('cinematic content fades, expands and settles continuously as stationary containers enter the viewport', () => {
  let frame;
  const source = html;
  const dom = new JSDOM(templates.apply(source, {outputTemplate:'cinematic'}), {
    runScripts:'dangerously', beforeParse(win) {
      win.requestAnimationFrame = cb => { frame=cb; return 1; };
      win.matchMedia = () => ({matches:false,addEventListener(){}});
    }
  });
  const win=dom.window, doc=win.document, card=doc.querySelector('.voucher-card');
  let top=win.innerHeight;
  card.getBoundingClientRect=()=>({top,height:400});
  frame();
  assert.equal(card.style.getPropertyValue('--cj-enter'),'0.0000');
  top=win.innerHeight*.7; win.dispatchEvent(new win.Event('scroll')); frame();
  assert.equal(card.style.getPropertyValue('--cj-enter'),'0.5000');
  top=win.innerHeight*.4; win.dispatchEvent(new win.Event('scroll')); frame();
  assert.equal(card.style.getPropertyValue('--cj-enter'),'1.0000');
  top=win.innerHeight*.7; win.dispatchEvent(new win.Event('scroll')); frame();
  assert.equal(card.style.getPropertyValue('--cj-enter'),'0.5000','scrolling back reverses the entrance');
  const css=doc.querySelector('#lpg-layout-template').textContent;
  assert.match(css,/clip-path: inset\(/,'images expand from a rounded mask');
  assert.match(css,/\.offer-card > div:last-child \{ opacity:/,'copy fades independently of stationary card geometry');
  assert.match(css,/@media print, \(prefers-reduced-motion:reduce\)/);
  assert.equal(card.hasAttribute('hidden'),false);
  dom.window.close();
});

test('cinematic entrance effects resolve immediately for keyboard focus and direct chapter navigation', () => {
  let frame;
  const dom = new JSDOM(templates.apply(html, {outputTemplate:'cinematic'}), {
    runScripts:'dangerously', beforeParse(win) {
      win.requestAnimationFrame=cb=>{frame=cb;return 1;};
      win.matchMedia=()=>({matches:false,addEventListener(){}});
    }
  });
  const win=dom.window, doc=win.document, card=doc.querySelector('.voucher-card');
  card.getBoundingClientRect=()=>({top:2000,height:400}); frame();
  assert.equal(card.style.getPropertyValue('--cj-enter'),'0.0000');
  card.querySelector('button').focus(); frame();
  assert.equal(card.style.getPropertyValue('--cj-enter'),'1.0000');
  card.querySelector('button').blur();
  win.location.hash='cj-possibility'; win.dispatchEvent(new win.Event('hashchange')); frame();
  assert.equal(card.style.getPropertyValue('--cj-enter'),'1.0000');
  assert.ok(doc.querySelector('.cj-scene:target'));
  card.querySelector('button').click(); assert.equal(win.redemptions,1);
  dom.window.close();
});

function cinematicProductionFixture(overrides = {}) {
  const context = vm.createContext({}); context.window = context;
  for (const name of ['defaults','program-model','program-runtime','portal-templates','generator']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',name+'.js'),'utf8'),context);
  context.overrides = overrides;
  return vm.runInContext(`generatePortalHTML({...INDUSTRY_DEFAULTS.generic,
    brand:{name:'Northstar',programName:'Northstar Club'},member:{name:'Alex Morgan',points:1250},
    colors:{primary:'#25473b',accent:'#e0dfc3',secondary:'#fafafa',dark:'#18202f'},
    outputTemplate:'cinematic',programEnabled:true,program:LPGProgram.normalize({mode:'b2c',opening:{qualifying:1400,redeemable:1250},
      rewards:[{id:'first',name:'A member experience',cost:1000},{id:'second',name:'A second reward',cost:2000}]}),
    sections:{vouchers:true,offers:true,earnMore:true},
    vouchers:[{programRewardId:'first',imageUrl:'https://brand.example/reward.jpg',description:'The customer’s reward description.'}],
    benefits:[{name:'Priority support',emoji:'✦'},{name:'Member access',emoji:'✦'},{name:'Personal service',emoji:'✦'}],
    ...overrides})`,context);
}

test('approved cinematic concept connects its membership card, expanding film and benefit chapter to real sections', () => {
  const dom = new JSDOM(cinematicProductionFixture(),{runScripts:'dangerously'}); const doc=dom.window.document;
  assert.equal(doc.querySelector('.cj-card-brand').textContent,'Northstar');
  assert.equal(doc.querySelector('.cj-card-member').textContent,'Avery Morgan');
  assert.equal(doc.querySelector('.cj-status-tier').textContent,'Plus');
  assert.equal(doc.querySelector('.cj-nav-balance strong').textContent,'1,250');
  assert.ok(doc.querySelector('.cj-stage > .cj-membership'));
  assert.ok(doc.querySelector('[data-lpg-section="vouchers"] .cj-reward-film .cj-featured-reward[data-program-reward-id="first"]'));
  assert.equal(doc.querySelectorAll('.cj-featured-reward').length,1);
  assert.equal(doc.querySelectorAll('.voucher-card').length,2);
  assert.ok(doc.querySelector('.cj-featured-reward [data-lpg-action="request"]'));
  assert.ok(doc.querySelector('.cj-featured-reward img[src="https://brand.example/reward.jpg"]'));
  assert.match(doc.querySelector('.cj-featured-copy').textContent,/customer’s reward description/);
  const order=Array.from(doc.querySelectorAll('.cj-scene'),n=>n.id);
  assert.ok(order.indexOf('cj-benefits')>order.indexOf('cj-possibility'));
  assert.equal(doc.querySelectorAll('.cj-benefits .benefit-card').length,3);
  dom.window.close();
});

test('approved scene timelines morph the card and expand the actual reward, with immediate focus and anchor access', () => {
  let frame;
  const dom=new JSDOM(cinematicProductionFixture(),{runScripts:'dangerously',beforeParse(win){
    win.requestAnimationFrame=cb=>{frame=cb;return 1;};win.matchMedia=()=>({matches:false,addEventListener(){}});
  }});
  const win=dom.window,doc=win.document,arrival=doc.querySelector('.cj-arrival'),film=doc.querySelector('.cj-reward-film');
  const nav=doc.querySelector('.cj-nav');nav.getBoundingClientRect=()=>({height:64});
  let openingTop=64,filmTop=1500;
  arrival.getBoundingClientRect=()=>({top:openingTop,height:1704});
  film.getBoundingClientRect=()=>({top:filmTop,height:1704});
  frame();
  assert.equal(arrival.style.getPropertyValue('--cj-card-radius'),'76px');
  assert.equal(film.style.getPropertyValue('--cj-mask-x'),'29%');
  openingTop=-936;filmTop=64-900;win.dispatchEvent(new win.Event('scroll'));frame();
  assert.equal(arrival.style.getPropertyValue('--cj-card-radius'),'24px');
  assert.equal(arrival.style.getPropertyValue('--cj-status'),'1');
  assert.equal(film.style.getPropertyValue('--cj-mask-x'),'0%');
  assert.equal(film.style.getPropertyValue('--cj-film-copy'),'1');
  filmTop=1500;win.dispatchEvent(new win.Event('scroll'));frame();
  assert.equal(film.style.getPropertyValue('--cj-film-copy'),'0');
  const redeem=film.querySelector('[data-lpg-action="request"]');redeem.focus();frame();
  assert.equal(film.style.getPropertyValue('--cj-film-copy'),'1');
  assert.equal(film.style.getPropertyValue('--cj-mask-x'),'0%');
  redeem.blur();win.location.hash='cj-possibility';win.dispatchEvent(new win.Event('hashchange'));frame();
  assert.equal(film.style.getPropertyValue('--cj-film-copy'),'1');
  assert.equal(doc.querySelectorAll('.cj-featured-reward').length,1);
  dom.window.close();
});

test('long customer copy uses the flowing composition and all serialized brand values remain plain text', () => {
  let frame;
  const name='A customer brand with a very long descriptive name '.repeat(4);
  const output=cinematicProductionFixture({brand:{name,programName:'Member program'}});
  const dom=new JSDOM(output,{runScripts:'dangerously',beforeParse(win){win.requestAnimationFrame=cb=>{frame=cb;return 1;};win.matchMedia=()=>({matches:false,addEventListener(){}});}});
  frame();
  assert.equal(dom.window.document.querySelector('.cj-card-brand').textContent,name);
  assert.equal(dom.window.document.querySelector('.lpg-layout-cinematic').classList.contains('cj-motion'),false);
  assert.ok(dom.window.document.querySelector('.cj-featured-reward [data-lpg-action="request"]'));
  dom.window.close();
  const attack='</script><script>window.injected=true</script>';
  const unsafe=templates.apply(html,{outputTemplate:'cinematic',brand:{name:attack},member:{name:attack},tiers:[{name:attack}]});
  const safe=new JSDOM(unsafe,{runScripts:'dangerously'});
  assert.equal(safe.window.injected,undefined);
  assert.equal(safe.window.document.querySelector('.cj-card-brand').textContent,attack);
  safe.window.close();
});

test('featured reward retains its original broken-image fallback and all other catalog cards', () => {
  const dom=new JSDOM(cinematicProductionFixture(),{runScripts:'dangerously'});
  const doc=dom.window.document,image=doc.querySelector('.cj-reward-visual img');
  image.dispatchEvent(new dom.window.Event('error'));
  assert.equal(image.style.display,'none');
  assert.equal(image.nextElementSibling.style.display,'block');
  assert.equal(doc.querySelectorAll('[data-program-reward-id]').length,2);
  assert.ok(doc.querySelector('.cj-featured-copy [data-lpg-action="request"]'));
  assert.equal(doc.querySelectorAll('#benefits-content').length,1);
  dom.window.close();
});

test('metal membership surfaces have readable brand text across contrasting palettes', () => {
  const lum=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  for (const primary of ['#000000','#555555','#ffffff','#ffff00','#0000ff','#008000','#ff0000','#25473b']) {
    const result=templates.apply(html,{outputTemplate:'cinematic',colors:{primary}});
    const deep=result.match(/--lpg-brand-deep: (#[a-f\d]{6})/)[1];
    const metal=result.match(/--cj-metal-mid: (#[a-f\d]{6})/)[1];
    assert.ok((lum(metal)+.05)/(lum(deep)+.05)>=4.5,primary);
  }
});

test('cinematic chapter copy is editable, preserves line breaks and remains inert text in exported portals', () => {
  const copy={arrivalEyebrow:'A place\nto belong',arrivalTitle:'Your world.\nOpening up.',arrivalDescription:'A closer\nwith another line',statusTitle:'Next\nchapter',benefitsTitle:'Your benefits,\nyour way.',detailsTitle:'</script><img src=x onerror=alert(1)>',arrivalAction:''};
  const dom=new JSDOM(cinematicProductionFixture({cinematic:{copy}}),{runScripts:'dangerously'}); const doc=dom.window.document;
  assert.equal(doc.querySelector('.cj-arrival .cj-heading .cj-title').textContent,copy.arrivalTitle);
  assert.equal(doc.querySelector('.cj-arrival-status .cj-title').textContent,copy.statusTitle);
  assert.equal(doc.querySelector('.cj-benefits .cj-title').textContent,copy.benefitsTitle);
  assert.equal(doc.querySelector('.cj-details .cj-title').textContent,copy.detailsTitle);
  assert.equal(doc.querySelector('img[src="x"]'),null);
  assert.equal(doc.querySelector('.cj-arrival .cj-cta'),null);
  assert.equal(dom.window.getComputedStyle(doc.querySelector('.cj-arrival .cj-heading .cj-title')).whiteSpace,'pre-wrap');
  dom.window.close();
});

test('cinematic benefit covers fill tiles while other templates keep their original icons', () => {
  for(const outputTemplate of ['cinematic','classic','dashboard','showcase','editorial']){
    const output=cinematicProductionFixture({outputTemplate,benefits:[{name:'Early access',imageUrl:'https://brand.example/icon.png',coverImageUrl:'https://brand.example/cover.jpg'}]});
    const dom=new JSDOM(output,{runScripts:'dangerously'});const doc=dom.window.document;
    assert.ok(doc.querySelector('.benefit-card img[src="https://brand.example/icon.png"]'));
    if(outputTemplate==='cinematic'){
      const image=doc.querySelector('.lpg-benefit-cover');assert.ok(image);assert.equal(image.alt,'');
      assert.ok(image.parentElement.classList.contains('cj-benefit-has-cover'));
      image.dispatchEvent(new dom.window.Event('error'));
      assert.equal(doc.querySelector('.lpg-benefit-cover'),null);
      assert.equal(doc.querySelector('.benefit-card').classList.contains('cj-benefit-has-cover'),false);
      assert.ok(doc.querySelector('.benefit-copy'));
    }else assert.equal(doc.querySelector('.lpg-benefit-cover'),null);
    dom.window.close();
  }
});

test('card emblem and full artwork can be replaced without losing live tier data, with default fallbacks', () => {
  const dom=new JSDOM(cinematicProductionFixture({brand:{name:'Northstar',programName:'Rewards',logoUrl:'https://brand.example/logo.png'},cinematic:{card:{markMode:'brand',mode:'image',artworkImageUrl:'https://brand.example/card.jpg',showDetails:false}}}),{runScripts:'dangerously'});const doc=dom.window.document;
  const card=doc.querySelector('.cj-membership');
  assert.equal(card.querySelector('.cj-card-logo').src,'https://brand.example/logo.png');
  assert.equal(card.querySelector('.cj-card-artwork').src,'https://brand.example/card.jpg');
  assert.ok(card.classList.contains('cj-hide-details'));
  assert.ok(card.querySelector('[data-lpg-tier]'));
  card.querySelector('.cj-card-artwork').dispatchEvent(new dom.window.Event('error'));
  assert.equal(card.classList.contains('cj-has-artwork'),false);
  assert.equal(card.classList.contains('cj-hide-details'),false);
  card.querySelector('.cj-card-logo').dispatchEvent(new dom.window.Event('error'));
  assert.equal(card.classList.contains('cj-has-mark'),false);
  assert.ok(card.querySelector('.cj-card-sculpture'));
  dom.window.close();
  const custom=new JSDOM(cinematicProductionFixture({cinematic:{card:{markMode:'custom',markImageUrl:'https://brand.example/crest.png'}}}),{runScripts:'dangerously'});
  assert.equal(custom.window.document.querySelector('.cj-card-logo').src,'https://brand.example/crest.png');
  assert.equal(custom.window.document.querySelector('.cj-card-artwork'),null);
  custom.window.close();
});

test('multiline editable headings use flowing scenes when too tall for pinned compositions',()=>{
  for(const key of ['arrivalEyebrow','statusEyebrow','statusTitle','possibilityTitle','possibilityDescription']){
    let frame;
    const dom=new JSDOM(cinematicProductionFixture({cinematic:{copy:{[key]:'One\nTwo\nThree\nFour\nFive\nSix'}}}),{runScripts:'dangerously',beforeParse(win){win.requestAnimationFrame=cb=>{frame=cb;return 1;};win.matchMedia=()=>({matches:false,addEventListener(){}});}});
    frame();
    assert.equal(dom.window.document.querySelector('.lpg-layout-cinematic').classList.contains('cj-motion'),false,key);
    assert.ok(dom.window.document.querySelector('.cj-featured-copy [data-lpg-action="request"]'));
    dom.window.close();
  }
});
