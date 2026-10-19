const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

function presentation(program) {
  return {
    brandName: program.providerName, programName: program.name, industry: 'generic', brand: { logoUrl: '' },
    colors: { primary:'#002654',accent:'#00a5d9',dark:'#112233',secondary:'#f5f7fa' }, tiers:[],
    vouchers:program.rewards.map(r=>({programRewardId:r.id,title:r.name,description:'Professional learning reward',vendor:program.providerName,actionType:'points',actionValue:String(r.cost),imageUrl:''})),
    earnMore:program.earnRules.map(r=>({programRuleId:r.id,title:r.name,description:'Build skills and earn points',hasCodeInput:false})),
    offers:[{title:'CPE learning series',description:'Explore professional development',cta:'Explore',imageUrl:''}],
    benefits:[{name:'Professional Journal',imageUrl:''}],badges:[{name:'Learning leader',emoji:'⭐',color:'blue',imageUrl:''}],
    clubs:[{name:'Local chapter',description:'Meet other members',memberCount:25,imageUrl:''}],profileTasks:[{description:'Complete your interests',cta:'Update'}],
    upsell:{title:'Explore membership',subtitle:'Your next chapter',price:'',period:'',tagline:'Discover more',cta:'Explore benefits',bgImageUrl:''},
    navLinks:['Rewards','Learning','Community'],footerLinks:Object.fromEntries(['col1','col2','col3'].map(k=>[k,{title:'Member resources',links:['Support','Learning']}])),member:{name:program.member.name,joinDate:'October 2026'}
  };
}
async function editor({review=false}={}) {
  const html=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'');
  const dom=new JSDOM(html,{runScripts:'outside-only',url:'https://lpg.test/'}),w=dom.window;
  await new Promise(r=>w.document.addEventListener('DOMContentLoaded',r,{once:true}));
  w.HTMLElement.prototype.scrollIntoView=()=>{};w.confirm=()=>true;
  const run=code=>vm.runInContext(code,dom.getInternalVMContext());
  for(const file of ['defaults','images','cinematic-settings','program-model','program-runtime','portal-templates','generator','pagehost',...(review?['content-contract','program-provenance']:[]),'requirements','portal-content','variants','requirements-editor','app','projects']) run(fs.readFileSync(`js/${file}.js`,'utf8'));
  run(`applyIndustryDefaults('generic'); editorDefaults=cloneProject(state); scheduleDraftRecovery=()=>{}; schedulePreview=updatePreview; populateFormFromState(); LPGRequirementsEditor.init();`);
  let imageCalls=0;
  w.LocalAI={fillMissingImages:async data=>{imageCalls++; for(const key of ['vouchers','offers','benefits','badges','clubs']) data[key].forEach((item,i)=>{if(!item.imageUrl&&!item.imageData)item.imageUrl='https://brand.test/'+key+i+'.png';});return {generated:5,total_empty:5};}};
  const field=(id,value)=>{const node=w.document.getElementById(id);node.value=value;node.dispatchEvent(new w.Event('input',{bubbles:true}));};
  const edit=(path,value)=>{const node=w.document.querySelector(`[data-program-path="${path}"]`);node.value=value;node.dispatchEvent(new w.Event('input',{bubbles:true}));return node;};
  function client(ruleResponse,contentResponse) {
    return {callLLM:async args=>{const prompt=JSON.parse(args.prompt.split('\nValidation feedback')[0]);
      if(prompt.validatedProgram)return JSON.stringify(contentResponse?await contentResponse(prompt,args):presentation(prompt.validatedProgram));
      const program=ruleResponse?await ruleResponse(prompt,args):w.LPGProgram.normalize({mode:prompt.author.mode,providerName:'ISACA',name:prompt.author.mode==='b2b'?'ISACA Partner Rewards':'ISACA Member Rewards'});
      return {text:JSON.stringify({program})};
    }};
  }
  return {w,run,field,edit,client,imageCalls:()=>imageCalls,close:()=>w.close()};
}
test('URL-only generation uses full content and image pipeline and updates preview without apply',async()=>{
  const e=await editor();try {
    const client=e.client();client.scrapeViaCorsProxy=async()=>'<title>ISACA</title><h1>Professional learning</h1><img src="https://brand.test/logo.png" alt="logo">';
    await e.w.LPGRequirementsEditor.analyze(client,'https://brand.test');
    const html=e.w.document.getElementById('preview-iframe').srcdoc;
    assert.match(html,/ISACA Member Rewards/);assert.match(html,/CPE learning series/);assert.match(html,/Professional Journal/);assert.match(html,/vouchers0.png/);
    assert.equal(e.imageCalls(),1);assert.equal(e.run('state.programEnabled'),true);
    assert.equal(e.w.document.getElementById('program-enabled'),null);
    assert.equal(e.run('state.programReview'),null);assert.equal(e.run('state.upsell.price'),'');
  }finally{e.close();}
});
test('Both audiences generate once per audience, switch independently, persist and export selected content',async()=>{
  const e=await editor();try {
    e.field('brief-mode','both');e.field('brief-text','Professional individual and partner rewards');
    await e.w.LPGRequirementsEditor.analyze(e.client(),'');
    assert.equal(e.imageCalls(),2);assert.equal(e.run('state.activeVariant'),'b2c');
    e.run("state.outputTemplate='showcase'; state.offers[0].title='Edited B2C offer'");
    e.w.LPGVariants.show('b2b');
    assert.equal(e.run('state.program.mode'),'b2b');assert.equal(e.run('state.outputTemplate'),'cinematic');
    e.run("state.outputTemplate='editorial';state.offers[0].title='Edited B2B offer'");
    assert.match(e.run('generatePortalHTML(state)'),/Edited B2B offer/);
    e.run('hydratePortal(buildProjectPayload())');
    assert.equal(e.run('state.activeVariant'),'b2b');assert.equal(e.run('state.outputTemplate'),'editorial');
    e.w.LPGVariants.show('b2c');assert.equal(e.run('state.outputTemplate'),'showcase');assert.equal(e.run('state.offers[0].title'),'Edited B2C offer');
    assert.equal(e.run('buildProjectPayload().variants.b2b.offers[0].title'),'Edited B2B offer');
    assert.equal(e.run('Object.hasOwn(buildProjectPayload().variants, state.activeVariant)'),false);
  }finally{e.close();}
});
test('failure in second audience keeps both original variants unchanged',async()=>{
  const e=await editor();try {
    e.field('brief-mode','both');e.field('brief-text','Two portals');
    await e.w.LPGRequirementsEditor.analyze(e.client(),'');
    const before=e.run('JSON.stringify(state)');
    await assert.rejects(e.w.LPGRequirementsEditor.analyze(e.client(null,p=>{if(p.validatedProgram.mode==='b2b')throw new Error('Service unavailable');return presentation(p.validatedProgram);} ),''),/Service unavailable/);
    assert.equal(e.run('JSON.stringify(state)'),before);
  }finally{e.close();}
});
test('late generation cannot overwrite edits while rich content or images are being generated',async()=>{
  const e=await editor();try {
    e.field('brief-text','A member program');let resume;const pending=new Promise(r=>resume=r);
    let started;const ready=new Promise(r=>started=r);
    const request=e.w.LPGRequirementsEditor.analyze(e.client(null,async p=>{started();await pending;return presentation(p.validatedProgram);}),'');
    await ready;e.field('brief-text','Changed requirements');resume();
    await assert.rejects(request,/editor changed/);assert.equal(e.run('state.program'),null);assert.equal(e.run('state.brand.name'),'');
  }finally{e.close();}
});
test('invalid rules get one repair and incomplete presentation never replaces current portal',async()=>{
  const e=await editor();try {
    e.field('brief-text','A purchase program');let count=0;
    await e.w.LPGRequirementsEditor.analyze(e.client(p=>{const model=e.w.LPGProgram.normalize({mode:p.author.mode});if(++count===1)model.earnRules[0].amount=0;return model;}),'');
    assert.equal(count,2);assert.equal(e.run('state.program.earnRules[0].amount'),100);
    const before=e.run('JSON.stringify(state)');
    await assert.rejects(e.w.LPGRequirementsEditor.analyze(e.client(null,()=>({vouchers:[]})),''),/incomplete/);
    assert.equal(e.run('JSON.stringify(state)'),before);
  }finally{e.close();}
});
test('truncated rules retry once with all 22 source pages and only then generate rich content',async()=>{
  const e=await editor();try {
    e.field('brief-text','Use the supplied membership policy');
    e.run(`state.brief.sources=[{name:'Synthetic22Pages.pdf',pages:Array.from({length:22},(_,i)=>({text:'Synthetic page '+(i+1)+' with '+(10+i)+' points'}))}]`);
    const original=e.run('JSON.stringify(state.brief.sources)'),ruleCalls=[];
    const normal=e.client();
    const client={callLLM:async args=>{
      const prompt=JSON.parse(args.prompt.split('\nValidation feedback')[0]);
      if(!prompt.validatedProgram){ruleCalls.push(args);if(ruleCalls.length===1)return {text:'{"program":{"mode":"b2c","name":"unfinished',finish_reason:'MAX_TOKENS'};}
      return normal.callLLM(args);
    }};
    await e.w.LPGRequirementsEditor.analyze(client,'');
    assert.equal(ruleCalls.length,2);assert.equal(ruleCalls[0].maxTokens,12000);assert.equal(ruleCalls[1].maxTokens,16000);
    assert.ok(ruleCalls.every(call=>call.responseFormat==='json'));
    assert.equal(ruleCalls[1].prompt.split('\nValidation feedback')[0],ruleCalls[0].prompt);
    assert.equal(JSON.parse(ruleCalls[0].prompt).sourceDocuments[0].pages.length,22);
    assert.equal(e.run('JSON.stringify(state.brief.sources)'),original);
    assert.equal(e.imageCalls(),1);assert.equal(e.run('state.programEnabled'),true);
  }finally{e.close();}
});
test('two malformed rule responses fail atomically without another retry or image generation',async()=>{
  const e=await editor();try {
    e.field('brief-text','Keep current portal on failure');await e.w.LPGRequirementsEditor.analyze(e.client(),'');
    const before=e.run('JSON.stringify(state)'),images=e.imageCalls();let calls=0;
    await assert.rejects(e.w.LPGRequirementsEditor.analyze({callLLM:async()=>{calls++;return '{"program":';}},''),/automatic retry/);
    assert.equal(calls,2);assert.equal(e.imageCalls(),images);assert.equal(e.run('JSON.stringify(state)'),before);
  }finally{e.close();}
});
test('changes made during an automatic rule repair are kept and prevent content generation',async()=>{
  const e=await editor();try {
    e.field('brief-text','Original request');let count=0,resume,started;
    const pending=new Promise(r=>resume=r),ready=new Promise(r=>started=r);
    const normal=e.client();
    const request=e.w.LPGRequirementsEditor.analyze({callLLM:async args=>{
      if(++count===1)return '{"program":';
      started();await pending;return normal.callLLM(args);
    }},'');
    await ready;e.field('brief-text','Changed while repairing');resume();
    await assert.rejects(request,/editor changed/);assert.equal(count,2);assert.equal(e.imageCalls(),0);
    assert.equal(e.run('state.brief.text'),'Changed while repairing');assert.equal(e.run('state.program'),null);
  }finally{e.close();}
});
test('malformed second-audience rules keep both prior audience variants unchanged',async()=>{
  const e=await editor();try {
    e.field('brief-mode','both');e.field('brief-text','Both member and business portals');
    await e.w.LPGRequirementsEditor.analyze(e.client(),'');
    const before=e.run('JSON.stringify(state)'),normal=e.client();let failures=0;
    await assert.rejects(e.w.LPGRequirementsEditor.analyze({callLLM:async args=>{
      const prompt=JSON.parse(args.prompt.split('\nValidation feedback')[0]);
      if(!prompt.validatedProgram&&prompt.author.mode==='b2b'){failures++;return '{"program":';}
      return normal.callLLM(args);
    }},''),/automatic retry/);
    assert.equal(failures,2);assert.equal(e.run('JSON.stringify(state)'),before);
  }finally{e.close();}
});
test('program details edit live while keeping focus and last valid rules for incomplete drafts',async()=>{
  const e=await editor();try {
    e.field('brief-text','Member rewards');await e.w.LPGRequirementsEditor.analyze(e.client(),'');e.w.LPGRequirementsEditor.editProgram();
    const name=e.w.document.querySelector('[data-program-path="name"]');name.focus();e.edit('name','ISACA Learning Rewards');
    assert.equal(e.w.document.activeElement,name);assert.match(e.w.document.getElementById('preview-iframe').srcdoc,/ISACA Learning Rewards/);
    const before=e.run('state.program.tiers[1].threshold');e.edit('tiers.1.threshold','');
    assert.equal(e.run('state.program.tiers[1].threshold'),before);assert.match(e.w.document.getElementById('program-review-error').textContent,/last valid/);
    e.run('hydratePortal(buildProjectPayload())');assert.equal(e.run('state.programReview.program.tiers[1].threshold'),null);
    e.edit('tiers.1.threshold','1800');assert.equal(e.run('state.program.tiers[1].threshold'),1800);
    e.w.LPGRequirementsEditor.apply();assert.equal(e.run('state.programReview'),null);
  }finally{e.close();}
});
test('legacy content edits synchronize authoritative rule names/costs, add and remove cards',async()=>{
  const e=await editor();try {
    e.field('brief-text','Member rewards');await e.w.LPGRequirementsEditor.analyze(e.client(),'');
    e.run("updateItem('vouchers',0,'title','Certification credit');updateItem('vouchers',0,'actionValue','250');");
    assert.equal(e.run('state.program.rewards[0].name'),'Certification credit');assert.equal(e.run('state.program.rewards[0].cost'),250);
    e.run('addVoucher()');assert.equal(e.run('state.program.rewards.length'),2);assert.equal(e.run('state.vouchers.length'),2);
    e.run("removeItem('vouchers',0)");assert.equal(e.run('state.program.rewards.length'),1);assert.doesNotMatch(e.run('generatePortalHTML(state)'),/Certification credit/);
    const field=e.w.document.getElementById('program-name');field.value='Renamed identity';e.w.onFieldChange({target:field});
    assert.equal(e.run('state.program.name'),'Renamed identity');assert.match(e.run('generatePortalHTML(state)'),/Renamed identity/);
  }finally{e.close();}
});
test('template switching and save/reopen preserve all rich sections and private sources stay out of exports',async()=>{
  const e=await editor();try {
    e.field('brief-text','Member rewards');e.run("state.brief.sources=[{name:'PRIVATE_DOC',pages:[{text:'PRIVATE_CONTENT'}]}]");
    await e.w.LPGRequirementsEditor.analyze(e.client(),'');
    for(const template of ['classic','dashboard','showcase','editorial']){
      e.run(`state.outputTemplate='${template}';hydratePortal(buildProjectPayload())`);
      const html=e.run('generatePortalHTML(state)');assert.match(html,/CPE learning series/);assert.match(html,/vouchers0.png/);assert.match(html,/Professional Journal/);assert.doesNotMatch(html,/PRIVATE_DOC|PRIVATE_CONTENT/);
      assert.equal(e.run('state.outputTemplate'),template);
    }
  }finally{e.close();}
});
test('refinement preserves accepted colors and uploaded images',async()=>{
  const e=await editor();try {
    e.field('brief-text','Member rewards');await e.w.LPGRequirementsEditor.analyze(e.client(),'');
    e.run("state.colors.primary='#123456';state.vouchers[0].imageData='data:image/png;base64,custom'");
    e.field('brief-text','Update the program name only');await e.w.LPGRequirementsEditor.analyze(e.client(p=>({...p.acceptedProgramToRefine,name:'New Rewards'})),'');
    assert.equal(e.run('state.colors.primary'),'#123456');assert.equal(e.run('state.vouchers[0].imageData'),'data:image/png;base64,custom');
  }finally{e.close();}
});
test('reset clears both saved audience variants and retained documents',async()=>{
  const e=await editor();try {
    e.field('brief-mode','both');e.field('brief-text','Member and business');await e.w.LPGRequirementsEditor.analyze(e.client(),'');
    e.run('startOver()');assert.equal(e.run('state.program'),null);assert.equal(e.run('Object.keys(state.variants).length'),0);assert.equal(e.run('state.brief.text'),'');assert.equal(e.run('state.activeVariant'),'b2c');
  }finally{e.close();}
});
test('old projects still open and modern selection migrates to dashboard',async()=>{
  const e=await editor();try {
    e.run("const legacy=buildProjectPayload(); delete legacy.variants; delete legacy.activeVariant; delete legacy.program; legacy.outputTemplate='modern'; hydratePortal(legacy)");
    assert.equal(e.run('state.outputTemplate'),'dashboard');assert.equal(e.run('state.program'),null);assert.match(e.run('generatePortalHTML(state)'),/Monthly Challenge/);
  }finally{e.close();}
});

