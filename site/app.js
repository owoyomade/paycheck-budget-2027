// 2027 Paycheck Budget: the screens. The maths lives in budget.js and the trial in licence.js.
import {
  YEAR, MONTHS, iso, parse, newId, daysBetween, buildPlan, findPeriod, periodSpending, leftToSpend,
  suggestSmoothing, canAfford, goalProgress, runningCushion, savesUp,
} from './budget.js';
import { isLocked, isValidCode, TRIAL_END, BUY_URL, SUPPORT_EMAIL } from './licence.js';
import { blankState, sampleState } from './sample.js';

const VERSION = '1.0.0';
const STORAGE_KEY = 'paycheck-budget-2027';
const UNLOCK_KEY = 'paycheck-budget-2027-unlocked';
const THEME_KEY = 'paycheck-budget-2027-theme';
const PALETTE_KEY = 'paycheck-budget-2027-palette';
const FONT_KEY = 'paycheck-budget-2027-font';
const VIEWS = ['home', 'plan', 'setup', 'me', 'more'];
const DEFAULT_APP_NAME = 'Paycheck Budget 2027';

// Colour themes: [id, name, accent, dark tone]. The full colours live in styles.css.
const PALETTES = [
  ['cobalt', 'Cobalt', '#2546f0', '#0d1017'],
  ['sage', 'Sage', '#2f7a55', '#12201a'],
  ['blush', 'Blush', '#c03f6e', '#2a1420'],
  ['lavender', 'Lavender', '#6b4fd8', '#1b1530'],
  ['ocean', 'Ocean', '#0b7285', '#0c1f26'],
  ['terracotta', 'Terracotta', '#c4532d', '#24150f'],
  ['graphite', 'Graphite', '#1f2328', '#9097a6'],
];
// Font styles: [id, name, what it changes, a font stack for the preview]. These match styles.css.
const FONTS = [
  ['modern', 'Modern', 'Clean and simple', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'],
  ['rounded', 'Rounded', 'Soft and friendly', 'ui-rounded, "SF Pro Rounded", "Nunito", "Arial Rounded MT Bold", sans-serif'],
  ['elegant', 'Elegant', 'Serif headings and numbers', 'ui-serif, "New York", "Iowan Old Style", Palatino, Georgia, serif'],
  ['ledger', 'Ledger', 'Typewriter numbers', 'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace'],
];

const BONUS_CHOICES = {
  '': 'Not decided yet',
  savings: 'Add to savings',
  debt: 'Pay down debt',
  holidays: 'Holidays and gifts',
  treat: 'Something fun',
  spend: 'Spend as usual',
};

// Browser storage can be blocked (private windows, strict settings), so every access is guarded.
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* not saved; the app still works this session */ } },
};

function load() {
  try {
    const saved = JSON.parse(store.get(STORAGE_KEY));
    if (saved && saved.pay && Array.isArray(saved.bills)) return { ...blankState(), ...saved };
  } catch { /* fall through to the sample */ }
  return sampleState();
}

let state = load();
let unlocked = store.get(UNLOCK_KEY) === '1';
const ui = {
  view: VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home',
  month: null, hidePaid: false, smooth: null, affordPrice: null, wizStep: 0,
};

// ?today=2027-01-15 previews the app as if it were that day (for screenshots and demos).
const todayParam = new URLSearchParams(location.search).get('today');
const today = /^\d{4}-\d{2}-\d{2}$/.test(todayParam || '') ? todayParam : iso(new Date());

const save = () => store.set(STORAGE_KEY, JSON.stringify(state));

// ---------- Formatting ----------
const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let moneyFmt;
const money = n => moneyFmt.format(n);
function setCurrency() {
  try { moneyFmt = new Intl.NumberFormat(undefined, { style: 'currency', currency: state.currency || 'USD' }); }
  catch { moneyFmt = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }); }
}
const shortDate = s => { const d = parse(s); return `${MONTHS[d.getMonth()]} ${d.getDate()}`; };
const longDate = s => parse(s).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const ordinal = n => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
const dayOptions = selected => Array.from({ length: 31 }, (_, i) =>
  `<option value="${i + 1}" ${Number(selected) === i + 1 ? 'selected' : ''}>${i === 30 ? '31st (or last day)' : `the ${ordinal(i + 1)}`}</option>`).join('');
const trialEndLabel = parse(TRIAL_END).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
const locked = c => isLocked(c.date, unlocked);

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2600);
}

// ---------- Shared pieces ----------
function unlockFormHTML() {
  return `
    <form class="unlock-form" data-form="unlock">
      <input name="code" placeholder="PB-XXXX-XXXX-XXXX" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Unlock code">
      <button type="submit">Unlock</button>
    </form>
    <p class="unlock-msg" role="status"></p>`;
}

function lockedCardHTML(title) {
  return `
    <div class="card lock-card">
      <h2>${title}</h2>
      <p>The free trial plans your paychecks in January and February ${YEAR}. Unlock to plan every paycheck through December.</p>
      <p><a class="button-like" href="${BUY_URL}" target="_blank" rel="noopener">Get the full version</a></p>
      <p class="hint">Already bought it? Enter the unlock code from your Start Here PDF.</p>
      ${unlockFormHTML()}
    </div>`;
}

function billLineHTML(o, checks, currentDate, withMove) {
  const paid = !!state.paid[o.key];
  const options = withMove
    ? checks.filter(c => !locked(c) && c.date <= o.due || c.date === currentDate)
      .map(c => `<option value="${c.date}" ${c.date === currentDate ? 'selected' : ''}>${shortDate(c.date)}</option>`).join('')
    : '';
  const dueIn = daysBetween(today, o.due);
  const soon = !paid && dueIn >= 0 && dueIn <= 3;
  return `
    <li class="line ${paid ? 'paid' : ''}">
      <input type="checkbox" data-paid="${o.key}" ${paid ? 'checked' : ''} aria-label="Mark ${esc(o.bill.name)} paid">
      <div>
        <div class="name">${esc(o.bill.name)}</div>
        <div class="due"><span class="${soon ? 'soon' : ''}">Due ${shortDate(o.due)}${soon ? (dueIn === 0 ? ' · today' : ` · in ${plural(dueIn, 'day')}`) : ''}</span>
          ${o.fromSavings ? '<span class="tag">paid from savings</span>' : ''}
          ${withMove ? `<span class="move">· pay from <select data-move="${o.key}" aria-label="Pay ${esc(o.bill.name)} from paycheck">${options}</select></span>` : ''}
        </div>
      </div>
      <span class="amt num ${o.fromSavings ? 'muted' : ''}">${money(o.amount)}</span>
    </li>`;
}

function savingsLineHTML(c) {
  if (!c.saveTotal) return '';
  const names = [...new Set(c.savings.map(s => s.name))].join(', ');
  return `<li class="line allot"><span></span><span class="name">Saving for yearly bills<small>${esc(names)}</small></span><span class="amt num">${money(c.saveTotal)}</span></li>`;
}

