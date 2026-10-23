#!/usr/bin/env node
// Creates .env from env.example and fills what can be generated. Never overwrites a value that is
// already set. `--mock` also fills the provider settings with the built-in stand-ins.
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const example = readFileSync(`${root}env.example`, 'utf8');
// ENV_FILE lets a test write elsewhere; normally this is the .env next to env.example
const target = process.env.ENV_FILE ?? `${root}.env`;
const mock = process.argv.includes('--mock');
const existed = existsSync(target);

const read = (text) =>
  Object.fromEntries(
    text
      .split('\n')
      .filter((l) => /^[A-Z0-9_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  );
const current = existsSync(target) ? read(readFileSync(target, 'utf8')) : {};
const secret = (bytes = 24) => randomBytes(bytes).toString('base64url');
const oneLine = (pem) => pem.trim().replace(/\n/g, '\\n');

let keys;
const generated = {
  POSTGRES_PASSWORD: () => secret(18),
  INTERNAL_TOKEN: () => secret(32),
  BOOTSTRAP_TOKEN: () => secret(24),
  JWT_PRIVATE_KEY: () => {
    keys ??= generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    return oneLine(keys.privateKey);
  },
  JWT_PUBLIC_KEY: () => {
    // a public key must match the private one: derive from the same pair, or keep both
    keys ??= generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    return oneLine(keys.publicKey);
  },
};
const stand_ins = {
  STRIPE_SECRET_KEY: 'sk_test_mock',
  STRIPE_PUBLISHABLE_KEY: 'pk_test_mock',
  STRIPE_WEBHOOK_SECRET: 'whsec_mock',
  STRIPE_API_BASE: 'http://mock-providers:12111',
  PANDADOC_API_KEY: 'pandadoc_mock_key',
  PANDADOC_WEBHOOK_KEY: 'pandadoc_mock_shared',
  PANDADOC_TEMPLATE_SALE_AGREEMENT: 'tpl-sale-agreement',
  PANDADOC_TEMPLATE_PAYMENT_PLAN: 'tpl-payment-plan-addendum',
  PANDADOC_API_BASE: 'http://mock-providers:12112',
  PANDADOC_SESSION_BASE: 'http://localhost:12112/s',
  S3_ENDPOINT: 'http://mock-providers:12113',
  S3_ACCESS_KEY_ID: 'mock-access-key',
  S3_SECRET_ACCESS_KEY: 'mock-secret-key',
  STORAGE_PUBLIC_BASE_URL: 'http://localhost:12113/estateops',
};

// the key pair is one unit: if only one half exists, regenerate both
const pairOk = current.JWT_PRIVATE_KEY && current.JWT_PUBLIC_KEY;
const out = example
  .split('\n')
  .map((line) => {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (!m) return line;
    const [, name, fallback] = m;
    let value = current[name] ?? '';
    if (name.startsWith('JWT_') && !pairOk) value = '';
    if (!value && generated[name]) value = generated[name]();
    if (!value && mock && stand_ins[name]) value = stand_ins[name];
    if (!value) value = fallback;
    return `${name}=${value}`;
  })
  .join('\n');
writeFileSync(target, out, { mode: 0o600 });
const missing = Object.entries(read(out)).filter(
  ([k, v]) => !v && /STRIPE_(SECRET|PUBLISHABLE|WEBHOOK)|PANDADOC_(API|WEBHOOK|TEMPLATE)|S3_ACCESS|S3_SECRET/.test(k),
);
console.log(`.env ${existed ? 'updated (values you set were kept)' : 'created'}.`);
if (missing.length) {
  console.log(`\nStill to fill in by you (real accounts), or run \`make init-mock\` to use the stand-ins:\n  ${missing.map(([k]) => k).join('\n  ')}`);
}