test('starting a sample for another audience retains the original audience and shared fields stay current',async()=>{
  const e=await editor();try {
    e.field('brief-text','A member portal');await e.w.LPGRequirementsEditor.analyze(e.client(),'');
    e.run("state.offers[0].title='Keep B2C offer'");e.field('brief-mode','b2b');e.w.LPGRequirementsEditor.sample();
    assert.equal(e.run('state.activeVariant'),'b2b');assert.equal(e.run('state.variants.b2c.offers[0].title'),'Keep B2C offer');
    e.edit('member.organization','Northstar Partners');e.edit('member.name','Alex Partner');e.edit('opening.redeemable','800');e.edit('tiers.1.threshold','1900');
    assert.equal(e.w.document.getElementById('member-name').value,'Northstar Partners');assert.equal(e.w.document.getElementById('member-points').value,'800');assert.equal(e.w.document.getElementById('tier2-points').value,'1900');
    e.w.LPGVariants.show('b2c');assert.equal(e.run('state.offers[0].title'),'Keep B2C offer');
  }finally{e.close();}
});
test('layout changes during generation invalidate results and numerals in point currency do not affect reward cost',async()=>{
  const e=await editor();try {
    e.field('brief-text','Member rewards');let resume;const pending=new Promise(r=>resume=r);let started;const ready=new Promise(r=>started=r);
    const request=e.w.LPGRequirementsEditor.analyze(e.client(null,async p=>{started();await pending;return presentation(p.validatedProgram);}),'');
    await ready;e.run("state.outputTemplate='showcase'");resume();await assert.rejects(request,/editor changed while AI was working/);
    await e.w.LPGRequirementsEditor.analyze(e.client(),'');
    assert.equal(e.run('state.outputTemplate'),'showcase');
    e.run("updateItem('vouchers',0,'actionValue','100 B2B Points')");assert.equal(e.run('state.program.rewards[0].cost'),100);
  }finally{e.close();}
});

