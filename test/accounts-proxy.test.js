const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createAccountsProxy } = require('../accounts-proxy');

async function serve(app, callback) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try { await callback('http://127.0.0.1:' + server.address().port); }
  finally { await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); }
}
test('same-origin proxy forwards auth, retries and large image-bearing project saves', async () => {
  let received;
  const upstream = express(); upstream.use(express.json({ limit: '20mb' }));
  upstream.put('/projects/7', (req, res) => {
    received = { body: req.body, auth: req.get('authorization'), key: req.get('idempotency-key'), cookie: req.get('cookie') };
    res.status(409).json({ error: 'revision_conflict', revision: '4' });
  });
  await serve(upstream, async base => {
    const app = express();
    app.use('/projects', express.json({ limit: '20mb' }));
    app.use(['/projects', '/auth', '/saasy-auth.js'], createAccountsProxy(base));
    await serve(app, async origin => {
      const response = await fetch(origin + '/projects/7', { method: 'PUT', headers: {
        'Content-Type': 'application/json', Authorization: 'Bearer test-only-token', 'Idempotency-Key': 'lpg_test_1234567890', Cookie: 'unrelated=not-forwarded'
      }, body: JSON.stringify({ name: 'Images', payload: { image: 'x'.repeat(1100000) }, expectedRevision: '3' }) });
      assert.equal(response.status, 409); assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal((await response.json()).error, 'revision_conflict');
      assert.equal(received.auth, 'Bearer test-only-token'); assert.equal(received.key, 'lpg_test_1234567890');
      assert.equal(received.body.expectedRevision, '3'); assert.equal(received.body.payload.image.length, 1100000);
      assert.equal(received.cookie, undefined);
    });
  });
});
test('upstream authentication redirects become a clear service error', async () => {
  const upstream = express(); upstream.get('/auth/config', (req, res) => res.redirect('https://auth.example.test/login'));
  await serve(upstream, async base => {
    const app = express(); app.use('/auth', createAccountsProxy(base));
    await serve(app, async origin => {
      const response = await fetch(origin + '/auth/config');
      assert.equal(response.status, 502); assert.equal(response.headers.get('location'), null);
      assert.equal((await response.json()).error, 'sign_in_service_unavailable');
    });
  });
});

test('feedback proxy preserves large screenshot requests, admin errors and private attachment bytes', async () => {
  const png=Buffer.from('89504e470d0a1a0a','hex');let received;
  const upstream=express();upstream.use('/feedback',express.json({limit:'5mb'}));
  upstream.post('/feedback',(req,res)=>{received={body:req.body,key:req.get('idempotency-key')};res.status(201).json({id:'feedback-test'});});
  upstream.get('/feedback/inbox',(req,res)=>res.status(403).json({error:'feedback_admin_required'}));
  upstream.get('/feedback/inbox/test/attachments/test',(req,res)=>{
    assert.equal(req.get('authorization'),'Bearer private-admin-token');
    res.set({'Content-Type':'image/png','Content-Disposition':'inline; filename="screenshot.png"','Set-Cookie':'must-not-leak=yes'}).send(png);
  });
  await serve(upstream,async base=>{
    const app=express();app.use('/feedback',express.json({limit:'5mb'}));app.use(express.json({limit:'1mb'}));app.use('/feedback',createAccountsProxy(base));
    await serve(app,async origin=>{
      const response=await fetch(origin+'/feedback',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'feedback_idempotent_12345'},body:JSON.stringify({attachments:[{data:'a'.repeat(1500000)}]})});
      assert.equal(response.status,201);assert.equal(received.body.attachments[0].data.length,1500000);assert.equal(received.key,'feedback_idempotent_12345');
      const denied=await fetch(origin+'/feedback/inbox');assert.equal(denied.status,403);assert.equal((await denied.json()).error,'feedback_admin_required');
      const image=await fetch(origin+'/feedback/inbox/test/attachments/test',{headers:{Authorization:'Bearer private-admin-token'}});
      assert.equal(image.status,200);assert.deepEqual(Buffer.from(await image.arrayBuffer()),png);
      assert.equal(image.headers.get('cache-control'),'no-store');assert.equal(image.headers.get('x-content-type-options'),'nosniff');
      assert.equal(image.headers.get('content-disposition'),'inline; filename="screenshot.png"');assert.equal(image.headers.get('set-cookie'),null);
    });
  });
});

test('feedback reports service unavailability without forwarding an SSO redirect',async()=>{
  const upstream=express();upstream.get('/feedback/session',(req,res)=>res.redirect('https://auth.example.test/login'));
  await serve(upstream,async base=>{
    const app=express();app.use('/feedback',createAccountsProxy(base));
    await serve(app,async origin=>{
      const response=await fetch(origin+'/feedback/session');assert.equal(response.status,502);
      assert.equal((await response.json()).error,'feedback_service_unavailable');assert.equal(response.headers.get('location'),null);
    });
  });
});
test('widget is served as JavaScript without caching a stale copy', async () => {
  const upstream = express(); upstream.get('/saasy-auth.js', (req, res) => res.type('application/javascript').send('window.SaasyAuth = {};'));
  await serve(upstream, async base => {
    const app = express(); app.use('/saasy-auth.js', createAccountsProxy(base));
    await serve(app, async origin => {
      const response = await fetch(origin + '/saasy-auth.js');
      assert.match(response.headers.get('content-type'), /javascript/);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(await response.text(), 'window.SaasyAuth = {};');
    });
  });
});
