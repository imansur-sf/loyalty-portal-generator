const {test}=require('node:test'),assert=require('node:assert/strict');
const {isolatedEnvironment}=require('../scripts/test.cjs');
test('deployment tests exclude live application config and retain only explicit integration database opt-in',()=>{
 const source={PATH:'/bin',LPG_DATABASE_URL:'live',LPG_GENERATION_SECRET:'secret',LPG_ALLOWED_ORIGINS:'https://live.test',GEMINI_API_KEY:'paid',DATABASE_URL:'accounts',DYNO:'build',PORT:'3000',LPG_TEST_DATABASE_URL:'explicit-test'};
 const env=isolatedEnvironment(source);
 for(const key of ['LPG_DATABASE_URL','LPG_GENERATION_SECRET','LPG_ALLOWED_ORIGINS','GEMINI_API_KEY','DATABASE_URL','DYNO','PORT'])assert.equal(env[key],undefined,key);
 assert.equal(env.LPG_TEST_DATABASE_URL,'explicit-test');assert.equal(env.PATH,'/bin');assert.equal(env.SAASY_ACCOUNTS_URL,'http://127.0.0.1:1');assert.equal(source.LPG_DATABASE_URL,'live');
});
