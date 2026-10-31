import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getPaychecks, getBillOccurrences, buildPlan, findPeriod, periodSpending, leftToSpend, adjustWeekend, parse, iso,
  splitCents, suggestSmoothing, canAfford, goalProgress, runningCushion, daysBetween,
} from '../site/budget.js';
import { blankState, sampleState } from '../site/sample.js';

const pay = over => ({ ...blankState().pay, amount: 2000, ...over });
const dates = checks => checks.map(c => c.date);
const bill = (id, amount, extra) => ({ id, name: id, amount, freq: 'monthly', day: 1, date: '', ...extra });

describe('paydays', () => {
  it('every 2 weeks from Fri Jan 8 gives 26 paychecks, ending Dec 24', () => {
    const checks = getPaychecks(pay({ frequency: 'biweekly', firstDate: '2027-01-08' }));
    assert.equal(checks.length, 26);
    assert.equal(checks[0].date, '2027-01-08');
    assert.equal(checks.at(-1).date, '2027-12-24');
  });

  it('rolls a first payday from late 2026 forward into 2027', () => {
    const checks = getPaychecks(pay({ frequency: 'biweekly', firstDate: '2026-12-25' }));
    assert.equal(checks[0].date, '2027-01-08');
  });

  it('weekly from Fri Jan 1 gives 53 paychecks', () => {
    assert.equal(getPaychecks(pay({ frequency: 'weekly', firstDate: '2027-01-01' })).length, 53);
  });

  it('twice a month on the 15th and 31st moves weekend paydays to the Friday before', () => {
    const d = dates(getPaychecks(pay({ frequency: 'semimonthly', semi1: 15, semi2: 31, weekendRule: 'before' })));
    assert.equal(d.length, 24);
    assert.deepEqual(d.slice(0, 4), ['2027-01-15', '2027-01-29', '2027-02-15', '2027-02-26']);
    assert.ok(d.includes('2027-05-14'), 'Sat May 15 → Fri May 14');
    assert.ok(d.includes('2027-04-30'), '31st clamps to Apr 30');
  });

  it('can move weekend paydays to the Monday after, or not at all', () => {
    const after = dates(getPaychecks(pay({ frequency: 'semimonthly', semi1: 15, semi2: 31, weekendRule: 'after' })));
    assert.ok(after.includes('2027-02-01'), 'Sun Jan 31 → Mon Feb 1');
    assert.ok(after.includes('2027-05-17'), 'Sat May 15 → Mon May 17');
    const none = dates(getPaychecks(pay({ frequency: 'semimonthly', semi1: 15, semi2: 31, weekendRule: 'none' })));
    assert.ok(none.includes('2027-01-31'));
  });

  it('never pushes a payday into another year', () => {
    // Fri Dec 31 2027 is a weekday, but Monday-after rules must not spill into 2028 for other days either.
    const d = dates(getPaychecks(pay({ frequency: 'monthly', monthlyDay: 31, weekendRule: 'after' })));
    assert.equal(d.length, 12);
    assert.ok(d.every(s => s.startsWith('2027')));
  });

  it('monthly on the 31st lands on the last day of short months', () => {
    const d = dates(getPaychecks(pay({ frequency: 'monthly', monthlyDay: 31, weekendRule: 'none' })));
    assert.equal(d[1], '2027-02-28');
  });

  it('uses a one-off amount for a single paycheck', () => {
    const checks = getPaychecks(pay({ frequency: 'biweekly', firstDate: '2027-01-08' }), { '2027-01-22': 2500 });
    assert.equal(checks[0].amount, 2000);
    assert.equal(checks[1].amount, 2500);
  });

  it('adjustWeekend leaves weekdays alone', () => {
    assert.equal(iso(adjustWeekend(parse('2027-03-03'), 'before')), '2027-03-03');
  });
});

describe('bills', () => {
  it('a monthly bill on the 31st falls on Feb 28', () => {
    const occ = getBillOccurrences([bill('b', 10, { day: 31 })]);
    assert.equal(occ.length, 12);
    assert.equal(occ[1].due, '2027-02-28');
  });

  it('yearly bills recur in 2027; one-time bills outside 2027 are ignored', () => {
    const occ = getBillOccurrences([
      bill('y', 100, { freq: 'yearly', date: '2026-06-15' }),
      bill('o', 50, { freq: 'once', date: '2028-01-05' }),
      bill('o2', 60, { freq: 'once', date: '2027-09-09' }),
    ]);
    assert.deepEqual(occ.map(o => o.due), ['2027-06-15', '2027-09-09']);
  });
});

