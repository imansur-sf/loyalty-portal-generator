// Authoring UI for a program brief and live, validated program edits.
(function (root) {
  'use strict';
  const el = id => document.getElementById(id);
  const clone = value => JSON.parse(JSON.stringify(value));
  const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let importSequence = 0, generationSequence = 0, importing = false, pendingGeneration = null, generationAbort = null;
  const RECOVERY_KEY='lpg-generation-checkpoint-v1';
  let generationClient=null;
  function signature() {
    const value=LPGRequirements.SYSTEM+'\n'+String(root.LPGPortalContent?.promptSignature || '')+'\n'+String(root.LPGPortalContent?.generate)+'\n'+JSON.stringify({backend:root.LocalAI?.getScraperEndpoint?.() || '',provider:root.LocalAI?.currentProvider?.() || '',model:root.LocalAI?.getModel?.() || ''});
    let hash=2166136261; for(let i=0;i<value.length;i++) hash=Math.imul(hash^value.charCodeAt(i),16777619);
    return `${value.length}:${hash>>>0}`;
  }
  function readCheckpoint() { try { const value=JSON.parse(localStorage.getItem(RECOVERY_KEY));return value?.version===1?value:null; } catch(_){return null;} }
  function writeCheckpoint(value) { try { localStorage.setItem(RECOVERY_KEY,JSON.stringify({version:1,createdAt:Date.now(),signature:signature(),...value})); } catch(_){} }
  function clearCheckpoint() { try {localStorage.removeItem(RECOVERY_KEY);}catch(_){} }
  function renderRecovery() {
    let box=el('generation-recovery');
    if(!box && el('program-review')) {box=document.createElement('section');box.id='generation-recovery';box.className='program-edit-card';box.setAttribute('aria-label','Unfinished generation');el('program-review').insertAdjacentElement('beforebegin',box);}
    if(!box)return;
    const jobs=root.LocalAI?.getPendingJobs?.() || [],checkpoint=readCheckpoint();
    box.hidden=!!pendingGeneration || (!jobs.length && !checkpoint);
    if(box.hidden){box.replaceChildren();return;}
    const matches=checkpoint && !checkpoint.recoveryEdited && checkpoint.before===fingerprint() && checkpoint.signature===signature();
    box.innerHTML=`<h3>Unfinished generation</h3><p>${jobs.length ? `${jobs.length} saved generation request(s) may be recoverable.` : 'A saved text-generation checkpoint may be reconstructed from completed requests.'} Recovery checks the original request; it does not automatically replace your portal.</p><ul>${jobs.map(job=>`<li>${safe(job.kind)} · ${safe(job.status)}</li>`).join('')}</ul><button type="button" id="recover-generation" ${matches?'':'disabled'}>Recover unfinished generation</button><p id="generation-recovery-note" role="status">${matches?'Your inputs match the saved checkpoint.':checkpoint?.recoveryEdited?'You edited this portal while the earlier image request was running. Your edits are kept; use Fill missing images for a new image request.':!checkpoint?'No matching editor checkpoint is available. Your current portal is kept; use a new generation when ready.':'The editor or generation contract changed since this request. Recovery cannot replace these edits. Restore the original inputs or use a new generation.'}</p>`;
    el('recover-generation')?.addEventListener('click',recoverGeneration);
  }
  async function recoverGeneration() {
    const checkpoint=readCheckpoint();
    if(!checkpoint || checkpoint.recoveryEdited || checkpoint.before!==fingerprint() || checkpoint.signature!==signature()) {renderRecovery();return;}
    const button=el('recover-generation');if(button)button.disabled=true;
    let recoveryError='';
    try {
      if(checkpoint.stage==='images') await retryImages({resumeUnknown:true,maxImages:checkpoint.remainingBudget,mode:checkpoint.variant || state.activeVariant,imageMask:checkpoint.imageMask});
      else await analyze(generationClient || root.LocalAI,checkpoint.rawURL || '',{resumeUnknown:true});
    } catch(error) {recoveryError=error.message || 'This request could not be recovered. Your portal was kept.';}
    finally {renderRecovery();const note=el('generation-recovery-note');if(note && recoveryError)note.textContent=recoveryError;}
  }
  function refinementOptions() {
    const input = el('ai-refine-sections');
    const selected = input ? Array.from(input.selectedOptions || []).map(option => option.value) : [];
    return selected.length && !selected.includes('all') ? { sections:selected,mode:el('ai-refine-mode')?.value || 'replace' } : null;
  }
  function cancelGeneration({discard=false}={}) {
    generationSequence++; generationAbort?.abort(); generationAbort = null; pendingGeneration = null;
    renderGenerationReview();
    if(discard)clearCheckpoint();
    renderRecovery();
    setQuickStartStatus('Generation cancelled. Your current portal and edits were kept.', false);
  }
  function commitGeneration(proposal) {
    root.LPGEditor?.record?.('Accept AI changes');
    root.LPGVariants.replace(proposal.generated, proposal.selected);
    populateFormFromState(); renderDynamicSections(); renderPaletteButtons(); schedulePreview(); scheduleDraftRecovery();
    if (el('portal-edit-status')) el('portal-edit-status').textContent = proposal.warnings.join(' ');
    renderImageControls();
    setQuickStartStatus('Your text draft is ready. Images are filling in; you can edit your portal now.', false);
  }
  function renderImageControls() {
    let box=el('image-generation-controls');
    if (!box && el('portal-edit-status')) {
      box=document.createElement('div');box.id='image-generation-controls';
      el('portal-edit-status').insertAdjacentElement('afterend',box);
    }
    if (!box) return;
    box.innerHTML='<button type="button" id="retry-missing-images">Fill missing images</button> <button type="button" id="cancel-image-generation">Cancel image work</button>';
    el('retry-missing-images').addEventListener('click',retryImages);
    el('cancel-image-generation').addEventListener('click',cancelGeneration);
  }
  async function retryImages({resumeUnknown=false,maxImages,mode=state.activeVariant,imageMask}={}) {
    if (!root.LPGContentContract) return;
    generationAbort?.abort();pendingGeneration=null;renderGenerationReview();
    generationAbort=typeof AbortController==='function'?new AbortController():null;
    const draft=root.LPGVariants.get(mode);if(!draft)return;
    const proposal={generated:{[mode]:root.LPGContentContract.ensure(draft)},imageSelection:imageMask?{[mode]:imageMask}:undefined,
      project:projectEpoch,sequence:++generationSequence,signal:generationAbort?.signal,
      resumeUnknown,maxImages:maxImages ?? (el('ai-image-budget')?Number(el('ai-image-budget').value):16)};
    setQuickStartStatus('Filling missing images. Your text and existing images are kept.',false);
    await enrichGeneration(proposal);
  }
  function declinedAsset(proposal,mode,section,id,role) {
    return (proposal.imageSelection?.[mode]?.declinedRoles||[]).some(item=>item.section===section&&item.id===id&&item.role===role);
  }
  function selectedImageSlots(draft,mask) {
    if(!mask)return undefined;
    const slots=[],types={vouchers:'voucher',offers:'offer',clubs:'club',badges:'badge',benefits:'benefit'};
    const allowed=(section,id,role)=>!(mask.declinedRoles||[]).some(item=>item.section===section&&item.id===id&&item.role===role);
    for(const [key,type]of Object.entries(types))for(const [index,item]of (draft[key]||[]).entries()){
      if(allowed(key,item.id,'image'))slots.push(`${type}-${index}`);
      if(key==='benefits'&&allowed(key,item.id,'cover'))slots.push(`benefit-cover-${index}`);
    }
    if(draft.upsell&&allowed('upsell',null,'background'))slots.push('upsell-bg');
    if(draft.cinematic?.card){if(allowed('cinematic',null,'mark'))slots.push('card-mark');if(allowed('cinematic',null,'artwork'))slots.push('card-artwork');}
    return slots;
  }
  function detectImageEdits(proposal) {
    const current=fingerprint();
    if(proposal.recoveryFingerprint&&proposal.recoveryFingerprint!==current)proposal.recoveryEdited=true;
    if(!proposal.recoveryFingerprint)proposal.recoveryFingerprint=current;
  }
  function imageCheckpoint(proposal,mode,mask,remainingBudget) {
    detectImageEdits(proposal);
    writeCheckpoint({stage:'images',variant:mode,imageMask:mask,before:proposal.recoveryFingerprint,recoveryEdited:!!proposal.recoveryEdited,remainingBudget});
  }
  function mergeGeneratedImages(proposal,mode,draft,enriched) {
    if (proposal.signal?.aborted || proposal.project !== projectEpoch || proposal.sequence !== generationSequence) return;
    detectImageEdits(proposal);
    const current = root.LPGVariants.get(mode); if (!current) return;
    let changed=false;
        // A generated asset may only fill its original, still empty owner slot.
        for (const key of root.LPGContentContract.collections) for (const item of current[key] || []) {
          const before = draft[key]?.find(old => old.id === item.id), after = enriched[key]?.find(next => next.id === item.id);
          if (!before || !after) continue;
          for (const prefix of ['', 'cover']) {
            const dataKey = prefix ? 'coverImageData' : 'imageData', urlKey = prefix ? 'coverImageUrl' : 'imageUrl';
            if(declinedAsset(proposal,mode,key,item.id,prefix?'cover':'image'))continue;
            if (!before[dataKey] && !before[urlKey] && !item[dataKey] && !item[urlKey]) {
              if (after[dataKey]) { item[dataKey] = after[dataKey]; changed=true; } else if (after[urlKey]) { item[urlKey] = after[urlKey]; changed=true; }
            }
          }
        }
        for (const [key, fields] of [['brand',['logoData','logoUrl']],['upsell',['bgImageData','bgImageUrl']]]) {
          if (!declinedAsset(proposal,mode,key,null,key==='upsell'?'background':'logo') && current[key] && draft[key] && enriched[key] && fields.every(field => !current[key][field] && !draft[key][field])) {
            for (const field of fields) if (enriched[key][field]) { current[key][field] = enriched[key][field]; changed=true; }
          }
        }
        const originalCard=draft.cinematic?.card,currentCard=current.cinematic?.card,newCard=enriched.cinematic?.card;
        if(originalCard&&currentCard&&newCard){
          const config=card=>Object.fromEntries(Object.entries(card).filter(([key])=>!['markImageData','markImageUrl','artworkImageData','artworkImageUrl'].includes(key)));
          if(same(config(originalCard),config(currentCard)))for(const [role,dataKey,urlKey]of [['mark','markImageData','markImageUrl'],['artwork','artworkImageData','artworkImageUrl']]) {
            if(declinedAsset(proposal,mode,'cinematic',null,role))continue;
            if(!originalCard[dataKey]&&!originalCard[urlKey]&&!currentCard[dataKey]&&!currentCard[urlKey]) {
              if(newCard[dataKey]){currentCard[dataKey]=newCard[dataKey];changed=true;}else if(newCard[urlKey]){currentCard[urlKey]=newCard[urlKey];changed=true;}
            }
          }
        }
        if (!changed) return;
        if (mode === state.activeVariant) {
          for (const key of [...root.LPGContentContract.collections,'brand','upsell','cinematic']) if (current[key]) state[key] = current[key];
          if (!document.activeElement?.matches('input,textarea,select')) renderDynamicSections();
          schedulePreview();
        } else state.variants[mode] = current;
        proposal.recoveryFingerprint=fingerprint();
        scheduleDraftRecovery();
  }
  async function enrichGeneration(proposal) {
    for (const [mode, draft] of Object.entries(proposal.generated)) {
      if (proposal.signal?.aborted || proposal.project !== projectEpoch || proposal.sequence !== generationSequence) return;
      const mask=proposal.imageSelection?.[mode];
      if(proposal.imageSelection&&!mask)continue;
      if(mask&&!Object.keys(mask.collections).length&&!mask.single.length)continue;
      const enriched = clone(draft);
      if(mask) {
        for(const key of root.LPGContentContract.collections){const allowed=mask.collections[key];enriched[key]=allowed==='all'?(enriched[key]||[]):(enriched[key]||[]).filter(item=>Array.isArray(allowed)&&allowed.includes(item.id));}
        if(!mask.single.includes('upsell'))delete enriched.upsell;
        if(!mask.single.includes('cinematic')&&enriched.cinematic)delete enriched.cinematic.card;
      }
      try {
        imageCheckpoint(proposal,mode,mask,proposal.maxImages);
        await root.LPGPortalContent.fillImages(enriched, {outputTemplate:draft.outputTemplate,signal:proposal.signal,maxImages:proposal.maxImages,resumeUnknown:proposal.resumeUnknown,onlySlots:selectedImageSlots(enriched,mask),
          onStatus:(_phase,progress) => {
            if (proposal.signal?.aborted || proposal.project !== projectEpoch || proposal.sequence !== generationSequence) throw new Error('Image generation cancelled.');
            if (progress?.generated) mergeGeneratedImages(proposal,mode,draft,enriched);
            if (progress) imageCheckpoint(proposal,mode,mask,Math.max(0,(proposal.maxImages || 16)-progress.attempted));
            if (progress && el('portal-edit-status')) el('portal-edit-status').textContent=`Images: ${progress.generated} generated; ${progress.remaining} remain. You can keep editing.`;
          }});
        if (proposal.signal?.aborted || proposal.project !== projectEpoch || proposal.sequence !== generationSequence) return;
        mergeGeneratedImages(proposal,mode,draft,enriched);
        imageCheckpoint(proposal,mode,mask,readCheckpoint()?.remainingBudget ?? proposal.maxImages);
        if (!(root.LocalAI?.getPendingJobs?.() || []).some(job=>job.kind==='images')) clearCheckpoint();
        renderRecovery();
        if (enriched._meta?.image_warning && el('portal-edit-status')) el('portal-edit-status').textContent = enriched._meta.image_warning;
      } catch (error) {
        if (!proposal.signal?.aborted && proposal.sequence === generationSequence && proposal.project === projectEpoch && el('portal-edit-status')) el('portal-edit-status').textContent = 'Your text draft was kept. Some images did not finish; generate an image in its section or upload your own.';
      }
    }
    if (proposal.sequence === generationSequence && proposal.project === projectEpoch && !proposal.signal?.aborted) setQuickStartStatus((root.LocalAI?.getPendingJobs?.() || []).some(job=>job.kind==='images') ? 'Your text draft is ready. Some image work is unfinished; use Recover unfinished generation to check its saved request.' : 'Your portal is ready. Edit any section, or save your project to return later.', false);
  }
  const reviewNames={program:'Program rules and member details',brand:'Brand identity',colors:'Brand colors',menuColorCustom:'Navigation colors',tiers:'Membership tiers',member:'Member details',vouchers:'Rewards',offers:'Promotions',badges:'Badges',clubs:'Communities',earnMore:'Earning activities',benefits:'Benefits',profileTasks:'Profile tasks',upsell:'Membership feature',navLinks:'Navigation',footerLinks:'Footer',cinematic:'Cinematic wording and card',locale:'Number and date language',displayLabels:'Portal labels',outputTemplate:'Portal layout',tierProgress:'Tier progress',programEvidence:'Program source evidence',programEnabled:'Program behavior',programReview:'Program editor'};
  const unsafeReviewKey=key=>['__proto__','prototype','constructor'].includes(String(key));
  const reviewRootKeys=new Set(['brand','colors','menuColorCustom','tiers','tierProgress','member','sections','vouchers','offers','badges','clubs','earnMore','benefits','profileTasks','upsell','navLinks','footerLinks','programEvidence','locale','displayLabels','program','programReview','programEnabled','outputTemplate','cinematic']);
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const optionalClone=value=>value===undefined?undefined:clone(value);
  function reviewValue(value,key='') {
    if(value===undefined)return '(not present)';
    if(/(?:ImageData|imageData|logoData|avatarData)$/.test(key) && value)return 'Uploaded or generated image';
    return (typeof value==='string'?value:JSON.stringify(value,(field,item)=>/(?:ImageData|imageData|logoData|avatarData)$/.test(field)&&item?'[Image]':item,2));
  }
  function reviewOperation(path,before,after) {return {path,before:optionalClone(before),after:optionalClone(after),remove:after===undefined};}
  function presentationEdits(before,after,path,result=[]) {
    if(same(before,after))return result;
    if(Array.isArray(before)&&Array.isArray(after)&&before.length===after.length&&before.length&&before.every((item,i)=>item?.id&&item.id===after[i]?.id)) {
      after.forEach((item,i)=>presentationEdits(before[i],item,[...path,i],result));
    } else if(before&&after&&typeof before==='object'&&typeof after==='object'&&!Array.isArray(before)&&!Array.isArray(after)) {
      for(const key of new Set([...Object.keys(before),...Object.keys(after)])) if(!unsafeReviewKey(key)&&!['id','assetId','coverAssetId','programRewardId','programRuleId'].includes(key))presentationEdits(before[key],after[key],[...path,key],result);
    } else result.push(reviewOperation(path,before,after));
    return result;
  }
  function policyProjection(portal) {
    if(!portal)return null;
    return {program:portal.program,enabled:portal.programEnabled,member:portal.member,tiers:portal.tiers,locale:portal.locale,
      vouchers:(portal.vouchers||[]).map(item=>[item.programRewardId,item.title,item.actionType,item.actionValue]),
      earnMore:(portal.earnMore||[]).map(item=>[item.programRuleId,item.title,item.hasCodeInput])};
  }
  function prepareSelection(proposal) {
    if(proposal.groups)return;
    proposal.baselines={};proposal.groups=[];proposal.selection=new Set();let id=0;
    const add=(mode,key,label,operations,{atomic=false,note=''}={})=>{
      if(!operations.length)return;
      const group={id:`review-group-${++id}`,mode,key,label,atomic,note,units:operations.map(operation=>({id:`review-change-${++id}`,operations:Array.isArray(operation)?operation:[operation]}))};
      group.units.forEach(unit=>proposal.selection.add(unit.id));proposal.groups.push(group);
    };
    for(const [mode,next]of Object.entries(proposal.generated)) {
      const before=root.LPGVariants.get(mode);proposal.baselines[mode]=optionalClone(before);
      if(!before) {add(mode,'new',`New ${mode.toUpperCase()} portal`,[[reviewOperation([],undefined,next)]],{atomic:true,note:'This creates a separate audience portal. Its rules, member details and content apply together.'});continue;}
      const grouped=new Set(['programReview']);
      if(!same(policyProjection(before),policyProjection(next))) {
        const keys=['program','programEnabled','programReview','programEvidence','brand','member','tiers','tierProgress','locale','vouchers','earnMore'];
        const operations=keys.filter(key=>!same(before[key],next[key])).map(key=>reviewOperation([key],before[key],next[key]));
        for(const key of ['vouchers','earnMore'])if(!same(before.sections?.[key],next.sections?.[key]))operations.push(reviewOperation(['sections',key],before.sections?.[key],next.sections?.[key]));
        add(mode,'program','Program rules, member details, brand identity, rewards and earning activities',[operations],{atomic:true,note:'Program rules, brand identity and rewards apply together so program names, tier names, balances, prices and earning activities stay consistent. You can keep this whole group or decline it.'});
        keys.forEach(key=>grouped.add(key));
      }
      for(const key of new Set([...Object.keys(before),...Object.keys(next)])) {
        if(!reviewRootKeys.has(key)||key==='sections'||grouped.has(key))continue;
        const operations=key==='programEvidence'&&!same(before[key],next[key])?[reviewOperation([key],before[key],next[key])]:presentationEdits(before[key],next[key],[key]);
        if(!same(before.sections?.[key],next.sections?.[key]))operations.push(reviewOperation(['sections',key],before.sections?.[key],next.sections?.[key]));
        add(mode,key,reviewNames[key]||key,operations);
      }
      const otherFlags=new Set([...Object.keys(before.sections||{}),...Object.keys(next.sections||{})]);
      for(const key of otherFlags)if(!unsafeReviewKey(key)&&!Object.hasOwn(before,key)&&!Object.hasOwn(next,key)&&!same(before.sections?.[key],next.sections?.[key]))add(mode,`visibility-${key}`,`${reviewNames[key]||key} visibility`,[reviewOperation(['sections',key],before.sections?.[key],next.sections?.[key])]);
    }
  }
  function applyOperation(portal,operation) {
    if(operation.path.some(unsafeReviewKey)||operation.path.length&&!reviewRootKeys.has(operation.path[0]))return portal;
    if(!operation.path.length)return optionalClone(operation.after);
    let owner=portal;
    for(const key of operation.path.slice(0,-1)) {if(!owner[key]||typeof owner[key]!=='object')owner[key]={};owner=owner[key];}
    const key=operation.path.at(-1);if(operation.remove)delete owner[key];else owner[key]=optionalClone(operation.after);
    return portal;
  }
  function selectedGeneration(proposal) {
    const generated={},imageSelection={};
    for(const [mode,next]of Object.entries(proposal.generated)) {
      let portal=optionalClone(proposal.baselines[mode]),selected=false;
      const mask={collections:{},single:[],declinedRoles:[]};
      const allow=(key,operation)=>{
        if(root.LPGContentContract.collections.includes(key)) {
          const index=operation?.path?.[1],item=typeof index==='number'?next[key]?.[index]:null;
          if(!item)mask.collections[key]='all';
          else if(mask.collections[key]!=='all'){mask.collections[key]=mask.collections[key]||[];if(!mask.collections[key].includes(item.id))mask.collections[key].push(item.id);}
        } else if(['brand','upsell'].includes(key)||key==='cinematic'&&(!operation||operation.path[1]==='card')) {if(!mask.single.includes(key))mask.single.push(key);}
      };
      for(const group of proposal.groups.filter(group=>group.mode===mode))for(const unit of group.units)if(proposal.selection.has(unit.id)) {
        selected=true;
        for(const operation of unit.operations)portal=applyOperation(portal||{},operation);
        if(group.key==='new') {for(const key of root.LPGContentContract.collections)allow(key);['brand','upsell','cinematic'].forEach(key=>allow(key));}
        else if(group.key==='program') {['vouchers','earnMore','brand'].forEach(key=>allow(key));}
        else for(const operation of unit.operations)allow(operation.path[0],operation);
      }
      // Explicitly declining an image edit also declines automatic replacement
      // of that image role, even when another field on its card is accepted.
      for(const group of proposal.groups.filter(group=>group.mode===mode))for(const unit of group.units)if(!proposal.selection.has(unit.id))for(const operation of unit.operations){
        const path=operation.path,field=path.at(-1);let role=null,id=null,section=path[0];
        if(root.LPGContentContract.collections.includes(section)&&typeof path[1]==='number'){
          id=next[section]?.[path[1]]?.id;
          if(['imageData','imageUrl'].includes(field))role='image';else if(['coverImageData','coverImageUrl'].includes(field))role='cover';
        }else if(section==='upsell'&&['bgImageData','bgImageUrl'].includes(field))role='background';
        else if(section==='brand'&&['logoData','logoUrl'].includes(field))role='logo';
        else if(section==='cinematic'&&path[1]==='card'){
          if(['markImageData','markImageUrl'].includes(field))role='mark';else if(['artworkImageData','artworkImageUrl'].includes(field))role='artwork';
        }
        if(role&&!mask.declinedRoles.some(item=>item.section===section&&item.id===id&&item.role===role))mask.declinedRoles.push({section,id,role});
      }
      if(selected){generated[mode]=portal;imageSelection[mode]=mask;}
    }
    return {...proposal,generated,imageSelection};
  }
  function unitLabel(unit,group,proposal) {
    if(group.atomic)return group.label;
    const path=unit.operations[0].path, key=path.at(-1), names={title:'Heading',name:'Name',description:'Description',cta:'Action label',tagline:'Tagline',subtitle:'Intro line',imageUrl:'Image URL',imageData:'Image',bgImageUrl:'Background image URL',bgImageData:'Background image',logoUrl:'Logo URL',logoData:'Logo',price:'Price',period:'Period',links:'Links'};
    const item=typeof path[1]==='number'?proposal.generated[group.mode][path[0]]?.[path[1]]:null;
    return `${item?.title||item?.name||item?.description||''}${item?' · ':''}${names[key]||key}`;
  }
  function updateSelectionUI() {
    const proposal=pendingGeneration;if(!proposal)return;
    const total=proposal.groups.reduce((sum,group)=>sum+group.units.length,0),count=proposal.selection.size;
    const status=el('generation-selection-count');if(status)status.textContent=`${count} of ${total} proposed changes selected`;
    const apply=el('generation-accept');if(apply)apply.disabled=!count;
    for(const group of proposal.groups) {
      const input=el(group.id),selected=group.units.filter(unit=>proposal.selection.has(unit.id)).length;
      if(input){input.checked=selected===group.units.length;input.indeterminate=selected>0&&selected<group.units.length;}
      for(const unit of group.units){const field=el(unit.id);if(field)field.checked=proposal.selection.has(unit.id);}
    }
    const result=selectedGeneration(proposal),preview=el('generation-review-preview');
    const portal=result.generated[proposal.selected]||proposal.baselines[proposal.selected]||Object.values(result.generated)[0];
    if(preview&&portal&&typeof generatePortalHTML==='function')preview.srcdoc=generatePortalHTML(portal);
  }
  function renderGenerationReview() {
    let box=el('generation-review');
    if(!box&&el('program-review')) {box=document.createElement('section');box.id='generation-review';box.className='generation-review-panel program-edit-card';box.setAttribute('aria-label','Review proposed AI update');el('program-review').insertAdjacentElement('beforebegin',box);}
    if(!box)return;box.hidden=!pendingGeneration;if(!pendingGeneration){box.replaceChildren();return;}
    box.removeAttribute('aria-live');const proposal=pendingGeneration;prepareSelection(proposal);
    box.innerHTML=`<h3>Choose the changes to apply</h3><p>Your current portal is unchanged. Keep the changes you want and uncheck the rest. You can also review individual text fields when the list of items stays the same.</p><div class="generation-review-selection-tools"><button type="button" id="generation-select-all">Select all</button><button type="button" id="generation-select-none">Select none</button><p id="generation-selection-count" role="status" aria-live="polite"></p></div>`+Object.keys(proposal.generated).map(mode=>{
      const evidence=proposal.generated[mode].programEvidence;
      return `<section class="generation-review-audience" aria-label="${safe(mode.toUpperCase())} proposed changes"><h4>${safe(mode.toUpperCase())}</h4>`+proposal.groups.filter(group=>group.mode===mode).map(group=>`<fieldset class="generation-review-group"><legend><label class="generation-review-section-label"><input type="checkbox" id="${group.id}" data-review-group="${group.id}" checked> ${safe(group.label)}</label></legend>${group.note?`<p class="generation-review-group-note">${safe(group.note)}</p>`:''}<details class="generation-review-details"><summary>${group.atomic?'Review changes in this group':'Choose individual changes'}</summary><ul class="generation-review-changes">${group.units.map(unit=>`<li class="generation-review-change">${group.atomic?`<strong>${safe(group.label)}</strong>`:`<label class="generation-review-field-label"><input type="checkbox" id="${unit.id}" data-review-unit="${unit.id}" checked> ${safe(unitLabel(unit,group,proposal))}</label>`}${unit.operations.map(operation=>`<div class="generation-review-comparison"><span class="generation-review-path">${safe(operation.path.join('.')||'New portal')}</span><div class="generation-review-before"><strong>Before</strong><pre tabindex="0" aria-label="Before value">${safe(reviewValue(operation.before,String(operation.path.at(-1))))}</pre></div><div class="generation-review-after"><strong>Proposed</strong><pre tabindex="0" aria-label="Proposed value">${safe(reviewValue(operation.after,String(operation.path.at(-1))))}</pre></div></div>`).join('')}</li>`).join('')}</ul></details></fieldset>`).join('')+(evidence?`<details class="generation-review-evidence"><summary>Review program facts and source evidence</summary><p>${evidence.summary.quoted} source-quoted · ${evidence.summary.illustrative} illustrative · ${evidence.summary.unresolved} unresolved facts. Quotes and values are checked against supplied pages; review whether they establish the intended policy.</p><ul>${evidence.records.map(record=>`<li><strong>${safe(record.path)}</strong>: ${safe(record.value===null?'Not specified':record.value)} <strong>(${safe(record.status)})</strong>${record.quote?`<blockquote>${safe(record.quote)}</blockquote><small>${safe(record.source)} · page ${record.page}</small>`:''}<p>${safe(record.reason)}</p></li>`).join('')}</ul></details>`:'')+'</section>';
    }).join('')+`<details class="generation-review-preview"><summary>Preview selected changes</summary><iframe id="generation-review-preview" title="Portal preview with selected changes" sandbox="allow-scripts" style="width:100%;height:520px;border:1px solid #ccd4e0"></iframe></details><div class="generation-review-actions"><button type="button" id="generation-accept" class="btn-primary-sf">Apply selected changes</button><button type="button" id="generation-discard" class="btn-secondary-sf">Discard proposal</button></div><p id="generation-review-error" role="status"></p>`;
    box.onchange=event=>{
      const groupId=event.target.dataset.reviewGroup,unitId=event.target.dataset.reviewUnit;
      if(groupId){const group=proposal.groups.find(item=>item.id===groupId);group?.units.forEach(unit=>event.target.checked?proposal.selection.add(unit.id):proposal.selection.delete(unit.id));}
      else if(unitId&&proposal.groups.some(group=>group.units.some(unit=>unit.id===unitId)))event.target.checked?proposal.selection.add(unitId):proposal.selection.delete(unitId);
      else return;
      updateSelectionUI();
    };
    el('generation-select-all').addEventListener('click',()=>{proposal.groups.forEach(group=>group.units.forEach(unit=>proposal.selection.add(unit.id)));updateSelectionUI();});
    el('generation-select-none').addEventListener('click',()=>{proposal.selection.clear();updateSelectionUI();});
    el('generation-accept').addEventListener('click',acceptGeneration);el('generation-discard').addEventListener('click',()=>cancelGeneration({discard:true}));updateSelectionUI();
  }
  async function acceptGeneration() {
    const proposal=pendingGeneration;if(!proposal||!proposal.selection?.size)return;
    if(proposal.sequence!==generationSequence||proposal.project!==projectEpoch||proposal.before!==fingerprint()){el('generation-review-error').textContent='The editor changed after this proposal. Your edits were kept. Generate again to review an up-to-date proposal.';return;}
    const selected=selectedGeneration(proposal);
    for(const [mode,portal]of Object.entries(selected.generated))if(portal.program){const validated=LPGProgram.validate(portal.program);if(!validated.valid||portal.program.mode!==mode){el('generation-review-error').textContent='These selections would create inconsistent program details. Keep the program group together or generate a new proposal.';return;}}
    // Preserve the active audience when only the other audience was accepted.
    if(!selected.generated[selected.selected]&&root.LPGVariants.get(state.activeVariant)){selected.generated[state.activeVariant]=root.LPGVariants.get(state.activeVariant);selected.selected=state.activeVariant;}
    pendingGeneration=null;renderGenerationReview();commitGeneration(selected);await enrichGeneration(selected);
  }
  function fingerprint() {
    const copy = clone(state); delete copy.programReview;
    const text = JSON.stringify({ portal: copy, website: el('quickstart-url')?.value || '', refinement:refinementOptions() });
    // Compact, non-security edit fingerprint; never duplicate source documents
    // and uploaded image data in the persisted pending proposal.
    let a = 2166136261, b = 5381;
    for (let i = 0; i < text.length; i++) { a = Math.imul(a ^ text.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ text.charCodeAt(i); }
    return `${text.length}:${a >>> 0}:${b >>> 0}`;
  }
  function defaults() { return { mode: 'b2c', objective: '', text: '', roles: '', sources: [] }; }
  function sync() {
    state.brief = { ...defaults(), ...state.brief };
    for (const field of ['mode', 'objective', 'text', 'roles']) if (el('brief-' + field)) el('brief-' + field).value = state.brief[field];
    if (el('output-template')) el('output-template').value = state.outputTemplate || 'classic';
    syncExperience();
    root.LPGVariants?.render();
    renderSources(); renderReview(); renderRecovery();
    if (state.program && root.LPGContentContract) renderImageControls();
  }
  function syncExperience() {
    if (el('program-mode-note')) el('program-mode-note').textContent = state.program
      ? 'Your portal includes branded content and demo interactions. Fine-tune any section, or open program details to adjust points, rewards and assumptions.'
      : 'Generate a complete branded portal, then explore layouts without regenerating content.';
  }
  function changed() {
    state.brief = state.brief || defaults();
    for (const field of ['mode', 'objective', 'text', 'roles']) state.brief[field] = el('brief-' + field).value;
    scheduleDraftRecovery();
  }
  function renderSources() {
    const list = el('brief-sources'); if (!list) return;
    list.innerHTML = (state.brief?.sources || []).map((source, i) => `<li><span>${safe(source.name)} · ${source.pages.length} page(s)</span> <button type="button" data-remove-source="${i}" aria-label="Remove ${safe(source.name)}">Remove</button>${source.warning ? `<p class="program-warning">${safe(source.warning)}</p>` : ''}</li>`).join('');
  }
  async function attach(event) {
    const sequence = ++importSequence, project = typeof projectEpoch === 'number' ? projectEpoch : 0;
    const files = Array.from(event.target.files || []), existing = clone(state.brief.sources || []);
    const sourceSignature = JSON.stringify(existing);
    el('brief-import-status').textContent = '';
    importing = true;
    try {
      if (existing.length + files.length > 3) throw new Error('Attach up to three documents. Remove an existing document first.');
      const added = [];
      for (const file of files) added.push(await LPGRequirements.extractFile(file, text => { if (sequence === importSequence) el('brief-import-status').textContent = text; }));
      if (sequence !== importSequence || project !== projectEpoch || JSON.stringify(state.brief.sources) !== sourceSignature) return;
      LPGRequirements.sourcesText(existing.concat(added));
      state.brief.sources = existing.concat(added);
      renderSources(); scheduleDraftRecovery();
      el('brief-import-status').textContent = 'Documents ready. Review with AI to interpret their requirements.';
    } catch (error) { if (sequence === importSequence) el('brief-import-status').textContent = error.message; }
    finally { if (sequence === importSequence) importing = false; event.target.value = ''; }
  }
  function sourceEdited(event) {
    const button = event.target.closest('[data-remove-source]'); if (!button) return;
    importSequence++; importing = false; state.brief.sources.splice(Number(button.dataset.removeSource), 1); renderSources(); scheduleDraftRecovery();
  }
  function wantsProgram() {
    return !!(state.programEnabled || state.brief?.text?.trim() || state.brief?.objective?.trim() || state.brief?.roles?.trim() || state.brief?.sources?.length || ['b2b', 'both'].includes(state.brief?.mode));
  }
  async function analyze(client,rawURL,options={}) {
    generationClient=client;
    try { return await performAnalyze(client,rawURL,options); }
    finally { renderRecovery(); }
  }
  function programFailureSummary(error) {
    if (error.code === 'incomplete_program') return 'The AI response was incomplete or malformed.';
    const details = Array.isArray(error.details) ? error.details.join(' ') : '';
    if (/monthlyCap.*qualifying|monthlyCap limits qualifying/.test(details)) return 'An activity’s monthly cap conflicts with its qualifying points.';
    if (/member\.role|roles.*approv|approvalRequired/.test(details)) return 'The proposed member roles and approval rules were inconsistent.';
    if (/tiers\[|tiers\./.test(details)) return 'The proposed tier requirements were inconsistent.';
    if (/rewards.*cost/.test(details)) return 'A proposed reward had an invalid points cost.';
    if (/required|expected an object|expected a list/.test(details)) return 'The AI left out a required program detail.';
    return 'Some proposed program rules were inconsistent.';
  }
  async function performAnalyze(client, rawURL, {resumeUnknown=false}={}) {
    if (importing) throw new Error('Please wait for the requirements documents to finish reading.');
    changed();
    const recoveryCheckpoint=resumeUnknown?readCheckpoint():null;
    generationAbort?.abort(); pendingGeneration=null; renderGenerationReview();
    generationAbort = typeof AbortController === 'function' ? new AbortController() : null;
    const signal = generationAbort?.signal;
    const refinement = refinementOptions();
    const sequence = ++generationSequence, before = fingerprint(), project = projectEpoch;
    if (root.LPGContentContract && !resumeUnknown) writeCheckpoint({stage:'text',before,rawURL});
    const brief = clone(state.brief);
    const checkCurrent = () => {
      if (sequence !== generationSequence || project !== projectEpoch || before !== fingerprint()) {
        throw new Error('The editor changed while AI was working. Your edits were kept; generate again when ready.');
      }
    };
    let website = null;
    setQuickStartStatus('Reading the customer website and requirements…', true);
    if (rawURL) {
      const url = PageHost._analysis.normalizeURL(rawURL);
      if (!url) throw new Error('Enter a valid website URL or leave it blank.');
      try {
        const html = await (client === root.PageHost ? client.proxyFetch(url) : client.scrapeViaCorsProxy(url));
        website = PageHost._analysis.extractCoreHTML(html, url);
      } catch (_) { website = { url, note: 'Website could not be read. Brand knowledge is a demo assumption, not verified website evidence.' }; }
    }
    checkCurrent();
    if (root.LPGContentContract) {
      const serialized=JSON.stringify(website);let sourceHash=2166136261;
      for(let i=0;i<serialized.length;i++)sourceHash=Math.imul(sourceHash^serialized.charCodeAt(i),16777619);
      const websiteSignature=`${serialized.length}:${sourceHash>>>0}`;
      if(recoveryCheckpoint?.websiteSignature && recoveryCheckpoint.websiteSignature!==websiteSignature) throw new Error('The website source changed since this request. Recovery was stopped before another AI request; your portal was kept. Start a new generation to use the updated website.');
      writeCheckpoint({stage:'text',before,rawURL,websiteSignature});
    }
    const modes = brief.mode === 'both' ? ['b2c', 'b2b'] : [brief.mode];
    const generated = {}, warnings = [];
    for (const mode of modes) {
      const audienceBrief = { ...brief, mode };
      const existing = root.LPGVariants.get(mode);
      const current = existing?.program ? clone(existing.program) : null;
      const cinematic = clone(existing?.cinematic || state.cinematic || {});
      const outputTemplate = mode === state.activeVariant ? state.outputTemplate || 'classic' : existing?.outputTemplate || state.outputTemplate || 'classic';
      setQuickStartStatus(`Designing the ${mode.toUpperCase()} loyalty experience…`, true);
      const prompt = LPGRequirements.buildPrompt(audienceBrief, website, current, { outputTemplate, locale:existing?.locale || state.locale || 'en-US' });
      const scoped = !!(refinement && current);
      let result = scoped ? null : await client.callLLM({ signal, resumeUnknown, system: LPGRequirements.SYSTEM, prompt, maxTokens: 12000, tier: 'balanced', responseFormat: 'json', responseContract: 'loyalty-program-v2', responseAudience: mode });
      checkCurrent();
      let proposal;
      try { proposal = scoped ? {program:current,evidence:[]} : LPGRequirements.parseResponse(result, LPGProgram, mode); }
      catch (error) {
        if (!['invalid_program', 'incomplete_program'].includes(error.code)) throw error;
        setQuickStartStatus(error.code === 'incomplete_program' ? 'AI is completing the program response. Your requirements are retained…' : 'AI is correcting a program detail…', true);
        result = await client.callLLM({ signal, resumeUnknown, system: LPGRequirements.SYSTEM,
          prompt: LPGRequirements.repairPrompt(prompt, error), maxTokens: 16000, tier: 'balanced', responseFormat: 'json', responseContract: 'loyalty-program-v2', responseAudience: mode });
        checkCurrent();
        try { proposal = LPGRequirements.parseResponse(result, LPGProgram, mode); }
        catch (retryError) {
          if (['invalid_program', 'incomplete_program'].includes(retryError.code)) retryError.message = 'AI could not finish a valid program after an automatic retry. ' + programFailureSummary(retryError) + ' Your portal and requirements documents were kept.';
          throw retryError;
        }
      }
      setQuickStartStatus(`Creating ${mode.toUpperCase()} offers, rewards and branded imagery…`, true);
      const content = await root.LPGPortalContent.generate({ client, brief: audienceBrief, program: proposal.program,
        website, rawURL, outputTemplate, cinematic, existing: current ? existing : null,
        deferImages: !!root.LPGContentContract, signal, resumeUnknown, refinement: scoped ? refinement : null,
        onStatus: phase => { checkCurrent(); setQuickStartStatus(phase === 'generating_images' ? `Creating ${mode.toUpperCase()} portal imagery…` : `Personalizing ${mode.toUpperCase()} portal content…`, true); } });
      checkCurrent();
      if (content._meta?.content_warning) warnings.push(`${mode.toUpperCase()}: ${content._meta.content_warning}`);
      if (content._meta?.image_warning || content._meta?.image_error) warnings.push(`${mode.toUpperCase()}: ${content._meta.image_warning || 'Some images could not be generated. You can add images or generate again.'}`);
      const portal = existing ? clone(existing) : root.LPGVariants.snapshot();
      applyAnalysis(content, portal, { render: false });
      portal.program = proposal.program; portal.locale = proposal.program.locale;
      if (root.LPGProvenance) portal.programEvidence = scoped && existing?.programEvidence ? clone(existing.programEvidence) : root.LPGProvenance.audit(proposal.program,proposal.evidence,{brief:audienceBrief,website});
      portal.programEnabled = true; portal.programReview = null;
      portal.brand.name = proposal.program.providerName || content.brandName;
      portal.brand.programName = proposal.program.name;
      portal.member.name = mode === 'b2b' ? proposal.program.member.organization : proposal.program.member.name;
      portal.member.points = proposal.program.opening.redeemable;
      portal.tiers = proposal.program.tiers.map(tier => ({ name: tier.name, points: tier.threshold }));
      portal.outputTemplate = outputTemplate;
      if (scoped && root.LPGContentContract) {
        const selected=new Set(refinement.sections);
        for (const key of root.LPGContentContract.sections) {
          if (!selected.has(key)) {if(Object.hasOwn(existing,key))portal[key]=clone(existing[key]);else delete portal[key];}
          else if (Object.hasOwn(content,key)) portal[key]=root.LPGContentContract.restoreUnchanged(existing[key],content[key],portal[key]);
        }
        for (const key of ['brand','colors','menuColorCustom','member','tiers','tierProgress','program','programEvidence','locale','displayLabels']) if(Object.hasOwn(existing,key))portal[key]=clone(existing[key]);
      }
      generated[mode] = portal;
    }
    checkCurrent();
    if (root.LPGContentContract) {
      const proposal = {generated,warnings,before,project,sequence,signal,resumeUnknown,maxImages:el('ai-image-budget') ? Number(el('ai-image-budget').value) : 16,selected:brief.mode === 'both' ? state.activeVariant : brief.mode,
        diffs:Object.fromEntries(Object.entries(generated).map(([mode,portal])=>[mode,root.LPGContentContract.diff(root.LPGVariants.get(mode),portal)]))};
      pendingGeneration=proposal; renderGenerationReview();
      setQuickStartStatus('Your text proposal is ready. Review the rules and changes, then accept to fill images. Your current portal was kept.',false);
      el('generation-review')?.scrollIntoView({block:'nearest',behavior:'smooth'});
      return {pending:true};
    }
    root.LPGVariants.replace(generated, brief.mode === 'both' ? state.activeVariant : brief.mode);
    populateFormFromState(); renderDynamicSections(); renderPaletteButtons(); schedulePreview();
    if (el('portal-edit-status')) el('portal-edit-status').textContent = warnings.join(' ');
    setQuickStartStatus(modes.length === 2 ? 'Both portals are ready. Switch between B2C and B2B, choose a layout, and save your project.' : 'Your branded portal is ready. Refine any section, choose a layout, and save your project.', false);
  }

  function sample() {
    generationSequence++;
    changed();
    const mode = state.brief.mode === 'both' ? state.activeVariant : state.brief.mode;
    const program = LPGProgram.normalize({ mode, providerName: state.brand.name || 'Demo Provider', name: state.brand.programName || 'Loyalty Program', approvalRequired: mode === 'b2b', opening: { qualifying: 1000, redeemable: 500 },
      assumptions: ['This is an editable demonstration sample, not an interpretation of the attached requirements.', 'Opening balances are fictional demo values.'] });
    const portal = root.LPGVariants.snapshot();
    portal.program = program; portal.programEnabled = true; portal.programReview = null;
    root.LPGVariants.replace({ [mode]: portal }, mode);
    state.programReview = { program, brand: {}, snapshot: fingerprint() };
    renderReview(); updateProgram(); root.LPGVariants.render();
  }
  function editProgram() {
    if (!state.program) return sample();
    generationSequence++;
    state.programReview = { program: clone(state.program), brand: {}, snapshot: fingerprint(), live: true };
    renderReview(); scheduleDraftRecovery();
  }
  function input(label, path, value, type = 'text', extra = '') {
    return `<label class="program-field">${safe(label)}<input type="${type}" data-program-path="${path}" value="${safe(value)}" ${type === 'number' ? 'min="0" step="any"' : 'maxlength="160"'} ${extra}></label>`;
  }
  function check(label, path, value) {
    return `<label class="program-check"><input type="checkbox" data-program-path="${path}" ${value ? 'checked' : ''}> ${safe(label)}</label>`;
  }
  function select(label, path, value, options) {
    return `<label class="program-field">${safe(label)}<select data-program-path="${safe(path)}">${options.map(([key,name])=>`<option value="${safe(key)}" ${key===value?'selected':''}>${safe(name)}</option>`).join('')}</select></label>`;
  }
  function renderReview() {
    const box = el('program-review'); if (!box) return;
    const review = state.programReview; box.hidden = !review;
    if (!review) return;
    const p = review.program;
    p.capabilities = p.capabilities || {presentationOnly:false,tiers:true}; p.qualification = p.qualification || {basis:'points',period:'lifetime',description:''}; p.metrics = p.metrics || [];
    el('program-review-fields').innerHTML = `${Object.keys(review.brand).some(key => ['primary', 'accent'].includes(key)) ? `<h4>Brand colors</h4><p class="program-help">Changes update the preview immediately. You can also refine them in Colors & Theme.</p><div class="program-grid">${['primary', 'accent'].filter(key => review.brand[key]).map(key => `<label class="program-field">${key === 'primary' ? 'Primary' : 'Accent'}<input type="color" data-review-brand="${key}" value="${safe(review.brand[key])}"></label>`).join('')}</div>` : ''}<div class="program-grid">
      ${select('Program behavior','capabilities.presentationOnly',String(p.capabilities.presentationOnly),[['false','Points demo with simulated redemption'],['true','Presentation only — describe eligibility without simulating rules']])}
      ${check('This program has membership tiers','capabilities.tiers',p.capabilities.tiers)}
      ${input('Number and date locale','locale',p.locale || 'en-US')}
      ${select('Qualification measure','qualification.basis',p.qualification.basis,[['points','Points'],['spend','Eligible spending'],['nights','Nights'],['segments','Segments'],['activities','Activities'],['other','Other / multiple measures']])}
      ${select('Qualification period','qualification.period',p.qualification.period,[['lifetime','Lifetime'],['calendar-year','Calendar year'],['rolling-year','Rolling year'],['custom','Custom period']])}
      <label class="program-field">Eligibility explanation<textarea rows="3" maxlength="2000" data-program-path="qualification.description">${safe(p.qualification.description)}</textarea></label>
      ${input('Member status label','member.status',p.member.status || '')}
      ${input('Program name', 'name', p.name)}${input('Program provider', 'providerName', p.providerName)}
      ${p.mode === 'b2b' ? input('Member company', 'member.organization', p.member.organization) + input('Account contact', 'member.name', p.member.name) : input('Member name', 'member.name', p.member.name)}
      ${input('Qualifying points name', 'currencies.qualifyingName', p.currencies.qualifyingName)}${input('Redeemable points name', 'currencies.redeemableName', p.currencies.redeemableName)}
      ${input('Opening qualifying points', 'opening.qualifying', p.opening.qualifying, 'number')}${input('Opening redeemable points', 'opening.redeemable', p.opening.redeemable, 'number')}
      ${p.capabilities.presentationOnly ? '<p class="program-help">Eligibility is described using the text above. This mode does not simulate point transactions or redemption.</p>' : input('Redeemable points per currency unit', 'currencies.pointsPerUnit', p.currencies.pointsPerUnit, 'number') + input('Monthly qualifying cap for fixed activities (blank = none)', 'freeContentMonthlyCap', p.freeContentMonthlyCap ?? '', 'number')}
    </div>
    <div ${p.capabilities.tiers ? '' : 'hidden'}><h4>Tiers</h4>${p.tiers.map((t, i) => `<div class="program-row">${input('Name', `tiers.${i}.name`, t.name)}${input(p.capabilities.presentationOnly ? 'Qualifying threshold (blank = not specified)' : 'Qualifying threshold', `tiers.${i}.threshold`, t.threshold, 'number')}${input('Spend RP multiplier', `tiers.${i}.multiplier`, t.multiplier, 'number')}<button type="button" data-remove-program="tiers:${i}" aria-label="Remove tier ${safe(t.name)}">Remove</button></div>`).join('')}
    <button type="button" data-add-program="tiers">Add tier</button></div>
    <div ${p.capabilities.presentationOnly ? 'hidden' : ''}><h4>Earning activities</h4>${p.earnRules.map((r, i) => `<fieldset class="program-edit-card"><legend>${safe(r.kind === 'spend' ? 'Eligible spend' : 'Fixed activity')}</legend><div class="program-grid">${input('Activity name', `earnRules.${i}.name`, r.name)}${r.kind === 'spend' ? input('TP per unit spent', `earnRules.${i}.qualifyingRate`, r.qualifyingRate, 'number') + input('Base RP per unit spent', `earnRules.${i}.redeemableRate`, r.redeemableRate, 'number') : input('TP award', `earnRules.${i}.qualifyingPoints`, r.qualifyingPoints, 'number') + input('RP award', `earnRules.${i}.redeemablePoints`, r.redeemablePoints, 'number')}${input('Monthly TP cap (blank = none)', `earnRules.${i}.monthlyCap`, r.monthlyCap ?? '', 'number')}</div><button type="button" data-remove-program="earnRules:${i}">Remove activity</button></fieldset>`).join('')}
    <button type="button" data-add-program="spend">Add spend activity</button> <button type="button" data-add-program="fixed">Add fixed activity</button></div>
    <h4>Rewards</h4>${p.rewards.map((r, i) => `<div class="program-row">${input('Reward name', `rewards.${i}.name`, r.name)}${input(p.capabilities.presentationOnly ? 'Reward points cost (blank = not specified)' : 'Redeemable points cost', `rewards.${i}.cost`, r.cost, 'number')}<button type="button" data-remove-program="rewards:${i}">Remove reward</button></div>`).join('')}<button type="button" data-add-program="rewards">Add reward</button>
    <h4>Additional member metrics</h4><p class="program-help">Display measures such as nights, flight segments, CPE hours or annual activity separately from loyalty currencies.</p>${p.metrics.map((metric,i)=>`<fieldset class="program-edit-card"><legend>${safe(metric.name || 'Member metric')}</legend><div class="program-grid">${input('Metric name',`metrics.${i}.name`,metric.name)}${input('Value',`metrics.${i}.value`,metric.value,'number')}${input('Unit (plural)',`metrics.${i}.unit`,metric.unit)}${input('Unit (singular)',`metrics.${i}.singularUnit`,metric.singularUnit)}${input('Period',`metrics.${i}.period`,metric.period)}</div><button type="button" data-remove-program="metrics:${i}">Remove metric</button></fieldset>`).join('')}<button type="button" data-add-program="metrics">Add member metric</button>
    <h4>People and roles</h4>${p.mode === 'b2b' ? check('Redemptions require approval', 'approvalRequired', p.approvalRequired) : ''}
    ${p.roles.map((r, i) => `<div class="program-row">${input('Role name', `roles.${i}.name`, r.name)}${check('Can request / redeem', `roles.${i}.canRequest`, r.canRequest)}${p.mode === 'b2b' ? check('Can approve', `roles.${i}.canApprove`, r.canApprove) : ''}<button type="button" data-remove-program="roles:${i}">Remove role</button></div>`).join('')}<button type="button" data-add-program="roles">Add custom role</button>
    <label class="program-field">Starting demo role<select data-program-path="member.role">${p.roles.map(r => `<option value="${safe(r.id)}" ${r.id === p.member.role ? 'selected' : ''}>${safe(r.name)}</option>`).join('')}</select></label>
    <h4>Assumptions and open decisions</h4><p class="program-help">These remain author notes and are excluded from the exported portal. Edit the rules above to resolve them.</p><label class="program-field">Notes (one per line)<textarea data-program-path="assumptions" rows="5" maxlength="30000">${safe(p.assumptions.join('\n'))}</textarea></label>
    ${state.programEvidence?.records?.length ? `<details><summary>Source evidence for program facts</summary><p class="program-help">Source-quoted means the quote and value occur on the supplied page. Confirm that the text establishes the intended rule. Illustrative and unresolved values are not verified company policy.</p><ul>${state.programEvidence.records.map(record=>`<li><strong>${safe(record.path)}</strong>: ${safe(record.value)} (${safe(record.status)})${record.quote?`<blockquote>${safe(record.quote)}</blockquote><small>${safe(record.source)} · page ${record.page}</small>`:''}</li>`).join('')}</ul></details>` : ''}
    <h4>Requirement coverage proposed by AI</h4><p class="program-help">Earning activities are promotional links and do not change points. Other interactive actions are simulated. Source references and coverage still need your review.</p>
    <ul class="program-coverage">${p.requirements.map(r => `<li><strong>${safe(r.status)}</strong> · ${safe(r.text)}<small>${safe(r.source)}${r.module ? ' · ' + safe(r.module) : ''}</small></li>`).join('') || '<li>No document-derived requirements in this sample.</li>'}</ul>
    ${p.futureFeatures.length ? `<h4>Future scope</h4><ul>${p.futureFeatures.map(t => `<li>${safe(t)}</li>`).join('')}</ul>` : ''}`;
    el('program-review-error').textContent = '';
  }
  function reviewInput(event) {
    const target = event.target, path = target.dataset.programPath;
    if (!state.programReview) return;
    generationSequence++;
    if (target.dataset.reviewBrand && /^#[0-9a-f]{6}$/i.test(target.value)) { state.programReview.brand[target.dataset.reviewBrand] = target.value; updateProgram(target.dataset.reviewBrand); return; }
    if (!path) return;
    const keys = path.split('.'); let value = state.programReview.program;
    for (const key of keys.slice(0, -1)) value = value[key];
    const last = keys[keys.length - 1];
    value[last] = path === 'capabilities.presentationOnly' ? target.value === 'true' : target.type === 'checkbox' ? target.checked : path === 'assumptions' ? target.value.split('\n').filter(Boolean) : target.type === 'number' ? (target.value === '' && (/Cap$/.test(last) || (state.programReview.program.capabilities?.presentationOnly && ['threshold','cost'].includes(last))) ? null : target.value === '' ? NaN : Number(target.value)) : target.value;
    if (path === 'qualification.basis' || path === 'qualification.period') {
      const program=state.programReview.program;
      if (program.qualification.basis !== 'points' || program.qualification.period !== 'lifetime') program.capabilities.presentationOnly=true;
    }
    updateProgram();
    if (path.startsWith('capabilities.') || ['qualification.basis','qualification.period'].includes(path)) renderReview();
  }
  function reviewClick(event) {
    const remove = event.target.closest('[data-remove-program]'), add = event.target.closest('[data-add-program]');
    if (!state.programReview || (!remove && !add)) return;
    generationSequence++;
    const p = state.programReview.program;
    if (remove) {
      const [key, index] = remove.dataset.removeProgram.split(':'); p[key].splice(Number(index), 1);
      if (key === 'roles' && !p.roles.some(r => r.id === p.member.role)) p.member.role = p.roles[0]?.id || '';
    } else {
      const kind = add.dataset.addProgram, id = 'item-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
      if (kind === 'tiers') p.tiers.push({ name: 'New tier', threshold: p.capabilities?.presentationOnly ? null : p.tiers.length ? (p.tiers.at(-1)?.threshold || 0) + 1000 : 0, multiplier: 1 });
      else if (kind === 'rewards') p.rewards.push({ id, name: 'New reward', cost: p.capabilities?.presentationOnly ? null : 100 });
      else if (kind === 'metrics') p.metrics.push({id,name:'Member activity',value:0,unit:'activities',singularUnit:'activity',period:''});
      else if (kind === 'roles') p.roles.push({ id, name: 'Custom role', canRequest: true, canApprove: false });
      else p.earnRules.push({ id, name: 'New activity', kind, qualifyingRate: kind === 'spend' ? 1 : 0, redeemableRate: kind === 'spend' ? 1 : 0, qualifyingPoints: kind === 'fixed' ? 25 : 0, redeemablePoints: 0, amount: kind === 'fixed' ? 1 : 100, monthlyCap: null });
    }
    renderReview(); updateProgram();
  }
  // Commit only valid rules so preview, saved projects and exports share one model.
  // Do not rebuild the editor here: replacing inputs would lose focus mid-typing.
  function updateProgram(brandChange = false) {
    const review = state.programReview; if (!review) return false;
    // Colors are independent of incomplete program rules and should still update live.
    if ((brandChange === true || brandChange === 'primary') && review.brand.primary) {
      state.colors.primary = review.brand.primary;
      if (!state.menuColorCustom) state.colors.menu = review.brand.primary;
    }
    if ((brandChange === true || brandChange === 'accent') && review.brand.accent) state.colors.accent = review.brand.accent;
    for (const key of ['primary', 'accent', 'menu']) {
      setVal('color-' + key, state.colors[key]); setVal('hex-' + key, state.colors[key]);
    }
    const result = LPGProgram.validate(review.program);
    scheduleDraftRecovery();
    if (!result.valid) {
      el('program-review-error').textContent = 'Preview is showing the last valid program. ' + result.errors.join('; ');
      if (brandChange) schedulePreview();
      return false;
    }
    // Only changed program identity fields should replace shared brand controls.
    // The author may have edited Brand & Identity while this editor remained open.
    if (!review.live || result.model.providerName !== state.program?.providerName) {
      state.brand.name = result.model.providerName || review.brand.name || state.brand.name;
    }
    if (!review.live || result.model.name !== state.program?.name) state.brand.programName = result.model.name;
    if (root.LPGPortalContent) {
      const mapped = root.LPGPortalContent.reconcile(state, result.model, { existing: state, allowMissing: true });
      state.vouchers = mapped.vouchers.map(cleanVoucher); state.earnMore = mapped.earnMore.map(cleanEarnMore);
    }
    if (root.LPGProvenance && state.programEvidence) state.programEvidence = root.LPGProvenance.invalidate(state.programEvidence, result.model);
    state.locale = result.model.locale; setVal('portal-locale',state.locale);
    state.program = result.model; state.programEnabled = true; state.schemaVersion = 2;
    state.activeVariant = result.model.mode;
    state.member.name = result.model.mode === 'b2b' ? result.model.member.organization : result.model.member.name; state.member.points = result.model.opening.redeemable;
    state.tiers = result.model.tiers.map(tier => ({ name: tier.name, points: tier.threshold }));
    setVal('brand-name', state.brand.name); setVal('program-name', state.brand.programName);
    setVal('member-name', state.member.name); setVal('member-points', state.member.points);
    for (let i = 0; i < 3; i++) for (const part of ['name', 'points']) {
      const input = el(`tier${i+1}-${part}`); if (!input) continue;
      input.disabled = !state.tiers[i]; input.value = state.tiers[i]?.[part] ?? '';
    }
    if (el('tier-progress')) el('tier-progress').disabled = true;
    renderVouchers(); renderEarnMore();
    review.live = true;
    el('program-review-error').textContent = '';
    syncExperience(); schedulePreview();
    return true;
  }
  function apply() {
    generationSequence++;
    if (!updateProgram(!state.programReview?.live)) return;
    state.programReview = null;
    renderReview(); scheduleDraftRecovery();
    setQuickStartStatus('Preview updated. You can save your project or export the portal.', false);
  }
  function reset() {
    root.LPGImages?.invalidate();
    generationAbort?.abort(); pendingGeneration=null; clearCheckpoint(); renderGenerationReview(); renderRecovery();
    importSequence++; generationSequence++; importing = false;
    state.schemaVersion = 2; state.brief = defaults(); state.program = null; state.programReview = null; state.programEnabled = false; state.outputTemplate = 'cinematic'; state.activeVariant = 'b2c'; state.variants = {};
    if (el('brief-import-status')) el('brief-import-status').textContent = '';
    sync();
  }
  function init() {
    sync();
    for (const field of ['mode', 'objective', 'text', 'roles']) el('brief-' + field).addEventListener('input', changed);
    el('brief-files').addEventListener('change', attach); el('brief-sources').addEventListener('click', sourceEdited);
    el('program-review-fields').addEventListener('input', reviewInput); el('program-review-fields').addEventListener('click', reviewClick);
    el('program-sample').addEventListener('click', sample); el('program-edit').addEventListener('click', editProgram);
    el('program-apply').addEventListener('click', apply);
    el('program-discard').addEventListener('click', () => { generationSequence++; state.programReview = null; renderReview(); scheduleDraftRecovery(); });
    el('output-template').addEventListener('change', event => { state.outputTemplate = event.target.value; root.LPGCinematic?.sync(); renderBenefits(); schedulePreview(); });
    root.LPGVariants?.init();
  }
  root.LPGRequirementsEditor = { recoverGeneration, renderRecovery, retryImages, acceptGeneration, cancelGeneration, pending: () => !!pendingGeneration, init, sync, reset, wantsProgram, analyze, fingerprint, apply, sample, editProgram, isImporting: () => importing };
})(window);
