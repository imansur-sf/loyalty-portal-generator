const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const program = require('../js/program-model');

function fixture(overrides = {}) {
  return program.normalize({
    name: 'Learning member program', mode: 'b2c',
    currencies: { qualifyingName: 'Tier Points', redeemableName: 'Redeemable Points', pointsPerUnit: 100 },
    opening: { qualifying: 1000, redeemable: 0 },
    tiers: [{ name: 'Core', threshold: 0, multiplier: 1 }, { name: 'Advantage', threshold: 750, multiplier: 1.5 }, { name: 'Premier', threshold: 2000, multiplier: 2 }],
    earnRules: [
      { id: 'manual', name: 'Study manual', kind: 'spend', qualifyingRate: 1, redeemableRate: 1, amount: 109 },
      { id: 'webinar', name: 'Webinar', kind: 'fixed', qualifyingPoints: 25 },
      { id: 'paper', name: 'White paper', kind: 'fixed', qualifyingPoints: 10 }
    ],
    freeContentMonthlyCap: 100, rewards: [{ id: 'credit', name: 'Credit', cost: 100 }], ...overrides
  });
}
const OCT = '2026-10-18';

test('dual currencies: 1000 + purchase + learning = 1144 TP and 164 RP', () => {
  const model = fixture(), ledger = [];
  for (const id of ['manual', 'webinar', 'paper']) ledger.push(program.earn(model, ledger, id, undefined, OCT));
  const summary = program.summarize(model, ledger);
  assert.equal(summary.qualifying, 1144); assert.equal(summary.redeemable, 164);
  assert.equal(summary.tier.name, 'Advantage'); assert.equal(summary.nextTier.name, 'Premier');
  assert.equal(summary.gap, 856); assert.equal(summary.monetaryValue, 1.64);
});
test('shared free-content calendar-month cap clips and then rejects earning', () => {
  const model = fixture(), ledger = [];
  for (let i = 0; i < 9; i++) ledger.push(program.earn(model, ledger, 'paper', undefined, OCT));
  const clipped = program.earn(model, ledger, 'webinar', undefined, OCT); ledger.push(clipped);
  assert.equal(clipped.qualifying, 10); assert.equal(clipped.redeemable, 0);
  assert.throws(() => program.earn(model, ledger, 'paper', undefined, OCT), /monthly earning limit/);
  const nextMonth = program.earn(model, ledger, 'webinar', undefined, '2026-11-01');
  assert.equal(nextMonth.qualifying, 25);
});
test('purchase qualifying points do not consume the free-content cap', () => {
  const model = fixture(), ledger = [program.earn(fixture(), [], 'manual', undefined, OCT)];
  assert.equal(program.earn(model, ledger, 'webinar', undefined, OCT).qualifying, 25);
});
test('individual earning caps and shared caps both apply', () => {
  const model = fixture(); model.earnRules[1].monthlyCap = 40;
  const ledger = [program.earn(model, [], 'webinar', undefined, OCT)];
  assert.equal(program.earn(model, ledger, 'webinar', undefined, OCT).qualifying, 15);
});
test('redemption reduces only redeemable points and cannot overdraft', () => {
  const model = fixture(), ledger = [program.earn(fixture(), [], 'manual', undefined, OCT)];
  const event = program.redeem(model, ledger, 'credit', OCT); ledger.push(event);
  assert.equal(event.qualifying, 0); assert.equal(event.redeemable, -100);
  assert.equal(program.summarize(model, ledger).qualifying, 1109);
  assert.equal(program.summarize(model, ledger).redeemable, 64);
  assert.throws(() => program.redeem(model, ledger, 'credit', OCT), /Not enough/);
});
test('a threshold-crossing transaction uses starting tier, then advances the tier', () => {
  const model = fixture({ opening: { qualifying: 740, redeemable: 0 } });
  const first = program.earn(model, [], 'manual', 20, OCT);
  assert.equal(first.qualifying, 20); assert.equal(first.redeemable, 20);
  assert.equal(program.summarize(model, [first]).tier.name, 'Advantage');
  assert.equal(program.earn(model, [first], 'manual', 20, OCT).redeemable, 30);
});
test('twelve authored tiers and exact boundary values are supported', () => {
  const tiers = Array.from({ length: 12 }, (_, i) => ({ name: `Tier ${i}`, threshold: i * 100, multiplier: 1 }));
  const model = fixture({ tiers, opening: { qualifying: 1100, redeemable: 0 } });
  const summary = program.summarize(model);
  assert.equal(summary.tier.name, 'Tier 11'); assert.equal(summary.nextTier, null); assert.equal(summary.gap, 0);
});
test('B2B defaults distinguish member organization and provider and state assumptions', () => {
  const model = program.normalize({ providerName: 'Supplier' }, { mode: 'b2b' });
  assert.equal(model.mode, 'b2b'); assert.equal(model.member.organization, 'Northstar Services');
  assert.equal(model.providerName, 'Supplier'); assert.equal(model.approvalRequired, false);
  assert.ok(model.roles.some(role => role.canApprove));
  assert.ok(model.assumptions.some(text => /fictional/.test(text)));
  assert.ok(model.assumptions.some(text => /approval must be explicitly enabled/.test(text)));
});
test('normalization is idempotent, detached from input, and strips unknown executable fields', () => {
  const input = fixture(); input.script = 'alert(1)'; input.member.secret = 'not included';
  const normalized = program.normalize(input);
  assert.equal(normalized.script, undefined); assert.equal(normalized.member.secret, undefined);
  normalized.member.name = 'Changed'; assert.notEqual(input.member.name, 'Changed');
  assert.deepEqual(program.normalize(normalized), normalized);
});
test('invalid numeric and enum values produce explicit validation errors', () => {
  for (const bad of [-1, Infinity, NaN, '100', null, 1e20]) {
    const result = program.validate({ opening: { qualifying: bad } });
    assert.equal(result.valid, false); assert.equal(result.model, null);
    assert.ok(result.errors.some(text => text.includes('opening.qualifying')));
  }
  assert.equal(program.validate({ mode: 'retail' }).valid, false);
  assert.equal(program.validate({ version: 9 }).valid, false);
});
test('invalid or incomplete rules are reported instead of silently discarded', () => {
  const cases = [
    { tiers: [{ name: 'First', threshold: 50 }] },
    { tiers: [{ name: 'First', threshold: 0 }, { name: 'Second', threshold: 0 }] },
    { tiers: [{ name: 'First' }] }, { rewards: [{ id: 'r', name: 'Reward' }] },
    { earnRules: [{ id: 'e', kind: 'spend' }] },
    { earnRules: [{ id: 'e', kind: 'fixed', qualifyingPoints: 1, redeemableRate: 5 }] },
    { earnRules: [{ id: 'e', kind: 'fixed', redeemablePoints: 1, monthlyCap: 10 }] },
    { roles: [] }, { approvalRequired: true }, { member: { role: 'nonexistent' } },
    { rewards: [{ id: 'same', cost: 1 }, { id: 'same', cost: 2 }] }
  ];
  for (const input of cases) assert.equal(program.validate(input).valid, false, JSON.stringify(input));
});
test('malformed activity values and unknown ids cannot create ledger events', () => {
  const model = fixture();
  for (const amount of [-1, 0, Infinity, NaN, '10', 1e10]) assert.throws(() => program.earn(model, [], 'manual', amount, OCT));
  assert.throws(() => program.earn(model, [], 'paper', 20, OCT), /once per action/);
  assert.throws(() => program.earn(model, [], 'unknown', 10, OCT), /Unknown/);
  assert.throws(() => program.redeem(model, [], 'unknown', OCT), /Unknown/);
  assert.throws(() => program.earn(model, [], 'manual', 10, '2026-02-30'), /Invalid event date/);
});
test('ledger rejects duplicate events and redemption changing qualifying status', () => {
  const model = fixture(), event = program.earn(model, [], 'manual', undefined, OCT);
  assert.throws(() => program.summarize(model, [event, event]), /unique ids/);
  assert.throws(() => program.summarize(model, [{ ...event, type: 'redeem', qualifying: -100, redeemable: -1 }]), /only redeemable/);
  assert.throws(() => program.summarize(model, [{ ...event, qualifying: 1e12 }]), /out of range/);
  assert.ok(Object.isFrozen(event));
});
test('serialized browser factory works standalone without Node or editor dependencies', () => {
  const standalone = vm.runInNewContext(`(${program.factory.toString()})()`);
  const result = standalone.summarize(fixture());
  assert.equal(result.qualifying, 1000); assert.equal(result.tier.name, 'Advantage');
});

