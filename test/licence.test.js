import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseCode, hashCode, isValidCode, isLocked, CODE_HASHES, TRIAL_END, BUY_URL, SUPPORT_EMAIL } from '../site/licence.js';

// A made-up code, so the real buyer code never appears in the repo.
const TEST_CODE = 'PB-TEST-2346-ABCD';

describe('unlock codes', () => {
  it('ignores case, spaces and dashes', () => {
    assert.equal(normaliseCode(' pb-test 2346-abcd '), 'PBTEST2346ABCD');
    assert.equal(normaliseCode(null), '');
  });

  it('accepts a code whose hash is listed, however it\'s typed', async () => {
    const hashes = [await hashCode(TEST_CODE)];
    assert.equal(await isValidCode(TEST_CODE, hashes), true);
    assert.equal(await isValidCode('pb test 2346 abcd', hashes), true);
    assert.equal(await isValidCode('PB-TEST-2346-ABCE', hashes), false);
    assert.equal(await isValidCode('', hashes), false);
  });

  it('ships with real SHA-256 hashes, not codes', () => {
    assert.ok(CODE_HASHES.length > 0);
    CODE_HASHES.forEach(h => assert.match(h, /^[0-9a-f]{64}$/));
  });
});

describe('free trial', () => {
  it('covers January and February 2027 only', () => {
    assert.equal(TRIAL_END, '2027-03-01');
    assert.equal(isLocked('2027-02-26', false), false);
    assert.equal(isLocked('2027-03-01', false), true);
    assert.equal(isLocked('2027-12-24', false), true);
  });

  it('unlocks every paycheck once a code is entered', () => {
    assert.equal(isLocked('2027-12-24', true), false);
  });

  it('points buyers to the Etsy shop and the support inbox', () => {
    assert.match(BUY_URL, /^https:\/\/www\.etsy\.com\//);
    assert.equal(SUPPORT_EMAIL, 'appnookstudio@gmail.com');
  });
});