// ---------- Home ----------
function renderHome(plan) {
  const { checks } = plan;
  const el = $('#view-home');
  if (!checks.length || !(Number(state.pay.amount) > 0 || Object.keys(state.payOverrides).length)) {
    el.innerHTML = `
      <div class="card lock-card">
        <h2>Let's set up your budget</h2>
        <p>Five quick questions about your pay and bills, and your plan for every 2027 paycheck appears here.</p>
        <button data-action="wizard">Start</button>
      </div>`;
    return;
  }

  const period = findPeriod(checks, today);
  const c = checks[period.index];
  if (locked(c)) { el.innerHTML = lockedCardHTML('Your free trial has ended'); return; }

  const { spent, left } = leftToSpend(c, state.spending);
  const spendable = c.amount - c.billTotal - c.saveTotal - c.allotTotal;
  const next = checks[period.index + 1];
  let hero;
  if (period.status === 'before') {
    const days = daysBetween(today, c.date);
    hero = `
      <div class="hero ${c.left < 0 ? 'short' : ''}">
        <div class="eyebrow">Your first ${YEAR} payday is ${longDate(c.date)}, in ${plural(days, 'day')}</div>
        <div class="big">${money(c.left)}</div>
        <div class="meta">will be yours to spend from it, after bills and set-asides</div>
      </div>`;
  } else if (period.status === 'after') {
    hero = `
      <div class="hero">
        <div class="eyebrow">That's ${YEAR} done</div>
        <div class="big">${money(plan.totals.left)}</div>
        <div class="meta">planned as left over across the year</div>
      </div>`;
  } else {
    const daysLeft = daysBetween(today, c.endDate) + 1;
    const perDay = left > 0 ? left / daysLeft : 0;
    const used = spendable > 0 ? Math.min(100, Math.max(0, (spent / spendable) * 100)) : 100;
    hero = `
      <div class="hero ${left < 0 ? 'short' : ''}">
        <div class="eyebrow">Left to spend until ${next ? `payday on ${longDate(next.date)}` : 'the end of the year'}</div>
        <div class="big">${money(left)}</div>
        <div class="meta">${plural(daysLeft, 'day')} to go${left > 0 ? ` · about ${money(perDay)} a day` : ''}${c.extra ? ' · bonus paycheck' : ''}</div>
        <div class="meter" aria-hidden="true"><span style="width:${used}%"></span></div>
      </div>`;
  }

  const spends = periodSpending(state.spending, c).sort((a, b) => b.date.localeCompare(a.date));
  const spendCard = period.status === 'during' ? `
    <div class="card">
      <h2>Spending this pay period</h2>
      <p class="hint">Log money you spend outside your bills and set-asides, like takeout or a gift.</p>
      <form class="spend-form" data-form="spend">
        <input name="amount" type="number" inputmode="decimal" min="0.01" step="0.01" placeholder="Amount" aria-label="Amount spent" required>
        <input name="note" placeholder="What for?" maxlength="60" aria-label="What it was for">
        <button type="submit">Add</button>
      </form>
      <ul class="spend-list">
        ${spends.map(s => `
          <li><span class="date">${shortDate(s.date)}</span><span>${esc(s.note || 'Spending')}</span>
            <span class="num">${money(Number(s.amount))}</span>
            <button class="icon" data-action="remove-spend" data-id="${s.id}" aria-label="Remove ${esc(s.note || 'spending')}">×</button></li>`).join('')
          || '<li class="empty">Nothing logged yet.</li>'}
      </ul>
    </div>` : '';

  const breakdown = `
    <div class="card">
      <h2>Paycheck on ${longDate(c.date)}</h2>
      <ul class="breakdown num">
        <li><span>Take-home pay</span><span>${money(c.amount)}</span></li>
        <li><span>Bills from this paycheck</span><span>−${money(c.billTotal)}</span></li>
        ${c.saveTotal ? `<li><span>Saving for yearly bills</span><span>−${money(c.saveTotal)}</span></li>` : ''}
        <li><span>Set-asides</span><span>−${money(c.allotTotal)}</span></li>
        ${period.status === 'during' ? `<li><span>Spent so far</span><span>−${money(spent)}</span></li>` : ''}
        <li><span>Left to spend</span><span class="${left < 0 ? 'neg' : ''}">${money(period.status === 'during' ? left : c.left)}</span></li>
      </ul>
    </div>`;

  const bills = `
    <div class="card">
      <h2>Bills to pay from this paycheck</h2>
      <ul class="lines">${c.bills.map(o => billLineHTML(o, checks, c.date, false)).join('') || '<li class="empty">No bills from this paycheck.</li>'}</ul>
    </div>`;

  const nextCard = next && period.status !== 'after' ? `
    <div class="card next">
      <div><div class="label">Next paycheck · ${longDate(next.date)}</div>
        <div class="value ${!locked(next) && next.left < 0 ? 'neg' : ''}">${locked(next) ? 'Unlock to see' : `${money(next.left)} to spend after bills`}</div></div>
      <button class="ghost small" data-action="go" data-view="plan">See plan</button>
    </div>` : '';

  const left1 = period.status !== 'after' ? affordCardHTML(checks) : '';
  el.innerHTML = `${greetingHTML()}${hero}
    <div class="home-grid">
      <div>${left1}${spendCard}${bills}</div>
      <div>${breakdown}${nextCard}${goalsCardHTML(checks)}${bonusCardHTML(checks)}</div>
    </div>`;
}

function greetingHTML() {
  const name = state.owner?.name?.trim();
  if (!name) return '';
  const hour = new Date().getHours();
  return `<div class="greeting">${hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'}, ${esc(name)}</div>`;
}

function affordCardHTML(checks) {
  let result = '';
  if (ui.affordPrice > 0) {
    const r = canAfford(checks, state.spending, today, ui.affordPrice);
    const until = r.period === 'during'
      ? (r.next ? `until payday on ${longDate(r.next.date)}` : 'until the end of the year')
      : `from your ${longDate(r.check?.date ?? today)} paycheck`;
    const daysLeft = r.check && r.period === 'during' ? daysBetween(today, r.check.endDate) + 1 : null;
    const canLog = r.period === 'during' && (r.status === 'yes' || r.status === 'tight');
    const msg = {
      yes: `<b>Yes.</b> You'd still have ${money(r.after)} ${until}${daysLeft ? `, about ${money(r.after / daysLeft)} a day` : ''}.`,
      tight: `<b>Yes, but it's tight.</b> You'd have only ${money(r.after)} left ${until}${daysLeft ? ` to last ${plural(daysLeft, 'day')}` : ''}.`,
      wait: `<b>Not from this paycheck.</b> You'd be ${money(r.short ?? 0)} short. It fits in your ${r.next ? shortDate(r.next.date) : ''} paycheck, which has ${money(r.next?.left ?? 0)} to spend. Can it wait until then?`,
      no: `<b>Not right now.</b> You'd be ${money(r.short ?? 0)} short${r.next ? `, and your next paycheck only has ${money(Math.max(0, r.next.left))} to spend` : ''}. Try saving a little from a few paychecks first.`,
      unknown: 'Add your pay first, then try again.',
    }[r.status];
    result = `
      <div class="afford-result ${r.status}">
        <p>${msg}</p>
        ${canLog ? `<button class="small ghost" data-action="afford-log">I bought it, log ${money(ui.affordPrice)}</button>` : ''}
      </div>`;
  }
  return `
    <div class="card">
      <h2>Can I afford this?</h2>
      <form class="afford-form" data-form="afford">
        <input name="price" type="number" inputmode="decimal" min="0.01" step="0.01" placeholder="Price" aria-label="Price" value="${ui.affordPrice ?? ''}" required>
        <button type="submit">Check</button>
      </form>
      ${result}
    </div>`;
}

