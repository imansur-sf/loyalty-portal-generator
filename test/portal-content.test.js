const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const model = require('../js/program-model');

function harness(fill) {
  const context = vm.createContext({ console, URL, LPGProgram: model });
  context.window = context;
  for (const file of ['pagehost', 'portal-content']) vm.runInContext(fs.readFileSync(`js/${file}.js`, 'utf8'), context);
  context.LocalAI = { fillMissingImages: fill || (async () => ({ generated: 0, total_empty: 0 })) };
  return context;
}
function content(program) {
  return {
    brandName: program.providerName, programName: program.name, industry: 'generic',
    colors: { primary: '#112233', accent: '#445566', dark: '#112233', secondary: '#445566' },
    brand: { logoUrl: 'https://brand.test/logo.png' }, tiers: [],
    vouchers: program.rewards.map(reward => ({ programRewardId: reward.id, title: reward.name, description: 'A member learning benefit.', vendor: program.providerName, actionType: 'points', actionValue: '999 wrong points', emoji: '🎁', imageUrl: 'https://brand.test/course.png', expiry: 'Tomorrow' })),
    earnMore: program.earnRules.map(rule => ({ programRuleId: rule.id, title: rule.name, description: 'Develop your professional skills.', hasCodeInput: true })),
    offers: [{ title: 'Explore certification learning', description: 'Find your next learning path.', cta: 'Explore', imageUrl: 'https://invented.test/not-in-candidates.png' }],
    badges: [{ name: 'Learning milestone', emoji: '⭐', color: 'blue' }],
    clubs: [{ name: 'Professional community', description: 'Connect around your interests.', memberCount: 0 }],
    benefits: [{ name: 'Member learning resources' }],
    profileTasks: [{ description: 'Choose your professional interests', cta: 'Personalize' }],
    upsell: { title: 'Explore membership benefits', subtitle: 'Your next chapter', price: '', period: '', tagline: 'Find more ways to participate.', cta: 'Explore benefits', bgImageUrl: '' },
    navLinks: ['Overview', 'Rewards', 'Community'],
    footerLinks: Object.fromEntries(['col1', 'col2', 'col3'].map(key => [key, { title: 'Member resources', links: ['Learning', 'Support'] }])),
    member: { name: 'Ignored Person', joinDate: 'October 2026' }
  };
}
const makeProgram = overrides => model.normalize({ providerName: 'ISACA', name: 'Professional Rewards', ...overrides });

test('rich generation retains website candidates and requests full branded content and image enrichment', async () => {
  const program = makeProgram();
  const phases = [];
  let call, enriched;
  const context = harness(async (data, { onStatus }) => {
    enriched = data;
    onStatus('generating_images');
    data.offers[0].imageData = 'data:image/png;base64,generated';
    return { generated: 1, total_empty: 8 };
  });
  const website = { url: 'https://brand.test', title: 'ISACA', bodyText: 'Professional certification learning',
    navLinkCandidates: ['Learning', 'Membership'], images: [{ url: 'https://brand.test/logo.png', role: 'logo' }, { url: 'https://brand.test/course.png', alt: 'Certification learning', role: 'product' }] };
  const output = await context.LPGPortalContent.generate({
    client: { callLLM: async args => { call = args; return { response: JSON.stringify(content(program)) }; } },
    brief: { text: 'Personalize for professional members.', sources: [{ pages: [{ text: 'RAW_DOCUMENT_SHOULD_NOT_BE_DUPLICATED' }] }] },
    program, website, onStatus: phase => phases.push(phase)
  });
  const prompt = JSON.parse(call.prompt);
  assert.match(call.system, /UNTRUSTED SOURCE DATA/);
  assert.match(prompt.websitePresentationContext, /Certification learning/);
  assert.equal(prompt.websiteContext.navLinkCandidates[0], 'Learning');
  assert.ok(!call.prompt.includes('RAW_DOCUMENT_SHOULD_NOT_BE_DUPLICATED'));
  assert.equal(output.brand.logoUrl, website.images[0].url);
  assert.equal(output.vouchers[0].imageUrl, website.images[1].url);
  assert.equal(enriched.offers[0].imageUrl, '');
  assert.equal(output.offers[0].imageData, 'data:image/png;base64,generated');
  assert.equal(output._meta.images_generated, 1);
  assert.deepEqual(phases, ['analyzing_content', 'generating_images']);
  assert.equal(output.vouchers[0].actionValue, `${program.rewards[0].cost} ${program.currencies.redeemableName}`);
  assert.equal(output.vouchers[0].expiry, '');
  assert.equal(output.earnMore[0].hasCodeInput, false);
});