test('full-size preview opens before loading and refreshes every layout with the selected portal',async()=>{
  const e=await editor();try{
    const d=e.w.document.getElementById('portal-preview-dialog'), f=e.w.document.getElementById('expanded-preview-iframe');
    let opens=0;d.showModal=()=>{assert.equal(f.srcdoc,'');d.open=true;opens++;};d.close=()=>{d.open=false;};
    e.run("state.brand.name='Preview brand'; state.program=LPGProgram.normalize({providerName:'Preview brand',name:'Preview Rewards'});state.programEnabled=true;");
    for(const template of ['classic','dashboard','showcase','editorial']){
      e.run(`state.outputTemplate=${JSON.stringify(template)}`);
      e.w.openPortalPreview();
      assert.ok(d.open);assert.match(f.srcdoc,/Preview Rewards/);assert.match(f.srcdoc,/lpg-preview-ready/);
      if(template!=='classic')assert.match(f.srcdoc,new RegExp('data-lpg-template="'+template+'"'));
      assert.equal(e.w.document.getElementById('expanded-preview-status').textContent,'Loading portal…');
      e.w.dispatchEvent(new e.w.MessageEvent('message',{source:f.contentWindow,data:{type:'lpg-preview-ready',token:f.dataset.previewToken}}));
      assert.equal(e.w.document.getElementById('expanded-preview-status').hidden,true);
      e.run("state.brand.programName='Updated portal';updatePreview()");
      assert.match(f.srcdoc,/Preview Rewards/);
    }
    assert.equal(opens,1);e.w.closePortalPreview();assert.equal(d.open,false);
    const exported=e.run('generatePortalHTML(state)');assert.doesNotMatch(exported,/lpg-preview-ready|Restart interactions|Show welcome screen|Reset demo/);
  }finally{e.close();}
});

test('expanded preview ignores stale/unrelated ready messages and exposes rendering failures',async()=>{
  const e=await editor();try{
    const d=e.w.document.getElementById('portal-preview-dialog'),f=e.w.document.getElementById('expanded-preview-iframe');
    d.showModal=()=>{d.open=true;};e.w.openPortalPreview();const old=f.dataset.previewToken;e.w.openPortalPreview();
    const status=e.w.document.getElementById('expanded-preview-status');
    e.w.dispatchEvent(new e.w.MessageEvent('message',{source:f.contentWindow,data:{type:'lpg-preview-ready',token:old}}));assert.equal(status.hidden,false);
    e.w.dispatchEvent(new e.w.MessageEvent('message',{source:e.w,data:{type:'lpg-preview-ready',token:f.dataset.previewToken}}));assert.equal(status.hidden,false);
    e.w.dispatchEvent(new e.w.MessageEvent('message',{source:f.contentWindow,data:{type:'lpg-preview-ready',token:f.dataset.previewToken}}));assert.equal(status.hidden,true);
    e.w.console.error=()=>{};e.run("generatePortalHTML=()=>{throw new Error('render failure')}");e.w.openPortalPreview();
    assert.match(status.textContent,/could not be rendered/);assert.equal(e.w.document.getElementById('expanded-preview-retry').hidden,false);
  }finally{e.close();}
});

test('presentation controls live in builder chrome and target preview frames without changing saved roles',async()=>{
  const e=await editor();try{
    e.run("state.program=LPGProgram.normalize({mode:'b2b',providerName:'Preview brand'});state.programEnabled=true;updatePreview();");
    const calls=[];const f=e.w.document.getElementById('preview-iframe');f.contentWindow.postMessage=(message)=>calls.push(message);
    const roles=e.run('state.program.roles'),selected=roles[1].id,original=e.run('state.program.member.role');
    e.w.controlPortalPreview('role',selected);e.w.controlPortalPreview('reset');e.w.controlPortalPreview('welcome');e.w.controlPortalPreview('role','invalid');
    assert.deepEqual(calls.map(m=>m.action),['role','reset','welcome']);assert.equal(calls[0].roleId,selected);assert.equal(e.run('state.program.member.role'),original);
    assert.equal(e.w.document.querySelector('[data-presenter-role-label]').hidden,false);
  }finally{e.close();}
});

