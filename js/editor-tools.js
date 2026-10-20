// Authoring tools stay in the builder; exported portals contain only portal UI.
(function (root) {
  'use strict';
  const copy = value => JSON.parse(JSON.stringify(value));
  const ids = ['hero','tiers','vouchers','offers','badges','clubs','benefits','earn','profile-tasks','upsell','activity','profile','team'];
  const steps = { hero:0,tiers:2,vouchers:3,offers:4,badges:5,clubs:5,benefits:5,earn:5,'profile-tasks':5,upsell:5,activity:0,profile:0,team:0 };
  let initialized=false, fieldSequence=0;
  let back = [], forward = [], epoch = null, restoring = false, lastKey = '', lastTime = 0, observer, enhancing = false;
  const el = id => document.getElementById(id);
  const currentEpoch = () => typeof projectEpoch === 'number' ? projectEpoch : 0;
  function syncHistory() {
    if (epoch !== currentEpoch()) { back=[];forward=[];epoch=currentEpoch();lastKey=''; }
    if(el('editor-undo'))el('editor-undo').disabled=!back.length;
    if(el('editor-redo'))el('editor-redo').disabled=!forward.length;
  }
  function record(label, key = '') {
    if (restoring || typeof state !== 'object') return;
    syncHistory();
    key = key ? (state.activeVariant || 'b2c') + ':' + key : '';
    const now=Date.now();
    if(key && key===lastKey && now-lastTime<1200){lastTime=now;return;}
    const json=JSON.stringify(state);back.push({json,label});forward=[];
    while(back.length>1 && (back.length>12 || back.reduce((n,x)=>n+x.json.length,0)>32*1024*1024))back.shift();
    lastKey=key;lastTime=now;syncHistory();
  }
  function restore(direction) {
    syncHistory();const from=direction==='undo'?back:forward,to=direction==='undo'?forward:back;if(!from.length)return;
    const saved=from.pop();to.push({json:JSON.stringify(state),label:saved.label});
    restoring=true;
    try {
      root.LPGRequirementsEditor?.cancelGeneration?.();
      root.LPGImages?.invalidate();
      const next=JSON.parse(saved.json);for(const key of Object.keys(state))delete state[key];Object.assign(state,next);
      populateFormFromState();renderDynamicSections();root.LPGRequirementsEditor?.sync?.();schedulePreview();
      if(el('editor-tool-status'))el('editor-tool-status').textContent=saved.label+' restored.';
    } finally {restoring=false;lastKey='';syncHistory();}
  }
  function selectSection(key) {
    const scene=key.replace(/^cj-/,'');
    const scenes={arrival:'arrival',progress:'progress',possibility:'possibility',benefits:'benefits',discovery:'discovery',details:'details'};
    if(key.startsWith('cj-') && scenes[scene]) {
      goToStep(0);root.LPGCinematic?.sync();
      if(el('portal-settings'))el('portal-settings').open=true;
      const details=el('cinematic-settings')?.querySelectorAll('details');
      const index=['arrival','progress','possibility','benefits','discovery','details'].indexOf(scene);
      if(details?.[index]){details[index].open=true;details[index].scrollIntoView?.({block:'center'});details[index].querySelector('textarea')?.focus();}
      return;
    }
    if(!ids.includes(key))return;
    goToStep(steps[key]);
    const container=el(({vouchers:'vouchers-container',offers:'offers-container',benefits:'benefits-container',badges:'badges-container',clubs:'clubs-container',earn:'earn-more-container','profile-tasks':'profile-tasks-container'})[key]) || document.querySelector('.step-panel.active');
    container?.scrollIntoView?.({block:'center'});container?.querySelector('input,textarea,select,button')?.focus();
    if(el('editor-tool-status'))el('editor-tool-status').textContent='Editing '+key.replace(/-/g,' ')+'.';
  }
  function stepChanged(step) {
    const panels=Array.from(document.querySelectorAll('.step-panel'));
    document.querySelectorAll('.step-dot').forEach((dot,index)=>{
      const heading=dot.dataset.label || panels.find(p=>Number(p.dataset.step)===index)?.querySelector('h2')?.textContent.trim() || 'Step '+(index+1);
      dot.setAttribute('aria-label',`Step ${index+1}: ${heading}`);
      if(index===step)dot.setAttribute('aria-current','step');else dot.removeAttribute('aria-current');
    });
    const active=document.activeElement;
    if(active?.matches?.('.step-dot,#btn-next,#btn-prev')) {
      const heading=document.querySelector('.step-panel.active h2');if(heading){heading.tabIndex=-1;heading.focus();}
    }
    if(el('editor-step-status'))el('editor-step-status').textContent=`Step ${step+1} of ${panels.length}`;
    document.querySelector('.step-dot[aria-current=step]')?.scrollIntoView?.({block:'nearest',inline:'nearest',behavior:'instant'});
    enhance();syncHistory();
  }
  function enhance() {
    if(enhancing)return;enhancing=true;
    try {
      let count=0;
      for(const label of document.querySelectorAll('#wizard-col label')) {
        if(label.htmlFor)continue;
        const next=label.nextElementSibling;
        const field=label.querySelector('input,select,textarea') || (next?.matches('input,select,textarea')?next:next?.querySelector('input,select,textarea'));
        if(!field)continue;if(!field.id)field.id='lpg-editor-field-'+(++fieldSequence);
        label.htmlFor=field.id;
      }
      for(const input of document.querySelectorAll('#wizard-col input[type=color]')) {
        const hex=el(input.id.replace(/^color-/,'hex-'));
        const label=hex?.labels?.[0] || input.labels?.[0];
        if(label){
          input.setAttribute('aria-label',label.textContent.trim()+' color picker');
          hex?.setAttribute('aria-label',label.textContent.trim()+' hex color');
        }
      }
      for(const button of document.querySelectorAll('.step-panel button'))if(button.textContent.trim()==='×' && !button.getAttribute('aria-label')) {
        const name=button.parentElement?.querySelector('input')?.value || 'item';button.setAttribute('aria-label','Remove '+name.slice(0,100));
      }
      for(const button of document.querySelectorAll('button[onclick^="autoGenerate"]'))if(button.textContent!=='Use sample content')button.textContent='Use sample content';
      for(const drop of document.querySelectorAll('[id^="drop-"]')){drop.setAttribute('role','button');drop.tabIndex=0;if(!drop.getAttribute('aria-label'))drop.setAttribute('aria-label','Upload '+drop.id.replace(/^drop-/,'').replace(/-/g,' '));}
    }finally{enhancing=false;}
  }
  function search(query) {
    const results=el('editor-search-results');if(!results)return;results.replaceChildren();
    const q=query.trim().toLowerCase();if(!q){results.hidden=true;return;}
    const matches=Array.from(document.querySelectorAll('#wizard-col label[for]')).filter(label=>!label.closest('[hidden]')&&label.textContent.toLowerCase().includes(q)&&el(label.htmlFor));
    for(const label of matches.slice(0,14)) {
      const button=document.createElement('button');button.type='button';button.className='editor-search-result';button.textContent=label.textContent.trim().slice(0,120);
      button.addEventListener('click',()=>{
        const panel=label.closest('.step-panel');if(panel)goToStep(Number(panel.dataset.step));
        for(let p=label.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;
        const field=el(label.htmlFor);field?.focus();field?.scrollIntoView?.({block:'center'});
        results.hidden=true;
      });results.appendChild(button);
    }
    if(!matches.length)results.textContent='No matching editable fields.';results.hidden=false;
  }
  function imageTarget(slot) {
    const match=slot.match(/^(voucher|offer|badge|club|benefit-cover|benefit|earn|profile-task)-(\d+)$/);
    if(match){const collection={'voucher':'vouchers','offer':'offers','badge':'badges','club':'clubs','benefit-cover':'benefits','benefit':'benefits','earn':'earnMore','profile-task':'profileTasks'}[match[1]];return {item:state[collection]?.[Number(match[2])],prefix:match[1]==='benefit-cover'?'cover':'image'};}
    if(slot==='card-artwork')return {item:state.cinematic?.card,prefix:'artwork'};
    return {};
  }
  function imageControls(slot) {
    const {item,prefix}=imageTarget(slot);if(!item)return '';
    const fit=item[prefix+'Fit']==='contain'?'contain':'cover',position=item[prefix+'Position'] || '50% 50%';
    const [x,y]=position.split(' ').map(n=>Math.max(0,Math.min(100,parseFloat(n)||0)));
    const safe=String(slot).replace(/[^a-z0-9-]/g,'');
    return `<details class="image-framing"><summary>Image framing</summary><label for="fit-${safe}">Fit</label><select id="fit-${safe}" onchange="LPGEditor.imageEdit('${safe}','Fit',this.value)"><option value="cover" ${fit==='cover'?'selected':''}>Fill image area</option><option value="contain" ${fit==='contain'?'selected':''}>Show whole image</option></select><label for="focal-x-${safe}">Horizontal focal point</label><input id="focal-x-${safe}" type="range" min="0" max="100" value="${x}" oninput="LPGEditor.imageEdit('${safe}','X',this.value)"><label for="focal-y-${safe}">Vertical focal point</label><input id="focal-y-${safe}" type="range" min="0" max="100" value="${y}" oninput="LPGEditor.imageEdit('${safe}','Y',this.value)"></details>`;
  }
  function imageEdit(slot,field,value) {
    const {item,prefix}=imageTarget(slot);if(!item)return;record('Image framing',slot+field);
    if(field==='Fit')item[prefix+'Fit']=value==='contain'?'contain':'cover';
    else {const pos=(item[prefix+'Position']||'50% 50%').split(' ');pos[field==='X'?0:1]=Math.max(0,Math.min(100,Number(value)||0))+'%';item[prefix+'Position']=pos.join(' ');}
    if(typeof updatePreviewImageFraming==='function')updatePreviewImageFraming(slot,item[prefix+'Fit']==='contain'?'contain':'cover',item[prefix+'Position']||'50% 50%');
    else schedulePreview();
  }
  function displayControls() {
    const host=el('display-label-editor');if(!host)return;
    host.replaceChildren();const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Portal wording and locale';details.append(summary);
    const add=(caption,value,change,type='text')=>{const label=document.createElement('label'),input=document.createElement('input');input.type=type;input.id='lpg-wording-'+(++fieldSequence);label.htmlFor=input.id;label.textContent=caption;input.value=value||'';label.append(input);input.addEventListener('input',()=>change(input.value));details.append(label);return input;};
    add('Locale (for example en-US, fr-FR, ar-SA)',state.program?.locale || state.locale || 'en-US',value=>{
      try{const locale=Intl.getCanonicalLocales(value)[0];if(!locale)return;record('Portal locale','locale');state.locale=locale;if(state.program){const next=copy(state.program);next.locale=locale;state.program=LPGProgram.normalize(next);}schedulePreview();}catch{if(el('editor-tool-status'))el('editor-tool-status').textContent='Enter a valid locale such as en-US.';}
    });
    const labels={vouchers:'My Vouchers',offers:'My Offers & Promotions',benefits:'My Benefits',earn:'Earn More',badges:'My Badges',clubs:'My Social Clubs',navarrival:'Overview',navprogress:'Your status',navpossibility:'Rewards',navbenefits:'Benefits',navdiscovery:'Discover',navdetails:'Your account',balance:'Balance',retention:'Explore the activities and benefits available with your membership.',opportunityTitle:'Explore your next reward',opportunityDescription:'Discover ways to use your points through eligible rewards.'};
    for(const[key,fallback]of Object.entries(labels))add(key.startsWith('nav')?'Navigation – '+fallback:'Label – '+fallback,state.displayLabels?.[key] ?? fallback,value=>{record('Edit portal wording',key);state.displayLabels=state.displayLabels||{};state.displayLabels[key]=value.slice(0,200);schedulePreview();});
    for(const[field,caption]of [['email','Member email'],['phone','Member phone'],['joinDate','Member since']])add(caption,state.member[field],value=>{record('Edit member details',field);state.member[field]=value;const original=el('member-'+(field==='joinDate'?'join':field));if(original)original.value=value;schedulePreview();});
    host.append(details);
  }
  function initGenerationInfo() {
    const trigger=el('generation-info-trigger'),panel=el('generation-info-panel'),host=el('generation-info');if(!trigger||!panel||!host)return;
    let closing;
    const close=()=>{clearTimeout(closing);panel.hidden=true;trigger.setAttribute('aria-expanded','false');};
    const open=()=>{
      clearTimeout(closing);panel.hidden=false;trigger.setAttribute('aria-expanded','true');
      const rect=trigger.getBoundingClientRect(),width=Math.min(340,root.innerWidth-32);
      panel.style.width=width+'px';panel.style.left=Math.max(16,Math.min(rect.right-width,root.innerWidth-width-16))+'px';
      panel.style.top=Math.min(rect.bottom+8,Math.max(16,root.innerHeight-panel.offsetHeight-16))+'px';
    };
    const leave=()=>{closing=setTimeout(()=>{if(!host.matches(':hover')&&!host.contains(document.activeElement))close();},120);};
    trigger.addEventListener('mouseenter',open);panel.addEventListener('mouseenter',()=>clearTimeout(closing));
    host.addEventListener('mouseleave',leave);host.addEventListener('focusin',open);host.addEventListener('focusout',leave);
    trigger.addEventListener('click',open);
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){close();trigger.focus({preventScroll:true});close();event.preventDefault();}});
    document.addEventListener('pointerdown',event=>{if(!host.contains(event.target))close();});
    root.addEventListener('resize',close);
    document.addEventListener('scroll',event=>{
      if(panel.hidden||host.contains(event.target))return;
      const rect=trigger.getBoundingClientRect();
      if(host.contains(document.activeElement)&&rect.bottom>0&&rect.top<root.innerHeight)open();else close();
    },true);
  }
  function init() {
    if(initialized)return;initialized=true;
    initGenerationInfo();
    el('editor-undo')?.addEventListener('click',()=>restore('undo'));el('editor-redo')?.addEventListener('click',()=>restore('redo'));
    el('editor-search')?.addEventListener('input',event=>search(event.target.value));
    el('preview-edit-mode')?.addEventListener('change',()=>{
      for(const id of ['preview-iframe','expanded-preview-iframe']){const frame=el(id);frame?.contentWindow?.postMessage({type:'lpg-preview-edit-mode',token:frame.dataset.previewToken,enabled:el('preview-edit-mode').checked},'*');}
    });
    el('preview-device')?.addEventListener('change',()=>{if(el('expanded-preview-device'))el('expanded-preview-device').value=el('preview-device').value;fitDesktopPreview();if(el('portal-preview-dialog')?.open)openPortalPreview();});
    el('expanded-preview-device')?.addEventListener('change',()=>{el('preview-device').value=el('expanded-preview-device').value;fitDesktopPreview();openPortalPreview();});
    el('preview-zoom')?.addEventListener('change',fitDesktopPreview);
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&el('editor-search-results')&&!el('editor-search-results').hidden){el('editor-search-results').hidden=true;el('editor-search')?.focus();}
      if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='z'&&!event.target.matches('input,textarea,[contenteditable]')){event.preventDefault();event.shiftKey?restore('redo'):restore('undo');}
    });
    observer=new MutationObserver(()=>{queueMicrotask(enhance);});observer.observe(document.body,{childList:true,subtree:true});
    const stepNav=document.querySelector('.step-dot')?.parentElement;if(stepNav){stepNav.setAttribute('role','navigation');stepNav.setAttribute('aria-label','Portal builder steps');}
    displayControls();enhance();stepChanged(typeof currentStep==='number'?currentStep:0);syncHistory();
  }
  root.LPGEditor={record,undo:()=>restore('undo'),redo:()=>restore('redo'),selectSection,stepChanged,enhance,imageControls,imageEdit,init,displayControls};
  document.addEventListener('DOMContentLoaded',init);
})(window);