test('requirements-only generation accepts no URL or source documents and uses validated program identity', async () => {
  const program = makeProgram({ mode: 'b2b', rewards: [], earnRules: [] });
  let prompt;
  const context = harness();
  const output = await context.LPGPortalContent.generate({ program, brief: { text: 'A partner account experience' },
    client: { callLLM: async args => { prompt = JSON.parse(args.prompt); return JSON.stringify(content(program)); } } });
  assert.equal(prompt.author.mode, 'b2b');
  assert.equal(prompt.websiteContext.url, '');
  assert.equal(output.vouchers.length, 0); assert.equal(output.earnMore.length, 0);
  assert.equal(output.brandName, 'ISACA'); assert.equal(output.member.name, program.member.name);
  assert.equal(output._meta.source_url, '');
});

test('generation rejects truncated or incomplete rich content before images or state changes', async () => {
  const program = makeProgram();
  let imageCalls = 0;
  const context = harness(async () => { imageCalls++; return {}; });
  for (const value of ['{"vouchers":[]', JSON.stringify({ vouchers: [] }), JSON.stringify({ ...content(program), offers: [] })]) {
    await assert.rejects(context.LPGPortalContent.generate({ program, client: { callLLM: async () => value } }), /kept/);
  }
  assert.equal(imageCalls, 0);
});

test('generation rejects extra, omitted, duplicate, or unlinked redeemable rewards', async () => {
  const program = makeProgram();
  const context = harness();
  for (const alter of [
    data => data.vouchers.push({ ...data.vouchers[0], programRewardId: 'invented' }),
    data => { data.vouchers = []; },
    data => data.vouchers.push(data.vouchers[0]),
    data => { delete data.vouchers[0].programRewardId; }
  ]) {
    const data = content(program); alter(data);
    await assert.rejects(context.LPGPortalContent.generate({ program, client: { callLLM: async () => JSON.stringify(data) } }), /match the validated program/);
  }
});

test('refinement supplies existing author copy to AI and preserves palette and uploaded assets', async () => {
  const program = makeProgram();
  const existing = { ...content(program), programEnabled: true, program, brand: { name: 'ISACA', logoData: 'data:image/png;base64,logo' } };
  existing.vouchers[0].imageData = 'data:image/png;base64,uploaded';
  existing.vouchers[0].description = 'Author description';
  existing.offers[0].title = 'Author-edited offer';
  existing.colors.primary = '#ABCDEF';
  const before = JSON.stringify(existing);
  const next = makeProgram({ rewards: [{ ...program.rewards[0], cost: 250 }] });
  const context = harness(async data => { assert.equal(data.vouchers[0].imageData, 'data:image/png;base64,uploaded'); return { generated: 0 }; });
  const output = await context.LPGPortalContent.generate({ program: next, existing,
    client: { callLLM: async ({ prompt }) => {
      const before = JSON.parse(prompt).existingPresentation;
      assert.equal(before.offers[0].title, 'Author-edited offer');
      assert.equal(before.vouchers[0].description, 'Author description');
      assert.ok(!prompt.includes('base64,uploaded'));
      const response = content(next); response.offers[0].title = before.offers[0].title;
      response.vouchers[0].description = before.vouchers[0].description;
      return JSON.stringify(response);
    } } });
  assert.equal(output.vouchers[0].actionValue, `250 ${next.currencies.redeemableName}`);
  assert.equal(output.vouchers[0].description, 'Author description');
  assert.equal(output.offers[0].title, 'Author-edited offer');
  assert.equal(output.colors.primary, '#ABCDEF');
  assert.equal(output.brand.logoData, 'data:image/png;base64,logo');
  assert.equal(JSON.stringify(existing), before);
});