test('expanding a portal preserves the selected presenter role and applies it after the new frame is ready',async()=>{
  const e=await editor();try{
    e.run("state.program=LPGProgram.normalize({mode:'b2b',providerName:'Preview brand'});state.programEnabled=true;updatePreview();");
    const role=e.run('state.program.roles[1].id');e.w.controlPortalPreview('role',role);
    const d=e.w.document.getElementById('portal-preview-dialog'),f=e.w.document.getElementById('expanded-preview-iframe');d.showModal=()=>{d.open=true;};
    const delivered=[];f.contentWindow.postMessage=message=>delivered.push(message);
    e.w.openPortalPreview();
    assert.ok([...e.w.document.querySelectorAll('[data-presenter-role]')].every(select=>select.value===role));
    e.w.dispatchEvent(new e.w.MessageEvent('message',{source:f.contentWindow,data:{type:'lpg-preview-ready',token:f.dataset.previewToken}}));
    assert.equal(delivered.at(-1).action,'role');assert.equal(delivered.at(-1).roleId,role);
    e.w.controlPortalPreview('reset');assert.ok([...e.w.document.querySelectorAll('[data-presenter-role]')].every(select=>select.value===role));
  }finally{e.close();}
});


test('fictional member and company identities generate, edit, and save independently', async () => {
  const e = await editor(); try {
    e.field('brief-mode', 'both'); e.field('brief-text', 'Member and partner programs');
    await e.w.LPGRequirementsEditor.analyze(e.client(p => e.w.LPGProgram.normalize({ mode: p.author.mode, member: { name: 'John Sharp', organization: p.author.mode === 'b2b' ? 'Cedar Ridge Partners' : '' } })), '');
    assert.equal(e.run('state.member.name'), 'John Sharp');
    e.w.LPGVariants.show('b2b');
    assert.equal(e.run('state.member.name'), 'Cedar Ridge Partners');
    e.field('member-name', 'Harbor Consulting'); e.run("onFieldChange({target:document.getElementById('member-name')})");
    assert.equal(e.run('state.program.member.organization'), 'Harbor Consulting');
    assert.equal(e.run('state.program.member.name'), 'John Sharp');
    e.run('hydratePortal(buildProjectPayload())');
    assert.equal(e.run('state.member.name'), 'Harbor Consulting');
    e.w.LPGVariants.show('b2c');
    assert.equal(e.run('state.member.name'), 'John Sharp');
    e.field('member-name', 'Morgan Reed'); e.run("onFieldChange({target:document.getElementById('member-name')})");
    assert.equal(e.run('state.program.member.name'), 'Morgan Reed');
    assert.equal(e.run('state.variants.b2b.program.member.organization'), 'Harbor Consulting');
  } finally { e.close(); }
});


test('live preview scales a desktop viewport without navigating on resize', async () => {
  const e = await editor(); try {
    const stage = e.w.document.getElementById('preview-stage');
    const frame = e.w.document.getElementById('preview-iframe');
    let width = 720, observerCallback, observations = 0;
    Object.defineProperty(stage, 'clientWidth', { get: () => width });
    e.w.ResizeObserver = class { constructor(callback) { observerCallback = callback; } observe(node) { assert.equal(node, stage); observations++; } };
    e.run('previewSizingInitialized=false;initializePreviewSizing()');
    assert.equal(frame.getAttribute('width'), '1440'); assert.equal(frame.getAttribute('height'), '900');
    assert.equal(stage.style.height, '450px'); assert.equal(frame.style.transform, 'scale(0.5)');
    const source = frame.srcdoc, token = frame.dataset.previewToken;
    width = 1008; observerCallback();
    assert.equal(stage.style.height, '630px'); assert.equal(frame.style.transform, 'scale(0.7)');
    assert.equal(frame.srcdoc, source); assert.equal(frame.dataset.previewToken, token);
    assert.match(e.w.document.getElementById('preview-scale-label').textContent, /70%/);
    width = 0; observerCallback(); assert.equal(stage.style.height, '630px');
    width = 1440; e.w.dispatchEvent(new e.w.Event('resize'));
    assert.equal(stage.style.height, '900px'); assert.equal(frame.style.transform, 'scale(1)');
    e.run('initializePreviewSizing()'); assert.equal(observations, 1);
    assert.equal(e.w.document.getElementById('expanded-preview-iframe').style.transform, '');
  } finally { e.close(); }
});

test('both-audience AI requests carry each selected template before rule and image generation', async () => {
  const e = await editor(); try {
    e.run(`state.outputTemplate='cinematic'; state.variants.b2b = {...LPGVariants.snapshot(), outputTemplate:'editorial'};`);
    e.field('brief-mode', 'both');
    const observed = [];
    const client = e.client(prompt => {
      observed.push(prompt.presentationPreferences);
      return e.w.LPGProgram.normalize({ mode: prompt.author.mode, providerName: 'ISACA' });
    }, prompt => { observed.push(prompt.presentationPreferences); return presentation(prompt.validatedProgram); });
    await e.w.LPGRequirementsEditor.analyze(client, '');
    assert.deepEqual(JSON.parse(JSON.stringify(observed)), [
      { outputTemplate: 'cinematic', locale:'en-US', defaultRewardCount: 5 }, { outputTemplate: 'cinematic' },
      { outputTemplate: 'editorial', locale:'en-US', defaultRewardCount: 4 }, { outputTemplate: 'editorial' }
    ]);
  } finally { e.close(); }
});

test('a template change while AI is working discards the pending result', async () => {
  const e = await editor(); try {
    const client = e.client(prompt => {
      e.run(`state.outputTemplate='showcase'`);
      return e.w.LPGProgram.normalize({ mode: prompt.author.mode });
    });
    await assert.rejects(e.w.LPGRequirementsEditor.analyze(client, ''), /editor changed while AI was working/);
    assert.equal(e.run('state.program'), null);
  } finally { e.close(); }
});

test('cinematic builder copy, benefit assets and card customization survive audience switches and saved reloads', async()=>{
  const e=await editor();try {
    e.w.LPGCinematic.init();
    const selector=e.w.document.getElementById('output-template');selector.value='cinematic';selector.dispatchEvent(new e.w.Event('change'));
    const title=e.w.document.getElementById('cinematic-copy-arrivalTitle');
    title.value='Your world.\nOpening up.';title.dispatchEvent(new e.w.Event('input'));
    assert.equal(e.run('state.cinematic.copy.arrivalTitle'),title.value);
    e.run(`state.benefits[0].coverImageUrl='https://brand.test/cover.jpg';state.cinematic.card.markMode='custom';state.cinematic.card.markImageUrl='https://brand.test/crest.png';state.variants.b2b={...LPGVariants.snapshot(),cinematic:LPGCinematic.normalize({copy:{arrivalTitle:'Business chapter'}})};`);
    const before=e.run('JSON.stringify(state.cinematic)');
    e.w.LPGVariants.show('b2b');assert.equal(e.run('state.cinematic.copy.arrivalTitle'),'Business chapter');
    e.w.LPGVariants.show('b2c');assert.equal(e.run('JSON.stringify(state.cinematic)'),before);
    e.run('hydratePortal(buildProjectPayload())');
    assert.equal(e.run('JSON.stringify(state.cinematic)'),before);
    assert.equal(e.run('state.benefits[0].coverImageUrl'),'https://brand.test/cover.jpg');
    assert.equal(e.w.document.getElementById('cinematic-copy-arrivalTitle').value,'Your world.\nOpening up.');
    assert.ok(e.w.document.getElementById('drop-benefit-cover-0'));
    const preview=e.w.document.getElementById('preview-iframe').srcdoc;
    assert.match(preview,/Your world/);assert.match(preview,/lpg-benefit-cover/);assert.match(preview,/crest.png/);
  }finally{e.close();}
});


