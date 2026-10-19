const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY9sAAAAASUVORK5CYII=';

function fixture() {
  const dom = new JSDOM('<div id="drop-image"></div><img id="preview-image" class="hidden"><input id="url-image"><p id="status-image" role="status"></p>', { runScripts: 'outside-only' });
  const w = dom.window, calls = [], reads = [], pickers = [], timers = new Map(); let next = 0;
  w.TextEncoder = TextEncoder;
  w.state = { activeVariant: 'b2c' }; w.projectEpoch = 1;
  w.setTimeout = fn => { timers.set(++next, fn); return next; }; w.clearTimeout = id => timers.delete(id);
  w.Image = class { constructor() { this.naturalWidth=200; this.naturalHeight=100; } set src(value) { this.onload(); } };
  w.FileReader = class { readAsDataURL(file) { this.file = file; reads.push(this); } };
  w.HTMLInputElement.prototype.click = function () { if (this.type === 'file') pickers.push(this); };
  w.eval(fs.readFileSync('js/images.js', 'utf8'));
  const init = callback => w.initImageUpload('drop-image', 'preview-image', 'url-image', callback || (value => calls.push(value)));
  init();
  return { w, calls, reads, pickers, init,
    type(url) { const node=w.document.getElementById('url-image'); node.value=url; node.dispatchEvent(new w.Event('input')); },
    flush() { const pending=[...timers.values()]; timers.clear(); pending.forEach(fn=>fn()); },
    open() { w.document.getElementById('drop-image').click(); return pickers.at(-1); },
    choose(picker, file={type:'image/png',size:100}) { Object.defineProperty(picker,'files',{value:[file],configurable:true}); picker.dispatchEvent(new w.Event('change')); },
    async finish(reader, value=PNG) { await reader.onload({target:{result:value}}); },
    close() {dom.window.close();}
  };
}

test('reinitialization installs one callback and cancels stale delayed operations', () => {
  const f=fixture();
  try {
    f.type('https://old.example/image.png'); f.init(); f.init(); f.flush(); assert.deepEqual(f.calls,[]);
    f.type('https://new.example/image.png'); f.flush(); assert.deepEqual(f.calls,['https://new.example/image.png']);
    f.open(); assert.equal(f.pickers.length,1);
  } finally {f.close();}
});

test('URL debounce captures audience and project at input time, even before DOM refresh', () => {
  for (const change of [w => w.state.activeVariant='b2b',w => w.projectEpoch++,w => w.LPGImages.invalidate()]) {
    const f=fixture();
    try {
      f.type('https://old.example/image.png'); change(f.w); f.flush();
      assert.deepEqual(f.calls,[]); assert.equal(f.w.document.getElementById('preview-image').getAttribute('src'),null);
      f.type('https://current.example/image.png'); f.flush(); assert.deepEqual(f.calls,['https://current.example/image.png']);
    } finally {f.close();}
  }
});

test('a picker opened before a variant change cannot start reading into the new audience', () => {
  const f=fixture();
  try {
    const picker=f.open(); f.w.state.activeVariant='b2b'; f.choose(picker);
    assert.equal(f.reads.length,0); assert.deepEqual(f.calls,[]);
  } finally {f.close();}
});

test('a pending FileReader cannot change preview or state after audience/project changes or invalidation', async () => {
  for (const change of [w => w.state.activeVariant='b2b',w => w.projectEpoch++,w => w.LPGImages.invalidate()]) {
    const f=fixture();
    try {
      f.choose(f.open()); assert.equal(f.reads.length,1); change(f.w); await f.finish(f.reads[0]);
      assert.deepEqual(f.calls,[]); assert.equal(f.w.document.getElementById('preview-image').getAttribute('src'),null);
    } finally {f.close();}
  }
});

test('successful current uploads work, and a newer input wins over a slow previous file', async () => {
  const f=fixture();
  try {
    f.choose(f.open()); await f.finish(f.reads[0]); assert.deepEqual(f.calls,[PNG]);
    f.choose(f.open()); f.type('https://current.example/latest.jpg'); f.flush(); await f.finish(f.reads[1]);
    assert.deepEqual(f.calls,[PNG,'https://current.example/latest.jpg']);
  } finally {f.close();}
});

test('re-rendered upload nodes do not retain old listeners or accept their pending reads', async () => {
  const f=fixture();
  try {
    f.choose(f.open()); const old=f.w.document.getElementById('drop-image');
    old.outerHTML='<div id="drop-image"></div>'; f.init(); old.click(); await f.finish(f.reads[0]);
    assert.equal(f.pickers.length,1); assert.deepEqual(f.calls,[]);
    f.choose(f.open()); await f.finish(f.reads[1]); assert.deepEqual(f.calls,[PNG]);
  } finally {f.close();}
});