test('notes-driven refinement can replace offer and reward copy without discarding uploaded images', async () => {
  const program = makeProgram();
  const existing = { ...content(program), programEnabled: true, program, brand: { name: 'ISACA' } };
  existing.offers[0].imageData = 'data:image/png;base64,offer';
  existing.vouchers[0].imageData = 'data:image/png;base64,reward';
  const revised = content(program);
  revised.offers[0].title = 'Explore cybersecurity certification';
  revised.offers[0].description = 'Start a cybersecurity learning journey.';
  revised.vouchers[0].description = 'Use points toward your professional development.';
  const context = harness();
  const output = await context.LPGPortalContent.generate({ program, existing, brief: { text: 'Change offers to cybersecurity and improve reward copy.' },
    client: { callLLM: async () => JSON.stringify(revised) } });
  assert.equal(output.offers[0].title, revised.offers[0].title);
  assert.equal(output.offers[0].description, revised.offers[0].description);
  assert.equal(output.vouchers[0].description, revised.vouchers[0].description);
  assert.equal(output.offers[0].imageData, 'data:image/png;base64,offer');
  assert.equal(output.vouchers[0].imageData, 'data:image/png;base64,reward');
});

test('live rule reconciliation preserves mapped imagery and removes deleted rewards without regenerating', () => {
  const initial = makeProgram({ rewards: [{ id: 'course', name: 'Course', cost: 100 }, { id: 'old', name: 'Removed', cost: 200 }] });
  const existing = { ...content(initial), programEnabled: true, program: initial };
  existing.vouchers[0].imageData = 'data:image/png;base64,course';
  const program = makeProgram({ rewards: [{ id: 'course', name: 'Advanced course', cost: 300 }, { id: 'new', name: 'New benefit', cost: 50 }] });
  const context = harness();
  const output = context.LPGPortalContent.reconcile(existing, program, { existing, allowMissing: true });
  assert.equal(output.vouchers.length, 2);
  assert.equal(output.vouchers[0].title, 'Advanced course');
  assert.equal(output.vouchers[0].imageData, 'data:image/png;base64,course');
  assert.equal(output.vouchers[1].programRewardId, 'new');
  assert.ok(output.vouchers[1].description);
  assert.ok(!output.vouchers.some(item => item.programRewardId === 'old'));
});

test('image service errors are surfaced in metadata while complete copy remains available', async () => {
  const program = makeProgram();
  const context = harness(async () => ({ generated: 0, total_empty: 10, error: 'HTTP 503' }));
  const output = await context.LPGPortalContent.generate({ program, client: { callLLM: async () => JSON.stringify(content(program)) } });
  assert.equal(output._meta.image_error, 'HTTP 503');
  assert.equal(output.vouchers[0].title, program.rewards[0].name);
  assert.equal(output._meta.images_empty, 10);
});

test('LocalAI exposes its existing image pipeline for all selected text adapters', () => {
  const context = harness();
  vm.runInContext(fs.readFileSync('js/localai.js', 'utf8'), context);
  assert.equal(typeof context.LocalAI.fillMissingImages, 'function');
});

test('image enrichment covers benefits and all normal portal slots in backend-sized batches', async () => {
  const context = harness();
  vm.runInContext(fs.readFileSync('js/localai.js', 'utf8'), context);
  const program = makeProgram();
  const data = content(program);
  data.vouchers = Array.from({ length: 4 }, (_, index) => ({ title: `Reward ${index}` }));
  data.offers = Array.from({ length: 2 }, (_, index) => ({ title: `Offer ${index}` }));
  data.badges = Array.from({ length: 3 }, (_, index) => ({ name: `Badge ${index}` }));
  data.clubs = Array.from({ length: 2 }, (_, index) => ({ name: `Club ${index}` }));
  data.benefits = Array.from({ length: 7 }, (_, index) => ({ name: `Benefit ${index}` }));
  const batches = [];
  context.fetch = async (_url, options) => {
    const prompts = JSON.parse(options.body).prompts; batches.push(prompts);
    assert.ok(prompts.length <= 12);
    return { ok: true, json: async () => ({ results: prompts.map(item => ({ slot: item.slot, imageData: 'data:image/png;base64,generated' })) }) };
  };
  const result = await context.LocalAI.fillMissingImages(data);
  assert.equal(batches.length, 2);
  assert.equal(result.generated, 19); assert.equal(result.remaining, 0);
  assert.equal(result.warning, undefined);
  for (const key of ['vouchers', 'offers', 'badges', 'clubs', 'benefits']) assert.ok(data[key].every(item => item.imageData));
  assert.ok(batches[0].some(item => item.slot === 'benefit-0'));
  assert.ok(!batches.flat().some(item => /logo/.test(item.slot)));
});