test('voucher description editor preserves multiline copy through save and reload', async () => {
  const e=await editor();try {
    e.run("state.vouchers=[{title:'Reward',description:'Original'}];renderVouchers()");
    const input=e.w.document.getElementById('voucher-description-0');
    input.value='Choose your reward.\nMake it yours.';e.w.Function(input.getAttribute('oninput')).call(input);
    assert.equal(e.run('state.vouchers[0].description'), input.value);
    e.run('hydratePortal(buildProjectPayload())');
    assert.equal(e.w.document.getElementById('voucher-description-0').value,input.value);
  } finally {e.close();}
});

test('preview position is retained only for the current frame token and project',async()=>{
  const e=await editor();try {
    e.run('updatePreview()');const f=e.w.document.getElementById('preview-iframe');
    const send=(source,token,y)=>e.w.dispatchEvent(new e.w.MessageEvent('message',{source,data:{type:'lpg-preview-position',token,x:0,y,anchor:'cj-progress',offset:-50}}));
    send(e.w,f.dataset.previewToken,999);send(f.contentWindow,'obsolete',999);
    assert.equal(e.run("portalPreviewPositions.get(document.getElementById('preview-iframe'))"),undefined);
    send(f.contentWindow,f.dataset.previewToken,2400);
    e.run('updatePreview()');assert.ok(f.srcdoc.includes('"y":2400'));assert.ok(f.srcdoc.includes('"anchor":"cj-progress"'));
    e.run('projectEpoch++;updatePreview()');assert.ok(!f.srcdoc.includes('"y":2400'));
    assert.doesNotMatch(e.run('generatePortalHTML(state)'),/lpg-preview-position/);
  } finally {e.close();}
});

test('source-aware text proposal leaves current portal intact until accepted and can be discarded without images',async()=>{
 const e=await editor({review:true});try {
  e.field('brief-text','A professional member program');
  const before=e.run('JSON.stringify(state)');
  const result=await e.w.LPGRequirementsEditor.analyze(e.client(),'');
  assert.equal(result.pending,true);assert.equal(e.w.LPGRequirementsEditor.pending(),true);
  assert.equal(e.run('JSON.stringify(state)'),before);assert.equal(e.imageCalls(),0);
  const review=e.w.document.getElementById('generation-review');
  assert.equal(review.hidden,false);assert.match(review.textContent,/illustrative/);assert.match(review.textContent,/currencies.qualifyingName/);
  assert.ok(e.w.document.getElementById('generation-review-preview').srcdoc.includes('ISACA Member Rewards'));
  e.w.LPGRequirementsEditor.cancelGeneration();assert.equal(e.w.LPGRequirementsEditor.pending(),false);
  assert.equal(e.run('JSON.stringify(state)'),before);assert.equal(e.imageCalls(),0);
 }finally{e.close();}
});
test('accept commits usable text before background images and preserves author-uploaded replacements',async()=>{
 const e=await editor({review:true});try {
  e.field('brief-text','A professional program');
  await e.w.LPGRequirementsEditor.analyze(e.client(),'');
  let resume,started;const ready=new Promise(r=>started=r);const waiting=new Promise(r=>resume=r);
  e.w.LocalAI.fillMissingImages=async data=>{started();await waiting;data.offers[0].imageData='data:image/png;base64,ai';data.benefits[0].imageData='data:image/png;base64,benefit';return {generated:2,total_empty:2};};
  const accept=e.w.LPGRequirementsEditor.acceptGeneration();await ready;
  assert.equal(e.run('state.programEnabled'),true);assert.equal(e.run('state.offers[0].title'),'CPE learning series');
  assert.ok(e.run('state.offers[0].id'));assert.ok(e.run('state.programEvidence.records.length')>5);
  e.run("state.offers[0].imageData='data:image/png;base64,author';state.offers[0].description='Edited while images generate'");
  resume();await accept;
  assert.equal(e.run('state.offers[0].imageData'),'data:image/png;base64,author');
  assert.equal(e.run('state.offers[0].description'),'Edited while images generate');
  assert.equal(e.run('state.benefits[0].imageData'),'data:image/png;base64,benefit');
 }finally{e.close();}
});
test('stale AI proposal cannot overwrite edits made during review',async()=>{
 const e=await editor({review:true});try {
  e.field('brief-text','A professional program');await e.w.LPGRequirementsEditor.analyze(e.client(),'');
  e.run("state.brand.name='Author brand'");await e.w.LPGRequirementsEditor.acceptGeneration();
  assert.equal(e.run('state.brand.name'),'Author brand');assert.equal(e.run('state.program'),null);
  assert.match(e.w.document.getElementById('generation-review-error').textContent,/editor changed/);assert.equal(e.imageCalls(),0);
 }finally{e.close();}
});
test('scoped AI refinement preserves policy and unrelated authored sections with a reviewable text diff',async()=>{
 const e=await editor({review:true});try {
  e.field('brief-text','Professional rewards');await e.w.LPGRequirementsEditor.analyze(e.client(),'');await e.w.LPGRequirementsEditor.acceptGeneration();
  e.run("state.benefits[0].name='Author custom benefit';state.footerLinks.col1.title='Author footer'");
  const accepted=e.run('JSON.stringify(state.program)');
  let scope=e.w.document.getElementById('ai-refine-sections');
  if(!scope){scope=e.w.document.createElement('select');scope.id='ai-refine-sections';scope.multiple=true;scope.innerHTML='<option selected value="offers">Offers</option>';e.w.document.body.append(scope);}else{for(const option of scope.options)option.selected=option.value==='offers';}
  assert.equal(e.run('state.programEnabled'),true);
  assert.deepEqual(Array.from(scope.options).filter(o=>o.selected).map(o=>o.value),['offers']);
  e.field('brief-text','Rewrite offers about certification');
  let rulesCalls=0;
  await e.w.LPGRequirementsEditor.analyze(e.client(()=>{rulesCalls++;throw new Error('Must not reinterpret policy');},program=>({...presentation(program.validatedProgram),offers:[{title:'Certification pathways',description:'Find your path',cta:'Explore'}]})),'');
  assert.equal(rulesCalls,0);assert.equal(e.run('state.offers[0].title'),'CPE learning series');
  assert.match(e.w.document.getElementById('generation-review').textContent,/Certification pathways/);
  await e.w.LPGRequirementsEditor.acceptGeneration();
  assert.equal(e.run('state.offers[0].title'),'Certification pathways');assert.equal(e.run('state.benefits[0].name'),'Author custom benefit');
  assert.equal(e.run('state.footerLinks.col1.title'),'Author footer');assert.equal(e.run('JSON.stringify(state.program)'),accepted);
 }finally{e.close();}
});
test('program details exposes no-tier, descriptive qualification and independent member metrics',async()=>{
 const e=await editor();try {
  e.w.LPGRequirementsEditor.sample();e.w.LPGRequirementsEditor.editProgram();
  const tiers=e.w.document.querySelector('[data-program-path="capabilities.tiers"]');assert.ok(tiers);
  tiers.checked=false;tiers.dispatchEvent(new e.w.Event('input',{bubbles:true}));
  assert.equal(e.run('state.program.capabilities.tiers'),false);
  e.edit('qualification.basis','nights');assert.equal(e.run('state.program.capabilities.presentationOnly'),true);
  e.w.document.querySelector('[data-add-program="metrics"]').click();
  e.edit('metrics.0.name','Annual nights');e.edit('metrics.0.value','12');e.edit('metrics.0.unit','nights');e.edit('metrics.0.singularUnit','night');
  assert.equal(e.run('state.program.metrics[0].value'),12);assert.equal(e.run('state.program.metrics[0].name'),'Annual nights');
  e.edit('locale','fr-FR');assert.equal(e.run('state.locale'),'fr-FR');
 }finally{e.close();}
});