test('fixed redeemable awards keep their exact value independent of tier multipliers', () => {
  const model = fixture({ earnRules: [{ id: 'training', name: 'Training', kind: 'fixed', qualifyingPoints: 25, redeemablePoints: 11 }] });
  const earned = program.earn(model, [], 'training', undefined, OCT);
  assert.equal(program.summarize(model).tier.multiplier, 1.5);
  assert.equal(earned.qualifying, 25); assert.equal(earned.redeemable, 11);
});
test('missing participant and opening balances are labeled synthetic assumptions', () => {
  const model = program.normalize({});
  assert.ok(model.assumptions.some(text => /fictional participant name/.test(text)));
  assert.ok(model.assumptions.some(text => /opening qualifying balance.*synthetic zero/.test(text)));
  assert.ok(model.assumptions.some(text => /opening redeemable balance.*synthetic zero/.test(text)));
  const explicit = fixture({ member: { name: 'Example Person' } });
  assert.ok(!explicit.assumptions.some(text => /synthetic participant name|synthetic zero/.test(text)));
});
test('blank visible names and B2B organization are rejected', () => {
  for (const input of [{ name: ' ' }, { member: { name: '' } }, { mode: 'b2b', member: { organization: '' } },
    { currencies: { qualifyingName: '' } }, { currencies: { redeemableName: '' } },
    { roles: [{ id: 'member', name: '' }] }, { rewards: [{ id: 'credit', name: '', cost: 10 }] },
    { earnRules: [{ id: 'purchase', name: '', kind: 'spend', qualifyingRate: 1 }] }]) {
    assert.equal(program.validate(input).valid, false, JSON.stringify(input));
  }
});
test('null caps are unlimited; zero cap blocks only qualifying points', () => {
  const fixed = { id: 'training', name: 'Training', kind: 'fixed', qualifyingPoints: 25, redeemablePoints: 11 };
  const unlimited = fixture({ freeContentMonthlyCap: null, earnRules: [fixed] });
  const zeroShared = fixture({ freeContentMonthlyCap: 0, earnRules: [fixed] });
  const zeroRule = fixture({ freeContentMonthlyCap: null, earnRules: [{ ...fixed, monthlyCap: 0 }] });
  assert.equal(program.earn(unlimited, [], 'training', undefined, OCT).qualifying, 25);
  for (const model of [zeroShared, zeroRule]) {
    const event = program.earn(model, [], 'training', undefined, OCT);
    assert.equal(event.qualifying, 0); assert.equal(event.redeemable, 11);
  }
});

test('approval workflow is accepted only for B2B programs', () => {
  const roles = [{ id: 'member', name: 'Member', canRequest: true, canApprove: true }];
  const consumer = program.validate({ mode: 'b2c', approvalRequired: true, roles });
  assert.equal(consumer.valid, false);
  assert.ok(consumer.errors.some(error => /approval workflow is supported for B2B programs/.test(error)));
  const business = program.validate({ mode: 'b2b', approvalRequired: true, roles });
  assert.equal(business.valid, true);
});
