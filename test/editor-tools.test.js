const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM,VirtualConsole}=require('jsdom');
async function fixture(){
  const html=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'');
  const dom=new JSDOM(html,{runScripts:'outside-only',url:'https://lpg.test/',virtualConsole:new VirtualConsole()}),w=dom.window;
  await new Promise(resolve=>w.document.addEventListener('DOMContentLoaded',resolve,{once:true}));
  w.HTMLElement.prototype.scrollIntoView=()=>{};w.confirm=()=>true;w.TextEncoder=TextEncoder;
  const run=source=>vm.runInContext(source,dom.getInternalVMContext());
  for(const file of ['defaults','images','cinematic-settings','program-model','program-runtime','portal-templates','generator','pagehost','content-contract','program-provenance','requirements','portal-content','variants','requirements-editor','app','projects','editor-tools'])run(fs.readFileSync('js/'+file+'.js','utf8'));
  run("applyIndustryDefaults('generic');editorDefaults=cloneProject(state);scheduleDraftRecovery=()=>{};schedulePreview=()=>{};populateFormFromState();renderDynamicSections();LPGRequirementsEditor.init();LPGEditor.init();");
  return {w,run,close:()=>dom.window.close()};
}
test('undo and redo restore content and image assets without crossing project changes',async()=>{
  const f=await fixture();try{
    f.run("state.offers[0].imageData='data:image/png;base64,original';LPGEditor.record('Before edit');state.offers[0].title='Changed';state.offers[0].imageData='data:image/png;base64,replacement';");
    f.w.LPGEditor.undo();assert.notEqual(f.run('state.offers[0].title'),'Changed');assert.equal(f.run('state.offers[0].imageData'),'data:image/png;base64,original');
    f.w.LPGEditor.redo();assert.equal(f.run('state.offers[0].title'),'Changed');assert.equal(f.run('state.offers[0].imageData'),'data:image/png;base64,replacement');
    f.run('projectEpoch++;LPGEditor.undo()');assert.equal(f.run('state.offers[0].title'),'Changed');
  }finally{f.close();}
});
test('samples fill without replacing authored items and replacement can be undone',async()=>{
  const f=await fixture();try{
    f.run("state.benefits=[{id:'authored',name:'Custom benefit',imageUrl:'https://brand.test/custom.jpg'}];");
    f.w.autoGenerate('benefits');assert.equal(f.run('state.benefits[0].name'),'Custom benefit');
    f.w.document.getElementById('sample-content-mode').value='replace';f.w.autoGenerate('benefits');assert.notEqual(f.run('state.benefits[0].name'),'Custom benefit');
    f.w.LPGEditor.undo();assert.equal(f.run('state.benefits[0].id'),'authored');assert.equal(f.run('state.benefits[0].imageUrl'),'https://brand.test/custom.jpg');
  }finally{f.close();}
});
test('device previews set real viewport dimensions and inspect messages require current source and token',async()=>{
  const f=await fixture();try{
    const frame=f.w.document.getElementById('preview-iframe'),stage=f.w.document.getElementById('preview-stage');Object.defineProperty(stage,'clientWidth',{value:500});
    f.w.document.getElementById('preview-device').value='phone';f.w.fitDesktopPreview();assert.equal(frame.width,'390');assert.equal(frame.height,'844');
    f.run('updatePreview()');const send=(source,token)=>f.w.dispatchEvent(new f.w.MessageEvent('message',{source,data:{type:'lpg-preview-selection',token,section:'vouchers'}}));
    send(f.w,frame.dataset.previewToken);assert.equal(f.run('currentStep'),0);
    send(frame.contentWindow,'stale');assert.equal(f.run('currentStep'),0);
    send(frame.contentWindow,frame.dataset.previewToken);assert.equal(f.run('currentStep'),3);
    assert.doesNotMatch(f.run('generatePortalHTML(state)'),/lpg-preview-selection/);
  }finally{f.close();}
});
test('wizard names, labels, keyboard upload targets and search work together',async()=>{
  const f=await fixture();try{
    const doc=f.w.document;assert.match(doc.querySelector('.step-dot').getAttribute('aria-label'),/Step 1:/);assert.equal(doc.querySelector('.step-dot').getAttribute('aria-current'),'step');
    f.w.goToStep(3);assert.equal(doc.querySelectorAll('.step-dot')[3].getAttribute('aria-current'),'step');
    const field=doc.querySelector('#vouchers-container input');assert.ok(doc.querySelector(`label[for="${field.id}"]`));
    assert.equal(doc.getElementById('drop-logo').getAttribute('role'),'button');assert.equal(doc.getElementById('drop-logo').tabIndex,0);
    const search=doc.getElementById('editor-search');search.value='Description';search.dispatchEvent(new f.w.Event('input'));assert.ok(doc.querySelectorAll('.editor-search-result').length);
  }finally{f.close();}
});
test('focal points and fit persist with image owner and safe rendering',async()=>{
  const f=await fixture();try{
    f.run("state.vouchers[0].imageUrl='https://brand.test/reward.jpg'");f.w.LPGEditor.imageEdit('voucher-0','Fit','contain');f.w.LPGEditor.imageEdit('voucher-0','X','90');f.w.LPGEditor.imageEdit('voucher-0','Y','20');
    assert.equal(f.run('state.vouchers[0].imageFit'),'contain');assert.equal(f.run('state.vouchers[0].imagePosition'),'90% 20%');
    f.run('hydratePortal(buildProjectPayload())');assert.equal(f.run('state.vouchers[0].imagePosition'),'90% 20%');
    assert.match(f.run('generatePortalHTML(state)'),/object-fit:contain;object-position:90% 20%/);
  }finally{f.close();}
});
test('descriptive and no-tier programs render across all templates without fake progress and localize numbers',async()=>{
  const f=await fixture();try{
    f.run("state.programEnabled=true;state.program=LPGProgram.normalize({version:2,locale:'fr-FR',capabilities:{presentationOnly:true,tiers:false},tiers:[],qualification:{basis:'nights',period:'calendar-year',description:'Status follows the published membership criteria.'},metrics:[{id:'nights',name:'Nights',value:1200,unit:'nights',singularUnit:'night'}]});");
    for(const template of ['classic','dashboard','showcase','editorial','cinematic']){
      f.run('state.outputTemplate='+JSON.stringify(template));const html=f.run('generatePortalHTML(state)');
      const doc=new JSDOM(html,{runScripts:'dangerously',virtualConsole:new VirtualConsole()}).window.document;
      assert.equal(doc.querySelector('[data-lpg-progress]'),null,template);assert.doesNotMatch(doc.querySelector('main').textContent,/Highest tier achieved/);assert.equal(doc.documentElement.lang,'fr-FR');
      assert.match(doc.body.textContent,/Nights/);doc.defaultView.close();
    }
  }finally{f.close();}
});