test('unfinished text generation recovery matches editor checkpoint and forwards explicit resume through both AI stages',async()=>{
 const e=await editor({review:true});try {
  e.field('brief-text','Source-aware professional program');
  let jobs=[],failed=false;const resumes=[];
  e.w.LocalAI.getPendingJobs=()=>jobs;
  const base=e.client();
  const client={callLLM:async args=>{
   const payload=JSON.parse(args.prompt);resumes.push({content:!!payload.validatedProgram,resume:args.resumeUnknown});
   if(payload.validatedProgram&&!failed){failed=true;jobs=[{id:'pending-content',kind:'llm',status:'unknown'}];throw new Error('Submission outcome unknown');}
   if(payload.validatedProgram)jobs=[];
   return base.callLLM(args);
  }};
  await assert.rejects(e.w.LPGRequirementsEditor.analyze(client,''),/unknown/);
  assert.equal(e.run('state.program'),null);
  assert.equal(e.w.document.getElementById('recover-generation').disabled,false);
  await e.w.LPGRequirementsEditor.recoverGeneration();
  assert.equal(e.w.LPGRequirementsEditor.pending(),true);assert.equal(e.run('state.program'),null);
  assert.deepEqual(resumes.slice(-2).map(item=>item.resume),[true,true]);
  assert.equal(e.imageCalls(),0);
 }finally{e.close();}
});
test('recovery never applies an unfinished request over changed author inputs',async()=>{
 const e=await editor({review:true});try {
  e.field('brief-text','Original request');let jobs=[];
  e.w.LocalAI.getPendingJobs=()=>jobs;
  let calls=0;const client={callLLM:async()=>{calls++;jobs=[{id:'pending-rules',kind:'llm',status:'unknown'}];throw new Error('Outcome unknown');}};
  await assert.rejects(e.w.LPGRequirementsEditor.analyze(client,''),/unknown/);
  e.field('brief-text','Changed author intent');e.w.LPGRequirementsEditor.renderRecovery();
  assert.equal(e.w.document.getElementById('recover-generation').disabled,true);
  await e.w.LPGRequirementsEditor.recoverGeneration();assert.equal(calls,1);assert.equal(e.run('state.program'),null);
 }finally{e.close();}
});
test('partial image checkpoints keep completed assets and recover only remaining image work',async()=>{
 const e=await editor({review:true});try {
  e.field('brief-text','Professional program');let jobs=[],attempt=0;
  e.w.LocalAI.getPendingJobs=()=>jobs;
  e.w.LocalAI.fillMissingImages=async(data,options)=>{
   attempt++;
   if(attempt===1){data.benefits[0].imageData='data:image/png;base64,first-batch';options.onStatus('generating_images',{generated:1,attempted:1,total:16,remaining:8});jobs=[{id:'pending-images',kind:'images',status:'unknown'}];return {generated:1,total_empty:9,remaining:8,warning:'Image request outcome unknown'};}
   assert.equal(options.resumeUnknown,true);assert.equal(options.maxImages,15);assert.equal(data.benefits[0].imageData,'data:image/png;base64,first-batch');
   data.offers[0].imageData='data:image/png;base64,recovered';jobs=[];return {generated:1,total_empty:8,remaining:7};
  };
  await e.w.LPGRequirementsEditor.analyze(e.client(),'');await e.w.LPGRequirementsEditor.acceptGeneration();
  assert.equal(e.run('state.benefits[0].imageData'),'data:image/png;base64,first-batch');
  assert.equal(e.w.document.getElementById('recover-generation').disabled,false);
  await e.w.LPGRequirementsEditor.recoverGeneration();
  assert.equal(attempt,2);assert.equal(e.run('state.offers[0].imageData'),'data:image/png;base64,recovered');
  assert.equal(e.run('state.benefits[0].imageData'),'data:image/png;base64,first-batch');
 }finally{e.close();}
});

test('recovery refuses changed website evidence before another paid-stage request, including repeated attempts',async()=>{
 const e=await editor({review:true});try {
  e.field('brief-text','Use the source policy');e.w.document.getElementById('quickstart-url').value='https://brand.test';
  let jobs=[],calls=0,changed=false;
  e.w.LocalAI.getPendingJobs=()=>jobs;
  const client={scrapeViaCorsProxy:async()=>changed?'<title>Changed policy</title><p>Different source rules</p>':'<title>Original policy</title><p>Original source rules</p>',callLLM:async()=>{calls++;jobs=[{id:'unknown-rules',kind:'llm',status:'unknown'}];throw new Error('Outcome unknown');}};
  await assert.rejects(e.w.LPGRequirementsEditor.analyze(client,'https://brand.test'),/unknown/);
  changed=true;await e.w.LPGRequirementsEditor.recoverGeneration();await e.w.LPGRequirementsEditor.recoverGeneration();
  assert.equal(calls,1);assert.match(e.w.document.getElementById('generation-recovery-note').textContent,/website source changed/);
  assert.equal(e.run('state.program'),null);
 }finally{e.close();}
});

function changeReview(w,node,checked){node.checked=checked;node.dispatchEvent(new w.Event('change',{bubbles:true}));}
function reviewGroup(w,label,audience){return Array.from(w.document.querySelectorAll('[data-review-group]')).find(input=>input.closest('legend').textContent.includes(label)&&(!audience||input.closest('.generation-review-audience').getAttribute('aria-label').startsWith(audience)));}
function selectReviewNone(w){w.document.getElementById('generation-select-none').click();}

