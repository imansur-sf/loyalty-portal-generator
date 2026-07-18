// ============================================================
// app.js — Wizard controller, state, preview & export
// ============================================================

// ---- STATE ----
const state = {
  brand: { name: '', industry: 'generic', programName: '', logoUrl: '', logoData: '' },
  colors: { primary: '#2D3748', secondary: '#F7FAFC', accent: '#4299E1', dark: '#1A202C', menu: '#2D3748' },
  menuColorCustom: false,
  tiers: [
    { name: 'Basic', points: 0 },
    { name: 'Plus', points: 2000 },
    { name: 'Premium', points: 5000 }
  ],
  tierProgress: 30,
  member: { name: 'Imran Mansur', number: '234567', points: 1200, email: '', phone: '', joinDate: '', avatarUrl: '', avatarData: '' },
  sections: { vouchers: true, offers: true, badges: true, clubs: true, earnMore: true, profileTasks: true, upsell: true },
  vouchers: [],
  offers: [],
  badges: [],
  clubs: [],
  earnMore: [],
  benefits: [],
  profileTasks: [],
  upsell: {},
  navLinks: [],
  footerLinks: {}
};

let currentStep = 0;
const totalSteps = 7;
let previewTimer = null;

// ---- INIT ----
document.addEventListener('DOMContentLoaded', () => {
  applyIndustryDefaults('generic');
  populateFormFromState();
  renderPaletteButtons();
  renderDynamicSections();
  initImageUpload('drop-logo', 'preview-logo', 'url-logo', (data) => {
    if (data && data.startsWith('data:')) { state.brand.logoData = data; state.brand.logoUrl = ''; }
    else { state.brand.logoUrl = data; state.brand.logoData = ''; }
    schedulePreview();
  });
  initImageUpload('drop-avatar', 'preview-avatar', 'url-avatar', (data) => {
    if (data && data.startsWith('data:')) { state.member.avatarData = data; state.member.avatarUrl = ''; }
    else { state.member.avatarUrl = data; state.member.avatarData = ''; }
    schedulePreview();
  });
  document.addEventListener('imageClear', (e) => {
    if (e.detail.id === 'logo') { state.brand.logoData = ''; state.brand.logoUrl = ''; schedulePreview(); }
    if (e.detail.id === 'avatar') { state.member.avatarData = ''; state.member.avatarUrl = ''; schedulePreview(); }
  });
  updateStepIndicators();
  updateNavButtons();
  schedulePreview();
  initQuickStart();
});

// ---- QUICK START (AI URL analysis) ----
// Two modes:
//   Page Host mode — window.__PROXY_TOKEN__ present, uses tile's AI + proxy
//   Local mode     — BYOK Anthropic key + public CORS proxy for scraping
// Auto-detected on load.
function detectQuickStartMode() {
  if (window.PageHost && window.PageHost.isAvailable()) return 'pagehost';
  return 'local';
}

function initQuickStart() {
  const panel = document.getElementById('quickstart-panel');
  const note = document.getElementById('quickstart-note');
  const badge = document.getElementById('quickstart-mode-badge');
  const byokPanel = document.getElementById('quickstart-byok');
  const keyInput = document.getElementById('quickstart-api-key');
  const input = document.getElementById('quickstart-url');
  const settingsInput = document.getElementById('quickstart-upload-id');
  if (!panel) return;

  // Pre-fill manual override input from localStorage if present
  const storedUploadId = localStorage.getItem('pagehost_upload_id');
  if (storedUploadId && settingsInput) settingsInput.value = storedUploadId;

  // Pre-fill masked API key indicator if a key is stored (don't reveal it)
  if (window.LocalAI && window.LocalAI.hasKey() && keyInput) {
    keyInput.placeholder = 'sk-ant-…' + window.LocalAI.getApiKey().slice(-4).padStart(8, '•');
  }

  const mode = detectQuickStartMode();

  if (mode === 'pagehost') {
    if (badge) { badge.textContent = '⚡ Page Host mode · using tile AI'; badge.classList.remove('local'); }
    if (note) { note.style.display = 'block'; note.innerHTML = 'Running on Page Host — Claude and the CORS proxy are handled by the platform.'; }
    if (byokPanel) byokPanel.style.display = 'none';
  } else {
    if (badge) { badge.textContent = '💻 Local mode · bring your own key'; badge.classList.add('local'); }
    if (note) { note.style.display = 'block'; note.innerHTML = 'Not on Page Host — using your own Anthropic key + a public CORS proxy for scraping. Fully functional for any customer URL.'; }
    if (byokPanel) byokPanel.style.display = 'block';
  }

  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); onQuickStartAnalyze(); }
    });
  }
}

function onLocalAIKeyChange() {
  const val = document.getElementById('quickstart-api-key')?.value || '';
  if (window.LocalAI && val.trim()) window.LocalAI.setApiKey(val.trim());
  // Clear any lingering "missing key" error surface as soon as they type
  const errEl = document.getElementById('quickstart-error');
  if (errEl && /API key/.test(errEl.textContent)) {
    errEl.style.display = 'none';
    errEl.textContent = '';
  }
}

