// Requirements-driven portal renderer. Its factory is embedded in exported HTML.
(function (root, factory) {
  const runtime = factory();
  if (typeof module === 'object' && module.exports) module.exports = runtime;
  root.LPGProgramRuntime = runtime;
})(typeof window === 'object' ? window : globalThis, function createProgramRuntime() {
  'use strict';

  function serialize(value) {
    return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, character => ({
      '<': '\\u003c', '>': '\\u003e', '&': '\\u0026', '\u2028': '\\u2028', '\u2029': '\\u2029'
    })[character]);
  }

  function createSession(input, model) {
    const program = model.normalize(input);
    const events = [];
    const requests = [];
    let roleId = program.member.role;
    let sequence = 0;
    const role = () => program.roles.find(item => item.id === roleId);
    const can = permission => permission === 'approve' ? role().canApprove : ['earn', 'redeem'].includes(permission) && role().canRequest;
    function need(permission) {
      if (!can(permission)) throw new Error('This view does not permit that action. Switch to an authorized demo role.');
    }
    return {
      program, events, requests,
      role, can,
      switchRole(id) {
        if (!program.roles.some(item => item.id === id)) throw new Error('Unknown demo role.');
        roleId = id;
      },
      summary: () => model.summarize(program, events),
      reset() { events.length = 0; requests.length = 0; sequence = 0; },
      earn(ruleId, amount, date) {
        need('earn');
        const event = model.earn(program, events, ruleId, amount, date);
        events.push(event);
        return event;
      },
      request(rewardId, date) {
        need('redeem');
        // Validate the reward and available balance even when approval is required.
        const event = model.redeem(program, events, rewardId, date);
        if (program.mode === 'b2b' && program.approvalRequired) {
          if (requests.some(item => item.rewardId === rewardId && item.requestedBy === roleId && item.status === 'pending')) {
            throw new Error('This reward already has a pending request.');
          }
          const request = { id: 'request-' + (++sequence), rewardId, requestedBy: roleId, label: program.rewards.find(item => item.id === rewardId).name,
            cost: -event.redeemable, status: 'pending', date: event.date };
          requests.push(request);
          return request;
        }
        events.push(event);
        return event;
      },
      decide(id, approved, date) {
        need('approve');
        const request = requests.find(item => item.id === id);
        if (!request || request.status !== 'pending') throw new Error('This request is no longer pending.');
        if (request.requestedBy === roleId) throw new Error('Switch to a different approver to review this request.');
        if (approved) events.push(model.redeem(program, events, request.rewardId, date));
        request.status = approved ? 'approved' : 'declined';
        request.reviewedBy = roleId;
        return request;
      }
    };
  }

  const styles = `
    body.lpg-program-mode{margin:0;background:#f5f6f8;color:#172033;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .lpg-program-mode .site-header{padding:14px 24px;background:var(--brand-menu,#172554);color:white}
    .lpg-program-mode .site-header nav,.lpg-program-mode .site-header button,.lpg-program-mode .site-header [title="Account"]{display:none!important}
    .lpg-program-mode .site-header img{max-height:40px;max-width:220px}
    .lpg-program-mode .site-header a{color:inherit;text-decoration:none}
    .lpg-program-header-inner{max-width:1132px;margin:auto;display:flex;align-items:center;gap:14px;font-size:1.15rem;font-weight:750}
    .lpg-program-footer{border-top:1px solid #dce1e8;padding:28px 24px;text-align:center;background:white;color:#526071;font-size:.85rem}
    #lpg-program-root{max-width:1180px;margin:auto;padding:32px 24px 64px;line-height:1.5}
    #lpg-program-root *{box-sizing:border-box}
    #lpg-program-root h1{font-size:clamp(1.8rem,4vw,2.6rem);line-height:1.15;margin:6px 0 14px;font-weight:800}
    #lpg-program-root h2{font-size:1.45rem;margin:0 0 20px;font-weight:750}
    #lpg-program-root h3{font-size:1.08rem;margin:0 0 8px;font-weight:700}
    #lpg-program-root p{margin:8px 0}
    #lpg-program-root button,#lpg-program-root input,#lpg-program-root select{font:inherit}
    #lpg-program-root button{cursor:pointer;border:1px solid #c9ced8;background:white;color:#172033;border-radius:9px;padding:10px 16px;font-weight:650}
    #lpg-program-root button:hover{background:#eef1f6}
    #lpg-program-root button:disabled{cursor:not-allowed;opacity:.55}
    #lpg-program-root button:focus-visible,#lpg-program-root select:focus-visible,#lpg-program-root input:focus-visible{outline:3px solid #2563eb;outline-offset:3px}
    #lpg-program-root input,#lpg-program-root select{border:1px solid #aeb7c5;border-radius:8px;background:white;color:#172033;padding:10px;max-width:100%}
    #lpg-program-root input{width:150px;display:block;margin:5px 0 12px}
    #lpg-program-root label{display:block;font-weight:600;font-size:.9rem}
    .lpg-p-intro{display:flex;justify-content:space-between;align-items:start;gap:24px;flex-wrap:wrap;margin-bottom:26px}
    .lpg-p-eyebrow{font-size:.78rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#4b5563}
    .lpg-p-muted{font-size:.9rem;color:#526071}
    .lpg-p-notice{font-size:.85rem;color:#526071;padding:12px 0}
    .lpg-p-nav{display:flex;gap:8px;flex-wrap:wrap;border-bottom:1px solid #dce1e8;padding-bottom:16px;margin-bottom:24px}
    #lpg-program-root .lpg-p-nav [aria-current="page"]{background:#172554;color:white;border-color:#172554}
    .lpg-p-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:18px;margin:18px 0 24px}
    .lpg-p-card{background:white;border:1px solid #e1e5ec;border-radius:15px;padding:24px;box-shadow:0 2px 8px #17203305}
    .lpg-p-stat{display:block;font-size:2rem;font-weight:800;letter-spacing:-.04em;margin:6px 0}
    .lpg-p-list{display:grid;gap:12px;padding:0;list-style:none}
    .lpg-p-list li{padding:15px 0;border-bottom:1px solid #e1e5ec}
    .lpg-p-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
    #lpg-program-root .lpg-p-primary{background:#172554;border-color:#172554;color:white}
    #lpg-program-root .lpg-p-primary:hover{background:#233972}
    #lpg-p-status{min-height:28px;padding:8px 0;color:#14532d;font-weight:600}
    #lpg-p-status[data-error="true"]{color:#991b1b}
    #lpg-program-root progress{width:100%;height:14px;accent-color:#172554;margin:14px 0}
    @media(max-width:600px){#lpg-program-root{padding:24px 16px}.lpg-p-card{padding:18px}.lpg-p-nav button{flex:1}.lpg-p-intro{gap:14px}}
  `;

  function mount(program, model, document) {
    const root = document.getElementById('lpg-program-root');
    if (!root) return;
    const session = createSession(program, model);
    let page = 'overview';
    let message = '';
    let error = false;
    const names = { overview: 'Overview', earn: 'Earn', rewards: 'Rewards', activity: 'Activity', team: 'Team', approvals: 'Approvals' };
    const number = value => Number(value).toLocaleString('en-US', { maximumFractionDigits: 6 });
    const p = session.program;
    // Keep the live region connected while page content is rebuilt so announcements are reliable.
    const live = el('div'); live.id = 'lpg-p-status'; live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite');
    const body = el('div'); root.replaceChildren(live, body);
    function el(tag, text, className) {
      const node = document.createElement(tag);
      if (text !== undefined && text !== null) node.textContent = String(text);
      if (className) node.className = className;
      return node;
    }
    function button(text, action, id, className) {
      const node = el('button', text, className);
      node.type = 'button'; node.dataset.action = action;
      if (id) node.dataset.id = id;
      return node;
    }
    function card(title, description) {
      const node = el('article', null, 'lpg-p-card lpg-program-card'); node.append(el('h3', title));
      if (description) node.append(el('p', description, 'lpg-p-muted'));
      return node;
    }
    function stats(content, summary) {
      const grid = el('div', null, 'lpg-p-grid lpg-program-grid');
      [[p.currencies.qualifyingName, summary.qualifying, 'Determines your tier'],
        [p.currencies.redeemableName, summary.redeemable, 'Available for rewards'],
        ['Current tier', summary.tier.name, summary.nextTier ? number(summary.gap) + ' to ' + summary.nextTier.name : 'Highest tier achieved']]
        .forEach(([title, value, description]) => {
          const item = card(title); item.append(el('strong', typeof value === 'number' ? number(value) : value, 'lpg-p-stat'));
          item.append(el('p', description, 'lpg-p-muted')); grid.append(item);
        });
      content.append(grid);
    }
    function overview(content) {
      const summary = session.summary(); stats(content, summary);
      const progress = card('Your progress', summary.nextTier ? 'Every qualifying activity brings you closer to ' + summary.nextTier.name + '.' : 'You have reached the highest program tier.');
      if (summary.nextTier) {
        const bar = el('progress'); bar.max = summary.nextTier.threshold; bar.value = summary.qualifying;
        bar.setAttribute('aria-label', 'Qualifying points toward ' + summary.nextTier.name); progress.append(bar);
      }
      progress.append(el('p', 'Your ' + summary.tier.name + ' earning multiplier is ' + summary.tier.multiplier + '× on eligible purchase redeemable points.'));
      content.append(progress);
      const grid = el('div', null, 'lpg-p-grid lpg-program-grid');
      const earnCard = card('Keep earning', 'Explore activities that grow your balances.');
      earnCard.append(button('View earning activities', 'page', 'earn')); grid.append(earnCard);
      const rewardCard = card('Make your points count', 'Choose a reward from your program.');
      rewardCard.append(button('Explore rewards', 'page', 'rewards')); grid.append(rewardCard); content.append(grid);
    }
    function earning(content) {
      const grid = el('div', null, 'lpg-p-grid lpg-program-grid');
      p.earnRules.forEach(rule => {
        const item = card(rule.name);
        const detail = rule.kind === 'spend' ? number(rule.qualifyingRate) + ' qualifying and ' + number(rule.redeemableRate) + ' base redeemable points per unit spent.' : number(rule.qualifyingPoints) + ' qualifying and ' + number(rule.redeemablePoints) + ' redeemable points per activity.';
        item.append(el('p', detail, 'lpg-p-muted'));
        if (rule.monthlyCap !== null) item.append(el('p', 'Monthly qualifying points cap: ' + number(rule.monthlyCap) + '.', 'lpg-p-muted'));
        if (rule.kind === 'spend') {
          const label = el('label', 'Eligible purchase amount');
          const input = el('input'); input.type = 'number'; input.min = '0.000001'; input.step = 'any'; input.value = String(rule.amount);
          input.id = 'lpg-amount-' + rule.id; label.htmlFor = input.id; item.append(label, input);
        }
        const action = button('Simulate ' + rule.name, 'earn', rule.id, 'lpg-p-primary');
        action.disabled = !session.can('earn'); item.append(action); grid.append(item);
      });
      content.append(grid);
      if (!p.earnRules.length) content.append(el('p', 'No earning activities have been configured.'));
      if (!session.can('earn')) content.append(el('p', 'Switch to a purchasing or member view to simulate earning.', 'lpg-p-notice'));
      if (p.freeContentMonthlyCap !== null) {
        const month = new Date().toISOString().slice(0, 7);
        const fixedIds = new Set(p.earnRules.filter(rule => rule.kind === 'fixed').map(rule => rule.id));
        const used = session.events.filter(event => event.type === 'earn' && fixedIds.has(event.ruleId) && event.date.slice(0, 7) === month).reduce((total, event) => total + event.qualifying, 0);
        content.append(el('p', 'Shared monthly activity cap: ' + number(used) + ' of ' + number(p.freeContentMonthlyCap) + ' qualifying points used this month (UTC).', 'lpg-p-notice'));
      }
    }
    function rewards(content) {
      content.append(el('p', number(session.summary().redeemable) + ' ' + p.currencies.redeemableName + ' available.', 'lpg-p-muted'));
      const grid = el('div', null, 'lpg-p-grid lpg-program-grid');
      p.rewards.forEach(reward => {
        const item = card(reward.name, reward.description);
        item.append(el('strong', number(reward.cost) + ' ' + p.currencies.redeemableName, 'lpg-p-stat'));
        const action = button(p.mode === 'b2b' && p.approvalRequired ? 'Request reward' : 'Redeem reward', 'request', reward.id, 'lpg-p-primary');
        action.disabled = !session.can('redeem'); item.append(action); grid.append(item);
      });
      content.append(grid);
      if (!p.rewards.length) content.append(el('p', 'No rewards have been configured.'));
      if (p.mode === 'b2b' && p.approvalRequired) content.append(el('p', 'Requests require review by a different approver. Points are deducted only on approval.', 'lpg-p-notice'));
      if (session.requests.length) renderRequests(content, false);
    }
    function activity(content) {
      stats(content, session.summary());
      const list = el('ul', null, 'lpg-p-list');
      const opening = el('li'); opening.append(el('h3', 'Opening balance'), el('p', number(p.opening.qualifying) + ' ' + p.currencies.qualifyingName + ' · ' + number(p.opening.redeemable) + ' ' + p.currencies.redeemableName));
      list.append(opening);
      session.events.forEach(event => {
        const item = el('li'); item.append(el('h3', event.label), el('p', event.date.slice(0, 10), 'lpg-p-muted'));
        item.append(el('p', (event.qualifying >= 0 ? '+' : '') + number(event.qualifying) + ' ' + p.currencies.qualifyingName + ' · ' + (event.redeemable >= 0 ? '+' : '') + number(event.redeemable) + ' ' + p.currencies.redeemableName));
        list.append(item);
      });
      content.append(list);
    }
    function renderRequests(content, controls) {
      const list = el('ul', null, 'lpg-p-list');
      if (!session.requests.length) content.append(el('p', 'No reward requests yet. Use a purchasing view to request a reward.'));
      session.requests.forEach(request => {
        const item = el('li'); const requester = p.roles.find(role => role.id === request.requestedBy);
        item.append(el('h3', request.label), el('p', number(request.cost) + ' ' + p.currencies.redeemableName + ' · ' + request.status + ' · Requested by ' + requester.name));
        if (controls && request.status === 'pending') {
          const actions = el('div', null, 'lpg-p-actions');
          const approve = button('Approve', 'approve', request.id, 'lpg-p-primary');
          const decline = button('Decline', 'decline', request.id);
          approve.disabled = decline.disabled = !session.can('approve') || request.requestedBy === session.role().id;
          actions.append(approve, decline); item.append(actions);
        }
        list.append(item);
      });
      content.append(list);
    }
    function actor(role) {
      if (role.id === p.member.role) return p.member.name;
      return ['Alex Morgan', 'Sam Taylor', 'Jordan Lee'][p.roles.findIndex(item => item.id === role.id) % 3];
    }
    function team(content) {
      content.append(el('p', 'All views share this organization’s balances and activity.', 'lpg-p-muted'));
      const grid = el('div', null, 'lpg-p-grid lpg-program-grid');
      p.roles.forEach(role => {
        const item = card(actor(role), role.name);
        item.append(el('p', 'Demo team member · ' + p.member.organization, 'lpg-p-muted')); grid.append(item);
      });
      content.append(grid);
    }
    function render(focusHeading) {
      body.replaceChildren();
      const intro = el('div', null, 'lpg-p-intro');
      const title = el('div'); title.append(el('p', p.mode === 'b2b' ? 'Business loyalty account' : 'Member loyalty account', 'lpg-p-eyebrow'));
      title.append(el('h1', p.mode === 'b2b' ? (p.member.organization || 'Example Business') : (p.member.name || 'Demo Member')));
      title.append(el('p', [p.providerName, p.name].filter(Boolean).join(' · '), 'lpg-p-muted'));
      if (p.mode === 'b2b') title.append(el('p', actor(session.role()) + ' · ' + session.role().name, 'lpg-p-muted'));
      intro.append(title);
      if (p.roles.length > 1) {
        const switcher = el('div'); const label = el('label', 'View as'); label.htmlFor = 'lpg-p-role';
        const select = el('select'); select.id = 'lpg-p-role';
        p.roles.forEach(role => { const option = el('option', role.name); option.value = role.id; option.selected = role.id === session.role().id; select.append(option); });
        switcher.append(label, select); intro.append(switcher);
      }
      body.append(intro, el('p', 'Interactive prototype · Actions use sample data in this page. Views demonstrate permissions; they do not sign in real users.', 'lpg-p-notice'));
      body.append(button('Reset demo', 'reset'));
      const nav = el('nav', null, 'lpg-p-nav lpg-program-nav'); nav.setAttribute('aria-label', 'Loyalty portal');
      const pages = ['overview', 'earn', 'rewards', 'activity'];
      if (p.mode === 'b2b') pages.push('team');
      if (p.mode === 'b2b' && p.approvalRequired) pages.push('approvals');
      pages.forEach(id => { const item = button(names[id], 'page', id); if (page === id) item.setAttribute('aria-current', 'page'); nav.append(item); });
      body.append(nav);
      live.dataset.error = String(error); live.textContent = message;
      const content = el('section', null, 'lpg-program-panel'); const heading = el('h2', names[page]); heading.tabIndex = -1; content.append(heading);
      if (page === 'overview') overview(content);
      if (page === 'earn') earning(content);
      if (page === 'rewards') rewards(content);
      if (page === 'activity') activity(content);
      if (page === 'team') team(content);
      if (page === 'approvals') {
        if (!session.can('approve')) content.append(el('p', 'Switch to an approver view to review requests.', 'lpg-p-notice'));
        renderRequests(content, true);
      }
      body.append(content);
      if (focusHeading) heading.focus();
    }
    root.addEventListener('change', event => {
      if (event.target.id !== 'lpg-p-role') return;
      try { session.switchRole(event.target.value); message = 'Viewing as ' + session.role().name + '. Shared balances are unchanged.'; error = false; }
      catch (failure) { message = failure.message; error = true; }
      render(); document.getElementById('lpg-p-role').focus();
    });
    root.addEventListener('click', event => {
      const action = event.target.closest('button[data-action]');
      if (!action || !root.contains(action) || action.disabled) return;
      const type = action.dataset.action; const id = action.dataset.id;
      message = ''; error = false;
      try {
        if (type === 'reset') { session.reset(); message = 'Demo reset to opening balances.'; }
        if (type === 'page') { if (!Object.prototype.hasOwnProperty.call(names, id)) return; page = id; }
        if (type === 'earn') {
          const amount = document.getElementById('lpg-amount-' + id);
          const earned = session.earn(id, amount ? Number(amount.value) : undefined);
          message = 'Activity added: +' + number(earned.qualifying) + ' ' + p.currencies.qualifyingName + ', +' + number(earned.redeemable) + ' ' + p.currencies.redeemableName + '.';
        }
        if (type === 'request') { const result = session.request(id); message = result.status === 'pending' ? 'Reward requested. Switch to an approver view to review it.' : 'Reward redeemed. Your balance and activity have been updated.'; }
        if (type === 'approve' || type === 'decline') { session.decide(id, type === 'approve'); message = type === 'approve' ? 'Request approved. Points deducted once; activity updated.' : 'Request declined. Your points are unchanged.'; }
      } catch (failure) { message = failure.message; error = true; }
      render(type === 'page');
      if (type !== 'page') {
        const next = Array.from(root.querySelectorAll('button[data-action]')).find(node => node.dataset.action === type && node.dataset.id === id && !node.disabled);
        if (next) next.focus();
        else { const status = document.getElementById('lpg-p-status'); status.tabIndex = -1; status.focus(); }
      }
    });
    document.body.classList.add('lpg-program-mode');
    render();
    return session;
  }

  function enhance(html, state) {
    if (!state || state.programEnabled !== true || !state.program) return html;
    const model = typeof window === 'object' ? window.LPGProgram : globalThis.LPGProgram;
    if (!model || typeof model.factory !== 'function') throw new Error('Loyalty program model is unavailable.');
    const program = model.normalize(state.program);
    delete program.assumptions; delete program.requirements; delete program.futureFeatures;
    const main = /<main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">[\s\S]*?<\/main>/;
    if (!main.test(html)) throw new Error('Generated portal main region was not found.');
    // The program supplies its own CSS and uses system fonts. Retain customer
    // image URLs, but remove only the classic generator's external UI assets.
    html = html.replace(/<script\b[^>]*\bsrc=["']https:\/\/cdn\.tailwindcss\.com(?:\/[^"']*)?["'][^>]*>[\s\S]*?<\/script\s*>/gi, '')
      .replace(/<link\b[^>]*\bhref=["']https:\/\/fonts\.(?:googleapis|gstatic)\.com(?:\/[^"']*)?["'][^>]*>/gi, '');
    const escape = value => String(value || '').replace(/[&<>\"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' })[character]);
    const brand = state.brand || {};
    const brandName = brand.name || program.providerName || program.name;
    const logo = brand.logoData || brand.logoUrl || '';
    const safeLogo = /^(https?:\/\/|data:image\/(?:png|jpeg|gif|webp);base64,)/i.test(logo) ? '<img src="' + escape(logo) + '" alt="' + escape(brandName) + '">' : '';
    const color = state.colors && /^#[a-f0-9]{6}$/i.test(state.colors.menu || state.colors.primary) ? (state.colors.menu || state.colors.primary) : '#172554';
    const rgb = [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    const ink = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 0.179 ? '#111827' : '#ffffff';
    const header = '<header class="site-header" style="background:' + color + ';color:' + ink + '"><div class="lpg-program-header-inner">' + safeLogo + '<span>' + escape(brandName) + '</span></div></header>';
    const footer = '<footer class="lpg-program-footer">' + escape(brandName) + ' · Interactive loyalty prototype</footer>';
    const shell = '<main id="lpg-program-root" class="lpg-program"><noscript>Enable JavaScript to use this interactive loyalty prototype.</noscript></main>';
    const script = '<style>' + styles + '</style><script>\n(function(){const model=(' + model.factory.toString() + ')();const runtime=(' + createProgramRuntime.toString() + ')();runtime.mount(' + serialize(program) + ',model,document);})();\n<\/script>';
    return html.replace(main, () => shell).replace(/<title>[\s\S]*?<\/title>/, () => '<title>' + escape(program.name) + ' — Loyalty Portal</title>').replace(/<header\b[\s\S]*?<\/header>/, () => header).replace(/<footer\b[\s\S]*?<\/footer>/, () => footer).replace('</body>', () => script + '\n</body>');
  }

  return { enhance, mount, createSession, factory: createProgramRuntime };
});
