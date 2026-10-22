import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;

export function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text) {
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of text.replace(/=+$/, '').toUpperCase()) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) throw new Error('Invalid base32 secret');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** RFC 6238 one-time code (HMAC-SHA1, 30 s step, 6 digits) for a base32 secret at `ms`. */
export function totpCode(secret, ms) {
  const counter = Math.floor(ms / 1000 / STEP_SECONDS);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', base32Decode(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 0xf;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];
  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

/** Authenticator codes: one step of clock drift either way is accepted. */
export function createTotp({ window = 1 } = {}) {
  return {
    generateSecret: () => base32Encode(randomBytes(20)),
    code: (secret, now = new Date()) => totpCode(secret, now.getTime()),
    verify(secret, code, now = new Date()) {
      if (!/^\d{6}$/.test(code)) return false;
      let matched = false;
      for (let drift = -window; drift <= window; drift += 1) {
        const expected = Buffer.from(totpCode(secret, now.getTime() + drift * STEP_SECONDS * 1000));
        if (timingSafeEqual(expected, Buffer.from(code))) matched = true;
      }
      return matched;
    },
  };
}
