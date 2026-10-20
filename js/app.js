// ============================================================
// app.js — Wizard controller, state, preview & export
// ============================================================

// ---- STATE ----
const state = {
  schemaVersion: 2, locale: 'en-US', displayLabels: {},
  brief: { mode: 'b2c', objective: '', text: '', roles: '', sources: [] },
  program: null, programReview: null, programEnabled: false, outputTemplate: 'cinematic',
  cinematic: window.LPGCinematic?.normalize(),
  activeVariant: 'b2c', variants: {},
  brand: { name: '', industry: 'generic', programName: '', logoUrl: '', logoData: '' },
  colors: { primary: '#2D3748', secondary: '#F7FAFC', accent: '#4299E1', dark: '#1A202C', menu: '#2D3748' },
  menuColorCustom: false,
  tiers: [
    { name: 'Basic', points: 0 },
    { name: 'Plus', points: 2000 },
    { name: 'Premium', points: 5000 }
  ],
  tierProgress: 30,
  member: { name: 'Avery Morgan', number: '234567', points: 1200, email: '', phone: '', joinDate: '', avatarUrl: '', avatarData: '' },
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
let stepTransition = null;

// ---- INIT ----
document.addEventListener('DOMContentLoaded', () => {
  applyIndustryDefaults('generic');
  window.LPGCinematic?.init();
  populateFormFromState();
  renderPaletteButtons();
  renderDynamicSections();
  initImageUpload('drop-logo', 'preview-logo', 'url-logo', (data) => {
    state.brand.logoCandidates = [];
    if (data && data.startsWith('data:')) { state.brand.logoData = data; state.brand.logoUrl = ''; }
    else { state.brand.logoUrl = data; state.brand.logoData = ''; }
    schedulePreview();
  });
  document.getElementById('preview-logo')?.addEventListener('error',event=>{
    const preview=event.currentTarget;
    if(state.brand.logoData || preview.getAttribute('src')!==state.brand.logoUrl)return;
    const candidates=Array.isArray(state.brand.logoCandidates)?state.brand.logoCandidates:[];
    const next=candidates.find(url=>isSafeUrl(url)&&url!==state.brand.logoUrl);
    if(!next)return;
    state.brand.logoCandidates=candidates.filter(url=>url!==next&&url!==state.brand.logoUrl);
    state.brand.logoUrl=next;preview.src=next;setVal('url-logo',next);schedulePreview();
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
  window.LPGRequirementsEditor?.init();
  initializeProjects();
  document.getElementById('portal-preview-dialog')?.addEventListener('close', () => clearTimeout(expandedPreviewTimer));
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

  // Pre-fill scraper endpoint from localStorage
  const storedScraper = window.LocalAI && window.LocalAI.getScraperEndpoint();
  const scraperInput = document.getElementById('quickstart-scraper-url');
  if (storedScraper && scraperInput) scraperInput.value = storedScraper;

  // Pre-fill masked API key indicator if a key is stored (don't reveal it)
  if (window.LocalAI && window.LocalAI.hasKey() && keyInput) {
    keyInput.placeholder = 'sk-ant-…' + window.LocalAI.getApiKey().slice(-4).padStart(8, '•');
  }

  const mode = detectQuickStartMode();

  if (mode === 'pagehost') {
    if (badge) { badge.textContent = '⚡ Page Host mode · using tile AI'; badge.classList.remove('local'); }
    if (note) { note.style.display = 'block'; note.innerHTML = 'Using the connected AI service.'; }
  } else {
    // Local mode — badge label depends on whether user has provided their own key
    const provider = window.LocalAI && window.LocalAI.currentProvider();
    if (badge) {
      badge.classList.add('local');
      if (provider === 'default') {
        badge.textContent = '🌐 AI ready · no key required';
      } else if (provider === 'anthropic') {
        badge.textContent = '🔑 Using your Anthropic key';
      } else if (provider === 'sfgateway') {
        badge.textContent = '🔑 Using your SF LLM Gateway key';
      } else {
        badge.textContent = '💻 Local mode';
      }
    }
    if (note) {
      note.style.display = 'block';
      if (provider === 'default') {
        note.innerHTML = 'You can use Advanced settings to choose another AI connection.';
      } else {
        note.innerHTML = 'Using your own API key. Clear it in Advanced to use the default connection.';
      }
    }
  }

  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); onQuickStartAnalyze(); }
    });
  }

  // Reflect provider tag on load
  updateProviderTag();
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
  updateProviderTag();
}

function updateProviderTag() {
  const tag = document.getElementById('quickstart-provider-tag');
  if (!tag || !window.LocalAI) return;
  const provider = window.LocalAI.currentProvider();
  tag.classList.remove('active', 'gateway');
  if (provider === 'anthropic') {
    tag.textContent = 'Anthropic Direct';
    tag.classList.add('active');
  } else if (provider === 'sfgateway') {
    tag.textContent = 'SF LLM Gateway';
    tag.classList.add('active', 'gateway');
  } else {
    // 'default' — no BYOK key. Leave tag inactive.
    tag.textContent = '';
  }
  // Whenever the provider changes, re-render the main mode badge so its
  // label reflects "default" vs "your key" state without a page reload.
  const badge = document.getElementById('quickstart-mode-badge');
  if (badge && detectQuickStartMode() === 'local') {
    if (provider === 'default') badge.textContent = '🌐 AI ready · no key required';
    else if (provider === 'anthropic') badge.textContent = '🔑 Using your Anthropic key';
    else if (provider === 'sfgateway') badge.textContent = '🔑 Using your SF LLM Gateway key';
  }
}

