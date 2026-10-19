const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

function fixture() {
  const dom = new JSDOM('<div id="drop-image"></div><img id="preview-image" class="hidden"><input id="url-image">', { runScripts: 'outside-only' });
  const w = dom.window, calls = [], reads = [], pickers = [], timers = new Map(); let next = 0;
  w.state = { activeVariant: 'b2c' }; w.projectEpoch = 1;
  w.setTimeout = fn => { timers.set(++next, fn); return next; }; w.clearTimeout = id => timers.delete(id);
  w.FileReader = class { readAsDataURL(file) { this.file = file; reads.push(this); } };
  w.HTMLInputElement.prototype.click = function () { if (this.type === 'file') pickers.push(this); };
  w.eval(fs.readFileSync('js/images.js', 'utf8'));
  const init = callback => w.initImageUpload('drop-image', 'preview-image', 'url-image', callback || (value => calls.push(value)));
  init();
  return { w, calls, reads, pickers, init,
    type(url) { const node=w.document.getElementById('url-image'); node.value=url; node.dispatchEvent(new w.Event('input')); },
    flush() { const pending=[...timers.values()]; timers.clear(); pending.forEach(fn=>fn()); },
    open() { w.document.getElementById('drop-image').click(); return pickers.at(-1); },
    choose(picker) { Object.defineProperty(picker,'files',{value:[{type:'image/png'}],configurable:true}); picker.dispatchEvent(new w.Event('change')); },
    finish(reader, value='data:image/png;base64,TEST') { reader.onload({target:{result:value}}); },
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

test('a pending FileReader cannot change preview or state after audience/project changes or invalidation', () => {
  for (const change of [w => w.state.activeVariant='b2b',w => w.projectEpoch++,w => w.LPGImages.invalidate()]) {
    const f=fixture();
    try {
      f.choose(f.open()); assert.equal(f.reads.length,1); change(f.w); f.finish(f.reads[0]);
      assert.deepEqual(f.calls,[]); assert.equal(f.w.document.getElementById('preview-image').getAttribute('src'),null);
    } finally {f.close();}
  }
});

test('successful current uploads work, and a newer input wins over a slow previous file', () => {
  const f=fixture();
  try {
    f.choose(f.open()); f.finish(f.reads[0]); assert.deepEqual(f.calls,['data:image/png;base64,TEST']);
    f.choose(f.open()); f.type('https://current.example/latest.jpg'); f.flush(); f.finish(f.reads[1]);
    assert.deepEqual(f.calls,['data:image/png;base64,TEST','https://current.example/latest.jpg']);
  } finally {f.close();}
});

test('re-rendered upload nodes do not retain old listeners or accept their pending reads', () => {
  const f=fixture();
  try {
    f.choose(f.open()); const old=f.w.document.getElementById('drop-image');
    old.outerHTML='<div id="drop-image"></div>'; f.init(); old.click(); f.finish(f.reads[0]);
    assert.equal(f.pickers.length,1); assert.deepEqual(f.calls,[]);
    f.choose(f.open()); f.finish(f.reads[1]); assert.deepEqual(f.calls,['data:image/png;base64,TEST']);
  } finally {f.close();}
});

test('clearing an image invalidates a delayed upload so it cannot reappear', () => {
  const f=fixture();
  try { f.choose(f.open()); f.w.clearImage('image'); f.finish(f.reads[0]); assert.deepEqual(f.calls,[]); assert.equal(f.w.document.getElementById('preview-image').getAttribute('src'),''); }
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