function clearLocalAIKey() {
  if (window.LocalAI) window.LocalAI.setApiKey('');
  const el = document.getElementById('quickstart-api-key');
  if (el) { el.value = ''; el.placeholder = 'sk-ant-…'; }
}

function toggleQuickStartSettings() {
  const el = document.getElementById('quickstart-settings');
  if (el) el.classList.toggle('open');
}

function onQuickStartSettingsChange() {
  const val = document.getElementById('quickstart-upload-id')?.value?.trim() || '';
  if (window.PageHost && window.PageHost.setManualUploadId) {
    window.PageHost.setManualUploadId(val);
  }
}

function setQuickStartStatus(msg, busy) {
  const s = document.getElementById('quickstart-status');
  if (!s) return;
  if (!msg) { s.innerHTML = ''; return; }
  s.innerHTML = busy ? `<span class="spinner"></span><span>${escHtml(msg)}</span>` : escHtml(msg);
}

function setQuickStartError(msg) {
  const el = document.getElementById('quickstart-error');
  if (!el) return;
  if (!msg) { el.style.display = 'none'; el.textContent = ''; return; }
  el.textContent = msg;
  el.style.display = 'block';
}

async function onQuickStartAnalyze() {
  const btn = document.getElementById('quickstart-btn');
  const input = document.getElementById('quickstart-url');
  const url = (input?.value || '').trim();
  setQuickStartError('');

  if (!url) {
    setQuickStartError('Enter a customer URL to analyze.');
    return;
  }

  const mode = detectQuickStartMode();
  const client = mode === 'pagehost' ? window.PageHost : window.LocalAI;
  if (!client) {
    setQuickStartError('AI client not loaded.');
    return;
  }

  // Local mode needs a key before we even try
  if (mode === 'local' && !window.LocalAI.hasKey()) {
    setQuickStartError('Paste your Anthropic API key below to enable AI analysis.');
    return;
  }

  btn.disabled = true;
  try {
    const fetchLabel = mode === 'pagehost'
      ? 'Fetching customer site via Page Host proxy…'
      : 'Fetching customer site via CORS proxy…';
    setQuickStartStatus(fetchLabel, true);
    const data = await client.analyzeCustomerURL(url, {
      onStatus: (phase) => {
        if (phase === 'fetching') setQuickStartStatus(fetchLabel, true);
        else if (phase === 'analyzing') setQuickStartStatus('Claude is analyzing brand and generating content…', true);
      }
    });
    setQuickStartStatus('Populating wizard…', true);
    applyAnalysis(data);
    const modeTag = data._meta.mode === 'local' ? 'local' : 'Page Host';
    setQuickStartStatus(`✓ Populated from ${new URL(data._meta.source_url).hostname} (${modeTag}). Review each step and tweak.`, false);
  } catch (err) {
    console.error('[QuickStart] analyze failed:', err);
    const msg = client.humanErrorMessage(err);
    setQuickStartError(msg);
    setQuickStartStatus('', false);
  } finally {
    btn.disabled = false;
  }
}

function applyAnalysis(d) {
  if (!d || typeof d !== 'object') return;

  // Brand
  if (d.brandName) state.brand.name = d.brandName;
  if (d.industry && ['carwash','restaurant','retail','fitness','healthcare','generic'].includes(d.industry)) {
    state.brand.industry = d.industry;
  }
  if (d.programName) state.brand.programName = d.programName;

  // Colors
  if (d.colors && typeof d.colors === 'object') {
    ['primary','accent','secondary','dark'].forEach(k => {
      if (isHex(d.colors[k])) state.colors[k] = d.colors[k].toUpperCase();
    });
    // Menu color follows primary unless user has customized it
    if (!state.menuColorCustom) state.colors.menu = state.colors.primary;
  }

  // Tiers
  if (Array.isArray(d.tiers) && d.tiers.length) {
    d.tiers.slice(0, 3).forEach((t, i) => {
      if (!state.tiers[i]) state.tiers[i] = { name: '', points: 0 };
      if (t.name) state.tiers[i].name = t.name;
      if (typeof t.points === 'number') state.tiers[i].points = t.points;
    });
  }

  // Collections — replace wholesale when AI returned them
  if (Array.isArray(d.vouchers) && d.vouchers.length) state.vouchers = d.vouchers.map(cleanVoucher);
  if (Array.isArray(d.offers) && d.offers.length)   state.offers   = d.offers.map(cleanOffer);
  if (Array.isArray(d.badges) && d.badges.length)   state.badges   = d.badges.map(cleanBadge);
  if (Array.isArray(d.clubs) && d.clubs.length)     state.clubs    = d.clubs.map(cleanClub);
  if (Array.isArray(d.benefits) && d.benefits.length) state.benefits = d.benefits.map(cleanBenefit);
  if (Array.isArray(d.earnMore) && d.earnMore.length) state.earnMore = d.earnMore.map(cleanEarnMore);
  if (Array.isArray(d.profileTasks) && d.profileTasks.length) state.profileTasks = d.profileTasks.map(cleanProfileTask);
  if (d.upsell && typeof d.upsell === 'object') state.upsell = { ...state.upsell, ...cleanUpsell(d.upsell) };
  if (Array.isArray(d.navLinks) && d.navLinks.length) state.navLinks = d.navLinks.filter(x => typeof x === 'string' && x).slice(0, 8);
  if (d.footerLinks && typeof d.footerLinks === 'object') state.footerLinks = d.footerLinks;

  // Member — only name + join date come from AI; keep other fields
  if (d.member && typeof d.member === 'object') {
    if (d.member.name) state.member.name = d.member.name;
    if (d.member.joinDate) state.member.joinDate = d.member.joinDate;
  }

  // Logo — use favicon as best-guess if no logo set yet
  if (d._meta && d._meta.favicon && !state.brand.logoData && !state.brand.logoUrl) {
    state.brand.logoUrl = d._meta.favicon;
    const prev = document.getElementById('preview-logo');
    if (prev) { prev.src = d._meta.favicon; prev.classList.remove('hidden'); }
    setVal('url-logo', d._meta.favicon);
  }

  // Re-render everything
  populateFormFromState();
  renderPaletteButtons();
  renderDynamicSections();
  schedulePreview();
}

