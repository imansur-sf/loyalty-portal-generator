const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'lpg-build-check-'));
const files=['index.html','standalone.html','js/generator.js','assets/builder.css','assets/build-meta.json'];
try {
  for(const name of ['index.html','build-standalone.py','package.json'])fs.copyFileSync(path.join(root,name),path.join(tmp,name));
  for(const name of ['js','assets','scripts'])fs.cpSync(path.join(root,name),path.join(tmp,name),{recursive:true});
  fs.symlinkSync(path.join(root,'node_modules'),path.join(tmp,'node_modules'),'dir');
  cp.execFileSync(process.execPath,['scripts/build-portal-css.cjs'],{cwd:tmp,stdio:'pipe'});
  cp.execFileSync(process.execPath,['scripts/build-editor.cjs'],{cwd:tmp,stdio:'pipe'});
  cp.execFileSync('python3',['build-standalone.py'],{cwd:tmp,stdio:'pipe'});
  if (/<script\b[^>]*\bsrc=["']\.\/js\//i.test(fs.readFileSync(path.join(tmp,'standalone.html'),'utf8'))) throw Error('Standalone still references a local script instead of inlining it.');
  const stale=files.filter(name=>!fs.existsSync(path.join(root,name))||!fs.readFileSync(path.join(root,name)).equals(fs.readFileSync(path.join(tmp,name))));
  if(stale.length)throw Error('Stale build artifacts: '+stale.join(', ')+'. Run npm run build.');
  console.log('Editor CSS, portal CSS, asset manifest and standalone are current.');
}catch(error){console.error(error.message);process.exitCode=1;}finally{fs.rmSync(tmp,{recursive:true,force:true});}
