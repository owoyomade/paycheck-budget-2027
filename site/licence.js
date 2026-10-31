// Free trial and unlock codes. Pure logic with no DOM, so test/licence.test.js checks it directly.
//
// The free trial plans January and February 2027 in full. Paychecks from March on stay locked until
// the buyer enters the unlock code from their Start Here PDF. Only SHA-256 hashes of valid codes live
// here, so reading the source doesn't reveal a working code.
// Run `npm run unlock-code` to make a new code; it prints the code and the hash to add below.
import { YEAR } from './budget.js';

export const FREE_MONTHS = 2;
/** The first locked day. Paychecks on or after this date need the unlock code. */
export const TRIAL_END = `${YEAR}-${String(FREE_MONTHS + 1).padStart(2, '0')}-01`;

/** Where the Buy button goes. Etsy buyers get their code in the download, so this is the Etsy shop. */
export const BUY_URL = 'https://www.etsy.com/shop/AppNookStudio';

export const SUPPORT_EMAIL = 'appnookstudio@gmail.com';

// Keep old hashes when adding a new one, so people who bought earlier stay unlocked.
export const CODE_HASHES = [
  'b82f7a4b535bcffecba8b00a8f948b991590565999b23baecb3e944dcbde818f',
];

/** Uppercases and strips spaces and dashes, so "pb-ab12 cd34" and "PBAB12CD34" match. */
export const normaliseCode = code => String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** SHA-256 of the normalised code, as lowercase hex. */
export async function hashCode(code) {
  const bytes = new TextEncoder().encode(normaliseCode(code));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function isValidCode(code, hashes = CODE_HASHES) {
  if (!normaliseCode(code)) return false;
  return hashes.includes(await hashCode(code));
}

/** Whether a paycheck on `date` is outside the free trial. */
export const isLocked = (date, unlocked) => !unlocked && date >= TRIAL_END;