test('image enrichment preserves supplied assets and reports partial failures including invalid results', async () => {
  const context = harness();
  vm.runInContext(fs.readFileSync('js/localai.js', 'utf8'), context);
  const data = { brandName: 'ISACA', vouchers: [{ title: 'Existing', imageUrl: 'https://brand.test/voucher.png' }],
    benefits: [{ name: 'Uploaded', imageData: 'data:image/png;base64,upload' }, { name: 'Generate' }, { name: 'Unavailable' }] };
  context.fetch = async (_url, options) => {
    const prompts = JSON.parse(options.body).prompts;
    assert.equal(prompts.length, 2);
    return { ok: true, json: async () => ({ results: [{ slot: prompts[0].slot, imageData: 'data:image/png;base64,new' },
      { slot: prompts[0].slot, imageData: 'data:image/png;base64,duplicate' }, { slot: prompts[1].slot, imageData: 'javascript:bad' }] }) };
  };
  const result = await context.LocalAI.fillMissingImages(data);
  assert.equal(result.generated, 1); assert.equal(result.failed, 1); assert.equal(result.remaining, 1);
  assert.match(result.warning, /1 remain empty/);
  assert.equal(data.vouchers[0].imageUrl, 'https://brand.test/voucher.png');
  assert.equal(data.benefits[0].imageData, 'data:image/png;base64,upload');
});

test('exceptionally large portals have bounded image work and rate limits stop further batches', async () => {
  const context = harness();
  vm.runInContext(fs.readFileSync('js/localai.js', 'utf8'), context);
  const data = { vouchers: Array.from({ length: 60 }, (_, index) => ({ title: `Reward ${index}` })) };
  let batches = 0;
  context.fetch = async (_url, options) => { batches++; return { ok: true, json: async () => ({ results: JSON.parse(options.body).prompts.map(item => ({ slot: item.slot, imageData: 'data:image/png;base64,new' })) }) }; };
  const result = await context.LocalAI.fillMissingImages(data);
  assert.equal(batches, 4); assert.equal(result.generated, 48); assert.equal(result.skipped, 12);
  assert.match(result.warning, /48-image limit/);
  batches = 0;
  context.fetch = async () => { batches++; return { ok: false, status: 429 }; };
  const limited = await context.LocalAI.fillMissingImages({ benefits: Array.from({ length: 20 }, () => ({ name: 'Benefit' })) });
  assert.equal(batches, 1); assert.equal(limited.remaining, 20); assert.match(limited.warning, /HTTP 429/);
});

function graphicsHarness(encode, { width = 2400, height = 1600, decodeError = false } = {}) {
  const context = harness();
  const calls = [], draws = [];
  context.Image = class {
    constructor() { this.naturalWidth = width; this.naturalHeight = height; }
    set src(_value) { if (decodeError) this.onerror(); else this.onload(); }
  };
  context.document = { createElement: type => {
    assert.equal(type, 'canvas');
    const canvas = {
      width: 0, height: 0,
      getContext: () => ({ fillRect() {}, drawImage(_source, _x, _y, w, h) { draws.push([w, h]); } }),
      toDataURL(mime, quality) { calls.push({ mime, quality, width: canvas.width, height: canvas.height }); return encode(mime, quality, canvas); }
    };
    return canvas;
  } };
  vm.runInContext(fs.readFileSync('js/localai.js', 'utf8'), context);
  return { context, calls, draws };
}