function goalsCardHTML(checks) {
  const goals = state.allotments.map(a => ({ a, g: goalProgress(a, checks, today) })).filter(x => x.g);
  if (!goals.length) return '';
  return `
    <div class="card">
      <h2>Savings goals</h2>
      ${goals.map(({ a, g }) => `
        <div class="goal">
          <div class="goal-head"><span>${esc(a.name || 'Goal')}</span><span class="num">${money(g.saved)} <span class="muted">of ${money(g.target)}</span></span></div>
          <div class="bar" role="progressbar" aria-valuenow="${g.pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(a.name)} progress"><span style="width:${g.pct}%"></span></div>
          <div class="goal-note">${g.reached ? 'Goal reached. Well done!'
            : g.reachDate ? `On track to reach it on ${longDate(g.reachDate)}.`
            : `At ${money(Number(a.amount) || 0)} a paycheck you won't reach it in ${YEAR}. Try a little more each payday.`}</div>
        </div>`).join('')}
    </div>`;
}

function bonusCardHTML(checks) {
  const extras = checks.filter(c => c.extra && c.date >= today.slice(0, 7));
  if (!extras.length) return '';
  const total = extras.reduce((s, c) => s + c.amount, 0);
  return `
    <div class="card">
      <h2>${plural(extras.length, 'bonus paycheck')} in ${YEAR}</h2>
      <p class="hint">Some months have one more payday than usual. Your monthly bills are covered by the other paychecks, so these ${money(total)} are a chance to get ahead. Decide now what they're for.</p>
      ${extras.map(c => `
        <div class="bonus-row">
          <div><b>${longDate(c.date)}</b><div class="muted">${locked(c) ? 'In the full version' : `${money(c.left)} to spend after bills`}</div></div>
          ${locked(c) ? '<button class="small ghost" data-action="go" data-view="more">Unlock</button>'
            : `<select data-bonus="${c.date}" aria-label="Plan for the ${longDate(c.date)} bonus paycheck">${Object.entries(BONUS_CHOICES)
              .map(([v, label]) => `<option value="${v}" ${(state.bonus[c.date] || '') === v ? 'selected' : ''}>${label}</option>`).join('')}</select>`}
        </div>`).join('')}
    </div>`;
}

// ---------- Plan ----------
function renderPlan(plan) {
  const { checks, totals, beforeFirst } = plan;
  const short = checks.filter(c => c.left < 0 && !locked(c)).length;
  $('#summary').innerHTML = `
    <div class="stat lead"><div class="label">${plural(checks.length, 'paycheck')} in ${YEAR}</div><div class="value">${money(totals.income)}</div></div>
    <div class="stat"><div class="label">Bills</div><div class="value">${money(totals.bills)}</div></div>
    <div class="stat"><div class="label">Set-asides</div><div class="value">${money(totals.allotments)}</div></div>
    <div class="stat"><div class="label">Left over${short ? ` · ${short} short` : ''}</div><div class="value ${totals.left < 0 ? 'neg' : ''}">${money(totals.left)}</div></div>`;

  renderChart(checks);
  renderSmooth(checks);

  $('#beforeFirst').innerHTML = beforeFirst.length && checks.length ? `
    <div class="note-card">Due before your first ${YEAR} payday (${shortDate(checks[0].date)}), so pay these from your last paycheck of ${YEAR - 1}:
      <ul>${beforeFirst.map(o => `<li>${esc(o.bill.name)}, due ${shortDate(o.due)}: <span class="num">${money(o.amount)}</span></li>`).join('')}</ul>
    </div>` : '';

  if (ui.month === null) ui.month = findPeriod(checks, today).status === 'during' ? String(parse(today).getMonth()) : 'all';
  const tabs = [['all', 'All year'], ...MONTHS.map((m, i) => [String(i), m])];
  $('#monthTabs').innerHTML = tabs.map(([v, label]) =>
    `<button role="tab" aria-selected="${ui.month === v}" data-action="month" data-month="${v}" class="${ui.month === v ? 'active' : ''}">${label}</button>`).join('');
  $('#hidePaid').checked = ui.hidePaid;

  const current = findPeriod(checks, today);
  const visible = checks.filter(c => ui.month === 'all' || String(c.month) === ui.month);
  let html = '', lastMonth = -1;
  for (const c of visible) {
    if (c.month !== lastMonth) {
      html += `<div class="month-label">${parse(c.date).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</div>`;
      lastMonth = c.month;
    }
    if (locked(c)) {
      html += `
        <article class="check locked">
          <div class="check-date">${longDate(c.date)}${c.extra ? ' · bonus paycheck' : ''}</div>
          <div>Included in the full version.</div>
          <button class="small" data-action="go" data-view="more">Unlock</button>
        </article>`;
      continue;
    }
    const isNow = current.status === 'during' && checks[current.index] === c;
    const bills = c.bills.filter(o => !(ui.hidePaid && state.paid[o.key]));
    const bonusPlan = c.extra && state.bonus[c.date] && state.bonus[c.date] !== 'spend' ? BONUS_CHOICES[state.bonus[c.date]] : '';
    html += `
      <article class="check ${c.left < 0 ? 'short' : ''} ${isNow ? 'current' : ''}">
        <div class="check-head">
          <span class="check-date">${longDate(c.date)}</span>
          <span class="badges">
            ${isNow ? '<span class="badge now">Now</span>' : ''}
            ${c.extra ? '<span class="badge" title="A month with one more payday than usual">Bonus paycheck</span>' : ''}
          </span>
        </div>
        ${bonusPlan ? `<div class="bonus-plan">Planned for: <b>${bonusPlan}</b></div>` : ''}
        <label class="pay-input">Pay
          <input type="number" inputmode="decimal" step="0.01" min="0" data-pay="${c.date}" value="${c.amount}" aria-label="Paycheck amount on ${longDate(c.date)}">
          ${state.payOverrides[c.date] != null ? `<button class="icon" data-action="reset-pay" data-date="${c.date}" title="Use your usual pay" aria-label="Use your usual pay">↺</button>` : ''}
        </label>
        <ul class="lines">
          ${bills.map(o => billLineHTML(o, checks, c.date, true)).join('') || '<li class="empty">No bills from this paycheck.</li>'}
          ${savingsLineHTML(c)}
          ${state.allotments.map(a => `<li class="line allot"><span></span><span class="name">${esc(a.name || 'Set-aside')}</span><span class="amt num">${money(Number(a.amount) || 0)}</span></li>`).join('')}
        </ul>
        <div class="check-foot"><span>Left to spend</span><span class="num ${c.left < 0 ? 'neg' : ''}">${money(c.left)}</span></div>
      </article>`;
  }
  $('#timeline').innerHTML = html || '<p class="empty">No paychecks yet. Check your pay on the Setup tab.</p>';
}

