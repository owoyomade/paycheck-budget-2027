// Paycheck and bill maths. Pure functions with no DOM, so test/budget.test.js can check them directly.
// Dates are local calendar days stored as "YYYY-MM-DD" strings, which also sort correctly as text.
export const YEAR = 2027;
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const newId = () => Math.random().toString(36).slice(2, 9);

// ---------- Date helpers ----------
const pad = n => String(n).padStart(2, '0');
export const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
/** The given day of month m, pulled back to the last day for short months (31 → Feb 28). */
export const clampDate = (y, m, day) => new Date(y, m, Math.min(Math.max(1, Number(day) || 1), daysInMonth(y, m)));
export const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
/** Whole days from a to b (positive when b is later). Rounded so daylight-saving changes don't matter. */
export const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);

/** Moves a Saturday or Sunday payday to the Friday before ('before') or Monday after ('after'). */
export function adjustWeekend(d, rule) {
  const day = d.getDay();
  if (rule === 'none' || (day !== 0 && day !== 6)) return d;
  const r = new Date(d);
  if (rule === 'after') r.setDate(r.getDate() + (day === 6 ? 2 : 1));
  else r.setDate(r.getDate() - (day === 6 ? 1 : 2));
  return r;
}

// ---------- Paychecks and bills ----------
/** Every payday in the year, sorted, with the amount for each (a per-paycheck override wins). */
export function getPaychecks(pay, payOverrides = {}, year = YEAR) {
  const dates = [];
  if (pay.frequency === 'weekly' || pay.frequency === 'biweekly') {
    if (!pay.firstDate) return [];
    const step = pay.frequency === 'weekly' ? 7 : 14;
    const d = parse(pay.firstDate);
    while (d.getFullYear() < year) d.setDate(d.getDate() + step);
    while (d.getFullYear() === year) { dates.push(iso(d)); d.setDate(d.getDate() + step); }
  } else {
    const days = pay.frequency === 'semimonthly' ? [pay.semi1, pay.semi2] : [pay.monthlyDay];
    for (let m = 0; m < 12; m++) {
      for (const day of days) dates.push(iso(adjustWeekend(clampDate(year, m, day), pay.weekendRule)));
    }
  }
  return [...new Set(dates)].filter(s => s.startsWith(String(year))).sort()
    .map(date => ({ date, amount: payOverrides[date] ?? (Number(pay.amount) || 0) }));
}

/** Each time a bill comes due in the year. `key` identifies one occurrence, for "paid" and "moved". */
export function getBillOccurrences(bills, year = YEAR) {
  const out = [];
  for (const bill of bills) {
    const amount = Number(bill.amount) || 0;
    if (bill.freq === 'monthly') {
      for (let m = 0; m < 12; m++) out.push({ bill, amount, due: iso(clampDate(year, m, bill.day)) });
    } else if (bill.date) {
      const d = parse(bill.date);
      const due = bill.freq === 'yearly' ? iso(clampDate(year, d.getMonth(), d.getDate())) : bill.date;
      if (due.startsWith(String(year))) out.push({ bill, amount, due });
    }
  }
  return out.map(o => ({ ...o, key: `${o.bill.id}|${o.due}` })).sort((a, b) => a.due.localeCompare(b.due));
}

/** Yearly and one-time bills are saved for a little from every paycheck, unless the person turned that off. */
export const savesUp = bill => bill.freq !== 'monthly' && bill.saveUp !== false;

/**
 * Lays out the year. Each bill is paid from the latest paycheck on or before its due date, unless the
 * person moved it. Bills due before the first payday of the year belong to last year's final paycheck,
 * so they're listed in `beforeFirst` instead of being charged to the first paycheck.
 * A bill that's saved up for is split evenly across every paycheck from January up to the one that pays it.
 */