test('generated raster optimization bounds card and hero dimensions and uses WebP at high quality first', async () => {
  const input = 'data:image/png;base64,' + 'a'.repeat(983000);
  const { context, calls, draws } = graphicsHarness(mime => `data:${mime};base64,` + 'b'.repeat(190000));
  const card = await context.LocalAI.optimizeGeneratedImage(input);
  assert.equal(card.optimized, true); assert.ok(card.imageData.length <= 200 * 1024);
  assert.equal(calls[0].mime, 'image/webp'); assert.equal(calls[0].quality, 0.82);
  assert.deepEqual(draws[0], [960, 640]);
  await context.LocalAI.optimizeGeneratedImage(input, { hero: true });
  assert.deepEqual(draws[1], [1280, 853]);
});

test('optimizer lowers quality then dimensions and supports JPEG when WebP is unavailable', async () => {
  const input = 'data:image/png;base64,' + 'a'.repeat(983000);
  const webp = graphicsHarness((mime, quality, canvas) => `data:${mime};base64,` + 'b'.repeat(canvas.width <= 720 && quality <= 0.7 ? 150000 : 300000));
  const compressed = await webp.context.LocalAI.optimizeGeneratedImage(input);
  assert.ok(compressed.imageData.length <= 200 * 1024);
  assert.equal(webp.calls.length, 6);
  assert.equal(webp.calls[4].width, 720); assert.equal(webp.calls[5].quality, 0.7);
  const jpeg = graphicsHarness(mime => mime === 'image/webp' ? 'data:image/png;base64,unsupported' : 'data:image/jpeg;base64,' + 'j'.repeat(100000));
  const fallback = await jpeg.context.LocalAI.optimizeGeneratedImage(input);
  assert.match(fallback.imageData, /^data:image\/jpeg/);
  assert.deepEqual(jpeg.calls.map(call => call.mime), ['image/webp', 'image/jpeg']);
});

test('oversized images are omitted with warnings when optimization cannot meet the budget', async () => {
  const input = 'data:image/png;base64,' + 'a'.repeat(983000);
  const tooLarge = graphicsHarness(mime => `data:${mime};base64,` + 'b'.repeat(300000));
  const output = await tooLarge.context.LocalAI.optimizeGeneratedImage(input);
  assert.equal(output.imageData, ''); assert.match(output.warning, /200 KB budget/);
  assert.equal(tooLarge.calls.length, 12);
  const invalid = graphicsHarness(() => '', { decodeError: true });
  assert.match((await invalid.context.LocalAI.optimizeGeneratedImage(input)).warning, /decoded/);
  const noDOM = harness(); vm.runInContext(fs.readFileSync('js/localai.js', 'utf8'), noDOM);
  assert.match((await noDOM.LocalAI.optimizeGeneratedImage(input)).warning, /optimization is unavailable/);
  const small = 'data:image/png;base64,small';
  assert.equal((await noDOM.LocalAI.optimizeGeneratedImage(small)).imageData, small);
});

test('image enrichment stores compressed results, leaves uploads alone and reports encoding failures', async () => {
  const { context } = graphicsHarness(mime => `data:${mime};base64,` + 'b'.repeat(180000));
  const input = 'data:image/png;base64,' + 'a'.repeat(983000);
  const data = { vouchers: [{ title: 'User upload', imageData: input }, { title: 'Generate' }] };
  context.fetch = async (_url, options) => ({ ok: true, json: async () => ({ results: JSON.parse(options.body).prompts.map(item => ({ slot: item.slot, imageData: input })) }) });
  const result = await context.LocalAI.fillMissingImages(data);
  assert.equal(result.generated, 1); assert.equal(data.vouchers[0].imageData, input);
  assert.ok(data.vouchers[1].imageData.length <= 200 * 1024);
  assert.match(data.vouchers[1].imageData, /^data:image\/webp/);
  const noDOM = harness(); vm.runInContext(fs.readFileSync('js/localai.js', 'utf8'), noDOM);
  noDOM.fetch = context.fetch;
  const omitted = { benefits: [{ name: 'Benefit' }] };
  const failed = await noDOM.LocalAI.fillMissingImages(omitted);
  assert.equal(omitted.benefits[0].imageData, undefined); assert.equal(failed.generated, 0);
  assert.match(failed.warning, /keep the project saveable/);
});
