const express = require('express');
const path = require('path');
const fs = require('node:fs');
const { createAccountsProxy } = require('./accounts-proxy');
const { createGenerationJobs } = require('./generation-jobs');
const { scrapeText } = require('./outbound-fetch');
const { createApiSecurity } = require('./api-security');
const { createDurableStore } = require('./durable-store');
const { createDurableGenerationJobs } = require('./durable-generation-jobs');
const requirements = require('./js/requirements');
const portalContent = require('./js/portal-content');

function nativeGeminiSchema(schema) {
  // Live checks against the configured Gemini model rejected the full contracts
  // with numeric bounds/array limits, but accepted the same typed schemas with
  // these three constraints omitted. Keep the canonical prompt/model validators
  // strict; adapt only the provider transport, with no paid retry or fallback.
  if (Array.isArray(schema)) return schema.map(nativeGeminiSchema);
  if (!schema || typeof schema !== 'object') return schema;
  return Object.fromEntries(Object.entries(schema)
    .filter(([key]) => !['maxItems','minimum','maximum'].includes(key))
    .map(([key,value]) => [key,key === 'properties'
      ? Object.fromEntries(Object.entries(value).map(([name,child]) => [name,nativeGeminiSchema(child)]))
      : nativeGeminiSchema(value)]));
}


const app = express();
const PORT = process.env.PORT || 3000;
let buildId = null;
try {
  const metadata = JSON.parse(fs.readFileSync(path.join(__dirname,'assets/build-meta.json'),'utf8'));
  if (typeof metadata.buildId === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(metadata.buildId)) buildId = metadata.buildId;
} catch { /* Local development may not have built browser assets yet. */ }
// Heroku appends the real connecting address as the last X-Forwarded-For hop.
// Outside Heroku trust no proxy unless deployment explicitly configures hops.
const proxyHops = Number(process.env.LPG_TRUST_PROXY_HOPS ?? (process.env.DYNO ? 1 : 0));
app.set('trust proxy', Number.isInteger(proxyHops) && proxyHops >= 0 && proxyHops <= 3 ? proxyHops : 0);
const capabilitySecret = process.env.LPG_GENERATION_SECRET;
if (capabilitySecret && capabilitySecret.length < 32) throw new Error('LPG_GENERATION_SECRET must contain at least 32 characters');
if (process.env.LPG_DATABASE_URL && !capabilitySecret) throw new Error('Durable generation requires LPG_GENERATION_SECRET');
const durableStore = process.env.LPG_DATABASE_URL ? createDurableStore() : null;
const apiSecurity = createApiSecurity({ ...(capabilitySecret ? { secret: capabilitySecret } : {}), store: durableStore });

// ============================================================
// Configuration
// ============================================================
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const MAX_SCRAPE_BYTES = 3_000_000;
const SCRAPE_TIMEOUT_MS = 15_000;

// Image generation
const IMAGE_GEN_MODEL = 'gemini-3.1-flash-image';
const IMAGE_GEN_TIMEOUT_MS = 90_000;
const MAX_IMAGE_GEN_BATCH = 4; // shared by direct and pollable endpoints

// Gemini model mapping by tier
const TIER_MODELS = {
  fast: 'gemini-3.5-flash-lite',
  balanced: 'gemini-3.5-flash',
  powerful: 'gemini-3.1-pro-preview'
};
const DEFAULT_MODEL = TIER_MODELS.balanced;

// ============================================================
// Middleware
// ============================================================
app.use('/projects', express.json({ limit: '20mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(['/saasy-auth.js', '/auth', '/projects'], createAccountsProxy());
app.use((error, req, res, next) => {
  if (error.type === 'entity.too.large') return res.status(413).json({ error: 'payload_too_large' });
  next(error);
});

app.use('/api', apiSecurity.cors);
app.post('/api/capability', apiSecurity.issue);

// ============================================================
// API Routes
// ============================================================

// --- Health Check ---
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'loyalty-portal',
    version: 6,
    release: /^[a-f0-9]{7,40}$/i.test(process.env.HEROKU_SLUG_COMMIT || process.env.SOURCE_VERSION || '') ? (process.env.HEROKU_SLUG_COMMIT || process.env.SOURCE_VERSION) : buildId,
    buildId,
    storage: durableStore ? 'postgres' : 'memory',
    durable_generation: Boolean(durableStore),
    generation_capabilities: true,
    generation_jobs: true,
    endpoints: ['POST /api/capability', 'GET /api/scrape', 'POST /api/jobs', 'GET /api/jobs/:id', 'DELETE /api/jobs/:id', 'POST /api/llm', 'POST /api/generate-images', 'GET /api/health'],
    llm_configured: Boolean(GEMINI_API_KEY)
  });
});