export function buildPlan(state, year = YEAR) {
  const checks = getPaychecks(state.pay, state.payOverrides, year).map((c, index) => ({ ...c, index, bills: [], savings: [] }));
  const beforeFirst = [];
  const byDate = Object.fromEntries(checks.map(c => [c.date, c]));
  const overrides = state.overrides || {};
  for (const occ of getBillOccurrences(state.bills, year)) {
    let target = null;
    for (const c of checks) { if (c.date <= occ.due) target = c; else break; }
    if (byDate[overrides[occ.key]]) target = byDate[overrides[occ.key]];
    if (!target) { beforeFirst.push(occ); continue; }
    target.bills.push(occ);
    if (savesUp(occ.bill)) {
      occ.fromSavings = true;
      splitCents(occ.amount, target.index + 1).forEach((part, i) =>
        checks[i].savings.push({ key: occ.key, name: occ.bill.name, due: occ.due, amount: part }));
    }
  }

  const allotTotal = (state.allotments || []).reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const perMonth = {};
  const usual = state.pay.frequency === 'weekly' ? 4 : 2;
  checks.forEach((c, i) => {
    c.billTotal = round2(c.bills.filter(o => !o.fromSavings).reduce((s, o) => s + o.amount, 0));
    c.saveTotal = round2(c.savings.reduce((s, x) => s + x.amount, 0));
    c.allotTotal = allotTotal;
    c.left = round2(c.amount - c.billTotal - c.saveTotal - allotTotal);
    c.month = parse(c.date).getMonth();
    c.nthInMonth = (perMonth[c.month] = (perMonth[c.month] || 0) + 1);
    c.extra = (state.pay.frequency === 'weekly' || state.pay.frequency === 'biweekly') && c.nthInMonth > usual;
    // The pay period runs from this payday up to the day before the next one.
    c.nextDate = checks[i + 1]?.date ?? null;
    c.endDate = c.nextDate ? addDays(c.nextDate, -1) : `${year}-12-31`;
  });

  const sum = f => round2(checks.reduce((s, c) => s + f(c), 0));
  const totals = { income: sum(c => c.amount), bills: sum(c => c.billTotal + c.saveTotal), allotments: sum(c => c.allotTotal), left: sum(c => c.left) };
  return { checks, beforeFirst, totals };
}

/** Splits an amount into n parts that are whole cents and add up exactly; any leftover cents go on the last part. */
export function splitCents(amount, n) {
  const cents = Math.round(amount * 100);
  const base = Math.floor(cents / n);
  return Array.from({ length: n }, (_, i) => (base + (i === n - 1 ? cents - base * n : 0)) / 100);
}

/**
 * Suggests paying some bills one paycheck earlier so the money left from each paycheck is more even.
 * Bills only ever move earlier (never past their due date), never more than `maxDaysEarly` before they're
 * due, and only between paychecks from `from` onward (and before `lockedFrom`, for the free trial).
 * Each step makes the move that most evens out the two paychecks involved (it shrinks the sum of squared
 * leftovers), and stops when no move helps.
 */
export function suggestSmoothing(state, { from = '', lockedFrom = null, maxDaysEarly = 31, year = YEAR } = {}) {
  const { checks } = buildPlan(state, year);
  const open = checks.map(c => c.date >= from && (!lockedFrom || c.date < lockedFrom));
  const left = checks.map(c => c.left);
  const movable = [];
  checks.forEach((c, i) => c.bills.forEach(o => {
    if (!o.fromSavings && !state.paid?.[o.key] && o.amount > 0) movable.push({ occ: o, start: i, at: i });
  }));
  const range = () => {
    const vals = left.filter((_, i) => open[i]);
    return vals.length ? { min: round2(Math.min(...vals)), max: round2(Math.max(...vals)) } : null;
  };
  const before = range();

  for (let step = 0; step < 1000; step++) {
    let best = null;
    for (const m of movable) {
      const i = m.at, b = m.occ.amount;
      if (i < 1 || !open[i] || !open[i - 1]) continue;
      if (daysBetween(checks[i - 1].date, m.occ.due) > maxDaysEarly) continue;
      const gain = b * (left[i - 1] - left[i] - b);
      if (gain > 0.01 && (!best || gain > best.gain)) best = { m, gain };
    }
    if (!best) break;
    const { m } = best;
    left[m.at] += m.occ.amount;
    left[m.at - 1] -= m.occ.amount;
    m.at -= 1;
  }

  const moves = movable.filter(m => m.at !== m.start).map(m => ({
    key: m.occ.key, name: m.occ.bill.name, amount: m.occ.amount, due: m.occ.due,
    from: checks[m.start].date, to: checks[m.at].date,
  }));
  return { moves, before, after: range() };
}

