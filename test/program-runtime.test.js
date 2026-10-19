const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const model = require('../js/program-model');
const runtime = require('../js/program-runtime');
globalThis.LPGProgram = model;
const html = '<!doctype html><html><head></head><body><header class="site-header">Original Brand</header><main><p>Original consumer card</p><img src="https://brand.example/benefit.png" alt="Benefit"></main><footer>Original footer</footer></body></html>';
function program(overrides = {}) {
  return model.normalize({ mode: 'b2b', name: 'Business rewards', providerName: 'Example Provider',
    member: { name: 'Demo Member', organization: 'Example Business', role: 'purchaser' },
    opening: { qualifying: 1000, redeemable: 500 }, approvalRequired: true, ...overrides });
}
function session(overrides) { return runtime.createSession(program(overrides), model); }
function portal(overrides = {}) {
  const context = vm.createContext({}); context.window = context;
  for (const file of ['defaults', 'program-model', 'program-runtime', 'portal-templates', 'generator']) vm.runInContext(fs.readFileSync('js/' + file + '.js', 'utf8'), context);
  context.state = { brand: { name: 'ISACA', programName: 'ISACA Loyalty', logoUrl: 'https://brand.example/logo.png' },
    colors: { primary: '#002e5d', secondary: '#f7f7f7', accent: '#00a8df', dark: '#111827' }, member: { name: 'Member', points: 1, avatarUrl: 'https://brand.example/avatar.jpg' },
    navLinks: ['Home', 'Rewards'], tiers: [{ name: 'Old', points: 0 }], sections: { vouchers:true, offers:true, earnMore:true, badges:true, clubs:true, upsell:true },
    vouchers: [{ title:'Stale title', programRewardId:'credit', description:'Certification exam preparation package', imageUrl:'https://brand.example/exam.jpg' }],
    earnMore:[{ programRuleId:'purchase', title:'Old activity', description:'Grow your professional knowledge', imageUrl:'https://brand.example/learning.jpg' }],
    offers:[{ title:'CPE webinar', description:'Member learning benefit', imageUrl:'https://brand.example/webinar.jpg' }],
    benefits:[{ name:'ISACA Journal', imageUrl:'https://brand.example/journal.jpg' }], badges:[{name:'Certified',imageUrl:'https://brand.example/badge.jpg'}],
    clubs:[{name:'Local chapter',description:'Meet your community',imageUrl:'https://brand.example/chapter.jpg'}],
    upsell:{title:'Professional Membership',tagline:'Develop your career',backgroundImageUrl:'https://brand.example/member.jpg'},
    programEnabled:true, program:program(), ...overrides };
  return vm.runInContext('generatePortalHTML(state)', context);
}
function loaded(output) { return new JSDOM(output, { runScripts:'dangerously' }); }
function click(document, action, id) {
  const control = Array.from(document.querySelectorAll('[data-lpg-action]')).find(node => node.dataset.lpgAction === action && (!id || node.dataset.id === id));
  assert.ok(control, 'Missing action '+action+':'+id); control.click();
}