/** "Your year at a glance": one bar per paycheck for what's left to spend. Tap a bar to open that month. */
function renderChart(checks) {
  const el = $('#yearChart');
  if (checks.length < 2) { el.hidden = true; return; }
  el.hidden = false;
  const open = checks.filter(c => !locked(c));
  const maxAbs = Math.max(1, ...open.map(c => Math.abs(c.left)));
  const hasNeg = open.some(c => c.left < 0);
  const W = 100 / checks.length, H = 120, zero = hasNeg ? H * 0.72 : H - 2;
  const scale = (hasNeg ? H * 0.68 : H - 8) / maxAbs;
  const now = findPeriod(checks, today);
  const bars = checks.map((c, i) => {
    const x = i * W + W * 0.18, w = W * 0.64;
    const label = `${longDate(c.date)}: ${locked(c) ? 'in the full version' : `${money(c.left)} to spend`}`;
    if (locked(c)) return `<rect class="bar-locked" x="${x}" y="${zero - 10}" width="${w}" height="10" rx="2" data-action="month" data-month="${c.month}"><title>${label}</title></rect>`;
    const h = Math.max(2, Math.abs(c.left) * scale);
    const cls = c.left < 0 ? 'bar-neg' : now.status === 'during' && now.index === i ? 'bar-now' : 'bar-pos';
    return `<rect class="${cls}" x="${x}" y="${c.left < 0 ? zero : zero - h}" width="${w}" height="${h}" rx="2" data-action="month" data-month="${c.month}"><title>${label}</title></rect>`;
  }).join('');

  const cushion = runningCushion(checks, state.cushionStart);
  const lowIndex = cushion.indexOf(Math.min(...cushion));
  const tight = open.reduce((a, c) => (c.left < a.left ? c : a), open[0] || checks[0]);
  const cushionLine = cushion[lowIndex] < 0
    ? `If you carry what's left from each paycheck forward, your money would dip to <b class="neg">${money(cushion[lowIndex])}</b> around ${longDate(checks[lowIndex].date)}. Try smoothing your paychecks below.`
    : `If you carry what's left from each paycheck forward, you'd build up <b>${money(cushion.at(-1))}</b> by ${longDate(checks.at(-1).date)}.`;
  el.innerHTML = `
    <h2>Your year at a glance</h2>
    <p class="hint">Money to spend from each paycheck. Tap a bar to see that month.</p>
    <svg class="chart" viewBox="0 0 100 ${H}" preserveAspectRatio="none" role="img" aria-label="Money left to spend from each of your ${checks.length} paychecks">
      ${hasNeg ? `<line x1="0" x2="100" y1="${zero}" y2="${zero}" class="zero"/>` : ''}
      ${bars}
    </svg>
    <div class="chart-axis"><span>Jan</span><span>Apr</span><span>Jul</span><span>Oct</span><span>Dec</span></div>
    <p class="chart-note">Tightest paycheck: <b>${longDate(tight.date)}</b>, ${money(tight.left)} to spend. ${cushionLine}</p>`;
}

function renderSmooth(checks) {
  const el = $('#smoothCard');
  const from = findPeriod(checks, today);
  const fromDate = from.status === 'during' ? checks[from.index].date : '';
  const open = checks.filter(c => c.date >= fromDate && !locked(c));
  if (open.length < 2 || from.status === 'after') { el.hidden = true; return; }
  el.hidden = false;
  const tight = open.reduce((a, c) => (c.left < a.left ? c : a));
  const roomy = open.reduce((a, c) => (c.left > a.left ? c : a));
  const moved = Object.keys(state.overrides).length;
  const undo = moved ? `<button class="ghost small" data-action="smooth-undo">Undo bill moves (${moved})</button>` : '';

  if (!ui.smooth) {
    el.innerHTML = `
      <h2>Smooth my paychecks</h2>
      <p class="hint">Bills often bunch up on one paycheck. Paying a few a little early can even things out, and never past their due date.</p>
      <p>Tightest: <b>${longDate(tight.date)}</b>, ${money(tight.left)} to spend. Roomiest: <b>${longDate(roomy.date)}</b>, ${money(roomy.left)}.</p>
      <div class="button-row"><button data-action="smooth">Smooth my paychecks</button>${undo}</div>`;
    return;
  }
  const { moves, before, after } = ui.smooth;
  if (!moves.length) {
    el.innerHTML = `
      <h2>Smooth my paychecks</h2>
      <p>Your paychecks are already as even as they can be without paying bills more than a month early.</p>
      <div class="button-row"><button class="ghost" data-action="smooth-cancel">OK</button>${undo}</div>`;
    return;
  }
  const shown = moves.slice(0, 6);
  el.innerHTML = `
    <h2>Here's a smoother plan</h2>
    <p>Your tightest paycheck goes from <b>${money(before.min)}</b> to <b>${money(after.min)}</b> to spend.</p>
    <ul class="moves">
      ${shown.map(m => `<li>Pay <b>${esc(m.name)}</b> (${money(m.amount)}, due ${shortDate(m.due)}) from your <b>${shortDate(m.to)}</b> paycheck instead of ${shortDate(m.from)}</li>`).join('')}
      ${moves.length > shown.length ? `<li class="muted">and ${plural(moves.length - shown.length, 'more change')} like these</li>` : ''}
    </ul>
    <div class="button-row"><button data-action="smooth-apply">Use this plan</button><button class="ghost" data-action="smooth-cancel">Not now</button></div>`;
}

// ---------- Setup ----------
function renderSetup() {
  const p = state.pay;
  document.querySelectorAll('[data-pay-field]').forEach(el => {
    const v = p[el.dataset.payField];
    el.value = el.dataset.payField === 'amount' && !v ? '' : v;
  });
  document.querySelectorAll('[data-show]').forEach(el => {
    el.hidden = !el.dataset.show.split(' ').includes(p.frequency);
  });
  $('#currency').value = state.currency;
  $('#cushionStart').value = state.cushionStart || '';
  renderBills();
  renderAllotments();
}