test('selective proposal acceptance has accessible group controls, all/none counts, and a guarded empty apply',async()=>{
 const e=await editor({review:true});try{
  e.field('brief-text','Professional program');await e.w.LPGRequirementsEditor.analyze(e.client(),'');
  const w=e.w,box=w.document.getElementById('generation-review');
  assert.equal(box.hasAttribute('aria-live'),false);assert.ok(box.querySelector('label input[type="checkbox"]'));
  assert.equal(w.document.getElementById('generation-selection-count').getAttribute('role'),'status');
  selectReviewNone(w);assert.match(w.document.getElementById('generation-selection-count').textContent,/^0 of /);
  assert.equal(w.document.getElementById('generation-accept').disabled,true);
  await w.LPGRequirementsEditor.acceptGeneration();assert.equal(e.run('state.program'),null);assert.equal(e.imageCalls(),0);
  w.document.getElementById('generation-select-all').click();assert.equal(w.document.getElementById('generation-accept').disabled,false);
  assert.ok(w.document.getElementById('generation-accept').classList.contains('btn-primary-sf'));
  assert.ok(w.document.getElementById('generation-discard').classList.contains('btn-secondary-sf'));
 }finally{e.close();}
});
test('accepting promotions alone declines inferred policy and all other content and does not generate rejected images',async()=>{
 const e=await editor({review:true});try{
  e.field('brief-text','Professional program');e.run('Object.assign(state,LPGContentContract.ensure(state))');const original=e.run('JSON.stringify({program:state.program,brand:state.brand,member:state.member,tiers:state.tiers,vouchers:state.vouchers,benefits:state.benefits})');
  await e.w.LPGRequirementsEditor.analyze(e.client(),'');selectReviewNone(e.w);
  const promotion=reviewGroup(e.w,'Promotions');promotion.focus();changeReview(e.w,promotion,true);
  assert.equal(e.w.document.activeElement,promotion);assert.ok(e.w.document.getElementById('generation-review-preview').srcdoc.includes('CPE learning series'));
  e.w.LocalAI.fillMissingImages=async data=>{assert.equal(data.offers.length,1);assert.equal(data.vouchers.length,0);assert.equal(data.benefits.length,0);assert.equal(data.upsell,undefined);data.offers[0].imageData='data:image/png;base64,promotion';return {generated:1,total_empty:1};};
  await e.w.LPGRequirementsEditor.acceptGeneration();
  assert.equal(e.run('state.offers[0].title'),'CPE learning series');assert.equal(e.run('state.offers[0].imageData'),'data:image/png;base64,promotion');
  assert.equal(e.run('JSON.stringify({program:state.program,brand:state.brand,member:state.member,tiers:state.tiers,vouchers:state.vouchers,benefits:state.benefits})'),original);
 }finally{e.close();}
});
test('individual text selection preserves declined fields and limits image work to the accepted card',async()=>{
 const e=await editor({review:true});try{
  e.field('brief-text','Professional program');await e.w.LPGRequirementsEditor.analyze(e.client(),'');await e.w.LPGRequirementsEditor.acceptGeneration();
  e.run("state.offers[0].imageUrl='';state.offers.push({id:'second-promotion',assetId:'second-promotion-image',title:'Second promotion',description:'Keep second description',cta:'Keep second CTA',imageUrl:''})");
  const firstId=e.run('state.offers[0].id'),initialCTA=e.run('state.offers[0].cta');
  for(const option of e.w.document.getElementById('ai-refine-sections').options)option.selected=option.value==='offers';
  const client=e.client(null,p=>({...presentation(p.validatedProgram),offers:[{id:firstId,title:'CPE learning series',description:'New first description',cta:'New first CTA'},{id:'second-promotion',title:'Second promotion',description:'Declined second description',cta:'Declined second CTA'}]}));
  await e.w.LPGRequirementsEditor.analyze(client,'');selectReviewNone(e.w);
  const group=reviewGroup(e.w,'Promotions').closest('fieldset');
  const description=Array.from(group.querySelectorAll('[data-review-unit]')).find(node=>node.closest('li').textContent.includes('New first description')&&node.closest('label').textContent.includes('Description'));
  assert.ok(description);description.focus();changeReview(e.w,description,true);assert.equal(e.w.document.activeElement,description);
  assert.equal(reviewGroup(e.w,'Promotions').indeterminate,true);
  e.w.LocalAI.fillMissingImages=async data=>{assert.equal(data.offers.length,1);assert.equal(data.offers[0].id,firstId);assert.equal(data.benefits.length,0);return {generated:0,total_empty:1};};
  await e.w.LPGRequirementsEditor.acceptGeneration();
  assert.equal(e.run('state.offers[0].description'),'New first description');assert.equal(e.run('state.offers[0].cta'),initialCTA);
  assert.equal(e.run('state.offers[1].description'),'Keep second description');assert.equal(e.run('state.offers[1].cta'),'Keep second CTA');
 }finally{e.close();}
});
test('program rules and reward projections apply as one atomic choice while promotions can be declined',async()=>{
 const e=await editor({review:true});try{
  e.field('brief-text','Professional program');await e.w.LPGRequirementsEditor.analyze(e.client(),'');await e.w.LPGRequirementsEditor.acceptGeneration();
  const oldOffer=e.run('JSON.stringify(state.offers)');
  await e.w.LPGRequirementsEditor.analyze(e.client(p=>{const next=JSON.parse(JSON.stringify(p.acceptedProgramToRefine));next.rewards[0].cost=750;next.rewards[0].name='Updated reward';return next;},p=>({...presentation(p.validatedProgram),offers:[{title:'Declined promotion',description:'Keep the author choice',cta:'Explore'}]})),'');
  selectReviewNone(e.w);const group=reviewGroup(e.w,'Program rules, member details');assert.ok(group);
  assert.equal(group.closest('fieldset').querySelectorAll('[data-review-unit]').length,0);changeReview(e.w,group,true);
  await e.w.LPGRequirementsEditor.acceptGeneration();
  assert.equal(e.run('state.program.rewards[0].cost'),750);assert.equal(e.run('state.vouchers[0].actionValue'),'750 Reward Points');
  assert.equal(e.run('state.vouchers[0].title'),'Updated reward');assert.equal(e.run('JSON.stringify(state.offers)'),oldOffer);
 }finally{e.close();}
});
test('declining a new audience portal does not create a partial variant',async()=>{
 const e=await editor({review:true});try{
  e.field('brief-mode','both');e.field('brief-text','Individual and partner programs');await e.w.LPGRequirementsEditor.analyze(e.client(),'');
  const newGroup=reviewGroup(e.w,'New B2B portal');assert.ok(newGroup);assert.equal(newGroup.closest('fieldset').querySelectorAll('[data-review-unit]').length,0);
  selectReviewNone(e.w);changeReview(e.w,reviewGroup(e.w,'Promotions','B2C'),true);await e.w.LPGRequirementsEditor.acceptGeneration();
  assert.equal(e.run('state.activeVariant'),'b2c');assert.equal(e.run('state.variants.b2b'),undefined);assert.equal(e.run('state.program'),null);
  assert.equal(e.run('state.offers[0].title'),'CPE learning series');
 }finally{e.close();}
});
test('selective image recovery retains the accepted asset mask instead of generating declined sections',async()=>{
 const e=await editor({review:true});try{
  e.field('brief-text','Professional program');const originalBenefits=e.run('state.benefits.length');let jobs=[],attempt=0;e.w.LocalAI.getPendingJobs=()=>jobs;
  await e.w.LPGRequirementsEditor.analyze(e.client(),'');selectReviewNone(e.w);changeReview(e.w,reviewGroup(e.w,'Promotions'),true);
  e.w.LocalAI.fillMissingImages=async(data,options)=>{attempt++;assert.equal(data.offers.length,1);assert.equal(data.benefits.length,0);assert.equal(data.vouchers.length,0);assert.equal(data.upsell,undefined);
   if(attempt===1){jobs=[{id:'selected-promotion',kind:'images',status:'unknown'}];return {generated:0,total_empty:1,warning:'Unknown image result'};}
   assert.equal(options.resumeUnknown,true);data.offers[0].imageData='data:image/png;base64,recovered-promotion';jobs=[];return {generated:1,total_empty:1};};
  await e.w.LPGRequirementsEditor.acceptGeneration();assert.equal(e.w.document.getElementById('recover-generation').disabled,false);
  await e.w.LPGRequirementsEditor.recoverGeneration();assert.equal(attempt,2);assert.equal(e.run('state.offers[0].imageData'),'data:image/png;base64,recovered-promotion');
  assert.equal(e.run('state.benefits.length'),originalBenefits);assert.equal(e.run('state.program'),null);
 }finally{e.close();}
});

test('full comparison text stays reviewable and image payloads are redacted',async()=>{
 const e=await editor({review:true});try{
  e.field('brief-text','Professional program');await e.w.LPGRequirementsEditor.analyze(e.client(),'');await e.w.LPGRequirementsEditor.acceptGeneration();
  const long='Long author text '.repeat(150)+'UNTRUNCATED_END_MARKER';
  e.run(`state.offers[0].description=${JSON.stringify(long)};state.offers[0].imageData='data:image/png;base64,PRIVATE_IMAGE_BYTES'`);
  for(const option of e.w.document.getElementById('ai-refine-sections').options)option.selected=option.value==='offers';
  await e.w.LPGRequirementsEditor.analyze(e.client(null,p=>({...presentation(p.validatedProgram),offers:[{title:'New structural offer',description:'New description',cta:'Explore'}]})),'');
  const box=e.w.document.getElementById('generation-review');assert.match(box.textContent,/UNTRUNCATED_END_MARKER/);assert.doesNotMatch(box.textContent,/PRIVATE_IMAGE_BYTES/);
  assert.ok(box.querySelector('pre[tabindex="0"][aria-label="Before value"]'));
 }finally{e.close();}
});
test('rejecting an entire existing audience keeps it active when only the other new audience is accepted',async()=>{
 const e=await editor({review:true});try{
  e.field('brief-text','Professional program');await e.w.LPGRequirementsEditor.analyze(e.client(),'');await e.w.LPGRequirementsEditor.acceptGeneration();
  const original=e.run('JSON.stringify(LPGVariants.snapshot())');
  e.field('brief-mode','both');await e.w.LPGRequirementsEditor.analyze(e.client(),'');selectReviewNone(e.w);
  changeReview(e.w,reviewGroup(e.w,'New B2B portal'),true);await e.w.LPGRequirementsEditor.acceptGeneration();
  assert.equal(e.run('state.activeVariant'),'b2c');assert.equal(e.run('JSON.stringify(LPGVariants.snapshot())'),original);
  assert.equal(e.run('state.variants.b2b.program.mode'),'b2b');
 }finally{e.close();}
});

