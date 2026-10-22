/* Feedback stays in memory until submitted. Admin access is granted by the server. */
(function(root){
'use strict';
const $=id=>document.getElementById(id), labels={bug:'Bug report',feature:'Feature request',general:'General feedback'};
let files=[],urls=[],detailUrls=[],busy=false,processing=false,key=null,payloadSignature='',submittedContext=null,admin=false,identity='',epoch=0,sessionSequence=0,page=1,total=0,selected=null,listSequence=0,detailSequence=0,opener=null,inboxOpener=null,version='unknown',ready=false;
const auth=()=>root.SaasyAuth;
const message=(id,text)=>{$(id).textContent=text;};
const feedbackErrors={
 forbidden:'Your account does not have access to the feedback inbox.',
 invalid_token:'Your sign-in has expired. Sign in again to continue.',
 missing_token:'Sign in to view the feedback inbox.',
 auth_session_changed:'Your account changed. Sign in again and reopen the inbox.',
 feedback_rate_limited:'You have reached the hourly feedback limit. Please try again later.',
 feedback_storage_full:'The feedback inbox is full. Please try again later.',
 invalid_attachment:'A screenshot could not be accepted. Remove it and choose a PNG, JPEG, or WebP image.',
 too_many_attachments:'You can attach up to 3 screenshots. Remove an image and try again.',
 payload_too_large:'The submission is too large. Remove a screenshot or choose a smaller image.',
 feedback_service_unavailable:'Feedback is temporarily unavailable. Please try again later.'
};
function errorText(error){const code=error?.code||error?.error||error?.message;if(feedbackErrors[code])return feedbackErrors[code];if(error?.name==='TypeError')return 'Could not connect. Check your connection and try again. Your feedback has been kept.';return error?.message || 'Something went wrong. Please try again.';}
const revoke=list=>{for(const url of list)root.URL.revokeObjectURL(url);list.length=0;};
function show(dialog,trigger){if(dialog.open)return;dialog.showModal();trigger?.blur();}
function clearPrivate(){epoch++;listSequence++;detailSequence++;selected=null;revoke(detailUrls);$('feedback-inbox-list').replaceChildren();$('feedback-inbox-detail').replaceChildren();$('feedback-inbox-detail').hidden=true;$('feedback-unread').textContent='';$('feedback-inbox-message').textContent='';$('feedback-inbox-open').hidden=true;if($('feedback-inbox-dialog').open)$('feedback-inbox-dialog').close();}
function fingerprint(){try{return (auth()?.isSignedIn?.()?'signed:':'guest:')+(auth()?.getEmail?.()||'');}catch(_){return '';}}
async function refreshSession(force=false){
 const next=fingerprint();if(!force&&ready&&identity===next)return;
 if(identity!==next){clearPrivate();admin=false;identity=next;}ready=true;
 const seq=++sessionSequence;
 try{if(typeof auth()?.getFeedbackSession!=='function'){ready=false;return;}const session=await auth().getFeedbackSession();if(seq!==sessionSequence||identity!==fingerprint())return;admin=session.admin===true;$('feedback-inbox-open').hidden=!admin;if(!admin)clearPrivate();else {const token=epoch;try{const result=await auth().listFeedback({category:'',status:'',page:1});if(current(token)&&seq===sessionSequence)count(result.unreadCount);}catch(_){/* The inbox offers retry if its list is unavailable. */}}}
 catch(_){if(seq===sessionSequence){ready=false;admin=false;clearPrivate();}}
}
function context(){let step='';try{step=document.querySelector('.step-dot[aria-current="step"]')?.dataset.label||String(typeof currentStep==='number'?currentStep+1:'');}catch(_){}return {appVersion:version,step};}
function reset(){revoke(urls);files=[];$('feedback-form').reset();key=null;payloadSignature='';submittedContext=null;$('feedback-previews').replaceChildren();message('feedback-message','');$('feedback-success').hidden=true;$('feedback-form').hidden=false;}
function renderFiles(){revoke(urls);$('feedback-previews').replaceChildren();files.forEach((file,index)=>{const li=document.createElement('li'),img=document.createElement('img'),button=document.createElement('button');img.src=URL.createObjectURL(file.blob);urls.push(img.src);img.alt=file.name;button.type='button';button.textContent='Remove image '+(index+1);button.disabled=busy;button.onclick=()=>{files.splice(index,1);renderFiles();};li.append(img,button);$('feedback-previews').append(li);});}
function toData(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('The image could not be read.'));reader.readAsDataURL(blob);});}
async function compress(file){
 if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Choose PNG, JPEG, or WebP images.');
 if(file.size>20*1024*1024)throw new Error('Choose an image smaller than 20 MB.');
 const url=URL.createObjectURL(file),img=new Image();
 try{await new Promise((resolve,reject)=>{let timer=setTimeout(()=>reject(new Error('The image could not be decoded.')),10000);img.onload=()=>{clearTimeout(timer);resolve();};img.onerror=()=>{clearTimeout(timer);reject(new Error('The image could not be decoded.'));};img.src=url;});
 const width=img.naturalWidth,height=img.naturalHeight;if(!width||!height||width*height>60000000)throw new Error('This image is too large to process. Choose a smaller screenshot.');
 const canvas=document.createElement('canvas');let scale=Math.min(1,1800/Math.max(width,height)),blob;
 for(let attempt=0;attempt<5;attempt++){canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));const drawing=canvas.getContext('2d');if(!drawing)throw new Error('Your browser could not process this image.');drawing.fillStyle='#fff';drawing.fillRect(0,0,canvas.width,canvas.height);drawing.drawImage(img,0,0,canvas.width,canvas.height);blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.85-attempt*.08));if(blob&&blob.size<=1024*1024)break;scale*=.75;}
 if(!blob||blob.size>1024*1024)throw new Error('This screenshot could not fit within 1 MB. Choose a smaller image.');
 return {name:(file.name||'screenshot').replace(/\.[^.]+$/,'').slice(0,110)+'.jpg',type:blob.type,blob,data:await toData(blob)};
 }finally{URL.revokeObjectURL(url);}
}
async function addFiles(incoming){if(busy||processing)return;const images=Array.from(incoming);if(!images.length)return;if(images.length+files.length>3){message('feedback-message','You can attach up to 3 images. Remove one before adding another.');return;}processing=true;$('feedback-submit').disabled=true;message('feedback-message','Preparing screenshots…');try{const additions=[];for(const file of images)additions.push(await compress(file));files.push(...additions);renderFiles();message('feedback-message','');}catch(error){message('feedback-message',errorText(error));}finally{processing=false;$('feedback-submit').disabled=false;$('feedback-files').value='';}}
async function submit(event){event.preventDefault();if(busy||processing||!$('feedback-form').reportValidity())return;
 if(typeof auth()?.submitFeedback!=='function'){message('feedback-message','Feedback is unavailable. Reload the app and try again.');return;}
 const payload={category:$('feedback-category').value,name:$('feedback-name').value.trim(),email:$('feedback-email').value.trim(),description:$('feedback-description').value.trim(),context:context(),attachments:files.map(({name,type,data})=>({name,type,data}))};
 if(!payload.name||!payload.description){message('feedback-message','Enter your name and a description.');return;}
 const signature=JSON.stringify({...payload,context:undefined});if(signature!==payloadSignature){key=root.crypto.randomUUID();payloadSignature=signature;submittedContext=payload.context;}else payload.context=submittedContext;
 busy=true;for(const field of $('feedback-form').querySelectorAll('input,select,textarea'))field.disabled=true;$('feedback-submit').disabled=true;$('feedback-files').disabled=true;renderFiles();message('feedback-message','Sending feedback…');
 try{const result=await auth().submitFeedback(payload,key);if(!result?.id)throw new Error('The server did not confirm your submission. Please try again.');$('feedback-form').hidden=true;$('feedback-success').hidden=false;message('feedback-reference','Reference: '+result.id);$('feedback-done').focus();}
 catch(error){message('feedback-message',errorText(error));}
 finally{busy=false;for(const field of $('feedback-form').querySelectorAll('input,select,textarea'))field.disabled=false;$('feedback-submit').disabled=false;$('feedback-files').disabled=false;renderFiles();}
}
function el(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
function current(token){if(identity!==fingerprint()){refreshSession();return false;}return admin&&token===epoch;}
function inboxError(error,retry){message('feedback-inbox-message',errorText(error));$('feedback-inbox-retry').hidden=false;$('feedback-inbox-retry').onclick=retry;}
function count(n){$('feedback-unread').textContent=n?String(n):'';}
function listView(){selected=null;detailSequence++;revoke(detailUrls);$('feedback-inbox-detail').replaceChildren();$('feedback-inbox-detail').hidden=true;$('feedback-inbox-list').hidden=false;$('feedback-pagination').hidden=false;$('feedback-inbox-controls').hidden=false;}
async function loadList(){if(!admin)return;listView();const token=epoch,seq=++listSequence;message('feedback-inbox-message','Loading feedback…');$('feedback-inbox-retry').hidden=true;$('feedback-inbox-list').replaceChildren();
 try{const result=await auth().listFeedback({category:$('feedback-filter-category').value,status:$('feedback-filter-status').value,page});if(!current(token)||seq!==listSequence)return;total=result.total;count(result.unreadCount);message('feedback-inbox-message',result.items.length?'':'No feedback matches these filters.');
 for(const item of result.items){const button=el('button',undefined,'feedback-row');button.type='button';button.append(el('strong',(item.readAt?'':'● ')+(labels[item.category]||'Feedback')+' · '+item.name),el('span',item.description.slice(0,180)),el('span',item.email+' · '+item.status+' · '+new Date(item.createdAt).toLocaleDateString()));button.onclick=()=>openDetail(item.id);$('feedback-inbox-list').append(button);}
 message('feedback-page','Page '+page+' of '+Math.max(1,Math.ceil(total/25)));$('feedback-prev').disabled=page<=1;$('feedback-next').disabled=page*25>=total;
 }catch(error){if(current(token)&&seq===listSequence)inboxError(error,loadList);}
}
async function openDetail(id){if(!admin)return;const token=epoch,seq=++detailSequence;listSequence++;selected=id;revoke(detailUrls);$('feedback-inbox-list').hidden=true;$('feedback-pagination').hidden=true;$('feedback-inbox-controls').hidden=true;$('feedback-inbox-detail').hidden=false;$('feedback-inbox-detail').replaceChildren();message('feedback-inbox-message','Loading submission…');$('feedback-inbox-retry').hidden=true;
 try{const result=await auth().getFeedback(id);if(!current(token)||seq!==detailSequence)return;const item=result.feedback,box=$('feedback-inbox-detail');message('feedback-inbox-message','');const back=el('button','← Back to inbox');back.type='button';back.onclick=()=>loadList();const heading=el('h3',labels[item.category]||'Feedback');heading.tabIndex=-1;const meta=el('p',item.name+' · '+item.email+'\n'+new Date(item.createdAt).toLocaleString()+' · Reference '+item.id,'feedback-detail-meta');meta.style.whiteSpace='pre-line';box.append(back,heading,meta,el('p',item.description,'feedback-detail-description'));if(item.context?.appVersion||item.context?.step)box.append(el('p','App '+(item.context.appVersion||'unknown')+' · Step '+(item.context.step||'unknown'),'feedback-detail-meta'));
 let savedStatus=item.status;const label=el('label','Status'),select=el('select');select.id='feedback-detail-status';label.htmlFor=select.id;for(const status of ['new','reviewing','completed']){const option=el('option',status[0].toUpperCase()+status.slice(1));option.value=status;select.append(option);}select.value=item.status;select.onchange=async()=>{select.disabled=true;try{await auth().updateFeedback(id,{status:select.value});savedStatus=select.value;if(current(token)&&seq===detailSequence)message('feedback-inbox-message','Status saved.');}catch(error){if(current(token)&&seq===detailSequence){select.value=savedStatus;message('feedback-inbox-message',errorText(error));}}finally{select.disabled=false;}};box.append(label,select);
 if(typeof auth()?.deleteFeedback==='function'){const remove=el('button','Delete submission'),actions=el('div',undefined,'feedback-actions');remove.type='button';remove.id='feedback-delete';remove.onclick=async()=>{if(remove.disabled||!root.confirm('Delete this submission and its screenshots permanently?'))return;remove.disabled=true;select.disabled=true;try{await auth().deleteFeedback(id);if(!current(token)||seq!==detailSequence)return;page=Math.min(page,Math.max(1,Math.ceil(Math.max(0,total-1)/25)));await loadList();}catch(error){if(current(token)&&seq===detailSequence)message('feedback-inbox-message',errorText(error));}finally{remove.disabled=false;select.disabled=false;}};actions.append(remove);box.append(actions);}
 heading.focus();
 if(!item.readAt){try{await auth().updateFeedback(id,{read:true});}catch(error){if(current(token)&&seq===detailSequence)message('feedback-inbox-message','Opened, but could not mark as read: '+errorText(error));}}
 for(const attachment of item.attachments||[]){try{const blob=await auth().getFeedbackAttachment(id,attachment.id);if(!current(token)||seq!==detailSequence)return;if(!['image/jpeg','image/png','image/webp'].includes(blob.type))throw new Error('Unsupported attachment type.');const url=URL.createObjectURL(blob);detailUrls.push(url);const img=el('img',undefined,'feedback-detail-image');img.src=url;img.alt=attachment.name;box.append(img);}catch(error){if(current(token)&&seq===detailSequence)box.append(el('p','Screenshot unavailable: '+errorText(error)));}}
 }catch(error){if(current(token)&&seq===detailSequence)inboxError(error,()=>openDetail(id));}
}
function init(){if(!$('feedback-open'))return;
 $('feedback-open').onclick=()=>{opener=document.activeElement;try{if(!$('feedback-email').value)$('feedback-email').value=auth()?.getEmail?.()||'';}catch(_){}show($('feedback-dialog'),opener);};
 document.querySelectorAll('[data-feedback-close]').forEach(button=>button.onclick=()=>{if(!busy&&!processing)$('feedback-dialog').close();});$('feedback-dialog').addEventListener('cancel',event=>{if(busy||processing)event.preventDefault();});$('feedback-dialog').addEventListener('close',()=>{if(!$('feedback-success').hidden)reset();opener?.focus();});$('feedback-done').onclick=()=>{$('feedback-dialog').close();};$('feedback-form').onsubmit=submit;$('feedback-files').onchange=event=>addFiles(event.target.files);
 const drop=$('feedback-drop');drop.addEventListener('dragover',event=>{event.preventDefault();drop.classList.add('dragging');});drop.addEventListener('dragleave',()=>drop.classList.remove('dragging'));drop.addEventListener('drop',event=>{event.preventDefault();drop.classList.remove('dragging');addFiles(event.dataTransfer.files);});$('feedback-dialog').addEventListener('paste',event=>{const items=Array.from(event.clipboardData?.items||[]).filter(item=>item.kind==='file'&&item.type.startsWith('image/'));if(items.length){event.preventDefault();addFiles(items.map(item=>item.getAsFile()).filter(Boolean));}});
 $('feedback-inbox-open').onclick=async()=>{await refreshSession(true);if(!admin)return;inboxOpener=document.activeElement;show($('feedback-inbox-dialog'),inboxOpener);page=1;loadList();};document.querySelectorAll('[data-feedback-inbox-close]').forEach(button=>button.onclick=()=>$('feedback-inbox-dialog').close());$('feedback-inbox-dialog').addEventListener('close',()=>{listSequence++;detailSequence++;revoke(detailUrls);$('feedback-inbox-list').replaceChildren();$('feedback-inbox-detail').replaceChildren();inboxOpener?.focus();});
 for(const id of ['feedback-filter-category','feedback-filter-status'])$(id).onchange=()=>{page=1;loadList();};$('feedback-prev').onclick=()=>{if(page>1){page--;loadList();}};$('feedback-next').onclick=()=>{if(page*25<total){page++;loadList();}};
 const observer=new MutationObserver(()=>refreshSession());if($('auth-email'))observer.observe($('auth-email'),{childList:true,subtree:true,characterData:true,attributes:true});root.addEventListener('storage',()=>refreshSession());root.addEventListener('focus',()=>refreshSession());document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshSession();});document.addEventListener('click',()=>{if(ready&&identity!==fingerprint())refreshSession();},true);
 Promise.resolve(root.saasyAuthReady).then(()=>refreshSession(true)).catch(()=>{});if(root.fetch)root.fetch('./assets/build-meta.json').then(response=>response.ok?response.json():null).then(meta=>{if(meta)version=String(meta.commit||meta.buildId||meta.gitCommit||'unknown').slice(0,12);}).catch(()=>{});
 root.addEventListener('pagehide',()=>{revoke(urls);revoke(detailUrls);});
}
root.LPGFeedback={refreshSession};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(window);
