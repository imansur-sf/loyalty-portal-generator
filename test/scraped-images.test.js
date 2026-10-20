const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');

function extract(html){
 const dom=new JSDOM('',{runScripts:'outside-only'});
 try{dom.window.eval(fs.readFileSync('js/pagehost.js','utf8'));return JSON.parse(JSON.stringify(dom.window.PageHost._analysis.extractCoreHTML(html,'https://www.ncsasports.org/')));}
 finally{dom.window.close();}
}
test('lazy and responsive website images survive placeholders and document-relative URLs',()=>{
 const result=extract(`<base href="https://www.ncsasports.org/wp-content/themes/ncsa-2024/">
 <h1>College recruiting</h1><p>Member coaching and recruiting guidance.</p>
 <img src="data:image/gif;base64,R0lGODlhAQAB" data-src="assets/images/membership-tiers/free-profile.png" alt="Member profile">
 <img src="/pixel.gif" data-src="assets/images/homepage-hero/tufts.png" alt="College sports">
 <picture><source data-srcset="assets/images/small.webp 400w, assets/images/large.webp 1200w"><img src="/spacer.gif" alt="Recruiting support"></picture>`);
 assert.ok(result.images.some(image=>image.url.endsWith('/assets/images/membership-tiers/free-profile.png')));
 assert.ok(result.images.some(image=>image.url.endsWith('/assets/images/homepage-hero/tufts.png')));
 assert.ok(result.images.some(image=>image.url.endsWith('/assets/images/large.webp')));
 assert.ok(result.images.every(image=>!image.url.includes('pixel')&&!image.url.includes('spacer')&&!image.url.startsWith('data:')));
 assert.match(result.bodyText,/Member coaching/);assert.match(result.headings,/College recruiting/);
});
test('decorative SVGs do not crowd customer logos and content photos out of the image budget',()=>{
 const decoration=Array.from({length:30},(_,i)=>`<img src="/assets/svg/decoration-${i}.svg">`).join('');
 const result=extract(decoration+'<img src="/assets/images/ncsa-logo.svg" class="brand-logo" height="32"><img src="/assets/images/coaching.webp" alt="Recruiting coaching">');
 assert.equal(result.images.length,25);assert.equal(result.images[0].role,'logo');
 assert.ok(result.images.some(image=>image.url.endsWith('/coaching.webp')));
});
