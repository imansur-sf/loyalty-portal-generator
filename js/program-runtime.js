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
    .lpg-demo-toolbar{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:0 0 24px;font-size:.85rem}
    .lpg-demo-toolbar label{display:flex;align-items:center;gap:8px}
    .lpg-demo-toolbar select,.lpg-demo-toolbar button,.lpg-demo-panel button,.lpg-earn-action button{border:1px solid #cbd5e1;border-radius:9px;padding:8px 13px;background:white;color:#172033;font:inherit;cursor:pointer}
    .lpg-demo-toolbar button:focus-visible,.lpg-demo-toolbar select:focus-visible,.lpg-demo-panel button:focus-visible,[data-lpg-action]:focus-visible{outline:3px solid #2563eb;outline-offset:3px}
    [data-lpg-action]:disabled{opacity:.5;cursor:not-allowed}
    .lpg-demo-panel{margin-top:24px;padding:24px}.lpg-demo-panel h2{font-size:1.2rem;font-weight:750;margin-bottom:12px}
    .lpg-demo-panel ul{list-style:none;padding:0}.lpg-demo-panel li{padding:14px 0;border-bottom:1px solid #e2e8f0;display:flex;gap:12px;flex-wrap:wrap;align-items:center}
    .lpg-demo-panel li strong{flex:1;min-width:160px}.lpg-demo-panel li span{font-size:.85rem;color:#475569}
    .lpg-earn-action{margin-top:12px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}.lpg-earn-action input{width:100px;border:1px solid #cbd5e1;border-radius:8px;padding:7px}
    #lpg-p-status{min-height:24px;font-size:.9rem;color:#166534}#lpg-p-status[data-error="true"]{color:#b91c1c}
    [data-lpg-current-tier="true"]{outline:2px solid var(--brand-primary,#2563eb);outline-offset:8px;border-radius:10px}
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
    const toolbar = el('div', null, 'lpg-demo-toolbar'); toolbar.dataset.lpgSection = 'account';
    toolbar.append(el('span', p.mode === 'b2b' ? p.member.organization : 'Welcome back, ' + p.member.name));
    if (p.roles.length > 1) {
      const label = el('label', 'View as');
      const select = el('select'); select.id = 'lpg-p-role';
      p.roles.forEach(role => { const option = el('option', role.name); option.value = role.id; option.selected = role.id === session.role().id; select.append(option); });
      label.append(select); toolbar.append(label);
    }
    toolbar.append(button('Reset demo', 'reset'), button('Show welcome screen', 'welcome'));
    root.prepend(toolbar);
    const live = el('div'); live.id = 'lpg-p-status'; live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite'); live.style.flexBasis = '100%'; toolbar.append(live);
    const activity = el('section', null, 'card lpg-demo-panel'); activity.dataset.lpgSection = 'activity';
    activity.append(el('h2', 'Recent activity')); const events = el('ul'); activity.append(events); root.append(activity);
    let requests;
    if (p.mode === 'b2b' && p.approvalRequired) {
      const approvals = el('section', null, 'card lpg-demo-panel'); approvals.dataset.lpgSection = 'team';
      approvals.append(el('h2', 'Team reward requests'), el('p', 'Requests are reviewed by another authorized member of your organization.'));
      requests = el('ul'); approvals.append(requests); root.append(approvals);
    }
    const welcome = el('div', null, 'lpg-welcome'); welcome.hidden = true; welcome.setAttribute('role', 'dialog'); welcome.setAttribute('aria-modal', 'true'); welcome.setAttribute('aria-label', 'Welcome to ' + p.name);
    const welcomeCard = el('article'); welcomeCard.append(el('h2', p.name), el('p', 'Your rewards. Your benefits. All in one place.'), el('p', 'Preview the signed-in experience with sample member data.'));
    const signin = button('Continue as ' + p.member.name, 'signin'); signin.className = 'btn-primary'; welcomeCard.append(signin); welcome.append(welcomeCard); document.body.append(welcome);
    function refresh() {
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
    document.addEventListener('change', event => { if (event.target.id === 'lpg-p-role') report(() => { session.switchRole(event.target.value); live.textContent = 'Viewing as ' + session.role().name; }); });
    document.addEventListener('click', event => {
      const control = event.target.closest('[data-lpg-action]'); if (!control || control.disabled) return;
      report(() => {
        const action = control.dataset.lpgAction, id = control.dataset.id;
        if (action === 'reset') { session.reset(); live.textContent = 'Demo reset to opening balances.'; }
        if (action === 'earn') { const amount = document.getElementById('lpg-amount-' + id); session.earn(id, amount ? Number(amount.value) : undefined); live.textContent = 'Activity added. Your points and status are up to date.'; }
        if (action === 'request') { const result = session.request(id); live.textContent = result.status === 'pending' ? 'Reward requested. Awaiting approval.' : 'Reward redeemed. Enjoy your benefit!'; }
        if (action === 'approve' || action === 'decline') { session.decide(id, action === 'approve'); live.textContent = action === 'approve' ? 'Request approved.' : 'Request declined.'; }
        if (action === 'welcome') { welcome.hidden = false; root.inert = true; signin.focus(); }
        if (action === 'signin') { welcome.hidden = true; root.inert = false; root.querySelector('[data-lpg-action="welcome"]').focus(); }
      });
    });
    document.addEventListener('keydown', event => {
      if (welcome.hidden) return;
      if (event.key === 'Tab') { event.preventDefault(); signin.focus(); }
      if (event.key === 'Escape') { welcome.hidden = true; root.inert = false; root.querySelector('[data-lpg-action="welcome"]').focus(); }
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
