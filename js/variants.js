// One active portal plus inactive audience snapshots; shared source documents are stored once.
(function (root) {
  'use strict';
  const fields = ['brand', 'colors', 'menuColorCustom', 'tiers', 'tierProgress', 'member', 'sections',
    'vouchers', 'offers', 'badges', 'clubs', 'earnMore', 'benefits', 'profileTasks', 'upsell', 'navLinks',
    'footerLinks', 'program', 'programReview', 'programEnabled', 'outputTemplate'];
  const clone = value => JSON.parse(JSON.stringify(value));
  function snapshot(portal = state) {
    const result = {};
    for (const key of fields) if (portal[key] !== undefined) result[key] = clone(portal[key]);
    return result;
  }
  function get(mode) {
    if (mode === state.activeVariant) return snapshot();
    return state.variants?.[mode] ? clone(state.variants[mode]) : null;
  }
  function replace(generated, selected) {
    root.LPGImages?.invalidate();
    const variants = clone(state.variants || {});
    if (state.program || state.brand.name) variants[state.activeVariant || state.program?.mode || 'b2c'] = snapshot();
    for (const mode of ['b2c', 'b2b']) if (generated[mode]) variants[mode] = snapshot(generated[mode]);
    const active = generated[selected] ? selected : Object.keys(generated)[0];
    if (!active || !variants[active]) throw new Error('No portal was generated.');
    Object.assign(state, variants[active]); delete variants[active];
    state.activeVariant = active; state.variants = variants;
  }
  function show(mode) {
    if (!['b2c', 'b2b'].includes(mode) || mode === state.activeVariant || !state.variants?.[mode]) return;
    root.LPGImages?.invalidate();
    const next = state.variants[mode], previous = snapshot();
    state.variants[state.activeVariant || 'b2c'] = previous;
    delete state.variants[mode]; Object.assign(state, next); state.activeVariant = mode;
    populateFormFromState(); renderDynamicSections(); renderPaletteButtons(); schedulePreview();
  }
  function render() {
    const box = document.getElementById('portal-variants'); if (!box) return;
    box.hidden = !state.program && !Object.keys(state.variants || {}).length;
    for (const mode of ['b2c', 'b2b']) {
      const button = document.getElementById('variant-' + mode); if (!button) continue;
      const active = state.activeVariant === mode;
      button.disabled = !active && !state.variants?.[mode];
      button.setAttribute('aria-pressed', String(active));
    }
    const note = document.getElementById('variant-note');
    if (note) note.textContent = 'Editing ' + (state.activeVariant === 'b2b' ? 'B2B business' : 'B2C member') + ' portal. Save Project keeps both audiences; download exports the selected one.';
  }
  function init() {
    for (const mode of ['b2c', 'b2b']) document.getElementById('variant-' + mode)?.addEventListener('click', () => show(mode));
    render();
  }
  root.LPGVariants = { snapshot, get, replace, show, render, init };
})(window);