test('declined benefit cover roles stay blank during generation and recovery when text is accepted',async()=>{
 const e=await editor({review:true});try{
  e.field('brief-text','Professional program');await e.w.LPGRequirementsEditor.analyze(e.client(),'');await e.w.LPGRequirementsEditor.acceptGeneration();
  const id=e.run('state.benefits[0].id');e.run("state.benefits[0].coverImageUrl='';state.benefits[0].coverImageData=''");
  for(const option of e.w.document.getElementById('ai-refine-sections').options)option.selected=option.value==='benefits';
  const client=e.client(null,p=>({...presentation(p.validatedProgram),benefits:[{id,name:'Updated benefit',coverImageUrl:'https://brand.test/scene.jpg'}]}));
  client.scrapeViaCorsProxy=async()=>'<title>Brand</title><img src="https://brand.test/scene.jpg" alt="Member experience">';
  e.w.document.getElementById('quickstart-url').value='https://brand.test';
  await e.w.LPGRequirementsEditor.analyze(client,'https://brand.test');selectReviewNone(e.w);
  const group=reviewGroup(e.w,'Benefits').closest('fieldset'),name=Array.from(group.querySelectorAll('[data-review-unit]')).find(node=>node.closest('label').textContent.trim()==='Name'||node.closest('label').textContent.trim().endsWith('· Name'));
  assert.ok(name);assert.ok(Array.from(group.querySelectorAll('[data-review-unit]')).some(node=>node.closest('li').textContent.includes('coverImageUrl')));changeReview(e.w,name,true);
  let jobs=[],attempts=0;e.w.LocalAI.getPendingJobs=()=>jobs;
  e.w.LocalAI.fillMissingImages=async(data,options)=>{attempts++;assert.ok(Array.isArray(options.onlySlots));assert.ok(!options.onlySlots.includes('benefit-cover-0'));
   if(attempts===1){jobs=[{id:'benefit-icon-only',kind:'images',status:'unknown'}];return {generated:0,total_empty:1,warning:'Unknown request'};}
   assert.equal(options.resumeUnknown,true);data.benefits[0].coverImageData='data:image/png;base64,unexpected';jobs=[];return {generated:1,total_empty:1};};
  await e.w.LPGRequirementsEditor.acceptGeneration();await e.w.LPGRequirementsEditor.recoverGeneration();
  assert.equal(attempts,2);assert.equal(e.run('state.benefits[0].name'),'Updated benefit');assert.equal(e.run('state.benefits[0].coverImageUrl'),'');assert.equal(e.run('state.benefits[0].coverImageData'),'');
 }finally{e.close();}
});
test('background card image roles merge generated artwork and preserve a later author upload',async()=>{
 const e=await editor({review:true});try{
  e.field('brief-text','Professional program');await e.w.LPGRequirementsEditor.analyze(e.client(),'');
  await e.w.LPGRequirementsEditor.acceptGeneration();
  // An unchanged card isn't part of the first AI proposal. Explicit full image
  // work is authorized separately and uses the same safe empty-owner merge.
  e.run("state.cinematic.card.mode='image';state.cinematic.card.markMode='custom';state.cinematic.card.markImageData='';state.cinematic.card.artworkImageData=''");
  let release,started;const ready=new Promise(r=>started=r),waiting=new Promise(r=>release=r);
  e.w.LocalAI.fillMissingImages=async data=>{started();await waiting;data.cinematic.card.markImageData='data:image/png;base64,mark';data.cinematic.card.artworkImageData='data:image/png;base64,artwork';return {generated:2,total_empty:2};};
  const request=e.w.LPGRequirementsEditor.retryImages();await ready;e.run("state.cinematic.card.markImageData='data:image/png;base64,author-upload'");release();await request;
  assert.equal(e.run('state.cinematic.card.markImageData'),'data:image/png;base64,author-upload');assert.equal(e.run('state.cinematic.card.artworkImageData'),'data:image/png;base64,artwork');
 }finally{e.close();}
});
test('author text edits during uncertain image work disable recovery without starting another request',async()=>{
 const e=await editor({review:true});try{
  e.field('brief-text','Professional program');await e.w.LPGRequirementsEditor.analyze(e.client(),'');
  let release,started,calls=0,jobs=[];const ready=new Promise(r=>started=r),waiting=new Promise(r=>release=r);e.w.LocalAI.getPendingJobs=()=>jobs;
  e.w.LocalAI.fillMissingImages=async(data,options)=>{calls++;started();await waiting;options.onStatus('generating_images',{generated:0,attempted:0,total:8,remaining:8});jobs=[{id:'old-image-prompt',kind:'images',status:'unknown'}];return {generated:0,total_empty:8,warning:'Unknown request'};};
  const accept=e.w.LPGRequirementsEditor.acceptGeneration();await ready;e.run("state.offers[0].title='New author wording during images'");release();await accept;
  assert.equal(e.w.document.getElementById('recover-generation').disabled,true);await e.w.LPGRequirementsEditor.recoverGeneration();assert.equal(calls,1);
  assert.equal(e.run('state.offers[0].title'),'New author wording during images');assert.match(e.w.document.getElementById('generation-recovery-note').textContent,/edited this portal/);
 }finally{e.close();}
});

test('selected new audience card artwork persists in that audience without changing the active card',async()=>{
 const e=await editor({review:true});try{
  e.field('brief-text','Professional program');await e.w.LPGRequirementsEditor.analyze(e.client(),'');await e.w.LPGRequirementsEditor.acceptGeneration();
  e.run("state.cinematic.card.mode='image';state.cinematic.card.markMode='custom';state.cinematic.card.markImageData='';state.cinematic.card.artworkImageData=''");
  e.field('brief-mode','both');await e.w.LPGRequirementsEditor.analyze(e.client(),'');selectReviewNone(e.w);changeReview(e.w,reviewGroup(e.w,'New B2B portal'),true);
  e.w.LocalAI.fillMissingImages=async(data,options)=>{assert.ok(options.onlySlots.includes('card-mark'));assert.ok(options.onlySlots.includes('card-artwork'));data.cinematic.card.markImageData='data:image/png;base64,b2b-mark';data.cinematic.card.artworkImageData='data:image/png;base64,b2b-card';return {generated:2,total_empty:2};};
  await e.w.LPGRequirementsEditor.acceptGeneration();assert.equal(e.run('state.activeVariant'),'b2c');
  assert.equal(e.run('state.cinematic.card.artworkImageData'),'');assert.equal(e.run('state.variants.b2b.cinematic.card.markImageData'),'data:image/png;base64,b2b-mark');
  assert.equal(e.run('state.variants.b2b.cinematic.card.artworkImageData'),'data:image/png;base64,b2b-card');
 }finally{e.close();}
});
