// Presentation-only templates. Program data and demo interactions remain shared.
(function (root) {
  'use strict';

  const list = Object.freeze([
    Object.freeze({ id: 'classic', name: 'Classic', description: 'The original loyalty dashboard with familiar cards and navigation.' }),
    Object.freeze({ id: 'modern', name: 'Modern Brand', description: 'A spacious, brand-led portal with a statement member card and refined rewards.' })
  ]);

  // Only opaque hex colors enter the stylesheet. Imported projects can contain
  // arbitrary strings, so CSS validation cannot rely on the editor color inputs.
  function color(value, fallback) {
    if (typeof value !== 'string' || !/^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(value)) return fallback;
    return value.length === 4 ? '#' + value.slice(1).split('').map(c => c + c).join('') : value;
  }

  function channels(hex) {
    return [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16));
  }

  function mix(hex, target, amount) {
    return '#' + channels(hex).map((channel, i) => Math.round(channel * (1 - amount) + channels(target)[i] * amount).toString(16).padStart(2, '0')).join('');
  }

  function luminance(hex) {
    return channels(hex).map(v => {
      const c = v / 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
  }

  function darkSurface(hex) {
    // White text, including 80%-opacity secondary text, stays legible even for
    // brands whose primary color is yellow or another very light shade.
    let result = hex;
    for (let i = 0; i < 12 && luminance(result) > 0.09; i++) result = mix(result, '#101828', 0.18);
    return result;
  }

  function stylesheet(state) {
    const colors = state.colors || {};
    const primary = color(colors.primary, '#245c4f');
    const accent = color(colors.accent, '#b9e7cb');
    const menu = darkSurface(color(colors.menu, primary));
    const deep = darkSurface(primary);
    const soft = mix(primary, '#ffffff', 0.94);
    const line = mix(primary, '#ffffff', 0.84);
    return `<style id="lpg-modern-template">
body[data-lpg-template="modern"] {
  --lpg-brand: ${primary}; --lpg-brand-deep: ${deep}; --lpg-accent: ${accent};
  --lpg-surface: ${soft}; --lpg-line: ${line}; --lpg-ink: #172b29; --lpg-muted: #52635f;
  background: #f7f9f8; color: var(--lpg-ink); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  line-height: 1.6; -webkit-font-smoothing: antialiased;
}
body[data-lpg-template="modern"] *, body[data-lpg-template="modern"] *::before, body[data-lpg-template="modern"] *::after { box-sizing: border-box; }
body[data-lpg-template="modern"] :is(a, button, input, select, textarea, summary):focus-visible { outline: 3px solid var(--lpg-brand-deep); outline-offset: 4px; box-shadow: 0 0 0 7px #fff; }
body[data-lpg-template="modern"] :is(button, a, input, select, textarea) { -webkit-tap-highlight-color: transparent; }
body[data-lpg-template="modern"] :is(button, input, select, textarea) { font: inherit; }
body[data-lpg-template="modern"] main { max-width: 1320px; padding-top: 42px; padding-bottom: 48px; }
body[data-lpg-template="modern"] main > :first-child .section-title { font-size: clamp(1.65rem, 3.1vw, 2.5rem); font-weight: 700; letter-spacing: -0.045em; line-height: 1.15; }
body[data-lpg-template="modern"] .section-title { letter-spacing: -0.025em; }
body[data-lpg-template="modern"] .text-muted { color: var(--lpg-muted); }
body[data-lpg-template="modern"] .site-header {
  background: ${menu} !important; border-bottom: 3px solid var(--lpg-accent); box-shadow: none;
}
body[data-lpg-template="modern"] .site-header > div { max-width: 1320px; }
body[data-lpg-template="modern"] .site-header > div > div { min-height: 80px; }
body[data-lpg-template="modern"] .site-header :is(a, button) { min-height: 44px; }
body[data-lpg-template="modern"] .site-header .nav-link { display: inline-flex; align-items: center; font-weight: 500; color: #fff; }
body[data-lpg-template="modern"] .site-header .nav-link::after { bottom: 2px; background: var(--lpg-accent); }
body[data-lpg-template="modern"] .member-hero {
  isolation: isolate; min-height: 208px; padding: clamp(24px, 4vw, 48px); border-radius: 28px;
  background: linear-gradient(115deg, ${deep} 0%, ${mix(deep, '#101828', 0.25)} 100%);
  box-shadow: 0 18px 42px -28px ${deep}; margin-bottom: 28px; gap: 24px;
}
body[data-lpg-template="modern"] .member-hero::before {
  inset: -150% -45% -150% 48%; transform: rotate(-30deg); border: 1px solid #ffffff22; border-radius: 50%;
  background: none; box-shadow: 0 0 0 42px #ffffff05, 0 0 0 84px #ffffff05, 0 0 0 126px #ffffff04;
}
body[data-lpg-template="modern"] .member-hero .text-white\\/70 { color: #ffffffd9; }
body[data-lpg-template="modern"] .member-hero .text-2xl { font-size: clamp(1.4rem, 2.6vw, 2rem); font-weight: 600; }
body[data-lpg-template="modern"] .member-hero .text-3xl { font-size: clamp(2rem, 4vw, 3.4rem); font-weight: 600; }
body[data-lpg-template="modern"] :is(.card, .lpg-program-card) {
  background: #fff; border: 1px solid #e1e8e5; border-radius: 22px; box-shadow: 0 4px 24px -18px #193b3529;
}
body[data-lpg-template="modern"] :is(.card-hover, .voucher-card, .offer-card, .earn-card) { transition: border-color .18s ease, box-shadow .18s ease; }
body[data-lpg-template="modern"] :is(.card-hover, .voucher-card, .offer-card, .earn-card):hover {
  transform: none; border-color: var(--lpg-line); box-shadow: 0 12px 32px -20px #193b3540;
}
body[data-lpg-template="modern"] .voucher-card { padding: 22px; gap: 18px; }
body[data-lpg-template="modern"] .voucher-card h3 { font-size: 1rem; line-height: 1.4; }
body[data-lpg-template="modern"] .offer-card { overflow: hidden; }
body[data-lpg-template="modern"] .offer-card img { transition: none; }
body[data-lpg-template="modern"] .earn-card { border-radius: 16px; padding: 20px; }
body[data-lpg-template="modern"] :is(.btn-primary, .btn-ghost) {
  min-height: 44px; border-radius: 12px; padding-inline: 20px; font-weight: 650; letter-spacing: .01em;
  text-transform: none; box-shadow: none; transition: filter .18s ease;
}
body[data-lpg-template="modern"] .btn-primary { background: var(--lpg-brand-deep); color: #fff; }
body[data-lpg-template="modern"] .btn-ghost { border-color: var(--lpg-brand-deep); color: var(--lpg-brand-deep); }
body[data-lpg-template="modern"] .btn-primary:hover { background: var(--lpg-brand-deep); filter: brightness(1.12); transform: none; box-shadow: none; }
body[data-lpg-template="modern"] .btn-ghost:hover { background: var(--lpg-brand-deep); color: #fff; }
body[data-lpg-template="modern"] footer { background: #edf2ef; border-color: #dce5df; margin-top: 48px; }
body[data-lpg-template="modern"] footer > div { max-width: 1320px; }
body[data-lpg-template="modern"] .lpg-program { margin-block: 32px; color: var(--lpg-ink); }
body[data-lpg-template="modern"] .lpg-program :is(h1, h2, h3) { letter-spacing: -.025em; line-height: 1.25; }
body[data-lpg-template="modern"] .lpg-program-nav { display: flex; flex-wrap: wrap; gap: 8px; padding: 8px; margin-bottom: 24px; background: #eaf0ec; border-radius: 16px; }
body[data-lpg-template="modern"] .lpg-program-nav :is(a, button) { min-height: 44px; padding: 10px 18px; border: 0; border-radius: 10px; background: transparent; color: var(--lpg-ink); font-weight: 600; text-decoration: none; }
body[data-lpg-template="modern"] .lpg-program-nav :is([aria-selected="true"], [aria-current="page"], .active) { background: #fff; color: var(--lpg-brand-deep); box-shadow: 0 2px 8px #193b3510; }
body[data-lpg-template="modern"] .lpg-program-panel { padding: clamp(16px, 2.5vw, 28px); border: 1px solid #e1e8e5; border-radius: 22px; background: #fff; }
body[data-lpg-template="modern"] .lpg-program-grid { gap: 20px; }
body[data-lpg-template="modern"] .lpg-program-card { padding: 24px; min-width: 0; }
body[data-lpg-template="modern"] .lpg-program :is(input, select, textarea) { min-height: 44px; max-width: 100%; border: 1px solid #9eaea6; border-radius: 10px; padding: 10px 12px; background: #fff; color: var(--lpg-ink); }
body[data-lpg-template="modern"] .lpg-program button { min-height: 44px; }
body[data-lpg-template="modern"] .lpg-program-table { width: 100%; border-collapse: collapse; font-size: .9rem; }
body[data-lpg-template="modern"] .lpg-program-table :is(th, td) { padding: 14px 16px; border-bottom: 1px solid #e1e8e5; text-align: left; vertical-align: top; }
body[data-lpg-template="modern"] .lpg-program-table th { background: var(--lpg-surface); font-size: .78rem; font-weight: 650; }
/* Program runtime styles are emitted near </body>. ID-qualified selectors keep
   this theme authoritative without depending on stylesheet insertion order. */
body[data-lpg-template="modern"].lpg-program-mode { background: #f7f9f8; color: var(--lpg-ink); }
body[data-lpg-template="modern"].lpg-program-mode .site-header { padding: 22px 32px; color: #fff !important; }
body[data-lpg-template="modern"] .lpg-program-header-inner { max-width: 1256px; font-weight: 650; letter-spacing: -.025em; }
body[data-lpg-template="modern"] #lpg-program-root { max-width: 1320px; padding: 40px 32px 64px; }
body[data-lpg-template="modern"] #lpg-program-root h1 { font-size: clamp(1.8rem, 4vw, 3.1rem); font-weight: 600; letter-spacing: -.045em; }
body[data-lpg-template="modern"] #lpg-program-root h2 { font-weight: 650; }
body[data-lpg-template="modern"] #lpg-program-root h3 { font-weight: 650; }
body[data-lpg-template="modern"] #lpg-program-root .lpg-p-intro {
  position: relative; isolation: isolate; overflow: hidden; min-height: 208px; padding: clamp(24px, 4vw, 44px);
  border-radius: 26px; background: linear-gradient(115deg, ${deep}, ${mix(deep, '#101828', 0.25)});
  color: #fff; align-items: center; box-shadow: 0 18px 42px -28px ${deep};
}
body[data-lpg-template="modern"] #lpg-program-root .lpg-p-intro::before {
  content: ''; position: absolute; z-index: -1; inset: -180% -55% -180% 55%; border: 1px solid #ffffff20;
  border-radius: 50%; transform: rotate(-30deg); pointer-events: none; box-shadow: 0 0 0 42px #ffffff05, 0 0 0 84px #ffffff05;
}
body[data-lpg-template="modern"] #lpg-program-root .lpg-p-intro :is(.lpg-p-muted, .lpg-p-eyebrow) { color: #ffffffd9; }
body[data-lpg-template="modern"] #lpg-program-root .lpg-p-intro label { color: #fff; margin-bottom: 8px; }
body[data-lpg-template="modern"] #lpg-program-root .lpg-p-nav { border: 0; padding: 8px; background: #eaf0ec; border-radius: 16px; }
body[data-lpg-template="modern"] #lpg-program-root .lpg-p-nav button { background: transparent; border-color: transparent; color: var(--lpg-ink); }
body[data-lpg-template="modern"] #lpg-program-root .lpg-p-nav [aria-current="page"] { background: #fff; border-color: #fff; color: var(--lpg-brand-deep); box-shadow: 0 2px 8px #193b3510; }
body[data-lpg-template="modern"] #lpg-program-root .lpg-p-grid { gap: 20px; }
body[data-lpg-template="modern"] #lpg-program-root .lpg-p-card { padding: 26px; border-radius: 20px; border-color: #e1e8e5; box-shadow: 0 4px 24px -18px #193b3529; }
body[data-lpg-template="modern"] #lpg-program-root .lpg-p-stat { font-size: clamp(2rem, 3vw, 2.65rem); font-weight: 600; color: var(--lpg-brand-deep); }
body[data-lpg-template="modern"] #lpg-program-root .lpg-p-muted { color: var(--lpg-muted); }
body[data-lpg-template="modern"] #lpg-program-root .lpg-p-notice { color: var(--lpg-muted); }
body[data-lpg-template="modern"] #lpg-program-root button { min-height: 44px; border-radius: 11px; border-color: #b4c5bb; padding: 11px 18px; color: var(--lpg-brand-deep); }
body[data-lpg-template="modern"] #lpg-program-root button:hover { background: var(--lpg-surface); }
body[data-lpg-template="modern"] #lpg-program-root .lpg-p-primary { background: var(--lpg-brand-deep); border-color: var(--lpg-brand-deep); color: #fff; }
body[data-lpg-template="modern"] #lpg-program-root .lpg-p-primary:hover { background: var(--lpg-brand-deep); filter: brightness(1.12); }
body[data-lpg-template="modern"] #lpg-program-root :is(input, select) { min-height: 44px; border-color: #9eaea6; border-radius: 10px; padding: 10px 12px; }
body[data-lpg-template="modern"] #lpg-program-root :is(button, input, select):focus-visible { outline: 3px solid var(--lpg-brand-deep); outline-offset: 4px; box-shadow: 0 0 0 7px #fff; }
body[data-lpg-template="modern"] #lpg-program-root progress { height: 12px; accent-color: var(--lpg-brand-deep); }
body[data-lpg-template="modern"] #lpg-program-root .lpg-p-list li { border-color: #e1e8e5; padding: 18px 0; }
body[data-lpg-template="modern"] .lpg-program-footer { background: #edf2ef; border-color: #dce5df; color: var(--lpg-muted); }
body[data-lpg-template="modern"] [hidden] { display: none !important; }
@media (max-width: 767px) {
  body[data-lpg-template="modern"] main { padding-top: 24px; }
  body[data-lpg-template="modern"] .site-header > div > div { min-height: 68px; }
  body[data-lpg-template="modern"] .member-hero { align-items: flex-start; flex-direction: column; min-height: 0; border-radius: 20px; }
  body[data-lpg-template="modern"] .member-hero > div { min-width: 0; max-width: 100%; }
  body[data-lpg-template="modern"] .member-hero > div:last-child { width: 100%; padding-top: 20px; border-top: 1px solid #ffffff2b; }
  body[data-lpg-template="modern"] .member-hero .text-right { text-align: left; }
  body[data-lpg-template="modern"] .member-hero .justify-end { justify-content: flex-start; }
  body[data-lpg-template="modern"] .member-hero .text-2xl { overflow-wrap: anywhere; }
  body[data-lpg-template="modern"] .lpg-program-nav { gap: 4px; }
  body[data-lpg-template="modern"] .lpg-program-nav :is(a, button) { flex: 1 1 auto; padding-inline: 12px; text-align: center; }
  body[data-lpg-template="modern"] .lpg-program-panel { overflow-x: auto; }
  body[data-lpg-template="modern"] .voucher-card { padding: 16px; gap: 12px; }
  body[data-lpg-template="modern"].lpg-program-mode .site-header { padding: 18px 20px; }
  body[data-lpg-template="modern"] #lpg-program-root { padding: 24px 16px 40px; }
  body[data-lpg-template="modern"] #lpg-program-root .lpg-p-intro { padding: 24px; min-height: 0; border-radius: 20px; }
  body[data-lpg-template="modern"] #lpg-program-root .lpg-p-intro > div { min-width: 0; max-width: 100%; overflow-wrap: anywhere; }
  body[data-lpg-template="modern"] #lpg-program-root .lpg-p-card { padding: 20px; }
}
@media (prefers-reduced-motion: reduce) {
  body[data-lpg-template="modern"] *, body[data-lpg-template="modern"] *::before, body[data-lpg-template="modern"] *::after { transition: none !important; animation: none !important; scroll-behavior: auto !important; }
}
@media print {
  body[data-lpg-template="modern"] .site-header { position: static; }
  body[data-lpg-template="modern"] :is(.card, .lpg-program-card) { break-inside: avoid; box-shadow: none; }
}
</style>`;
  }

  function apply(html, state) {
    if (!state || state.outputTemplate !== 'modern' || typeof html !== 'string') return html;
    if (!/<\/head\s*>/i.test(html) || !/<body\b/i.test(html)) return html;
    const clean = html.replace(/<style id="lpg-modern-template">[\s\S]*?<\/style>/g, '');
    return clean.replace(/<body\b([^>]*)>/i, (_match, attributes) => {
      const attrs = attributes.replace(/\sdata-lpg-template=(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
      return `<body${attrs} data-lpg-template="modern">`;
    }).replace(/<\/head\s*>/i, () => stylesheet(state) + '\n</head>');
  }

  root.PortalTemplates = Object.freeze({ list, apply });
})(typeof window !== 'undefined' ? window : globalThis);