// --- Scrape Endpoint ---
app.get('/api/scrape', async (req, res) => {
  if (!req.query.url || typeof req.query.url !== 'string') return res.status(400).json({error:'missing_url'});
  const release = await apiSecurity.reserve(req,res,{scrape:true});
  if (!release) return;
  try {
    const result = await scrapeText(req.query.url,{maxBytes:MAX_SCRAPE_BYTES,timeoutMs:SCRAPE_TIMEOUT_MS});
    res.set({'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Cache-Control':'no-store'});
    res.json(result);
  } catch(error) {
    res.status(error.status || 502).json({error:error.code && error.status ? error.code : 'network_error'});
  } finally {await release();}
});

app.use(['/api/llm','/api/generate-image','/api/generate-images'], (req,res,next)=>{if(!apiSecurity.authorize(req,res))next();});

// --- LLM Endpoint (Gemini API) ---
function validateLLM(req, res) {
  if (!GEMINI_API_KEY) {
    return res.status(503).json({
      error: 'llm_not_configured',
      hint: 'Set GEMINI_API_KEY config var on this Heroku app'
    });
  }

  const { prompt, system } = req.body || {};

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'missing_prompt' });
  }
  if (prompt.length > 200_000) {
    return res.status(413).json({ error: 'prompt_too_long' });
  }
  if (system !== undefined && typeof system !== 'string') {
    return res.status(400).json({error:'invalid_system'});
  }
  if (system && system.length > 20_000) {
    return res.status(413).json({ error: 'system_too_long' });
  }
  if (req.body.responseFormat !== undefined && req.body.responseFormat !== 'json') {
    return res.status(400).json({ error: 'invalid_response_format' });
  }
  const { responseContract, responseAudience, responseJsonSchema, responseSchema } = req.body;
  // Clients select reviewed contracts; schemas are never supplied by clients.
  const programContract = responseContract === 'loyalty-program-v2';
  const presentationContract = responseContract === 'loyalty-presentation-v1';
  if (responseJsonSchema !== undefined || responseSchema !== undefined ||
      (responseContract === undefined && responseAudience !== undefined) ||
      (responseContract !== undefined && (req.body.responseFormat !== 'json' ||
        (!programContract && !presentationContract) ||
        (programContract && !['b2c','b2b'].includes(responseAudience)) ||
        (presentationContract && responseAudience !== undefined)))) {
    return res.status(400).json({ error: 'invalid_response_contract' });
  }
  if ((programContract && typeof requirements.responseSchema !== 'function') ||
      (presentationContract && typeof portalContent.responseSchema !== 'function')) {
    return res.status(503).json({ error: 'response_schema_unavailable' });
  }


}

