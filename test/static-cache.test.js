const { test } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../server');
test('editor documents revalidate while versioned assets can be cached', async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const base = 'http://127.0.0.1:' + server.address().port;
    for (const path of ['/', '/index.html', '/standalone.html', '/portal-editor']) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-cache'); await response.arrayBuffer();
    }
    for (const path of ['/server.js','/generation-jobs.js','/api-security.js','/package.json','/test/generation-api.test.js','/scripts/build-standalone.js','/rollback-stamps/2026-10-19-v40/README.md','/docs/LPG-QUALITY-IMPROVEMENT-PLAN-2026-10-19.md','/unknown','/js/%2e%2e/server.js']) {
      const response=await fetch(base+path);assert.equal(response.status,404,path);await response.arrayBuffer();
    }
    const asset = await fetch(base + '/js/requirements-editor.js?v=20261018d');
    assert.match(asset.headers.get('cache-control'), /max-age=3600/); await asset.arrayBuffer();
  } finally { await new Promise(resolve => server.close(resolve)); }
});
