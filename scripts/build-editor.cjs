const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const postcss=require('postcss'),tailwind=require('tailwindcss');
const repo=path.resolve(__dirname,'..');
(async()=>{
  const js=fs.readdirSync(path.join(repo,'js')).filter(x=>x.endsWith('.js')).sort();
  const content=[fs.readFileSync(path.join(repo,'index.html'),'utf8'),...js.map(x=>fs.readFileSync(path.join(repo,'js',x),'utf8'))];
  const result=await postcss([tailwind({content:content.map(raw=>({raw,extension:'html'})),theme:{extend:{fontWeight:Object.fromEntries([100,200,300,400,500,600,700,800,900].map(n=>[n,String(n)]))}},corePlugins:{preflight:true}})]).process('@tailwind base;\n@tailwind components;\n@tailwind utilities;',{from:undefined});
  fs.writeFileSync(path.join(repo,'assets/builder.css'),result.css.replace(/\/\*[\s\S]*?\*\//g,'').replace(/[ \t]+$/gm,'').trim()+'\n');
  const assets={};for(const file of [...js.map(x=>'js/'+x),'assets/builder.css','assets/editor-design.css',...(fs.existsSync(path.join(repo,'assets/feedback.css'))?['assets/feedback.css']:[])])assets[file]=crypto.createHash('sha256').update(fs.readFileSync(path.join(repo,file))).digest('hex');
  let html=fs.readFileSync(path.join(repo,'index.html'),'utf8');
  for(const[file,hash]of Object.entries(assets))html=html.replace(new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\?v=[^"\\s]+','g'),file+'?v='+hash.slice(0,12));
  fs.writeFileSync(path.join(repo,'index.html'),html);
  const buildId=crypto.createHash('sha256').update(html+JSON.stringify(assets)).digest('hex');
  fs.writeFileSync(path.join(repo,'assets/build-meta.json'),JSON.stringify({version:1,buildId,assets},null,2)+'\n');
  console.log('Built local editor CSS and content-addressed asset manifest.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