function isHex(s) { return typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s.trim()); }

function cleanVoucher(v) {
  return {
    title: str(v.title, 60),
    vendor: str(v.vendor, 80),
    expiry: str(v.expiry, 40),
    actionType: ['points','code','qr'].includes(v.actionType) ? v.actionType : 'points',
    actionValue: str(v.actionValue, 30),
    emoji: str(v.emoji, 4) || '🎁',
    imageUrl: '', imageData: ''
  };
}
function cleanOffer(o) {
  return {
    title: str(o.title, 80),
    description: str(o.description, 200),
    cta: str(o.cta, 30) || 'Learn More',
    playerCount: str(o.playerCount, 30),
    expiry: str(o.expiry, 40),
    emoji: str(o.emoji, 4) || '🎯',
    imageUrl: '', imageData: ''
  };
}
function cleanBadge(b) {
  const allowed = ['amber','emerald','blue','purple','rose','teal','orange','indigo','red','green'];
  return {
    name: str(b.name, 40),
    emoji: str(b.emoji, 4) || '⭐',
    color: allowed.includes(b.color) ? b.color : 'amber'
  };
}
function cleanClub(c) {
  return {
    name: str(c.name, 40),
    description: str(c.description, 200),
    memberCount: typeof c.memberCount === 'number' ? c.memberCount : (parseInt(c.memberCount, 10) || 0),
    emoji: str(c.emoji, 4) || '👥',
    imageUrl: '', imageData: ''
  };
}
function cleanBenefit(b) {
  return { name: str(b.name, 40), emoji: str(b.emoji, 4) || '✨' };
}
function cleanEarnMore(e) {
  return {
    title: str(e.title, 80),
    description: str(e.description, 200),
    hasCodeInput: Boolean(e.hasCodeInput)
  };
}
function cleanProfileTask(t) {
  return { description: str(t.description, 200), cta: str(t.cta, 30) || 'Go' };
}
function cleanUpsell(u) {
  return {
    title: str(u.title, 60),
    subtitle: str(u.subtitle, 60),
    price: str(u.price, 12) || '$29',
    period: str(u.period, 24) || 'Monthly',
    tagline: str(u.tagline, 160),
    cta: str(u.cta, 30) || 'Upgrade'
  };
}
function str(v, max) {
  if (v === null || v === undefined) return '';
  const s = String(v).trim();
  return max ? s.slice(0, max) : s;
}
function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s ?? '';
  return d.innerHTML;
}

// ---- INDUSTRY DEFAULTS ----
function applyIndustryDefaults(industry) {
  const d = getDefaults(industry);
  state.colors = { ...d.colors };
  if (!state.colors.menu) state.colors.menu = state.colors.primary;
  state.menuColorCustom = false;
  state.tiers = d.tiers.map(t => ({ ...t }));
  state.vouchers = d.vouchers.map(v => ({ ...v }));
  state.offers = d.offers.map(o => ({ ...o }));
  state.badges = d.badges.map(b => ({ ...b }));
  state.clubs = d.clubs.map(c => ({ ...c }));
  state.earnMore = d.earnMore.map(e => ({ ...e }));
  state.benefits = d.benefits.map(b => ({ ...b }));
  state.profileTasks = d.profileTasks.map(t => ({ ...t }));
  state.upsell = { ...d.upsell };
  state.navLinks = [...d.navLinks];
  state.footerLinks = JSON.parse(JSON.stringify(d.footerLinks));
}

