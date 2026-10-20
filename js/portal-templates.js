// Presentation templates rearrange the same generated content and live controls.
(function (root) {
  'use strict';
  const list = Object.freeze([
    Object.freeze({ id: 'classic', name: 'Classic', description: 'The original complete loyalty portal.' }),
    Object.freeze({ id: 'dashboard', name: 'Member Dashboard', description: 'A personal command center with status, rewards, and activity at a glance.' }),
    Object.freeze({ id: 'showcase', name: 'Rewards Showcase', description: 'A visual rewards catalogue with generous imagery and clear redemption actions.' }),
    Object.freeze({ id: 'cinematic', name: 'Cinematic Journey', description: 'A cinematic scroll journey through status, rewards, and discovery.' }),
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

  function imageSource(value) {
    return typeof value === 'string' && /^(?:https?:\/\/|data:image\/(?:png|jpe?g|webp|gif|avif|svg\+xml)(?:;base64)?,)/i.test(value) ? value : '';
  }

  // Serialized into each export. Moving existing nodes preserves inline actions,
  // attached listeners, image fallbacks, input values, and generated content.
  function arrange(cinematic, options) {
    const kind = document.body.dataset.lpgTemplate;
    const main = document.querySelector('main');
    if (!main || !['dashboard', 'showcase', 'editorial', 'cinematic'].includes(kind)) return;
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
    if (kind !== 'cinematic') group('account', ['account']);
    if (kind === 'cinematic') {
      cinematic(layout, pending, group, options);
    } else if (kind === 'dashboard') {
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

  // Self-contained: this function travels with downloaded portals, without a library.
  function cinematic(layout, pending, group, options) {
    const make = (tag, className, text) => {
      const node = document.createElement(tag); node.className = className;
      if (text) node.textContent = text;
      return node;
    };
    const copy = (key, fallback) => typeof options.copy?.[key] === 'string' ? options.copy[key] : fallback;
    const heroSource = pending.get('hero');
    const tierSource = pending.get('tiers');
    const balanceSource = heroSource?.querySelector('[data-lpg-balance="redeemable"]');
    const tierName = tierSource?.querySelector('[data-lpg-tier]')?.textContent || options.initialTier || (options.descriptive || options.hasTiers === false ? 'Membership' : 'Member');
    const memberName = heroSource?.querySelector('.text-2xl')?.textContent || options.memberName || 'Member';
    const progressText = tierSource?.querySelector('[data-lpg-progress-text]');
    const progressMessage = copy('progressSummary', 'Explore eligible activities to move toward your next membership tier.');
    if (progressText) {
      progressText.removeAttribute('data-lpg-progress-text');
      progressText.classList.add('cj-progress-message');
      progressText.textContent = progressMessage;
      progressText.hidden = !progressMessage;
    }
    const nav = make('nav', 'cj-nav'); nav.setAttribute('aria-label', 'Your loyalty journey');
    layout.appendChild(nav);
    const scenes = [];
    function scene(id, keys, eyebrow, title, description, label) {
      if(typeof options.labels?.['nav'+id]==='string')label=options.labels['nav'+id];
      if (!keys.some(key => pending.has(key))) return null;
      const wrapper = make('section', 'cj-scene cj-' + id); wrapper.id = 'cj-' + id;
      const heading = make('div', 'cj-heading');
      const eyebrowNode = make('p', 'cj-eyebrow', copy(id + 'Eyebrow', eyebrow)); eyebrowNode.hidden = !eyebrowNode.textContent.trim(); heading.appendChild(eyebrowNode);
      const h = make('h2', 'cj-title', copy(id + 'Title', title)); h.id = 'cj-title-' + id;
      heading.appendChild(h); const closer = make('p', 'cj-description', copy(id + 'Description', description)); closer.hidden = !closer.textContent.trim(); heading.appendChild(closer);
      if (h.textContent.trim()) wrapper.setAttribute('aria-labelledby', h.id); else { h.hidden = true; wrapper.setAttribute('aria-label', label); } wrapper.appendChild(heading);
      const content = make('div', 'cj-content');
      for (const key of keys) if (pending.has(key)) { content.appendChild(pending.get(key)); pending.delete(key); }
      wrapper.appendChild(content); layout.appendChild(wrapper); scenes.push(wrapper);
      const link = make('a', 'cj-nav-link', label); link.href = '#' + wrapper.id; nav.appendChild(link);
      return wrapper;
    }
    group('account', ['account']);
    const arrival = scene('arrival', ['hero'], 'A WORLD OF BELONGING', 'Your world. Opening up.', 'Every moment brings you closer to something extraordinary.', 'Overview');
    if (arrival) {
      const heading = arrival.querySelector('.cj-heading');
      const originalTitle = document.querySelector('main h1');
      if (originalTitle) { originalTitle.classList.add('cj-program-name'); heading.prepend(originalTitle); }
      const stage = make('div', 'cj-stage');
      const orbit = make('i', 'cj-orbit'); orbit.setAttribute('aria-hidden', 'true'); stage.appendChild(orbit);
      stage.appendChild(heading);
      const status = make('div', 'cj-arrival-status');
      status.appendChild(make('p', 'cj-eyebrow', copy('statusEyebrow','YOUR NEXT CHAPTER')));
      status.appendChild(make('p', 'cj-title', copy('statusTitle','Good things. Already in motion.'))); stage.appendChild(status);
      const card = make('div', 'cj-membership');
      card.appendChild(make('p', 'cj-card-brand', options.brandName || 'MEMBERSHIP'));
      const sculpture = make('i', 'cj-card-sculpture'); sculpture.setAttribute('aria-hidden', 'true');
      sculpture.appendChild(make('i', '')); sculpture.appendChild(make('i', '')); card.appendChild(sculpture);
      const tier = make('p', 'cj-status-tier', tierName);
      if (tierSource?.querySelector('[data-lpg-tier]')) tier.dataset.lpgTier = '';
      card.appendChild(tier); card.appendChild(make('p', 'cj-card-member', memberName));
      const settings = options.card || {};
      const mark = settings.markMode === 'brand' ? options.brandLogo : settings.markMode === 'custom' ? options.markImage : '';
      if (mark) {
        const logo = make('img','cj-card-logo'); logo.src = mark; logo.alt = '';
        card.classList.add('cj-has-mark');
        logo.addEventListener('error',()=>{ card.classList.remove('cj-has-mark'); logo.remove(); }); card.appendChild(logo);
      }
      if (settings.mode === 'image' && options.cardImage) {
        const artwork = make('img','cj-card-artwork'); artwork.dataset.lpgImageSlot = 'card-artwork'; artwork.src = options.cardImage; artwork.alt = '';artwork.style.objectFit=options.cardFit==='contain'?'contain':'cover';artwork.style.objectPosition=options.cardPosition || '50% 50%';
        card.classList.add('cj-has-artwork');
        if (settings.showDetails === false) card.classList.add('cj-hide-details');
        artwork.addEventListener('error',()=>{ card.classList.remove('cj-has-artwork','cj-hide-details'); artwork.remove(); }); card.prepend(artwork);
      }
      stage.appendChild(card);
      const content = arrival.querySelector('.cj-content');
      if (progressText && progressMessage) {
        const summary = make('p', 'cj-status-summary', progressMessage); content.appendChild(summary);
      }
      stage.appendChild(content);
      const actions = make('div', 'cj-arrival-actions');
      const target = pending.has('vouchers') ? ['possibility', 'Explore your rewards'] : pending.has('tiers') ? ['progress', 'Explore your status'] : pending.has('offers') || pending.has('earn') || pending.has('upsell') ? ['discovery', 'Discover more'] : pending.has('benefits') ? ['benefits', 'Explore your benefits'] : null;
      actions.appendChild(make('p', 'cj-scroll-note', copy('scrollNote','Scroll to see what’s ahead ↓')));
      if (target && copy('arrivalAction',target[1])) { const label = copy('arrivalAction',target[1]); const action = make('a', 'cj-cta', (label === 'Explore your rewards' && target[0] !== 'possibility' ? target[1] : label) + ' ↗'); action.href = '#cj-' + target[0]; actions.appendChild(action); }
      stage.appendChild(actions); arrival.appendChild(stage);
    }
    scene('progress', ['tiers'], 'THE WAY FORWARD', 'A little closer. A little more yours.', 'Your status today, and the milestones ahead.', 'Your status');
    const possibility = scene('possibility', ['vouchers'], 'POSSIBILITY BECOMES REALITY', 'You’ve earned a world of possibilities.', 'Put your points toward something worth looking forward to.', 'Rewards');
    let film = null;
    if (possibility) {
      const first = possibility.querySelector('.voucher-card');
      // The shared renderer supplies two direct divs: image/fallback and copy.
      // Move the original card, including all its controls and runtime hooks.
      if (first && first.children.length === 2 && Array.from(first.children).every(node => node.tagName === 'DIV')) {
        film = make('div', 'cj-reward-film');
        const stage = make('div', 'cj-reward-stage');
        const heading = possibility.querySelector('.cj-heading'); heading.classList.add('cj-film-intro'); stage.appendChild(heading);
        first.before(film); first.classList.add('cj-featured-reward');
        first.firstElementChild.classList.add('cj-reward-visual'); first.lastElementChild.classList.add('cj-featured-copy');
        stage.appendChild(first); film.appendChild(stage);
      }
    }
    scene('benefits', ['benefits'], 'MORE THAN POINTS', 'Recognition. In all the right places.', 'The benefits that make your membership feel like yours.', 'Benefits');
    scene('discovery', ['offers', 'earn', 'upsell'], 'A LITTLE FURTHER', 'More to discover.', 'Fresh opportunities to get more from your membership.', 'Discover');
    scene('details', ['activity', 'team', 'profile', 'profile-tasks', 'badges', 'clubs'], 'YOUR MEMBERSHIP', 'The finer details.', 'Your activity, community, and account. All within reach.', 'Your account');
    if (balanceSource) {
      const quick = make('span', 'cj-nav-balance'); quick.appendChild(make('span', '', (options.labels?.balance || 'Balance')+' '));
      const balance = make('strong', '', balanceSource.textContent); balance.dataset.lpgBalance = 'redeemable'; quick.appendChild(balance); nav.appendChild(quick);
    }
    const benefits = layout.querySelector('#benefits-content');
    const toggle = benefits?.parentElement.querySelector('button');
    if (toggle) {
      toggle.setAttribute('aria-controls', benefits.id);
      const sync = () => toggle.setAttribute('aria-expanded', String(benefits.classList.contains('open')));
      sync(); new MutationObserver(sync).observe(benefits, { attributes: true, attributeFilter: ['class'] });
    }
    const statuses = Array.from(layout.querySelectorAll('[data-program-reward-id]')).map(card => {
      const reward = options.rewards.find(item => item.id === card.dataset.programRewardId);
      if (!reward || !balanceSource || options.descriptive) return null;
      const label = make('p', 'cj-reward-status'); card.querySelector('h3')?.before(label);
      return { label, cost: reward.cost };
    }).filter(Boolean);
    function parseBalance(text) {
      const locale = options.locale || 'en-US';
      const formatter = new Intl.NumberFormat(locale);
      const parts = formatter.formatToParts(12345.6);
      const group = parts.find(part => part.type === 'group')?.value;
      const decimal = parts.find(part => part.type === 'decimal')?.value;
      let normalized = String(text).replace(/[\u200e\u200f\u061c\s]/g, '');
      if (group) normalized = normalized.split(group).join('');
      if (decimal) normalized = normalized.split(decimal).join('.');
      for (let i = 0; i <= 9; i++) normalized = normalized.split(formatter.format(i)).join(String(i));
      return Number(normalized);
    }
    function updateRewards() {
      const available = parseBalance(balanceSource.textContent);
      if (!Number.isFinite(available)) return;
      statuses.forEach(({label, cost}) => {
        const ready = cost <= available;
        const unit = options.currencyName || 'points';
        label.textContent = ready ? 'Within your ' + unit + ' balance' : (cost - available).toLocaleString(options.locale || 'en-US', { maximumFractionDigits: 6 }) + ' more ' + unit + ' to go';
        label.dataset.ready = String(ready);
      });
    }
    if (balanceSource && statuses.length) { updateRewards(); new MutationObserver(updateRewards).observe(balanceSource, { childList: true, characterData: true, subtree: true }); }

    // All scenes have a complete static layout. Only roomy viewports get pinned
    // storytelling; compact, reduced-motion and print views use normal flow.
    const reveals = Array.from(layout.querySelectorAll('.cj-heading, .voucher-card, .offer-card, .benefit-card, .earn-card'))
      .filter(node => !node.closest('.cj-arrival, .cj-reward-film'));
    reveals.forEach(node => { node.dataset.cjReveal = ''; });
    if (!window.matchMedia || !window.requestAnimationFrame) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const compact = window.matchMedia('(max-width: 900px), (max-height: 740px)');
    // Fit each pinned scene independently. A longer sentence or membership name
    // must not switch off the other scene (or the page's continuous reveals).
    let fitDirty = true;
    function fits(node, available) {
      if (!node) return true;
      const height = Math.max(node.scrollHeight || 0, node.getBoundingClientRect().height || 0);
      return height <= available;
    }
    function measureScenes(enabled, screen) {
      arrival?.classList.toggle('cj-arrival-motion', enabled);
      film?.classList.toggle('cj-film-motion', enabled);
      if (!enabled) return;
      if (arrival) {
        const card = arrival.querySelector('.cj-membership');
        // The metallic sheen and artwork can extend the card's scrollable bounds.
        // Only visible text determines whether its fixed composition fits.
        const cardFits = !card || !card.clientHeight || Array.from(card.querySelectorAll('.cj-card-brand,.cj-status-tier,.cj-card-member')).every(text => {
          if (!text.offsetHeight && !text.offsetWidth) return true;
          const bottom = text.offsetTop + Math.max(text.offsetHeight, text.scrollHeight);
          return bottom <= card.clientHeight + 2 && (!text.clientWidth || text.scrollWidth <= text.clientWidth + 2);
        });
        const arrivalFits = cardFits && fits(arrival.querySelector('.cj-heading'), screen * .52) &&
          fits(arrival.querySelector('.cj-arrival-status'), screen * .35) &&
          fits(arrival.querySelector('.cj-stage > .cj-content'), screen * .3) &&
          fits(arrival.querySelector('.cj-arrival-actions'), screen * .12);
        arrival.classList.toggle('cj-arrival-motion', arrivalFits);
      }
      if (film) {
        const filmFits = fits(film.querySelector('.cj-film-intro'), screen * .55) &&
          fits(film.querySelector('.cj-featured-copy'), screen * .78);
        film.classList.toggle('cj-film-motion', filmFits);
      }
    }
    const clamp = value => Math.max(0, Math.min(1, value));
    const ease = value => { value = clamp(value); return value * value * (3 - 2 * value); };
    const set = (node, values) => { if (node) for (const [key, value] of Object.entries(values)) node.style.setProperty('--cj-' + key, String(value)); };
    let frame = 0;
    function paint() {
      frame = 0;
      const enabled = !motion.matches && !compact.matches;
      layout.classList.toggle('cj-motion', enabled);
      const navHeight = Math.ceil(nav.getBoundingClientRect().height);
      const screen = window.innerHeight - navHeight;
      set(layout, { 'nav-height': navHeight + 'px', 'screen-height': screen + 'px' });
      if (fitDirty) { measureScenes(enabled, screen); fitDirty = false; }
      const arrivalEnabled = enabled && arrival?.classList.contains('cj-arrival-motion');
      const filmEnabled = enabled && film?.classList.contains('cj-film-motion');
      // Read stationary scene bounds before writing animation properties.
      const measurements = scenes.map(node => ({ node, rect: node.getBoundingClientRect() }));
      const filmRect = filmEnabled && film ? film.getBoundingClientRect() : null;
      const entrances = enabled ? reveals.map(node => ({ node, top: node.getBoundingClientRect().top })) : [];
      let active = scenes[0];
      measurements.forEach(({node, rect}) => {
        if (rect.top <= window.innerHeight * .45) active = node;
        const position = clamp((navHeight - rect.top) / Math.max(1, rect.height - screen));
        set(node, { scroll: enabled ? position.toFixed(4) : '0' });
        if (node === arrival && arrivalEnabled) {
          // Chapter links and focus show the final, fully readable status view.
          const focused = node.contains(document.activeElement) || node.matches(':target');
          const p = focused ? 1 : position;
          const status = ease((p - .27) / .5);
          set(node, { intro: focused ? 0 : 1 - ease(p / .38), status,
            'status-y': (1 - status) * 35 + 'px', 'card-x': 71 - 21 * ease(p) + '%', 'card-y': 48 + 3 * ease(p) + '%',
            'card-width': 310 + 100 * ease(p) + 'px', 'card-height': 250 + 20 * ease(p) + 'px',
            'card-radius': 76 - 52 * ease(p) + 'px', 'card-tilt': -16 * (1 - ease(p)) + 'deg', 'card-rotate': -12 * (1 - ease(p)) + 'deg' });
        }
      });
      if (filmRect) {
        const focused = film.contains(document.activeElement) || possibility.matches(':target');
        const q = focused ? 1 : clamp((navHeight - filmRect.top) / Math.max(1, filmRect.height - screen));
        const reveal = ease((q - .08) / .64), copy = ease((q - .43) / .36);
        set(film, { 'mask-y': 27 * (1 - reveal) + '%', 'mask-x': 29 * (1 - reveal) + '%', 'mask-radius': 160 - 138 * reveal + 'px',
          'film-y': Math.max(64, Math.min(96, screen * .1)) * (1 - reveal) + 'px',
          'film-scale': .91 + .09 * reveal, 'landscape-scale': 1 + .18 * (1 - reveal), 'film-opacity': .4 + .6 * reveal,
          'film-copy': copy, 'film-copy-y': (1 - copy) * 30 + 'px', 'film-heading': 1 - ease((q - .22) / .27), 'film-heading-y': -35 * ease(q / .5) + 'px' });
      }
      entrances.forEach(({node, top}) => {
        const settled = node.contains(document.activeElement) || node.closest(':target') ? 1 : ease((window.innerHeight * .96 - top) / (window.innerHeight * .52));
        set(node, { enter: settled.toFixed(4) });
      });
      nav.querySelectorAll('a').forEach(link => {
        if (active && link.hash === '#' + active.id) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    }
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(paint); };
    layout.addEventListener('focusin', schedule); layout.addEventListener('focusout', schedule); window.addEventListener('hashchange', schedule);
    const refit = () => { fitDirty = true; schedule(); };
    window.addEventListener('scroll', schedule, { passive: true }); window.addEventListener('resize', refit, { passive: true });
    motion.addEventListener?.('change', refit); compact.addEventListener?.('change', refit);
    window.addEventListener('load', refit, { once: true });
    document.fonts?.ready?.then(refit);
    // The template is attached immediately after this function returns.
    schedule();
  }

  function stylesheet(state) {
    const colors = state.colors || {};
    const primary = color(colors.primary, '#245c4f');
    const accent = color(colors.accent, '#b9e7cb');
    const deep = darkSurface(primary);
    return `<style id="lpg-layout-template">
body[data-lpg-template] { --lpg-brand: ${primary}; --lpg-brand-deep: ${deep}; --lpg-accent: ${accent}; --lpg-glow: ${mix(accent, '#ffffff', .65)}; --cj-metal-light: ${mix(primary, '#ffffff', .88)}; --cj-metal-mid: ${mix(primary, '#ffffff', .76)}; --lpg-soft: ${mix(primary, '#ffffff', .95)}; --lpg-line: ${mix(primary, '#ffffff', .84)}; background: #f5f6f8; color: #18202f; font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif; line-height: 1.6; -webkit-font-smoothing: antialiased; }
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
.lpg-layout .voucher-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 8px; min-width: 0; }
.lpg-layout .voucher-actions > span { flex: 1 1 100%; min-width: 0; overflow-wrap: break-word; word-break: normal; }
.lpg-layout .voucher-actions > .btn-primary { flex: 0 0 auto; min-width: min(100%,10rem); max-width: 100%; white-space: normal; overflow-wrap: normal; word-break: normal; }
.lpg-layout .voucher-actions > [title="Copy code"] { flex-shrink: 0; }
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
.lpg-catalogue .voucher-card .voucher-actions > .btn-primary { flex: 0 0 100%; width: 100%; }
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
/* Cinematic Journey follows the approved concept: a light, sculptural opening,
   a card-to-status transformation, an expanding reward film, and benefit tiles. */
body[data-lpg-template="cinematic"] { --cj-gutter: max(24px,calc((100vw - 1240px)/2)); background: var(--lpg-soft); }
body[data-lpg-template="cinematic"] main { max-width: none; padding: 0; }
body[data-lpg-template="cinematic"] .site-header { position: relative; background-image: none !important; }
body[data-lpg-template="cinematic"] main > div:empty { display: none; }
.lpg-layout-cinematic { --cj-nav-height: 72px; --cj-screen-height: 800px; display: block; }
.cj-nav { position: sticky; top: 0; z-index: 40; display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 0 24px; padding: 10px 24px; background: #fffffff5; border-bottom: 1px solid var(--lpg-line); }
.cj-nav a { display: inline-flex; align-items: center; min-height: 44px; font-size: 12px; color: #465164; text-decoration: none; border-bottom: 2px solid transparent; }
.cj-nav a:hover,.cj-nav a[aria-current] { color: var(--lpg-brand-deep); border-bottom-color: var(--lpg-brand-deep); }
.cj-nav-balance { color: #526073; font-size: 11px; display: inline-flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.cj-nav-balance strong { color: var(--lpg-brand-deep); font-weight: 650; }
.cj-scene { position: relative; padding: clamp(60px,7vw,112px) var(--cj-gutter); scroll-margin-top: calc(var(--cj-nav-height) + 24px); }
.cj-heading { position: relative; min-width: 0; z-index: 2; }
.cj-eyebrow { color: #526073; font-size: 11px; letter-spacing: .18em; font-weight: 600; margin: 0 0 22px; }
.cj-title { font-size: clamp(2.8rem,5.5vw,6rem); line-height: 1.02; letter-spacing: -.065em; font-weight: 500; text-wrap: balance; margin: 0; max-width: 850px; }
.cj-heading :is(.cj-title,.cj-eyebrow,.cj-description),.cj-arrival-status p,.cj-scroll-note,.cj-status-summary,.cj-progress-message { white-space: pre-wrap; }
.cj-description { color: #526073; max-width: 460px; font-size: 16px; line-height: 1.65; margin: 24px 0 0; }
.cj-content { position: relative; min-width: 0; z-index: 1; }
.cj-arrival { background: var(--lpg-soft); padding: 0; }
.cj-stage { position: relative; min-height: 760px; padding: 72px max(28px,7vw); display: grid; grid-template-columns: minmax(0,1.1fr) minmax(0,.9fr); align-items: center; gap: 48px; overflow: hidden; }
.cj-arrival .cj-program-name { font-size: 15px; letter-spacing: -.01em; font-weight: 500; color: var(--lpg-brand-deep); margin: 0 0 34px; }
.cj-arrival .cj-title { max-width: 560px; }
.cj-arrival .cj-description { max-width: 300px; font-size: 14px; }
.cj-orbit { position: absolute; pointer-events: none; width: 740px; height: 740px; border-radius: 50%; top: -15%; right: -5%; background: radial-gradient(ellipse, var(--lpg-line), transparent 65%); opacity: .55; }
.cj-membership { position: relative; width: 100%; max-width: 440px; min-height: 250px; border-radius: 28px; padding: 30px; overflow: hidden; color: var(--lpg-brand-deep); background: linear-gradient(140deg,#fff 0%,var(--cj-metal-light) 20%,var(--cj-metal-mid) 43%,var(--cj-metal-light) 61%,var(--cj-metal-mid) 83%,#f1f7f2); box-shadow: inset 1px 1px 0 #fff,inset -1px -1px 0 #657b7455,14px 35px 70px -25px #15221f44; z-index: 3; }
.cj-membership::before { content: ''; position: absolute; inset: -90% -60%; background: linear-gradient(115deg,transparent 40%,#ffffff90 50%,transparent 60%); pointer-events: none; }
.cj-card-brand { position: relative; font-size: 11px; letter-spacing: .17em; font-weight: 650; max-width: calc(100% - 80px); }
.cj-status-tier { position: relative; margin-top: 56px; font-size: clamp(1.6rem,3vw,2.5rem); line-height: 1.1; letter-spacing: -.04em; font-weight: 500; }
.cj-card-logo { position: absolute; width: 76px; height: 76px; object-fit: contain; right: 22px; top: 20px; z-index: 3; }
.cj-has-mark .cj-card-sculpture { visibility: hidden; }
.cj-membership.cj-has-artwork { color: #fff; background: #18202f; }
.cj-card-artwork { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; }
.cj-has-artwork::before { inset: 0; z-index: 1; background: linear-gradient(180deg,#10182840,#101828b8); transform: none !important; }
.cj-has-artwork :is(.cj-card-brand,.cj-status-tier,.cj-card-member,.cj-card-sculpture) { z-index: 2; }
.cj-hide-details :is(.cj-card-brand,.cj-status-tier,.cj-card-member,.cj-card-sculpture,.cj-card-logo),.cj-hide-details::before { display: none; }
.cj-card-member { position: relative; margin-top: 12px; font-size: 11px; letter-spacing: .1em; }
.cj-card-sculpture { position: absolute; top: 20px; right: 22px; width: 76px; height: 76px; border: 1px solid #ffffffc0; border-radius: 50%; transform: rotate(-25deg); }
.cj-card-sculpture i { position: absolute; inset: 12px 0; border: 1px solid #ffffffc0; border-radius: 50%; }
.cj-card-sculpture i + i { inset: 0 20px; }
.cj-arrival-status { display: none; }
.cj-stage > .cj-content { grid-column: 1/-1; }
.lpg-layout-cinematic .cj-arrival .member-hero { padding: 0; min-height: 0; border-radius: 0; background: transparent; border: 0; box-shadow: none; justify-content: space-between; gap: 28px; }
.cj-arrival .member-hero::before { display: none; }
.cj-arrival .member-hero > div { min-width: 0; max-width: 100%; flex-wrap: wrap; }
.cj-arrival .member-hero > div > div { min-width: 0; }
.cj-arrival .member-hero [style*="color: #fff"] { color: var(--lpg-brand-deep) !important; }
.cj-arrival .member-hero .text-white { color: #18202f !important; }
.cj-arrival .member-hero [class*="text-white/"] { color: #526073 !important; }
.cj-arrival .member-hero [data-lpg-balance="redeemable"] { font-size: clamp(2.8rem,5vw,5rem); line-height: 1.05; font-weight: 500; letter-spacing: -.055em; }
.cj-arrival .member-hero .text-2xl { font-size: clamp(1.4rem,2.5vw,2rem); font-weight: 500; }
.cj-status-summary { margin-top: 18px; font-size: 13px; color: #526073; }
.cj-arrival-actions { grid-column: 1/-1; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; z-index: 4; }
.cj-scroll-note { color: #526073; font-size: 12px; margin: 0; }
.cj-cta { display: inline-flex; align-items: center; min-height: 44px; padding: 11px 22px; border-radius: 30px; background: var(--lpg-brand-deep); color: #fff; font-size: 12px; font-weight: 600; }
.cj-progress { background: #fff; display: grid; grid-template-columns: minmax(0,.85fr) minmax(0,1.15fr); gap: 64px; align-items: center; }
.cj-progress .cj-title { font-size: clamp(2.5rem,4vw,4rem); }
.cj-progress [data-lpg-section="tiers"] { border: 0; padding: 0; box-shadow: none; background: transparent; }
.cj-progress [data-lpg-section="tiers"].grid { display: block; }
.cj-progress [data-lpg-section="tiers"] > .card { border: 0; padding: 0; box-shadow: none; background: transparent; }
.cj-progress [data-lpg-section="tiers"] > .space-y-4 { margin-top: 28px; }
.cj-progress [data-lpg-section="tiers"] .flex { flex-wrap: wrap; gap: 18px; }
.cj-progress [data-lpg-tier-index] { min-width: 0; flex: 1 1 100px; }
.cj-progress [data-lpg-current-tier="true"] { outline-color: var(--lpg-brand-deep); }
.cj-possibility { padding: 0 0 80px; background: #fff; }
.cj-possibility > .cj-heading { padding: 70px var(--cj-gutter); }
.cj-possibility [data-lpg-section="vouchers"] > div:first-child { padding: 28px var(--cj-gutter) 0; }
.cj-possibility [data-lpg-section="vouchers"] > .grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 40px 32px; padding: 0 var(--cj-gutter); }
.cj-possibility .voucher-card { display: flex; flex-direction: column; border: 0; box-shadow: none; border-radius: 0; padding: 0; gap: 0; min-width: 0; background: transparent; cursor: auto; }
.cj-possibility .voucher-card > div:first-child { position: relative; width: 100%; height: auto; aspect-ratio: 1.4; border-radius: 22px; background-color: var(--lpg-soft); box-shadow: none; }
.cj-possibility .voucher-card > div:first-child > span { font-size: clamp(3rem,7vw,6rem); }
.cj-possibility .voucher-card > div:last-child { padding: 28px 0; width: 100%; }
.cj-possibility .voucher-card h3 { font-size: clamp(1.4rem,2.4vw,2.5rem); line-height: 1.15; letter-spacing: -.04em; font-weight: 500; }
.cj-possibility .voucher-card p { font-size: 14px; line-height: 1.65; }
.cj-reward-status { font-size: 11px !important; font-weight: 650; letter-spacing: .05em; text-transform: uppercase; color: #526073; margin-bottom: 16px; }
.cj-reward-status[data-ready="true"] { color: var(--lpg-brand-deep); }
.cj-possibility .voucher-actions { margin-top: 24px; }
.cj-reward-film { grid-column: 1/-1; margin-inline: calc(-1 * var(--cj-gutter)); }
.cj-reward-stage { position: relative; padding: 64px var(--cj-gutter); }
.cj-film-intro { text-align: center; max-width: 850px; margin: 0 auto 64px; }
.cj-film-intro .cj-description { margin-inline: auto; }
.cj-possibility .cj-featured-reward { display: grid; grid-template-columns: minmax(0,1.2fr) minmax(0,1fr); align-items: center; gap: 48px; }
.cj-possibility .cj-featured-reward > .cj-reward-visual { min-height: 320px; background: radial-gradient(ellipse at 70% 25%,var(--cj-metal-mid),transparent 65%),linear-gradient(140deg,var(--lpg-brand-deep),#18202f); }
.cj-reward-visual::before { content: ''; position: absolute; inset: 12% 18%; border: 1px solid #ffffff55; border-radius: 50%; box-shadow: 0 0 0 35px #ffffff09,0 0 0 70px #ffffff06; transform: rotate(-24deg); pointer-events: none; }
.cj-reward-visual img { position: relative; z-index: 1; width: 100%; height: 100%; object-fit: cover; }
.cj-reward-visual > span { position: relative; z-index: 1; }
.cj-benefits { background: var(--lpg-soft); }
.cj-benefits > .cj-heading { text-align: center; margin-bottom: 48px; }
.cj-benefits > .cj-heading .cj-title,.cj-benefits > .cj-heading .cj-description { margin-inline: auto; }
.cj-benefits [data-lpg-section="benefits"] { padding: 0; border: 0; box-shadow: none; background: transparent; }
.cj-benefits #benefits-content > div { padding: 28px 0 0; border: 0; }
.cj-benefits .benefits-grid { grid-template-columns: repeat(2,minmax(0,1fr)); gap: 18px; }
.cj-benefits .benefit-card { position: relative; isolation: isolate; overflow: hidden; display: flex; flex-direction: column; align-items: flex-start; justify-content: space-between; gap: 28px; min-height: 220px; padding: 30px; border: 0; border-radius: 24px; background: #fff; }
.cj-benefits .benefit-card.cj-benefit-has-cover { background: var(--lpg-brand-deep); color: #fff; }
.cj-benefits .benefit-card > img.lpg-benefit-cover { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: -2; }
.cj-benefit-has-cover::after { content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none; background: linear-gradient(180deg,#10182822,#101828cc); }
.cj-benefits .cj-benefit-has-cover .benefit-copy p { color: #fff; }
.cj-benefits .cj-benefit-has-cover > div:first-child { background: #fff !important; }
.cj-benefits .benefit-card .benefit-copy { flex: 0 1 auto; }
.cj-benefits .benefit-card .benefit-copy p { font-size: clamp(1.2rem,2.3vw,2rem); font-weight: 500; letter-spacing: -.035em; line-height: 1.2; }
.cj-benefits .benefit-card:first-child { background: var(--lpg-brand-deep); color: #fff; min-height: 280px; }
.cj-benefits .benefit-card:first-child .benefit-copy p { color: #fff; font-size: clamp(1.5rem,3vw,2.6rem); }
.cj-benefits .benefits-grid:has(> :nth-child(3)) > .benefit-card:first-child { grid-row: span 2; }
.cj-benefits .benefit-card:only-child { grid-column: 1/-1; }
.cj-discovery { background: #fff; }
.cj-discovery .cj-heading { margin-bottom: 64px; }
.cj-discovery .cj-content { display: grid; gap: 64px; }
.cj-discovery [data-lpg-section="offers"] > div:last-child { display: grid; gap: 40px; }
.cj-discovery .offer-card { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); margin: 0 !important; border: 0; border-radius: 24px; box-shadow: none; overflow: hidden; background: var(--lpg-soft); }
.cj-discovery .offer-card > div:first-child { width: 100%; height: 100%; min-height: 320px; }
.cj-discovery .offer-card > div:last-child { padding: clamp(28px,4vw,56px); }
.cj-discovery .offer-card h3 { font-size: clamp(1.6rem,3vw,3rem); font-weight: 500; line-height: 1.1; letter-spacing: -.04em; }
.cj-discovery .offer-card:nth-child(even) > div:first-child { order: 2; }
.cj-details { background: var(--lpg-soft); }
.cj-details .cj-heading { margin-bottom: 48px; }
.cj-details .cj-title { font-size: clamp(2.5rem,5vw,4rem); }
.cj-details .cj-content { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(100%,360px),1fr)); gap: 32px; }
.lpg-layout-cinematic > .lpg-account { padding: 24px var(--cj-gutter); }
.cj-scene .section-title { font-size: 1.2rem; }
.cj-scene .btn-primary { border-radius: 30px; }
.cj-scene a[style*="color:"] { color: var(--lpg-brand-deep) !important; }
/* Pinned scenes are opt-in. The static layout above is complete on its own. */
.cj-motion :where(.cj-arrival.cj-arrival-motion) { height: calc(var(--cj-screen-height) * 2.4); }
.cj-motion :where(.cj-arrival.cj-arrival-motion) .cj-stage { position: sticky; top: var(--cj-nav-height); height: var(--cj-screen-height); min-height: 0; display: block; padding: 0; }
.cj-motion :where(.cj-arrival.cj-arrival-motion) .cj-heading { position: absolute; left: 7%; top: 10%; width: 46%; opacity: var(--cj-intro,1); transform: translateY(calc(var(--cj-scroll,0) * -65px)); pointer-events: none; }
.cj-motion :where(.cj-arrival.cj-arrival-motion) .cj-membership { position: absolute; left: var(--cj-card-x,71%); top: var(--cj-card-y,48%); width: var(--cj-card-width,310px); height: var(--cj-card-height,250px); min-height: 0; max-width: 80%; padding: 28px; border-radius: var(--cj-card-radius,76px); transform: translate(-50%,-50%) perspective(900px) rotateY(var(--cj-card-tilt,-16deg)) rotateZ(var(--cj-card-rotate,-12deg)); }
.cj-motion :where(.cj-arrival.cj-arrival-motion) .cj-membership .cj-status-tier { margin-top: 40px; font-size: clamp(1.4rem,2.5vw,2rem); }
.cj-motion :where(.cj-arrival.cj-arrival-motion) .cj-membership::before { transform: translateX(calc(var(--cj-scroll,0) * 70%)); }
.cj-motion :where(.cj-arrival.cj-arrival-motion) .cj-arrival-status { display: block; position: absolute; top: 7%; left: 10%; right: 10%; text-align: center; opacity: var(--cj-status,0); transform: translateY(var(--cj-status-y,35px)); pointer-events: none; }
.cj-motion :where(.cj-arrival.cj-arrival-motion) .cj-arrival-status .cj-title { max-width: 850px; margin: auto; font-size: clamp(2.5rem,4.3vw,4.8rem); }
.cj-motion :where(.cj-arrival.cj-arrival-motion) .cj-stage > .cj-content { position: absolute; left: 7%; right: 7%; bottom: 11%; opacity: calc(.15 + var(--cj-status,0) * .85); transform: translateY(var(--cj-status-y,35px)); }
.cj-motion :where(.cj-arrival.cj-arrival-motion) .cj-arrival-actions { position: absolute; left: 7%; right: 7%; bottom: 20px; }
.cj-motion :where(.cj-reward-film.cj-film-motion) { height: calc(var(--cj-screen-height) * 2.3); }
.cj-motion :where(.cj-reward-film.cj-film-motion) .cj-reward-stage { position: sticky; top: var(--cj-nav-height); height: var(--cj-screen-height); padding: 0; }
.cj-motion :where(.cj-reward-film.cj-film-motion) .cj-film-intro { position: absolute; top: 7%; left: 10%; right: 10%; z-index: 4; opacity: var(--cj-film-heading,1); transform: translateY(var(--cj-film-heading-y,0px)); pointer-events: none; }
.cj-motion :where(.cj-reward-film.cj-film-motion) .cj-film-intro .cj-title { font-size: clamp(2.5rem,4.8vw,5rem); }
.cj-motion :where(.cj-reward-film.cj-film-motion) .cj-featured-reward { display: block; position: absolute; inset: 7% 4%; clip-path: inset(var(--cj-mask-y,27%) var(--cj-mask-x,29%) round var(--cj-mask-radius,160px)); transform: translateY(var(--cj-film-y,80px)) scale(var(--cj-film-scale,.91)); opacity: var(--cj-film-opacity,.4); }
.cj-motion :where(.cj-reward-film.cj-film-motion) .cj-featured-reward,.cj-motion :where(.cj-reward-film.cj-film-motion) .cj-featured-reward:hover { transition: none; box-shadow: none; transform: translateY(var(--cj-film-y,80px)) scale(var(--cj-film-scale,.91)); }
.cj-motion :where(.cj-reward-film.cj-film-motion) .cj-featured-reward > .cj-reward-visual { position: absolute; inset: 0; width: 100%; height: 100%; aspect-ratio: auto; min-height: 0; border-radius: 0; }
.cj-motion :where(.cj-reward-film.cj-film-motion) .cj-reward-visual > :is(img,span) { transform: scale(var(--cj-landscape-scale,1.18)); }
.cj-motion :where(.cj-reward-film.cj-film-motion) .cj-reward-visual::after { content: ''; position: absolute; z-index: 2; inset: 0; background: linear-gradient(180deg,#1018280a 10%,#101828b8 65%,#101828ed 100%); pointer-events: none; }
.cj-motion :where(.cj-reward-film.cj-film-motion) .cj-featured-reward > .cj-featured-copy { position: absolute; z-index: 3; left: 7%; bottom: 7%; width: 86%; padding: 0; opacity: var(--cj-film-copy,0); transform: translateY(var(--cj-film-copy-y,30px)); }
.cj-motion :where(.cj-reward-film.cj-film-motion) .cj-featured-copy :is(.text-dark,.text-muted,p,span,h3) { color: #fff !important; }
.cj-motion :where(.cj-reward-film.cj-film-motion) .cj-featured-copy h3 { font-size: clamp(1.6rem,3.6vw,3.5rem); max-width: 760px; }
.cj-motion :where(.cj-reward-film.cj-film-motion) .cj-featured-copy .btn-primary { background: #fff; color: #18202f; }
.cj-motion :where(.cj-reward-film.cj-film-motion) .cj-featured-copy [title="Copy code"] svg { color: #18202f !important; }
.cj-motion :where(.cj-reward-film.cj-film-motion) .cj-featured-copy .voucher-actions { max-width: 640px; }
/* Continuous entrances measure stationary containers and transform their children. */
[data-cj-reveal] { --cj-enter: 1; }
.cj-motion .cj-heading[data-cj-reveal] > :is(.cj-eyebrow,.cj-title,.cj-description) { opacity: calc(.12 + var(--cj-enter) * .88); transform: translateY(calc((1 - var(--cj-enter)) * 40px)); }
.cj-motion .voucher-card:not(.cj-featured-reward) > div:first-child,.cj-motion .offer-card > div:first-child { clip-path: inset(calc((1 - var(--cj-enter)) * 9%) calc((1 - var(--cj-enter)) * 12%) round calc(22px + (1 - var(--cj-enter)) * 120px)); opacity: calc(.15 + var(--cj-enter) * .85); }
.cj-motion .voucher-card:not(.cj-featured-reward) > div:last-child,.cj-motion .offer-card > div:last-child { opacity: calc(.2 + var(--cj-enter) * .8); transform: translateY(calc((1 - var(--cj-enter)) * 42px)); }
.cj-motion :is(.benefit-card,.earn-card)[data-cj-reveal] > :not(.lpg-benefit-cover) { opacity: calc(.2 + var(--cj-enter) * .8); transform: translateY(calc((1 - var(--cj-enter)) * 24px)); }
.cj-motion [data-cj-reveal]:focus-within,.cj-motion .cj-scene:target [data-cj-reveal] { --cj-enter: 1 !important; }
.cj-motion [data-cj-reveal]:focus-within > *,.cj-motion .cj-scene:target [data-cj-reveal] > * { opacity: 1 !important; transform: none !important; clip-path: none !important; }
/* A reward remains actionable immediately when reached with a keyboard or link. */
.cj-motion :where(.cj-reward-film.cj-film-motion) .cj-featured-reward:focus-within,.cj-motion .cj-possibility:target :where(.cj-reward-film.cj-film-motion) .cj-featured-reward { clip-path: none; transform: none; opacity: 1; }
.cj-motion :where(.cj-reward-film.cj-film-motion) .cj-featured-reward:focus-within .cj-featured-copy,.cj-motion .cj-possibility:target .cj-featured-copy { opacity: 1; transform: none; }
@media(max-width:900px) {
 .cj-stage { grid-template-columns: 1fr; gap: 36px; min-height: 0; padding: 56px 7%; }
 .cj-membership { justify-self: center; }
 .cj-progress { grid-template-columns: 1fr; gap: 40px; }
 .cj-nav { gap: 0 18px; }
 .cj-nav a { font-size: 11px; }
 .cj-possibility .cj-featured-reward { gap: 28px; }
}
@media(max-width:600px) {
 .cj-scene { padding: 60px 22px; }
 .cj-arrival,.cj-possibility { padding: 0; }
 .cj-title { font-size: clamp(2.6rem,11vw,3.6rem); }
 .cj-nav { padding: 6px 12px; gap: 0 14px; }
 .cj-nav-balance { flex-basis: 100%; justify-content: center; }
 .cj-stage { padding: 48px 22px; }
 .cj-membership { padding: 24px; }
 .cj-card-brand { max-width: calc(100% - 70px); }
 .cj-possibility [data-lpg-section="vouchers"] > .grid,.cj-possibility .cj-featured-reward { grid-template-columns: 1fr; }
 .cj-benefits .benefits-grid { grid-template-columns: 1fr; }
 .cj-benefits .benefits-grid > .benefit-card:first-child { grid-row: auto; }
 .cj-discovery .offer-card { grid-template-columns: 1fr; }
 .cj-discovery .offer-card:nth-child(even) > div:first-child { order: 0; }
 .cj-discovery .offer-card > div:first-child { min-height: 240px; }
 .cj-arrival .member-hero .text-right { text-align: left; }
 .cj-arrival .member-hero .justify-end { justify-content: flex-start; }
}
@media print, (prefers-reduced-motion:reduce) {
 .cj-motion .cj-arrival,.cj-motion .cj-reward-film { height: auto; }
 .cj-motion .cj-stage { position: relative; top: auto; height: auto; min-height: 0; display: grid; padding: 56px 7%; }
 .cj-motion .cj-arrival .cj-heading,.cj-motion .cj-membership,.cj-motion .cj-stage > .cj-content,.cj-motion .cj-arrival-actions { position: relative; left: auto; right: auto; top: auto; bottom: auto; width: auto; height: auto; opacity: 1; transform: none; }
 .cj-motion .cj-arrival-status { display: none; }
 .cj-motion .cj-membership { width: 100%; min-height: 250px; border-radius: 28px; }
 .cj-motion .cj-membership::before { transform: none; }
 .cj-motion .cj-reward-stage { position: relative; top: auto; height: auto; padding: 56px var(--cj-gutter); }
 .cj-motion .cj-film-intro { position: relative; top: auto; left: auto; right: auto; opacity: 1; transform: none; }
 .cj-motion .cj-featured-reward { display: grid; position: relative; inset: auto; opacity: 1; clip-path: none; transform: none; }
 .cj-motion .cj-featured-reward,.cj-motion .cj-featured-reward:hover { transition: none; box-shadow: none; transform: none; }
.cj-motion .cj-featured-reward > .cj-reward-visual { position: relative; inset: auto; min-height: 320px; aspect-ratio: 1.4; border-radius: 22px; }
 .cj-motion .cj-featured-reward > .cj-featured-copy { position: relative; inset: auto; width: 100%; opacity: 1; transform: none; }
 .cj-motion .cj-featured-copy :is(.text-dark,.text-muted,p,span,h3) { color: #18202f !important; }
 .cj-motion .cj-featured-copy .btn-primary { background: var(--lpg-brand-deep); color: #fff; }
 .cj-motion .cj-reward-visual::after { display: none; }
 .cj-motion [data-cj-reveal] > *,.cj-motion .cj-reward-visual > :is(img,span) { opacity: 1 !important; transform: none !important; clip-path: none !important; }
}
@media print { .cj-nav { position: static; } .cj-scene { break-inside: auto; } }

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
    if (!['dashboard','showcase','editorial','cinematic'].includes(id) || typeof html !== 'string' || !/<\/head\s*>/i.test(html) || !/<body\b/i.test(html)) return html;
    const clean = html.replace(/<style id="(?:lpg-modern-template|lpg-layout-template)">[\s\S]*?<\/style>/g, '').replace(/<script id="lpg-template-layout">[\s\S]*?<\/script>/g, '');
    const prepared = clean.replace(/<body\b([^>]*)>/i, (_m, attrs) => `<body${attrs.replace(/\sdata-lpg-template=(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')} data-lpg-template="${id}">`)
      .replace(/<\/head\s*>/i, () => stylesheet(state) + '\n</head>');
    // Exported runtime source may contain literal closing-body strings. Insert
    // before the document's final closing tag, never inside an existing script.
    const closingBody = Array.from(prepared.matchAll(/<\/body\s*>/gi)).pop();
    if (!closingBody) return html;
    const program = state.programEnabled ? (state._program || state.program) : null;
    const options = {
      brandName: typeof state.brand?.name === 'string' ? state.brand.name : '',
      memberName: typeof state.member?.name === 'string' ? state.member.name : '',
      initialTier: state._summary?.tier?.name || program?.member?.status || (program?.capabilities?.presentationOnly ? '' : typeof state.tiers?.[0]?.name === 'string' ? state.tiers[0].name : ''),
      descriptive: Boolean(program?.capabilities?.presentationOnly),
      hasTiers: program?.capabilities?.tiers !== false,
      locale: (() => { try { return Intl.getCanonicalLocales(program?.locale || state.locale || 'en-US')[0] || 'en-US'; } catch (_) { return 'en-US'; } })(),
      currencyName: typeof program?.currencies?.redeemableName === 'string' ? program.currencies.redeemableName : 'points',
      labels: Object.fromEntries(Object.entries(state.displayLabels || {}).filter(([,value])=>typeof value==='string' && value.length<=200)),
      cardFit: state.cinematic?.card?.artworkFit==='contain'?'contain':'cover',
      cardPosition: /^\d{1,3}% \d{1,3}%$/.test(state.cinematic?.card?.artworkPosition || '')?state.cinematic.card.artworkPosition:'50% 50%',
      copy: Object.fromEntries(Object.entries(state.cinematic?.copy || {}).filter(([,value]) => typeof value === 'string' && value.length <= 8000)),
      card: { mode: state.cinematic?.card?.mode === 'image' ? 'image' : 'loyalty', markMode: ['orbit','brand','custom'].includes(state.cinematic?.card?.markMode) ? state.cinematic.card.markMode : 'brand', showDetails: state.cinematic?.card?.showDetails !== false },
      markImage: imageSource(state.cinematic?.card?.markImageData) || imageSource(state.cinematic?.card?.markImageUrl),
      cardImage: imageSource(state.cinematic?.card?.artworkImageData) || imageSource(state.cinematic?.card?.artworkImageUrl),
      brandLogo: imageSource(state.brand?.logoData) || imageSource(state.brand?.logoUrl),
      rewards: Array.isArray(program?.rewards)
        ? program.rewards.filter(r => r && typeof r.id === 'string' && Number.isFinite(r.cost) && r.cost >= 0).map(r => ({ id: r.id, cost: r.cost })) : []
    };
    const serialized = JSON.stringify(options).replace(/</g, '\\u003c');
    return prepared.slice(0, closingBody.index) + `<script id="lpg-template-layout">(${arrange.toString()})(${id === 'cinematic' ? cinematic.toString() : 'null'}, ${serialized});</script>\n` + prepared.slice(closingBody.index);
  }
  root.PortalTemplates = Object.freeze({ list, apply });
})(typeof window !== 'undefined' ? window : globalThis);
