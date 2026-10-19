const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

function fixture() {
  const dom = new JSDOM('<div id="cinematic-settings"></div><div id="benefit-editor"></div>', { runScripts: 'outside-only' });
  const w = dom.window;
  w.state = { outputTemplate: 'cinematic', brand: { name: 'Acme', industry: 'retail' }, colors: {}, activeVariant: 'b2c', benefits: [{ name: 'Free shipping', imageUrl: 'https://example.com/icon.png' }] };
  w.projectEpoch = 1; w.schedulePreview = () => { w.previews = (w.previews || 0) + 1; };
  w.scheduleDraftRecovery = () => { w.drafts = (w.drafts || 0) + 1; };
  w.eval(fs.readFileSync('js/images.js', 'utf8'));
  w.eval(fs.readFileSync('js/cinematic-settings.js', 'utf8'));
  w.LPGCinematic.init();
  const covers = () => {
    w.document.getElementById('benefit-editor').innerHTML = w.LPGCinematic.renderBenefitCover(0, w.state.benefits[0]);
    w.LPGCinematic.initBenefitCoverUploads();
  };
  covers();
  return { w, api: w.LPGCinematic, covers, close: () => dom.window.close() };
}

test('normalization supplies defaults while preserving intentional blank and multiline scene copy', () => {
  const f = fixture();
  try {
    const config = f.api.normalize({ copy: { arrivalTitle: 'Your world\nOpening up', arrivalDescription: '' }, card: { mode: 'nonsense', markMode: 'nonsense', artworkImageUrl: 'javascript:alert(1)' } });
    assert.equal(config.copy.arrivalTitle, 'Your world\nOpening up');
    assert.equal(config.copy.arrivalDescription, '');
    assert.equal(config.copy.progressTitle, 'A little closer. A little more yours.');
    assert.equal(config.card.mode, 'loyalty'); assert.equal(config.card.markMode, 'orbit');
    assert.equal(config.card.showDetails, true); assert.equal(config.card.artworkImageUrl, '');
    assert.equal(f.api.normalize({ card: { artworkImageData: 'data:image/png;base64,YWJj' } }).card.artworkImageData, 'data:image/png;base64,YWJj');
  } finally { f.close(); }
});

test('scene editors update copy and schedule preview/draft without replacing the active textarea', () => {
  const f = fixture();
  try {
    const input = f.w.document.getElementById('cinematic-copy-arrivalTitle');
    input.value = 'Your world.\nOpening up.'; input.dispatchEvent(new f.w.Event('input'));
    assert.equal(f.w.state.cinematic.copy.arrivalTitle, input.value);
    assert.equal(f.w.document.getElementById(input.id), input);
    assert.equal(f.w.previews, 1); assert.equal(f.w.drafts, 1);
    f.w.state.outputTemplate = 'classic'; f.api.sync();
    assert.equal(f.w.document.getElementById('cinematic-settings').hidden, true);
    assert.equal(f.api.renderBenefitCover(0, f.w.state.benefits[0]), '');
  } finally { f.close(); }
});

test('card defaults to loyalty and can select an emblem or artwork while keeping live text optional', () => {
  const f = fixture();
  try {
    const mode = f.w.document.getElementById('cinematic-card-mode'), mark = f.w.document.getElementById('cinematic-card-mark');
    assert.equal(mode.value, 'loyalty');
    mark.value = 'brand'; mark.dispatchEvent(new f.w.Event('change'));
    assert.equal(f.w.state.cinematic.card.markMode, 'brand');
    mode.value = 'image'; mode.dispatchEvent(new f.w.Event('change'));
    assert.equal(f.w.document.getElementById('cinematic-artwork-controls').hidden, false);
    const details = f.w.document.getElementById('cinematic-card-details'); details.checked = false; details.dispatchEvent(new f.w.Event('change'));
    assert.equal(f.w.state.cinematic.card.showDetails, false);
    f.w.state.cinematic.card.artworkImageUrl = 'https://example.com/card.png';
    f.w.clearImage('card-artwork');
    assert.equal(f.w.state.cinematic.card.artworkImageUrl, '');
    assert.equal(f.w.state.cinematic.card.artworkImageData, '');
  } finally { f.close(); }
});