describe('plan', () => {
  const state = over => ({ ...blankState(), pay: pay({ frequency: 'biweekly', firstDate: '2027-01-08' }), ...over });

  it('pays each bill from the last paycheck on or before its due date', () => {
    const { checks } = buildPlan(state({ bills: [bill('rent', 1000, { day: 1 }), bill('phone', 50, { day: 22 })] }));
    const by = d => checks.find(c => c.date === d).bills.map(o => o.due);
    assert.deepEqual(by('2027-01-22'), ['2027-01-22', '2027-02-01'], 'a bill due on payday comes from that payday');
    assert.deepEqual(by('2027-01-08'), []);
  });

  it('lists bills due before the first payday separately, not on the first paycheck', () => {
    const { checks, beforeFirst } = buildPlan(state({ bills: [bill('rent', 1000, { day: 1 })] }));
    assert.deepEqual(beforeFirst.map(o => o.due), ['2027-01-01']);
    assert.equal(checks[0].billTotal, 0);
  });

  it('works out the leftover from pay, bills and set-asides', () => {
    const { checks, totals } = buildPlan(state({
      bills: [bill('car', 300.5, { day: 10 })],
      allotments: [{ id: 'g', name: 'Groceries', amount: 250 }, { id: 's', name: 'Savings', amount: 100 }],
    }));
    assert.equal(checks[0].left, 2000 - 300.5 - 350);
    assert.equal(totals.income, 26 * 2000);
    assert.equal(totals.bills, 12 * 300.5);
    assert.equal(totals.left, round(26 * 2000 - 12 * 300.5 - 26 * 350));
  });

  it('honours a bill moved to another paycheck, and ignores a move to a day that isn\'t a payday', () => {
    const bills = [bill('car', 300, { day: 18 })];
    const moved = buildPlan(state({ bills, overrides: { 'car|2027-01-18': '2027-01-22' } })).checks;
    assert.equal(moved[0].billTotal, 0);
    assert.equal(moved[1].billTotal, 300);
    const bad = buildPlan(state({ bills, overrides: { 'car|2027-01-18': '2027-01-20' } })).checks;
    assert.equal(bad[0].billTotal, 300);
  });

  it('marks the third paycheck in a month as extra', () => {
    const { checks } = buildPlan(state());
    assert.deepEqual(checks.filter(c => c.extra).map(c => c.date), ['2027-04-30', '2027-10-29']);
  });

  it('gives each pay period an end date the day before the next payday', () => {
    const { checks } = buildPlan(state());
    assert.equal(checks[0].endDate, '2027-01-21');
    assert.equal(checks.at(-1).endDate, '2027-12-31');
  });

  it('the sample household plans without errors and has money left in its first paycheck', () => {
    const { checks, beforeFirst } = buildPlan(sampleState());
    assert.equal(checks.length, 26);
    assert.ok(checks[0].left > 0);
    assert.ok(beforeFirst.length > 0);
  });
});

describe('left to spend', () => {
  const { checks } = buildPlan({ ...blankState(), pay: pay({ frequency: 'biweekly', firstDate: '2027-01-08' }) });

  it('finds the pay period for a given day', () => {
    assert.deepEqual(findPeriod(checks, '2026-12-01'), { status: 'before', index: 0 });
    assert.deepEqual(findPeriod(checks, '2027-01-08'), { status: 'during', index: 0 });
    assert.deepEqual(findPeriod(checks, '2027-01-21'), { status: 'during', index: 0 });
    assert.deepEqual(findPeriod(checks, '2027-01-22'), { status: 'during', index: 1 });
    assert.deepEqual(findPeriod(checks, '2028-01-01'), { status: 'after', index: 25 });
    assert.equal(findPeriod([], '2027-01-01').status, 'none');
  });

  it('counts only spending inside the pay period', () => {
    const spending = [
      { id: 'a', date: '2027-01-07', amount: 5 },
      { id: 'b', date: '2027-01-08', amount: 10 },
      { id: 'c', date: '2027-01-21', amount: 20.25 },
      { id: 'd', date: '2027-01-22', amount: 40 },
    ];
    assert.deepEqual(periodSpending(spending, checks[0]).map(s => s.id), ['b', 'c']);
    assert.deepEqual(leftToSpend(checks[0], spending), { spent: 30.25, left: 2000 - 30.25 });
  });
});

const biweekly = over => ({ ...blankState(), pay: pay({ frequency: 'biweekly', firstDate: '2027-01-08' }), ...over });

