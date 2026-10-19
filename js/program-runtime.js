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
      if (!can(permission)) throw new Error('This account does not permit that action.');
    }
    return {
      program, events, requests,
      role, can,
      switchRole(id) {
        if (!program.roles.some(item => item.id === id)) throw new Error('Unknown account role.');
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
        if (request.requestedBy === roleId) throw new Error('Another authorized team member must review this request.');
        if (approved) events.push(model.redeem(program, events, request.rewardId, date));
        request.status = approved ? 'approved' : 'declined';
        request.reviewedBy = roleId;
        return request;
      }
    };
  }


  // Project validated rules into the original, richly populated portal content.
  // Never mutate the saved authoring state or discard imagery and descriptive copy.
  function projectState(state, model) {
    if (!state || !state.programEnabled || !state.program) return state;
    const p = model.normalize(state.program), summary = model.summarize(p);
    const result = { ...state, brand: { ...state.brand, programName: p.name },
      member: { ...state.member, name: p.member.name, points: summary.redeemable },
      tiers: p.tiers.map(t => ({ name: t.name, points: t.threshold })),
      _program: p, _summary: summary };
    result.vouchers = p.rewards.map(reward => {
      const rich = (state.vouchers || []).find(v => v.programRewardId === reward.id) || {};
      return { ...rich, title: reward.name, programRewardId: reward.id, actionType: 'points', actionValue: reward.cost.toLocaleString('en-US') + ' ' + p.currencies.redeemableName };
    });
    result.earnMore = p.earnRules.map(rule => {
      const rich = (state.earnMore || []).find(e => e.programRuleId === rule.id) || {};
      return { ...rich, title: rule.name, programRuleId: rule.id, hasCodeInput: false, rule };
    });
    return result;
  }

  const styles = `
    .lpg-activity-panel button,.lpg-earn-action button{border:1px solid #cbd5e1;border-radius:9px;padding:8px 13px;background:white;color:#172033;font:inherit;cursor:pointer}
    .lpg-activity-panel button:focus-visible,[data-lpg-action]:focus-visible{outline:3px solid #2563eb;outline-offset:3px}
    [data-lpg-action]:disabled{opacity:.5;cursor:not-allowed}
    .lpg-activity-panel{margin-top:24px;padding:24px}.lpg-activity-panel h2{font-size:1.2rem;font-weight:750;margin-bottom:12px}
    .lpg-activity-panel ul{list-style:none;padding:0}.lpg-activity-panel li{padding:14px 0;border-bottom:1px solid #e2e8f0;display:flex;gap:12px;flex-wrap:wrap;align-items:center}
    .lpg-activity-panel li strong{flex:1;min-width:160px}.lpg-activity-panel li span{font-size:.85rem;color:#475569}
    .lpg-earn-action{margin-top:12px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}.lpg-earn-action input{width:100px;border:1px solid #cbd5e1;border-radius:8px;padding:7px}
    #lpg-p-status{position:fixed;bottom:24px;left:24px;right:24px;max-width:620px;margin:auto;padding:14px 20px;border-radius:12px;background:white;box-shadow:0 8px 32px #17203330;z-index:1100;font-size:.9rem;color:#166534}#lpg-p-status:empty{display:none}#lpg-p-status[data-error="true"]{color:#b91c1c}
    [data-lpg-current-tier="true"]{outline:2px solid var(--brand-primary,#2563eb);outline-offset:8px;border-radius:10px}
    .lpg-account-menu{position:absolute;right:0;top:calc(100% + 12px);min-width:220px;padding:18px;background:white;color:#172033;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 10px 30px #17203326;z-index:100}.lpg-account-menu[hidden]{display:none}.lpg-account-menu p{font-size:.85rem;margin:0 0 8px}.lpg-account-menu button{margin-top:8px;width:100%;text-align:left;border-top:1px solid #e2e8f0;padding-top:12px;font:inherit}
    .lpg-welcome{position:fixed;inset:0;z-index:1000;background:#0f172acc;display:grid;place-items:center;padding:24px}.lpg-welcome[hidden]{display:none}.lpg-welcome article{background:white;color:#172033;padding:40px;border-radius:24px;max-width:480px;text-align:center;box-shadow:0 25px 100px #0004}.lpg-welcome h2{font-size:2rem;font-weight:800;margin-bottom:12px}.lpg-welcome button{margin-top:24px;padding:12px 22px}
  `;

  function mount(program, model, document) {
    const root = document.querySelector('main');
    if (!root) return;
    const session = createSession(program, model), p = session.program;
    const number = value => Number(value).toLocaleString('en-US', { maximumFractionDigits: 6 });
    function el(tag, text, className) {
      const node = document.createElement(tag);
      if (text != null) node.textContent = String(text);
      if (className) node.className = className;
      return node;
    }
    function button(label, action, id) {
      const node = el('button', label); node.type = 'button'; node.dataset.lpgAction = action;
      if (id) node.dataset.id = id;
      return node;
    }
    // Customer interactions live in the existing account menu. Presentation
    // controls belong to the builder and are never rendered into this portal.
    const accountIcon = document.querySelector('.site-header [title="Account"]');
    let accountButton, accountMenu;
    if (accountIcon) {
      accountButton = button('', 'account'); accountButton.className = accountIcon.className;
      accountButton.style.cssText = accountIcon.style.cssText;
      accountButton.setAttribute('aria-label', 'My account'); accountButton.setAttribute('aria-expanded', 'false');
      accountButton.setAttribute('aria-controls', 'lpg-account-menu');
      while (accountIcon.firstChild) accountButton.append(accountIcon.firstChild);
      accountIcon.replaceWith(accountButton);
      accountMenu = el('div', null, 'lpg-account-menu'); accountMenu.id = 'lpg-account-menu'; accountMenu.hidden = true;
      accountMenu.append(el('p', p.member.name));
      if (p.mode === 'b2b') accountMenu.append(el('p', p.member.organization));
      const accountRole = el('p', session.role().name); accountRole.dataset.lpgAccountRole = '';
      accountMenu.append(accountRole, button('Sign out', 'signout'));
      accountButton.parentElement.style.position = 'relative'; accountButton.parentElement.append(accountMenu);
    }
    const live = el('div'); live.id = 'lpg-p-status'; live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite'); document.body.append(live);
    const activity = el('section', null, 'card lpg-activity-panel'); activity.dataset.lpgSection = 'activity';
    activity.append(el('h2', 'Recent activity')); const events = el('ul'); activity.append(events); root.append(activity);
    let requests;
    if (p.mode === 'b2b' && p.approvalRequired) {
      const approvals = el('section', null, 'card lpg-activity-panel'); approvals.dataset.lpgSection = 'team';
      approvals.append(el('h2', 'Team reward requests'), el('p', 'Requests are reviewed by another authorized member of your organization.'));
      requests = el('ul'); approvals.append(requests); root.append(approvals);
    }
    const welcome = el('div', null, 'lpg-welcome'); welcome.hidden = true; welcome.setAttribute('role', 'dialog'); welcome.setAttribute('aria-modal', 'true'); welcome.setAttribute('aria-label', 'Welcome to ' + p.name);
    const welcomeCard = el('article'); welcomeCard.append(el('h2', p.name), el('p', 'Your rewards. Your benefits. All in one place.'));
    const signin = button('Sign in', 'signin'); signin.className = 'btn-primary'; welcomeCard.append(signin); welcome.append(welcomeCard); document.body.append(welcome);
    function refresh() {
      document.querySelectorAll('[data-lpg-account-role]').forEach(node => { node.textContent = session.role().name; });
      const summary = session.summary();
      document.querySelectorAll('[data-lpg-balance]').forEach(node => { node.textContent = number(summary[node.dataset.lpgBalance]); });
      document.querySelectorAll('[data-lpg-tier]').forEach(node => { node.textContent = summary.tier.name; });
      document.querySelectorAll('[data-lpg-tier-index]').forEach(node => { node.dataset.lpgCurrentTier = String(p.tiers[Number(node.dataset.lpgTierIndex)].name === summary.tier.name); });
      document.querySelectorAll('[data-lpg-progress-text]').forEach(node => { node.textContent = summary.nextTier ? number(summary.gap) + ' ' + p.currencies.qualifyingName + ' to ' + summary.nextTier.name : 'Highest tier achieved'; });
      const progress = summary.nextTier ? Math.max(0, Math.min(100, (summary.qualifying-summary.tier.threshold)/(summary.nextTier.threshold-summary.tier.threshold)*100)) : 100;
      document.querySelectorAll('[data-lpg-progress]').forEach(node => { node.style.width = progress + '%'; });
      document.querySelectorAll('[data-lpg-action="earn"]').forEach(node => { node.disabled = !session.can('earn'); });
      document.querySelectorAll('[data-lpg-action="request"]').forEach(node => {
        const reward = p.rewards.find(item => item.id === node.dataset.id);
        const pending = session.requests.some(item => item.rewardId === node.dataset.id && item.requestedBy === session.role().id && item.status === 'pending');
        node.disabled = !reward || !session.can('redeem') || reward.cost > summary.redeemable || pending;
        node.textContent = pending ? 'Awaiting approval' : p.mode === 'b2b' && p.approvalRequired ? 'Request reward' : 'Redeem reward';
      });
      events.replaceChildren();
      const opening = el('li'); opening.append(el('strong', 'Opening balance'), el('span', number(p.opening.redeemable) + ' ' + p.currencies.redeemableName)); events.append(opening);
      session.events.slice().reverse().forEach(event => { const row = el('li'); row.append(el('strong', event.label), el('span', (event.redeemable >= 0 ? '+' : '') + number(event.redeemable) + ' ' + p.currencies.redeemableName), el('span', event.date.slice(0, 10))); events.append(row); });
      if (requests) {
        requests.replaceChildren();
        if (!session.requests.length) requests.append(el('li', 'No reward requests yet.'));
        session.requests.forEach(request => {
          const row = el('li'); row.append(el('strong', request.label), el('span', request.status + ' · ' + number(request.cost) + ' ' + p.currencies.redeemableName));
          if (request.status === 'pending') ['approve', 'decline'].forEach(action => { const control = button(action === 'approve' ? 'Approve' : 'Decline', action, request.id); control.disabled = !session.can('approve') || request.requestedBy === session.role().id; row.append(control); });
          requests.append(row);
        });
      }
    }
    function report(action) {
      try { action(); live.dataset.error = 'false'; }
      catch (error) { live.textContent = error.message; live.dataset.error = 'true'; }
      refresh();
    }
    function showWelcome() {
      if (accountMenu) { accountMenu.hidden = true; accountButton.setAttribute('aria-expanded', 'false'); }
      live.textContent = ''; welcome.hidden = false; root.inert = true; signin.focus();
    }
    const view = document.defaultView;
    if (view) view.addEventListener('message', event => {
      if (view.parent === view || event.source !== view.parent || event.data?.type !== 'lpg-preview-control') return;
      report(() => {
        if (event.data.action === 'role') { session.switchRole(event.data.roleId); live.textContent = ''; }
        if (event.data.action === 'reset') { session.reset(); live.textContent = ''; }
        if (event.data.action === 'welcome') showWelcome();
      });
    });
    document.addEventListener('click', event => {
      if (accountMenu && !accountMenu.hidden && !accountMenu.contains(event.target) && !accountButton.contains(event.target)) { accountMenu.hidden = true; accountButton.setAttribute('aria-expanded', 'false'); }
      const control = event.target.closest('[data-lpg-action]'); if (!control || control.disabled) return;
      report(() => {
        const action = control.dataset.lpgAction, id = control.dataset.id;
        if (action === 'earn') { const amount = document.getElementById('lpg-amount-' + id); session.earn(id, amount ? Number(amount.value) : undefined); live.textContent = 'Activity added. Your points and status are up to date.'; }
        if (action === 'request') { const result = session.request(id); live.textContent = result.status === 'pending' ? 'Reward requested. Awaiting approval.' : 'Reward redeemed. Enjoy your benefit!'; }
        if (action === 'approve' || action === 'decline') { session.decide(id, action === 'approve'); live.textContent = action === 'approve' ? 'Request approved.' : 'Request declined.'; }
        if (action === 'account' && accountMenu) { accountMenu.hidden = !accountMenu.hidden; accountButton.setAttribute('aria-expanded', String(!accountMenu.hidden)); }
        if (action === 'signout') showWelcome();
        if (action === 'signin') { welcome.hidden = true; root.inert = false; if (accountButton) accountButton.focus(); }
      });
    });
    document.addEventListener('keydown', event => {
      if (welcome.hidden) {
        if (event.key === 'Escape' && accountMenu && !accountMenu.hidden) { accountMenu.hidden = true; accountButton.setAttribute('aria-expanded', 'false'); accountButton.focus(); }
        return;
      }
      if (event.key === 'Tab') { event.preventDefault(); signin.focus(); }
    });
    refresh();
    return session;
  }

  function enhance(html, state) {
    if (!state || state.programEnabled !== true || !state.program) return html;
    const model = typeof window === 'object' ? window.LPGProgram : globalThis.LPGProgram;
    if (!model || typeof model.factory !== 'function') throw new Error('Loyalty program model is unavailable.');
    const program = model.normalize(state.program);
    delete program.assumptions; delete program.requirements; delete program.futureFeatures;
    const script = '<style>' + styles + '</style><script>\n(function(){const model=(' + model.factory.toString() + ')();const createSession=(' + createSession.toString() + ');const mount=(' + mount.toString() + ');mount(' + serialize(program) + ',model,document);})();\n<\/script>';
    return html.replace('</body>', () => script + '\n</body>');
  }

  return { enhance, projectState, mount, createSession, factory: createProgramRuntime };
});