test('cover generation requests exactly one slot, preserves the icon and supports removal', async () => {
  const f = fixture();
  try {
    let captured;
    f.w.LocalAI = { fillMissingImages: async (payload, options) => { captured = { payload, options }; payload.benefits[0].coverImageData = 'data:image/png;base64,YWJj'; } };
    assert.equal(await f.api.generateAsset('benefit-cover', 0), true);
    assert.deepEqual(Array.from(captured.options.onlySlots), ['benefit-cover-0']);
    assert.equal(captured.options.outputTemplate, 'cinematic');
    assert.equal(f.w.state.benefits[0].imageUrl, 'https://example.com/icon.png');
    assert.equal(f.w.state.benefits[0].coverImageData, 'data:image/png;base64,YWJj');
    f.w.clearImage('benefit-cover-0');
    assert.equal(f.w.state.benefits[0].coverImageData, '');
    assert.equal(f.w.state.benefits[0].imageUrl, 'https://example.com/icon.png');
  } finally { f.close(); }
});

test('generation cannot overwrite an upload, item edit, project/audience change, or changed scene settings', async () => {
  const changes = [
    f => { f.w.state.benefits[0].coverImageUrl = 'https://example.com/manual.png'; },
    f => { f.w.state.benefits[0].name = 'Updated benefit'; },
    f => { f.w.state.benefits[0] = { ...f.w.state.benefits[0] }; },
    f => { f.w.projectEpoch++; },
    f => { f.w.LPGImages.invalidate(); },
    f => { f.w.state.activeVariant = 'b2b'; },
    f => { f.w.state.cinematic.copy.arrivalTitle = 'Different'; },
    f => { const url = f.w.document.getElementById('url-benefit-cover-0'); url.value = 'https://example.com/new.png'; url.dispatchEvent(new f.w.Event('input')); },
    f => { f.w.clearImage('benefit-cover-0'); }
  ];
  for (const change of changes) {
    const f = fixture();
    try {
      let finish;
      f.w.LocalAI = { fillMissingImages: payload => new Promise(resolve => { finish = () => { payload.benefits[0].coverImageData = 'data:image/png;base64,b2xk'; resolve(); }; }) };
      const task = f.api.generateAsset('benefit-cover', 0); change(f); finish();
      assert.equal(await task, false); assert.notEqual(f.w.state.benefits[0].coverImageData, 'data:image/png;base64,b2xk');
    } finally { f.close(); }
  }
});

test('custom card generation passes ephemeral direction and does not persist the prompt', async () => {
  const f = fixture();
  try {
    f.w.document.getElementById('prompt-card-mark').value = 'Etched mountain crest';
    let payload;
    f.w.LocalAI = { fillMissingImages: async p => { payload = p; p.cinematic.card.markImageData = 'data:image/png;base64,YWJj'; } };
    assert.equal(await f.api.generateAsset('card-mark'), true);
    assert.equal(payload.cinematic.card.markMode, 'custom');
    assert.equal(payload.cinematic.card.markPrompt, 'Etched mountain crest');
    assert.equal(f.w.state.cinematic.card.markPrompt, undefined);
  } finally { f.close(); }
});


test('a newer request wins when image generations finish out of order', async () => {
  const f = fixture();
  try {
    const pending = [];
    f.w.LocalAI = { fillMissingImages: payload => new Promise(resolve => pending.push(image => { payload.benefits[0].coverImageData = image; resolve(); })) };
    const oldRequest = f.api.generateAsset('benefit-cover', 0);
    const newRequest = f.api.generateAsset('benefit-cover', 0);
    pending[1]('data:image/png;base64,bmV3');
    assert.equal(await newRequest, true);
    pending[0]('data:image/png;base64,b2xk');
    assert.equal(await oldRequest, false);
    assert.equal(f.w.state.benefits[0].coverImageData, 'data:image/png;base64,bmV3');
    assert.equal(f.w.document.getElementById('status-benefit-cover-0').textContent, 'Image generated.');
  } finally { f.close(); }
});
