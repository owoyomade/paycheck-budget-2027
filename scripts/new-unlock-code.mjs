// Makes a new unlock code for buyers. Run with `npm run unlock-code`.
// Put the code in the buyer's Start Here PDF, and add the hash to CODE_HASHES in site/licence.js.
// Never commit the code itself: anyone who reads it could unlock the app for free.
import { randomInt } from 'node:crypto';
import { hashCode } from '../site/licence.js';

// No 0/O, 1/I/L or 5/S, so the code is easy to read from a PDF and type in.
const ALPHABET = 'ABCDEFGHJKMNPQRTUVWXYZ2346789';
const group = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
const code = `PB-${group()}-${group()}-${group()}`;

console.log(`Unlock code: ${code}`);
console.log(`Hash:        ${await hashCode(code)}`);