function renderBills() {
  $('#billList').innerHTML = state.bills.map(b => `
    <div class="item" data-id="${b.id}" data-list="bills">
      <input data-field="name" value="${esc(b.name)}" placeholder="Bill name" aria-label="Bill name">
      <input data-field="amount" type="number" inputmode="decimal" step="0.01" min="0" value="${b.amount || ''}" placeholder="Amount" aria-label="${esc(b.name || 'Bill')} amount">
      <button class="icon" data-action="remove-item" aria-label="Remove ${esc(b.name || 'bill')}">×</button>
      <div class="meta">
        <select data-field="freq" aria-label="How often">
          <option value="monthly" ${b.freq === 'monthly' ? 'selected' : ''}>Every month</option>
          <option value="yearly" ${b.freq === 'yearly' ? 'selected' : ''}>Once a year</option>
          <option value="once" ${b.freq === 'once' ? 'selected' : ''}>One time</option>
        </select>
        ${b.freq === 'monthly'
          ? `<select data-field="day" aria-label="Due day of the month">${dayOptions(b.day).replace(/>the /g, '>Due the ').replace('>31st', '>Due the 31st')}</select>`
          : `<input data-field="date" type="date" min="${YEAR}-01-01" max="${YEAR}-12-31" value="${b.date}" aria-label="Due date">`}
      </div>
      ${b.freq !== 'monthly' ? `<label class="check-label"><input type="checkbox" data-field="saveUp" ${savesUp(b) ? 'checked' : ''}> Save a little from each paycheck</label>` : ''}
    </div>`).join('') || '<p class="empty">No bills yet. Add rent, phone, car payment and so on.</p>';
}

function renderAllotments() {
  $('#allotList').innerHTML = state.allotments.map(a => `
    <div class="item" data-id="${a.id}" data-list="allotments">
      <input data-field="name" value="${esc(a.name)}" placeholder="Name, e.g. Groceries" aria-label="Set-aside name">
      <input data-field="amount" type="number" inputmode="decimal" step="0.01" min="0" value="${a.amount || ''}" placeholder="Amount" aria-label="${esc(a.name || 'Set-aside')} amount">
      <button class="icon" data-action="remove-item" aria-label="Remove ${esc(a.name || 'set-aside')}">×</button>
      <div class="meta">
        <input data-field="goal" type="number" inputmode="decimal" min="0" step="0.01" value="${a.goal || ''}" placeholder="Goal (optional)" aria-label="${esc(a.name || 'Set-aside')} goal">
        <input data-field="saved" type="number" inputmode="decimal" min="0" step="0.01" value="${a.saved || ''}" placeholder="Saved so far" aria-label="${esc(a.name || 'Set-aside')} already saved">
      </div>
    </div>`).join('') || '<p class="empty">None yet.</p>';
}

// ---------- Guided setup ----------
const WIZ_STEPS = ['freq', 'when', 'bills', 'yearly', 'allot', 'done'];
const QUICK = {
  bills: ['Rent or mortgage', 'Car payment', 'Car insurance', 'Phone', 'Internet', 'Electricity', 'Water', 'Streaming', 'Gym', 'Student loan', 'Credit card', 'Childcare'],
  yearly: [['Car registration', ''], ['Home or renters insurance', ''], ['Holiday gifts', '2027-12-10'], ['Back to school', '2027-08-01'], ['Vacation', '2027-07-01'], ['Memberships', '']],
  allot: ['Groceries', 'Gas', 'Savings', 'Fun money', 'Eating out', 'Kids', 'Pets', 'Personal care'],
};
const FREQ_CHOICES = [
  ['weekly', 'Every week', 'For example, every Friday'],
  ['biweekly', 'Every 2 weeks', 'For example, every other Friday'],
  ['semimonthly', 'Twice a month', 'For example, the 15th and the last day'],
  ['monthly', 'Once a month', 'The same day each month'],
];

function openWizard(step = 0) {
  ui.wizStep = step;
  renderWizard();
  const d = $('#wizard');
  if (!d.open) d.showModal();
}

function closeWizard() {
  $('#wizard').close();
  renderAll();
  go('home');
}

function wizRows(kind) {
  if (kind === 'allot') {
    return state.allotments.map(a => `
      <div class="wiz-row" data-id="${a.id}" data-list="allotments">
        <input data-field="name" value="${esc(a.name)}" placeholder="Name" aria-label="Name">
        <input data-field="amount" type="number" inputmode="decimal" min="0" step="0.01" value="${a.amount || ''}" placeholder="Per paycheck" aria-label="${esc(a.name)} per paycheck">
        <button class="icon" data-action="wiz-remove" aria-label="Remove ${esc(a.name)}">×</button>
      </div>`).join('');
  }
  const monthly = kind === 'bills';
  return state.bills.filter(b => (b.freq === 'monthly') === monthly).map(b => `
    <div class="wiz-row" data-id="${b.id}" data-list="bills">
      <input data-field="name" value="${esc(b.name)}" placeholder="Bill name" aria-label="Bill name">
      <input data-field="amount" type="number" inputmode="decimal" min="0" step="0.01" value="${b.amount || ''}" placeholder="Amount" aria-label="${esc(b.name)} amount">
      <button class="icon" data-action="wiz-remove" aria-label="Remove ${esc(b.name)}">×</button>
      ${monthly
        ? `<label class="wiz-sub">Due on <select data-field="day" aria-label="${esc(b.name)} due day">${dayOptions(b.day)}</select></label>`
        : `<label class="wiz-sub">Due on <input data-field="date" type="date" min="${YEAR}-01-01" max="${YEAR}-12-31" value="${b.date}" aria-label="${esc(b.name)} due date"></label>`}
    </div>`).join('');
}

function wizChips(kind) {
  const names = new Set((kind === 'allot' ? state.allotments : state.bills).map(x => x.name));
  const items = kind === 'yearly' ? QUICK.yearly.map(([n]) => n) : QUICK[kind];
  return `<div class="quick">${items.map(n =>
    `<button class="chip ${names.has(n) ? 'added' : ''}" data-action="wiz-add" data-kind="${kind}" data-name="${esc(n)}" ${names.has(n) ? 'disabled' : ''}>${names.has(n) ? '✓' : '+'} ${esc(n)}</button>`).join('')}
    <button class="chip" data-action="wiz-add" data-kind="${kind}" data-name="">+ Something else</button></div>`;
}