function populateFormFromState() {
  // Brand
  setVal('brand-name', state.brand.name);
  setVal('brand-industry', state.brand.industry);
  setVal('program-name', state.brand.programName);

  // Colors
  setVal('color-primary', state.colors.primary);
  setVal('hex-primary', state.colors.primary);
  setVal('color-accent', state.colors.accent);
  setVal('hex-accent', state.colors.accent);
  setVal('color-secondary', state.colors.secondary);
  setVal('hex-secondary', state.colors.secondary);
  setVal('color-dark', state.colors.dark);
  setVal('hex-dark', state.colors.dark);
  setVal('color-menu', state.colors.menu || state.colors.primary);
  setVal('hex-menu', state.colors.menu || state.colors.primary);

  // Tiers
  state.tiers.forEach((t, i) => {
    setVal(`tier${i+1}-name`, t.name);
    setVal(`tier${i+1}-points`, t.points);
  });
  setVal('tier-progress', state.tierProgress);
  const tpv = document.getElementById('tier-progress-val');
  if (tpv) tpv.textContent = state.tierProgress + '%';

  // Member
  setVal('member-name', state.member.name);
  setVal('member-number', state.member.number);
  setVal('member-points', state.member.points);
  setVal('member-email', state.member.email);
  setVal('member-phone', state.member.phone);
  setVal('member-join', state.member.joinDate);

  // Sections toggles
  Object.keys(state.sections).forEach(k => {
    const el = document.getElementById('toggle-' + k);
    if (el) el.checked = state.sections[k];
  });

  // Upsell
  setVal('upsell-title', state.upsell.title || '');
  setVal('upsell-subtitle', state.upsell.subtitle || '');
  setVal('upsell-price', state.upsell.price || '');
  setVal('upsell-period', state.upsell.period || '');
  setVal('upsell-tagline', state.upsell.tagline || '');
  setVal('upsell-cta', state.upsell.cta || '');
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val ?? '';
}

function getVal(id) {
  const el = document.getElementById(id);
  return el ? el.value : '';
}

// ---- FIELD HANDLERS ----
function onFieldChange() {
  // Read all fields into state
  state.brand.name = getVal('brand-name');
  state.brand.programName = getVal('program-name');

  // Tiers
  for (let i = 0; i < 3; i++) {
    state.tiers[i].name = getVal(`tier${i+1}-name`);
    state.tiers[i].points = parseInt(getVal(`tier${i+1}-points`)) || 0;
  }
  state.tierProgress = parseInt(getVal('tier-progress')) || 0;

  // Member
  state.member.name = getVal('member-name');
  state.member.number = getVal('member-number');
  state.member.points = parseInt(getVal('member-points')) || 0;
  state.member.email = getVal('member-email');
  state.member.phone = getVal('member-phone');
  state.member.joinDate = getVal('member-join');

  // Upsell
  state.upsell.title = getVal('upsell-title');
  state.upsell.subtitle = getVal('upsell-subtitle');
  state.upsell.price = getVal('upsell-price');
  state.upsell.period = getVal('upsell-period');
  state.upsell.tagline = getVal('upsell-tagline');
  state.upsell.cta = getVal('upsell-cta');

  schedulePreview();
}

function onIndustryChange() {
  const industry = getVal('brand-industry');
  state.brand.industry = industry;
  applyIndustryDefaults(industry);
  populateFormFromState();
  renderDynamicSections();
  schedulePreview();
}

function onColorChange() {
  const prevPrimary = state.colors.primary;
  state.colors.primary = getVal('color-primary');
  state.colors.accent = getVal('color-accent');
  state.colors.secondary = getVal('color-secondary');
  state.colors.dark = getVal('color-dark');
  const newMenu = getVal('color-menu');
  if (newMenu !== state.colors.menu) state.menuColorCustom = true;
  state.colors.menu = newMenu;
  // If menu was tracking primary, keep it in sync when primary changes
  if (!state.menuColorCustom && state.colors.primary !== prevPrimary) {
    state.colors.menu = state.colors.primary;
    setVal('color-menu', state.colors.menu);
  }
  setVal('hex-primary', state.colors.primary);
  setVal('hex-accent', state.colors.accent);
  setVal('hex-secondary', state.colors.secondary);
  setVal('hex-dark', state.colors.dark);
  setVal('hex-menu', state.colors.menu);
  schedulePreview();
}

function onHexChange(which) {
  let hex = getVal('hex-' + which).trim();
  if (!hex.startsWith('#')) hex = '#' + hex;
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
    if (which === 'menu') state.menuColorCustom = true;
    const prevPrimary = state.colors.primary;
    state.colors[which] = hex;
    setVal('color-' + which, hex);
    if (which === 'primary' && !state.menuColorCustom) {
      state.colors.menu = hex;
      setVal('color-menu', hex);
      setVal('hex-menu', hex);
    }
    schedulePreview();
  }
}

function resetMenuColor() {
  state.menuColorCustom = false;
  state.colors.menu = state.colors.primary;
  setVal('color-menu', state.colors.menu);
  setVal('hex-menu', state.colors.menu);
  schedulePreview();
}

function onLogoUrlChange() {
  const url = getVal('url-logo').trim();
  if (url) {
    state.brand.logoUrl = url;
    state.brand.logoData = '';
    const prev = document.getElementById('preview-logo');
    if (prev) { prev.src = url; prev.classList.remove('hidden'); }
  } else {
    state.brand.logoUrl = '';
    const prev = document.getElementById('preview-logo');
    if (prev) { prev.src = ''; prev.classList.add('hidden'); }
  }
  schedulePreview();
}

function onAvatarUrlChange() {
  const url = getVal('url-avatar').trim();
  const prev = document.getElementById('preview-avatar');
  if (url) {
    state.member.avatarUrl = url;
    state.member.avatarData = '';
    if (prev) { prev.src = url; prev.classList.remove('hidden'); }
  } else {
    state.member.avatarUrl = '';
    if (prev) { prev.src = ''; prev.classList.add('hidden'); }
  }
  schedulePreview();
}

