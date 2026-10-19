const {test}=require('node:test');
const assert=require('node:assert/strict');
const contract=require('../js/content-contract');
const provenance=require('../js/program-provenance');

test('stable content identity survives reordering and renaming with distinct per-role assets',()=>{
 const old=contract.ensure({benefits:[{name:'A'},{name:'B'}],offers:[{title:'C'}]});
 const next=contract.ensure({benefits:[{id:old.benefits[1].id,name:'Renamed'},{name:'A'}],offers:[{title:'Replacement'}]},old);
 assert.equal(next.benefits[0].id,old.benefits[1].id);assert.equal(next.benefits[1].id,old.benefits[0].id);
 assert.notEqual(next.offers[0].id,old.offers[0].id);assert.notEqual(next.benefits[0].assetId,next.benefits[0].coverAssetId);
 const dedupe=contract.ensure({benefits:[{id:'duplicate',name:'A'},{id:'duplicate',name:'B'}]});
 assert.notEqual(dedupe.benefits[0].id,dedupe.benefits[1].id);
});
test('scoped replacement cannot modify unrelated authored content or policy',()=>{
 const old=contract.ensure({offers:[{title:'Old'}],benefits:[{name:'Authored'}],footerLinks:{col1:{title:'My footer'}},program:{name:'Accepted'},colors:{primary:'#fff'}});
 const next=contract.scope({offers:[{title:'New'}],benefits:[{name:'Unwanted'}],program:{name:'AI'},colors:{primary:'#000'}},old,{sections:['offers']});
 assert.equal(next.offers[0].title,'New');assert.deepEqual(next.benefits,old.benefits);assert.deepEqual(next.footerLinks,old.footerLinks);
 assert.deepEqual(next.program,old.program);assert.deepEqual(next.colors,old.colors);
});
test('fill blanks and add modes preserve existing authored items',()=>{
 const old=contract.ensure({offers:[{title:'A',description:'',cta:'Keep'}],benefits:[{name:'Existing'}]});
 const proposal={offers:[{id:old.offers[0].id,title:'A',description:'Filled',cta:'Wrong'}],benefits:[{name:'Existing'},{name:'Added'}]};
 const fill=contract.scope(proposal,old,{sections:['offers'],mode:'fill'});
 assert.equal(fill.offers[0].description,'Filled');assert.equal(fill.offers[0].cta,'Keep');
 const added=contract.scope(proposal,old,{sections:['benefits'],mode:'add'});
 assert.deepEqual(added.benefits.map(item=>item.name),['Existing','Added']);
});
test('evidence requires the exact supplied page and value, not model assertions',()=>{
 const program={currencies:{qualifyingName:'Status Points',redeemableName:'Rewards',pointsPerUnit:100},tiers:[{name:'Silver',threshold:1000,multiplier:1}],earnRules:[],rewards:[]};
 const context={brief:{sources:[{name:'Policy.pdf',pages:[{text:'Silver requires 1,000 Status Points.'},{text:'Rewards are redeemable points.'}]}]}};
 const audit=provenance.audit(program,[{path:'tiers.0.name',source:'Policy.pdf',page:1,quote:'Silver requires 1,000 Status Points.'},{path:'tiers.0.threshold',source:'Policy.pdf',page:1,quote:'Silver requires 1,000 Status Points.'},{path:'currencies.redeemableName',source:'Policy.pdf',page:1,quote:'Rewards are redeemable points.'},{path:'currencies.pointsPerUnit',source:'Policy.pdf',page:1,quote:'Silver requires 1,000 Status Points.'}],context);
 const get=path=>audit.records.find(item=>item.path===path);
 assert.equal(get('tiers.0.name').status,'source-quoted');assert.equal(get('tiers.0.threshold').status,'source-quoted');
 assert.equal(get('currencies.redeemableName').status,'unresolved');assert.equal(get('currencies.pointsPerUnit').status,'unresolved');
 assert.equal(get('currencies.qualifyingName').status,'illustrative');assert.equal(audit.requiresReview,true);
});
test('author edits invalidate obsolete policy quotes',()=>{
 const evidence={records:[{path:'tiers.0.name',value:'Silver',status:'source-quoted',quote:'Silver'}]};
 const edited=provenance.invalidate(evidence,{tiers:[{name:'Gold'}]});
 assert.equal(edited.records[0].status,'author-edited');assert.equal(edited.records[0].quote,'');assert.equal(evidence.records[0].value,'Silver');
});

test('post-clean scoped merge restores unchanged authored leaves including long text',()=>{
 const old={id:'authored-offer',title:'An authored heading '.repeat(25),description:'',cta:'My action',imageData:'data:image/png;base64,author'};
 const proposed={...old,description:'New suggested description'};
 const cleaned={...proposed,title:old.title.slice(0,60),cta:old.cta.slice(0,3)};
 const final=contract.restoreUnchanged(old,proposed,cleaned);
 assert.equal(final.title,old.title);assert.equal(final.cta,old.cta);assert.equal(final.description,proposed.description);assert.equal(final.imageData,old.imageData);
});

test('ambiguous document names cannot establish a unique field citation',()=>{
 const program={currencies:{qualifyingName:'Tier Points'},tiers:[],earnRules:[],rewards:[]};
 const result=provenance.audit(program,[{path:'currencies.qualifyingName',source:'Policy.pdf',page:1,quote:'Earn Tier Points for eligible activity.'}],{brief:{sources:[{name:'Policy.pdf',pages:[{text:'Earn Tier Points for eligible activity.'}]},{name:'Policy.pdf',pages:[{text:'Different version of the policy.'}]}]}});
 assert.equal(result.records.find(item=>item.path==='currencies.qualifyingName').status,'unresolved');
});