function renderWizard() {
  const step = WIZ_STEPS[ui.wizStep];
  const p = state.pay;
  const questions = WIZ_STEPS.length - 1;
  $('#wizStep').textContent = step === 'done' ? 'All set' : `Question ${ui.wizStep + 1} of ${questions}`;
  $('#wizBar').style.width = `${(ui.wizStep / questions) * 100}%`;
  $('#wizBack').hidden = ui.wizStep === 0 || step === 'done';
  $('#wizNext').hidden = step === 'freq';
  $('#wizNext').textContent = step === 'done' ? 'Go to my budget' : 'Next';

  let body = '';
  if (step === 'freq') {
    body = `
      <h1 id="wizTitle">How often do you get paid?</h1>
      <div class="choices">${FREQ_CHOICES.map(([v, label, sub]) => `
        <button class="choice ${p.frequency === v ? 'active' : ''}" data-action="wiz-freq" data-value="${v}"><b>${label}</b><span>${sub}</span></button>`).join('')}
      </div>`;
  } else if (step === 'when') {
    const when = p.frequency === 'weekly' || p.frequency === 'biweekly'
      ? `<label>Your first payday in ${YEAR}
           <input type="date" data-wiz-pay="firstDate" min="2026-01-01" max="${YEAR}-12-31" value="${p.firstDate}"></label>
         <p class="hint">Not sure? Enter any recent payday, even one from ${YEAR - 1}, and we'll count forward.</p>`
      : p.frequency === 'semimonthly'
        ? `<div class="row"><label>First payday<select data-wiz-pay="semi1">${dayOptions(p.semi1)}</select></label>
             <label>Second payday<select data-wiz-pay="semi2">${dayOptions(p.semi2)}</select></label></div>`
        : `<label>Payday<select data-wiz-pay="monthlyDay">${dayOptions(p.monthlyDay)}</select></label>`;
    body = `
      <h1 id="wizTitle">When is payday, and how much do you get?</h1>
      ${when}
      <label>How much lands in your bank each payday?
        <input class="big-input" type="number" inputmode="decimal" min="0" step="0.01" data-wiz-pay="amount" value="${p.amount || ''}" placeholder="e.g. 2400"></label>
      <p class="hint">Use the amount after tax and deductions. If it changes, use a typical paycheck.</p>
      <label>Currency<select data-wiz-currency>${['USD', 'CAD', 'GBP', 'EUR', 'AUD', 'NZD'].map(c => `<option ${state.currency === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>`;
  } else if (step === 'bills') {
    body = `
      <h1 id="wizTitle">Which bills do you pay every month?</h1>
      <p class="hint">Tap to add, then fill in how much and the day it's due.</p>
      ${wizChips('bills')}<div class="wiz-rows">${wizRows('bills')}</div>`;
  } else if (step === 'yearly') {
    body = `
      <h1 id="wizTitle">Any bills that come once a year?</h1>
      <p class="hint">Like car registration or holiday gifts. We'll save a little from every paycheck so they're never a surprise. Skip this if you have none.</p>
      ${wizChips('yearly')}<div class="wiz-rows">${wizRows('yearly')}</div>`;
  } else if (step === 'allot') {
    body = `
      <h1 id="wizTitle">What do you set aside from every paycheck?</h1>
      <p class="hint">Money that goes out every payday even without a bill, like groceries, gas or savings.</p>
      ${wizChips('allot')}<div class="wiz-rows">${wizRows('allot')}</div>`;
  } else {
    setCurrency();
    const { checks } = buildPlan(state);
    const first = checks[0];
    const short = checks.filter(c => c.left < 0 && !locked(c)).length;
    body = `
      <div class="done-mark" aria-hidden="true">✓</div>
      <h1 id="wizTitle">You're all set</h1>
      ${first ? `<p class="lead">Your first ${YEAR} paycheck is <b>${longDate(first.date)}</b>. After bills and set-asides you'll have <b>${money(first.left)}</b> to spend from it.</p>` : ''}
      ${short ? `<p class="hint">${plural(short, 'paycheck')} come up short. Open the Plan tab and tap <b>Smooth my paychecks</b> to even them out.</p>` : ''}
      <p class="hint">You can change anything later on the Setup tab.</p>`;
  }
  $('#wizBody').innerHTML = `${body}<p class="wiz-error" role="alert"></p>`;
  $('#wizBody').scrollTop = 0;
}

function wizAdd(kind, name) {
  if (kind === 'allot') state.allotments.push({ id: newId(), name, amount: 0 });
  else if (kind === 'yearly') {
    const date = QUICK.yearly.find(([n]) => n === name)?.[1] || '';
    state.bills.push({ id: newId(), name, amount: 0, freq: 'yearly', day: 1, date });
  } else state.bills.push({ id: newId(), name, amount: 0, freq: 'monthly', day: 1, date: '' });
  save();
  renderWizard();
  const rows = document.querySelectorAll('#wizBody .wiz-row');
  rows[rows.length - 1]?.querySelector(name ? '[data-field=amount]' : '[data-field=name]').focus();
}

function wizNext() {
  const step = WIZ_STEPS[ui.wizStep];
  if (step === 'when' && !(Number(state.pay.amount) > 0)) {
    $('#wizBody .wiz-error').textContent = 'Enter how much you get paid to continue.';
    return;
  }
  if (step === 'done') { closeWizard(); return; }
  if (step === 'bills' || step === 'yearly' || step === 'allot') {
    // Drop rows left completely empty; ask about rows that are half filled in.
    const list = step === 'allot' ? 'allotments' : 'bills';
    const blank = x => !x.name.trim() && !(Number(x.amount) > 0);
    state[list] = state[list].filter(x => !blank(x));
    const rows = step === 'allot' ? state.allotments : state.bills.filter(b => (b.freq === 'monthly') === (step === 'bills'));
    const missing = rows.find(x => !(Number(x.amount) > 0)) || (step === 'yearly' && rows.find(b => !b.date));
    if (missing) {
      renderWizard();
      $('#wizBody .wiz-error').textContent = !(Number(missing.amount) > 0)
        ? `Add an amount for ${missing.name || 'each item'}, or tap × to remove it.`
        : `Pick the date ${missing.name || 'it'} is due.`;
      return;
    }
  }
  ui.wizStep += 1;
  save();
  renderWizard();
}

// ---------- Me ----------
/** Draws the colour and font choices. The name boxes are filled in renderAll so typing keeps focus. */
function renderMe() {
  const { palette, font, theme } = document.documentElement.dataset;
  $('#paletteList').innerHTML = PALETTES.map(([id, label, accent, deep]) => `
    <button class="swatch ${palette === id ? 'active' : ''}" role="radio" aria-checked="${palette === id}" data-action="palette" data-value="${id}">
      <span class="dots"><i style="background:${accent}"></i><i style="background:${deep}"></i></span>${label}
    </button>`).join('');
  $('#fontList').innerHTML = FONTS.map(([id, label, note, stack]) => `
    <button class="font-option ${font === id ? 'active' : ''}" role="radio" aria-checked="${font === id}" data-action="font" data-value="${id}">
      <span class="sample" style="font-family:${stack.replace(/"/g, "'")}">Aa $1,234</span>
      <span class="label"><b>${label}</b> · ${note}</span>
    </button>`).join('');
  document.querySelectorAll('[data-theme-choice]').forEach(b => {
    b.classList.toggle('active', b.dataset.themeChoice === theme);
    b.setAttribute('aria-pressed', b.dataset.themeChoice === theme);
  });
  const name = state.owner?.name?.trim();
  const ideas = name
    ? [`${name}'s Paycheck Plan`, `${name}'s Money ${YEAR}`, `${name}'s Budget`]
    : ['My Paycheck Plan', 'Our Family Budget', `Payday Planner ${YEAR}`];
  $('#nameIdeas').innerHTML = ideas.map(n => `<button class="chip" data-action="name-idea" data-value="${esc(n)}">${esc(n)}</button>`).join('');
}

function renderOwnerFields() {
  $('#ownerName').value = state.owner?.name || '';
  $('#appName').value = state.owner?.appName || '';
}