test('legacy projects retain their exact original HTML', () => {
  for (const state of [{}, { program:program() }, { programEnabled:false,program:program() }]) assert.equal(runtime.enhance(html,state),html);
});
test('program enhances original content and excludes private requirement notes', () => {
  const output = runtime.enhance(html, {programEnabled:true,program:program({assumptions:['PRIVATE_ASSUMPTION'],futureFeatures:['PRIVATE_FUTURE'],requirements:[{id:'secret',text:'PRIVATE_REQUIREMENT',source:'PRIVATE_SOURCE',status:'question'}]})});
  assert.match(output,/Original consumer card/); assert.match(output,/benefit.png/); assert.match(output,/Original footer/);
  assert.doesNotMatch(output,/PRIVATE_(ASSUMPTION|FUTURE|REQUIREMENT|SOURCE)/);
});
test('untrusted program strings remain text in exported runtime', () => {
  const attack='</script><img src=x onerror=alert(1)>';
  const output=runtime.enhance(html,{programEnabled:true,program:program({name:attack,member:{organization:attack,name:attack,role:'purchaser'}})});
  assert.ok(!output.includes(attack)); assert.match(output,/\\u003c\/script\\u003e/);
  const dom=loaded(output);
  try { assert.equal(dom.window.document.querySelectorAll('img[src="x"]').length,0); assert.ok(dom.window.document.body.textContent.includes(attack)); } finally { dom.window.close(); }
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


test('rich exports retain all branded images, descriptions and sections while using authoritative program values', () => {
  const output = portal(); const dom = loaded(output); const doc=dom.window.document;
  try {
    for (const text of ['Certification exam preparation package','CPE webinar','ISACA Journal','Professional Membership','Local chapter']) assert.ok(doc.body.textContent.includes(text),text);
    assert.ok(doc.querySelectorAll('img').length >= 8);
    assert.equal(doc.querySelectorAll('[data-lpg-section="tiers"]').length,1);
    assert.equal(doc.querySelectorAll('[data-program-reward-id]').length,model.normalize(program()).rewards.length);
    assert.equal(doc.querySelector('[data-lpg-balance="redeemable"]').textContent,'500');
    assert.equal(doc.querySelector('[data-lpg-balance="qualifying"]').textContent,'1,000');
    assert.ok(!doc.body.textContent.includes('Stale title'));
    assert.ok(!doc.body.textContent.includes('Redeem 200 pts before they expire'));
    assert.ok(doc.querySelector('script[src*="tailwindcss"]'),'Classic styles retained');
  } finally { dom.window.close(); }
});
test('rich export runs standalone and updates existing balances after earning, request, approval and reset', () => {
  const dom=loaded(portal()); const doc=dom.window.document;
  try {
    doc.getElementById('lpg-amount-purchase').value='100'; click(doc,'earn','purchase');
    assert.equal(doc.querySelector('[data-lpg-balance="redeemable"]').textContent,'625');
    assert.equal(doc.querySelector('[data-lpg-balance="qualifying"]').textContent,'1,100');
    click(doc,'request','credit'); assert.equal(doc.querySelector('[data-lpg-balance="redeemable"]').textContent,'625');
    const role=doc.getElementById('lpg-p-role'); role.value='approver'; role.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
    click(doc,'approve','request-1'); assert.equal(doc.querySelector('[data-lpg-balance="redeemable"]').textContent,'525');
    assert.match(doc.querySelector('[data-lpg-section="team"]').textContent,/approved/);
    assert.match(doc.querySelector('[data-lpg-section="activity"]').textContent,/Eligible business order/);
    click(doc,'reset'); assert.equal(doc.querySelector('[data-lpg-balance="redeemable"]').textContent,'500');
    assert.equal(doc.querySelector('img[src="https://brand.example/exam.jpg"]').getAttribute('alt'),model.normalize(program()).rewards[0].name);
  } finally { dom.window.close(); }
});
test('B2C rich reward redemption is immediate and welcome screen demonstrates sign-in without credentials', () => {
  const p=program({mode:'b2c',approvalRequired:false,member:{name:'Alex',role:'member'}});
  const dom=loaded(portal({program:p})); const doc=dom.window.document;
  try {
    assert.equal(doc.querySelector('[data-lpg-section="team"]'),null);
    click(doc,'request','credit'); assert.equal(doc.querySelector('[data-lpg-balance="redeemable"]').textContent,'400');
    click(doc,'welcome'); assert.equal(doc.querySelector('.lpg-welcome').hidden,false);
    click(doc,'signin'); assert.equal(doc.querySelector('.lpg-welcome').hidden,true);
    assert.equal(doc.querySelector('[data-lpg-balance="redeemable"]').textContent,'400');
  } finally { dom.window.close(); }
});
test('projection preserves original authoring state, uses stable mapping IDs and preserves literal replacement-pattern text', () => {
  const p=program({name:"$` Customer $' $&"});
  const state={programEnabled:true,program:p,member:{points:3},vouchers:[{programRewardId:'credit',imageUrl:'credit.jpg',description:'Specific detail'}],earnMore:[]};
  const before=JSON.stringify(state), view=runtime.projectState(state,model);
  assert.equal(JSON.stringify(state),before); assert.equal(view.vouchers[0].imageUrl,'credit.jpg'); assert.equal(view.member.points,500);
  const dom=loaded(portal({program:p}));
  try { assert.ok(dom.window.document.title.includes(p.name)); assert.equal(dom.window.document.querySelectorAll('html').length,1); } finally { dom.window.close(); }
});

test('all alternate layouts preserve actual runtime actions after repositioning rich sections', () => {
  for (const outputTemplate of ['dashboard', 'showcase', 'editorial']) {
    const dom=loaded(portal({outputTemplate})); const doc=dom.window.document;
    try {
      doc.getElementById('lpg-amount-purchase').value='100'; click(doc,'earn','purchase');
      assert.equal(doc.querySelector('[data-lpg-balance="redeemable"]').textContent,'625',outputTemplate);
      assert.match(doc.getElementById('lpg-p-status').textContent,/Activity added/);
      click(doc,'request','credit');
      const role=doc.getElementById('lpg-p-role'); role.value='approver'; role.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
      click(doc,'approve','request-1'); assert.equal(doc.querySelector('[data-lpg-balance="redeemable"]').textContent,'525',outputTemplate);
      assert.equal(doc.querySelectorAll('[data-lpg-section="vouchers"]').length,1);
      assert.ok(doc.querySelector('img[src="https://brand.example/exam.jpg"]'));
    } finally { dom.window.close(); }
  }
});


test('membership presentation never invents a price or billing period when they are unspecified', () => {
  for (const programEnabled of [true, false]) {
    const dom=loaded(portal({programEnabled,upsell:{title:'Professional Membership',price:'',period:'',tagline:'Explore member benefits'}}));
    try {
      const text=dom.window.document.querySelector('[data-lpg-section="upsell"]').textContent;
      assert.ok(text.includes('Professional Membership'));
      assert.doesNotMatch(text,/\$|29|Monthly/);
    } finally {dom.window.close();}
  }
  const dom=loaded(portal({upsell:{title:'Membership',price:'$49',period:'Annual',tagline:'An explicit membership offer'}}));
  try { assert.match(dom.window.document.querySelector('[data-lpg-section="upsell"]').textContent,/49[\s\S]*Annual/); } finally {dom.window.close();}
});
