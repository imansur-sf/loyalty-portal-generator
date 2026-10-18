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
