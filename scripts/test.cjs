// Deployment gates run with production config present. Tests must never inherit
// live storage, origin policy, proxy trust or provider credentials.
const {spawnSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
function isolatedEnvironment(source){
 const env={...source};
 for(const name of Object.keys(env))if((name.startsWith('LPG_')&&name!=='LPG_TEST_DATABASE_URL')||['GEMINI_API_KEY','SAASY_ACCOUNTS_URL','DATABASE_URL','DYNO','PORT'].includes(name))delete env[name];
 env.SAASY_ACCOUNTS_URL='http://127.0.0.1:1';
 return env;
}
if(require.main===module){
 const root=path.resolve(__dirname,'..'),files=fs.readdirSync(path.join(root,'test')).filter(name=>name.endsWith('.test.js')).sort().map(name=>'test/'+name);
 const result=spawnSync(process.execPath,['--test','--test-timeout=60000',...files],{cwd:root,env:isolatedEnvironment(process.env),stdio:'inherit'});
 if(result.error)console.error('Test process could not start.');process.exitCode=result.status??1;
}
module.exports={isolatedEnvironment};