function onToggleSection(section) {
  const el = document.getElementById('toggle-' + section);
  if (el) state.sections[section] = el.checked;
  schedulePreview();
}

// ---- STEP NAVIGATION ----
function goToStep(step) {
  if (step < 0 || step >= totalSteps) return;
  // Hide current
  const panels = document.querySelectorAll('.step-panel');
  panels.forEach(p => p.classList.remove('active'));
  // Show target
  const target = document.querySelector(`.step-panel[data-step="${step}"]`);
  if (target) target.classList.add('active');
  currentStep = step;
  updateStepIndicators();
  updateNavButtons();
  // Re-init image uploads for dynamically rendered sections
  reinitDynamicImageUploads();
}

function nextStep() {
  if (currentStep < totalSteps - 1) goToStep(currentStep + 1);
}

function prevStep() {
  if (currentStep > 0) goToStep(currentStep - 1);
}

function updateStepIndicators() {
  const dots = document.querySelectorAll('.step-dot');
  dots.forEach((dot, i) => {
    dot.classList.remove('active', 'completed');
    if (i < currentStep) dot.classList.add('completed');
    else if (i === currentStep) dot.classList.add('active');
  });
}

function updateNavButtons() {
  const prev = document.getElementById('btn-prev');
  const next = document.getElementById('btn-next');
  if (prev) prev.classList.toggle('hidden', currentStep === 0);
  if (next) {
    if (currentStep === totalSteps - 1) {
      next.classList.add('hidden');
    } else {
      next.classList.remove('hidden');
      next.textContent = 'Next →';
    }
  }
}

// ---- PALETTE BUTTONS ----
function renderPaletteButtons() {
  const container = document.getElementById('palette-buttons');
  if (!container) return;
  container.innerHTML = '';
  Object.keys(INDUSTRY_DEFAULTS).forEach(key => {
    const d = INDUSTRY_DEFAULTS[key];
    const btn = document.createElement('button');
    btn.className = 'palette-btn flex items-center gap-2 text-xs font-600 text-gray-700';
    btn.innerHTML = `
      <div class="flex gap-0.5">
        <div class="w-4 h-4 rounded-full" style="background:${d.colors.primary}"></div>
        <div class="w-4 h-4 rounded-full" style="background:${d.colors.accent}"></div>
      </div>
      <span>${d.label}</span>
    `;
    btn.onclick = () => {
      state.colors = { ...d.colors };
      if (!state.colors.menu) state.colors.menu = state.colors.primary;
      state.menuColorCustom = false;
      setVal('color-primary', state.colors.primary);
      setVal('hex-primary', state.colors.primary);
      setVal('color-accent', state.colors.accent);
      setVal('hex-accent', state.colors.accent);
      setVal('color-secondary', state.colors.secondary);
      setVal('hex-secondary', state.colors.secondary);
      setVal('color-dark', state.colors.dark);
      setVal('hex-dark', state.colors.dark);
      setVal('color-menu', state.colors.menu);
      setVal('hex-menu', state.colors.menu);
      schedulePreview();
    };
    container.appendChild(btn);
  });
}

// ---- DYNAMIC SECTION RENDERING ----
function renderDynamicSections() {
  renderVouchers();
  renderOffers();
  renderBadges();
  renderClubs();
  renderBenefits();
  renderEarnMore();
  renderProfileTasks();
  renderNavLinks();
}

// -- Vouchers --
function renderVouchers() {
  const c = document.getElementById('vouchers-container');
  if (!c) return;
  c.innerHTML = state.vouchers.map((v, i) => `
    <div class="bg-gray-50 rounded-lg p-4 relative">
      <button onclick="removeItem('vouchers',${i})" class="absolute top-2 right-2 text-red-400 hover:text-red-600 text-lg font-bold leading-none">&times;</button>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="block text-xs font-600 text-gray-600 mb-1">Title</label><input type="text" value="${esc(v.title)}" onchange="updateItem('vouchers',${i},'title',this.value)" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-400/50"></div>
        <div><label class="block text-xs font-600 text-gray-600 mb-1">Vendor</label><input type="text" value="${esc(v.vendor||'')}" onchange="updateItem('vouchers',${i},'vendor',this.value)" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-400/50"></div>
        <div><label class="block text-xs font-600 text-gray-600 mb-1">Expiry</label><input type="text" value="${esc(v.expiry||'')}" onchange="updateItem('vouchers',${i},'expiry',this.value)" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-400/50" placeholder="e.g. Ends in 14 days"></div>
        <div><label class="block text-xs font-600 text-gray-600 mb-1">Emoji</label><input type="text" value="${esc(v.emoji||'')}" onchange="updateItem('vouchers',${i},'emoji',this.value)" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-400/50"></div>
        <div><label class="block text-xs font-600 text-gray-600 mb-1">Action Type</label>
          <select onchange="updateItem('vouchers',${i},'actionType',this.value)" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-400/50 bg-white">
            <option value="points" ${v.actionType==='points'?'selected':''}>Points</option>
            <option value="code" ${v.actionType==='code'?'selected':''}>Code</option>
            <option value="qr" ${v.actionType==='qr'?'selected':''}>QR</option>
          </select>
        </div>
        <div><label class="block text-xs font-600 text-gray-600 mb-1">Action Value</label><input type="text" value="${esc(v.actionValue||'')}" onchange="updateItem('vouchers',${i},'actionValue',this.value)" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-400/50" placeholder="e.g. 250pts or CODE123"></div>
      </div>
      ${imageUploadHTML('voucher-'+i, 'Voucher Image', v.imageData||v.imageUrl||'')}
    </div>
  `).join('');
  reinitDynamicImageUploads();
}