test('clearing an image invalidates a delayed upload so it cannot reappear', async () => {
  const f=fixture();
  try { f.choose(f.open()); f.w.clearImage('image'); await f.finish(f.reads[0]); assert.deepEqual(f.calls,[]); assert.equal(f.w.document.getElementById('preview-image').getAttribute('src'),''); }
  finally {f.close();}
});

test('imported image URLs and labels cannot escape generated attributes or markup', () => {
  const f=fixture();
  try {
    const attack='https://brand.example/a.png" onerror="alert(1)';
    f.w.document.body.innerHTML=f.w.imageUploadHTML('photo','<img src=x onerror=alert(2)>',attack);
    const img=f.w.document.querySelector('img');
    assert.equal(f.w.document.querySelectorAll('img').length,1); assert.equal(img.getAttribute('onerror'),null);
    assert.equal(img.getAttribute('src'),attack); assert.equal(f.w.document.querySelector('input').value,attack);
    assert.equal(f.w.document.querySelector('label').textContent,'<img src=x onerror=alert(2)>');
    assert.equal(f.w.document.querySelector('button').getAttribute('onclick'),'clearImage("photo")');
  } finally {f.close();}
});

test('unsupported and oversized source files report an accessible error and preserve the old image', () => {
  const f=fixture();
  try {
    const preview=f.w.document.getElementById('preview-image'); preview.src='https://brand.example/old.png';
    for (const file of [{type:'image/svg+xml',size:10},{type:'image/gif',size:10},{type:'image/png',size:13*1024*1024},{type:'image/png',size:0}]) {
      f.choose(f.open(),file);
      assert.equal(f.reads.length,0); assert.deepEqual(f.calls,[]);
      assert.equal(preview.src,'https://brand.example/old.png');
      assert.ok(f.w.document.getElementById('status-image').textContent.length);
      assert.equal(f.w.document.getElementById('status-image').classList.contains('text-red-600'),true);
    }
    const markup=f.w.imageUploadHTML('cover','Cover','');
    f.w.document.body.innerHTML=markup;
    assert.equal(f.w.document.querySelector('[role="status"]').getAttribute('aria-live'),'polite');
    assert.equal(f.w.document.getElementById('drop-cover').getAttribute('aria-describedby'),'status-cover');
  } finally {f.close();}
});

test('large uploads are resized with bounded canvas dimensions and encoded output before commit', async () => {
  const f=fixture(), draws=[];
  try {
    f.w.Image=class { constructor(){this.naturalWidth=6000;this.naturalHeight=4000;} set src(value){this.onload();} };
    f.w.HTMLCanvasElement.prototype.getContext=function(){const canvas=this;return {clearRect(){},drawImage(){draws.push([canvas.width,canvas.height]);}};};
    f.w.HTMLCanvasElement.prototype.toDataURL=function(type,quality){return type==='image/webp' && quality<0.8 ? 'data:image/webp;base64,SMALL' : 'data:image/webp;base64,'+'X'.repeat(500000);};
    f.choose(f.open()); await f.finish(f.reads[0]);
    assert.deepEqual(f.calls,['data:image/webp;base64,SMALL']);
    assert.equal(draws.length,1); assert.ok(draws.every(([width,height])=>width<=1600 && height<=1600));
    assert.match(f.w.document.getElementById('status-image').textContent,/optimized/);
    assert.equal(f.w.uploadImagePolicy('drop-card-mark').maxLength,120*1024);
    assert.equal(f.w.uploadImagePolicy('drop-benefit-2').maxEdge,512);
    assert.equal(f.w.uploadImagePolicy('drop-benefit-cover-2').maxEdge,1600);
  } finally {f.close();}
});

test('decode errors and extreme dimensions preserve existing assets without creating a large canvas', async () => {
  for (const mode of ['decode','dimensions','encoder']) {
    const f=fixture();
    try {
      f.w.document.getElementById('preview-image').src='https://brand.example/old.png';
      f.w.Image=class { constructor(){this.naturalWidth=mode==='dimensions'?20000:6000;this.naturalHeight=1000;} set src(value){mode==='decode'?this.onerror():this.onload();} };
      let canvasCalls=0;
      f.w.HTMLCanvasElement.prototype.getContext=()=>{canvasCalls++;return null;};
      f.choose(f.open()); await f.finish(f.reads[0]);
      assert.deepEqual(f.calls,[]); assert.equal(f.w.document.getElementById('preview-image').src,'https://brand.example/old.png');
      assert.equal(canvasCalls,mode==='encoder'?1:0);
      assert.match(f.w.document.getElementById('status-image').textContent,/existing image has been kept/);
    } finally {f.close();}
  }
});

