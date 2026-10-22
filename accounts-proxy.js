const DEFAULT_ACCOUNTS_URL = 'https://sassysolutions-accounts-8215113235cf.aster-virginia.herokuapp.com';

function createAccountsProxy(baseUrl = process.env.SAASY_ACCOUNTS_URL || DEFAULT_ACCOUNTS_URL) {
  return async (req, res) => {
    const unavailable = req.originalUrl.startsWith('/feedback') ? 'feedback_service_unavailable' : 'sign_in_service_unavailable';
    const headers = {};
    for (const name of ['accept', 'authorization', 'content-type', 'idempotency-key']) {
      const value = req.get(name);
      if (value) headers[name] = value;
    }
    const options = { method: req.method, headers, redirect: 'manual', signal: AbortSignal.timeout(30000) };
    if (!['GET', 'HEAD'].includes(req.method) && req.body !== undefined) options.body = JSON.stringify(req.body);
    try {
      const upstream = await fetch(`${baseUrl.replace(/\/$/, '')}${req.originalUrl}`, options);
      // An upstream SSO redirect is not a usable accounts API response. Never
      // forward its cookies or send the browser to an unrelated login origin.
      if (upstream.status >= 300 && upstream.status < 400) {
        return res.status(502).json({ error: unavailable });
      }
      const contentType = upstream.headers.get('content-type');
      if (contentType) res.set('Content-Type', contentType);
      // Feedback attachments remain private and use the validated filename
      // supplied by accounts. Never forward cookies or redirect locations.
      if (req.originalUrl.startsWith('/feedback')) {
        const disposition = upstream.headers.get('content-disposition');
        if (disposition) res.set('Content-Disposition', disposition);
        res.set('X-Content-Type-Options', 'nosniff');
        res.set('Content-Security-Policy', "default-src 'none'; sandbox");
      }
      res.set('Cache-Control', 'no-store');
      res.status(upstream.status).send(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) {
      console.error('Accounts service request failed:', error.name);
      res.status(502).json({ error: unavailable });
    }
  };
}

module.exports = { createAccountsProxy, DEFAULT_ACCOUNTS_URL };