// ---------- More ----------
function renderMore() {
  $('#unlockCard').innerHTML = unlocked
    ? `<h2>Full version</h2><p>Unlocked. Every ${YEAR} paycheck is yours to plan. Thank you for your support!</p>`
    : `<h2>Free trial</h2>
       <p>You can plan every paycheck in January and February ${YEAR}. Paychecks from ${trialEndLabel} on need the full version.</p>
       <p><a class="button-like" href="${BUY_URL}" target="_blank" rel="noopener">Get the full version</a></p>
       <p class="hint">Bought it already? Enter the unlock code from your Start Here PDF.</p>
       ${unlockFormHTML()}`;
  const link = $('#supportLink');
  link.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('2027 Paycheck Budget')}`;
  link.textContent = SUPPORT_EMAIL;
  $('#versionLine').textContent = `Version ${VERSION} · AppNookStudio`;
}

// ---------- Frame ----------
function renderChrome() {
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${ui.view}`));
  document.querySelectorAll('.tabbar button').forEach(b => {
    const on = b.dataset.view === ui.view;
    b.classList.toggle('active', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  const appName = state.owner?.appName?.trim();
  $('#brandName').innerHTML = appName ? esc(appName) : 'Paycheck Budget <b>2027</b>';
  document.title = appName || `${YEAR} Paycheck Budget`;
  const name = state.owner?.name?.trim();
  $('#printTitle').textContent = appName || (name ? `${name}'s ${YEAR} paycheck plan` : `My ${YEAR} paycheck plan`);
  const pill = $('#trialPill');
  pill.textContent = unlocked ? 'Full version' : 'Free trial';
  pill.classList.toggle('full', unlocked);
  $('#sampleBanner').hidden = !state.sample;
}

/** Re-draws everything that depends on the numbers. Setup isn't re-drawn here so typing keeps focus. */
function refresh() {
  setCurrency();
  const plan = buildPlan(state);
  renderChrome();
  renderHome(plan);
  renderPlan(plan);
  renderMe();
  renderMore();
  save();
}

function renderAll() { setCurrency(); renderSetup(); renderOwnerFields(); refresh(); }

function go(view) {
  ui.view = view;
  history.replaceState(null, '', `${location.search}#${view}`);
  renderChrome();
  window.scrollTo(0, 0);
}

function printPlan() {
  const before = { view: ui.view, month: ui.month };
  ui.month = 'all';
  go('plan');
  refresh();
  window.addEventListener('afterprint', () => { ui.month = before.month; go(before.view); refresh(); }, { once: true });
  setTimeout(() => window.print(), 50);
}

// ---------- Events ----------
document.addEventListener('click', e => {
  const t = e.target.closest('[data-action]');
  if (!t) return;
  const action = t.dataset.action;
  if (action === 'go') go(t.dataset.view);
  else if (action === 'month') { ui.month = String(t.dataset.month); refresh(); if (e.target.closest('svg')) $('#monthTabs').scrollIntoView({ behavior: 'smooth' }); }
  else if (action === 'theme') {
    document.documentElement.dataset.theme = t.dataset.themeChoice;
    store.set(THEME_KEY, t.dataset.themeChoice);
    renderMe();
  }
  else if (action === 'palette' || action === 'font') {
    document.documentElement.dataset[action] = t.dataset.value;
    store.set(action === 'palette' ? PALETTE_KEY : FONT_KEY, t.dataset.value);
    refresh();
  }
  else if (action === 'name-idea') {
    state.owner = { ...state.owner, appName: t.dataset.value };
    renderOwnerFields();
    refresh();
  }
  else if (action === 'reset-pay') { delete state.payOverrides[t.dataset.date]; refresh(); }
  else if (action === 'remove-spend') { state.spending = state.spending.filter(s => s.id !== t.dataset.id); refresh(); }
  else if (action === 'add-bill' || action === 'add-allot') {
    const list = action === 'add-bill' ? 'bills' : 'allotments';
    state[list].push(list === 'bills'
      ? { id: newId(), name: '', amount: 0, freq: 'monthly', day: 1, date: '' }
      : { id: newId(), name: '', amount: 0 });
    renderSetup();
    refresh();
    document.querySelector(`#${list === 'bills' ? 'billList' : 'allotList'} .item:last-child input`).focus();
  } else if (action === 'remove-item') {
    const row = t.closest('[data-id]');
    state[row.dataset.list] = state[row.dataset.list].filter(x => x.id !== row.dataset.id);
    renderSetup();
    refresh();
  } else if (action === 'smooth') {
    const { checks } = buildPlan(state);
    const p = findPeriod(checks, today);
    ui.smooth = suggestSmoothing(state, { from: p.status === 'during' ? checks[p.index].date : '', lockedFrom: unlocked ? null : TRIAL_END });
    refresh();
  } else if (action === 'smooth-apply') {
    for (const m of ui.smooth.moves) state.overrides[m.key] = m.to;
    toast(`Done. ${plural(ui.smooth.moves.length, 'bill')} moved to an earlier paycheck.`);
    ui.smooth = null;
    refresh();
  } else if (action === 'smooth-cancel') { ui.smooth = null; refresh(); }
  else if (action === 'smooth-undo') {
    if (!confirm('Put every bill back on its usual paycheck?')) return;
    state.overrides = {};
    ui.smooth = null;
    refresh();
  } else if (action === 'afford-log') {
    state.spending.push({ id: newId(), date: today, amount: ui.affordPrice, note: 'Purchase' });
    toast(`Logged ${money(ui.affordPrice)}`);
    ui.affordPrice = null;
    refresh();
  } else if (action === 'wizard') openWizard();
  else if (action === 'wiz-close') closeWizard();
  else if (action === 'wiz-next') wizNext();
  else if (action === 'wiz-back') { ui.wizStep = Math.max(0, ui.wizStep - 1); renderWizard(); }
  else if (action === 'wiz-freq') { state.pay.frequency = t.dataset.value; state.sample = false; ui.wizStep = 1; save(); renderWizard(); }
  else if (action === 'wiz-add') wizAdd(t.dataset.kind, t.dataset.name);
  else if (action === 'wiz-remove') {
    const row = t.closest('[data-id]');
    state[row.dataset.list] = state[row.dataset.list].filter(x => x.id !== row.dataset.id);
    save();
    renderWizard();
  } else if (action === 'clear-sample') {
    state = { ...blankState(), pay: { ...blankState().pay }, currency: state.currency, owner: state.owner };
    save();
    openWizard();
  } else if (action === 'load-sample') {
    if (!state.sample && !confirm('Show the sample household? This replaces your current budget. Save a backup first if you want to keep it.')) return;
    state = sampleState();
    renderAll();
    go('home');
  } else if (action === 'reset-all') {
    if (!confirm('Erase your whole budget from this device? This can\'t be undone unless you saved a backup.')) return;
    state = blankState();
    renderAll();
    go('home');
    toast('Everything erased.');
  } else if (action === 'backup') {
    download(`paycheck-budget-${YEAR}-backup-${today}.json`, JSON.stringify({ app: 'paycheck-budget-2027', version: VERSION, ...state }, null, 2), 'application/json');
  } else if (action === 'export-csv') exportCsv();
  else if (action === 'print') printPlan();
});

document.addEventListener('submit', async e => {
  const form = e.target;
  e.preventDefault();
  if (form.dataset.form === 'spend') {
    const amount = Number(form.amount.value);
    if (!(amount > 0)) return;
    state.spending.push({ id: newId(), date: today, amount, note: form.note.value.trim() });
    refresh();
    toast(`Logged ${money(amount)}`);
  } else if (form.dataset.form === 'afford') {
    ui.affordPrice = Number(form.price.value) || null;
    refresh();
  } else if (form.dataset.form === 'unlock') {
    const msg = form.nextElementSibling;
    if (await isValidCode(form.code.value)) {
      unlocked = true;
      store.set(UNLOCK_KEY, '1');
      ui.smooth = null;
      refresh();
      toast('Unlocked. Thank you!');
    } else {
      msg.textContent = 'That code didn\'t work. Check it against your Start Here PDF and try again.';
      msg.className = 'unlock-msg neg';
    }
  }
});

/** Copies a list-row input (bill or set-aside) into state. Returns the field name. */
function updateRow(t) {
  const row = t.closest('[data-id]');
  const item = state[row.dataset.list].find(x => x.id === row.dataset.id);
  const field = t.dataset.field;
  item[field] = t.type === 'checkbox' ? t.checked : t.type === 'number' || field === 'day' ? Number(t.value) : t.value;
  if (field === 'freq' && t.value !== 'monthly' && !item.date) item.date = `${YEAR}-01-${String(item.day || 1).padStart(2, '0')}`;
  return field;
}

// Setup: pay fields and list rows save as you type.
$('#view-setup').addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.payField) {
    state.pay[t.dataset.payField] = t.type === 'number' ? Number(t.value) : t.value;
    if (t.dataset.payField === 'frequency') renderSetup();
  } else if (t.id === 'currency') state.currency = t.value;
  else if (t.id === 'cushionStart') state.cushionStart = Number(t.value) || 0;
  else if (t.dataset.field) { if (updateRow(t) === 'freq') renderBills(); }
  else return;
  state.sample = false;
  ui.smooth = null;
  refresh();
});

