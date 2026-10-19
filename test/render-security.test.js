const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const marker = `" autofocus onfocus="window.LPG_INJECTED=1"><img data-hostile src=x onerror="window.LPG_INJECTED=1"><script>window.LPG_INJECTED=1</script> & 'next'`;
function context() {
  const ctx = vm.createContext({}); ctx.window = ctx;
  for (const name of ['defaults','program-model','program-runtime','portal-templates','generator']) vm.runInContext(fs.readFileSync(`js/${name}.js`, 'utf8'), ctx);
  return ctx;
}
function fixture(ctx, programEnabled) {
  const state = vm.runInContext(`JSON.parse(JSON.stringify(INDUSTRY_DEFAULTS.generic))`, ctx);
  Object.assign(state, {
    brand: {name: marker, programName: marker, logoUrl: 'https://images.example/logo.jpg?title=" onload="bad'},
    member: {name:marker,number:marker,phone:marker,email:marker,joinDate:marker,points:120},
    colors:{primary:'#123456',accent:'#abc',dark:'#142332',secondary:'#f7f7f7',menu:'#234567'},
    sections:{vouchers:true,offers:true,earnMore:true,profileTasks:true,badges:true,clubs:true,upsell:true},
    tiers:[{name:marker,points:0},{name:marker,points:200}],
    tierProgress: `10; background:url(https://hostile.invalid)`,
    benefits:[{name:marker,emoji:marker,imageUrl:'javascript:alert(1)',coverImageUrl:'data:text/html,<svg onload=alert(1)>'}],
    vouchers:[{title:marker,vendor:marker,description:marker,expiry:marker,emoji:marker,actionType:'points',actionValue:marker,imageUrl:'javascript:alert(1)',gradient:[marker,marker]}, {title:marker,actionType:'code',actionValue:marker}],
    offers:[{title:marker,description:marker,cta:marker,expiry:marker,playerCount:marker,emoji:marker,gradient:[marker,marker],imageUrl:'https://images.example/photo.jpg?x=" onload="bad'}],
    earnMore:[{title:marker,description:marker},{title:marker,hasCodeInput:true}],
    profileTasks:[{description:marker,cta:marker}],badges:[{name:marker,emoji:marker,color:marker}],
    clubs:[{name:marker,description:marker,emoji:marker,memberCount:marker,gradient:[marker,marker]}],
    upsell:{title:marker,subtitle:marker,tagline:marker,cta:marker,price:marker,period:marker,bgImageUrl:'https://images.example/it\'s.jpg?name="bad"',bgColor:marker,titleColor:marker,subtitleColor:marker,priceColor:marker,periodColor:marker},
    navLinks:[marker],footerLinks:{col1:{title:marker,links:[marker]}},programEnabled
  });
  if (programEnabled) {
    state.program = ctx.LPGProgram.normalize({});
    state.program.name=marker; state.program.member.name=marker;
    const shortMarker = '<img data-hostile src=x onerror=window.LPG_INJECTED=1>';
    state.program.tiers.forEach(tier => tier.name=shortMarker);
    state.program.currencies.qualifyingName=shortMarker;
    state.program.currencies.redeemableName=shortMarker;
    state.program.rewards.forEach(reward => {reward.name=marker;reward.description=marker;});
    state.program.earnRules.forEach(rule => {rule.name=marker;rule.description=marker;});
  }
  return state;
}
for (const enabled of [false,true]) test(`customer content remains text across every template (${enabled?'rules':'legacy'})`, () => {
  const ctx=context();
  for (const template of ['classic','dashboard','showcase','editorial','cinematic']) {
    ctx.fixture=fixture(ctx,enabled);ctx.fixture.outputTemplate=template;
    const html=vm.runInContext('generatePortalHTML(fixture)',ctx);
    const dom=new JSDOM(html,{runScripts:'dangerously'});const doc=dom.window.document;
    assert.equal(doc.querySelector('[data-hostile]'),null,template);
    assert.equal(doc.querySelector('[autofocus],[onfocus],[onload]'),null,template);
    assert.equal(dom.window.LPG_INJECTED,undefined,template);
    assert.equal(doc.querySelector('h1').textContent,marker,template);
    assert.equal(doc.querySelector('.offer-card h3').textContent,marker,template);
    assert.equal(doc.querySelector('.offer-card button').textContent,marker,template);
    assert.equal(doc.querySelector('.offer-card img').getAttribute('src'),'https://images.example/photo.jpg?x=" onload="bad',template);
    assert.equal(doc.querySelector('.offer-card img').getAttribute('alt'),marker,template);
    for(const element of doc.querySelectorAll('[style],[class]')) {
      assert.doesNotMatch(element.getAttribute('style')||'',/hostile\.invalid|LPG_INJECTED/,template);
      assert.doesNotMatch(element.getAttribute('class')||'',/LPG_INJECTED/,template);
    }
    assert.equal(doc.querySelector('img[src^="javascript:"],img[src^="data:text/html"]'),null,template);
    dom.window.close();
  }
});
test('safe image formats, quoted URLs and literal multiline text survive rendering', () => {
  const ctx=context();const source='data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"><text>A & B</text></svg>';
  ctx.fixture=fixture(ctx,false);ctx.fixture.benefits=[{name:'First line\nSecond & <third>',imageData:source}];
  const dom=new JSDOM(vm.runInContext('buildBenefits(fixture)',ctx));const doc=dom.window.document;
  assert.equal(doc.querySelector('img').getAttribute('src'),source);
  assert.equal(doc.querySelector('.benefit-copy').textContent,'First line\nSecond & <third>');
  assert.equal(ctx.lpgImageSource('data:image/png;base64,aGVsbG8='),'data:image/png;base64,aGVsbG8=');
  for(const unsafe of ['javascript:alert(1)','data:text/html,<img>','file:///etc/passwd','//unapproved.example/image.png']) assert.equal(ctx.lpgImageSource(unsafe),'');
  dom.window.close();
});
test('builder escaping protects quoted attributes and text without changing authored content', () => {
  const source=fs.readFileSync('js/app.js','utf8');
  const definition=source.match(/function esc\(str\) \{[\s\S]*?\n\}/)[0];
  const ctx=vm.createContext({});vm.runInContext(definition,ctx);
  const dom=new JSDOM(`<input value="${ctx.esc(marker)}"><textarea>${ctx.esc(marker+'\nNext line')}</textarea>`);
  assert.equal(dom.window.document.querySelector('input').value,marker);
  assert.equal(dom.window.document.querySelector('textarea').value,marker+'\nNext line');
  assert.equal(dom.window.document.querySelector('[data-hostile],[onfocus],[autofocus]'),null);
  assert.equal(ctx.esc(0),'0');dom.window.close();
});
test('imported style tokens, numeric values and background image schemes cannot escape their contexts', () => {
  const ctx=context();ctx.fixture=fixture(ctx,false);
  for(const key of Object.keys(ctx.fixture.colors)) ctx.fixture.colors[key]='</style><script>window.LPG_INJECTED=1</script><style>';
  ctx.fixture.member.points=marker;ctx.fixture.tiers[0].points=marker;
  ctx.fixture.upsell.bgImageUrl='javascript:window.LPG_INJECTED=1';
  const dom=new JSDOM(vm.runInContext('generatePortalHTML(fixture)',ctx),{runScripts:'dangerously'});
  assert.equal(dom.window.LPG_INJECTED,undefined);
  assert.equal(dom.window.document.querySelector('[data-hostile],[onload],[onfocus]'),null);
  for(const style of dom.window.document.querySelectorAll('style')) assert.doesNotMatch(style.textContent,/LPG_INJECTED/);
  for(const element of dom.window.document.querySelectorAll('[style]')) assert.doesNotMatch(element.getAttribute('style'),/LPG_INJECTED|javascript:/);
  assert.equal(dom.window.document.querySelector('[data-lpg-balance="redeemable"]').textContent,'0');
  dom.window.close();
});