describe('saving up for yearly bills', () => {
  it('splits an amount into whole cents that add up exactly', () => {
    assert.deepEqual(splitCents(100, 3), [33.33, 33.33, 33.34]);
    assert.deepEqual(splitCents(180, 14).reduce((a, b) => a + b * 100, 0), 18000);
  });

  it('spreads a yearly bill over every paycheck up to the one that pays it', () => {
    // Due Mar 9 → paid from the Mar 5 paycheck, the 5th of the year, so $100 is $20 a paycheck.
    const { checks, totals } = buildPlan(biweekly({ bills: [bill('reg', 100, { freq: 'yearly', date: '2027-03-09' })] }));
    assert.deepEqual(checks.slice(0, 5).map(c => c.saveTotal), [20, 20, 20, 20, 20]);
    assert.equal(checks[5].saveTotal, 0);
    assert.equal(checks[4].billTotal, 0, 'the bill itself is paid from savings, not charged again');
    assert.equal(checks[0].left, 1980);
    assert.equal(totals.bills, 100);
  });

  it('charges the bill in full when saving up is turned off', () => {
    const { checks } = buildPlan(biweekly({ bills: [bill('reg', 100, { freq: 'yearly', date: '2027-03-09', saveUp: false })] }));
    assert.equal(checks[0].saveTotal, 0);
    assert.equal(checks[4].billTotal, 100);
  });
});

describe('smooth my paychecks', () => {
  // Rent lands on the 2nd paycheck each month, so it has far less left than the 1st.
  const state = biweekly({ bills: [bill('rent', 1200, { day: 1 }), bill('car', 300, { day: 25 }), bill('phone', 80, { day: 24 })] });

  it('moves bills earlier to even out the leftovers, and never past the due date', () => {
    const { moves, before, after } = suggestSmoothing(state, { from: '2027-01-08', lockedFrom: '2027-03-01' });
    assert.ok(moves.length > 0);
    assert.ok(after.min > before.min, 'the tightest paycheck gets more room');
    for (const m of moves) {
      assert.ok(m.to < m.from, 'only ever earlier');
      assert.ok(m.to <= m.due, 'still paid on time');
      assert.ok(daysBetween(m.to, m.due) <= 31, 'never more than a month early');
    }
  });

  it('applying the moves gives the "after" numbers it promised', () => {
    const { moves, after } = suggestSmoothing(state, { from: '2027-01-08', lockedFrom: '2027-03-01' });
    const overrides = Object.fromEntries(moves.map(m => [m.key, m.to]));
    const lefts = buildPlan({ ...state, overrides }).checks.filter(c => c.date < '2027-03-01').map(c => c.left);
    assert.equal(Math.min(...lefts), after.min);
  });

  it('leaves past and locked paychecks alone, and skips bills already paid', () => {
    const { moves } = suggestSmoothing(state, { from: '2027-02-05', lockedFrom: '2027-03-01' });
    assert.ok(moves.every(m => m.to >= '2027-02-05' && m.from < '2027-03-01'));
    const paid = Object.fromEntries(moves.map(m => [m.key, true]));
    const again = suggestSmoothing({ ...state, paid }, { from: '2027-02-05', lockedFrom: '2027-03-01' });
    assert.ok(again.moves.every(m => !paid[m.key]));
  });
});

describe('can I afford this?', () => {
  // 1st paycheck has $2,000 to spend; 2nd has $500 after rent.
  const { checks } = buildPlan(biweekly({ bills: [bill('rent', 1500, { day: 1 })] }));

  it('says yes when it fits this paycheck', () => {
    const r = canAfford(checks, [], '2027-01-10', 300);
    assert.equal(r.status, 'yes');
    assert.equal(r.after, 1700);
  });

  it('counts spending already logged, and warns when it would be tight', () => {
    const r = canAfford(checks, [{ id: 'a', date: '2027-01-09', amount: 1750 }], '2027-01-10', 100);
    assert.equal(r.status, 'tight');
    assert.equal(r.after, 150);
  });

  it('suggests waiting when it fits the next paycheck but not this one', () => {
    const r = canAfford(checks, [{ id: 'a', date: '2027-01-24', amount: 400 }], '2027-01-25', 300);
    assert.equal(r.status, 'wait');
    assert.equal(r.short, 200);
  });

  it('says no when neither paycheck has room', () => {
    assert.equal(canAfford(checks, [], '2027-01-25', 5000).status, 'no');
    assert.equal(canAfford(checks, [], '2027-01-25', 0).status, 'unknown');
  });
});

describe('savings goals and cushion', () => {
  const { checks } = buildPlan(biweekly());

  it('tracks progress and the payday a goal is reached', () => {
    const g = goalProgress({ amount: 100, goal: 1000, saved: 400 }, checks, '2027-01-25');
    assert.equal(g.saved, 600);
    assert.equal(g.pct, 60);
    assert.equal(g.reachDate, checks[5].date, '$600 more at $100 a paycheck = the 6th payday');
  });

  it('reports a goal that won\'t be reached this year', () => {
    assert.equal(goalProgress({ amount: 10, goal: 1000 }, checks, '2027-01-01').reachDate, null);
    assert.equal(goalProgress({ amount: 10 }, checks, '2027-01-01'), null);
  });

  it('carries each leftover forward', () => {
    const c = runningCushion(checks.slice(0, 3), 50);
    assert.deepEqual(c, [2050, 4050, 6050]);
  });
});

const round = n => Math.round(n * 100) / 100;
