// Cinematic-only presentation controls. Shared loyalty data and icon assets stay intact.
(function (root) {
  'use strict';
  const fields = [
    { id: 'arrival', label: 'Header', fields: [
      ['arrivalEyebrow', 'Header – Intro line', 'A WORLD OF BELONGING'],
      ['arrivalTitle', 'Header', 'Your world. Opening up.'],
      ['arrivalDescription', 'Header – Closer', 'Every moment brings you closer to something extraordinary.'],
      ['statusEyebrow', 'Next chapter – Intro line', 'YOUR NEXT CHAPTER'],
      ['statusTitle', 'Next chapter – Heading', 'Good things. Already in motion.'],
      ['scrollNote', 'Scroll hint', 'Scroll to see what’s ahead ↓'],
      ['arrivalAction', 'Header – Action label', 'Explore your rewards']
    ] },
    { id: 'progress', label: 'Status and progress', fields: [
      ['progressEyebrow', 'Status – Intro line', 'THE WAY FORWARD'],
      ['progressTitle', 'Status – Heading', 'A little closer. A little more yours.'],
      ['progressDescription', 'Status – Closer', 'Your status today, and the milestones ahead.'],
      ['progressSummary', 'Next tier – Member message (header and status)', 'Explore eligible activities to move toward your next membership tier.']
    ] },
    { id: 'possibility', label: 'Rewards', fields: [
      ['possibilityEyebrow', 'Rewards – Intro line', 'POSSIBILITY BECOMES REALITY'],
      ['possibilityTitle', 'Rewards – Heading', 'You’ve earned a world of possibilities.'],
      ['possibilityDescription', 'Rewards – Closer', 'Put your points toward something worth looking forward to.']
    ] },
    { id: 'benefits', label: 'Benefits', fields: [
      ['benefitsEyebrow', 'Benefits – Intro line', 'MORE THAN POINTS'],
      ['benefitsTitle', 'Benefits – Heading', 'Recognition. In all the right places.'],
      ['benefitsDescription', 'Benefits – Closer', 'The benefits that make your membership feel like yours.']
    ] },
    { id: 'discovery', label: 'Discovery', fields: [
      ['discoveryEyebrow', 'Discovery – Intro line', 'A LITTLE FURTHER'],
      ['discoveryTitle', 'Discovery – Heading', 'More to discover.'],
      ['discoveryDescription', 'Discovery – Closer', 'Fresh opportunities to get more from your membership.']
    ] },
    { id: 'details', label: 'Your account', fields: [
      ['detailsEyebrow', 'Account – Intro line', 'YOUR MEMBERSHIP'],
      ['detailsTitle', 'Account – Heading', 'The finer details.'],
      ['detailsDescription', 'Account – Closer', 'Your activity, community, and account. All within reach.']
    ] }
  ];
  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  function safeImage(value) {
    if (typeof value !== 'string' || value.length > 12000000) return '';
    const image = value.trim();
    if (/^data:image\/(?:png|jpe?g|gif|webp|avif|svg\+xml)(?:;base64)?,/i.test(image)) return image;
    try { const url = new URL(image); return ['https:', 'http:'].includes(url.protocol) ? image : ''; } catch (_) { return ''; }
  }
  function normalize(value) {
    const source = value && typeof value === 'object' ? value : {};
    const copy = {};
    for (const group of fields) for (const [key, , fallback] of group.fields) {
      copy[key] = typeof source.copy?.[key] === 'string' ? source.copy[key].slice(0, 8000) : fallback;
    }
    const card = source.card || {};
    return { copy, card: {
      artworkFit: card.artworkFit === 'contain' ? 'contain' : 'cover',
      artworkPosition: /^\d{1,3}% \d{1,3}%$/.test(card.artworkPosition || '') ? card.artworkPosition : '50% 50%',
      mode: card.mode === 'image' ? 'image' : 'loyalty',
      markMode: ['brand', 'custom'].includes(card.markMode) ? card.markMode : 'orbit',
      markImageUrl: safeImage(card.markImageUrl), markImageData: safeImage(card.markImageData),
      artworkImageUrl: safeImage(card.artworkImageUrl), artworkImageData: safeImage(card.artworkImageData),
      showDetails: card.showDetails !== false
    } };
  }
  function current() { return typeof state === 'object' ? state : null; }
  function settings() {
    const portal = current(); if (!portal) return null;
    if (!portal.cinematic || !portal.cinematic.copy || !portal.cinematic.card) portal.cinematic = normalize(portal.cinematic);
    return portal.cinematic;
  }
  function changed() {
    if (typeof schedulePreview === 'function') schedulePreview();
    if (typeof scheduleDraftRecovery === 'function') scheduleDraftRecovery();
  }
  const versions = new Map(), busy = new Map();
  const bump = slot => versions.set(slot, (versions.get(slot) || 0) + 1);
  function asset(type, index) {
    if (type === 'benefit' || type === 'benefit-cover') {
      const item = current()?.benefits?.[index];
      return item ? { item, url: 'coverImageUrl', data: 'coverImageData', slot: 'benefit-cover-' + index } : null;
    }
    const card = settings()?.card;
    if (!card) return null;
    if (type === 'card-mark') return { item: card, url: 'markImageUrl', data: 'markImageData', slot: type };
    if (type === 'card-artwork') return { item: card, url: 'artworkImageUrl', data: 'artworkImageData', slot: type };
    return null;
  }
  function setImage(type, index, value) {
    const target = asset(type, index); if (!target) return;
    bump(target.slot);
    const image = safeImage(value);
    target.item[target.url] = image.startsWith('data:') ? '' : image;
    target.item[target.data] = image.startsWith('data:') ? image : '';
    if (image) ensureRemove(target.slot);
    changed();
  }
  function ensureRemove(slot) {
    const wrapper = document.querySelector(`[data-cinematic-asset="${slot}"]`);
    if (!wrapper || wrapper.querySelector('[data-cinematic-remove]') || wrapper.querySelector('[onclick^="clearImage"]')) return;
    const remove = document.createElement('button'); remove.type = 'button'; remove.dataset.cinematicRemove = slot;
    remove.className = 'text-xs text-red-500'; remove.textContent = '✕ Remove image';
    remove.onclick = () => root.clearImage(slot); wrapper.appendChild(remove);
  }
  function widget(type, index, label, value) {
    const slot = type === 'benefit-cover' ? 'benefit-cover-' + index : type;
    return `<div data-cinematic-asset="${slot}" class="space-y-2">${imageUploadHTML(slot, label, safeImage(value))}
      <label class="block text-xs text-gray-600" for="prompt-${slot}">Image direction (optional)</label>
      <input id="prompt-${slot}" type="text" maxlength="1200" placeholder="Describe the image you want" class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg">
      <button type="button" data-cinematic-generate="${type}"${Number.isInteger(index) ? ` data-index="${index}"` : ''} class="px-3 py-2 text-xs rounded-lg bg-blue-50 text-blue-700">${type === 'benefit-cover' ? 'Generate cover' : 'Generate image'}</button>
      <p id="status-${slot}" role="status" class="text-xs text-gray-600"></p></div>`;
  }
  function renderBenefitCover(index, benefit) {
    if (current()?.outputTemplate !== 'cinematic' || !Number.isInteger(index) || index < 0) return '';
    return widget('benefit-cover', index, 'Cinematic cover image', benefit?.coverImageData || benefit?.coverImageUrl || '');
  }
  function bindAsset(type, index) {
    const target = asset(type, index); if (!target) return;
    const slot = target.slot;
    initImageUpload('drop-' + slot, 'preview-' + slot, 'url-' + slot, value => {
      if (asset(type, index)?.item === target.item) setImage(type, index, value);
    });
    // Cancel AI as soon as a user starts typing; upload URLs have a debounce.
    const url = document.getElementById('url-' + slot);
    if (url) url.oninput = () => bump(slot);
    const prompt = document.getElementById('prompt-' + slot);
    if (prompt) prompt.oninput = () => bump(slot);
    const button = document.querySelector(`[data-cinematic-asset="${slot}"] [data-cinematic-generate]`);
    if (button) button.onclick = () => generateAsset(type, index);
  }
  function initBenefitCoverUploads() {
    if (current()?.outputTemplate !== 'cinematic') return;
    current().benefits?.forEach((_, index) => bindAsset('benefit-cover', index));
  }
  function render() {
    const host = document.getElementById('cinematic-settings'), portal = current();
    if (!host || !portal) return;
    host.hidden = portal.outputTemplate !== 'cinematic';
    if (host.hidden) return;
    const config = settings();
    host.innerHTML = `<div class="space-y-4 mt-4"><h3 class="font-semibold">Cinematic Journey</h3>
      <p class="text-xs text-gray-600">Customize each chapter. Press Enter in a text field to place words on separate lines. Clear a field to omit its text.</p>
      ${fields.map(group => `<details class="rounded-lg border border-gray-200 p-3"><summary class="cursor-pointer font-semibold text-sm">${group.label}</summary><div class="space-y-3 mt-3">${group.fields.map(([key,label]) => `<label class="block text-xs text-gray-700" for="cinematic-copy-${key}">${label}<textarea id="cinematic-copy-${key}" data-cinematic-copy="${key}" rows="2" maxlength="8000" class="block w-full mt-1 px-3 py-2 text-sm border border-gray-300 rounded-lg">${escape(config.copy[key])}</textarea></label>`).join('')}</div></details>`).join('')}
      <details class="rounded-lg border border-gray-200 p-3"><summary class="cursor-pointer font-semibold text-sm">Membership card</summary><div class="space-y-3 mt-3">
        <label class="block text-xs" for="cinematic-card-mode">Card appearance</label>
        <select id="cinematic-card-mode" class="w-full border rounded-lg p-2"><option value="loyalty">Live loyalty card (default)</option><option value="image">Custom card artwork</option></select>
        <div id="cinematic-mark-controls"><label class="block text-xs" for="cinematic-card-mark">Card emblem</label><select id="cinematic-card-mark" class="w-full border rounded-lg p-2"><option value="orbit">Orbital emblem (default)</option><option value="brand">Brand logo</option><option value="custom">Custom emblem image</option></select>
          <div id="cinematic-custom-mark">${widget('card-mark', null, 'Card emblem image', config.card.markImageData || config.card.markImageUrl)}</div></div>
        <div id="cinematic-artwork-controls">${widget('card-artwork', null, 'Full card artwork', config.card.artworkImageData || config.card.artworkImageUrl)}
          <label class="flex gap-2 text-xs mt-3"><input id="cinematic-card-details" type="checkbox">Keep live brand, tier, and member text over the artwork</label>
          <p class="text-xs text-gray-600">Without artwork, the loyalty card appears automatically.</p></div>
      </div></details></div>`;
    host.querySelectorAll('[data-cinematic-copy]').forEach(input => input.addEventListener('input', () => {
      root.LPGEditor?.record('Edit cinematic copy',input.dataset.cinematicCopy);settings().copy[input.dataset.cinematicCopy] = input.value; changed();
    }));
    const mode = document.getElementById('cinematic-card-mode'), mark = document.getElementById('cinematic-card-mark');
    const details = document.getElementById('cinematic-card-details');
    mode.value = config.card.mode; mark.value = config.card.markMode; details.checked = config.card.showDetails;
    const visibility = () => {
      document.getElementById('cinematic-mark-controls').hidden = config.card.mode === 'image';
      document.getElementById('cinematic-artwork-controls').hidden = config.card.mode !== 'image';
      document.getElementById('cinematic-custom-mark').hidden = config.card.markMode !== 'custom';
    };
    mode.onchange = () => { root.LPGEditor?.record('Change card appearance'); config.card.mode = mode.value; bump('card-artwork'); visibility(); changed(); };
    mark.onchange = () => { root.LPGEditor?.record('Change card emblem'); config.card.markMode = mark.value; bump('card-mark'); visibility(); changed(); };
    details.onchange = () => { root.LPGEditor?.record('Change card text'); config.card.showDetails = details.checked; changed(); };
    visibility(); bindAsset('card-mark'); bindAsset('card-artwork');
  }
  function context() {
    const portal = current();
    return JSON.stringify({ epoch: typeof projectEpoch === 'number' ? projectEpoch : null,
      audience: portal?.activeVariant, template: portal?.outputTemplate, brand: portal?.brand, colors: portal?.colors,
      program: portal?.program, cinematic: portal?.cinematic });
  }
  async function generateAsset(type, index) {
    const target = asset(type, index), portal = current();
    if (!target || portal?.outputTemplate !== 'cinematic') return false;
    const slot = target.slot;
    root.LPGImages?.cancel?.('drop-' + slot);
    bump(slot); const version = versions.get(slot);
    const config = settings(), captured = context(), original = JSON.stringify(target.item);
    const uploadContext = root.LPGImages?.captureContext?.();
    const prompt = document.getElementById('prompt-' + slot)?.value || '';
    const payload = JSON.parse(JSON.stringify({ brandName: portal.brand?.name || '', industry: portal.brand?.industry || 'generic',
      colors: portal.colors || {}, benefits: portal.benefits || [], cinematic: config }));
    const destination = type === 'benefit-cover' || type === 'benefit' ? payload.benefits[index] : payload.cinematic.card;
    destination[target.url] = ''; destination[target.data] = '';
    if (slot.startsWith('benefit-cover-')) destination.coverPrompt = prompt;
    else if (type === 'card-mark') { destination.markMode = 'custom'; destination.markPrompt = prompt; }
    else { destination.mode = 'image'; destination.artworkPrompt = prompt; }
    const button = document.querySelector(`[data-cinematic-asset="${slot}"] [data-cinematic-generate]`);
    const status = document.getElementById('status-' + slot);
    busy.set(slot, version); if (button) button.disabled = true;
    if (status) status.textContent = 'Generating image…';
    try {
      if (!root.LocalAI?.fillMissingImages) throw new Error('Image generation is unavailable.');
      await root.LocalAI.fillMissingImages(payload, { onlySlots: [slot], outputTemplate: 'cinematic' });
      const now = asset(type, index);
      if (current() !== portal || portal.cinematic !== config || captured !== context() || versions.get(slot) !== version ||
          now?.item !== target.item || JSON.stringify(target.item) !== original ||
          (uploadContext && !root.LPGImages.isContextCurrent(uploadContext))) {
        if (busy.get(slot) === version && status?.isConnected) status.textContent = 'The editor changed. Your current image was kept.';
        return false;
      }
      const image = safeImage(destination[target.data] || destination[target.url]);
      if (!image) throw new Error('No image was returned. Try again or upload an image.');
      root.LPGEditor?.record('Generate image');setImage(type, index, image);
      if (status?.isConnected) status.textContent = 'Image generated.';
      const preview = document.getElementById('preview-' + slot), url = document.getElementById('url-' + slot);
      if (preview) { preview.src = image; preview.classList.remove('hidden'); }
      if (url) url.value = image.startsWith('data:') ? '' : image;
      ensureRemove(slot);
      return true;
    } catch (error) {
      if (versions.get(slot) === version && status?.isConnected) status.textContent = error.message || 'Image generation failed. Try again.';
      return false;
    } finally {
      if (busy.get(slot) === version) { busy.delete(slot); if (button?.isConnected) button.disabled = false; }
    }
  }
  let initialized = false;
  function init() {
    if (!initialized) {
      document.addEventListener('imageClear', event => {
        const id = event.detail?.id || '';
        if (id === 'card-mark' || id === 'card-artwork') setImage(id, undefined, '');
        else if (/^benefit-cover-\d+$/.test(id)) setImage('benefit-cover', Number(id.slice(14)), '');
      });
      initialized = true;
    }
    render();
  }
  root.LPGCinematic = { fields, normalize, sync: render, render, init, renderBenefitCover, initBenefitCoverUploads, generateAsset };
})(window);