/**
 * "Can I afford this?" for a price today. Looks at what's left to spend from the current paycheck (or the
 * first one, before the year starts) and, if it doesn't fit, whether the next paycheck has room.
 * status: 'yes', 'tight' (fits but leaves under 10% of the paycheck's spending money), 'wait' (fits in the
 * next paycheck), 'no', or 'unknown' (no paycheck to check against).
 */
export function canAfford(checks, spending, today, price) {
  const period = findPeriod(checks, today);
  if (period.status === 'none' || period.status === 'after' || !(price > 0)) return { status: 'unknown' };
  const check = checks[period.index];
  const next = checks[period.index + 1] || null;
  const left = period.status === 'during' ? leftToSpend(check, spending).left : check.left;
  const after = round2(left - price);
  const spendable = check.amount - check.billTotal - check.saveTotal - check.allotTotal;
  if (after >= 0) return { status: after < spendable * 0.1 ? 'tight' : 'yes', after, check, next, period: period.status };
  return { status: next && next.left >= price ? 'wait' : 'no', short: round2(-after), check, next, period: period.status };
}

/** Which pay period `today` falls in: 'before' the first payday, 'during' a period, or 'after' the year. */
export function findPeriod(checks, today) {
  if (!checks.length) return { status: 'none', index: -1 };
  if (today < checks[0].date) return { status: 'before', index: 0 };
  const index = checks.findLastIndex(c => c.date <= today);
  if (today > checks[index].endDate) return { status: 'after', index };
  return { status: 'during', index };
}

/** Spending logged on or after this payday and before the next one. */
export const periodSpending = (spending, check) =>
  (spending || []).filter(s => s.date >= check.date && s.date <= check.endDate);

/** What's left to spend until next payday: the paycheck's leftover minus spending logged in the period. */
export function leftToSpend(check, spending) {
  const spent = round2(periodSpending(spending, check).reduce((s, x) => s + (Number(x.amount) || 0), 0));
  return { spent, left: round2(check.left - spent) };
}

/**
 * Progress towards a set-aside's goal (e.g. "Emergency fund: $3,000"). Counts what was already saved plus
 * this set-aside from every paycheck up to today, and finds the payday the goal is reached.
 * `reachDate` is null when it won't be reached within the year.
 */
export function goalProgress(allotment, checks, today) {
  const target = Number(allotment.goal) || 0;
  const per = Number(allotment.amount) || 0;
  const start = Number(allotment.saved) || 0;
  if (target <= 0) return null;
  const paidSoFar = checks.filter(c => c.date <= today).length;
  const saved = round2(Math.min(target, start + per * paidSoFar));
  let reachDate = null;
  if (start >= target) reachDate = checks[0]?.date ?? null;
  else if (per > 0) reachDate = checks[Math.ceil((target - start) / per) - 1]?.date ?? null;
  return { target, saved, pct: Math.round((saved / target) * 100), reachDate, reached: saved >= target };
}

/** What builds up if each paycheck's leftover is carried forward, starting from `start` in the bank. */
export function runningCushion(checks, start = 0) {
  let total = Number(start) || 0;
  return checks.map(c => (total = round2(total + c.left)));
}

export const round2 = n => Math.round(n * 100) / 100;
