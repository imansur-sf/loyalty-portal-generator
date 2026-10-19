// Presentation templates rearrange the same generated content and live controls.
(function (root) {
  'use strict';
  const list = Object.freeze([
    Object.freeze({ id: 'classic', name: 'Classic', description: 'The original complete loyalty portal.' }),
    Object.freeze({ id: 'dashboard', name: 'Member Dashboard', description: 'A personal command center with status, rewards, and activity at a glance.' }),
    Object.freeze({ id: 'showcase', name: 'Rewards Showcase', description: 'A visual rewards catalogue with generous imagery and clear redemption actions.' }),
    Object.freeze({ id: 'editorial', name: 'Brand Experience', description: 'An immersive brand story with a statement hero, benefits, and curated offers.' })
  ]);
  function color(value, fallback) {
    if (typeof value !== 'string' || !/^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(value)) return fallback;
    return value.length === 4 ? '#' + value.slice(1).split('').map(c => c + c).join('') : value;
  }
  function channels(hex) { return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); }
  function mix(hex, target, amount) { return '#' + channels(hex).map((v, i) => Math.round(v * (1 - amount) + channels(target)[i] * amount).toString(16).padStart(2, '0')).join(''); }
  function luminance(hex) { return channels(hex).map(v => { const c = v / 255; return c <= .04045 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); }).reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0); }
  function darkSurface(hex) { let result = hex; for (let i = 0; i < 12 && luminance(result) > .09; i++) result = mix(result, '#101828', .18); return result; }

  // Serialized into each export. Moving existing nodes preserves inline actions,
  // attached listeners, image fallbacks, input values, and generated content.
  function arrange() {
    const kind = document.body.dataset.lpgTemplate;
    const main = document.querySelector('main');
    if (!main || !['dashboard', 'showcase', 'editorial'].includes(kind)) return;
    const sections = Array.from(main.querySelectorAll('[data-lpg-section]')).filter(node => !node.parentElement.closest('[data-lpg-section]'));
    if (!sections.length) return;
    const pending = new Map(sections.map(node => [node.dataset.lpgSection, node]));
    const layout = document.createElement('div');
    layout.className = 'lpg-layout lpg-layout-' + kind;
    layout.dataset.lpgLayout = kind;
    function group(name, keys) {
      const wrapper = document.createElement('div');
      wrapper.className = 'lpg-layout-group lpg-' + name;
      for (const key of keys) {
        const node = pending.get(key);
        if (node) { wrapper.appendChild(node); pending.delete(key); }
      }
      if (wrapper.children.length) layout.appendChild(wrapper);
      return wrapper;
    }
    group('account', ['account']);
    if (kind === 'dashboard') {
      group('overview', ['hero', 'tiers']);
      const columns = group('dashboard-columns', []);
      const primary = group('primary', ['vouchers', 'offers', 'earn']);
      const aside = group('secondary', ['activity', 'team', 'benefits', 'profile', 'profile-tasks', 'badges', 'clubs', 'upsell']);
      if (primary.children.length) columns.appendChild(primary);
      if (aside.children.length) columns.appendChild(aside);
      if (columns.children.length) layout.appendChild(columns);
    } else if (kind === 'showcase') {
      group('showcase-status', ['hero', 'tiers']);
      group('catalogue', ['vouchers']);
      group('promotions', ['offers']);
      const community = group('community', []);
      const communityMain = group('community-main', ['benefits', 'earn']);
      const communitySupport = group('community-support', ['upsell']);
      if (communityMain.children.length) community.appendChild(communityMain);
      if (communitySupport.children.length) community.appendChild(communitySupport);
      if (community.children.length) layout.appendChild(community);
      group('details', ['activity', 'team', 'profile', 'profile-tasks', 'badges', 'clubs']);
    } else {
      const hero = group('brand-opening', ['hero']);
      const candidate = main.querySelector('.offer-card img') || main.querySelector('.voucher-card img');
      if (candidate) {
        const src = candidate.getAttribute('src') || '';
        if (/^https?:\/\//i.test(src) || /^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(src)) {
          const picture = document.createElement('img');
          picture.src = src; picture.alt = ''; picture.className = 'lpg-brand-photo';
          picture.addEventListener('error', () => { picture.remove(); hero.classList.remove('lpg-has-photo'); });
          hero.appendChild(picture); hero.classList.add('lpg-has-photo');
        }
      }
      group('brand-benefits', ['benefits', 'tiers']);
      group('brand-stories', ['offers']);
      group('catalogue', ['vouchers']);
      group('brand-participate', ['earn', 'upsell']);
      group('details', ['activity', 'team', 'profile', 'profile-tasks', 'badges', 'clubs']);
    }
    // New/optional sections remain visible, even if a template has no special slot.
    for (const node of pending.values()) layout.appendChild(node);
    const firstContent = Array.from(main.children).find(node => node.matches('[data-lpg-layout], [data-lpg-section]') || node.querySelector('[data-lpg-section]'));
    if (firstContent) main.insertBefore(layout, firstContent); else main.appendChild(layout);
    // Only remove empty layout scaffolding. Never discard unmarked content.
    for (const node of Array.from(main.querySelectorAll('div')).reverse()) {
      if (node !== layout && !node.closest('[data-lpg-section]') && !node.children.length && !node.textContent.trim()) node.remove();
    }
    // Benefits stay expanded in the alternate layouts, while their existing
    // controls still allow the viewer to collapse them.
    const benefits = main.querySelector('#benefits-content');
    if (benefits) { benefits.classList.add('open'); }
  }

  function stylesheet(state) {
    const colors = state.colors || {};
    const primary = color(colors.primary, '#245c4f');
    const accent = color(colors.accent, '#b9e7cb');
    const deep = darkSurface(primary);
    return `<style id="lpg-layout-template">
body[data-lpg-template] { --lpg-brand: ${primary}; --lpg-brand-deep: ${deep}; --lpg-accent: ${accent}; --lpg-soft: ${mix(primary, '#ffffff', .95)}; --lpg-line: ${mix(primary, '#ffffff', .84)}; background: #f5f6f8; color: #18202f; font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif; line-height: 1.6; -webkit-font-smoothing: antialiased; }
body[data-lpg-template] *, body[data-lpg-template] *::before, body[data-lpg-template] *::after { box-sizing: border-box; }
body[data-lpg-template] main { max-width: 1440px; padding: 36px clamp(18px, 3.2vw, 48px) 64px; }
body[data-lpg-template] :is(button, a, input, select, textarea, summary):focus-visible { outline: 3px solid var(--lpg-brand-deep); outline-offset: 4px; box-shadow: 0 0 0 7px #fff; }
body[data-lpg-template] :is(h1,h2,h3,p,a,button) { overflow-wrap: anywhere; }
body[data-lpg-template] :is(input,select,textarea) { max-width: 100%; }
body[data-lpg-template] [hidden] { display: none !important; }
body[data-lpg-template] .site-header { background: #fff !important; color: #18202f !important; border-bottom: 1px solid var(--lpg-line); box-shadow: none; }
body[data-lpg-template] .site-header :is(.nav-link,.text-white) { color: #18202f; }
body[data-lpg-template] .site-header > div { max-width: 1440px; }
body[data-lpg-template] .site-header > div > div { min-height: 78px; }
body[data-lpg-template] .site-header .nav-link { min-height: 44px; display: inline-flex; align-items: center; font-weight: 600; }
body[data-lpg-template] .site-header .nav-link::after { background: var(--lpg-brand-deep); }
body[data-lpg-template] :is(.section-title,h1) { letter-spacing: -.035em; }
body[data-lpg-template] main > div > h1 { font-size: clamp(1.7rem,3vw,2.5rem); }
body[data-lpg-template] .text-muted { color: #586273; }
.lpg-layout { display: grid; gap: 32px; }
.lpg-layout-group { min-width: 0; display: grid; gap: 28px; align-content: start; }
.lpg-layout [data-lpg-section] { min-width: 0; margin: 0; }
.lpg-layout :is(.card,.lpg-p-card) { border: 1px solid #e2e6ea; background: #fff; border-radius: 16px; box-shadow: 0 4px 18px -14px #172b4244; }
.lpg-layout .section-title { font-size: 1.13rem; line-height: 1.35; }
.lpg-layout .member-hero { min-height: 230px; padding: 32px; border-radius: 20px; gap: 28px; background: linear-gradient(125deg, ${deep}, ${mix(deep, '#101828', .35)}); box-shadow: none; }
.lpg-layout .member-hero::before { background: radial-gradient(ellipse at 95% 0%, #ffffff22, transparent 60%); }
.lpg-layout .member-hero .text-white\\/70 { color: #ffffffd9; }
.lpg-layout .member-hero .text-3xl { font-size: clamp(2.5rem,4vw,4rem); font-weight: 600; }
.lpg-layout .member-hero .text-2xl { font-size: clamp(1.4rem,2.6vw,2rem); font-weight: 600; }
.lpg-layout :is(.btn-primary,.btn-ghost) { min-height: 44px; padding: 10px 20px; border-radius: 8px; font-weight: 650; text-transform: none; letter-spacing: 0; box-shadow: none; }
.lpg-layout .btn-primary { background: var(--lpg-brand-deep); color: #fff; }
.lpg-layout .btn-ghost { border-color: var(--lpg-brand-deep); color: var(--lpg-brand-deep); }
.lpg-layout :is(.voucher-card,.offer-card,.earn-card) { transition: box-shadow .2s ease, transform .2s ease; }
.lpg-layout :is(.voucher-card,.offer-card,.earn-card):hover { box-shadow: 0 12px 28px -18px #172b4266; transform: translateY(-2px); }
.lpg-layout .offer-card img { object-fit: cover; }
.lpg-layout .voucher-card h3 { font-size: 1rem; line-height: 1.4; }
.lpg-layout .voucher-card { padding: 20px; }
.lpg-layout .earn-card { padding: 22px; min-width: 0; }
/* Fit the section's available width, not the viewport. A dashboard rail or
   editorial half-column must never inherit the original four-column grid. */
.lpg-layout .benefits-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(100%,220px),1fr)); gap: 14px; }
.lpg-layout .benefit-card { min-width: 0; display: flex; align-items: center; gap: 12px; padding: 16px; }
.lpg-layout .benefit-card > :first-child { flex: 0 0 40px; width: 40px; height: 40px; }
.lpg-layout .benefit-copy { min-width: 0; flex: 1; }
.lpg-layout .benefit-copy p { line-height: 1.5; overflow-wrap: break-word; word-break: normal; }
.lpg-layout .earn-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(100%,280px),1fr)); gap: 18px; }
.lpg-layout .earn-card :is(h3,p,button) { overflow-wrap: break-word; word-break: normal; }
.lpg-layout .earn-card > .flex > .flex-1 { min-width: 0; }
.lpg-layout [data-lpg-section="profile"] .grid { grid-template-columns: repeat(auto-fit,minmax(min(100%,180px),1fr)); }
.lpg-layout [data-lpg-section="tiers"] { padding: 26px; }
.lpg-layout [data-lpg-section="tiers"] > .grid { gap: 16px; }
.lpg-layout #benefits-content.open { max-height: none; }
body[data-lpg-template] footer { background: #fff; border-top: 1px solid var(--lpg-line); margin-top: 0; }
body[data-lpg-template] footer > div { max-width: 1440px; }
/* Dashboard: split status overview, a broad rewards feed, and an account rail. */
.lpg-overview { grid-template-columns: minmax(0,1fr) minmax(0,1.2fr); align-items: stretch; }
.lpg-overview .member-hero { flex-direction: column; align-items: flex-start; justify-content: space-between; }
.lpg-dashboard-columns { grid-template-columns: minmax(0,1.9fr) minmax(280px,1fr); align-items: start; }
.lpg-secondary { padding: 22px; background: #eaf0f2; border-radius: 20px; gap: 22px; }
.lpg-secondary [data-lpg-section] { background: #fff; border-radius: 14px; }
.lpg-secondary .section-title { font-size: 1rem; }
.lpg-secondary [data-lpg-section="activity"] { padding: 20px; }
/* Showcase: full-width catalogue and campaigns, with large image-led cards. */
body[data-lpg-template="showcase"] { background: #fff; }
body[data-lpg-template="showcase"] main { max-width: 1520px; }
.lpg-showcase-status { grid-template-columns: minmax(0,1fr) minmax(0,1.25fr); border-bottom: 1px solid var(--lpg-line); padding-bottom: 32px; }
.lpg-showcase-status .member-hero { border-radius: 4px; }
.lpg-showcase-status [data-lpg-section="tiers"] { border: none; box-shadow: none; background: var(--lpg-soft); border-radius: 4px; }
.lpg-catalogue [data-lpg-section="vouchers"] > .grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(100%,240px),1fr)); gap: 22px; }
:is(.lpg-catalogue,.lpg-promotions) :is(.voucher-card,.offer-card) { display: flex; flex-direction: column; gap: 0; padding: 0; overflow: hidden; border-radius: 10px; }
.lpg-catalogue .voucher-card > div:first-child { width: 100%; height: auto; aspect-ratio: 1.35; border-radius: 0; background-color: var(--lpg-soft); box-shadow: none; }
.lpg-catalogue .voucher-card > div:last-child { padding: 24px; width: 100%; }
.lpg-catalogue .voucher-card > div:last-child > div:last-child { margin-top: 24px; }
.lpg-catalogue .voucher-card .btn-primary { flex: 1; }
.lpg-promotions [data-lpg-section="offers"] > div:last-child { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(100%,320px),1fr)); gap: 24px; }
.lpg-promotions .offer-card { margin: 0 !important; }
.lpg-promotions .offer-card > div:first-child { width: 100%; height: auto; aspect-ratio: 1.65; }
.lpg-community { grid-template-columns: minmax(0,2fr) minmax(240px,1fr); padding: 32px; background: var(--lpg-soft); border-radius: 12px; align-items: start; }
.lpg-community-main { gap: 32px; }
.lpg-community-support { min-width: 0; }
.lpg-community > :only-child { grid-column: 1 / -1; }
.lpg-details { grid-template-columns: repeat(auto-fit,minmax(min(100%,300px),1fr)); }
/* Editorial: a photographic opening, benefits story, and staggered campaigns. */
body[data-lpg-template="editorial"] { background: #faf9f6; }
body[data-lpg-template="editorial"] .site-header { border-bottom: 3px solid var(--lpg-brand-deep); }
body[data-lpg-template="editorial"] main { max-width: 1560px; padding-top: 22px; }
body[data-lpg-template="editorial"] main > div > h1 { font-family: Georgia, 'Times New Roman', serif; font-weight: 500; font-size: clamp(2rem,4vw,3.4rem); }
.lpg-layout-editorial { gap: 52px; }
.lpg-brand-opening { position: relative; isolation: isolate; overflow: hidden; border-radius: 4px; min-height: 360px; background: var(--lpg-brand-deep); }
.lpg-brand-opening .member-hero { background: transparent; position: relative; z-index: 1; min-height: 360px; border-radius: 0; padding: clamp(28px,5vw,72px); align-items: flex-start; flex-direction: column; justify-content: center; gap: 42px; }
.lpg-brand-opening .member-hero::before { display: none; }
.lpg-brand-opening.lpg-has-photo { grid-template-columns: 1fr 1.05fr; gap: 0; }
.lpg-brand-photo { width: 100%; height: 100%; min-height: 360px; object-fit: cover; }
.lpg-brand-opening .member-hero .text-2xl { font-family: Georgia, 'Times New Roman', serif; font-size: clamp(2rem,3vw,3rem); font-weight: 500; }
.lpg-brand-benefits { grid-template-columns: 1fr 1fr; align-items: stretch; padding: 32px; background: #fff; border-top: 1px solid var(--lpg-line); border-bottom: 1px solid var(--lpg-line); }
.lpg-brand-benefits [data-lpg-section] { border: 0; box-shadow: none; border-radius: 0; }
.lpg-brand-stories .offer-card { display: grid; grid-template-columns: 1.1fr 1fr; min-height: 320px; border: 0; background: #fff; border-radius: 4px; margin-top: 28px !important; }
.lpg-brand-stories .offer-card:nth-child(even) { grid-template-columns: 1fr 1.1fr; }
.lpg-brand-stories .offer-card:nth-child(even) > div:first-child { order: 2; }
.lpg-brand-stories .offer-card > div:first-child { width: 100%; height: 100%; min-height: 320px; }
.lpg-brand-stories .offer-card > div:last-child { padding: clamp(24px,4vw,60px); }
.lpg-brand-stories .offer-card h3 { font-family: Georgia, 'Times New Roman', serif; font-size: clamp(1.5rem,2.5vw,2.25rem); font-weight: 500; line-height: 1.2; }
.lpg-brand-participate { grid-template-columns: 1.6fr 1fr; align-items: start; }
body[data-lpg-template="editorial"] .lpg-layout .section-title { font-family: Georgia, 'Times New Roman', serif; font-size: 1.65rem; font-weight: 500; }
@media(max-width:1000px) {
 .lpg-dashboard-columns { grid-template-columns: minmax(0,1.6fr) minmax(250px,1fr); }
 .lpg-overview,.lpg-showcase-status,.lpg-community { grid-template-columns: 1fr; }
 .lpg-overview .member-hero { flex-direction: row; align-items: center; }
 .lpg-secondary { padding: 14px; }
 .lpg-primary [data-lpg-section="vouchers"] > .grid { grid-template-columns: 1fr; }
}
@media(max-width:767px) {
 body[data-lpg-template] main { padding: 24px 16px 40px; }
 .lpg-layout { gap: 28px; }
 .lpg-dashboard-columns,.lpg-brand-benefits,.lpg-brand-participate,.lpg-brand-opening.lpg-has-photo { grid-template-columns: 1fr; }
 .lpg-layout .member-hero,.lpg-overview .member-hero { flex-direction: column; align-items: flex-start; padding: 24px; }
 .lpg-layout .member-hero > div { min-width: 0; max-width: 100%; }
 .lpg-layout .member-hero .text-right { text-align: left; }
 .lpg-layout .member-hero .justify-end { justify-content: flex-start; }
 .lpg-brand-opening,.lpg-brand-opening .member-hero { min-height: 280px; }
 .lpg-brand-photo { min-height: 0; height: 240px; }
 .lpg-brand-benefits,.lpg-community { padding: 20px; }
 .lpg-brand-stories .offer-card,.lpg-brand-stories .offer-card:nth-child(even) { grid-template-columns: 1fr; }
 .lpg-brand-stories .offer-card:nth-child(even) > div:first-child { order: 0; }
 .lpg-brand-stories .offer-card > div:first-child { min-height: 0; height: 240px; }
 .lpg-primary .offer-card { flex-direction: column; }
 .lpg-primary .offer-card > div:first-child { width: 100%; height: 210px; }
 .lpg-layout [data-lpg-section="tiers"] { padding: 20px 14px; }
 .lpg-layout [data-lpg-section="tiers"] .w-16 { width: 48px; height: 48px; }
}
@media(prefers-reduced-motion:reduce) { body[data-lpg-template] *,body[data-lpg-template] *::before,body[data-lpg-template] *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; } }
@media print { body[data-lpg-template] .site-header { position: static; } .lpg-layout :is(.card,.offer-card,.voucher-card) { break-inside: avoid; } }
</style>`;
  }
  function apply(html, state) {
    const id = state && (state.outputTemplate === 'modern' ? 'dashboard' : state.outputTemplate);
    if (!['dashboard','showcase','editorial'].includes(id) || typeof html !== 'string' || !/<\/head\s*>/i.test(html) || !/<body\b/i.test(html)) return html;
    const clean = html.replace(/<style id="(?:lpg-modern-template|lpg-layout-template)">[\s\S]*?<\/style>/g, '').replace(/<script id="lpg-template-layout">[\s\S]*?<\/script>/g, '');
    const prepared = clean.replace(/<body\b([^>]*)>/i, (_m, attrs) => `<body${attrs.replace(/\sdata-lpg-template=(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')} data-lpg-template="${id}">`)
      .replace(/<\/head\s*>/i, () => stylesheet(state) + '\n</head>');
    // Exported runtime source may contain literal closing-body strings. Insert
    // before the document's final closing tag, never inside an existing script.
    const closingBody = Array.from(prepared.matchAll(/<\/body\s*>/gi)).pop();
    if (!closingBody) return html;
    return prepared.slice(0, closingBody.index) + `<script id="lpg-template-layout">(${arrange.toString()})();</script>\n` + prepared.slice(closingBody.index);
  }
  root.PortalTemplates = Object.freeze({ list, apply });
})(typeof window !== 'undefined' ? window : globalThis);