// Me: name and app name save as they're typed.
$('#view-me').addEventListener('input', e => {
  if (e.target.id !== 'ownerName' && e.target.id !== 'appName') return;
  state.owner = { ...state.owner, [e.target.id === 'ownerName' ? 'name' : 'appName']: e.target.value };
  refresh();
});

// Guided setup: answers save as they're typed.
$('#wizard').addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.wizPay) state.pay[t.dataset.wizPay] = t.type === 'date' ? t.value : Number(t.value);
  else if (t.hasAttribute('data-wiz-currency')) state.currency = t.value;
  else if (t.dataset.field) updateRow(t);
  else return;
  state.sample = false;
  save();
});
$('#wizard').addEventListener('cancel', e => { e.preventDefault(); closeWizard(); });

// Home and Plan: ticking bills paid, moving bills, changing one paycheck, bonus plans.
document.addEventListener('change', e => {
  const t = e.target;
  if (t.closest('#wizard') || t.closest('#view-setup')) return;
  if (t.dataset.paid) {
    if (t.checked) state.paid[t.dataset.paid] = true; else delete state.paid[t.dataset.paid];
  } else if (t.dataset.move) {
    state.overrides[t.dataset.move] = t.value;
  } else if (t.dataset.pay) {
    state.payOverrides[t.dataset.pay] = Number(t.value) || 0;
  } else if (t.dataset.bonus) {
    state.bonus[t.dataset.bonus] = t.value;
    if (t.value && t.value !== 'spend') toast(`Bonus paycheck planned: ${BONUS_CHOICES[t.value].toLowerCase()}`);
  } else if (t.id === 'hidePaid') {
    ui.hidePaid = t.checked;
  } else if (t.id === 'restoreFile') {
    restore(t);
    return;
  } else return;
  ui.smooth = null;
  refresh();
});

async function restore(input) {
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data.pay || !Array.isArray(data.bills)) throw new Error('This isn\'t a 2027 Paycheck Budget backup.');
    if (!confirm('Replace your current budget with this backup?')) return;
    const { app, version, ...saved } = data;
    state = { ...blankState(), ...saved };
    renderAll();
    toast('Backup restored.');
  } catch (err) {
    alert(`That file couldn't be restored. ${err.message}`);
  }
}

function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function exportCsv() {
  const q = s => `"${String(s).replace(/"/g, '""')}"`;
  const rows = [['Paycheck date', 'Paycheck amount', 'Item', 'Type', 'Due date', 'Amount', 'Paid']];
  const { checks } = buildPlan(state);
  for (const c of checks) {
    if (locked(c)) continue;
    for (const o of c.bills) rows.push([c.date, c.amount, o.bill.name, o.fromSavings ? 'Bill (paid from savings)' : 'Bill', o.due, o.amount, state.paid[o.key] ? 'Yes' : 'No']);
    for (const s of c.savings) rows.push([c.date, c.amount, `Saving for ${s.name}`, 'Saving', s.due, s.amount, '']);
    for (const a of state.allotments) rows.push([c.date, c.amount, a.name, 'Set-aside', '', Number(a.amount) || 0, '']);
    for (const s of periodSpending(state.spending, c)) rows.push([c.date, c.amount, s.note || 'Spending', 'Spending', s.date, s.amount, '']);
    rows.push([c.date, c.amount, 'Left to spend (planned)', 'Total', '', c.left, '']);
  }
  download(`paycheck-budget-${YEAR}.csv`, rows.map(r => r.map(q).join(',')).join('\r\n'), 'text/csv');
  if (!unlocked) toast('Trial export includes January and February.');
}

window.addEventListener('hashchange', () => {
  const v = location.hash.slice(1);
  if (VIEWS.includes(v) && v !== ui.view) go(v);
});

renderAll();
unlockFromLink();

// One-tap unlock from the Start Here PDF: a link ending in #unlock=PB-XXXX-XXXX-XXXX.
// The code sits after the #, so it stays in the browser and never reaches the web server.
async function unlockFromLink() {
  const match = location.hash.match(/^#unlock=([A-Za-z0-9-]+)$/);
  if (!match) return;
  history.replaceState(null, '', `${location.pathname}${location.search}#home`);
  if (unlocked) { toast('Already unlocked. Enjoy!'); return; }
  if (await isValidCode(match[1])) {
    unlocked = true;
    store.set(UNLOCK_KEY, '1');
    refresh();
    toast('Unlocked. Thank you!');
  } else {
    toast('That unlock link didn\'t work. Type the code from your PDF in the More tab.');
  }
}

// Works offline once loaded: the service worker keeps a copy of the app files.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline mode unavailable; the app still works online */ });
}