function clearLocalAIKey() {
  if (window.LocalAI) window.LocalAI.setApiKey('');
  const el = document.getElementById('quickstart-api-key');
  if (el) { el.value = ''; el.placeholder = 'sk-ant-… (Anthropic) or sk-… (Salesforce LLM Gateway)'; }
  updateProviderTag();
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

function onScraperEndpointChange() {
  const val = document.getElementById('quickstart-scraper-url')?.value?.trim() || '';
  if (window.LocalAI && window.LocalAI.setScraperEndpoint) {
    window.LocalAI.setScraperEndpoint(val);
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

  if (window.LPGRequirementsEditor?.isImporting()) {
    setQuickStartError('Please wait for the requirements documents to finish reading.');
    return;
  }

  const programRequest = window.LPGRequirementsEditor?.wantsProgram();
  if (!url && !programRequest) {
    setQuickStartError('Enter a customer URL, describe your program, or attach requirements.');
    return;
  }

  const mode = detectQuickStartMode();
  const client = mode === 'pagehost' ? window.PageHost : window.LocalAI;
  if (!client) {
    setQuickStartError('AI client not loaded.');
    return;
  }

  // BYOK is no longer required in local mode — the default backend
  // (Worker /llm) covers everyone. Nothing to check here.

  btn.disabled = true;
  try {
    await window.LPGRequirementsEditor.analyze(client, url);

  } catch (err) {
    console.error('[QuickStart] analyze failed:', err);
    const msg = client.humanErrorMessage(err);
    setQuickStartError(msg);
    setQuickStartStatus('', false);
  } finally {
    btn.disabled = false;
  }
}

function applyAnalysis(d, target = state, { render = true } = {}) {
  if (!d || typeof d !== 'object') return;

  if (d.cinematic && window.LPGCinematic) target.cinematic = window.LPGCinematic.normalize(d.cinematic);

  // Brand
  if (d.brandName) target.brand.name = d.brandName;
  if (d.industry && ['carwash','restaurant','retail','fitness','healthcare','generic'].includes(d.industry)) {
    target.brand.industry = d.industry;
  }
  if (d.programName) target.brand.programName = d.programName;

  // Colors
  if (d.colors && typeof d.colors === 'object') {
    ['primary','accent','secondary','dark'].forEach(k => {
      if (isHex(d.colors[k])) target.colors[k] = d.colors[k].toUpperCase();
    });
    if (!target.menuColorCustom) target.colors.menu = target.colors.primary;
  }

  // Tiers
  if (Array.isArray(d.tiers) && d.tiers.length) {
    d.tiers.slice(0, 3).forEach((t, i) => {
      if (!target.tiers[i]) target.tiers[i] = { name: '', points: 0 };
      if (t.name) target.tiers[i].name = t.name;
      if (typeof t.points === 'number') target.tiers[i].points = t.points;
    });
  }

  // Collections — replace wholesale when AI returned them
  if (Array.isArray(d.vouchers)) target.vouchers = d.vouchers.map(cleanVoucher);
  if (Array.isArray(d.offers))   target.offers   = d.offers.map(cleanOffer);
  if (Array.isArray(d.badges))   target.badges   = d.badges.map(cleanBadge);
  if (Array.isArray(d.clubs))     target.clubs    = d.clubs.map(cleanClub);
  if (Array.isArray(d.benefits)) target.benefits = d.benefits.map(cleanBenefit);
  if (Array.isArray(d.earnMore)) target.earnMore = d.earnMore.map(cleanEarnMore);
  if (Array.isArray(d.profileTasks)) target.profileTasks = d.profileTasks.map(cleanProfileTask);
  if (d.upsell && typeof d.upsell === 'object') target.upsell = { ...target.upsell, ...cleanUpsell(d.upsell) };
  if (Array.isArray(d.navLinks) && d.navLinks.length) target.navLinks = d.navLinks.filter(x => typeof x === 'string' && x).slice(0, 8);
  if (d.footerLinks && typeof d.footerLinks === 'object') target.footerLinks = d.footerLinks;

  // Member — only name + join date come from AI; keep other fields
  if (d.member && typeof d.member === 'object') {
    if (d.member.name) target.member.name = d.member.name;
    if (d.member.joinDate) target.member.joinDate = d.member.joinDate;
  }

  // ---- BRAND LOGO — layered fallback ----
  // Priority order:
  //   1. Existing user upload (target.brand.logoData) — never overwrite
  //   2. Existing user URL (target.brand.logoUrl) — never overwrite
  //   3. AI-picked logo from candidate list (d.brand.logoUrl)
  //   4. Apple touch icon supplied by the website
  //   5. Favicon supplied by the website
  const failedImages=new Set(Array.isArray(d._meta?.failed_image_urls)?d._meta.failed_image_urls:[]);
  const failedLogo=failedImages.has(target.brand.logoUrl);
  if (!target.brand.logoData && (!target.brand.logoUrl || failedLogo || /^https:\/\/logo\.clearbit\.com\//i.test(target.brand.logoUrl))) {
    let logo = '';
    if (d.brand && typeof d.brand === 'object' && d.brand.logoUrl && isSafeUrl(d.brand.logoUrl)&&!failedImages.has(d.brand.logoUrl)) {
      logo = d.brand.logoUrl;
    }
    if (!logo && isSafeUrl(d._meta?.apple_icon)&&!failedImages.has(d._meta.apple_icon)) logo = d._meta.apple_icon;
    if (!logo && isSafeUrl(d._meta?.favicon)&&!failedImages.has(d._meta.favicon)) logo = d._meta.favicon;

    if (logo) {
      target.brand.logoUrl = logo;
      target.brand.logoCandidates = [...new Set([...(Array.isArray(d._meta?.logo_candidates)?d._meta.logo_candidates:[]),d._meta?.apple_icon,d._meta?.favicon])].filter(url=>isSafeUrl(url)&&url!==logo&&!failedImages.has(url)).slice(0,8);
      if (render) {
        const prev = document.getElementById('preview-logo');
        if (prev) { prev.src = logo; prev.classList.remove('hidden'); }
        setVal('url-logo', logo);
      }
    } else if(failedLogo) {
      target.brand.logoUrl='';target.brand.logoCandidates=[];
    }
  }

  // Upsell — accept AI-picked background image (scraped URL or generated data)
  if (d.upsell && d.upsell.bgImageUrl && isSafeUrl(d.upsell.bgImageUrl)) {
    target.upsell.bgImageUrl = d.upsell.bgImageUrl;
    target.upsell.bgImageData = '';
  } else if (d.upsell && d.upsell.bgImageData && d.upsell.bgImageData.startsWith('data:image/')) {
    target.upsell.bgImageData = d.upsell.bgImageData;
    target.upsell.bgImageUrl = '';
  }

  if (d.programEvidence) target.programEvidence = JSON.parse(JSON.stringify(d.programEvidence));
  if (window.LPGContentContract) Object.assign(target, window.LPGContentContract.ensure(target));
  if (render) {
    populateFormFromState(); renderPaletteButtons(); renderDynamicSections(); schedulePreview();
  }
  return target;
}

function isSafeUrl(u) {
  if (typeof u !== 'string') return false;
  const t = u.trim();
  if (!t) return false;
  // Reject obvious placeholder / hallucination hosts the model must not use
  if (/^https?:\/\/(www\.)?(example|placeholder|placekitten|placehold|placehold\.it|via\.placeholder|picsum\.photos|unsplash\.com|images\.unsplash\.com|pexels\.com|images\.pexels\.com)/i.test(t)) return false;
  return /^https?:\/\//i.test(t) || /^data:image\//i.test(t);
}

function isHex(s) { return typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s.trim()); }

function cleanContentIdentity(item) {
  const frame = prefix => ({ [prefix+'Fit']:item[prefix+'Fit']==='contain'?'contain':'cover', [prefix+'Position']:/^\d{1,3}(?:\.\d+)?% \d{1,3}(?:\.\d+)?%$/.test(item[prefix+'Position']||'')?item[prefix+'Position']:'50% 50%' });
  return { id:str(item.id,100), assetId:str(item.assetId,100), ...frame('image'),...frame('cover') };
}
function cleanVoucher(v) {
  return {
    ...cleanContentIdentity(v),
    programRewardId: str(v.programRewardId, 100),
    description: str(v.description, 240),
    title: str(v.title, 60),
    vendor: str(v.vendor, 80),
    expiry: str(v.expiry, 40),
    actionType: ['points','code','qr'].includes(v.actionType) ? v.actionType : 'points',
    actionValue: str(v.actionValue, 30),
    emoji: str(v.emoji, 4) || '🎁',
    imageUrl: isSafeUrl(v.imageUrl) ? v.imageUrl : '',
    imageData: v.imageData || ''
  };
}
function cleanOffer(o) {
  return {
    ...cleanContentIdentity(o),
    title: str(o.title, 80),
    description: str(o.description, 200),
    cta: str(o.cta, 30) || 'Learn More',
    playerCount: str(o.playerCount, 30),
    expiry: str(o.expiry, 40),
    emoji: str(o.emoji, 4) || '🎯',
    imageUrl: isSafeUrl(o.imageUrl) ? o.imageUrl : '',
    imageData: o.imageData || ''
  };
}
function cleanBadge(b) {
  const allowed = ['amber','emerald','blue','purple','rose','teal','orange','indigo','red','green'];
  return {
    ...cleanContentIdentity(b),
    name: str(b.name, 40),
    emoji: str(b.emoji, 4) || '⭐',
    color: allowed.includes(b.color) ? b.color : 'amber',
    imageUrl: isSafeUrl(b.imageUrl) ? b.imageUrl : '',
    imageData: b.imageData || ''
  };
}
function cleanClub(c) {
  return {
    ...cleanContentIdentity(c),
    name: str(c.name, 40),
    description: str(c.description, 200),
    memberCount: typeof c.memberCount === 'number' ? c.memberCount : (parseInt(c.memberCount, 10) || 0),
    emoji: str(c.emoji, 4) || '👥',
    imageUrl: isSafeUrl(c.imageUrl) ? c.imageUrl : '',
    imageData: c.imageData || ''
  };
}
function cleanBenefit(b) {
  return {
    ...cleanContentIdentity(b),
    name: str(b.name, 40),
    emoji: str(b.emoji, 4) || '✨',
    imageUrl: isSafeUrl(b.imageUrl) ? b.imageUrl : '',
    imageData: b.imageData || '',
    coverImageUrl: isSafeUrl(b.coverImageUrl) ? b.coverImageUrl : '',
    coverImageData: typeof b.coverImageData === 'string' && b.coverImageData.startsWith('data:image/') ? b.coverImageData : ''
  };
}
function cleanEarnMore(e) {
  return {
    ...cleanContentIdentity(e),
    programRuleId: str(e.programRuleId, 100),
    title: str(e.title, 80),
    description: str(e.description, 200),
    hasCodeInput: Boolean(e.hasCodeInput),
    cta: str(e.cta, 50),
    emoji: str(e.emoji, 4),
    imageUrl: isSafeUrl(e.imageUrl) ? e.imageUrl : '',
    imageData: e.imageData || ''
  };
}
function cleanProfileTask(t) {
  return {
    ...cleanContentIdentity(t), description: str(t.description, 200), cta: str(t.cta, 30) || 'Go' };
}
function cleanUpsell(u) {
  return {
    title: str(u.title, 60),
    subtitle: str(u.subtitle, 60),
    price: str(u.price, 12),
    period: str(u.period, 24),
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
  window.LPGEditor?.displayControls();
  window.LPGCinematic?.sync();
  window.LPGRequirementsEditor?.sync();
  // Brand
  setVal('brand-name', state.brand.name);
  setVal('brand-industry', state.brand.industry);
  setVal('program-name', state.brand.programName);
  for(const [slot,owner,dataKey,urlKey] of [['logo',state.brand,'logoData','logoUrl'],['avatar',state.member,'avatarData','avatarUrl']]) {
    const source=owner[dataKey] || owner[urlKey] || '',preview=document.getElementById('preview-'+slot);
    setVal('url-'+slot,owner[urlKey] || '');
    if(preview){if(source){if(preview.getAttribute('src')!==source)preview.src=source;}else preview.removeAttribute('src');preview.classList.toggle('hidden',!source);}
  }

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

  // Program tiers are governed by the shared rule model.
  for (let i = 0; i < 3; i++) for (const part of ['name', 'points']) {
    const input = document.getElementById(`tier${i+1}-${part}`);
    if (input) { input.disabled = !!state.program && !state.tiers[i]; if (!state.tiers[i]) input.value = ''; }
  }
  const progress = document.getElementById('tier-progress');
  if (progress) progress.disabled = !!state.program;
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

  // Upsell — text
  setVal('upsell-title', state.upsell.title || '');
  setVal('upsell-subtitle', state.upsell.subtitle || '');
  setVal('upsell-price', state.upsell.price || '');
  setVal('upsell-period', state.upsell.period || '');
  setVal('upsell-tagline', state.upsell.tagline || '');
  setVal('upsell-cta', state.upsell.cta || '');
  // Upsell — colors (with defaults)
  const uBg = state.upsell.bgColor || '#7C1D1D';
  const uTitle = state.upsell.titleColor || state.colors.accent || '#E8B931';
  const uSub = state.upsell.subtitleColor || '#FFFFFF';
  const uPrice = state.upsell.priceColor || '#FFFFFF';
  const uPeriod = state.upsell.periodColor || '#E5E7EB';
  setVal('color-upsell-bg', uBg);            setVal('hex-upsell-bg', uBg);
  setVal('color-upsell-title', uTitle);      setVal('hex-upsell-title', uTitle);
  setVal('color-upsell-subtitle', uSub);     setVal('hex-upsell-subtitle', uSub);
  setVal('color-upsell-price', uPrice);      setVal('hex-upsell-price', uPrice);
  setVal('color-upsell-period', uPeriod);    setVal('hex-upsell-period', uPeriod);
  // Upsell — bg image
  const upsellBgSrc = state.upsell.bgImageData || state.upsell.bgImageUrl || '';
  const upsellBgPrev = document.getElementById('preview-upsell-bg');
  if (upsellBgPrev) {
    if (upsellBgSrc) { upsellBgPrev.src = upsellBgSrc; upsellBgPrev.classList.remove('hidden'); }
    else { upsellBgPrev.src = ''; upsellBgPrev.classList.add('hidden'); }
  }
  setVal('url-upsell-bg', state.upsell.bgImageUrl || '');
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
function onFieldChange(event) {
  window.LPGEditor?.record('Edit portal field', event.target?.id || 'field');
  // Read all fields into state
  state.brand.name = getVal('brand-name');
  state.brand.programName = getVal('program-name');

  // Tiers
  for (let i = 0; i < Math.min(3, state.tiers.length); i++) {
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

  // Upsell — text
  state.upsell.title = getVal('upsell-title');
  state.upsell.subtitle = getVal('upsell-subtitle');
  state.upsell.price = getVal('upsell-price');
  state.upsell.period = getVal('upsell-period');
  state.upsell.tagline = getVal('upsell-tagline');
  state.upsell.cta = getVal('upsell-cta');
  // Upsell — colors (only if the DOM has them yet)
  ['bg', 'title', 'subtitle', 'price', 'period'].forEach(part => {
    const c = getVal('color-upsell-' + part);
    if (c) state.upsell[part + 'Color'] = c;
    // reflect in hex mirror
    const hexEl = document.getElementById('hex-upsell-' + part);
    if (hexEl && c) hexEl.value = c;
  });

  const id = event?.target?.id;
  if (state.program && id) commitProgramEdit(program => {
    if (id === 'brand-name') program.providerName = state.brand.name;
    if (id === 'program-name') program.name = state.brand.programName;
    if (id === 'member-name') program.member[program.mode === 'b2b' ? 'organization' : 'name'] = state.member.name;
    if (id === 'member-points') program.opening.redeemable = Number(getVal(id));
    const tier = /^tier([1-3])-(name|points)$/.exec(id);
    if (tier && program.tiers[Number(tier[1]) - 1]) {
      program.tiers[Number(tier[1]) - 1][tier[2] === 'points' ? 'threshold' : 'name'] = tier[2] === 'points' ? Number(getVal(id)) : getVal(id);
    }
  });

  schedulePreview();
}

function onUpsellHexChange(part) {
  let hex = (getVal('hex-upsell-' + part) || '').trim();
  if (!hex.startsWith('#')) hex = '#' + hex;
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
    state.upsell[part + 'Color'] = hex;
    setVal('color-upsell-' + part, hex);
    schedulePreview();
  }
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
  window.LPGEditor?.record('onColorChange');
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
  state.brand.logoCandidates = [];
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
  const direction = step >= currentStep ? 1 : -1;
  stepTransition?.cancel();
  // Hide current
  const panels = document.querySelectorAll('.step-panel');
  panels.forEach(p => p.classList.remove('active'));
  // Show target
  const target = document.querySelector(`.step-panel[data-step="${step}"]`);
  if (target) target.classList.add('active');
  if (target?.animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    stepTransition = target.animate([
      { opacity: .5, transform: `translateX(${direction * 6}px)` },
      { opacity: 1, transform: 'translateX(0)' }
    ], { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
  currentStep = step;
  scheduleDraftRecovery();
  updateStepIndicators();
  updateNavButtons();
  window.LPGEditor?.stepChanged(step);
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
      const label = document.querySelector(`.step-dot[data-step="${currentStep + 1}"]`)?.dataset.label || 'next step';
      next.textContent = 'Continue to ' + label + ' →';
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
    btn.type = 'button';
    btn.dataset.palette = key;
    btn.setAttribute('aria-pressed', String(Object.entries(d.colors).every(([name, value]) => state.colors[name] === value)));
    btn.className = 'palette-btn flex items-center gap-2 text-xs font-600 text-gray-700';
    btn.innerHTML = `
      <div class="flex gap-0.5">
        <div class="w-4 h-4 rounded-full" style="background:${d.colors.primary}"></div>
        <div class="w-4 h-4 rounded-full" style="background:${d.colors.accent}"></div>
      </div>
      <span>${d.label}</span>
      <span class="palette-selection" aria-hidden="true">✓</span>
    `;
    btn.onclick = () => {
      window.LPGEditor?.record('Apply color palette');
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
      syncPaletteSelection();
      schedulePreview();
    };
    container.appendChild(btn);
  });
}

// ---- DYNAMIC SECTION RENDERING ----
function renderDynamicSections() {
  if(window.LPGContentContract)Object.assign(state,window.LPGContentContract.ensure(state));
  window.LPGCinematic?.sync();
  for (const section of ['vouchers', 'earnMore']) {
    const button = document.querySelector(`button[onclick="autoGenerate('${section}')"]`);
    if (button) button.textContent = state.program ? (section === 'vouchers' ? 'Edit reward rules' : 'Edit earning rules') : '⚡ Auto-generate from industry';
  }
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
        ${state.program && v.programRewardId ? '' : `<div><label class="block text-xs font-600 text-gray-600 mb-1">Action Type</label>
          <select onchange="updateItem('vouchers',${i},'actionType',this.value)" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-400/50 bg-white">
            <option value="points" ${v.actionType==='points'?'selected':''}>Points</option>
            <option value="code" ${v.actionType==='code'?'selected':''}>Code</option>
            <option value="qr" ${v.actionType==='qr'?'selected':''}>QR</option>
          </select>
        </div>`}
        <div><label class="block text-xs font-600 text-gray-600 mb-1">${state.program && v.programRewardId ? 'Points cost' : 'Action Value'}</label><input type="${state.program && v.programRewardId ? 'number' : 'text'}" value="${esc(state.program && v.programRewardId ? String(state.program.rewards.find(r => r.id === v.programRewardId)?.cost || '') : v.actionValue||'')}" onchange="updateItem('vouchers',${i},'actionValue',this.value)" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-400/50" placeholder="e.g. 250pts or CODE123"></div>
      </div>
      <label class="block text-xs font-600 text-gray-600 mt-3" for="voucher-description-${i}">Description</label>
      <textarea id="voucher-description-${i}" rows="3" maxlength="8000" class="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm" oninput="updateItem('vouchers',${i},'description',this.value)">${esc(v.description || '')}</textarea>
      ${imageUploadHTML('voucher-'+i, 'Voucher Image', v.imageData||v.imageUrl||'')}
    </div>
  `).join('');
  reinitDynamicImageUploads();
}

function addVoucher() {
  window.LPGEditor?.record('addVoucher');
  if (state.program) {
    const id = 'reward-' + Date.now();
    if (!commitProgramEdit(program => program.rewards.push({ id, name: 'New reward', cost: 100 }))) return;
    state.vouchers.push({ programRewardId: id, title: 'New reward', vendor: state.brand.name, description: '', actionType: 'points', actionValue: '100', emoji: '🎁', imageUrl: '', imageData: '' });
    renderVouchers(); schedulePreview(); return;
  }
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
  window.LPGEditor?.record('addOffer');
  state.offers.push({ title: '', description: '', cta: 'Learn More', emoji: '🎯', playerCount: '', expiry: '', imageUrl: '', imageData: '' });
  renderOffers();
}

// -- Badges --
function renderBadges() {
  const c = document.getElementById('badges-container');
  if (!c) return;
  c.innerHTML = state.badges.map((b, i) => `
    <div class="bg-gray-50 rounded-lg p-3 relative">
      <button onclick="removeItem('badges',${i})" class="absolute top-1 right-2 text-red-400 hover:text-red-600 text-sm font-bold leading-none">&times;</button>
      <div class="badge-edit-row">
        <input type="text" aria-label="Badge ${i+1} emoji" value="${esc(b.emoji||'')}" onchange="updateItem('badges',${i},'emoji',this.value)" class="w-12 px-2 py-2 border border-gray-300 rounded-lg text-center text-lg outline-none focus:ring-2 focus:ring-blue-400/50" title="Emoji (fallback if no image)">
        <input type="text" aria-label="Badge ${i+1} name" value="${esc(b.name)}" onchange="updateItem('badges',${i},'name',this.value)" class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-400/50" placeholder="Badge name">
        <select aria-label="Badge ${i+1} color" onchange="updateItem('badges',${i},'color',this.value)" class="px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-400/50 bg-white">
          ${GRADIENT_COLORS.map(c2 => `<option value="${c2}" ${b.color===c2?'selected':''}>${c2}</option>`).join('')}
        </select>
      </div>
      ${imageUploadHTML('badge-'+i, 'Badge Image (optional — replaces emoji)', b.imageData||b.imageUrl||'')}
    </div>
  `).join('');
  reinitDynamicImageUploads();
}

function addBadge() {
  window.LPGEditor?.record('addBadge');
  state.badges.push({ name: '', emoji: '⭐', color: 'amber', imageUrl: '', imageData: '' });
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
  window.LPGEditor?.record('addClub');
  state.clubs.push({ name: '', description: '', memberCount: 0, emoji: '👥', imageUrl: '', imageData: '' });
  renderClubs();
}

// -- Benefits --
function renderBenefits() {
  const c = document.getElementById('benefits-container');
  if (!c) return;
  c.innerHTML = state.benefits.map((b, i) => `
    <div class="bg-gray-50 rounded-lg p-3 relative">
      <button onclick="removeItem('benefits',${i})" class="absolute top-1 right-2 text-red-400 hover:text-red-600 text-sm font-bold leading-none">&times;</button>
      <div class="flex items-center gap-3">
        <input type="text" value="${esc(b.emoji||'')}" onchange="updateItem('benefits',${i},'emoji',this.value)" class="w-12 px-2 py-2 border border-gray-300 rounded-lg text-center text-lg outline-none focus:ring-2 focus:ring-blue-400/50" title="Emoji (fallback if no image)">
        <input type="text" value="${esc(b.name)}" onchange="updateItem('benefits',${i},'name',this.value)" class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-400/50" placeholder="Benefit name">
      </div>
      ${imageUploadHTML('benefit-'+i, 'Icon Image (optional — replaces emoji)', b.imageData||b.imageUrl||'')}
      ${state.outputTemplate === 'cinematic' ? (window.LPGCinematic?.renderBenefitCover(i,b) || '') : ''}
    </div>
  `).join('');
  reinitDynamicImageUploads();
}

function addBenefit() {
  window.LPGEditor?.record('addBenefit');
  state.benefits.push({ name: '', emoji: '✨', imageUrl: '', imageData: '', coverImageUrl: '', coverImageData: '' });
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
        ${state.program && e.programRuleId ? '' : `<label class="flex items-center gap-2 text-xs"><input type="checkbox" ${e.hasCodeInput?'checked':''} onchange="updateItem('earnMore',${i},'hasCodeInput',this.checked)"> Show code input field</label>`}
      </div>
    </div>
  `).join('');
}

function addEarnMore() {
  window.LPGEditor?.record('addEarnMore');
  if (state.program) {
    const id = 'activity-' + Date.now();
    if (!commitProgramEdit(program => program.earnRules.push({ id, name: 'New activity', kind: 'fixed', amount: 1, qualifyingRate: 0, redeemableRate: 0, qualifyingPoints: 25, redeemablePoints: 25, monthlyCap: null }))) return;
    state.earnMore.push({ programRuleId: id, title: 'New activity', description: 'Complete this activity to earn points.', hasCodeInput: false });
    renderEarnMore(); schedulePreview(); return;
  }
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
  window.LPGEditor?.record('addProfileTask');
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
  window.LPGEditor?.record('addNavLink');
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
  window.LPGEditor?.record('removeNavLink');
  state.navLinks.splice(i, 1);
  renderNavLinks();
  schedulePreview();
}

function commitProgramEdit(change) {
  if (!state.program || !window.LPGProgram) return true;
  const next = JSON.parse(JSON.stringify(state.program)); change(next);
  const result = LPGProgram.validate(next);
  const status = document.getElementById('portal-edit-status');
  if (!result.valid) {
    if (status) status.textContent = 'Preview keeps the last valid rules: ' + result.errors.join('; ');
    return false;
  }
  state.program = result.model;
  if (window.LPGProvenance && state.programEvidence) state.programEvidence = LPGProvenance.invalidate(state.programEvidence, result.model);
  if (state.programReview) change(state.programReview.program);
  if (status) status.textContent = '';
  return true;
}

// ---- GENERIC ITEM HELPERS ----
function updateItem(section, index, field, value) {
  window.LPGEditor?.record('Edit '+section, section+index+field);
  if (state[section] && state[section][index]) {
    const item = state[section][index];
    if (state.program && ['vouchers', 'earnMore'].includes(section)) {
      const ok = commitProgramEdit(program => {
        const rule = section === 'vouchers' ? program.rewards.find(r => r.id === item.programRewardId) : program.earnRules.find(r => r.id === item.programRuleId);
        if (rule && field === 'title') rule.name = value;
        if (rule && section === 'vouchers' && field === 'actionValue') rule.cost = Number(String(value).trim().match(/^\d+(?:\.\d+)?/)?.[0] ?? NaN);
      });
      if (!ok) return;
    }
    state[section][index][field] = value;
    schedulePreview();
  }
}

function removeItem(section, index) {
  window.LPGEditor?.record('Remove '+section);
  if (state[section]) {
    const item = state[section][index];
    if (state.program && item) commitProgramEdit(program => {
      if (section === 'vouchers') program.rewards = program.rewards.filter(r => r.id !== item.programRewardId);
      if (section === 'earnMore') program.earnRules = program.earnRules.filter(r => r.id !== item.programRuleId);
    });
    state[section].splice(index, 1);
    // Re-render the section
    const renderers = { vouchers: renderVouchers, offers: renderOffers, badges: renderBadges, clubs: renderClubs, benefits: renderBenefits, earnMore: renderEarnMore, profileTasks: renderProfileTasks };
    if (renderers[section]) renderers[section]();
    schedulePreview();
  }
}

// ---- AUTO-GENERATE ----
function autoGenerate(section) {
  if (state.program && ['vouchers', 'earnMore'].includes(section)) {
    goToStep(0); window.LPGRequirementsEditor?.editProgram();
    document.getElementById('program-review')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    return;
  }
  window.LPGEditor?.record('Use sample '+section);
  const d=getDefaults(state.brand.industry),mode=document.getElementById('sample-content-mode')?.value || 'fill';
  const incoming=d[section];
  const fill=(current,sample)=>Object.fromEntries([...new Set([...Object.keys(sample||{}),...Object.keys(current||{})])].map(key=>[key,current?.[key]!==undefined && current[key]!=='' ? current[key] : sample?.[key]]));
  if(Array.isArray(incoming)) {
    const existing=state[section] || [];
    if(mode==='replace')state[section]=incoming.map(item=>({...item}));
    else if(mode==='add')state[section]=[...existing,...incoming.map(item=>({...item}))];
    else if(!existing.length)state[section]=incoming.map(item=>({...item}));
    else state[section]=existing.map(item=>{const sample=incoming.find(x=>(x.name||x.title||x.description)===(item.name||item.title||item.description));return sample?fill(item,sample):item;});
  } else if(incoming && typeof incoming==='object')state[section]=mode==='replace'?{...incoming}:fill(state[section]||{},incoming);
  if(window.LPGContentContract)Object.assign(state,window.LPGContentContract.ensure(state));
  populateFormFromState();renderDynamicSections();

  schedulePreview();
}

// ---- IMAGE UPLOAD RE-INIT ----
function reinitDynamicImageUploads() {
  window.LPGCinematic?.initBenefitCoverUploads();
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
  // Benefit icons
  state.benefits.forEach((b, i) => {
    initImageUpload('drop-benefit-'+i, 'preview-benefit-'+i, 'url-benefit-'+i, (data) => {
      if (data && data.startsWith('data:')) { b.imageData = data; b.imageUrl = ''; }
      else { b.imageUrl = data; b.imageData = ''; }
      schedulePreview();
    });
  });
  // Badge icons
  state.badges.forEach((b, i) => {
    initImageUpload('drop-badge-'+i, 'preview-badge-'+i, 'url-badge-'+i, (data) => {
      if (data && data.startsWith('data:')) { b.imageData = data; b.imageUrl = ''; }
      else { b.imageUrl = data; b.imageData = ''; }
      schedulePreview();
    });
  });
  // Upsell bg image
  const uEl = document.getElementById('drop-upsell-bg');
  if (uEl) {
    initImageUpload('drop-upsell-bg', 'preview-upsell-bg', 'url-upsell-bg', (data) => {
      if (data && data.startsWith('data:')) { state.upsell.bgImageData = data; state.upsell.bgImageUrl = ''; }
      else { state.upsell.bgImageUrl = data; state.upsell.bgImageData = ''; }
      schedulePreview();
    });
  }
}

// ---- LIVE PREVIEW ----
function schedulePreview() {
  syncPaletteSelection();
  scheduleDraftRecovery();
  clearTimeout(previewTimer);
  previewTimer = setTimeout(updatePreview, 300);
}

function syncPaletteSelection() {
  document.querySelectorAll('[data-palette]').forEach(button => {
    const colors = INDUSTRY_DEFAULTS[button.dataset.palette]?.colors;
    button.setAttribute('aria-pressed', String(Boolean(colors && Object.entries(colors).every(([name, value]) => state.colors[name] === value))));
  });
}

let portalPreviewSequence = 0, expandedPreviewTimer = null, presenterRoleId = null, presenterRoleEpoch = null;
const portalPreviewPositions = new WeakMap();
const DESKTOP_PREVIEW_WIDTH = 1440, DESKTOP_PREVIEW_HEIGHT = 900;
let previewSizingInitialized = false, previewResizeObserver = null;
function fitDesktopPreview() {
  const stage = document.getElementById('preview-stage');
  const frame = document.getElementById('preview-iframe');
  const width = document.getElementById('preview-scroll')?.clientWidth || stage?.clientWidth || 0;
  // A hidden side panel has no measurable width. ResizeObserver fits it when
  // it becomes visible, without navigating the iframe or resetting its scroll.
  if (!frame || width <= 0) return;
  const device = document.getElementById('preview-device')?.value || 'desktop';
  const [canvasWidth,canvasHeight] = ({desktop:[1440,900],tablet:[820,1180],phone:[390,844],landscape:[844,390]})[device] || [1440,900];
  frame.style.width=canvasWidth+'px';frame.style.height=canvasHeight+'px';frame.width=canvasWidth;frame.height=canvasHeight;
  const actualSize = document.getElementById('preview-zoom')?.value === 'actual';
  const scale = actualSize ? 1 : Math.min(1, width / canvasWidth);
  frame.style.transform = `scale(${scale})`;
  stage.style.height = `${canvasHeight * scale}px`;
  stage.style.width = `${canvasWidth * scale}px`;
  frame.title = `${document.getElementById('preview-device')?.selectedOptions[0]?.textContent || 'Desktop'} loyalty portal preview, ${Math.round(scale * 100)}%`;
  const label = document.getElementById('preview-scale-label');
  if (label) label.textContent = `${canvasWidth} × ${canvasHeight} · ${Math.round(scale * 100)}%`;
}
function initializePreviewSizing() {
  const stage = document.getElementById('preview-stage');
  if (!stage) return;
  if (!previewSizingInitialized) {
    previewSizingInitialized = true;
    if (typeof ResizeObserver === 'function') {
      previewResizeObserver = new ResizeObserver(fitDesktopPreview);
      previewResizeObserver.observe(stage);
    }
    window.addEventListener('resize', fitDesktopPreview);
  }
  fitDesktopPreview();
}

function previewStatus(message, retry = false) {
  const status = document.getElementById('expanded-preview-status');
  if (status) { status.textContent = message; status.hidden = !message; }
  const button = document.getElementById('expanded-preview-retry');
  if (button) button.hidden = !retry;
}
// Runs only in the sandboxed builder preview; never included in downloaded portals.
function portalPreviewBridge(token, previous) {
  const send = data => parent.postMessage({ ...data, token }, '*');
  const candidates = () => {
    const scenes = Array.from(document.querySelectorAll('.cj-scene'));
    return scenes.length ? scenes : Array.from(document.querySelectorAll('[data-lpg-section]'));
  };
  const key = node => node.id || node.dataset.lpgSection || '';
  let pending;
  function report() {
    pending = null;
    const anchor = candidates().filter(node => node.getBoundingClientRect().top <= innerHeight / 2).at(-1);
    send({ type: 'lpg-preview-position', x: scrollX, y: scrollY,
      anchor: anchor ? key(anchor) : '', offset: anchor ? anchor.getBoundingClientRect().top : 0 });
  }
  function restore() {
    if (previous) {
      const anchor = previous.anchor && candidates().find(node => key(node) === previous.anchor);
      const y = anchor ? scrollY + anchor.getBoundingClientRect().top - previous.offset : previous.y;
      const root = document.documentElement, behavior = root.style.scrollBehavior;
      root.style.scrollBehavior = 'auto';
      scrollTo({ left: previous.x, top: Math.max(0, y), behavior: 'auto' });
      requestAnimationFrame(() => { root.style.scrollBehavior = behavior; });
    }
    report(); send({ type: 'lpg-preview-ready' });
  }
  addEventListener('scroll', () => { if (!pending) pending = setTimeout(report, 100); }, { passive: true });
  let editMode=false;
  addEventListener('message',event=>{
    if(event.source!==parent || event.data?.token!==token)return;
    if(event.data.type==='lpg-preview-image-framing') {
      const {slot,fit,position}=event.data;
      if(typeof slot!=='string'||!/^(?:(?:voucher|offer|badge|club|benefit-cover|benefit|earn|profile-task)-\d+|card-artwork)$/.test(slot))return;
      if(!['cover','contain'].includes(fit)||!/^\d{1,3}% \d{1,3}%$/.test(position))return;
      for(const image of document.querySelectorAll(`[data-lpg-image-slot="${slot}"]`)) {
        image.style.objectFit=fit;image.style.objectPosition=position;
      }
      return;
    }
    if(event.data.type!=='lpg-preview-edit-mode')return;
    editMode=event.data.enabled===true;
    document.body.style.cursor=editMode?'crosshair':'';
  });
  addEventListener('click',event=>{
    if(!editMode)return;
    const node=event.target.closest('[data-lpg-section],.cj-scene');if(!node)return;
    event.preventDefault();event.stopImmediatePropagation();
    send({type:'lpg-preview-selection',section:node.dataset.lpgSection || node.id});
  },true);
  // Allow layout scripts and two paint frames to establish sticky scene geometry.
  const start = () => requestAnimationFrame(() => requestAnimationFrame(restore));
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', start, { once: true }); else start();
}

// Framing changes are visual-only: update both sandboxed previews without navigating them.
function updatePreviewImageFraming(slot, fit, position) {
  for (const id of ['preview-iframe', 'expanded-preview-iframe']) {
    const frame = document.getElementById(id);
    if (frame?.dataset.previewToken) frame.contentWindow?.postMessage({
      type: 'lpg-preview-image-framing', token: frame.dataset.previewToken, slot, fit, position
    }, '*');
  }
  scheduleDraftRecovery();
}
function loadPortalPreview(frame, html) {
  if (!frame) return;
  const token = String(++portalPreviewSequence);
  frame.dataset.previewToken = token;
  frame.dataset.previewEpoch = String(typeof projectEpoch === 'number' ? projectEpoch : 0);
  const stored = portalPreviewPositions.get(frame);
  const previous = stored?.epoch === frame.dataset.previewEpoch ? stored.position : null;
  const ready = '<script>(' + portalPreviewBridge.toString() + ')(' + JSON.stringify(token) + ',' + JSON.stringify(previous) + ');<\/script>';
  frame.srcdoc = html.replace(/<\/body>\s*<\/html>\s*$/i, ready + '</body></html>');
  if (frame.id === 'expanded-preview-iframe') {
    clearTimeout(expandedPreviewTimer);
    previewStatus('Loading portal…');
    expandedPreviewTimer = setTimeout(() => previewStatus('The preview is taking longer to load. Reload it to try again.', true), 12000);
  }
}
window.addEventListener('message', event => {
  if (!['lpg-preview-ready', 'lpg-preview-position','lpg-preview-selection'].includes(event.data?.type)) return;
  const frame = ['preview-iframe', 'expanded-preview-iframe'].map(id => document.getElementById(id)).find(node => node && event.source === node.contentWindow);
  if (!frame || event.data.token !== frame.dataset.previewToken) return;
  if(event.data.type==='lpg-preview-selection'){if(typeof event.data.section==='string' && /^[a-z-]{1,40}$/.test(event.data.section))window.LPGEditor?.selectSection(event.data.section);return;}
  if (event.data.type === 'lpg-preview-position') {
    const { x, y, anchor, offset } = event.data;
    if (![x,y,offset].every(value => Number.isFinite(value) && Math.abs(value) <= 10000000) || x < 0 || y < 0 || typeof anchor !== 'string' || !/^[a-zA-Z0-9_-]{0,100}$/.test(anchor)) return;
    portalPreviewPositions.set(frame, { epoch: frame.dataset.previewEpoch, position: { x, y, anchor, offset } });
    return;
  }
  frame.contentWindow.postMessage({type:'lpg-preview-edit-mode',token:frame.dataset.previewToken,enabled:document.getElementById('preview-edit-mode')?.checked===true},'*');
  if (state.programEnabled && state.program?.roles?.some(role => role.id === presenterRoleId)) frame.contentWindow.postMessage({type:'lpg-preview-control',action:'role',roleId:presenterRoleId}, '*');
  if (frame.id === 'expanded-preview-iframe') { clearTimeout(expandedPreviewTimer); previewStatus(''); }
});
function refreshPresenterTools() {
  const epoch = typeof projectEpoch === 'number' ? projectEpoch : 0;
  if (presenterRoleEpoch !== epoch) { presenterRoleId = state.program?.member?.role || null; presenterRoleEpoch = epoch; }
  const program = state.programEnabled ? state.program : null;
  if (!program?.roles?.some(role => role.id === presenterRoleId)) presenterRoleId = program?.member?.role || null;
  document.querySelectorAll('[data-presenter-action]').forEach(button => { button.disabled = !program; });
  document.querySelectorAll('[data-presenter-role-label]').forEach(label => { label.hidden = !program || program.roles.length < 2; });
  document.querySelectorAll('[data-presenter-role]').forEach(select => {
    select.replaceChildren();
    (program?.roles || []).forEach(role => {
      const option = document.createElement('option'); option.value = role.id; option.textContent = role.name;
      option.selected = role.id === presenterRoleId; select.append(option);
    });
  });
}
function controlPortalPreview(action, roleId) {
  if (!['reset', 'welcome', 'role'].includes(action) || !state.programEnabled || !state.program) return;
  if (action === 'role' && !state.program.roles.some(role => role.id === roleId)) return;
  if (action === 'role') presenterRoleId = roleId;
  for (const id of ['preview-iframe', 'expanded-preview-iframe']) {
    const frame = document.getElementById(id);
    if (frame?.srcdoc) frame.contentWindow?.postMessage({ type: 'lpg-preview-control', action, roleId }, '*');
  }
  if (action === 'role') document.querySelectorAll('[data-presenter-role]').forEach(select => { select.value = roleId; });
}
function updatePreview() {
  initializePreviewSizing();
  refreshPresenterTools();
  try {
    const html = generatePortalHTML(state);
    loadPortalPreview(document.getElementById('preview-iframe'), html);
    if (document.getElementById('portal-preview-dialog')?.open) loadPortalPreview(document.getElementById('expanded-preview-iframe'), html);
  } catch (err) {
    console.error('Preview error:', err);
    if (document.getElementById('portal-preview-dialog')?.open) previewStatus('The portal could not be rendered. Your work is kept; reload the preview to try again.', true);
  }
}
function closePortalPreview() {
  clearTimeout(expandedPreviewTimer);
  document.getElementById('portal-preview-dialog')?.close();
}
function openPortalPreview() {
  const dialog = document.getElementById('portal-preview-dialog');
  if (!dialog) return;
  // Establish the visible grid before navigating the iframe. A hidden iframe
  // with a percentage height can retain an unusable initial viewport.
  if (!dialog.open) dialog.showModal();
  const expandedDevice = document.getElementById('expanded-preview-device');
  if (expandedDevice) expandedDevice.value = document.getElementById('preview-device')?.value || 'desktop';
  refreshPresenterTools();
  const device=document.getElementById('preview-device')?.value;const dims=({tablet:[820,1180],phone:[390,844],landscape:[844,390]})[device];const expanded=document.getElementById('expanded-preview-iframe');if(expanded){expanded.style.width=dims?Math.min(dims[0],window.innerWidth-32)+'px':'100%';expanded.style.maxWidth='100%';expanded.style.margin='0 auto';}
  try { loadPortalPreview(document.getElementById('expanded-preview-iframe'), generatePortalHTML(state)); }
  catch (error) { console.error('Expanded preview error:', error); previewStatus('The portal could not be rendered. Your work is kept; reload the preview to try again.', true); }
}

// ---- EXPORT ----
function downloadHTML() {
  const html = generatePortalHTML(state);
  const slug = (state.brand.name || 'loyalty-portal').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const audience = state.program ? '-' + (state.activeVariant || state.program.mode) : '';
  const filename = `loyalty-portal-${slug || 'demo'}${audience}.html`;
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

function exportForCloudy() {
  downloadHTML();
  window.open('https://sfdc.co/cloudy', '_blank', 'noopener');
  const hint = document.getElementById('cloudy-hint');
  if (hint) {
    hint.classList.remove('hidden');
    setTimeout(() => hint.classList.add('hidden'), 6000);
  }
}

function startOver() {
  if (!confirm('Reset everything and start over?')) return;
  resetProjectIdentity();
  discardDraftRecovery(false);
  setVal('quickstart-url', '');
  window.LPGRequirementsEditor?.reset();
  state.brand = { name: '', industry: 'generic', programName: '', logoUrl: '', logoData: '' };
  state.member = { name: 'Avery Morgan', number: '234567', points: 1200, email: '', phone: '', joinDate: '', avatarUrl: '', avatarData: '' };
  state.locale = 'en-US'; state.displayLabels = {};
  state.tierProgress = 30;
  state.cinematic = window.LPGCinematic?.normalize();
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
  return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