function addVoucher() {
  state.vouchers.push({ title: '', vendor: '', expiry: '', actionType: 'points', actionValue: '', emoji: '🎁', imageUrl: '', imageData: '' });
  renderVouchers();
}

// -- Offers --
function renderOffers() {
  const c = document.getElementById('offers-container');
  if (!c) return;
  c.innerHTML = state.offers.map((o, i) => `
    <div class="bg-gray-50 rounded-lg p-4 relative">
      <button onclick="removeItem('offers',${i})" class="absolute top-2 right-2 text-red-400 hover:text-red-600 text-lg font-bold leading-none">&times;</button>
      <div class="grid grid-cols-2 gap-3">
        <div class="col-span-2"><label class="block text-xs font-600 text-gray-600 mb-1">Title</label><input type="text" value="${esc(o.title)}" onchange="updateItem('offers',${i},'title',this.value)" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-400/50"></div>
        <div class="col-span-2"><label class="block text-xs font-600 text-gray-600 mb-1">Description</label><input type="text" value="${esc(o.description||'')}" onchange="updateItem('offers',${i},'description',this.value)" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-400/50"></div>
        <div><label class="block text-xs font-600 text-gray-600 mb-1">CTA Text</label><input type="text" value="${esc(o.cta||'')}" onchange="updateItem('offers',${i},'cta',this.value)" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-400/50"></div>
        <div><label class="block text-xs font-600 text-gray-600 mb-1">Emoji</label><input type="text" value="${esc(o.emoji||'')}" onchange="updateItem('offers',${i},'emoji',this.value)" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-400/50"></div>
        <div><label class="block text-xs font-600 text-gray-600 mb-1">Player Count</label><input type="text" value="${esc(o.playerCount||'')}" onchange="updateItem('offers',${i},'playerCount',this.value)" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-400/50" placeholder="e.g. 1500 Playing"></div>
        <div><label class="block text-xs font-600 text-gray-600 mb-1">Expiry</label><input type="text" value="${esc(o.expiry||'')}" onchange="updateItem('offers',${i},'expiry',this.value)" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-400/50"></div>
      </div>
      ${imageUploadHTML('offer-'+i, 'Offer Image', o.imageData||o.imageUrl||'')}
    </div>
  `).join('');
  reinitDynamicImageUploads();
}

function addOffer() {
  state.offers.push({ title: '', description: '', cta: 'Learn More', emoji: '🎯', playerCount: '', expiry: '', imageUrl: '', imageData: '' });
  renderOffers();
}

// -- Badges --
function renderBadges() {
  const c = document.getElementById('badges-container');
  if (!c) return;
  c.innerHTML = state.badges.map((b, i) => `
    <div class="bg-gray-50 rounded-lg p-3 flex items-center gap-3 relative">
      <button onclick="removeItem('badges',${i})" class="absolute top-1 right-2 text-red-400 hover:text-red-600 text-sm font-bold leading-none">&times;</button>
      <input type="text" value="${esc(b.emoji||'')}" onchange="updateItem('badges',${i},'emoji',this.value)" class="w-12 px-2 py-2 border border-gray-300 rounded-lg text-center text-lg outline-none focus:ring-2 focus:ring-blue-400/50" title="Emoji">
      <input type="text" value="${esc(b.name)}" onchange="updateItem('badges',${i},'name',this.value)" class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-400/50" placeholder="Badge name">
      <select onchange="updateItem('badges',${i},'color',this.value)" class="px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-400/50 bg-white">
        ${GRADIENT_COLORS.map(c2 => `<option value="${c2}" ${b.color===c2?'selected':''}>${c2}</option>`).join('')}
      </select>
    </div>
  `).join('');
}

function addBadge() {
  state.badges.push({ name: '', emoji: '⭐', color: 'amber' });
  renderBadges();
}

// -- Social Clubs --
function renderClubs() {
  const c = document.getElementById('clubs-container');
  if (!c) return;
  c.innerHTML = state.clubs.map((cl, i) => `
    <div class="bg-gray-50 rounded-lg p-4 relative">
      <button onclick="removeItem('clubs',${i})" class="absolute top-2 right-2 text-red-400 hover:text-red-600 text-lg font-bold leading-none">&times;</button>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="block text-xs font-600 text-gray-600 mb-1">Name</label><input type="text" value="${esc(cl.name)}" onchange="updateItem('clubs',${i},'name',this.value)" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-400/50"></div>
        <div><label class="block text-xs font-600 text-gray-600 mb-1">Members</label><input type="number" value="${cl.memberCount||0}" onchange="updateItem('clubs',${i},'memberCount',parseInt(this.value)||0)" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-400/50"></div>
        <div><label class="block text-xs font-600 text-gray-600 mb-1">Emoji</label><input type="text" value="${esc(cl.emoji||'')}" onchange="updateItem('clubs',${i},'emoji',this.value)" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-400/50"></div>
        <div class="col-span-2"><label class="block text-xs font-600 text-gray-600 mb-1">Description</label><input type="text" value="${esc(cl.description||'')}" onchange="updateItem('clubs',${i},'description',this.value)" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-400/50"></div>
      </div>
      ${imageUploadHTML('club-'+i, 'Club Image', cl.imageData||cl.imageUrl||'')}
    </div>
  `).join('');
  reinitDynamicImageUploads();
}