async function handleLLM(req, res) {
  const { prompt, system, tier, maxTokens, responseFormat, responseContract, responseAudience } = req.body || {};

  const chosenTier = ['fast', 'balanced', 'powerful'].includes(tier) ? tier : 'balanced';
  const model = TIER_MODELS[chosenTier] || DEFAULT_MODEL;
  const tokens = Math.min(Math.max(parseInt(maxTokens, 10) || 8000, 100), 16000);

  // Build Gemini API request
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

  const geminiBody = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: tokens }
  };
  if (responseFormat === 'json') {
    geminiBody.generationConfig.responseMimeType = 'application/json';
    if (responseContract === 'loyalty-program-v2') geminiBody.generationConfig.responseJsonSchema = nativeGeminiSchema(requirements.responseSchema(responseAudience));
    if (responseContract === 'loyalty-presentation-v1') geminiBody.generationConfig.responseJsonSchema = nativeGeminiSchema(portalContent.responseSchema());
    // The output limit also includes internal reasoning. Reserve capacity for
    // complete portal JSON instead of spending most of it on hidden thinking.
    geminiBody.generationConfig.thinkingConfig = { thinkingLevel: 'low' };
  }

  // Add system instruction if provided
  if (system && typeof system === 'string' && system.trim()) {
    geminiBody.systemInstruction = { parts: [{ text: system }] };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const upstream = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody),
      signal: controller.signal
    });

    if (upstream.status === 400) {
      const body = await upstream.text().catch(() => '');
      return res.status(502).json({ error: 'gemini_bad_request' });
    }
    if (upstream.status === 401 || upstream.status === 403) {
      return res.status(502).json({ error: 'gemini_auth_failed' });
    }
    if (upstream.status === 429) {
      return res.status(429).json({ error: 'gemini_rate_limited' });
    }
    if (upstream.status >= 500) {
      return res.status(502).json({ error: 'gemini_unavailable', status: upstream.status });
    }
    if (!upstream.ok) {
      const body = await upstream.text().catch(() => '');
      return res.status(502).json({ error: 'gemini_failed', status: upstream.status });
    }

    const data = await upstream.json();

    // Extract text from Gemini response
    const text = data?.candidates?.[0]?.content?.parts
      ?.filter(p => p.text && !p.thought)
      .map(p => p.text)
      .join('') || '';

    const finishReason = data?.candidates?.[0]?.finishReason || null;
    console.info(`[LLM] finish=${finishReason || 'unknown'} output_tokens=${data.usageMetadata?.candidatesTokenCount || 0} thought_tokens=${data.usageMetadata?.thoughtsTokenCount || 0}`);
    if (!text && finishReason !== 'MAX_TOKENS') {
      return res.status(502).json({ error: 'gemini_empty_response' });
    }

    res.json({
      text,
      finish_reason: finishReason,
      model_used: model,
      tier: chosenTier,
      usage: data.usageMetadata || null
    });
  } catch (err) {
    const code = err && err.name === 'AbortError' ? 'timeout' : 'network_error';
    res.status(502).json({ error: code, message: 'The generation provider did not complete the request.' });
  } finally {
    clearTimeout(timeout);
  }
}
function protectedHandler(kind, handler) {
  return async (req,res) => {
    const images=kind==='images'?req.body.prompts.length:kind==='image'?1:0;
    // Reserve the maximum output plus a conservative input-token bound. Failed
    // provider work also consumes quota so retries cannot bypass the budget.
    const tokens=kind==='llm' ? Math.min(Math.max(parseInt(req.body.maxTokens,10)||8000,100),16000) + (req.body.prompt.length+(req.body.system?.length||0)) : 0;
    const release=await apiSecurity.reserve(req,res,{images,tokens});
    if(!release)return;
    try {await handler(req,res);}finally{await release();}
  };
}
const secureLLM=protectedHandler('llm',handleLLM);
app.post('/api/llm', (req, res) => {
  if (!validateLLM(req, res)) return secureLLM(req, res);
});

// --- Image Generation (Gemini) ---
// Single image
function validateImage(req, res) {
  if (!GEMINI_API_KEY) {
    return res.status(503).json({ error: 'llm_not_configured', hint: 'Set GEMINI_API_KEY' });
  }

  const { prompt } = req.body || {};
  if (!prompt || typeof prompt !== 'string' || prompt.length > 2000) {
    return res.status(400).json({ error: 'invalid_prompt' });
  }

}

async function handleImage(req, res) {
  const { prompt } = req.body || {};

  try {
    const result = await generateImage(prompt);
    res.json(result);
  } catch (err) {
    console.error('[ImageGen] single_failed');
    res.status(502).json({ error: 'image_gen_failed' });
  }
}
const secureImage=protectedHandler('image',handleImage);
app.post('/api/generate-image', (req, res) => {
  if (!validateImage(req, res)) return secureImage(req, res);
});

// Batch image generation — runs in parallel, returns partial results on individual failures
function validateImages(req, res) {
  if (!GEMINI_API_KEY) {
    return res.status(503).json({ error: 'llm_not_configured', hint: 'Set GEMINI_API_KEY' });
  }

  const { prompts } = req.body || {};
  if (!Array.isArray(prompts) || prompts.length === 0 || prompts.length > MAX_IMAGE_GEN_BATCH) {
    return res.status(400).json({ error: 'invalid_prompts', max: MAX_IMAGE_GEN_BATCH });
  }

  // Validate each prompt
  for (const p of prompts) {
    if (!p || !p.slot || !p.prompt || typeof p.prompt !== 'string' || p.prompt.length > 2000) {
      return res.status(400).json({ error: 'invalid_prompt_entry', slot: p?.slot });
    }
  }

}