test('undo cancels background enrichment and history grouping respects audience',async()=>{
 const f=await fixture();try{
  let cancelled=0;f.w.LPGRequirementsEditor.cancelGeneration=()=>{cancelled++;};
  f.run("LPGEditor.record('B2C edit','title');state.brand.name='One';state.activeVariant='b2b';LPGEditor.record('B2B edit','title');state.brand.name='Two';");
  f.w.LPGEditor.undo();assert.equal(cancelled,1);assert.equal(f.run('state.brand.name'),'One');
  f.w.LPGEditor.undo();assert.notEqual(f.run('state.brand.name'),'One');
 }finally{f.close();}
});
test('member wording edits survive canonical form updates and start over clears custom locale and labels',async()=>{
 const f=await fixture();try{
  const label=Array.from(f.w.document.querySelectorAll('#display-label-editor label')).find(l=>l.textContent==='Member email');
  const input=label.querySelector('input');input.value='member@example.test';input.dispatchEvent(new f.w.Event('input'));
  f.run("onFieldChange({target:document.getElementById('member-name')})");assert.equal(f.run('state.member.email'),'member@example.test');
  f.run("state.locale='ar-SA';state.displayLabels={vouchers:'Custom'};startOver()");assert.equal(f.run('state.locale'),'en-US');assert.equal(f.run('Object.keys(state.displayLabels).length'),0);
 }finally{f.close();}
});