function addClub() {
  state.clubs.push({ name: '', description: '', memberCount: 0, emoji: '👥', imageUrl: '', imageData: '' });
  renderClubs();
}

// -- Benefits --
function renderBenefits() {
  const c = document.getElementById('benefits-container');
  if (!c) return;
  c.innerHTML = state.benefits.map((b, i) => `
    <div class="bg-gray-50 rounded-lg p-3 flex items-center gap-3 relative">
      <button onclick="removeItem('benefits',${i})" class="absolute top-1 right-2 text-red-400 hover:text-red-600 text-sm font-bold leading-none">&times;</button>
      <input type="text" value="${esc(b.emoji||'')}" onchange="updateItem('benefits',${i},'emoji',this.value)" class="w-12 px-2 py-2 border border-gray-300 rounded-lg text-center text-lg outline-none focus:ring-2 focus:ring-blue-400/50" title="Emoji">
      <input type="text" value="${esc(b.name)}" onchange="updateItem('benefits',${i},'name',this.value)" class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-400/50" placeholder="Benefit name">
    </div>
  `).join('');
}

function addBenefit() {
  state.benefits.push({ name: '', emoji: '✨' });
  renderBenefits();
}

// -- Earn More --
function renderEarnMore() {
  const c = document.getElementById('earnmore-container');
  if (!c) return;
  c.innerHTML = state.earnMore.map((e, i) => `
    <div class="bg-gray-50 rounded-lg p-3 relative">
      <button onclick="removeItem('earnMore',${i})" class="absolute top-1 right-2 text-red-400 hover:text-red-600 text-sm font-bold leading-none">&times;</button>
      <div class="grid grid-cols-1 gap-2">
        <div><label class="block text-xs font-600 text-gray-600 mb-1">Title</label><input type="text" value="${esc(e.title)}" onchange="updateItem('earnMore',${i},'title',this.value)" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-400/50"></div>
        <div><label class="block text-xs font-600 text-gray-600 mb-1">Description</label><input type="text" value="${esc(e.description||'')}" onchange="updateItem('earnMore',${i},'description',this.value)" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-400/50"></div>
        <label class="flex items-center gap-2 text-xs"><input type="checkbox" ${e.hasCodeInput?'checked':''} onchange="updateItem('earnMore',${i},'hasCodeInput',this.checked)"> Show code input field</label>
      </div>
    </div>
  `).join('');
}

function addEarnMore() {
  state.earnMore.push({ title: '', description: '', hasCodeInput: false });
  renderEarnMore();
}

// -- Profile Tasks --
function renderProfileTasks() {
  const c = document.getElementById('profiletasks-container');
  if (!c) return;
  c.innerHTML = state.profileTasks.map((t, i) => `
    <div class="bg-gray-50 rounded-lg p-3 relative">
      <button onclick="removeItem('profileTasks',${i})" class="absolute top-1 right-2 text-red-400 hover:text-red-600 text-sm font-bold leading-none">&times;</button>
      <div class="grid grid-cols-4 gap-2">
        <div class="col-span-3"><label class="block text-xs font-600 text-gray-600 mb-1">Description (HTML OK)</label><input type="text" value="${esc(t.description)}" onchange="updateItem('profileTasks',${i},'description',this.value)" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-400/50"></div>
        <div><label class="block text-xs font-600 text-gray-600 mb-1">CTA</label><input type="text" value="${esc(t.cta)}" onchange="updateItem('profileTasks',${i},'cta',this.value)" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-400/50"></div>
      </div>
    </div>
  `).join('');
}

function addProfileTask() {
  state.profileTasks.push({ description: '', cta: 'Go' });
  renderProfileTasks();
}

// -- Nav Links --
function renderNavLinks() {
  const c = document.getElementById('nav-links-container');
  if (!c) return;
  c.innerHTML = state.navLinks.map((link, i) => `
    <span class="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-100 rounded-full text-xs font-600 text-gray-700">
      ${esc(link)}
      <button onclick="removeNavLink(${i})" class="text-red-400 hover:text-red-600 ml-1">&times;</button>
    </span>
  `).join('');
}

function addNavLink() {
  const input = document.getElementById('new-nav-link');
  if (!input) return;
  const val = input.value.trim();
  if (val) {
    state.navLinks.push(val);
    input.value = '';
    renderNavLinks();
    schedulePreview();
  }
}

function removeNavLink(i) {
  state.navLinks.splice(i, 1);
  renderNavLinks();
  schedulePreview();
}