async function handleImages(req, res) {
  const { prompts } = req.body || {};

  // Run all in parallel
  const results = await Promise.allSettled(
    prompts.map(async (p) => {
      const result = await generateImage(p.prompt);
      return { slot: p.slot, ...result };
    })
  );

  const output = results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    console.warn('[ImageGen] batch_slot_failed');
    return { slot: prompts[i].slot, error: 'generation_failed' };
  });

  res.json({ results: output });
}
const secureImages=protectedHandler('images',handleImages);
app.post('/api/generate-images', (req, res) => {
  if (!validateImages(req, res)) return secureImages(req, res);
});

// Short requests keep AI work independent of Heroku's router deadline.
const generationJobs = (durableStore ? createDurableGenerationJobs : createGenerationJobs)({
  store: durableStore, secret: capabilitySecret,
  handlers: { llm: secureLLM, images: secureImages, image: secureImage },
  validators: { llm: validateLLM, images: validateImages, image: validateImage }
});
app.post('/api/jobs', (req,res,next)=>{if(!apiSecurity.authorize(req,res))next();}, generationJobs.submit);
app.get('/api/jobs/:id', generationJobs.poll);
app.delete('/api/jobs/:id', generationJobs.remove);
app.post('/api/jobs/:id/resume', (req,res,next)=>{if(!apiSecurity.authorize(req,res))next();}, (req,res)=>generationJobs.resume ? generationJobs.resume(req,res) : res.status(409).json({error:'generation_not_resumable'}));
app.get('/api/capabilities', (req,res)=>res.set('Cache-Control','no-store').json({version:1,adapter:'heroku',responseContracts:['loyalty-program-v2','loyalty-presentation-v1'],guestGeneration:true,requiresAccount:false,capabilityEndpoint:'/api/capability',scrape:'/api/scrape',llm:'/api/llm',images:'/api/generate-images',jobs:{submit:'/api/jobs',poll:'/api/jobs/:id',cancel:'/api/jobs/:id',resume:'/api/jobs/:id/resume',durable:Boolean(durableStore),idempotency:Boolean(durableStore),automaticPaidReplay:false,resultRetentionSeconds:{llm:86400,image:3600,images:3600}},limits:{imageBatch:MAX_IMAGE_GEN_BATCH}}));
app.get('/api/ready',async(req,res)=>{
  try{if(durableStore)await durableStore.check();res.set('Cache-Control','no-store').json({ok:true,storage:durableStore?'postgres':'memory',llm_configured:Boolean(GEMINI_API_KEY)});}
  catch{res.status(503).json({ok:false,error:'generation_storage_unavailable'});}
});
app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));

// Shared image generation helper
async function generateImage(prompt) {
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_GEN_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const geminiBody = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ['IMAGE'] }
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_GEN_TIMEOUT_MS);

  try {
    const upstream = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody),
      signal: controller.signal
    });

    if (!upstream.ok) {
      const body = await upstream.text().catch(() => '');
      throw new Error('image_provider_failed');
    }

    const data = await upstream.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find(p => p.inlineData);

    if (!imagePart) {
      throw new Error('No image in Gemini response');
    }

    const mime = imagePart.inlineData.mimeType || 'image/jpeg';
    const imageData = `data:${mime};base64,${imagePart.inlineData.data}`;

    return { imageData };
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================
// Static file serving (AFTER API routes)
// ============================================================
// Serve only browser assets and the explicitly supported entry documents.
// Source modules, tests, operational notes and rollback backups are private.
const assetOptions = { maxAge:'1h', index:false, dotfiles:'deny', fallthrough:true };
app.use('/js', express.static(path.join(__dirname,'js'),assetOptions));
app.use('/assets', express.static(path.join(__dirname,'assets'),assetOptions));
app.get(['/', '/index.html', '/portal-editor'], (req,res)=>{
  res.set('Cache-Control','no-cache').sendFile(path.join(__dirname,'index.html'));
});
app.get('/standalone.html', (req,res)=>{
  res.set('Cache-Control','no-cache').sendFile(path.join(__dirname,'standalone.html'));
});
app.use((req,res)=>res.status(404).type('text/plain').send('Not found'));

// ============================================================
// Start server
// ============================================================
if (require.main === module) app.listen(PORT, '::', () => {
  console.log(`Loyalty Portal Generator running on port ${PORT} (IPv6 dual-stack)`);
  console.log(`LLM backend: ${GEMINI_API_KEY ? 'Gemini API configured' : 'NOT configured (set GEMINI_API_KEY)'}`);
});
module.exports = app;
