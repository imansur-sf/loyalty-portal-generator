// Authoring UI for a program brief and live, validated program edits.
(function (root) {
  'use strict';
  const el = id => document.getElementById(id);
  const clone = value => JSON.parse(JSON.stringify(value));
  const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let importSequence = 0, generationSequence = 0, importing = false;
  function fingerprint() {
    const copy = clone(state); delete copy.programReview; delete copy.outputTemplate;
    const text = JSON.stringify({ portal: copy, website: el('quickstart-url')?.value || '' });
    // Compact, non-security edit fingerprint; never duplicate source documents
    // and uploaded image data in the persisted pending proposal.
    let a = 2166136261, b = 5381;
    for (let i = 0; i < text.length; i++) { a = Math.imul(a ^ text.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ text.charCodeAt(i); }
    return `${text.length}:${a >>> 0}:${b >>> 0}`;
  }
  function defaults() { return { mode: 'b2c', objective: '', text: '', roles: '', sources: [] }; }
  function sync() {
    state.brief = { ...defaults(), ...state.brief };
    for (const field of ['mode', 'objective', 'text', 'roles']) if (el('brief-' + field)) el('brief-' + field).value = state.brief[field];
    if (el('output-template')) el('output-template').value = state.outputTemplate || 'classic';
    syncExperience();
    root.LPGVariants?.render();
    renderSources(); renderReview();
  }
  function syncExperience() {
    if (el('program-mode-note')) el('program-mode-note').textContent = state.program
      ? 'Your portal includes branded content and demo interactions. Fine-tune any section, or open program details to adjust points, rewards and assumptions.'
      : 'Generate a complete branded portal, then explore layouts without regenerating content.';
  }
  function changed() {
    state.brief = state.brief || defaults();
    for (const field of ['mode', 'objective', 'text', 'roles']) state.brief[field] = el('brief-' + field).value;
    scheduleDraftRecovery();
  }
  function renderSources() {
    const list = el('brief-sources'); if (!list) return;
    list.innerHTML = (state.brief?.sources || []).map((source, i) => `<li><span>${safe(source.name)} · ${source.pages.length} page(s)</span> <button type="button" data-remove-source="${i}" aria-label="Remove ${safe(source.name)}">Remove</button>${source.warning ? `<p class="program-warning">${safe(source.warning)}</p>` : ''}</li>`).join('');
  }
  async function attach(event) {
    const sequence = ++importSequence, project = typeof projectEpoch === 'number' ? projectEpoch : 0;
    const files = Array.from(event.target.files || []), existing = clone(state.brief.sources || []);
    const sourceSignature = JSON.stringify(existing);
    el('brief-import-status').textContent = '';
    importing = true;
    try {
      if (existing.length + files.length > 3) throw new Error('Attach up to three documents. Remove an existing document first.');
      const added = [];
      for (const file of files) added.push(await LPGRequirements.extractFile(file, text => { if (sequence === importSequence) el('brief-import-status').textContent = text; }));
      if (sequence !== importSequence || project !== projectEpoch || JSON.stringify(state.brief.sources) !== sourceSignature) return;
      LPGRequirements.sourcesText(existing.concat(added));
      state.brief.sources = existing.concat(added);
      renderSources(); scheduleDraftRecovery();
      el('brief-import-status').textContent = 'Documents ready. Review with AI to interpret their requirements.';
    } catch (error) { if (sequence === importSequence) el('brief-import-status').textContent = error.message; }
    finally { if (sequence === importSequence) importing = false; event.target.value = ''; }
  }
  function sourceEdited(event) {
    const button = event.target.closest('[data-remove-source]'); if (!button) return;
    importSequence++; importing = false; state.brief.sources.splice(Number(button.dataset.removeSource), 1); renderSources(); scheduleDraftRecovery();
  }
  function wantsProgram() {
    return !!(state.programEnabled || state.brief?.text?.trim() || state.brief?.objective?.trim() || state.brief?.roles?.trim() || state.brief?.sources?.length || ['b2b', 'both'].includes(state.brief?.mode));
  }
  async function analyze(client, rawURL) {
    if (importing) throw new Error('Please wait for the requirements documents to finish reading.');
    changed();
    const sequence = ++generationSequence, before = fingerprint(), project = projectEpoch;
    const brief = clone(state.brief);
    const checkCurrent = () => {
      if (sequence !== generationSequence || project !== projectEpoch || before !== fingerprint()) {
        throw new Error('The editor changed while AI was working. Your edits were kept; generate again when ready.');
      }
    };
    let website = null;
    setQuickStartStatus('Reading the customer website and requirements…', true);
    if (rawURL) {
      const url = PageHost._analysis.normalizeURL(rawURL);
      if (!url) throw new Error('Enter a valid website URL or leave it blank.');
      try {
        const html = await (client === root.PageHost ? client.proxyFetch(url) : client.scrapeViaCorsProxy(url));
        website = PageHost._analysis.extractCoreHTML(html, url);
      } catch (_) { website = { url, note: 'Website could not be read. Brand knowledge is a demo assumption, not verified website evidence.' }; }
    }
    checkCurrent();
    const modes = brief.mode === 'both' ? ['b2c', 'b2b'] : [brief.mode];
    const generated = {}, warnings = [];
    for (const mode of modes) {
      const audienceBrief = { ...brief, mode };
      const existing = root.LPGVariants.get(mode);
      const current = existing?.program ? clone(existing.program) : null;
      setQuickStartStatus(`Designing the ${mode.toUpperCase()} loyalty experience…`, true);
      const prompt = LPGRequirements.buildPrompt(audienceBrief, website, current);
      let result = await client.callLLM({ system: LPGRequirements.SYSTEM, prompt, maxTokens: 12000, tier: 'balanced', responseFormat: 'json' });
      checkCurrent();
      let proposal;
      try { proposal = LPGRequirements.parseResponse(result, LPGProgram, mode); }
      catch (error) {
        if (!['invalid_program', 'incomplete_program'].includes(error.code)) throw error;
        setQuickStartStatus(error.code === 'incomplete_program' ? 'AI is completing the program response. Your requirements are retained…' : 'AI is correcting a program detail…', true);
        result = await client.callLLM({ system: LPGRequirements.SYSTEM,
          prompt: LPGRequirements.repairPrompt(prompt, error), maxTokens: 16000, tier: 'balanced', responseFormat: 'json' });
        checkCurrent();
        try { proposal = LPGRequirements.parseResponse(result, LPGProgram, mode); }
        catch (retryError) {
          if (['invalid_program', 'incomplete_program'].includes(retryError.code)) retryError.message = 'AI could not finish a valid program after an automatic retry. Your portal and requirements documents were kept. Please try generating again.';
          throw retryError;
        }
      }
      setQuickStartStatus(`Creating ${mode.toUpperCase()} offers, rewards and branded imagery…`, true);
      const content = await root.LPGPortalContent.generate({ client, brief: audienceBrief, program: proposal.program,
        website, rawURL, existing: current ? existing : null,
        onStatus: phase => { checkCurrent(); setQuickStartStatus(phase === 'generating_images' ? `Creating ${mode.toUpperCase()} portal imagery…` : `Personalizing ${mode.toUpperCase()} portal content…`, true); } });
      checkCurrent();
      if (content._meta?.image_warning || content._meta?.image_error) warnings.push(`${mode.toUpperCase()}: ${content._meta.image_warning || 'Some images could not be generated. You can add images or generate again.'}`);
      const portal = existing || root.LPGVariants.snapshot();
      applyAnalysis(content, portal, { render: false });
      portal.program = proposal.program; portal.programEnabled = true; portal.programReview = null;
      portal.brand.name = proposal.program.providerName || content.brandName;
      portal.brand.programName = proposal.program.name;
      portal.member.name = proposal.program.member.name;
      portal.member.points = proposal.program.opening.redeemable;
      portal.tiers = proposal.program.tiers.map(tier => ({ name: tier.name, points: tier.threshold }));
      portal.outputTemplate = mode === state.activeVariant ? state.outputTemplate : existing?.outputTemplate || state.outputTemplate || 'classic';
      generated[mode] = portal;
    }
    checkCurrent();
    root.LPGVariants.replace(generated, brief.mode === 'both' ? state.activeVariant : brief.mode);
    populateFormFromState(); renderDynamicSections(); renderPaletteButtons(); schedulePreview();
    if (el('portal-edit-status')) el('portal-edit-status').textContent = warnings.join(' ');
    setQuickStartStatus(modes.length === 2 ? 'Both portals are ready. Switch between B2C and B2B, choose a layout, and save your project.' : 'Your branded portal is ready. Refine any section, choose a layout, and save your project.', false);
  }
  function sample() {
    generationSequence++;
    changed();
    const mode = state.brief.mode === 'both' ? state.activeVariant : state.brief.mode;
    const program = LPGProgram.normalize({ mode, providerName: state.brand.name || 'Demo Provider', name: state.brand.programName || 'Loyalty Program', approvalRequired: mode === 'b2b', opening: { qualifying: 1000, redeemable: 500 },
      assumptions: ['This is an editable demonstration sample, not an interpretation of the attached requirements.', 'Opening balances are fictional demo values.'] });
    const portal = root.LPGVariants.snapshot();
    portal.program = program; portal.programEnabled = true; portal.programReview = null;
    root.LPGVariants.replace({ [mode]: portal }, mode);
    state.programReview = { program, brand: {}, snapshot: fingerprint() };
    renderReview(); updateProgram(); root.LPGVariants.render();
  }
  function editProgram() {
    if (!state.program) return sample();
    generationSequence++;
    state.programReview = { program: clone(state.program), brand: {}, snapshot: fingerprint(), live: true };
    renderReview(); scheduleDraftRecovery();
  }
  function input(label, path, value, type = 'text', extra = '') {
    return `<label class="program-field">${safe(label)}<input type="${type}" data-program-path="${path}" value="${safe(value)}" ${type === 'number' ? 'min="0" step="any"' : 'maxlength="160"'} ${extra}></label>`;
  }
  function check(label, path, value) {
    return `<label class="program-check"><input type="checkbox" data-program-path="${path}" ${value ? 'checked' : ''}> ${safe(label)}</label>`;
  }
  function renderReview() {
    const box = el('program-review'); if (!box) return;
    const review = state.programReview; box.hidden = !review;
    if (!review) return;
    const p = review.program;
    el('program-review-fields').innerHTML = `${Object.keys(review.brand).some(key => ['primary', 'accent'].includes(key)) ? `<h4>Brand colors</h4><p class="program-help">Changes update the preview immediately. You can also refine them in Colors & Theme.</p><div class="program-grid">${['primary', 'accent'].filter(key => review.brand[key]).map(key => `<label class="program-field">${key === 'primary' ? 'Primary' : 'Accent'}<input type="color" data-review-brand="${key}" value="${safe(review.brand[key])}"></label>`).join('')}</div>` : ''}<div class="program-grid">
      ${input('Program name', 'name', p.name)}${input('Program provider', 'providerName', p.providerName)}
      ${input('Demo person', 'member.name', p.member.name)}${p.mode === 'b2b' ? input('Participating business', 'member.organization', p.member.organization) : ''}
      ${input('Qualifying points name', 'currencies.qualifyingName', p.currencies.qualifyingName)}${input('Redeemable points name', 'currencies.redeemableName', p.currencies.redeemableName)}
      ${input('Opening qualifying points', 'opening.qualifying', p.opening.qualifying, 'number')}${input('Opening redeemable points', 'opening.redeemable', p.opening.redeemable, 'number')}
      ${input('Redeemable points per currency unit', 'currencies.pointsPerUnit', p.currencies.pointsPerUnit, 'number')}${input('Monthly qualifying cap for fixed activities (blank = none)', 'freeContentMonthlyCap', p.freeContentMonthlyCap ?? '', 'number')}
    </div>
    <h4>Tiers</h4>${p.tiers.map((t, i) => `<div class="program-row">${input('Name', `tiers.${i}.name`, t.name)}${input('Qualifying threshold', `tiers.${i}.threshold`, t.threshold, 'number')}${input('Spend RP multiplier', `tiers.${i}.multiplier`, t.multiplier, 'number')}<button type="button" data-remove-program="tiers:${i}" aria-label="Remove tier ${safe(t.name)}">Remove</button></div>`).join('')}
    <button type="button" data-add-program="tiers">Add tier</button>
    <h4>Earning activities</h4>${p.earnRules.map((r, i) => `<fieldset class="program-edit-card"><legend>${safe(r.kind === 'spend' ? 'Eligible spend' : 'Fixed activity')}</legend><div class="program-grid">${input('Activity name', `earnRules.${i}.name`, r.name)}${input(r.kind === 'spend' ? 'Demo spend amount' : 'Occurrences per click', `earnRules.${i}.amount`, r.amount, 'number', r.kind === 'fixed' ? 'readonly' : '')}${r.kind === 'spend' ? input('TP per unit spent', `earnRules.${i}.qualifyingRate`, r.qualifyingRate, 'number') + input('Base RP per unit spent', `earnRules.${i}.redeemableRate`, r.redeemableRate, 'number') : input('TP award', `earnRules.${i}.qualifyingPoints`, r.qualifyingPoints, 'number') + input('RP award', `earnRules.${i}.redeemablePoints`, r.redeemablePoints, 'number')}${input('Monthly TP cap (blank = none)', `earnRules.${i}.monthlyCap`, r.monthlyCap ?? '', 'number')}</div><button type="button" data-remove-program="earnRules:${i}">Remove activity</button></fieldset>`).join('')}
    <button type="button" data-add-program="spend">Add spend activity</button> <button type="button" data-add-program="fixed">Add fixed activity</button>
    <h4>Rewards</h4>${p.rewards.map((r, i) => `<div class="program-row">${input('Reward name', `rewards.${i}.name`, r.name)}${input('Redeemable points cost', `rewards.${i}.cost`, r.cost, 'number')}<button type="button" data-remove-program="rewards:${i}">Remove reward</button></div>`).join('')}<button type="button" data-add-program="rewards">Add reward</button>
    <h4>People and roles</h4>${p.mode === 'b2b' ? check('Redemptions require approval', 'approvalRequired', p.approvalRequired) : ''}
    ${p.roles.map((r, i) => `<div class="program-row">${input('Role name', `roles.${i}.name`, r.name)}${check('Can request / redeem', `roles.${i}.canRequest`, r.canRequest)}${p.mode === 'b2b' ? check('Can approve', `roles.${i}.canApprove`, r.canApprove) : ''}<button type="button" data-remove-program="roles:${i}">Remove role</button></div>`).join('')}<button type="button" data-add-program="roles">Add custom role</button>
    <label class="program-field">Starting demo role<select data-program-path="member.role">${p.roles.map(r => `<option value="${safe(r.id)}" ${r.id === p.member.role ? 'selected' : ''}>${safe(r.name)}</option>`).join('')}</select></label>
    <h4>Assumptions and open decisions</h4><p class="program-help">These remain author notes and are excluded from the exported portal. Edit the rules above to resolve them.</p><label class="program-field">Notes (one per line)<textarea data-program-path="assumptions" rows="5" maxlength="30000">${safe(p.assumptions.join('\n'))}</textarea></label>
    <h4>Requirement coverage proposed by AI</h4><p class="program-help">Interactive means a simulated portal action. Source references and coverage still need your review.</p>
    <ul class="program-coverage">${p.requirements.map(r => `<li><strong>${safe(r.status)}</strong> · ${safe(r.text)}<small>${safe(r.source)}${r.module ? ' · ' + safe(r.module) : ''}</small></li>`).join('') || '<li>No document-derived requirements in this sample.</li>'}</ul>
    ${p.futureFeatures.length ? `<h4>Future scope</h4><ul>${p.futureFeatures.map(t => `<li>${safe(t)}</li>`).join('')}</ul>` : ''}`;
    el('program-review-error').textContent = '';
  }
  function reviewInput(event) {
    const target = event.target, path = target.dataset.programPath;
    if (!state.programReview) return;
    generationSequence++;
    if (target.dataset.reviewBrand && /^#[0-9a-f]{6}$/i.test(target.value)) { state.programReview.brand[target.dataset.reviewBrand] = target.value; updateProgram(target.dataset.reviewBrand); return; }
    if (!path) return;
    const keys = path.split('.'); let value = state.programReview.program;
    for (const key of keys.slice(0, -1)) value = value[key];
    const last = keys[keys.length - 1];
    value[last] = target.type === 'checkbox' ? target.checked : path === 'assumptions' ? target.value.split('\n').filter(Boolean) : target.type === 'number' ? (target.value === '' && /Cap$/.test(last) ? null : target.value === '' ? NaN : Number(target.value)) : target.value;
    updateProgram();
  }
  function reviewClick(event) {
    const remove = event.target.closest('[data-remove-program]'), add = event.target.closest('[data-add-program]');
    if (!state.programReview || (!remove && !add)) return;
    generationSequence++;
    const p = state.programReview.program;
    if (remove) {
      const [key, index] = remove.dataset.removeProgram.split(':'); p[key].splice(Number(index), 1);
      if (key === 'roles' && !p.roles.some(r => r.id === p.member.role)) p.member.role = p.roles[0]?.id || '';
    } else {
      const kind = add.dataset.addProgram, id = 'item-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
      if (kind === 'tiers') p.tiers.push({ name: 'New tier', threshold: (p.tiers.at(-1)?.threshold || 0) + 1000, multiplier: 1 });
      else if (kind === 'rewards') p.rewards.push({ id, name: 'New reward', cost: 100 });
      else if (kind === 'roles') p.roles.push({ id, name: 'Custom role', canRequest: true, canApprove: false });
      else p.earnRules.push({ id, name: 'New activity', kind, qualifyingRate: kind === 'spend' ? 1 : 0, redeemableRate: kind === 'spend' ? 1 : 0, qualifyingPoints: kind === 'fixed' ? 25 : 0, redeemablePoints: 0, amount: kind === 'fixed' ? 1 : 100, monthlyCap: null });
    }
    renderReview(); updateProgram();
  }
  // Commit only valid rules so preview, saved projects and exports share one model.
  // Do not rebuild the editor here: replacing inputs would lose focus mid-typing.
  function updateProgram(brandChange = false) {
    const review = state.programReview; if (!review) return false;
    // Colors are independent of incomplete program rules and should still update live.
    if ((brandChange === true || brandChange === 'primary') && review.brand.primary) {
      state.colors.primary = review.brand.primary;
      if (!state.menuColorCustom) state.colors.menu = review.brand.primary;
    }
    if ((brandChange === true || brandChange === 'accent') && review.brand.accent) state.colors.accent = review.brand.accent;
    for (const key of ['primary', 'accent', 'menu']) {
      setVal('color-' + key, state.colors[key]); setVal('hex-' + key, state.colors[key]);
    }
    const result = LPGProgram.validate(review.program);
    scheduleDraftRecovery();
    if (!result.valid) {
      el('program-review-error').textContent = 'Preview is showing the last valid program. ' + result.errors.join('; ');
      if (brandChange) schedulePreview();
      return false;
    }
    // Only changed program identity fields should replace shared brand controls.
    // The author may have edited Brand & Identity while this editor remained open.
    if (!review.live || result.model.providerName !== state.program?.providerName) {
      state.brand.name = result.model.providerName || review.brand.name || state.brand.name;
    }
    if (!review.live || result.model.name !== state.program?.name) state.brand.programName = result.model.name;
    if (root.LPGPortalContent) {
      const mapped = root.LPGPortalContent.reconcile(state, result.model, { existing: state, allowMissing: true });
      state.vouchers = mapped.vouchers.map(cleanVoucher); state.earnMore = mapped.earnMore.map(cleanEarnMore);
    }
    state.program = result.model; state.programEnabled = true; state.schemaVersion = 2;
    state.activeVariant = result.model.mode;
    state.member.name = result.model.member.name; state.member.points = result.model.opening.redeemable;
    state.tiers = result.model.tiers.map(tier => ({ name: tier.name, points: tier.threshold }));
    setVal('brand-name', state.brand.name); setVal('program-name', state.brand.programName);
    setVal('member-name', state.member.name); setVal('member-points', state.member.points);
    for (let i = 0; i < 3; i++) for (const part of ['name', 'points']) {
      const input = el(`tier${i+1}-${part}`); if (!input) continue;
      input.disabled = !state.tiers[i]; input.value = state.tiers[i]?.[part] ?? '';
    }
    if (el('tier-progress')) el('tier-progress').disabled = true;
    renderVouchers(); renderEarnMore();
    review.live = true;
    el('program-review-error').textContent = '';
    syncExperience(); schedulePreview();
    return true;
  }
  function apply() {
    generationSequence++;
    if (!updateProgram(!state.programReview?.live)) return;
    state.programReview = null;
    renderReview(); scheduleDraftRecovery();
    setQuickStartStatus('Preview updated. You can save your project or export the portal.', false);
  }
  function reset() {
    root.LPGImages?.invalidate();
    importSequence++; generationSequence++; importing = false;
    state.schemaVersion = 2; state.brief = defaults(); state.program = null; state.programReview = null; state.programEnabled = false; state.outputTemplate = 'classic'; state.activeVariant = 'b2c'; state.variants = {};
    if (el('brief-import-status')) el('brief-import-status').textContent = '';
    sync();
  }
  function init() {
    sync();
    for (const field of ['mode', 'objective', 'text', 'roles']) el('brief-' + field).addEventListener('input', changed);
    el('brief-files').addEventListener('change', attach); el('brief-sources').addEventListener('click', sourceEdited);
    el('program-review-fields').addEventListener('input', reviewInput); el('program-review-fields').addEventListener('click', reviewClick);
    el('program-sample').addEventListener('click', sample); el('program-edit').addEventListener('click', editProgram);
    el('program-apply').addEventListener('click', apply);
    el('program-discard').addEventListener('click', () => { generationSequence++; state.programReview = null; renderReview(); scheduleDraftRecovery(); });
    el('output-template').addEventListener('change', event => { state.outputTemplate = event.target.value; schedulePreview(); });
    root.LPGVariants?.init();
  }
  root.LPGRequirementsEditor = { init, sync, reset, wantsProgram, analyze, fingerprint, apply, sample, editProgram, isImporting: () => importing };
})(window);