// ---- GENERIC ITEM HELPERS ----
function updateItem(section, index, field, value) {
  if (state[section] && state[section][index]) {
    state[section][index][field] = value;
    schedulePreview();
  }
}

function removeItem(section, index) {
  if (state[section]) {
    state[section].splice(index, 1);
    // Re-render the section
    const renderers = { vouchers: renderVouchers, offers: renderOffers, badges: renderBadges, clubs: renderClubs, benefits: renderBenefits, earnMore: renderEarnMore, profileTasks: renderProfileTasks };
    if (renderers[section]) renderers[section]();
    schedulePreview();
  }
}

// ---- AUTO-GENERATE ----
function autoGenerate(section) {
  const d = getDefaults(state.brand.industry);
  if (section === 'vouchers') { state.vouchers = d.vouchers.map(v => ({ ...v })); renderVouchers(); }
  else if (section === 'offers') { state.offers = d.offers.map(o => ({ ...o })); renderOffers(); }
  else if (section === 'badges') { state.badges = d.badges.map(b => ({ ...b })); renderBadges(); }
  else if (section === 'clubs') { state.clubs = d.clubs.map(c => ({ ...c })); renderClubs(); }
  else if (section === 'earnMore') { state.earnMore = d.earnMore.map(e => ({ ...e })); renderEarnMore(); }
  else if (section === 'benefits') { state.benefits = d.benefits.map(b => ({ ...b })); renderBenefits(); }
  else if (section === 'profileTasks') { state.profileTasks = d.profileTasks.map(t => ({ ...t })); renderProfileTasks(); }
  else if (section === 'upsell') {
    state.upsell = { ...d.upsell };
    setVal('upsell-title', state.upsell.title);
    setVal('upsell-subtitle', state.upsell.subtitle);
    setVal('upsell-price', state.upsell.price);
    setVal('upsell-period', state.upsell.period);
    setVal('upsell-tagline', state.upsell.tagline);
    setVal('upsell-cta', state.upsell.cta);
  }
  schedulePreview();
}

// ---- IMAGE UPLOAD RE-INIT ----
function reinitDynamicImageUploads() {
  // Voucher images
  state.vouchers.forEach((v, i) => {
    initImageUpload('drop-voucher-'+i, 'preview-voucher-'+i, 'url-voucher-'+i, (data) => {
      if (data && data.startsWith('data:')) { v.imageData = data; v.imageUrl = ''; }
      else { v.imageUrl = data; v.imageData = ''; }
      schedulePreview();
    });
  });
  // Offer images
  state.offers.forEach((o, i) => {
    initImageUpload('drop-offer-'+i, 'preview-offer-'+i, 'url-offer-'+i, (data) => {
      if (data && data.startsWith('data:')) { o.imageData = data; o.imageUrl = ''; }
      else { o.imageUrl = data; o.imageData = ''; }
      schedulePreview();
    });
  });
  // Club images
  state.clubs.forEach((c, i) => {
    initImageUpload('drop-club-'+i, 'preview-club-'+i, 'url-club-'+i, (data) => {
      if (data && data.startsWith('data:')) { c.imageData = data; c.imageUrl = ''; }
      else { c.imageUrl = data; c.imageData = ''; }
      schedulePreview();
    });
  });
}

// ---- LIVE PREVIEW ----
function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(updatePreview, 300);
}

function updatePreview() {
  const iframe = document.getElementById('preview-iframe');
  if (!iframe) return;
  try {
    const html = generatePortalHTML(state);
    iframe.srcdoc = html;
  } catch (err) {
    console.error('Preview error:', err);
  }
}

// ---- EXPORT ----
function downloadHTML() {
  const html = generatePortalHTML(state);
  const slug = (state.brand.name || 'loyalty-portal').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const filename = `loyalty-portal-${slug || 'demo'}.html`;
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function copyHTML() {
  const html = generatePortalHTML(state);
  navigator.clipboard.writeText(html).then(() => {
    const el = document.getElementById('copy-success');
    if (el) {
      el.classList.remove('hidden');
      setTimeout(() => el.classList.add('hidden'), 3000);
    }
  }).catch(() => {
    alert('Failed to copy. Try the download button instead.');
  });
}

function startOver() {
  if (!confirm('Reset everything and start over?')) return;
  state.brand = { name: '', industry: 'generic', programName: '', logoUrl: '', logoData: '' };
  state.member = { name: 'Imran Mansur', number: '234567', points: 1200, email: '', phone: '', joinDate: '', avatarUrl: '', avatarData: '' };
  state.tierProgress = 30;
  state.sections = { vouchers: true, offers: true, badges: true, clubs: true, earnMore: true, profileTasks: true, upsell: true };
  state.menuColorCustom = false;
  applyIndustryDefaults('generic');
  populateFormFromState();
  renderDynamicSections();
  const logoPreview = document.getElementById('preview-logo');
  if (logoPreview) { logoPreview.src = ''; logoPreview.classList.add('hidden'); }
  setVal('url-logo', '');
  const avatarPreview = document.getElementById('preview-avatar');
  if (avatarPreview) { avatarPreview.src = ''; avatarPreview.classList.add('hidden'); }
  setVal('url-avatar', '');
  goToStep(0);
  schedulePreview();
}

// ---- UTILITY ----
function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}
