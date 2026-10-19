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
async function editor() {
  const html=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'');
  const dom=new JSDOM(html,{runScripts:'outside-only',url:'https://lpg.test/'}),w=dom.window;
  await new Promise(r=>w.document.addEventListener('DOMContentLoaded',r,{once:true}));
  w.HTMLElement.prototype.scrollIntoView=()=>{};w.confirm=()=>true;
  const run=code=>vm.runInContext(code,dom.getInternalVMContext());
  for(const file of ['defaults','images','cinematic-settings','program-model','program-runtime','portal-templates','generator','pagehost','requirements','portal-content','variants','requirements-editor','app','projects']) run(fs.readFileSync(`js/${file}.js`,'utf8'));
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
    assert.equal(e.run('state.program.mode'),'b2b');assert.equal(e.run('state.outputTemplate'),'classic');
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
      { outputTemplate: 'cinematic', defaultRewardCount: 5 }, { outputTemplate: 'cinematic' },
      { outputTemplate: 'editorial', defaultRewardCount: 4 }, { outputTemplate: 'editorial' }
    ]);
  } finally { e.close(); }
});

test('a template change while AI is working discards the pending result', async () => {
  const e = await editor(); try {
    const client = e.client(prompt => {
      e.run(`state.outputTemplate='cinematic'`);
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
