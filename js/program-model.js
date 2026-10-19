// Shared, data-only loyalty rules for the editor and exported prototype.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LPGProgram = api;
})(typeof window !== 'undefined' ? window : null, function createProgramModel() {
  'use strict';
  const MAX = 1e12;
  const own = (o, key) => Object.prototype.hasOwnProperty.call(o, key);
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const round = value => Math.round((value + Number.EPSILON) * 1000000) / 1000000;
  function validate(input, options = {}) {
    const errors = [], assumed = [];
    const error = (path, message) => errors.push(`${path}: ${message}`);
    if (!object(input)) return { valid: false, errors: ['program: expected an object'], model: null };
    function text(value, fallback, path, limit = 500) {
      if (value === undefined) return fallback;
      if (typeof value !== 'string' || value.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) {
        error(path, `expected text of at most ${limit} characters`); return fallback;
      }
      return value.trim();
    }
    function number(value, fallback, path, max = MAX, min = 0) {
      if (value === undefined) return fallback;
      if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
        error(path, `expected a number between ${min} and ${max}`); return fallback;
      }
      return value;
    }
    function boolean(value, fallback, path) {
      if (value === undefined) return fallback;
      if (typeof value !== 'boolean') { error(path, 'expected true or false'); return fallback; }
      return value;
    }
    function record(value, path) {
      if (value === undefined) return {};
      if (!object(value)) { error(path, 'expected an object'); return {}; }
      return value;
    }
    function list(value, fallback, path, max, mapper) {
      if (value === undefined) return fallback;
      if (!Array.isArray(value) || value.length > max) { error(path, `expected a list with at most ${max} items`); return []; }
      return value.map((entry, index) => mapper(entry, `${path}[${index}]`, index));
    }
    function id(value, fallback, path) {
      const result = text(value, fallback, path, 80);
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(result)) error(path, 'use letters, numbers, underscores or hyphens');
      return result;
    }
    function unique(items, path) {
      const seen = new Set();
      items.forEach(item => { if (seen.has(item.id)) error(path, `duplicate id ${item.id}`); seen.add(item.id); });
    }
    const mode = input.mode === undefined ? (options.mode || 'b2c') : input.mode;
    if (!['b2c', 'b2b'].includes(mode)) error('mode', 'expected b2c or b2b');
    if (input.version !== undefined && ![1, 2].includes(input.version)) error('version', 'unsupported program version');
    const b2b = mode === 'b2b';
    const requestedCapabilities = record(input.capabilities, 'capabilities');
    const capabilities = {
      presentationOnly: boolean(requestedCapabilities.presentationOnly, false, 'capabilities.presentationOnly'),
      tiers: boolean(requestedCapabilities.tiers, true, 'capabilities.tiers')
    };
    const qualification = record(input.qualification, 'qualification');
    const basis = text(qualification.basis, 'points', 'qualification.basis', 80);
    const period = text(qualification.period, 'lifetime', 'qualification.period', 80);
    if (!['points', 'spend', 'nights', 'segments', 'activities', 'other'].includes(basis)) error('qualification.basis', 'unknown qualification basis');
    if (!['lifetime', 'calendar-year', 'rolling-year', 'custom'].includes(period)) error('qualification.period', 'unknown qualification period');
    // Non-point and periodic qualification is descriptive until a dedicated rules engine exists.
    if (basis !== 'points' || period !== 'lifetime') capabilities.presentationOnly = true;
    let locale = text(input.locale, 'en-US', 'locale', 80);
    try { locale = Intl.getCanonicalLocales(locale)[0]; if (!locale) throw new Error(); new Intl.NumberFormat(locale); }
    catch (_) { error('locale', 'expected a valid locale such as en-US or fr-FR'); locale = 'en-US'; }
    const descriptive = capabilities.presentationOnly;

    const member = record(input.member, 'member'), currencies = record(input.currencies, 'currencies'), opening = record(input.opening, 'opening');
    const model = {
      version: input.version || (input.capabilities || input.qualification || input.locale || input.metrics ? 2 : 1), mode,
      locale, capabilities,
      qualification: { basis, period, description: text(qualification.description, '', 'qualification.description', 2000) },
      metrics: list(input.metrics, [], 'metrics', 20, (entry, path, index) => {
        const metric = record(entry, path);
        return { id: id(metric.id, `metric-${index + 1}`, `${path}.id`), name: text(metric.name, '', `${path}.name`, 160), value: number(metric.value, 0, `${path}.value`), unit: text(metric.unit, '', `${path}.unit`, 80), singularUnit: text(metric.singularUnit, '', `${path}.singularUnit`, 80), period: text(metric.period, '', `${path}.period`, 160) };
      }),
      name: text(input.name, 'Loyalty Program', 'name', 160),
      providerName: text(input.providerName, '', 'providerName', 160),
      member: { name: text(member.name, 'Avery Morgan', 'member.name', 160), organization: text(member.organization, b2b ? 'Northstar Services' : '', 'member.organization', 160), role: text(member.role, b2b ? 'purchaser' : 'member', 'member.role', 80), status: text(member.status, '', 'member.status', 160) },
      currencies: { qualifyingName: text(currencies.qualifyingName, 'Tier Points', 'currencies.qualifyingName', 80), redeemableName: text(currencies.redeemableName, 'Reward Points', 'currencies.redeemableName', 80), pointsPerUnit: number(currencies.pointsPerUnit, 100, 'currencies.pointsPerUnit', MAX, 0.000001) },
      tiers: list(input.tiers, descriptive || !capabilities.tiers ? [] : [{ name: 'Member', threshold: 0, multiplier: 1 }, { name: 'Plus', threshold: 1000, multiplier: 1.25 }, { name: 'Premier', threshold: 2500, multiplier: 1.5 }], 'tiers', 12, (entry, path) => {
        const tier = record(entry, path);
        return { name: text(tier.name, '', `${path}.name`, 80), threshold: tier.threshold == null && descriptive ? null : number(tier.threshold, undefined, `${path}.threshold`), multiplier: number(tier.multiplier, 1, `${path}.multiplier`, 1000) };
      }),
      opening: { qualifying: number(opening.qualifying, 0, 'opening.qualifying'), redeemable: number(opening.redeemable, 0, 'opening.redeemable') },
      earnRules: list(input.earnRules, descriptive ? [] : [{ id: 'purchase', name: b2b ? 'Eligible business order' : 'Eligible purchase', kind: 'spend', qualifyingRate: 1, redeemableRate: 1, qualifyingPoints: 0, redeemablePoints: 0, amount: 100, monthlyCap: null }], 'earnRules', 40, (entry, path, index) => {
        const rule = record(entry, path), kind = rule.kind;
        if (!['spend', 'fixed'].includes(kind)) error(`${path}.kind`, 'expected spend or fixed');
        const normalized = { id: id(rule.id, `earn-${index + 1}`, `${path}.id`), name: text(rule.name, `Activity ${index + 1}`, `${path}.name`, 160), kind,
          qualifyingRate: number(rule.qualifyingRate, 0, `${path}.qualifyingRate`, 1e6), redeemableRate: number(rule.redeemableRate, 0, `${path}.redeemableRate`, 1e6),
          qualifyingPoints: number(rule.qualifyingPoints, 0, `${path}.qualifyingPoints`), redeemablePoints: number(rule.redeemablePoints, 0, `${path}.redeemablePoints`),
          amount: number(rule.amount, kind === 'spend' ? 100 : 1, `${path}.amount`, 1e9, 0.000001), monthlyCap: rule.monthlyCap == null ? null : number(rule.monthlyCap, null, `${path}.monthlyCap`) };
        if (kind === 'spend' && normalized.qualifyingRate === 0 && normalized.redeemableRate === 0) error(path, 'a spend rule must earn points');
        if (kind === 'fixed' && normalized.qualifyingPoints === 0 && normalized.redeemablePoints === 0) error(path, 'a fixed rule must earn points');
        if (kind === 'spend' && (normalized.qualifyingPoints || normalized.redeemablePoints)) error(path, 'fixed points cannot be combined with spend rates');
        if (kind === 'fixed' && normalized.amount !== 1) error(`${path}.amount`, 'fixed activities must use an amount of one');
        if (kind === 'fixed' && (normalized.qualifyingRate || normalized.redeemableRate)) error(path, 'spend rates cannot be combined with fixed points');
        if (normalized.monthlyCap !== null && (kind === 'fixed' ? normalized.qualifyingPoints : normalized.qualifyingRate) === 0) error(path, 'monthlyCap limits qualifying points and requires qualifying earning');
        return normalized;
      }),
      rewards: list(input.rewards, descriptive ? [] : [{ id: 'credit', name: 'Reward credit', cost: 100 }], 'rewards', 40, (entry, path, index) => {
        const reward = record(entry, path);
        return { id: id(reward.id, `reward-${index + 1}`, `${path}.id`), name: text(reward.name, `Reward ${index + 1}`, `${path}.name`, 160), cost: reward.cost == null && descriptive ? null : number(reward.cost, undefined, `${path}.cost`, MAX, 0.000001) };
      }),
      roles: list(input.roles, b2b ? [{ id: 'administrator', name: 'Account administrator', canRequest: true, canApprove: true }, { id: 'purchaser', name: 'Purchaser', canRequest: true, canApprove: false }, { id: 'approver', name: 'Rewards approver', canRequest: false, canApprove: true }] : [{ id: 'member', name: 'Member', canRequest: true, canApprove: false }], 'roles', 12, (entry, path, index) => {
        const role = record(entry, path);
        return { id: id(role.id, `role-${index + 1}`, `${path}.id`), name: text(role.name, `Role ${index + 1}`, `${path}.name`, 80), canRequest: boolean(role.canRequest, false, `${path}.canRequest`), canApprove: boolean(role.canApprove, false, `${path}.canApprove`) };
      }),
      approvalRequired: boolean(input.approvalRequired, false, 'approvalRequired'),
      freeContentMonthlyCap: input.freeContentMonthlyCap == null ? null : number(input.freeContentMonthlyCap, null, 'freeContentMonthlyCap'),
      assumptions: list(input.assumptions, [], 'assumptions', 80, (entry, path) => text(entry, '', path, 2000)),
      requirements: list(input.requirements, [], 'requirements', 100, (entry, path, index) => {
        const req = record(entry, path), status = req.status === undefined ? 'question' : req.status;
        if (!['interactive', 'displayed', 'future', 'question', 'unsupported'].includes(status)) error(`${path}.status`, 'unknown requirement status');
        return { id: id(req.id, `requirement-${index + 1}`, `${path}.id`), text: text(req.text, '', `${path}.text`, 3000), source: text(req.source, '', `${path}.source`, 500), status, module: text(req.module, '', `${path}.module`, 80) };
      }),
      futureFeatures: list(input.futureFeatures, [], 'futureFeatures', 80, (entry, path) => text(entry, '', path, 2000))
    };
    for (const key of ['name']) if (!model[key]) error(key, 'required');
    if (!model.member.name) error('member.name', 'required');
    if (b2b && !model.member.organization) error('member.organization', 'a participating business name is required for B2B');
    for (const key of ['qualifyingName', 'redeemableName']) if (!model.currencies[key]) error(`currencies.${key}`, 'required');
    for (const key of ['roles', 'rewards', 'earnRules']) model[key].forEach((item, index) => { if (!item.name) error(`${key}[${index}].name`, 'required'); });
    if (capabilities.tiers && !descriptive && !model.tiers.length) error('tiers', 'at least one tier is required');
    model.tiers.forEach((tier, index) => {
      if (!tier.name) error(`tiers[${index}].name`, 'required');
      if (descriptive) return;
      if (tier.threshold === undefined) error(`tiers[${index}].threshold`, 'required');
      if (index === 0 && tier.threshold !== 0) error('tiers[0].threshold', 'the first tier must start at zero');
      if (index > 0 && tier.threshold <= model.tiers[index - 1].threshold) error(`tiers[${index}].threshold`, 'tiers must have strictly increasing thresholds');
    });
    model.rewards.forEach((reward, index) => { if (!descriptive && reward.cost === undefined) error(`rewards[${index}].cost`, 'required'); });
    if (!model.roles.length) error('roles', 'at least one role is required');
    if (member.role === undefined && model.roles.length) model.member.role = (model.roles.find(role => role.canRequest) || model.roles[0]).id;
    if (!model.roles.some(role => role.id === model.member.role)) error('member.role', 'must match a role id');
    if (model.approvalRequired && !b2b) error('approvalRequired', 'approval workflow is supported for B2B programs');
    if (model.approvalRequired && !model.roles.some(role => role.canApprove)) error('roles', 'approval requires an approver role');
    ['earnRules', 'rewards', 'roles', 'requirements', 'metrics'].forEach(key => unique(model[key], key));
    if (!descriptive && capabilities.tiers && input.tiers === undefined) assumed.push('Tier names, thresholds and multipliers are illustrative defaults.');
    if (!descriptive && input.earnRules === undefined) assumed.push('Purchase earning rules are illustrative defaults.');
    if (!descriptive && input.rewards === undefined) assumed.push('Reward credit and its cost are illustrative defaults.');
    if (!descriptive && !own(currencies, 'pointsPerUnit')) assumed.push('The illustrative conversion is 100 redeemable points per currency unit.');
    if (member.name === undefined) assumed.push('Avery Morgan is a fictional participant name.');
    if (opening.qualifying === undefined) assumed.push('The opening qualifying balance defaults to a synthetic zero.');
    if (opening.redeemable === undefined) assumed.push('The opening redeemable balance defaults to a synthetic zero.');
    if (input.roles === undefined) assumed.push('Participant roles are demo defaults; review their permissions.');
    if (b2b && member.organization === undefined) assumed.push('Northstar Services is a fictional participating organization.');
    if (input.approvalRequired === undefined && b2b) assumed.push('Direct redemption is the default; approval must be explicitly enabled.');
    if (!descriptive) assumed.push('Spend earning uses the tier before each transaction and rounds redeemable points to the nearest whole point; fixed awards use their stated points without a tier multiplier.');
    if (model.freeContentMonthlyCap !== null) assumed.push('The shared monthly cap applies to qualifying points from all fixed activities, using UTC calendar months.');
    assumed.forEach(value => { if (!model.assumptions.includes(value)) model.assumptions.push(value); });
    if (model.assumptions.length > 80) error('assumptions', 'including demo calculation assumptions, at most 80 items are supported');
    return { valid: errors.length === 0, errors, model: errors.length ? null : model };
  }
  function normalize(input, options) {
    const result = validate(input, options);
    if (!result.valid) { const error = new TypeError(result.errors.join('; ')); error.errors = result.errors; throw error; }
    return result.model;
  }
  function dateString(value) {
    if (value === undefined) return new Date().toISOString();
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/.test(value)) throw new TypeError('Use an ISO date or UTC timestamp');
    const date = new Date(value);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value.slice(0, 10)) throw new TypeError('Invalid event date');
    return date.toISOString();
  }
  function checkedEvents(events) {
    if (!Array.isArray(events) || events.length > 10000) throw new TypeError('Expected at most 10000 events');
    const ids = new Set();
    return events.map(event => {
      if (!object(event) || typeof event.id !== 'string' || !event.id || ids.has(event.id)) throw new TypeError('Events require unique ids');
      ids.add(event.id);
      if (!['earn', 'redeem'].includes(event.type)) throw new TypeError('Unknown event type');
      for (const key of ['qualifying', 'redeemable']) {
        if (typeof event[key] !== 'number' || !Number.isFinite(event[key]) || Math.abs(event[key]) > MAX) throw new TypeError('Invalid event points');
      }
      if (event.type === 'earn' && (event.qualifying < 0 || event.redeemable < 0)) throw new TypeError('Earning cannot subtract points');
      if (event.type === 'redeem' && (event.qualifying !== 0 || event.redeemable >= 0)) throw new TypeError('Redemption must subtract only redeemable points');
      if (typeof event.date !== 'string') throw new TypeError('Events require an ISO date');
      dateString(event.date);
      return event;
    });
  }
  function summarize(program, events = []) {
    const model = normalize(program), ledger = checkedEvents(events);
    let qualifying = model.opening.qualifying, redeemable = model.opening.redeemable;
    for (const event of ledger) {
      qualifying = round(qualifying + event.qualifying); redeemable = round(redeemable + event.redeemable);
      if (redeemable < 0 || qualifying > MAX || redeemable > MAX) throw new RangeError('Ledger balance is out of range');
    }
    const ladder = !model.capabilities.presentationOnly && model.capabilities.tiers ? model.tiers : [];
    const tierIndex = ladder.reduce((best, tier, index) => qualifying >= tier.threshold ? index : best, 0);
    const tier = ladder[tierIndex] || { name: model.member.status || '', threshold: 0, multiplier: 1 }, nextTier = ladder[tierIndex + 1] || null;
    return { qualifying, redeemable, tier, nextTier, gap: nextTier ? round(nextTier.threshold - qualifying) : 0, monetaryValue: model.capabilities.presentationOnly ? null : Math.round(redeemable / model.currencies.pointsPerUnit * 100) / 100 };
  }
  function earn(program, events = [], ruleId, amount, date) {
    const model = normalize(program), summary = summarize(model, events), rule = model.earnRules.find(item => item.id === ruleId);
    if (!rule) throw new RangeError('Unknown earning activity');
    if (model.capabilities.presentationOnly) throw new Error('This program is presentation-only; earning is unavailable.');
    const at = dateString(date), quantity = amount === undefined ? rule.amount : amount;
    if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0 || quantity > 1e9) throw new RangeError('Enter a positive amount no greater than one billion');
    if (rule.kind === 'fixed' && amount !== undefined && amount !== 1) throw new RangeError('Fixed activities award points once per action');
    let qualifying = rule.kind === 'spend' ? round(quantity * rule.qualifyingRate) : rule.qualifyingPoints;
    // Spend uses the tier before the transaction; fixed awards are already final amounts.
    let redeemable = rule.kind === 'spend' ? Math.round(quantity * rule.redeemableRate * summary.tier.multiplier) : rule.redeemablePoints;
    if (!Number.isFinite(qualifying) || !Number.isFinite(redeemable) || qualifying > MAX || redeemable > MAX) throw new RangeError('Activity exceeds the point limit');
    const month = at.slice(0, 7), monthly = events.filter(event => event.type === 'earn' && dateString(event.date).slice(0, 7) === month);
    if (rule.monthlyCap !== null) qualifying = Math.min(qualifying, Math.max(0, round(rule.monthlyCap - monthly.filter(event => event.ruleId === rule.id).reduce((sum, event) => sum + event.qualifying, 0))));
    if (rule.kind === 'fixed' && model.freeContentMonthlyCap !== null) {
      const fixedIds = new Set(model.earnRules.filter(item => item.kind === 'fixed').map(item => item.id));
      qualifying = Math.min(qualifying, Math.max(0, round(model.freeContentMonthlyCap - monthly.filter(event => fixedIds.has(event.ruleId)).reduce((sum, event) => sum + event.qualifying, 0))));
    }
    if (!qualifying && !redeemable) throw new RangeError('The monthly earning limit has been reached');
    const event = Object.freeze({ id: `earn-${events.length + 1}-${at}`, type: 'earn', ruleId: rule.id, label: rule.name, qualifying, redeemable, date: at });
    summarize(model, events.concat(event));
    return event;
  }
  function redeem(program, events = [], rewardId, date) {
    const model = normalize(program), summary = summarize(model, events), reward = model.rewards.find(item => item.id === rewardId);
    if (model.capabilities.presentationOnly) throw new Error('This program is presentation-only; redemption is unavailable.');
    if (!reward) throw new RangeError('Unknown reward');
    if (summary.redeemable < reward.cost) throw new RangeError('Not enough redeemable points');
    const at = dateString(date);
    const event = Object.freeze({ id: `redeem-${events.length + 1}-${at}`, type: 'redeem', ruleId: '', rewardId: reward.id, label: reward.name, qualifying: 0, redeemable: -reward.cost, date: at });
    summarize(model, events.concat(event));
    return event;
  }
  function formatNumber(value, locale = 'en-US', options = {}) {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 6, ...options }).format(value);
  }
  function formatUnits(value, pluralUnit, singularUnit, locale = 'en-US') {
    const unit = singularUnit && new Intl.PluralRules(locale).select(value) === 'one' ? singularUnit : pluralUnit;
    return formatNumber(value, locale) + (unit ? ' ' + unit : '');
  }
  function getCapabilities(program) { return normalize(program).capabilities; }
  return { version: 2, formatNumber, formatUnits, getCapabilities, validate, normalize, summarize, earn, redeem, factory: createProgramModel };
});