test('a slow decode cannot overwrite a newer URL or a different project', async () => {
  for (const update of [f=>{f.type('https://brand.example/latest.png');f.flush();},f=>f.w.projectEpoch++]) {
    const f=fixture(); let pendingImage;
    try {
      f.w.Image=class { constructor(){this.naturalWidth=100;this.naturalHeight=100;pendingImage=this;} set src(value){} };
      f.choose(f.open()); const completion=f.finish(f.reads[0]);
      update(f); pendingImage.onload(); await completion;
      assert.ok(!f.calls.some(value=>value.startsWith('data:')));
    } finally {f.close();}
  }
});

test('raster headers reject decompression bombs before decoding and recognize JPEG and WebP sizes', async () => {
  const f=fixture();
  try {
    let decodes=0; f.w.Image=class { constructor(){decodes++;} };
    const bytes=Buffer.from(PNG.split(',')[1],'base64'); bytes.writeUInt32BE(15000,16);bytes.writeUInt32BE(15000,20);
    f.choose(f.open()); await f.finish(f.reads[0],'data:image/png;base64,'+bytes.toString('base64'));
    assert.equal(decodes,0); assert.deepEqual(f.calls,[]);
    assert.match(f.w.document.getElementById('status-image').textContent,/dimensions/);
    const jpg=Buffer.from([0xff,0xd8,0xff,0xc0,0,17,8,0,100,0,200,3,0,0,0,0,0,0,0,0,0]);
    assert.deepEqual(Array.from(f.w.uploadedImageDimensions('data:image/jpeg;base64,'+jpg.toString('base64'))),[200,100]);
    const webp=Buffer.alloc(30);webp.write('RIFF',0);webp.write('WEBPVP8X',8);webp[24]=199;webp[27]=99;
    assert.deepEqual(Array.from(f.w.uploadedImageDimensions('data:image/webp;base64,'+webp.toString('base64'))),[200,100]);
    const lossless=Buffer.alloc(30);lossless.write('RIFF',0);lossless.write('WEBPVP8L',8);lossless[20]=0x2f;lossless[21]=199;lossless[22]=(99&3)<<6;lossless[23]=99>>2;
    assert.deepEqual(Array.from(f.w.uploadedImageDimensions('data:image/webp;base64,'+lossless.toString('base64'))),[200,100]);
  } finally {f.close();}
});

test('project budget blocks additions near the save limit but permits replacing a large asset with a smaller one', async () => {
  const f=fixture();
  try {
    f.w.MAX_PROJECT_BYTES=200000;
    const preview=f.w.document.getElementById('preview-image'); preview.src='https://brand.example/old.png';
    f.w.state.padding='x'.repeat(134450);
    f.choose(f.open()); await f.finish(f.reads[0]);
    assert.deepEqual(f.calls,[]);assert.equal(preview.src,'https://brand.example/old.png');
    assert.match(f.w.document.getElementById('status-image').textContent,/project is nearly full.*Remove unused images/);
    const old=PNG+'A'.repeat(1000); preview.src=old;f.w.state.imageData=old;f.w.state.padding='x'.repeat(134000);
    f.choose(f.open()); await f.finish(f.reads[1]);
    assert.deepEqual(f.calls,[PNG]);
    // A preview not represented in the state must never provide budget credit.
    f.w.state.imageData='other'; f.w.state.padding='x'.repeat(134450);
    f.choose(f.open()); await f.finish(f.reads[2]);assert.deepEqual(f.calls,[PNG]);
  } finally {f.close();}
});

test('unsafe image URL schemes and SVG data cannot replace an existing asset', async () => {
  const f=fixture();
  try {
    const preview=f.w.document.getElementById('preview-image');preview.src='https://brand.example/old.png';
    for (const url of ['javascript:alert(1)','file:///tmp/photo.png','data:image/svg+xml;base64,PHN2Zz4=','not a url']) {
      f.type(url);f.flush(); assert.deepEqual(f.calls,[]);assert.equal(preview.src,'https://brand.example/old.png');
      assert.equal(f.w.document.getElementById('status-image').classList.contains('text-red-600'),true);
    }
    f.type(PNG);f.flush();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(f.calls,[PNG]);
    f.type('http://brand.example/image.png');f.flush();assert.equal(f.calls.at(-1),'http://brand.example/image.png');
  } finally {f.close();}
});
