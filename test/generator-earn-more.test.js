const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
function earnCards(earnMore) {
  const context=vm.createContext({});
  vm.runInContext(fs.readFileSync('js/generator.js','utf8'),context);
  context.fixture={colors:{primary:'#123456',dark:'#142332'},earnMore};
  return new JSDOM(vm.runInContext('buildEarnMore(fixture)',context)).window.document;
}
test('mapped earning opportunities retain promotional copy and imagery with a detail action instead of transaction controls',()=>{
  const doc=earnCards([{programRuleId:'purchase',rule:{id:'purchase',kind:'spend',qualifyingRate:3,redeemableRate:7,amount:100},title:'Discover the new collection',description:'Find thoughtful essentials and enjoy exclusive member benefits.',imageUrl:'https://brand.example/collection.jpg',emoji:'✦'}]);
  const card=doc.querySelector('[data-program-rule-id="purchase"]');
  assert.equal(card.querySelector('h3').textContent,'Discover the new collection');
  assert.equal(card.querySelector('[data-lpg-activity-description]').textContent,'Find thoughtful essentials and enjoy exclusive member benefits.');
  assert.equal(card.querySelector('img').src,'https://brand.example/collection.jpg');
  const action=card.querySelector('button[data-lpg-action="activity"]');
  assert.equal(action.dataset.id,'purchase'); assert.equal(action.type,'button');
  assert.equal(action.getAttribute('aria-label'),'Explore Discover the new collection');
  assert.ok(action.querySelector('svg'));
  assert.equal(card.querySelector('input,[data-lpg-action="earn"]'),null);
  assert.doesNotMatch(card.textContent,/Add purchase|Complete activity|per unit spent|base .*Points|Amount/);
});
test('promotional cards escape source text and offer an icon when no image was supplied',()=>{
  const doc=earnCards([{programRuleId:'event',rule:{id:'event',kind:'fixed'},title:'Learn <more>',description:'Meet peers & share "ideas".',emoji:'<img src=x>'}]);
  assert.equal(doc.querySelector('h3').textContent,'Learn <more>');
  assert.equal(doc.querySelector('img'),null);
  assert.equal(doc.querySelector('[data-lpg-activity-description]').textContent,'Meet peers & share "ideas".');
  assert.match(doc.body.textContent,/<img src=x>/);
});
test('unmapped legacy opportunities and referral-code presentation remain available',()=>{
  const doc=earnCards([{title:'Join our community',description:'Discover what members are sharing.'},{title:'Unlock a welcome bonus',hasCodeInput:true}]);
  assert.equal(doc.querySelectorAll('.earn-card').length,2);
  assert.match(doc.body.textContent,/Join our community/);
  assert.equal(doc.querySelector('input').placeholder,'Enter your code');
  assert.equal(doc.querySelector('[data-lpg-action="earn"]'),null);
});
