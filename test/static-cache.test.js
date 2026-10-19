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
    const asset = await fetch(base + '/js/requirements-editor.js?v=20261018d');
    assert.match(asset.headers.get('cache-control'), /max-age=3600/); await asset.arrayBuffer();
  } finally { await new Promise(resolve => server.close(resolve)); }
});
