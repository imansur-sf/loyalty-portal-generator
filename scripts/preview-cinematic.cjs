// Generate standalone examples: node scripts/preview-cinematic.cjs [output-directory]
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const output = path.resolve(process.argv[2] || '/tmp/lpg-cinematic-preview');
const context = vm.createContext({}); context.window = context;
for (const name of ['defaults', 'program-model', 'program-runtime', 'portal-templates', 'generator']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8'), context);
}
const retreat = 'data:image/svg+xml;base64,' + Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 900"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#a8bfba"/><stop offset="1" stop-color="#e0deca"/></linearGradient><linearGradient id="stone"><stop stop-color="#cbb696"/><stop offset=".6" stop-color="#efdec1"/><stop offset="1" stop-color="#c9b293"/></linearGradient><linearGradient id="sea" x2="0" y2="1"><stop stop-color="#9ab8ac"/><stop offset="1" stop-color="#537f79"/></linearGradient></defs><rect width="1400" height="900" fill="url(#sky)"/><circle cx="1000" cy="190" r="90" fill="#f5e5b8"/><path d="M0 400h1400v500H0z" fill="url(#sea)"/><path d="M0 650h1400v250H0z" fill="#dbc6a5"/><path d="M100 900V330a300 300 0 0 1 600 0v570H570V350a170 170 0 0 0-340 0v550z" fill="url(#stone)"/><path d="M0 815l760-100 640 75v110H0z" fill="#c6ac85"/><ellipse cx="1130" cy="830" rx="270" ry="80" fill="#81a89e" stroke="#e4d1b0" stroke-width="20"/><path d="M930 820h370m-410 20h450m-380 20h340" stroke="#c1d3bd" stroke-width="3" opacity=".5"/></svg>`).toString('base64');
const scenarios = [
  { file:'aer-club', brand:'AER / CLUB', programName:'A world of belonging', primary:'#25473b', accent:'#e0dfc3', points:12480, rewards:3, imageData:retreat,
    titles:['Somewhere worth being.', 'Dinner, with a different view.', 'Time for something new.'] },
  { file:'retail', brand:'FORM / OBJECT', programName:'The Members Collection', primary:'#272440', accent:'#d3f5bf', points:1850, rewards:4,
    titles:['Something worth making room for.', 'A thoughtful little extra.', 'Make your everyday exceptional.', 'A gift, just because.'] },
  { file:'hospitality', brand:'SOLSTICE', programName:'A world of belonging', primary:'#4f3025', accent:'#edd2a3', points:800, rewards:1,
    titles:['Your next escape starts here.'] },
  { file:'financial-services', brand:'NORTH / STAR', programName:'More from every day', primary:'#ffffcc', accent:'#141a42', points:100, rewards:24,
    titles:['Turn everyday progress into something meaningful.'] }
];
fs.mkdirSync(output, { recursive:true });
for (const scenario of scenarios) {
  context.scenario = scenario;
  const html = vm.runInContext(`(() => {
    const x=scenario;
    const program=LPGProgram.normalize({mode:'b2c',name:x.programName,opening:{qualifying:1400,redeemable:x.points},
      tiers:[{name:'Member',threshold:0,multiplier:1},{name:'Select',threshold:1000,multiplier:1.25},{name:'Signature',threshold:3000,multiplier:1.5}],
      rewards:Array.from({length:x.rewards},(_,i)=>({id:'reward-'+i,name:x.titles[i%x.titles.length]+(x.rewards>4?' '+(i+1):''),cost:(x.file==='aer-club'?10000:500)+i*(x.file==='aer-club'?4000:400)}))});
    return generatePortalHTML({...INDUSTRY_DEFAULTS.generic,outputTemplate:'cinematic',programEnabled:true,program,
      brand:{name:x.brand,programName:x.programName},member:{name:'Avery Morgan',points:x.points},
      colors:{primary:x.primary,accent:x.accent,secondary:'#f5f5f5',dark:'#18202f'},
      navLinks:[],sections:{vouchers:true,offers:x.rewards>1,earnMore:true,badges:false,clubs:false,upsell:false},
      vouchers:program.rewards.map((r,i)=>({programRewardId:r.id,title:r.name,description:x.file==='aer-club'&&i===0?'Two slow mornings. One beautiful escape.':'A member reward, selected for you.',imageData:i===0?x.imageData:undefined,emoji:'✦',gradient:['slate-100','slate-200']})),
      benefits:[{name:'A little closer. A little more yours.',emoji:'✦'},{name:'Priority member support',emoji:'↗'},{name:'Access to member opportunities',emoji:'✦'}],
      offers:[{title:'A little more from your membership.',description:'Discover the latest member opportunities.',cta:'Explore',emoji:'✦',gradient:['slate-300','slate-500']}],
      earnMore:[{programRuleId:'purchase',title:'Make your next moment count.',description:'Explore ways to earn through your membership.'}]
    });
  })()`, context);
  const destination = path.join(output, scenario.file + '.html'); fs.writeFileSync(destination, html); console.log(destination);
}
